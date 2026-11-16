// App shell: bottom navigation, one screen at a time, offline support.

import { h, clear, toast } from './ui.js';
import * as store from './store.js';
import * as notes from './views/notes.js';
import * as keys from './views/keys.js';
import * as ear from './views/ear.js';
import * as metronome from './views/metronome.js';
import * as songs from './views/songs.js';
import * as midi from './views/midi.js';
import { mountFeedback } from './feedback.js';
import { importBackupText } from './views/songs.js';
import { initSound } from './sound.js';

const VERSION = 7;

const ICON = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const TABS = [
  { id: 'notes', label: 'Read', title: 'Read music', view: notes, icon: ICON('M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z') },
  { id: 'keys', label: 'Keys', title: 'Keys and chords', view: keys, icon: ICON('M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z') },
  { id: 'ear', label: 'Ear', title: 'Ear training', view: ear, icon: ICON('M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z') },
  { id: 'metronome', label: 'Metronome', title: 'Metronome', view: metronome, icon: ICON('M12 2 5 22h14L12 2zm0 5.5L16 20H8l4-12.5z') },
  { id: 'midi', label: 'MIDI', title: 'MIDI keyboard', view: midi, icon: ICON('M3 5h18v14H3V5zm2 2v10h3.3V7H5zm4.9 0v10h4.2V7H9.9zm5.8 0v10H19V7h-3.3z') },
  { id: 'songs', label: 'Songs', title: 'Songs', view: songs, icon: ICON('M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z') },
];

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('title');
let teardown = null;
let current = -1;
initSound();

function show(i) {
  if (i === current) return;
  if (teardown) { try { teardown(); } catch { /* ignore */ } teardown = null; }
  current = i;
  clear(viewEl);
  titleEl.textContent = TABS[i].title;
  store.set('tab', TABS[i].id);
  teardown = TABS[i].view.mount(viewEl) || null;
  scrollTo(0, 0);
}

const bar = h('md-navigation-bar');
TABS.forEach((t) => {
  const tab = h('md-navigation-tab', { label: t.label });
  tab.insertAdjacentHTML('beforeend', t.icon.replace('<svg', '<svg slot="inactive-icon"') + t.icon.replace('<svg', '<svg slot="active-icon"'));
  bar.append(tab);
});
bar.addEventListener('navigation-bar-activated', (e) => {
  const i = e.detail && typeof e.detail.activeIndex === 'number' ? e.detail.activeIndex : bar.activeIndex;
  bar.activeIndex = i;
  show(i);
});
document.getElementById('navwrap').append(bar);

// A file shared to the app (Android share sheet): import it as a song backup, then open Songs.
async function takeSharedFile() {
  if (!new URLSearchParams(location.search).has('shared')) return null;
  history.replaceState(null, '', location.pathname);
  try {
    const cache = await caches.open('shared-files');
    const res = await cache.match('shared-file');
    if (!res) return 'Something was shared, but no file arrived.';
    const text = await res.text();
    await cache.delete('shared-file');
    const n = importBackupText(text);
    return `Imported ${n} song${n === 1 ? '' : 's'} from the shared file.`;
  } catch {
    return 'That shared file is not a song backup.';
  }
}

const sharedMessage = await takeSharedFile();
const songsIndex = TABS.findIndex((t) => t.id === 'songs');
const start = sharedMessage ? songsIndex : Math.max(0, TABS.findIndex((t) => t.id === store.get('tab', 'notes')));
bar.activeIndex = start;
show(start);
if (sharedMessage) toast(sharedMessage);

mountFeedback(document.getElementById('feedback'), VERSION);

// ---- Status and offline ----
document.getElementById('ver').textContent = VERSION;
const net = document.getElementById('net');
const setNet = () => { net.textContent = navigator.onLine ? 'online' : 'offline'; };
addEventListener('online', setNet);
addEventListener('offline', setNet);
setNet();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
