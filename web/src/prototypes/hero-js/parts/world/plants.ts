// Everything that grows on the land. Laid out once from a fixed seed as clumps with gaps between them (never
// an even row), in two layers: BACK stands on the contour against the sky, FRONT sits a little lower and
// nearer and is painted over the feet of the sign, the couch, the trunk and the walkers so they stand IN it.
//
// How it stays cheap and still all moves:
// - Ferns, broad leaves, clover, sprigs and short tufts are each painted ONCE, every one different, into a
//   sprite atlas with the pen. Each frame a plant is blitted with a shear about its root that follows the
//   shared wind (late, by its own stiffness) plus its own flutter: the root stays put, the tips travel.
// - Tall grass blades, seed-head stalks and flower stems really deform, so they are drawn live: three filled
//   paths for the blades (one per tone) and one stroked path each for stalks and stems.
// - Flower heads are small sprites that ride their stems and nod late.
// The wind is read from a table filled once per frame, not evaluated per blade.
import { BLUE, COUCH, GOLD, GREEN_LINE, GREEN_LIT, GREEN_SHEEN, INK, ORANGE, PAPER, SIGN, TREE, W, groundY, tone, wind } from '../../engine/layout';
import type { Pen } from '../../engine/types';
import { GULLY, TERRACES, topY } from '../ridge';
import { TAU, rng } from './util';

type C2 = CanvasRenderingContext2D;
interface Blade { x: number; y: number; h: number; lean: number; w: number; flex: number; fw: number; fp: number; tn: number }
interface Stalk { x: number; y: number; h: number; lean: number; fp: number; n: number; kind: 0 | 1 | 2; stiff: number }
interface Flower { x: number; y: number; h: number; lean: number; kind: 0 | 1 | 2; v: number; s: number; fp: number; leaf: number }
interface Proto { hw: number; hup: number; flex: number; paint: (c: C2, p: Pen) => void }
interface Sprite extends Proto { x: number; y: number; fp: number; fw: number; ax: number; ay: number; flip: boolean }
export interface Layer { key: string; blades: Blade[]; stalks: Stalk[]; flowers: Flower[]; sprites: Sprite[]; tufts: number; aw: number; ah: number }

const mk = (key: string): Layer => ({ key, blades: [], stalks: [], flowers: [], sprites: [], tufts: 0, aw: 2000, ah: 10 });
export const BACK = mk('plantsBack');
export const FRONT = mk('plantsFront');

// blade tones: far and dim, middle, near and bright
const TONES = [GREEN_SHEEN, tone(GREEN_LINE, 0.58), tone(GREEN_LINE, 0.88)];
const LEAF_SHADE = '#35492a';

const R = rng(20261120);
const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));

// one tapered blade from root to tip, bowed, added to the current path
function blade(c: C2, x: number, y: number, tx: number, ty: number, w: number) {
  const cx = x + (tx - x) * 0.18, cy = y + (ty - y) * 0.66;
  c.moveTo(x - w, y);
  c.quadraticCurveTo(cx - w * 0.75, cy, tx, ty);
  c.quadraticCurveTo(cx + w * 0.75, cy, x + w, y);
  c.closePath();
}

// ---------------------------------------------------------------------------------------------------------
// The sprite plants. Each maker rolls its own shape once and returns how to paint it about its root (0, 0).

function mkShort(big: number, bright: number): Proto {
  const n = ri(4, 8);
  const bl: { dx: number; h: number; lean: number; w: number; tn: number; kink: number }[] = [];
  let hw = 6, hup = 6;
  for (let k = 0; k < n; k++) {
    const side = k / (n - 1) - 0.5, q = R();
    const h = big * (9 + (1 - Math.abs(side) * 1.2) * 11 + q * 10);
    const lean = side * (14 + R() * 18) + (q - 0.5) * 7;
    const dx = side * (8 + n * 1.3) + (R() - 0.5) * 3;
    bl.push({ dx, h, lean, w: 1.1 + R() * 0.8, tn: R() < bright ? 2 : R() < 0.6 ? 1 : 0, kink: R() < 0.2 ? (R() - 0.5) * 12 : 0 });
    hw = Math.max(hw, Math.abs(dx + lean) + Math.abs(bl[k]!.kink) + 3);
    hup = Math.max(hup, h);
  }
  return {
    hw, hup, flex: 0.1 + R() * 0.07,
    paint(c) {
      for (let tn = 0; tn < 3; tn++) {
        c.fillStyle = TONES[tn]!;
        c.beginPath();
        for (const b of bl) {
          if (b.tn !== tn) continue;
          blade(c, b.dx, 1, b.dx + b.lean, -b.h, b.w);
          // a few blades are creased: the tip folds over
          if (b.kink) blade(c, b.dx + b.lean * 0.8, -b.h * 0.86, b.dx + b.lean + b.kink, -b.h * 0.7, b.w * 0.6);
        }
        c.fill();
      }
    },
  };
}

