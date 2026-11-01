// The critter panel under the grid: what the selected critter sounds like, tools to
// change its pattern, and its charms (effects).

import { h, iconButton, instantPress } from './widgets.js';
import { critterSVG } from './critters.js';
import { ICONS } from './icons.js';
import { COLORS, SOUNDS, BEAT_SOUNDS, TUNE_SOUNDS, soundKind } from '../model/sounds.js';

export class Panel {
  constructor(root, { store, engine, sections = [] }) {
    Object.assign(this, { root, store, engine });
    this.sounds = h('div', { class: 'sounds', role: 'group', 'aria-label': 'Sounds' });
    this.extraSounds = null; // filled by the recorder (my recorded sounds)
    this.clear = iconButton({ icon: ICONS.eraser, label: 'Rub out all notes', cls: 'tool', onPress: () => this.clearNotes() });
    this.remove = iconButton({ icon: ICONS.trash, label: 'Remove this critter', cls: 'tool', onPress: () => this.removeLayer() });
    this.tools = h('div', { class: 'tools edit-tools', role: 'group', 'aria-label': 'Tidy up' }, this.clear, this.remove);
    // Sounds, then tidying up, then the plugins (dice, charms): the same order on screen and for Tab.
    root.append(h('div', { class: 'panel-group' }, this.sounds), this.tools, ...sections);
    this.sig = '';
  }

  render() {
    const layer = this.store.layer;
    const kind = soundKind(layer.sound);
    const sig = `${layer.id}|${layer.sound}|${layer.color}|${this.extraSig?.() ?? ''}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.sounds.innerHTML = '';
      for (const sound of kind === 'beat' ? BEAT_SOUNDS : TUNE_SOUNDS) {
        this.sounds.append(this.soundButton(sound, critterSVG(SOUNDS[sound].shape, COLORS[layer.color]), SOUNDS[sound].label));
      }
      if (kind === 'tune' && this.extraSounds) this.sounds.append(...this.extraSounds(layer));
    }
    this.root.style.setProperty('--layer', COLORS[layer.color]);
    this.remove.hidden = this.store.project.layers.length <= 1;
    this.clear.classList.toggle('dim', layer.notes.length === 0);
  }

  soundButton(sound, html, label) {
    const layer = this.store.layer;
    const on = layer.sound === sound;
    const b = h('button', { class: `sound ${on ? 'on' : ''}`, type: 'button', 'aria-pressed': String(on), 'aria-label': label, title: label, html });
    if (on) b.append(h('span', { class: 'tick-badge', html: ICONS.check }));
    instantPress(b, () => this.chooseSound(sound));
    return b;
  }

  chooseSound(sound) {
    const layer = this.store.layer;
    this.engine.ensure();
    if (layer.sound !== sound) this.store.change(() => { layer.sound = sound; });
    this.engine.preview(layer, soundKind(sound) === 'beat' ? 0 : 3);
  }

  clearNotes() {
    const layer = this.store.layer;
    this.engine.ensure();
    if (!layer.notes.length) { this.engine.uiSound('bonk'); return; }
    this.store.change(() => { layer.notes = []; });
    this.engine.uiSound('whoosh');
  }

  removeLayer() {
    const p = this.store.project;
    this.engine.ensure();
    if (p.layers.length <= 1) { this.engine.uiSound('bonk'); return; }
    const id = this.store.view.selected;
    const i = p.layers.findIndex((l) => l.id === id);
    this.store.change((proj) => { proj.layers.splice(i, 1); });
    this.store.select(p.layers[Math.max(0, i - 1)].id);
    this.engine.sync();
    this.engine.uiSound('pop');
  }
}
