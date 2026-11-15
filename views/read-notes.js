// Note reading flashcards for treble and bass clef, weighted toward the notes you miss.
// Answer by tapping a letter, tapping the key, or playing the note on a MIDI keyboard.

import { clefNotes, stepMidi, stepName, stepNote, LETTERS } from '../theory.js';
import { pick, record, weightFor, accuracy } from '../srs.js';
import { playNote } from '../audio.js';
import { onNote, devices } from '../midi.js';
import * as store from '../store.js';
import { h, clear, card, hint, button, segmented, chips, drawStaff, keyboard, midiHint, releaseFocus } from '../ui.js';

const DEFAULTS = { clef: 'both', zone: 'all', mode: 'name', sound: true };
const NATURAL = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

export function mount(root) {
  const settings = { ...DEFAULTS, ...store.get('notes.settings', {}) };
  let stats = store.get('notes.stats', {});
  const today = { right: 0, total: 0, streak: 0 };
  let q = null;
  let startedAt = 0;
  let answered = false;
  let missed = false; // answered wrong, waiting for Next or the right note
  let timer = null;
  let kb = null;

  const staffBox = h('div', { class: 'staff-box' });
  const prompt = h('p', { class: 'md-typescale-title-medium prompt' });
  const feedback = h('p', { class: 'feedback md-typescale-body-large', 'aria-live': 'polite' });
  const answerBox = h('div', { class: 'answer-box' });
  const nextBtn = button('Next note', () => nextQuestion(), 'filled', { hidden: true });
  const scoreLine = h('p', { class: 'hint md-typescale-body-small' });
  const progressBox = h('div');

  const pool = () => {
    const clefs = settings.clef === 'both' ? ['treble', 'bass'] : [settings.clef];
    let items = clefs.flatMap(clefNotes);
    if (settings.zone === 'ledger') items = items.filter((i) => i.zone !== 'staff');
    if (settings.zone === 'weak') {
      const weak = items.filter((i) => stats[i.id] && weightFor(stats[i.id]) > 1.1);
      if (weak.length >= 3) items = weak;
    }
    return items;
  };

  function nextQuestion() {
    clearTimeout(timer);
    releaseFocus(answerBox);
    q = pick(pool(), (i) => stats[i.id], q && q.id);
    answered = false;
    missed = false;
    startedAt = performance.now();
    drawStaff(staffBox, { clef: q.clef, step: q.step });
    prompt.textContent = settings.mode === 'name' ? 'Which note is this?' : 'Tap this note on the keyboard';
    feedback.textContent = '';
    feedback.className = 'feedback md-typescale-body-large';
    nextBtn.hidden = true;
    if (kb) kb.clearMarks();
    answerBox.querySelectorAll('.letter').forEach((b) => b.removeAttribute('data-state'));
  }

  // given: the letter that was chosen, if any. playedRight: the right key was played, so it was already heard.
  function finish(correct, given, { prefix = '', playedRight = false } = {}) {
    if (answered) return;
    answered = true;
    missed = !correct;
    const ms = performance.now() - startedAt;
    stats[q.id] = record(stats[q.id], correct, ms);
    store.set('notes.stats', stats);
    today.total++;
    if (correct) { today.right++; today.streak++; } else today.streak = 0;
    const where = q.zone === 'staff' ? '' : q.zone === 'above' ? ' (above the staff)' : ' (below the staff)';
    if (correct) {
      feedback.textContent = 'Correct. ' + stepName(q.step) + where;
      feedback.classList.add('good');
    } else {
      feedback.textContent = prefix + 'That note is ' + stepName(q.step) + where + '.' + (devices().length ? ' Play it to go on.' : '');
      feedback.classList.add('bad');
    }
    if (settings.sound && !playedRight) playNote(stepMidi(q.step), { dur: 1 });
    if (kb) kb.mark([stepMidi(q.step)], 'good');
    answerBox.querySelectorAll('.letter').forEach((b) => {
      if (b.dataset.letter === stepNote(q.step).letter) b.dataset.state = 'good';
      else if (!correct && b.dataset.letter === given) b.dataset.state = 'bad';
    });
    renderScore();
    renderProgress();
    if (correct) timer = setTimeout(nextQuestion, 750);
    else nextBtn.hidden = false;
  }

  // A MIDI keyboard answers in either mode. The octave has to match, since that is what the staff shows.
  const offNote = onNote((ev) => {
    if (ev.type !== 'on' || !q) return;
    const target = stepMidi(q.step);
    if (answered) {
      if (missed && ev.midi === target) nextQuestion();
      return;
    }
    if (ev.midi === target) { finish(true, null, { playedRight: true }); return; }
    if (kb) kb.mark([ev.midi], 'bad');
    const sameName = (ev.midi - target) % 12 === 0;
    finish(false, NATURAL[((ev.midi % 12) + 12) % 12] || null, { prefix: sameName ? 'Right note name, wrong octave. ' : '' });
  });

  function renderScore() {
    scoreLine.textContent = today.total
      ? `This visit: ${today.right} of ${today.total} right. Streak ${today.streak}.`
      : 'Answers are saved on this phone, and weak notes come up more often.';
  }

  function renderAnswers() {
    clear(answerBox);
    kb = null;
    if (settings.mode === 'name') {
      const grid = h('div', { class: 'letters' });
      for (const L of LETTERS) {
        const b = h('md-filled-tonal-button', { class: 'letter', dataset: { letter: L }, onClick: () => { if (!answered) finish(stepNote(q.step).letter === L, L); } }, L);
        grid.append(b);
      }
      answerBox.append(grid);
    } else {
      kb = keyboard({ from: 33, to: 88, sound: false, onKey: (m) => {
        if (answered) return;
        const target = stepMidi(q.step);
        if (m === target) finish(true, null);
        else { kb.mark([m], 'bad'); finish(false, null); }
      } });
      answerBox.append(kb.el, hint('Scroll sideways for higher and lower keys. Middle C is labelled C4.'));
      requestAnimationFrame(() => kb.scrollTo(60));
    }
  }

  function renderProgress() {
    clear(progressBox);
    const rows = pool()
      .map((i) => ({ i, s: stats[i.id] }))
      .filter((x) => x.s && x.s.n >= 2 && accuracy(x.s) < 0.9)
      .sort((a, b) => accuracy(a.s) - accuracy(b.s))
      .slice(0, 8);
    if (!rows.length) {
      progressBox.append(hint('Nothing is a trouble spot yet. Notes you miss twice or more show up here.'));
    } else {
      const wrap = h('div', { class: 'trouble' });
      for (const { i, s } of rows) {
        wrap.append(h('span', { class: 'pill' }, `${i.clef === 'treble' ? 'G' : 'F'} clef ${stepName(i.step)} \u00B7 ${Math.round(accuracy(s) * 100)}%`));
      }
      progressBox.append(wrap);
    }
    const seen = Object.keys(stats).length;
    progressBox.append(h('div', { class: 'actions' },
      h('span', { class: 'md-typescale-body-small hint' }, `${seen} notes practiced so far.`),
      button('Reset note stats', () => {
        if (confirm('Clear all saved note practice stats?')) { stats = {}; store.set('notes.stats', stats); renderProgress(); }
      }, 'text'),
    ));
  }

  const save = () => store.set('notes.settings', settings);

  root.append(
    card('Read the note', staffBox, prompt, feedback, answerBox, h('div', { class: 'actions' }, nextBtn), scoreLine,
      midiHint('You can also play the note on your keyboard, in the octave shown.')),
    card('Practice settings',
      h('p', { class: 'label md-typescale-label-large' }, 'Clef'),
      segmented([{ value: 'treble', label: 'Treble' }, { value: 'bass', label: 'Bass' }, { value: 'both', label: 'Both' }], settings.clef, (v) => { settings.clef = v; save(); nextQuestion(); renderProgress(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'Which notes'),
      segmented([{ value: 'all', label: 'All' }, { value: 'ledger', label: 'Ledger lines' }, { value: 'weak', label: 'My weak spots' }], settings.zone, (v) => { settings.zone = v; save(); nextQuestion(); }),
      h('p', { class: 'label md-typescale-label-large' }, 'How to answer'),
      segmented([{ value: 'name', label: 'Name it' }, { value: 'play', label: 'Find the key' }], settings.mode, (v) => { settings.mode = v; save(); renderAnswers(); nextQuestion(); }),
      h('div', { class: 'gap' }),
      chips([{ value: 'sound', label: 'Play the note after I answer' }], settings.sound ? ['sound'] : [], (vals) => { settings.sound = vals.includes('sound'); save(); }),
    ),
    card('Trouble spots', progressBox),
  );

  renderAnswers();
  renderScore();
  renderProgress();
  nextQuestion();
  return () => { clearTimeout(timer); offNote(); };
}
