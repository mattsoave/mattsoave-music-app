// Music theory helpers. Pure functions, no DOM, so they run in the browser and in Node tests.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Display with real sharp and flat signs.
export const pretty = (s) => s.replace(/#/g, '\u266F').replace(/(?<=[A-G])b/g, '\u266D');

export const midiOf = (letter, octave, acc = 0) => 12 * (octave + 1) + LETTER_PC[letter] + acc;
export const pcName = (pc, flats = false) => (flats ? FLAT_NAMES : SHARP_NAMES)[((pc % 12) + 12) % 12];
export const noteName = (midi, flats = false) => pcName(midi, flats) + (Math.floor(midi / 12) - 1);
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- Staff positions ----
// A "step" counts letter names upward from C0 (C0 = 0, D0 = 1, ... C1 = 7). One step is one line or space on the staff.
export const stepNote = (step) => ({ letter: LETTERS[step % 7], octave: Math.floor(step / 7) });
export const stepMidi = (step) => { const n = stepNote(step); return midiOf(n.letter, n.octave); };
export const stepName = (step) => { const n = stepNote(step); return n.letter + n.octave; };
export const stepVexKey = (step) => { const n = stepNote(step); return n.letter.toLowerCase() + '/' + n.octave; };

// Step of the bottom staff line for each clef (E4 for treble, G2 for bass).
export const CLEF_BOTTOM = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 };
// How many steps past the staff to quiz: three ledger lines either way.
export const LEDGER_REACH = 6;

/** All natural notes in the quiz range for a clef, each tagged 'staff', 'above' or 'below'. */
export function clefNotes(clef) {
  const b = CLEF_BOTTOM[clef];
  const out = [];
  for (let s = b - LEDGER_REACH; s <= b + 8 + LEDGER_REACH; s++) {
    out.push({ clef, step: s, id: clef + ':' + stepName(s), zone: s < b ? 'below' : s > b + 8 ? 'above' : 'staff' });
  }
  return out;
}

