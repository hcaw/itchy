// The grid of the selected critter. Time runs left→right, pitch bottom→top.
// Tap or drag to paint notes; tap a lit cell (or drag from one) to rub out.
// Arrow keys move, Space/Enter toggles.

import { h } from './widgets.js';
import { KIT_ICONS, ICONS } from './icons.js';
import { rowsForSound, soundKind, KIT_PIECES, COLORS } from '../model/sounds.js';
import { noteAt, setNote } from '../model/project.js';
import { isHomeRow } from '../model/scales.js';

// Rainbow ladder for tune rows (bottom → top) and fixed colours for kit pieces.
export const TUNE_COLORS = ['#e8590c', '#f08c00', '#f5c400', '#66a80f', '#0ca678', '#1c7ed6', '#5f3dc4', '#c2255c', '#e03131', '#f76707', '#fab005', '#37b24d'];
export const KIT_COLORS = ['#3b5bdb', '#f76707', '#d6336c', '#2f9e44'];

/**
 * The colour for a critter's frame and selection ring. Light colours (yellow) get a darker,
 * richer edge so they still stand out on the cream background; the rest stay soft.
 */
export function edgeColor(hex) {
  const n = parseInt(hex.slice(1), 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
  const lin = rgb.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return lum > 0.5 ? `color-mix(in oklch, ${hex} 72%, #5c3d00)` : `color-mix(in srgb, ${hex} 70%, #fff)`;
}

export function rowColor(sound, r) {
  return soundKind(sound) === 'beat' ? KIT_COLORS[r % 4] : TUNE_COLORS[r % TUNE_COLORS.length];
}

export class Grid {
  constructor(root, { store, engine, onFirstNote }) {
    this.root = root;
    this.store = store;
    this.engine = engine;
    this.onFirstNote = onFirstNote;
    this.cells = [];   // [step][row] → element
    this.sig = '';
    this.focus = { s: 0, r: 0 };
    this.playStep = -1;
    this.ruler = [];
    this.el = h('div', { class: 'grid', role: 'grid', 'aria-label': 'Notes' });
    // The playhead is a soft bar of light over the column being heard.
    this.playhead = h('div', { class: 'playhead', 'aria-hidden': 'true' });
    // A sleeping critter's grid says so with a picture, not just paler colours.
    this.sleepBadge = h('div', { class: 'sleep-badge', 'aria-hidden': 'true', html: ICONS.sleep });
    this.frame = h('div', { class: 'grid-frame' }, this.el, this.playhead, this.sleepBadge);
    root.append(this.frame);
    this.bindPointer();
    this.bindKeys();
    // Keep the playhead bar on its column when the window changes size mid-song.
    new ResizeObserver(() => { if (this.playStep >= 0) this.placePlayhead(this.playStep); }).observe(this.el);
  }

  /** Rebuild when the layer, its sound kind, length or mood changes; otherwise just refresh. */
  render() {
    const layer = this.store.layer;
    const p = this.store.project;
    const rows = rowsForSound(layer.sound);
    const sig = `${layer.id}|${soundKind(layer.sound)}|${layer.steps}|${rows}|${p.mood}`;
    if (sig !== this.sig) this.build(layer, rows);
    this.sig = sig;
    this.frame.style.setProperty('--layer', COLORS[layer.color]);
    this.frame.style.setProperty('--edge', edgeColor(COLORS[layer.color]));
    for (let s = 0; s < layer.steps; s++) {
      for (let r = 0; r < rows; r++) {
        const note = noteAt(layer, s, r);
        const on = !!note;
        const c = this.cells[s][r];
        if (c.classList.contains('on') !== on) {
          c.classList.toggle('on', on);
          c.setAttribute('aria-pressed', String(on));
        }
        // A long note shows as one bar: its first cell has the dot, the rest are "held".
        c.classList.toggle('held', on && note.s !== s);
        c.classList.toggle('held-end', on && note.s + (note.len || 1) - 1 !== s);
      }
    }
    this.frame.classList.toggle('asleep', layer.muted);
  }

  build(layer, rows) {
    const kind = soundKind(layer.sound);
    const mood = this.store.project.mood;
    this.el.innerHTML = '';
    this.el.style.setProperty('--steps', layer.steps);
    this.el.style.setProperty('--rows', rows);
    // Columns: the row heads, then the steps in groups of four with a wider gap between
    // groups, so the beat is easy to see without shading cells.
    const cols = ['var(--head)'];
    const colOf = [];
    for (let s = 0; s < layer.steps; s++) {
      if (s > 0 && s % 4 === 0) cols.push('var(--spacer)');
      cols.push('minmax(0, 1fr)');
      colOf.push(cols.length);
    }
    this.el.style.gridTemplateColumns = cols.join(' ');
    this.el.classList.toggle('beat', kind === 'beat');
    this.cells = Array.from({ length: layer.steps }, () => []);
    for (let r = rows - 1; r >= 0; r--) {
      const color = rowColor(layer.sound, r);
      const gridRow = rows - r;
      const label = kind === 'beat' ? KIT_PIECES[r].label : `Note ${r + 1}`;
      const head = h('button', {
        class: 'row-head', type: 'button', tabindex: '-1', 'aria-label': `Play ${label}`, title: label,
        style: { '--rc': color, gridRow: String(gridRow), gridColumn: '1' },
        html: kind === 'beat' ? KIT_ICONS[r] : `<span class="pip" style="--size:${(0.66 + r * 0.045).toFixed(3)}">${isHomeRow(r, mood) ? ICONS.star : ''}</span>`,
      });
      head.addEventListener('pointerdown', () => { this.engine.preview(this.store.layer, r); head.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], 200); });
      head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.engine.preview(this.store.layer, r); } });
      this.el.append(head);
      for (let s = 0; s < layer.steps; s++) {
        const cell = h('button', {
          class: `cell${s % 4 === 0 ? ' beat-start' : ''}`,
          type: 'button', role: 'gridcell', tabindex: '-1', 'aria-pressed': 'false',
          'aria-label': `${label}, step ${s + 1}`, 'data-s': s, 'data-r': r,
          style: { '--rc': color, gridRow: String(gridRow), gridColumn: String(colOf[s]) },
        });
        this.cells[s][r] = cell;
        this.el.append(cell);
      }
    }
    // The beat ruler: one dot per step (bigger on each beat) that lights up as the music passes.
    this.ruler = [];
    for (let s = 0; s < layer.steps; s++) {
      const dot = h('span', { class: `tick${s % 4 === 0 ? ' big' : ''}`, 'aria-hidden': 'true', style: { gridRow: String(rows + 1), gridColumn: String(colOf[s]) } });
      this.ruler.push(dot);
      this.el.append(dot);
    }
    this.focus = { s: Math.min(this.focus.s, layer.steps - 1), r: Math.min(this.focus.r, rows - 1) };
    this.cells[this.focus.s][this.focus.r].tabIndex = 0;
    this.playStep = -1;
  }

  /** A tiny burst of sparks in the note's colour when a note lands. */
  sparkle(cell) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fr = this.frame.getBoundingClientRect(), cr = cell.getBoundingClientRect();
    const burst = h('span', { class: 'sparks', 'aria-hidden': 'true', style: {
      left: `${cr.left - fr.left + cr.width / 2}px`, top: `${cr.top - fr.top + cr.height / 2}px`,
      '--rc': getComputedStyle(cell).getPropertyValue('--rc'),
      '--reach': `${Math.min(34, Math.max(18, cr.width * 0.55))}px`,
    } });
    const turn = Math.random() * 60;
    for (let i = 0; i < 6; i++) burst.append(h('i', { style: { '--a': `${turn + i * 60}deg` } }));
    burst.addEventListener('animationend', (e) => { if (e.target === burst.lastChild) burst.remove(); });
    this.frame.append(burst);
    setTimeout(() => burst.remove(), 900); // in case animations don't run
  }

  cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.classList.contains('cell') && this.el.contains(el) ? el : null;
  }

  /** Paint or erase one cell, with sound. */
  apply(cell, mode, key) {
    const s = +cell.dataset.s, r = +cell.dataset.r;
    const layer = this.store.layer;
    const on = !!noteAt(layer, s, r);
    if ((mode === 'paint') === on) return;
    this.store.change(() => setNote(layer, s, r, mode === 'paint'), key);
    if (mode === 'paint') {
      this.engine.preview(layer, r);
      this.sparkle(cell);
      this.onFirstNote?.();
    } else {
      this.engine.uiSound('pop');
    }
    cell.classList.remove('bump');
    void cell.offsetWidth;
    cell.classList.add('bump');
  }

  bindPointer() {
    let mode = null, key = null, last = null;
    this.el.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell || e.button !== 0) return;
      e.preventDefault();
      this.engine.ensure();
      this.el.setPointerCapture(e.pointerId);
      const layer = this.store.layer;
      mode = noteAt(layer, +cell.dataset.s, +cell.dataset.r) ? 'erase' : 'paint';
      key = `paint-${e.pointerId}-${e.timeStamp}`;
      last = cell;
      this.setFocus(+cell.dataset.s, +cell.dataset.r, false);
      this.apply(cell, mode, key);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const cell = this.cellFromPoint(e.clientX, e.clientY);
      if (cell && cell !== last) { last = cell; this.apply(cell, mode, key); }
    });
    const end = () => { if (mode) { mode = null; this.store.seal(); } };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('lostpointercapture', end);
  }

  setFocus(s, r, move = true) {
    const old = this.cells[this.focus.s]?.[this.focus.r];
    if (old) old.tabIndex = -1;
    this.focus = { s, r };
    const c = this.cells[s][r];
    c.tabIndex = 0;
    if (move) c.focus();
  }

  bindKeys() {
    this.el.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('cell')) return;
      const layer = this.store.layer;
      const rows = rowsForSound(layer.sound);
      let { s, r } = this.focus;
      if (e.key === 'ArrowRight') s = (s + 1) % layer.steps;
      else if (e.key === 'ArrowLeft') s = (s - 1 + layer.steps) % layer.steps;
      else if (e.key === 'ArrowUp') r = Math.min(rows - 1, r + 1);
      else if (e.key === 'ArrowDown') r = Math.max(0, r - 1);
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.engine.ensure();
        const cell = this.cells[s][r];
        this.apply(cell, noteAt(layer, s, r) ? 'erase' : 'paint', null);
        return;
      } else return;
      e.preventDefault();
      this.setFocus(s, r);
    });
  }

  /** Called by the animation loop when a step is heard. */
  showStep(step, hitRows) {
    if (step !== this.playStep) {
      this.placePlayhead(step);
      if (this.playStep >= 0) {
        for (const c of this.cells[this.playStep] || []) c.classList.remove('now');
        this.ruler[this.playStep]?.classList.remove('now');
      }
      this.playStep = step;
      for (const c of this.cells[step] || []) c.classList.add('now');
      this.ruler[step]?.classList.add('now');
    }
    for (const r of hitRows || []) {
      const c = this.cells[step]?.[r];
      if (!c) continue;
      c.classList.remove('hit');
      void c.offsetWidth; // restart the animation
      c.classList.add('hit');
    }
  }

  placePlayhead(step) {
    const col = this.cells[step];
    if (!col?.length) return;
    // Columns are all the same width; measure one cell that isn't part of a long note (those
    // reach back over the gap) and centre the bar on this column's ruler dot.
    const ref = col.find((x) => !x.classList.contains('held')) || this.el.querySelector('.cell:not(.held)');
    const tick = this.ruler[step];
    const top = col[col.length - 1], bottom = col[0];
    // Cells have a transparent border (the gap) around a painted padding box; frame the paint.
    const pad = 4;
    const y = top.offsetTop + top.clientTop - pad;
    const hgt = bottom.offsetTop + bottom.clientTop + bottom.clientHeight - (top.offsetTop + top.clientTop) + pad * 2;
    const w = ref.clientWidth + pad * 2;
    const x = tick.offsetLeft + tick.offsetWidth / 2 - w / 2;
    const ph = this.playhead.style;
    ph.width = `${w}px`;
    ph.height = `${hgt}px`;
    ph.transform = `translate(${x}px, ${y}px)`;
    this.playhead.classList.add('on');
  }

  clearPlayhead() {
    this.playhead?.classList.remove('on');
    if (this.playStep >= 0) {
      for (const c of this.cells[this.playStep] || []) c.classList.remove('now');
      this.ruler[this.playStep]?.classList.remove('now');
    }
    this.playStep = -1;
  }

  /** Where a finger-hint should point: the middle of an inviting empty cell. */
  hintTarget() {
    const rows = this.cells[0]?.length || 0;
    const c = this.cells[2]?.[Math.min(rows - 1, 4)];
    return c || null;
  }
}
