// MIDI keyboard input (Web MIDI). Works in Chrome on Android over a USB cable. Not in iOS Safari.
//
// This file is the one place that turns raw MIDI messages into "a note was played" events.
// Any screen can subscribe with onNote(), so a quiz can listen to the keyboard later without touching MIDI code.

const noteListeners = new Set();
const deviceListeners = new Set();
let access = null;

/**
 * Turn a raw MIDI message (array of bytes) into { type: 'on' | 'off', midi, velocity (0 to 1) }, or null for anything else.
 * A note-on with velocity 0 counts as note-off, which many keyboards send.
 */
export function parseMessage(data) {
  if (!data || data.length < 3) return null;
  const cmd = data[0] & 0xf0;
  const midi = data[1];
  const vel = data[2];
  if (cmd === 0x90 && vel > 0) return { type: 'on', midi, velocity: vel / 127 };
  if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) return { type: 'off', midi, velocity: 0 };
  return null;
}

export const supported = () => typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';

/** Subscribe to notes from any connected keyboard. fn receives { type, midi, velocity }. Returns an unsubscribe function. */
export function onNote(fn) {
  noteListeners.add(fn);
  return () => noteListeners.delete(fn);
}

/** Subscribe to keyboards being plugged in or removed. Returns an unsubscribe function. */
export function onDevicesChange(fn) {
  deviceListeners.add(fn);
  return () => deviceListeners.delete(fn);
}

function handle(msg) {
  const ev = parseMessage(msg.data);
  if (ev) noteListeners.forEach((fn) => fn(ev));
}

function bindInputs() {
  for (const input of access.inputs.values()) input.onmidimessage = handle; // setting this also opens the port
}

/** Ask for MIDI access (the browser shows a permission prompt the first time). Returns the connected device names. */
export async function connect() {
  if (!supported()) throw new Error('unsupported');
  if (!access) {
    access = await navigator.requestMIDIAccess();
    access.onstatechange = () => { bindInputs(); deviceListeners.forEach((fn) => fn(devices())); };
  }
  bindInputs();
  return devices();
}

export function devices() {
  if (!access) return [];
  return [...access.inputs.values()].filter((i) => i.state !== 'disconnected').map((i) => i.name || 'MIDI keyboard');
}

/** True if the user already allowed MIDI for this site, so the screen can connect without a tap. */
export async function alreadyAllowed() {
  try {
    const st = await navigator.permissions.query({ name: 'midi' });
    return st.state === 'granted';
  } catch {
    return false;
  }
}
