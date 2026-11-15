// Metronome with tap tempo, beats per bar and subdivisions.

import { Metronome, audio, playNote } from '../audio.js';
import { PROGRESSIONS, MAJOR_TONICS, numeralPcs, numeralChordName, voiceChord, notePc, pretty } from '../theory.js';
import * as store from '../store.js';
import { h, clear, card, hint, button, segmented, chips } from '../ui.js';

const TEMPO_NAMES = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [999, 'Prestissimo']];
const tempoName = (bpm) => TEMPO_NAMES.find(([max]) => bpm < max)[1];
const DEFAULTS = { bpm: 100, beats: 4, sub: 1, accent: true, backing: { on: false, click: true, key: 'C', prog: 'I-V-vi-IV', bars: 1 } };

export function mount(root) {
  const saved = store.get('metronome', {});
  const s = { ...DEFAULTS, ...saved, backing: { ...DEFAULTS.backing, ...(saved.backing || {}) } };
  const bk = s.backing;
  const save = () => store.set('metronome', s);
  const m = new Metronome();
  Object.assign(m, { bpm: s.bpm, beats: s.beats, sub: s.sub, accent: s.accent, clickOn: bk.click });
  let wake = null;
  const timers = new Set();

  const bpmOut = h('div', { class: 'bpm md-typescale-display-large', 'aria-live': 'off' });
  const nameOut = h('div', { class: 'tempo-name md-typescale-title-medium' });
  const slider = h('input', { type: 'range', min: 30, max: 240, step: 1, 'aria-label': 'Tempo in beats per minute' });
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const startBtn = button('Start', toggle, 'filled', { class: 'big-start' });

  function setBpm(v) {
    s.bpm = Math.max(30, Math.min(240, Math.round(v)));
    m.bpm = s.bpm;
    bpmOut.textContent = s.bpm;
    nameOut.textContent = tempoName(s.bpm);
    slider.value = s.bpm;
    save();
  }

  function drawDots() {
    dots.replaceChildren(...Array.from({ length: s.beats }, (_, i) => h('span', { class: 'dot' + (i === 0 ? ' first' : '') })));
  }

  m.onBeat = (i, time) => {
    const delay = Math.max(0, (time - audio().currentTime) * 1000);
    const t = setTimeout(() => {
      timers.delete(t);
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    }, delay);
    timers.add(t);
  };

  async function toggle() {
    if (m.running) {
      m.stop();
      startBtn.textContent = 'Start';
      [...dots.children].forEach((d) => d.classList.remove('on'));
      timers.forEach(clearTimeout);
      timers.clear();
      showChord(-1);
      releaseWake();
    } else {
      m.start();
      startBtn.textContent = 'Stop';
      try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch { /* not allowed, fine */ }
    }
  }
  function releaseWake() { if (wake) { wake.release().catch(() => {}); wake = null; } }

  // Tap tempo: average of the last few taps, reset after a pause.
  let taps = [];
  const tap = () => {
    const t = performance.now();
    if (taps.length && t - taps[taps.length - 1] > 2000) taps = [];
    taps.push(t);
    taps = taps.slice(-6);
    if (taps.length >= 2) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
  };

  slider.addEventListener('input', () => setBpm(Number(slider.value)));

  // ---- Backing chords: a progression that loops with the metronome, one chord every bar or two ----
  let voicings = [];
  const nowEl = h('div', { class: 'chord-now md-typescale-display-small' });
  const nextEl = h('div', { class: 'chord-next md-typescale-body-medium' });
  const pills = h('div', { class: 'chord-pills' });

  function buildBacking() {
    const prog = PROGRESSIONS.find((p) => p.id === bk.prog) || PROGRESSIONS[0];
    const tonicPc = notePc(bk.key);
    let prev = null;
    voicings = prog.numerals.map((n) => {
      const v = voiceChord(numeralPcs(n, tonicPc), prev);
      prev = v.upper;
      return { numeral: n, name: numeralChordName(n, bk.key), bass: v.bass, upper: v.upper };
    });
    clear(pills);
    voicings.forEach((v) => pills.append(h('div', { class: 'cpill' }, h('div', { class: 'md-typescale-title-medium' }, pretty(v.name)), h('div', { class: 'md-typescale-body-small' }, pretty(v.numeral)))));
    showChord(-1);
  }

  function showChord(idx) {
    [...pills.children].forEach((el, i) => el.classList.toggle('on', i === idx));
    if (idx < 0 || !voicings.length) {
      nowEl.textContent = voicings.length ? pretty(voicings[0].name) : '';
      nextEl.textContent = bk.on ? 'Press Start to hear the loop.' : 'Turn on "Play chords" to loop this progression.';
      return;
    }
    nowEl.textContent = pretty(voicings[idx].name);
    nextEl.textContent = 'Next: ' + pretty(voicings[(idx + 1) % voicings.length].name);
  }

  m.onBar = (bar, time) => {
    if (!bk.on || !voicings.length || bar % bk.bars !== 0) return;
    const idx = Math.floor(bar / bk.bars) % voicings.length;
    const v = voicings[idx];
    const dur = (bk.bars * s.beats * 60 / s.bpm) * 1.1; // a little long, because high notes die away sooner
    playNote(v.bass, { when: time, dur, vel: 0.42 });
    v.upper.forEach((n) => playNote(n, { when: time, dur, vel: 0.26 }));
    const t = setTimeout(() => { timers.delete(t); showChord(idx); }, Math.max(0, (time - audio().currentTime) * 1000));
    timers.add(t);
  };

  const keySelect = h('md-outlined-select', { label: 'Key' });
  MAJOR_TONICS.forEach((k) => keySelect.append(h('md-select-option', { value: k, selected: k === bk.key }, h('div', { slot: 'headline' }, pretty(k) + ' major'))));
  keySelect.addEventListener('change', () => { bk.key = keySelect.value; save(); buildBacking(); });
  const progSelect = h('md-outlined-select', { label: 'Progression' });
  PROGRESSIONS.forEach((p) => progSelect.append(h('md-select-option', { value: p.id, selected: p.id === bk.prog }, h('div', { slot: 'headline' }, pretty(p.label)))));
  progSelect.addEventListener('change', () => { bk.prog = progSelect.value; save(); buildBacking(); });

  root.append(
    card('',
      h('div', { class: 'metro-top' }, bpmOut, h('div', { class: 'md-typescale-body-large' }, 'beats per minute'), nameOut),
      dots,
      h('div', { class: 'row-center' },
        button('\u22125', () => setBpm(s.bpm - 5), 'outlined'),
        button('\u22121', () => setBpm(s.bpm - 1), 'outlined'),
        button('+1', () => setBpm(s.bpm + 1), 'outlined'),
        button('+5', () => setBpm(s.bpm + 5), 'outlined'),
      ),
      h('div', { class: 'slider' }, slider),
      h('div', { class: 'actions' }, startBtn, button('Tap tempo', tap, 'tonal')),
    ),
    card('Backing chords',
      hint('Loop a chord progression with the metronome, to improvise over. Chords change on the first beat of a bar.'),
      h('div', { class: 'chord-stage' }, nowEl, nextEl, pills),
      chips([{ value: 'on', label: 'Play chords' }, { value: 'click', label: 'Click' }], [bk.on ? 'on' : null, bk.click ? 'click' : null].filter(Boolean), (v) => {
        bk.on = v.includes('on'); bk.click = v.includes('click'); m.clickOn = bk.click; save(); showChord(-1);
      }),
      h('div', { class: 'gap' }),
      keySelect, h('div', { class: 'gap' }), progSelect,
      h('p', { class: 'label md-typescale-label-large' }, 'Each chord lasts'),
      segmented([{ value: '1', label: '1 bar' }, { value: '2', label: '2 bars' }], String(bk.bars), (v) => { bk.bars = Number(v); save(); }),
    ),
    card('Settings',
      h('p', { class: 'label md-typescale-label-large' }, 'Beats per bar'),
      segmented([2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })), String(s.beats), (v) => { s.beats = Number(v); m.beats = s.beats; save(); drawDots(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Clicks per beat'),
      segmented([{ value: '1', label: 'Beat' }, { value: '2', label: 'Eighths' }, { value: '3', label: 'Triplets' }, { value: '4', label: 'Sixteenths' }], String(s.sub), (v) => { s.sub = Number(v); m.sub = s.sub; save(); }),
      h('div', { class: 'gap' }),
      chips([{ value: 'accent', label: 'Accent the first beat' }], s.accent ? ['accent'] : [], (v) => { s.accent = v.includes('accent'); m.accent = s.accent; save(); }),
    ),
  );

  setBpm(s.bpm);
  drawDots();
  buildBacking();

  return () => {
    m.stop();
    timers.forEach(clearTimeout);
    releaseWake();
  };
}
