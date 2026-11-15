# AGENTS.md

Guidance for AI agents working in this repo. Read this before editing.

## What this is

An installable web app (PWA) for practicing piano: note-reading flashcards, key signatures, chords in a key, ear training, a metronome, and a personal song chord library. It runs entirely in the browser with no backend. The owner uses it on an Android phone and publishes it on GitHub Pages from a public repo.

## Files

- `index.html`: page shell, the Material 3 color theme (all colors live in the `:root` blocks), and all CSS.
- `app.js`: bottom navigation and screen switching. Bump `VERSION` here on release.
- `views/*.js`: one file per screen (`notes`, `keys`, `ear`, `metronome`, `songs`). Each exports `mount(root)` and returns a teardown function.
- `theory.js`, `srs.js`, `chart.js`: pure logic with no DOM (note and key math, practice weighting, chord chart parsing). Checked by `test/run.js`.
- `audio.js`: Web Audio piano-like synth and the metronome clock.
- `store.js`: the only place that touches `localStorage`. Everything else calls it.
- `feedback.js`: the notes card at the bottom of every screen. Notes save on every keystroke under `music.feedback.notes`, and are not part of the song backup, so imports never overwrite them.
- `ui.js`: element helper `h()`, Material controls (`segmented`, `chips`, `choices`), staff drawing, on-screen keyboard.
- `sw.js`, `manifest.webmanifest`: offline cache, install, and the share target that lets you share a song backup (`.json`) from another app straight into Songs. `app.js` reads the shared file on load (`?shared=1`) and calls `importBackupText()` in `views/songs.js`.
- `vendor/material.js`: prebuilt bundle of `@material/web` 2.5.0 (Apache 2.0, license beside it). Not hand-edited.
- `vendor/vexflow.js`: prebuilt bundle of VexFlow 5.0.0 with the Bravura music font inside (MIT, license beside it; the font is under the SIL Open Font License). Not hand-edited. It draws the staff, clefs, ledger lines and key signatures.

## Conventions

- No build step, no framework, no dependencies to install. Plain ES modules. `package.json` only sets `"type": "module"` so Node can run the tests.
- Keep `theory.js`, `srs.js` and `chart.js` free of DOM access so they stay testable. Run `node test/run.js` after changing them.
- Use Material 3 components and the `--md-sys-color-*` variables. Do not hardcode colors outside the theme block. The staff and white piano keys use `--paper` and `--ink` on purpose so they stay light in dark mode.
- Use segmented buttons for two to five short choices and filter chips for toggles.
- All saved data goes through `store.js`. Input from a MIDI keyboard is planned for later: every note answer should flow through a single "a note was played" handler (see `keyboard()` in `ui.js` and the `onKey` callbacks) so MIDI can feed the same place.

## Things that are easy to get wrong

- **Bump the version once per release, when you commit a change to any shipped file.** Change `CACHE` in `sw.js` (`piano-practice-v1` to `v2`) and `VERSION` in `app.js`. Without the cache bump, installed copies keep serving old files. If you add a file the page needs, add it to `SHELL` in `sw.js`.
- `sw.js` installs with `cache: 'reload'` on purpose so a new version never fills its cache from stale copies.
- Pages sits behind a CDN that can serve old files for about 10 minutes after a push. After deploying, hard reload once, then reload normally.
- **Never commit song charts or lyrics.** The repo is public. Songs live only in the browser's storage, and the backup file `songs-backup-*.json` is in `.gitignore`. Test data in `test/run.js` uses made-up "la la" lyrics, keep it that way.
- VexFlow draws an inline pixel width and height on its SVG. `drawStaff()` strips them so the staff scales to its box. Keep that.
- Browsers only allow sound after a tap. The audio context is created on first use in `audio.js`. Don't start sound on page load.
- Android registers share targets at install time, so a manifest change needs the app uninstalled and installed again to show up in the share sheet. The share target accepts `application/*` and `text/*` on purpose, because files shared from email or Drive can arrive with a generic MIME type.
- The Web MIDI API works in Chrome on Android but not in iOS Safari.

## Git and publishing

- Default branch is `main`. Check `git branch --show-current` and `git status --short` before editing.
- This repo should use the personal GitHub identity set locally in `.git/config`, like the exercise app. Do not change the global git config.
- Do not commit, push, or deploy unless the owner asks. Each is a separate request.
- Publishing is the owner pushing to GitHub; Pages builds from `main` at the repo root.
