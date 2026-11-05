// apply.js against openDAW's real box graph, in Node (the vendored bundle loads with two stubs; no worklet, no
// sound). The mirror's ops must build, change and tear down every song without orphaning a box or leaving undo
// history, and a failing transaction must reach onFatal.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const VERSION = readdirSync(new URL('../vendor/opendaw/', import.meta.url))[0];
let od, ItchySamples, noSoundfonts, SceneApplier, sampleKeyOf, describe, diffScene, soundCatalogue, createProject, createLayer, migrate, clone, EXAMPLES;

before(async () => {
  globalThis.AudioWorkletNode ??= class {};
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: () => null, get length() { return store.size; } };
  console.debug = () => {}; // openDAW narrates every box it creates
  od = await import(`../vendor/opendaw/${VERSION}/opendaw.js`);
  ({ ItchySamples, noSoundfonts } = await import('../src/audio/opendaw/samples.js'));
  ({ SceneApplier, sampleKeyOf } = await import('../src/audio/opendaw/apply.js'));
  ({ describe, diffScene } = await import('../src/audio/mirror.js'));
  ({ soundCatalogue } = await import('../src/audio/render-sounds.js'));
  ({ createProject, createLayer, migrate, clone } = await import('../src/model/project.js'));
  ({ EXAMPLES } = await import('../src/model/examples.js'));
});

/** A project with silent stand-in PCM for every built-in file (and the given recordings) and an applier on it. */
async function setup(recordings = {}) {
  const samples = new ItchySamples(od);
  const project = od.Project.new({ audioContext: { sampleRate: 48000, currentTime: 0, state: 'suspended' }, audioWorklets: {}, sampleManager: samples, soundfontManager: noSoundfonts, sampleService: {}, soundfontService: {} });
  const env = { ...soundCatalogue(48000), recordings };
  const files = [...describe(createProject(), env).library, 'space'];
  for (const f of files) await samples.add(sampleKeyOf(f), { sampleRate: 48000, channels: f === 'space' ? [new Float32Array(480), new Float32Array(480)] : [new Float32Array(4800)] });
  const fatal = [];
  const applier = new SceneApplier({ od, project, samples, onFatal: (e) => fatal.push(e) });
  let scene = null;
  const sync = (p) => {
    const next = describe(p, env);
    const ok = applier.apply(diffScene(scene, next), scene ? {} : { space: next.space });
    if (ok) scene = next;
    return ok;
  };
  const units = () => project.rootBoxAdapter.audioUnits.adapters().map((a) => a.box);
  const named = (name) => project.boxGraph.boxes().filter((b) => b.name === name);
  return { samples, project, env, applier, sync, units, named, fatal, get scene() { return scene; } };
}

test('a new song builds the library, the Space bus, the master and one unit per critter, with no undo history', async () => {
  const t = await setup();
  const p = createProject();
  assert.equal(t.sync(p), true);
  assert.deepEqual(t.fatal, []);
  // critters + the library holder + the Space aux + the master output
  assert.equal(t.units().length, p.layers.length + 3);
  assert.equal(t.project.editing.canUndo(), false);
  assert.equal(t.applier.holders.length, 1);
  assert.equal(t.applier.holders[0].audioUnitBox.mute.getValue(), true, 'the library unit is muted');
  assert.equal(t.applier.files.size, t.scene.library.length + 1, 'every library file and the impulse are boxes');
  assert.equal(t.project.timelineBox.bpm.getValue(), p.tempo);
  assert.ok(Math.abs(t.project.primaryAudioUnitBox.volume.getValue() - 20 * Math.log10(0.8)) < 1e-5);
  const conv = t.applier.space.convolver;
  assert.equal(conv.normalize.getValue(), false);
  assert.equal(conv.dry.getValue(), -Infinity);
  t.project.terminate();
});

test('each critter unit has Zeitgeist on the global groove, Revamp at order 0 and a post-chain send to Space', async () => {
  const t = await setup();
  const p = migrate(EXAMPLES[0]);
  t.sync(p);
  const grooves = t.named('GrooveShuffleBox');
  assert.equal(grooves.length, 1, 'one groove, shared');
  for (const l of p.layers) {
    const h = t.applier.units.get(l.id);
    const zg = h.audioUnitBox.midiEffects.pointerHub.incoming().map((x) => x.box).filter((b) => b.name === 'ZeitgeistDeviceBox');
    assert.equal(zg.length, 1);
    assert.equal(zg[0].groove.targetVertex.unwrap(), t.project.rootBoxAdapter.groove.box);
    for (const pass of ['lowPass', 'highPass']) {
      assert.equal(h.revamp[pass].order.getValue(), 0);
      assert.equal(h.revamp[pass].enabled.getValue(), true);
    }
    assert.equal(h.delay.cross.getValue(), 0);
    assert.equal(h.send.routing.getValue(), od.AudioSendRouting.Post);
    assert.equal(h.send.targetBus.targetVertex.unwrap(), t.applier.space.busBox.input);
    assert.equal(h.notes.size, l.notes.length);
    const trim = t.scene.units.find((x) => x.key === l.id).instrument;
    if (h.type === 'nano') assert.ok(Math.abs(h.instrumentBox.volume.getValue() - trim.volumeDb) < 1e-6, 'Nano at its trim, never the −3 dB default');
    else assert.ok(h.slots.every((s, i) => s.polyphone.getValue() === true && s.gate.getValue() === 0 && Math.abs(s.volume.getValue() - trim.slots[i].volumeDb) < 1e-6));
  }
  t.project.terminate();
});

