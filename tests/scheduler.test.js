// Timing check for the lookahead scheduler, using a fake audio clock and a deliberately
// jittery, late, sometimes-frozen timer. The music must stay on a perfect grid regardless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler, stepDuration, swingOffset } from '../src/audio/scheduler.js';

function rig({ tempo = 120, swing = 0, seed = 1 } = {}) {
  let clock = 0;
  let rnd = seed;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const steps = [];
  const state = { tempo, swing };
  const s = new Scheduler({
    now: () => clock,
    getTempo: () => state.tempo,
    getSwing: () => state.swing,
    onStep: (index, time, dur) => steps.push({ index, time, dur, scheduledAt: clock }),
  });
  // A timer that is meant to fire every 25 ms but is often 0–40 ms late.
  const run = (seconds) => {
    const end = clock + seconds;
    while (clock < end) {
      clock += 0.025 + rand() * 0.04;
      s.tick();
    }
  };
  return { s, steps, run, state, advance: (d) => { clock += d; }, now: () => clock };
}

test('steps are evenly spaced on the audio clock despite a jittery timer', () => {
  const { s, steps, run } = rig({ tempo: 120 });
  s.start();
  run(30);
  const d = stepDuration(120);
  assert.ok(steps.length > 230, `expected ~240 steps, got ${steps.length}`);
  for (let i = 1; i < steps.length; i++) {
    assert.equal(steps[i].index, steps[i - 1].index + 1, 'no step skipped or repeated');
    assert.ok(Math.abs(steps[i].time - steps[i - 1].time - d) < 1e-9, `step ${i} drifted`);
  }
  // Max timing error over 30 s compared to an ideal grid: effectively zero.
  const err = Math.max(...steps.map((x) => Math.abs(x.time - (steps[0].time + x.index * d))));
  assert.ok(err < 1e-6, `drift ${err}`);
});

test('every step is scheduled before it is due (never in the past)', () => {
  const { s, steps, run } = rig({ tempo: 160, seed: 7 });
  s.start();
  run(20);
  for (const x of steps) assert.ok(x.time > x.scheduledAt, `step ${x.index} scheduled late`);
  // and not absurdly early either (lookahead window)
  for (const x of steps) assert.ok(x.time - x.scheduledAt <= 0.12 + 1e-9);
});

test('tempo changes take effect on the next step without a jump', () => {
  const { s, steps, run, state } = rig({ tempo: 100 });
  s.start();
  run(5);
  const n = steps.length;
  state.tempo = 140;
  run(5);
  const d1 = stepDuration(100), d2 = stepDuration(140);
  // gaps before the change are d1; after it they settle on d2; no gap is outside that range
  for (let i = 1; i < steps.length; i++) {
    const g = steps[i].time - steps[i - 1].time;
    assert.ok(Math.abs(g - d1) < 1e-9 || Math.abs(g - d2) < 1e-9, `odd gap ${g}`);
  }
  const last = steps.slice(-10);
  for (let i = 1; i < last.length; i++) assert.ok(Math.abs(last[i].time - last[i - 1].time - d2) < 1e-9);
  assert.ok(steps.length > n);
});

test('swing delays only the off-beat steps and does not accumulate', () => {
  const { s, steps, run } = rig({ tempo: 120, swing: 0.5 });
  s.start();
  run(10);
  const d = stepDuration(120);
  const t0 = steps[0].time;
  for (const x of steps) {
    const ideal = t0 + x.index * d + swingOffset(x.index, d, 0.5);
    assert.ok(Math.abs(x.time - ideal) < 1e-9);
  }
  assert.ok(steps[1].time - steps[0].time > d);
});

test('after a frozen tab the scheduler skips ahead instead of firing a burst', () => {
  const { s, steps, run, advance } = rig({ tempo: 120 });
  s.start();
  run(2);
  const before = steps.length;
  advance(3); // main thread frozen for 3 seconds
  s.tick();
  const burst = steps.slice(before);
  assert.ok(burst.length <= 3, `burst of ${burst.length} steps`);
  // musical position keeps counting, so loops stay in phase
  const d = stepDuration(120);
  for (const x of steps) assert.ok(Math.abs(x.time - (steps[0].time + x.index * d)) < 1e-6);
});

test('stop really stops', () => {
  const { s, steps, run } = rig();
  s.start();
  run(1);
  s.stop();
  const n = steps.length;
  run(1);
  assert.equal(steps.length, n);
});
