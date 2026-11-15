// Ear training: intervals, chord qualities, chords in a key, and chord progressions.

import {
  INTERVALS, CHORD_TYPES, NUMERAL_CHORDS, PROGRESSIONS, numeralPcs, voiceChord, pretty, noteName,
} from '../theory.js';
import { pick, record } from '../srs.js';
import { playSequence } from '../audio.js';
import * as store from '../store.js';
import { h, clear, card, hint, button, segmented, chips, choices, keyboard } from '../ui.js';

const QUALITIES = ['maj', 'min', 'dim', 'aug', 'dom7', 'maj7', 'min7', 'hdim7'];
const DEFAULTS = {
  mode: 'interval',
  chordKind: 'quality',
  direction: 'up',
  cadence: true,
  enabled: {
    interval: ['M2', 'M3', 'P4', 'P5', 'P8'],
    quality: ['maj', 'min', 'dom7'],
    inkey: ['I', 'ii', 'IV', 'V', 'vi'],
    prog: ['I-IV', 'I-V', 'I-IV-V', 'I-V-vi-IV', 'ii-V-I', 'I-vi-IV-V'],
  },
};

const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

export function mount(root) {
  const saved = store.get('ear.settings', {});
  const s = { ...DEFAULTS, ...saved, enabled: { ...DEFAULTS.enabled, ...(saved.enabled || {}) } };
  const save = () => store.set('ear.settings', s);
  let stats = store.get('ear.stats', {});
  let current = null; // the playing sequence
  let timer = null;
  let q = null;
  let answered = false;
  let startedAt = 0;
  let autoplay = false;
  let ans = null;

  const body = h('div');
  root.append(body);

  const stopAudio = () => { if (current) current.stop(); current = null; };

  function render() {
    stopAudio();
    clearTimeout(timer);
    clear(body);
    const kind = s.mode === 'chord' ? (s.chordKind === 'inkey' ? 'inkey' : 'quality') : s.mode;
    const modeSwitch = segmented([
      { value: 'interval', label: 'Intervals' }, { value: 'chord', label: 'Chords' }, { value: 'prog', label: 'Progressions' },
    ], s.mode, (v) => { s.mode = v; save(); render(); });

    const kb = keyboard({ from: 48, to: 83, sound: false, keyWidth: 30 });
    const prompt = h('p', { class: 'md-typescale-title-medium prompt' });
    const feedback = h('p', { class: 'feedback md-typescale-body-large', 'aria-live': 'polite' });
    const answerHost = h('div');
    const extra = h('p', { class: 'hint md-typescale-body-medium' });
    const playBtn = button('Play', () => { autoplay = true; playQuestion(); }, 'filled');
    const nextBtn = button('Next', () => next(), 'tonal', { hidden: true });
    const showKb = kind === 'interval' || kind === 'quality';

    const items = () => {
      if (kind === 'interval') return INTERVALS.filter((i) => s.enabled.interval.includes(i.short)).map((i) => ({ id: 'ear:interval:' + i.short, ...i }));
      if (kind === 'quality') return QUALITIES.filter((t) => s.enabled.quality.includes(t)).map((t) => ({ id: 'ear:quality:' + t, type: t }));
      if (kind === 'inkey') return NUMERAL_CHORDS.filter((c) => s.enabled.inkey.includes(c.id)).map((c) => ({ ...c, id: 'ear:inkey:' + c.id, numeral: c.id }));
      return PROGRESSIONS.filter((p) => s.enabled.prog.includes(p.id)).map((p) => ({ ...p, id: 'ear:prog:' + p.id }));
    };

    // Build what to play for the current question as a list of steps.
    function stepsFor(item, ctx) {
      if (kind === 'interval') {
        const root = ctx.root;
        const top = root + item.semi;
        if (s.direction === 'harm') return [{ notes: [root, top], beats: 2 }];
        return s.direction === 'down'
          ? [{ notes: [top], beats: 1 }, { notes: [root], beats: 1.6 }]
          : [{ notes: [root], beats: 1 }, { notes: [top], beats: 1.6 }];
      }
      if (kind === 'quality') {
        return [{ notes: ctx.notes, beats: 2 }];
      }
      const cadence = [];
      if (s.cadence) {
        let prev = null;
        for (const n of ['I', 'IV', 'V', 'I']) {
          const v = voiceChord(numeralPcs(n, ctx.tonic), prev);
          prev = v.upper;
          cadence.push({ notes: [v.bass, ...v.upper], beats: 0.8 });
        }
        cadence.push({ notes: [], beats: 0.5 });
      }
      if (kind === 'inkey') {
        const v = voiceChord(numeralPcs(item.numeral, ctx.tonic), null);
        return [...cadence, { notes: [v.bass, ...v.upper], beats: 2 }];
      }
      let prev = null;
      const chords = item.numerals.map((n) => {
        const v = voiceChord(numeralPcs(n, ctx.tonic), prev);
        prev = v.upper;
        return { notes: [v.bass, ...v.upper], beats: 1.2 };
      });
      return [...cadence, ...chords];
    }

    function playQuestion() {
      stopAudio();
      current = playSequence(q.steps, { beatSec: 0.55, vel: 0.45 });
    }

    function next() {
      clearTimeout(timer);
      stopAudio();
      const pool = items();
      if (!pool.length) {
        prompt.textContent = 'Pick at least one thing to practice below.';
        clear(answerHost);
        return;
      }
      const item = pick(pool, (i) => stats[i.id], q && q.item.id);
      const ctx = { tonic: Math.floor(Math.random() * 12), root: 48 + Math.floor(Math.random() * 14) };
      if (kind === 'quality') {
        const iv = CHORD_TYPES[item.type].iv;
        const r = 48 + Math.floor(Math.random() * 12);
        ctx.notes = iv.map((x) => r + x);
      }
      q = { item, ctx, steps: stepsFor(item, ctx) };
      answered = false;
      startedAt = performance.now();
      kb.clearMarks();
      feedback.textContent = '';
      feedback.className = 'feedback md-typescale-body-large';
      extra.textContent = '';
      nextBtn.hidden = true;

      let opts;
      if (kind === 'interval') {
        opts = pool.map((i) => ({ value: i.short, label: i.name }));
        prompt.textContent = 'What interval do you hear?';
      } else if (kind === 'quality') {
        opts = pool.map((i) => ({ value: i.type, label: capitalize(CHORD_TYPES[i.type].label) }));
        prompt.textContent = 'What kind of chord is it?';
      } else if (kind === 'inkey') {
        opts = pool.map((c) => ({ value: c.numeral, label: pretty(c.numeral) }));
        prompt.textContent = s.cadence ? 'Which chord comes after the cadence?' : 'Which chord is this, in the key of the first sound you hear?';
      } else {
        const wrong = shuffle(pool.filter((p) => p.id !== item.id)).slice(0, 5);
        opts = shuffle([item, ...wrong]).map((p) => ({ value: p.id, label: pretty(p.label) }));
        prompt.textContent = 'Which progression is it?';
      }
      const cols = kind === 'interval' || kind === 'quality' ? 2 : kind === 'inkey' ? 4 : 1;
      ans = choices(opts, onPick, { cols });
      clear(answerHost);
      answerHost.append(ans.el);
      if (autoplay) playQuestion();
    }

    function onPick(v) {
      if (answered) return;
      answered = true;
      const correctVal = kind === 'interval' ? q.item.short : kind === 'quality' ? q.item.type : kind === 'inkey' ? q.item.numeral : q.item.id;
      const ok = v === correctVal;
      stats[q.item.id] = record(stats[q.item.id], ok, performance.now() - startedAt);
      store.set('ear.stats', stats);
      ans.show(correctVal, v);
      let name = '';
      if (kind === 'interval') {
        name = q.item.name;
        extra.textContent = `Think of: ${q.item.hint}.`;
        kb.mark([q.ctx.root, q.ctx.root + q.item.semi], 'good');
        kb.scrollTo(q.ctx.root);
        const notes = s.direction === 'down' ? [q.ctx.root + q.item.semi, q.ctx.root] : [q.ctx.root, q.ctx.root + q.item.semi];
        name += ` (${notes.map((m) => pretty(noteName(m))).join(' to ')})`;
      } else if (kind === 'quality') {
        name = capitalize(CHORD_TYPES[q.item.type].label);
        kb.mark(q.ctx.notes, 'good');
        kb.scrollTo(q.ctx.notes[0]);
        extra.textContent = q.ctx.notes.map((m) => pretty(noteName(m))).join('  ');
      } else if (kind === 'inkey') {
        name = pretty(q.item.numeral);
        extra.textContent = 'Roman numerals show where the chord sits in the key. Capitals are major chords and lower case are minor.';
      } else {
        name = pretty(q.item.label);
      }
      feedback.textContent = (ok ? 'Correct. ' : 'Not quite. ') + name + '.';
      feedback.classList.add(ok ? 'good' : 'bad');
      if (ok) timer = setTimeout(next, 1800); else nextBtn.hidden = false;
    }

    const settingsCard = card('Practice settings', ...settingsFor());

    function settingsFor() {
      const out = [];
      if (s.mode === 'interval') {
        out.push(
          h('p', { class: 'label md-typescale-label-large' }, 'Play'),
          segmented([{ value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'harm', label: 'Together' }], s.direction, (v) => { s.direction = v; save(); next(); }),
          h('p', { class: 'label md-typescale-label-large' }, 'Intervals to practice'),
          chips(INTERVALS.map((i) => ({ value: i.short, label: i.short + ' ' + i.name.replace(/ (\d)/, ' $1') })), s.enabled.interval, (v) => { s.enabled.interval = v; save(); next(); }),
        );
      } else if (s.mode === 'chord') {
        out.push(
          segmented([{ value: 'quality', label: 'Chord sound' }, { value: 'inkey', label: 'Chord in a key' }], s.chordKind, (v) => { s.chordKind = v; save(); render(); }),
          h('p', { class: 'label md-typescale-label-large' }, 'Chords to practice'),
        );
        if (kind === 'quality') {
          out.push(chips(QUALITIES.map((t) => ({ value: t, label: capitalize(CHORD_TYPES[t].label) })), s.enabled.quality, (v) => { s.enabled.quality = v; save(); next(); }));
        } else {
          out.push(chips(NUMERAL_CHORDS.map((c) => ({ value: c.id, label: pretty(c.id) })), s.enabled.inkey, (v) => { s.enabled.inkey = v; save(); next(); }));
        }
      } else {
        out.push(
          h('p', { class: 'label md-typescale-label-large' }, 'Progressions to practice'),
          chips(PROGRESSIONS.map((p) => ({ value: p.id, label: pretty(p.label) })), s.enabled.prog, (v) => { s.enabled.prog = v; save(); next(); }),
        );
      }
      if (kind === 'inkey' || kind === 'prog') {
        out.push(h('div', { class: 'gap' }), chips([{ value: 'cadence', label: 'Play I \u2013 IV \u2013 V \u2013 I first to set the key' }], s.cadence ? ['cadence'] : [], (v) => { s.cadence = v.includes('cadence'); save(); next(); }));
      }
      return out;
    }

    body.append(
      h('div', { class: 'top-switch' }, modeSwitch),
      card('Listen',
        h('div', { class: 'actions' }, playBtn, nextBtn),
        prompt, feedback, answerHost, extra,
        showKb ? kb.el : null,
      ),
      settingsCard,
    );
    next();
  }

  render();
  return () => { stopAudio(); clearTimeout(timer); };
}

const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
