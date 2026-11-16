// Reading chords on the staff, including inversions. Name the chord by its root (letter plus sharp or flat)
// and its kind (major, minor 7th and so on), or play it on a MIDI keyboard. The inversion isn't asked for.
// Options add random key signatures and chords that need accidental signs in the key.

import { CHORD_TYPES, samePitchClasses, noteName, pretty, LETTERS } from '../theory.js';
import { makeChord, chordLabel, chordSymbol, pickKey } from '../reading.js';
import { pick, record } from '../srs.js';
import { playChord } from '../audio.js';
import { onNote, chordTracker, devices } from '../midi.js';
import * as store from '../store.js';
import { h, clear, card, hint, button, segmented, chips, choices, accidentalPicker, drawStaff, midiHint, releaseFocus } from '../ui.js';

const DEFAULTS = { clef: 'treble', inversions: true, sevenths: false, otherKeys: false, accidentals: true };
const TRIADS = ['maj', 'min', 'dim'];
const SEVENTHS = ['dom7', 'maj7', 'min7', 'hdim7'];
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const accSign = (a) => (a === 1 ? '#' : a === -1 ? 'b' : '');

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
  let heldNow = [];
  let skipRelease = false;
  let pickedLetter = null;
  let pickedType = null;

  const staffBox = h('div', { class: 'staff-box' });
  const prompt = h('p', { class: 'md-typescale-title-medium prompt' }, 'Which chord is this?');
  const feedback = h('p', { class: 'feedback md-typescale-body-large', 'aria-live': 'polite' });
  const answerHost = h('div');
  const nextBtn = button('Next', () => next(), 'filled', { hidden: true });
  const answerHint = hint('');

  const midis = () => q.notes.map((n) => n.midi);
  const label = (n) => pretty(n.name) + Math.floor(n.step / 7);
  const types = () => (s.sevenths ? [...TRIADS, ...SEVENTHS] : TRIADS);
  // In C with no accidentals every chord is made of natural notes, so the sharp and flat picker isn't needed.
  const needsAcc = () => s.otherKeys || s.accidentals;

  // ---- Answer: root letter (with an optional sharp or flat) and the kind of chord ----
  const acc = accidentalPicker();
  const letters = choices(LETTERS.map((L) => ({ value: L, label: L })), (L) => {
    if (answered) return;
    pickedLetter = L;
    letters.select(L);
    if (pickedType) submit();
  }, { cols: 7 });
  letters.el.classList.add('root');
  let kinds = null;

  function buildAnswers() {
    kinds = choices(types().map((t) => ({ value: t, label: capitalize(CHORD_TYPES[t].label) })), (t) => {
      if (answered) return;
      pickedType = t;
      kinds.select(t);
      if (pickedLetter) submit();
    }, { cols: 2 });
    acc.el.hidden = !needsAcc();
    answerHint.textContent = needsAcc()
      ? 'Pick the root (set \u266D or \u266F first if it has one) and the kind of chord, in either order.'
      : 'Pick the root and the kind of chord, in either order.';
    answerHost.replaceChildren(
      h('p', { class: 'answer-label md-typescale-label-large' }, 'Root'), acc.el, letters.el,
      h('p', { class: 'answer-label md-typescale-label-large' }, 'Kind of chord'), kinds.el,
    );
  }

  function submit() {
    const rootName = pickedLetter + accSign(acc.value);
    finish(rootName === q.root && pickedType === q.type, { letter: pickedLetter, type: pickedType, rootName });
  }

  const items = () => {
    const out = [];
    for (const type of types()) {
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
    const keyId = pickKey(s.otherKeys);
    q = { ...makeChord({ clef, type: item.type, inversion: item.inv, keyId, accidentals: s.accidentals }), clef };
    answered = false;
    missed = false;
    pickedLetter = null;
    pickedType = null;
    skipRelease = heldNow.length > 0; // keys still down from the last chord shouldn't count as an answer
    startedAt = performance.now();
    drawStaff(staffBox, {
      clef,
      keySig: keyId === 'C' ? null : keyId,
      notes: [{ steps: q.notes.map((n) => n.step), accs: q.notes.map((n) => n.shown), duration: 'w' }],
    });
    feedback.textContent = '';
    feedback.className = 'feedback md-typescale-body-large';
    nextBtn.hidden = true;
    acc.reset();
    letters.reset();
    kinds.reset();
  }

  // given: what was picked ({ letter, type, rootName }), or null when the answer came from the MIDI keyboard.
  function finish(ok, given, { prefix = '', played = false } = {}) {
    if (answered) return;
    answered = true;
    missed = !ok;
    stats[item.id] = record(stats[item.id], ok, performance.now() - startedAt);
    store.set('read.stats', stats);
    letters.reset();
    kinds.reset();
    letters.show(q.root[0], given && given.letter);
    kinds.show(q.type, given && given.type);
    let why = '';
    if (!ok && given && given.letter === q.root[0] && given.rootName !== q.root) {
      why = `The root is ${pretty(q.root)}, not ${pretty(given.rootName)}. `;
    }
    const name = pretty(chordLabel(q.root, q.type, q.inversion));
    const symbol = pretty(chordSymbol(q.names, q.type, q.inversion));
    feedback.textContent = (ok ? 'Correct. ' : prefix + 'Not quite. ' + why) + `${name} (${symbol}). From the bottom: ${q.notes.map(label).join(' ')}.`
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
      if (!answered) finish(true, null, { played: true });
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

  const onSettings = () => { save(); buildAnswers(); next(); };
  buildAnswers();
  root.append(
    card('Name the chord', staffBox, prompt, feedback, answerHost, answerHint, h('div', { class: 'actions' }, nextBtn),
      midiHint('You can also play the chord on your keyboard, with the notes where they are written.')),
    card('Practice settings',
      h('p', { class: 'label md-typescale-label-large' }, 'Clef'),
      segmented([{ value: 'treble', label: 'Treble' }, { value: 'bass', label: 'Bass' }, { value: 'both', label: 'Both' }], s.clef, (v) => { s.clef = v; save(); next(); }),
      h('div', { class: 'gap' }),
      chips([
        { value: 'inversions', label: 'Inversions' }, { value: 'sevenths', label: '7th chords' },
        { value: 'otherKeys', label: 'Other keys' }, { value: 'accidentals', label: 'Accidentals' },
      ], ['inversions', 'sevenths', 'otherKeys', 'accidentals'].filter((k) => s[k]),
      (v) => { ['inversions', 'sevenths', 'otherKeys', 'accidentals'].forEach((k) => { s[k] = v.includes(k); }); onSettings(); }),
      hint('Other keys adds a random key signature (up to 5 sharps or flats). Accidentals adds chords with notes outside the key, marked with sharp, flat or natural signs. With both off, every chord is made of white keys.'),
      hint('With inversions, the lowest note isn\'t always the root. Stack the notes in 3rds (every other line or space) to find it.'),
    ),
  );
  next();
  return () => { clearTimeout(timer); offNote(); };
}
