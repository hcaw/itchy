// Top bar: play/stop, tempo (turtle ↔ rabbit), mood, undo/redo, songbook.

import { h, iconButton, slider } from './widgets.js';
import { ICONS } from './icons.js';
import { TEMPO_MIN, TEMPO_MAX } from '../model/project.js';

export class TopBar {
  constructor(root, { store, engine, onSongbook, extras = [] }) {
    Object.assign(this, { root, store, engine });
    this.play = iconButton({ icon: ICONS.play, label: 'Play', cls: 'play', onPress: () => this.toggle() });
    this.tempo = slider({
      label: 'Speed', min: TEMPO_MIN, max: TEMPO_MAX, value: store.project.tempo, cls: 'tempo',
      left: ICONS.turtle, right: ICONS.rabbit, thumb: '<span class="beat-dot"></span>',
      format: (v) => `${Math.round(v)} beats per minute`,
      onInput: (v) => {
        store.change((p) => { p.tempo = Math.round(v); }, 'tempo');
        engine.sync();
        if (!engine.playing) this.tick();
      },
      onCommit: () => store.seal(),
    });
    this.undo = iconButton({ icon: ICONS.undo, label: 'Undo', cls: 'undo', onPress: () => this.doUndo(false) });
    this.redo = iconButton({ icon: ICONS.redo, label: 'Redo', cls: 'redo', onPress: () => this.doUndo(true) });
    this.book = iconButton({ icon: ICONS.book, label: 'My songs', cls: 'book', onPress: () => { engine.ensure(); engine.uiSound('whoosh'); onSongbook?.(); } });
    root.append(
      h('div', { class: 'group' }, this.play),
      h('div', { class: 'group grow' }, this.tempo, ...extras),
      h('div', { class: 'group' }, this.undo, this.redo, this.book),
    );
    engine.on(() => this.render());
  }

  toggle() {
    if (this.engine.playing) this.engine.stop();
    else this.engine.play();
    this.render();
  }

  tick() {
    // Changing speed while stopped: a metronome blip at the new speed, so the slider is never silent.
    const now = performance.now();
    if (now - (this.lastTick || 0) > 60 / this.store.project.tempo * 1000) {
      this.lastTick = now;
      this.engine.uiSound('tick');
    }
  }

  doUndo(redo) {
    this.engine.ensure();
    const ok = redo ? this.store.redo() : this.store.undo();
    this.engine.sync();
    this.engine.uiSound(ok ? 'whoosh' : 'bonk');
    const b = redo ? this.redo : this.undo;
    b.animate([{ transform: 'rotate(0)' }, { transform: `rotate(${redo ? 20 : -20}deg)` }, { transform: 'rotate(0)' }], 260);
  }

  render() {
    const playing = this.engine.playing;
    this.play.innerHTML = playing ? ICONS.stop : ICONS.play;
    this.play.setAttribute('aria-label', playing ? 'Stop' : 'Play');
    this.play.title = playing ? 'Stop' : 'Play';
    this.play.classList.toggle('playing', playing);
    this.tempo.set(this.store.project.tempo);
    this.undo.disabled = false;
    this.undo.classList.toggle('dim', !this.store.history.canUndo);
    this.redo.classList.toggle('dim', !this.store.history.canRedo);
  }
}
