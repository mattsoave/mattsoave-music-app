// Small UI helpers shared by every screen: element builder, Material controls, staff drawing, keyboard.

import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Beam, Tuplet, BarlineType } from './vendor/vexflow.js';
import { stepVexKey, pretty } from './theory.js';
import { playNote } from './audio.js';
import { devices, onDevicesChange } from './midi.js';

export { pretty };

/** Build an element. Props starting with "on" become listeners; `class` sets className. */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && !k.includes('-')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export const clear = (el) => { el.replaceChildren(); return el; };

export const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h2', { class: 'md-typescale-title-medium' }, title) : null, ...kids);
export const hint = (text) => h('p', { class: 'hint md-typescale-body-medium' }, text);
export const button = (label, onClick, kind = 'tonal', extra = {}) => {
  const tag = { filled: 'md-filled-button', tonal: 'md-filled-tonal-button', outlined: 'md-outlined-button', text: 'md-text-button' }[kind];
  return h(tag, { onClick, ...extra }, label);
};

/** A segmented button set with a .value and a "change" event. options: [{ value, label }] */
export function segmented(options, value, onChange) {
  const set = h('md-outlined-segmented-button-set');
  let chosen = value;
  for (const o of options) {
    set.append(h('md-outlined-segmented-button', { 'no-checkmark': true, label: o.label, selected: o.value === value, dataset: { value: o.value } }));
  }
  Object.defineProperty(set, 'value', {
    get: () => chosen,
    set(v) { chosen = v; set.querySelectorAll('md-outlined-segmented-button').forEach((b) => { b.selected = b.dataset.value === v; }); },
  });
  set.addEventListener('segmented-button-set-selection', (e) => {
    chosen = e.detail.button.dataset.value;
    if (onChange) onChange(chosen);
  });
  return set;
}

/** A row of filter chips. Returns an element with .values (array) and calls onChange(values). */
export function chips(options, selected, onChange) {
  const set = h('md-chip-set');
  const state = new Set(selected);
  for (const o of options) {
    const chip = h('md-filter-chip', { label: o.label, selected: state.has(o.value), title: o.title || '' });
    chip.addEventListener('click', () => {
      queueMicrotask(() => {
        if (chip.selected) state.add(o.value); else state.delete(o.value);
        if (onChange) onChange([...state]);
      });
    });
    set.append(chip);
  }
  Object.defineProperty(set, 'values', { get: () => [...state] });
  return set;
}

/**
 * A grid of answer buttons. options: [{ value, label }]. onPick(value) fires on each tap.
 * .show(correct, picked) colors the right answer green and a wrong pick red. .reset() clears it.
 */
export function choices(options, onPick, { cols = 0 } = {}) {
  const el = h('div', { class: 'choices' });
  if (cols) el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const buttons = options.map((o) => {
    const b = h('md-filled-tonal-button', { class: 'choice', dataset: { value: o.value }, onClick: () => onPick(o.value) }, o.label);
    el.append(b);
    return b;
  });
  return {
    el,
    show(correct, picked) {
      buttons.forEach((b) => {
        if (b.dataset.value === String(correct)) b.dataset.state = 'good';
        else if (b.dataset.value === String(picked)) b.dataset.state = 'bad';
      });
    },
    /** Highlight one button as chosen (for answers made of more than one tap). */
    select(value) { buttons.forEach((b) => { if (b.dataset.value === String(value)) b.dataset.state = 'picked'; else b.removeAttribute('data-state'); }); },
    reset() { buttons.forEach((b) => b.removeAttribute('data-state')); },
  };
}

