// Renders the pictures the repository shows off, straight from the running app, so they
// always match how Itchy really looks. Run it whenever the look of the app changes:
//
//   npm run screenshots
//
// Writes:
//   docs/images/logo-light.png, logo-dark.png   the README logo (the brand critter and wordmark)
//   docs/images/*.png                           the README screenshots (listed in SHOTS below)
//   assets/icon.svg                             the favicon (the brand critter, colours baked in)
//   assets/icon-180.png, icon-512.png           home-screen icons
//   assets/social-card.png                      the link preview (Open Graph) image
//
// It uses the pre-installed Playwright, like `npm run check`. Motion is reduced so eyes, blinks
// and sparks hold still, and the audio clock is paused at a fixed step so the playhead always
// lands on the same column.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IMAGES = `${ROOT}docs/images/`;
const ASSETS = `${ROOT}assets/`;
const PORT = 5178;
const URL_ = `http://localhost:${PORT}/`;

// Brand colours, from the design tokens at the top of styles.css.
const BG = '#fff8ee';
const INK = '#261f3d';
const BRAND_RED = '#ff6b6b'; // COLORS[0] in src/model/sounds.js: the colour the brand critter starts in
// The top bar's .wordmark look, written out because narrow screens hide the .wordmark class.
const WORDMARK = 'font-weight:900;letter-spacing:-0.02em;line-height:1';

/**
 * The README screenshots. Each opens a fresh browser (so first-run state is the same every time),
 * optionally loads an example song, then sets the scene.
 * name: file in docs/images/ · example: index into the songbook's examples (or null for a new song)
 * critter: which critter in the rail to show on the grid (0 is the top one)
 * play: pause the music with the playhead on this step (or null to leave it stopped)
 */
const SHOTS = [
  { name: 'screenshot-laptop', width: 1280, height: 800, example: 0, critter: 0, play: 6 },
  { name: 'screenshot-tablet', width: 820, height: 1180, touch: true, example: 1, play: 4 },
  { name: 'screenshot-songbook', width: 1280, height: 800, example: null, songbook: true },
  { name: 'screenshot-phone', width: 844, height: 390, touch: true, example: 2, play: null },
];

const server = await startServer(PORT);
let browser;
try {
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  mkdirSync(IMAGES, { recursive: true });
  await logos();
  await icons();
  for (const shot of SHOTS) await screenshot(shot);
  await socialCard();
} finally {
  await browser?.close();
  server.close();
}

function report(path) {
  console.log(`  ${path.replace(ROOT, '')} (${Math.round(statSync(path).size / 1024)} KB)`);
}

