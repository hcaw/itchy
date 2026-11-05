// The playhead tracker (src/audio/playhead.js): from openDAW's transport position, once per animation frame, which
// steps have just been heard, and the same visual events the built-in engine queues.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepTracker, stepPosition, stepEvent } from '../src/audio/playhead.js';
import { pulsesPerSecond } from '../src/audio/mirror.js';
import { migrate } from '../src/model/project.js';

/** Frames of a playing transport: the position every `frame` seconds from 0 for `seconds`. */
function play(tracker, { tempo = 100, seconds = 2, frame = 1 / 60, latency = 0, swing = 0, from = 0 } = {}) {
  const out = [];
  for (let t = 0; t <= seconds + 1e-9; t += frame) {
    const position = from + t * pulsesPerSecond(tempo);
    for (const s of tracker.advance(position, { tempo, latency, swing })) out.push({ ...s, t, position });
  }
  return out;
}

test('steps arrive once each, in order, from step 0', () => {
  const steps = play(new StepTracker(), { tempo: 100, seconds: 3 });
  assert.equal(steps[0].index, 0);
  assert.ok(steps.length >= 19, `${steps.length} steps in 3 s at 100 BPM`);
  steps.forEach((s, k) => assert.equal(s.index, k));
});

test('several steps in one frame come out in order; a big jump (a hidden tab) shows only the latest', () => {
  const tr = new StepTracker();
  assert.deepEqual(tr.advance(0, { tempo: 120 }).map((s) => s.index), [0]);
  assert.deepEqual(tr.advance(3 * 240, { tempo: 120 }).map((s) => s.index), [1, 2, 3]);
  assert.deepEqual(tr.advance(11 * 240, { tempo: 120 }).map((s) => s.index), [4, 5, 6, 7, 8, 9, 10, 11], 'eight at once is still a burst');
  assert.deepEqual(tr.advance(40 * 240 + 10, { tempo: 120 }).map((s) => s.index), [40], 'more than eight: only the latest');
  assert.deepEqual(tr.advance(41 * 240, { tempo: 120 }).map((s) => s.index), [41]);
});

test('a step shows only once its sound reaches the speakers (output latency)', () => {
  const tempo = 100, latency = 0.1, lag = latency * pulsesPerSecond(tempo); // 160 pulses
  const tr = new StepTracker();
  assert.deepEqual(tr.advance(lag - 1, { tempo, latency }), []);
  const [first] = tr.advance(lag, { tempo, latency });
  assert.equal(first.index, 0);
  assert.ok(Math.abs(first.ago - latency) < 1e-12, '`ago` counts from when the engine played it');
  assert.deepEqual(tr.advance(240 + lag - 1, { tempo, latency }), []);
  assert.deepEqual(tr.advance(240 + lag, { tempo, latency }).map((s) => s.index), [1]);
});

test('swung odd steps show half a step × swing later; even steps stay on the grid', () => {
  assert.equal(stepPosition(2, 1), 480);
  assert.equal(stepPosition(1, 0), 240);
  assert.equal(stepPosition(1, 0.5), 300);
  assert.equal(stepPosition(3, 1), 3 * 240 + 120);
  const tr = new StepTracker();
  tr.advance(0, { tempo: 100, swing: 1 });
  assert.deepEqual(tr.advance(359, { tempo: 100, swing: 1 }), [], 'not yet: step 1 is swung to 360');
  assert.deepEqual(tr.advance(360, { tempo: 100, swing: 1 }).map((s) => s.index), [1]);
  assert.deepEqual(tr.advance(480, { tempo: 100, swing: 1 }).map((s) => s.index), [2]);
});

test('the transport going back (a restart) and reset() (a stop) start again from step 0', () => {
  const tr = new StepTracker();
  play(tr, { tempo: 100, seconds: 2 });
  assert.ok(tr.next > 10);
  const latency = 0.05;
  assert.deepEqual(tr.advance(0, { tempo: 100, latency }), [], 'back to 0, but step 0 isn’t heard yet');
  assert.deepEqual(tr.advance(80, { tempo: 100, latency }).map((s) => s.index), [0]);
  // Going back to the middle of the song carries on from the step playing there.
  assert.deepEqual(tr.advance(2 * 240 + 50 + 80, { tempo: 100, latency }).map((s) => s.index), [1, 2]);
  assert.deepEqual(tr.advance(240 + 100 + 80, { tempo: 100, latency }).map((s) => s.index), [1]);
  tr.reset();
  assert.deepEqual(tr.advance(5000, { tempo: 100 }).map((s) => s.index), [20], 'after a stop, a late first frame is a jump');
  tr.reset();
  assert.deepEqual(tr.advance(0, { tempo: 100 }).map((s) => s.index), [0]);
});

test('step events: each critter wraps at its own length; asleep critters move but have no hits', () => {
  const p = migrate({
    layers: [
      { id: 'a', sound: 'kit', steps: 16, notes: [{ s: 0, r: 0 }, { s: 0, r: 3 }, { s: 4, r: 1 }] },
      { id: 'b', sound: 'bells', steps: 12, notes: [{ s: 0, r: 2 }, { s: 8, r: 5 }] },
      { id: 'c', sound: 'pluck', steps: 10, muted: true, notes: [{ s: 0, r: 1 }] },
    ],
  });
  const ev = (i) => stepEvent(p, i, 1.5, 0.15);
  assert.deepEqual(ev(0), { time: 1.5, index: 0, dur: 0.15, steps: { a: 0, b: 0, c: 0 }, hits: { a: [0, 3], b: [2] } });
  assert.deepEqual(ev(20).steps, { a: 4, b: 8, c: 0 });
  assert.deepEqual(ev(20).hits, { a: [1], b: [5] }, 'c is asleep');
  assert.deepEqual(ev(60).steps, { a: 12, b: 0, c: 0 });
  for (let i = 0; i < 240; i++) {
    const { steps } = ev(i);
    assert.deepEqual(steps, { a: i % 16, b: i % 12, c: i % 10 });
  }
});
