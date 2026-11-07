# The rebuild: Itchy on openDAW, React and TypeScript

Itchy v1 (the git tag `v1`) was hand-written Web Audio with no build step. The rebuild keeps the brief, the building
blocks and the look, and replaces everything underneath. Nobody depends on v1, so there is no migration path, no
feature flags and no running old and new side by side: v1 is the specification, not code to convert.

## Patterns

- **A walking skeleton first, then vertical slices.** The skeleton proves every risky part end to end (isolation
  headers, openDAW booting, sound, React, deployment, tests in Chromium and WebKit). Each slice after it is one small
  PR that adds one feature all the way through, with its tests and a preview link.
- **openDAW's project is the single source of truth.** There is no Itchy JSON model and no separate store. A critter
  is an audio unit with an instrument and a looping note region; a grid note is a note event; a charm will be an effect
  device's parameter. Undo is openDAW's `editing`; saving will be `project.toArrayBuffer()`.
- **`src/daw/` holds the openDAW know-how; it is not a wall.** It boots openDAW and owns every write that spans more
  than one box (create a critter, toggle a note), so each user action is one `editing.modify` and one undo step.
  Components read boxes and observables directly through two hooks in `src/react/hooks.ts`, rather than through a
  wrapper for every field: wrapping openDAW's whole API would rebuild the mirror layer PR #10 needed, and hide the
  very features worth playing with.
- **Port only what is pure.** Scales and moods (`src/model/scales.ts`) and later the dice came across with their
  tests. The design tokens and font came across; the components are new.
- **Example songs will be code**: functions that build a project, so they are readable in a diff and survive SDK
  upgrades.

## Slices

- [x] **Walking skeleton**: Vite, React 19, strict TypeScript, openDAW 0.0.182, Cloudflare headers, one critter
  (Vaporisateur) on a 16 × 8 grid, Play and Stop with a playhead, Undo and Redo, unit tests and Playwright checks.
- [ ] **Cloudflare deploy** and PR previews; remove the Vercel previews.
- [ ] **Several critters** and choosing which one the grid shows.
- [ ] **Sounds from openDAW's instruments**: Korpus (bells, pluck), Cubed or Vaporisateur (bass), Vaporisateur or
  Neon (cloud pads); drums as Playfield with samples or an Apparat script (try both).
- [ ] **Moods and the key**, changing every tune critter at once.
- [ ] **Charms**: Delay (echo), Dattorro Reverb (space), Revamp (dark ↔ bright).
- [ ] **Sleep (mute), tempo, swing** (Zeitgeist).
- [ ] **Saving** to IndexedDB and the songbook; example songs as code.
- [ ] **Mic recording** into Nano.
- [ ] **Dice and delight**: the surprise pattern, the critters' reactions.
- [ ] **A tap layer** if the first visit's boot proves slow on real tablets.
- [ ] **Look**: port the critters' art and the full layout.

## Decisions

- **Rebuild instead of porting PR #10.** Its complexity came from v1's rules (no build step, JSON as the truth, a
  fallback engine, GitHub Pages), not from openDAW. Closed unmerged; its branch stays for reference.
- **openDAW is the only engine.** Devices that can't run it (older than Safari/iPadOS 17.4, Chrome 119 or Firefox
  121) see a friendly message instead of a fallback engine.
- **React 19 with Vite**, not Next.js: Itchy is a client-only app with no server rendering, and openDAW needs
  browser-only APIs.
- **TypeScript in strict mode**, with `noUncheckedIndexedAccess`.
- **AGPL-3.0-or-later for the whole project**, matching openDAW.
- **Cloudflare for hosting**: free, sends the isolation headers from `public/_headers`, and previews every PR.
- **The private Claude web page copy of Itchy is retired**: openDAW can't run there, because those pages can't be
  cross-origin isolated.
- **Song setup runs in a bare box-graph transaction**, outside openDAW's editing history, so the first undo never
  removes the critter itself.
