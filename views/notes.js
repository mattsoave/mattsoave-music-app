// The Read tab: reading notes, intervals, chords and short melodies from the staff.

import * as store from '../store.js';
import { h, clear, segmented } from '../ui.js';
import { mount as notes } from './read-notes.js';
import { mount as intervals } from './read-intervals.js';
import { mount as chords } from './read-chords.js';
import { mount as melody } from './read-melody.js';

const PARTS = { notes, intervals, chords, melody };

export function mount(root) {
  const s = { part: 'notes', ...store.get('read.settings', {}) };
  if (!PARTS[s.part]) s.part = 'notes';
  const body = h('div');
  let teardown = null;

  function show() {
    if (teardown) teardown();
    clear(body);
    teardown = PARTS[s.part](body) || null;
  }

  root.append(
    h('div', { class: 'top-switch' }, segmented([
      { value: 'notes', label: 'Notes' }, { value: 'intervals', label: 'Intervals' },
      { value: 'chords', label: 'Chords' }, { value: 'melody', label: 'Melody' },
    ], s.part, (v) => { s.part = v; store.set('read.settings', s); show(); })),
    body,
  );
  show();
  return () => { if (teardown) teardown(); };
}
