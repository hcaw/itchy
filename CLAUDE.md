# Itchy

A music-making toy for children aged 6–11, in the browser, being rebuilt on the openDAW engine with React and
TypeScript. v1 (hand-written Web Audio, no build) is the git tag `v1`: use it as the reference for behaviour, never as
code to convert.

## Read first

1. `docs/BRIEF.md`: the goal, audience, design principles and constraints. Everything you build serves it.
2. `docs/REBUILD.md`: how the rebuild is structured, the slices still to do, and the decisions made so far.
3. `docs/CONCEPT.md`: Itchy's building blocks (critters, grid, sounds, charms, moods, dice) and the v1 decisions log.

## Stack

Vite, React 19, strict TypeScript, and openDAW (`@opendaw/studio-sdk`, pinned to an exact version). Hosted on
Cloudflare with the isolation headers in `public/_headers`. Licence: AGPL-3.0-or-later.

## Rules

- **openDAW's project is the single source of truth.** Never keep a copy of the song in React state or anywhere
  else. Write it through `src/daw/` functions (each user action is one `project.editing.modify`, so one undo step);
  read it back from boxes and openDAW's observables, through the hooks in `src/react/hooks.ts`.
- **`src/daw/` holds the openDAW know-how:** booting, and every write that touches more than one box. Components
  may read boxes and observables directly; they should not create or delete boxes themselves.
- **Every action makes a sound immediately, works without reading, and is undoable** (from the brief).
- **Musical timing comes only from openDAW's engine.** Never time notes with `setTimeout` or `requestAnimationFrame`.
- **Grow depth from the existing building blocks** (critters, grid, sounds, charms): a property or gesture, never a
  new mode, settings menu, form, dropdown or numeric field.
- **No tracking or analytics. Only original or licensed art and sounds.** Never reuse Scratch's characters, art or
  sounds. Prefer openDAW's own instruments and effects to new sample files.
- **Upgrade openDAW deliberately**: one version per PR, after reading the migration notes in
  [naomiaro/opendaw-test](https://github.com/naomiaro/opendaw-test/tree/main/changelogs). That repo has no licence:
  read it, don't copy from it.
- **When the brief leaves a choice open**, pick what's most fun and intuitive for a seven-year-old and still
  rewarding for an eleven-year-old, and log it in `docs/REBUILD.md` with a one-line reason.

## Commands

```sh
npm run dev        # http://localhost:5173/ (isolated, so openDAW runs)
npm run typecheck
npm test           # Vitest unit tests
npm run e2e        # Playwright against the production build, Chromium and WebKit, mouse and touch
npm run build
```

Run `npm run typecheck`, `npm test` and `npm run e2e` before committing. In this cloud container, run e2e with
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e -- --project=chromium --project=chromium-touch` (WebKit runs
in CI). When you add an interaction, extend `tests/e2e/` so it is checked with mouse and touch, makes a sound, and
undoes in one step. When the look changes, look at a screenshot before committing.
