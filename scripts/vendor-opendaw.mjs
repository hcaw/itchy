// Rebuild vendor/opendaw/<sdk version>/ from the exact pins in scripts/opendaw/. Dev-only, run by hand when
// upgrading openDAW: npm run vendor:opendaw
//
// The published openDAW packages can't be loaded by a browser as they are (their relative imports have no file
// extensions), so this bundles the few symbols Itchy uses (scripts/opendaw/entry.js) into one ES module with a
// pinned esbuild, and copies the prebuilt worker, worklet and WebAssembly files next to it. The packages are
// installed in a temporary folder: Itchy itself never gets a node_modules. The output is committed, so the app
// keeps no build step. Running this twice gives byte-identical files.
//
// It also writes VERSIONS.json (versions, the openDAW commit each package was built from, sha256 of every file)
// and NOTICE.md (the licence notice and where the Corresponding Source is), and copies openDAW's LICENSE.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pins = join(repo, 'scripts', 'opendaw');
const pkg = JSON.parse(readFileSync(join(pins, 'package.json'), 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// 1. Install the pinned packages in a fresh temporary folder.
const work = mkdtempSync(join(tmpdir(), 'itchy-opendaw-'));
try {
  for (const f of ['package.json', 'package-lock.json', 'entry.js']) copyFileSync(join(pins, f), join(work, f));
  console.log(`Installing the pinned packages in ${work} …`);
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: work, stdio: 'inherit' });
  const mod = (name) => join(work, 'node_modules', ...name.split('/'));
  const manifest = (name) => JSON.parse(readFileSync(join(mod(name), 'package.json'), 'utf8'));

  // Every installed package must be exactly the pinned version (the lock could drift from package.json).
  for (const [name, want] of Object.entries(pkg.dependencies)) {
    const got = manifest(name).version;
    if (got !== want) throw new Error(`${name}: installed ${got}, pinned ${want}. Regenerate package-lock.json.`);
  }
  const sdkVersion = manifest('@opendaw/studio-sdk').version;
  const vendorRoot = join(repo, 'vendor', 'opendaw');
  const out = join(vendorRoot, sdkVersion);

  // 2. Bundle the entry with the pinned esbuild.
  const esbuild = await import(pathToFileURL(join(mod('esbuild'), 'lib', 'main.js')).href);
  const result = await esbuild.build({
    absWorkingDir: work,
    entryPoints: ['entry.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'eof',
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    write: false,
    metafile: true,
    logLevel: 'warning',
  });
  if (result.errors.length) throw new Error('esbuild failed');

  // 3. Replace every vendored version with this one.
  rmSync(vendorRoot, { recursive: true, force: true });
  mkdirSync(join(out, 'wasm', 'plugins'), { recursive: true });
  writeFileSync(join(out, 'opendaw.js'), result.outputFiles[0].contents);
  const core = join(mod('@opendaw/studio-core'), 'dist');
  const wasmPkg = join(mod('@opendaw/studio-core-wasm'), 'dist');
  copyFileSync(join(core, 'workers-main.js'), join(out, 'workers-main.js'));
  copyFileSync(join(wasmPkg, 'wasm-processor.js'), join(out, 'wasm-processor.js'));
  copyFileSync(join(wasmPkg, 'wasm-offline-worker.js'), join(out, 'wasm-offline-worker.js'));
  copyFileSync(join(wasmPkg, 'wasm', 'engine.wasm'), join(out, 'wasm', 'engine.wasm'));
  cpSync(join(wasmPkg, 'wasm', 'plugins'), join(out, 'wasm', 'plugins'), { recursive: true });
  copyFileSync(join(mod('@opendaw/studio-sdk'), 'LICENSE'), join(out, 'LICENSE'));

  // 4. Versions, source commits and hashes.
  const opendaw = Object.keys(pkg.dependencies).filter((n) => n.startsWith('@opendaw/')).sort();
  const packages = Object.fromEntries(opendaw.map((name) => {
    const m = manifest(name);
    return [name, { version: m.version, license: m.license, gitHead: m.gitHead ?? null }];
  }));
  const repoUrl = (manifest('@opendaw/studio-sdk').repository?.url || 'https://github.com/andremichelle/opendaw').replace(/^git\+/, '').replace(/\.git$/, '');
  // The packages whose code ended up in the bundle (from esbuild's metafile), with their licences.
  const bundled = Object.fromEntries([...new Set(Object.keys(result.metafile.inputs)
    .map((p) => p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]).filter(Boolean))].sort()
    .map((name) => { const m = manifest(name); return [name, `${m.version} ${m.license}`]; }));
  const commits = [...new Set(Object.values(packages).map((p) => p.gitHead).filter(Boolean))].sort();
  writeFileSync(join(out, 'NOTICE.md'), notice({ sdkVersion, packages, bundled, repoUrl, commits, esbuildVersion: manifest('esbuild').version }));
  const files = {};
  for (const f of walk(out)) files[f] = sha256(readFileSync(join(out, f)));
  const versions = {
    sdk: sdkVersion,
    repository: repoUrl,
    esbuild: manifest('esbuild').version,
    packages,
    bundled,
    files,
  };
  writeFileSync(join(out, 'VERSIONS.json'), JSON.stringify(versions, null, 2) + '\n');
  const bytes = Object.keys(files).reduce((n, f) => n + statSync(join(out, f)).size, 0);
  console.log(`Wrote ${relative(repo, out)}/ (${Object.keys(files).length + 1} files, ${(bytes / 1e6).toFixed(2)} MB).`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

/** Every file under dir, as sorted forward-slash paths relative to it. */
function walk(dir, base = dir) {
  const list = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) list.push(...walk(p, base));
    else list.push(relative(base, p).split(sep).join('/'));
  }
  return list.sort();
}