/** A page with the app's styles and font, but no app: for drawing the brand on its own. */
async function brandPage({ width = 900, height = 300, scale = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${URL_}__blank`); // any page on the server, so the app's modules are same-origin
  // The room's glow (body::before/::after) is part of the app, not the brand: keep it out so the logo stays transparent.
  await page.setContent(`<!doctype html><html><head><base href="${URL_}"><link rel="stylesheet" href="styles.css">
    <style>html, body { background: transparent !important; } body::before, body::after { display: none !important; }</style></head>
    <body style="overflow:visible"></body></html>`);
  await page.evaluate(() => document.fonts.load('900 40px Nunito'));
  await page.addScriptTag({ type: 'module', content: `import { critterSVG } from '${URL_}src/ui/critters.js'; window.critterSVG = critterSVG;` });
  await page.waitForFunction(() => window.critterSVG);
  return { ctx, page };
}

/** The README logo: the brand critter and the wordmark, as in the top bar, on a clear background. */
async function logos() {
  console.log('Logo');
  for (const [theme, ink] of [['light', INK], ['dark', BG]]) {
    const { ctx, page } = await brandPage();
    await page.evaluate(({ ink, color, wordmark }) => {
      document.body.innerHTML = `<div id="logo" style="display:inline-flex;align-items:center;gap:14px;padding:12px 28px 12px 16px;color:${ink}">
        <span style="width:120px;height:120px;display:block">${window.critterSVG('blob', color)}</span>
        <span style="${wordmark};font-size:96px;padding-bottom:10px">itchy</span></div>`;
    }, { ink, color: BRAND_RED, wordmark: WORDMARK });
    const path = `${IMAGES}logo-${theme}.png`;
    await page.locator('#logo').screenshot({ path, omitBackground: true });
    report(path);
    await ctx.close();
  }
}

/** The favicon as a standalone SVG (styles inlined), plus PNG icons for home screens. */
async function icons() {
  console.log('Icons');
  const { ctx, page } = await brandPage({ width: 512, height: 512, scale: 1 });
  const svg = await page.evaluate((color) => {
    document.body.innerHTML = `<div id="mark" style="width:512px;height:512px">${window.critterSVG('blob', color)}</div>`;
    const root = document.querySelector('#mark svg');
    // Bake the computed look into attributes, and drop everything that's hidden (closed eyes, zzz…).
    // Read every style first: stripping classes as we go would change what later elements compute.
    // color-mix() computes to color(srgb …), which older SVG readers don't know: write rgb()/rgba().
    const rgb = (v) => v.replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/g,
      (_, r, g, b, a) => { const c = [r, g, b].map((x) => Math.round(x * 255)).join(', '); return a ? `rgba(${c}, ${a})` : `rgb(${c})`; });
    // Colours mixed in other spaces compute to oklab()/oklch()/lab(): paint each on a canvas and read back sRGB.
    const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const srgb = (v) => v.replace(/\b(?:oklab|oklch|lab|lch|color)\([^)]*\)/g, (c) => {
      const m = c.match(/\s*\/\s*([\d.]+)(%?)\s*\)$/);
      const alpha = m ? m[1] / (m[2] ? 100 : 1) : 1;
      cv.clearRect(0, 0, 1, 1);
      cv.fillStyle = m ? `${c.slice(0, m.index)})` : c; // painted opaque, so the colour reads back exactly
      cv.fillRect(0, 0, 1, 1);
      const [r, g, b] = cv.getImageData(0, 0, 1, 1).data;
      return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${+alpha.toFixed(3)})` : `rgb(${r}, ${g}, ${b})`;
    });
    // Gradient paints compute to url("page#id"): keep just the #id.
    const url = (v) => v.replace(/url\("?[^#"]*(#[^")]+)"?\)/g, 'url($1)');
    const DEFAULTS = { 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', opacity: '1', 'stroke-opacity': '1', 'fill-opacity': '1', 'stop-opacity': '1' };
    const PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity'];
    // Gradient stops take their colours from CSS, so bake those too; leave other <defs> content alone.
    const looks = [...root.querySelectorAll('*')].map((el) => {
      const cs = getComputedStyle(el);
      const inDefs = !!el.closest('defs');
      if (!inDefs && cs.display === 'none') return [el, null];
      const props = el.tagName === 'stop' ? ['stop-color', 'stop-opacity'] : inDefs ? [] : el.tagName === 'g' ? ['opacity'] : PAINT;
      const look = {};
      for (const p of props) {
        const v = url(srgb(rgb(cs.getPropertyValue(p))));
        if (DEFAULTS[p] === v) continue;
        if (p.startsWith('stroke-') && cs.stroke === 'none') continue;
        look[p] = v;
      }
      return [el, look];
    });
    for (const [el, look] of looks) {
      if (!look) { el.remove(); continue; }
      for (const a of ['class', 'style', 'transform']) el.removeAttribute(a);
      for (const [p, v] of Object.entries(look)) el.setAttribute(p, v);
    }
    root.querySelectorAll('g').forEach((g) => { if (!g.children.length) g.remove(); });
    const out = root.cloneNode(true);
    for (const a of ['class', 'style', 'aria-hidden', 'focusable', 'role', 'aria-label']) out.removeAttribute(a);
    out.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    out.setAttribute('viewBox', '3 3 94 94'); // room for the soft ground shadow
    // Each critter's ids carry a running number (e.g. "cr2b"): rename them so the file is the same every run.
    const prefix = out.querySelector('[id]').id.replace(/.$/, '');
    return out.outerHTML.replaceAll(prefix, 'i').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ');
  }, BRAND_RED);
  writeFileSync(`${ASSETS}icon.svg`, `${svg}\n`);
  report(`${ASSETS}icon.svg`);
  await ctx.close();

  // Home-screen icons: the critter on the app's cream background (iOS adds its own rounded corners).
  for (const size of [180, 512]) {
    const { ctx: c2, page: p2 } = await brandPage({ width: size, height: size, scale: 1 });
    await p2.evaluate(({ size, color, bg }) => {
      document.body.style.margin = '0';
      document.body.innerHTML = `<div style="width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">
        <span style="width:${size * 0.72}px;height:${size * 0.72}px;display:block">${window.critterSVG('blob', color)}</span></div>`;
    }, { size, color: BRAND_RED, bg: BG });
    const path = `${ASSETS}icon-${size}.png`;
    await p2.screenshot({ path });
    report(path);
    await c2.close();
  }
}

