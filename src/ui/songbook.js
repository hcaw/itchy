// The songbook: every song you've made, plus example songs to explore.
// Opening a song never throws the current one away — it's always still here.

import { h, instantPress } from './widgets.js';
import { ICONS } from './icons.js';
import { COLORS, soundInfo } from '../model/sounds.js';
import { critterSVG } from './critters.js';
import { createProject, migrate, makeId, clone } from '../model/project.js';
import { previewOf } from '../storage/storage.js';
import { EXAMPLES } from '../model/examples.js';
import { rowColor } from './grid.js';

function thumb(preview) {
  const cv = h('canvas', { class: 'thumb', width: 320, height: 192, 'aria-hidden': 'true' });
  // Draw once it's on screen, at its real size and the screen's pixel density, so it stays sharp.
  requestAnimationFrame(() => paintThumb(cv, preview));
  return cv;
}

function paintThumb(cv, preview) {
  const W = cv.clientWidth || 160, H = cv.clientHeight || 96;
  const k = Math.min(3, window.devicePixelRatio || 1);
  cv.width = Math.round(W * k);
  cv.height = Math.round(H * k);
  const g = cv.getContext('2d');
  g.setTransform(k, 0, 0, k, 0, 0);
  const box = (x, y, w, hh, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, hh, r); else g.rect(x, y, w, hh); g.fill(); };
  const lanes = Math.max(1, preview.length);
  const gap = 3, laneH = (H - gap * (lanes - 1)) / lanes;
  preview.forEach((l, i) => {
    const y0 = i * (laneH + gap);
    g.fillStyle = COLORS[l.color] + '26';
    box(0, y0, W, laneH, 6);
    const rows = l.sound === 'kit' || l.sound === 'tinykit' ? 4 : 8;
    const pad = 4;
    const cw = (W - pad * 2) / (l.steps || 16), rh = (laneH - pad * 2) / rows;
    for (const [s, r] of l.notes) {
      g.fillStyle = rowColor(l.sound, r);
      box(pad + s * cw + 1, y0 + pad + (rows - 1 - r) * rh, Math.max(2, cw - 2), Math.max(2, rh - 1), 1.5);
    }
  });
}

export function songbookPlugin(storage) {
  let ctxRef;

  async function open() {
    const { store, engine } = ctxRef;
    await store.flush();
    const mine = await storage.listProjects().catch(() => []);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); ctxRef.app.top.book.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const choose = async (makeProject) => {
      engine.ensure();
      engine.uiSound('whoosh');
      const p = await makeProject();
      if (p) await store.open(p);
      close();
    };
    const card = (content, label, onPick, cls = '') => {
      const b = h('button', { class: `song-card ${cls}`, type: 'button', 'aria-label': label, title: label }, content);
      b.addEventListener('click', onPick); // click, not pointerdown: scrolling the book must not open a song
      return b;
    };

    const mineGrid = h('div', { class: 'song-grid' },
      card(h('div', { class: 'new-song', html: ICONS.plus }), 'New song', () => choose(() => createProject()), 'new'),
      ...mine.map((m, i) => {
        const current = m.id === store.project.id;
        // Pictures, not names: the song's critters sit under its notes.
        const faces = h('span', { class: 'song-faces', 'aria-hidden': 'true', html: m.preview.slice(0, 6).map((l) => critterSVG(soundInfo(l.sound).shape, COLORS[l.color])).join('') });
        const content = h('div', { class: 'ex-wrap' }, thumb(m.preview), faces, current ? h('span', { class: 'now-badge', html: ICONS.play }) : null);
        return card(content, current ? `My song ${i + 1} (open now)` : `My song ${i + 1}`, () => choose(() => storage.loadProject(m.id)), current ? 'current' : '');
      }),
    );
    const exGrid = h('div', { class: 'song-grid' },
      ...EXAMPLES.map((ex) => {
        const p = migrate(clone(ex));
        return card(h('div', { class: 'ex-wrap' }, thumb(previewOf(p)), h('span', { class: 'ex-star', html: ICONS.star }), h('span', { class: 'ex-name' }, ex.name)),
          `Example: ${ex.name}`, () => choose(() => {
            const copy = migrate(clone(ex));
            copy.id = makeId('p');
            copy.created = copy.updated = Date.now();
            return copy;
          }), 'example');
      }),
    );
    const closeBtn = h('button', { class: 'btn close', type: 'button', 'aria-label': 'Close', title: 'Close', html: ICONS.close });
    instantPress(closeBtn, () => { engine.uiSound('pop'); close(); });
    const overlay = h('div', { class: 'songbook-overlay', role: 'dialog', 'aria-label': 'My songs', 'aria-modal': 'true' },
      h('div', { class: 'songbook' },
        h('div', { class: 'songbook-head' }, h('span', { class: 'big-icon', html: ICONS.book }), closeBtn),
        mineGrid,
        h('div', { class: 'songbook-sub', html: ICONS.star }),
        exGrid,
      ),
    );
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.getElementById('overlay-root').append(overlay);
    (mineGrid.querySelector('.current') || mineGrid.firstChild).focus();
  }

  return {
    init(ctx) {
      ctxRef = ctx;
      ctx.openSongbook = open;
    },
  };
}
