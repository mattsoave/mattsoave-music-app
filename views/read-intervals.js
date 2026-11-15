// Reading intervals on the staff: two notes, side by side or stacked. Name the interval, or play both notes.

import { INTERVALS, stepMidi, stepName } from '../theory.js';
import { intervalPairs, intervalNumberName } from '../reading.js';
import { pick, record } from '../srs.js';
import { playSequence } from '../audio.js';
import { onNote, devices } from '../midi.js';
import * as store from '../store.js';
import { h, clear, card, hint, button, segmented, choices, drawStaff, midiHint, releaseFocus } from '../ui.js';

const DEFAULTS = { clef: 'treble', show: 'mix', answer: 'number' };

export function mount(root) {
  const s = { ...DEFAULTS, ...store.get('read.intervals', {}) };
  const save = () => store.set('read.intervals', s);
  const stats = store.get('read.stats', {});
  let q = null;
  let answered = false;
  let missed = false;
  let startedAt = 0;
  let timer = null;
  let ans = null;
  let got = new Set();

  const staffBox = h('div', { class: 'staff-box' });
  const prompt = h('p', { class: 'md-typescale-title-medium prompt' });
  const feedback = h('p', { class: 'feedback md-typescale-body-large', 'aria-live': 'polite' });
  const answerHost = h('div');
  const nextBtn = button('Next', () => next(), 'filled', { hidden: true });

  const keyOf = (p) => (s.answer === 'number' ? 'n' + p.number : p.short);
  const targets = () => [stepMidi(q.pair.lo), stepMidi(q.pair.hi)];
  const notesInOrder = () => (q.downward ? [q.pair.hi, q.pair.lo] : [q.pair.lo, q.pair.hi]);

  function draw() {
    const notes = q.stacked
      ? [{ steps: [q.pair.lo, q.pair.hi], duration: 'w' }]
      : notesInOrder().map((st) => ({ steps: [st], duration: 'h' }));
    drawStaff(staffBox, { clef: q.clef, notes });
  }

  function next() {
    clearTimeout(timer);
    releaseFocus(answerHost);
    const clef = s.clef === 'both' ? (Math.random() < 0.5 ? 'treble' : 'bass') : s.clef;
    const groups = new Map();
    for (const p of intervalPairs(clef)) {
      if (!groups.has(keyOf(p))) groups.set(keyOf(p), []);
      groups.get(keyOf(p)).push(p);
    }
    const items = [...groups.keys()].map((k) => ({ id: `ivl:${s.answer}:${k}`, key: k }));
    const item = pick(items, (i) => stats[i.id], q && q.item.id);
    const options = groups.get(item.key);
    const stacked = s.show === 'stacked' || (s.show === 'mix' && Math.random() < 0.5);
    q = { item, clef, stacked, downward: !stacked && Math.random() < 0.5, pair: options[Math.floor(Math.random() * options.length)] };
    answered = false;
    missed = false;
    got = new Set();
    startedAt = performance.now();
    draw();
    prompt.textContent = stacked ? 'What interval is this?' : 'What interval is this, from the first note to the second?';
    feedback.textContent = '';
    feedback.className = 'feedback md-typescale-body-large';
    nextBtn.hidden = true;
    const opts = s.answer === 'number'
      ? [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: 'n' + n, label: intervalNumberName(n) }))
      : INTERVALS.map((i) => ({ value: i.short, label: i.name }));
    ans = choices(opts, (v) => finish(v === keyOf(q.pair), v), { cols: s.answer === 'number' ? 4 : 3 });
    clear(answerHost);
    answerHost.append(ans.el);
  }

  function finish(ok, picked, { prefix = '', played = false } = {}) {
    if (answered) return;
    answered = true;
    missed = !ok;
    stats[q.item.id] = record(stats[q.item.id], ok, performance.now() - startedAt);
    store.set('read.stats', stats);
    ans.show(keyOf(q.pair), picked);
    const number = intervalNumberName(q.pair.number);
    const name = s.answer === 'number' ? `${number} (${q.pair.name.toLowerCase()})` : `${q.pair.name} (a ${number})`;
    const notes = notesInOrder().map(stepName).join(' to ');
    feedback.textContent = (ok ? 'Correct. ' : prefix + 'Not quite. ') + `${name}, ${notes}.` + (!ok && devices().length ? ' Play both notes to go on.' : '');
    feedback.classList.add(ok ? 'good' : 'bad');
    if (!played) {
      const [a, b] = notesInOrder().map(stepMidi);
      playSequence(q.stacked ? [{ notes: [a, b], beats: 2 }] : [{ notes: [a], beats: 1 }, { notes: [b], beats: 1.5 }], { beatSec: 0.55, vel: 0.45 });
    }
    if (ok) timer = setTimeout(next, 1300); else nextBtn.hidden = false;
  }

  // On a MIDI keyboard, play both notes where they are written, in either order or together.
  const offNote = onNote((ev) => {
    if (ev.type !== 'on' || !q) return;
    const t = targets();
    if (answered) {
      if (!missed) return;
      if (t.includes(ev.midi)) got.add(ev.midi);
      if (got.size === 2) next();
      return;
    }
    if (!t.includes(ev.midi)) {
      finish(false, null, { prefix: ((ev.midi - t[0]) % 12 === 0 || (ev.midi - t[1]) % 12 === 0) ? 'Wrong octave. ' : '' });
      got = new Set();
      return;
    }
    got.add(ev.midi);
    if (got.size === 2) finish(true, keyOf(q.pair), { played: true });
  });

  root.append(
    card('Name the interval', staffBox, prompt, feedback, answerHost, h('div', { class: 'actions' }, nextBtn),
      midiHint('You can also play both notes on your keyboard.')),
    card('Practice settings',
      h('p', { class: 'label md-typescale-label-large' }, 'Clef'),
      segmented([{ value: 'treble', label: 'Treble' }, { value: 'bass', label: 'Bass' }, { value: 'both', label: 'Both' }], s.clef, (v) => { s.clef = v; save(); next(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Show the notes'),
      segmented([{ value: 'side', label: 'Side by side' }, { value: 'stacked', label: 'Stacked' }, { value: 'mix', label: 'Both' }], s.show, (v) => { s.show = v; save(); next(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Answer with'),
      segmented([{ value: 'number', label: 'Number (3rd)' }, { value: 'full', label: 'Full name (major 3rd)' }], s.answer, (v) => { s.answer = v; save(); next(); }),
      hint('To find the number, count the lines and spaces from the lower note to the upper one, counting both notes.'),
    ),
  );
  next();
  return () => { clearTimeout(timer); offNote(); };
}
