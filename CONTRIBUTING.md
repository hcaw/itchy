# Contributing to Itchy

Thank you for helping! Itchy is a music-making toy for children aged 6–11, and every change should make it more fun,
more musical or easier to understand without reading. This guide covers how to get set up, the rules the project
follows, and what a good pull request looks like.

By taking part you agree to follow the [code of conduct](CODE_OF_CONDUCT.md). In particular, never share personal
information about a child anywhere in this project.

## Before you start

Read these first. They're short, and they explain why Itchy looks and works the way it does:

1. [`docs/BRIEF.md`](docs/BRIEF.md): the goal, the audience, the design principles and the constraints.
2. [`docs/CONCEPT.md`](docs/CONCEPT.md): the building blocks (critters, grid, sounds, charms, mood and dice), and
   the log of every design decision.
3. [`README.md`](README.md): the architecture and the ranked next steps.

For anything bigger than a small fix, please [open an issue](https://github.com/hcaw/itchy/issues/new/choose) first
so we can agree on the idea before you build it.

## Set up

You need [Node.js](https://nodejs.org/) 18 or newer (the version in [`.nvmrc`](.nvmrc) is what CI uses). There is
nothing to install: Itchy has no dependencies and no build step.

```sh
git clone https://github.com/hcaw/itchy.git
cd itchy
npm start          # http://localhost:5173/
```

Edit any file and reload the page.

## Checks

```sh
npm test           # unit tests: scheduler timing, data model, undo, storage, dice, recording clean-up
npm run check      # browser checks in headless Chromium; screenshots go to test-output/
```

`npm run check` needs [Playwright](https://playwright.dev/) with Chromium. It isn't a dependency of Itchy, so install
it once, globally or anywhere Node can find it:

```sh
npm install --no-save playwright && npx playwright install chromium
```

Run both before you open a pull request, and look at the screenshots in `test-output/`: the checks catch broken
behaviour, but only your eyes catch a layout that has gone wrong. CI runs both on every pull request.

## The rules

These keep Itchy simple on the surface and deep underneath.

- **Grow depth from the existing building blocks.** Add depth as a property or gesture on a critter, grid, sound or
  charm, never as a new mode, settings menu, form, dropdown or numeric field. New features plug in through
  `src/ui/plugins.js`.
- **Every action makes a sound immediately, works without reading, and is undoable.** Project changes go through
  `store.change(fn, gestureKey)`; call `store.seal()` when a drag ends.
- **Keep the project format plain JSON.** Add new fields with defaults in `createLayer()`/`createProject()`, and clamp
  them in `migrate()` so old saves still load.
- **Musical timing comes only from the scheduler on the audio clock** (`src/audio/scheduler.js`). Never use timers
  for note timing.
- **No tracking or analytics. No new runtime dependencies or build tools** without a strong reason logged in the
  decisions list.
- **Only original or licensed art and sounds.** Synthesise sounds in code. Never reuse Scratch's characters, art or
  sounds.
- **When the brief leaves a choice open**, pick what's most fun and intuitive for a seven-year-old and still rewarding
  for an eleven-year-old, and add it to the decisions log in `docs/CONCEPT.md` with a one-line reason.

When you add an interaction, extend [`tests/e2e/check.mjs`](tests/e2e/check.mjs) so it's checked with mouse and
touch, makes a sound, and undoes in one step.

## Screenshots and the logo

The logo and screenshots in the README, the favicon, the home-screen icons and the link-preview image are all
rendered from the real app by one script:

```sh
npm run screenshots
```

**If your change alters how the app looks, run it and commit the updated pictures in the same pull request.** That
includes layout, colours, critters, icons, the top bar, the dock, the songbook, the examples, and the brand critter
or wordmark. The script is deterministic, so if nothing visible changed, nothing in `git status` changes either.

To add a screenshot, add an entry to `SHOTS` in [`scripts/screenshots.mjs`](scripts/screenshots.mjs) and show it in
the README. `npm test` fails if the README points at a picture that doesn't exist, or if a picture in `docs/images/`
isn't used.

## Style

- Plain modern JavaScript (ES modules), hand-written DOM, no framework. Match the style of the file you're in.
- Two-space indentation, LF line endings, UTF-8 (see [`.editorconfig`](.editorconfig)).
- Comments say *why*, in plain English. Write UK English in docs, comments and anything a child might see.
- Commit messages: a short summary in the imperative ("Let a critter wear two charms"), then a body explaining why
  if it isn't obvious.

## Pull requests

- Keep each pull request to one idea.
- Fill in the template: what a child can do now, and why.
- Make sure CI is green. If the browser checks fail, the screenshots from the run are attached to it as an artifact.

## Licence

Itchy is [MIT licensed](LICENSE). By contributing, you agree that your contributions are licensed the same way, and
that any art or sound you add is your own original work or licensed for this use.
