// Critters: the friendly faces of each layer. Original artwork drawn as SVG in code.
// Shape tells you the sound (drum, robot, bell, star, blob, cloud, mic); colour tells
// you which critter it is. Eyes close when it's asleep (muted); the mouth opens when it sings.
// They blink now and then, and their eyes follow your finger (see delight.js).
//
// Each critter is a glossy jelly sweet: its body is lit from above (pale top, rich bottom),
// light glows up through it from below, a glassy rim catches the edge, and a crisp highlight
// glistens on top. Every colour comes from the critter's --c (via --tone in styles.css), so one
// set of gradients works for every colour, and asleep critters fade to frosted glass.

// SIL is the outline of the main body; it is filled, lit and clipped to. BACK is drawn behind
// it (stands, clappers, ears), FRONT on top of it (drum heads, stripes, buttons).
const SHAPES = {
  drum: {
    sil: 'M12 36 A38 14 0 0 1 88 36 V62 A38 28 0 0 1 12 62 Z',
    front: `<ellipse class="lit" cx="50" cy="36" rx="37" ry="13.2"/><ellipse class="head" cx="50" cy="35.6" rx="30.5" ry="9.4"/>
            <path class="stripe" d="M17 71 L27 82 L38.5 73.5 L50 85 L61.5 73.5 L73 82 L83 71"/>`,
    gloss: `<path d="M21 33.5 C25 28 35 25.6 46 25.3 C48.6 25.3 48.7 27.6 46.3 27.9 C36.6 28.7 29 30.6 24.4 34.6 C22.4 36.2 19.8 35.2 21 33.5Z"/>
            <path d="M16.6 45 C16.8 56 18.6 65 23 72.4 C24.3 74.6 21.6 75.8 20.3 73.8 C15.9 66.8 14.2 57 14.2 46.2 C14.2 43.2 16.6 42.6 16.6 45Z"/>`,
    dots: [[56, 26.4, 1.9]],
    kick: 'M79.5 73.5 C76.5 78.5 72 82 66.5 84',
    bubbles: [],
    face: 59,
    ground: [50, 91, 33],
    zz: [80, 19],
  },
  robot: {
    sil: 'M32 22 H68 A18 18 0 0 1 86 40 V70 A18 18 0 0 1 68 88 H32 A18 18 0 0 1 14 70 V40 A18 18 0 0 1 32 22 Z',
    back: `<rect class="lit" x="8" y="45" width="12" height="20" rx="5"/><rect class="lit" x="80" y="45" width="12" height="20" rx="5"/>
           <path class="stalk" d="M50 23 V12"/><circle class="lit" cx="50" cy="9" r="6.5"/>`,
    front: '<rect class="lit" x="25" y="72" width="50" height="8" rx="4"/>',
    gloss: '<path d="M19 53 V40 C19 32 25 27 33 27 H45 C47.6 27 47.6 30.2 45 30.2 H34 C27.2 30.2 22.4 34.4 22.4 41 V53 C22.4 55.6 19 55.6 19 53Z"/>',
    dots: [[53, 28.6, 1.9], [47.6, 6.6, 2]],
    kick: 'M82.8 72.5 A15 15 0 0 1 72 84.5',
    bubbles: [[78, 64, 1.8]],
    face: 50,
    ground: [50, 92, 34],
  },
  bell: {
    sil: 'M50 8 C30 8 24 28 24 46 C24 62 14 70 12 80 L88 80 C86 70 76 62 76 46 C76 28 70 8 50 8Z',
    back: '<circle class="lit" cx="50" cy="87.5" r="7.5"/>',
    front: '<rect class="band" x="11" y="74" width="78" height="7.5" rx="3.75"/><path class="stripe thin" d="M16 76.6 H84"/>',
    gloss: '<path d="M28.6 44 C28.6 30 32.4 17 43.8 12.6 C46.4 11.8 47.4 14.6 45.2 15.8 C37 20.4 32.6 30 32.4 43.4 C32.3 46.6 28.6 47 28.6 44Z"/>',
    dots: [[54.6, 12.6, 1.9]],
    kick: 'M73.6 52 C74.2 62 79.6 67.4 83 72.4',
    bubbles: [[66, 68, 1.9], [70.5, 63.5, 1.1]],
    face: 50,
    cheek: 31,
    ground: [50, 95.5, 30],
  },
  star: {
    sil: 'M47.2 12.4 Q50 6 52.8 12.4 L60.6 30.8 Q62 34 65.5 34.2 L85 35.5 Q92 36 86.7 40.6 L71.6 53.7 Q69 56 69.8 59.4 L75.3 81.2 Q77 88 71.1 84.3 L53 72.9 Q50 71 47 72.9 L28.9 84.3 Q23 88 24.7 81.2 L30.2 59.4 Q31 56 28.4 53.7 L13.3 40.6 Q8 36 15 35.5 L34.5 34.2 Q38 34 39.4 30.8 Z',
    gloss: `<path d="M41.6 32.6 L47.4 17.8 C48.2 15.8 50.6 16.6 49.8 18.7 L44.2 33.2 C43.4 35.3 40.8 34.7 41.6 32.6Z"/>
            <path d="M16 38.6 L29.6 37.7 C31.8 37.6 32 40 29.8 40.3 L19.6 41.2 C17.4 41.4 13.8 38.8 16 38.6Z"/>`,
    dots: [[54, 17.6, 1.7]],
    kick: 'M70.8 63.4 L73.9 75.6',
    bubbles: [],
    face: 54,
    cheek: 34,
    ground: [50, 91, 28],
  },
  blob: {
    sil: 'M50 10 C78 8 94 32 90 58 C87 82 68 92 48 90 C24 88 8 74 10 52 C12 28 26 12 50 10Z',
    gloss: '<path d="M16.6 46 C17 30 28.8 17.8 45.6 16 C48.4 15.7 48.8 18.8 46.2 19.4 C32.6 22.6 23.6 32.4 21.2 45.4 C20.6 48.8 16.5 49.2 16.6 46Z"/>',
    dots: [[54.6, 16.6, 2.2]],
    kick: 'M82.4 70 C79.4 78 73.4 83 66.4 85.4',
    bubbles: [[63, 80, 2.2], [69.4, 76, 1.3]],
    face: 52,
    ground: [50, 92.5, 34],
    zz: [78, 14],
  },
  cloud: {
    sil: 'M24 82 C8 82 4 62 18 56 C14 38 34 30 42 38 C46 18 74 16 78 38 C96 36 98 62 86 66 C96 78 84 88 72 82 Z',
    gloss: `<path d="M47.4 33 C49.6 24.4 56.4 20.6 64 20.8 C66.6 20.9 66.6 23.8 64 23.9 C57.4 24.2 52.6 27.6 50.8 33.8 C50.2 36.2 46.8 35.6 47.4 33Z"/>
            <path d="M20.8 51.4 C20.2 45 24.6 40 30.6 39 C32.8 38.7 33.2 41.2 31.2 41.8 C26.4 43.2 23.8 46.8 24.2 51.2 C24.4 53.6 21 53.8 20.8 51.4Z"/>`,
    dots: [[70.6, 24.4, 1.9]],
    kick: 'M88.5 71.5 C90 76.5 86 80.5 80 80.6',
    bubbles: [[60, 76.5, 1.9], [65, 73.2, 1.1]],
    face: 61,
    ground: [52, 88.5, 35],
  },
  mic: {
    sil: 'M50 8 A28 28 0 0 1 78 36 V54 A28 28 0 0 1 22 54 V36 A28 28 0 0 1 50 8 Z',
    back: '<rect class="lit" x="41" y="78" width="18" height="16" rx="5"/>',
    front: '<path class="stripe thin" d="M36 18.5 H64 M32.5 24.5 H67.5"/><rect class="band" x="24" y="64" width="52" height="8" rx="4"/><path class="stripe thin" d="M28 66.8 H72"/>',
    gloss: '<path d="M26.8 50 V37 C26.8 25.2 34.6 15.6 46 13.6 C48.6 13.2 49.2 16.2 46.6 16.8 C37.4 18.8 30.4 26.4 30.4 37 V50 C30.4 52.6 26.8 52.6 26.8 50Z"/>',
    dots: [[55.6, 13, 1.9]],
    kick: 'M70.6 74.6 C68 77.4 64.6 79.2 60.8 79.8',
    bubbles: [],
    face: 46,
    cheek: 31,
    ground: [50, 96, 20],
    zz: [77, 13],
  },
};

