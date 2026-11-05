// The mirror: Itchy's project JSON → a plain description (a "scene") of the openDAW project that plays it, and the
// smallest list of edits (ops) that turns one scene into the next. One way only: Itchy's JSON stays the only truth,
// and the openDAW project is rebuilt from it after every change (docs/OPENDAW-PORT.md §1d, §4).
//
// Pure: no openDAW, no Web Audio, no DOM, so `node --test` covers every formula (tests/mirror.test.js). Every value
// in a scene is already in openDAW's units: pulses (960 per quarter note, 240 per step), MIDI notes, decibels.
//
// `env` carries the catalogue facts the project doesn't: soundCatalogue() from render-sounds.js (instruments,
// files, reference pitches, sample lengths, loops) plus `recordings`, the mic recordings loaded so far
// ({ [id]: { seconds } }).

import { rowSemitones } from '../model/scales.js';
import { soundInfo, recordingId } from '../model/sounds.js';
import { TEMPO_MAX } from '../model/project.js';

// ---------------------------------------------------------------- units

/** Pulses per step: openDAW's PPQN.SemiQuaver (960 pulses per quarter note). */
export const STEP_PULSES = 240;
/** Pulses per second at a tempo in BPM. */
export const pulsesPerSecond = (bpm) => (960 * bpm) / 60;
/** Whole pulses covering `seconds` at a tempo. */
export const secondsToPulses = (seconds, bpm) => Math.ceil(seconds * pulsesPerSecond(bpm));

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/** A gain as decibels; silence is −∞. */
export const gainToDb = (gain) => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);
/** A critter's volume (0..1) as its unit's volume: openDAW's volume stops at −96 dB. */
export const volumeDb = (volume) => Math.max(-96, gainToDb(volume));
/** A critter's Space amount (0..1) as its send to the Space bus, as the built-in engine's 1.1 × space gain. */
export const spaceSendDb = (space) => gainToDb(1.1 * space);

/** The master volume (the built-in engine's master gain 0.8) and the Space bus's return (0.9). */
export const MASTER_DB = gainToDb(0.8);
export const SPACE_RETURN_DB = gainToDb(0.9);

// ---------------------------------------------------------------- swing

/** openDAW's squashUnit(amount, 0.01): what its groove does to the stored amount before warping. */
export const squash = (amount) => 0.01 + 0.98 * clamp(amount, 0, 1);
/** openDAW's moebiusEase(x, h): where a point x of a groove cell lands; moebiusEase(0.5, h) = h. */
export const moebiusEase = (x, h) => (x * h) / ((2 * h - 1) * (x - 1) + h);
/**
 * The groove amount for Itchy's swing (0..1). It undoes openDAW's squash so the odd step of each eighth lands at
 * 0.5 + swing/4 of the cell, where the built-in engine puts it (swing × half a step late).
 */
export const grooveAmount = (swing) => (0.5 + clamp(swing, 0, 1) / 4 - 0.01) / 0.98;
/** The global groove's cell: one eighth note. */
export const GROOVE_PULSES = 2 * STEP_PULSES;

// ---------------------------------------------------------------- charms

/** Revamp's range is 20 Hz to 20 kHz; a pass at the end of its range is neutral. */
export const NEUTRAL_LOW_PASS = 20000;
export const NEUTRAL_HIGH_PASS = 20;

/**
 * Web Audio reads a low- or high-pass filter's Q in decibels (the spec's α = sin ω / (2·10^(Q/20))); Revamp's q is
 * the plain biquad Q. So the built-in engine's Q of `db` is a Revamp q of 10^(db/20).
 */
export const linearQ = (db) => Math.pow(10, db / 20);

/**
 * Tone (−1 dark .. 1 bright) as Revamp's two passes, with the built-in engine's formulas. Both passes stay enabled
 * at order 0 (one 12 dB/oct biquad): switching `enabled` clicks (M1), so an unused pass sits at its neutral end.
 */