// ---- Keys ----
export const MAJOR_BY_FIFTHS = { '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };
export const MINOR_BY_FIFTHS = { '-7': 'Ab', '-6': 'Eb', '-5': 'Bb', '-4': 'F', '-3': 'C', '-2': 'G', '-1': 'D', 0: 'A', 1: 'E', 2: 'B', 3: 'F#', 4: 'C#', 5: 'G#', 6: 'D#', 7: 'A#' };

/** Keys with up to `maxAcc` sharps or flats, ordered flats to sharps. Key id looks like 'D' or 'Bm'. */
export function keysUpTo(maxAcc, minor = false) {
  const out = [];
  for (let f = -maxAcc; f <= maxAcc; f++) {
    out.push({ fifths: f, minor, tonic: (minor ? MINOR_BY_FIFTHS : MAJOR_BY_FIFTHS)[f], id: (minor ? MINOR_BY_FIFTHS : MAJOR_BY_FIFTHS)[f] + (minor ? 'm' : '') });
  }
  return out;
}

export function parseKey(id) {
  const m = /^([A-G])(#|b)?(m)?$/.exec(id);
  if (!m) throw new Error('bad key ' + id);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return { letter: m[1], acc, minor: !!m[3], pc: (LETTER_PC[m[1]] + acc + 12) % 12, tonic: m[1] + (m[2] || '') };
}

export const fifthsOf = (id) => {
  const k = parseKey(id);
  const table = k.minor ? MINOR_BY_FIFTHS : MAJOR_BY_FIFTHS;
  return Number(Object.keys(table).find((f) => table[f] === k.tonic));
};

export const accidentalsLabel = (f) => (f === 0 ? '0' : Math.abs(f) + (f > 0 ? '\u266F' : '\u266D'));

const MAJOR_IV = [0, 2, 4, 5, 7, 9, 11];
const MINOR_IV = [0, 2, 3, 5, 7, 8, 10];

/** Spelled scale note names for a key id, such as ['D','E','F#','G','A','B','C#'] for 'D'. */
export function scaleNotes(id) {
  const k = parseKey(id);
  const iv = k.minor ? MINOR_IV : MAJOR_IV;
  const li = LETTERS.indexOf(k.letter);
  return iv.map((semi, i) => {
    const letter = LETTERS[(li + i) % 7];
    const target = (k.pc + semi) % 12;
    let acc = (((target - LETTER_PC[letter]) % 12) + 12) % 12;
    if (acc > 6) acc -= 12;
    return letter + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
  });
}

export const notePc = (name) => {
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(name);
  const acc = !m[2] ? 0 : m[2][0] === '#' ? m[2].length : -m[2].length;
  return (LETTER_PC[m[1]] + acc + 120) % 12;
};

// ---- Chords ----
export const CHORD_TYPES = {
  maj: { sym: '', label: 'major', iv: [0, 4, 7] },
  min: { sym: 'm', label: 'minor', iv: [0, 3, 7] },
  dim: { sym: 'dim', label: 'diminished', iv: [0, 3, 6] },
  aug: { sym: 'aug', label: 'augmented', iv: [0, 4, 8] },
  dom7: { sym: '7', label: 'dominant 7th', iv: [0, 4, 7, 10] },
  maj7: { sym: 'maj7', label: 'major 7th', iv: [0, 4, 7, 11] },
  min7: { sym: 'm7', label: 'minor 7th', iv: [0, 3, 7, 10] },
  hdim7: { sym: 'm7b5', label: 'half-diminished 7th', iv: [0, 3, 6, 10] },
};

const MAJOR_TRIADS = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const MAJOR_SEVENTHS = ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'hdim7'];
const MINOR_TRIADS = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
const MINOR_SEVENTHS = ['min7', 'hdim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export function romanFor(degree, type) {
  const base = ROMAN[degree];
  const lower = type === 'min' || type === 'dim' || type === 'min7' || type === 'hdim7';
  let r = lower ? base.toLowerCase() : base;
  if (type === 'dim') r += '\u00B0';
  if (type === 'hdim7') r += '\u00F8';
  if (type === 'aug') r += '+';
  if (type === 'dom7' || type === 'min7') r += '7';
  if (type === 'maj7') r += 'maj7';
  if (type === 'hdim7') r += '7';
  return r;
}

/** The seven chords built on each degree of a key. Natural minor for minor keys. */
export function diatonicChords(id, sevenths = false) {
  const k = parseKey(id);
  const notes = scaleNotes(id);
  const types = k.minor ? (sevenths ? MINOR_SEVENTHS : MINOR_TRIADS) : (sevenths ? MAJOR_SEVENTHS : MAJOR_TRIADS);
  return notes.map((root, i) => {
    const type = types[i];
    const rootPc = notePc(root);
    return {
      degree: i,
      root,
      type,
      name: root + CHORD_TYPES[type].sym,
      roman: romanFor(i, type),
      pcs: CHORD_TYPES[type].iv.map((s) => (rootPc + s) % 12),
    };
  });
}

// ---- Intervals ----
export const INTERVALS = [
  { semi: 1, short: 'm2', name: 'Minor 2nd', hint: 'Jaws' },
  { semi: 2, short: 'M2', name: 'Major 2nd', hint: 'Do-Re-Mi (Do to Re)' },
  { semi: 3, short: 'm3', name: 'Minor 3rd', hint: 'Greensleeves' },
  { semi: 4, short: 'M3', name: 'Major 3rd', hint: 'When the Saints Go Marching In' },
  { semi: 5, short: 'P4', name: 'Perfect 4th', hint: 'Here Comes the Bride' },
  { semi: 6, short: 'TT', name: 'Tritone', hint: 'The Simpsons theme' },
  { semi: 7, short: 'P5', name: 'Perfect 5th', hint: 'Star Wars main theme' },
  { semi: 8, short: 'm6', name: 'Minor 6th', hint: 'The Entertainer (first two notes)' },
  { semi: 9, short: 'M6', name: 'Major 6th', hint: 'My Bonnie Lies Over the Ocean' },
  { semi: 10, short: 'm7', name: 'Minor 7th', hint: 'Somewhere (West Side Story)' },
  { semi: 11, short: 'M7', name: 'Major 7th', hint: 'Take On Me (chorus jump)' },
  { semi: 12, short: 'P8', name: 'Octave', hint: 'Somewhere Over the Rainbow' },
];

// ---- Chords in a key, by Roman numeral (for ear training) ----
// root is semitones above the tonic of a major key.
export const NUMERAL_CHORDS = [
  { id: 'I', root: 0, type: 'maj' },
  { id: 'ii', root: 2, type: 'min' },
  { id: 'iii', root: 4, type: 'min' },
  { id: 'IV', root: 5, type: 'maj' },
  { id: 'V', root: 7, type: 'maj' },
  { id: 'vi', root: 9, type: 'min' },
  { id: 'vii\u00B0', root: 11, type: 'dim' },
  { id: 'V7', root: 7, type: 'dom7' },
  { id: 'II7', root: 2, type: 'dom7' },
  { id: 'IV7', root: 5, type: 'dom7' },
  { id: 'Imaj7', root: 0, type: 'maj7' },
  { id: 'ii7', root: 2, type: 'min7' },
  { id: 'iv', root: 5, type: 'min' },
  { id: '\u266DVII', root: 10, type: 'maj' },
  { id: '\u266DVI', root: 8, type: 'maj' },
  { id: '\u266DIII', root: 3, type: 'maj' },
];
export const numeralChord = (id) => NUMERAL_CHORDS.find((c) => c.id === id);

export const PROGRESSIONS = [
  ['I', 'IV'], ['I', 'V'], ['I', 'vi'], ['IV', 'V'], ['I', 'IV', 'V'], ['I', 'V', 'vi', 'IV'],
  ['I', 'vi', 'IV', 'V'], ['ii', 'V', 'I'], ['vi', 'IV', 'I', 'V'], ['I', 'IV', 'I', 'V'],
  ['I', 'iii', 'IV', 'V'], ['I', '\u266DVII', 'IV', 'I'], ['I', 'IV', 'iv', 'I'], ['I', 'II7', 'V', 'I'],
  ['I', 'vi', 'ii', 'V'], ['I', 'V', 'IV', 'I'],
].map((numerals) => ({ id: numerals.join('-'), label: numerals.join(' \u2013 '), numerals }));

/** Pitch classes for a numeral chord in the key whose tonic has pitch class `tonicPc`. */
export function numeralPcs(numeral, tonicPc) {
  const c = numeralChord(numeral);
  return CHORD_TYPES[c.type].iv.map((s) => (tonicPc + c.root + s) % 12);
}

/**
 * Voice a chord as a bass note plus close-position upper notes, picking the inversion
 * closest to the previous chord. Returns ascending MIDI numbers.
 */
export function voiceChord(pcs, prevUpper = null) {
  const target = prevUpper ? prevUpper.reduce((a, b) => a + b, 0) / prevUpper.length : 64;
  let best = null;
  for (let inv = 0; inv < pcs.length; inv++) {
    const rot = pcs.slice(inv).concat(pcs.slice(0, inv));
    for (const lo of [54, 60]) {
      let m = lo;
      while (((m % 12) + 12) % 12 !== rot[0]) m++;
      const notes = [m];
      for (let i = 1; i < rot.length; i++) {
        let n = notes[i - 1] + 1;
        while (n % 12 !== rot[i]) n++;
        notes.push(n);
      }
      const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
      const score = Math.abs(mean - target) + (notes[notes.length - 1] > 79 ? 20 : 0);
      if (!best || score < best.score) best = { score, notes };
    }
  }
  let bass = pcs[0] + 36;
  while (bass < 36) bass += 12;
  return { bass, upper: best.notes };
}
