// The openDAW backend: plays Itchy's song and previews with openDAW's engine (docs/OPENDAW-PORT.md §1, §3-§9).
//
// The facade (../engine.js) loads this file with `await import()` only on capable, isolated pages, and only talks
// to the OpenDawEngine that startOpenDaw() resolves with. Itchy's project JSON stays the only truth: every sync()
// describes it again (mirror.js) and applies the difference to openDAW's project (apply.js), which is never saved
// and keeps no undo.
//
// openDAW sequences the song on the audio thread. Live notes (taps, previews) are auditions that sound at the next
// render quantum; notes timed in the future (the interface phrases) never come here: the facade gives them to the
// built-in engine, which schedules them exactly on the audio clock.

import { bootOpenDaw } from './boot.js';
import { SceneApplier, sampleKeyOf } from './apply.js';
import { recordingKey } from './samples.js';
import { describe, describeUnit, describeVoice, diffScene, STEP_PULSES } from '../mirror.js';
import { renderSounds, soundCatalogue, impulseScale, SPACE_FILE } from '../render-sounds.js';

/**
 * sessionStorage flag: set while openDAW boots and for 20 s after, so a tab that died there (an iPad that killed it
 * under memory pressure, say) uses the built-in engine when it comes back. A normal unload (a reload, leaving the
 * page) clears it in `pagehide`, which a killed tab never gets, so reloading never costs openDAW.
 */
export const CRASH_FLAG = 'itchy-opendaw-booting';
const CRASH_CLEAR_MS = 20000;

const session = {
  get: () => { try { return sessionStorage.getItem(CRASH_FLAG); } catch { return null; } },
  set: () => { try { sessionStorage.setItem(CRASH_FLAG, String(Date.now())); } catch { /* no storage */ } },
  clear: () => { try { sessionStorage.removeItem(CRASH_FLAG); } catch { /* no storage */ } },
};

/**
 * Boot openDAW on `ctx` and build Itchy's project in it. Resolves with an OpenDawEngine; rejects (and the caller
 * stays on the built-in engine) if anything fails, including the 10 s watchdog for the engine to report ready.
 *
 * @param {AudioContext} ctx
 * @param {object} o
 * @param {() => object} o.getProject     the current Itchy project
 * @param {Map<string, {sampleRate:number, data:Float32Array}>} [o.recordings]  mic recordings already loaded
 * @param {(error: unknown) => void} o.onFatal  openDAW failed after boot (a transaction or the worklet)
 */
export async function startOpenDaw(ctx, { getProject, recordings = new Map(), onFatal }) {
  if (session.get()) throw new Error('openDAW did not survive its last boot in this tab');
  session.set();
  addEventListener('pagehide', session.clear);
  let engine = null, booted = false;
  const fatal = (e) => { if (booted) onFatal(e); }; // a failure during boot rejects the boot instead
  const renders = renderSounds({ sampleRate: ctx.sampleRate }); // in parallel with the download
  try {
    const handle = await bootOpenDaw(ctx, {
      onFatal: (e) => (engine ? engine.fatal(e) : fatal(e)),
      prepare: async (h) => {
        for (const r of (await renders).values()) {
          const channels = r.id === SPACE_FILE ? scaled(r.channels, r.sampleRate) : r.channels;
          await h.samples.add(sampleKeyOf(r.id), { sampleRate: r.sampleRate, channels, name: r.id });
        }
        engine = new OpenDawEngine(h, { getProject, onFatal: fatal });
        for (const [id, rec] of recordings) await engine.registerRecording(id, rec);
        engine.sync();
        if (engine.failed) throw new Error('openDAW could not build the song');
      },
    });
    engine.worklet = handle.worklet;
    if (engine.failed) throw new Error('openDAW failed while it booted');
    booted = true;
    setTimeout(session.clear, CRASH_CLEAR_MS);
    return engine;
  } catch (e) {
    session.clear(); // a failure we caught is not a crash
    throw e;
  }
}

/** The Space impulse, scaled as Web Audio's ConvolverNode would normalise it (see impulseScale). */
function scaled(channels, sampleRate) {
  const k = impulseScale(channels, sampleRate);
  return channels.map((c) => c.map((x) => x * k));
}

export class OpenDawEngine {
  constructor(handle, { getProject, onFatal }) {
    this.handle = handle;
    this.od = handle.od;
    this.project = handle.project;
    this.samples = handle.samples;
    this.getProject = getProject;
    this.onFatal = onFatal;
    this.worklet = handle.worklet;
    this.env = { ...soundCatalogue(handle.env.audioContext.sampleRate), recordings: {} };
    this.failed = false;
    this.scene = null;
    this.tray = new Map(); // tray unit key → its unit description
    this.previews = 0;     // turns the variants of a noisy drum for repeated previews
    const frame = typeof requestAnimationFrame === 'function'
      ? (fn) => (document.hidden ? queueMicrotask(fn) : requestAnimationFrame(fn))
      : null;
    this.applier = new SceneApplier({ od: this.od, project: this.project, samples: this.samples, onFatal: (e) => this.fatal(e), frame });
    /** Called when openDAW stops the music by itself (see watchTransport). */
    this.onHalt = () => {};
    this.expectPlaying = false; // play() was sent and no stop() since
    this.seenPlaying = false;   // and openDAW has reported the transport running since
    this.watchTransport();
  }

