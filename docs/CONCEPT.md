# Itchy — concept

A music toy for 6–11 year olds that grows into an instrument. Low floor, high ceiling, wide walls.

## Building blocks

There are only five ideas. Everything else is a combination of them.

1. **Critter (a layer).** A coloured creature that makes one kind of sound. It *is* a loop: it holds a grid
   of notes and plays it round and round. Tap its sleep button and it dozes off (mute); wake it and it sings again.
2. **Grid.** Time runs left to right in chunky steps; pitch runs bottom to top. A drum critter's rows are
   kit pieces (kick, snare, hat, clap). A tune critter's rows are notes from the current *mood* (scale), so any
   tap sounds musical. Tap or drag to paint notes; tap again to rub them out.
3. **Sound.** What a critter sounds like: a drum kit, bells, pluck, bass, cloud — or *your own voice*,
   recorded from the mic and played back at every pitch on the grid.
4. **Charms (effects).** Echo, Space (reverb) and Dark↔Bright (filter). Each has one big handle, works on one
   critter, and is heard live.
5. **Mood & dice.** The mood (happy, dreamy, spooky…) changes the scale of every tune critter at once. The dice
   invents a musical pattern for a critter — a starting point to pull apart.

**How they combine:** critters × sounds × grids × charms × moods × tempo. A kid who has learned "tap the grid" has
learned every critter; a kid who has learned "pull a charm" has learned every effect. New depth (longer loops,
note lengths, accents, song sections) is added as *properties of these same objects*, never as new modes.

## Screen

```
┌───────────────────────────────────────────────────────────────┐
│ [▶ PLAY]  turtle ──●── rabbit   [mood face]   [↶][↷]  [book]  │  top bar
├────────┬──────────────────────────────────────────────────────┤
│ critter│                                                      │
│ critter│            GRID of the selected critter              │
│ critter│      (big cells, beat groups of 4, moving playhead)  │
│   +    │                                                      │
├────────┴──────────────────────────────────────────────────────┤
│ [sounds: icons… 🎤]   [dice]   charms: Echo ▮  Space ▮  Dark↔Bright ▮ │  critter panel
└───────────────────────────────────────────────────────────────┘
```

On a portrait tablet the critter column becomes a row under the top bar. Every control is a big target
(≥ 44 px), is an icon first, has a spoken-style label for screen readers, and makes a sound when touched.

## First two minutes → fiftieth hour

- **0–10 s:** the app opens on a new song: a drum critter with a simple beat and an empty bells critter. A little
  hand taps the grid. The child taps a cell — *ding*. The play button breathes; they press it and the beat rolls.
- **10 s–2 min:** they paint notes and hear them in the loop, tap the drum critter and add claps, put a critter to
  sleep and wake it, drag Echo up, shake the dice, try the mic and hear their "boing" sung back at every pitch.
- **Hour 5–50:** mixing moods, building songs from 5–6 critters, voice-percussion, using the songbook examples as
  things to pull apart. The model already supports per-critter loop lengths (polyrhythm), note lengths,
  velocity and swing, so these can be surfaced as direct manipulations later (stretch a note, drag the loop's end)
  without changing the data or the engine.

## Technology & structure

Plain HTML/CSS/JavaScript ES modules, Web Audio API, **no runtime dependencies and no build step**. A tiny
zero-dependency Node static server (`npm start`) because ES modules don't load from `file://`. Tests use Node's
built-in test runner; browser checks use the pre-installed Playwright.

```
index.html, styles.css
src/audio/    engine.js (context, unlock, buses, voices), scheduler.js (pure lookahead), instruments.js,
              recorder.js, ticker.js (worker clock)
src/model/    project.js (JSON data model + migrate), scales.js, history.js (undo), surprise.js, examples.js
src/storage/  storage.js (async interface: IndexedDB → localStorage → memory)
src/ui/       app.js and one module per screen region; critters.js draws the SVG creatures
tests/        unit tests (scheduler timing, model, history) + Playwright checks
```

## Decisions log

- **Name "Itchy"** — it's the repository's name and sounds like a toy.
- **No framework, no build** — lightest setup; the UI is small enough for hand-written DOM code, and it runs on
  any school machine with a browser and Node (or any static server).
- **One critter edited at a time, others shown as cards with mini-maps** — calmer than a full DAW view, still
  shows every layer at a glance.
- **Default mood is major pentatonic** — no two notes clash, so random tapping always sounds good.
- **16 steps of 16th notes, tempo 100 BPM, range 60–160** — familiar, danceable, slow enough to follow.
- **First song has a starter beat and an empty bells critter selected** — pressing play is never silent and the
  first tap on the grid makes a pretty note.
- **Mute is "sleep"** (eyes closed + speaker icon) — two cues, not colour alone.
- **Filter is one Dark↔Bright control with a neutral middle** — one handle, two directions, like a DJ filter.
- **Echo and Space are shared buses with per-critter send** — cheaper on Chromebooks than one reverb per critter.
- **Recordings are stored as raw PCM in IndexedDB, referenced by id from the project JSON** — keeps the project
  small and serialisable; recordings are immutable so undo just swaps references.
- **Recorded sounds are tune sounds** (pitched across the grid rows) — one rule that covers singing *and*
  voice-drums (just use one row).
- **Undo = snapshots of the project JSON** (up to 100); a whole drag counts as one step.
- **The songbook keeps every song**; opening an example or a new song never overwrites the current one.
- **Timer is a Web Worker tick (fallback `setInterval`)** — only *wakes* the scheduler; all note times come from
  the audio clock with 120 ms lookahead.
- **Up to 6 critters per song** — enough for rich songs, stays calm on screen and light on Chromebooks.
- **Buttons act on pointer-down** — the sound comes the instant a finger lands. Controls that sit in scrolling
  areas (sleep buttons, songbook cards) act on click instead, so scrolling never triggers them. A global guard
  drops "ghost clicks" that land on a different button after the layout changes.
- **Taps and previews skip mute** — tapping a sleeping critter's grid still makes a sound; only the loop is quiet.
- **Recording pauses the music** — so the speakers don't leak into the mic; playback resumes afterwards.
- **Recordings: up to 4 s, trimmed and normalised; row 4 from the bottom plays them at their own pitch** — rows
  below sing lower, rows above sing higher.
- **"My sounds" are shared by all songs** (newest four shown) — a recording made for one song is useful in the next.
- **Synchronous localStorage backup on page hide** — an IndexedDB write started while closing may not finish;
  boot takes whichever copy is newer.
- **No song deleting yet** — the safest way to make losing work impossible; a bin with undo can come later.
- **Long notes are in the model and drawn as bars** — the dice and examples use them; a stretch gesture can come later.
- **Features are plugins** (mood, dice, charms, mic, songbook) that add controls to existing regions — new depth
  arrives the same way, without new modes.
- **Automated checks use full Chromium, not the headless shell** — the shell has no media capture, so the fake
  microphone can't work there. (With no microphone the app shows a friendly message, which was checked too.)
