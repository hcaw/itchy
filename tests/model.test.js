import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, migrate, setNote, noteAt, notesAtStep, createLayer, recordingsUsed } from '../src/model/project.js';
import { History } from '../src/model/history.js';
import { MemoryStorage } from '../src/storage/storage.js';
import { rowSemitones } from '../src/model/scales.js';

test('a new project is valid JSON and survives a round trip unchanged', () => {
  const p = createProject();
  const back = migrate(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(back, p);
  assert.ok(p.layers.length >= 2);
  assert.ok(p.layers[0].notes.length > 0, 'starter beat so play is never silent');
});

test('migrate repairs garbage instead of throwing', () => {
  for (const junk of [null, 42, 'x', {}, { layers: 'no' }, { tempo: 9999, mood: 'angry', layers: [{ notes: [{ s: 99, r: -3 }, null, { s: 1, r: 1 }] }] }]) {
    const p = migrate(junk);
    assert.ok(p.tempo >= 60 && p.tempo <= 160);
    assert.ok(p.layers.length > 0);
    for (const l of p.layers) for (const n of l.notes) assert.ok(n.s >= 0 && n.s < l.steps && n.r >= 0);
  }
  const p = migrate({ tempo: 9999, layers: [{ sound: 'bells', notes: [{ s: 1, r: 1 }, { s: 1, r: 1 }] }] });
  assert.equal(p.tempo, 160);
  assert.equal(p.layers[0].notes.length, 1, 'duplicates removed');
});

test('notes toggle on and off', () => {
  const l = createLayer('bells');
  setNote(l, 3, 2, true);
  setNote(l, 3, 2, true);
  assert.equal(l.notes.length, 1);
  assert.ok(noteAt(l, 3, 2));
  assert.equal(notesAtStep(l, 3).length, 1);
  setNote(l, 3, 2, false);
  assert.equal(l.notes.length, 0);
});

test('recordings are referenced by id', () => {
  const p = createProject();
  p.layers.push(createLayer('rec:abc'), createLayer('rec:abc'));
  assert.deepEqual(recordingsUsed(p), ['abc']);
  assert.equal(migrate(p).layers[2].sound, 'rec:abc');
});

test('scales climb upward through octaves', () => {
  let last = -1;
  for (let r = 0; r < 12; r++) { const s = rowSemitones(r, 'happy'); assert.ok(s > last); last = s; }
  assert.equal(rowSemitones(5, 'happy'), 12);
});

test('undo/redo restores snapshots; a gesture counts once', () => {
  const h = new History();
  h.record('a', 'paint'); h.record('b', 'paint'); h.record('c', 'paint');
  h.seal();
  h.record('d');
  assert.equal(h.undo('e'), 'd');
  assert.equal(h.undo('d'), 'a');
  assert.equal(h.undo('a'), null);
  assert.equal(h.redo('a'), 'd');
  assert.equal(h.redo('d'), 'e');
  assert.ok(!h.canRedo);
});

test('memory storage keeps projects and recordings, and survives a corrupt localStorage', async () => {
  const fake = { data: { 'itchy.projects': '{not json' }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
  const s = new MemoryStorage(fake);
  const p = createProject();
  await s.saveProject(p);
  await s.setCurrentId(p.id);
  const s2 = new MemoryStorage(fake);
  assert.equal(await s2.getCurrentId(), p.id);
  assert.deepEqual(await s2.loadProject(p.id), p);
  assert.equal((await s2.listProjects()).length, 1);
  await s.saveRecording('r1', { sampleRate: 8000, data: new Float32Array(4) });
  assert.equal((await s.loadRecording('r1')).sampleRate, 8000);
});
