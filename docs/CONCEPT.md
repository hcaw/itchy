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
- **Echo and Space are shared buses with per-critter send** — much cheaper than one reverb per critter, and they mix the critters into one shared room.
- **Recordings are stored as raw PCM in IndexedDB, referenced by id from the project JSON** — keeps the project
  small and serialisable; recordings are immutable so undo just swaps references.
- **Recorded sounds are tune sounds** (pitched across the grid rows) — one rule that covers singing *and*
  voice-drums (just use one row).
- **Undo = snapshots of the project JSON** (up to 100); a whole drag counts as one step.
- **The songbook keeps every song**; opening an example or a new song never overwrites the current one.
- **Timer is a Web Worker tick (fallback `setInterval`)** — only *wakes* the scheduler; all note times come from
  the audio clock with 120 ms lookahead.
- **Up to 6 critters per song** — enough for rich songs, and the screen stays calm.
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
- **The iPhone/iPad silent switch may mute Itchy** — the owner accepted this; an attempted workaround didn't help and
  was reverted.
- **The goal lives in `docs/BRIEF.md` and working rules in `CLAUDE.md`** — so work can continue in a new session
  without the original prompt.
- **Low-end devices are not a target** (owner's call) — Itchy aims at typical modern tablets and laptops, so visual
  polish comes first; steady audio timing still matters everywhere.
- **Visual language: luminous glass over a mood-coloured glow** — the room glows softly in the mood's colours, and
  every surface is translucent glass with a bright rim and soft violet-tinted shadows, with one set of radii and
  shadows (tokens at the top of `styles.css`). It feels magical to a seven-year-old and polished to an eleven-year-old.
  Colour comes from the critters and notes (glossy candy pills that glow in their own colour), so the music stays the
  most vivid thing on screen; the glass adds shine and depth without adding colour.
- **Real backdrop blur only on layers that float over content** (the songbook's veil, popovers, toast, recording) —
  over the smooth glow, blur on the always-visible panels changed under 2% of pixels, and the glow drifts slowly, so
  blurring the top bar, rail, grid and dock every frame would cost tablets GPU time for nothing visible. The playhead
  is the one small lens on the grid (brighten and saturate, no blur, no tint): each cell under it lights up in its own
  colour, so a warm row never greys under a cool critter's playhead; the critter's colour lives only in its ring.
- **Darker shades mix towards black in oklab, never towards violet or in oklch** — notes, row marbles and critter
  edges keep their hue (lime stays lime, orange stays orange, yellow stays golden), so a six-year-old can still tell
  the rows apart by colour.
- **Sparkles belong to things, not the room** — glints sit on the orb's highlight, the critters' gloss and new notes;
  loose sparkles in the background showed through the glass as smudges and read as dust.
- **Critters are glossy jelly sweets** — gradient bodies lit from above, a glow through the base, a glassy rim and a
  crisp highlight, with a tonal edge instead of a dark cartoon outline; asleep critters turn to frosted lavender glass.
  Every critter blushes the same candy pink (mixing in the body colour made blue cheeks look bruised), and the cheeks
  are clipped to the body, so a blush never floats outside a narrow shape. The top is only lightly mixed towards white,
  so a red critter stays candy red rather than salmon; the sheen supplies the shine.
  They look like premium toys a child wants to touch and match the glossy notes. Still drawn in code from one colour
  (`--c`), with no SVG filters, so dozens on screen stay light on tablets.
- **Play is a glass orb (emerald = go, candy red = stop) in a clear bezel, and the triangle morphs into the square** —
  it is the hero control, so it gets the richest material; shape still carries the meaning for colour-blind children.
  Slider thumbs are small glass lenses and the other controls (and songbook cards) are glass panes, so the orb and
  the critters stay the most vivid things on screen. The songbook is a translucent sheet over a frosted veil.
  With motion reduced, the invitation to press play is two still rings of the orb's light, so it still reads.
- **No UI, animation or shader library for the new look** — gradients, `color-mix()`, `@property`, `mask-composite`
  and a little `backdrop-filter` reach it in plain CSS and inline SVG: no dependency or build step, the same look on
  iPad Safari (SVG-displacement "liquid glass" is Chromium-only), and a still image that is just as rich under reduced
  motion (a WebGL aurora would vanish from the screenshots and cost GPU time all the time).
- **Nunito is bundled as a font file (`assets/fonts`, SIL Open Font License)** — a friendly rounded face that looks
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
- **Selection rings use the critter's colour darkened to at least 3:1 against the background** — computed in
  `edgeColor()`, so every colour (yellow included) shows clearly which critter you're editing.
- **The sounds tray scrolls sideways on tablets and phones** (with a fade on the side that has more) instead of
  wrapping, so the dock never grows an extra row and the dice never ends up alone.
- **Drum rows stay pad-shaped** (about 1.6 × a column's width, centred), so hits read as taps, not long bars.
- **The rail scrolls itself to show the chosen critter**, never using `scrollIntoView`, which would also move where the
  Tab key starts; the first Tab always goes to Play.
- **In the sounds tray a finger previews on touch-down and chooses on lift** — the tray scrolls sideways on small
  screens, so a swipe must never choose a sound or open the microphone; a mouse still acts instantly.
- **The playhead bar alone tints the column** — one moving element can't fall out of step with itself.
- **Phones on their side get a compact one-row dock** — the grid keeps as much height as possible.
- **The README's logo and screenshots, the favicon and the link-preview card are rendered from the app by a script**
  (`npm run screenshots`) — hand-made pictures drift from the real thing; a deterministic script means they're
  refreshed in one command, and a test catches a picture that's missing or unused.
- **Itchy has a web app manifest and home-screen icons, opening without browser chrome** — on a classroom tablet it
  then launches like any other app, with nothing around it for a child to tap by accident.
