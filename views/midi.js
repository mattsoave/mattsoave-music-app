// MIDI keyboard: connect a keyboard, see which keys you are pressing, and choose the app's sound.
// The sound for MIDI notes is played app-wide by sound.js, so it works on every tab.

import { connect, devices, onNote, onDevicesChange, supported } from '../midi.js';
import { playChord } from '../audio.js';
import { noteName, pretty } from '../theory.js';
import { INSTRUMENTS, getPrefs, setPref } from '../sound.js';
import { h, card, hint, button, chips, keyboard } from '../ui.js';

export function mount(root) {
  const held = new Set();
  let last = null;

  const nowEl = h('div', { class: 'midi-now md-typescale-display-small', 'aria-live': 'polite' });
  const subEl = h('div', { class: 'midi-sub md-typescale-body-medium' });
  const statusEl = h('p', { class: 'hint md-typescale-body-medium' });
  const kb = keyboard({ from: 21, to: 108, sound: true, keyWidth: 24, onKey: tapped });

  function render() {
    const names = [...held].sort((a, b) => a - b).map((m) => pretty(noteName(m)));
    nowEl.textContent = names.length ? names.join('  ') : last !== null ? pretty(noteName(last)) : '\u2013';
    nowEl.classList.toggle('idle', !held.size);
    subEl.textContent = held.size
      ? `${held.size} ${held.size === 1 ? 'key' : 'keys'} down`
      : last !== null ? 'Last note played' : 'Play a note on your keyboard.';
  }

  function noteOn(midi) {
    held.add(midi);
    last = midi;
    kb.mark([midi], 'on');
    kb.reveal(midi);
    render();
  }

  function noteOff(midi) {
    if (!held.delete(midi)) return;
    kb.unmark([midi], 'on');
    render();
  }

  // Tapping the on-screen keys plays them and shows them, so the screen can be tried without a keyboard.
  function tapped(midi) {
    noteOn(midi);
    setTimeout(() => noteOff(midi), 450);
  }

  const unsubNote = onNote((ev) => (ev.type === 'on' ? noteOn(ev.midi) : noteOff(ev.midi)));

  function showDevices() {
    const d = devices();
    statusEl.textContent = d.length
      ? 'Connected: ' + d.join(', ') + '. It works on the other tabs too.'
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
  } else if (devices().length) {
    showDevices();
  } else {
    statusEl.textContent = 'Plug your keyboard into the phone with a USB cable, then tap Connect keyboard.';
  }

  const prefs = getPrefs();
  const instrument = h('md-outlined-select', { label: 'Instrument' });
  INSTRUMENTS.forEach((i) => instrument.append(h('md-select-option', { value: i.id, selected: i.id === prefs.instrument }, h('div', { slot: 'headline' }, i.label))));
  instrument.addEventListener('change', () => {
    setPref('instrument', instrument.value);
    playChord([60, 64, 67], { dur: 1.2 });
  });

  root.append(
    card('MIDI keyboard',
      h('div', { class: 'midi-stage' }, nowEl, subEl),
      kb.el,
      statusEl,
      h('div', { class: 'actions' }, connectBtn),
    ),
    card('Sound',
      instrument,
      hint('Used for every sound in the app except the metronome click.'),
      h('div', { class: 'gap' }),
      chips([{ value: 'monitor', label: 'Play keys I press on my MIDI keyboard' }], prefs.monitor ? ['monitor'] : [], (v) => setPref('monitor', v.includes('monitor'))),
      hint('Turn this off if your keyboard has its own speakers. It applies on every tab.'),
    ),
  );
  render();
  requestAnimationFrame(() => kb.scrollTo(60));

  return () => {
    unsubNote();
    unsubDevices();
  };
}
