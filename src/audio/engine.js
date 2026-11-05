// The audio engine the app talks to (a facade). It owns the one AudioContext, unlocks it in the first gesture,
// owns the output buses and the level meter, the visual queue of "what just played", the transport flag and the
// interface blips, and hands the music to a backend:
//
//   native  (src/audio/native/engine.js)  the built-in Web Audio engine; plays everything today
//   openDAW (src/audio/opendaw/, from milestone M3 of docs/OPENDAW-PORT.md)  the song engine on isolated pages
//
//   native engine → nativeOut (1) ─┬─► speakers
//   interface blips → uiBus (0.8) ─┤
//                                  └─► analyser (level)
//
// This file must never statically import openDAW's code or the vendored bundle: they are loaded with `await import()`
// only on pages that can run them (tests/vendor.test.js checks this).

import { stepDuration } from './scheduler.js';
import { NativeEngine } from './native/engine.js';
import { canUseOpenDaw } from './probe.js';
import { stepEvent } from './playhead.js';
import { notesAtStep } from '../model/project.js';

export class Engine {
  constructor(getProject) {
    this.getProject = getProject;
    this.ctx = null;
    this.native = null;          // the NativeEngine, made with the context
    /** Which backend plays the music: 'native' or 'opendaw'. Can change from 'opendaw' to 'native' after a failure. */
    this.kind = 'native';
    /** The OpenDawEngine, or null. */
    this.openDaw = null;
    /** Settles with the first final kind. (openDAW isn't wired in yet, so it is always the built-in engine.) */
    this.ready = Promise.resolve('native');
    this.playing = false;        // the transport, as the app sees it; set at once by play() and stop()
    this.gen = 0;                // play/stop generation: an async play() that finishes after a stop() does nothing
    this.unlocked = false;       // has the iOS unlock buffer been played (in a gesture)?
    this.pendingRecordings = new Map(); // recordings added before there is a context
    this.events = [];            // visual queue: {time, index, dur, steps:{layerId: step}, hits:{layerId: rows[]}}
    this.listeners = new Set();
    // openDAW needs the context before the first gesture so it can boot meanwhile (it starts suspended). Other pages
    // make it lazily in the first gesture, as before, so old iPads keep the path they know.
    if (typeof window !== 'undefined' && canUseOpenDaw(window)) this.createContext();
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
    this.gen++;
    this.playing = true;
    this.events = [];
    this.native.play();
    this.emit('play');
  }

  stop() {
    if (!this.native?.built) return;
    this.gen++;
    this.playing = false;
    this.native.stop();
    this.events = [];
    this.emit('stop');
  }

  /** Bring the backend in line with the project (call after any change). Cheap; safe to call often. */
  sync() {
    this.native?.sync();
  }

  // ------------------------------------------------------------ notes

  /**
   * Play one note of a layer at audio time t. Every note goes through here (song steps, previews, phrases), so
   * the checks can count sounds. For now the built-in engine plays them all; from M3, on openDAW, a note due now
   * is an openDAW audition and a note in the future goes to the built-in engine, which schedules it exactly.
   */
  voice(layer, note, t, dur, preview = false) {
    if (!this.native) return;
    return this.native.voice(layer, note, t, dur, preview);
  }

  /** One step of the song: queue its visual event and play its notes (the built-in engine's scheduler calls it). */
  playStep(index, time, dur) {
    const p = this.getProject();
    const ev = stepEvent(p, index, time, dur);
    for (const layer of p.layers) {
      if (!ev.hits[layer.id]) continue;
      for (const n of notesAtStep(layer, ev.steps[layer.id])) this.voice(layer, n, time, dur);
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
    if (!this.ctx || !this.events.length) return [];
    const lat = Math.min(0.2, this.ctx.outputLatency || this.ctx.baseLatency || 0);
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

  addRecording(id, rec) {
    if (!this.native) { this.pendingRecordings.set(id, rec); return; }
    this.native.addRecording(id, rec);
  }
  hasRecording(id) {
    return !!this.native?.hasRecording(id) || this.pendingRecordings.has(id);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type) { for (const fn of this.listeners) fn(type); }
}
