// The built-in audio engine: a lookahead scheduler on the audio clock, a mixing chain per critter (layer) with its
// charms (effects), a shared reverb and a limiter, all in plain Web Audio.
//
//   layer voices → [volume] → [lowpass] → [highpass] ─┬─► master → limiter → out
//                                                    ├─► echo (per layer: delay + feedback) ─► master
//                                                    └─► space send ─► shared reverb ─► master
//
// It doesn't own the AudioContext, the analyser or the interface blips: the facade (../engine.js) creates the
// context, unlocks it in the first gesture and hands this engine `{ ctx, out }`. This engine is the fallback when
// openDAW can't run, the bridge while it boots, and the player of the timed interface phrases, which it schedules
// exactly on the audio clock (docs/OPENDAW-PORT.md §1c, §6b).

import { Scheduler, stepDuration } from '../scheduler.js';
import { createTicker } from '../ticker.js';
import { playDrum, playTune, playSample, makeImpulse } from '../instruments.js';
import { rowSemitones } from '../../model/scales.js';
import { soundInfo, soundKind, recordingId } from '../../model/sounds.js';

const SMOOTH = 0.03; // seconds: parameter changes glide instead of clicking

export class NativeEngine {
  /**
   * @param {() => object} getProject   the current project
   * @param {object} o
   * @param {AudioContext} o.ctx        the shared context (the facade made it)
   * @param {AudioNode} o.out           where the limiter's output goes
   * @param {(index:number, time:number, dur:number) => void} o.onStep  called by the scheduler once per step
   */
  constructor(getProject, { ctx, out, onStep }) {
    this.getProject = getProject;
    this.ctx = ctx;
    this.out = out;
    this.onStep = onStep;
    this.built = false;
    this.chains = new Map();    // layerId → nodes
    this.buffers = new Map();   // recordingId → AudioBuffer
    this.scheduler = null;
    this.ticker = null;
  }

  /** Build the mixing graph if it isn't built yet. The context's unlock and resume are the facade's job. */
  ensure() {
    if (!this.built) this.build();
    return this.ctx;
  }

  build() {
    const ctx = this.ctx;
    this.built = true;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.master.connect(this.limiter).connect(this.out);

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
      onStep: (i, t, d) => this.onStep(i, t, d),
    });
    this.ticker = createTicker(() => this.scheduler.tick());
  }

  get playing() { return !!(this.scheduler && this.scheduler.running); }

  // ------------------------------------------------------------ transport

  play() {
    this.ensure();
    this.sync();
    const t = this.ctx.currentTime;
    for (const c of this.chains.values()) {
      c.stopper.gain.cancelScheduledValues(t);
      c.stopper.gain.setValueAtTime(1, t);
    }
    this.scheduler.start();
    this.ticker.start();
  }

  stop() {
    if (!this.built) return;
    this.scheduler.stop();
    this.ticker.stop();
    // Let ringing notes fade rather than chop them: duck each layer briefly, then restore.
    const t = this.ctx.currentTime;
    for (const c of this.chains.values()) {
      c.stopper.gain.cancelScheduledValues(t);
      c.stopper.gain.setTargetAtTime(0, t, 0.05);
      c.stopper.gain.setTargetAtTime(1, t + 0.4, 0.01);
    }
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
    if (!this.built) return;
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
    this.ensure();
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

  // ------------------------------------------------------------ recordings

  addRecording(id, rec) {
    const buf = this.ctx.createBuffer(1, rec.data.length, rec.sampleRate);
    buf.copyToChannel(rec.data, 0);
    this.buffers.set(id, buf);
  }
  hasRecording(id) { return this.buffers.has(id); }
}
