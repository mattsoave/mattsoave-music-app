# Piano practice

A small installable web app (PWA) for practicing piano. It works offline and keeps everything on your device.

- **Read**: notes, intervals and chords (with inversions) on the treble or bass staff, plus short made-up melodies with 8th notes, rests and triplets. Play a melody note by note to have it checked, or switch to Just practice to play it over and over with nothing checked. Notes you miss come up more often. Answer by tapping or by playing on a MIDI keyboard.
- **Keys**: key signature quizzes, and the chords in any key with Roman numerals. Tap a chord to hear it.
- **Ear**: intervals, chord sounds, chords in a key, and chord progressions.
- **Metronome**: tempo, beats per bar, subdivisions, tap tempo, and a looping backing chord progression (pick a key and progression) to improvise over, with the click optional.
- **MIDI**: connect a USB keyboard to answer quizzes by playing, see the keys you press, and choose the instrument sound for the whole app.
- **Songs**: paste a chord chart (such as from Ultimate Guitar), keep a link to the original page, and view it as chords and lyrics, chords only, or Roman numerals. Songs stay on your device. Use Export songs for a backup file.

## Run it locally

Serve the folder with any static server and open it in a browser, for example:

```
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000/`. Logic checks: `node test/run.js`.

## Publish

Push to GitHub and set Settings, Pages, Source to the `main` branch, root folder. Open the Pages URL on the phone and use "Install app" from the browser menu.
