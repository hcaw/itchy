// Critters: the friendly faces of each layer. Original artwork drawn as SVG in code.
// Shape tells you the sound (drum, robot, bell, star, blob, cloud, mic); colour tells
// you which critter it is. Eyes close when it's asleep (muted); the mouth opens when it sings.
// They blink now and then, and their eyes follow your finger (see delight.js).

const BODIES = {
  drum: `<ellipse cx="50" cy="62" rx="38" ry="28"/><rect x="12" y="36" width="76" height="27" />
         <ellipse cx="50" cy="36" rx="38" ry="14" class="lighter"/>
         <path d="M18 44 L34 74 L50 46 L66 74 L82 44" class="stripe"/>`,
  robot: `<rect x="14" y="22" width="72" height="66" rx="18"/>
          <line x1="50" y1="22" x2="50" y2="9" class="stripe dark"/><circle cx="50" cy="8" r="6" class="lighter"/>
          <rect x="24" y="72" width="52" height="7" rx="3.5" class="lighter"/>`,
  bell: `<path d="M50 8 C30 8 24 28 24 46 C24 62 14 70 12 80 L88 80 C86 70 76 62 76 46 C76 28 70 8 50 8Z"/>
         <circle cx="50" cy="86" r="8" class="lighter"/>`,
  star: `<path d="M50 6 L62 34 L92 36 L69 56 L77 88 L50 71 L23 88 L31 56 L8 36 L38 34 Z" stroke-linejoin="round"/>`,
  blob: `<path d="M50 10 C78 8 94 32 90 58 C87 82 68 92 48 90 C24 88 8 74 10 52 C12 28 26 12 50 10Z"/>`,
  cloud: `<path d="M24 82 C8 82 4 62 18 56 C14 38 34 30 42 38 C46 18 74 16 78 38 C96 36 98 62 86 66 C96 78 84 88 72 82 Z"/>`,
  mic: `<rect x="22" y="8" width="56" height="74" rx="28"/>
        <path d="M32 28 H68 M30 66 H70" class="stripe"/>
        <rect x="42" y="82" width="16" height="12" rx="4" class="lighter"/>`,
};

// A soft highlight on each body, so it looks rounded rather than flat.
const SHINES = {
  drum: '<ellipse cx="34" cy="33" rx="14" ry="4.5"/>',
  robot: '<path d="M24 34 q2 -8 12 -8" class="shine-line"/>',
  bell: '<path d="M34 24 q4 -10 12 -11" class="shine-line"/>',
  star: '<path d="M44 22 l3 -7" class="shine-line"/>',
  blob: '<path d="M24 30 q8 -12 22 -13" class="shine-line"/>',
  cloud: '<path d="M48 30 q6 -8 16 -7" class="shine-line"/>',
  mic: '<path d="M34 18 q5 -5 12 -5" class="shine-line"/>',
};

// Faces sit in slightly different places on each body.
const FACE_Y = { drum: 58, robot: 48, bell: 48, star: 52, blob: 50, cloud: 60, mic: 44 };

export function critterSVG(shape = 'blob', color = '#ff6b6b', label = '') {
  const y = FACE_Y[shape] ?? 50;
  const body = BODIES[shape] || BODIES.blob;
  const ey = y - 6;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="critter" viewBox="0 0 100 100" ${a11y} focusable="false" style="--c:${color}">
    <g class="body">${body}</g>
    <g class="shine">${SHINES[shape] || ''}</g>
    <g class="face">
      <g class="cheeks"><ellipse cx="27" cy="${y + 5}" rx="5.5" ry="3.2"/><ellipse cx="73" cy="${y + 5}" rx="5.5" ry="3.2"/></g>
      <g class="eyes-open">
        <circle cx="38" cy="${ey}" r="9" fill="#fff"/><circle cx="62" cy="${ey}" r="9" fill="#fff"/>
        <g class="look"><g class="pupils">
          <circle cx="39" cy="${ey + 1}" r="4.8" fill="#221c33"/><circle cx="63" cy="${ey + 1}" r="4.8" fill="#221c33"/>
          <circle cx="40.8" cy="${ey - 0.8}" r="1.6" fill="#fff"/><circle cx="64.8" cy="${ey - 0.8}" r="1.6" fill="#fff"/>
        </g></g>
      </g>
      <g class="eyes-closed" fill="none" stroke="#221c33" stroke-width="3.5" stroke-linecap="round">
        <path d="M30 ${ey} q8 6 16 0"/><path d="M54 ${ey} q8 6 16 0"/>
      </g>
      <path class="mouth" d="M43 ${y + 8} q7 6 14 0" fill="none" stroke="#221c33" stroke-width="3.5" stroke-linecap="round"/>
      <ellipse class="mouth-open" cx="50" cy="${y + 10}" rx="5.5" ry="6.5" fill="#221c33"/>
      <g class="zzz" fill="#5b5179" font-family="Nunito, system-ui, sans-serif" font-weight="900"><text class="z1" x="74" y="24" font-size="17">z</text><text class="z2" x="85" y="11" font-size="12">z</text></g>
    </g>
  </svg>`;
}
