// Reading chords on the staff, including inversions. Pick the chord's name, or play it on a MIDI keyboard.

import { CHORD_TYPES, samePitchClasses, noteName, pretty } from '../theory.js';
import { makeChord, chordChoices, chordLabel, chordSymbol } from '../reading.js';
import { pick, record } from '../srs.js';
import { playChord } from '../audio.js';
import { onNote, chordTracker, devices } from '../midi.js';
import * as store from '../store.js';
import { h, clear, card, hint, button, segmented, chips, choices, drawStaff, midiHint, releaseFocus } from '../ui.js';

const DEFAULTS = { clef: 'treble', inversions: true, sevenths: false };
const TRIADS = ['maj', 'min', 'dim'];
const SEVENTHS = ['dom7', 'maj7', 'min7', 'hdim7'];

export function mount(root) {
  const s = { ...DEFAULTS, ...store.get('read.chords', {}) };
  const save = () => store.set('read.chords', s);
  const stats = store.get('read.stats', {});
  const tracker = chordTracker();
  let q = null;
  let item = null;
  let answered = false;
  let missed = false;
  let startedAt = 0;
  let timer = null;
  let ans = null;
  let heldNow = [];
  let skipRelease = false;

  const staffBox = h('div', { class: 'staff-box' });
  const prompt = h('p', { class: 'md-typescale-title-medium prompt' }, 'Which chord is this?');
  const feedback = h('p', { class: 'feedback md-typescale-body-large', 'aria-live': 'polite' });
  const answerHost = h('div');
  const nextBtn = button('Next', () => next(), 'filled', { hidden: true });

  const correctValue = () => `${q.root}|${q.type}|${q.inversion}`;
  const midis = () => q.notes.map((n) => n.midi);
  const label = (n) => pretty(n.name) + Math.floor(n.step / 7);

  const items = () => {
    const types = s.sevenths ? [...TRIADS, ...SEVENTHS] : TRIADS;
    const out = [];
    for (const type of types) {
      const count = s.inversions ? CHORD_TYPES[type].iv.length : 1;
      for (let inv = 0; inv < count; inv++) out.push({ id: `chord:${type}:${inv}`, type, inv });
    }
    return out;
  };

  function next() {
    clearTimeout(timer);
    releaseFocus(answerHost);
    item = pick(items(), (i) => stats[i.id], item && item.id);
    const clef = s.clef === 'both' ? (Math.random() < 0.5 ? 'treble' : 'bass') : s.clef;
    q = { ...makeChord({ clef, type: item.type, inversion: item.inv }), clef };
    answered = false;
    missed = false;
    skipRelease = heldNow.length > 0; // keys still down from the last chord shouldn't count as an answer
    startedAt = performance.now();
    drawStaff(staffBox, { clef, notes: [{ steps: q.notes.map((n) => n.step), accs: q.notes.map((n) => n.acc || null), duration: 'w' }] });
    feedback.textContent = '';
    feedback.className = 'feedback md-typescale-body-large';
    nextBtn.hidden = true;
    ans = choices(chordChoices(q, { inversions: s.inversions }).map((c) => ({ value: c.value, label: pretty(c.label) })), (v) => finish(v === correctValue(), v), { cols: 1 });
    clear(answerHost);
    answerHost.append(ans.el);
  }

  function finish(ok, picked, { prefix = '', played = false } = {}) {
    if (answered) return;
    answered = true;
    missed = !ok;
    stats[item.id] = record(stats[item.id], ok, performance.now() - startedAt);
    store.set('read.stats', stats);
    ans.show(correctValue(), picked);
    const name = pretty(chordLabel(q.root, q.type, q.inversion));
    const symbol = pretty(chordSymbol(q.names, q.type, q.inversion));
    feedback.textContent = (ok ? 'Correct. ' : prefix + 'Not quite. ') + `${name} (${symbol}). From the bottom: ${q.notes.map(label).join(' ')}.`
      + (!ok && devices().length ? ' Play it to go on.' : '');
    feedback.classList.add(ok ? 'good' : 'bad');
    if (!played) playChord(midis(), { dur: 1.4 });
    if (ok) timer = setTimeout(next, 1600); else nextBtn.hidden = false;
  }

  // On a MIDI keyboard, hold the chord's notes exactly where they are written. A wrong chord is judged when you let go.
  const offNote = onNote((ev) => {
    if (!q) return;
    const r = tracker.feed(ev);
    heldNow = r.held;
    const target = midis();
    const exact = r.held.length === target.length && r.held.every((m, i) => m === target[i]);
    if (exact) {
      if (!answered) finish(true, correctValue(), { played: true });
      else if (missed) next();
      return;
    }
    if (!r.released) return;
    if (skipRelease) { skipRelease = false; return; }
    if (answered || r.peak.length < 2) return;
    const prefix = samePitchClasses(r.peak, target)
      ? 'Right notes, but play them where they are written. '
      : `You played ${r.peak.map((m) => pretty(noteName(m))).join(' ')}. `;
    finish(false, null, { prefix });
  });

  root.append(
    card('Name the chord', staffBox, prompt, feedback, answerHost, h('div', { class: 'actions' }, nextBtn),
      midiHint('You can also play the chord on your keyboard, with the notes where they are written.')),
    card('Practice settings',
      h('p', { class: 'label md-typescale-label-large' }, 'Clef'),
      segmented([{ value: 'treble', label: 'Treble' }, { value: 'bass', label: 'Bass' }, { value: 'both', label: 'Both' }], s.clef, (v) => { s.clef = v; save(); next(); }),
      h('div', { class: 'gap' }),
      chips([{ value: 'inversions', label: 'Inversions' }, { value: 'sevenths', label: '7th chords' }],
        [s.inversions ? 'inversions' : null, s.sevenths ? 'sevenths' : null].filter(Boolean),
        (v) => { s.inversions = v.includes('inversions'); s.sevenths = v.includes('sevenths'); save(); next(); }),
      hint('The lowest note tells you the inversion. With the root on the bottom it is root position, with the 3rd on the bottom it is 1st inversion, and with the 5th it is 2nd inversion.'),
    ),
  );
  next();
  return () => { clearTimeout(timer); offNote(); };
}
