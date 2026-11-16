// Sight reading: a short made-up tune in a random key, with quarter and half notes plus optional 8th notes,
// rests and triplets. Two modes:
// - Check my notes: play each note in order on a MIDI keyboard or the keys on screen. Timing isn't checked.
//   A wrong note doesn't move you on, and a new tune comes up when you finish.
// - Just practice: nothing is checked or saved. The tune stays until you ask for a new one.

import { keysUpTo, parseKey, stepName, pretty } from '../theory.js';
import { makeSightReading } from '../reading.js';
import { record } from '../srs.js';
import { onNote } from '../midi.js';
import * as store from '../store.js';
import { h, card, hint, button, segmented, chips, drawStaff, keyboard, midiHint } from '../ui.js';

const DEFAULTS = { clef: 'treble', bars: '2', range: '2', mode: 'quiz', eighths: true, rests: true, triplets: true };

export function mount(root) {
  const saved = store.get('read.melody', {});
  // Version 5 set the length in notes (4 or 8) instead of bars.
  if (!saved.bars && saved.length) saved.bars = saved.length === '4' ? '1' : '2';
  const s = { ...DEFAULTS, ...saved };
  delete s.length;
  const save = () => store.set('read.melody', s);
  // In "Check my notes", each note counts toward the note-reading stats, so tunes feed "My weak spots" too.
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
  const modeHint = hint('');
  const quiz = () => s.mode === 'quiz';

  function draw() {
    const rows = mel.bars.map((bar) => bar.map((e) => ({
      rest: e.rest,
      steps: e.rest ? [] : [mel.notes[e.note].step],
      duration: e.dur,
      beam: e.beam,
      tuplet: e.tuplet,
      // Only the note to play (and a wrong try) is colored. Notes already played stay black.
      color: quiz() && !done && e.note === idx ? (wrongAt === idx ? 'wrong' : 'current') : null,
    })));
    drawStaff(staffBox, { clef: s.clef, keySig: mel.keyId, rows, width: 340, timeSig: '4/4', endBar: true });
  }

  function showStatus() {
    const key = pretty(parseKey(mel.keyId).tonic) + ' major';
    if (!quiz()) { status.textContent = key; return; }
    const where = done ? 'done' : `note ${idx + 1} of ${mel.notes.length}`;
    status.textContent = `${key} \u00B7 ${where} \u00B7 ${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}`;
  }

  function showModeHint() {
    modeHint.textContent = quiz()
      ? 'Play each note in order. Timing isn\'t checked. The note to play is blue, and a wrong note turns red without moving you on.'
      : 'Nothing is checked or saved. Play it as many times as you like, then tap New melody.';
  }

  function buildKeyboard() {
    const bass = s.clef === 'bass';
    kb = keyboard({ from: bass ? 33 : 48, to: bass ? 69 : 86, sound: true, keyWidth: 30, onKey: input });
    kbHost.replaceChildren(kb.el);
  }

  // Start the current tune again from the first note (used when switching modes).
  function restart() {
    clearTimeout(timer);
    idx = 0;
    mistakes = 0;
    firstTry = true;
    wrongAt = -1;
    done = false;
    noteStart = performance.now();
    feedback.textContent = '';
    feedback.className = 'feedback md-typescale-body-large';
    showModeHint();
    draw();
    showStatus();
  }

  function next() {
    const keys = keysUpTo(Number(s.range), false);
    const keyId = keys[Math.floor(Math.random() * keys.length)].id;
    mel = makeSightReading({ clef: s.clef, keyId, bars: Number(s.bars), eighths: s.eighths, rests: s.rests, triplets: s.triplets });
    restart();
    requestAnimationFrame(() => {
      // Center the keys on the tune's range, so every note is usually in view without pointing at the next one.
      const ms = mel.notes.map((n) => n.midi);
      if (kb) kb.scrollTo(Math.round((Math.min(...ms) + Math.max(...ms)) / 2));
    });
  }

  function input(m) {
    if (!mel || done || !quiz()) return;
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
      modeHint,
      midiHint('Your MIDI keyboard works here.')),
    card('Practice settings',
      h('p', { class: 'label md-typescale-label-large' }, 'Mode'),
      segmented([{ value: 'quiz', label: 'Check my notes' }, { value: 'free', label: 'Just practice' }], s.mode, (v) => { s.mode = v; save(); restart(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Clef'),
      segmented([{ value: 'treble', label: 'Treble' }, { value: 'bass', label: 'Bass' }], s.clef, (v) => { s.clef = v; save(); buildKeyboard(); next(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Length'),
      segmented([{ value: '1', label: '1 bar' }, { value: '2', label: '2 bars' }, { value: '4', label: '4 bars' }], s.bars, (v) => { s.bars = v; save(); next(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Rhythms'),
      chips([{ value: 'eighths', label: '8th notes' }, { value: 'rests', label: 'Rests' }, { value: 'triplets', label: 'Triplets' }],
        ['eighths', 'rests', 'triplets'].filter((k) => s[k]),
        (v) => { s.eighths = v.includes('eighths'); s.rests = v.includes('rests'); s.triplets = v.includes('triplets'); save(); next(); }),
      hint('Quarter and half notes are always included.'),
      h('p', { class: 'label md-typescale-label-large' }, 'Sharps or flats in the key, up to'),
      segmented([{ value: '0', label: 'None' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }], s.range, (v) => { s.range = v; save(); next(); }),
    ),
  );
  next();
  return () => { clearTimeout(timer); offNote(); };
}
