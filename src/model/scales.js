// Moods are scales. Each tune row is a step up the current mood's scale, so every tap
// lands on a note that fits. Changing mood re-colours every tune critter at once.

export const MOODS = {
  happy:   { label: 'Happy',   steps: [0, 2, 4, 7, 9] },        // major pentatonic: nothing clashes
  sad:     { label: 'Gentle',  steps: [0, 3, 5, 7, 10] },       // minor pentatonic
  sunny:   { label: 'Sunny',   steps: [0, 2, 4, 5, 7, 9, 11] }, // major: all the white keys
  bluesy:  { label: 'Cool',    steps: [0, 3, 5, 6, 7, 10] },    // blues
  mystery: { label: 'Mystery', steps: [0, 2, 3, 7, 8] },        // hirajoshi-like
  spooky:  { label: 'Spooky',  steps: [0, 2, 4, 6, 8, 10] },    // whole tone
};
export const MOOD_ORDER = ['happy', 'sad', 'sunny', 'bluesy', 'mystery', 'spooky'];

/** Semitones above the key for a tune row (row 0 = bottom). */
export function rowSemitones(row, mood = 'happy') {
  const steps = (MOODS[mood] || MOODS.happy).steps;
  const n = steps.length;
  const oct = Math.floor(row / n);
  const idx = ((row % n) + n) % n;
  return steps[idx] + 12 * oct;
}

/** Is this row the "home" note (the key) of the scale? Used to draw a little star. */
export function isHomeRow(row, mood = 'happy') {
  const n = (MOODS[mood] || MOODS.happy).steps.length;
  return row % n === 0;
}

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
