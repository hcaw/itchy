// The visual playhead when openDAW plays the song (docs/OPENDAW-PORT.md §7). openDAW sequences the notes on the audio
// thread, so nothing on the main thread knows when a step plays; instead, every animation frame the facade reads
// openDAW's transport position and this tracker says which steps have just been heard. The facade turns each one
// into the same event the built-in engine's scheduler makes (stepEvent), so the app draws them as before.
//
// Pure: no openDAW, no Web Audio, no DOM (tests/playhead.test.js).

import { STEP_PULSES, pulsesPerSecond } from './mirror.js';
import { notesAtStep } from '../model/project.js';

/** Where step `index` sounds, in pulses: odd steps are swung later by half a step × swing (as the groove does). */
export function stepPosition(index, swing = 0) {
  return index * STEP_PULSES + (index % 2 === 1 ? (STEP_PULSES / 2) * Math.min(1, Math.max(0, swing)) : 0);
}

/**
 * The visual event for a step, the same shape the built-in engine queues:
 * { time, index, dur, steps: { layerId: step in its own loop }, hits: { layerId: rows } }. Asleep critters get a
 * step (their playhead still moves) but no hits.
 */
export function stepEvent(project, index, time, dur) {
  const ev = { time, index, dur, steps: {}, hits: {} };
  for (const layer of project.layers) {
    const step = index % layer.steps;
    ev.steps[layer.id] = step;
    if (layer.muted) continue;
    const notes = notesAtStep(layer, step);
    if (notes.length) ev.hits[layer.id] = notes.map((n) => n.r);
  }
  return ev;
}

export class StepTracker {
  /** @param {object} [o] @param {number} [o.maxBurst] more steps than this at once (a hidden tab) shows only the latest */
  constructor({ maxBurst = 8 } = {}) {
    this.maxBurst = maxBurst;
    this.reset();
  }

  /** Forget everything: the next step due is 0. Call on play and on stop. */
  reset() {
    this.next = 0;          // the next step index to report
    this.heard = -Infinity; // the last position heard
  }

  /**
   * The steps that have become audible since the last call, in order, as { index, ago }: `ago` is how many
   * seconds ago the step's sound left the engine (so its audio-clock time is now − ago).
   * @param {number} position  the transport position in pulses (openDAW's engine.position)
   * @param {object} o
   * @param {number} o.tempo   BPM
   * @param {number} [o.latency]  seconds between the engine and the speakers
   * @param {number} [o.swing]  0..1
   */
  advance(position, { tempo, latency = 0, swing = 0 }) {
    const pps = pulsesPerSecond(tempo);
    const heard = position - latency * pps;
    if (heard < this.heard) {
      // The transport went back (a restart from 0): carry on from the first step not yet heard there.
      this.next = 0;
      while (stepPosition(this.next, swing) < heard && stepPosition(this.next + 1, swing) <= heard) this.next++;
    }
    this.heard = heard;
    const due = [];
    while (stepPosition(this.next, swing) <= heard) {
      due.push(this.next);
      this.next++;
    }
    const shown = due.length > this.maxBurst ? due.slice(-1) : due;
    return shown.map((index) => ({ index, ago: (position - stepPosition(index, swing)) / pps }));
  }
}
