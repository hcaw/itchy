// The README's pictures and the page's icons are rendered by `npm run screenshots`.
// These checks catch a picture that is referenced but missing, or rendered but never shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('every picture the README shows exists', () => {
  const readme = read('README.md');
  const refs = [...readme.matchAll(/(?:src|srcset)="([^"]+)"|!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1] || m[2]);
  assert.ok(refs.length > 0, 'the README shows some pictures');
  for (const ref of refs.filter((r) => !/^https?:/.test(r))) assert.ok(existsSync(new URL(ref, root)), `${ref} is missing: run npm run screenshots`);
});

test('every picture in docs/images is shown in the README', () => {
  const readme = read('README.md');
  for (const file of readdirSync(new URL('docs/images/', root))) {
    assert.ok(readme.includes(`docs/images/${file}`), `docs/images/${file} isn't used in the README`);
  }
});

test('every icon and image the page and manifest point at exists', () => {
  const html = read('index.html');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const refs = [
    ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<meta[^>]+content="https:\/\/hcaw\.github\.io\/itchy\/([^"]+)"/g)].map((m) => m[1]),
    ...manifest.icons.map((i) => i.src),
  ];
  for (const ref of refs) assert.ok(existsSync(new URL(ref, root)), `${ref} is missing`);
});
