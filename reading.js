// Question builders for the sheet-reading quizzes: intervals, chords and short melodies on the staff.
// Pure functions, no DOM. Pass `rand` to get repeatable results in tests.

import { LETTERS, LETTER_PC, CLEF_BOTTOM, CHORD_TYPES, INTERVALS, stepMidi, scaleNotes, notePc, keysUpTo } from './theory.js';

/** The reading range: the staff plus one ledger line above and below, as steps. */
export const readRange = (clef) => ({ lo: CLEF_BOTTOM[clef] - 2, hi: CLEF_BOTTOM[clef] + 10 });

export function shuffle(arr, rand = Math.random) {
  return arr.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

// ---- Keys and accidentals ----

/** Major keys used when "Other keys" is on: up to 5 sharps or flats. */
export const READ_KEYS = keysUpTo(5, false).map((k) => k.id);
/** How often a question gets an accidental sign when "Accidentals" is on. */
export const ALTER_CHANCE = 0.4;

const RARE = new Set(['Cb', 'Fb', 'E#', 'B#']); // correct but rare spellings, left out to keep reading friendly
const accName = (letter, acc) => letter + (acc === 1 ? '#' : acc === -1 ? 'b' : '');
const accOfName = (name) => (name.length > 1 ? (name[1] === '#' ? 1 : -1) : 0);

export const pickKey = (otherKeys, rand = Math.random) => (otherKeys ? READ_KEYS[Math.floor(rand() * READ_KEYS.length)] : 'C');

/** The sharp or flat the key signature gives each letter, such as { F: 1, C: 1, ... } for D major. */
export function keyAccidentals(keyId) {
  const out = {};
  LETTERS.forEach((L) => { out[L] = 0; });
  scaleNotes(keyId).forEach((n) => { out[n[0]] = accOfName(n); });
  return out;
}

/** Signs that can change a letter away from what the key gives it: no double sharps or flats, no rare spellings. */
export function alterations(letter, keyAcc) {
  return [-1, 0, 1].filter((a) => a !== keyAcc[letter] && !RARE.has(accName(letter, a)));
}

/**
 * A note on the staff in a key: { step, letter, acc, shown, midi, name }. `acc` is the sharp or flat the note
 * really has (null means take it from the key signature). `shown` is the sign to draw next to the note, or null
 * when the key signature already covers it. `name` is such as 'F#4'.
 */
export function spellNote(step, keyAcc, acc = null) {
  const letter = LETTERS[step % 7];
  const a = acc === null ? keyAcc[letter] : acc;
  return { step, letter, acc: a, shown: a === keyAcc[letter] ? null : a, midi: stepMidi(step) + a, name: accName(letter, a) + Math.floor(step / 7) };
}

/** A note for the note-reading quiz, given its line or space. With `accidentals`, it sometimes gets a sign. */
export function makeNoteQuestion({ step, keyId = 'C', accidentals = false, rand = Math.random }) {
  const keyAcc = keyAccidentals(keyId);
  const alts = alterations(LETTERS[step % 7], keyAcc);
  const acc = accidentals && alts.length && rand() < ALTER_CHANCE ? alts[Math.floor(rand() * alts.length)] : null;
  return { keyId, ...spellNote(step, keyAcc, acc) };
}

// ---- Intervals ----

const NUMBER_NAMES = ['Unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'Octave'];
/** Name for an interval counted in letter steps (1 is a 2nd, 7 is an octave). */
export const intervalNumberName = (steps) => NUMBER_NAMES[steps];

// The usual name for each number of letter steps and semitones. Other mixes (such as C to G sharp, an augmented
// 5th) are left out, so the number and the full name always agree.
const STANDARD = {
  1: { 1: 'm2', 2: 'M2' }, 2: { 3: 'm3', 4: 'M3' }, 3: { 5: 'P4', 6: 'TT' }, 4: { 6: 'TT', 7: 'P5' },
  5: { 8: 'm6', 9: 'M6' }, 6: { 10: 'm7', 11: 'M7' }, 7: { 12: 'P8' },
};

/**
 * Every pair of notes in range in a key, up to an octave apart: { lo, hi (spelled notes), number, semi, short, name }.
 * With `altered`, only pairs where at least one note has an accidental sign; without it, only notes from the key.
 */
export function intervalPairs(clef, { keyId = 'C', altered = false } = {}) {
  const { lo, hi } = readRange(clef);
  const keyAcc = keyAccidentals(keyId);
  const options = (step) => {
    const L = LETTERS[step % 7];
    return altered ? [keyAcc[L], ...alterations(L, keyAcc)] : [keyAcc[L]];
  };
  const out = [];
  for (let a = lo; a <= hi; a++) {
    for (let n = 1; n <= 7 && a + n <= hi; n++) {
      for (const accLo of options(a)) {
        for (const accHi of options(a + n)) {
          const pLo = spellNote(a, keyAcc, accLo);
          const pHi = spellNote(a + n, keyAcc, accHi);
          if (altered && pLo.shown === null && pHi.shown === null) continue;
          const semi = pHi.midi - pLo.midi;
          const short = STANDARD[n][semi];
          if (!short) continue;
          out.push({ lo: pLo, hi: pHi, number: n, semi, short, name: INTERVALS.find((i) => i.short === short).name });
        }
      }
    }
  }
  return out;
}

// ---- Chords ----

export const READ_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const TONE_STEPS = [0, 2, 4, 6]; // root, 3rd, 5th and 7th are every other letter
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
    const name = accName(letter, acc);
    if (RARE.has(name)) return null;
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
    const acc = accOfName(nm);
    return { step, name: nm, acc, midi: stepMidi(step) + acc };
  });
}

