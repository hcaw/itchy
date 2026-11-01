# Prompt: a music-making app for children

> I'd like you to design and build a **basic working version** of a music-making app for children aged 6–11 that runs in the browser.
>
> Take inspiration from the colourful, playful, hands-on design of Scratch Jr and Scratch, but don't copy them. It should feel like a toy before it feels like a tool. A child should be able to open it and make a sound in the first few seconds, then work out how it works just by playing with it. No tutorial, manual or adult should be needed. The barrier to entry should be very low and the learning curve gentle.
>
> I want it to follow the design idea behind Scratch: **low floor, high ceiling, wide walls**.
>
> - **Low floor:** making a simple beat, melody or soundscape is easy and quick, and feels good.
> - **High ceiling:** the feature set looks narrow and the interface looks simple, but there's enough depth that a curious child who keeps coming back can make music that is complex, beautiful and genuinely inspiring.
> - **Wide walls:** it supports lots of different kinds of music and sound play, not one right way to use it.
>
> Depth should come from a small number of simple ideas that combine in rich ways, not from piling on features, menus or settings.
>
> This first version should nail the low floor and prove the core idea works. It doesn't need to reach the full ceiling yet, but it should be designed so the ceiling can be built on top of it without starting again.

## Who it's for

- Children aged 6–11, so a wide range of reading ability. The youngest may hardly read at all.
- They may be using a tablet, a Chromebook or a laptop, with touch, a mouse or a trackpad.
- They may be on their own, with a friend, or in a classroom.

## Design principles

1. **Make sound straight away.** Every tap, drag or drop should give an immediate sound and a visual response. Nothing should be silent or unclear.
2. **Pictures over words.** Use icons, colour, shape and movement to carry meaning. Any text should be short and optional.
3. **Let things explain themselves.** Controls should invite poking. Use direct manipulation (drag, drop, stretch, tap) instead of forms, dropdowns or numeric fields. If a value matters, a child should be able to see it and grab it.
4. **Nothing can go wrong.** There are no error states, dead ends or "wrong" answers. Undo is always one tap away. Make it hard to lose work by accident.
5. **Sounds good by default.** Sensible defaults (scales, quantisation, tempo, levels) should make random experiments sound musical. Children can loosen these defaults as they grow.
6. **Reveal depth gradually.** Advanced possibilities should be there to discover through play, not hidden behind a "pro mode" or shown all at once.
7. **Make it joyful and alive.** The visual character should be bright, friendly and animated, and the interface should visibly react to the music. Keep it calm enough to focus on: no clutter and no overload.
8. **Accessible and inclusive.** Large touch targets, good contrast, colour that is never the only way to tell things apart, sensible keyboard support, and nothing that relies on fine motor precision.

## Features

These are the core capabilities of the full vision, each simple on the surface and deep underneath. For this basic version, every one should be present in a simple form. The "basic version" column says what that means. Anything beyond it is for later.

| Feature | Full vision | Basic version |
| --- | --- | --- |
| **Music sequencing** | Arrange notes and sounds over time in a visual way a child understands without notation: melodies, chords, bass lines, and small pieces arranged into whole songs. | Place and remove notes on a visual, scale-locked grid for at least one melodic instrument, with playback that clearly shows where the music is. |
| **Looping** | Loops are the basic building block: make them, layer them, vary them, and switch them on and off live. | Patterns loop continuously, at least a few can be layered, and each can be muted or unmuted while the music plays. |
| **Beat creation** | Build simple or intricate drum patterns: accents, swing, different loop lengths, polyrhythm. | A step-based drum pattern with a small, good-sounding kit (for example kick, snare, hi-hat, clap) and a tempo control. |
| **Effects** | A set of expressive effects shown as playful objects that are applied, combined and adjusted by direct manipulation, heard live. | Two or three effects (for example echo, filter, reverb), each controlled by one big, obvious control, that can be applied to a sound or layer while it plays. |
| **Audio recording** | Record voice, claps or room sounds and use them as instruments: trim, pitch, loop, add effects. | Record a short clip from the microphone and play it back as a sound in the sequencer, ideally at different pitches. |
| **Sonic experimentation** | Shape and bend sounds, use randomness and chance, generative patterns, unusual scales, textures and soundscapes. | At least one playful way to explore sound beyond placing notes, for example a "surprise me" button, a different scale or sound, or a pad you drag around to bend a sound. |

