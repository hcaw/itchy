// Small reusable UI pieces: element helper, a chunky slider, popovers and toasts.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk.startsWith('--') ? sk : sk.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), sv);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

/** A big icon button. Activates on pointerdown for an instant response (touch-friendly). */
export function iconButton({ icon, label, cls = '', onPress, pressed }) {
  const b = h('button', { class: `btn ${cls}`, type: 'button', 'aria-label': label, title: label, html: icon });
  if (pressed !== undefined) b.setAttribute('aria-pressed', String(!!pressed));
  instantPress(b, onPress);
  return b;
}

/**
 * Fire on pointerdown (feels instant, especially on touch) while keeping keyboard
 * activation via click. Prevents double firing.
 */
export function instantPress(el, fn) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    fn(e);
  });
  el.addEventListener('click', (e) => {
    // Keyboard and assistive-tech clicks have detail 0. Pointer clicks were already
    // handled on pointerdown (and may never arrive if the icon was redrawn meanwhile).
    if (e.detail === 0) fn(e);
  });
}

/**
 * Stop "ghost clicks": when a tap changes the layout (a button disappears, a list grows),
 * the browser's follow-up click can land on a different button under the finger.
 * A pointer click only counts if it lands on the control the pointer went down on.
 */
export function guardGhostClicks(root = document) {
  let downOn = null;
  const control = (t) => (t instanceof Element ? t.closest('button, [role=slider], a') : null);
  root.addEventListener('pointerdown', (e) => { downOn = control(e.target); }, true);
  root.addEventListener('click', (e) => {
    if (e.detail === 0) return; // keyboard
    const c = control(e.target);
    if (c && c !== downOn) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}

/**
 * Chunky slider. Grab anywhere on it; drag; or use arrow keys.
 * bipolar: the fill grows from the middle (for Dark ↔ Bright).
 */
export function slider({ label, min = 0, max = 1, value = 0, bipolar = false, left = '', right = '', thumb = '', cls = '', onInput, onCommit, format }) {
  const fill = h('div', { class: 'fill' });
  const th = h('div', { class: 'thumb', html: thumb });
  const track = h('div', { class: 'track' }, fill, th);
  const el = h('div', { class: `slider ${cls} ${bipolar ? 'bipolar' : ''}`, role: 'slider', tabindex: '0', 'aria-label': label, title: label },
    left ? h('span', { class: 'end left', html: left }) : null, track, right ? h('span', { class: 'end right', html: right }) : null);
  let v = value;
  const frac = (x) => (x - min) / (max - min);
  const draw = () => {
    const f = frac(v);
    th.style.left = `${f * 100}%`;
    if (bipolar) {
      const a = Math.min(f, 0.5), b = Math.max(f, 0.5);
      fill.style.left = `${a * 100}%`;
      fill.style.width = `${(b - a) * 100}%`;
    } else {
      fill.style.left = '0';
      fill.style.width = `${f * 100}%`;
    }
    el.setAttribute('aria-valuemin', min);
    el.setAttribute('aria-valuemax', max);
    el.setAttribute('aria-valuenow', Math.round(v * 100) / 100);
    el.setAttribute('aria-valuetext', format ? format(v) : `${Math.round(f * 100)}%`);
    el.style.setProperty('--amount', f.toFixed(3));
  };
  const setFrom = (clientX) => {
    const r = track.getBoundingClientRect();
    let f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    if (bipolar && Math.abs(f - 0.5) < 0.04) f = 0.5; // a little "detent" in the middle
    const nv = min + f * (max - min);
    if (nv !== v) { v = nv; draw(); onInput?.(v); }
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    setFrom(e.clientX);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) setFrom(e.clientX); });
  const end = (e) => {
    if (!el.classList.contains('dragging')) return;
    el.classList.remove('dragging');
    onCommit?.(v);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const stepSize = (max - min) / 16;
    let nv = v;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nv = v + stepSize;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nv = v - stepSize;
    else if (e.key === 'Home') nv = min;
    else if (e.key === 'End') nv = max;
    else return;
    e.preventDefault();
    v = Math.min(max, Math.max(min, nv));
    draw();
    onInput?.(v);
    onCommit?.(v);
  });
  draw();
  el.set = (nv) => { if (!el.classList.contains('dragging')) { v = nv; draw(); } };
  return el;
}

/** A popover bubble near an anchor. Closes on outside tap or Escape. */
export function popover(anchor, content, { cls = '' } = {}) {
  closePopovers();
  const pop = h('div', { class: `popover ${cls}`, role: 'dialog' }, content);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  let left = r.left + r.width / 2 - pr.width / 2;
  left = Math.max(8, Math.min(window.innerWidth - pr.width - 8, left));
  let top = r.bottom + 10;
  if (top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 10);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  const away = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { close(); anchor.focus(); } };
  function close() {
    pop.remove();
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', key);
  }
  setTimeout(() => {
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
  });
  pop.close = close;
  pop.querySelector('button')?.focus({ preventScroll: true });
  return pop;
}

export function closePopovers() {
  for (const p of document.querySelectorAll('.popover')) p.close?.() ?? p.remove();
}

let toastTimer = null;
export function toast(icon, text, ms = 3500) {
  const t = document.getElementById('toast');
  t.innerHTML = '';
  t.append(h('span', { class: 'toast-icon', html: icon }), h('span', {}, text));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
