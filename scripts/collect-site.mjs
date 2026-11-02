// Copy exactly the files Itchy ships into a folder: the GitHub Pages workflow publishes it, and the checks serve
// it to act like Pages. .vercelignore must let the same list through (tests/deploy.test.js checks both).
// Usage: node scripts/collect-site.mjs <folder>
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Every top-level file and folder the deployed site needs. */
export const SHIPPED = ['index.html', 'manifest.webmanifest', 'styles.css', 'src', 'assets', 'vendor', 'coi-serviceworker.js'];

/** Replace `dir` with a fresh copy of the shipped files. */
export function collectSite(dir) {
  const out = resolve(dir);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const entry of SHIPPED) cpSync(join(repo, entry), join(out, entry), { recursive: true });
  writeFileSync(join(out, '.nojekyll'), ''); // serve every file as it is, with no Jekyll processing
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/collect-site.mjs <folder>'); process.exit(1); }
  console.log(`Collected the site into ${collectSite(dir)}`);
}
