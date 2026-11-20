// HUD marks: the four robot head portraits and the four stance icons, as flat vector SVG drawn in
// code. Heads are drawn in a 64x64 box and must read at 48 px; stance icons in a 20x20 box, one
// colour (currentColor) so the plate decides it.

import type { FighterId, Stance } from '../../sim/types.ts';

/** livery per robot: main paint, dark iron, light bevel, glow */
export const LIVERY: Record<FighterId, { main: string; dark: string; light: string; glow: string }> = {
  kiln: { main: '#c4642c', dark: '#2a1d17', light: '#e8894c', glow: '#ff7a1a' },
  tick: { main: '#a9bccb', dark: '#1c2633', light: '#dde8f1', glow: '#f4f8ff' },
  gantry: { main: '#4f8a8b', dark: '#13232a', light: '#77b3ae', glow: '#8ff0e6' },
  vise: { main: '#5d6b7a', dark: '#161c24', light: '#8796a6', glow: '#ffc21a' },
};

const INK = '#05090f';

/** head mark, 64x64 viewBox, hard ink outline (stroke drawn under the fill via a back copy) */
export function headMark(id: FighterId): string {
  const L = LIVERY[id];
  let shapes = '';
  switch (id) {
    case 'kiln':
      // squat foundry head: chamfered block, two chimney stubs, slit eyes under a heavy brow, a furnace grate
      shapes = `
        <rect x="21" y="5" width="7" height="9" fill="${L.dark}"/>
        <rect x="36" y="5" width="7" height="9" fill="${L.dark}"/>
        <path d="M6 24 L15 13 H49 L58 24 V50 L50 59 H14 L6 50 Z" fill="${L.main}"/>
        <path d="M15 13 H49 L58 24 H6 Z" fill="${L.light}"/>
        <path d="M10 25 H54 L52 35 H12 Z" fill="${L.dark}"/>
        <path d="M16 28 H28 L27 31 H16 Z" fill="#ffc21a"/>
        <path d="M36 28 H48 V31 H37 Z" fill="#ffc21a"/>
        <rect x="17" y="39" width="30" height="14" fill="${L.dark}"/>
        <rect x="20" y="42" width="4" height="8" fill="${L.glow}"/>
        <rect x="27" y="42" width="4" height="8" fill="#ffc21a"/>
        <rect x="34" y="42" width="4" height="8" fill="#ffc21a"/>
        <rect x="41" y="42" width="3" height="8" fill="${L.glow}"/>
        <rect x="6" y="38" width="5" height="10" fill="${L.dark}"/>
        <rect x="53" y="38" width="5" height="10" fill="${L.dark}"/>`;
      break;
    case 'tick':
      // small clockwork head: two blade antennae, an octagon shell, one big lens with a clock hand
      shapes = `
        <path d="M20 26 L9 1 L28 22 Z" fill="${L.light}"/>
        <path d="M44 26 L55 1 L36 22 Z" fill="${L.light}"/>
        <path d="M24 18 H40 L51 29 V45 L40 56 H24 L13 45 V29 Z" fill="${L.main}"/>
        <path d="M24 18 H40 L51 29 H13 Z" fill="${L.light}"/>
        <circle cx="32" cy="38" r="12" fill="${L.dark}"/>
        <circle cx="32" cy="38" r="8.5" fill="none" stroke="${L.glow}" stroke-width="2.6"/>
        <path d="M32 38 L32 31.5 M32 38 L36.5 40.5" stroke="${L.glow}" stroke-width="2.4" stroke-linecap="square"/>
        <rect x="21" y="54" width="22" height="6" fill="#d9a441"/>
        <rect x="25" y="54" width="3" height="6" fill="${L.dark}"/><rect x="31" y="54" width="3" height="6" fill="${L.dark}"/><rect x="37" y="54" width="3" height="6" fill="${L.dark}"/>`;
      break;
    case 'gantry':
      // tall crane cab: a boom with a hook off the top, a hazard-striped crown, a long visor window
      shapes = `
        <path d="M38 12 L57 2 L60 6 L42 15 Z" fill="${L.dark}"/>
        <path d="M56 5 V14 Q56 19 52 19 Q48 19 48 15" fill="none" stroke="${L.dark}" stroke-width="3"/>
        <path d="M17 10 H44 L48 15 V60 H17 Z" fill="${L.main}"/>
        <clipPath id="gtz"><rect x="17" y="10" width="31" height="9"/></clipPath>
        <g clip-path="url(#gtz)"><rect x="17" y="10" width="31" height="9" fill="#ffc21a"/>
          <path d="M14 19 L23 10 H28 L19 19 Z M24 19 L33 10 H38 L29 19 Z M34 19 L43 10 H48 L39 19 Z M44 19 L53 10 H58 L49 19 Z" fill="${L.dark}"/></g>
        <rect x="20" y="25" width="25" height="11" fill="${L.dark}"/>
        <rect x="23" y="29" width="19" height="3" fill="${L.glow}"/>
        <rect x="17" y="42" width="31" height="3" fill="${L.light}"/>
        <rect x="21" y="49" width="4" height="7" fill="${L.dark}"/><rect x="28" y="49" width="4" height="7" fill="${L.dark}"/><rect x="35" y="49" width="4" height="7" fill="${L.dark}"/>`;
      break;
    case 'vise':
      // wide grappler head: flat top, a clamp jaw on each side, a narrow visor slit, a heavy chin
      shapes = `
        <path d="M2 18 H16 V24 H9 V44 H16 V50 H2 Z" fill="${L.dark}"/>
        <path d="M62 18 H48 V24 H55 V44 H48 V50 H62 Z" fill="${L.dark}"/>
        <path d="M14 14 H50 L52 20 V50 L46 58 H18 L12 50 V20 Z" fill="${L.main}"/>
        <path d="M14 14 H50 L52 20 H12 Z" fill="${L.light}"/>
        <rect x="16" y="28" width="32" height="7" fill="${L.dark}"/>
        <rect x="19" y="30" width="26" height="3" fill="${L.glow}"/>
        <path d="M18 44 H46 L42 52 H22 Z" fill="${L.dark}"/>
        <rect x="24" y="46" width="16" height="2" fill="${L.light}"/>`;
      break;
  }
  // the outline: the same shapes drawn fat in ink underneath
  const outline = shapes
    .replace(/fill="[^"]*"/g, `fill="${INK}"`)
    .replace(/<clipPath[\s\S]*?<\/clipPath>/g, '')
    .replace(/clip-path="[^"]*"/g, '')
    .replace(/stroke="[^"]*"/g, `stroke="${INK}"`)
    .replace(/<(rect|path|circle)/g, `<$1 stroke="${INK}" stroke-width="5" stroke-linejoin="miter"`);
  return `<g>${outline}</g><g>${shapes}</g>`;
}

