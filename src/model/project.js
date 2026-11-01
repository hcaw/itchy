// The project data model. A project is plain JSON: no classes, no audio objects, no DOM.
// That keeps it easy to save, undo, share or send to a server later.
//
// {
//   format: 'itchy-project', version: 1,
//   id, created, updated,
//   tempo: 60..160, swing: 0..1, mood: 'happy', key: 0..11,
//   layers: [{
//     id, sound: 'kit' | 'bells' | 'rec:<sampleId>' …, color: 0..7,
//     steps: 1..32 (this loop's length — layers may differ, for polyrhythm),
//     muted, volume: 0..1, octave: -2..2,
//     fx: { echo: 0..1, space: 0..1, tone: -1..1 },   // tone <0 darker, >0 brighter
//     notes: [{ s: step, r: row, len: steps, vel: 0..1 }]
//   }]
// }

import { MOODS } from './scales.js';
import { COLORS, rowsForSound, SOUNDS, isRecording } from './sounds.js';

export const FORMAT = 'itchy-project';
export const VERSION = 1;
export const MAX_LAYERS = 6;
export const TEMPO_MIN = 60;
export const TEMPO_MAX = 160;
export const DEFAULT_STEPS = 16;
export const MAX_STEPS = 32;

let counter = 0;
export function makeId(prefix = 'id') {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${counter.toString(36)}`;
}

const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

export function createLayer(sound = 'bells', { color = 0, notes = [], ...rest } = {}) {
  return {
    id: makeId('l'),
    sound,
    color,
    steps: DEFAULT_STEPS,
    muted: false,
    volume: 0.8,
    octave: 0,
    fx: { echo: 0, space: 0, tone: 0 },
    notes: notes.map((n) => ({ s: n.s, r: n.r, len: n.len ?? 1, vel: n.vel ?? 1 })), // same key order as migrate()
    ...rest,
  };
}

/** A brand new song: a starter beat (so play is never silent) and an empty bells critter to tap. */
export function createProject() {
  const now = Date.now();
  const beat = [0, 4, 8, 12].map((s) => ({ s, r: 0 })).concat([2, 6, 10, 14].map((s) => ({ s, r: 3, vel: 0.6 })));
  return {
    format: FORMAT,
    version: VERSION,
    id: makeId('p'),
    created: now,
    updated: now,
    tempo: 100,
    swing: 0,
    mood: 'happy',
    key: 0,
    layers: [createLayer('kit', { color: 1, notes: beat }), createLayer('bells', { color: 0 })],
  };
}

/** Pick a colour no other layer is using, so each critter stays recognisable. */
export function nextColor(project) {
  const used = new Set(project.layers.map((l) => l.color));
  for (let i = 0; i < COLORS.length; i++) if (!used.has(i)) return i;
  return project.layers.length % COLORS.length;
}

export function findLayer(project, id) {
  return project.layers.find((l) => l.id === id) || null;
}

export function noteAt(layer, s, r) {
  return layer.notes.find((n) => n.r === r && s >= n.s && s < n.s + (n.len || 1)) || null;
}

export function setNote(layer, s, r, on) {
  const existing = noteAt(layer, s, r);
  if (on && !existing) layer.notes.push({ s, r, len: 1, vel: 1 });
  if (!on && existing) layer.notes.splice(layer.notes.indexOf(existing), 1);
}

/** Notes that start on a given step of this layer's own loop. */
export function notesAtStep(layer, step) {
  const out = [];
  for (const n of layer.notes) if (n.s === step) out.push(n);
  return out;
}

export function isEmpty(project) {
  return project.layers.every((l) => l.notes.length === 0);
}

/**
 * Turn anything (old version, hand-edited file, half-written save) into a valid project.
 * Nothing can go wrong: bad values are clamped or replaced with defaults, never thrown.
 */
export function migrate(input) {
  const p = input && typeof input === 'object' ? input : {};
  const base = createProject();
  const out = {
    format: FORMAT,
    version: VERSION,
    id: typeof p.id === 'string' ? p.id : base.id,
    created: Number.isFinite(p.created) ? p.created : base.created,
    updated: Number.isFinite(p.updated) ? p.updated : base.updated,
    tempo: clamp(p.tempo, TEMPO_MIN, TEMPO_MAX, 100),
    swing: clamp(p.swing, 0, 1, 0),
    mood: MOODS[p.mood] ? p.mood : 'happy',
    key: Math.round(clamp(p.key, 0, 11, 0)),
    layers: [],
  };
  if (typeof p.name === 'string') out.name = p.name.slice(0, 60);
  const layers = Array.isArray(p.layers) ? p.layers.slice(0, MAX_LAYERS) : base.layers;
  const seen = new Set();
  for (const l of layers) {
    if (!l || typeof l !== 'object') continue;
    const sound = SOUNDS[l.sound] || isRecording(l.sound) ? l.sound : 'bells';
    const steps = Math.round(clamp(l.steps, 1, MAX_STEPS, DEFAULT_STEPS));
    const rows = rowsForSound(sound);
    let id = typeof l.id === 'string' && !seen.has(l.id) ? l.id : makeId('l');
    seen.add(id);
    const notes = [];
    const taken = new Set();
    for (const n of Array.isArray(l.notes) ? l.notes : []) {
      if (!n) continue;
      const s = Math.round(clamp(n.s, 0, steps - 1, -1));
      const r = Math.round(clamp(n.r, 0, rows - 1, -1));
      if (s < 0 || r < 0 || taken.has(`${s},${r}`)) continue;
      taken.add(`${s},${r}`);
      notes.push({ s, r, len: Math.round(clamp(n.len, 1, steps, 1)), vel: clamp(n.vel, 0.05, 1, 1) });
    }
    const fx = l.fx || {};
    out.layers.push({
      id,
      sound,
      color: Math.round(clamp(l.color, 0, COLORS.length - 1, out.layers.length % COLORS.length)),
      steps,
      muted: !!l.muted,
      volume: clamp(l.volume, 0, 1, 0.8),
      octave: Math.round(clamp(l.octave, -2, 2, 0)),
      fx: { echo: clamp(fx.echo, 0, 1, 0), space: clamp(fx.space, 0, 1, 0), tone: clamp(fx.tone, -1, 1, 0) },
      notes,
    });
  }
  if (out.layers.length === 0) out.layers = base.layers;
  return out;
}

export function clone(project) {
  return JSON.parse(JSON.stringify(project));
}

/** Every recording a project refers to (so storage can load or keep them). */
export function recordingsUsed(project) {
  return [...new Set(project.layers.filter((l) => isRecording(l.sound)).map((l) => l.sound.slice(4)))];
}
