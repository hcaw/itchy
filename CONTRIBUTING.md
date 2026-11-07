# Contributing to Itchy

Thank you for helping. Itchy is a music toy for children aged 6–11, so every change is judged by one question: does
it make Itchy more fun and more intuitive for a seven-year-old, while staying rewarding for an eleven-year-old?

Itchy is being rebuilt on openDAW, React and TypeScript. Read [`docs/REBUILD.md`](docs/REBUILD.md) for the plan and
the slices still to do, and [`docs/BRIEF.md`](docs/BRIEF.md) for the goal.

## Set up

You need Node.js 22.12 or later.

```sh
npm install
npm run dev
npx playwright install --with-deps chromium webkit   # once, for npm run e2e
```

## Checks

Before you open a pull request, run:

```sh
npm run typecheck
npm test
npm run e2e
```

CI runs the same checks, in Chromium and WebKit, with a mouse and with touch.

## The rules

- **Every action makes a sound immediately, works without reading, and is undoable.**
- **openDAW's project is the single source of truth.** Change the song through the functions in `src/daw/`, one
  `editing.modify` per user action; read it back from openDAW's boxes and observables.
- **Musical timing comes only from openDAW's engine**, never from timers.
- **Grow depth from Itchy's building blocks** (critters, grid, sounds, charms), never with new modes, menus, forms
  or number fields.
- **No tracking or analytics. Only original or licensed art and sounds.**

When you add an interaction, add a Playwright check that does it with a mouse and with touch, hears a sound, and
undoes it in one step.

## Pull requests

Keep each pull request to one change, say what a child will notice, and include a screenshot if the look changes.

## Licence

By contributing, you agree that your contributions are licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE).
