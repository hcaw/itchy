// Hand-drawn style icons as inline SVG (original artwork). They inherit currentColor.

const svg = (body, vb = '0 0 48 48') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  play: svg('<path d="M16 10 L38 24 L16 38 Z" fill="currentColor"/>'),
  stop: svg('<rect x="13" y="13" width="22" height="22" rx="4" fill="currentColor"/>'),
  undo: svg('<path d="M14 20 H30 a9 9 0 0 1 0 18 H22"/><path d="M20 12 L12 20 L20 28"/>'),
  redo: svg('<path d="M34 20 H18 a9 9 0 0 0 0 18 H26"/><path d="M28 12 L36 20 L28 28"/>'),
  book: svg('<path d="M8 10 C14 8 20 8 24 12 C28 8 34 8 40 10 V38 C34 36 28 36 24 40 C20 36 14 36 8 38 Z"/><path d="M24 12 V40"/>'),
  plus: svg('<path d="M24 10 V38 M10 24 H38"/>'),
  close: svg('<path d="M13 13 L35 35 M35 13 L13 35"/>'),
  trash: svg('<path d="M10 14 H38 M18 14 V9 H30 V14 M14 14 L16 40 H32 L34 14"/><path d="M21 21 V33 M27 21 V33"/>'),
  eraser: svg('<path d="M8 32 L26 12 L40 26 L26 40 H14 Z"/><path d="M18 22 L32 36 M26 40 H40"/>'),
  mic: svg('<rect x="17" y="6" width="14" height="24" rx="7" fill="currentColor"/><path d="M11 22 a13 13 0 0 0 26 0 M24 35 V42 M17 42 H31"/>'),
  micOff: svg('<rect x="17" y="6" width="14" height="24" rx="7"/><path d="M11 22 a13 13 0 0 0 26 0 M24 35 V42 M17 42 H31 M8 8 L40 40"/>'),
  speaker: svg('<path d="M8 19 H15 L25 10 V38 L15 29 H8 Z" fill="currentColor" fill-opacity=".18"/><path d="M31 18 a8 8 0 0 1 0 12 M35 13 a14 14 0 0 1 0 22"/>'),
  sleep: svg('<path d="M8 19 H15 L25 10 V38 L15 29 H8 Z" fill="currentColor" fill-opacity=".18"/><path d="M31 18 L41 30 M41 18 L31 30"/>'),
  turtle: svg('<path d="M10 30 C10 18 18 14 24 14 C30 14 38 18 38 30 Z" fill="currentColor" stroke-width="3"/><path d="M38 28 C42 28 44 24 44 22 C44 20 41 20 39 22 M14 30 L12 36 M34 30 L36 36 M6 30 H42"/>'),
  rabbit: svg('<ellipse cx="22" cy="30" rx="12" ry="9" fill="currentColor"/><circle cx="34" cy="24" r="6" fill="currentColor"/><path d="M33 18 C31 10 32 6 34 6 C36 6 37 12 36 18 M37 19 C39 12 41 10 42 11 C43 13 41 17 39 20"/><path d="M10 30 a3 3 0 1 0 0.1 0"/>'),
  // Half moon, half sun: Dark↔Bright in the middle.
  halfSun: svg('<circle cx="24" cy="24" r="12"/><path d="M24 12 a12 12 0 0 0 0 24 Z" fill="currentColor"/>'),
  echoSoft: svg('<circle cx="24" cy="24" r="5" fill="currentColor"/>'),
  spaceFlat: svg('<path d="M12 36 L21 22 L26 29 L30 24 L37 36 Z"/>'),
  echo: svg('<circle cx="12" cy="24" r="4" fill="currentColor"/><path d="M20 16 a11 11 0 0 1 0 16 M27 11 a18 18 0 0 1 0 26 M34 6 a25 25 0 0 1 0 36"/>'),
  space: svg('<path d="M6 40 L18 16 L26 28 L32 20 L42 40 Z"/><path d="M34 8 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5 Z" fill="currentColor" stroke-width="1.5"/><circle cx="12" cy="9" r="1.8" fill="currentColor"/>'),
  moon: svg('<path d="M30 8 a16 16 0 1 0 10 26 a13 13 0 0 1 -10 -26 Z" fill="currentColor"/>'),
  sun: svg('<circle cx="24" cy="24" r="8" fill="currentColor"/><path d="M24 5 V10 M24 38 V43 M5 24 H10 M38 24 H43 M10.5 10.5 L14 14 M34 34 L37.5 37.5 M10.5 37.5 L14 34 M34 14 L37.5 10.5"/>'),
  hand: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 44 C12 38 8 32 8 28 C8 25 11 24 13 26 L17 30 V10 C17 7 21 7 21 10 V22 V8 C21 5 25 5 25 8 V22 V10 C25 7 29 7 29 10 V23 V13 C29 10 33 10 33 13 V30 C33 38 30 42 28 44 Z" fill="#fff" stroke="#333" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  star: svg('<path d="M24 6 L29 18 L42 19 L32 28 L35 41 L24 34 L13 41 L16 28 L6 19 L19 18 Z" fill="currentColor" stroke-width="2"/>'),
  check: svg('<path d="M10 25 L20 35 L38 13"/>'),
  sad: svg('<circle cx="24" cy="24" r="18"/><circle cx="17" cy="20" r="2.5" fill="currentColor"/><circle cx="31" cy="20" r="2.5" fill="currentColor"/><path d="M16 34 q8 -7 16 0"/>'),
};