  /**
   * openDAW stops the transport by itself when the device can't keep up: after 30 overloaded render quanta in a row
   * it puts the engine to sleep (no sound at all, not even taps). Wake it, so taps sound again, and report the stop,
   * so the app shows the music as stopped and a child can simply press Play again.
   */
  watchTransport() {
    this.project.engine.isPlaying.subscribe((o) => {
      if (o.getValue()) { if (this.expectPlaying) this.seenPlaying = true; return; }
      if (!this.expectPlaying || !this.seenPlaying || this.failed) return;
      this.expectPlaying = false;
      this.seenPlaying = false;
      this.project.engine.wake();
      this.onHalt();
    });
  }

  /** openDAW failed: stop using it at once and tell the facade (once). */
  fatal(e) {
    if (this.failed) return;
    this.failed = true;
    this.terminate();
    this.onFatal(e);
  }

  terminate() { this.handle.terminate(); }

  // ------------------------------------------------------------------ the song

  /** Bring openDAW's project in line with Itchy's (call after any change). */
  sync() {
    if (this.failed) return;
    const next = describe(this.getProject(), this.env);
    const ok = this.applier.apply(diffScene(this.scene, next), this.scene ? {} : { space: next.space });
    if (ok) this.scene = next;
  }

  /** Apply ops directly (for checks: an op that must fail). */
  applyOps(ops) { return this.applier.apply(ops); }
  /** Run fn(boxGraph) in one guarded transaction (for checks: a transaction that must fail). */
  transact(fn) { return this.applier.transact(fn); }

  play() {
    if (this.failed) return;
    this.expectPlaying = true;
    this.seenPlaying = false;
    this.project.engine.setPosition(0);
    this.project.engine.play();
  }

  /** Pause: held notes are released and echo and reverb tails ring out. Only ever sent while transporting. */
  stop() {
    if (this.failed) return;
    this.expectPlaying = false;
    this.project.engine.stop(false);
  }

  /** The transport position in pulses (updated every animation frame). */
  get position() { return this.project.engine.position.getValue(); }
  get transporting() { return this.project.engine.isPlaying.getValue(); }

  // ------------------------------------------------------------------ live notes

  /**
   * Sound a note now through the layer's unit: an audition, heard at the next render quantum, whether the
   * transport runs or not and whether the critter is asleep or not. A layer with a sound its unit doesn't have
   * (a tray preview) plays through a hidden tray unit carrying the critter's charms.
   */
  audition(layer, note) {
    if (this.failed) return false;
    const p = this.getProject();
    const v = describeVoice(layer, { ...note, s: this.previews++ }, p, this.env);
    if (!v) return false; // a recording that isn't loaded yet
    const unit = this.scene?.units.find((u) => u.key === layer.id);
    const key = unit && unit.sound === layer.sound ? layer.id : this.trayUnit(layer, p);
    const h = key && this.applier.units.get(key);
    if (!h) return false;
    this.project.engine.noteSignal(this.od.NoteSignal.audition(h.audioUnitBox.address.uuid, v.pitch, v.duration, v.velocity));
    return true;
  }

  /** The hidden unit that previews `layer.sound` with `layer`'s charms; made on first use, updated per preview. */
  trayUnit(layer, project) {
    const key = `__tray:${layer.sound}`;
    const desc = describeUnit({ ...layer, id: key, muted: false, notes: [], steps: 16 }, project, this.env);
    const prev = this.tray.get(key);
    const frame = (units) => ({ bpm: 0, groove: {}, masterDb: 0, library: this.scene.library, units });
    const ops = diffScene(frame(prev ? [prev] : []), frame([desc]));
    if (!this.applier.apply(ops, { glide: false })) return null;
    this.tray.set(key, desc);
    return key;
  }

  // ------------------------------------------------------------------ recordings

  /** Register a recording's PCM (its UUID is computed here, asynchronously) so the next sync can use it. */
  async registerRecording(id, rec) {
    if (this.env.recordings[id]) return;
    await this.samples.add(recordingKey(id), { sampleRate: rec.sampleRate, channels: [rec.data], name: `rec:${id}` });
    this.env = { ...this.env, recordings: { ...this.env.recordings, [id]: { seconds: rec.data.length / rec.sampleRate } } };
  }

  /** A new recording: register it, then sync, which adds its file to the library and fills any unit that uses it. */
  async addRecording(id, rec) {
    await this.registerRecording(id, rec);
    this.sync();
  }

  hasRecording(id) { return !!this.env.recordings[id]; }

  // ------------------------------------------------------------------ offline

  /**
   * Render an Itchy project (default: the current one) offline, from step 0 for `steps` steps, at `sampleRate`.
   * Resolves with { sampleRate, channels: [left, right] }. Used by the checks; also the future WAV export.
   */
  async renderOffline({ project = this.getProject(), steps = 16, sampleRate = 48000 } = {}) {
    const { od } = this;
    this.applier.finishGlides();
    const rp = od.Project.new(this.handle.env);
    let error = null;
    try {
      const applier = new SceneApplier({ od, project: rp, samples: this.samples, onFatal: (e) => { error = e; } });
      const scene = describe(project, this.env);
      if (!applier.apply(diffScene(null, scene), { space: scene.space, glide: false })) throw error;
      const section = { type: 'loop', key: 'itchy', label: 'itchy', start: 0, end: steps * STEP_PULSES, passes: 1, tail: false };
      const audio = await od.OfflineEngineRenderer.renderSection(rp.copy(), od.Option.None, section, new od.DefaultObservableValue(0), undefined, sampleRate);
      return { sampleRate, channels: [...audio.frames] };
    } finally {
      rp.terminate();
    }
  }
}
