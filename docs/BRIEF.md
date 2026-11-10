# Itchy — the brief

This is the goal Itchy is built towards, condensed from the owner's original prompt. Read it before changing
anything. `docs/CONCEPT.md` describes the building blocks that meet it, `docs/ARCHITECTURE.md` how the code works,
`docs/ROADMAP.md` what's next and `docs/DECISIONS.md` every decision.

## Goal

A music-making app for children aged 6–11 that runs in the browser. It should feel like a toy before it feels like a
tool: a child opens it, makes a sound in the first few seconds, and works out how it works by playing. No tutorial,
manual or adult is needed. Take inspiration from the colourful, playful, hands-on design of Scratch Jr and Scratch,
but don't copy them.

It follows the idea behind Scratch: **low floor, high ceiling, wide walls**.

- **Low floor:** making a simple beat, melody or soundscape is easy and quick, and feels good.
- **High ceiling:** the interface looks simple and the feature set looks narrow, but a curious child who keeps coming
  back can make music that is complex, beautiful and genuinely inspiring.
- **Wide walls:** lots of different kinds of music and sound play, with no one right way to use it.

Depth comes from a small number of simple ideas that combine in rich ways, never from piling on features, menus or
settings.

**Tie-breaker:** wherever something is unclear, choose what is most fun and most intuitive for a seven-year-old,
while keeping it rewarding for an eleven-year-old who has been using it for months.

## Who it's for

- Children aged 6–11, with a wide range of reading ability. The youngest may hardly read at all.
- On a tablet, a Chromebook or a laptop, with touch, a mouse or a trackpad.
- On their own, with a friend, or in a classroom.

## Design principles

1. **Make sound straight away.** Every tap, drag or drop gives an immediate sound and a visual response. Nothing is
   silent or unclear.
2. **Pictures over words.** Icons, colour, shape and movement carry meaning. Any text is short and optional.
3. **Let things explain themselves.** Controls invite poking. Use direct manipulation (drag, drop, stretch, tap)
   instead of forms, dropdowns or numeric fields. If a value matters, a child can see it and grab it.
4. **Nothing can go wrong.** No error states, dead ends or "wrong" answers. Undo is always one tap away. It is hard to
   lose work by accident.
5. **Sounds good by default.** Sensible defaults (scales, quantisation, tempo, levels) make random experiments sound
   musical. Children can loosen these defaults as they grow.
6. **Reveal depth gradually.** Advanced possibilities are there to discover through play, not all shown at once.
7. **Make it joyful and alive.** Bright, friendly and animated, and the interface visibly reacts to the music. Calm
   enough to focus on: no clutter, no overload.
8. **Accessible and inclusive.** Large touch targets, good contrast, colour never the only way to tell things apart,
   sensible keyboard support, nothing that relies on fine motor precision.

## Features

Each is simple on the surface and deep underneath. The basic version of every one is built; the full vision is
where the ceiling goes.

| Feature | Full vision | Basic version (built) |
| --- | --- | --- |
| **Music sequencing** | Arrange notes and sounds over time in a visual way a child understands without notation: melodies, chords, bass lines, and small pieces arranged into whole songs. | Place and remove notes on a visual, scale-locked grid, with playback that clearly shows where the music is. |
| **Looping** | Loops are the basic building block: make them, layer them, vary them, and switch them on and off live. | Patterns loop continuously, several can be layered, and each can be muted or unmuted while the music plays. |
| **Beat creation** | Simple or intricate drum patterns: accents, swing, different loop lengths, polyrhythm. | A step-based drum pattern with a small, good-sounding kit and a tempo control. |
| **Effects** | Expressive effects shown as playful objects, applied, combined and adjusted by direct manipulation, heard live. | Echo, Space (reverb) and Dark↔Bright (filter), each with one big control, applied to a critter while it plays. |
| **Audio recording** | Record voice, claps or room sounds and use them as instruments: trim, pitch, loop, add effects. | Record a short clip from the microphone and play it on the grid at different pitches. |
| **Sonic experimentation** | Shape and bend sounds; randomness and chance, generative patterns, unusual scales, textures and soundscapes. | The dice (a musical surprise pattern) and moods (six scales). |

Also required: the current work is saved in the browser so a reload never loses it, and undo is always available.

**For later, but never design them out:** exporting audio files, sharing projects, performing live, user accounts and
cloud saving, and richer song arrangement.

## Constraints

- Runs entirely in a modern browser: no installation, no plugins. Audio uses the Web Audio API (or a
  well-established library built on it).
- Works well on typical modern tablets and laptops. Audio timing is tight and dependable, because a wobbly beat ruins
  the experience: use a lookahead scheduler on the audio clock, never plain `setTimeout`/`setInterval` timing.
- Responsive; works with both touch and mouse.
- No accounts or sign-up for now, but that isn't permanent: keep project data in a clean, serialisable format and
  keep storage behind a simple interface, so accounts and cloud saving can be added without a rewrite.
- **No tracking or analytics.**
- Ask for microphone permission only when the child first tries to record, and handle a refusal gracefully.
- Only original artwork and sounds, or appropriately licensed ones (synthesising in code is fine). **Never reuse
  Scratch's characters, artwork or sounds.**
- Keep the setup light: a simple build or no build step, not a heavy toolchain.

## How to work

- Work independently. Where the brief is unclear, make the most sensible choice (use the tie-breaker above), log it in
  the decisions list in `docs/CONCEPT.md` with a one-line reason, and keep going.
- If something blocks you, choose a simpler approach that still meets the brief, and say so.
- Check the app yourself in a headless browser rather than relying on a person: no console errors; mouse and touch at
  tablet and laptop sizes (look at the screenshots); playback starts, loops and stops; recording with a fake
  microphone and with permission denied; work survives a reload.
- Check every change against the principles: can it be done without reading? Does it make a sound immediately? Can it
  be undone?
- Commit at the end of each meaningful step with a clear message.

## Where things stand (November 2026)

The basic version is complete and merged. Against the original definition of done:

- Runs locally with one command (`npm start`).
- A child can make a beat and a melody, loop and layer them, add an effect, record a sound and use it, and try
  something experimental, without reading instructions.
- Timing is steady, there are no console errors, work survives a reload, and the browser checks pass
  (`npm test`, `npm run check`).

Decisions the owner made after the build:

- **The iPhone/iPad silent switch may mute Itchy.** The owner is fine with this; an attempted workaround was reverted.
- **Low-end devices are not a target.** The owner dropped the requirement to support low-powered machines such as
  older school Chromebooks: Itchy should run smoothly on typical modern tablets and laptops, and visual polish (glass,
  blur, glow, light) comes first. Tight, steady audio timing still matters everywhere.
- **Itchy moved to openDAW, React and TypeScript** (November 2026). The first version is the `v1` tag. How it's
  built is in `docs/ARCHITECTURE.md`, what's left in `docs/ROADMAP.md`, and the decisions in `docs/DECISIONS.md`.
  The private Claude web page copy of Itchy is retired, because openDAW can't run on those pages.

The ideas for raising the ceiling are in `docs/ROADMAP.md`.
