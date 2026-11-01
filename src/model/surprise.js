// The dice: invent a musical pattern for a critter. Random, but shaped by simple rules of
// thumb (strong beats, steps not leaps, phrases that come home) so it always sounds like music.
// rand is injectable so tests can be repeatable.

import { soundKind, rowsForSound } from './sounds.js';

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const chance = (rand, p) => rand() < p;

export function surpriseNotes(layer, rand = Math.random) {
  const steps = layer.steps;
  if (soundKind(layer.sound) === 'beat') return beat(steps, rand);
  if (layer.sound === 'bass') return bass(steps, rand);
  if (layer.sound === 'cloud') return chords(steps, rand);
  return melody(steps, rowsForSound(layer.sound), rand);
}

function beat(steps, rand) {
  const notes = [];
  const add = (s, r, vel = 1) => { if (s < steps && !notes.some((n) => n.s === s && n.r === r)) notes.push({ s, r, len: 1, vel }); };
  // kick: always on 1, then a few strong places
  add(0, 0);
  for (const [s, p] of [[8, 0.75], [10, 0.3], [6, 0.25], [14, 0.2], [3, 0.2], [11, 0.15]]) if (chance(rand, p)) add(s, 0);
  // snare or clap on the backbeat
  const back = chance(rand, 0.7) ? 1 : 2;
  for (const s of [4, 12]) if (chance(rand, 0.9)) add(s, back);
  if (chance(rand, 0.3)) add(pick(rand, [7, 15, 13]), 1, 0.5);
  if (chance(rand, 0.35)) add(pick(rand, [12, 14, 6]), 2);
  // hats: one of a few grooves
  const groove = pick(rand, ['eighths', 'offbeats', 'sixteenths', 'gallop']);
  for (let s = 0; s < steps; s++) {
    if (groove === 'eighths' && s % 2 === 0) add(s, 3, s % 4 === 0 ? 0.9 : 0.6);
    if (groove === 'offbeats' && s % 4 === 2) add(s, 3, 0.9);
    if (groove === 'sixteenths') add(s, 3, s % 2 === 0 ? 0.75 : 0.4);
    if (groove === 'gallop' && s % 4 !== 1) add(s, 3, s % 4 === 0 ? 0.85 : 0.5);
  }
  return notes;
}

function melody(steps, rows, rand) {
  // A short motif, played twice with a different ending: question and answer.
  const half = Math.max(2, Math.floor(steps / 2));
  const density = 0.35 + rand() * 0.3;
  const rhythm = [];
  for (let s = 0; s < half; s++) rhythm.push(s === 0 || (s % 2 === 0 ? chance(rand, density + 0.2) : chance(rand, density - 0.15)));
  let r = pick(rand, [0, 2, 3, 5]);
  const motif = [];
  for (let s = 0; s < half; s++) {
    if (!rhythm[s]) continue;
    r = Math.max(0, Math.min(rows - 1, r + pick(rand, [-2, -1, -1, 0, 1, 1, 2])));
    motif.push({ s, r });
  }
  const notes = motif.map((n) => ({ ...n, len: 1, vel: 1 }));
  for (const n of motif) {
    const s = n.s + half;
    if (s >= steps) continue;
    notes.push({ s, r: n.r, len: 1, vel: 0.9 });
  }
  // the answer comes home to the key note
  const tail = notes.filter((n) => n.s >= half).sort((a, b) => b.s - a.s)[0];
  if (tail) tail.r = pick(rand, [0, 5].filter((x) => x < rows));
  return dedupe(notes);
}

function bass(steps, rand) {
  const notes = [{ s: 0, r: 0, len: 2, vel: 1 }];
  const places = [3, 6, 8, 10, 11, 14].filter((s) => s < steps);
  for (const s of places) if (chance(rand, s === 8 ? 0.8 : 0.35)) notes.push({ s, r: pick(rand, [0, 0, 2, 3, 4, 5]), len: 1, vel: 0.9 });
  return dedupe(notes);
}

function chords(steps, rand) {
  const notes = [];
  const len = Math.max(1, Math.floor(steps / 2));
  for (let s = 0; s < steps; s += len) {
    const root = pick(rand, [0, 1, 2, 3]);
    for (const k of [0, 2, 4]) notes.push({ s, r: Math.min(7, root + k), len, vel: 0.8 });
  }
  return dedupe(notes);
}

function dedupe(notes) {
  const seen = new Set();
  return notes.filter((n) => { const k = `${n.s},${n.r}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
