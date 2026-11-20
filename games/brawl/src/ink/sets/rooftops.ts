// Lamp Street: across the rooftops of an old town at night. Port of lab/stages/rooftops.js, RE-FITTED
// to the standard layout: the chimney stack moved right so its cap is the left ledge (x -5.4..-2.6 at
// 2.5, was -6.4..-3.6), stood in front of the stair tower and narrowed so the two read apart; the sign
// bracket and the washing pole's arm were already standard. The street below and two more houses
// carry the picture out to the camera's edges.

import { ARENA } from '../../sim/arena.ts';
import type { StageSet } from '../api.ts';
import { makeSet, rng, type Kit, type Pt } from './kit.ts';

const L = ARENA;
const CH = L.soft[0]; // chimney cap
const AR = L.soft[1]; // washing pole arm
const SG = L.soft[2]; // sign bracket
const STREET = -4.5;

function far(P: Kit): void {
  const { S } = P;
  P.sky(23, [-23, 1.5, 23, 17], 270, [[-11.2, 9.2, 0.3], [-7.4, 6.8, 0.22, 0.6], [6.8, 9.6, 0.34], [11.4, 7.4, 0.24, 0.65], [-16.6, 11.6, 0.3], [16.8, 8.2, 0.26, 0.6], [-3.8, 14.2, 0.22, 0.6], [12.6, 14.8, 0.24]],
    (x, y) => Math.hypot(x - 9.6, y - 8.6) < 1.2 || (Math.abs(x) < 6.8 && y < 8.4));
  // a thin cream crescent, no colour, the lamps keep the warmth
  P.line(P.A(9.6, 8.6, 0.8, 1.9, 4.6, 20), { w: 1.8, taper: 0.8 });
  P.line(S([[9.45, 9.35], [9.15, 8.6], [9.5, 7.85]], 8), { w: 1.1, alpha: 0.7, taper: 0.9 });

  // the far town: a long skyline, thin and dim
  P.town(-23.2, 23.2, 0.3, -12, { seed: 41, hMin: 0.3, hMax: 1.6, wMin: 0.5, wMax: 1.2, alpha: 0.3, w: 0.9, tint: 'blue', spire: 0.05 });
  P.town(-23.2, 23.2, -0.9, -12, { seed: 44, hMin: 0.4, hMax: 1.6, wMin: 0.8, wMax: 1.6, alpha: 0.45, w: 1.1, tint: 'blue', spire: 0.03 });
}

