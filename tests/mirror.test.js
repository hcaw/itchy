// The mirror (src/audio/mirror.js) turns Itchy's project into the openDAW project that plays it. These tests pin
// every formula in docs/OPENDAW-PORT.md §4 to the built-in engine's, so both engines play the same song.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describe, describeUnit, diffScene, libraryFiles, STEP_PULSES, pulsesPerSecond, secondsToPulses, volumeDb, spaceSendDb,
  gainToDb, grooveAmount, squash, moebiusEase, revamp, delay, ECHO_FILTER, drumPitch, tunePitch, recordingPitch,
  playbackRate, oneShotPulses, MASTER_DB,
} from '../src/audio/mirror.js';
import { soundCatalogue, TUNE_RENDERS, DRUM_VARIANTS, DRUM_GAIN_DB, RECORDING_PLAY } from '../src/audio/render-sounds.js';
import { swingOffset, stepDuration } from '../src/audio/scheduler.js';
import { createProject, createLayer, migrate, clone, TEMPO_MAX } from '../src/model/project.js';
import { EXAMPLES } from '../src/model/examples.js';
import { MOOD_ORDER, rowSemitones } from '../src/model/scales.js';
import { soundInfo, TUNE_SOUNDS, BEAT_SOUNDS, TUNE_ROWS } from '../src/model/sounds.js';

