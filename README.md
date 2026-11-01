# Itchy

A music-making toy for children aged 6–11 that runs in the browser. Tap the grid and a critter sings. Press play and
your loop goes round. Add critters, wear charms, roll the dice, record your own voice. No reading needed.

The goal, audience, design principles and constraints are in [`docs/BRIEF.md`](docs/BRIEF.md). How Itchy meets them,
and every design decision, is in [`docs/CONCEPT.md`](docs/CONCEPT.md).

## Run it

```sh
npm start
```

Then open <http://localhost:5173/>. You need Node 18 or newer. There is nothing to install: Itchy has no
dependencies and no build step. Any static file server works too, for example `python3 -m http.server`. Opening
`index.html` straight from disk won't work, because browsers block ES modules on `file://`.

Checks:

```sh
npm test         # unit tests: scheduler timing, data model, undo, storage, dice, recording clean-up
npm run check    # browser checks in headless Chromium (uses the pre-installed Playwright); screenshots go to test-output/
```

## How it plays

| You see | You do | You hear |
| --- | --- | --- |
| Big green ▶ | tap it (or press Space) | the loop goes round; the playhead lights up each column |
| The grid | tap or drag to paint notes, tap again to rub out | each note as you place it |
| Critters on the left | tap one to edit it; tap its speaker to send it to sleep | its voice; sleeping critters close their eyes |
| **+** | pick a new critter (drums, bells, pluck, bass, cloud or 🎤) | its first note |
| Sounds under the grid | choose what the critter sounds like, or press the red mic to record | a preview |
| Dice | a new pattern for this critter | the first bar of it |
| Charms: Echo, Space, moon↔sun | drag the big handle | the effect, live |
| Face | choose a mood (scale) for every tune critter | an arpeggio in that mood |
| Turtle ↔ rabbit | drag to change speed | a tick at the new speed |
| ↶ ↷ | undo or redo anything | a whoosh |
| Book | every song you've made, plus three examples | — |
| The Itchy critter (top bar) | tap it | a little hello in the current mood (it changes colour each time) |

Keyboard: Space plays and stops, arrow keys move around the grid, Enter places a note, Ctrl/⌘+Z undoes, Ctrl/⌘+Y
redoes, and keys 1–6 pick a critter.

## Architecture

```
index.html, styles.css      styles.css starts with the design tokens (colours, radii, shadows, motion)
assets/fonts/               Nunito (SIL Open Font License), bundled so it looks the same on every machine
src/main.js                 boot: open storage → load the last song → start the app
src/audio/
  scheduler.js              pure lookahead scheduler (no Web Audio inside it, so it can be tested on a fake clock)
  ticker.js                 Web Worker timer that only wakes the scheduler
  engine.js                 AudioContext, unlock on first touch, per-critter chains, reverb bus, limiter, visual event queue
  instruments.js            every sound, made in code (two drum kits, bells, pluck, bass, cloud, sample playback, reverb impulse)
  recorder.js + capture-worklet.js   mic capture with an AudioWorklet; trim, normalise, fade
src/model/                  plain data, no DOM or audio
  project.js                the JSON project format, migrate() (repairs anything), helpers
  scales.js, sounds.js      moods and the sound catalogue
  history.js                snapshot undo/redo with gesture grouping
  surprise.js               the dice's pattern generator
  examples.js               example songs
src/storage/storage.js      async storage interface: IndexedDB, else localStorage, else memory
src/ui/                     hand-written DOM, no framework
  store.js                  current project + undo + autosave; every edit goes through store.change()
  app.js                    layout, animation loop (visuals fire when the audio is heard), keyboard
  topbar.js, rail.js, grid.js, panel.js     the four screen regions
  plugins.js                features that plug into the regions: charms.js, experiments.js (mood, dice), mic.js, songbook.js,
                            delight.js (blinking, eyes that follow you, the mood-tinted room, the Itchy hello)
  critters.js, icons.js, widgets.js         original SVG art and small UI helpers
tests/                      unit tests (node --test) and tests/e2e/check.mjs (Playwright)
```

**Timing.** A worker ticks about every 25 ms. On each tick the scheduler queues every 16th-note step that falls in
the next 120 ms, at exact times on the audio clock. Tempo is read on every step, so a change lands on the next step
without drift. Swing only moves the off-beats. If the tab freezes, the scheduler skips ahead instead of firing a
burst of stale notes. The UI draws each step when its sound reaches the speakers: the scheduled time plus the
output latency.

**Data.** A song is plain JSON: tempo, swing, mood and key, plus a list of layers. Each layer has a sound, a colour, a
loop length, mute, volume, octave, effects, and notes `{s, r, len, vel}`. Recordings are raw PCM, stored separately by
id. Storage hides behind one async interface (`listProjects`, `loadProject`, `saveProject`, `saveRecording`, …), so
cloud saving can come later as one more class with the same methods. `migrate()` turns any input into a valid song,
which is also the hook for future format versions.

**Undo.** Every change records a snapshot of the song before it. A drag (a paint stroke or a slider) counts as one
step. Opening a different song starts a fresh history, but the old song stays in the songbook.

## Raising the ceiling: next steps

The model and engine already support most of these. What's missing is the gesture to reach them.

1. **Stretchy loops: per-critter loop length.** Drag the grid's right edge to make a loop 3–32 steps long. The engine
   and model already handle different lengths, and the *Spooky Clocks* example uses them. This is the cheapest big
   step up: polyrhythm and phasing come from one gesture.
2. **Stretchy notes and accents.** Drag a note sideways to hold it, and press and hold to make it louder or softer.
   `len` and `vel` are already in the data and played by the engine. This makes bass lines, pads and real melodies
   possible.
3. **Song sections.** Let a song hold several "scenes" (snapshots of which critters are awake and which pattern each
   plays), chained into a song strip. This fits the critter model (a scene is just more data per layer) and is the
   route to whole songs and to live performance.
4. **Voice kits.** Let a recording go onto one drum row, so a child can build a kit from their own claps and mouth
   noises. Add simple trimming by dragging the ends of the waveform.
5. **Charms as objects.** Make charms things you drag onto a critter, add more (wobble, bitcrush, reverse), and let a
   critter wear several in an order you can see.
6. **Chance and rules.** Give notes a probability, and add "dice with a lock" (keep the rhythm, reroll the pitches).
   Allow more moods and a choice of key. These make generative music possible without new modes.
7. **Export and share.** Render with `OfflineAudioContext` to WAV. Share a song as a JSON file or link (recordings
   travel as compressed audio). Add a `CloudStorage` class for accounts.
8. **A tidy songbook.** Names drawn as pictures, a bin with undo, and duplicating a song.

Items 1 and 2 come first because they unlock the most musical depth for the least new interface. Item 3 is next
because it turns loops into songs.

## Known rough edges

- Only one critter's grid is visible at a time. The others show as mini-maps.
- Long notes can only be made by the dice or found in the example songs. You can't stretch a note by hand yet.
- There is no volume control per critter (sleep, i.e. mute, only).
- Phones work, but the layout is designed for tablets, Chromebooks and laptops.