function near(P: Kit): void {
  const { S, E } = P;

  // nearer houses beside the deck, lower, with pitched roofs and chimneys (not places to stand)
  function house(x0: number, x1: number, eave: number, ridge: number, seed: number, flip: boolean): void {
    const m = (x0 + x1) / 2;
    const shape: Pt[] = [[x0, STREET], [x0, eave], [m, ridge], [x1, eave], [x1, STREET]];
    P.mask(shape);
    P.line(shape, { w: 1.8, alpha: 0.85, taper: 0.1 });
    const r = rng(seed);
    // roof tiles: short strokes in rows down both slopes
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      for (let u = 0.12; u < 0.9; u += 0.16) {
        const xa = x0 + (m - x0) * u, ya = eave + (ridge - eave) * u;
        const xb = x1 - (x1 - m) * u, yb = ya;
        const d = 0.35 * t;
        if (r() < 0.5) P.line([[xa + d, ya - d * 0.3], [xa + d + 0.1, ya - d * 0.3 - 0.06]], { w: 0.8, alpha: 0.35, taper: 0.4 });
        if (r() < 0.5) P.line([[xb - d, yb - d * 0.3], [xb - d - 0.1, yb - d * 0.3 - 0.06]], { w: 0.8, alpha: 0.35, taper: 0.4 });
      }
    }
    P.line([[x0 - 0.15, eave], [x1 + 0.15, eave]], { w: 1.2, alpha: 0.7, taper: 0.2 });
    // windows, dark
    for (let y = eave - 1.0; y > STREET + 0.3; y -= 1.6) {
      for (let x = x0 + 0.5; x < x1 - 0.8; x += 1.2) {
        const win: Pt[] = [[x, y], [x + 0.55, y], [x + 0.55, y - 0.85], [x, y - 0.85]];
        P.line(win, { w: 1, alpha: 0.55, closed: true });
        P.line([[x + 0.275, y], [x + 0.275, y - 0.85]], { w: 0.8, alpha: 0.4, taper: 0.1 });
        if (r() < 0.5) P.hatch(win, { angle: 1.2, gap: 3.5, alpha: 0.4 });
      }
    }
    // chimney
    const cx = m + (flip ? -1 : 1) * (x1 - x0) * 0.22;
    const cy = eave + (ridge - eave) * (1 - Math.abs(cx - m) / ((x1 - x0) / 2));
    P.form([[cx - 0.2, cy - 0.1], [cx + 0.2, cy - 0.1], [cx + 0.2, cy + 0.65], [cx - 0.2, cy + 0.65]], { w: 1.3, alpha: 0.8 });
  }
  P.tone(0.9);
  house(-20.2, -13.8, -2.8, -1.0, 5, false);
  house(13.8, 20.2, -1.7, 0.1, 6, true);
  P.tone(1);
  house(-13.4, -9.4, -1.8, -0.2, 3, true);
  house(9.2, 13.4, -2.4, -0.9, 4, false);

  // the street: a kerb and a few cobbles fading into the dark
  P.line([[-20.5, STREET], [20.5, STREET]], { w: 1.4, alpha: 0.7, taper: 0.05 });
  P.line([[-20.5, STREET - 0.22], [20.5, STREET - 0.22]], { w: 0.8, alpha: 0.4, taper: 0.05 });
  const rc = rng(57);
  for (let row = 0, y = STREET - 0.55; row < 5; row++, y -= 0.5 + row * 0.12) {
    for (let x = -20.5 + rc() * 0.6; x < 20.5; x += 0.45 + rc() * 0.5 + row * 0.15) {
      if (rc() < 0.25 + row * 0.12) continue;
      P.line([[x, y], [x + 0.22 + rc() * 0.12, y + 0.02]], { w: 0.8, alpha: 0.32 - row * 0.05, taper: 0.5 });
    }
  }

  // street lamps far below in the gaps: the warm notes
  for (const [x, top] of [[-8.75, -1.7], [8.55, -2.0], [12.2, -3.0], [-15.4, -2.2]]) {
    P.line([[x, STREET], [x, top]], { w: 1.4, alpha: 0.85, taper: 0.1 });
    P.line(S([[x, top], [x + 0.3, top + 0.25], [x + 0.55, top + 0.1]], 5), { w: 1.2, alpha: 0.85 });
    const lx = x + 0.55, ly = top - 0.05;
    const cage: Pt[] = [[lx - 0.22, ly], [lx + 0.22, ly], [lx + 0.15, ly - 0.45], [lx - 0.15, ly - 0.45]];
    P.tone(1.4);
    P.form(cage, { w: 1.4, tint: 'gold', wash: 0.5 });
    P.form(S([[lx, ly - 0.08], [lx + 0.07, ly - 0.22], [lx, ly - 0.38], [lx - 0.07, ly - 0.22]], 5, true), { w: 1, tint: 'yellow', wash: 0.8 });
    // the lit cobbles: a short run of gold hatch on the street under it
    P.hatch(S([[lx - 0.9, STREET], [lx - 0.5, STREET + 0.6], [lx + 0.6, STREET + 0.6], [lx + 1.0, STREET]], 4, true), { angle: 0.25, gap: 4, tint: 'gold', alpha: 0.45 });
    P.tone(1);
  }

  // the main building: a flat roof with a coping, brick front, dark windows
  P.mask([[-7.6, -0.42], [7.6, -0.42], [7.6, STREET], [-7.6, STREET]]);
  P.line([[-7.6, -0.42], [-7.6, STREET]], { w: 2.4, taper: 0.1 });
  P.line([[7.6, -0.42], [7.6, STREET]], { w: 2.4, taper: 0.1 });
  for (let i = 0, y = -0.8; y > STREET; y -= 0.38, i++) {
    if (i % 3) continue;
    P.line([[-7.55, y], [7.55, y]], { w: 0.8, alpha: 0.18, taper: 0.4 });
  }
  for (const x of [-6.2, -3.6, -1.0, 1.6, 4.2]) {
    const win: Pt[] = [[x, -1.3], [x + 1.1, -1.3], [x + 1.1, -3.1], [x, -3.1]];
    P.form([[x - 0.12, -3.1], [x + 1.22, -3.1], [x + 1.22, -3.28], [x - 0.12, -3.28]], { w: 1.3 });
    P.form(win, { w: 1.7 });
    P.line([[x + 0.55, -1.3], [x + 0.55, -3.1]], { w: 1, alpha: 0.75, taper: 0.1 });
    P.line([[x, -2.2], [x + 1.1, -2.2]], { w: 1, alpha: 0.75, taper: 0.1 });
    P.hatch(win, { angle: 1.25, gap: 4, alpha: 0.3 });
    P.line([[x - 0.12, -1.3], [x + 0.55, -1.0], [x + 1.22, -1.3]], { w: 1.2, alpha: 0.8 });
  }
  // the street door
  P.form([[-0.45, STREET], [-0.45, -3.75], [0, -3.5], [0.45, -3.75], [0.45, STREET]], { w: 1.4 });
  P.line([[0, -3.6], [0, STREET]], { w: 0.8, alpha: 0.5, taper: 0.1 });
  // drainpipe
  P.line([[7.25, -0.42], [7.25, STREET]], { w: 1.6, alpha: 0.8, taper: 0.05 });
  P.line([[6.95, -0.42], [7.4, -0.42]], { w: 1.4, alpha: 0.8 });
  // the coping
  P.form([[-8, 0], [8, 0], [8, -0.42], [-8, -0.42]], { w: 2.4 });
  P.line([[-7.95, -0.15], [7.95, -0.15]], { w: 1, alpha: 0.5, taper: 0.3 });

  // the stair tower behind the roof, with the sign bracket off its side; quiet, it is background
  P.tone(0.8);
  const tw: Pt[] = [[-3.1, 0], [-1.55, 0], [-1.55, 7.2], [-2.32, 8.6], [-3.1, 7.2]];
  P.form(tw, { w: 1.8, alpha: 0.85 });
  P.line([[-3.25, 7.2], [-1.4, 7.2]], { w: 1.4, alpha: 0.85 });
  for (let y = 0.5; y < 7.0; y += 0.45) P.line([[-3.05, y], [-1.6, y]], { w: 0.7, alpha: 0.22, taper: 0.3 });
  P.form([[-2.6, 5.6], [-2.05, 5.6], [-2.05, 6.5], [-2.32, 6.75], [-2.6, 6.5]], { w: 1.3 });
  P.hatch([[-2.6, 5.6], [-2.05, 5.6], [-2.05, 6.5], [-2.6, 6.5]], { angle: 1.2, gap: 3, alpha: 0.6 });
  P.hatch([[-3.1, 0], [-2.7, 0], [-2.7, 7.2], [-3.1, 7.2]], { angle: 1.3, gap: 4.5, alpha: 0.35 });
  P.tone(1);

  // the chimney stack in front of the tower (soft platform is its cap)
  const sx0 = CH.x0 + 0.65, sx1 = CH.x1 - 0.65;
  P.form([[sx0, 0], [sx1, 0], [sx1, CH.y - 0.3], [sx0, CH.y - 0.3]], { w: 2 });
  for (let i = 0, y = 0.3; y < CH.y - 0.35; y += 0.3, i++) {
    P.line([[sx0, y], [sx1, y]], { w: 0.8, alpha: 0.4, taper: 0.2 });
    for (let x = sx0 + (i % 2) * 0.3 + 0.3; x < sx1 - 0.05; x += 0.6) P.line([[x, y - 0.3], [x, y]], { w: 0.7, alpha: 0.35, taper: 0.2 });
  }
  P.hatch(S([[sx0, CH.y - 0.3], [sx1, CH.y - 0.3], [sx1, CH.y - 1.0], [sx0 + 0.7, CH.y - 0.7], [sx0, CH.y - 1.3]], 3, true), { angle: 1.2, gap: 3.2, alpha: 0.55 });
  P.tone(1.4, 1.12);
  P.form([[CH.x0, CH.y], [CH.x1, CH.y], [CH.x1, CH.y - 0.3], [CH.x0, CH.y - 0.3]], { w: 2 });
  P.tone(1);

  // the washing pole, its arm a platform; a line of washing to the tower
  const px = AR.x1 + 0.12;
  P.form([[px - 0.11, 0], [px + 0.11, 0], [px + 0.09, 3.7], [px - 0.09, 3.7]], { w: 1.8 });
  P.form(E(px, 3.8, 0.14, 0.14, 0, 12), { w: 1.4 });
  P.tone(1.4, 1.12);
  P.form([[AR.x0, AR.y], [AR.x1, AR.y], [AR.x1, AR.y - 0.2], [AR.x0, AR.y - 0.2]], { w: 2 });
  P.tone(1);
  P.line([[px - 0.1, 1.5], [AR.x1 - 1.0, AR.y - 0.2]], { w: 1.6, taper: 0.1 });
  P.form([[px - 0.14, 0], [px + 0.14, 0], [px + 0.14, 0.3], [px - 0.14, 0.3]], { w: 1.2 });
  P.tone(0.9);
  const wl = S([[px, 3.6], [1.6, 2.95], [-1.55, 3.55]], 12);
  P.line(wl, { w: 1, alpha: 0.75, taper: 0.1 });
  const at = (x: number): number => {
    let best = wl[0];
    for (const q of wl) if (Math.abs(q[0] - x) < Math.abs(best[0] - x)) best = q;
    return best[1];
  };
  // a shirt, a sheet, two socks: moved left along the line so none hangs over the pole's arm
  {
    const x = 2.05, y = at(2.05) - 0.02;
    const shirt: Pt[] = [[x - 0.35, y], [x + 0.35, y], [x + 0.6, y - 0.35], [x + 0.42, y - 0.48], [x + 0.3, y - 0.36], [x + 0.28, y - 1.05], [x - 0.3, y - 1.05], [x - 0.3, y - 0.36], [x - 0.42, y - 0.48], [x - 0.6, y - 0.35]];
    P.form(shirt, { w: 1.4, tint: 'blue', wash: 0.2 });
    P.line([[x - 0.12, y], [x, y - 0.18], [x + 0.12, y]], { w: 1, tint: 'blue', alpha: 0.8 });
  }
  {
    const x0 = 0.25, x1 = 1.6, y0 = at(x0), y1 = at(x1);
    const sheet: Pt[] = [[x0, y0], ...S([[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - 0.05], [x1, y1]], 6), [x1, y1], [x1 + 0.08, y1 - 1.25], [x1 - 0.5, y1 - 1.18], [x0 + 0.6, y1 - 1.32], [x0 - 0.05, y0 - 1.2]];
    P.form(sheet, { w: 1.4 });
    P.line(S([[x0 + 0.5, y0 - 0.1], [x0 + 0.45, y0 - 0.7], [x0 + 0.6, y0 - 1.2]], 5), { w: 0.9, alpha: 0.5, taper: 0.7 });
    P.line(S([[x0 + 1.1, y1 - 0.1], [x0 + 1.15, y1 - 0.6], [x0 + 1.05, y1 - 1.1]], 5), { w: 0.9, alpha: 0.5, taper: 0.7 });
  }
  for (const x of [-0.75, -0.35]) {
    const y = at(x);
    P.form([[x - 0.08, y], [x + 0.08, y], [x + 0.08, y - 0.42], [x + 0.2, y - 0.52], [x + 0.16, y - 0.62], [x - 0.08, y - 0.55]], { w: 1.1 });
  }
  for (const x of [1.7, 2.4, 0.35, 1.5, -0.75, -0.35]) {
    const y = at(x);
    P.line([[x, y + 0.08], [x, y - 0.12]], { w: 1.4, alpha: 0.9, taper: 0 });
  }
  P.tone(1);

  // the sign bracket (top platform) with a blank hanging sign and a key drawn on it
  P.tone(1.4, 1.12);
  P.form([[SG.x0 - 0.06, SG.y], [SG.x1, SG.y], [SG.x1, SG.y - 0.14], [SG.x0 - 0.06, SG.y - 0.14]], { w: 1.8 });
  P.tone(1);
  P.line(S([[SG.x0, SG.y - 1.3], [SG.x0 + 0.7, SG.y - 0.75], [SG.x0 + 1.7, SG.y - 0.3], [SG.x1 - 0.2, SG.y - 0.16]], 8), { w: 1.6 });
  P.line(S([[SG.x0 + 0.5, SG.y - 0.14], [SG.x0 + 0.85, SG.y - 0.5], [SG.x0 + 0.55, SG.y - 0.72], [SG.x0 + 0.35, SG.y - 0.5], [SG.x0 + 0.55, SG.y - 0.4]], 6), { w: 1.2, alpha: 0.85 });
  P.line(S([[SG.x0 + 1.4, SG.y - 0.14], [SG.x0 + 1.75, SG.y - 0.4], [SG.x0 + 2.0, SG.y - 0.28]], 6), { w: 1.1, alpha: 0.8 });
  for (const x of [SG.x0 + 0.85, SG.x1 - 0.35]) P.line([[x, SG.y - 0.14], [x, SG.y - 0.55]], { w: 1.1, alpha: 0.9, taper: 0 });
  const board: Pt[] = [[SG.x0 + 0.6, SG.y - 0.55], [SG.x1 - 0.1, SG.y - 0.55], [SG.x1 - 0.1, SG.y - 1.55], [SG.x0 + 0.6, SG.y - 1.55]];
  P.form(board, { w: 1.8 });
  P.line([[SG.x0 + 0.72, SG.y - 0.67], [SG.x1 - 0.22, SG.y - 0.67], [SG.x1 - 0.22, SG.y - 1.43], [SG.x0 + 0.72, SG.y - 1.43]], { w: 0.8, alpha: 0.55, closed: true });
  const kx = (SG.x0 + 0.6 + SG.x1 - 0.1) / 2, ky = SG.y - 1.05;
  P.line(E(kx - 0.42, ky, 0.15, 0.15, 0, 14), { w: 1.3, closed: true });
  P.line([[kx - 0.27, ky], [kx + 0.5, ky]], { w: 1.3, taper: 0.1 });
  P.line([[kx + 0.3, ky], [kx + 0.3, ky - 0.15]], { w: 1.2, taper: 0 });
  P.line([[kx + 0.46, ky], [kx + 0.46, ky - 0.2]], { w: 1.2, taper: 0 });

  P.walk(L.main.x0, L.main.x1, L.main.y, { w: 5.2 });
  for (const s of L.soft) P.walk(s.x0, s.x1, s.y);
}

export function createRooftopsSet(): StageSet {
  return makeSet({ id: 'rooftops', name: 'Lamp Street', far, near, parallax: 0.1 });
}