/** stance icon, 20x20 viewBox, filled with currentColor */
export function stanceMark(stance: Stance): string {
  switch (stance) {
    case 'rush':
      // two hard chevrons driving forward
      return '<path d="M2 3 H7 L13 10 L7 17 H2 L8 10 Z M9 3 H14 L20 10 L14 17 H9 L15 10 Z" fill="currentColor"/>';
    case 'keepaway':
      // a bar held at arm's length: a stop line and a chevron backing off from it
      return '<path d="M15 2 H19 V18 H15 Z M12 3 H7 L1 10 L7 17 H12 L6 10 Z" fill="currentColor"/>';
    case 'bait':
      // a sprung jaw trap, open: two toothed jaws with a gap to step into
      return '<path d="M1 1 H19 V5 L16.5 9 L14 5 L11.5 9 L9 5 L6.5 9 L4 5 L1 9 Z M1 19 H19 V15 L16.5 11 L14 15 L11.5 11 L9 15 L6.5 11 L4 15 L1 11 Z" fill="currentColor"/>';
    case 'wall':
      // three courses of plate, offset like a brick wall
      return '<path d="M1 2 H11 V7 H1 Z M13 2 H19 V7 H13 Z M1 9 H6 V14 H1 Z M8 9 H19 V14 H8 Z M1 16 H11 V20 H1 Z M13 16 H19 V20 H13 Z" fill="currentColor"/>';
  }
}

/** a hex bolt head token (one life), centred on 0,0, radius r. Two halves so a lost life can break. */
export function boltHalves(r: number): { left: string; right: string; socket: string } {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push([Math.round(Math.cos(a) * r * 100) / 100, Math.round(Math.sin(a) * r * 100) / 100]);
  }
  // pts: 0 = lower right (30deg), 1 = bottom (90), 2 = lower left, 3 = upper left, 4 = top, 5 = upper right
  const p = (i: number) => `${pts[i][0]} ${pts[i][1]}`;
  // two halves split by a jagged crack from the top point to the bottom point
  const leftPoly = `M0 ${-r} L${r * 0.12} ${-r * 0.35} L${-r * 0.1} ${r * 0.05} L${r * 0.08} ${r * 0.45} L0 ${r} L${p(2)} L${p(3)} Z`;
  const rightPoly = `M0 ${-r} L${p(5)} L${p(0)} L0 ${r} L${r * 0.08} ${r * 0.45} L${-r * 0.1} ${r * 0.05} L${r * 0.12} ${-r * 0.35} Z`;
  const socket = `M${p(0)} L${p(1)} L${p(2)} L${p(3)} L${p(4)} L${p(5)} Z`;
  return { left: leftPoly, right: rightPoly, socket };
}
