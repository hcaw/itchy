// The capability probe decides whether openDAW may boot (src/audio/probe.js) and whether coi-serviceworker may
// reload the page to isolate it (inlined in index.html). The two copies must stay identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { itchyProbe, canUseOpenDaw } from '../src/audio/probe.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const body = (text) => {
  const start = text.indexOf('function itchyProbe() {');
  assert.ok(start >= 0, 'has function itchyProbe()');
  let depth = 0, i = text.indexOf('{', start);
  for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) break; }
  return text.slice(start, i + 1).replace(/\s+/g, ' ');
};

test('index.html inlines exactly the probe in src/audio/probe.js', () => {
  assert.equal(body(read('index.html')), body(read('src/audio/probe.js')));
});

test('the probe needs an AudioWorklet, Promise.withResolvers and WebAssembly SIMD', (t) => {
  assert.equal(typeof Promise.withResolvers, 'function', 'Node 22 has Promise.withResolvers');
  assert.equal(itchyProbe(), false, 'Node has no AudioWorkletNode');
  globalThis.AudioWorkletNode = class {};
  t.after(() => { delete globalThis.AudioWorkletNode; });
  assert.equal(itchyProbe(), true, 'with an AudioWorkletNode, Node passes (it has SIMD)');
  const withResolvers = Promise.withResolvers;
  try { Promise.withResolvers = undefined; assert.equal(itchyProbe(), false); } finally { Promise.withResolvers = withResolvers; }
  const validate = WebAssembly.validate;
  try { WebAssembly.validate = () => false; assert.equal(itchyProbe(), false, 'no SIMD'); } finally { WebAssembly.validate = validate; }
  try { WebAssembly.validate = () => { throw new Error('no'); }; assert.equal(itchyProbe(), false, 'a throw means no'); } finally { WebAssembly.validate = validate; }
});

test('openDAW boots only when capable, isolated and not forced native', (t) => {
  globalThis.AudioWorkletNode = class {};
  t.after(() => { delete globalThis.AudioWorkletNode; });
  assert.equal(canUseOpenDaw({ crossOriginIsolated: true, location: { search: '' } }), true);
  assert.equal(canUseOpenDaw({ crossOriginIsolated: false, location: { search: '' } }), false);
  assert.equal(canUseOpenDaw({ crossOriginIsolated: true, location: { search: '?engine=native' } }), false);
  assert.equal(canUseOpenDaw({ crossOriginIsolated: true, location: { search: '?a=1&engine=native' } }), false);
  assert.equal(canUseOpenDaw({ location: { search: '' } }), false, 'no notion of isolation');
});
