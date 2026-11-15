// Metronome with tap tempo, beats per bar and subdivisions.

import { Metronome, audio } from '../audio.js';
import * as store from '../store.js';
import { h, card, button, segmented, chips } from '../ui.js';

const TEMPO_NAMES = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [999, 'Prestissimo']];
const tempoName = (bpm) => TEMPO_NAMES.find(([max]) => bpm < max)[1];
const DEFAULTS = { bpm: 100, beats: 4, sub: 1, accent: true };

export function mount(root) {
  const s = { ...DEFAULTS, ...store.get('metronome', {}) };
  const save = () => store.set('metronome', s);
  const m = new Metronome();
  Object.assign(m, s);
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

  return () => {
    m.stop();
    timers.forEach(clearTimeout);
    releaseWake();
  };
}
