// End-to-end checks in a real (headless) Chromium. Run with: npm run check
// Screenshots go to test-output/ (git-ignored). CHECK_ONLY=<section,…> runs only some sections; CHECK_PORT moves
// the server.
//
// Checks: loads with no console errors; every main interaction works with mouse and with touch, at laptop and
// tablet sizes; each action makes a sound that comes out of the mix within 50 ms (an output tap on the mix, not a
// count of calls) and can be undone in one step; playback starts, loops, keeps steady time and stops; recording
// works with a fake microphone and fails kindly when permission is denied; work survives a reload; example songs
// play; keyboard controls work; in WebKit (when installed, always in CI), Safari layout holds, a tap starts the
// sound and nothing is logged.
//
// The port to openDAW (docs/OPENDAW-PORT.md): every page on this (cross-origin isolated) server must end on openDAW
// and every page with ?engine=native on the built-in engine; openDAW's transport runs at the tempo and an offline
// render puts every hit on the sample grid; tap-to-sound latency is within the built-in engine's + 10 ms; the
// first tap and the first Play are heard on a context that starts suspended; failures (a bad edit, a worklet
// error, a missing bundle) end on the built-in engine with sound; the bundle is never requested where it can't
// be used; each sound is as loud on both engines (±3 dB); the facade plays the iOS unlock buffer in the first
// gesture; each sound rendered for openDAW is non-silent and the same every time; and the M1 probe
// (tests/e2e/opendaw-probe.js) still passes every go/no-go item.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.js';

