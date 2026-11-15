// Sound: a small piano-like synth and the metronome clock, both on the Web Audio API.
// Browsers only allow sound after a tap, so the audio context is created on first use.

import { midiToFreq } from './theory.js';

let ctx = null;
let master = null;
let wave = null;

export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    // A few harmonics with a soft top end reads as "keys" without any sample files.
    const imag = new Float32Array([0, 1, 0.45, 0.28, 0.14, 0.07, 0.03]);
    wave = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const now = () => audio().currentTime;

/** Play one note. `when` is in audio-clock seconds. Returns a function that stops it early. */
export function playNote(midi, { when = null, dur = 1.2, vel = 0.5 } = {}) {
  const c = audio();
  const t = when === null ? c.currentTime + 0.01 : when;
  const osc = c.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = midiToFreq(midi);
  const g = c.createGain();
  // Higher notes ring shorter, like a real piano.
  const ring = Math.max(0.35, dur * (1.15 - (midi - 36) / 90));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
  g.gain.exponentialRampToValueAtTime(vel * 0.35, t + Math.min(0.35, ring * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + ring + 0.05);
  return () => {
    try {
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
      osc.stop(c.currentTime + 0.1);
    } catch { /* already stopped */ }
  };
}

/** Play several notes at the same moment. */
export function playChord(midis, opts = {}) {
  const per = (opts.vel ?? 0.5) / Math.sqrt(Math.max(1, midis.length) / 1.5);
  return midis.map((m) => playNote(m, { ...opts, vel: per }));
}

/**
 * Play a list of steps in order. Each step is { notes: [midi], beats }. Returns { stop, durationMs }.
 */
export function playSequence(steps, { beatSec = 0.6, vel = 0.5, lead = 0.05 } = {}) {
  const c = audio();
  let t = c.currentTime + lead;
  const stops = [];
  for (const s of steps) {
    const dur = s.beats * beatSec;
    stops.push(...playChord(s.notes, { when: t, dur: dur * 1.05, vel }));
    t += dur;
  }
  return { stop: () => stops.forEach((f) => f()), durationMs: (t - c.currentTime) * 1000 };
}

// ---- Metronome ----

/**
 * A click scheduler that stays steady even when the page is busy: it looks ahead a short time and
 * hands each click to the audio clock. onBeat(beatIndex, time) fires when a click is scheduled.
 */
export class Metronome {
  constructor() {
    this.bpm = 100;
    this.beats = 4;
    this.sub = 1; // clicks per beat
    this.accent = true;
    this.running = false;
    this.onBeat = null;
    this._timer = null;
  }

  start() {
    if (this.running) return;
    const c = audio();
    this.running = true;
    this._tick = 0;
    this._next = c.currentTime + 0.08;
    this._timer = setInterval(() => this._schedule(), 25);
    this._schedule();
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
    this._timer = null;
  }

  _schedule() {
    const c = audio();
    while (this._next < c.currentTime + 0.12) {
      const beatIndex = Math.floor(this._tick / this.sub) % this.beats;
      const subIndex = this._tick % this.sub;
      this._click(this._next, subIndex === 0 ? (beatIndex === 0 && this.accent ? 'accent' : 'beat') : 'sub');
      if (subIndex === 0 && this.onBeat) this.onBeat(beatIndex, this._next);
      this._next += 60 / this.bpm / this.sub;
      this._tick++;
    }
  }

  _click(t, kind) {
    const c = audio();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'square';
    osc.frequency.value = kind === 'accent' ? 1760 : kind === 'beat' ? 1175 : 880;
    const level = kind === 'accent' ? 0.5 : kind === 'beat' ? 0.38 : 0.16;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.06);
  }
}