export function revamp(tone) {
  const lp = tone < 0 ? { hz: clamp(180 * Math.pow(2, (1 + tone) * 6.8), 20, 20000), q: linearQ(0.7 + 5 * -tone) } : { hz: NEUTRAL_LOW_PASS, q: linearQ(0.7) };
  const hp = tone > 0 ? { hz: clamp(20 * Math.pow(2, tone * 7.3), 20, 20000), q: linearQ(0.7 + 4 * tone) } : { hz: NEUTRAL_HIGH_PASS, q: linearQ(0.7) };
  return { lowPass: { enabled: true, order: 0, ...lp }, highPass: { enabled: true, order: 0, ...hp } };
}

/** Delay's `filter` for a low-pass on the echoes at 3.5 kHz, like the built-in echo's tone (20 · 1000^(1 + f) Hz). */
export const ECHO_FILTER = Math.log(3500 / 20) / Math.log(1000) - 1;
/** Delay's index for a dotted eighth (3/16), which follows the tempo. */
export const DOTTED_EIGHTH = 13;

/** Echo (0..1) as the Delay device. At 0 it stays enabled but silent: switching `enabled` clicks (M1). */
export function delay(echo) {
  return {
    delayMusical: DOTTED_EIGHTH, delayMillis: 0, preSyncTimeLeft: 0, preSyncTimeRight: 0,
    feedback: echo > 0 ? 0.3 + 0.42 * echo : 0,
    cross: 0, // not ping-pong
    filter: ECHO_FILTER,
    wetDb: gainToDb(0.75 * echo),
    dryDb: 0,
  };
}

// ---------------------------------------------------------------- notes

/** Playfield slot for a drum row and variant: four slots per row, from MIDI note 36. */
export const drumPitch = (row, variant = 0) => 36 + 4 * row + variant;
/** A drum note's variant: neighbouring hits of a noisy piece differ. */
export const drumVariant = (step, variants) => step % variants;
/** Drums play one-shot (the slot's gate is off), so their length doesn't matter. */
export const DRUM_PULSES = STEP_PULSES;

const midi = (n) => clamp(Math.round(n), 0, 127);
/** A tune note's MIDI pitch: as the built-in engine, base + the mood's row + key + octave. */
export const tunePitch = (sound, row, { mood, key }, octave = 0) => midi(soundInfo(sound).base + rowSemitones(row, mood) + key + 12 * octave);
/** A recording's MIDI pitch on rootKey 60: row 3 is its own pitch, whatever the key. */
export const recordingPitch = (row, { mood }, octave = 0) => midi(60 + rowSemitones(row, mood) - rowSemitones(3, mood) + 12 * octave);

/** Nano's read rate for a pitch played from a sample at rootKey. */
export const playbackRate = (pitch, rootKey) => Math.pow(2, (pitch - rootKey) / 12);

/** A one-shot note lasts as long as its sample at its own rate, at the fastest tempo, so it never ends early. */
export const oneShotPulses = (seconds, pitch, rootKey) => Math.ceil((seconds / playbackRate(pitch, rootKey)) * pulsesPerSecond(TEMPO_MAX));

/** A held note (bass, cloud): its length in steps × the sound's factor, at least its minimum time. */
export const heldPulses = (len, { factor, minSeconds }, bpm) => Math.max(Math.round(factor * len * STEP_PULSES), secondsToPulses(minSeconds, bpm));

// ---------------------------------------------------------------- scene

/** Every file the library unit holds: each built-in sound's files and each loaded recording. */
export function libraryFiles(env) {
  const files = [];
  for (const s of Object.values(env.sounds)) {
    if (s.rows) for (const r of s.rows) files.push(...r.files);
    else files.push(s.file);
  }
  for (const id of Object.keys(env.recordings || {})) files.push(`rec:${id}`);
  return files;
}

