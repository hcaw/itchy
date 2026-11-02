// Check-only spike for the openDAW port (milestone M1, docs/OPENDAW-PORT.md §14). Runs in the browser inside
// Itchy's page, on Itchy's AudioContext, with Itchy's in-memory sample manager and test sounds made here in code.
// tests/e2e/check.mjs imports it and asserts every "must" item; the "report" items are printed for the record.
//
//   const r = await (await import('/tests/e2e/opendaw-probe.js')).runProbe(ctx)          // everything else
//   const w = await (await import('/tests/e2e/opendaw-probe.js')).runWorkletErrorProbe(ctx) // on its own page
//
// Timers here only pace the measurements; they never time a note.
import { bootOpenDaw } from '/src/audio/opendaw/boot.js';
import { soundKey } from '/src/audio/opendaw/samples.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SR = 48000; // offline renders
const STEP = 240; // pulses per Itchy step (a sixteenth)
const round = (x, n = 4) => (Number.isFinite(x) ? Number(x.toFixed(n)) : x);
const db = (x) => 20 * Math.log10(x);

// ---------- test sounds, made in code (seeded, so every run is the same) ----------
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function testSounds(sr) {
  const n = (s) => Math.round(sr * s);
  const click = new Float32Array(n(0.05)).map((_, i) => Math.exp(-i / 200) * (i % 2 ? 1 : -1) * 0.8);
  const tone = new Float32Array(n(1)).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr));
  const tone2 = new Float32Array(n(1)).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 660 * i) / sr));
  const r = rng(7);
  const noise = new Float32Array(n(0.3)).map(() => (r() * 2 - 1) * 0.3);
  const MULTI = [500, 1000, 2000, 3500, 4000, 7000, 8000];
  const multi = new Float32Array(n(0.2)).map((_, i) => MULTI.reduce((s, f) => s + 0.08 * Math.sin((2 * Math.PI * f * i) / sr), 0));
  const r2 = rng(11);
  const stereo = [new Float32Array(n(0.4)), new Float32Array(n(0.4))];
  stereo.forEach((c) => { for (let i = 0; i < c.length; i++) c[i] = (r2() * 2 - 1) * 0.4 * Math.exp(-i / (sr * 0.1)); });
  return { click: [click], tone: [tone], tone2: [tone2], noise: [noise], multi: [multi], stereo, MULTI };
}

// ---------- measuring ----------
/** A worklet tap on the engine's output: the loudest sample and the largest sample-to-sample jump. */
async function makeTap(ctx, source) {
  const code = `registerProcessor('itchy-probe-tap', class extends AudioWorkletProcessor {
    constructor() { super(); this.peak = 0; this.delta = 0; this.last = [0, 0]; this.port.onmessage = () => {
      this.port.postMessage({ peak: this.peak, delta: this.delta }); this.peak = 0; this.delta = 0; }; }
    process(inputs) { const input = inputs[0];
      for (let c = 0; c < input.length; c++) { const x = input[c]; let last = this.last[c] || 0;
        for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > this.peak) this.peak = a;
          const d = Math.abs(x[i] - last); if (d > this.delta) this.delta = d; last = x[i]; }
        this.last[c] = last; }
      return true; } });`;
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(ctx, 'itchy-probe-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(node).connect(sink).connect(ctx.destination);
  const read = () => new Promise((ok) => { node.port.onmessage = (e) => ok(e.data); node.port.postMessage(0); });
  return {
    reset: read,
    /** Peak and largest jump since the last reset or read. */
    read,
    /** Peak and largest jump over the next `ms` milliseconds. */
    async over(ms) { await read(); await sleep(ms); return read(); },
  };
}

/** Amplitude of frequency f in x[from, to) (Goertzel on a Hann window, scaled so a sine of amplitude a gives a). */
function amplitudeAt(x, f, sr, from, to) {
  from = Math.round(from); to = Math.round(to);
  const n = to - from, w = (2 * Math.PI * f) / sr, coeff = 2 * Math.cos(w);
  let s1 = 0, s2 = 0, wsum = 0;
  for (let i = 0; i < n; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    wsum += h;
    const s0 = x[from + i] * h + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  const re = s1 - s2 * Math.cos(w), im = s2 * Math.sin(w);
  return (2 * Math.sqrt(re * re + im * im)) / wsum;
}
const peakOf = (x, from = 0, to = x.length) => { from = Math.round(from); to = Math.round(to); let p = 0; for (let i = from; i < Math.min(to, x.length); i++) p = Math.max(p, Math.abs(x[i])); return p; };
const rmsOf = (x, from = 0, to = x.length) => { from = Math.round(from); to = Math.min(Math.round(to), x.length); let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, to - from)); };
/** Sample indices where a new hit starts (above thr after at least `gap` quieter samples). */
function onsets(x, thr = 0.05, gap = 1500) {
  const list = [];
  let quiet = gap;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) > thr) { if (quiet >= gap) list.push(i); quiet = 0; } else quiet++;
  }
  return list;
}