const env = (recordings = {}) => ({ ...soundCatalogue(48000), recordings });
const near = (a, b, eps = 1e-9, what = '') => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≠ ${b}`);
const song = (layers, extra = {}) => migrate({ tempo: 100, mood: 'happy', key: 0, ...extra, layers });
const unitOf = (project, i = 0, e = env()) => describe(project, e).units[i];

test('notes sit at s·240 pulses, each critter loops over its own length, and asleep mutes the region and the unit', () => {
  const p = song([{ sound: 'bells', steps: 12, muted: true, notes: [{ s: 0, r: 0 }, { s: 5, r: 2 }, { s: 11, r: 7 }] }]);
  const u = unitOf(p);
  assert.deepEqual(u.notes.map((n) => n.position), [0, 5 * 240, 11 * 240]);
  assert.equal(u.loopPulses, 12 * STEP_PULSES);
  assert.equal(u.regionMute, true);
  assert.equal(u.mute, true, 'asleep mutes the unit, so the notes it is playing stop too');
  assert.equal(u.volumeDb, volumeDb(0.8), 'asleep leaves the volume alone');
  const awake = unitOf(song([{ sound: 'bells', notes: [] }]));
  assert.equal(awake.regionMute, false);
  assert.equal(awake.mute, false);
});

test('drum notes pick Playfield slot 36 + 4·row + variant, and noisy pieces alternate variants by step', () => {
  for (const kit of BEAT_SOUNDS) {
    const notes = [];
    for (let r = 0; r < 4; r++) for (let s = 0; s < 8; s++) notes.push({ s, r, vel: 0.5 });
    const u = unitOf(song([{ sound: kit, notes }]));
    assert.equal(u.instrument.type, 'playfield');
    for (const n of u.notes) {
      const [s, r] = n.key.split(',').map(Number);
      const variants = DRUM_VARIANTS[kit][r];
      assert.equal(n.pitch, 36 + 4 * r + (s % variants), `${kit} ${n.key}`);
      assert.equal(n.duration, 240);
      assert.equal(n.velocity, 0.5);
    }
    // One slot per row and variant; every slot one-shot (gate off) and polyphonic.
    assert.equal(u.instrument.slots.length, DRUM_VARIANTS[kit].reduce((a, b) => a + b, 0));
    assert.ok(u.instrument.slots.every((sl) => sl.gate === 0 && sl.polyphone === true && sl.volumeDb === DRUM_GAIN_DB[kit]), 'every slot gate 0, polyphone, at the kit’s trim');
    assert.deepEqual(new Set(u.instrument.slots.map((sl) => sl.note)).size, u.instrument.slots.length, 'slot notes are unique');
  }
  assert.equal(drumPitch(0, 0), 36);
  assert.equal(drumPitch(3, 3), 51);
  // Kicks have no noise, so one variant: every kick is slot 36.
  assert.equal(DRUM_VARIANTS.kit[0], 1);
});

test('tune pitches match the built-in engine for every mood, key and octave, clamped to MIDI', () => {
  for (const sound of TUNE_SOUNDS) {
    for (const mood of MOOD_ORDER) {
      for (const key of [0, 5, 11]) {
        for (const octave of [-2, 0, 2]) {
          const notes = Array.from({ length: TUNE_ROWS }, (_, r) => ({ s: r, r }));
          const u = unitOf(song([{ sound, octave, notes }], { mood, key }));
          for (const n of u.notes) {
            const r = Number(n.key.split(',')[1]);
            assert.equal(n.pitch, soundInfo(sound).base + rowSemitones(r, mood) + key + 12 * octave, `${sound} ${mood} ${key} ${octave} row ${r}`);
          }
        }
      }
    }
  }
  assert.equal(tunePitch('bells', 7, { mood: 'happy', key: 11 }, 9), 127, 'clamped at the top');
  assert.equal(tunePitch('bass', 0, { mood: 'happy', key: 0 }, -9), 0, 'clamped at the bottom');
});

test('a recording plays on rootKey 60 at its own pitch on row 3, whatever the key; until it loads it has no notes', () => {
  const layer = { sound: 'rec:abc', octave: 1, notes: [{ s: 0, r: 3 }, { s: 1, r: 0 }, { s: 2, r: 7 }] };
  for (const mood of MOOD_ORDER) {
    for (const key of [0, 7, 11]) {
      const u = unitOf(song([layer], { mood, key }), 0, env({ abc: { seconds: 1.2 } }));
      assert.equal(u.instrument.type, 'nano');
      assert.equal(u.instrument.rootKey, 60);
      assert.equal(u.instrument.file, 'rec:abc');
      assert.deepEqual(u.notes.map((n) => n.pitch), [72, 72 + rowSemitones(0, mood) - rowSemitones(3, mood), 72 + rowSemitones(7, mood) - rowSemitones(3, mood)]);
      // The same as the built-in engine's playback rate for a recording.
      const native = rowSemitones(7, mood) + key + 12 - rowSemitones(3, mood) - key;
      near(playbackRate(u.notes[2].pitch, 60), Math.pow(2, native / 12), 1e-12, 'rate');
    }
  }
  assert.equal(recordingPitch(3, { mood: 'happy' }), 60);
  const waiting = unitOf(song([layer]), 0, env());
  assert.equal(waiting.instrument.file, null);
  assert.deepEqual(waiting.notes, [], 'silently skipped until loaded, as today');
  assert.deepEqual(waiting.files, []);
});

test('volume, send and master levels in decibels', () => {
  assert.equal(volumeDb(0), -96);
  assert.equal(volumeDb(1), 0);
  near(volumeDb(0.5), 20 * Math.log10(0.5));
  assert.equal(spaceSendDb(0), -Infinity);
  near(spaceSendDb(0.5), 20 * Math.log10(0.55));
  near(MASTER_DB, 20 * Math.log10(0.8));
  assert.equal(gainToDb(0), -Infinity);
});

test('every Nano unit plays at its sound’s level trim (never openDAW’s −3 dB default), and every held sound loops inside its sample', () => {
  const p = song([...TUNE_SOUNDS.map((sound) => ({ sound, notes: [{ s: 0, r: 0 }] })), { sound: 'rec:x', notes: [] }]);
  for (const u of describe(p, env({ x: { seconds: 0.5 } })).units) {
    assert.equal(u.instrument.type, 'nano');
    assert.equal(u.instrument.volumeDb, (TUNE_RENDERS[u.sound] ?? RECORDING_PLAY).gainDb, `${u.sound}: set explicitly; openDAW's default is −3 dB`);
    assert.ok(Math.abs(u.instrument.volumeDb) <= 4, 'a trim is small');
    const held = !!TUNE_RENDERS[u.sound]?.sustain;
    assert.equal(!!u.instrument.loop?.enabled, held, `${u.sound} loops only if held`);
    if (held) {
      const { start, end, fade } = u.instrument.loop;
      assert.ok(start > 0 && start < end && end <= 1, `${u.sound} loop ${start}..${end} lies inside the sample`);
      assert.ok(fade > 0 && fade < (end - start) * u.instrument.seconds, `${u.sound} crossfade fits the loop`);
    }
  }
});

