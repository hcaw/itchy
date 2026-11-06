// The openDAW backend: plays Itchy's song and previews with openDAW's engine (docs/OPENDAW-PORT.md §1, §3-§9).
//
// The facade (../engine.js) loads this file with `await import()` only on capable, isolated pages, and only talks
// to the OpenDawEngine that startOpenDaw() resolves with. Itchy's project JSON stays the only truth: every sync()
// describes it again (mirror.js) and applies the difference to openDAW's project (apply.js), which is never saved
// and keeps no undo.
//
// openDAW sequences the song on the audio thread. Live notes (taps, previews) are auditions on hidden voice units
// that sound at the next render quantum; notes timed in the future (the interface phrases) never come here: the facade gives them to the
// built-in engine, which schedules them exactly on the audio clock.

import { bootOpenDaw } from './boot.js';
import { SceneApplier, sampleKeyOf } from './apply.js';
import { recordingKey } from './samples.js';
import { describe, describeUnit, describeVoice, diffScene, pulsesPerSecond, STEP_PULSES } from '../mirror.js';
import { renderSounds, soundCatalogue, impulseScale, SPACE_FILE } from '../render-sounds.js';
import { createLayer } from '../../model/project.js';

/**
 * sessionStorage flag: set while openDAW boots and for 20 s after, so a tab that died there (an iPad that killed it
 * under memory pressure, say) uses the built-in engine when it comes back. A normal unload (a reload, leaving the
 * page) clears it in `pagehide`, which a killed tab never gets, so reloading never costs openDAW.
 */
export const CRASH_FLAG = 'itchy-opendaw-booting';
const CRASH_CLEAR_MS = 20000;
/**
 * How far openDAW's position, as the main thread estimates it, trails the sound leaving the engine, in seconds:
 * measured in Chromium (tests/e2e/check.mjs visualSync checks each hit's playhead time against its sound).
 */
const POSITION_LAG = 0.005;
/**
 * Hidden units the live notes of tune sounds take turns on (openDAW keeps one audition per unit). A bell rings about
 * 1.8 s, so four keep a quickly painted melody or a chord ringing.
 */
const VOICES = 4;

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
 * @param {() => Promise<void>} [o.quiet]  resolves when the music is stopped: the boot's long main-thread steps
 *   wait for it (see bootOpenDaw)
 */
