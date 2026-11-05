// Lookahead step scheduler ("a tale of two clocks") for the built-in engine (native/engine.js), which plays the song
// wherever openDAW can't run and while it boots. Where openDAW plays the song, its engine sequences the notes on the
// audio thread and this scheduler stays idle (docs/OPENDAW-PORT.md §1c).
//
// A coarse timer (see ticker.js) calls tick() every ~25 ms. Each tick schedules every
// step whose start time falls inside the lookahead window, using times read from the
// *audio* clock. Timer jitter therefore never reaches the music: it only changes how
// early a step is queued, never when it sounds.
//
// The scheduler is pure (no Web Audio dependency) so it can be tested with a fake clock.

export const STEPS_PER_BEAT = 4; // 16th notes

/** Seconds per 16th-note step at a tempo in BPM. */
export function stepDuration(bpm) {
  return 60 / bpm / STEPS_PER_BEAT;
}

/** Offset for swung (odd) steps. swing 0 = straight, 1 = heavy shuffle (triplet feel ≈ 0.66). */
export function swingOffset(index, stepDur, swing) {
  return index % 2 === 1 ? Math.max(0, Math.min(1, swing)) * stepDur * 0.5 : 0;
}

export class Scheduler {
  /**
   * @param {object} o
   * @param {() => number} o.now              current audio-clock time in seconds
   * @param {(index:number, time:number, dur:number) => void} o.onStep  called once per step, in order
   * @param {() => number} o.getTempo         BPM, read every step so tempo changes are instant and drift-free
   * @param {() => number} [o.getSwing]       0..1
   * @param {number} [o.lookahead]            seconds scheduled ahead of now
   * @param {number} [o.startDelay]           gap before the first step after start()
   * @param {number} [o.maxLate]              if we fall this far behind (frozen tab), skip ahead instead of bursting
   */
  constructor({ now, onStep, getTempo, getSwing = () => 0, lookahead = 0.12, startDelay = 0.05, maxLate = 0.25 }) {
    Object.assign(this, { now, onStep, getTempo, getSwing, lookahead, startDelay, maxLate });
    this.running = false;
    this.index = 0;        // next step to schedule (counts forever; layers take it modulo their length)
    this.nextTime = 0;     // grid time of the next step (unswung)
    this.startTime = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.index = 0;
    this.startTime = this.nextTime = this.now() + this.startDelay;
    this.tick();
  }

  stop() {
    this.running = false;
  }

  tick() {
    if (!this.running) return;
    const now = this.now();
    // Frozen tab / suspended context: don't fire a burst of stale steps. Keep the musical
    // position moving by skipping whole steps until we're back in the window.
    while (this.nextTime < now - this.maxLate) {
      this.nextTime += stepDuration(this.getTempo());
      this.index++;
    }
    const horizon = now + this.lookahead;
    while (this.nextTime < horizon) {
      const dur = stepDuration(this.getTempo());
      const time = this.nextTime + swingOffset(this.index, dur, this.getSwing());
      this.onStep(this.index, time, dur);
      this.nextTime += dur;
      this.index++;
    }
  }
}
