# Prompt: a music-making app for children

> I'd like you to design and build a music-making app for children aged 6–11 that runs in the browser.
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

These are the core capabilities. Each should be simple on the surface and deep underneath.

- **Music sequencing:** arrange notes and sounds over time in a visual, tangible way that a child understands without being taught music notation. Support melodies, chords and bass lines, and arranging small pieces into a whole song.
- **Looping:** loops are the basic unit of building music. It should be easy to make a loop, layer loops on top of each other, vary them, and switch them on and off live while the music plays.
- **Beat creation:** a playful way to build drum patterns and rhythms, with a good kit of percussion sounds. It should be easy to make a basic beat and possible to make an intricate one (for example, different loop lengths, accents, swing, polyrhythm).
- **Effects:** a small set of expressive effects (for example, echo, reverb, filter, distortion, pitch or speed) shown as playful objects that can be applied, combined and adjusted by direct manipulation, ideally while listening to the result live.
- **Audio recording:** children can record their own voice, claps or sounds from the room with the microphone, then use those recordings as instruments: trim them, play them at different pitches, loop them and add effects.
- **Sonic experimentation:** room to explore sound itself, not just notes. For example: shaping and bending sounds, randomness and chance, generative or self-playing patterns, unusual scales, and textures and soundscapes as well as songs.

Also consider:

- **Saving and sharing:** saving projects and coming back to them, and exporting a finished piece as an audio file. A shareable project file is a nice extra.
- **Playing live:** some way to perform with the app in real time, not only compose with it.

## Technical constraints

- It runs entirely in a modern web browser, with no installation and no plugins. Use the Web Audio API (or a well-established library built on it) for audio.
- It works well on mid-range tablets and school Chromebooks. Audio timing must be tight and dependable, because a wobbly beat ruins the experience.
- It is responsive and works with both touch and mouse.
- No accounts, sign-ups, tracking or analytics. Microphone recordings and projects stay on the child's device unless the child chooses to export them. Ask for microphone permission only when the child first tries to record, and handle a refusal gracefully.
- It works offline once loaded, if that's practical.
- Use original artwork and sounds, or appropriately licensed ones. Don't reuse Scratch's characters, artwork or sounds.

## What I'd like from you

1. **Concept first.** Before writing much code, propose the core concept: the handful of building blocks the app is made of, how they combine, and how a child's first two minutes would feel compared with their fiftieth hour. Explain how your design gets the low floor and the high ceiling. Point out any trade-offs or features you'd cut or change, and why.
2. **Then build it.** Implement a working version, starting with the core loop of making sound, sequencing it and looping it, then adding the other features in layers. Keep the codebase clean and organised so it can grow.
3. **Show what it can do.** Include a few built-in example projects that show the range, from a simple beat to something rich and atmospheric, so a child (or a parent or teacher) can see what's possible and pull it apart.
4. **Explain how to run it** and briefly describe the architecture.

Wherever this brief is unclear, choose what is most fun and most intuitive for a seven-year-old, while keeping it rewarding for an eleven-year-old who has been using it for months.
