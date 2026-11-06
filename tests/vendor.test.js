// The vendored openDAW build (vendor/opendaw/<version>/, made by `npm run vendor:opendaw`) must match its pins,
// its notices and the code that loads it. These checks need no install and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const pins = JSON.parse(read('scripts/opendaw/package.json')).dependencies;
const lock = JSON.parse(read('scripts/opendaw/package-lock.json'));
const folders = readdirSync(join(root, 'vendor/opendaw'));
const VERSION = folders[0];
const dir = join(root, 'vendor/opendaw', VERSION);
const versions = JSON.parse(readFileSync(join(dir, 'VERSIONS.json'), 'utf8'));
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk(dir).map((f) => relative(dir, f).split(sep).join('/')).sort();

test('exactly one openDAW version is vendored, and it is the pinned SDK', () => {
  assert.deepEqual(folders, [VERSION]);
  assert.equal(versions.sdk, VERSION);
  assert.equal(pins['@opendaw/studio-sdk'], VERSION);
});

test('the lock, the pins and VERSIONS.json agree on every version', () => {
  for (const [name, version] of Object.entries(pins)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is pinned exactly`);
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name} in package-lock.json`);
    if (name.startsWith('@opendaw/')) assert.equal(versions.packages[name]?.version, version, `${name} in VERSIONS.json`);
  }
  assert.equal(versions.esbuild, pins.esbuild);
  assert.deepEqual(Object.keys(versions.packages).sort(), Object.keys(pins).filter((n) => n.startsWith('@opendaw/')).sort());
});

test('every AGPL package records the openDAW commit it was built from, and NOTICE.md names it', () => {
  const notice = readFileSync(join(dir, 'NOTICE.md'), 'utf8');
  for (const [name, p] of Object.entries(versions.packages)) {
    if (p.license === 'MIT') continue; // @opendaw/nam-wasm, published from outside the monorepo
    assert.match(p.license, /AGPL-3\.0/, name);
    assert.match(p.gitHead ?? '', /^[0-9a-f]{40}$/, `${name} has a gitHead`);
    assert.ok(notice.includes(`| \`${name}\` | ${p.version} | ${p.license} | \`${p.gitHead}\` |`), `NOTICE.md lists ${name} at ${p.gitHead}`);
  }
  assert.match(readFileSync(join(dir, 'LICENSE'), 'utf8'), /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/);
  // Where the rest of the Corresponding Source is, and the GPL-3.0 code the engine always loads.
  const { repository } = JSON.parse(read('package.json'));
  assert.ok(notice.includes(repository.url.replace(/^git\+/, '').replace(/\.git$/, '')), 'NOTICE.md links Itchy\'s repository');
  assert.match(notice, /`wasm\/plugins\/device_compressor\.wasm`: .*GPL-3\.0/);
});

test('every vendored file is listed with its sha256, and nothing else is there', () => {
  assert.deepEqual(Object.keys(versions.files).sort(), files.filter((f) => f !== 'VERSIONS.json'));
  for (const [f, hash] of Object.entries(versions.files)) {
    assert.equal(createHash('sha256').update(readFileSync(join(dir, f))).digest('hex'), hash, `${f} matches VERSIONS.json`);
  }
});

test('the engine, its worklet, workers and all 34 device plugins are there', () => {
  for (const f of ['opendaw.js', 'workers-main.js', 'wasm-processor.js', 'wasm-offline-worker.js', 'wasm/engine.wasm', 'LICENSE', 'NOTICE.md']) {
    assert.ok(files.includes(f), `${f} is vendored`);
  }
  assert.equal(files.filter((f) => /^wasm\/plugins\/device_[a-z_]+\.wasm$/.test(f)).length, 34);
  const bytes = files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  assert.ok(bytes < 7e6, `vendored files total ${bytes} bytes`);
});

