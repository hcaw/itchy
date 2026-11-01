// The critter rail: one card per layer. Tap a critter to edit it (and hear it);
// tap its speaker to send it to sleep (mute) or wake it. The + adds a new critter.

import { h, instantPress, popover, closePopovers } from './widgets.js';
import { critterSVG } from './critters.js';
import { ICONS } from './icons.js';
import { COLORS, soundInfo, soundKind, rowsForSound, BEAT_SOUNDS, TUNE_SOUNDS, SOUNDS } from '../model/sounds.js';
import { createLayer, nextColor, MAX_LAYERS } from '../model/project.js';
import { rowColor, edgeColor } from './grid.js';

export class Rail {
  constructor(root, { store, engine, onRecordNew }) {
    Object.assign(this, { root, store, engine, onRecordNew });
    this.cards = new Map();
    this.sig = '';
    root.addEventListener('focusin', (e) => this.reveal(e.target.closest('.card') || e.target));
  }

  render() {
    const p = this.store.project;
    const sig = p.layers.map((l) => `${l.id}:${l.sound}:${l.color}`).join('|');
    if (sig !== this.sig) this.build();
    this.sig = sig;
    for (const l of p.layers) {
      const c = this.cards.get(l.id);
      const chosen = l.id === this.store.view.selected;
      if (chosen && !c.card.classList.contains('selected')) this.reveal(c.card);
      c.card.classList.toggle('selected', chosen);
      c.card.classList.toggle('asleep', l.muted);
      c.select.setAttribute('aria-pressed', String(l.id === this.store.view.selected));
      c.mute.setAttribute('aria-pressed', String(l.muted));
      c.mute.setAttribute('aria-label', l.muted ? 'Wake up (unmute)' : 'Sleep (mute)');
      c.mute.title = c.mute.getAttribute('aria-label');
      c.mute.innerHTML = l.muted ? ICONS.sleep : ICONS.speaker;
      this.drawMap(l, -1);
    }
    this.add.hidden = p.layers.length >= MAX_LAYERS;
    // With lots of critters the cards get smaller, so they all fit without scrolling.
    this.root.classList.toggle('compact', p.layers.length > 3);
  }

  /** Keep the chosen critter (or the focused control) in view in a scrolling rail. */
  reveal(el) {
    requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }

  build() {
    this.root.innerHTML = '';
    this.cards.clear();
    const p = this.store.project;
    p.layers.forEach((l, i) => {
      const info = soundInfo(l.sound);
      const label = `${info.label} critter ${i + 1}`;
      const select = h('button', { class: 'critter-btn', type: 'button', 'aria-label': `Edit ${label}`, title: info.label, html: critterSVG(info.shape, COLORS[l.color], '') });
      select.addEventListener('animationend', (e) => e.target.classList?.remove('sing'));
      const mute = h('button', { class: 'btn mute', type: 'button' });
      const map = h('canvas', { class: 'minimap', width: 96, height: 28, 'aria-hidden': 'true' });
      const card = h('div', { class: 'card', style: { '--c': COLORS[l.color], '--edge': edgeColor(COLORS[l.color]) } }, select, mute, map);
      instantPress(select, () => {
        this.engine.ensure();
        const wasSelected = this.store.view.selected === l.id;
        this.store.select(l.id);
        // Say hello: a little sound in this critter's voice.
        const layer = this.store.layer;
        this.engine.preview(layer, soundKind(layer.sound) === 'beat' ? 0 : wasSelected ? 5 : 3);
        this.bounce(l.id);
      });
      mute.addEventListener('click', () => {
        const layer = this.store.project.layers.find((x) => x.id === l.id);
        this.store.change(() => { layer.muted = !layer.muted; });
        this.engine.uiSound(layer.muted ? 'pop' : 'add');
        if (!layer.muted) this.engine.preview(layer, 0, 0.6);
      });
      this.cards.set(l.id, { card, select, mute, map });
      this.root.append(card);
    });
    this.add = h('button', { class: 'card add', type: 'button', 'aria-label': 'Add a critter', title: 'Add a critter', html: ICONS.plus });
    instantPress(this.add, () => { this.engine.ensure(); this.engine.uiSound('tick'); this.openAddMenu(); });
    this.root.append(this.add);
  }

  openAddMenu() {
    const p = this.store.project;
    const color = nextColor(p);
    const choices = [...BEAT_SOUNDS.slice(0, 1), ...TUNE_SOUNDS];
    const box = h('div', { class: 'add-menu' });
    for (const sound of choices) {
      const info = SOUNDS[sound];
      const b = h('button', { class: 'choice', type: 'button', 'aria-label': `New ${info.label} critter`, title: info.label, html: critterSVG(info.shape, COLORS[color]) });
      instantPress(b, () => this.addLayer(sound, color));
      box.append(b);
    }
    const mic = h('button', { class: 'choice mic', type: 'button', 'aria-label': 'New critter with my own sound (record)', title: 'Record my own sound', html: ICONS.mic });
    instantPress(mic, () => { const layer = this.addLayer('bells', color, false); this.onRecordNew?.(layer); });
    box.append(mic);
    this.menu = popover(this.add, box, { cls: 'add-pop' });
  }

  addLayer(sound, color, preview = true) {
    closePopovers();
    const layer = createLayer(sound, { color });
    this.store.change((p) => { if (p.layers.length < MAX_LAYERS) p.layers.push(layer); });
    this.store.select(layer.id);
    this.engine.sync();
    if (preview) this.engine.preview(layer, soundKind(sound) === 'beat' ? 0 : 3);
    this.engine.uiSound('add');
    requestAnimationFrame(() => this.bounce(layer.id));
    return layer;
  }

  bounce(id) {
    const c = this.cards.get(id);
    if (!c) return;
    const svg = c.select.querySelector('.critter');
    svg.classList.remove('sing');
    void svg.getBoundingClientRect();
    svg.classList.add('sing');
  }

  /** Mini-map of the layer's notes, with the playhead. Drawn at the screen's pixel density. */
  drawMap(layer, step) {
    const c = this.cards.get(layer.id);
    if (!c) return;
    const cv = c.map, g = cv.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssW = cv.clientWidth || 96, cssH = cv.clientHeight || 28;
    if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) {
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rows = rowsForSound(layer.sound);
    const pad = 3, w = cssW - pad * 2, hgt = cssH - pad * 2;
    g.clearRect(0, 0, cssW, cssH);
    const cw = w / layer.steps, rh = hgt / rows;
    if (step >= 0) {
      g.fillStyle = 'rgba(42, 35, 64, 0.10)';
      roundRect(g, pad + step * cw, 1, cw, cssH - 2, 2);
    }
    for (const n of layer.notes) {
      g.fillStyle = layer.muted ? '#c9c3d3' : rowColor(layer.sound, n.r);
      const x = pad + n.s * cw + 0.5, y = pad + hgt - (n.r + 1) * rh + 0.5;
      roundRect(g, x, y, Math.max(1.5, cw * (n.len || 1) - 1), Math.max(1.5, rh - 1), Math.min(1.5, rh / 2));
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  g.fill();
}