test('tone: Revamp passes at order 0, always enabled, neutral when unused, with the built-in formulas', () => {
  const flat = revamp(0);
  assert.deepEqual(flat, { lowPass: { enabled: true, order: 0, hz: 20000, q: 10 ** (0.7 / 20) }, highPass: { enabled: true, order: 0, hz: 20, q: 10 ** (0.7 / 20) } });
  for (const tone of [-1, -0.5, -0.1]) {
    const r = revamp(tone);
    near(r.lowPass.hz, Math.min(20000, 180 * Math.pow(2, (1 + tone) * 6.8)), 1e-9, `lp ${tone}`);
    near(r.lowPass.q, 10 ** ((0.7 + 5 * -tone) / 20), 1e-12, 'Web Audio’s Q is in dB; Revamp’s is linear');
    assert.deepEqual(r.highPass, flat.highPass);
  }
  for (const tone of [0.1, 0.5, 1]) {
    const r = revamp(tone);
    near(r.highPass.hz, 20 * Math.pow(2, tone * 7.3), 1e-9, `hp ${tone}`);
    near(r.highPass.q, 10 ** ((0.7 + 4 * tone) / 20), 1e-12);
    assert.deepEqual(r.lowPass, flat.lowPass);
  }
  assert.equal(revamp(-1e-9).lowPass.hz, 20000, 'no jump just below neutral');
  near(revamp(1e-9).highPass.hz, 20, 1e-6, 'no jump just above neutral');
  for (const t of [-1, -0.3, 0, 0.4, 1]) {
    const r = revamp(t);
    for (const pass of [r.lowPass, r.highPass]) assert.ok(pass.hz >= 20 && pass.hz <= 20000, 'within Revamp’s range');
  }
});

test('echo: a dotted-eighth Delay with the built-in feedback, level and a 3.5 kHz tone; silent but enabled at 0', () => {
  const off = delay(0);
  assert.equal(off.wetDb, -Infinity);
  assert.equal(off.feedback, 0);
  const half = delay(0.5);
  near(half.feedback, 0.3 + 0.42 * 0.5);
  near(half.wetDb, 20 * Math.log10(0.75 * 0.5));
  near(delay(1).feedback, 0.72);
  for (const d of [off, half]) {
    assert.equal(d.delayMusical, 13, '3/16');
    assert.equal(d.cross, 0, 'not ping-pong');
    assert.equal(d.preSyncTimeLeft, 0);
    assert.equal(d.preSyncTimeRight, 0);
    assert.equal(d.delayMillis, 0);
    assert.equal(d.dryDb, 0);
  }
  near(ECHO_FILTER, -0.2523, 1e-4);
  near(20 * Math.pow(1000, 1 + ECHO_FILTER), 3500, 1e-6, 'echo low-pass');
});

test('swing: the groove amount undoes openDAW’s squash, so the odd step lands where the built-in engine puts it', () => {
  assert.equal(grooveAmount(0), 0.5);
  near(grooveAmount(0.5), 0.6275510204081632, 1e-12);
  near(grooveAmount(1), 0.7551020408163265, 1e-12);
  assert.equal(squash(grooveAmount(0)), 0.5, 'straight at 0, exactly');
  for (const s of [0, 0.1, 0.25, 0.5, 0.66, 0.9, 1]) {
    const h = squash(grooveAmount(s));
    near(h, 0.5 + s / 4, 1e-12, `squash at ${s}`);
    near(moebiusEase(0.5, h), 0.5 + s / 4, 1e-12, `the odd sixteenth at ${s}`);
    // In seconds, the odd step's delay equals the scheduler's swing offset, at any tempo.
    for (const bpm of [60, 100, 160]) {
      const delaySeconds = ((h - 0.5) * 2 * STEP_PULSES) / pulsesPerSecond(bpm);
      near(delaySeconds, swingOffset(1, stepDuration(bpm), s), 1e-12, `${s} at ${bpm}`);
    }
  }
  const p = song([{ sound: 'kit', notes: [] }], { swing: 0.5 });
  const sc = describe(p, env());
  assert.deepEqual(sc.groove, { duration: 480, amount: grooveAmount(0.5) });
});

