// The audio engine: one AudioContext, a lookahead scheduler on its clock, a mixing chain per
// critter (layer) with its charms (effects), and a queue of "what just played" for the UI.
//
//   layer voices → [volume] → [lowpass] → [highpass] ─┬─► master → limiter → speakers
//                                                    ├─► echo (per layer: delay + feedback) ─► master
//                                                    └─► space send ─► shared reverb ─► master

import { Scheduler, stepDuration } from './scheduler.js';
import { createTicker } from './ticker.js';
import { playDrum, playTune, playSample, makeImpulse } from './instruments.js';
import { rowSemitones } from '../model/scales.js';
import { soundInfo, soundKind, recordingId } from '../model/sounds.js';
import { notesAtStep } from '../model/project.js';

const SMOOTH = 0.03; // seconds: parameter changes glide instead of clicking

export class Engine {
  constructor(getProject) {
    this.getProject = getProject;
    this.ctx = null;
    this.chains = new Map();    // layerId → nodes
    this.buffers = new Map();   // recordingId → AudioBuffer
    this.pendingRecordings = new Map();
    this.events = [];           // visual queue: {time, index, dur, steps:{layerId: step}, hits:{layerId: rows[]}}
    this.listeners = new Set();
    this.scheduler = null;
    this.ticker = null;
  }