/** The instrument that plays a sound: Playfield slots for a kit, a Nano for a tune or a recording. */
export function describeInstrument(sound, env) {
  const recId = recordingId(sound);
  if (recId) {
    const rec = env.recordings?.[recId];
    return { type: 'nano', file: rec ? sound : null, seconds: rec ? rec.seconds : 0, rootKey: env.recording.rootKey, volumeDb: env.recording.gainDb ?? 0, attack: env.recording.attack, release: env.recording.release, loop: null, sustain: null };
  }
  const s = env.sounds[sound] || env.sounds.bells;
  if (s.instrument === 'playfield') {
    // gate 0 (Off): every hit plays to its end. polyphone: a quick second hit doesn't cut the first one off.
    const slots = s.rows.flatMap((r, row) => r.files.map((file, v) => ({ note: drumPitch(row, v), file, gate: 0, polyphone: true, volumeDb: s.gainDb ?? 0 })));
    return { type: 'playfield', slots, variants: s.rows.map((r) => r.variants) };
  }
  // A Nano unit plays at the sound's trim (openDAW's default is −3 dB, so it is always set). A held sound loops a
  // steady stretch of its sample.
  const loop = s.loop ? { enabled: true, start: s.loop.start / s.seconds, end: s.loop.end / s.seconds, fade: s.loop.fade } : null;
  return { type: 'nano', file: s.file, seconds: s.seconds, rootKey: s.rootKey, volumeDb: s.gainDb ?? 0, attack: s.attack, release: s.release, loop, sustain: s.sustain };
}

const instrumentFiles = (inst) => (inst.type === 'playfield' ? inst.slots.map((s) => s.file) : inst.file ? [inst.file] : []);

/** One note as an openDAW note event, or null when it can't sound yet (a recording that isn't loaded). */
function describeNote(n, layer, inst, project) {
  const position = n.s * STEP_PULSES;
  const base = { key: `${n.s},${n.r}`, position, velocity: n.vel ?? 1 };
  if (inst.type === 'playfield') {
    const variants = inst.variants[n.r] || 1;
    return { ...base, pitch: drumPitch(n.r, drumVariant(n.s, variants)), duration: DRUM_PULSES };
  }
  if (!inst.file) return null;
  const pitch = recordingId(layer.sound) ? recordingPitch(n.r, project, layer.octave) : tunePitch(layer.sound, n.r, project, layer.octave);
  const duration = inst.sustain ? heldPulses(n.len || 1, inst.sustain, project.tempo) : oneShotPulses(inst.seconds, pitch, inst.rootKey);
  return { ...base, pitch, duration };
}

/**
 * One note played live (a preview or a tap): its MIDI pitch, length in pulses and velocity, as the song would play
 * it; or null when it can't sound yet (a recording that isn't loaded). `note.s` picks a noisy drum's variant.
 */
export function describeVoice(layer, note, project, env) {
  return describeNote({ s: 0, r: 0, ...note }, layer, describeInstrument(layer.sound, env), project);
}

/** One critter as an openDAW unit: Zeitgeist → instrument → Revamp → Delay, with a send to Space. */
export function describeUnit(layer, project, env) {
  const instrument = describeInstrument(layer.sound, env);
  const notes = [];
  for (const n of layer.notes) {
    const d = describeNote(n, layer, instrument, project);
    if (d) notes.push(d);
  }
  notes.sort((a, b) => a.position - b.position || a.pitch - b.pitch || (a.key < b.key ? -1 : 1));
  return {
    key: layer.id,
    sound: layer.sound,
    instrument,
    files: instrumentFiles(instrument),
    volumeDb: volumeDb(layer.volume),
    regionMute: !!layer.muted, // asleep: the region plays nothing, but taps and previews still sound
    loopPulses: layer.steps * STEP_PULSES,
    revamp: revamp(layer.fx.tone),
    delay: delay(layer.fx.echo),
    spaceSendDb: spaceSendDb(layer.fx.space),
    notes,
  };
}

