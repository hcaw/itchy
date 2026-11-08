# Roadmap

Itchy is built in vertical slices: each slice is one small pull request that adds one feature all the way through,
with its tests and a preview link. [`reference/v1.md`](reference/v1.md) lists every feature of the first version,
with screenshots, and which slice brings it back.

- [x] **Walking skeleton**: one critter (Vaporisateur) on a 16 × 8 grid, Play and Stop with a playhead, Undo and
  Redo, unit tests and Playwright checks in Chromium and WebKit.
- [ ] **Cloudflare**: deploy `main` and preview every pull request; remove the Vercel previews.
- [ ] **Design system**: tokens (colour, type scale, spacing, radius, elevation, motion) and themes, seeded from
  v1's tokens, Nunito and critters. The tokens live in the repo as the single source; the app reads them as CSS
  custom properties, and a Claude Design System artifact shows them, refreshed from the repo. To decide: what the
  themes are (light and dark, or the moods as themes). Do this before the UI slices below.
- [ ] **Several critters**, and choosing which one the grid shows. Look critters up from openDAW's adapters
  instead of passing a handle, and re-render per critter rather than on every edit
  ([`ARCHITECTURE.md`](ARCHITECTURE.md)).
- [ ] **Sounds from openDAW's instruments**: Korpus (bells, pluck), Cubed or Vaporisateur (bass), Vaporisateur or
  Neon (cloud pads). Drums: Playfield with samples, or an Apparat script; try both.
- [ ] **Moods and the key**, changing every tune critter at once.
- [ ] **Charms**: Delay (echo), Dattorro Reverb (space), Revamp (dark ↔ bright).
- [ ] **Sleep (mute), tempo, swing** (Zeitgeist).
- [ ] **Saving** to IndexedDB, and the songbook; example songs written as code.
- [ ] **Mic recording**, played by Nano.
- [ ] **Dice and delight**: the surprise pattern, and the critters' reactions.
- [ ] **A tap layer**, only if the first visit's boot proves slow on real tablets.
- [ ] **The full look**: the critters' art and the layout from v1, on the design system.

**Later: other playing surfaces** beyond the step grid (live playing, drawing, gestures), each its own module
beside `grid.ts`.

Ideas for later, from v1: stretchy loops (per-critter length), stretchy notes and accents, song sections, voice kits,
charms as objects, chance and rules, export and sharing, a tidier songbook.