  /** Create or wake the audio context. Must be called from a user gesture the first time. */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build();
      // iOS Safari only unlocks after a sound has started inside the gesture.
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, 22050);
      s.connect(this.ctx.destination);
      s.start(0);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.master.connect(this.limiter).connect(this.analyser).connect(ctx.destination);

    this.spaceIn = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx);
    const spaceOut = ctx.createGain();
    spaceOut.gain.value = 0.9;
    this.spaceIn.connect(this.reverb).connect(spaceOut).connect(this.master);

    this.scheduler = new Scheduler({
      now: () => ctx.currentTime,
      getTempo: () => this.getProject().tempo,
      getSwing: () => this.getProject().swing,
      onStep: (i, t, d) => this.playStep(i, t, d),
    });
    this.ticker = createTicker(() => this.scheduler.tick());

    for (const [id, rec] of this.pendingRecordings) this.addRecording(id, rec);
    this.pendingRecordings.clear();
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  get playing() { return !!(this.scheduler && this.scheduler.running); }

  // ------------------------------------------------------------ transport

  play() {
    this.ensure();
    this.sync();
    this.events = [];
    const t = this.ctx.currentTime;
    for (const c of this.chains.values()) {
      c.stopper.gain.cancelScheduledValues(t);
      c.stopper.gain.setValueAtTime(1, t);
    }
    this.scheduler.start();
    this.ticker.start();
    this.emit('play');
  }

  stop() {
    if (!this.scheduler) return;
    this.scheduler.stop();
    this.ticker.stop();
    // Let ringing notes fade rather than chop them: duck each layer briefly, then restore.
    const t = this.ctx.currentTime;
    for (const c of this.chains.values()) {
      c.stopper.gain.cancelScheduledValues(t);
      c.stopper.gain.setTargetAtTime(0, t, 0.05);
      c.stopper.gain.setTargetAtTime(1, t + 0.4, 0.01);
    }
    this.events = [];
    this.emit('stop');
  }

  // ------------------------------------------------------------ per-layer chains

  chain(layer) {
    let c = this.chains.get(layer.id);
    if (c) return c;
    const ctx = this.ctx;
    c = {
      input: ctx.createGain(),
      stopper: ctx.createGain(),
      volume: ctx.createGain(),
      lowpass: ctx.createBiquadFilter(),
      highpass: ctx.createBiquadFilter(),
      echoSend: ctx.createGain(),
      delay: ctx.createDelay(2),
      feedback: ctx.createGain(),
      echoTone: ctx.createBiquadFilter(),
      spaceSend: ctx.createGain(),
      previewIn: ctx.createGain(), // taps and previews: heard even when the critter is asleep
    };
    c.lowpass.type = 'lowpass';
    c.lowpass.frequency.value = 20000;
    c.highpass.type = 'highpass';
    c.highpass.frequency.value = 10;
    c.echoTone.type = 'lowpass';
    c.echoTone.frequency.value = 3500;
    c.echoSend.gain.value = 0;
    c.spaceSend.gain.value = 0;
    c.input.connect(c.stopper).connect(c.volume).connect(c.lowpass).connect(c.highpass);
    c.previewIn.connect(c.lowpass);
    c.highpass.connect(this.master);
    c.highpass.connect(c.echoSend).connect(c.delay).connect(c.echoTone).connect(c.feedback).connect(c.delay);
    c.echoTone.connect(this.master);
    c.highpass.connect(c.spaceSend).connect(this.spaceIn);
    this.chains.set(layer.id, c);
    this.applyLayer(layer, c);
    return c;
  }

  applyLayer(layer, c = this.chains.get(layer.id)) {
    if (!c) return;
    const t = this.ctx.currentTime;
    const p = this.getProject();
    const tone = layer.fx.tone;
    c.volume.gain.setTargetAtTime(layer.muted ? 0 : layer.volume, t, SMOOTH);
    c.previewIn.gain.setTargetAtTime(layer.volume, t, SMOOTH);
    // Dark ↔ Bright: below zero closes a resonant lowpass, above zero opens a highpass.
    const lp = tone < 0 ? 180 * Math.pow(2, (1 + tone) * 6.8) : 20000;
    const hp = tone > 0 ? 20 * Math.pow(2, tone * 7.3) : 10;
    c.lowpass.frequency.setTargetAtTime(Math.min(20000, lp), t, SMOOTH);
    c.highpass.frequency.setTargetAtTime(hp, t, SMOOTH);
    c.lowpass.Q.setTargetAtTime(0.7 + Math.max(0, -tone) * 5, t, SMOOTH);
    c.highpass.Q.setTargetAtTime(0.7 + Math.max(0, tone) * 4, t, SMOOTH);
    // Echo: one handle sets both how loud and how long the echoes are.
    const e = layer.fx.echo;
    c.echoSend.gain.setTargetAtTime(e * 0.75, t, SMOOTH);
    c.feedback.gain.setTargetAtTime(e > 0 ? 0.3 + e * 0.42 : 0, t, SMOOTH);
    c.delay.delayTime.setTargetAtTime(stepDuration(p.tempo) * 3, t, 0.1); // dotted eighth, follows tempo
    c.spaceSend.gain.setTargetAtTime(layer.fx.space * 1.1, t, SMOOTH);
  }

  /** Bring chains in line with the project (call after any change). Cheap; safe to call often. */
  sync() {
    if (!this.ctx) return;
    const p = this.getProject();
    const ids = new Set(p.layers.map((l) => l.id));
    for (const [id, c] of this.chains) {
      // Chains for interface voices (ids starting "__", e.g. the mood arpeggio) are kept, so a
      // sync straight after them doesn't cut their echo short.
      if (!ids.has(id) && !id.startsWith('__')) {
        c.input.disconnect();
        c.previewIn.disconnect();
        c.highpass.disconnect();
        c.echoTone.disconnect();
        this.chains.delete(id);
      }
    }
    for (const l of p.layers) this.applyLayer(l, this.chain(l));
  }

  // ------------------------------------------------------------ notes

  /** Schedule one note of a layer at audio time t. */
  voice(layer, note, t, dur, preview = false) {
    const c = this.chain(layer);
    const out = preview ? c.previewIn : c.input;
    const p = this.getProject();
    const kind = soundKind(layer.sound);
    const vel = note.vel ?? 1;
    if (kind === 'beat') return playDrum(this.ctx, layer.sound, note.r, t, vel, out);
    const semis = rowSemitones(note.r, p.mood) + p.key + 12 * layer.octave;
    const recId = recordingId(layer.sound);
    if (recId) {
      const buf = this.buffers.get(recId);
      // Row 3 plays the recording at its own pitch; rows above and below sing higher and lower.
      if (buf) playSample(this.ctx, buf, semis - rowSemitones(3, p.mood) - p.key, t, vel, out);
      return;
    }
    playTune(this.ctx, layer.sound, soundInfo(layer.sound).base + semis, t, vel, dur * (note.len || 1), out);
  }

  playStep(index, time, dur) {
    const p = this.getProject();
    const ev = { time, index, dur, steps: {}, hits: {} };
    for (const layer of p.layers) {
      const step = index % layer.steps;
      ev.steps[layer.id] = step;
      if (layer.muted) continue;
      const notes = notesAtStep(layer, step);
      if (!notes.length) continue;
      ev.hits[layer.id] = notes.map((n) => n.r);
      for (const n of notes) this.voice(layer, n, time, dur);
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
    o.connect(g).connect(this.master);
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
    if (!this.ctx) { this.pendingRecordings.set(id, rec); return; }
    const buf = this.ctx.createBuffer(1, rec.data.length, rec.sampleRate);
    buf.copyToChannel(rec.data, 0);
    this.buffers.set(id, buf);
  }
  hasRecording(id) {
    return this.buffers.has(id) || this.pendingRecordings.has(id);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type) { for (const fn of this.listeners) fn(type); }
}
