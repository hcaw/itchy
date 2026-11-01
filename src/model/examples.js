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
];
