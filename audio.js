// Sound: a few synthesized instruments and the metronome clock, all on the Web Audio API (no sample files).
// Browsers only allow sound after a tap, so the audio context is created on first use.

import { midiToFreq } from './theory.js';

let ctx = null;
let master = null;
const waves = {};

export const INSTRUMENTS = [
  { id: 'piano', label: 'Piano' },
  { id: 'epiano', label: 'Electric piano' },
  { id: 'organ', label: 'Organ' },
  { id: 'strings', label: 'Strings' },
  { id: 'synth', label: 'Soft synth' },
];
let instrument = 'piano';
export function setInstrument(id) { if (INSTRUMENTS.some((i) => i.id === id)) instrument = id; }
export const getInstrument = () => instrument;

// Sounds that hold steady while a key is down, then fade: level, attack and release in seconds.
const HELD = {
  organ: { level: 0.5, attack: 0.012, release: 0.06 },
  strings: { level: 0.3, attack: 0.18, release: 0.4 },
  synth: { level: 0.55, attack: 0.015, release: 0.18 },
};

export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    // Each wave is a list of harmonic strengths. A soft top end reads as "keys" without any sample files.
    const wave = (h) => ctx.createPeriodicWave(new Float32Array(h.length), new Float32Array(h));
    waves.piano = wave([0, 1, 0.45, 0.28, 0.14, 0.07, 0.03]);
    waves.epiano = wave([0, 1, 0.12, 0.04]);
    waves.organ = wave([0, 1, 0.75, 0, 0.5, 0, 0.3, 0, 0.25]);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const now = () => audio().currentTime;

/**
 * Play one note with the current instrument. `when` is in audio-clock seconds and `dur` is how long it is held.
 * With `hold: true` the note keeps sounding until the returned stop function is called (for a key held down).
 */
export function playNote(midi, { when = null, dur = 1.2, vel = 0.5, release = 0.08, hold = false } = {}) {
  const c = audio();
  const t = when === null ? c.currentTime + 0.01 : when;
  const f = midiToFreq(midi);
  const inst = instrument;
  const g = c.createGain();
  g.connect(master);
  const oscs = [];
  const osc = (freq, type) => {
    const o = c.createOscillator();
    if (waves[type]) o.setPeriodicWave(waves[type]); else o.type = type;
    o.frequency.value = freq;
    oscs.push(o);
    return o;
  };
  let end;
  const held = HELD[inst];
  if (!held) {
    // Piano and electric piano fade on their own. Higher notes ring shorter, like a real piano.
    const ring = Math.max(0.35, (hold ? 8 : dur) * (1.15 - (midi - 36) / 90)) * (inst === 'epiano' ? 1.3 : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + (inst === 'epiano' ? 0.003 : 0.006));
    g.gain.exponentialRampToValueAtTime(vel * (inst === 'epiano' ? 0.45 : 0.35), t + Math.min(0.35, ring * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    osc(f, inst).connect(g);
    if (inst === 'epiano') {
      // A short bell-like tine at the start of each note.
      const tg = c.createGain();
      tg.gain.setValueAtTime(vel * 0.25, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      tg.connect(master);
      osc(f * 4, 'sine').connect(tg);
    }
    end = t + ring;
  } else {
    const level = vel * held.level;
    const off = hold ? t + 60 : t + Math.max(dur, held.attack + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + held.attack);
    g.gain.setValueAtTime(level, off);
    g.gain.exponentialRampToValueAtTime(0.0001, off + held.release);
    if (inst === 'strings') {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(5000, f * 5);
      lp.Q.value = 0.5;
      lp.connect(g);
      osc(f, 'sawtooth').connect(lp);
      const o2 = osc(f, 'sawtooth');
      o2.detune.value = 8; // two slightly detuned voices sound like a section
      o2.connect(lp);
    } else {
      osc(f, inst === 'organ' ? 'organ' : 'triangle').connect(g);
    }
    end = off + held.release;
  }
  oscs.forEach((o) => { o.start(t); o.stop(end + 0.05); });
  const rel = held ? held.release : release;
  return () => {
    try {
      const n = c.currentTime;
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + rel);
      oscs.forEach((o) => o.stop(n + rel + 0.02));
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
    this.onBar = null; // (barIndex, time) when the first beat of a bar is scheduled
    this.clickOn = true;
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
      if (this.clickOn) this._click(this._next, subIndex === 0 ? (beatIndex === 0 && this.accent ? 'accent' : 'beat') : 'sub');
      if (subIndex === 0 && beatIndex === 0 && this.onBar) this.onBar(Math.floor(this._tick / (this.sub * this.beats)), this._next);
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
