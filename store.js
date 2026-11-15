// All saved data goes through this file, so the storage could change later without touching the screens.
// Everything stays on this device (localStorage). Song charts are never sent anywhere.

const PREFIX = 'music.';

export function get(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Everything the app stores, as one object (for backup). */
export function exportAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
  }
  return out;
}

export function importAll(obj) {
  for (const [k, v] of Object.entries(obj)) set(k, v);
}
