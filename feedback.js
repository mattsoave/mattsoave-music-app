// A notes card at the bottom of every screen, so you can jot feedback while using the app and send it later.
// The text is saved on every keystroke and is not part of the song backup, so imports never touch it.

import * as store from './store.js';
import { h, button, toast } from './ui.js';

const KEY = 'feedback.notes'; // saved as "music.feedback.notes"

const pad = (n) => String(n).padStart(2, '0');
const isoDate = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function mountFeedback(root, version) {
  const field = h('md-outlined-text-field', {
    label: 'Notes about this app',
    type: 'textarea',
    rows: 5,
    class: 'full',
    value: store.get(KEY, ''),
  });
  field.addEventListener('input', () => store.set(KEY, field.value));

  const exportText = () => `Piano practice feedback (version ${version}, ${isoDate()})\n\n${field.value.trim()}\n`;
  const hasNotes = () => field.value.trim().length > 0;

  async function share() {
    if (!hasNotes()) { toast('Nothing to share yet.'); return; }
    try {
      await navigator.share({ title: 'Piano practice feedback', text: exportText() });
    } catch (e) {
      if (e && e.name !== 'AbortError') toast('Sharing did not work. Try Copy instead.');
    }
  }

  async function copy() {
    if (!hasNotes()) { toast('Nothing to copy yet.'); return; }
    try {
      await navigator.clipboard.writeText(exportText());
      toast('Copied.');
    } catch {
      toast('Could not copy. Select the text and copy it by hand.');
    }
  }

  function clearNotes() {
    if (!hasNotes()) return;
    if (!confirm('Clear all feedback notes? This cannot be undone.')) return;
    field.value = '';
    store.set(KEY, '');
  }

  root.append(
    h('section', { class: 'card feedback-card' },
      h('h2', { class: 'md-typescale-title-medium' }, 'Feedback notes'),
      field,
      h('p', { class: 'hint md-typescale-body-small' }, 'Notes stay on this phone and are kept until you clear them. Share or copy them when you want to send them.'),
      h('div', { class: 'actions' },
        navigator.share ? button('Share', share, 'tonal') : null,
        button('Copy', copy, 'tonal'),
        button('Clear', clearNotes, 'text'),
      ),
    ),
  );
}