function notice({ sdkVersion, packages, bundled, repoUrl, commits, esbuildVersion }) {
  const others = Object.entries(bundled).filter(([n]) => !n.startsWith('@opendaw/')).map(([n, v]) => { const [ver, ...lic] = v.split(' '); return `\`${n}\` ${ver} (${lic.join(' ').replace(/^\((.*)\)$/, '$1')})`; });
  const rows = Object.entries(packages).map(([n, p]) => `| \`${n}\` | ${p.version} | ${p.license} | ${p.gitHead ? `\`${p.gitHead}\`` : 'none published'} |`);
  return `# openDAW in Itchy: notices

This folder is generated by \`scripts/vendor-opendaw.mjs\`. Never edit it by hand.

It contains object code from **openDAW** (${repoUrl}), Copyright © 2025 André Michelle,
licensed under the **GNU Affero General Public License v3.0 or later** (see \`LICENSE\` in this folder).
Itchy's own source code is MIT-licensed (the repository's \`LICENSE\`), but a deployment of Itchy that includes
this folder is a combined work that is distributed under the terms of the AGPL-3.0.

## What is here

- \`opendaw.js\`: an esbuild ${esbuildVersion} bundle (minified) of \`scripts/opendaw/entry.js\`, which re-exports
  the symbols Itchy uses from the packages below.
- \`workers-main.js\` (from \`@opendaw/studio-core\`), \`wasm-processor.js\`, \`wasm-offline-worker.js\` and
  \`wasm/\` (from \`@opendaw/studio-core-wasm\`), copied unchanged from the published packages. Their
  \`sourceMappingURL\` comments point at source maps that are not vendored; the maps are in the npm packages.
- \`VERSIONS.json\`: exact versions, source commits and the sha256 of every file.

## Corresponding Source

The source for this object code is:

1. The openDAW repository, ${repoUrl}, at the commit each package was published from (its \`gitHead\`):

| Package | Version | Licence | openDAW commit |
|---|---|---|---|
${rows.join('\n')}

   That is, commit${commits.length === 1 ? '' : 's'} ${commits.map((c) => `\`${c}\``).join(' and ')}.

2. The build: \`scripts/opendaw/package.json\` and \`package-lock.json\` (the exact packages installed),
   \`scripts/opendaw/entry.js\` (what is bundled) and \`scripts/vendor-opendaw.mjs\` (how), all in Itchy's public
   repository. To rebuild this folder byte for byte: \`npm run vendor:opendaw\` with Node 18 or later.

\`opendaw.js\` also contains these third-party packages, under their own licences: ${others.join(', ')}.
jszip is dual-licensed and is used here under MIT. Licence comments from bundled code are kept at the end of
\`opendaw.js\`. \`@opendaw/nam-wasm\` is MIT.

openDAW SDK version: ${sdkVersion}.
`;
}
