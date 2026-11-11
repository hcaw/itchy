# Contributing to Itchy

Thank you for helping. Itchy is a music toy for children aged 6–11, so every change is judged by one question: does
it make Itchy more fun and more intuitive for a seven-year-old, while staying rewarding for an eleven-year-old?

Read [`docs/BRIEF.md`](docs/BRIEF.md) for the goal, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the code
works, and [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's still to do.

## Set up

You need Node.js 22.12 or later. The version CI uses is in `.node-version`, which fnm, mise, nodenv and asdf read
automatically; with nvm, run `nvm use $(cat .node-version)`.

```sh
npm install
npm run dev
npx playwright install --with-deps chromium webkit   # once, for npm run e2e
```

## Formatting

[Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) formats every file: code, CSS, HTML, JSON, YAML and
Markdown. Run `npm run fmt` before you commit, or let your editor do it on save. In VS Code, install the recommended
Oxc extension (`oxc.oxc-vscode`); this repository's `.vscode/settings.json` already makes it the formatter. The same
extension shows Oxlint's warnings as you type. The settings are in `.oxfmtrc.json`, plus indentation and line endings
from `.editorconfig`.

## Checks

Before you open a pull request, run:

```sh
npm run typecheck
npm run lint
npm run fmt:check
npm test
npm run e2e
```

CI runs the same checks, in Chromium and WebKit, with a mouse and with touch.

## The rules

- **Every action makes a sound immediately, works without reading, and is undoable.**
- **openDAW's project is the single source of truth.** Change the song through the functions in `src/daw/`, one
  `editing.modify` per user action; read it back through the hooks in `src/react/hooks.ts`.
- **Musical timing comes only from openDAW's engine**, never from timers.
- **Grow depth from Itchy's building blocks first** (critters, grid, sounds, charms), with direct manipulation
  rather than menus, forms or number fields. New modes and ways of playing are welcome when they earn their place.
- **No tracking or analytics. Only original or licensed art and sounds.**

When you add an interaction, add a Playwright check that does it with a mouse and with touch, hears a sound, and
undoes it in one step.

## Pull requests

Keep each pull request to one change, say what a child will notice, and include a screenshot if the look changes.

## Licence

By contributing, you agree that your contributions are licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE).