// ---------- building blocks, all in bare transactions (no openDAW undo history) ----------
function tx(project, fn) {
  const g = project.boxGraph;
  g.beginTransaction();
  let result;
  try { result = fn(g); } catch (e) { if (g.inTransaction()) g.abortTransaction(); throw e; }
  g.endTransaction(); // validates; on failure openDAW rolls the transaction back and rethrows
  return result;
}

/** The hidden library unit: a muted Playfield whose slots hold every AudioFileBox, so none is ever orphaned. */
function createLibrary(od, project) {
  const lib = project.api.createInstrument(od.InstrumentFactories.Playfield, { name: '__library' });
  lib.audioUnitBox.mute.setValue(true);
  return { ...lib, nextNote: 0, files: new Map() };
}
function holdFile(od, project, library, samples, key) {
  const uuid = samples.uuidOf(key);
  const file = od.AudioFileBox.create(project.boxGraph, uuid, (b) => { b.fileName.setValue(key); b.endInSeconds.setValue(samples.secondsOf(key)); });
  od.PlayfieldSampleBox.create(project.boxGraph, od.UUID.generate(), (b) => {
    b.device.refer(library.instrumentBox.samples);
    b.file.refer(file);
    b.index.setValue(library.nextNote++);
  });
  library.files.set(key, file);
  return file;
}
function kitSlot(od, project, kit, file, note, { polyphone = true } = {}) {
  return od.PlayfieldSampleBox.create(project.boxGraph, od.UUID.generate(), (b) => {
    b.device.refer(kit.instrumentBox.samples);
    b.file.refer(file);
    b.index.setValue(note);
    b.gate.setValue(0); // Off: a one-shot hit
    b.polyphone.setValue(polyphone);
  });
}
function nanoUnit(od, project, file, name = 'nano') {
  const u = project.api.createInstrument(od.InstrumentFactories.Nano, { name, attachment: file });
  u.instrumentBox.rootKey.setValue(60);
  u.instrumentBox.volume.setValue(0);
  return u;
}
function zeitgeist(od, project, unit) {
  return od.ZeitgeistDeviceBox.create(project.boxGraph, od.UUID.generate(), (b) => {
    b.label.setValue('Zeitgeist');
    b.groove.refer(project.rootBoxAdapter.groove.box);
    b.index.setValue(0);
    b.host.refer(unit.audioUnitBox.midiEffects);
  });
}
const countBoxes = (project, name) => project.boxGraph.boxes().filter((b) => b.name === name).length;
const swingAmount = (swing) => (0.5 + swing / 4 - 0.01) / 0.98;

/** Render [0, end) pulses of a copy of `project` offline at 48 kHz. */
async function render(od, project, end) {
  const audio = await od.OfflineEngineRenderer.renderSection(project.copy(), od.Option.None,
    { type: 'loop', key: 'probe', label: 'probe', start: 0, end, passes: 1, tail: false }, new od.DefaultObservableValue(0), undefined, SR);
  return audio.frames[0]; // the left channel: every test sound is mono and centred
}

async function addTestSounds(samples, sr) {
  const s = testSounds(sr);
  for (const name of ['click', 'tone', 'tone2', 'noise', 'multi', 'stereo']) await samples.add(soundKey(`probe-${name}`), { sampleRate: sr, channels: s[name] });
  return s;
}
const K = (name) => soundKey(`probe-${name}`);

