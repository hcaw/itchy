// A test-only HTTP/2 server shaped like the places Itchy is deployed, for the budget checks in check.mjs.
//
// GitHub Pages and Vercel serve over HTTP/2, gzip text files (not .wasm) and let a browser cache files; npm start
// (scripts/serve.js) serves HTTP/1.1, uncompressed and uncached. On a throttled network that difference decides the
// result: over HTTP/1.1 a browser opens six connections and waits a round trip per file, so even Itchy before the
// port took 4.7 s to render on Fast 3G. This server sends what a deployed page gets: HTTP/2 over TLS, gzip for
// text, `Cache-Control: max-age=600` (as Pages does) and the isolation headers (as Vercel does), and it counts the
// bytes it serves.
//
// Browsers need TLS for HTTP/2, so it makes a throwaway self-signed certificate with the openssl command (present
// on CI's Ubuntu and most Linux and macOS machines) and gives the browser the key's hash to trust
// (--ignore-certificate-errors-spki-list), so caching works as with a real certificate. Without openssl,
// startH2Server() resolves null.
import http2 from 'node:http2';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ISOLATION_HEADERS, TYPES } from '../../scripts/serve.js';

const GZIP = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.md', '.txt']);

/** A throwaway certificate for localhost, and the base64 SHA-256 of its public key (for Chromium to trust). */
function certificate() {
  const dir = mkdtempSync(join(tmpdir(), 'itchy-cert-'));
  try {
    const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem'), pub = join(dir, 'pub.der');
    const ssl = (...args) => execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    ssl('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert,
      '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost');
    ssl('pkey', '-in', key, '-pubout', '-outform', 'der', '-out', pub);
    const spki = ssl('dgst', '-sha256', '-binary', pub).toString('base64');
    return { key: readFileSync(key), cert: readFileSync(cert), spki };
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Serve `root` on https://localhost:<port>/. Resolves { url, spki, served, close } or null without openssl.
 * `served` lists every response: { path, bytes (the file's size), sent (after gzip) }; empty it between runs.
 */
export async function startH2Server(port, { root }) {
  const tls = certificate();
  if (!tls) return null;
  const base = resolve(root);
  const served = [];
  const cache = new Map(); // path → { raw, gz }
  const server = http2.createSecureServer({ key: tls.key, cert: tls.cert, allowHTTP1: true }, (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'https://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(base, path));
      if (file !== base && !file.startsWith(base + sep)) throw new Error('outside');
      if (!statSync(file).isFile()) throw new Error('not a file');
      if (!cache.has(file)) {
        const raw = readFileSync(file);
        cache.set(file, { raw, gz: GZIP.has(extname(file)) ? gzipSync(raw) : null });
      }
      const { raw, gz } = cache.get(file);
      const zip = gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      const body = zip ? gz : raw;
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] || 'application/octet-stream',
        'cache-control': 'max-age=600',
        ...(zip ? { 'content-encoding': 'gzip' } : {}),
        ...Object.fromEntries(Object.entries(ISOLATION_HEADERS).map(([k, v]) => [k.toLowerCase(), v])),
      });
      res.end(body);
      served.push({ path, bytes: raw.length, sent: body.length });
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  });
  await new Promise((ok) => server.listen(port, ok));
  return { url: `https://localhost:${port}/`, spki: tls.spki, served, close: () => server.close() };
}
