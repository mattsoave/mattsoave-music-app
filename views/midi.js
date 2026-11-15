// MIDI keyboard: shows which keys you are pressing and plays the sound.

import { connect, devices, onNote, onDevicesChange, supported, alreadyAllowed } from '../midi.js';
import { playNote } from '../audio.js';
import { noteName, pretty } from '../theory.js';
import * as store from '../store.js';
import { h, card, hint, button, chips, keyboard } from '../ui.js';

export function mount(root) {
  const settings = { sound: true, ...store.get('midi.settings', {}) };
  const held = new Map(); // midi -> { stop, vel }
  let last = null;

  const nowEl = h('div', { class: 'midi-now md-typescale-display-small', 'aria-live': 'polite' });
  const subEl = h('div', { class: 'midi-sub md-typescale-body-medium' });
  const statusEl = h('p', { class: 'hint md-typescale-body-medium' });
  const kb = keyboard({ from: 21, to: 108, sound: false, keyWidth: 24, onKey: tapped });

  function render() {
    const names = [...held.keys()].sort((a, b) => a - b).map((m) => pretty(noteName(m)));
    nowEl.textContent = names.length ? names.join('  ') : last ? pretty(noteName(last.midi)) : '\u2013';
    nowEl.classList.toggle('idle', !held.size);
    subEl.textContent = held.size
      ? `${held.size} ${held.size === 1 ? 'key' : 'keys'} down`
      : last ? 'Last note played' : 'Play a note on your keyboard.';
  }

  function noteOn(midi, velocity) {
    if (held.has(midi) && held.get(midi).stop) held.get(midi).stop();
    const stop = settings.sound ? playNote(midi, { dur: 8, vel: 0.12 + 0.5 * velocity, release: 0.25 }) : null;
    held.set(midi, { stop, velocity });
    last = { midi, velocity };
    kb.mark([midi], 'on');
    kb.reveal(midi);
    render();
  }

  function noteOff(midi) {
    const n = held.get(midi);
    if (!n) return;
    if (n.stop) n.stop();
    held.delete(midi);
    kb.unmark([midi], 'on');
    render();
  }

  // Tapping the on-screen keys works like a short keypress, so the screen can be tried without a keyboard.
  function tapped(midi) {
    noteOn(midi, 0.7);
    setTimeout(() => noteOff(midi), 450);
  }

  const unsubNote = onNote((ev) => (ev.type === 'on' ? noteOn(ev.midi, ev.velocity) : noteOff(ev.midi)));

  function showDevices() {
    const d = devices();
    statusEl.textContent = d.length
      ? 'Connected: ' + d.join(', ')
      : 'MIDI is on, but no keyboard was found. Plug it in with a USB cable and it will appear here.';
  }
  const unsubDevices = onDevicesChange(showDevices);

  async function doConnect() {
    statusEl.textContent = 'Connecting...';
    try {
      await connect();
      showDevices();
    } catch (e) {
      statusEl.textContent = e && (e.name === 'SecurityError' || e.name === 'NotAllowedError')
        ? 'MIDI access was blocked. Allow MIDI for this site in the browser settings, then try again.'
        : 'Could not start MIDI: ' + (e && e.message ? e.message : 'unknown error');
    }
  }

  const connectBtn = button('Connect keyboard', doConnect, 'filled');
  if (!supported()) {
    statusEl.textContent = 'This browser cannot use MIDI. Use Chrome on Android (or on a computer). iPhone and iPad browsers do not support it.';
    connectBtn.hidden = true;
  } else {
    statusEl.textContent = 'Plug your keyboard into the phone with a USB cable, then tap Connect keyboard.';
    alreadyAllowed().then((ok) => { if (ok) doConnect(); });
  }

  root.append(
    card('MIDI keyboard',
      h('div', { class: 'midi-stage' }, nowEl, subEl),
      kb.el,
      statusEl,
      h('div', { class: 'actions' }, connectBtn),
    ),
    card('Settings',
      chips([{ value: 'sound', label: 'Play the sound' }], settings.sound ? ['sound'] : [], (v) => {
        settings.sound = v.includes('sound');
        store.set('midi.settings', settings);
      }),
      hint('Sharps are shown for black keys. Tapping the on-screen keys also plays them.'),
    ),
  );
  render();
  requestAnimationFrame(() => kb.scrollTo(60));

  return () => {
    unsubNote();
    unsubDevices();
    held.forEach((n) => n.stop && n.stop());
    held.clear();
  };
}