/** Open the real app at a size, ready to pose. */
async function openApp({ width, height, touch = false, scale = 2 }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: touch, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.waitForFunction(() => window.itchy && !document.getElementById('app').classList.contains('loading'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // let the fade-in finish
  return { ctx, page };
}

async function openExample(page, i) {
  await page.click('.btn.book');
  await page.waitForSelector('.songbook');
  await page.locator('.song-card.example').nth(i).click();
  await page.waitForSelector('.songbook', { state: 'detached' });
  await page.waitForTimeout(250);
}

async function pickCritter(page, i) {
  await page.locator('#rail .critter-btn').nth(i).click();
  await page.waitForTimeout(250);
}

/** Play until the playhead reaches `step`, then freeze the audio clock so the picture holds still. */
async function playTo(page, step) {
  await page.click('.btn.play', { force: true });
  await page.waitForFunction((s) => {
    const ticks = [...document.querySelectorAll('.tick')];
    return ticks.findIndex((t) => t.classList.contains('now')) === s;
  }, step, { polling: 'raf', timeout: 15000 });
  // Hold the play orb's glow steady too: it follows the live audio level, which differs from run to run.
  await page.evaluate(() => {
    const { engine } = window.itchy;
    engine.level = () => 0.5;
    return engine.ctx.suspend();
  });
  await page.waitForTimeout(250);
}

async function screenshot({ name, width, height, touch, example, critter, play, songbook }) {
  console.log(`Screenshot: ${name} (${width}×${height})`);
  const { ctx, page } = await openApp({ width, height, touch });
  if (example !== null && example !== undefined) await openExample(page, example);
  if (critter !== undefined) await pickCritter(page, critter);
  if (play !== null && play !== undefined) await playTo(page, play);
  if (songbook) {
    await page.click('.btn.book');
    await page.waitForSelector('.songbook');
    await page.waitForTimeout(400);
  }
  // Park the pointer in a corner so no hover state shows.
  await page.mouse.move(0, height - 1);
  const path = `${IMAGES}${name}.png`;
  await page.screenshot({ path });
  report(path);
  await ctx.close();
}

/** The picture shown when someone shares a link to Itchy: logo, one line, and the app. */
async function socialCard() {
  console.log('Social card');
  // First, a small app screenshot to place on the card.
  const { ctx: appCtx, page: app } = await openApp({ width: 1280, height: 800, scale: 1 });
  await openExample(app, 0);
  await pickCritter(app, 0);
  await playTo(app, 6);
  await app.mouse.move(0, 799);
  const shot = (await app.screenshot()).toString('base64');
  await appCtx.close();

  const { ctx, page } = await brandPage({ width: 1280, height: 640, scale: 1 });
  await page.evaluate(({ shot, color, bg, ink, wordmark }) => {
    document.body.style.margin = '0';
    document.body.innerHTML = `
      <div style="width:1280px;height:640px;position:relative;overflow:hidden;color:${ink};
        background:radial-gradient(1000px 600px at 0% 0%, #ffd8a8 0%, transparent 60%),
                   radial-gradient(900px 700px at 100% 100%, #a5d8ff 0%, transparent 60%), ${bg}">
        <div style="position:absolute;left:72px;top:80px;width:500px">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="width:112px;height:112px;display:block">${window.critterSVG('blob', color)}</span>
            <span style="${wordmark};font-size:92px;padding-bottom:10px">itchy</span>
          </div>
          <p style="font-size:44px;line-height:1.15;font-weight:900;margin:40px 0 18px">Tap the grid and a critter sings.</p>
          <p style="font-size:28px;line-height:1.35;font-weight:700;margin:0;color:#625a7c">A free music-making toy for children aged 6–11. Right in the browser.</p>
        </div>
        <img src="data:image/png;base64,${shot}" style="position:absolute;left:640px;top:96px;width:800px;border-radius:28px;
          box-shadow:0 24px 64px -16px rgba(38,31,61,.38), 0 4px 12px rgba(38,31,61,.08)">
      </div>`;
  }, { shot, color: BRAND_RED, bg: BG, ink: INK, wordmark: WORDMARK });
  await page.waitForFunction(() => document.querySelector('img')?.complete);
  const path = `${ASSETS}social-card.png`;
  await page.screenshot({ path });
  report(path);
  await ctx.close();
}
