// The songbook: every song you've made, plus example songs to explore.
// Opening a song never throws the current one away — it's always still here.

import { h, instantPress } from './widgets.js';
import { ICONS } from './icons.js';
import { COLORS } from '../model/sounds.js';
import { createProject, migrate, makeId, clone } from '../model/project.js';
import { previewOf } from '../storage/storage.js';
import { EXAMPLES } from '../model/examples.js';
import { rowColor } from './grid.js';

function thumb(preview) {
  const W = 160, H = 96, k = 2; // drawn at 2× so it stays sharp on high-density screens
  const cv = h('canvas', { class: 'thumb', width: W * k, height: H * k, 'aria-hidden': 'true' });
  const g = cv.getContext('2d');
  g.scale(k, k);
  const box = (x, y, w, hh, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, hh, r); else g.rect(x, y, w, hh); g.fill(); };
  const lanes = Math.max(1, preview.length);
  const laneH = H / lanes;
  preview.forEach((l, i) => {
    const y0 = i * laneH;
    g.fillStyle = COLORS[l.color] + '24';
    box(0, y0 + 1, W, laneH - 2, 5);
    const rows = l.sound === 'kit' || l.sound === 'tinykit' ? 4 : 8;
    const cw = W / (l.steps || 16), rh = (laneH - 6) / rows;
    for (const [s, r] of l.notes) {
      g.fillStyle = rowColor(l.sound, r);
      box(s * cw + 1.5, y0 + 3 + (rows - 1 - r) * rh, Math.max(2, cw - 3), Math.max(2, rh - 1), 1.5);
    }
  });
  return cv;
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
      ...mine.map((m, i) => card(thumb(m.preview), `My song ${i + 1}`, () => choose(() => storage.loadProject(m.id)), m.id === store.project.id ? 'current' : '')),
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
