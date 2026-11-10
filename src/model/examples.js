// Example songs: something to hear straight away, and to pull apart.
// Written in the same plain JSON as saved songs (migrate() fills in the rest).

const n = (s, r, len = 1, vel = 1) => ({ s, r, len, vel });
const fx = (echo = 0, space = 0, tone = 0) => ({ echo, space, tone });

export const EXAMPLES = [
  {
    id: 'example-robot-disco',
    name: 'Robot Disco',
    tempo: 116,
    mood: 'happy',
    layers: [
      { sound: 'tinykit', color: 1, fx: fx(0, 0.15),
        notes: [n(0, 0), n(4, 0), n(8, 0), n(12, 0), n(4, 1), n(12, 1), n(14, 2), n(7, 2, 1, 0.6),
          n(2, 3), n(6, 3), n(10, 3), n(14, 3), n(3, 3, 1, 0.4), n(11, 3, 1, 0.4)] },
      { sound: 'bass', color: 3, fx: fx(0, 0, -0.2),
        notes: [n(0, 0, 2), n(3, 0), n(6, 2), n(8, 3, 2), n(11, 3), n(14, 4)] },
      { sound: 'pluck', color: 0, fx: fx(0.45, 0.2),
        notes: [n(0, 5), n(2, 7), n(4, 6), n(6, 5), n(8, 3), n(10, 4), n(12, 5), n(15, 2)] },
      { sound: 'bells', color: 4, muted: true, fx: fx(0.3, 0.5),
        notes: [n(0, 7), n(3, 6), n(6, 7), n(10, 5), n(12, 7)] },
    ],
  },
  {
    id: 'example-rainy-day',
    name: 'Rainy Day',
    tempo: 80,
    mood: 'sad',
    layers: [
      { sound: 'kit', color: 1, fx: fx(0, 0.25, -0.35),
        notes: [n(0, 0), n(10, 0, 1, 0.7), n(8, 1, 1, 0.55), n(4, 3, 1, 0.45), n(12, 3, 1, 0.45), n(14, 3, 1, 0.3)] },
      { sound: 'cloud', color: 4, fx: fx(0, 0.75, -0.25),
        notes: [n(0, 0, 8), n(0, 2, 8), n(0, 4, 8), n(8, 1, 8), n(8, 3, 8), n(8, 5, 8)] },
      { sound: 'bells', color: 7, fx: fx(0.5, 0.45),
        notes: [n(0, 5), n(3, 4), n(6, 2), n(8, 3), n(11, 2), n(14, 0)] },
    ],
  },
  {
    id: 'example-spooky-clocks',
    name: 'Spooky Clocks',
    tempo: 96,
    mood: 'spooky',
    // Each critter loops at its own length (16, 12, 10 steps), so they drift in and out of step.
    layers: [
      { sound: 'kit', color: 6, steps: 16, fx: fx(0, 0.3),
        notes: [n(0, 0), n(8, 0), n(0, 3), n(4, 3, 1, 0.6), n(8, 3), n(12, 3, 1, 0.6), n(12, 2)] },
      { sound: 'pluck', color: 5, steps: 12, fx: fx(0.2, 0.3, 0.25),
        notes: [n(0, 0), n(3, 2), n(6, 4), n(9, 6)] },
      { sound: 'bells', color: 2, steps: 10, fx: fx(0.6, 0.55),
        notes: [n(0, 7), n(5, 5)] },
      { sound: 'bass', color: 3, steps: 16, fx: fx(0, 0.1, -0.4),
        notes: [n(0, 0, 4), n(8, 1, 4)] },
    ],
  },
  {
    id: 'example-sunshine-reggae',
    name: 'Sunshine Reggae',
    tempo: 76,
    swing: 0.35,
    mood: 'sunny',
    key: 7, // G major
    // A "one drop": the kick and snare land together on beat 3 (step 8) and beat 1 stays empty.
    // The pluck chops a chord on beats 2 and 4 (the skank): G, then C.
    layers: [
      { sound: 'kit', color: 3, fx: fx(0, 0.2),
        notes: [n(8, 0), n(8, 1, 1, 0.75),
          n(0, 3, 1, 0.45), n(2, 3, 1, 0.7), n(4, 3, 1, 0.45), n(6, 3, 1, 0.7), n(7, 3, 1, 0.3),
          n(8, 3, 1, 0.45), n(10, 3, 1, 0.7), n(12, 3, 1, 0.45), n(14, 3, 1, 0.7), n(15, 3, 1, 0.3)] },
      { sound: 'bass', color: 0, fx: fx(0, 0, -0.25),
        notes: [n(0, 0, 2), n(3, 0), n(4, 2, 2), n(6, 4, 2), n(8, 3, 3), n(11, 3), n(12, 5, 2), n(14, 4, 2)] },
      { sound: 'pluck', color: 2, fx: fx(0.15, 0.25, 0.35),
        notes: [n(4, 0, 1, 0.8), n(4, 2, 1, 0.8), n(4, 4, 1, 0.8), n(12, 3, 1, 0.8), n(12, 5, 1, 0.8), n(12, 7, 1, 0.8)] },
      { sound: 'bells', color: 7, fx: fx(0.35, 0.35),
        notes: [n(2, 4), n(3, 5), n(6, 4), n(10, 5), n(11, 7), n(14, 5, 2)] },
    ],
  },
  {
    id: 'example-echo-cave-dub',
    name: 'Echo Cave Dub',
    tempo: 74,
    mood: 'sad',
    key: 9, // A minor
    // Dub in the style of Black Uhuru's rhythm section: a "steppers" kick on every beat, a deep bass with
    // gaps in it, and the rim, the skank and the melody thrown into the echo. The melody sleeps: wake it.
    layers: [
      { sound: 'kit', color: 1, fx: fx(0, 0.2, -0.1),
        notes: [n(0, 0), n(4, 0, 1, 0.85), n(8, 0), n(12, 0, 1, 0.85),
          n(2, 3, 1, 0.75), n(6, 3, 1, 0.75), n(10, 3, 1, 0.75), n(14, 3, 1, 0.75),
          n(3, 3, 1, 0.3), n(7, 3, 1, 0.3), n(11, 3, 1, 0.3), n(15, 3, 1, 0.3)] },
      // Tiny drums: a rimshot on beat 3, and the tiny kick's falling "pew" like a syndrum.
      { sound: 'tinykit', color: 7, fx: fx(0.7, 0.45),
        notes: [n(8, 1), n(14, 0, 1, 0.8)] },
      { sound: 'bass', color: 4, volume: 0.95, fx: fx(0, 0, -0.35),
        notes: [n(0, 0, 2), n(3, 0), n(6, 1), n(7, 2, 2), n(10, 3, 2), n(12, 2), n(13, 1), n(14, 0, 2)] },
      { sound: 'pluck', color: 3, fx: fx(0.6, 0.4, 0.45),
        notes: [n(4, 0, 1, 0.7), n(4, 1, 1, 0.7), n(4, 3, 1, 0.7), n(12, 0, 1, 0.7), n(12, 1, 1, 0.7), n(12, 3, 1, 0.7)] },
      { sound: 'bells', color: 5, octave: -1, muted: true, fx: fx(0.75, 0.6, -0.2),
        notes: [n(2, 3), n(3, 4), n(6, 3), n(10, 2), n(11, 1), n(14, 0, 2)] },
    ],
  },
];
