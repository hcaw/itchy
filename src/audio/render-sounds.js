// Renders Itchy's built-in sounds to PCM, for openDAW's samplers to play (docs/OPENDAW-PORT.md §4).
//
// instruments.js still makes every sound: each one is played once into an OfflineAudioContext, exactly as the
// built-in engine plays it, with a seeded random source, so the result is the same on every boot.
//
// - Drums: one file per kit piece at full velocity. The noisy pieces (snares, claps, hats) get four seeded
//   variants that the song alternates between, so a hat line doesn't sound like a machine gun.
// - Tunes: one file each at a reference pitch (rootKey); openDAW's Nano repitches it. Bass and cloud hold their
//   note and carry loop points over a steady part of the hold, so a note of any length sustains at any pitch.
// - Space: the stereo reverb impulse, from the same seeded noise.
//
// soundCatalogue() is pure (no Web Audio), so the mirror's unit tests can use the same facts in Node.

import { playDrum, playTune, makeImpulse, DRUM_KITS, DRUM_PIECES } from './instruments.js';
import { midiToHz } from '../model/scales.js';

/** Variants per drum row (bottom row first): only the pieces made from noise differ from hit to hit. */
export const DRUM_VARIANTS = { kit: [1, 4, 4, 4], tinykit: [1, 4, 1, 1] };
export const DRUM_SECONDS = 0.6;

/** A whole number of periods of `hz` close to `seconds`, so a loop's two ends meet in phase. */
const periods = (seconds, hz) => Math.round(seconds * hz) / hz;

// The cloud's three voices are detuned by ±9 cents; its beating repeats about every 1/(f·(2^(9/1200) − 1)) s.
const CLOUD_ROOT = 67;
const cloudBeat = 1 / (midiToHz(CLOUD_ROOT) * (Math.pow(2, 9 / 1200) - 1));

/**
 * How each tune is rendered and played: reference pitch, length, Nano envelope (the sound's own envelope is baked
 * into the PCM, so Nano's attack is short) and, for the held sounds, loop points in seconds and how long a note
 * holds (as in instruments.js: bass holds 0.9 × its length, at least 0.12 s; cloud its length, at least 0.5 s).
 */
export const TUNE_RENDERS = {
  bells: { rootKey: 79, seconds: 1.8, attack: 0.001, release: 0.05 },
  pluck: { rootKey: 67, seconds: 1.0, attack: 0.001, release: 0.05 },
  bass: {
    rootKey: 43, seconds: 1.85, hold: 1.5, attack: 0.001, release: 0.12, sustain: { factor: 0.9, minSeconds: 0.12 },
    loop: { start: 0.6, end: 0.6 + periods(0.8, midiToHz(43)), fade: 0.05 },
  },
  cloud: {
    rootKey: CLOUD_ROOT, seconds: 3.0, hold: 2.5, attack: 0.001, release: 1.0, sustain: { factor: 1, minSeconds: 0.5 },
    loop: { start: 0.25, end: 0.25 + periods(4 * cloudBeat, midiToHz(CLOUD_ROOT)), fade: 0.1 },
  },
};
/** A mic recording plays on Nano at its own pitch on row 3. */
export const RECORDING_PLAY = { rootKey: 60, attack: 0.004, release: 0.03 };
export const SPACE_SECONDS = 2.4;

/**
 * The gain Web Audio's ConvolverNode applies to an impulse when `normalize` is true (the Web Audio spec's
 * calculateNormalizationScale). openDAW's Convolver normalises differently (to a 0 dB spectral peak), so the
 * Space impulse is pre-scaled by this and loaded with normalize off: the reverb is as loud as the built-in one.
 */
export function impulseScale(channels, sampleRate) {
  let power = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) power += c[i] * c[i];
  power = Math.sqrt(power / (channels.length * channels[0].length));
  if (!Number.isFinite(power) || power < 0.000125) power = 0.000125;
  let scale = (1 / power) * 0.00125 * (44100 / sampleRate);
  if (channels.length === 4) scale *= 0.5;
  return scale;
}

