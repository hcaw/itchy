<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.png">
    <img src="docs/images/logo-light.png" alt="Itchy" width="320">
  </picture>
</p>

A music-making app for children aged 6–11, in the browser. Built on [openDAW](https://github.com/andremichelle/openDAW)
with React and TypeScript.

The app is being built up feature by feature; see [`docs/ROADMAP.md`](docs/ROADMAP.md). The first version is the
`v1` tag, and still runs at <https://hcaw.github.io/itchy/>.

## Run it

Needs Node.js 22.12 or later.

```sh
npm install
npm run dev
```

Then open http://localhost:5173/.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the build |
| `npm run typecheck` | TypeScript |
| `npm run lint` | Oxlint |
| `npm run fmt` | Format every file (Oxfmt); `npm run fmt:check` only checks |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright) |

## Docs

- [`docs/BRIEF.md`](docs/BRIEF.md): the goal and design principles
- [`docs/CONCEPT.md`](docs/CONCEPT.md): the building blocks
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the code works
- [`docs/ROADMAP.md`](docs/ROADMAP.md): what's built and what's next
- [`docs/DECISIONS.md`](docs/DECISIONS.md): decisions and their reasons
- [`docs/reference/v1.md`](docs/reference/v1.md): what v1 did, with screenshots
- [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Licence

[AGPL-3.0-or-later](LICENSE). Versions up to the `v1` tag were MIT. The [Nunito](https://github.com/googlefonts/nunito)
font is under the [SIL Open Font License](public/assets/fonts/OFL.txt).
