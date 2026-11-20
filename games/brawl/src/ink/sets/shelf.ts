// The Long Shelf: the top of the library's tallest bookcase. Port of lab/stages/shelf.js, RE-FITTED to
// the standard layout: the low folio stack is now x -5.4..-2.6 at 2.5, the tall stack moved to the
// centre (x -1.5..1.5 at 4.8), the ladder keeps one standing rung (x 2.6..5.4 at 2.5); its upper rungs
// are thin background rungs set higher, and the chandelier hangs over the low stack, clear of heads.

import { ARENA } from '../../sim/arena.ts';
import type { StageSet } from '../api.ts';
import { makeSet, rng, type Kit, type Pt } from './kit.ts';

const L = ARENA;
const [LOW, RIGHT, TOP] = [L.soft[0], L.soft[1], L.soft[2]];
const SPINE_TINTS = ['coral', 'green', 'blue', 'gold'];

function far(P: Kit): void {
  const { S } = P;
  // the vaults beyond: ribbed pointed arches on thin far columns, very dim
  const cols: number[] = [];
  for (let x = -24.5; x <= 23.6; x += 6) cols.push(x);
  for (const x of cols) {
    P.line([[x - 0.25, -12], [x - 0.25, 5.4]], { w: 1, alpha: 0.3, taper: 0.1 });
    P.line([[x + 0.25, -12], [x + 0.25, 5.4]], { w: 1, alpha: 0.3, taper: 0.1 });
    P.line([[x - 0.45, 5.4], [x + 0.45, 5.4]], { w: 1, alpha: 0.3, taper: 0.2 });
  }
  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i] + 0.25, b = cols[i + 1] - 0.25, m = (a + b) / 2;
    P.line(S([[a, 5.4], [a + 0.6, 8.0], [m - 1.0, 9.9], [m, 10.4]], 8), { w: 1.1, alpha: 0.3, taper: 0.3 });
    P.line(S([[b, 5.4], [b - 0.6, 8.0], [m + 1.0, 9.9], [m, 10.4]], 8), { w: 1.1, alpha: 0.3, taper: 0.3 });
    P.line(S([[a, 5.4], [m - 1.4, 8.6], [m + 0.8, 10.6]], 8), { w: 0.8, alpha: 0.18, taper: 0.5 });
    P.line(S([[b, 5.4], [m + 1.4, 8.6], [m - 0.8, 10.6]], 8), { w: 0.8, alpha: 0.18, taper: 0.5 });
    // far bookcases between the columns: shelves and thin spines
    for (let y = 4.6; y > -11.5; y -= 1.1) {
      P.line([[a + 0.1, y], [b - 0.1, y]], { w: 0.8, alpha: 0.24, taper: 0.2 });
      const r = rng(40 + i * 13 + Math.round(y * 10));
      for (let x = a + 0.2; x < b - 0.3; x += 0.14 + r() * 0.16) {
        if (r() < 0.12) {
          x += 0.3;
          continue;
        }
        P.line([[x, y + 0.05], [x + (r() < 0.1 ? 0.15 : 0), y + 0.55 + r() * 0.35]], { w: 0.7, alpha: 0.17, taper: 0.2, wobble: 0.3 });
      }
    }
  }
}