// Every critter's gradients need their own ids, because many share a page.
let made = 0;

export function critterSVG(shape = 'blob', color = '#ff6b6b', label = '') {
  const s = SHAPES[shape] || SHAPES.blob;
  const id = `cr${(++made).toString(36)}`;
  const y = s.face;
  const ey = y - 6;
  const [gx, gy, grx] = s.ground;
  // The sleepy z's float off the top right, nudged per shape so they clear wide bodies.
  const [zx, zy] = s.zz || [74, 24];
  // Cheeks sit inside narrow bodies (bell, star, mic) and are clipped to the outline, so a blush never floats in mid-air.
  const ck = s.cheek || 26;
  const crx = s.cheek ? 6.5 : 7.5;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  const circles = (list) => list.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('');
  return `<svg class="critter" viewBox="0 0 100 100" ${a11y} focusable="false" style="--c:${color}">
    <defs>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop class="t-hi" offset="0"/><stop class="t-mid" offset="0.42"/><stop class="t-lo" offset="1"/></linearGradient>
      <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop class="t-pale" offset="0"/><stop class="t-lit" offset="1"/></linearGradient>
      <radialGradient id="${id}g" cx="0.5" cy="1.04" r="0.62"><stop class="t-glow" offset="0"/><stop class="t-glow t-0" offset="1"/></radialGradient>
      <radialGradient id="${id}h" cx="0.34" cy="0.16" r="0.6"><stop class="w-sheen" offset="0"/><stop class="w-0" offset="1"/></radialGradient>
      <linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop class="w-rim" offset="0"/><stop class="w-0" offset="0.32"/><stop class="t-glow t-0" offset="0.62"/><stop class="t-glow" offset="1"/></linearGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop class="w-gloss" offset="0"/><stop class="w-gloss-end" offset="1"/></linearGradient>
      <radialGradient id="${id}k"><stop class="t-shadow" offset="0"/><stop class="t-shadow t-0" offset="1"/></radialGradient>
      <radialGradient id="${id}e" cx="0.5" cy="0.62" r="0.62"><stop class="eye-white" offset="0.55"/><stop class="eye-shade" offset="1"/></radialGradient>
      <radialGradient id="${id}p"><stop class="blush" offset="0"/><stop class="blush t-0" offset="1"/></radialGradient>
      <clipPath id="${id}c"><path d="${s.sil}"/></clipPath>
    </defs>
    <ellipse class="ground" cx="${gx}" cy="${gy}" rx="${grx}" ry="4.2" fill="url(#${id}k)"/>
    <g class="body">
      ${s.back ? s.back.replaceAll('class="lit"', `class="lit" fill="url(#${id}l)"`) : ''}
      <path class="skin" d="${s.sil}" fill="url(#${id}b)"/>
      <g class="light" clip-path="url(#${id}c)">
        <path d="${s.sil}" fill="url(#${id}g)"/>
        <path d="${s.sil}" fill="url(#${id}h)"/>
        <path class="rim" d="${s.sil}" fill="none" stroke="url(#${id}r)"/>
      </g>
      ${s.front ? s.front.replaceAll('class="lit"', `class="lit" fill="url(#${id}l)"`).replaceAll('class="band"', `class="band" fill="url(#${id}b)"`) : ''}
      <path class="edge" d="${s.sil}" fill="none"/>
    </g>
    <g class="shine">
      <g class="bubbles">${circles(s.bubbles)}</g>
      <path class="kick" d="${s.kick}"/>
      <g class="gloss" fill="url(#${id}s)">${s.gloss}</g>
      <g class="sparkle">${circles(s.dots)}</g>
    </g>
    <g class="face">
      <g class="cheeks" fill="url(#${id}p)" clip-path="url(#${id}c)"><ellipse cx="${ck}" cy="${y + 5}" rx="${crx}" ry="4.4"/><ellipse cx="${100 - ck}" cy="${y + 5}" rx="${crx}" ry="4.4"/></g>
      <g class="eyes-open">
        <circle class="eye" cx="38" cy="${ey}" r="9.5" fill="url(#${id}e)"/><circle class="eye" cx="62" cy="${ey}" r="9.5" fill="url(#${id}e)"/>
        <g class="look"><g class="pupils">
          <circle class="pupil" cx="39" cy="${ey + 1}" r="5.6"/><circle class="pupil" cx="63" cy="${ey + 1}" r="5.6"/>
          <path class="iris" d="M35.2 ${ey + 3.2} a4.6 4.6 0 0 0 7.6 0 a5.2 3.6 0 0 1 -7.6 0Z M59.2 ${ey + 3.2} a4.6 4.6 0 0 0 7.6 0 a5.2 3.6 0 0 1 -7.6 0Z"/>
          <circle class="glint" cx="41" cy="${ey - 1.2}" r="2.1"/><circle class="glint" cx="65" cy="${ey - 1.2}" r="2.1"/>
          <circle class="glint small" cx="37.1" cy="${ey + 3}" r="0.95"/><circle class="glint small" cx="61.1" cy="${ey + 3}" r="0.95"/>
        </g></g>
      </g>
      <g class="eyes-closed"><path d="M30.5 ${ey} q7.5 6.5 15 0"/><path d="M54.5 ${ey} q7.5 6.5 15 0"/></g>
      <path class="mouth" d="M43.5 ${y + 8} q6.5 6 13 0"/>
      <g class="mouth-open"><ellipse cx="50" cy="${y + 10}" rx="5.5" ry="6.5"/><ellipse class="tongue" cx="50" cy="${y + 13.4}" rx="3.6" ry="2.4"/></g>
      <g class="zzz"><text class="z1" x="${zx}" y="${zy}" font-size="17">z</text><text class="z2" x="${zx + 11}" y="${zy - 13}" font-size="12">z</text></g>
    </g>
  </svg>`;
}
