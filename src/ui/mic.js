// Recording: press the red mic, make a noise, and it becomes the critter's sound —
// playable at every pitch on the grid. Recordings are kept in "my sounds" for every song.

import { h, instantPress, toast } from './widgets.js';
import { ICONS } from './icons.js';
import { critterSVG } from './critters.js';
import { COLORS, recordingId } from '../model/sounds.js';
import { makeId, recordingsUsed, findLayer } from '../model/project.js';
import { MicRecorder, MAX_SECONDS } from '../audio/recorder.js';

export function micPlugin(storage) {
  let rec, library = [], denied = false, busy = false, app, ctxRef;

  async function refreshLibrary() {
    try { library = (await storage.listRecordings()).slice(0, 4); } catch { library = []; }
    app.panel.sig = ''; // force the sound list to redraw
    app.panel.render();
  }

  async function ensureBuffers(ids) {
    const { engine } = ctxRef;
    for (const id of ids) {
      if (engine.hasRecording(id)) continue;
      const r = await storage.loadRecording(id).catch(() => null);
      if (r) engine.addRecording(id, r);
    }
  }

  function wave(peaks) {
    if (!peaks?.length) return '';
    const w = 48, hh = 14, bw = w / peaks.length;
    const bars = peaks.map((p, i) => `<rect x="${(i * bw).toFixed(1)}" y="${(hh / 2 - Math.max(1, p * hh) / 2).toFixed(1)}" width="${Math.max(1, bw - 0.6).toFixed(1)}" height="${Math.max(1, p * hh).toFixed(1)}" rx="0.6"/>`).join('');
    return `<svg class="wave" viewBox="0 0 ${w} ${hh}" aria-hidden="true">${bars}</svg>`;
  }

  function soundButtons(layer) {
    const { store, engine } = ctxRef;
    const out = [];
    const ids = library.map((r) => r.id);
    // Make sure the critter's current recording is shown even if it's older than the newest four.
    const cur = recordingId(layer.sound);
    const items = cur && !ids.includes(cur) ? [{ id: cur, peaks: [] }, ...library.slice(0, 3)] : library;
    items.forEach((r, i) => {
      const sound = `rec:${r.id}`;
      const on = layer.sound === sound;
      const b = h('button', {
        class: `sound rec-sound ${on ? 'on' : ''}`, type: 'button', 'aria-pressed': String(on),
        'aria-label': `My recorded sound ${i + 1}`, title: 'My sound',
        html: critterSVG('mic', COLORS[layer.color]) + wave(r.peaks),
      });
      if (on) b.append(h('span', { class: 'tick-badge', html: ICONS.check }));
      instantPress(b, async () => {
        engine.ensure();
        await ensureBuffers([r.id]);
        app.panel.chooseSound(sound);
      });
      out.push(b);
    });
    const micBtn = h('button', {
      class: `sound record ${denied ? 'denied' : ''}`, type: 'button',
      'aria-label': denied ? 'Microphone is off. Try again?' : 'Record my own sound', title: 'Record my own sound',
      html: denied ? ICONS.micOff : ICONS.mic,
    });
    instantPress(micBtn, () => record(store.layer));
    out.push(micBtn);
    return out;
  }

  // ---------------------------------------------------------------- the recording bubble

  function bubble() {
    const ring = `<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="ring-bg"/><circle cx="50" cy="50" r="46" class="ring-fg" pathLength="100"/></svg>`;
    const face = h('div', { class: 'rec-face', html: critterSVG('mic', '#e8384f', '') });
    const stop = h('button', { class: 'btn rec-stop', type: 'button', 'aria-label': 'Stop recording', title: 'Stop', html: ICONS.stop });
    const el = h('div', { class: 'rec-overlay asking', role: 'dialog', 'aria-label': 'Recording' },
      h('div', { class: 'rec-bubble' }, h('div', { class: 'rec-ring', html: ring }), face), stop);
    document.getElementById('overlay-root').append(el);
    return { el, face, stop, set(level, progress) {
      el.style.setProperty('--level', level.toFixed(2));
      el.style.setProperty('--progress', progress.toFixed(3));
    } };
  }

  async function record(layer) {
    if (busy) return;
    busy = true;
    const { store, engine } = ctxRef;
    engine.ensure();
    const wasPlaying = engine.playing;
    if (wasPlaying) engine.stop(); // a clean recording, without the music leaking in
    const ui = bubble();
    let finish;
    const done = new Promise((r) => { finish = r; });
    instantPress(ui.stop, () => finish());
    ui.el.addEventListener('pointerdown', (e) => { if (e.target === ui.el) finish(); });
    const key = (e) => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); finish(); } };
    document.addEventListener('keydown', key);
    try {
      const status = await rec.open();
      if (status !== 'ok') {
        denied = true;
        engine.uiSound('bonk');
        toast(ICONS.micOff, status === 'denied' ? 'No microphone? That’s OK — try the other sounds!' : 'No microphone found. Try the other sounds!');
        return;
      }
      denied = false;
      ui.el.classList.remove('asking');
      ui.el.classList.add('recording');
      ui.stop.focus();
      engine.uiSound('add');
      rec.onFull = () => finish();
      await rec.start({ onLevel: (lvl, prog) => ui.set(lvl, prog) });
      const timer = setTimeout(finish, MAX_SECONDS * 1000 + 300);
      await done;
      clearTimeout(timer);
      const clip = await rec.stop();
      rec.close();
      if (!clip) {
        engine.uiSound('bonk');
        toast(ICONS.mic, 'I didn’t hear anything. Try again, a bit louder!');
        return;
      }
      const id = makeId('r');
      engine.addRecording(id, clip);
      await storage.saveRecording(id, { ...clip, created: Date.now() }).catch((e) => console.warn('Itchy: recording not saved', e));
      const target = findLayer(store.project, layer.id) || store.layer;
      store.change(() => { target.sound = `rec:${id}`; });
      store.select(target.id);
      await refreshLibrary();
      engine.preview(target, 3);
      if (wasPlaying) setTimeout(() => engine.play(), 500);
    } catch (e) {
      console.warn('Itchy: recording failed', e);
      engine.uiSound('bonk');
      toast(ICONS.micOff, 'The microphone didn’t work. Try the other sounds!');
      rec.close();
    } finally {
      document.removeEventListener('keydown', key);
      ui.el.remove();
      busy = false;
      app.panel.sig = '';
      app.panel.render();
    }
  }

  return {
    init(ctx) {
      ctxRef = ctx;
      rec = new MicRecorder(ctx.engine);
      ctx.recordInto = (layer) => record(layer);
    },
    attach(ctx) {
      app = ctx.app;
      app.panel.extraSounds = soundButtons;
      app.panel.extraSig = () => `${library.map((r) => r.id).join(',')}|${denied}`;
      refreshLibrary();
      ensureBuffers(recordingsUsed(ctx.store.project));
    },
    render(ctx, what) {
      if (what === 'open' || what === 'project') ensureBuffers(recordingsUsed(ctx.store.project));
    },
  };
}
