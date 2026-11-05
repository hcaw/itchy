// The audio engine the app talks to (a facade). It owns the one AudioContext, unlocks it in the first gesture,
// owns the output buses and the level meter, the visual queue of "what just played", the transport flag and the
// interface blips, and hands the music to a backend:
//
//   native  (src/audio/native/engine.js)  the built-in Web Audio engine; plays everything today
//   openDAW (src/audio/opendaw/engine.js)  the song and preview engine on capable, cross-origin isolated pages
//
//   native engine → nativeOut (1) ─┬─► speakers
//   interface blips → uiBus (0.8) ─┤
//   openDAW's worklet ─────────────┤ (it connects itself to the speakers; this is a side tap)
//                                  └─► analyser (level)
//
// Every page starts on the built-in engine, so the first tap always sounds. On a page that can run openDAW the
// context is made at load and openDAW boots meanwhile; once it is ready and the music is stopped, the facade
// switches to it. If openDAW ever fails (a transaction throws, the worklet errors), the facade switches back to the
// built-in engine at once, for the rest of the session, so a child never meets silence (docs/OPENDAW-PORT.md §1c).
//
// Notes due now (taps, previews) go to the backend that plays the song. Notes timed in the future (the hello, the
// mood arpeggio, the dice preview) always go to the built-in engine, which schedules them exactly on the audio
// clock: openDAW can't schedule a live note ahead of time.
//
// This file must never statically import openDAW's code or the vendored bundle: they are loaded with `await import()`
// only on pages that can run them (tests/vendor.test.js checks this).

import { stepDuration } from './scheduler.js';
import { NativeEngine } from './native/engine.js';
import { canUseOpenDaw } from './probe.js';
import { stepEvent, StepTracker } from './playhead.js';
import { STEP_PULSES } from './mirror.js';
import { notesAtStep } from '../model/project.js';

/** A note due within this many seconds is played now (an openDAW audition); later ones are scheduled natively. */
const NOW = 0.015;
const reason = (e) => String(e?.message || e?.type || e);

export class Engine {
  constructor(getProject) {
    this.getProject = getProject;
    this.ctx = null;
    this.native = null;          // the NativeEngine, made with the context
    /** Which backend plays the music: 'native' or 'opendaw'. Can change from 'opendaw' to 'native' after a failure. */
    this.kind = 'native';
    /** The OpenDawEngine, or null. */
    this.openDaw = null;
    /** Settles with the first final kind: 'opendaw' when it takes over, 'native' if it never will (or fails). */
    this.ready = new Promise((ok) => { this.settle = ok; });
    this.playing = false;        // the transport, as the app sees it; set at once by play() and stop()
    this.gen = 0;                // play/stop generation: an async play() that finishes after a stop() does nothing
    this.sentPlay = false;       // has openDAW been told to play (so a stop must be sent)?
    this.waiting = null;         // a booted OpenDawEngine waiting for the music to stop before it takes over
    this.tracker = new StepTracker();
    this.recordings = new Map(); // every recording added: id → { sampleRate, data }
    this.unlocked = false;       // has the iOS unlock buffer been played (in a gesture)?
    this.pendingRecordings = new Map(); // recordings added before there is a context
    this.events = [];            // visual queue: {time, index, dur, steps:{layerId: step}, hits:{layerId: rows[]}}
    this.listeners = new Set();
    // openDAW needs the context before the first gesture so it can boot meanwhile (it starts suspended). Other pages
    // make it lazily in the first gesture, as before, so old iPads keep the path they know.
    if (typeof window !== 'undefined' && canUseOpenDaw(window)) {
      this.createContext();
      this.bootOpenDaw();
      // A page restored from the back/forward cache can come back with Chromium's audio worklet clock running at
      // half speed. Reload it instead: the song was saved when the page was hidden, so nothing is lost.
      addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
    } else {
      this.settle('native');
    }
  }

  /** Load and boot openDAW (never statically imported: only here, after the capability probe). */
  async bootOpenDaw() {
    let od;
    try {
      const { startOpenDaw } = await import('./opendaw/engine.js');
      od = await startOpenDaw(this.ctx, { getProject: this.getProject, recordings: this.recordings, onFatal: (e) => this.fail(e) });
      od.worklet.connect(this.analyser);
      od.onHalt = () => this.halted();
    } catch (e) {
      console.info('Itchy: playing with the built-in sound engine.', reason(e));
      this.settle('native');
      return;
    }
    this.openDaw = od;
    // Recordings that arrived while it booted.
    for (const [id, rec] of this.recordings) if (!od.hasRecording(id)) await od.addRecording(id, rec);
    if (this.openDaw !== od) return; // failed meanwhile
    if (this.playing) this.waiting = od;
    else this.useOpenDaw(od);
  }

