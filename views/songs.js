// Song library: paste a chord chart from a site like Ultimate Guitar, keep it on this device, browse it later.
// Charts stay in this browser's storage. They are never uploaded and never go in the repo.

import { parseChart, convertLine, toNumeral, detectKey, guessFromUrl, ALL_KEY_IDS, isChordToken } from '../chart.js';
import { parseKey, pretty } from '../theory.js';
import * as store from '../store.js';
import { h, clear, card, hint, button, segmented, chips, toast } from '../ui.js';

const keyLabel = (id) => { const k = parseKey(id); return pretty(k.tonic) + (k.minor ? ' minor' : ' major'); };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function mount(root) {
  let songs = store.get('songs', []);
  const view = { numbers: false, chordsOnly: false, ...store.get('songs.view', {}) };
  const host = h('div');
  root.append(host);
  let screen = 'list';

  const saveSongs = () => store.set('songs', songs);
  const saveView = () => store.set('songs.view', view);

  const onPop = () => { if (screen !== 'list') showList(); };
  addEventListener('popstate', onPop);
  const goDeeper = () => history.pushState({ music: 'songs' }, '');
  const goBack = () => { if (history.state && history.state.music === 'songs') history.back(); else showList(); };

  // ---------- List ----------
  function showList() {
    screen = 'list';
    clear(host);
    const search = h('md-outlined-text-field', { label: 'Search songs', type: 'search', class: 'full' });
    const listBox = h('div');
    const draw = () => {
      clear(listBox);
      const needle = search.value.trim().toLowerCase();
      const shown = songs
        .filter((s) => !needle || (s.title + ' ' + s.artist).toLowerCase().includes(needle))
        .sort((a, b) => a.title.localeCompare(b.title));
      if (!songs.length) {
        listBox.append(hint('No songs yet. Add one by pasting a chord chart. For example, copy the chords and lyrics from Ultimate Guitar, and paste the page link on the first line.'));
        return;
      }
      if (!shown.length) { listBox.append(hint('No songs match.')); return; }
      const list = h('md-list');
      for (const s of shown) {
        list.append(h('md-list-item', { type: 'button', onClick: () => showSong(s.id) },
          h('div', { slot: 'headline' }, s.title || 'Untitled'),
          h('div', { slot: 'supporting-text' }, [s.artist, s.key ? keyLabel(s.key) : ''].filter(Boolean).join(' \u00B7 ')),
        ));
      }
      listBox.append(list);
    };
    search.addEventListener('input', draw);

    const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const incoming = Array.isArray(data.songs) ? data.songs : [];
        const byId = new Map(songs.map((x) => [x.id, x]));
        incoming.forEach((x) => { if (x && x.id && typeof x.text === 'string') byId.set(x.id, x); });
        songs = [...byId.values()];
        saveSongs();
        toast(`Imported ${incoming.length} songs`);
        showList();
      } catch { toast('That file is not a song backup.'); }
    });

    host.append(
      card('',
        h('div', { class: 'actions' }, button('Add a song', () => showEditor(null), 'filled')),
        search,
        listBox,
      ),
      card('Backup',
        hint('Songs live only on this phone. Export a file now and then, and import it to restore or to move to a new phone.'),
        h('div', { class: 'actions' },
          button('Export songs', exportSongs, 'tonal'),
          button('Import songs', () => fileInput.click(), 'tonal'),
          fileInput,
        ),
      ),
    );
    draw();
  }

  function exportSongs() {
    if (!songs.length) { toast('Nothing to export yet.'); return; }
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const blob = new Blob([JSON.stringify({ app: 'mattsoave-music-app', version: 1, songs }, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `songs-backup-${stamp}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- One song ----------
  function showSong(id) {
    const song = songs.find((x) => x.id === id);
    if (!song) return showList();
    if (screen === 'list') goDeeper();
    screen = 'song';
    clear(host);
    const parsed = parseChart(song.text);
    const keyId = song.key || detectKey(parsed);
    const chartBox = h('div', { class: 'chart', tabIndex: 0 });

    const draw = () => {
      clear(chartBox);
      const asNumbers = view.numbers && keyId;
      let blankPending = false;
      for (const line of parsed.lines) {
        if (view.chordsOnly && line.type === 'lyric') continue;
        if (view.chordsOnly && line.type === 'blank') { blankPending = true; continue; }
        if (line.type === 'blank') { chartBox.append(h('div', { class: 'cl' }, '\u00A0')); continue; }
        if (blankPending && line.type === 'section') chartBox.append(h('div', { class: 'cl' }, '\u00A0'));
        blankPending = false;
        if (line.type === 'section') { chartBox.append(h('div', { class: 'cl section' }, line.text)); continue; }
        if (line.type === 'lyric') { chartBox.append(h('div', { class: 'cl lyric' }, line.text)); continue; }
        // chord line
        const conv = (t) => (asNumbers ? toNumeral(t, keyId) : t);
        let segs;
        if (view.chordsOnly) {
          segs = [];
          line.tokens.forEach((t, i) => {
            if (i) segs.push({ t: '   ', chord: false });
            const c = isChordToken(t.text);
            segs.push({ t: c ? conv(t.text) : t.text, chord: c });
          });
        } else {
          segs = convertLine(line.tokens, conv);
        }
        chartBox.append(h('div', { class: 'cl chords' }, segs.map((sg) => (sg.chord ? h('span', { class: 'ch' }, sg.t) : sg.t))));
      }
    };

    const titleBlock = h('div', {},
      h('h2', { class: 'md-typescale-headline-small song-title' }, song.title || 'Untitled'),
      h('p', { class: 'md-typescale-body-medium hint' }, [song.artist, keyId ? 'Key of ' + keyLabel(keyId) + (song.key ? '' : ' (guessed)') : ''].filter(Boolean).join(' \u00B7 ')),
    );

    host.append(
      h('div', { class: 'actions' },
        button('Back', goBack, 'text'),
        button('Edit', () => showEditor(song.id), 'text'),
        button('Delete', () => {
          if (confirm(`Delete "${song.title || 'this song'}" from this phone?`)) {
            songs = songs.filter((x) => x.id !== song.id);
            saveSongs();
            goBack();
          }
        }, 'text'),
      ),
      card('', titleBlock,
        h('div', { class: 'actions' },
          song.url ? h('a', { class: 'linkbtn md-typescale-label-large', href: song.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open original page') : null,
        ),
        chips(
          [{ value: 'chordsOnly', label: 'Chords only' }, { value: 'numbers', label: 'Show as numbers' }],
          [view.chordsOnly ? 'chordsOnly' : null, view.numbers ? 'numbers' : null].filter(Boolean),
          (v) => { view.chordsOnly = v.includes('chordsOnly'); view.numbers = v.includes('numbers'); saveView(); draw(); },
        ),
        !keyId && view.numbers ? hint('Set a key (Edit) to see numbers.') : null,
      ),
      card('', chartBox),
    );
    draw();
    scrollTo(0, 0);
  }

  // ---------- Add / edit ----------
  function showEditor(id) {
    const existing = id ? songs.find((x) => x.id === id) : null;
    if (screen === 'list') goDeeper();
    screen = 'edit';
    clear(host);
    const initial = existing ? (existing.url ? existing.url + '\n' : '') + existing.text : '';
    const paste = h('md-outlined-text-field', { label: 'Paste the chart here', type: 'textarea', rows: 12, class: 'full mono-field', value: initial });
    const title = h('md-outlined-text-field', { label: 'Title', class: 'full', value: existing ? existing.title : '' });
    const artist = h('md-outlined-text-field', { label: 'Artist', class: 'full', value: existing ? existing.artist : '' });
    const urlField = h('md-outlined-text-field', { label: 'Link to the original page', class: 'full', type: 'url', value: existing ? existing.url : '' });
    const keySel = h('md-outlined-select', { label: 'Key', class: 'full' });
    keySel.append(h('md-select-option', { value: '', selected: !(existing && existing.key) }, h('div', { slot: 'headline' }, 'Guess from the chords')));
    for (const k of ALL_KEY_IDS) keySel.append(h('md-select-option', { value: k, selected: !!existing && existing.key === k }, h('div', { slot: 'headline' }, keyLabel(k))));
    const note = hint('');

    const onPaste = () => {
      const p = parseChart(paste.value);
      if (p.url) {
        urlField.value = p.url;
        const g = guessFromUrl(p.url);
        if (!title.value && g.title) title.value = g.title;
        if (!artist.value && g.artist) artist.value = g.artist;
      }
      const k = detectKey(p);
      note.textContent = k ? `Looks like the key of ${keyLabel(k)}. Change it above if that is wrong.` : '';
    };
    paste.addEventListener('input', onPaste);

    host.append(
      h('div', { class: 'actions' }, button('Cancel', goBack, 'text')),
      card(existing ? 'Edit song' : 'Add a song',
        paste, h('div', { class: 'gap' }), title, h('div', { class: 'gap' }), artist, h('div', { class: 'gap' }), urlField,
        h('div', { class: 'gap' }), keySel, note,
        h('div', { class: 'actions' }, button('Save song', () => {
          const parsed = parseChart(paste.value);
          if (!parsed.lines.length) { toast('Paste a chart first.'); return; }
          const text = paste.value.replace(/\r\n?/g, '\n').split('\n').slice(parsed.url ? 1 : 0).join('\n').replace(/\s+$/, '');
          const rec = {
            id: existing ? existing.id : newId(),
            title: title.value.trim(),
            artist: artist.value.trim(),
            url: (parsed.url || urlField.value).trim(),
            key: keySel.value || '',
            text,
            updated: new Date().toISOString(),
          };
          songs = existing ? songs.map((x) => (x.id === rec.id ? rec : x)) : [...songs, rec];
          saveSongs();
          screen = 'song'; // already one step deep, so showSong adds no extra history entry
          showSong(rec.id);
        }, 'filled')),
      ),
    );
    onPaste();
  }

  showList();
  return () => removeEventListener('popstate', onPop);
}
