// Small UI helpers shared by every screen: element builder, Material controls, staff drawing, keyboard.

import { Renderer, Stave, StaveNote, Voice, Formatter } from './vendor/vexflow.js';
import { stepVexKey, pretty } from './theory.js';
import { playNote } from './audio.js';

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
    reset() { buttons.forEach((b) => b.removeAttribute('data-state')); },
  };
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast md-typescale-body-medium' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---- Staff (VexFlow) ----

/**
 * Draw a staff. opts: { clef: 'treble'|'bass', step?: number (a note), keySig?: 'D' or 'Bm' }
 * The SVG scales to the width of its container.
 */
export function drawStaff(container, { clef = 'treble', step = null, keySig = null } = {}) {
  clear(container);
  const w = keySig ? 260 : 220;
  const ht = 170;
  const r = new Renderer(container, Renderer.Backends.SVG);
  r.resize(w, ht);
  const ctx = r.getContext();
  const stave = new Stave(4, 45, w - 8);
  stave.addClef(clef);
  if (keySig) stave.addKeySignature(keySig);
  stave.setContext(ctx).draw();
  if (step !== null) {
    const note = new StaveNote({ keys: [stepVexKey(step)], duration: 'w', clef });
    const voice = new Voice({ numBeats: 4, beatValue: 4 });
    voice.addTickables([note]);
    new Formatter().joinVoices([voice]).format([voice], 80);
    voice.draw(ctx, stave);
  }
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

