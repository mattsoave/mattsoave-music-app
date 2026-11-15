// Question builders for the sheet-reading quizzes: intervals, chords and short melodies on the staff.
// Pure functions, no DOM. Pass `rand` to get repeatable results in tests.

import { LETTERS, LETTER_PC, CLEF_BOTTOM, CHORD_TYPES, INTERVALS, stepMidi, scaleNotes, notePc } from './theory.js';

/** The reading range: the staff plus one ledger line above and below, as steps. */
export const readRange = (clef) => ({ lo: CLEF_BOTTOM[clef] - 2, hi: CLEF_BOTTOM[clef] + 10 });

export function shuffle(arr, rand = Math.random) {
  return arr.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

// ---- Intervals ----

const NUMBER_NAMES = ['Unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'Octave'];
/** Name for an interval counted in letter steps (1 is a 2nd, 7 is an octave). */
export const intervalNumberName = (steps) => NUMBER_NAMES[steps];

/** Every pair of natural notes in range, up to an octave apart: { lo, hi (steps), number (letter steps), semi, short, name }. */
export function intervalPairs(clef) {
  const { lo, hi } = readRange(clef);
  const out = [];
  for (let a = lo; a <= hi; a++) {
    for (let n = 1; n <= 7 && a + n <= hi; n++) {
      const semi = stepMidi(a + n) - stepMidi(a);
      const iv = INTERVALS.find((i) => i.semi === semi);
      out.push({ lo: a, hi: a + n, number: n, semi, short: iv.short, name: iv.name });
    }
  }
  return out;
}

// ---- Chords ----

export const READ_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const TONE_STEPS = [0, 2, 4, 6]; // root, 3rd, 5th and 7th are every other letter
const AVOID = new Set(['Cb', 'Fb', 'E#', 'B#']); // correct but rare spellings, left out to keep reading friendly
const ORDINAL = ['root position', '1st inversion', '2nd inversion', '3rd inversion'];

/** Spell a chord from its root, such as ('D', 'maj') -> ['D', 'F#', 'A']. Returns null if it needs a double or rare accidental. */
export function spellChord(root, type) {
  const li = LETTERS.indexOf(root[0]);
  const rootPc = notePc(root);
  const iv = CHORD_TYPES[type].iv;
  const out = [];
  for (let i = 0; i < iv.length; i++) {
    const letter = LETTERS[(li + TONE_STEPS[i]) % 7];
    let acc = ((((rootPc + iv[i]) - LETTER_PC[letter]) % 12) + 12) % 12;
    if (acc > 6) acc -= 12;
    if (Math.abs(acc) > 1) return null;
    const name = letter + (acc === 1 ? '#' : acc === -1 ? 'b' : '');
    if (AVOID.has(name)) return null;
    out.push(name);
  }
  return out;
}

/** Stack a spelled chord upward from a bass step in the given inversion. Returns notes from the bottom: { step, name, acc, midi }. */
export function placeChord(names, inversion, bassStep) {
  const order = names.slice(inversion).concat(names.slice(0, inversion));
  let step = bassStep;
  return order.map((nm, i) => {
    if (i > 0) step += (LETTERS.indexOf(nm[0]) - LETTERS.indexOf(order[i - 1][0]) + 7) % 7;
    const acc = nm.length > 1 ? (nm[1] === '#' ? 1 : -1) : 0;
    return { step, name: nm, acc, midi: stepMidi(step) + acc };
  });
}

/** A chord of the given type and inversion with a random root, placed somewhere in range on the clef. */
export function makeChord({ clef, type, inversion = 0, rand = Math.random }) {
  const { lo, hi } = readRange(clef);
  for (const root of shuffle(READ_ROOTS, rand)) {
    const names = spellChord(root, type);
    if (!names) continue;
    const inv = Math.min(inversion, names.length - 1);
    const spots = [];
    for (let s = lo; s <= hi; s++) {
      if (LETTERS[s % 7] !== names[inv][0]) continue;
      const notes = placeChord(names, inv, s);
      if (notes[notes.length - 1].step <= hi) spots.push(notes);
    }
    if (!spots.length) continue;
    return { root, type, inversion: inv, names, notes: spots[Math.floor(rand() * spots.length)] };
  }
  return null;
}

export const chordLabel = (root, type, inversion) => `${root} ${CHORD_TYPES[type].label}${inversion ? ', ' + ORDINAL[inversion] : ''}`;
/** Chord symbol with the bass note after a slash for inversions, such as D/F#. */
export const chordSymbol = (names, type, inversion) => names[0] + CHORD_TYPES[type].sym + (inversion ? '/' + names[inversion] : '');

/**
 * Four answer choices for a chord question: the right one plus likely mix-ups
 * (another inversion, another quality, or reading the lowest note as the root).
 */
export function chordChoices(q, { inversions = true, rand = Math.random } = {}) {
  const seen = new Set();
  const out = [];
  const add = (root, type, inversion) => {
    const names = spellChord(root, type);
    if (!names || inversion >= names.length) return;
    const value = `${root}|${type}|${inversion}`;
    if (seen.has(value)) return;
    seen.add(value);
    out.push({ value, label: chordLabel(root, type, inversion) });
  };
  add(q.root, q.type, q.inversion);
  const pool = [];
  if (inversions) for (let i = 0; i < q.names.length; i++) pool.push([q.root, q.type, i]);
  const family = q.names.length === 3 ? ['maj', 'min', 'dim'] : ['dom7', 'maj7', 'min7', 'hdim7'];
  family.forEach((t) => pool.push([q.root, t, q.inversion]));
  pool.push([q.names[q.inversion], q.type, 0], [q.names[1], q.type, 0], [q.names[2], q.type, 0]);
  for (const p of shuffle(pool, rand)) {
    if (out.length >= 4) break;
    add(...p);
  }
  return shuffle(out, rand);
}

// ---- Melodies ----

/**
 * A short melody in a major key on one clef: mostly steps, some small leaps, ending on the tonic.
 * Notes are { step, letter, acc, midi }; the accidental comes from the key signature.
 */
export function makeMelody({ clef, keyId, length = 8, rand = Math.random }) {
  const { lo, hi } = readRange(clef);
  const scale = scaleNotes(keyId);
  const accOf = {};
  scale.forEach((n) => { accOf[n[0]] = n.length > 1 ? (n[1] === '#' ? 1 : -1) : 0; });
  // Put the tonic a little below the middle of the range, so the tune has room either way.
  const mid = (lo + hi) / 2 - 1;
  let tonicStep = null;
  for (let s = lo; s <= hi; s++) {
    if (LETTERS[s % 7] === scale[0][0] && (tonicStep === null || Math.abs(s - mid) < Math.abs(tonicStep - mid))) tonicStep = s;
  }
  const minD = lo - tonicStep;
  const maxD = hi - tonicStep;
  const r = (n) => Math.floor(rand() * n);
  const sign = () => (rand() < 0.5 ? 1 : -1);

  const starts = [0, 2, 4].filter((d) => d >= minD && d <= maxD);
  let d = starts[r(starts.length)];
  const degrees = [d];
  let lastMove = 0;
  for (let i = 1; i < length - 1; i++) {
    let move;
    const x = rand();
    if (Math.abs(lastMove) >= 3) move = -Math.sign(lastMove) * (1 + r(2)); // after a leap, step back the other way
    else if (x < 0.6) move = sign();
    else if (x < 0.85) move = 2 * sign();
    else if (x < 0.95) move = (3 + r(2)) * sign();
    else move = 0;
    let nd = d + move;
    if (nd < minD || nd > maxD) nd = d - move;
    degrees.push(nd);
    lastMove = nd - d;
    d = nd;
  }
  const tonics = [-7, 0, 7].filter((t) => t >= minD && t <= maxD);
  degrees.push(tonics.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a)));

  const notes = degrees.map((deg) => {
    const step = tonicStep + deg;
    const letter = LETTERS[step % 7];
    const acc = accOf[letter];
    return { step, letter, acc, midi: stepMidi(step) + acc };
  });
  return { keyId, notes };
}
