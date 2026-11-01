// Microphone recording. Permission is only asked for the first time a child presses record.
// Audio is captured as raw samples (no codecs), then trimmed, normalised and faded so that
// any "boing", clap or giggle becomes a clean, playable sound.

export const MAX_SECONDS = 4;

export class MicRecorder {
  constructor(engine) {
    this.engine = engine;
    this.stream = null;
    this.workletReady = null;
  }

  /** Ask for the microphone. Resolves to 'ok', 'denied' or 'unavailable'. Never throws. */
  async open() {
    if (this.stream && this.stream.active) return 'ok';
    if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
      });
      return 'ok';
    } catch (e) {
      return e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'unavailable';
    }
  }

  async start({ onLevel } = {}) {
    const ctx = this.engine.ensure();
    if (!this.workletReady) this.workletReady = ctx.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
    await this.workletReady;
    const src = ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(ctx, 'itchy-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    const sink = ctx.createGain();
    sink.gain.value = 0;
    const chunks = [];
    let total = 0;
    const max = MAX_SECONDS * ctx.sampleRate;
    node.port.onmessage = (e) => {
      if (total >= max) return;
      chunks.push(e.data);
      total += e.data.length;
      let peak = 0;
      for (let i = 0; i < e.data.length; i++) peak = Math.max(peak, Math.abs(e.data[i]));
      onLevel?.(Math.min(1, peak * 2), total / max);
      if (total >= max) this.onFull?.();
    };
    src.connect(node).connect(sink).connect(ctx.destination);
    this.session = { src, node, sink, chunks, sampleRate: ctx.sampleRate };
  }

  /** Stop and return a processed clip, or null if nothing was heard. */
  async stop() {
    const s = this.session;
    if (!s) return null;
    this.session = null;
    await new Promise((r) => setTimeout(r, 60)); // collect the last batch
    s.src.disconnect();
    s.node.disconnect();
    s.node.port.onmessage = null;
    const len = s.chunks.reduce((a, c) => a + c.length, 0);
    const data = new Float32Array(len);
    let o = 0;
    for (const c of s.chunks) { data.set(c, o); o += c.length; }
    return processClip(data, s.sampleRate);
  }

  /** Release the microphone (the browser's recording light goes off). */
  close() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

/** Trim silence, normalise, fade. Returns {sampleRate, data, peaks} or null when silent. */
export function processClip(data, sampleRate) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak < 0.01) return null;
  const thr = Math.max(0.01, peak * 0.1);
  let a = 0, b = data.length - 1;
  while (a < data.length && Math.abs(data[a]) < thr) a++;
  while (b > a && Math.abs(data[b]) < thr) b--;
  a = Math.max(0, a - Math.floor(sampleRate * 0.008));
  b = Math.min(data.length, b + Math.floor(sampleRate * 0.12));
  const out = data.slice(a, b);
  const gain = Math.min(20, 0.9 / peak);
  const fin = Math.floor(sampleRate * 0.003), fout = Math.min(out.length, Math.floor(sampleRate * 0.03));
  for (let i = 0; i < out.length; i++) {
    let g = gain;
    if (i < fin) g *= i / fin;
    if (i > out.length - fout) g *= (out.length - i) / fout;
    out[i] *= g;
  }
  return { sampleRate, data: out, peaks: peaksOf(out, 24) };
}

export function peaksOf(data, n) {
  const peaks = [];
  const size = Math.max(1, Math.floor(data.length / n));
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j++) p = Math.max(p, Math.abs(data[j]));
    peaks.push(Math.round(p * 100) / 100);
  }
  return peaks;
}