Also in the basic version:

- **Saving:** the current project is kept in the browser (for example local storage or IndexedDB) so a page refresh doesn't lose work.
- **Undo** (see design principle 4).

For later, but don't design yourself out of them:

- Exporting audio files
- Sharing projects
- Performing live
- User accounts and cloud saving
- Richer song arrangement

## Technical constraints

- It runs entirely in a modern web browser, with no installation and no plugins. Use the Web Audio API (or a well-established library built on it) for audio.
- It works well on mid-range tablets and school Chromebooks. Audio timing must be tight and dependable, because a wobbly beat ruins the experience. Use a lookahead scheduler on the audio clock, not plain `setTimeout` or `setInterval` timing.
- It is responsive and works with both touch and mouse.
- No accounts or sign-up for now, but this isn't a permanent rule. Keep project data in a clean, serialisable format and keep storage behind a simple interface, so accounts and cloud saving can be added later without rewriting the app.
- No tracking or analytics. Ask for microphone permission only when the child first tries to record, and handle a refusal gracefully.
- Use original artwork and sounds, or appropriately licensed ones (synthesising sounds in code is fine). Don't reuse Scratch's characters, artwork or sounds.
- Keep the setup light. A simple build (for example Vite) or no build step at all is preferred over a heavy toolchain.

## Workflow

The expected result of this prompt is a **basic working version I can run and play with**. Work through these steps in order and finish each one before moving to the next.

### Step 1: Short concept (keep it brief)

Write a short concept, no more than a page, saved as `docs/CONCEPT.md`. It should cover:

- the handful of building blocks the app is made of, and how they combine
- the main screen layout and how the main interactions work
- what a child's first two minutes feel like, and how the design leaves room to grow towards their fiftieth hour
- your choice of technology, and the project structure

Then carry straight on to building. Only stop to ask me if a decision would substantially change the outcome.

### Step 2: Foundations

- Set up the project.
- Build the audio engine: an audio context that is unlocked on the first tap, a reliable lookahead scheduler, play and stop, and tempo.
- Define the project data model, serialisable as JSON, and the storage interface.
- Before building more on top of it, check that a simple test pattern plays in steady time.

### Step 3: Core loop (the low floor)

- Build beats, sequencing and looping, so a child can make a beat and a melody, layer them, and hear them loop.
- Add visual feedback during playback.
- Add undo and saving to the browser.
- At this point the app should already be fun to use on its own. Check that it is before moving on.

### Step 4: Remaining features (basic versions)

Add effects, recording and sonic experimentation, each in its basic form as described in the features table. Make each one fit the existing building blocks rather than adding a separate mode.

### Step 5: Polish and check

- Run the app in a browser. Check that there are no console errors, that it works with touch and mouse at tablet and laptop sizes, that timing stays steady, that it behaves well when microphone permission is refused, and that saved work survives a page refresh.
- Check it against the design principles. Can every main action be done without reading? Does everything make a sound immediately? Can every action be undone?
- Fix what you find.
- Include one or two small example projects so there is something to hear straight away and pull apart.

### Step 6: Hand over

Add a `README.md` covering:

- how to run the app
- a short overview of the architecture
- a short list of the next steps you would take to raise the ceiling: which features to deepen first, and why

Also tell me honestly what works well, what is rough, and what you cut.

### Definition of done

- The app runs locally with one documented command, or by opening a file.
- A child can make a beat and a melody, loop and layer them, add an effect, record a sound and use it, and try something experimental, all without reading instructions.
- Timing is steady, there are no console errors, and work survives a page refresh.

---

Wherever this brief is unclear, choose what is most fun and most intuitive for a seven-year-old, while keeping it rewarding for an eleven-year-old who has been using it for months.