test('adding and removing critters adds and removes units, while the library unit and its files stay', async () => {
  const t = await setup();
  const p = createProject();
  t.sync(p);
  const n0 = t.units().length, files0 = t.named('AudioFileBox').length;
  const q = clone(p);
  q.layers.push(createLayer('bass', { notes: [{ s: 0, r: 0, len: 4 }] }), createLayer('tinykit', { notes: [{ s: 1, r: 1 }] }));
  assert.equal(t.sync(q), true);
  assert.equal(t.units().length, n0 + 2);
  q.layers.splice(0, 3);
  assert.equal(t.sync(q), true);
  assert.equal(t.units().length, n0 + 2 - 3);
  assert.ok(t.units().includes(t.applier.holders[0].audioUnitBox), 'the library unit stays');
  assert.equal(t.named('AudioFileBox').length, files0, 'every file stays');
  assert.deepEqual(t.fatal, []);
  t.project.terminate();
});

test('every example song, sound changes, charms, notes and mood all apply in turn, and the fields land', async () => {
  const t = await setup();
  let p = createProject();
  t.sync(p);
  for (const ex of EXAMPLES) { p = migrate(ex); assert.equal(t.sync(p), true, ex.name); }
  const q = clone(p);
  const tune = q.layers.find((l) => l.sound !== 'kit' && l.sound !== 'tinykit');
  const drum = q.layers.find((l) => l.sound === 'kit' || l.sound === 'tinykit');
  tune.sound = tune.sound === 'pluck' ? 'cloud' : 'pluck'; // same instrument: re-point the file
  drum.sound = 'bells'; // kit → tune: a new unit
  tune.fx = { echo: 0.6, space: 0.4, tone: -0.5 };
  tune.muted = true;
  tune.notes.push({ s: 15, r: 7, vel: 0.5, len: 1 });
  q.mood = 'spooky';
  q.tempo = 140;
  q.swing = 1;
  assert.equal(t.sync(q), true);
  const h = t.applier.units.get(tune.id), u = t.scene.units.find((x) => x.key === tune.id);
  assert.equal(h.instrumentBox.file.targetVertex.unwrap(), t.applier.files.get(tune.sound));
  assert.equal(t.applier.units.get(drum.id).type, 'nano');
  assert.equal(h.region.mute.getValue(), true);
  assert.ok(Math.abs(h.revamp.lowPass.frequency.getValue() - u.revamp.lowPass.hz) < 1e-2);
  assert.ok(Math.abs(h.delay.wet.getValue() - u.delay.wetDb) < 1e-5);
  assert.ok(Math.abs(h.send.sendGain.getValue() - u.spaceSendDb) < 1e-5);
  assert.equal(t.project.timelineBox.bpm.getValue(), 140);
  assert.ok(Math.abs(t.project.rootBoxAdapter.groove.box.amount.getValue() - (0.5 + 0.25 - 0.01) / 0.98) < 1e-6);
  for (const n of u.notes) assert.equal(h.notes.get(n.key).pitch.getValue(), n.pitch);
  assert.equal(t.project.editing.canUndo(), false);
  assert.deepEqual(t.fatal, []);
  t.project.terminate();
});

test('a recording unit waits without notes until its PCM arrives, then gets its file and notes', async () => {
  const t = await setup();
  const p = createProject();
  p.layers[1].sound = 'rec:mine';
  p.layers[1].notes = [{ s: 0, r: 3, vel: 1, len: 1 }];
  t.sync(p);
  const h = t.applier.units.get(p.layers[1].id);
  assert.equal(h.notes.size, 0);
  assert.equal(h.instrumentBox.file.isEmpty(), true);
  await t.samples.add(sampleKeyOf('rec:mine'), { sampleRate: 22050, channels: [new Float32Array(22050)] });
  t.env.recordings = { mine: { seconds: 1 } };
  assert.equal(t.sync(clone(p)), true);
  assert.equal(h.notes.size, 1);
  assert.equal(h.instrumentBox.file.targetVertex.unwrap(), t.applier.files.get('rec:mine'));
  assert.deepEqual(t.fatal, []);
  t.project.terminate();
});

test('a failing transaction is rolled back, reported once, and nothing more is applied', async () => {
  const t = await setup();
  const p = createProject();
  t.sync(p);
  const n = t.units().length;
  const r = t.applier.transact((g) => od.AudioFileBox.create(g, od.UUID.generate(), () => {}));
  assert.equal(r, false);
  assert.equal(t.fatal.length, 1);
  assert.match(String(t.fatal[0]), /requires an edge/);
  assert.equal(t.project.boxGraph.inTransaction(), false);
  const q = clone(p);
  q.layers.push(createLayer('bass'));
  assert.equal(t.sync(q), false, 'a failed applier applies nothing more');
  assert.equal(t.units().length, n);
  assert.equal(t.fatal.length, 1, 'onFatal is called once');
  t.project.terminate();
});

test('big charm jumps glide over a few frames; small moves land at once', async () => {
  const t = await setup();
  const frames = [];
  t.applier.frame = (fn) => frames.push(fn);
  const p = createProject();
  t.sync(p);
  const id = p.layers[1].id, h = t.applier.units.get(id);
  const q = clone(p);
  q.layers[1].fx.tone = -1; // low-pass from 20 kHz to 180 Hz: about 6.8 octaves
  t.sync(q);
  assert.equal(h.revamp.lowPass.frequency.getValue(), 20000, 'nothing written before the frame');
  let n = 0;
  while (frames.length && n < 20) { frames.shift()(); n++; }
  assert.ok(n >= 5 && n <= 7, `glided over ${n} frames`);
  assert.ok(Math.abs(h.revamp.lowPass.frequency.getValue() - 180) < 1e-2);
  const r = clone(q);
  r.layers[1].fx.tone = -0.99;
  t.sync(r);
  frames.shift()();
  assert.equal(frames.length, 0, 'a drag-sized move lands in one frame');
  t.project.terminate();
});
