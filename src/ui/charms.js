// Charms: the effects. Each critter wears its own Echo, Space and Dark↔Bright charm,
// and each charm has exactly one big handle. Changes are heard live; if the music is
// stopped, the critter sings a note so the change is never silent.

import { h, slider } from './widgets.js';
import { ICONS } from './icons.js';
import { soundKind } from '../model/sounds.js';

const CHARMS = [
  { key: 'echo', label: 'Echo', min: 0, max: 1, left: '', right: ICONS.echo, thumb: ICONS.echo, color: '#20c997' },
  { key: 'space', label: 'Space', min: 0, max: 1, left: '', right: ICONS.space, thumb: ICONS.space, color: '#7950f2' },
  { key: 'tone', label: 'Dark or bright', min: -1, max: 1, bipolar: true, left: ICONS.moon, right: ICONS.sun, thumb: '<span class="beat-dot"></span>', color: '#fab005' },
];

export function charmsPlugin() {
  const sliders = {};
  let lastPreview = 0;
  return {
    init({ store, engine }, { panel }) {
      const box = h('div', { class: 'charms', role: 'group', 'aria-label': 'Charms (effects)' });
      for (const c of CHARMS) {
        const s = slider({
          label: c.label, min: c.min, max: c.max, value: 0, bipolar: c.bipolar,
          left: c.left, right: c.right, thumb: c.thumb, cls: `charm charm-${c.key}`,
          onInput: (v) => {
            const layer = store.layer;
            store.change(() => { layer.fx[c.key] = Math.round(v * 100) / 100; }, `fx-${layer.id}-${c.key}`);
            engine.sync();
            const now = performance.now();
            if (!engine.playing && now - lastPreview > 280) {
              lastPreview = now;
              engine.preview(layer, soundKind(layer.sound) === 'beat' ? (c.key === 'tone' ? 3 : 1) : 3);
            }
          },
          onCommit: () => store.seal(),
        });
        s.style.setProperty('--sc', c.color);
        sliders[c.key] = s;
        box.append(s);
      }
      panel.push(box);
    },
    render({ store }) {
      const fx = store.layer.fx;
      for (const c of CHARMS) sliders[c.key].set(fx[c.key]);
    },
  };
}