/**
 * A chord of the given type and inversion with a random root, placed somewhere in range on the clef, in a key.
 * Without `accidentals`, only chords made of the key's own notes (so no signs are drawn). With them, any root,
 * and some of the time still a chord from the key. Each note gets `shown`, the sign to draw (or null).
 */
export function makeChord({ clef, type, inversion = 0, keyId = 'C', accidentals = true, rand = Math.random }) {
  const { lo, hi } = readRange(clef);
  const keyAcc = keyAccidentals(keyId);
  const inKey = (names) => names.every((n) => accOfName(n) === keyAcc[n[0]]);
  const roots = [...new Set([...scaleNotes(keyId), ...READ_ROOTS])];
  const diatonicFirst = !accidentals || rand() < ALTER_CHANCE;
  for (const onlyInKey of diatonicFirst ? [true, false] : [false]) {
    if (!onlyInKey && !accidentals) break;
    for (const root of shuffle(roots, rand)) {
      const names = spellChord(root, type);
      if (!names || (onlyInKey && !inKey(names))) continue;
      const inv = Math.min(inversion, names.length - 1);
      const spots = [];
      for (let s = lo; s <= hi; s++) {
        if (LETTERS[s % 7] !== names[inv][0]) continue;
        const notes = placeChord(names, inv, s);
        if (notes[notes.length - 1].step <= hi) spots.push(notes);
      }
      if (!spots.length) continue;
      const notes = spots[Math.floor(rand() * spots.length)].map((n) => ({ ...n, shown: n.acc === keyAcc[n.name[0]] ? null : n.acc }));
      return { root, type, inversion: inv, names, keyId, notes };
    }
  }
  return null;
}

export const chordLabel = (root, type, inversion) => `${root} ${CHORD_TYPES[type].label}${inversion ? ', ' + ORDINAL[inversion] : ''}`;
/** Chord symbol with the bass note after a slash for inversions, such as D/F#. */
export const chordSymbol = (names, type, inversion) => names[0] + CHORD_TYPES[type].sym + (inversion ? '/' + names[inversion] : '');

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

// ---- Rhythm ----

/** How many beats (quarter notes) an event lasts. Triplet 8ths are a third of a beat each. */
export const beatsOf = (ev) => (ev.tuplet !== null && ev.tuplet !== undefined ? 1 / 3 : { h: 2, q: 1, 8: 0.5 }[ev.dur]);

/**
 * Bars of 4/4 rhythm, one beat at a time: quarter and half notes always, plus 8th notes, rests and
 * triplets when they are turned on. Each event is { dur: 'h' | 'q' | '8', rest, beam, tuplet }, where
 * beam and tuplet are group numbers (or null) shared by the notes drawn together. At most one rest and one
 * triplet per bar keeps it readable, and the last beat is always a note so the tune can end on the tonic.
 */
export function makeRhythm({ bars = 2, eighths = true, rests = true, triplets = true, rand = Math.random } = {}) {
  let group = 0;
  const ev = (dur, extra = {}) => ({ dur, rest: false, beam: null, tuplet: null, ...extra });
  const PATTERNS = {
    h: () => [ev('h')],
    q: () => [ev('q')],
    pair: () => { const g = ++group; return [ev('8', { beam: g }), ev('8', { beam: g })]; },
    trip: () => { const g = ++group; return [0, 1, 2].map(() => ev('8', { beam: g, tuplet: g })); },
    qRest: () => [ev('q', { rest: true })],
    restNote: () => [ev('8', { rest: true }), ev('8')],
    noteRest: () => [ev('8'), ev('8', { rest: true })],
  };
  const out = [];
  for (let b = 0; b < bars; b++) {
    const lastBar = b === bars - 1;
    const bar = [];
    let restsUsed = 0;
    let tripsUsed = 0;
    let beat = 0;
    while (beat < 4) {
      if (lastBar && beat === 3) { bar.push(ev('q')); beat++; continue; }
      const choices = [];
      const add = (w, name) => choices.push([w, name]);
      if (beat % 2 === 0) add(lastBar && beat === 2 ? 2.5 : 1, 'h'); // a half note starts on beat 1 or 3
      add(3, 'q');
      if (eighths) add(2.5, 'pair');
      if (triplets && tripsUsed < 1) add(1.2, 'trip');
      if (rests && restsUsed < 1) {
        add(0.8, 'qRest');
        if (eighths) { add(0.6, 'restNote'); add(0.3, 'noteRest'); }
      }
      let r = rand() * choices.reduce((a, c) => a + c[0], 0);
      let name = choices[choices.length - 1][1];
      for (const [w, n] of choices) { r -= w; if (r <= 0) { name = n; break; } }
      if (name === 'trip') tripsUsed++;
      if (['qRest', 'restNote', 'noteRest'].includes(name)) restsUsed++;
      bar.push(...PATTERNS[name]());
      beat += name === 'h' ? 2 : 1;
    }
    out.push(bar);
  }
  return out;
}

/**
 * A sight-reading tune: a rhythm (see makeRhythm) with a melody line laid over its notes.
 * Returns { keyId, notes, bars }: notes are the pitches to play in order, and each non-rest event in bars
 * has `note`, its index into notes.
 */
export function makeSightReading({ clef, keyId, bars = 2, eighths = true, rests = true, triplets = true, rand = Math.random }) {
  const rhythm = makeRhythm({ bars, eighths, rests, triplets, rand });
  const count = rhythm.flat().filter((e) => !e.rest).length;
  const { notes } = makeMelody({ clef, keyId, length: count, rand });
  let i = 0;
  const laid = rhythm.map((bar) => bar.map((e) => ({ ...e, note: e.rest ? null : i++ })));
  return { keyId, notes, bars: laid };
}
