# Itchy

A music-making toy for children aged 6–11, in the browser. Plain HTML/CSS/JS ES modules, Web Audio, no dependencies,
no build step.

## Read first

1. `docs/BRIEF.md`: the goal, audience, design principles, feature vision and constraints. Everything you build serves it.
2. `docs/CONCEPT.md`: the building blocks (critters, grid, sounds, charms, mood and dice) and the decisions log.
3. `README.md`: how to run it, the architecture, and the ranked next steps.

## Rules

- **Grow depth from the existing building blocks.** Add depth as a property or gesture on a critter, grid, sound or
  charm, never as a new mode, settings menu, form, dropdown or numeric field. New features plug in through
  `src/ui/plugins.js`.
- **Every action makes a sound immediately, works without reading, and is undoable.** Project changes go through
  `store.change(fn, gestureKey)`; call `store.seal()` when a drag ends.
- **Keep the project format plain JSON.** Add new fields with defaults in `createLayer()`/`createProject()`, and clamp
  them in `migrate()` so old saves still load.
- **Musical timing comes only from the scheduler on the audio clock** (`src/audio/scheduler.js`). Never use timers for
  note timing.
- **No tracking or analytics. No new runtime dependencies or build tools** without a strong reason logged in the
  decisions list.
- **Only original or licensed art and sounds**; synthesise sounds in code. Never reuse Scratch's characters, art or
  sounds.
- **When the brief leaves a choice open**, pick what's most fun and intuitive for a seven-year-old and still rewarding
  for an eleven-year-old. Add it to the decisions log in `docs/CONCEPT.md` with a one-line reason.

## Commands

```sh
npm start        # http://localhost:5173/
npm test         # unit tests (scheduler timing, model, undo, storage, dice, recording)
npm run check    # browser checks in headless Chromium; screenshots in test-output/ (look at them)
```

Run both test commands before committing. When you add an interaction, extend `tests/e2e/check.mjs` so it is checked
with mouse and touch, makes a sound, and undoes in one step.
