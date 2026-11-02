// Tiny zero-dependency static file server for Itchy.
// Usage: npm start  (or: node scripts/serve.js [port])
//
// It sends the cross-origin isolation headers (COOP and COEP) that openDAW's engine needs for SharedArrayBuffer,
// as vercel.json does. The checks can turn them off ({ isolate: false }) to act like GitHub Pages, which can't
// send headers, and can serve another folder ({ root }), such as the site collected by scripts/collect-site.mjs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 5173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.map': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
/** The headers that make a page cross-origin isolated (the same pair is in vercel.json). */
export const ISOLATION_HEADERS = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export function startServer(p = port, { isolate = true, root = repo } = {}) {
  const base = resolve(root);
  const extra = isolate ? ISOLATION_HEADERS : {};
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(base, path));
      if ((file !== base && !file.startsWith(base + sep)) || file.startsWith(join(base, '.git'))) { res.writeHead(403).end(); return; }
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...extra });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...extra }).end('Not found');
    }
  });
  return new Promise((ok) => server.listen(p, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(() => console.log(`Itchy is running at http://localhost:${port}/`));
}
