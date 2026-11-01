import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surpriseNotes } from '../src/model/surprise.js';
import { createLayer, migrate } from '../src/model/project.js';
import { rowsForSound } from '../src/model/sounds.js';
import { processClip } from '../src/audio/recorder.js';
import { EXAMPLES } from '../src/model/examples.js';

test('dice patterns always fit the grid, for every sound and loop length', () => {
  for (const sound of ['kit', 'tinykit', 'bells', 'pluck', 'bass', 'cloud', 'rec:x']) {
    for (const steps of [4, 10, 12, 16, 32]) {
      for (let i = 0; i < 50; i++) {
        const layer = createLayer(sound, { steps });
        const notes = surpriseNotes(layer);
        assert.ok(notes.length > 0, `${sound} made nothing`);
        const seen = new Set();
        for (const n of notes) {
          assert.ok(n.s >= 0 && n.s < steps && n.r >= 0 && n.r < rowsForSound(sound), `${sound} out of range`);
          assert.ok(!seen.has(`${n.s},${n.r}`), 'no duplicate notes');
          seen.add(`${n.s},${n.r}`);
        }
      }
    }
  }
});

test('recorded clips are trimmed, normalised, and silence is rejected', () => {
  const sr = 8000;
  const data = new Float32Array(sr);
  for (let i = 3000; i < 4000; i++) data[i] = 0.2 * Math.sin(i / 5);
  const clip = processClip(data, sr);
  assert.ok(clip.data.length < 2500, 'leading/trailing silence trimmed');
  const peak = Math.max(...clip.data.map(Math.abs));
  assert.ok(peak > 0.8 && peak <= 0.91, `normalised peak ${peak}`);
  assert.equal(clip.peaks.length, 24);
  assert.equal(processClip(new Float32Array(sr), sr), null);
});

test('example songs are valid projects', () => {
  for (const ex of EXAMPLES) {
    const p = migrate(ex);
    assert.equal(p.layers.length, ex.layers.length);
    for (let i = 0; i < p.layers.length; i++) assert.equal(p.layers[i].notes.length, ex.layers[i].notes.length, `${ex.name} layer ${i} lost notes`);
  }
});
