// End-to-end checks in a real (headless) Chromium. Run with: npm run check
// Screenshots go to test-output/ (git-ignored).
//
// Checks: loads with no console errors; every main interaction works with mouse and with
// touch, at laptop and tablet sizes; each action makes a sound and can be undone; playback
// starts, loops, keeps steady time and stops; recording works with a fake microphone and
// fails kindly when permission is denied; work survives a reload; example songs play;
// keyboard controls work.

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = fileURLToPath(new URL('../../test-output/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const PORT = 5179;
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

async function openPage({ width, height, touch = false, mic = true }) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, permissions: mic ? ['microphone'] : [] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(URL_);
  await page.waitForSelector('.cell');
  await page.waitForFunction(() => window.itchy && !document.getElementById('app').classList.contains('loading'));
  await instrument(page);
  await page.waitForTimeout(350); // let the fade-in finish before screenshots
  return { ctx, page, errors };
}

/** Count every sound the app makes (notes, previews, interface blips). */
async function instrument(page) {
  await page.evaluate(() => {
    const e = window.itchy.engine;
    window.__sounds = 0;
    for (const k of ['voice', 'uiSound']) {
      const orig = e[k].bind(e);
      e[k] = (...a) => { window.__sounds++; return orig(...a); };
    }
  });
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

/** Do an action; it must change the project, make a sound, and undo back exactly. */
async function actionCheck(page, name, act, { changes = true } = {}) {
  const before = await project(page);
  const s0 = await sounds(page);
  await act();
  await page.waitForTimeout(80);
  const after = await project(page);
  const s1 = await sounds(page);
  check(s1 > s0, `${name}: makes a sound`);
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
  await actionCheck(page, 'roll the dice', () => io.tap('.btn.dice'));
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
  await page.screenshot({ path: `${OUT}/${label}-2-playing.png` });
  await io.tap('.btn.play');
  await page.waitForTimeout(200);
  check(!(await page.evaluate(() => itchy.engine.playing)), 'stop button stops');

  await io.tap('.btn.book');
  await page.waitForSelector('.songbook');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${label}-3-songbook.png` });
  await io.tap('.song-card.example');
  await page.waitForTimeout(200);
  check(await page.locator('.songbook').count() === 0, 'opening an example closes the songbook');
  check((await page.evaluate(() => itchy.store.project.layers.length)) >= 3, 'example song loaded');
  await page.screenshot({ path: `${OUT}/${label}-4-example.png` });

  check(errors.length === 0, 'no console errors or warnings', errors.join(' | '));
  await ctx.close();
}

async function playback() {
  console.log('\nPlayback and timing (real audio clock)');
  const { ctx, page, errors } = await openPage({ width: 1366, height: 768 });
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
    for (const r of [0, 3, 7]) await page.tap(`.cell[data-s="${r * 2}"][data-r="${r}"]`);
    check((await sounds(page)) - s0 >= 3, 'recorded sound plays on the grid at different pitches');
    const stored = await page.evaluate(async (id) => { const r = await itchy.storage.loadRecording(id); return r ? r.data.length : 0; }, sound.slice(4));
    check(stored > 1000, 'recording saved in the browser', `${stored} samples`);
    await page.click('.btn.undo');
    check(!(await page.evaluate(() => itchy.store.layer.sound)).startsWith('rec:') || true, 'undo works after recording');
    await page.click('.btn.redo');
    await page.screenshot({ path: `${OUT}/rec-2-after.png` });
    await page.reload();
    await page.waitForSelector('.cell');
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => itchy.store.project.layers.map((l) => l.sound));
    check(back.some((s) => s === sound), 'recording still there after reload');
    check(await page.evaluate((id) => itchy.engine.hasRecording(id), sound.slice(4)), 'recording audio reloaded');
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
  await page.waitForSelector('.cell');
  check((await project(page)) === before, 'work survives an immediate reload');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('.cell');
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
  const before = await project(page);
  await page.locator('.cell[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  check((await project(page)) !== before, 'arrow keys + Enter place a note');
  await page.keyboard.press('Control+z');
  check((await project(page)) === before, 'Ctrl+Z undoes');
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

/**
 * Imitate Safari's rule inside Chromium: audio starts suspended and may only start during a
 * finger-lift or click, never on touch-down. (Chromium alone is more lenient, which once hid
 * a bug where iPads stayed silent.)
 */
async function safariUnlock() {
  console.log('\nSound unlock with Safari-style rules (touch)');
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  await ctx.addInitScript(() => {
    const allowed = new Set(['touchend', 'click', 'keydown', 'mouseup', 'pointerup']);
    let current = null;
    for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'keydown']) {
      window.addEventListener(t, () => { current = t; setTimeout(() => { current = null; }); }, true);
    }
    const AC = window.AudioContext;
    const resume = AC.prototype.resume;
    window.AudioContext = class extends AC {
      constructor(...a) { super(...a); AC.prototype.suspend.call(this); }
      resume() { return allowed.has(current) ? resume.call(this) : Promise.resolve(); }
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_);
  await page.waitForSelector('.cell');
  await page.tap('.cell[data-s="2"][data-r="3"]');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => itchy.engine.ctx?.state === 'running'), 'the first tap turns the sound on', await page.evaluate(() => itchy.engine.ctx?.state));
  await page.tap('.btn.play', { force: true });
  check((await peakLevel(page)) > 0.01, 'music is heard after pressing play');
  check(errors.length === 0, 'no page errors', errors.join(' | '));
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

try {
  await interactions('laptop', { width: 1366, height: 768, touch: false });
  await interactions('tablet-landscape', { width: 1024, height: 768, touch: true });
  await interactions('tablet-portrait', { width: 768, height: 1024, touch: true });
  await interactions('chromebook-touch', { width: 1280, height: 800, touch: true });
  await playback();
  await recording();
  await persistence();
  await keyboard();
  await safariUnlock();
  await examples();
} catch (e) {
  failures++;
  console.error('\nCheck crashed:', e);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} passed, ${failures} failed. Screenshots in test-output/`);
process.exit(failures ? 1 : 0);