test('note lengths: one-shots outlast their sample at any tempo; bass and cloud hold like the built-in engine', () => {
  const e = env();
  for (const bpm of [60, 160]) {
    const notes = [{ s: 0, r: 0, len: 1 }, { s: 2, r: 4, len: 3 }, { s: 8, r: 7, len: 8 }];
    for (const sound of TUNE_SOUNDS) {
      const u = unitOf(song([{ sound, notes }], { tempo: bpm }), 0, e);
      const t = TUNE_RENDERS[sound];
      for (const n of u.notes) {
        const len = notes.find((x) => `${x.s},${x.r}` === n.key).len;
        assert.ok(Number.isInteger(n.duration) && n.duration > 0);
        if (t.sustain) {
          // The built-in engine holds for max(minSeconds, factor × len × step) seconds.
          const native = Math.max(t.sustain.minSeconds, t.sustain.factor * len * stepDuration(bpm));
          near(n.duration / pulsesPerSecond(bpm), native, 1 / pulsesPerSecond(bpm) + 1e-12, `${sound} len ${len} at ${bpm}`);
        } else {
          const plays = u.instrument.seconds / playbackRate(n.pitch, u.instrument.rootKey);
          assert.ok(n.duration / pulsesPerSecond(TEMPO_MAX) >= plays, `${sound} never ends before its sample, even at ${TEMPO_MAX}`);
          assert.equal(n.duration, oneShotPulses(u.instrument.seconds, n.pitch, u.instrument.rootKey), 'and does not depend on the tempo');
        }
      }
    }
  }
  assert.equal(secondsToPulses(0.12, 60), 116);
  assert.equal(secondsToPulses(0.5, 160), 1280);
});

test('a len-32 note at 60 BPM on the top row, key 11, octave +2, either loops or never runs past its sample', () => {
  const e = env({ r1: { seconds: 0.8 } });
  for (const sound of [...TUNE_SOUNDS, 'rec:r1']) {
    const p = song([{ sound, steps: 32, octave: 2, notes: [{ s: 0, r: TUNE_ROWS - 1, len: 32 }] }], { tempo: 60, key: 11 });
    const u = unitOf(p, 0, e);
    const [n] = u.notes;
    assert.equal(p.layers[0].notes[0].len, 32);
    const seconds = n.duration / pulsesPerSecond(60);
    const sampleSeconds = u.instrument.seconds / playbackRate(n.pitch, u.instrument.rootKey);
    if (u.instrument.sustain) {
      assert.ok(u.instrument.loop?.enabled, `${sound}: an 8 s note needs ${seconds.toFixed(2)} s from a ${sampleSeconds.toFixed(3)} s sample, so it loops`);
    } else {
      assert.ok(seconds >= sampleSeconds, `${sound} plays its whole sample`);
    }
  }
});

test('every example song and a new song give a valid scene, and every file a unit uses is in the library', () => {
  const e = env();
  const projects = [createProject(), ...EXAMPLES.map((x) => migrate(x))];
  for (const p of projects) {
    const sc = describe(p, e);
    assert.equal(sc.units.length, p.layers.length);
    assert.equal(sc.bpm, p.tempo);
    const library = new Set(sc.library);
    assert.equal(library.size, sc.library.length, 'library files are unique');
    assert.ok(!library.has(sc.space.file), 'the Space impulse is held by its Convolver, not the library');
    for (const u of sc.units) {
      for (const f of u.files) assert.ok(library.has(f), `${u.sound} uses ${f}, which the library holds`);
      for (const n of u.notes) {
        assert.ok(Number.isInteger(n.position) && n.position >= 0 && n.position < u.loopPulses, `${n.key} inside the loop`);
        assert.ok(Number.isInteger(n.pitch) && n.pitch >= 0 && n.pitch <= 127);
        assert.ok(Number.isInteger(n.duration) && n.duration > 0);
        assert.ok(n.velocity > 0 && n.velocity <= 1);
      }
      for (const v of [u.volumeDb, u.revamp.lowPass.hz, u.revamp.highPass.hz, u.delay.feedback]) assert.ok(Number.isFinite(v));
    }
    assert.deepEqual(diffScene(sc, describe(clone(p), e)), [], 'describing the same song twice changes nothing');
  }
  // The library holds every built-in file and each loaded recording.
  const lib = libraryFiles(env({ q: { seconds: 1 } }));
  assert.ok(lib.includes('kit.hat.3') && lib.includes('tinykit.snare.3') && lib.includes('cloud') && lib.includes('rec:q'));
  assert.ok(!lib.includes('tinykit.hat.1'), 'tiny hats have no noise, so one variant');
});

