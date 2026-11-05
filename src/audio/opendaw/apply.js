// Applies the mirror's ops (src/audio/mirror.js) to an openDAW project's box graph. This is the only file that
// touches openDAW's boxes, so an SDK upgrade that renames a field breaks here and nowhere else.
// See docs/OPENDAW-PORT.md §1d and §4.
//
// - Every sync() runs its ops in ONE bare transaction (beginTransaction … endTransaction, never openDAW's undoable
//   `editing.modify`), so the openDAW project keeps no history: Itchy's store.change is the only undo.
// - The library holder: a hidden, muted Playfield unit named "__library" whose slots point at every AudioFileBox.
//   openDAW refuses a file with no incoming pointer, so each file is created in the same transaction as its slot,
//   and the holder is never deleted: critter units can come and go and every file stays loaded in the engine.
// - Devices are made so no box is ever orphaned: the Zeitgeist is created directly on the project's global groove
//   (EffectFactories.Zeitgeist would make a private groove box that can't be re-pointed).
// - Nothing is ever switched on or off (`enabled` clicks, M1); an unused filter sits at its neutral end and a silent
//   echo at −∞ dB.
// - Charm fields that click when they jump (filter frequency and Q, echo wet, Space send) are written at most once
//   per animation frame and glide over about 100 ms when they move far (undo, dice, opening a song).
// - If a transaction throws, the project is left as it was (openDAW rolls it back) and `onFatal` is called once:
//   Itchy then switches to its built-in engine for the rest of the session.
//
// This module never imports the openDAW bundle itself: pass in the module namespace that boot.js loaded.

import { soundKey, recordingKey } from './samples.js';

/** The samples.js key of a mirror file id: 'kit.snare.2' → that sound's variant 2, 'rec:<id>' → the recording. */
export function sampleKeyOf(file) {
  if (file.startsWith('rec:')) return recordingKey(file.slice(4));
  const m = /^(.*)\.(\d+)$/.exec(file);
  return m ? soundKey(m[1], Number(m[2])) : soundKey(file, 0);
}

/** A region lasts "for ever" (2^30 pulses: weeks at any tempo); it loops over the critter's steps. */
const REGION_PULSES = 2 ** 30;
const HOLDER_SLOTS = 120;

// Fields that click when they jump, and how they glide: in which domain, and the largest step per frame that
// doesn't click (M1: a 3% low-pass move or 0.5 dB of echo per frame stays clean).
const DB_FLOOR = -60;
const GLIDES = {
  hz: { to: (v) => Math.log2(v), from: (x) => 2 ** x, step: 0.08 },
  q: { to: (v) => v, from: (x) => x, step: 0.25 },
  db: { to: (v) => Math.max(DB_FLOOR, v), from: (x) => x, step: 0.6 },
};
const GLIDE_FRAMES = 6; // a jump of any size is done within about 100 ms
function glideKind(path) {
  if (/^revamp\.(lowPass|highPass)\.hz$/.test(path)) return 'hz';
  if (/^revamp\.(lowPass|highPass)\.q$/.test(path)) return 'q';
  if (path === 'delay.wetDb' || path === 'spaceSendDb') return 'db';
  return null;
}

export class SceneApplier {
  /**
   * @param {object} o
   * @param {object} o.od        the openDAW bundle's namespace
   * @param {object} o.project   the openDAW Project
   * @param {import('./samples.js').ItchySamples} o.samples
   * @param {(error: unknown) => void} [o.onFatal]  called once if a transaction fails
   * @param {(fn: () => void) => void} [o.frame]    runs fn on the next animation frame (none: glides finish at once)
   */
  constructor({ od, project, samples, onFatal = () => {}, frame = null }) {
    this.od = od;
    this.project = project;
    this.samples = samples;
    this.onFatal = onFatal;
    this.frame = frame;
    this.failed = false;
    this.holders = [];          // library holder units: { audioUnitBox, instrumentBox, used }
    this.files = new Map();     // mirror file id → AudioFileBox
    this.units = new Map();     // unit key → handle (see #addUnit)
    this.space = null;          // { busBox, unitBox, convolver }
    this.glides = new Map();    // 'key|path' → { unit key, path, kind, current, target }
    this.frameQueued = false;
  }

  get graph() { return this.project.boxGraph; }

