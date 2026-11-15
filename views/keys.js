// Key signatures and the chords in a key: quizzes plus a reference you can tap to hear.

import {
  keysUpTo, MAJOR_BY_FIFTHS, MINOR_BY_FIFTHS, accidentalsLabel, diatonicChords, scaleNotes, parseKey, pretty, pcName,
} from '../theory.js';
import { ALL_KEY_IDS } from '../chart.js';
import { pick, record } from '../srs.js';
import { playChord, playSequence } from '../audio.js';
import * as store from '../store.js';
import { h, clear, card, hint, button, segmented, chips, choices, drawStaff, keyboard } from '../ui.js';

const DEFAULTS = { part: 'sig', range: '3', minor: false, dir: 'staff', chordDir: 'name', sevenths: false, refKey: 'C' };

export function mount(root) {
  const s = { ...DEFAULTS, ...store.get('keys.settings', {}) };
  const save = () => store.set('keys.settings', s);
  let stats = store.get('keys.stats', {});
  const stop = { fn: null };
  const body = h('div');
  const partSwitch = segmented([{ value: 'sig', label: 'Key signatures' }, { value: 'chords', label: 'Chords in a key' }], s.part, (v) => { s.part = v; save(); render(); });
  root.append(h('div', { class: 'top-switch' }, partSwitch), body);

  function render() {
    if (stop.fn) stop.fn();
    stop.fn = null;
    clear(body);
    (s.part === 'sig' ? signatures : chordsInKey)(body, stop);
  }

  // ---------- Key signatures ----------
  function signatures(box, stopRef) {
    let q = null;
    let startedAt = 0;
    let answered = false;
    let timer = null;
    stopRef.fn = () => clearTimeout(timer);

    const staffBox = h('div', { class: 'staff-box' });
    const prompt = h('p', { class: 'md-typescale-title-medium prompt' });
    const feedback = h('p', { class: 'feedback md-typescale-body-large', 'aria-live': 'polite' });
    const answerHost = h('div');
    const nextBtn = button('Next', () => next(), 'filled', { hidden: true });
    let ans = null;

    const maxAcc = Number(s.range);
    const pool = () => {
      const out = [];
      out.push(...keysUpTo(maxAcc, false).map((k) => ({ ...k, id: 'sig:' + k.id })));
      if (s.minor) out.push(...keysUpTo(maxAcc, true).map((k) => ({ ...k, id: 'sig:' + k.id })));
      return out;
    };

    function buildAnswers() {
      clear(answerHost);
      if (s.dir === 'staff') {
        const opts = (q.minor ? keysUpTo(maxAcc, true) : keysUpTo(maxAcc, false)).map((k) => ({ value: k.id, label: pretty(k.tonic) + (k.minor ? ' minor' : '') }));
        ans = choices(opts, pickAnswer, { cols: 3 });
      } else {
        const opts = [];
        for (let f = -maxAcc; f <= maxAcc; f++) opts.push({ value: String(f), label: accidentalsLabel(f) });
        ans = choices(opts, pickAnswer, { cols: 4 });
      }
      answerHost.append(ans.el);
    }

    function next() {
      clearTimeout(timer);
      const prev = q && q.id;
      q = pick(pool(), (i) => stats[i.id], prev);
      answered = false;
      startedAt = performance.now();
      const keyId = q.id.slice(4);
      if (s.dir === 'staff') {
        drawStaff(staffBox, { clef: Math.random() < 0.7 ? 'treble' : 'bass', keySig: keyId });
        prompt.textContent = q.minor ? 'Which minor key has this signature?' : 'Which major key has this signature?';
      } else {
        clear(staffBox);
        staffBox.append(h('div', { class: 'big-name md-typescale-display-small' }, pretty(q.tonic) + (q.minor ? ' minor' : ' major')));
        prompt.textContent = 'How many sharps or flats?';
      }
      feedback.textContent = '';
      feedback.className = 'feedback md-typescale-body-large';
      nextBtn.hidden = true;
      buildAnswers();
    }

    function pickAnswer(v) {
      if (answered) return;
      answered = true;
      const keyId = q.id.slice(4);
      const correctValue = s.dir === 'staff' ? keyId : String(q.fifths);
      const ok = v === correctValue;
      stats[q.id] = record(stats[q.id], ok, performance.now() - startedAt);
      store.set('keys.stats', stats);
      ans.show(correctValue, v);
      const label = `${pretty(q.tonic)}${q.minor ? ' minor' : ' major'}: ${accidentalsLabel(q.fifths) === '0' ? 'no sharps or flats' : accidentalsLabel(q.fifths)}`;
      feedback.textContent = (ok ? 'Correct. ' : 'Not quite. ') + label + '.';
      feedback.classList.add(ok ? 'good' : 'bad');
      if (ok) timer = setTimeout(next, 900); else nextBtn.hidden = false;
    }

    box.append(
      card('Name that key', staffBox, prompt, feedback, answerHost, h('div', { class: 'actions' }, nextBtn)),
      card('Settings',
        h('p', { class: 'label md-typescale-label-large' }, 'Question'),
        segmented([{ value: 'staff', label: 'See staff, name key' }, { value: 'count', label: 'See key, count marks' }], s.dir, (v) => { s.dir = v; save(); next(); }),
        h('p', { class: 'label md-typescale-label-large' }, 'Keys with up to'),
        segmented([{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }, { value: '7', label: 'All' }], s.range, (v) => { s.range = v; save(); render(); }),
        h('div', { class: 'gap' }),
        chips([{ value: 'minor', label: 'Include minor keys' }], s.minor ? ['minor'] : [], (vals) => { s.minor = vals.includes('minor'); save(); render(); }),
      ),
      card('Cheat sheet', cheatSheet()),
    );
    next();
  }

  function cheatSheet() {
    const rows = [];
    for (let f = -7; f <= 7; f++) {
      rows.push(h('tr', {},
        h('td', {}, accidentalsLabel(f)),
        h('td', {}, pretty(MAJOR_BY_FIFTHS[f])),
        h('td', {}, pretty(MINOR_BY_FIFTHS[f]) + 'm'),
      ));
    }
    return h('table', { class: 'sheet md-typescale-body-medium' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Marks'), h('th', {}, 'Major'), h('th', {}, 'Minor'))),
      h('tbody', {}, rows),
    );
  }

  // ---------- Chords in a key ----------
  function chordsInKey(box, stopRef) {
    const kbd = keyboard({ from: 48, to: 83, sound: false, keyWidth: 30 });
    const table = h('div', { class: 'chord-table' });
    let seq = null;

    stopRef.fn = () => { clearTimeout(timer); if (seq) seq.stop(); };
    let timer = null;

    const refSelect = h('md-outlined-select', { label: 'Key' });
    for (const id of ALL_KEY_IDS) {
      const k = parseKey(id);
      refSelect.append(h('md-select-option', { value: id, selected: id === s.refKey }, h('div', { slot: 'headline' }, pretty(k.tonic) + (k.minor ? ' minor' : ' major'))));
    }
    refSelect.addEventListener('change', () => { s.refKey = refSelect.value; save(); renderTable(); });

    function voice(c) {
      const root = c.pcs[0];
      const notes = [];
      const m = 48 + root;
      let last = m;
      notes.push(m);
      for (let i = 1; i < c.pcs.length; i++) {
        let n = last + 1;
        while (n % 12 !== c.pcs[i]) n++;
        notes.push(n);
        last = n;
      }
      return notes;
    }

    function renderTable() {
      clear(table);
      const chords = diatonicChords(s.refKey, s.sevenths);
      const scale = scaleNotes(s.refKey);
      table.append(h('p', { class: 'hint md-typescale-body-medium' }, 'Scale: ' + scale.map(pretty).join(' ')));
      chords.forEach((c) => {
        const row = h('button', { class: 'chord-row', type: 'button', onClick: () => {
          kbd.clearMarks();
          const notes = voice(c);
          kbd.mark(notes, 'on');
          playChord(notes, { dur: 1.4 });
        } },
          h('span', { class: 'roman md-typescale-title-medium' }, pretty(c.roman)),
          h('span', { class: 'cname md-typescale-title-medium' }, pretty(c.name)),
          h('span', { class: 'cnotes md-typescale-body-small' }, c.pcs.map((pc) => pretty(spell(c, pc))).join(' ')),
        );
        table.append(row);
      });
    }

    // Spell chord tones using the key's own note names when possible.
    function spell(c, pc) {
      const scale = scaleNotes(s.refKey);
      const hit = scale.find((n) => pcOf(n) === pc);
      if (hit) return hit;
      return pcName(pc, scale.some((n) => n.includes('b')));
    }
    const pcOf = (n) => { const m = /^([A-G])(#|b)?$/.exec(n); return ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12; };

    const playAll = button('Play the chords in order', () => {
      if (seq) seq.stop();
      const chords = diatonicChords(s.refKey, s.sevenths);
      seq = playSequence(chords.map((c) => ({ notes: voice(c), beats: 1 })), { beatSec: 0.7 });
    }, 'tonal');

    // Quiz
    let q = null;
    let startedAt = 0;
    let answered = false;
    const prompt = h('p', { class: 'md-typescale-title-medium prompt' });
    const feedback = h('p', { class: 'feedback md-typescale-body-large', 'aria-live': 'polite' });
    const answerHost = h('div');
    const nextBtn = button('Next', () => next(), 'filled', { hidden: true });
    let ans = null;

    const keyPool = () => keysUpTo(Number(s.range) > 5 ? 5 : Number(s.range), false).map((k) => k.id).concat(s.minor ? keysUpTo(Math.min(4, Number(s.range)), true).map((k) => k.id) : []);

    function next() {
      clearTimeout(timer);
      const prev = q && q.id;
      const items = [];
      for (let d = 0; d < 7; d++) items.push({ id: `chord:${s.chordDir}:${d}`, degree: d });
      const item = pick(items, (i) => stats[i.id], prev);
      const keyId = keyPool()[Math.floor(Math.random() * keyPool().length)];
      const chords = diatonicChords(keyId, s.sevenths);
      const c = chords[item.degree];
      q = { ...item, keyId, chords, c };
      answered = false;
      startedAt = performance.now();
      const k = parseKey(keyId);
      const keyLabel = pretty(k.tonic) + (k.minor ? ' minor' : ' major');
      if (s.chordDir === 'name') {
        prompt.textContent = `In ${keyLabel}, what is the ${pretty(c.roman)} chord?`;
        ans = choices(chords.map((x) => ({ value: x.name, label: pretty(x.name) })), pickAnswer, { cols: 4 });
      } else {
        prompt.textContent = `In ${keyLabel}, ${pretty(c.name)} is which chord?`;
        ans = choices(chords.map((x) => ({ value: x.roman, label: pretty(x.roman) })), pickAnswer, { cols: 4 });
      }
      clear(answerHost);
      answerHost.append(ans.el);
      feedback.textContent = '';
      feedback.className = 'feedback md-typescale-body-large';
      nextBtn.hidden = true;
    }

    function pickAnswer(v) {
      if (answered) return;
      answered = true;
      const correct = s.chordDir === 'name' ? q.c.name : q.c.roman;
      const ok = v === correct;
      stats[q.id] = record(stats[q.id], ok, performance.now() - startedAt);
      store.set('keys.stats', stats);
      ans.show(correct, v);
      feedback.textContent = (ok ? 'Correct. ' : 'Not quite. ') + `${pretty(q.c.roman)} is ${pretty(q.c.name)}.`;
      feedback.classList.add(ok ? 'good' : 'bad');
      playChord(voice(q.c), { dur: 1.2 });
      if (ok) timer = setTimeout(next, 1100); else nextBtn.hidden = false;
    }

    box.append(
      card('Quiz: chords in a key', prompt, feedback, answerHost, h('div', { class: 'actions' }, nextBtn)),
      card('Settings',
        h('p', { class: 'label md-typescale-label-large' }, 'Question'),
        segmented([{ value: 'name', label: 'Number to chord' }, { value: 'roman', label: 'Chord to number' }], s.chordDir, (v) => { s.chordDir = v; save(); next(); }),
        h('div', { class: 'gap' }),
        chips([{ value: 'sevenths', label: '7th chords' }, { value: 'minor', label: 'Include minor keys' }], [s.sevenths ? 'sevenths' : null, s.minor ? 'minor' : null].filter(Boolean), (vals) => {
          s.sevenths = vals.includes('sevenths'); s.minor = vals.includes('minor'); save(); renderTable(); next();
        }),
        hint('Keys follow the "keys with up to" setting on the Key signatures screen.'),
      ),
      card('Chords in a key', refSelect, table, h('div', { class: 'actions' }, playAll), kbd.el, hint('Tap a chord to hear it and see its notes.')),
    );
    renderTable();
    next();
  }

  render();
  return () => { if (stop.fn) stop.fn(); };
}