// ---------------------------------------------------------------- diffScene

const base = () => song([
  { id: 'd', sound: 'kit', notes: [{ s: 0, r: 0 }, { s: 2, r: 3 }] },
  { id: 't', sound: 'bells', notes: [{ s: 0, r: 2 }, { s: 4, r: 5, len: 2 }] },
  { id: 'b', sound: 'bass', notes: [{ s: 1, r: 0, len: 2 }] },
]);
const ops = (p, edit, e = env()) => {
  const q = clone(p);
  edit(q);
  return diffScene(describe(p, e), describe(q, e));
};

test('diffScene: from nothing it builds every project field, file and unit', () => {
  const sc = describe(base(), env());
  const all = diffScene(null, sc);
  assert.deepEqual(all.filter((o) => o.op === 'addUnit').map((o) => o.key), ['d', 't', 'b']);
  assert.equal(all.filter((o) => o.op === 'addFile').length, sc.library.length);
  assert.deepEqual(all.filter((o) => o.op === 'setField').map((o) => o.path).sort(), ['bpm', 'groove.amount', 'groove.duration', 'masterDb']);
});

test('diffScene: a charm move writes only that charm’s fields', () => {
  const p = base();
  assert.deepEqual(ops(p, (q) => { q.layers[1].fx.space = 0.4; }), [{ op: 'setField', key: 't', path: 'spaceSendDb', value: spaceSendDb(0.4) }]);
  const echo = ops(p, (q) => { q.layers[1].fx.echo = 0.3; });
  assert.deepEqual(echo.map((o) => o.path).sort(), ['delay.feedback', 'delay.wetDb']);
  assert.ok(echo.every((o) => o.op === 'setField' && o.key === 't'));
  const dark = ops(p, (q) => { q.layers[1].fx.tone = -0.4; });
  assert.deepEqual(dark.map((o) => o.path).sort(), ['revamp.lowPass.hz', 'revamp.lowPass.q']);
  const volume = ops(p, (q) => { q.layers[0].volume = 0.5; });
  assert.deepEqual(volume, [{ op: 'setField', key: 'd', path: 'volumeDb', value: volumeDb(0.5) }]);
  assert.deepEqual(ops(p, (q) => { q.layers[0].muted = true; }), [{ op: 'setField', key: 'd', path: 'regionMute', value: true }, { op: 'setField', key: 'd', path: 'mute', value: true }]);
  assert.deepEqual(ops(p, (q) => { q.layers[0].steps = 12; }), [{ op: 'setField', key: 'd', path: 'loopPulses', value: 12 * 240 }]);
  assert.deepEqual(ops(p, (q) => { q.swing = 1; }), [{ op: 'setField', key: null, path: 'groove.amount', value: grooveAmount(1) }]);
});

test('diffScene: adding and removing notes', () => {
  const p = base();
  const add = ops(p, (q) => { q.layers[1].notes.push({ s: 7, r: 1, len: 1, vel: 0.7 }); });
  assert.equal(add.length, 1);
  assert.equal(add[0].op, 'addNote');
  assert.equal(add[0].key, 't');
  assert.equal(add[0].note.key, '7,1');
  assert.equal(add[0].note.position, 7 * 240);
  assert.equal(add[0].note.velocity, 0.7);
  assert.deepEqual(ops(p, (q) => { q.layers[0].notes.shift(); }), [{ op: 'removeNote', key: 'd', noteKey: '0,0' }]);
  const longer = ops(p, (q) => { q.layers[2].notes[0].len = 4; });
  assert.deepEqual(longer, [{ op: 'setNote', key: 'b', noteKey: '1,0', changes: { duration: Math.round(0.9 * 4 * 240) } }]);
  const softer = ops(p, (q) => { q.layers[1].notes[0].vel = 0.3; });
  assert.deepEqual(softer, [{ op: 'setNote', key: 't', noteKey: '0,2', changes: { velocity: 0.3 } }]);
});

