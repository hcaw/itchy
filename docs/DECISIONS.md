# Decisions

Every choice the brief left open, with a one-line reason. Add new ones at the end of the right section.

## How Itchy is built

- **openDAW is the engine, and its project is the single source of truth** — it is how openDAW is designed to be
  used, and it gives undo, saving and sequencing on the audio thread for free. An earlier port (hcaw/itchy#10) that
  mirrored Itchy's own JSON into openDAW and kept a second engine needed far more code, and was closed unmerged.
- **openDAW is the only engine** — devices older than Safari or iPadOS 17.4, Chrome 119 or Firefox 121 see a friendly
  message instead of a fallback engine; two engines would double the work for a shrinking set of devices.
- **React 19 with Vite, not Next.js** — Itchy runs entirely in the browser with nothing to render on a server, and
  openDAW needs browser-only APIs.
- **TypeScript in strict mode, with `noUncheckedIndexedAccess`** — openDAW's API is large; types catch misuse early.
- **`src/daw/` owns booting and multi-box writes; reads go through adapter-based hooks** — the writes encode Itchy's
  rules and keep each action one undo step, while wrapping openDAW's whole read API would only rebuild a mirror.
- **AGPL-3.0-or-later for the whole project** — matches openDAW, which Itchy is built on. Versions up to `v1` were MIT.
- **Cloudflare for hosting** — free, sends the isolation headers from `public/_headers`, and previews every pull
  request. GitHub Pages can't send headers.
- **openDAW is upgraded by hand, one version per pull request** — its API changes often while it is at 0.0.x.
- **The private Claude web page copy of Itchy is retired** — openDAW can't run there, because those pages can't be
  cross-origin isolated.
- **A critter is a voice; the grid is one playing surface** — Itchy will gain ways of making music beyond a step
  sequencer, so the grid's region and notes live in `grid.ts`, apart from the critter itself.
- **Strict types, enforced** — strict TypeScript plus Oxlint's type-aware rules: no `any`, no `!`, no `as`. Oxlint,
  because typescript-eslint doesn't support TypeScript 7 yet, and Oxlint's type checker is built on it.
- **Design tokens live in the repo** — the code and its tests never depend on something outside it; the Claude
  Design System artifact is a view of them.
- **Setting up a new song is not undoable** — it runs in a bare box-graph transaction, so the first undo never
  removes the critter itself.

## Design (from v1, still standing)

These were decided while building v1 (the git tag `v1`) and still describe how Itchy should look and behave.

- **Name "Itchy"** — it's the repository's name and sounds like a toy.
- **One critter edited at a time, others shown as cards with mini-maps** — calmer than a full DAW view, still
  shows every layer at a glance.
- **Default mood is major pentatonic** — no two notes clash, so random tapping always sounds good.
- **16 steps of 16th notes, tempo 100 BPM, range 60–160** — familiar, danceable, slow enough to follow.
- **First song has a starter beat and an empty bells critter selected** — pressing play is never silent and the
  first tap on the grid makes a pretty note.
- **Mute is "sleep"** (eyes closed + speaker icon) — two cues, not colour alone.
- **Filter is one Dark↔Bright control with a neutral middle** — one handle, two directions, like a DJ filter.
- **Echo and Space are shared buses with per-critter send** — cheaper on Chromebooks than one reverb per critter.
- **Recorded sounds are tune sounds** (pitched across the grid rows) — one rule that covers singing *and*
  voice-drums (just use one row).
- **The songbook keeps every song**; opening an example or a new song never overwrites the current one.
- **Up to 6 critters per song** — enough for rich songs, stays calm on screen and light on Chromebooks.
- **Buttons act on pointer-down** — the sound comes the instant a finger lands. Controls that sit in scrolling
  areas (sleep buttons, songbook cards) act on click instead, so scrolling never triggers them. A global guard
  drops "ghost clicks" that land on a different button after the layout changes.
- **Taps and previews skip mute** — tapping a sleeping critter's grid still makes a sound; only the loop is quiet.
- **Recording pauses the music** — so the speakers don't leak into the mic; playback resumes afterwards.
- **Recordings: up to 4 s, trimmed and normalised; row 4 from the bottom plays them at their own pitch** — rows
  below sing lower, rows above sing higher.
- **"My sounds" are shared by all songs** (newest four shown) — a recording made for one song is useful in the next.
- **No song deleting yet** — the safest way to make losing work impossible; a bin with undo can come later.
- **The iPhone/iPad silent switch may mute Itchy** — the owner accepted this; an attempted workaround didn't help and
  was reverted.
- **Visual language: soft, bright and calm** — warm paper background, white surfaces with a gentle "toy key" lip and a
  soft shadow, one set of radii and shadows. Colour comes from the critters and
  notes, so the music is the most vivid thing on screen.
- **Nunito is bundled as a font file (`public/assets/fonts`, SIL Open Font License)** — a friendly rounded face that looks
  the same on every school machine; it's a static asset, not a dependency, and falls back to the system's rounded font.
- **Beat groups are shown by spacing, not shading** — a wider gap every four steps and a beat ruler under the grid
  that lights with the playhead; the old alternating tints made the grid look muddy.
- **Small delights, never in the way** — critters blink and follow your finger with their eyes, notes give off a few
  sparks as they land, a critter that falls asleep breathes out a few drifting Zs, the dice lands on a new face, and the background
  takes on the colour of the mood. None of them change the song, and all are off when the device asks for reduced motion.
- **The Itchy critter in the top bar says hello** — tapping it sings three notes in the current mood and changes its
  colour; a harmless thing to poke that teaches "everything here makes a sound". The wordmark shows on wide screens,
  the critter at every size. It's left out of the Tab order: it's a toy, not a control anyone needs.
- **The playhead is a soft bar of light** over the column being heard, plus a beat ruler — clearer than tinting
  cells, and it works the same for every critter colour.
- **A sleeping critter's grid has a dashed frame and a sleep badge** — so sleep is never shown by paler colour alone.
- **Each grid cell's gap is part of its tap area** (a transparent border), so the target is the full column pitch and
  a painted stroke has no dead strips between cells.
- **With more than three critters the rail's cards get smaller**, and the chosen or focused card scrolls into view.
- **Messages float just above the dock and never block taps** — they never cover the buttons they talk about.
- **The dock reads in one order everywhere**: sounds, tidy-up (rub out, remove), dice, charms; the same for Tab.
  Charms keep a usable length and move to their own row rather than shrinking.
- **Selection rings use the critter's colour darkened to at least 3:1 against the background** — so every colour (yellow included) shows clearly which critter you're editing.
- **The sounds tray scrolls sideways on tablets and phones** (with a fade on the side that has more) instead of
  wrapping, so the dock never grows an extra row and the dice never ends up alone.
- **Drum rows stay pad-shaped** (about 1.6 × a column's width, centred), so hits read as taps, not long bars.
- **The rail scrolls itself to show the chosen critter**, never using `scrollIntoView`, which would also move where the
  Tab key starts; the first Tab always goes to Play.
- **In the sounds tray a finger previews on touch-down and chooses on lift** — the tray scrolls sideways on small
  screens, so a swipe must never choose a sound or open the microphone; a mouse still acts instantly.
- **The playhead bar alone tints the column** — one moving element can't fall out of step with itself.
- **Phones on their side get a compact one-row dock** — the grid keeps as much height as possible.
- **Itchy has a web app manifest and home-screen icons, opening without browser chrome** — on a classroom tablet it
  then launches like any other app, with nothing around it for a child to tap by accident.
