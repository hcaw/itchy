// Every sound in Itchy is synthesised here in code (no sample files, no licences to worry about).
// Each voice is a short-lived little graph of Web Audio nodes that cleans itself up.
//
// The noisy sounds (snares, claps, hats and the reverb impulse) take an optional `rng`, a function returning
// 0 ≤ x < 1. The built-in engine leaves it as Math.random, so every hit differs; render-sounds.js passes a seeded
// one, so the sounds it renders for openDAW are the same on every boot. For the same reason no node has more than
// two connections into it: Chromium adds up a node's inputs in no fixed order, and with three or more the float
// rounding can differ from render to render (two numbers add up the same either way round).

import { midiToHz } from '../model/scales.js';

const noiseCache = new WeakMap();
function noise(ctx, rng) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

function noiseSource(ctx, t, len, rng = Math.random) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, rng);
  src.start(t, rng() * 0.5);
  src.stop(t + len);
  return src;
}

/** Gain envelope: fast attack, exponential decay to silence. */
function env(ctx, t, peak, attack, decay, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function osc(ctx, type, freq, t, len) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(t + len + 0.05);
  return o;
}

// ---------------------------------------------------------------- drum kits

const boom = {
  kick(ctx, t, v, out) {
    const o = osc(ctx, 'sine', 160, t, 0.5);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    o.connect(env(ctx, t, 1.0 * v, 0.003, 0.45, out));
    const click = osc(ctx, 'triangle', 900, t, 0.02);
    click.frequency.exponentialRampToValueAtTime(200, t + 0.02);
    click.connect(env(ctx, t, 0.25 * v, 0.001, 0.02, out));
  },
  snare(ctx, t, v, out, rng) {
    const n = noiseSource(ctx, t, 0.25, rng);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1200;
    n.connect(hp).connect(env(ctx, t, 0.55 * v, 0.002, 0.2, out));
    const o = osc(ctx, 'triangle', 190, t, 0.12);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    o.connect(env(ctx, t, 0.5 * v, 0.002, 0.1, out));
  },
  clap(ctx, t, v, out, rng) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const d of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(0.9 * v, t + d);
      g.gain.exponentialRampToValueAtTime(0.08 * v, t + d + 0.009);
    }
    g.gain.setValueAtTime(0.7 * v, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    noiseSource(ctx, t, 0.3, rng).connect(bp).connect(g).connect(out);
  },
  hat(ctx, t, v, out, rng) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    noiseSource(ctx, t, 0.1, rng).connect(hp).connect(env(ctx, t, 0.35 * v, 0.001, 0.055, out));
  },
};

const tiny = {
  kick(ctx, t, v, out) {
    const o = osc(ctx, 'square', 220, t, 0.18);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    o.connect(lp).connect(env(ctx, t, 0.6 * v, 0.002, 0.16, out));
  },
  snare(ctx, t, v, out, rng) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.6;
    noiseSource(ctx, t, 0.12, rng).connect(bp).connect(env(ctx, t, 0.7 * v, 0.001, 0.09, out));
    osc(ctx, 'square', 330, t, 0.05).connect(env(ctx, t, 0.15 * v, 0.001, 0.04, out));
  },
  clap(ctx, t, v, out) {
    // a woodblock "tok"
    const o = osc(ctx, 'sine', 1250, t, 0.1);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    o.connect(env(ctx, t, 0.6 * v, 0.001, 0.07, out));
  },
  hat(ctx, t, v, out) {
    const o = osc(ctx, 'square', 8200, t, 0.04);
    const o2 = osc(ctx, 'square', 5400, t, 0.04);
    const g = env(ctx, t, 0.08 * v, 0.001, 0.03, out);
    o.connect(g); o2.connect(g);
  },
};

const KITS = { kit: boom, tinykit: tiny };
const PIECES = ['kick', 'snare', 'clap', 'hat'];

/** The drum kits and their pieces, bottom row first, for render-sounds.js. */
export const DRUM_KITS = Object.keys(KITS);
export const DRUM_PIECES = PIECES;

export function playDrum(ctx, kitId, row, t, vel, out, rng = Math.random) {
  const kit = KITS[kitId] || boom;
  const piece = kit[PIECES[row]];
  if (piece) piece(ctx, t, vel, out, rng);
}

// ---------------------------------------------------------------- tune voices

const TUNES = {
  bells(ctx, t, f, v, dur, out) {
    const g = env(ctx, t, 0.32 * v, 0.003, 1.4, out);
    osc(ctx, 'sine', f, t, 1.5).connect(g);
    const sparkle = ctx.createGain(); // the shimmer and the knock meet here first (at most two inputs per node)
    sparkle.connect(out);
    const shimmer = env(ctx, t, 0.09 * v, 0.002, 0.35, sparkle);
    osc(ctx, 'sine', f * 4.01, t, 0.4).connect(shimmer);
    const knock = env(ctx, t, 0.05 * v, 0.001, 0.06, sparkle);
    osc(ctx, 'triangle', f * 2, t, 0.1).connect(knock);
  },
  pluck(ctx, t, f, v, dur, out) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(Math.min(9000, f * 10), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + 0.3);
    const o = osc(ctx, 'sawtooth', f, t, 0.8);
    o.connect(lp).connect(env(ctx, t, 0.28 * v, 0.002, 0.7, out));
  },
  bass(ctx, t, f, v, dur, out) {
    const hold = Math.max(0.12, dur * 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.008);
    g.gain.setTargetAtTime(0.28 * v, t + 0.01, 0.08);
    g.gain.setTargetAtTime(0.0001, t + hold, 0.04);
    g.connect(out);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(f * 12, t);
    lp.frequency.exponentialRampToValueAtTime(f * 3, t + 0.15);
    osc(ctx, 'sawtooth', f, t, hold + 0.3).connect(lp).connect(g);
    osc(ctx, 'sine', f, t, hold + 0.3).connect(g);
  },
  cloud(ctx, t, f, v, dur, out) {
    const hold = Math.max(0.5, dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12 * v, t + 0.12);
    g.gain.setTargetAtTime(0.0001, t + hold, 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.min(4000, f * 5); lp.Q.value = 0.5;
    lp.connect(g).connect(out);
    const saws = ctx.createGain(); // the two detuned saws meet here first (at most two inputs per node)
    saws.connect(lp);
    for (const detune of [-9, 0, 9]) {
      const o = osc(ctx, detune ? 'sawtooth' : 'triangle', f, t, hold + 2);
      o.detune.value = detune;
      o.connect(detune ? saws : lp);
    }
  },
};

export function playTune(ctx, soundId, midi, t, vel, dur, out) {
  (TUNES[soundId] || TUNES.bells)(ctx, t, midiToHz(midi), vel, dur, out);
}

/** A recorded sound, pitched by playback rate (semitones from its natural pitch). */
export function playSample(ctx, buffer, semis, t, vel, out) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, semis / 12);
  const len = buffer.duration / src.playbackRate.value;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9 * vel, t + 0.004);
  g.gain.setValueAtTime(0.9 * vel, t + Math.max(0.005, len - 0.03));
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  src.connect(g).connect(out);
  src.start(t);
  src.stop(t + len + 0.01);
}

/** Procedural reverb impulse: stereo noise with an exponential tail. */
export function makeImpulse(ctx, seconds = 2.4, decay = 3, rng = Math.random) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