function mkFern(): Proto {
  const n = ri(3, 5);
  const fr: { dir: number; len: number; rise: number; nl: number; tn: number }[] = [];
  let hw = 0, hup = 0;
  for (let k = 0; k < n; k++) {
    const dir = k % 2 ? 1 : -1;
    const len = (k < 2 ? 34 : 24) + R() * 26, rise = 0.6 + R() * 0.55 - (k > 2 ? 0.28 : 0);
    fr.push({ dir, len, rise, nl: ri(6, 9), tn: k < 2 ? 1 : 0 });
    hw = Math.max(hw, len * 0.9 + 10);
    hup = Math.max(hup, len * rise * 0.72 + 12);
  }
  return {
    hw, hup, flex: 0.07 + R() * 0.05,
    paint(c) {
      for (let k = n - 1; k >= 0; k--) {
        const f = fr[k]!;
        const ex = f.dir * f.len * 0.85, ey = -f.len * f.rise * 0.56;
        const mx = f.dir * f.len * 0.25, my = -f.len * f.rise * 0.74;
        c.fillStyle = c.strokeStyle = TONES[f.tn]!;
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(f.dir * 1.5, 0);
        c.quadraticCurveTo(mx, my, ex, ey);
        c.stroke();
        c.beginPath();
        for (let j = 1; j <= f.nl; j++) {
          const u = j / (f.nl + 1), v = 1 - u;
          const px = 2 * v * u * mx + u * u * ex, py = 2 * v * u * my + u * u * ey;
          const dx = 2 * v * mx + 2 * u * (ex - mx), dy = 2 * v * my + 2 * u * (ey - my);
          const dl = Math.hypot(dx, dy) || 1;
          const nx = -dy / dl, ny = dx / dl, ux = dx / dl, uy = dy / dl;
          const ll = (10.5 - u * 7) * (f.len / 44) * (0.85 + 0.3 * ((j * 7 + k * 3) % 5) / 5);
          for (const sgn of [-1, 1]) {
            const tx = px + nx * ll * sgn + ux * ll * 0.55, ty = py + ny * ll * sgn + uy * ll * 0.55;
            c.moveTo(px, py);
            c.quadraticCurveTo(px + nx * ll * 0.55 * sgn - ux * 1.6, py + ny * ll * 0.55 * sgn - uy * 1.6, tx, ty);
            c.quadraticCurveTo(px + nx * ll * 0.3 * sgn + ux * ll * 0.6, py + ny * ll * 0.3 * sgn + uy * ll * 0.6, px, py);
          }
        }
        c.fill();
        // the fiddlehead: the young frond's tip curls
        if (k === 0) {
          c.beginPath();
          c.arc(ex + f.dir * 1.5, ey + 2.6, 2.6, -Math.PI / 2, Math.PI * 0.9, f.dir < 0);
          c.stroke();
        }
      }
    },
  };
}

function mkBroad(): Proto {
  const n = ri(2, 4);
  const lv: { lean: number; h: number; w: number }[] = [];
  let hw = 0, hup = 0;
  for (let k = 0; k < n; k++) {
    const lean = (k - (n - 1) / 2) * (17 + R() * 12) + (R() - 0.5) * 6, h = 20 + R() * 20 - Math.abs(k - (n - 1) / 2) * 3;
    lv.push({ lean, h, w: 5.5 + R() * 4.5 });
    hw = Math.max(hw, Math.abs(lean) + 12);
    hup = Math.max(hup, h + 3);
  }
  return {
    hw, hup, flex: 0.05 + R() * 0.04,
    paint(c) {
      for (const b of lv) {
        const tx = b.lean, ty = -b.h, cxm = b.lean * 0.35, cym = -b.h * 0.55;
        const dl = Math.hypot(tx, ty) || 1;
        const nx = (-ty / dl) * b.w, ny = (tx / dl) * b.w;
        const lens = () => {
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(cxm + nx, cym + ny, tx, ty);
          c.quadraticCurveTo(cxm - nx, cym - ny, 0, 0);
        };
        lens();
        c.fillStyle = GREEN_LIT;
        c.fill();
        // the half that faces away from the light (lower right) is a shade plane
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(cxm + nx, cym + ny, tx, ty);
        c.quadraticCurveTo(cxm, cym, 0, 0);
        c.fillStyle = LEAF_SHADE;
        c.fill();
        lens();
        c.lineWidth = 1.5;
        c.strokeStyle = TONES[1]!;
        c.stroke();
        // midrib and side veins
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(cxm, cym, tx * 0.94, ty * 0.94);
        for (let j = 1; j <= 3; j++) {
          const u = j / 4.4, v = 1 - u;
          const px = 2 * v * u * cxm + u * u * tx, py = 2 * v * u * cym + u * u * ty;
          for (const sgn of [-1, 1]) {
            c.moveTo(px, py);
            c.lineTo(px + nx * 0.42 * sgn * (1 - u * 0.5) + (tx / dl) * 4, py + ny * 0.42 * sgn * (1 - u * 0.5) + (ty / dl) * 4);
          }
        }
        c.lineWidth = 1;
        c.globalAlpha = 0.75;
        c.stroke();
        c.globalAlpha = 1;
      }
    },
  };
}

