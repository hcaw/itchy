// Critters: the friendly faces of each layer. Original artwork drawn as SVG in code.
// Shape tells you the sound (drum, robot, bell, star, blob, cloud, mic); colour tells
// you which critter it is. Eyes close when it's asleep (muted); the mouth opens when it sings.

const BODIES = {
  drum: `<ellipse cx="50" cy="62" rx="38" ry="28"/><rect x="12" y="36" width="76" height="27" />
         <ellipse cx="50" cy="36" rx="38" ry="14" class="lighter"/>
         <path d="M18 44 L34 74 L50 46 L66 74 L82 44" class="stripe"/>`,
  robot: `<rect x="14" y="22" width="72" height="66" rx="16"/>
          <line x1="50" y1="22" x2="50" y2="8" class="stripe"/><circle cx="50" cy="8" r="6" class="lighter"/>
          <rect x="22" y="70" width="56" height="8" rx="4" class="lighter"/>`,
  bell: `<path d="M50 8 C30 8 24 28 24 46 C24 62 14 70 12 80 L88 80 C86 70 76 62 76 46 C76 28 70 8 50 8Z"/>
         <circle cx="50" cy="86" r="8" class="lighter"/>`,
  star: `<path d="M50 6 L62 34 L92 36 L69 56 L77 88 L50 71 L23 88 L31 56 L8 36 L38 34 Z" stroke-linejoin="round" class="round"/>`,
  blob: `<path d="M50 10 C78 8 94 32 90 58 C87 82 68 92 48 90 C24 88 8 74 10 52 C12 28 26 12 50 10Z"/>`,
  cloud: `<path d="M24 82 C8 82 4 62 18 56 C14 38 34 30 42 38 C46 18 74 16 78 38 C96 36 98 62 86 66 C96 78 84 88 72 82 Z"/>`,
  mic: `<rect x="22" y="8" width="56" height="74" rx="28"/>
        <path d="M30 30 H70 M28 44 H72 M30 58 H70" class="stripe"/>
        <rect x="42" y="82" width="16" height="12" rx="4" class="lighter"/>`,
};

// Faces sit in slightly different places on each body.
const FACE_Y = { drum: 58, robot: 46, bell: 48, star: 52, blob: 50, cloud: 58, mic: 40 };

export function critterSVG(shape = 'blob', color = '#ff6b6b', label = '') {
  const y = FACE_Y[shape] ?? 50;
  const body = BODIES[shape] || BODIES.blob;
  return `<svg class="critter" viewBox="0 0 100 100" role="img" aria-label="${label}" style="--c:${color}">
    <g class="body">${body}</g>
    <g class="face">
      <g class="eyes-open">
        <circle cx="38" cy="${y - 6}" r="9" fill="#fff"/><circle cx="62" cy="${y - 6}" r="9" fill="#fff"/>
        <circle class="pupil" cx="39" cy="${y - 5}" r="4.5" fill="#222"/><circle class="pupil" cx="63" cy="${y - 5}" r="4.5" fill="#222"/>
      </g>
      <g class="eyes-closed" fill="none" stroke="#222" stroke-width="3.5" stroke-linecap="round">
        <path d="M30 ${y - 6} q8 6 16 0"/><path d="M54 ${y - 6} q8 6 16 0"/>
      </g>
      <path class="mouth" d="M43 ${y + 8} q7 6 14 0" fill="none" stroke="#222" stroke-width="3.5" stroke-linecap="round"/>
      <ellipse class="mouth-open" cx="50" cy="${y + 10}" rx="6" ry="7" fill="#222"/>
      <g class="zzz" fill="#333" font-family="system-ui,sans-serif" font-weight="900"><text x="74" y="22" font-size="18">z</text><text x="84" y="10" font-size="13">z</text></g>
    </g>
  </svg>`;
}
