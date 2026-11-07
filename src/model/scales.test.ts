import { describe, expect, it } from 'vitest';
import { MOOD_ORDER, MOODS, isHomeRow, rowSemitones } from './scales';

describe('rowSemitones', () => {
  it('walks up the happy (major pentatonic) scale and into the next octave', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((row) => rowSemitones(row))).toEqual([0, 2, 4, 7, 9, 12, 14, 16]);
  });

  it('follows each mood', () => {
    expect(rowSemitones(2, 'sad')).toBe(5);
    expect(rowSemitones(6, 'sunny')).toBe(11);
    expect(rowSemitones(6, 'spooky')).toBe(12);
  });

  it('goes below the key for negative rows', () => {
    expect(rowSemitones(-1)).toBe(-3);
  });
});

describe('isHomeRow', () => {
  it('marks the key in every octave', () => {
    expect([0, 5, 10].every((row) => isHomeRow(row))).toBe(true);
    expect(isHomeRow(3)).toBe(false);
  });
});

it('lists every mood once', () => {
  expect([...MOOD_ORDER].sort()).toEqual(Object.keys(MOODS).sort());
});