/** Flat, natural or sharp, for answers that name a note. `.value` is -1, 0 or 1; `.reset()` goes back to natural. */
export function accidentalPicker() {
  const set = segmented([{ value: '-1', label: '\u266D' }, { value: '0', label: '\u266E' }, { value: '1', label: '\u266F' }], '0');
  set.classList.add('acc-picker');
  return { el: set, get value() { return Number(set.value); }, reset() { set.value = '0'; } };
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast md-typescale-body-medium' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/** A hint line that shows only while a MIDI keyboard is connected. */
export function midiHint(text) {
  const el = h('p', { class: 'hint md-typescale-body-small midi-hint' }, text);
  el.hidden = !devices().length;
  const off = onDevicesChange((list) => {
    if (!el.isConnected) { off(); return; }
    el.hidden = !list.length;
  });
  return el;
}

/** Move focus off an answer button that is about to be reused, so it does not keep a focus or pressed look. */
export function releaseFocus(container) {
  let a = document.activeElement;
  if (!a || !container.contains(a)) return;
  while (a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; // Material buttons focus inside
  if (a.blur) a.blur();
}

// ---- Staff (VexFlow) ----

const ACCIDENTAL = { 1: '#', '-1': 'b', 0: 'n' };

// Note colors are fixed, like the paper behind them, and set in the theme block in index.html.
function noteColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return { current: v('--note-current'), wrong: v('--note-wrong') };
}

// Where a rest sits: the middle line of the staff.
const REST_KEY = { treble: 'b/4', bass: 'd/3' };

/**
 * Draw a staff. The SVG scales to the width of its container. Options:
 * - clef: 'treble' or 'bass'; keySig: a key id such as 'D' or 'Bm'
 * - step: one whole note (a step number), or
 * - notes: [{ steps: [step], accs: [1, -1, 0 or null], duration: 'w' | 'h' | 'q' | '8', rest, beam, tuplet, color }]
 *   Each staff holds exactly four beats. `rest: true` draws a rest instead of a note. Notes that share a `beam`
 *   number are beamed together, and notes that share a `tuplet` number are drawn as a triplet. `color` is
 *   'current' or 'wrong'.
 * - rows: several lists of notes, drawn as staves stacked under each other.
 * - timeSig: such as '4/4', shown on the first staff. endBar: draw the closing double bar on the last staff.
 */
export function drawStaff(container, { clef = 'treble', step = null, keySig = null, notes = null, rows = null, width = null, timeSig = null, endBar = false } = {}) {
  clear(container);
  const lines = rows || [notes || (step !== null ? [{ steps: [step], duration: 'w' }] : [])];
  const w = width || (keySig ? 260 : 220);
  const single = lines.length === 1;
  const top = single ? 45 : 18;
  const rowH = 108;
  const ht = single ? 170 : top + rowH * lines.length + 20;
  const r = new Renderer(container, Renderer.Backends.SVG);
  r.resize(w, ht);
  const ctx = r.getContext();
  const colors = noteColors();
  lines.forEach((line, row) => {
    const stave = new Stave(4, top + row * rowH, w - 8);
    stave.addClef(clef);
    if (keySig) stave.addKeySignature(keySig);
    if (timeSig && row === 0) stave.addTimeSignature(timeSig);
    if (endBar && row === lines.length - 1) stave.setEndBarType(BarlineType.END);
    stave.setContext(ctx).draw();
    if (!line.length) return;
    const vfNotes = line.map((n) => {
      if (n.rest) return new StaveNote({ keys: [REST_KEY[clef]], duration: (n.duration || 'q') + 'r', clef });
      const order = n.steps.map((s, i) => ({ s, a: n.accs ? n.accs[i] : null })).sort((x, y) => x.s - y.s);
      const sn = new StaveNote({ keys: order.map((o) => stepVexKey(o.s)), duration: n.duration || 'w', clef, autoStem: true });
      order.forEach((o, i) => { if (o.a !== null && o.a !== undefined) sn.addModifier(new Accidental(ACCIDENTAL[o.a]), i); });
      const color = n.color && colors[n.color];
      if (color) {
        const style = { fillStyle: color, strokeStyle: color };
        sn.setStyle(style);
        sn.setLedgerLineStyle(style);
      }
      return sn;
    });
    const groupsOf = (key) => {
      const m = new Map();
      line.forEach((n, i) => {
        if (n[key] === null || n[key] === undefined) return;
        if (!m.has(n[key])) m.set(n[key], []);
        m.get(n[key]).push(vfNotes[i]);
      });
      return [...m.values()];
    };
    // Beams first, since they settle which way the stems point. The triplet "3" then goes on the stem side.
    // Both have to exist before the notes go into the voice, because a triplet changes how long its notes last.
    const beams = groupsOf('beam').map((g) => new Beam(g, true));
    const tuplets = groupsOf('tuplet').map((g) => new Tuplet(g, {
      location: g[0].getStemDirection() < 0 ? Tuplet.LOCATION_BOTTOM : Tuplet.LOCATION_TOP,
    }));
    const voice = new Voice({ numBeats: 4, beatValue: 4 });
    voice.addTickables(vfNotes);
    const room = vfNotes.length === 1 ? 80 : Math.max(80, w - stave.getNoteStartX() - 24);
    new Formatter().joinVoices([voice]).format([voice], room);
    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    tuplets.forEach((t) => t.setContext(ctx).draw());
  });
  const svg = container.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${ht}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.removeProperty('width');
  svg.style.removeProperty('height');
  svg.classList.add('staff');
  return svg;
}

// ---- Keyboard ----

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * An on-screen piano. Scrolls sideways when it is wider than the screen.
 * onKey(midi) fires on each press. Use .mark(midis, kind), .clearMarks(), .scrollTo(midi).
 */
export function keyboard({ from = 48, to = 84, onKey = null, sound = true, keyWidth = 34 } = {}) {
  const wrap = h('div', { class: 'kb-scroll' });
  const inner = h('div', { class: 'kb' });
  wrap.append(inner);
  const keys = new Map();
  let whiteIndex = 0;
  const whites = [];
  for (let m = from; m <= to; m++) if (!BLACK.has(m % 12)) whites.push(m);
  inner.style.width = whites.length * keyWidth + 'px';
  for (let m = from; m <= to; m++) {
    const isBlack = BLACK.has(m % 12);
    const el = h('button', { class: 'key ' + (isBlack ? 'black' : 'white'), type: 'button', 'aria-label': 'Key ' + m });
    if (isBlack) {
      el.style.left = whiteIndex * keyWidth - keyWidth * 0.3 + 'px';
      el.style.width = keyWidth * 0.6 + 'px';
    } else {
      el.style.left = whiteIndex * keyWidth + 'px';
      el.style.width = keyWidth + 'px';
      if (m % 12 === 0) el.append(h('span', { class: 'kb-label' }, 'C' + (Math.floor(m / 12) - 1)));
      whiteIndex++;
    }
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointercancel', () => { down = null; });
    // Fire on release, and only if the finger did not move: a sideways swipe scrolls the keyboard instead.
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.abs(e.clientX - down.x) > 8 || Math.abs(e.clientY - down.y) > 8;
      down = null;
      if (moved) return;
      if (sound) playNote(m, { dur: 0.9, vel: 0.5 });
      if (onKey) onKey(m);
    });
    keys.set(m, el);
    inner.append(el);
  }
  const api = {
    el: wrap,
    mark(midis, kind = 'on') { midis.forEach((m) => keys.get(m)?.classList.add('mark-' + kind)); },
    unmark(midis, kind = 'on') { midis.forEach((m) => keys.get(m)?.classList.remove('mark-' + kind)); },
    /** Mark keys for a moment, then clear them. */
    flash(midis, kind = 'good', ms = 350) {
      api.mark(midis, kind);
      setTimeout(() => api.unmark(midis, kind), ms);
    },
    /** Scroll sideways only if the key is outside the visible part of the keyboard. */
    reveal(midi) {
      const el = keys.get(midi);
      if (!el) return;
      const left = el.offsetLeft;
      const right = left + el.offsetWidth;
      if (left < wrap.scrollLeft + keyWidth || right > wrap.scrollLeft + wrap.clientWidth - keyWidth) api.scrollTo(midi);
    },
    clearMarks() { keys.forEach((el) => el.classList.remove('mark-on', 'mark-good', 'mark-bad')); },
    scrollTo(midi) {
      const el = keys.get(midi);
      if (!el) return;
      wrap.scrollLeft = Math.max(0, el.offsetLeft - wrap.clientWidth / 2 + keyWidth / 2);
    },
  };
  return api;
}

