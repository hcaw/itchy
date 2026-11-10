<p align="center">
  <a href="https://hcaw.github.io/itchy/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.png">
      <img src="docs/images/logo-light.png" alt="Itchy" width="320">
    </picture>
  </a>
</p>

<p align="center">
  <strong>A music-making toy for children aged 6–11, in the browser.</strong><br>
  Tap the grid and a critter sings. No reading, no sign-up, no tracking.
</p>

<p align="center">
  <a href="https://hcaw.github.io/itchy/"><strong>▶&nbsp;Play Itchy now</strong></a>
  &nbsp;·&nbsp;
  <a href="#run-it-yourself">Run it yourself</a>
  &nbsp;·&nbsp;
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <a href="https://github.com/hcaw/itchy/actions/workflows/ci.yml"><img src="https://github.com/hcaw/itchy/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/hcaw/itchy/actions/workflows/pages.yml"><img src="https://github.com/hcaw/itchy/actions/workflows/pages.yml/badge.svg" alt="Deploy"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-blue" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/dependencies-none-brightgreen" alt="No dependencies">
</p>

<p align="center">
  <img src="docs/images/screenshot-laptop.png" alt="Itchy on a laptop, playing the Robot Disco example: a glass play orb turned red for stop, a drum grid of glossy green, pink, orange and blue pads under a clear playhead, and glossy jelly critters (a robot, a blob, a star and a sleeping bell) down the side." width="860">
</p>

## What is it?

Press play and your loop goes round. Add critters, give them charms, roll the dice, record your own voice. Itchy is
a toy before it's a tool: a child makes a sound in the first few seconds and works out the rest by playing. There's
no tutorial, and no adult needed.

It follows the idea behind Scratch: **low floor, high ceiling, wide walls**. A first beat takes seconds, but a
curious child who keeps coming back can make music that is complex and genuinely their own: melodies, drum
patterns, polyrhythms, spooky soundscapes and songs built from their own claps and voice.

- **Made for small hands.** Big targets, touch, mouse or keyboard, on tablets, Chromebooks and laptops.
- **Sounds good by default.** Every note is in tune with the mood, so random poking makes music.
- **Nothing can go wrong.** Undo is always one tap away, and work saves itself.
- **Private by design.** Songs and recordings stay on the device. No accounts, adverts, analytics or tracking.
- **Light and open.** No dependencies, no build step, MIT licensed. Every sound and picture is made in code.

The goal, audience, design principles and constraints are in [`docs/BRIEF.md`](docs/BRIEF.md). How Itchy meets them,
and every design decision, is in [`docs/CONCEPT.md`](docs/CONCEPT.md).

<table>
  <tr>
    <td width="50%"><img src="docs/images/screenshot-tablet.png" alt="Itchy on a tablet held upright, playing the Rainy Day example: a melody of glossy bell notes on a colourful glass grid, with jelly drum, cloud and bell critters along the top."></td>
    <td width="50%">
      <img src="docs/images/screenshot-songbook.png" alt="The songbook, a frosted glass sheet: your own songs at the top and five example songs, Robot Disco, Rainy Day, Spooky Clocks, Sunshine Reggae and Echo Cave Dub, below, each showing its critters.">
      <br><br>
      <img src="docs/images/screenshot-phone.png" alt="Itchy on a phone on its side, showing the Spooky Clocks example with long held notes as glossy bars and an emerald glass play orb.">
    </td>
  </tr>
  <tr>
    <td align="center"><sub>Tablets: the critters move to the top</sub></td>
    <td align="center"><sub>The songbook, and a phone on its side</sub></td>
  </tr>
</table>

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
| Book | every song you've made, plus five examples | — |
| The Itchy critter (top bar) | tap it | a little hello in the current mood (it changes colour each time) |

Keyboard: Space plays and stops, arrow keys move around the grid, Enter places a note, Ctrl/⌘+Z undoes, Ctrl/⌘+Y
redoes, and keys 1–6 pick a critter.

## Run it yourself

```sh
git clone https://github.com/hcaw/itchy.git
cd itchy
npm start
```

Then open <http://localhost:5173/>. You need Node 18 or newer. There is nothing to install: Itchy has no
dependencies and no build step. Any static file server works too, for example `python3 -m http.server`. Opening
`index.html` straight from disk won't work, because browsers block ES modules on `file://`.

To put it on your own site, copy `index.html`, `manifest.webmanifest`, `styles.css`, `src/` and `assets/` to any
static host. The [Pages workflow](.github/workflows/pages.yml) does exactly this for <https://hcaw.github.io/itchy/>
on every push to `main`.

Every pull request also gets its own preview on Vercel, so you can try a change before it's merged: Vercel's bot
posts the link on the pull request. Each preview has its own web address, so songs saved there never touch the ones
on the live site. [`vercel.json`](vercel.json) turns off Vercel deploys from `main`, and
[`.vercelignore`](.vercelignore) uploads only the app's files.

Checks:

```sh
npm test             # unit tests: scheduler timing, data model, undo, storage, dice, recording clean-up, docs pictures
npm run check        # browser checks in headless Chromium (needs Playwright); screenshots go to test-output/
npm run screenshots  # re-render the logo, icons and README screenshots from the app (see "Screenshots" below)
```

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
scripts/serve.js            the tiny static server behind npm start
scripts/screenshots.mjs     renders the logo, icons, social card and README screenshots from the real app
tests/                      unit tests (node --test) and tests/e2e/check.mjs (Playwright)
docs/                       the brief, the concept and decisions log, and the README's pictures (docs/images/)
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

## Screenshots

The logo and screenshots above, the favicon (`assets/icon.svg`), the home-screen icons and the link-preview card
(`assets/social-card.png`) are all rendered from the running app by [`scripts/screenshots.mjs`](scripts/screenshots.mjs).
When the look of the app changes, run `npm run screenshots` and commit the new pictures with the change. The output
is deterministic, so if nothing visible changed, no files change. To add a screenshot, add it to `SHOTS` in the script
and show it here; `npm test` checks that every picture is both present and used.

## Contributing

Ideas, bug reports and pull requests are all welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) first: it
covers setting up, the project's rules (every action makes a sound, works without reading and can be undone), and
what a good pull request looks like. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

Found a security or privacy problem? Please report it privately, as described in [`SECURITY.md`](SECURITY.md).

## Licence

Itchy is [MIT licensed](LICENSE). The bundled [Nunito](https://github.com/googlefonts/nunito) font is under the
[SIL Open Font License](assets/fonts/OFL.txt). All critters, icons and sounds are original and made in code.
