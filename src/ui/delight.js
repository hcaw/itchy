// Small touches that make Itchy feel alive without getting in the way:
//  - Critters blink now and then, and their eyes follow your finger or mouse.
//  - The room takes on the colour of the mood (warm when happy, dusky when spooky).
//  - The Itchy critter in the top bar sings hello when you tap it, in the current mood,
//    and changes colour each time.
// None of this changes the song, so there is nothing to undo.

import { h, instantPress } from './widgets.js';
import { critterSVG } from './critters.js';
import { COLORS } from '../model/sounds.js';
import { MOODS } from '../model/scales.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function delightPlugin() {
  let brand, brandArt, colorIndex = 0;

  function hello({ engine }) {
    const ctx = engine.ensure();
    colorIndex = (colorIndex + 1) % COLORS.length;
    brandArt.querySelector('.critter').style.setProperty('--c', COLORS[colorIndex]);
    brand.classList.remove('hop');
    void brand.offsetWidth;
    brand.classList.add('hop');
    // A little "hel-lo!" in the current mood: up, up, and a happy leap home.
    const voice = { id: '__hello', sound: 'bells', octave: 0, steps: 16, muted: false, volume: 0.7, fx: { echo: 0.25, space: 0.2, tone: 0 } };
    const t0 = ctx.currentTime + 0.02;
    [[2, 0], [4, 0.11], [7, 0.22]].forEach(([r, dt]) => engine.voice(voice, { r, vel: 0.7, len: 1 }, t0 + dt, 0.12, true));
  }

  function blinkLoop() {
    const next = 1600 + Math.random() * 2800;
    setTimeout(() => {
      if (!document.hidden && !calm()) {
        const faces = [...document.querySelectorAll('#rail .critter, .brand .critter')];
        const one = faces[Math.floor(Math.random() * faces.length)];
        if (one) {
          one.classList.remove('blink');
          void one.getBoundingClientRect();
          one.classList.add('blink');
        }
      }
      blinkLoop();
    }, next);
  }

  function followEyes() {
    let x = 0, y = 0, queued = false, idle = null;
    const look = () => {
      queued = false;
      for (const svg of document.querySelectorAll('#rail .critter, .brand .critter')) {
        const r = svg.getBoundingClientRect();
        if (!r.width) continue;
        const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height * 0.4);
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(2.4, d / 40);
        svg.querySelector('.pupils')?.setAttribute('transform', `translate(${(dx / d * reach).toFixed(2)} ${(dy / d * reach).toFixed(2)})`);
      }
    };
    const rest = () => { for (const p of document.querySelectorAll('.critter .pupils')) p.removeAttribute('transform'); };
    const move = (e) => {
      if (calm()) return;
      x = e.clientX; y = e.clientY;
      if (!queued) { queued = true; requestAnimationFrame(look); }
      clearTimeout(idle);
      idle = setTimeout(rest, 2500);
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerdown', move, { passive: true });
  }

  return {
    init(ctx, { brand: slot }) {
      brandArt = h('span', { class: 'brand-mark', html: critterSVG('blob', COLORS[0]) });
      brand = h('button', { class: 'brand', type: 'button', 'aria-label': 'Itchy says hello', title: 'Itchy' },
        brandArt, h('span', { class: 'wordmark', 'aria-hidden': 'true' }, 'itchy'));
      brand.addEventListener('animationend', (e) => { if (e.target === brand) brand.classList.remove('hop'); });
      instantPress(brand, () => hello(ctx));
      slot.push(brand);
    },
    attach() {
      blinkLoop();
      followEyes();
    },
    render({ store }) {
      const mood = MOODS[store.project.mood] ? store.project.mood : 'happy';
      if (document.documentElement.dataset.mood !== mood) document.documentElement.dataset.mood = mood;
    },
  };
}
