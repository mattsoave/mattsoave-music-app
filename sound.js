// App-wide sound settings: which instrument plays every note, and whether keys pressed on a MIDI keyboard
// make a sound in the app (turn it off if the piano has its own speakers). Also reconnects the keyboard on start.

import { audio, setInstrument, playNote, INSTRUMENTS } from './audio.js';
import { onNote, supported, alreadyAllowed, connect } from './midi.js';
import * as store from './store.js';

export { INSTRUMENTS };

const DEFAULTS = { instrument: 'piano', monitor: true };
const prefs = { ...DEFAULTS, ...store.get('sound', {}) };
// Version 4 kept the MIDI sound switch with the MIDI screen's settings.
const old = store.get('midi.settings', null);
if (old && old.sound === false && store.get('sound', null) === null) prefs.monitor = false;

export const getPrefs = () => ({ ...prefs });

export function setPref(key, value) {
  prefs[key] = value;
  store.set('sound', prefs);
  if (key === 'instrument') setInstrument(value);
}

const sounding = new Map(); // midi -> stop function

export function initSound() {
  setInstrument(prefs.instrument);
  // Notes from a MIDI keyboard are not a tap, so open the audio on the first tap anywhere.
  addEventListener('pointerdown', () => audio(), { once: true });
  onNote((ev) => {
    const stop = sounding.get(ev.midi);
    if (stop) { stop(); sounding.delete(ev.midi); }
    if (ev.type === 'on' && prefs.monitor) {
      sounding.set(ev.midi, playNote(ev.midi, { hold: true, vel: 0.12 + 0.5 * ev.velocity, release: 0.25 }));
    }
  });
  if (supported()) alreadyAllowed().then((ok) => { if (ok) connect().catch(() => {}); });
}