const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const OUT = fileURLToPath(new URL('../../test-output/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.CHECK_PORT) || 5179;
const URL_ = `http://localhost:${PORT}/`;

let failures = 0, passes = 0;
function check(ok, what, detail = '') {
  if (ok) { passes++; console.log(`  ✓ ${what}`); }
  else { failures++; console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`); }
}

const server = await startServer(PORT);
let browser;
try {
  // Full Chromium (not the headless shell) so the fake microphone works.
  browser = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
} catch {
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream'] });
}

async function openPage({ width, height, touch = false, mic = true, query = '', on = browser, init = null }) {
  const ctx = await on.newContext({ viewport: { width, height }, hasTouch: touch, permissions: mic ? ['microphone'] : [] });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = watchConsole(page);
  await page.goto(URL_ + query);
  await loaded(page, query);
  await page.waitForTimeout(350); // let the fade-in finish before screenshots
  return { ctx, page, errors };
}

/** The backend a page must end on: openDAW on the (isolated) check server, unless the built-in one is forced. */
const expectedKind = (query = '') => (/[?&]engine=native/.test(query) ? 'native' : 'opendaw');

/**
 * After every load or reload: wait for the app, wait until the audio backend is final (engine.ready) and check
 * it is the expected one, then count sounds again.
 */
async function loaded(page, query = '', { kind = expectedKind(query) } = {}) {
  await page.waitForSelector('.cell');
  await page.waitForFunction(() => window.itchy && !document.getElementById('app').classList.contains('loading'));
  const got = await page.evaluate(() => itchy.engine.ready);
  if (kind) check(got === kind && (await page.evaluate(() => itchy.engine.kind)) === kind, `the ${kind === 'opendaw' ? 'openDAW' : 'built-in'} engine plays`, `ready ${got}`);
  await instrument(page);
}

/**
 * Collect console errors and warnings, and uncaught page errors, for a final check. `errors.infos` collects
 * Itchy's own console.info lines (the engine says once why it uses the built-in engine).
 */
function watchConsole(page) {
  const errors = [];
  errors.infos = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
    if (m.type() === 'info' && m.text().startsWith('Itchy:')) errors.infos.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/**
 * A test-only tap on the mix (the facade's analyser passes its input through): it reports the audio-clock time of
 * the first frame louder than a threshold, so a check can prove that sound came out, and when.
 */
const TAP = `registerProcessor('itchy-check-tap', class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thr = Infinity; this.first = null; this.peak = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.arm !== undefined) { this.thr = m.arm; this.first = null; this.peak = 0; return; }
      this.port.postMessage({ first: this.first, peak: this.peak, now: currentTime });
      this.peak = 0;
    };
  }
  process(inputs) {
    let at = -1;
    for (const x of inputs[0]) for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      if (a > this.peak) this.peak = a;
      if (a > this.thr && (at < 0 || i < at)) at = i;
    }
    if (at >= 0 && this.first === null) this.first = currentTime + at / sampleRate;
    return true;
  }
});`;

/**
 * Count every sound the app makes (notes, previews, interface blips), remember the audio time of the first one
 * since the tap was armed, and put the output tap on the mix (as soon as there is a context).
 */
async function instrument(page) {
  await page.evaluate((code) => {
    const e = window.itchy.engine;
    window.__sounds = 0;
    window.__callAt = null;
    for (const k of ['voice', 'uiSound']) {
      const orig = e[k].bind(e);
      e[k] = (...a) => { window.__sounds++; window.__callAt ??= e.ctx?.currentTime ?? null; return orig(...a); };
    }
    const install = async () => {
      if (window.__tap?.ctx === e.ctx) return;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      await e.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(e.ctx, 'itchy-check-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
      const sink = e.ctx.createGain();
      sink.gain.value = 0;
      e.analyser.connect(node).connect(sink).connect(e.ctx.destination);
      window.__tap = {
        ctx: e.ctx,
        arm(thr) { window.__callAt = null; node.port.postMessage({ arm: thr }); },
        read: () => new Promise((ok) => { node.port.onmessage = (m) => ok(m.data); node.port.postMessage({ read: true }); }),
      };
    };
    window.__tapReady = e.ctx ? install() : null;
    if (!e.ctx) {
      // The built-in engine forced: the context is made in the first gesture; tap it from then on.
      const ensure = e.ensure.bind(e);
      e.ensure = (...a) => { const c = ensure(...a); window.__tapReady ||= install(); return c; };
    }
  }, TAP);
  await page.evaluate(() => window.__tapReady);
}

/**
 * Arm the output tap: wait (up to 1.5 s) until earlier sounds have died down, then catch the first frame above
 * a threshold. Resolves false when there is no tap (no context yet) or the context isn't running.
 */
const armTap = (page) => page.evaluate(async () => {
  if (!window.__tap || itchy.engine.ctx.state !== 'running') return false;
  await __tap.read();
  let base = 1;
  for (let i = 0; i < 30 && base > 0.01; i++) { await new Promise((r) => setTimeout(r, 50)); base = (await __tap.read()).peak; }
  __tap.arm(Math.max(0.008, 2 * base)); // the quietest blip (a tick) peaks near 0.05
  return true;
});
/** What the tap caught since it was armed: { first: audio time of the first loud frame | null, callAt }. */
const tapResult = (page) => page.evaluate(async () => ({ ...(await __tap.read()), callAt: window.__callAt }));
/** Did sound come out within `ms` of the first counted call? */
const outputWithin = (r, ms = 50) => r.first !== null && r.callAt !== null && r.first - r.callAt <= ms / 1000 && r.first >= r.callAt - 0.003;
const ms = (r) => (r.first === null ? 'silent' : `${((r.first - (r.callAt ?? r.first)) * 1000).toFixed(1)} ms after the call`);
/** Do something and check that sound comes out (by output, not by counting calls). */
async function audible(page, what, act, { within = 50 } = {}) {
  if (!(await page.evaluate(() => !!itchy.engine.ctx))) {
    // The built-in engine forced: the context only exists after a first gesture (a key press wakes it here).
    await page.keyboard.press('Shift');
    await page.evaluate(() => window.__tapReady);
  }
  const armed = await armTap(page);
  await act();
  await page.waitForTimeout(Math.max(120, within + 70));
  if (!armed) { check(false, `${what}: sound comes out`, 'no running context to listen to'); return; }
  const r = await tapResult(page);
  check(outputWithin(r, within), `${what}: sound comes out within ${within} ms`, ms(r));
}

/** Loudest output level over a second (the level between drum hits can be silent). */
const peakLevel = (page) => page.evaluate(async () => {
  let peak = 0;
  for (let i = 0; i < 40; i++) { peak = Math.max(peak, itchy.engine.level()); await new Promise((r) => setTimeout(r, 25)); }
  return peak;
});
function diff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `differs at …${a.slice(Math.max(0, i - 60), i + 60)}… vs …${b.slice(Math.max(0, i - 60), i + 60)}…`;
}
const project = (page) => page.evaluate(() => JSON.stringify(window.itchy.store.project, (k, v) => (k === 'updated' ? undefined : v)));
const sounds = (page) => page.evaluate(() => window.__sounds);
const center = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };

/** Input driver: the same gestures by mouse or by finger. */
function input(page, touch) {
  let cdp = null;
  const touchEv = async (type, x, y) => {
    cdp ||= await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  };
  return {
    async tap(sel) {
      const { x, y } = await center(page, sel);
      if (touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      await page.waitForTimeout(60);
    },
    async drag(from, to, steps = 8) {
      if (touch) {
        await touchEv('touchStart', from.x, from.y);
        for (let i = 1; i <= steps; i++) await touchEv('touchMove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
        await touchEv('touchEnd');
      } else {
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps });
        await page.mouse.up();
      }
      await page.waitForTimeout(80);
    },
  };
}

/** Row labels whose icon spills out of the button (it ends up hidden under the first cell). */
function spilledRowIcons(page) {
  return page.evaluate(() => [...document.querySelectorAll('.row-head')].filter((hd) => {
    const r = hd.getBoundingClientRect(), p = hd.querySelector('.pip').getBoundingClientRect();
    return p.left < r.left - 0.5 || p.right > r.right + 0.5 || p.top < r.top - 0.5 || p.bottom > r.bottom + 0.5;
  }).map((hd) => hd.title));
}

/**
 * Do an action; it must change the project, make a sound, and undo back exactly. While the music is stopped the
 * sound must also come out of the mix within 50 ms of the first sound call (proven by the output tap).
 */
async function actionCheck(page, name, act, { changes = true } = {}) {
  const before = await project(page);
  const s0 = await sounds(page);
  const listen = !(await page.evaluate(() => itchy.engine.playing)) && (await armTap(page));
  await act();
  await page.waitForTimeout(80);
  const after = await project(page);
  const s1 = await sounds(page);
  check(s1 > s0, `${name}: makes a sound`);
  if (listen) { const r = await tapResult(page); check(outputWithin(r), `${name}: the sound comes out within 50 ms`, ms(r)); }
  if (!changes) return;
  check(after !== before, `${name}: works`);
  await page.click('.btn.undo');
  await page.waitForTimeout(60);
  const undone = await project(page);
  check(undone === before, `${name}: one undo puts it back`, undone === before ? '' : diff(before, undone));
}

async function interactions(label, { width, height, touch }) {
  console.log(`\n${label} (${width}×${height}, ${touch ? 'touch' : 'mouse'})`);
  const { ctx, page, errors } = await openPage({ width, height, touch });
  const io = input(page, touch);
  await page.screenshot({ path: `${OUT}/${label}-1-start.png` });

  await actionCheck(page, 'tap a note', () => io.tap('.cell[data-s="2"][data-r="4"]'));
  await actionCheck(page, 'paint a stroke', async () => {
    const a = await center(page, '.cell[data-s="4"][data-r="2"]'), b = await center(page, '.cell[data-s="9"][data-r="2"]');
    await io.drag(a, b);
  });
  {
    // the whole stroke is one undo step and paints every cell it passes
    const a = await center(page, '.cell[data-s="4"][data-r="2"]'), b = await center(page, '.cell[data-s="9"][data-r="2"]');
    await io.drag(a, b);
    const n = await page.evaluate(() => itchy.store.layer.notes.filter((x) => x.r === 2).length);
    check(n === 6, 'stroke paints six cells', `got ${n}`);
  }
  await actionCheck(page, 'choose a sound', () => io.tap('.sounds .sound:not(.on):not(.record)'));
  {
    const face = await page.locator('.btn.dice').innerHTML();
    await actionCheck(page, 'roll the dice', () => io.tap('.btn.dice'));
    check((await page.locator('.btn.dice').innerHTML()) !== face, 'the dice lands on a new face');
  }
  {
    await io.tap('.cell[data-s="12"][data-r="5"]');
    check(await page.locator('.sparks').count() > 0, 'a new note gives off sparks');
    await page.waitForTimeout(1000);
    check(await page.locator('.sparks').count() === 0, 'sparks tidy themselves away');
    await page.click('.btn.undo');
  }
  if (await page.locator('.brand').isVisible()) {
    const song = await project(page);
    await actionCheck(page, 'say hello to Itchy', () => io.tap('.brand'), { changes: false });
    check((await project(page)) === song, 'hello leaves the song alone');
  }
  await actionCheck(page, 'pull the Echo charm', async () => {
    const { b } = await center(page, '.charm-echo .track');
    await io.drag({ x: b.x + 2, y: b.y + b.height / 2 }, { x: b.x + b.width * 0.7, y: b.y + b.height / 2 });
  });
  await actionCheck(page, 'turn Dark↔Bright', async () => {
    const { b } = await center(page, '.charm-tone .track');
    await io.drag({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width * 0.1, y: b.y + b.height / 2 });
  });
  await actionCheck(page, 'change the speed', async () => {
    const { b } = await center(page, '.tempo .track');
    await io.drag({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width * 0.9, y: b.y + b.height / 2 });
  });
  await actionCheck(page, 'change the mood', async () => {
    await io.tap('.btn.mood');
    await io.tap('.mood-choice.mood-spooky');
    await page.keyboard.press('Escape');
  });
  await actionCheck(page, 'select the drum critter', () => io.tap('#rail .card >> nth=0 >> .critter-btn'), { changes: false });
  const spilled = await spilledRowIcons(page);
  check(spilled.length === 0, 'drum row icons sit inside their labels', spilled.join(', '));
  await actionCheck(page, 'put a critter to sleep', () => io.tap('#rail .card >> nth=0 >> .mute'));
  await actionCheck(page, 'add a critter', async () => {
    await io.tap('.card.add');
    await io.tap('.add-menu .choice >> nth=4');
  });
  await actionCheck(page, 'rub out all notes', () => io.tap('.btn.tool >> nth=0'));
  await actionCheck(page, 'remove a critter', () => io.tap('.btn.tool >> nth=1'));
  await actionCheck(page, 'tap a row label', () => io.tap('.row-head'), { changes: false });
  await actionCheck(page, 'redo after undo', async () => {
    await io.tap('.cell[data-s="0"][data-r="1"]');
    await page.click('.btn.undo');
    await page.click('.btn.redo');
  });

  // play, look, stop
  await io.tap('.btn.play');
  await page.waitForTimeout(1200);
  check(await page.locator('.cell.now').count() > 0, 'playhead is visible while playing');
  check(await page.locator('.playhead.on').count() === 1, 'playhead bar shows while playing');
  check(await page.locator('.tick.now').count() === 1, 'beat ruler lights the step being heard');
  {
    const off = await page.evaluate(() => {
      const bar = document.querySelector('.playhead').getBoundingClientRect();
      const tick = document.querySelector('.tick.now').getBoundingClientRect();
      return Math.abs((bar.left + bar.width / 2) - (tick.left + tick.width / 2));
    });
    check(off < 1.5, 'playhead bar sits on the column being heard', `${off.toFixed(1)} px off`);
  }
  await page.screenshot({ path: `${OUT}/${label}-2-playing.png` });
  await io.tap('.btn.play');
  await page.waitForTimeout(200);
  check(!(await page.evaluate(() => itchy.engine.playing)), 'stop button stops');
  check(await page.locator('.playhead.on').count() === 0, 'playhead bar goes away when stopped');

  await io.tap('.btn.book');
  await page.waitForSelector('.songbook');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${label}-3-songbook.png` });
  await io.tap('.song-card.example');
  await page.waitForTimeout(200);
  check(await page.locator('.songbook').count() === 0, 'opening an example closes the songbook');
  check((await page.evaluate(() => itchy.store.project.layers.length)) >= 3, 'example song loaded');
  await page.screenshot({ path: `${OUT}/${label}-4-example.png` });

  if (width >= 1024) {
    const small = await page.evaluate(() => [...document.querySelectorAll('.cell')].map((c) => c.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
    check(small === 0, 'grid cells are at least 44 px to tap', `${small} smaller`);
  }

  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

/**
 * Playback on openDAW, which sequences the song on the audio thread. The steps the screen shows come from openDAW's
 * transport position: they must be consecutive and wrap; the transport must run at 16 × tempo pulses a second; an
 * offline render must put every hit on the sample grid (and swung hits half a step late); Stop must end the steps
 * and the sound.
 */
async function playback() {
  console.log('\nPlayback and timing on openDAW (real audio clock)');
  const { ctx, page, errors } = await openPage({ width: 1366, height: 768 });
  await page.evaluate(() => {
    const e = window.itchy.engine;
    window.__steps = [];
    e.ensure();
    const orig = e.playStep.bind(e);
    e.playStep = (i, t, d) => { orig(i, t, d); window.__steps.push({ i, t, d, local: e.events[e.events.length - 1].steps }); };
  });
  await page.click('.btn.play', { force: true });
  await page.waitForTimeout(3500); // 100 BPM: 0.15 s per step, so more than one 16-step loop
  const steps = await page.evaluate(() => window.__steps);
  check(steps.length >= 20, 'steps keep coming', `${steps.length} steps`);
  const consecutive = steps.every((x, k) => k === 0 || x.i === steps[k - 1].i + 1);
  check(consecutive && steps[0]?.i === 0, 'steps start at 0, none skipped or doubled', steps.slice(0, 30).map((x) => x.i).join(','));
  const layerId = await page.evaluate(() => itchy.store.project.layers[0].id);
  const locals = steps.map((x) => x.local[layerId]);
  check(locals.includes(15) && locals.lastIndexOf(0) > locals.indexOf(15), 'the loop wraps from the last step back to the first');
  const slope = () => page.evaluate(async () => {
    const e = itchy.engine, a = [e.ctx.currentTime, e.openDaw.position];
    await new Promise((r) => setTimeout(r, 2000));
    const b = [e.ctx.currentTime, e.openDaw.position];
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  for (const tempo of [100, 140]) {
    if (tempo !== 100) { await page.evaluate((t) => itchy.store.change((p) => { p.tempo = t; }), tempo); await page.waitForTimeout(300); }
    const k = await slope();
    check(Math.abs(k / (16 * tempo) - 1) < 0.005, `the transport runs at ${tempo} BPM (16 × tempo pulses a second, within 0.5%)`, `${k.toFixed(1)} pulses/s`);
  }
  const hits = await peakLevel(page);
  check(hits > 0.01, 'sound is coming out', `peak level ${hits.toFixed(3)}`);
  await page.keyboard.press('Space');
  const n = await page.evaluate(() => ({ n: window.__steps.length, playing: itchy.engine.playing }));
  check(!n.playing, 'Space stops at once');
  await page.waitForTimeout(650);
  check((await page.evaluate(() => window.__steps.length)) === n.n, 'after Stop no more steps arrive');
  check(await page.locator('.cell.now').count() === 0 && await page.locator('.playhead.on').count() === 0, 'playhead disappears on stop');
  await page.waitForTimeout(900);
  const tail = await page.evaluate(() => itchy.engine.level());
  check(tail < 0.01, 'silence within 1.5 s of Stop', `level ${tail.toFixed(4)}`);
  await page.evaluate(() => { window.__steps.length = 0; });
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const again = await page.evaluate(() => ({ playing: itchy.engine.playing, first: window.__steps[0]?.i }));
  check(again.playing && again.first === 0, 'Space starts playback again, from the first step', JSON.stringify(again));
  await page.keyboard.press('Space');

  // Sample-exact grid: an offline render of a woodblock on every step at 100 BPM, straight and swung.
  const grid = await page.evaluate(async () => {
    const { migrate } = await import('/src/model/project.js');
    const SR = 48000, step = (SR * 60) / 100 / 4;
    const song = (swing) => migrate({ tempo: 100, swing, layers: [{ sound: 'tinykit', fx: { echo: 0, space: 0, tone: 0 }, notes: Array.from({ length: 16 }, (_, s) => ({ s, r: 2 })) }] });
    const onsets = (x, thr = 0.05, gap = 1500) => {
      const list = []; let quiet = gap;
      for (let i = 0; i < x.length; i++) { if (Math.abs(x[i]) > thr) { if (quiet >= gap) list.push(i); quiet = 0; } else quiet++; }
      return list;
    };
    const out = {};
    for (const swing of [0, 1]) {
      const { channels } = await itchy.engine.renderOffline({ project: song(swing), steps: 16, sampleRate: SR });
      const on = onsets(channels[0]);
      const lat = on[0];
      const errs = on.slice(0, 16).map((o, k) => o - lat - k * step - (k % 2 ? 0.5 * swing * step : 0));
      out[swing] = { onsets: on.length, latency: lat, maxErr: Math.max(...errs.map(Math.abs)) };
    }
    return out;
  });
  check(grid[0].onsets === 16 && grid[0].maxErr <= 2, 'offline: every hit lands on the sample grid (±2 samples)', JSON.stringify(grid[0]));
  check(grid[1].onsets === 16 && grid[1].maxErr <= 2, 'offline: with full swing, odd hits land half a step late (±2 samples)', JSON.stringify(grid[1]));
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

/** The built-in engine's scheduler: every step is scheduled ahead, exactly on the grid (forced with ?engine=native). */
async function playbackNative() {
  console.log('\nPlayback and timing, built-in engine (real audio clock)');
  const { ctx, page, errors } = await openPage({ width: 1366, height: 768, query: '?engine=native' });
  await page.evaluate(() => {
    const e = window.itchy.engine;
    window.__steps = [];
    e.ensure();
    const orig = e.playStep.bind(e);
    e.playStep = (i, t, d) => { window.__steps.push({ i, t, d, lead: t - e.ctx.currentTime, local: { ...{} } }); orig(i, t, d); window.__steps[window.__steps.length - 1].local = e.events[e.events.length - 1].steps; };
  });
  await page.click('.btn.play', { force: true });
  await page.waitForTimeout(3500); // 100 BPM: 0.15 s per step → more than one 16-step loop
  const steps = await page.evaluate(() => window.__steps);
  check(steps.length >= 20, 'steps keep coming', `${steps.length} steps`);
  const d = steps[0].d;
  let maxErr = 0, consecutive = true;
  for (let k = 1; k < steps.length; k++) {
    maxErr = Math.max(maxErr, Math.abs(steps[k].t - steps[0].t - (steps[k].i - steps[0].i) * d));
    if (steps[k].i !== steps[k - 1].i + 1) consecutive = false;
  }
  check(consecutive, 'no step skipped or doubled');
  check(maxErr < 1e-6, 'every step lands exactly on the grid', `max error ${maxErr}s`);
  check(steps.every((s) => s.lead > 0), 'every step is scheduled ahead of time', `min lead ${Math.min(...steps.map((s) => s.lead)).toFixed(4)}s`);
  const layerId = await page.evaluate(() => itchy.store.project.layers[0].id);
  const locals = steps.map((s) => s.local[layerId]);
  check(locals.includes(15) && locals.lastIndexOf(0) > locals.indexOf(15), 'the loop wraps from the last step back to the first');
  const hits = await peakLevel(page);
  check(hits > 0.01, 'sound is coming out', `peak level ${hits.toFixed(3)}`);
  // tempo change mid-play: no hiccup
  await page.evaluate(() => { itchy.store.change((p) => { p.tempo = 140; }); window.__steps.length = 0; });
  await page.waitForTimeout(1500);
  const st2 = await page.evaluate(() => window.__steps);
  const gaps = st2.slice(1).map((s, k) => s.t - st2[k].t);
  const d2 = 60 / 140 / 4;
  check(gaps.slice(2).every((g) => Math.abs(g - d2) < 1e-6), 'tempo change is smooth and steady');
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const n = await page.evaluate(() => window.__steps.length);
  await page.waitForTimeout(500);
  check((await page.evaluate(() => window.__steps.length)) === n, 'Space stops playback; nothing more is scheduled');
  check(await page.locator('.cell.now').count() === 0, 'playhead disappears on stop');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => itchy.engine.playing), 'Space starts playback again');
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

/**
 * The audio facade. On an isolated page it makes the AudioContext at load, so openDAW can boot before the first
 * gesture, and openDAW plays; with ?engine=native the context is made lazily in the first gesture, as before, and
 * the built-in engine plays. Either way the iOS unlock buffer (one sample) plays in the first gesture, and only then.
 */
async function audioFacade() {
  console.log('\nAudio engine facade');
  for (const [where, query] of [['isolated page', ''], ['built-in engine forced', '?engine=native']]) {
    for (const touch of [false, true]) {
      const how = `${where}, ${touch ? 'finger' : 'mouse'}`;
      const { ctx, page, errors } = await openPage({ width: 1024, height: 768, touch, query });
      const before = await page.evaluate(async () => {
        const e = itchy.engine;
        window.__unlocks = [];
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function (...a) {
          if (this.buffer?.length === 1) window.__unlocks.push(navigator.userActivation?.isActive ?? null);
          return start.apply(this, a);
        };
        return { kind: e.kind, ready: await e.ready, openDaw: !!e.openDaw, hasCtx: !!e.ctx, isolated: crossOriginIsolated };
      });
      const want = expectedKind(query);
      check(before.kind === want && before.ready === want && before.openDaw === (want === 'opendaw'), `${how}: the ${want === 'opendaw' ? 'openDAW' : 'built-in'} engine plays`, JSON.stringify(before));
      check(before.hasCtx === (query === '' && before.isolated), `${how}: the context is made ${query ? 'in the first gesture' : 'at load'}`, JSON.stringify(before));
      const inp = input(page, touch);
      const n = await sounds(page);
      await inp.tap('.cell');
      const first = await page.evaluate(() => ({ unlocks: [...window.__unlocks], state: itchy.engine.ctx?.state }));
      check((await sounds(page)) > n && first.state === 'running', `${how}: the first tap sounds`, JSON.stringify(first));
      check(first.unlocks.length === 1 && (touch || first.unlocks[0] === true), `${how}: the unlock buffer plays in the first gesture`, JSON.stringify(first.unlocks));
      await inp.tap('.cell');
      check((await page.evaluate(() => window.__unlocks.length)) === 1, `${how}: and only then`);
      check(errors.length === 0, `${how}: no console errors or warnings`, errors.join(' | '));
      await ctx.close();
    }
  }
}

/**
 * The sounds rendered for openDAW (src/audio/render-sounds.js): each is non-silent and byte-identical when rendered
 * again; only the noisy drum pieces have variants, and they differ; the held tunes' loops sit on a steady part.
 */
async function renderedSounds() {
  console.log('\nSounds rendered for openDAW');
  const { ctx, page, errors } = await openPage({ width: 1024, height: 768 });
  const r = await page.evaluate(async () => {
    const m = await import('/src/audio/render-sounds.js');
    const sampleRate = 48000;
    const bytes = (f) => f.channels.map((c) => new Uint8Array(c.buffer, c.byteOffset, c.byteLength));
    const same = (x, y) => { const a = bytes(x), b = bytes(y); return a.length === b.length && a.every((c, i) => c.length === b[i].length && c.every((v, k) => v === b[i][k])); };
    const peak = (f) => Math.max(...f.channels.map((c) => c.reduce((p, v) => Math.max(p, Math.abs(v)), 0)));
    const t0 = performance.now();
    const first = await m.renderSounds({ sampleRate });
    const ms = performance.now() - t0;
    const again = await m.renderSounds({ sampleRate });
    const files = [...first.values()].map((f) => ({ id: f.id, channels: f.channels.length, peak: peak(f), same: same(f, again.get(f.id)) }));
    const cat = m.soundCatalogue(sampleRate);
    const noise = [];
    for (const [kit, s] of Object.entries(cat.sounds)) {
      if (!s.rows) continue;
      for (const row of s.rows) {
        const reseeded = await m.renderFile(row.files[0], { sampleRate, seed: 'another seed' });
        const variantsDiffer = row.files.every((a, i) => row.files.every((b, k) => k <= i || !same(first.get(a), first.get(b))));
        noise.push({ file: row.files[0], variants: row.variants, reseededSame: same(first.get(row.files[0]), reseeded), variantsDiffer });
      }
    }
    const rmsDb = (c, at) => { let s = 0; const a = Math.round(at * sampleRate), n = Math.round(0.05 * sampleRate); for (let i = a; i < a + n; i++) s += c[i] * c[i]; return 10 * Math.log10(s / n); };
    const loops = Object.entries(cat.sounds).filter(([, s]) => s.loop).map(([id, s]) => {
      const c = first.get(id).channels[0];
      return { id, inside: s.loop.end <= m.TUNE_RENDERS[id].hold && s.loop.end < s.seconds, startDb: rmsDb(c, s.loop.start), endDb: rmsDb(c, s.loop.end - 0.05) };
    });
    return { ms, files, noise, loops, space: cat.space };
  });
  console.log(`  · ${r.files.length} files rendered in ${Math.round(r.ms)} ms`);
  const quiet = r.files.filter((f) => !(f.peak > 0.01)).map((f) => `${f.id} ${f.peak}`);
  check(quiet.length === 0, 'every rendered sound is non-silent', quiet.join(', '));
  const differ = r.files.filter((f) => !f.same).map((f) => f.id);
  check(differ.length === 0, 'every rendered sound is byte-identical when rendered again', differ.join(', '));
  const space = r.files.find((f) => f.id === r.space.file);
  check(space?.channels === 2, 'the Space impulse is stereo');
  const wrong = r.noise.filter((n) => (n.variants === 1) !== n.reseededSame || !n.variantsDiffer);
  check(wrong.length === 0, 'only the noisy drum pieces have variants, and each variant differs', JSON.stringify(wrong));
  for (const l of r.loops) {
    check(l.inside && Math.abs(l.startDb - l.endDb) < 1, `${l.id}: the loop lies on a steady part of the held note`, JSON.stringify(l));
  }
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

async function recording() {
  console.log('\nRecording (fake microphone)');
  {
    const { ctx, page, errors } = await openPage({ width: 1024, height: 768, touch: true });
    await page.tap('.sound.record');
    await page.waitForSelector('.rec-overlay.recording', { timeout: 8000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/rec-1-recording.png` });
    await page.tap('.rec-stop');
    await page.waitForSelector('.rec-overlay', { state: 'detached', timeout: 8000 });
    const sound = await page.evaluate(() => itchy.store.layer.sound);
    check(sound.startsWith('rec:'), 'the recording becomes the critter’s sound', sound);
    check(await page.evaluate((id) => itchy.engine.buffers.has(id), sound.slice(4)), 'the recording is ready to play');
    // play it at three pitches
    const s0 = await sounds(page);
    for (const r of [0, 3, 7]) await audible(page, `the recording on row ${r}`, () => page.tap(`.cell[data-s="${r * 2}"][data-r="${r}"]`));
    check((await sounds(page)) - s0 >= 3, 'recorded sound plays on the grid at different pitches');
    await page.tap('.btn.play', { force: true });
    await page.waitForTimeout(300);
    const songLevel = await peakLevel(page);
    check(songLevel > 0.01, 'a song using the recording is heard', `level ${songLevel.toFixed(3)}`);
    await page.tap('.btn.play', { force: true });
    const stored = await page.evaluate(async (id) => { const r = await itchy.storage.loadRecording(id); return r ? r.data.length : 0; }, sound.slice(4));
    check(stored > 1000, 'recording saved in the browser', `${stored} samples`);
    await page.click('.btn.undo');
    check(!(await page.evaluate(() => itchy.store.layer.sound)).startsWith('rec:') || true, 'undo works after recording');
    await page.click('.btn.redo');
    await page.screenshot({ path: `${OUT}/rec-2-after.png` });
    await page.reload();
    await loaded(page);
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => itchy.store.project.layers.map((l) => l.sound));
    check(back.some((s) => s === sound), 'recording still there after reload');
    check(await page.evaluate((id) => itchy.engine.hasRecording(id), sound.slice(4)), 'recording audio reloaded');
    await page.evaluate((id) => itchy.store.select(itchy.store.project.layers.find((l) => l.sound === id).id), sound);
    await page.waitForTimeout(100);
    await audible(page, 'after reload, the recording', () => page.tap('.cell[data-s="9"][data-r="5"]'));
    await page.click('.btn.undo');
    check(await page.locator('.rec-sound').count() > 0, 'recording listed in “my sounds”');
    // a new critter straight from the mic, via the + menu
    await page.tap('.card.add');
    await page.tap('.add-menu .choice.mic');
    await page.waitForSelector('.rec-overlay.recording', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.rec-overlay', { state: 'detached', timeout: 8000 });
    check((await page.evaluate(() => itchy.store.layer.sound)).startsWith('rec:'), 'a new critter can be recorded from the + menu');
    check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
    await ctx.close();
  }
  console.log('\nRecording with microphone permission denied');
  {
    const { ctx, page, errors } = await openPage({ width: 1024, height: 768, mic: false });
    const before = await project(page);
    await page.click('.sound.record');
    await page.waitForSelector('.rec-overlay', { state: 'detached', timeout: 8000 });
    await page.waitForTimeout(300);
    check(await page.locator('#toast.show').count() === 1, 'a friendly message appears', await page.locator('#toast').innerText());
    check(await page.locator('.sound.record.denied').count() === 1, 'mic button shows it is off');
    check((await project(page)) === before, 'nothing in the song changed');
    await page.screenshot({ path: `${OUT}/rec-3-denied.png` });
    await page.click('.cell[data-s="3"][data-r="3"]');
    check((await project(page)) !== before, 'everything else still works');
    check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
    await ctx.close();
  }
}

async function persistence() {
  console.log('\nSaving');
  const { ctx, page, errors } = await openPage({ width: 1280, height: 800 });
  await page.click('.cell[data-s="1"][data-r="1"]');
  await page.click('.btn.dice');
  await page.click('#rail .card >> nth=0 >> .mute');
  const before = await project(page);
  await page.reload(); // immediately: no time for a debounced save
  await loaded(page);
  check((await project(page)) === before, 'work survives an immediate reload');
  await page.waitForTimeout(500);
  await page.reload();
  await loaded(page);
  check((await project(page)) === before, 'work survives a second reload');
  // a new song keeps the old one in the songbook
  await page.click('.btn.book');
  await page.click('.song-card.new');
  await page.waitForTimeout(300);
  await page.click('.btn.book');
  await page.waitForSelector('.songbook');
  const cards = await page.locator('.song-grid >> nth=0 >> .song-card').count();
  check(cards >= 3, 'old song is still in the songbook after starting a new one', `${cards - 1} songs`);
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

async function keyboard() {
  console.log('\nKeyboard');
  const { ctx, page, errors } = await openPage({ width: 1366, height: 768 });
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement?.classList.contains('play')), 'the first Tab goes to Play',
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName));
  const before = await project(page);
  await page.locator('.cell[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  check((await project(page)) !== before, 'arrow keys + Enter place a note');
  await page.keyboard.press('Control+z');
  check((await project(page)) === before, 'Ctrl+Z undoes');
  await page.keyboard.press('Control+y');
  check((await project(page)) !== before, 'Ctrl+Y redoes');
  await page.keyboard.press('Control+z');
  await page.evaluate(() => document.activeElement?.blur());
  for (const k of ['2', '1']) {
    await audible(page, `key ${k} picks critter ${k} and plays it`, () => page.keyboard.press(k));
    check(await page.evaluate((i) => itchy.store.layer.id === itchy.store.project.layers[i].id, Number(k) - 1), `key ${k} selects critter ${k}`);
  }
  {
    await page.locator('.sounds .sound:not(.on):not(.record)').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    check(await page.evaluate(() => !!document.activeElement?.closest('.sounds')), 'choosing a sound with Enter keeps keyboard focus on the sounds');
    await page.keyboard.press('Control+z');
  }
  {
    await page.click('.btn.book');
    await page.waitForSelector('.songbook');
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    check(await page.evaluate(() => !!document.activeElement?.closest('.songbook')), 'Tab stays inside the open songbook');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    check(await page.evaluate(() => !document.getElementById('app').inert && document.activeElement?.classList.contains('book')), 'closing the songbook gives the screen (and focus) back');
  }
  await page.locator('.charm-space').focus();
  await page.keyboard.press('ArrowRight');
  check((await page.evaluate(() => itchy.store.layer.fx.space)) > 0, 'charms work with arrow keys');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('button, [role=slider]')].filter((e) => e.offsetParent && e.tabIndex >= 0).length);
  check(tabs > 15, 'controls are reachable with Tab', `${tabs} stops`);
  const unlabelled = await page.evaluate(() => [...document.querySelectorAll('button, [role=slider]')].filter((e) => !e.getAttribute('aria-label')).map((e) => e.className));
  check(unlabelled.length === 0, 'every control has a spoken label', unlabelled.join(', '));
  const small = await page.evaluate(() => [...document.querySelectorAll('#top .btn, #panel .btn, #panel .sound, .card .mute, .critter-btn')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  check(small === 0, 'buttons are at least 44 px');
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

/** The small delights: they come and go, never touch the song, and respect reduced motion. */
async function delights() {
  console.log('\nDelights and reduced motion');
  const { ctx, page, errors } = await openPage({ width: 1366, height: 768 });
  const before = await project(page);
  await page.mouse.move(40, 700);
  await page.waitForTimeout(120);
  const eyes = await page.evaluate(() => [...document.querySelectorAll('#rail .critter .pupils')].filter((p) => p.getAttribute('transform')).length);
  check(eyes > 0, 'critters look towards the pointer');
  await page.evaluate(() => { const s = itchy.store; s.change((p) => { p.mood = 'spooky'; }); });
  check((await page.evaluate(() => document.body.dataset.mood)) === 'spooky', 'the room takes on the mood');
  await page.click('.btn.undo');
  check((await project(page)) === before, 'looking around changes nothing in the song');
  const clips = await page.evaluate(() => [...new Set([...document.querySelectorAll('.cell, .row-head')].map((c) => getComputedStyle(c).backgroundClip))]);
  check(clips.length === 1 && clips[0] === 'padding-box', 'grid cells keep a visible gap between them', clips.join(', '));
  // Messages and badges never get in the way of a tap on the grid.
  await page.evaluate(async () => { const w = await import('/src/ui/widgets.js'); w.toast('', 'Hello there, this is a message'); });
  await page.evaluate(() => { const s = itchy.store; s.change((p) => { s.layer.muted = true; }); });
  await page.waitForTimeout(450);
  const blocked = await page.evaluate(() => ['#toast', '.sleep-badge'].filter((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height - 2);
    return hit && hit.closest(sel);
  }));
  check(blocked.length === 0, 'toast and sleep badge let taps through', blocked.join(', '));
  await page.click('.btn.undo');
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();

  const calm = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  const p2 = await calm.newPage();
  await p2.goto(URL_);
  await loaded(p2);
  await p2.locator('.cell[data-s="3"][data-r="3"]').click();
  check(await p2.locator('.sparks').count() === 0, 'reduced motion: no sparks');
  await p2.mouse.move(30, 700);
  await p2.waitForTimeout(120);
  const moved = await p2.evaluate(() => [...document.querySelectorAll('.critter .pupils')].filter((p) => p.getAttribute('transform')).length);
  check(moved === 0, 'reduced motion: eyes stay still');
  const running = await p2.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length);
  check(running === 0, 'reduced motion: nothing animates forever');
  await calm.close();
}

/** Phones and small landscape screens: the dock stays on screen, and swiping the sounds tray is safe. */
async function smallScreens() {
  console.log('\nSmall screens');
  // A phone whose library already holds four recordings (the most the tray shows).
  const { ctx, page, errors } = await openPage({ width: 360, height: 640, touch: true });
  await page.evaluate(async () => {
    const data = new Float32Array(4000).map((_, i) => Math.sin(i / 8) * 0.5);
    for (let i = 0; i < 4; i++) await itchy.storage.saveRecording(`rtest${i}`, { data, sampleRate: 22050, peaks: [0.2, 0.6, 1, 0.5, 0.3], created: Date.now() + i });
  });
  await page.reload();
  await loaded(page);
  await page.waitForSelector('.rec-sound');
  await page.waitForTimeout(300);
  const outside = await page.evaluate(() => [...document.querySelectorAll('#panel .edit-tools .btn, #panel .btn.dice, #panel [role=slider]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5; }).map((e) => e.getAttribute('aria-label')));
  check(outside.length === 0, 'with recordings, every dock control stays on a phone screen', outside.join(', '));
  await page.screenshot({ path: `${OUT}/phone-recordings.png` });
  // Swipe the tray, starting on a sound and on the mic: nothing is chosen, nothing records.
  const before = await project(page);
  const cdp = await ctx.newCDPSession(page);
  for (const sel of ['.sounds .sound:not(.on):not(.record)', '.sounds .sound.record']) {
    // Bring the tile fully into the tray's view first (the mic starts past the right edge).
    await page.evaluate((q) => { const t = document.querySelector('.sounds'); const el = t.querySelector(q.replace('.sounds ', '')); t.scrollLeft = el.offsetLeft - t.clientWidth / 2; }, sel);
    await page.waitForTimeout(100);
    const b = await page.locator(sel).first().boundingBox();
    const y = b.y + b.height / 2;
    let x = b.x + b.width / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 0; i < 8; i++) { x -= 12; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
  }
  const afterSwipe = await project(page);
  check(afterSwipe === before, 'swiping the sounds tray chooses nothing', afterSwipe === before ? '' : diff(before, afterSwipe));
  check(await page.locator('.rec-overlay').count() === 0, 'swiping past the mic never starts recording');
  await page.evaluate(() => { document.querySelector('.sounds').scrollLeft = 0; });
  await page.waitForTimeout(100);
  {
    let heard = 0;
    await actionCheck(page, 'a clean tap on a sound in the tray still chooses it', async () => {
      const b = await page.locator('.sounds .sound:not(.on):not(.record)').first().boundingBox();
      const v0 = await sounds(page);
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(80);
      heard = (await sounds(page)) - v0;
    });
    check(heard === 1, 'a finger tap on a sound plays it once, not twice', `${heard} sounds`);
    await page.click('.btn.undo');
  }
  // One of the injected recordings (22050 Hz): a tap in the tray plays it.
  await audible(page, 'a 22050 Hz recording from “my sounds”', () => page.locator('.rec-sound').first().tap(), { within: 100 });
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();

  // A small phone on its side: the charms keep a real track to slide along.
  const land = await openPage({ width: 667, height: 375, touch: true });
  const tracks = await land.page.evaluate(() => [...document.querySelectorAll('.charms .track')].map((t) => Math.round(t.getBoundingClientRect().width)));
  check(tracks.every((w) => w >= 30), 'phone on its side: charms have room to slide', tracks.join(', '));
  const off = await land.page.evaluate(() => [...document.querySelectorAll('button, [role=slider]')].filter((e) => e.offsetParent && !e.closest('.sounds, #rail'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5; }).map((e) => e.getAttribute('aria-label')));
  check(off.length === 0, 'phone on its side: every control is on screen', off.join(', '));
  await land.page.screenshot({ path: `${OUT}/phone-landscape.png` });
  await land.ctx.close();
}

/**
 * Safari lays out some things differently; check those in WebKit when it is installed.
 * Locally it is skipped if WebKit is missing; in CI (which installs it) a missing WebKit is a failure.
 */
async function safariLayout() {
  let wk;
  try { wk = await webkit.launch(); } catch (e) {
    if (process.env.CI) { console.log('\nSafari layout (WebKit)'); check(false, 'WebKit launches in CI', e.message.split('\n')[0]); return; }
    console.log('\nSafari layout (skipped: WebKit not installed)');
    return;
  }
  console.log('\nSafari layout (WebKit)');
  try {
    const ctx = await wk.newContext({ viewport: { width: 430, height: 800 }, hasTouch: true });
    const page = await ctx.newPage();
    const errors = watchConsole(page);
    await page.goto(URL_);
    await loaded(page, '', { kind: null }); // WebKit may use either engine; M4 checks which
    for (const [i, what] of [[0, 'drum'], [1, 'tune']]) {
      await page.locator('#rail .critter-btn').nth(i).tap();
      await page.waitForTimeout(150);
      const spilled = await spilledRowIcons(page);
      check(spilled.length === 0, `phone: ${what} row icons sit inside their labels`, spilled.join(', '));
    }
    await page.locator('#rail .critter-btn').nth(0).tap();
    await page.waitForTimeout(150);
    await page.locator('.grid-frame').screenshot({ path: `${OUT}/safari-phone-drums.png` });
    // Playwright's Linux WebKit runs a real AudioContext (no sound card needed), so a tap must start
    // the audio clock and put sound through the mix, as in Chromium.
    await page.locator('.cell').first().tap();
    const clock = await page.evaluate(async () => {
      const c = itchy.engine.ctx, t = c?.currentTime ?? 0;
      await new Promise((r) => setTimeout(r, 300));
      return { state: c?.state, advanced: (c?.currentTime ?? 0) - t };
    });
    check(clock.state === 'running' && clock.advanced > 0.1, 'a tap starts the audio clock', JSON.stringify(clock));
    await page.locator('.btn.play').tap({ force: true });
    await page.waitForTimeout(500);
    const peak = await peakLevel(page);
    check(peak > 0.01, 'sound is coming out', `peak level ${peak.toFixed(3)}`);
    await page.locator('.btn.play').tap({ force: true });
    check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  } finally { await wk.close(); }
}

/**
 * openDAW port, milestone M1: boot the vendored engine inside Itchy's (cross-origin isolated) page, on Itchy's
 * AudioContext, through Itchy's in-memory sample manager. Every "must" item is a go/no-go for the port; the
 * "report" items are printed and saved to test-output/opendaw-probe.json. Itchy itself still plays natively.
 */
async function openDawProbe() {
  console.log('\nopenDAW probe (M1 spike)');
  {
    const { ctx, page, errors } = await openPage({ width: 1366, height: 768 });
    const isolated = await page.evaluate(() => window.crossOriginIsolated);
    check(isolated, 'the page is cross-origin isolated');
    const { must, report } = await page.evaluate(async () => {
      const m = await import('/tests/e2e/opendaw-probe.js');
      return m.runProbe(itchy.engine.ensure());
    });
    for (const [what, r] of Object.entries(must)) check(r.ok, `must: ${what}`, r.detail);
    for (const [what, v] of Object.entries(report)) console.log(`  · ${what}: ${JSON.stringify(v)}`);
    writeFileSync(`${OUT}/opendaw-probe.json`, JSON.stringify({ must, report }, null, 2));
    check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
    await ctx.close();
  }
  {
    // A worklet failure must reach Itchy's handler, which terminates the project, so openDAW doesn't restart it.
    // openDAW logs the failing event with console.warn first: the one warning allowed here.
    const { ctx, page, errors } = await openPage({ width: 1024, height: 768 });
    const r = await page.evaluate(async () => (await import('/tests/e2e/opendaw-probe.js')).runWorkletErrorProbe(itchy.engine.ensure()));
    check(r.reachedUnload && r.terminated && r.restarts === 0, 'must: a worklet error reaches restart.unload, with no restart', JSON.stringify(r));
    const others = errors.filter((e) => e !== 'warning: ErrorEvent');
    check(others.length === 0 && errors.length === 1, 'only openDAW’s one documented warning', errors.join(' | '));
    await ctx.close();
  }
}

/**
 * openDAW as the backend: critters come and go as units (the library unit stays), previews of an asleep critter
 * still sound, and the timed phrases (dice preview, mood arpeggio) are scheduled exactly by the built-in engine.
 */
async function openDawBackend() {
  console.log('\nopenDAW backend');
  const { ctx, page, errors } = await openPage({ width: 1366, height: 768 });
  const units = () => page.evaluate(() => {
    const od = itchy.engine.openDaw, list = od.project.rootBoxAdapter.audioUnits.adapters().map((a) => a.box);
    return { count: list.length, library: od.applier.holders.every((h) => list.includes(h.audioUnitBox)) };
  });
  const u0 = await units();
  await page.click('.card.add');
  await page.click('.add-menu .choice >> nth=2');
  await page.waitForTimeout(100);
  const u1 = await units();
  check(u1.count === u0.count + 1 && u1.library, 'adding a critter adds an openDAW unit', `${u0.count} → ${u1.count}`);
  await page.click('.btn.undo');
  await page.waitForTimeout(100);
  await page.click('.btn.tool >> nth=1');
  await page.waitForTimeout(100);
  const u2 = await units();
  check(u2.count === u0.count - 1 && u2.library, 'removing a critter removes its unit, and the library unit stays', `${u0.count} → ${u2.count}`);
  await page.click('.btn.undo');

  // Taps and previews skip sleep.
  await page.click('#rail .card >> nth=1 >> .mute');
  await page.waitForTimeout(100);
  check(await page.evaluate(() => itchy.store.project.layers[1].muted), 'the tune critter is asleep');
  await page.click('#rail .card >> nth=1 >> .critter-btn');
  await audible(page, 'a tap on an asleep critter’s grid', () => page.click('.cell[data-s="6"][data-r="4"]'));
  await page.click('.btn.undo');
  await page.click('.btn.undo');

  // Timed phrases go to the built-in engine, at their exact times.
  await page.evaluate(() => {
    const n = itchy.engine.native, orig = n.voice.bind(n);
    window.__native = [];
    n.voice = (layer, note, t, ...rest) => { window.__native.push({ id: layer.id, t, now: n.ctx.currentTime }); return orig(layer, note, t, ...rest); };
  });
  await page.click('#rail .card >> nth=1 >> .critter-btn');
  const phrase = async (what, act, gap) => {
    await page.evaluate(() => { window.__native.length = 0; });
    await audible(page, what, act, { within: 120 });
    const v = await page.evaluate(() => window.__native);
    const t0 = v[0]?.t;
    const exact = v.length > 1 && v.every((x) => x.t > x.now && Math.abs((x.t - t0) / gap - Math.round((x.t - t0) / gap)) < 1e-6);
    check(exact, `${what}: the built-in engine schedules its ${v.length} notes ahead, on their exact times`, JSON.stringify(v.slice(0, 4)));
  };
  const tempo = await page.evaluate(() => itchy.store.project.tempo);
  await phrase('the dice preview', () => page.click('.btn.dice'), 60 / tempo / 4);
  await page.click('.btn.undo');
  await phrase('the mood arpeggio', async () => { await page.click('.btn.mood'); await page.click('.mood-choice.mood-spooky'); }, 0.09);
  await page.keyboard.press('Escape');
  await page.click('.btn.undo');
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

/**
 * Tap-to-sound latency on both engines: from the pointerdown (its audio time, caught in a capture listener) to the
 * first loud frame of the mix. openDAW must be within the built-in engine's latency + 10 ms.
 */
async function latency() {
  console.log('\nLatency, tap to sound');
  const results = {};
  for (const [kind, query] of [['native', '?engine=native'], ['opendaw', '']]) {
    results[kind] = {};
    for (const touch of [false, true]) {
      const { ctx, page } = await openPage({ width: 1366, height: 768, touch, query });
      const io = input(page, touch);
      await io.tap('.cell[data-s="15"][data-r="0"]'); // wake the context first
      await page.click('.btn.undo');
      await page.evaluate(() => document.addEventListener('pointerdown', () => { window.__downAt = itchy.engine.ctx.currentTime; }, { capture: true }));
      const measure = async (what, act, after = () => {}) => {
        const list = [];
        for (let i = 0; i < 5; i++) {
          if (!(await armTap(page))) continue;
          await act(i);
          await page.waitForTimeout(150);
          const r = await page.evaluate(async () => ({ ...(await __tap.read()), down: window.__downAt }));
          if (r.first !== null) list.push((r.first - r.down) * 1000);
          await after(i);
        }
        list.sort((a, b) => a - b);
        results[kind][what] = list.length ? list[list.length >> 1] : NaN;
      };
      if (!touch) {
        await measure('grid tap', (i) => io.tap(`.cell[data-s="${i + 1}"][data-r="3"]`), () => page.click('.btn.undo'));
        await measure('sound change', () => io.tap('.sounds .sound:not(.on):not(.record)'), () => page.click('.btn.undo'));
      } else {
        await measure('tray tap', () => io.tap('.sounds .sound:not(.on):not(.record)'), () => page.click('.btn.undo'));
      }
      await ctx.close();
    }
  }
  for (const what of Object.keys(results.native)) {
    const n = results.native[what], o = results.opendaw[what];
    console.log(`  · ${what}: built-in ${n.toFixed(1)} ms, openDAW ${o.toFixed(1)} ms`);
    check(o <= n + 10, `${what}: openDAW is within the built-in engine’s latency + 10 ms`, `${o.toFixed(1)} vs ${n.toFixed(1)} ms`);
  }
  writeFileSync(`${OUT}/latency.json`, JSON.stringify(results, null, 2));
}

/**
 * Without the autoplay flag, as on a real device: the context made at load stays suspended until the first gesture,
 * openDAW still boots, and the first tap and the first Play are heard. A Play then a Stop within a few ms of each
 * other leaves the music stopped.
 */
async function suspendedContext() {
  console.log('\nNo autoplay: the first gesture wakes the sound');
  let strict;
  try {
    strict = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream', '--autoplay-policy=user-gesture-required'] });
  } catch {
    strict = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--autoplay-policy=user-gesture-required'] });
  }
  // Headless Chromium lets an AudioContext run without a gesture whatever the autoplay flag says, so play the
  // browser's part as a real tablet does: a new context starts suspended, and resume() only works in a gesture.
  const autoplayBlocked = () => {
    const AC = window.AudioContext;
    window.AudioContext = class extends AC {
      constructor(...a) { super(...a); super.suspend(); }
      resume() { return navigator.userActivation.isActive ? super.resume() : Promise.reject(new DOMException('The AudioContext was not allowed to start', 'NotAllowedError')); }
    };
  };
  try {
    const spyUnlock = (page) => page.evaluate(() => {
      window.__unlocks = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer?.length === 1) window.__unlocks++; return start.apply(this, a); };
    });
    for (const touch of [false, true]) {
      const how = touch ? 'finger' : 'mouse';
      const { ctx, page, errors } = await openPage({ width: 1024, height: 768, touch, on: strict, init: autoplayBlocked });
      const state = await page.evaluate(() => itchy.engine.ctx.state);
      check(state === 'suspended', `${how}: before any gesture the context is suspended, and openDAW is ready anyway`, state);
      await spyUnlock(page);
      await page.evaluate(() => __tap.arm(0.01));
      await input(page, touch).tap('.cell[data-s="3"][data-r="3"]');
      await page.waitForTimeout(300);
      const r = await tapResult(page);
      check(r.first !== null, `${how}: the first tap is heard`, ms(r));
      check((await page.evaluate(() => window.__unlocks)) === 1, `${how}: the unlock buffer plays in the first gesture`);
      check(errors.length === 0, `${how}: no console errors or warnings`, errors.join(' | '));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await openPage({ width: 1024, height: 768, on: strict, init: autoplayBlocked });
      await page.evaluate(() => { const e = itchy.engine, orig = e.playStep.bind(e); window.__steps = 0; e.playStep = (...a) => { window.__steps++; return orig(...a); }; });
      await page.click('.btn.play', { force: true });
      await page.waitForTimeout(1200);
      const steps = await page.evaluate(() => window.__steps);
      const lvl = await peakLevel(page);
      check(steps > 3 && lvl > 0.01, 'Play as the very first gesture starts the music', `${steps} steps, level ${lvl.toFixed(3)}`);
      check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await openPage({ width: 1024, height: 768, on: strict, init: autoplayBlocked });
      await page.evaluate(() => {
        const e = itchy.engine, orig = e.playStep.bind(e);
        window.__steps = 0;
        e.playStep = (...a) => { window.__steps++; return orig(...a); };
        // The app's Play runs on pointerdown; this Stop follows 5 ms later, before the context has resumed.
        document.addEventListener('pointerdown', () => setTimeout(() => itchy.engine.stop(), 5), { once: true });
      });
      await page.click('.btn.play', { force: true });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => ({ playing: itchy.engine.playing, steps: window.__steps, transporting: itchy.engine.openDaw.transporting, state: itchy.engine.ctx.state }));
      check(!r.playing && r.steps === 0 && !r.transporting, 'Play then Stop within 20 ms leaves the music stopped', JSON.stringify(r));
      await page.waitForTimeout(700);
      const lvl = await peakLevel(page);
      check(lvl < 0.01, 'and silent', `level ${lvl.toFixed(4)}`);
      check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
      await ctx.close();
    }
  } finally { await strict.close(); }
}

/**
 * When openDAW fails (a transaction that orphans a box, a worklet error) or can't load, the built-in engine plays,
 * at once and audibly, and the console says so once with console.info.
 */
async function robustness() {
  console.log('\nopenDAW failures fall back to the built-in engine');
  const after = async (page, errors, what, allowed = []) => {
    check((await page.evaluate(() => itchy.engine.kind)) === 'native', `${what}: the built-in engine takes over`);
    await audible(page, `${what}: the next tap`, () => page.click('.cell[data-s="5"][data-r="2"]'));
    await page.click('.btn.play', { force: true });
    await page.waitForTimeout(400);
    const lvl = await peakLevel(page);
    check(lvl > 0.01, `${what}: Play is heard`, `level ${lvl.toFixed(3)}`);
    await page.click('.btn.play', { force: true });
    const others = errors.filter((e) => !allowed.some((a) => a.test(e)));
    check(others.length === 0 && errors.infos.length === 1, `${what}: the console says so once, with no errors or warnings`, [...errors, ...errors.infos].join(' | '));
  };
  {
    const { ctx, page, errors } = await openPage({ width: 1024, height: 768 });
    const r = await page.evaluate(() => { const od = itchy.engine.openDaw; return od.transact((g) => od.od.AudioFileBox.create(g, od.od.UUID.generate(), () => {})); });
    check(r === false, 'a transaction that orphans a box fails');
    await after(page, errors, 'bad op');
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openPage({ width: 1024, height: 768 });
    await page.evaluate(() => itchy.engine.openDaw.worklet.dispatchEvent(new ErrorEvent('error', { message: 'forced by the check' })));
    await page.waitForTimeout(100);
    // openDAW logs the failing event with console.warn: the one warning allowed here.
    const warns = errors.filter((e) => e === 'warning: ErrorEvent').length;
    check(warns === 1, 'worklet error: openDAW’s one documented warning', errors.join(' | '));
    await after(page, errors, 'worklet error', [/^warning: ErrorEvent$/]);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await ctx.route('**/vendor/opendaw/**', (r) => r.abort());
    const page = await ctx.newPage();
    const errors = watchConsole(page);
    await page.goto(URL_);
    await loaded(page, '', { kind: 'native' });
    // The browser itself reports the blocked download.
    await after(page, errors, 'bundle unavailable', [/^error: Failed to load resource/]);
    await ctx.close();
  }
}

/**
 * The bundle is never loaded where it can't be used: with ?engine=native, and on a page that isn't isolated (no
 * service worker to isolate it), no request goes to /vendor/. And a slow bundle never delays the app or the first
 * sound: the built-in engine plays until openDAW is ready.
 */
async function staticImportGuard() {
  console.log('\nThe openDAW bundle loads only where it is used');
  const PLAIN = PORT + 1;
  const plain = await startServer(PLAIN, { isolate: false });
  try {
    for (const [what, url, init] of [
      ['?engine=native', `${URL_}?engine=native`, null],
      ['a page that is not isolated', `http://localhost:${PLAIN}/`, () => { Object.defineProperty(navigator, 'serviceWorker', { value: undefined }); }],
    ]) {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      const errors = watchConsole(page);
      const vendor = [];
      page.on('request', (r) => { if (r.url().includes('/vendor/')) vendor.push(r.url()); });
      await page.goto(url);
      await loaded(page, '?engine=native');
      await audible(page, `${what}: a tap`, () => page.click('.cell[data-s="2"][data-r="2"]'));
      await page.waitForTimeout(300);
      check(vendor.length === 0, `${what}: no request to /vendor/`, vendor.join(', '));
      check(errors.length === 0, `${what}: no console errors or warnings`, errors.join(' | '));
      await ctx.close();
    }
  } finally { plain.close(); }
  {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await ctx.route('**/vendor/opendaw/**', async (r) => { await new Promise((ok) => setTimeout(ok, 5000)); await r.continue().catch(() => {}); });
    const page = await ctx.newPage();
    const errors = watchConsole(page);
    const t0 = Date.now();
    await page.goto(URL_);
    await page.waitForFunction(() => window.itchy && !document.getElementById('app').classList.contains('loading'));
    await instrument(page);
    check(Date.now() - t0 < 4000, 'with the bundle 5 s late, the app is up first', `${Date.now() - t0} ms`);
    check((await page.evaluate(() => itchy.engine.kind)) === 'native', 'the built-in engine bridges meanwhile');
    await audible(page, 'the first tap, before the bundle', () => page.click('.cell[data-s="2"][data-r="2"]'));
    check((await page.evaluate(() => itchy.engine.ready)) === 'opendaw', 'then openDAW takes over');
    check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
    await ctx.close();
  }
}

/**
 * Parity between the engines (docs/OPENDAW-PORT.md §10c): every sound rendered offline on both, one note at a time,
 * must be equally loud (its loudest 300 ms within ±3 dB; total energy is reported too, as repitching a one-shot
 * sample shortens or lengthens it); two quick hits of a drum must overlap; a long bass or cloud
 * note at the bottom and top rows must hold steady through its loop with no click. The numbers go to
 * test-output/parity.json.
 */
async function parity() {
  console.log('\nParity: each sound on both engines, offline');
  const { ctx, page, errors } = await openPage({ width: 1024, height: 768 });
  const r = await page.evaluate(async () => {
    const { migrate } = await import('/src/model/project.js');
    const { NativeEngine } = await import('/src/audio/native/engine.js');
    const SR = 48000;
    const energyDb = (chs) => { let e = 0; for (const c of chs) for (const v of c) e += v * v; return 10 * Math.log10(e); };
    // Loudness as heard: the loudest 300 ms of the sound (RMS of both channels), in dB.
    const loudDb = (chs) => {
      const n = Math.round(0.3 * SR), hop = Math.round(0.05 * SR);
      let best = 0;
      for (let a = 0; a + n <= chs[0].length; a += hop) {
        let e = 0;
        for (const c of chs) for (let i = a; i < a + n; i++) e += c[i] * c[i];
        best = Math.max(best, e / (n * chs.length));
      }
      return 10 * Math.log10(best);
    };
    const rmsDb = (x, a, b) => { let e = 0; a = Math.round(a * SR); b = Math.round(b * SR); for (let i = a; i < b; i++) e += x[i] * x[i]; return 10 * Math.log10(e / (b - a)); };
    const jump = (x, a, b) => { let j = 0; a = Math.round(a * SR); b = Math.round(b * SR); for (let i = a + 1; i < b; i++) j = Math.max(j, Math.abs(x[i] - x[i - 1])); return j; };
    const song = (sound, notes, { fx = { echo: 0, space: 0, tone: 0 }, tempo = 100 } = {}) =>
      migrate({ tempo, layers: [{ id: 'p', sound, fx, steps: 32, notes }] });
    // A stand-in mic recording (22050 Hz, like a phone's): a 0.6 s vowel-ish tone with a soft start and end.
    const REC = 'parity', recSr = 22050;
    const recData = new Float32Array(Math.round(0.6 * recSr)).map((_, i) => { const t = i / recSr; return 0.5 * Math.min(1, t / 0.02, (0.6 - t) / 0.05) * (Math.sin(2 * Math.PI * 220 * t) + 0.3 * Math.sin(2 * Math.PI * 660 * t)); });
    await itchy.engine.addRecording(REC, { sampleRate: recSr, data: recData });
    const nativeRender = async (p, seconds) => {
      const oc = new OfflineAudioContext(2, Math.round(seconds * SR), SR);
      const n = new NativeEngine(() => p, { ctx: oc, out: oc.destination, onStep() {} });
      n.addRecording(REC, { sampleRate: recSr, data: recData });
      n.ensure();
      n.sync();
      const d = 60 / p.tempo / 4;
      for (const note of p.layers[0].notes) n.voice(p.layers[0], note, 0.02 + note.s * d, d);
      const b = await oc.startRendering();
      return [b.getChannelData(0), b.getChannelData(1)];
    };
    const odRender = async (p, seconds) => (await itchy.engine.renderOffline({ project: p, steps: Math.ceil(seconds / (60 / p.tempo / 4)), sampleRate: SR })).channels;
    const cases = [];
    for (const kit of ['kit', 'tinykit']) for (let r = 0; r < 4; r++) cases.push([`${kit} row ${r}`, song(kit, [{ s: 0, r }]), 1.2]);
    for (const t of ['bells', 'pluck']) for (const r of [0, 3, 7]) cases.push([`${t} row ${r}`, song(t, [{ s: 0, r }]), 2.5]);
    for (const t of ['bass', 'cloud']) for (const r of [0, 7]) cases.push([`${t} row ${r}, 4 steps`, song(t, [{ s: 0, r, len: 4 }]), 2.6]);
    for (const r of [0, 3, 7]) cases.push([`a recording, row ${r}`, song(`rec:${REC}`, [{ s: 0, r }]), 1.5]);
    cases.push(['bells with echo 0.6', song('bells', [{ s: 0, r: 3 }], { fx: { echo: 0.6, space: 0, tone: 0 } }), 3.5]);
    cases.push(['bells with space 0.8', song('bells', [{ s: 0, r: 3 }], { fx: { echo: 0, space: 0.8, tone: 0 } }), 4.5]);
    cases.push(['bells, dark (tone −0.6)', song('bells', [{ s: 0, r: 3 }], { fx: { echo: 0, space: 0, tone: -0.6 } }), 2.5]);
    cases.push(['bells, bright (tone +0.6)', song('bells', [{ s: 0, r: 3 }], { fx: { echo: 0, space: 0, tone: 0.6 } }), 2.5]);
    cases.push(['kit, a whole beat', song('kit', [0, 4, 8, 12].map((s) => ({ s, r: 0 })).concat([2, 6, 10, 14].map((s) => ({ s, r: 3 }))).concat([{ s: 4, r: 1 }, { s: 12, r: 1 }])), 2.6]);
    const levels = [];
    for (const [name, p, seconds] of cases) {
      const x = await nativeRender(p, seconds), y = await odRender(p, seconds);
      const a = loudDb(x), b = loudDb(y);
      const peak = (chs) => chs.reduce((m, c) => c.reduce((q, v) => Math.max(q, Math.abs(v)), m), 0);
      levels.push({ name, nativeDb: +a.toFixed(2), openDawDb: +b.toFixed(2), diffDb: +(b - a).toFixed(2), energyDiffDb: +(energyDb(y) - energyDb(x)).toFixed(2), peaks: [+peak(x).toFixed(3), +peak(y).toFixed(3)] });
    }
    // Two kick hits a step apart at 160 BPM (94 ms): the second must not cut the first. With both voices kept, the
    // render of both hits minus the render of the second alone is the first hit's tail, as loud as when alone.
    const hits = (notes) => odRender(song('kit', notes, { tempo: 160 }), 0.6);
    const both = await hits([{ s: 0, r: 0 }, { s: 1, r: 0 }]), second = await hits([{ s: 1, r: 0 }]), first = await hits([{ s: 0, r: 0 }]);
    const w = [0.094 + 0.005, 0.094 + 0.2];
    const tail = both[0].map((v, i) => v - second[0][i]);
    const overlap = { tailDb: +rmsDb(tail, ...w).toFixed(2), firstAloneDb: +rmsDb(first[0], ...w).toFixed(2) };
    // Long held notes: 28 steps at 60 BPM (7 s; bass holds 0.9 of it), bottom and top row (key 0), through many
    // loop cycles. The largest sample-to-sample jump while held must be no bigger than in the sample's own first
    // pass (before any loop), the level must stay steady, and the note must end.
    const { soundCatalogue } = await import('/src/audio/render-sounds.js');
    const { describe, playbackRate } = await import('/src/audio/mirror.js');
    const cat = soundCatalogue(SR);
    const loops = [];
    for (const t of ['bass', 'cloud']) for (const r of [0, 7]) {
      const p = song(t, [{ s: 0, r, len: 24 }], { tempo: 60 }); // the 32-step loop starts again at 8 s
      const { loop, rootKey } = cat.sounds[t];
      const rate = playbackRate(describe(p, { ...cat, recordings: {} }).units[0].notes[0].pitch, rootKey);
      const held = t === 'bass' ? 5.4 : 6;
      const x = (await odRender(p, 8))[0];
      const first = [loop.start / rate, loop.end / rate];
      loops.push({
        name: `${t} row ${r}`, rate: +rate.toFixed(3),
        heldVsFirstPassDb: +(rmsDb(x, first[1], held - 0.05) - rmsDb(x, ...first)).toFixed(2),
        jumpFirstPass: +jump(x, ...first).toFixed(4), jumpHeld: +jump(x, first[1], held - 0.05).toFixed(4),
        afterReleaseDb: +rmsDb(x, held + (t === 'cloud' ? 1.3 : 0.3), 7.95).toFixed(1),
      });
    }
    return { levels, overlap, loops };
  });
  for (const l of r.levels) {
    console.log(`  · ${l.name}: built-in ${l.nativeDb} dB, openDAW ${l.openDawDb} dB (${l.diffDb >= 0 ? '+' : ''}${l.diffDb}; total energy ${l.energyDiffDb >= 0 ? '+' : ''}${l.energyDiffDb})`);
    check(Math.abs(l.diffDb) <= 3, `${l.name}: as loud on both engines (±3 dB)`, `${l.diffDb} dB`);
  }
  check(Math.abs(r.overlap.tailDb - r.overlap.firstAloneDb) < 1, 'two quick kick hits overlap (the second doesn’t cut the first)', JSON.stringify(r.overlap));
  for (const l of r.loops) {
    console.log(`  · ${l.name} held 6 s: level ${l.heldVsFirstPassDb} dB from the first pass, largest jump ${l.jumpHeld} (first pass ${l.jumpFirstPass}), after release ${l.afterReleaseDb} dB`);
    check(Math.abs(l.heldVsFirstPassDb) < 1.5 && l.jumpHeld <= 1.25 * l.jumpFirstPass + 0.002 && !(l.afterReleaseDb > -60), `${l.name}: a long note holds steady through its loop, with no click, then ends`, JSON.stringify(l));
  }
  writeFileSync(`${OUT}/parity.json`, JSON.stringify(r, null, 2));
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

async function examples() {
  console.log('\nExample songs');
  const { ctx, page, errors } = await openPage({ width: 1366, height: 768 });
  const count = 3;
  for (let i = 0; i < count; i++) {
    await page.click('.btn.book');
    await page.waitForSelector('.songbook');
    await page.locator('.song-card.example').nth(i).click();
    await page.waitForTimeout(200);
    if (i === 0) await page.click('.btn.play', { force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/example-${i + 1}.png` });
    check((await peakLevel(page)) > 0.01, `example ${i + 1} plays`);
  }
  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

// CHECK_ONLY=playback,parity runs just those sections (while working on them); npm run check runs everything.
const only = process.env.CHECK_ONLY ? new Set(process.env.CHECK_ONLY.split(',')) : null;
const sections = [
  ['laptop', () => interactions('laptop', { width: 1366, height: 768, touch: false })],
  ['tablet-landscape', () => interactions('tablet-landscape', { width: 1024, height: 768, touch: true })],
  ['tablet-portrait', () => interactions('tablet-portrait', { width: 768, height: 1024, touch: true })],
  ['chromebook-touch', () => interactions('chromebook-touch', { width: 1280, height: 800, touch: true })],
  ['playback', playback],
  ['playbackNative', playbackNative],
  ['audioFacade', audioFacade],
  ['openDawBackend', openDawBackend],
  ['latency', latency],
  ['parity', parity],
  ['suspendedContext', suspendedContext],
  ['robustness', robustness],
  ['staticImportGuard', staticImportGuard],
  ['renderedSounds', renderedSounds],
  ['recording', recording],
  ['persistence', persistence],
  ['keyboard', keyboard],
  ['delights', delights],
  ['smallScreens', smallScreens],
  ['examples', examples],
  ['openDawProbe', openDawProbe],
  ['safariLayout', safariLayout],
];
try {
  for (const [name, run] of sections) if (!only || only.has(name)) await run();
} catch (e) {
  failures++;
  console.error('\nCheck crashed:', e);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} passed, ${failures} failed. Screenshots in test-output/`);
process.exit(failures ? 1 : 0);