test('the vendored code names no network hosts beyond the known, unused ones', () => {
  // json-schema.org: zod's schema ids; github and stuk/stuartk: messages and licence links; opendaw.studio: a host
  // name the engine reports to plugins; live.opendaw.studio and localhost: openDAW's live-collaboration rooms,
  // which Itchy never opens. A new host needs a look before it is added here.
  const known = new Set(['json-schema.org', 'github.com', 'raw.github.com', 'stuk.github.io', 'stuartk.com', 'opendaw.studio', 'live.opendaw.studio', 'localhost']);
  for (const f of files.filter((f) => f.endsWith('.js'))) {
    const hosts = new Set([...readFileSync(join(dir, f), 'utf8').matchAll(/(?:https?|wss?):\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]));
    for (const h of hosts) assert.ok(known.has(h), `${f} mentions ${h}`);
  }
});

test('boot.js loads this version, and only src/audio/opendaw/ ever mentions vendor/', () => {
  assert.match(read('src/audio/opendaw/boot.js'), new RegExp(`export const OPENDAW_VERSION = '${VERSION.replace(/\./g, '\\.')}';`));
  const src = walk(join(root, 'src')).map((f) => relative(root, f).split(sep).join('/'));
  for (const f of src.filter((f) => !f.startsWith('src/audio/opendaw/'))) {
    assert.ok(!read(f).includes('vendor/'), `${f} must not mention vendor/`);
  }
  // The app must never load openDAW statically: only `import()` after the capability probe.
  for (const f of src.filter((f) => f.endsWith('.js'))) {
    const statics = [...read(f).matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const s of statics) {
      assert.ok(!/vendor\//.test(s), `${f} imports ${s} statically`);
      if (!f.startsWith('src/audio/opendaw/')) assert.ok(!/(^|\/)opendaw\//.test(s), `${f} imports ${s} statically`);
    }
  }
});

test('Itchy never creates openDAW\'s Compressor (GPL, outside openDAW\'s commercial licence)', () => {
  assert.ok(!/Compressor/.test(read('scripts/opendaw/entry.js')), 'entry.js exports no Compressor');
  for (const f of walk(join(root, 'src')).filter((f) => f.endsWith('.js'))) {
    assert.ok(!/\bCompressor(DeviceBox)?\b/.test(readFileSync(f, 'utf8')), `${relative(root, f)} must not use openDAW's Compressor`);
  }
});

test('index.html sets up the probe and coi-serviceworker before the app module', () => {
  const html = read('index.html');
  const probe = html.indexOf('function itchyProbe()'), coi = html.indexOf('window.coi = {'), sw = html.indexOf('<script src="coi-serviceworker.js"></script>'), app = html.indexOf('<script type="module"');
  assert.ok(probe > 0 && probe < coi && coi < sw && sw < app, 'probe, window.coi, coi-serviceworker.js, then the module');
  const config = html.slice(coi, html.indexOf('};', coi));
  assert.match(config, /quiet: true/);
  assert.match(config, /coepCredentialless: \(\) => false/);
  assert.match(config, /shouldRegister: \(\) => !window\.crossOriginIsolated && itchyProbe\(\) && !\/\[\?&\]engine=native\/\.test\(location\.search\)/);
  assert.match(read('coi-serviceworker.js'), /^\/\*! coi-serviceworker v0\.1\.7/);
});

test('the bundle loads in Node with two stubs, so the box graph can be unit-tested', async (t) => {
  globalThis.AudioWorkletNode ??= class {};
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: () => null, get length() { return store.size; } };
  t.mock.method(console, 'debug', () => {});
  const od = await import(`../vendor/opendaw/${VERSION}/opendaw.js`);
  assert.equal(od.OPENDAW_SDK_VERSION, VERSION);
  const { ItchySamples, noSoundfonts } = await import('../src/audio/opendaw/samples.js');
  const samples = new ItchySamples(od);
  const project = od.Project.new({ audioContext: { sampleRate: 48000, currentTime: 0, state: 'suspended' }, audioWorklets: {}, sampleManager: samples, soundfontManager: noSoundfonts, sampleService: {}, soundfontService: {} });
  const g = project.boxGraph;
  assert.throws(() => { g.beginTransaction(); od.AudioFileBox.create(g, od.UUID.generate(), () => {}); g.endTransaction(); }, /requires an edge/);
  assert.equal(g.inTransaction(), false, 'a failed transaction is rolled back');
  project.terminate();
});