// Kit pieces, bottom row first: kick, snare, clap, hat. One family: round 4-unit strokes, a light fill.
export const KIT_ICONS = [
  // kick: a big drum seen from the front
  svg('<circle cx="24" cy="24" r="16" fill="currentColor" fill-opacity=".16"/><circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="5" fill="currentColor"/>'),
  // snare: a short drum with zig-zag lacing
  svg('<ellipse cx="24" cy="15" rx="16" ry="6" fill="currentColor" fill-opacity=".16"/><ellipse cx="24" cy="15" rx="16" ry="6"/><path d="M8 15 V31 C8 37 40 37 40 31 V15"/><path d="M13 24 L18 31 L24 24 L30 31 L35 24"/>'),
  // clap: two palms meeting, with a burst
  svg('<path d="M14 42 C9 37 8 30 10 22 L13 12 C14 9 18 10 17 13 L16 20 L20 9 C21 6 25 7 24 10 L21 21" fill="currentColor" fill-opacity=".16"/><path d="M14 42 C9 37 8 30 10 22 L13 12 C14 9 18 10 17 13 L16 20 L20 9 C21 6 25 7 24 10 L21 21"/><path d="M22 42 C28 40 31 34 30 26 L29 18 C29 15 25 15 25 18 L25 24"/><path d="M35 9 L38 5 M38 16 L43 15 M33 3 L33 1"/>'),
  // hi-hat: two cymbals on a stand
  svg('<ellipse cx="24" cy="13" rx="17" ry="4.5" fill="currentColor" fill-opacity=".16"/><ellipse cx="24" cy="13" rx="17" ry="4.5"/><ellipse cx="24" cy="21" rx="17" ry="4.5"/><path d="M24 26 V43 M16 43 H32"/>'),
];

// Mood faces: shape and expression carry the meaning, not just colour.
const face = (eyes, mouth, extra = '') =>
  svg(`<circle cx="24" cy="24" r="19" fill="currentColor" opacity=".22"/><circle cx="24" cy="24" r="19"/>${eyes}${mouth}${extra}`);
const dotEyes = '<circle cx="17" cy="20" r="2.6" fill="currentColor"/><circle cx="31" cy="20" r="2.6" fill="currentColor"/>';
export const MOOD_ICONS = {
  happy: face(dotEyes, '<path d="M15 28 q9 9 18 0"/>'),
  sad: face('<path d="M14 21 q3 2 6 0 M28 21 q3 2 6 0"/>', '<path d="M18 32 q6 -3 12 0"/>'),
  sunny: svg('<circle cx="24" cy="24" r="14" fill="currentColor" opacity=".22"/><circle cx="24" cy="24" r="14"/><circle cx="19" cy="21" r="2.2" fill="currentColor"/><circle cx="29" cy="21" r="2.2" fill="currentColor"/><path d="M17 27 q7 9 14 0 Z" fill="currentColor" stroke-width="2.5"/><path d="M24 2 V6 M24 42 V46 M2 24 H6 M42 24 H46 M8.5 8.5 L11.5 11.5 M36.5 36.5 L39.5 39.5 M8.5 39.5 L11.5 36.5 M36.5 11.5 L39.5 8.5" stroke-width="3.5"/>'),
  bluesy: face('<path d="M11 18 H37 M12 18 q0 7 6 7 q6 0 6 -7 M24 18 q0 7 6 7 q6 0 6 -7" fill="currentColor"/>', '<path d="M18 33 q7 3 13 -2"/>'),
  mystery: face('<circle cx="19" cy="20" r="2.6" fill="currentColor"/><circle cx="33" cy="20" r="2.6" fill="currentColor"/>', '<path d="M18 31 q3 -3 6 0 q3 3 6 0"/>'),
  spooky: svg('<path d="M8 42 V22 a16 16 0 0 1 32 0 V42 l-5 -4 -5 4 -6 -4 -6 4 -5 -4 Z" fill="currentColor" opacity=".22"/><path d="M8 42 V22 a16 16 0 0 1 32 0 V42 l-5 -4 -5 4 -6 -4 -6 4 -5 -4 Z"/><ellipse cx="18" cy="21" rx="3" ry="4.5" fill="currentColor"/><ellipse cx="30" cy="21" rx="3" ry="4.5" fill="currentColor"/><ellipse cx="24" cy="31" rx="3" ry="3.5"/>'),
};

// A die showing 1–6 pips; the dice button lands on a different face after each roll.
const PIPS = { 1: [[24, 24]], 2: [[17, 17], [31, 31]], 3: [[16, 16], [24, 24], [32, 32]], 4: [[17, 17], [31, 17], [17, 31], [31, 31]],
  5: [[16, 16], [32, 16], [24, 24], [16, 32], [32, 32]], 6: [[17, 15], [31, 15], [17, 24], [31, 24], [17, 33], [31, 33]] };
export function diceFace(n) {
  const pips = (PIPS[n] || PIPS[5]).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="currentColor" stroke="none"/>`).join('');
  return svg(`<rect x="7" y="7" width="34" height="34" rx="9" fill="currentColor" fill-opacity=".14"/><rect x="7" y="7" width="34" height="34" rx="9"/>${pips}`);
}
