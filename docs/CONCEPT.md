# Itchy — concept

A music toy for 6–11 year olds that grows into an instrument. Low floor, high ceiling, wide walls.

## Building blocks

There are only five ideas. Everything else is a combination of them.

1. **Critter (a layer).** A coloured creature that makes one kind of sound. It _is_ a loop: it holds a grid
   of notes and plays it round and round. Tap its sleep button and it dozes off (mute); wake it and it sings again.
2. **Grid.** Time runs left to right in chunky steps; pitch runs bottom to top. A drum critter's rows are
   kit pieces (kick, snare, hat, clap). A tune critter's rows are notes from the current _mood_ (scale), so any
   tap sounds musical. Tap or drag to paint notes; tap again to rub them out.
3. **Sound.** What a critter sounds like: a drum kit, bells, pluck, bass, cloud — or _your own voice_,
   recorded from the mic and played back at every pitch on the grid.
4. **Charms (effects).** Echo, Space (reverb) and Dark↔Bright (filter). Each has one big handle, works on one
   critter, and is heard live.
5. **Mood & dice.** The mood (happy, dreamy, spooky…) changes the scale of every tune critter at once. The dice
   invents a musical pattern for a critter — a starting point to pull apart.

**How they combine:** critters × sounds × grids × charms × moods × tempo. A kid who has learned "tap the grid" has
learned every critter; a kid who has learned "pull a charm" has learned every effect. New depth (longer loops,
note lengths, accents, song sections) is added as _properties of these same objects_ where it can be; new modes and
ways of playing can join them over time.

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
  hand taps the grid. The child taps a cell — _ding_. The play button breathes; they press it and the beat rolls.
- **10 s–2 min:** they paint notes and hear them in the loop, tap the drum critter and add claps, put a critter to
  sleep and wake it, drag Echo up, shake the dice, try the mic and hear their "boing" sung back at every pitch.
- **Hour 5–50:** mixing moods, building songs from 5–6 critters, voice-percussion, using the songbook examples as
  things to pull apart. openDAW already supports per-critter loop lengths (polyrhythm), note lengths, velocity
  and swing, so these can be surfaced as direct manipulations (stretch a note, drag the loop's end).

How Itchy is built is in [`ARCHITECTURE.md`](ARCHITECTURE.md); the decisions behind it are in
[`DECISIONS.md`](DECISIONS.md).