function near(P: Kit): void {
  const { S, E } = P;

  // the brass rail the ladder hangs from
  P.line([[-19.5, 9.35], [19.5, 9.35]], { w: 1.8, tint: 'gold', alpha: 0.75, taper: 0.05 });
  for (const x of [-16, -9.5, -3, 3.5, 10, 16.5]) P.line([[x, 9.35], [x, 9.9]], { w: 1.4, tint: 'gold', alpha: 0.6, taper: 0.1 });

  // pages hung on strings
  const strings: Pt[][] = [[[-13, 8.2], [-10.6, 7.4], [-8.4, 7.9]], [[8.6, 8.3], [10.6, 7.5], [13, 8.0]]];
  strings.forEach((st, si) => {
    const pts = S(st, 10);
    P.line(pts, { w: 0.9, alpha: 0.55, taper: 0.2 });
    const r = rng(70 + si);
    for (let i = 3; i < pts.length - 3; i += 4) {
      const [x, y] = pts[i];
      const tilt = (r() - 0.5) * 0.25, w = 0.55 + r() * 0.2, h = 0.75 + r() * 0.2;
      const c = Math.cos(tilt), s = Math.sin(tilt);
      const q = (dx: number, dy: number): Pt => [x + dx * c - dy * s, y + dx * s + dy * c];
      const page = [q(-w / 2, 0), q(w / 2, 0), q(w / 2, -h), q(-w / 2, -h)];
      P.form(page, { w: 1.1, alpha: 0.7 });
      for (let k = 1; k < 5; k++) P.line([q(-w / 2 + 0.1, (-k * h) / 5.5), q(w / 2 - 0.1 - (k === 4 ? 0.2 : 0), (-k * h) / 5.5)], { w: 0.7, alpha: 0.4, taper: 0.4 });
    }
  });

  // the chandelier: a ring of candles on a chain, the warm centre; over the low stack, above heads
  const cx = -4.0, cy = 7.5;
  P.line([[cx, 14.6], [cx, cy + 0.9]], { w: 1.3, alpha: 0.8, taper: 0.05 });
  for (let y = 14.4; y > cy + 1.0; y -= 0.24) P.line(E(cx, y, 0.05, 0.11, 0, 8), { w: 0.8, alpha: 0.6, closed: true });
  P.line([[cx, cy + 0.9], [cx - 1.3, cy + 0.05]], { w: 1, alpha: 0.6 });
  P.line([[cx, cy + 0.9], [cx + 1.3, cy + 0.05]], { w: 1, alpha: 0.6 });
  P.form(E(cx, cy, 1.45, 0.2, 0, 30), { w: 1.8 });
  for (const [dx, h] of [[-1.15, 0.55], [-0.55, 0.7], [0.55, 0.62], [1.15, 0.5], [0, 0.8]]) {
    const x = cx + dx;
    P.form([[x - 0.1, cy + 0.02], [x + 0.1, cy + 0.02], [x + 0.1, cy + 0.02 + h], [x - 0.1, cy + 0.02 + h]], { w: 1.3 });
    const fy = cy + 0.02 + h + 0.05;
    P.tone(1.3);
    P.form(S([[x, fy], [x + 0.09, fy + 0.12], [x + 0.02, fy + 0.34], [x - 0.08, fy + 0.13]], 5, true), { w: 1.1, tint: 'gold', wash: 0.55 });
    P.tone(1);
  }

  // the bookcase under the deck: sides down past the camera's floor, two shelves of giant spines
  P.mask([[-7.7, -0.85], [7.7, -0.85], [7.7, -10], [-7.7, -10]]);
  P.line([[-7.7, -0.85], [-7.7, -10]], { w: 2.4, taper: 0.1 });
  P.line([[7.7, -0.85], [7.7, -10]], { w: 2.4, taper: 0.1 });
  P.line([[-7.25, -0.85], [-7.25, -10]], { w: 1.2, alpha: 0.6, taper: 0.1 });
  P.line([[7.25, -0.85], [7.25, -10]], { w: 1.2, alpha: 0.6, taper: 0.1 });
  function shelfRow(base: number, seed: number): void {
    P.form([[-7.25, base], [7.25, base], [7.25, base - 0.3], [-7.25, base - 0.3]], { w: 1.8 });
    const rs = rng(seed);
    let x = -7.1;
    while (x < 7.0) {
      const bw = 0.32 + rs() * 0.42, h = 2.1 + rs() * 0.45;
      if (x + bw > 7.15) break;
      if (rs() < 0.07) { // a gap with one leaning volume
        const lw = 0.45, lean = 0.5;
        P.form([[x + 0.05, base], [x + 0.05 + lw, base], [x + 0.05 + lw + lean, base + h * 0.95], [x + 0.05 + lean, base + h * 0.97]], { w: 1.6 });
        x += lw + lean + 0.15;
        continue;
      }
      const sp: Pt[] = [[x, base], [x + bw, base], [x + bw, base + h], [x, base + h]];
      const t = rs() < 0.22 ? SPINE_TINTS[Math.floor(rs() * 4)] : null;
      P.form(sp, { w: 1.5, wash: t ? 0.16 : 0, washTint: t });
      const top = base + h;
      P.line([[x + 0.05, top - 0.3], [x + bw - 0.05, top - 0.3]], { w: 0.9, alpha: 0.6, taper: 0.2 });
      P.line([[x + 0.05, top - 0.38], [x + bw - 0.05, top - 0.38]], { w: 0.9, alpha: 0.6, taper: 0.2 });
      P.line([[x + 0.05, base + 0.3], [x + bw - 0.05, base + 0.3]], { w: 0.9, alpha: 0.5, taper: 0.2 });
      if (bw > 0.5 && rs() < 0.6) P.line(E(x + bw / 2, top - 1.0, bw * 0.22, 0.3, 0, 14), { w: 0.9, alpha: 0.45, closed: true });
      if (rs() < 0.35) P.hatch(sp, { angle: 1.35, gap: 5, alpha: 0.28 });
      x += bw;
    }
  }
  shelfRow(-7.3, 6);
  shelfRow(-3.55, 5);
  // cornice moulding: the deck's face
  P.form([[-8, 0], [8, 0], [8, -0.3], [7.85, -0.42], [7.7, -0.42], [7.7, -0.85], [-7.7, -0.85], [-7.7, -0.42], [-7.85, -0.42], [-8, -0.3]], { w: 2.4 });
  P.line([[-7.9, -0.3], [7.9, -0.3]], { w: 1, alpha: 0.6, taper: 0.2 });
  for (let xx = -7.4; xx < 7.5; xx += 0.5) P.line([[xx, -0.5], [xx, -0.78]], { w: 0.9, alpha: 0.5, taper: 0.3 });

  // the rolling ladder: giant, hooked to the rail, feet on the shelf
  for (const lx of [2.35, 5.65]) {
    P.form([[lx - 0.14, 0], [lx + 0.14, 0], [lx + 0.14, 9.2], [lx - 0.14, 9.2]], { w: 1.8 });
    P.line(S([[lx, 9.2], [lx - 0.05, 9.55], [lx + 0.18, 9.62], [lx + 0.22, 9.38]], 5), { w: 1.6, tint: 'gold' });
    P.form(E(lx, 0.12, 0.16, 0.16, 0, 12), { w: 1.4 });
  }
  // upper rungs: thin and dim, high above the standing rung, background only
  P.tone(0.65);
  for (const y of [6.7, 8.3]) P.line([[2.5, y], [5.5, y]], { w: 1.1, taper: 0.2 });
  P.tone(1.4, 1.12);
  P.form([[RIGHT.x0 - 0.1, RIGHT.y], [RIGHT.x1 + 0.1, RIGHT.y], [RIGHT.x1 + 0.1, RIGHT.y - 0.26], [RIGHT.x0 - 0.1, RIGHT.y - 0.26]], { w: 2 });

  // stacks of giant folios (soft platforms): lying books, the top cover is the place to stand
  P.tone(0.9);
  function stack(x0: number, x1: number, y0: number, y1: number, seed: number): void {
    const r = rng(seed);
    let y = y0;
    const books: [number, number, number, number][] = [];
    while (y < y1 - 0.05) {
      const th = Math.min(y1 - y, 0.35 + r() * 0.35);
      const last = y + th >= y1 - 0.01;
      const inset0 = last ? 0 : (r() - 0.3) * 0.4, inset1 = last ? 0 : (r() - 0.3) * 0.4;
      books.push([x0 + inset0, x1 - inset1, y, y + th]);
      y += th;
    }
    books.forEach(([a, b, ya, yb], i) => {
      const t = r() < 0.3 ? SPINE_TINTS[(seed + i) % 4] : null;
      P.form([[a, ya], [b, ya], [b, yb], [a, yb]], { w: 1.7, wash: t ? 0.16 : 0, washTint: t });
      // page block on the fore-edge
      const pe = r() < 0.5 ? a : b - 0.25;
      for (let k = 1; k < 4; k++) P.line([[pe + 0.04, ya + ((yb - ya) * k) / 4], [pe + 0.24, ya + ((yb - ya) * k) / 4]], { w: 0.7, alpha: 0.5, taper: 0.3 });
      P.line([[pe, ya + 0.04], [pe, yb - 0.04]], { w: 0.9, alpha: 0.6, taper: 0.2 });
      if (r() < 0.5) P.line([[(a + b) / 2 - 0.4, (ya + yb) / 2], [(a + b) / 2 + 0.4, (ya + yb) / 2]], { w: 0.8, alpha: 0.45, taper: 0.5 });
    });
  }
  stack(LOW.x0, LOW.x1, 0, LOW.y, 3);
  stack(TOP.x0, TOP.x1, 0, TOP.y, 8);
  P.tone(1);

  // a guttered candle on the shelf's back corner
  P.form([[6.55, 0], [7.15, 0], [7.15, 1.35], [6.95, 1.45], [6.8, 1.3], [6.55, 1.4]], { w: 1.6 });
  P.line(S([[6.6, 1.35], [6.62, 0.9], [6.58, 0.6]], 4), { w: 1, alpha: 0.6 });
  P.tone(1.3);
  P.form(S([[6.85, 1.5], [6.98, 1.66], [6.87, 2.05], [6.74, 1.68]], 5, true), { w: 1.2, tint: 'gold', wash: 0.55 });

  P.walk(L.main.x0, L.main.x1, L.main.y, { w: 5.2 });
  for (const s of L.soft) P.walk(s.x0, s.x1, s.y);
}

export function createShelfSet(): StageSet {
  return makeSet({ id: 'shelf', name: 'The Long Shelf', far, near, parallax: 0.08 });
}
