// Every place Itchy is served must ship the same files and, where it can, the cross-origin isolation headers
// openDAW's engine needs: npm start (scripts/serve.js), Vercel previews (vercel.json, .vercelignore) and GitHub
// Pages (scripts/collect-site.mjs in pages.yml; Pages gets isolation from coi-serviceworker.js instead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHIPPED, collectSite } from '../scripts/collect-site.mjs';
import { startServer, ISOLATION_HEADERS } from '../scripts/serve.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('.vercelignore lets every shipped file through', () => {
  const allowed = read('.vercelignore').split('\n').filter((l) => l.startsWith('!')).map((l) => l.slice(1));
  for (const entry of SHIPPED) assert.ok(allowed.includes(entry), `.vercelignore whitelists ${entry}`);
  for (const entry of allowed.filter((e) => e !== 'vercel.json')) assert.ok(SHIPPED.includes(entry), `${entry} is in SHIPPED`);
});

test('the Pages workflow collects the site with scripts/collect-site.mjs', () => {
  const yml = read('.github/workflows/pages.yml');
  assert.match(yml, /run: node scripts\/collect-site\.mjs _site/);
  assert.doesNotMatch(yml, /cp -r/);
});

test('vercel.json sends the same isolation headers as npm start', () => {
  const rules = JSON.parse(read('vercel.json')).headers;
  const all = rules.find((r) => r.source === '/(.*)');
  assert.ok(all, 'a rule for every path');
  assert.deepEqual(Object.fromEntries(all.headers.map((h) => [h.key, h.value])), ISOLATION_HEADERS);
});

test('collect-site copies exactly the shipped files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'itchy-site-'));
  try {
    collectSite(dir);
    assert.deepEqual(readdirSync(dir).sort(), [...SHIPPED, '.nojekyll'].sort());
    for (const f of ['index.html', 'coi-serviceworker.js', 'src/main.js', 'vendor/opendaw']) assert.ok(existsSync(join(dir, f)), f);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('serve.js isolates by default, can serve like Pages, and types .wasm', async () => {
  for (const isolate of [true, false]) {
    const server = await startServer(0, { isolate });
    try {
      const base = `http://localhost:${server.address().port}`;
      const page = await fetch(`${base}/`);
      assert.equal(page.status, 200);
      assert.equal(page.headers.get('cross-origin-opener-policy'), isolate ? 'same-origin' : null);
      assert.equal(page.headers.get('cross-origin-embedder-policy'), isolate ? 'require-corp' : null);
      const versions = readdirSync(new URL('../vendor/opendaw/', import.meta.url));
      const wasm = await fetch(`${base}/vendor/opendaw/${versions[0]}/wasm/engine.wasm`);
      assert.equal(wasm.headers.get('content-type'), 'application/wasm');
      await wasm.arrayBuffer();
      assert.equal((await fetch(`${base}/.git/config`)).status, 403);
    } finally { server.close(); }
  }
});
