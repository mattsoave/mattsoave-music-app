// Sanity checks for the pure logic. Run with: node test/run.js
import assert from 'node:assert/strict';
import * as T from '../theory.js';
import * as C from '../chart.js';
import * as S from '../srs.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; };

// ---- theory ----
ok('step names and midi', () => {
  assert.equal(T.stepName(T.CLEF_BOTTOM.treble), 'E4');
  assert.equal(T.stepName(T.CLEF_BOTTOM.bass), 'G2');
  assert.equal(T.stepMidi(28), 60); // middle C
  assert.equal(T.stepVexKey(28), 'c/4');
});
ok('clef notes cover three ledger lines each way', () => {
  const t = T.clefNotes('treble');
  assert.equal(t.length, 21);
  assert.equal(t[0].id, 'treble:F3');
  assert.equal(t[t.length - 1].id, 'treble:E6');
  assert.deepEqual(new Set(t.map((x) => x.zone)), new Set(['below', 'staff', 'above']));
  assert.equal(t.filter((x) => x.zone === 'staff').length, 9);
});
ok('scales are spelled correctly', () => {
  assert.deepEqual(T.scaleNotes('D'), ['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
  assert.deepEqual(T.scaleNotes('Gb'), ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
  assert.deepEqual(T.scaleNotes('F#'), ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
  assert.deepEqual(T.scaleNotes('Bm'), ['B', 'C#', 'D', 'E', 'F#', 'G', 'A']);
  assert.deepEqual(T.scaleNotes('Ebm'), ['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'Db']);
});
ok('key signatures', () => {
  assert.equal(T.fifthsOf('D'), 2);
  assert.equal(T.fifthsOf('Bb'), -2);
  assert.equal(T.fifthsOf('Gm'), -2);
  assert.equal(T.fifthsOf('F#m'), 3);
  assert.equal(T.keysUpTo(3).map((k) => k.id).join(' '), 'Eb Bb F C G D A');
});
ok('diatonic chords', () => {
  const g = T.diatonicChords('G');
  assert.deepEqual(g.map((c) => c.name), ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim']);
  assert.deepEqual(g.map((c) => c.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii\u00B0']);
  const g7 = T.diatonicChords('G', true);
  assert.deepEqual(g7.map((c) => c.name), ['Gmaj7', 'Am7', 'Bm7', 'Cmaj7', 'D7', 'Em7', 'F#m7b5']);
  const am = T.diatonicChords('Am');
  assert.deepEqual(am.map((c) => c.name), ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
  assert.deepEqual(am.map((c) => c.roman), ['i', 'ii\u00B0', 'III', 'iv', 'v', 'VI', 'VII']);
});
ok('numeral chords', () => {
  assert.deepEqual(T.numeralPcs('V7', 0), [7, 11, 2, 5]);
  assert.deepEqual(T.numeralPcs('II7', 7), [9, 1, 4, 7]); // A7 in G
});
ok('chord names for a numeral in a key', () => {
  assert.equal(T.numeralChordName('vi', 'D'), 'Bm');
  assert.equal(T.numeralChordName('V7', 'F'), 'C7');
  assert.equal(T.numeralChordName('IV', 'Bb'), 'Eb');
  assert.equal(T.numeralChordName('\u266DVII', 'D'), 'C');
  assert.equal(T.numeralChordName('ii', 'F#'), 'G#m');
  assert.equal(T.numeralChordName('II7', 'G'), 'A7');
});
ok('voice leading stays near and puts the bass low', () => {
  const a = T.voiceChord([0, 4, 7]);
  const b = T.voiceChord([5, 9, 0], a.upper);
  assert.ok(a.bass >= 36 && a.bass <= 47);
  assert.equal(a.bass % 12, 0);
  for (const x of [...a.upper, ...b.upper]) assert.ok(x >= 54 && x <= 84, String(x));
  assert.ok(Math.abs(mean(a.upper) - mean(b.upper)) < 6);
});

// ---- midi ----
import * as M from '../midi.js';
ok('midi messages', () => {
  assert.deepEqual(M.parseMessage([0x90, 60, 100]), { type: 'on', midi: 60, velocity: 100 / 127 });
  assert.deepEqual(M.parseMessage([0x93, 72, 1]).type, 'on'); // any channel
  assert.deepEqual(M.parseMessage([0x90, 60, 0]), { type: 'off', midi: 60, velocity: 0 });
  assert.equal(M.parseMessage([0x80, 60, 64]).type, 'off');
  assert.equal(M.parseMessage([0xb0, 64, 127]), null); // pedal, ignored for now
  assert.equal(M.parseMessage([0xf8]), null); // clock tick
});

// ---- chart parsing ----
const SAMPLE = `https://tabs.ultimate-guitar.com/tab/some-artist/some-song-chords-123
[Intro]
 
D
 
[Verse 1]
 
D                 C              Bm                    E7
la la la la la la la la la la la la la la la la la la la
                 A
la la la la la la
 
[Chorus]
G                   A              D            Bm
la la la la la la la la la la la la la la la
D/F#  Gmaj7  A7sus4 | x2
`;

ok('chord line detection', () => {
  assert.ok(C.isChordLine('D                 C              Bm                    E7'));
  assert.ok(C.isChordLine('D/F#  Gmaj7  A7sus4 | x2'));
  assert.ok(C.isChordLine('Cadd9 Em7 F#m7b5 Bb'));
  assert.ok(!C.isChordLine('And even though we ain\'t got money'));
  assert.ok(!C.isChordLine('[Chorus]'));
  assert.ok(!C.isChordLine('Be Add Dim Bad'));
});
ok('chart parse', () => {
  const p = C.parseChart(SAMPLE);
  assert.equal(p.url, 'https://tabs.ultimate-guitar.com/tab/some-artist/some-song-chords-123');
  const types = p.lines.map((l) => l.type).join(' ');
  assert.equal(types, 'section blank chords blank section blank chords lyric chords lyric blank section chords lyric chords');
  assert.equal(p.lines[0].text, '[Intro]');
});
ok('url guess', () => {
  assert.deepEqual(C.guessFromUrl('https://tabs.ultimate-guitar.com/tab/loggins-messina/dannys-song-chords-9297'), { title: 'Dannys Song', artist: 'Loggins Messina' });
});
ok('numerals', () => {
  assert.equal(C.toNumeral('D', 'D'), 'I');
  assert.equal(C.toNumeral('Bm', 'D'), 'vi');
  assert.equal(C.toNumeral('E7', 'D'), 'II7');
  assert.equal(C.toNumeral('C', 'D'), '\u266DVII');
  assert.equal(C.toNumeral('F#dim', 'G'), 'vii\u00B0');
  assert.equal(C.toNumeral('Gmaj7', 'G'), 'Imaj7');
  assert.equal(C.toNumeral('Am7', 'G'), 'ii7');
  assert.equal(C.toNumeral('D/F#', 'D'), 'I/3');
  assert.equal(C.toNumeral('Cadd9', 'C'), 'Iadd9');
  assert.equal(C.toNumeral('Dm', 'Am'), 'iv');
  assert.equal(C.toNumeral('G', 'Am'), 'VII');
});
ok('line conversion keeps columns when there is room', () => {
  const toks = C.tokenize('D        C     Bm');
  const segs = C.convertLine(toks, (t) => C.toNumeral(t, 'D'));
  const text = segs.map((s) => s.t).join('');
  assert.equal(text, 'I        \u266DVII  vi');
  assert.equal(text.indexOf('\u266DVII'), 9);
  const tight = C.convertLine(C.tokenize('D C'), (t) => C.toNumeral(t, 'D'));
  assert.equal(tight.map((s) => s.t).join(''), 'I \u266DVII');
});
ok('key detection', () => {
  assert.equal(C.detectKey(C.parseChart(SAMPLE)), 'D');
  assert.equal(C.detectKey(C.parseChart('Am F C G\nla\nAm F C E')), 'Am');
  assert.equal(C.detectKey(C.parseChart('C G Am F\nla')), 'C');
});

// ---- practice weights ----
ok('weights favor misses and slow answers', () => {
  const fresh = S.weightFor(null);
  const solid = S.weightFor({ n: 10, right: 10, ms: 1200, last: true });
  const shaky = S.weightFor({ n: 10, right: 5, ms: 6000, last: false });
  assert.ok(shaky > fresh && fresh > solid);
  const s1 = S.record(null, true, 1500);
  assert.deepEqual(s1, { n: 1, right: 1, ms: 1500, last: true });
  const s2 = S.record(s1, false, 9000);
  assert.equal(s2.ms, 1500);
  assert.equal(s2.last, false);
});
ok('pick avoids the last item', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  for (let i = 0; i < 20; i++) assert.equal(S.pick(items, () => null, 'a').id, 'b');
  assert.equal(S.pick([{ id: 'a' }], () => null, 'a').id, 'a');
});

function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
console.log(`${n} checks passed`);