  useOpenDaw(od) {
    this.waiting = null;
    if (this.openDaw !== od) return;
    this.kind = 'opendaw';
    od.sync();
    if (this.kind === 'opendaw') this.settle('opendaw');
  }

  /** openDAW failed: the built-in engine takes over at once, for the rest of the session. */
  fail(e) {
    const od = this.openDaw;
    if (!od) return;
    console.info('Itchy: the openDAW engine stopped, so the built-in sound engine plays from now on.', reason(e));
    this.openDaw = null;
    this.waiting = null;
    const was = this.kind;
    this.kind = 'native';
    this.sentPlay = false;
    try { od.terminate(); } catch { /* already gone */ }
    if (was === 'opendaw' && this.playing) {
      this.events = [];
      this.native.play();
    }
    this.settle('native');
  }

  /**
   * openDAW stopped the music by itself because the device couldn't keep up (a CPU overload): show it as stopped,
   * exactly as if Stop had been pressed, so pressing Play starts it again.
   */
  halted() {
    if (!this.playing || this.kind !== 'opendaw') return;
    console.info('Itchy: the music stopped because the device was too busy to keep playing it.');
    this.sentPlay = false; // openDAW has stopped already
    this.stop();
  }

  createContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.nativeOut = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.uiBus.gain.value = 0.8;
    for (const bus of [this.nativeOut, this.uiBus]) {
      bus.connect(ctx.destination);
      bus.connect(this.analyser);
    }
    this.native = new NativeEngine(this.getProject, { ctx, out: this.nativeOut, onStep: (i, t, d) => this.playStep(i, t, d) });
    for (const [id, rec] of this.pendingRecordings) this.native.addRecording(id, rec);
    this.pendingRecordings.clear();
  }

  /** Create or wake the audio context. Call it from a user gesture before the first sound. */
  ensure() {
    if (!this.ctx) this.createContext();
    if (!this.unlocked) {
      // iOS Safari only unlocks after a sound has started inside a gesture, however old the context is.
      this.unlocked = true;
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, 22050);
      s.connect(this.ctx.destination);
      s.start(0);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this.native.ensure();
    return this.ctx;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  /** Recordings ready to play: recordingId → audio. */
  get buffers() { return this.native ? this.native.buffers : new Map(); }

  // ------------------------------------------------------------ transport

  play() {
    this.ensure();
    const gen = ++this.gen;
    this.playing = true;
    this.events = [];
    if (this.kind === 'native') this.native.play();
    else {
      this.tracker.reset();
      this.restarting = true; // until openDAW reports the jump back to 0, its position is the old one
      const od = this.openDaw;
      // A Stop (or a failure) before the context is running wins: nothing is sent.
      const go = () => {
        if (gen !== this.gen || !this.playing || this.kind !== 'opendaw' || this.openDaw !== od) return;
        od.play();
        this.sentPlay = true;
      };
      if (this.ctx.state === 'running') go();
      else this.ctx.resume().then(go, () => {});
    }
    this.emit('play');
  }

  stop() {
    if (!this.native?.built) return;
    this.gen++;
    this.playing = false;
    if (this.kind === 'native') this.native.stop();
    // openDAW gets a stop only if it was told to play: a stop while not transporting would reset every device
    // and cut the tails of previews that are still ringing.
    else if (this.sentPlay) this.openDaw.stop();
    this.sentPlay = false;
    this.tracker.reset();
    this.events = [];
    this.emit('stop');
    if (this.waiting) this.useOpenDaw(this.waiting);
  }

  /** Bring the backends in line with the project (call after any change). Cheap; safe to call often. */
  sync() {
    // The built-in engine always follows, so the phrases it plays carry each critter's charms, and it can take
    // over at any moment.
    this.native?.sync();
    if (this.kind === 'opendaw') this.openDaw.sync();
  }

  // ------------------------------------------------------------ notes

  /**
   * Play one note of a layer at audio time t. Every note the app plays goes through here (previews, phrases, and
   * the built-in engine's song steps), so the checks can count sounds. On openDAW, a note due now is an openDAW
   * audition; a note in the future, or of an interface voice (ids starting "__"), goes to the built-in engine,
   * which schedules it exactly on the audio clock.
   */
  voice(layer, note, t, dur, preview = false) {
    if (!this.native) return;
    if (this.kind === 'opendaw' && t <= this.ctx.currentTime + NOW && !layer.id.startsWith('__')) {
      this.openDaw.audition(layer, note);
      return;
    }
    return this.native.voice(layer, note, t, dur, preview);
  }

  /**
   * One step of the song: queue its visual event and, on the built-in engine, play its notes. The built-in
   * engine's scheduler calls it ahead of time; on openDAW, drainEvents() calls it as each step is heard.
   */
  playStep(index, time, dur) {
    const p = this.getProject();
    const ev = stepEvent(p, index, time, dur);
    if (this.kind === 'native') {
      for (const layer of p.layers) {
        if (!ev.hits[layer.id]) continue;
        for (const n of notesAtStep(layer, ev.steps[layer.id])) this.voice(layer, n, time, dur);
      }
    }
    this.events.push(ev);
  }

  /** Play a note right now (tapping a cell, choosing a sound…) through the layer's charms. */
  preview(layer, row, vel = 0.9) {
    this.ensure();
    const t = this.ctx.currentTime + 0.01;
    this.voice(layer, { r: row, vel, len: 2 }, t, stepDuration(this.getProject().tempo), true);
  }

  /** Little interface sounds, so no action is ever silent: pop (rub out), tick, whoosh, bonk. */
  uiSound(kind = 'pop') {
    this.ensure();
    const ctx = this.ctx, t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const shapes = {
      pop: [620, 260, 0.08, 0.16, 'sine'],
      tick: [1400, 1100, 0.03, 0.06, 'triangle'],
      whoosh: [300, 900, 0.25, 0.1, 'triangle'],
      bonk: [220, 140, 0.18, 0.18, 'square'],
      add: [520, 1040, 0.12, 0.12, 'sine'],
    };
    const [f1, f2, len, vol, type] = shapes[kind] || shapes.pop;
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.uiBus);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  /** Visual events whose sound is now reaching the speakers. */
  drainEvents() {
    if (!this.ctx) return [];
    const lat = Math.min(0.2, this.ctx.outputLatency || this.ctx.baseLatency || 0);
    if (this.kind === 'opendaw' && this.sentPlay) {
      // openDAW plays the song on the audio thread: read its position and report each step as it is heard.
      const p = this.getProject();
      const now = this.ctx.currentTime, dur = stepDuration(p.tempo), position = this.openDaw.position;
      if (this.restarting && position < 4 * STEP_PULSES) this.restarting = false;
      if (!this.restarting) {
        for (const { index, ago } of this.tracker.advance(position, { tempo: p.tempo, latency: lat, swing: p.swing })) {
          this.playStep(index, now - ago, dur);
        }
      }
    }
    if (!this.events.length) return [];
    const t = this.ctx.currentTime - lat;
    let i = 0;
    while (i < this.events.length && this.events[i].time <= t) i++;
    return i ? this.events.splice(0, i) : [];
  }

  /** 0..1 loudness of the mix right now, for things that glow with the music. */
  level() {
    if (!this.analyser) return 0;
    const a = (this.levelBuf ||= new Float32Array(this.analyser.fftSize));
    this.analyser.getFloatTimeDomainData(a);
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
    return Math.min(1, Math.sqrt(sum / a.length) * 3);
  }

  // ------------------------------------------------------------ recordings

  /** Add a mic recording. Resolves when every backend can play it (openDAW computes its sample id first). */
  async addRecording(id, rec) {
    this.recordings.set(id, rec);
    if (!this.native) this.pendingRecordings.set(id, rec);
    else this.native.addRecording(id, rec);
    if (this.openDaw) await this.openDaw.addRecording(id, rec);
  }
  hasRecording(id) {
    return !!this.native?.hasRecording(id) || this.pendingRecordings.has(id);
  }

  /** Render a project offline on openDAW (checks, and a future WAV export). Rejects on the built-in engine. */
  renderOffline(options) {
    if (this.kind !== 'opendaw') return Promise.reject(new Error('offline rendering needs the openDAW engine'));
    return this.openDaw.renderOffline(options);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type) { for (const fn of this.listeners) fn(type); }
}