function mkClover(): Proto {
  const n = ri(3, 6);
  const st: { dx: number; h: number; lean: number; s: number }[] = [];
  for (let k = 0; k < n; k++) st.push({ dx: (k - (n - 1) / 2) * 9 + (R() - 0.5) * 5, h: 5 + R() * 9, lean: (R() - 0.5) * 8, s: 2.3 + R() * 1.1 });
  const ball = R() < 0.45 ? { dx: (R() - 0.5) * n * 6, h: 15 + R() * 8 } : null;
  return {
    hw: n * 5 + 12, hup: 28, flex: 0.05 + R() * 0.03,
    paint(c) {
      c.strokeStyle = TONES[1]!;
      c.lineWidth = 1.1;
      c.beginPath();
      for (const k of st) {
        c.moveTo(k.dx, 1);
        c.lineTo(k.dx + k.lean, -k.h);
      }
      if (ball) {
        c.moveTo(ball.dx, 1);
        c.quadraticCurveTo(ball.dx + 2, -ball.h * 0.5, ball.dx, -ball.h);
      }
      c.stroke();
      for (const k of st) {
        const hx = k.dx + k.lean, hy = -k.h;
        c.fillStyle = GREEN_LIT;
        c.beginPath();
        for (let j = 0; j < 3; j++) {
          const a = -Math.PI / 2 + (j - 1) * 2.05 + k.lean * 0.04;
          c.moveTo(hx + Math.cos(a) * k.s * 0.9 + k.s, hy + Math.sin(a) * k.s * 0.9);
          c.arc(hx + Math.cos(a) * k.s * 0.9, hy + Math.sin(a) * k.s * 0.9, k.s, 0, TAU);
        }
        c.fill();
        c.lineWidth = 0.9;
        c.stroke();
        // the pale chevron every clover leaf carries
        c.beginPath();
        c.arc(hx, hy - k.s * 0.9, k.s * 0.5, 0.5, Math.PI - 0.5);
        c.globalAlpha = 0.7;
        c.stroke();
        c.globalAlpha = 1;
      }
      if (ball) {
        // a white clover flower: a ball of tiny florets
        c.fillStyle = INK;
        c.beginPath();
        for (let j = 0; j < 9; j++) {
          const a = (j / 9) * TAU + 0.3, rr = j < 6 ? 2.7 : 1;
          c.moveTo(ball.dx + Math.cos(a) * rr + 1.25, -ball.h + Math.sin(a) * rr * 0.9);
          c.arc(ball.dx + Math.cos(a) * rr, -ball.h + Math.sin(a) * rr * 0.9, 1.25, 0, TAU);
        }
        c.globalAlpha = 0.92;
        c.fill();
        c.globalAlpha = 1;
      }
    },
  };
}

