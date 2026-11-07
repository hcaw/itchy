# Roadmap

Itchy is built in vertical slices: each slice is one small pull request that adds one feature all the way through,
with its tests and a preview link. The first version (the git tag `v1`) shows how each feature should behave.

- [x] **Walking skeleton**: one critter (Vaporisateur) on a 16 × 8 grid, Play and Stop with a playhead, Undo and
  Redo, unit tests and Playwright checks in Chromium and WebKit.
- [ ] **Cloudflare**: deploy `main` and preview every pull request; remove the Vercel previews.
- [ ] **Design system**: tokens (colour, type scale, spacing, radius, elevation, motion) and themes, made with
  Claude's Design System artifact type and seeded from v1's tokens, Nunito and critters. The code reads the tokens
  from one source as CSS custom properties. To decide: where the source of truth lives (the artifact or the repo),
  and what the themes are (light and dark, or the moods as themes). Do this before the UI slices below.
- [ ] **Several critters**, and choosing which one the grid shows. Move reading to openDAW's adapters as
  [`ARCHITECTURE.md`](ARCHITECTURE.md) describes, and stop holding critter handles in props.
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

Ideas for later, from v1: stretchy loops (per-critter length), stretchy notes and accents, song sections, voice kits,
charms as objects, chance and rules, export and sharing, a tidier songbook.