  /**
   * Run `fn` in one bare transaction. On failure openDAW rolls back; then onFatal is called (once) and false is
   * returned. Returns fn's result otherwise.
   */
  transact(fn) {
    if (this.failed) return false;
    const g = this.graph;
    try {
      g.beginTransaction();
      let result;
      try { result = fn(g); } catch (e) { if (g.inTransaction()) g.abortTransaction(); throw e; }
      g.endTransaction(); // validates every pointer; throws (after rolling back) on an orphan
      return result ?? true;
    } catch (e) {
      this.failed = true;
      this.onFatal(e);
      return false;
    }
  }

  // ------------------------------------------------------------------ boot-time pieces

  /** The Space aux bus with its Convolver on the stereo impulse, held by the Convolver (never deleted). */
  #createSpace(space) {
    const { od, project } = this;
    const busBox = od.AudioBusFactory.create(project.skeleton, 'Space', od.IconSymbol.Effects, od.AudioUnitType.Aux, od.Colors.green);
    const unitBox = busBox.output.targetVertex.unwrap().box;
    unitBox.volume.setValue(space.returnDb);
    const convolver = project.api.insertEffect(unitBox.audioEffects, od.EffectFactories.Convolver);
    const file = this.#fileBox(space.file);
    convolver.file.refer(file);
    convolver.normalize.setValue(space.normalize);
    convolver.wet.setValue(space.wetDb);
    convolver.dry.setValue(space.dryDb);
    convolver.preDelay.setValue(0);
    this.files.set(space.file, file);
    this.space = { busBox, unitBox, convolver };
  }

  #fileBox(file) {
    const key = sampleKeyOf(file);
    const uuid = this.samples.uuidOf(key);
    if (!uuid) throw new Error(`apply: no PCM for ${file}`); // never create a file before its sample is registered
    return this.od.AudioFileBox.create(this.graph, uuid, (b) => {
      b.fileName.setValue(file);
      b.endInSeconds.setValue(this.samples.secondsOf(key));
    });
  }

  /** A file in a library slot: both made in this transaction, so the file is never without a pointer. */
  #addFile(file) {
    if (this.files.has(file)) return;
    const { od, project } = this;
    let holder = this.holders.at(-1);
    if (!holder || holder.used >= HOLDER_SLOTS) {
      const lib = project.api.createInstrument(od.InstrumentFactories.Playfield, { name: '__library' });
      lib.audioUnitBox.mute.setValue(true);
      holder = { audioUnitBox: lib.audioUnitBox, instrumentBox: lib.instrumentBox, used: 0 };
      this.holders.push(holder);
    }
    const box = this.#fileBox(file);
    od.PlayfieldSampleBox.create(this.graph, od.UUID.generate(), (b) => {
      b.device.refer(holder.instrumentBox.samples);
      b.file.refer(box);
      b.index.setValue(holder.used++);
    });
    this.files.set(file, box);
  }

  #file(file) {
    const box = this.files.get(file);
    if (!box) throw new Error(`apply: file ${file} is not in the library`);
    return box;
  }

  // ------------------------------------------------------------------ units

  #addUnit(key, u) {
    const { od, project } = this;
    const inst = u.instrument;
    const factory = inst.type === 'playfield' ? od.InstrumentFactories.Playfield : od.InstrumentFactories.Nano;
    const opts = { name: key };
    if (inst.type === 'nano' && inst.file) opts.attachment = this.#file(inst.file);
    const made = project.api.createInstrument(factory, opts);
    const h = { key, type: inst.type, audioUnitBox: made.audioUnitBox, instrumentBox: made.instrumentBox, trackBox: made.trackBox, slots: [], notes: new Map(), unit: u };
    this.#setInstrument(h, inst);
    // Zeitgeist on the project's one groove, so swing is shared and nothing is orphaned.
    od.ZeitgeistDeviceBox.create(this.graph, od.UUID.generate(), (b) => {
      b.label.setValue('Swing');
      b.groove.refer(project.rootBoxAdapter.groove.box);
      b.index.setValue(0);
      b.host.refer(made.audioUnitBox.midiEffects);
    });
    h.revamp = project.api.insertEffect(made.audioUnitBox.audioEffects, od.EffectFactories.Revamp);
    h.delay = project.api.insertEffect(made.audioUnitBox.audioEffects, od.EffectFactories.Delay);
    // Revamp's factory default switches on a 24 dB/oct high-pass at 40 Hz; Itchy uses one 12 dB/oct biquad per pass.
    for (const pass of ['lowPass', 'highPass']) {
      h.revamp[pass].enabled.setValue(true);
      h.revamp[pass].order.setValue(0);
    }
    h.send = od.AuxSendBox.create(this.graph, od.UUID.generate(), (b) => {
      b.audioUnit.refer(made.audioUnitBox.auxSends);
      b.targetBus.refer(this.space.busBox.input);
      b.routing.setValue(od.AudioSendRouting.Post);
      b.index.setValue(0);
      b.sendGain.setValue(u.spaceSendDb);
    });
    h.region = project.api.createNoteRegion({ trackBox: made.trackBox, position: 0, duration: REGION_PULSES, loopDuration: u.loopPulses });
    this.units.set(key, h);
    for (const [path, value] of Object.entries(flatten(u))) this.#write(h, path, value);
    for (const n of u.notes) this.#addNote(h, n);
    return h;
  }

  #removeUnit(key) {
    const h = this.units.get(key);
    if (!h) return;
    for (const g of this.glides.keys()) if (g.startsWith(`${key}|`)) this.glides.delete(g);
    this.project.api.deleteAudioUnit(h.audioUnitBox);
    this.units.delete(key);
  }

  /** Point an instrument at its sound: Playfield slots for a kit, or a Nano's file, pitch reference and envelope. */
  #setInstrument(h, inst) {
    const { od } = this;
    if (inst.type === 'playfield') {
      for (const s of h.slots) s.delete();
      h.slots = inst.slots.map((s) => od.PlayfieldSampleBox.create(this.graph, od.UUID.generate(), (b) => {
        b.device.refer(h.instrumentBox.samples);
        b.file.refer(this.#file(s.file));
        b.index.setValue(s.note);
        b.gate.setValue(s.gate);
        b.polyphone.setValue(s.polyphone);
        b.volume.setValue(s.volumeDb);
      }));
      return;
    }
    const nano = h.instrumentBox;
    if (inst.file) nano.file.refer(this.#file(inst.file));
    else nano.file.defer();
    nano.volume.setValue(inst.volumeDb);
    nano.rootKey.setValue(inst.rootKey);
    nano.attack.setValue(inst.attack);
    nano.release.setValue(inst.release);
    nano.loop.setValue(!!inst.loop?.enabled);
    if (inst.loop) {
      nano.loopStart.setValue(inst.loop.start);
      nano.loopEnd.setValue(inst.loop.end);
      nano.loopFade.setValue(inst.loop.fade);
    }
  }

  #addNote(h, n) {
    const box = this.project.api.createNoteEvent({ owner: h.region, position: n.position, duration: n.duration, pitch: n.pitch, velocity: n.velocity });
    h.notes.set(n.key, box);
  }

  /** Write one unit field (a mirror path such as 'delay.wetDb') to its box. */
  #write(h, path, value) {
    const [a, b, c] = path.split('.');
    switch (a) {
      case 'volumeDb': return h.audioUnitBox.volume.setValue(value);
      case 'regionMute': return h.region.mute.setValue(value);
      case 'loopPulses': return h.region.loopDuration.setValue(value);
      case 'spaceSendDb': return h.send.sendGain.setValue(value);
      case 'revamp': {
        const pass = h.revamp[b];
        if (c === 'hz') return pass.frequency.setValue(value);
        if (c === 'q') return pass.q.setValue(value);
        if (c === 'order') return pass.order.setValue(value);
        if (c === 'enabled') return pass.enabled.setValue(value);
        break;
      }
      case 'delay': {
        const d = h.delay;
        const field = { wetDb: 'wet', dryDb: 'dry' }[b] || b;
        if (!d[field]) break;
        return d[field].setValue(value);
      }
      default: break;
    }
    throw new Error(`apply: unknown unit field ${path}`);
  }

  #writeGlobal(path, value) {
    const { project } = this;
    switch (path) {
      case 'bpm': return project.timelineBox.bpm.setValue(value);
      case 'groove.amount': return project.rootBoxAdapter.groove.box.amount.setValue(value);
      case 'groove.duration': return project.rootBoxAdapter.groove.box.duration.setValue(value);
      case 'masterDb': return project.primaryAudioUnitBox.volume.setValue(value);
      default: throw new Error(`apply: unknown project field ${path}`);
    }
  }

  // ------------------------------------------------------------------ ops

  /**
   * Apply the mirror's ops in one transaction. With `space` (the scene's space, first sync only) the Space bus is
   * built first. `glide: false` writes every field at once (tray units, offline renders). Returns false on failure.
   */
  apply(ops, { space = null, glide = true } = {}) {
    if (!ops.length && !space) return true;
    return this.transact(() => {
      if (space) this.#createSpace(space);
      for (const op of ops) this.#op(op, glide);
    });
  }

  #op(op, glide) {
    switch (op.op) {
      case 'setField':
        if (op.key === null) return this.#writeGlobal(op.path, op.value);
        return this.#setUnitField(op.key, op.path, op.value, glide);
      case 'addFile': return this.#addFile(op.file);
      case 'addUnit': return void this.#addUnit(op.key, op.unit);
      case 'removeUnit': return this.#removeUnit(op.key);
      case 'replaceUnit': this.#removeUnit(op.key); return void this.#addUnit(op.key, op.unit);
      case 'setFile': {
        const h = this.#unit(op.key);
        h.unit = { ...h.unit, instrument: op.instrument };
        return this.#setInstrument(h, op.instrument);
      }
      case 'addNote': return this.#addNote(this.#unit(op.key), op.note);
      case 'removeNote': {
        const h = this.#unit(op.key);
        h.notes.get(op.noteKey)?.delete();
        h.notes.delete(op.noteKey);
        return;
      }
      case 'setNote': {
        const box = this.#unit(op.key).notes.get(op.noteKey);
        if (!box) throw new Error(`apply: no note ${op.noteKey} in ${op.key}`);
        for (const [f, v] of Object.entries(op.changes)) box[f].setValue(v);
        return;
      }
      default: throw new Error(`apply: unknown op ${op.op}`);
    }
  }

  #unit(key) {
    const h = this.units.get(key);
    if (!h) throw new Error(`apply: no unit ${key}`);
    return h;
  }

  // ------------------------------------------------------------------ glides

  #setUnitField(key, path, value, glide) {
    const h = this.#unit(key);
    const kind = glide && this.frame ? glideKind(path) : null;
    const id = `${key}|${path}`;
    const g = this.glides.get(id);
    if (!kind) { this.glides.delete(id); return this.#write(h, path, value); }
    const current = g ? g.current : this.#read(h, path);
    // The step is fixed when the glide starts, so a jump of any size lands within GLIDE_FRAMES frames.
    const k = GLIDES[kind];
    const step = Math.max(k.step, Math.abs(k.to(value) - k.to(current)) / GLIDE_FRAMES);
    this.glides.set(id, { key, path, kind, current, target: value, step });
    this.#queueFrame();
  }

  #read(h, path) {
    const [a, b, c] = path.split('.');
    if (a === 'spaceSendDb') return h.send.sendGain.getValue();
    if (a === 'delay') return h.delay.wet.getValue();
    return c === 'hz' ? h.revamp[b].frequency.getValue() : h.revamp[b].q.getValue();
  }

  #queueFrame() {
    if (this.frameQueued) return;
    this.frameQueued = true;
    this.frame(() => { this.frameQueued = false; this.stepGlides(); });
  }

  /** One frame of every glide: each moves toward its target by a step that doesn't click. */
  stepGlides({ finish = false } = {}) {
    if (!this.glides.size || this.failed) return;
    const writes = [];
    for (const [id, g] of this.glides) {
      const k = GLIDES[g.kind];
      const from = k.to(g.current), to = k.to(g.target);
      const step = g.step;
      let next;
      if (finish || Math.abs(to - from) <= step + 1e-9) { next = g.target; this.glides.delete(id); }
      else next = k.from(from + Math.sign(to - from) * step);
      g.current = next;
      writes.push([g.key, g.path, next]);
    }
    this.transact(() => { for (const [key, path, v] of writes) { const h = this.units.get(key); if (h) this.#write(h, path, v); } });
    if (this.glides.size) this.#queueFrame();
  }

  /** Land every glide on its target now (before copying the project for an offline render). */
  finishGlides() { this.stepGlides({ finish: true }); }
}

/** A unit description's fields as mirror paths ('revamp.lowPass.hz' …), the same set diffScene compares. */
function flatten(u) {
  const out = {};
  const walk = (o, prefix) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') walk(v, `${prefix}${k}.`);
      else out[prefix + k] = v;
    }
  };
  walk({ volumeDb: u.volumeDb, regionMute: u.regionMute, loopPulses: u.loopPulses, revamp: u.revamp, delay: u.delay, spaceSendDb: u.spaceSendDb }, '');
  return out;
}