// ---------- the probe ----------
export async function runProbe(ctx) {
  const must = {}, report = {};
  const pass = (name, ok, detail = '') => { must[name] = { ok: !!ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }; };
  const t0 = performance.now();
  let fatal = null;
  report.contextSampleRate = ctx.sampleRate;
  pass('crossOriginIsolated', window.crossOriginIsolated === true);

  // Boot, with the library, a kit and a Nano built before the engine starts.
  let lib, kit, kitRegion, nano;
  const h = await bootOpenDaw(ctx, {
    onFatal: (e) => { fatal = e; },
    prepare: async ({ od, project, samples }) => {
      await addTestSounds(samples, ctx.sampleRate);
      tx(project, () => {
        lib = createLibrary(od, project);
        for (const k of ['click', 'tone', 'tone2', 'noise', 'multi', 'stereo']) holdFile(od, project, lib, samples, K(k));
        kit = project.api.createInstrument(od.InstrumentFactories.Playfield, { name: 'kit' });
        kitSlot(od, project, kit, lib.files.get(K('click')), 36);
        kitRegion = project.api.createNoteRegion({ trackBox: kit.trackBox, position: 0, duration: 2 ** 30, loopDuration: 16 * STEP });
        for (let s = 0; s < 16; s++) project.api.createNoteEvent({ owner: kitRegion, position: s * STEP, duration: STEP, pitch: 36, velocity: 1 });
        nano = nanoUnit(od, project, lib.files.get(K('tone')));
      });
    },
  });
  const { od, project, samples, worklet } = h;
  const g = project.boxGraph;
  report.bootMs = Math.round(performance.now() - t0);
  pass('boot through import() with ensureReady', !!worklet && (await od.WasmEngine.ensureReady(ctx)) === true);
  report.sdk = od.OPENDAW_SDK_VERSION;
  if (ctx.state !== 'running') await ctx.resume();
  const tap = await makeTap(ctx, worklet);
  const kitId = kit.audioUnitBox.address.uuid;
  const audition = (unit, pitch, ppqn = 960, vel = 1) => project.engine.noteSignal(od.NoteSignal.audition(unit.audioUnitBox.address.uuid, pitch, ppqn, vel));
  const heard = async (fn, ms = 250) => { await tap.reset(); fn(); return (await tap.over(ms)).peak; };

  // The library holder: every held file loaded through Itchy's manager.
  {
    const states = [...lib.files.keys()].map((k) => samples.getOrCreate(samples.uuidOf(k)).state.type);
    pass('library: held files load', states.every((s) => s === 'loaded') && (await project.engine.queryLoadingComplete()), states.join(','));
    let threw = null;
    const lone = od.UUID.generate();
    try { tx(project, () => od.AudioFileBox.create(g, lone, (b) => { b.fileName.setValue('lone'); b.endInSeconds.setValue(1); })); } catch (e) { threw = String(e.message || e); }
    pass('library: a lone AudioFileBox throws (and is rolled back)', threw && !g.inTransaction() && g.findBox(lone).isEmpty(), threw ?? 'no throw');
    report.loneFileError = threw;
  }

  // Playfield and Nano through the custom manager.
  {
    let p = 0;
    for (let i = 0; i < 3 && p <= 0.01; i++) p = await heard(() => { project.engine.noteSignal(od.NoteSignal.on(kitId, 36, 1)); });
    project.engine.noteSignal(od.NoteSignal.off(kitId, 36));
    pass('Playfield note audible', p > 0.01, `peak ${round(p)}`);
    report.playfieldPeak = round(p);
    await sleep(100);
    const n = await heard(() => audition(nano, 60, 960, 1), 300);
    pass('Nano audition audible', n > 0.01, `peak ${round(n)}`);
    report.nanoPeak = round(n);
    await sleep(600);
    // a stereo file (the Space impulse will be one) plays too
    const st = tx(project, () => nanoUnit(od, project, lib.files.get(K('stereo')), 'stereo'));
    report.stereoNanoPeak = round(await heard(() => audition(st, 60, 480), 250));
    tx(project, () => project.api.deleteAudioUnit(st.audioUnitBox));
    await sleep(300);
  }

  // Bare-transaction edits: every API Itchy needs, with no undo history.
  {
    const ops = {};
    const tryOp = (name, fn) => { try { const r = tx(project, fn); ops[name] = 'ok'; return r; } catch (e) { ops[name] = String(e.message || e); return null; } };
    const unit = tryOp('createInstrument', () => project.api.createInstrument(od.InstrumentFactories.Nano, { name: 'bare', attachment: lib.files.get(K('tone2')) }));
    const region = unit && tryOp('createNoteRegion', () => project.api.createNoteRegion({ trackBox: unit.trackBox, position: 0, duration: 2 ** 30, loopDuration: 16 * STEP }));
    region && tryOp('createNoteEvent', () => project.api.createNoteEvent({ owner: region, position: 0, duration: STEP, pitch: 60, velocity: 0.5 }));
    unit && tryOp('insertEffect (Revamp, Delay)', () => { project.api.insertEffect(unit.audioUnitBox.audioEffects, od.EffectFactories.Revamp); project.api.insertEffect(unit.audioUnitBox.audioEffects, od.EffectFactories.Delay); });
    const grooves = countBoxes(project, 'GrooveShuffleBox');
    const zg = tryOp('direct ZeitgeistDeviceBox on the global groove', () => zeitgeist(od, project, kit));
    const target = zg && zg.groove.targetVertex.unwrap();
    const sameGroove = !!target && (target.box ?? target) === project.rootBoxAdapter.groove.box;
    const z = await heard(() => audition(kit, 36, 240));
    pass('direct ZeitgeistDeviceBox on the global groove: no throw, no new groove box, audible',
      ops['direct ZeitgeistDeviceBox on the global groove'] === 'ok' && sameGroove && countBoxes(project, 'GrooveShuffleBox') === grooves && z > 0.01,
      { op: ops['direct ZeitgeistDeviceBox on the global groove'], sameGroove, grooves: [grooves, countBoxes(project, 'GrooveShuffleBox')], peak: round(z) });
    unit && tryOp('deleteAudioUnit', () => project.api.deleteAudioUnit(unit.audioUnitBox));
    pass('edits in a bare transaction', Object.values(ops).every((v) => v === 'ok') && !project.editing.canUndo(), { ...ops, canUndo: project.editing.canUndo() });
    report.tone2FileAfterDelete = g.findBox(samples.uuidOf(K('tone2'))).nonEmpty();
  }

  // Library holder: re-point a Nano file; delete a unit, recreate it and audition in the same task.
  {
    let err = null;
    try { tx(project, () => nano.instrumentBox.file.refer(lib.files.get(K('tone2')))); } catch (e) { err = String(e.message || e); }
    const p = await heard(() => audition(nano, 60, 480));
    pass('library: re-pointing a Nano file works', !err && p > 0.01 && g.findBox(samples.uuidOf(K('tone'))).nonEmpty(), err ?? `peak ${round(p)}, old file kept`);
    await sleep(500);
    err = null;
    let again = null;
    const fileKept = { after: null };
    await tap.reset();
    try {
      tx(project, () => project.api.deleteAudioUnit(nano.audioUnitBox));
      fileKept.after = g.findBox(samples.uuidOf(K('tone2'))).nonEmpty();
      again = tx(project, () => nanoUnit(od, project, lib.files.get(K('tone2')), 'again'));
      audition(again, 60, 480); // same task as the delete and the recreate
    } catch (e) { err = String(e.message || e); }
    const q = (await tap.over(250)).peak;
    pass('library: delete a unit, recreate it and audition in the same task', !err && fileKept.after && q > 0.01, err ?? { fileKept: fileKept.after, peak: round(q) });
    nano = again ?? nano;
    report.deleteUnitKeepsHeldFile = fileKept.after;
    await sleep(500);
  }

  // An audition in the same task as unit creation (a file the engine has already loaded via the library).
  {
    let unit = null, err = null;
    await tap.reset();
    try { unit = tx(project, () => nanoUnit(od, project, lib.files.get(K('tone')), 'fresh')); audition(unit, 67, 480); } catch (e) { err = String(e.message || e); }
    const p = (await tap.over(250)).peak;
    pass('audition in the same task as unit creation', !err && p > 0.01, err ?? `peak ${round(p)}`);
    if (unit) tx(project, () => project.api.deleteAudioUnit(unit.audioUnitBox));
    await sleep(400);
  }

  // A muted region still auditions while stopped (and, for the record, its notes don't play).
  {
    tx(project, () => kitRegion.mute.setValue(true));
    const p = await heard(() => audition(kit, 36, 240));
    pass('muted-region audition while stopped', p > 0.01 && !project.engine.isPlaying.getValue(), `peak ${round(p)}`);
    project.engine.setPosition(0);
    project.engine.play();
    await sleep(300);
    report.mutedRegionPlayingPeak = round((await tap.over(500)).peak);
    project.engine.stop(false);
    await sleep(300);
    tx(project, () => kitRegion.mute.setValue(false));
  }

  // A forced throw is caught: re-pointing a factory Zeitgeist's groove orphans its private GrooveShuffleBox.
  {
    let threw = null;
    try {
      tx(project, () => {
        const fx = project.api.insertEffect(kit.audioUnitBox.midiEffects, od.EffectFactories.Zeitgeist);
        fx.groove.refer(project.rootBoxAdapter.groove.box);
      });
    } catch (e) { threw = String(e.message || e); }
    const p = await heard(() => audition(kit, 36, 240));
    pass('a forced throw is caught, rolled back, and the engine keeps sounding', threw && !g.inTransaction() && p > 0.01 && !fatal,
      { threw, peak: round(p), fatal: fatal && String(fatal) });
    report.forcedThrow = threw;
  }

  // ---- report items ----
  report.metronomeEnabled = project.engine.preferences.settings.metronome.enabled;
  report.nanoDefaultVolumeDb = (() => { let v; const u = tx(project, () => project.api.createInstrument(od.InstrumentFactories.Nano, { attachment: lib.files.get(K('tone')) })); v = u.instrumentBox.volume.getValue(); tx(project, () => project.api.deleteAudioUnit(u.audioUnitBox)); return v; })();
  report.masterVolumeDb = project.primaryAudioUnitBox.volume.getValue();
  report.masterEffects = project.primaryAudioUnitBox.audioEffects.pointerHub.incoming().map((p) => p.box.name);
  report.timelineDurationInPulses = project.timelineBox.durationInPulses.getValue();
  report.timelineLoopEnabled = project.timelineBox.loopArea.enabled.getValue();

  // The sync loopback: a transaction's updates are posted to the worklet before endTransaction returns.
  {
    const port = worklet.port, orig = port.postMessage;
    const log = [];
    port.postMessage = function (m, t) { log.push(m?.channel ?? '?'); return orig.call(this, m, t); };
    tx(project, () => project.timelineBox.bpm.setValue(project.timelineBox.bpm.getValue() + 1));
    const syncedInTransaction = log.length;
    audition(kit, 36, 240);
    port.postMessage = orig;
    report.syncLoopback = { postedBeforeEndTransactionReturned: syncedInTransaction > 0, order: log };
  }

  // stop(false) -> setPosition(0) -> play() restarts at 0; tails ring on after stop(false).
  {
    tx(project, () => project.timelineBox.bpm.setValue(100));
    project.engine.setPosition(0);
    project.engine.play();
    await sleep(800);
    const playing = project.engine.position.getValue();
    audition(nano, 60, 3840);
    await sleep(50);
    project.engine.stop(false);
    const tail = (await tap.over(120)).peak;
    const paused = project.engine.position.getValue();
    await sleep(200);
    const pausedLater = project.engine.position.getValue();
    project.engine.setPosition(0);
    await sleep(100);
    const afterSet = project.engine.position.getValue();
    project.engine.play();
    await sleep(150);
    const restarted = project.engine.position.getValue();
    project.engine.stop(false);
    await sleep(200);
    report.restart = { playing, paused, pausedLater, afterSetPosition: afterSet, afterPlay150ms: restarted, restartsNearZero: restarted < 2 * STEP, nanoTailPeakAfterStop: round(tail) };
  }

  // The transport keeps going past the timeline's durationInPulses.
  {
    const end = project.timelineBox.durationInPulses.getValue();
    tx(project, () => project.timelineBox.bpm.setValue(240));
    project.engine.setPosition(end - 960);
    project.engine.play();
    await sleep(700);
    const pos = project.engine.position.getValue();
    const p = (await tap.over(400)).peak;
    report.pastDuration = { durationInPulses: end, position: pos, isPlaying: project.engine.isPlaying.getValue(), passedEnd: pos > end, peak: round(p) };
    // ctx.suspend() freezes the position and keeps the engine playing (warnings are counted by the check).
    await ctx.suspend();
    await sleep(100); // let the last state from the worklet arrive
    const a = project.engine.position.getValue();
    await sleep(300);
    const b = project.engine.position.getValue();
    report.suspend = { frozen: a === b, position: a, isPlaying: project.engine.isPlaying.getValue() };
    await ctx.resume();
    await sleep(100);
    report.suspend.movesAfterResume = project.engine.position.getValue() > b;
    project.engine.stop(false);
    await sleep(200);
    tx(project, () => project.timelineBox.bpm.setValue(100));
  }

  // enabled toggles and charm-style writes while a tone sounds: largest sample jump vs. a steady baseline.
  {
    const u = tx(project, () => {
      const unit = nanoUnit(od, project, lib.files.get(K('tone')), 'toggle');
      unit.instrumentBox.loop.setValue(true);
      unit.instrumentBox.loopStart.setValue(0.2);
      unit.instrumentBox.loopEnd.setValue(0.8);
      const rev = project.api.insertEffect(unit.audioUnitBox.audioEffects, od.EffectFactories.Revamp);
      rev.highPass.enabled.setValue(false);
      rev.highPass.order.setValue(0);
      rev.lowPass.order.setValue(0);
      const del = project.api.insertEffect(unit.audioUnitBox.audioEffects, od.EffectFactories.Delay);
      del.delayMusical.setValue(13); del.feedback.setValue(0.3); del.wet.setValue(-6); del.dry.setValue(0); del.cross.setValue(0);
      del.preSyncTimeLeft.setValue(0); del.preSyncTimeRight.setValue(0);
      return { unit, rev, del };
    });
    report.revampFactoryDefaults = (() => {
      const r = tx(project, () => project.api.insertEffect(u.unit.audioUnitBox.audioEffects, od.EffectFactories.Revamp));
      const out = {};
      for (const k of ['highPass', 'lowShelf', 'lowBell', 'midBell', 'highBell', 'highShelf', 'lowPass']) {
        out[k] = { enabled: r[k].enabled.getValue(), frequency: round(r[k].frequency.getValue(), 1), ...(r[k].order ? { order: r[k].order.getValue() } : {}) };
      }
      tx(project, () => r.delete());
      return out;
    })();
    const d = u.del;
    // One kind of write at a time, each from a steady state, so a click can be pinned on its cause.
    const rev = u.rev;
    const kinds = {
      'Delay enabled': (i) => d.enabled.setValue(i % 2 === 1),
      'Revamp low-pass enabled (800 Hz)': (i) => { rev.lowPass.frequency.setValue(800); rev.lowPass.enabled.setValue(i % 2 === 0); },
      'Revamp low-pass frequency 600/2000 Hz': (i) => { rev.lowPass.enabled.setValue(true); rev.lowPass.frequency.setValue(i % 2 ? 600 : 2000); },
      'Delay wet -20/-3 dB': (i) => d.wet.setValue(i % 2 ? -20 : -3),
      'Delay feedback 0.3/0.7': (i) => d.feedback.setValue(i % 2 ? 0.3 : 0.7),
      'unit volume -12/0 dB': (i) => u.unit.audioUnitBox.volume.setValue(i % 2 ? -12 : 0),
      'Delay wet dragged, 0.5 dB a frame': (i) => d.wet.setValue(-6 + 0.5 * i),
      'Revamp low-pass dragged, 3% a frame': (i) => { rev.lowPass.enabled.setValue(true); rev.lowPass.frequency.setValue(2000 * 0.97 ** i); },
    };
    const drags = new Set(['Delay wet dragged, 0.5 dB a frame', 'Revamp low-pass dragged, 3% a frame']);
    const setup = { 'Revamp low-pass dragged, 3% a frame': () => { rev.lowPass.frequency.setValue(2000); rev.lowPass.enabled.setValue(true); } };
    const jumps = {};
    for (const [name, write] of Object.entries(kinds)) {
      tx(project, () => { d.enabled.setValue(true); rev.lowPass.enabled.setValue(false); d.wet.setValue(-6); d.feedback.setValue(0.3); u.unit.audioUnitBox.volume.setValue(0); setup[name]?.(); });
      audition(u.unit, 60, 960 * 6, 1);
      await sleep(500);
      const steady = await tap.over(300);
      if (drags.has(name)) for (let i = 0; i < 24; i++) { tx(project, () => write(i)); await sleep(16); }
      else for (let i = 0; i < 6; i++) { tx(project, () => write(i)); await sleep(60); }
      const during = await tap.read();
      jumps[name] = { steady: round(steady.delta), duringWrites: round(during.delta) };
      project.engine.noteSignal(od.NoteSignal.off(u.unit.audioUnitBox.address.uuid, 60));
      await sleep(1200);
    }
    report.writeClicks = { sineMaxJump: round(0.5 * 2 * Math.PI * 440 / ctx.sampleRate), largestJump: jumps };
    tx(project, () => project.api.deleteAudioUnit(u.unit.audioUnitBox));
    await sleep(800);
  }

  // ---- offline renders, on a separate never-started project that shares the sample manager ----
  {
    const rp = od.Project.new(h.env);
    let rlib, rkit, rregion;
    tx(rp, () => {
      rp.timelineBox.bpm.setValue(100);
      rlib = createLibrary(od, rp);
      for (const k of ['click', 'tone', 'noise', 'multi']) holdFile(od, rp, rlib, samples, K(k));
      rkit = rp.api.createInstrument(od.InstrumentFactories.Playfield, { name: 'kit' });
      kitSlot(od, rp, rkit, rlib.files.get(K('click')), 36);
      rregion = rp.api.createNoteRegion({ trackBox: rkit.trackBox, position: 0, duration: 2 ** 30, loopDuration: 16 * STEP });
      for (let s = 0; s < 16; s++) rp.api.createNoteEvent({ owner: rregion, position: s * STEP, duration: STEP, pitch: 36, velocity: 1 });
      zeitgeist(od, rp, rkit);
      rp.rootBoxAdapter.groove.box.duration.setValue(480);
    });
    const stepSamples = (SR * 60) / 100 / 4; // 7200
    const swingErr = async (swing) => {
      tx(rp, () => rp.rootBoxAdapter.groove.box.amount.setValue(swingAmount(swing)));
      const x = await render(od, rp, 16 * STEP);
      const on = onsets(x);
      const lat = on[0];
      const errs = on.slice(0, 16).map((o, k) => o - lat - k * stepSamples - (k % 2 ? 0.5 * swing * stepSamples : 0));
      return { amount: round(swingAmount(swing), 6), onsets: on.length, latencySamples: lat, maxErrorSamples: Math.max(...errs.map(Math.abs)), errors: errs };
    };
    report.swing = { stepSamples, swing0: await swingErr(0), swing05: await swingErr(0.5), swing1: await swingErr(1) };
    // the uncorrected amount, for comparison
    tx(rp, () => rp.rootBoxAdapter.groove.box.amount.setValue(0.75));
    { const x = await render(od, rp, 2 * STEP); const on = onsets(x); report.swing.uncorrected075OddOffset = on[1] - on[0] - stepSamples; }
    tx(rp, () => rp.rootBoxAdapter.groove.box.amount.setValue(0.5));

    // Playfield velocity curve: hits at 1, 0.5, 0.25.
    const notes = () => rp.boxGraph.boxes().filter((b) => b.name === 'NoteEventBox');
    tx(rp, () => { notes().forEach((n) => n.delete()); [1, 0.5, 0.25].forEach((v, i) => rp.api.createNoteEvent({ owner: rregion, position: i * 4 * STEP, duration: STEP, pitch: 36, velocity: v })); });
    {
      const x = await render(od, rp, 12 * STEP);
      const w = 4 * stepSamples;
      const pk = [0, 1, 2].map((i) => peakOf(x, i * w, (i + 1) * w));
      report.playfieldVelocity = { peaks: pk.map((p) => round(p)), ratios: pk.map((p) => round(p / pk[0])), linearWouldBe: [1, 0.5, 0.25] };
    }
    // Playfield slot gain: a steady 0.5 sine in a slot at 0 dB.
    {
      const slot = tx(rp, () => {
        notes().forEach((n) => n.delete());
        rp.api.createNoteEvent({ owner: rregion, position: 0, duration: STEP, pitch: 41, velocity: 1 });
        return kitSlot(od, rp, rkit, rlib.files.get(K('tone')), 41);
      });
      const x = await render(od, rp, 4 * STEP);
      report.playfieldSlotGain = { slotVolumeDb: slot.volume.getValue(), sinePeak: 0.5, renderedPeak: round(peakOf(x, 0.1 * SR, 0.3 * SR)), gainDb: round(db(peakOf(x, 0.1 * SR, 0.3 * SR) / 0.5), 2) };
      tx(rp, () => { notes().forEach((n) => n.delete()); slot.delete(); });
    }
    // Playfield polyphony: two noise hits 50 ms apart, polyphone off vs on.
    {
      const slot = tx(rp, () => {
        notes().forEach((n) => n.delete());
        const s = kitSlot(od, rp, rkit, rlib.files.get(K('noise')), 40, { polyphone: false });
        rp.api.createNoteEvent({ owner: rregion, position: 0, duration: STEP, pitch: 40, velocity: 1 });
        rp.api.createNoteEvent({ owner: rregion, position: 80, duration: STEP, pitch: 40, velocity: 1 }); // 80 pulses = 50 ms at 100 BPM
        return s;
      });
      const a = 0.06 * SR, b = 0.2 * SR;
      const mono = rmsOf(await render(od, rp, 4 * STEP), a, b);
      tx(rp, () => slot.polyphone.setValue(true));
      const poly = rmsOf(await render(od, rp, 4 * STEP), a, b);
      report.playfieldPolyphony = { rmsPolyphoneOff: round(mono), rmsPolyphoneOn: round(poly), ratio: round(poly / mono, 3), overlapExpected: '≈1.41' };
      tx(rp, () => { notes().forEach((n) => n.delete()); slot.delete(); });
    }
    tx(rp, () => rkit.audioUnitBox.mute.setValue(true));

    // Nano: unity gain at 0 dB; loop sustain; Revamp slope; Delay filter.
    const nanoNote = (file, { seconds = 1, configure } = {}) => tx(rp, () => {
      const u = nanoUnit(od, rp, file, 'r');
      configure?.(u);
      const reg = rp.api.createNoteRegion({ trackBox: u.trackBox, position: 0, duration: 2 ** 30, loopDuration: 2 ** 28 });
      rp.api.createNoteEvent({ owner: reg, position: 0, duration: Math.round(seconds / (60 / 100 / 960)), pitch: 60, velocity: 1 });
      return u;
    });
    const drop = (u) => tx(rp, () => rp.api.deleteAudioUnit(u.audioUnitBox));
    {
      let u = nanoNote(rlib.files.get(K('tone')), { seconds: 0.8, configure: (n) => n.instrumentBox.attack.setValue(0.001) });
      const x = await render(od, rp, 2 * 960);
      report.nanoUnity = { sinePeak: 0.5, renderedPeak: round(peakOf(x, 0.2 * SR, 0.7 * SR)), gainDb: round(db(peakOf(x, 0.2 * SR, 0.7 * SR) / 0.5), 2) };
      drop(u);
      u = nanoNote(rlib.files.get(K('tone')), { seconds: 4, configure: (n) => { n.instrumentBox.loop.setValue(true); n.instrumentBox.loopStart.setValue(0.2); n.instrumentBox.loopEnd.setValue(0.8); n.instrumentBox.loopFade.setValue(0.05); } });
      const y = await render(od, rp, Math.round(5 / (60 / 100 / 960)));
      let jump = 0; for (let i = 2 * SR; i < 3.5 * SR; i++) jump = Math.max(jump, Math.abs(y[i] - y[i - 1]));
      report.nanoLoopSustain = { frames: y.length, nonFinite: y.filter((v) => !Number.isFinite(v)).length, sampleSeconds: 1, noteSeconds: 4, rmsAt2to3_5s: round(rmsOf(y, 2.0 * SR, 3.5 * SR)), rmsAfterRelease: round(rmsOf(y, 4.4 * SR, 5 * SR)), maxJump: round(jump), sineMaxJump: round(0.5 * 2 * Math.PI * 440 / SR) };
      drop(u);
    }
    const toneAt = (x, fs, from, to) => Object.fromEntries(fs.map((f) => [f, amplitudeAt(x, f, SR, from, to)]));
    const MULTI = [500, 1000, 2000, 3500, 4000, 7000, 8000];
    {
      const ref = nanoNote(rlib.files.get(K('multi')), { seconds: 0.2 });
      const r0 = toneAt(await render(od, rp, 960), MULTI, 0.03 * SR, 0.17 * SR);
      drop(ref);
      const slope = {};
      for (const order of [0, 1]) {
        const u = nanoNote(rlib.files.get(K('multi')), { seconds: 0.2, configure: (n) => { const r = rp.api.insertEffect(n.audioUnitBox.audioEffects, od.EffectFactories.Revamp); r.highPass.enabled.setValue(false); r.lowPass.enabled.setValue(true); r.lowPass.order.setValue(order); r.lowPass.frequency.setValue(1000); } });
        const a = toneAt(await render(od, rp, 960), MULTI, 0.03 * SR, 0.17 * SR);
        const att = Object.fromEntries(MULTI.map((f) => [f, round(db(a[f] / r0[f]), 1)]));
        slope[`order${order}`] = { attenuationDb: att, dBPerOctave4kTo8k: round(att[8000] - att[4000], 1) };
        drop(u);
      }
      report.revampLowpass1kHz = slope;
      // Delay filter: the echo (3/16 later), filter 0 vs log10(3500/20)/3 - 1, relative to the dry burst.
      const target = Math.log10(3500 / 20) / 3 - 1;
      const filt = {};
      for (const f of [0, target]) {
        const u = nanoNote(rlib.files.get(K('multi')), { seconds: 0.2, configure: (n) => { const d = rp.api.insertEffect(n.audioUnitBox.audioEffects, od.EffectFactories.Delay); d.delayMusical.setValue(13); d.feedback.setValue(0); d.cross.setValue(0); d.preSyncTimeLeft.setValue(0); d.preSyncTimeRight.setValue(0); d.delayMillis.setValue(0); d.wet.setValue(0); d.dry.setValue(0); d.filter.setValue(f); } });
        const x = await render(od, rp, 3 * 960);
        const dry = toneAt(x, MULTI, 0.03 * SR, 0.17 * SR), echo = toneAt(x, MULTI, 0.48 * SR, 0.62 * SR);
        filt[`filter ${round(f, 4)}`] = Object.fromEntries(MULTI.map((q) => [q, round(db(echo[q] / dry[q]), 1)]));
        drop(u);
      }
      report.delayFilter = { formula: 'f < 0: lowpass at 20·1000^(1+f) Hz, Q 0.707', for3500Hz: round(target, 4), echoVsDryDb: filt };
    }
    rp.terminate();
  }

  report.fatal = fatal && String(fatal);
  report.totalMs = Math.round(performance.now() - t0);
  h.terminate();
  return { must, report };
}

/** A worklet error must reach restart.unload; with the project terminated there, openDAW must not restart. */
export async function runWorkletErrorProbe(ctx) {
  let fatal = null, loads = 0;
  const h = await bootOpenDaw(ctx, { onFatal: (e) => { fatal = e; } });
  const { project, worklet } = h;
  const orig = project.startAudioWorklet.bind(project);
  project.startAudioWorklet = (...a) => { loads++; return orig(...a); };
  worklet.dispatchEvent(new ErrorEvent('error', { message: 'forced by the probe', error: new Error('forced by the probe') }));
  await sleep(500);
  return {
    reachedUnload: !!fatal,
    terminated: h.terminated,
    restarts: loads,
    detail: fatal ? (fatal.message || fatal.type || String(fatal)) : 'not called',
  };
}