/** File ids: what the openDAW side registers each rendered PCM under. */
export const drumFile = (kit, row, variant) => `${kit}.${DRUM_PIECES[row]}.${variant}`;
export const SPACE_FILE = 'space';

/**
 * The facts the mirror needs about every built-in sound (no PCM): which instrument plays it, its files, and for
 * tunes the reference pitch, length, envelope and loop. Lengths are whole frames at `sampleRate`.
 */
export function soundCatalogue(sampleRate = 48000) {
  const frames = (s) => Math.round(s * sampleRate);
  const sounds = {};
  for (const kit of DRUM_KITS) {
    sounds[kit] = {
      instrument: 'playfield',
      rows: DRUM_VARIANTS[kit].map((variants, row) => ({ variants, files: Array.from({ length: variants }, (_, v) => drumFile(kit, row, v)) })),
    };
  }
  for (const [id, t] of Object.entries(TUNE_RENDERS)) {
    sounds[id] = {
      instrument: 'nano', file: id, rootKey: t.rootKey, seconds: frames(t.seconds) / sampleRate,
      attack: t.attack, release: t.release, loop: t.loop || null, sustain: t.sustain || null,
    };
  }
  return { sampleRate, sounds, recording: RECORDING_PLAY, space: { file: SPACE_FILE, seconds: frames(SPACE_SECONDS) / sampleRate, channels: 2 } };
}

/** A small, fast seeded random source (mulberry32), returning 0 ≤ x < 1. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit seed from text (FNV-1a), so each file has its own fixed noise. */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

async function render(seconds, sampleRate, play) {
  const ctx = new OfflineAudioContext(1, Math.round(seconds * sampleRate), sampleRate);
  play(ctx);
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0)];
}

/**
 * Render one file. `seed` defaults to the file's own id; the checks pass another to show which pieces use noise.
 * Resolves with { id, sampleRate, channels: [Float32Array, …] }.
 */
export async function renderFile(id, { sampleRate = 48000, seed = id } = {}) {
  const rng = mulberry32(seedOf(seed));
  if (id === SPACE_FILE) {
    const ctx = new OfflineAudioContext(2, 1, sampleRate);
    const buf = makeImpulse(ctx, SPACE_SECONDS, 3, rng);
    return { id, sampleRate, channels: [buf.getChannelData(0), buf.getChannelData(1)] };
  }
  const tune = TUNE_RENDERS[id];
  if (tune) {
    // playTune holds the bass for 0.9 × dur and the cloud for dur.
    const dur = id === 'bass' ? tune.hold / 0.9 : tune.hold ?? 0.5;
    return { id, sampleRate, channels: await render(tune.seconds, sampleRate, (ctx) => playTune(ctx, id, tune.rootKey, 0, 1, dur, ctx.destination)) };
  }
  const [kit, piece] = id.split('.');
  const row = DRUM_PIECES.indexOf(piece);
  if (!DRUM_VARIANTS[kit] || row < 0) throw new Error(`render-sounds: no sound ${id}`);
  return { id, sampleRate, channels: await render(DRUM_SECONDS, sampleRate, (ctx) => playDrum(ctx, kit, row, 0, 1, ctx.destination, rng)) };
}

/** Every built-in file id: drums (with variants), tunes, then the Space impulse. */
export function allFiles() {
  const { sounds } = soundCatalogue();
  return [
    ...Object.values(sounds).flatMap((s) => (s.rows ? s.rows.flatMap((r) => r.files) : [s.file])),
    SPACE_FILE,
  ];
}

/** Render every built-in file. Resolves with a Map of file id → { id, sampleRate, channels }. */
export async function renderSounds({ sampleRate = 48000 } = {}) {
  const out = new Map();
  for (const r of await Promise.all(allFiles().map((id) => renderFile(id, { sampleRate })))) out.set(r.id, r);
  return out;
}
