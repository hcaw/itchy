// Ways to play with sound beyond placing notes:
//  - Mood: swap the scale under every tune critter at once (happy, gentle, sunny, cool, mystery, spooky).
//  - Dice: invent a fresh pattern for the selected critter. Roll again, or undo to go back.

import { h, iconButton, instantPress, popover, closePopovers } from './widgets.js';
import { ICONS, MOOD_ICONS } from './icons.js';
import { MOODS, MOOD_ORDER } from '../model/scales.js';
import { soundKind } from '../model/sounds.js';
import { surpriseNotes } from '../model/surprise.js';

export function moodPlugin() {
  let button;
  return {
    init({ store, engine }, { top }) {
      button = iconButton({ icon: MOOD_ICONS.happy, label: 'Mood', cls: 'mood', onPress: () => open() });
      top.push(button);
      const open = () => {
        engine.ensure();
        engine.uiSound('tick');
        const box = h('div', { class: 'mood-menu', role: 'group', 'aria-label': 'Choose a mood' });
        for (const m of MOOD_ORDER) {
          const on = store.project.mood === m;
          const b = h('button', { class: `mood-choice mood-${m} ${on ? 'on' : ''}`, type: 'button', 'aria-pressed': String(on), 'aria-label': MOODS[m].label, title: MOODS[m].label, html: MOOD_ICONS[m] });
          instantPress(b, () => {
            if (store.project.mood !== m) store.change((p) => { p.mood = m; });
            for (const x of box.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }
            arpeggio(store, engine);
          });
          box.append(b);
        }
        popover(button, box, { cls: 'mood-pop' });
      };
    },
    render({ store }) {
      const m = store.project.mood;
      button.innerHTML = MOOD_ICONS[m];
      button.className = `btn mood mood-${m}`;
      button.setAttribute('aria-label', `Mood: ${MOODS[m].label}`);
      button.title = `Mood: ${MOODS[m].label}`;
    },
  };
}

/** Play the new mood up and down on the selected critter (or bells), so you hear what changed. */
function arpeggio(store, engine) {
  const ctx = engine.ensure();
  const layer = soundKind(store.layer.sound) === 'tune' ? store.layer : store.project.layers.find((l) => soundKind(l.sound) === 'tune');
  const voice = layer || { id: '__mood', sound: 'bells', octave: 0, steps: 16, muted: false, volume: 0.8, fx: { echo: 0, space: 0, tone: 0 } };
  const rows = [0, 1, 2, 3, 4, 5, 3, 0];
  const t0 = ctx.currentTime + 0.02;
  rows.forEach((r, i) => engine.voice(voice, { r, vel: 0.8, len: 1 }, t0 + i * 0.09, 0.1));
}

export function dicePlugin() {
  return {
    init({ store, engine }, { panel }) {
      const roll = () => {
        engine.ensure();
        const layer = store.layer;
        store.change(() => { layer.notes = surpriseNotes(layer); });
        engine.uiSound('whoosh');
        dice.classList.remove('rolling');
        void dice.offsetWidth;
        dice.classList.add('rolling');
        if (!engine.playing) {
          // Hear the first few notes of the new pattern straight away.
          const ctx = engine.ctx, t0 = ctx.currentTime + 0.05, d = 60 / store.project.tempo / 4;
          for (const n of layer.notes) if (n.s < 8) engine.voice(layer, n, t0 + n.s * d, d);
        }
      };
      const dice = iconButton({ icon: ICONS.dice, label: 'Surprise me! (make a pattern)', cls: 'dice', onPress: roll });
      panel.push(h('div', { class: 'tools' }, dice));
    },
  };
}
