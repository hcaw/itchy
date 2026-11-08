# Itchy

A music-making toy for children aged 6–11, in the browser, built on the openDAW engine with React and TypeScript.
The first version (hand-written Web Audio, no build) is the git tag `v1`: use it as the reference for how a feature
should behave, never as code to convert.

## Read first

1. `docs/BRIEF.md`: the goal, audience, design principles and constraints. Everything you build serves it.
2. `docs/CONCEPT.md`: Itchy's building blocks (critters, grid, sounds, charms, moods, dice).
3. `docs/ARCHITECTURE.md`: how the song lives in openDAW, and how the code writes and reads it.
4. `docs/ROADMAP.md`: the slices built and still to do. `docs/DECISIONS.md`: every decision, with its reason.
5. `docs/reference/v1.md`: what v1 did and how it looked, the target a slice works towards. Tick a feature there when
   a slice brings it back.

## Stack

Vite, React 19, strict TypeScript, and openDAW (`@opendaw/studio-sdk`, pinned to an exact version). Hosted on
Cloudflare Workers (static assets, `wrangler.jsonc`) with the isolation headers in `public/_headers`. Licence: AGPL-3.0-or-later.

## Rules

- **openDAW's project is the single source of truth.** Never keep a copy of the song in React state or anywhere
  else. Write it through `src/daw/` functions (each user action is one `project.editing.modify`, so one undo step).
  Components read it through the hooks in `src/react/hooks.ts`, built on openDAW's adapters and observables; they
  never create or delete boxes, and never hold boxes beyond a render (undo can delete them).
- **Subscribe narrowly**, so a change re-renders only what shows it (the playhead re-renders per step, not per frame).
- **Work with the type system, not against it.** No `any`, no non-null assertions (`!`), no type assertions (`as`),
  no `@ts-` comments; narrow with checks, `Option.unwrap` or openDAW's typed adapters. `npm run lint` enforces this.
- **A critter is a voice; the grid is one way to play it.** Keep grid logic in `src/daw/grid.ts`; never make a
  critter depend on the grid (other playing surfaces are coming).
- **Every action makes a sound immediately, works without reading, and is undoable** (from the brief).
- **Musical timing comes only from openDAW's engine.** Never time notes with `setTimeout` or `requestAnimationFrame`.
- **Grow depth from the building blocks first** (critters, grid, sounds, charms) as a property or gesture, and use
  direct manipulation rather than settings menus, forms, dropdowns or numeric fields. New modes and new ways of
  playing are welcome when they earn their place.
- **No tracking or analytics. Only original or licensed art and sounds.** Never reuse Scratch's characters, art or
  sounds. Prefer openDAW's own instruments and effects to new sample files.
- **Upgrade openDAW deliberately**: one version per PR, after reading the migration notes in
  [naomiaro/opendaw-test](https://github.com/naomiaro/opendaw-test/tree/main/changelogs). That repo has no licence:
  read it, don't copy from it.
- **When the brief leaves a choice open**, pick what's most fun and intuitive for a seven-year-old and still
  rewarding for an eleven-year-old, and log it in `docs/DECISIONS.md` with a one-line reason.

## Commands

```sh
npm run dev        # http://localhost:5173/ (isolated, so openDAW runs)
npm run typecheck
npm run lint       # Oxlint with type-aware rules
npm test           # Vitest unit tests
npm run e2e        # Playwright against the production build, Chromium and WebKit, mouse and touch
npm run build
```

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run e2e` before committing. In this cloud container, run e2e with
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e -- --project=chromium --project=chromium-touch` (WebKit runs
in CI). When you add an interaction, extend `tests/e2e/` so it is checked with mouse and touch, makes a sound, and
undoes in one step. When the look changes, look at a screenshot before committing.
