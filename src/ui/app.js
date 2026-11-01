// Puts the screen together, runs the animation loop that makes the interface dance in
// time with what you hear, and handles keyboard shortcuts.

import { TopBar } from './topbar.js';
import { Rail } from './rail.js';
import { Grid } from './grid.js';
import { Panel } from './panel.js';
import { h, guardGhostClicks, toast } from './widgets.js';
import { ICONS } from './icons.js';

const HINT_KEY = 'itchy.hinted';

export class App {
  constructor({ store, engine, plugins = [] }) {
    this.store = store;
    this.engine = engine;
    const $ = (id) => document.getElementById(id);
    this.ctx = { store, engine, app: this };
    // Plugins (effects, recorder, moods, songbook…) add their own pieces to regions.
    const top = [], panel = [];
    for (const plug of plugins) plug.init?.(this.ctx, { top, panel });
    this.plugins = plugins;
    this.top = new TopBar($('top'), { store, engine, extras: top, onSongbook: () => this.ctx.openSongbook?.() });
    this.rail = new Rail($('rail'), { store, engine, onRecordNew: (layer) => this.ctx.recordInto?.(layer) });
    this.grid = new Grid($('stage'), { store, engine, onFirstNote: () => this.hideHint() });
    this.panel = new Panel($('panel'), { store, engine, sections: panel });
    for (const plug of plugins) plug.attach?.(this.ctx);

    guardGhostClicks();
    store.subscribe((what) => this.render(what));
    engine.on((type) => { if (type === 'stop') this.onStop(); });
    this.render('open');
    this.bindKeys();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);

    // Unlock audio. Different browsers accept different events as the "gesture" that may start
    // sound (Chrome: touch-down or mouse-down; Safari: finger lifted or click), so listen to
    // all of them until the sound is actually running.
    const events = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'click', 'keydown'];
    let warned = false;
    const unlock = (e) => {
      engine.ensure();
      if (engine.audible) { for (const t of events) document.removeEventListener(t, unlock, true); return; }
      if (e.type === 'click' && !warned) {
        // Still silent after a full tap: say so, rather than leave a child wondering.
        setTimeout(() => {
          if (engine.audible || warned) return;
          warned = true;
          toast(ICONS.speaker, 'Tap again to turn the sound on');
        }, 600);
      }
    };
    for (const t of events) document.addEventListener(t, unlock, { capture: true, passive: true });

    // Save when the page is hidden or closed.
    const flush = () => { store.backup(); store.flush(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('pagehide', flush);

    this.maybeShowHint();
    document.getElementById('app').classList.remove('loading');
  }

  render(what) {
    this.top.render();
    this.rail.render();
    this.grid.render();
    this.panel.render();
    for (const p of this.plugins) p.render?.(this.ctx, what);
    if (what !== 'select') this.engine.sync();
    if (what === 'open') this.grid.clearPlayhead();
  }

  onStop() {
    this.grid.clearPlayhead();
    for (const l of this.store.project.layers) this.rail.drawMap(l, -1);
    this.top.play.style.setProperty('--glow', '0');
  }

  /** Animation loop: show each step at the moment it is heard. */
  loop() {
    requestAnimationFrame(this.loop);
    const events = this.engine.drainEvents();
    if (!events.length) {
      if (this.engine.playing) this.top.play.style.setProperty('--glow', this.engine.level().toFixed(2));
      return;
    }
    const p = this.store.project;
    const sel = this.store.layer;
    // Several steps may land in one frame on a slow device; show them all in order.
    for (const ev of events) {
      for (const l of p.layers) {
        if (ev.hits[l.id]) this.rail.bounce(l.id);
      }
      if (ev.steps[sel.id] !== undefined) this.grid.showStep(ev.steps[sel.id], ev.hits[sel.id]);
      if (ev.index % 4 === 0) this.top.play.classList.toggle('beat', true);
      else this.top.play.classList.remove('beat');
    }
    const last = events[events.length - 1];
    for (const l of p.layers) if (last.steps[l.id] !== undefined) this.rail.drawMap(l, last.steps[l.id]);
    this.top.play.style.setProperty('--glow', this.engine.level().toFixed(2));
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); this.top.doUndo(e.shiftKey); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.top.doUndo(true); return; }
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName));
      const onControl = t instanceof HTMLElement && (t.tagName === 'BUTTON' || t.getAttribute('role') === 'slider');
      if (e.key === ' ' && !typing && !onControl) { e.preventDefault(); this.top.toggle(); }
      if (!typing && !mod && /^[1-6]$/.test(e.key)) {
        const l = this.store.project.layers[+e.key - 1];
        if (l) { this.store.select(l.id); this.engine.preview(l, 0, 0.7); }
      }
    });
  }

  maybeShowHint() {
    let seen = false;
    try { seen = localStorage.getItem(HINT_KEY) === '1'; } catch { /* no storage: show it */ }
    if (seen || this.store.layer.notes.length) return;
    const target = this.grid.hintTarget();
    if (!target) return;
    this.hint = h('div', { class: 'hint', 'aria-hidden': 'true', html: ICONS.hand });
    target.append(this.hint);
  }

  hideHint() {
    if (!this.hint) return;
    this.hint.remove();
    this.hint = null;
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* fine */ }
  }
}
