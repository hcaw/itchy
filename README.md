<p align="center">
  <img src="public/assets/icon.svg" alt="" width="96">
</p>

<h1 align="center">Itchy</h1>

<p align="center">
  <strong>A music-making toy for children aged 6–11, in the browser.</strong><br>
  Tap the grid and a critter sings. No reading, no sign-up, no tracking.
</p>

<p align="center">
  <a href="https://github.com/hcaw/itchy/actions/workflows/ci.yml"><img src="https://github.com/hcaw/itchy/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-AGPL--3.0-blue" alt="AGPL-3.0 licence"></a>
</p>

> **Early days.** Itchy now runs on the [openDAW](https://github.com/andremichelle/openDAW) engine, with React and
> TypeScript, and its features are coming back one at a time ([`docs/ROADMAP.md`](docs/ROADMAP.md)). The finished
> first version, with hand-written Web Audio, is the [`v1` tag](https://github.com/hcaw/itchy/tree/v1).

## What is it?

Press play and your loop goes round. Add critters, give them charms, roll the dice, record your own voice. Itchy is
a toy before it's a tool: a child makes a sound in the first few seconds and works out the rest by playing.

It follows the idea behind Scratch: **low floor, high ceiling, wide walls**. A first beat takes seconds, but a
curious child who keeps coming back can make music that is complex and genuinely their own. The goal, audience and
design principles are in [`docs/BRIEF.md`](docs/BRIEF.md); the building blocks are in
[`docs/CONCEPT.md`](docs/CONCEPT.md).

## Run it yourself

You need [Node.js](https://nodejs.org/) 22.12 or later.

```sh
npm install
npm run dev
```

Then open http://localhost:5173/. The dev server sends the two headers openDAW needs (cross-origin isolation for
`SharedArrayBuffer`), so use it rather than opening `index.html` directly.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built site |
| `npm run lint` | Oxlint, with type-aware rules |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser checks (Playwright: Chromium and WebKit, mouse and touch) |

## How it's built

- **[openDAW](https://github.com/andremichelle/openDAW)** plays everything: its WebAssembly engine sequences the music
  on the audio thread, and its project (a graph of "boxes") is the single source of truth for the song, with undo
  built in.
- **React 19** draws the interface from openDAW's project and observables.
- **TypeScript** in strict mode, built with **Vite**.

```
src/daw/      booting openDAW, critters, the grid, the transport
src/react/    the React app, and hooks that turn openDAW's observables into React state
src/model/    pure logic: scales and moods
tests/e2e/    Playwright checks
public/       static files, including _headers for Cloudflare
```

More in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); every decision and its reason is in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## Contributing

Ideas, bug reports and pull requests are welcome: see [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[code of conduct](CODE_OF_CONDUCT.md). Report security or privacy problems privately, as described in
[`SECURITY.md`](SECURITY.md).

## Licence

Itchy is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE), like openDAW, which it is
built on. Versions up to the `v1` tag were MIT licensed. The bundled [Nunito](https://github.com/googlefonts/nunito)
font is under the [SIL Open Font License](public/assets/fonts/OFL.txt). Itchy's critters, icons and sounds are
original.
