// Parsing chord charts pasted from sites like Ultimate Guitar. Pure functions, no DOM.
// A chart is plain text: an optional URL first, [Section] headers, chord lines above lyric lines.

import { LETTER_PC, parseKey, scaleNotes, notePc } from './theory.js';

const CHORD_RE = /^[A-G](?:#|b)?(?:maj|min|dim|aug|sus|add|m|M|\+|\u00B0|\u00F8|-|[0-9]|#|b|\(|\)|,|\/[A-G](?:#|b)?)*$/;
const FILLER_RE = /^(?:\||\|\||x\d+|\(x\d+\)|N\.?C\.?|%|-|\/|\.\.\.)$/i;

export const isChordToken = (t) => CHORD_RE.test(t);

export function tokenize(line) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) out.push({ text: m[0], col: m.index });
  return out;
}

export function isChordLine(line) {
  const toks = tokenize(line);
  if (!toks.length) return false;
  let chords = 0;
  for (const t of toks) {
    if (CHORD_RE.test(t.text)) chords++;
    else if (!FILLER_RE.test(t.text)) return false;
  }
  return chords > 0;
}

/** Split a pasted chart into lines with a type: url, section, chords, lyric or blank. */
export function parseChart(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  let url = '';
  if (raw.length && /^https?:\/\/\S+$/.test(raw[0].trim())) url = raw.shift().trim();
  const lines = [];
  for (const l of raw) {
    if (!l.trim()) {
      if (lines.length && lines[lines.length - 1].type !== 'blank') lines.push({ type: 'blank', text: '' });
    } else if (/^\s*\[[^\]]+\]\s*$/.test(l)) {
      lines.push({ type: 'section', text: l.trim() });
    } else if (isChordLine(l)) {
      lines.push({ type: 'chords', text: l, tokens: tokenize(l) });
    } else {
      lines.push({ type: 'lyric', text: l });
    }
  }
  while (lines.length && lines[lines.length - 1].type === 'blank') lines.pop();
  while (lines.length && lines[0].type === 'blank') lines.shift();
  return { url, lines };
}

/** A guess at the title and artist from an Ultimate Guitar style URL. */
export function guessFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length < 3) return { title: '', artist: '' };
    const artist = parts[parts.length - 2];
    const title = parts[parts.length - 1]
      .replace(/-\d+$/, '')
      .replace(/-(chords|tabs|tab|ukulele-chords|ukulele|bass-tabs|bass|official|pro|power)$/, '');
    const nice = (s) => s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return { title: nice(title), artist: nice(artist) };
  } catch {
    return { title: '', artist: '' };
  }
}

// ---- Chords ----

/** Break a chord symbol into root, quality, extension and optional bass note. */
export function parseChord(tok) {
  const m = /^([A-G])(#|b)?(.*?)(?:\/([A-G])(#|b)?)?$/.exec(tok);
  if (!m) return null;
  const rootPc = (LETTER_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const bassPc = m[4] ? (LETTER_PC[m[4]] + (m[5] === '#' ? 1 : m[5] === 'b' ? -1 : 0) + 12) % 12 : null;
  const rest = m[3] || '';
  let quality = 'maj';
  let ext = rest;
  if (/^(min|m(?!aj))/.test(rest)) { quality = 'min'; ext = rest.replace(/^(min|m)/, ''); }
  else if (/^(dim|\u00B0)/.test(rest)) { quality = 'dim'; ext = rest.replace(/^(dim|\u00B0)/, ''); }
  else if (/^(aug|\+)/.test(rest)) { quality = 'aug'; ext = rest.replace(/^(aug|\+)/, ''); }
  else if (rest.startsWith('-')) { quality = 'min'; ext = rest.slice(1); }
  else if (rest.startsWith('\u00F8')) { quality = 'min'; ext = rest; }
  return { rootPc, quality, ext, bassPc };
}

const NUMERALS_MAJOR = ['I', '\u266DII', 'II', '\u266DIII', 'III', 'IV', '\u266FIV', 'V', '\u266DVI', 'VI', '\u266DVII', 'VII'];
const NUMERALS_MINOR = ['I', '\u266DII', 'II', 'III', '\u266FIII', 'IV', '\u266DV', 'V', 'VI', '\u266FVI', 'VII', '\u266FVII'];
const BASS_DEGREES = ['1', '\u266D2', '2', '\u266D3', '3', '4', '\u266D5', '5', '\u266D6', '6', '\u266D7', '7'];

/** A chord symbol as a Roman numeral in the given key id (such as 'D' or 'Bm'). Returns the input if it is not a chord. */
export function toNumeral(tok, keyId) {
  const c = parseChord(tok);
  if (!c) return tok;
  const k = parseKey(keyId);
  const semi = (c.rootPc - k.pc + 12) % 12;
  let base = (k.minor ? NUMERALS_MINOR : NUMERALS_MAJOR)[semi];
  const m = /^([\u266D\u266F]?)([IV]+)$/.exec(base);
  const lower = c.quality === 'min' || c.quality === 'dim';
  let out = m[1] + (lower ? m[2].toLowerCase() : m[2]);
  if (c.quality === 'dim') out += '\u00B0';
  if (c.quality === 'aug') out += '+';
  out += c.ext;
  if (c.bassPc !== null) out += '/' + BASS_DEGREES[(c.bassPc - k.pc + 12) % 12];
  return out;
}

/**
 * Rebuild a chord line with each chord replaced by fn(chord), keeping the original columns
 * where there is room. Returns segments: [{ t, chord }].
 */
export function convertLine(tokens, fn) {
  const segs = [];
  let len = 0;
  for (const t of tokens) {
    const isChord = isChordToken(t.text);
    const text = isChord ? fn(t.text) : t.text;
    const col = Math.max(t.col, len ? len + 1 : 0);
    if (col > len) segs.push({ t: ' '.repeat(col - len), chord: false });
    segs.push({ t: text, chord: isChord });
    len = col + text.length;
  }
  return segs;
}

// ---- Key guess ----

function diatonicSet(keyId) {
  const k = parseKey(keyId);
  const notes = scaleNotes(keyId).map(notePc);
  const q = k.minor ? ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'] : ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
  return notes.map((pc, i) => ({ pc, q: q[i] }));
}

export const MAJOR_TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const MINOR_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
export const ALL_KEY_IDS = [...MAJOR_TONICS, ...MINOR_TONICS.map((t) => t + 'm')];

/** Best guess of the key from the chords in a parsed chart. The user can correct it. */
export function detectKey(parsed) {
  const chords = [];
  for (const l of parsed.lines) if (l.type === 'chords') for (const t of l.tokens) if (isChordToken(t.text)) chords.push(parseChord(t.text));
  if (!chords.length) return null;
  let best = null;
  for (const id of ALL_KEY_IDS) {
    {
      const minor = id.endsWith('m');
      const set = diatonicSet(id);
      let score = 0;
      for (const c of chords) {
        const hit = set.some((d) => d.pc === c.rootPc && d.q === c.quality);
        score += hit ? 2 : -1;
      }
      const home = set[0];
      const isHome = (c) => c.rootPc === home.pc && c.quality === home.q;
      if (isHome(chords[0])) score += 1.5;
      if (isHome(chords[chords.length - 1])) score += 1;
      if (!minor) score += 0.1; // relative major and minor share chords; lean major
      if (!best || score > best.score) best = { id, score };
    }
  }
  return best.id;
}