export async function startOpenDaw(ctx, { getProject, recordings = new Map(), onFatal, quiet = async () => {} }) {
  if (session.get()) throw new Error('openDAW did not survive its last boot in this tab');
  await quiet();
  session.set();
  addEventListener('pagehide', session.clear);
  let engine = null, booted = false;
  const fatal = (e) => { if (booted) onFatal(e); }; // a failure during boot rejects the boot instead
  const renders = renderSounds({ sampleRate: ctx.sampleRate }); // in parallel with the download
  try {
    const handle = await bootOpenDaw(ctx, {
      quiet,
      onFatal: (e) => (engine ? engine.fatal(e) : fatal(e)),
      prepare: async (h) => {
        for (const r of (await renders).values()) {
          const channels = r.id === SPACE_FILE ? scaled(r.channels, r.sampleRate) : r.channels;
          await h.samples.add(sampleKeyOf(r.id), { sampleRate: r.sampleRate, channels, name: r.id });
        }
        engine = new OpenDawEngine(h, { getProject, onFatal: fatal });
        for (const [id, rec] of recordings) await engine.registerRecording(id, rec);
        await quiet();
        engine.sync();
        engine.buildVoices();
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
    this.voices = new Map(); // hidden voice unit key → its unit description (see audition)
    this.voiceOwner = new Map(); // hidden voice unit key → the id of the critter it last played
    this.nextVoice = 0;      // the tune voice unit the next live note uses
    this.previews = 0;       // turns the variants of a noisy drum for repeated previews
    const frame = typeof requestAnimationFrame === 'function'
      ? (fn) => (document.hidden ? queueMicrotask(fn) : requestAnimationFrame(fn))
      : null;
    this.applier = new SceneApplier({ od: this.od, project: this.project, samples: this.samples, onFatal: (e) => this.fatal(e), frame });
    /** Called when openDAW stops the music by itself (see watchTransport). */
    this.onHalt = () => {};
    this.expectPlaying = false; // play() was sent and no stop() since
    this.seenPlaying = false;   // and openDAW has reported the transport running since
    this.watchTransport();
    // The audio time when the main thread last read a new position (openDAW reads it in its own animation frame,
    // which runs after the app's: the app always sees the previous frame's position).
    this.positionAt = 0;
    this.fit = null;
    this.project.engine.position.subscribe(() => { this.positionAt = handle.env.audioContext.currentTime; });
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
    if (!ok) return;
    this.scene = next;
    // A voice unit follows the charms of the critter it last played, as a preview on the built-in engine plays
    // through the critter's own chain: undoing an echo also ends the echo of the preview that is still ringing.
    const p = this.getProject();
    for (const [key, id] of this.voiceOwner) {
      const layer = p.layers.find((l) => l.id === id);
      if (layer && layer.sound === this.voices.get(key)?.sound) this.voiceUnit(key, layer, p, true);
    }
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

  /** The transport position in pulses, as last read (once every animation frame). */
  get position() { return this.project.engine.position.getValue(); }

  /**
   * The transport position in pulses at audio time `now`, while the transport runs. The main thread reads openDAW's
   * position once a frame, in openDAW's own animation frame (after the app's), and the audio thread writes it in
   * bursts, so a reading is a few ms to a frame old. Each reading says where the transport was at the audio time it
   * was read; the least late of the recent readings (position = pulses a second × time + c, take the largest c,
   * which sags by 20 ms a second so it follows a transport that falls behind) gives the steadiest estimate. A new
   * tempo, or a reading more than 50 ms behind (a restart, an audio stall), starts again from that reading. Even so,
   * the estimate trails the sound by about 5 ms (POSITION_LAG). It stays within 50 ms ahead of the last reading.
   */
  positionNow(now, bpm) {
    const pps = pulsesPerSecond(bpm), position = this.position;
    const c = position - pps * this.positionAt;
    const fit = this.fit, at = this.positionAt;
    if (!fit || fit.bpm !== bpm || fit.c - c > 0.05 * pps) this.fit = { bpm, c, at };
    else if (at !== fit.at) this.fit = { bpm, c: Math.max(c, fit.c - 0.02 * pps * (at - fit.at)), at };
    return Math.min(position + 0.05 * pps, Math.max(position, this.fit.c + pps * (now + POSITION_LAG)));
  }

  get transporting() { return this.project.engine.isPlaying.getValue(); }

  // ------------------------------------------------------------------ live notes

  /**
   * Sound a note now (a tap or a preview): an audition, heard at the next render quantum, whether the transport runs
   * or not and whether the critter is asleep or not. It never goes to the critter's own unit, which plays the song
   * (and is muted while the critter sleeps): it goes to a hidden voice unit that copies the critter's sound and
   * charms. openDAW keeps one audition per unit (a new one ends the one before), so tune sounds take turns over a
   * pool of VOICES units and each note rings its full length; a kit has one voice unit per kit, as its slots play
   * every hit to its end (gate off).
   *
   * A voice unit that has to switch to another sample file (a different tune sound or a recording) is replaced
   * rather than re-pointed (see voiceUnit), so this note can go at once.
   */
  audition(layer, note) {
    if (this.failed) return false;
    const p = this.getProject();
    const v = describeVoice(layer, { ...note, s: this.previews++ }, p, this.env);
    if (!v) return false; // a recording that isn't loaded yet
    const kit = this.env.sounds[layer.sound]?.instrument === 'playfield';
    const key = kit ? `__voice:${layer.sound}` : this.tuneVoice(describeUnit({ ...layer, notes: [], steps: 16 }, p, this.env).instrument.file);
    const h = this.voiceUnit(key, layer, p) && this.applier.units.get(key);
    if (!h) return false;
    this.voiceOwner.set(key, layer.id);
    this.project.engine.noteSignal(this.od.NoteSignal.audition(h.audioUnitBox.address.uuid, v.pitch, v.duration, v.velocity));
    return true;
  }

  /**
   * The tune voice the next live note plays on: going round the pool, the first voice that already holds `file` and
   * didn't play the last note (so a quick run of notes keeps ringing), else simply the next voice, which then has to
   * be given the file (a new unit, a little slower: see voiceUnit). Repeated sounds so never change a voice's file.
   */
  tuneVoice(file) {
    let pick = null;
    for (let i = 1; i <= VOICES && pick === null; i++) {
      const k = (this.nextVoice + i) % VOICES;
      if (k !== this.nextVoice && this.voices.get(`__voice:${k}`)?.instrument?.file === file) pick = k;
    }
    this.nextVoice = pick ?? (this.nextVoice + 1) % VOICES;
    return `__voice:${this.nextVoice}`;
  }

  /**
   * Make or update the hidden voice unit `key` to play `layer`'s sound through its charms (one small transaction).
   * `glide`: charm fields glide as on a critter's unit (when following a critter); otherwise they jump at once,
   * before the note they are for.
   *
   * A voice that has to play another sample file is replaced with a new unit, not re-pointed: openDAW loses about two
   * in three auditions sent in the same task as a file re-point (the note goes silent), but plays an audition on a
   * unit created in that task (the M1 spike's "delete a unit, recreate it and audition in the same task").
   */
  voiceUnit(key, layer, project, glide = false) {
    const desc = describeUnit({ ...layer, id: key, muted: false, notes: [], steps: 16 }, project, this.env);
    const prev = this.voices.get(key);
    const frame = (units) => ({ bpm: 0, groove: {}, masterDb: 0, library: this.scene.library, units });
    let ops = diffScene(frame(prev ? [prev] : []), frame([desc]));
    if (ops.some((op) => op.op === 'setFile')) ops = [{ op: 'replaceUnit', key, unit: desc }];
    if (!this.applier.apply(ops, { glide })) return false;
    this.voices.set(key, desc);
    return true;
  }

  /** Build the voice units at boot, so the first tap never waits for one: the tune pool and one per kit. */
  buildVoices() {
    const p = this.getProject();
    for (let k = 0; k < VOICES; k++) this.voiceUnit(`__voice:${k}`, createLayer('bells'), p);
    for (const [id, s] of Object.entries(this.env.sounds)) if (s.instrument === 'playfield') this.voiceUnit(`__voice:${id}`, createLayer(id), p);
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
    // A fresh throwaway project, rendered directly (renderSection never terminates its source: a copy would leak).
    const rp = od.Project.new(this.handle.env);
    let error = null;
    try {
      const applier = new SceneApplier({ od, project: rp, samples: this.samples, onFatal: (e) => { error = e; } });
      const scene = describe(project, this.env);
      if (!applier.apply(diffScene(null, scene), { space: scene.space, glide: false })) throw error;
      const section = { type: 'loop', key: 'itchy', label: 'itchy', start: 0, end: steps * STEP_PULSES, passes: 1, tail: false };
      const audio = await od.OfflineEngineRenderer.renderSection(rp, od.Option.None, section, new od.DefaultObservableValue(0), undefined, sampleRate);
      return { sampleRate, channels: [...audio.frames] };
    } finally {
      rp.terminate();
    }
  }
}