test('diffScene: a mood or key change rewrites only tune pitches (and the one-shot lengths that follow them)', () => {
  for (const edit of [(q) => { q.mood = 'spooky'; }, (q) => { q.key = 5; }]) {
    const changed = ops(base(), edit);
    assert.ok(changed.length > 0);
    for (const o of changed) {
      assert.equal(o.op, 'setNote');
      assert.notEqual(o.key, 'd', 'drums ignore the mood and key');
      // A higher bell plays its sample faster, so its one-shot note is shorter; a held bass note is not.
      assert.deepEqual(Object.keys(o.changes), o.key === 't' ? ['duration', 'pitch'] : ['pitch']);
    }
  }
});

test('diffScene: a tempo change sets the tempo and only the held notes’ time-based minimums', () => {
  const changed = ops(base(), (q) => { q.tempo = 160; });
  assert.deepEqual(changed[0], { op: 'setField', key: null, path: 'bpm', value: 160 });
  for (const o of changed.slice(1)) {
    assert.equal(o.op, 'setNote');
    assert.equal(o.key, 'b', 'one-shots don’t depend on the tempo');
    assert.deepEqual(Object.keys(o.changes), ['duration']);
  }
});

test('diffScene: changing sound re-points the instrument of the same type, and replaces a kit ↔ tune unit', () => {
  const p = base();
  const pluck = ops(p, (q) => { q.layers[1].sound = 'pluck'; });
  assert.equal(pluck[0].op, 'setFile');
  assert.equal(pluck[0].instrument.file, 'pluck');
  assert.equal(pluck[0].instrument.rootKey, TUNE_RENDERS.pluck.rootKey);
  assert.ok(pluck.slice(1).every((o) => o.op === 'setNote' && Object.keys(o.changes).every((k) => k === 'pitch' || k === 'duration')));
  const looped = ops(p, (q) => { q.layers[1].sound = 'cloud'; });
  assert.equal(looped[0].op, 'setFile');
  assert.ok(looped[0].instrument.loop.enabled, 'bells → cloud turns the loop on');
  const tiny = ops(p, (q) => { q.layers[0].sound = 'tinykit'; });
  assert.equal(tiny[0].op, 'setFile');
  assert.equal(tiny[0].instrument.type, 'playfield');
  const swapped = ops(p, (q) => { q.layers[0].sound = 'bells'; q.layers[0].notes = []; });
  assert.deepEqual(swapped.map((o) => o.op), ['replaceUnit']);
  assert.equal(swapped[0].unit.instrument.type, 'nano');
  const back = ops(p, (q) => { q.layers[1].sound = 'kit'; q.layers[1].notes = [{ s: 0, r: 0, len: 1, vel: 1 }]; });
  assert.deepEqual(back.map((o) => o.op), ['replaceUnit']);
});

test('diffScene: adding a critter adds a unit, removing one removes it', () => {
  const p = base();
  const added = ops(p, (q) => { q.layers.push(createLayer('pluck', { id: 'n', notes: [{ s: 0, r: 0 }] })); });
  assert.deepEqual(added.map((o) => [o.op, o.key]), [['addUnit', 'n']]);
  assert.equal(added[0].unit.notes.length, 1);
  assert.deepEqual(ops(p, (q) => { q.layers.splice(1, 1); }), [{ op: 'removeUnit', key: 't' }]);
});

test('diffScene: a recording that loads after its song adds its file, points the unit at it and fills its notes', () => {
  const p = song([{ id: 'm', sound: 'rec:z', notes: [{ s: 0, r: 3 }, { s: 4, r: 5 }] }]);
  const before = describe(p, env());
  const after = describe(p, env({ z: { seconds: 0.6 } }));
  const changed = diffScene(before, after);
  assert.deepEqual(changed.map((o) => o.op), ['addFile', 'setFile', 'addNote', 'addNote']);
  assert.equal(changed[0].file, 'rec:z');
  assert.equal(changed[1].instrument.file, 'rec:z');
  const u = describeUnit(p.layers[0], p, env({ z: { seconds: 0.6 } }));
  assert.deepEqual(u.files, ['rec:z']);
});