function mkSprig(): Proto {
  const h = 22 + R() * 22, lean = (R() - 0.5) * 22, nl = ri(5, 8), bud = R() < 0.5;
  const jit = Array.from({ length: nl }, () => 0.8 + R() * 0.5);
  return {
    hw: Math.abs(lean) + 14, hup: h + 6, flex: 0.09 + R() * 0.05,
    paint(c) {
      const mx = lean * 0.2, my = -h * 0.6;
      c.strokeStyle = TONES[1]!;
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(0, 1);
      c.quadraticCurveTo(mx, my, lean, -h);
      c.stroke();
      for (let j = 0; j < nl; j++) {
        const u = 0.2 + (j / nl) * 0.78, v = 1 - u;
        const px = 2 * v * u * mx + u * u * lean, py = v * v + 2 * v * u * my + u * u * -h;
        const sgn = j % 2 ? 1 : -1, ll = (9.5 - u * 4.5) * jit[j]!;
        const a = -Math.PI / 2 + sgn * (0.95 - u * 0.3) + lean * 0.01;
        const tx = px + Math.cos(a) * ll, ty = py + Math.sin(a) * ll;
        const nx = -Math.sin(a) * ll * 0.3, ny = Math.cos(a) * ll * 0.3;
        c.beginPath();
        c.moveTo(px, py);
        c.quadraticCurveTo((px + tx) / 2 + nx, (py + ty) / 2 + ny, tx, ty);
        c.quadraticCurveTo((px + tx) / 2 - nx, (py + ty) / 2 - ny, px, py);
        c.fillStyle = sgn > 0 ? LEAF_SHADE : GREEN_LIT;
        c.fill();
        c.lineWidth = 1;
        c.stroke();
      }
      if (bud) {
        c.fillStyle = TONES[2]!;
        c.beginPath();
        c.ellipse(lean, -h - 2, 1.8, 2.8, lean * 0.02, 0, TAU);
        c.fill();
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Placing things

function put(L: Layer, proto: Proto, x: number, y: number) {
  L.sprites.push({ ...proto, x, y, fp: R() * TAU, fw: 1.1 + R() * 1.6, ax: 0, ay: 0, flip: false });
  L.tufts++;
}
function tallTuft(L: Layer, x: number, y: number, big: number) {
  const n = ri(3, 7);
  const bias = (R() - 0.5) * 16;
  for (let k = 0; k < n; k++) {
    const side = n === 1 ? 0 : k / (n - 1) - 0.5;
    const q = R();
    L.blades.push({
      x: x + side * (10 + n * 1.6) + (q - 0.5) * 5, y: y + R() * 2,
      h: big * (22 + (1 - Math.abs(side) * 1.3) * 24 + q * 18),
      lean: bias + side * (22 + R() * 18) + (q - 0.5) * 10, w: 1.2 + R() * 0.9, flex: 0.7 + R() * 0.6,
      fw: 2 + R() * 2, fp: R() * TAU, tn: [0, 0, 1, 1, 1, 2, 2][Math.floor(R() * 7)]!,
    });
  }
  L.tufts++;
}
// a clump of seed-head stalks: anything from one lone stalk to five, each its own height and lean
function seedTuft(L: Layer, x: number, y: number) {
  const n = [1, 1, 2, 2, 3, 3, 4, 5][Math.floor(R() * 8)]!;
  const kind = ([0, 0, 0, 1, 1, 2] as const)[Math.floor(R() * 6)]!;
  const tall = 38 + R() * 46, bias = (R() - 0.5) * 30, spread = 6 + R() * 12;
  for (let k = 0; k < n; k++) {
    const side = n === 1 ? 0 : k / (n - 1) - 0.5;
    L.stalks.push({
      x: x + side * spread * (n - 1) * 0.6 + (R() - 0.5) * 4, y, h: tall * (0.62 + R() * 0.55), lean: bias + side * (10 + R() * 22) + (R() - 0.5) * 8,
      fp: R() * TAU, n: kind === 0 ? ri(3, 7) : kind === 1 ? ri(3, 5) : 1, kind, stiff: 0.75 + R() * 0.5,
    });
  }
  if (R() < 0.8) put(L, mkShort(0.9 + R() * 0.4, 0.25), x + (R() - 0.5) * 6, y);
  else L.tufts++;
}
function flower(L: Layer, x: number, y: number, kind: 0 | 1 | 2, big = 1) {
  L.flowers.push({
    x, y, h: big * (kind === 1 ? 28 + R() * 20 : kind === 0 ? 18 + R() * 26 : 15 + R() * 18), lean: (R() - 0.5) * 18, kind, v: ri(0, 3), s: big * (0.8 + R() * 0.45),
    fp: R() * TAU, leaf: R(),
  });
}

// where nothing tall may grow: behind the couch and its table, at the sign post, at the trunk
const blocked = (x: number) =>
  (x > COUCH.x - 84 && x < COUCH.x + 410) || Math.abs(x - SIGN.x) < 30 || Math.abs(x - TREE.x) < 46 || Math.abs(x - 1668) < 16 || (x > 1094 && x < 1200);

(() => {
  // clumps along the whole land top, with gaps
  let x = 22, i = 0;
  while (x < 2985) {
    const n = ri(2, 5); // plants in this clump
    const span = 14 + n * (11 + R() * 6);
    const fl = R();
    for (let k = 0; k < n; k++) {
      const px = x + (k / Math.max(1, n - 1)) * span + (R() - 0.5) * 9;
      if (px > 2996) continue;
      const y = topY(px) + 2;
      const pick = R();
      const hidden = blocked(px);
      if (!hidden) {
        if (pick < 0.3) tallTuft(BACK, px, y, 0.75 + R() * 0.6);
        else if (pick < 0.46) seedTuft(BACK, px, y);
        else if (pick < 0.58) put(BACK, mkFern(), px, y);
        else if (pick < 0.68) put(BACK, mkBroad(), px, y);
        else if (pick < 0.8) put(BACK, mkShort(1 + R() * 0.4, 0.2), px, y);
        else if (pick < 0.9) put(BACK, mkSprig(), px, y);
        else tallTuft(BACK, px, y, 0.5 + R() * 0.25);
      }
      // the near layer: lower on the land, shorter
      const fy = topY(px + 9) + 7 + R() * 7;
      const fp = R();
      if (fp < 0.46) put(FRONT, mkShort(hidden ? 0.75 : 0.85 + R() * 0.4, 0.4), px + 9, fy);
      else if (fp < 0.62 && !hidden) put(FRONT, mkClover(), px + 9, fy);
      else if (fp < 0.68 && !hidden) put(FRONT, mkSprig(), px + 9, fy);
    }
    // flowers: one to four per clump, mostly one kind so each clump has a character
    const kind = (i % 3) as 0 | 1 | 2;
    const nf = fl < 0.2 ? 0 : fl < 0.45 ? 1 : fl < 0.7 ? 2 : fl < 0.9 ? 3 : 4;
    for (let k = 0; k < nf; k++) {
      const px = x + R() * span;
      if (blocked(px) || px > 2990) continue;
      const kk = R() < 0.82 ? kind : (((kind + 1) % 3) as 0 | 1 | 2);
      if (R() < 0.62) flower(BACK, px, topY(px) + 2, kk);
      else flower(FRONT, px, topY(px) + 8 + R() * 5, kk, 0.8);
    }
    const gap = 26 + R() * R() * 150;
    if (gap > 62) put(FRONT, mkShort(0.8, 0.35), x + span + gap * 0.5, topY(x + span + gap * 0.5) + 6 + R() * 6);
    x += span + gap;
    i++;
  }

  // grass at the feet of the things that stand on the land, taller than the rest so it overlaps them:
  // the sign post, the trunk, the couch's front legs, the side table's legs, the kicked-off shoes
  const cx = COUCH.x;
  const feet: [number, number, number][] = [
    [SIGN.x - 16, 1.1, 0], [SIGN.x + 14, 1, 0], [SIGN.x - 2, 0.7, 2],
    [TREE.x - 44, 1.1, 0], [TREE.x - 14, 0.9, 3], [TREE.x + 22, 1.15, 0], [TREE.x + 50, 0.95, 1],
    [cx + 12, 1.25, 0], [cx + 36, 1.05, 4], [cx + 96, 0.8, 6], [cx + 168, 0.9, 7], [cx + 232, 0.8, 6], [cx + 286, 1, 5],
    [cx + 352, 1.2, 0], [cx + 378, 1.3, 3], [cx + 402, 1, 1],
    [cx - 66, 1.2, 1], [cx - 44, 0.95, 4], [cx - 22, 1.1, 2], [cx - 6, 1.25, 1],
  ];
  for (const [fx, big, dy] of feet) {
    const fy = topY(fx) + 5 + dy + R() * 3;
    put(FRONT, mkShort(big * 1.25, 0.42), fx, fy);
    if (big > 1) {
      // a few real blades among them, long enough to cross a leg or a shoe
      for (let k = 0; k < 2; k++) {
        FRONT.blades.push({ x: fx + (R() - 0.5) * 14, y: fy, h: 20 + R() * 16, lean: (R() - 0.5) * 22, w: 1.3 + R() * 0.6, flex: 0.8, fw: 2 + R() * 2, fp: R() * TAU, tn: R() < 0.6 ? 2 : 1 });
      }
    }
  }
  put(FRONT, mkClover(), cx + 128, topY(cx + 128) + 12);
  put(FRONT, mkClover(), cx + 262, topY(cx + 262) + 13);
  flower(FRONT, cx - 54, topY(cx - 54) + 9, 0, 0.85);
  flower(FRONT, cx + 318, topY(cx + 318) + 12, 2, 0.8);

  // small growth along the inner terraces of the left foreground, so the big mass is alive too
  TERRACES.forEach((tr) => {
    for (let k = 0; k < tr.length - 1; k++) {
      const [ax, ay] = tr[k]!, [bx, by] = tr[k + 1]!;
      if (Math.abs(by - ay) > Math.abs(bx - ax) * 0.5 || ay > 985) continue; // not on the cliff steps
      const n = ri(1, 3);
      for (let j = 0; j < n; j++) {
        const u = 0.12 + R() * 0.76;
        const px = ax + (bx - ax) * u, py = ay + (by - ay) * u - 1;
        if (GULLY.some(([gx, gy]) => Math.abs(gx - px) < 26 && Math.abs(gy - py) < 30)) continue;
        const pick = R();
        if (pick < 0.4) put(FRONT, mkShort(0.9 + R() * 0.5, pick < 0.2 ? 0.2 : 0.6), px, py);
        else if (pick < 0.58) tallTuft(FRONT, px, py, 0.6 + R() * 0.2);
        else if (pick < 0.74) put(FRONT, mkFern(), px, py);
        else if (pick < 0.84) put(FRONT, mkBroad(), px, py);
        else if (pick < 0.92) seedTuft(FRONT, px, py);
        else flower(FRONT, px, py, (k % 3) as 0 | 1 | 2, 0.8);
      }
    }
  });
  // reeds and ferns along the gully, so the stream has banks
  GULLY.forEach(([gx, gy], k) => {
    if (k === 0 || gy > 975) return;
    const side = k % 2 ? 1 : -1;
    const px = gx + side * (20 + R() * 8), py = gy + 3;
    if (k % 3 === 0) put(FRONT, mkFern(), px, py);
    else tallTuft(FRONT, px, py, 0.55 + R() * 0.25);
    if (k % 4 === 1) FRONT.stalks.push({ x: gx - side * 19, y: gy + 2, h: 30 + R() * 16, lean: -side * 5, fp: R() * TAU, n: 1, kind: 2, stiff: 0.6 });
  });
  // and at the foot of the television, which stands on the flat top at the left (groundY there, not the land's front edge)
  for (const fx of [152, 190, 572, 606]) put(FRONT, mkShort(0.95, 0.8), fx + R() * 6, groundY(fx) + 3);

  // pack each layer's sprites into its atlas: tallest first, in rows
  for (const L of [BACK, FRONT]) {
    const order = [...L.sprites].sort((a, b) => b.hup - a.hup);
    let ax = 2, ay = 2, rowH = 0;
    for (const s of order) {
      const w = s.hw * 2 + 6, h = s.hup + 10;
      if (ax + w > L.aw - 2) {
        ax = 2;
        ay += rowH + 3;
        rowH = 0;
      }
      s.ax = ax;
      s.ay = ay;
      ax += w + 3;
      rowH = Math.max(rowH, h);
    }
    L.ah = ay + rowH + 4;
  }
})();

// Live paths are filled in short runs along x: one path that spans the whole scene is far slower to
// rasterise than a dozen that each cover a few hundred units.
const RUN = 320;
function runs<T extends { x: number }>(items: T[]): T[][] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const out: T[][] = [];
  let x0 = -1e9;
  for (const it of sorted) {
    if (it.x - x0 > RUN) {
      out.push([]);
      x0 = it.x;
    }
    out[out.length - 1]!.push(it);
  }
  return out;
}
const RUNS = new Map<Layer, { blades: Blade[][][]; stalks: Stalk[][] }>();
for (const L of [BACK, FRONT]) {
  RUNS.set(L, { blades: [0, 1, 2].map((tn) => runs(L.blades.filter((b) => b.tn === tn))), stalks: runs(L.stalks) });
  L.flowers.sort((a, b) => a.x - b.x);
}

export const COUNTS = {
  tufts: BACK.tufts + FRONT.tufts,
  flowers: BACK.flowers.length + FRONT.flowers.length,
  stalks: BACK.stalks.length + FRONT.stalks.length,
};

// ---------------------------------------------------------------------------------------------------------
// Flower heads: three kinds, four variants each, in one small atlas. Each cell is 32 x 46 with the point
// where the stem meets the head at (16, 12).
const CELL_W = 32, CELL_H = 46, OX = 16, OY = 12;

function paintHeads(p: Pen) {
  const c = p.ctx;
  for (let kind = 0; kind < 3; kind++) {
    for (let v = 0; v < 4; v++) {
      c.save();
      c.translate(v * CELL_W + OX, kind * CELL_H + OY);
      if (kind === 0) {
        if (v === 3) {
          // a daisy seen from the side, half closed: a cup of petals on a green calyx
          c.fillStyle = INK;
          c.beginPath();
          for (let k = -3; k <= 3; k++) {
            const a = -Math.PI / 2 + k * 0.27;
            c.moveTo(0, 0);
            c.quadraticCurveTo(Math.cos(a - 0.2) * 5, Math.sin(a - 0.2) * 5, Math.cos(a) * 8.6, Math.sin(a) * 8.6);
            c.quadraticCurveTo(Math.cos(a + 0.2) * 5, Math.sin(a + 0.2) * 5, 0, 0);
          }
          c.fill();
          c.fillStyle = TONES[1]!;
          c.beginPath();
          c.ellipse(0, 0.6, 2.8, 2, 0, 0, TAU);
          c.fill();
        } else {
          // an open daisy: ink petals of uneven length round a gold centre with a shaded side
          const n = 8 + v * 2;
          c.fillStyle = INK;
          c.beginPath();
          for (let k = 0; k < n; k++) {
            const a = (k / n) * TAU + v * 0.4, len = 7.4 + ((k * 5 + v * 3) % 4) * 0.55;
            const ca = Math.cos(a), sa = Math.sin(a);
            const ix = ca * 1.6, iy = sa * 1.4, tx = ca * len, ty = sa * len * 0.86;
            const nx = -sa * 2, ny = ca * 2;
            c.moveTo(ix, iy);
            c.quadraticCurveTo((ix + tx) * 0.62 + nx, (iy + ty) * 0.62 + ny, tx, ty);
            c.quadraticCurveTo((ix + tx) * 0.62 - nx, (iy + ty) * 0.62 - ny, ix, iy);
          }
          c.fill();
          c.fillStyle = GOLD;
          c.beginPath();
          c.ellipse(0, 0, 2.6, 2.2, 0, 0, TAU);
          c.fill();
          c.fillStyle = tone(GOLD, 0.55);
          c.beginPath();
          c.ellipse(0.7, 0.6, 1.5, 1.2, 0, 0, TAU);
          c.fill();
        }
      } else if (kind === 1) {
        // bells: the stem arches over and two to four blue bells hang from it
        const n = 2 + (v % 3);
        c.strokeStyle = TONES[1]!;
        c.lineWidth = 1.2;
        c.lineCap = 'round';
        for (let k = 0; k < n; k++) {
          const bx = (k % 2 ? 1 : -1) * (3.2 + k * 2.3) * (v === 3 ? -1 : 1), by = 3 + k * 5.4;
          c.beginPath();
          c.moveTo(0, by - 4);
          c.quadraticCurveTo(bx * 0.8, by - 6, bx, by - 1);
          c.stroke();
          c.save();
          c.translate(bx, by - 1);
          c.rotate(bx * 0.03);
          c.fillStyle = tone(BLUE, 0.72);
          c.beginPath();
          c.moveTo(-1, 0);
          c.quadraticCurveTo(-4.4, 2, -4, 7.5);
          c.lineTo(-2, 6.4);
          c.lineTo(0, 7.9);
          c.lineTo(2, 6.4);
          c.lineTo(4, 7.5);
          c.quadraticCurveTo(4.4, 2, 1, 0);
          c.closePath();
          c.fill();
          // the lit left flank and the pale mouth
          c.fillStyle = BLUE;
          c.beginPath();
          c.moveTo(-1, 0.4);
          c.quadraticCurveTo(-4, 2.2, -3.7, 6.6);
          c.lineTo(-2.3, 5.9);
          c.quadraticCurveTo(-2.6, 2.4, -0.4, 0.6);
          c.fill();
          c.restore();
        }
      } else if (v === 3) {
        // a poppy bud, nodding on its neck
        c.strokeStyle = TONES[1]!;
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(0, 2);
        c.quadraticCurveTo(0.5, -5, 4.5, -3.5);
        c.stroke();
        c.fillStyle = tone(ORANGE, 0.5);
        c.beginPath();
        c.ellipse(5.4, -0.6, 2.6, 3.9, 0.35, 0, TAU);
        c.fill();
        c.strokeStyle = ORANGE;
        c.lineWidth = 1;
        c.stroke();
      } else {
        // a poppy: an orange cup of petals with a lit side and a dark eye
        const wdt = 5.2 + v * 0.5;
        c.fillStyle = tone(ORANGE, 0.8);
        c.beginPath();
        c.moveTo(-wdt, -2.6);
        c.quadraticCurveTo(-wdt - 1, 4, 0, 4.6);
        c.quadraticCurveTo(wdt + 1, 4, wdt, -2.6);
        c.quadraticCurveTo(3.2, -0.6, 1.9, -3.6 - v * 0.4);
        c.quadraticCurveTo(0, -1.6, -1.9, -3.6);
        c.quadraticCurveTo(-3.2, -0.6, -wdt, -2.6);
        c.fill();
        c.fillStyle = ORANGE;
        c.beginPath();
        c.moveTo(-wdt, -2.6);
        c.quadraticCurveTo(-wdt - 1, 4, 0, 4.6);
        c.quadraticCurveTo(-3.4, 2.6, -3.2, -0.9);
        c.closePath();
        c.fill();
        c.fillStyle = PAPER;
        c.beginPath();
        c.ellipse(0.4, 0.3, 1.5, 1.1, 0, 0, TAU);
        c.fill();
      }
      c.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// The wind table: the shared wind sampled every 25 units, now and a quarter second ago, once per frame.
const WSTEP = 25, WN = Math.ceil(W / WSTEP) + 2;
const WNOW = new Float32Array(WN), WLATE = new Float32Array(WN);
let wT = NaN;
function fillWind(t: number) {
  if (t === wT) return;
  wT = t;
  for (let i = 0; i < WN; i++) {
    WNOW[i] = wind(t, i * WSTEP);
    WLATE[i] = wind(t - 0.25, i * WSTEP);
  }
}
function wAt(T: Float32Array, x: number): number {
  const f = x <= 0 ? 0 : x >= W ? W / WSTEP : x / WSTEP;
  const i = f | 0;
  return T[i]! + (T[i + 1]! - T[i]!) * (f - i);
}

export function drawLayer(pen: Pen, L: Layer, t: number) {
  const c = pen.ctx;
  fillWind(t);
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // 1. the sprite plants, each sheared about its root by the wind (late) and its own flutter
  const A = pen.layer(L.key, { x: 0, y: 0, w: L.aw, h: L.ah }, (p) => {
    const pc = p.ctx;
    pc.lineCap = 'round';
    pc.lineJoin = 'round';
    for (const s of L.sprites) {
      pc.save();
      pc.translate(s.ax + s.hw + 3, s.ay + s.hup + 6);
      s.paint(pc, p);
      pc.restore();
    }
  });
  if (A) {
    const m = c.getTransform();
    const k0 = A.s;
    for (const s of L.sprites) {
      const k = wAt(WLATE, s.x) * s.flex * 1.7 + Math.sin(t * s.fw + s.fp) * 0.022;
      const w = s.hw * 2 + 6, h = s.hup + 10;
      c.setTransform(m.a, m.b, m.c - k * m.a, m.d - k * m.b, m.e + k * s.y * m.a, m.f + k * s.y * m.b);
      c.drawImage(A.cv, s.ax * k0, s.ay * k0, w * k0, h * k0, s.x - s.hw - 3, s.y - s.hup - 6, w, h);
    }
    c.setTransform(m);
  }

  // 2. grass blades, one path per tone and per run
  const RR = RUNS.get(L)!;
  for (let tn = 0; tn < 3; tn++) {
    c.fillStyle = TONES[tn]!;
    for (const run of RR.blades[tn]!) {
      c.beginPath();
      for (const b of run) {
        const flutter = Math.sin(t * b.fw + b.fp) * 1.6 + Math.sin(t * b.fw * 1.7 + b.fp * 2) * 0.7;
        const bend = b.lean + (wAt(WNOW, b.x) * b.h * 0.24 + flutter) * b.flex;
        const k = bend / Math.max(b.h, 1);
        blade(c, b.x, b.y, b.x + bend, b.y - b.h * (1 - Math.min(0.32, k * k * 0.36)), b.w);
      }
      c.fill();
    }
  }

  // 3. seed-head stalks: a hair stem and a nodding head that follows the wind late. Three kinds of head:
  // an ear of paired ticks, a drooping panicle of small drops, and a solid cat's-tail.
  c.strokeStyle = TONES[2]!;
  c.fillStyle = TONES[2]!;
  c.lineWidth = 1.3;
  const solid: number[] = []; // x, y, angle, length for the filled heads
  for (const run of RR.stalks) {
    solid.length = 0;
    c.beginPath();
    for (const s of run) {
      const w1 = wAt(WNOW, s.x), w2 = wAt(WLATE, s.x);
      const bend = s.lean + w1 * s.h * 0.16 * s.stiff;
      const tipx = s.x + bend + w2 * s.h * 0.1 * s.stiff + Math.sin(t * 1.9 + s.fp) * 1.5;
      const tipy = s.y - s.h + Math.abs(bend) * 0.2;
      const mx = s.x + bend * 0.3, my = s.y - s.h * 0.6;
      c.moveTo(s.x, s.y);
      c.quadraticCurveTo(mx, my, tipx, tipy);
      const dx = tipx - mx, dy = tipy - my, dl = Math.hypot(dx, dy) || 1;
      let ux = dx / dl, uy = dy / dl;
      if (s.kind === 2) {
        solid.push(tipx, tipy, Math.atan2(uy, ux), 9 + (s.h % 7));
        continue;
      }
      let px = tipx, py = tipy;
      for (let k = 0; k < s.n; k++) {
        uy += s.kind ? 0.3 : 0.16; // nod
        const l = Math.hypot(ux, uy);
        ux /= l;
        uy /= l;
        const nx = -uy, ny = ux;
        if (s.kind === 0) {
          const a = 4.6 - k * 0.45;
          c.moveTo(px + nx * a - ux * 2.4, py + ny * a - uy * 2.4);
          c.lineTo(px, py);
          c.lineTo(px - nx * a - ux * 2.4, py - ny * a - uy * 2.4);
        } else {
          // a fine branch to each side, each ending in a hanging drop
          const sgn = k % 2 ? 1 : -1, a = 6.5 - k * 0.6;
          const ex = px + nx * a * sgn + ux * 2, ey = py + ny * a * sgn + uy * 2 + 2.5;
          c.moveTo(px, py);
          c.quadraticCurveTo(px + nx * a * sgn, py + ny * a * sgn - 1, ex, ey);
          solid.push(ex, ey + 1.6, Math.PI / 2, -2.6);
        }
        px += ux * 4.4;
        py += uy * 4.4;
        c.moveTo(px - ux * 4.4, py - uy * 4.4);
        c.lineTo(px, py);
      }
    }
    c.stroke();
    if (!solid.length) continue;
    c.beginPath();
    for (let i = 0; i < solid.length; i += 4) {
      const len = solid[i + 3]!;
      if (len < 0) {
        c.moveTo(solid[i]! + 1.3, solid[i + 1]!);
        c.ellipse(solid[i]!, solid[i + 1]!, 1.3, -len, 0, 0, TAU);
      } else {
        const a = solid[i + 2]!, cx = solid[i]! + Math.cos(a) * len * 0.5, cy = solid[i + 1]! + Math.sin(a) * len * 0.5;
        c.moveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5);
        c.ellipse(cx, cy, len * 0.5, 2.4, a, 0, TAU);
      }
    }
    c.fill();
  }

  // 4. flowers: stems (each with a leaf) in one path, then the heads, which ride the stems and nod late
  const Hd = pen.layer('flowerheads', { x: 0, y: 0, w: CELL_W * 4, h: CELL_H * 3 }, paintHeads);
  c.strokeStyle = TONES[1]!;
  c.lineWidth = 1.4;
  c.beginPath();
  const n = L.flowers.length;
  const hx = new Float32Array(n), hy = new Float32Array(n), ht = new Float32Array(n);
  let runX = -1e9;
  for (let i = 0; i < n; i++) {
    const f = L.flowers[i]!;
    if (f.x - runX > RUN) {
      if (i) c.stroke();
      c.beginPath();
      runX = f.x;
    }
    const w1 = wAt(WNOW, f.x), w2 = wAt(WLATE, f.x);
    const bend = f.lean + w1 * f.h * 0.12;
    const x = f.x + bend + w2 * f.h * 0.1 + Math.sin(t * 1.7 + f.fp) * 1, y = f.y - f.h + Math.abs(bend) * 0.15 + Math.sin(t * 2.3 + f.fp) * 0.6;
    c.moveTo(f.x, f.y);
    c.quadraticCurveTo(f.x + bend * 0.25, f.y - f.h * 0.6, x, y);
    // a small leaf on the stem, at its own height and side
    const u = 0.3 + f.leaf * 0.3;
    const lx = f.x + bend * 0.25 * u * 2, ly = f.y - f.h * u, ld = f.leaf < 0.5 ? 1 : -1;
    c.moveTo(lx, ly);
    c.quadraticCurveTo(lx + ld * 5, ly - 5, lx + ld * (7 + f.leaf * 4), ly - 2);
    c.quadraticCurveTo(lx + ld * 5, ly + 1, lx, ly);
    hx[i] = x;
    hy[i] = y;
    ht[i] = (x - f.x) * 0.02 + w2 * 0.2 + (f.kind === 1 ? Math.sin(t * 2.2 + f.fp) * 0.1 : 0);
  }
  c.stroke();
  if (Hd) {
    const m = c.getTransform(), k0 = Hd.s;
    for (let i = 0; i < n; i++) {
      const f = L.flowers[i]!;
      const co = Math.cos(ht[i]!) * f.s, si = Math.sin(ht[i]!) * f.s;
      // rotate and scale about the head, on top of the scene's own transform
      c.setTransform(m.a * co + m.c * si, m.b * co + m.d * si, -m.a * si + m.c * co, -m.b * si + m.d * co, m.a * hx[i]! + m.c * hy[i]! + m.e, m.b * hx[i]! + m.d * hy[i]! + m.f);
      c.drawImage(Hd.cv, f.v * CELL_W * k0, f.kind * CELL_H * k0, CELL_W * k0, CELL_H * k0, -OX, -OY, CELL_W, CELL_H);
    }
    c.setTransform(m);
  }
  c.restore();
}
