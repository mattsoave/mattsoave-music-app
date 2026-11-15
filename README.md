# Piano practice

A small installable web app (PWA) for practicing piano. It works offline and keeps everything on your device.

- **Notes**: treble and bass clef flashcards. Notes you miss or answer slowly come up more often. Answer by naming the note or by tapping the key.
- **Keys**: key signature quizzes, and the chords in any key with Roman numerals. Tap a chord to hear it.
- **Ear**: intervals, chord sounds, chords in a key, and chord progressions.
- **Metronome**: tempo, beats per bar, subdivisions, tap tempo.
- **Songs**: paste a chord chart (such as from Ultimate Guitar), keep a link to the original page, and view it as chords and lyrics, chords only, or Roman numerals. Songs stay on your device. Use Export songs for a backup file.

## Run it locally

Serve the folder with any static server and open it in a browser, for example:

```
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000/`. Logic checks: `node test/run.js`.

## Publish

Push to GitHub and set Settings, Pages, Source to the `main` branch, root folder. Open the Pages URL on the phone and use "Install app" from the browser menu.
