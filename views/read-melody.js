// Sight reading: a short made-up melody in a random key. Play each note in order, on a MIDI keyboard or
// the keys on screen. A wrong note doesn't move you on; a new melody comes up when you finish.

import { keysUpTo, parseKey, stepName, pretty } from '../theory.js';
import { makeMelody } from '../reading.js';
import { record } from '../srs.js';
import { onNote } from '../midi.js';
import * as store from '../store.js';
import { h, card, hint, button, segmented, drawStaff, keyboard, midiHint } from '../ui.js';

const DEFAULTS = { clef: 'treble', length: '8', range: '2' };

export function mount(root) {
  const s = { ...DEFAULTS, ...store.get('read.melody', {}) };
  const save = () => store.set('read.melody', s);
  // Each note counts toward the note-reading stats, so melodies feed "My weak spots" too.
  const noteStats = store.get('notes.stats', {});
  let mel = null;
  let idx = 0;
  let mistakes = 0;
  let firstTry = true;
  let wrongAt = -1;
  let done = false;
  let noteStart = 0;
  let timer = null;
  let kb = null;

  const staffBox = h('div', { class: 'staff-box melody' });
  const status = h('p', { class: 'md-typescale-title-medium prompt' });
  const feedback = h('p', { class: 'feedback md-typescale-body-large', 'aria-live': 'polite' });
  const kbHost = h('div');

  function draw() {
    const notes = mel.notes.map((n, i) => ({
      steps: [n.step],
      duration: 'q',
      color: i < idx ? 'done' : i === idx && !done ? (wrongAt === i ? 'wrong' : 'current') : null,
    }));
    const rows = [];
    for (let i = 0; i < notes.length; i += 4) rows.push(notes.slice(i, i + 4));
    drawStaff(staffBox, { clef: s.clef, keySig: mel.keyId, rows, width: 300 });
  }

  function showStatus() {
    const k = parseKey(mel.keyId);
    const where = done ? 'done' : `note ${idx + 1} of ${mel.notes.length}`;
    status.textContent = `${pretty(k.tonic)} major \u00B7 ${where} \u00B7 ${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`;
  }

  function buildKeyboard() {
    const bass = s.clef === 'bass';
    kb = keyboard({ from: bass ? 33 : 48, to: bass ? 69 : 86, sound: true, keyWidth: 30, onKey: input });
    kbHost.replaceChildren(kb.el);
  }

  function next() {
    clearTimeout(timer);
    const keys = keysUpTo(Number(s.range), false);
    const keyId = keys[Math.floor(Math.random() * keys.length)].id;
    mel = makeMelody({ clef: s.clef, keyId, length: Number(s.length) });
    idx = 0;
    mistakes = 0;
    firstTry = true;
    wrongAt = -1;
    done = false;
    noteStart = performance.now();
    feedback.textContent = '';
    feedback.className = 'feedback md-typescale-body-large';
    draw();
    showStatus();
    requestAnimationFrame(() => {
      // Center the keys on the melody's range, so every note is usually in view without pointing at the next one.
      const ms = mel.notes.map((n) => n.midi);
      if (kb) kb.scrollTo(Math.round((Math.min(...ms) + Math.max(...ms)) / 2));
    });
  }

  function input(m) {
    if (!mel || done) return;
    const target = mel.notes[idx];
    if (m === target.midi) {
      const id = `${s.clef}:${stepName(target.step)}`;
      noteStats[id] = record(noteStats[id], firstTry, performance.now() - noteStart);
      store.set('notes.stats', noteStats);
      kb.flash([m], 'good');
      idx++;
      firstTry = true;
      wrongAt = -1;
      noteStart = performance.now();
      if (idx === mel.notes.length) {
        done = true;
        feedback.textContent = mistakes ? `Done, with ${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}.` : 'Done, with no mistakes.';
        feedback.classList.add('good');
        timer = setTimeout(next, 1800);
      }
    } else {
      mistakes++;
      firstTry = false;
      wrongAt = idx;
      kb.flash([m], 'bad', 450);
      const at = idx;
      setTimeout(() => { if (wrongAt === at && idx === at) { wrongAt = -1; draw(); } }, 450);
    }
    draw();
    showStatus();
  }

  const offNote = onNote((ev) => { if (ev.type === 'on') input(ev.midi); });

  buildKeyboard();
  root.append(
    card('Play the melody', staffBox, status, feedback, kbHost,
      h('div', { class: 'actions' }, button('New melody', next, 'tonal')),
      hint('Play each note in order. The note to play is colored, and a wrong note turns red without moving you on.'),
      midiHint('Your MIDI keyboard works here.')),
    card('Practice settings',
      h('p', { class: 'label md-typescale-label-large' }, 'Clef'),
      segmented([{ value: 'treble', label: 'Treble' }, { value: 'bass', label: 'Bass' }], s.clef, (v) => { s.clef = v; save(); buildKeyboard(); next(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Length'),
      segmented([{ value: '4', label: '4 notes' }, { value: '8', label: '8 notes' }], s.length, (v) => { s.length = v; save(); next(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Sharps or flats in the key, up to'),
      segmented([{ value: '0', label: 'None' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }], s.range, (v) => { s.range = v; save(); next(); }),
    ),
  );
  next();
  return () => { clearTimeout(timer); offNote(); };
}
