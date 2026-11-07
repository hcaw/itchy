// Moods are scales. Each tune row is a step up the current mood's scale, so every tap lands on a
// note that fits. (Ported unchanged from Itchy v1.)

export type MoodId = 'happy' | 'sad' | 'sunny' | 'bluesy' | 'mystery' | 'spooky';

export const MOODS: Record<MoodId, { label: string; steps: readonly number[] }> = {
  happy: { label: 'Happy', steps: [0, 2, 4, 7, 9] }, // major pentatonic: nothing clashes
  sad: { label: 'Gentle', steps: [0, 3, 5, 7, 10] }, // minor pentatonic
  sunny: { label: 'Sunny', steps: [0, 2, 4, 5, 7, 9, 11] }, // major: all the white keys
  bluesy: { label: 'Cool', steps: [0, 3, 5, 6, 7, 10] }, // blues
  mystery: { label: 'Mystery', steps: [0, 2, 3, 7, 8] }, // hirajoshi-like
  spooky: { label: 'Spooky', steps: [0, 2, 4, 6, 8, 10] }, // whole tone
};

export const MOOD_ORDER: readonly MoodId[] = ['happy', 'sad', 'sunny', 'bluesy', 'mystery', 'spooky'];

/** Semitones above the key for a tune row (row 0 = bottom). */
export function rowSemitones(row: number, mood: MoodId = 'happy'): number {
  const steps = MOODS[mood].steps;
  const n = steps.length;
  const octave = Math.floor(row / n);
  const index = ((row % n) + n) % n;
  return (steps[index] ?? 0) + 12 * octave;
}

/** Is this row the "home" note (the key) of the scale? */
export function isHomeRow(row: number, mood: MoodId = 'happy'): boolean {
  return row % MOODS[mood].steps.length === 0;
}