/** The whole openDAW project for an Itchy project. */
export function describe(project, env) {
  return {
    bpm: project.tempo,
    groove: { duration: GROOVE_PULSES, amount: grooveAmount(project.swing) },
    masterDb: MASTER_DB,
    library: libraryFiles(env),
    // normalize off: openDAW scales an impulse to a 0 dB spectral peak, much quieter than Web Audio's ConvolverNode,
    // so boot pre-scales the PCM the way Web Audio does (impulseScale in render-sounds.js) and the reverb matches.
    space: { file: env.space.file, returnDb: SPACE_RETURN_DB, normalize: false, wetDb: 0, dryDb: -Infinity },
    units: project.layers.map((l) => describeUnit(l, project, env)),
  };
}

// ---------------------------------------------------------------- diff

/** Scalar fields of an object, flattened to 'a.b' paths. */
function fields(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) fields(v, `${prefix}${k}.`, out);
    else if (!Array.isArray(v)) out[prefix + k] = v;
  }
  return out;
}
const UNIT_FIELDS = ['volumeDb', 'regionMute', 'loopPulses', 'revamp', 'delay', 'spaceSendDb'];
const unitFields = (u) => fields(Object.fromEntries(UNIT_FIELDS.map((k) => [k, u[k]])));
const sameInstrument = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function diffFields(a, b, emit) {
  for (const [path, value] of Object.entries(b)) if (!Object.is(a[path], value)) emit(path, value);
}

/**
 * The edits that turn scene `prev` into scene `next` (`prev` null: build everything). Ops:
 *   { op: 'setField', key: null | unitKey, path, value }   a project field (key null) or a unit field
 *   { op: 'addUnit', key, unit } · { op: 'removeUnit', key } · { op: 'replaceUnit', key, unit } (kit ↔ tune)
 *   { op: 'setFile', key, instrument }                       same instrument type, another sound
 *   { op: 'addNote', key, note } · { op: 'removeNote', key, noteKey } · { op: 'setNote', key, noteKey, changes }
 *   { op: 'addFile', file }                                  a file for the library unit to hold (built-ins, then
 *                                                            each recording as it loads)
 * With `prev` null every project field, file and unit is added. Space's bus and impulse are built once at boot.
 */
export function diffScene(prev, next) {
  const ops = [];
  const p = prev || { units: [], library: [] };
  const globals = (sc) => fields({ bpm: sc.bpm, groove: sc.groove, masterDb: sc.masterDb });
  diffFields(prev ? globals(prev) : {}, globals(next), (path, value) => ops.push({ op: 'setField', key: null, path, value }));
  const had = new Set(p.library);
  for (const file of next.library) if (!had.has(file)) ops.push({ op: 'addFile', file });

  const before = new Map(p.units.map((u) => [u.key, u]));
  const keys = new Set(next.units.map((u) => u.key));
  for (const u of p.units) if (!keys.has(u.key)) ops.push({ op: 'removeUnit', key: u.key });
  for (const u of next.units) {
    const old = before.get(u.key);
    if (!old) { ops.push({ op: 'addUnit', key: u.key, unit: u }); continue; }
    if (old.instrument.type !== u.instrument.type) { ops.push({ op: 'replaceUnit', key: u.key, unit: u }); continue; }
    if (!sameInstrument(old.instrument, u.instrument)) ops.push({ op: 'setFile', key: u.key, instrument: u.instrument });
    diffFields(unitFields(old), unitFields(u), (path, value) => ops.push({ op: 'setField', key: u.key, path, value }));
    const oldNotes = new Map(old.notes.map((n) => [n.key, n]));
    const newKeys = new Set(u.notes.map((n) => n.key));
    for (const n of old.notes) if (!newKeys.has(n.key)) ops.push({ op: 'removeNote', key: u.key, noteKey: n.key });
    for (const n of u.notes) {
      const o = oldNotes.get(n.key);
      if (!o) { ops.push({ op: 'addNote', key: u.key, note: n }); continue; }
      const changes = {};
      for (const f of ['position', 'duration', 'pitch', 'velocity']) if (!Object.is(o[f], n[f])) changes[f] = n[f];
      if (Object.keys(changes).length) ops.push({ op: 'setNote', key: u.key, noteKey: n.key, changes });
    }
  }
  return ops;
}
