# Architecture

Itchy is a React app on top of [openDAW](https://github.com/andremichelle/openDAW)'s engine. openDAW sequences and
plays the music on the audio thread; React draws the interface from openDAW's project.

## Stack

Vite, React 19 and strict TypeScript (with `noUncheckedIndexedAccess`). openDAW is installed from npm as
`@opendaw/studio-sdk`, pinned to an exact version. Hosting is Cloudflare Workers, serving the built app as static assets (`wrangler.jsonc`); it sends the two cross-origin isolation
headers openDAW needs (`public/_headers`); the dev and preview servers send them too (`vite.config.ts`).

```
src/daw/      booting openDAW, and every change to the song that touches more than one box:
              critter.ts (a voice), grid.ts (the step sequencer surface), transport.ts, song.ts
src/react/    components, and the hooks that read the song from openDAW
src/model/    pure logic with no openDAW in it: scales and moods (later the dice)
tests/e2e/    Playwright checks, Chromium and WebKit, mouse and touch
public/       static files, including _headers
```

## The song lives in openDAW

openDAW's project is the single source of truth. There is no separate Itchy model, store or copy of the song.

| Itchy              | openDAW                                                    |
| ------------------ | ---------------------------------------------------------- |
| A critter          | An audio unit with an instrument (and its charms): a voice |
| The critter's grid | A note region that loops over the critter's steps          |
| A note on the grid | A note event in that region                                |
| A charm            | A parameter of an effect device on the critter's unit      |
| Tempo, swing       | The timeline's BPM, the groove                             |
| Undo, redo         | `project.editing`                                          |
| Saving             | `project.toArrayBuffer()` (planned)                        |

**Writing.** Change the song only through functions in `src/daw/`. Each user action is exactly one
`project.editing.modify(...)`, so it is one undo step. A drag is one step too: its in-between changes are not
marked, only the last one is. Setting up a new song runs in a bare box-graph transaction, outside the undo history.

**Reading.** Components read the song through the hooks in `src/react/hooks.ts`, which are built on openDAW's
observables and its adapters (`project.boxAdapters`, `project.rootBoxAdapter`), the typed read model openDAW provides
for this. Two rules:

- **Subscribe narrowly**, so a change re-renders only what shows it. The playhead hook, for example, re-renders when
  the step changes, not on every animation frame.
- **Never hold on to boxes** in React state or props beyond a render. Undo can delete them. Look critters up from
  `rootBoxAdapter.audioUnits` each time.

The walking skeleton doesn't fully follow these rules yet: it re-renders on every edit and passes a critter handle
as a prop. The next slice fixes both (see [`ROADMAP.md`](ROADMAP.md)).

## Playing surfaces

A critter is a voice; the grid is only one way to play it. Itchy will gain other ways of making music that don't
fit a step sequencer (live playing, drawing, gestures and more), so nothing about a critter may assume the grid:

- `critter.ts` knows the voice: its unit, its instrument, and sounding a note now (`audition`).
- `grid.ts` knows the step sequencer: its looping region, its notes and its steps.
- A new surface gets its own module beside `grid.ts`. openDAW already supports what these need: live notes
  (`engine.noteSignal`), recording notes and audio into regions, clips and automation.

**Timing** comes only from openDAW's engine: never `setTimeout` or `requestAnimationFrame` for notes.

## Sounds

Prefer openDAW's own instruments and effects to new sample files: Korpus (physical modelling), Vaporisateur
(subtractive), Cubed (acid bass), Neon (phase distortion), Nano and Playfield (samplers), Apparat (an instrument
scripted in JavaScript); Delay, Dattorro Reverb, Revamp (EQ) and more for charms.

## Types

Strict TypeScript, with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and
`noPropertyAccessFromIndexSignature` on, and Oxlint's type-aware rules (`npm run lint`) on top. No `any`, no
non-null assertions (`!`), no type assertions (`as`), no `@ts-` comments: narrow with checks, `Option.unwrap`, or
openDAW's typed adapters instead. The one exception is the soundfont stand-in in `src/daw/boot.ts`, which explains
itself.

## Tests

- **Unit** (Vitest): pure logic in `src/model/`.
- **End to end** (Playwright, against the production build): every interaction with a mouse and with touch, that it
  makes a sound (measured at the engine's output), that one undo reverses it, and that the console stays clean.
- **Planned**: openDAW's offline renderer to check the music itself (notes start where they should, nothing clips).

## Upgrading openDAW

Upgrade one version per pull request, after reading the migration notes in
[naomiaro/opendaw-test](https://github.com/naomiaro/opendaw-test/tree/main/changelogs). That repository has no
licence: read it, don't copy from it. Dependabot leaves openDAW alone for this reason.

## History

The first version of Itchy (the git tag `v1`) was hand-written Web Audio with no build step. It is the reference for
how Itchy should behave, never code to convert: [`reference/v1.md`](reference/v1.md) lists what it did, with
screenshots, and the live copy stays at <https://hcaw.github.io/itchy/>.
