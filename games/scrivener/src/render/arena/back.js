// Static back layer: the Scrivener's archive nave. Owner: arena.
// One-point perspective toward a lancet window. Light enters by subtraction: the window, the
// clerestory shafts from the left wall and the pool on the floor are paper left bare; everything
// else is built up from ruled hatch that follows the vanishing point.
//
// Value plan (Obata checklist 12): far wall near-black crosshatch with a white window (focal),
// ceiling vault dark ruled hatch carved by white ribs, left wall (shadow side) mid-dark shelves,
// right wall (lit by the shafts) lighter shelves, floor white down the centre where the fighters
// stand. The nearest, heaviest blacks live in the front layer.

import { W, H } from '../../core/constants.js';
import { hashNoise } from '../../core/rng.js';
import { paper, offscreen } from '../ink.js';
import { VP, HALL, P, archPts, hull } from './geom.js';
import { INK, PAPER, poly, fillPoly, clipPoly, rule, rulePath, strokePts, hatchLines, hatchVP, setPaper, paperPoly, dotTone } from './lib.js';

const { L: XL, R: XR, FLOOR, CEIL, VAULT, ZFAR, BAY } = HALL;
const D = 1000; // viewer distance in front-plane px (z = depth / D)
const SHELF_X = 26; // spines stand this far out from the wall
const SHELVES = [560, 482, 404, 326, 248, 170, 92];

const h = hashNoise;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const bbox = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
// how dark the shelving is: the left wall is the shadow side, the right wall darkens toward the
// vault; both fade toward the window light with depth (airy distance, Obata checklist 12)
function wallDark(side, z, y) {
  const near = clamp01(1 - (z - 0.5) / 2.6);
  if (side < 0) return lerp(0.4, 1, Math.pow(near, 0.8));
  const up = clamp01((330 - y) / 160);
  return lerp(0.1, 0.16, near) + up * lerp(0.2, 0.8, near);
}
const wx = (side) => (side < 0 ? XL : XR);
const sxOf = (side) => (side < 0 ? XL + SHELF_X : XR - SHELF_X);

// scene description shared with the live layer
export const scene = { candles: [], shafts: [], motes: [], farWindow: null, lamp: null };

// ---------------------------------------------------------------------------------------------
function farWall(g) {
  const z = ZFAR;
  const arch = archPts(XL, XR, CEIL, VAULT, 18, 0.5).map(([x, y]) => P(x, y, z));
  const wall = [P(XL, FLOOR, z), ...arch, P(XR, FLOOR, z)];
  const b = bbox(wall);
  g.save();
  clipPoly(g, wall);
  // gradated dot tone: darkest in the corners, thinning toward the window's light
  dotTone(g, b, (x, y) => {
    const d = Math.hypot((x - 640) / 1.1, (y - 262) * 1.15);
    return 0.28 + clamp01((d - 60) / 150) * 0.62;
  }, { gap: 3.3 });
  // masonry coursing in ruled hairlines, joints staggered
  for (let r = 0, y = 352; y > 110; y -= 13, r++) {
    rule(g, b.x, y, b.x + b.w, y, 0.7, { alpha: 0.75, end: 0.6 });
    for (let x = b.x + (r % 2) * 14; x < b.x + b.w; x += 28) rule(g, x, y, x, y - 13, 0.6, { alpha: 0.6, end: 0.6 });
  }
  g.restore();

  // window: tall lancet with two sub-lights and a rose
  const sx0 = 588, sx1 = 692, sill = 342, spring = 236, apex = 160;
  const win = [[sx0, sill], ...archPts(sx0, sx1, spring, spring - apex, 16, 0.75), [sx1, sill]];
  scene.farWindow = { x: 640, y: 262, pts: win };
  // scraped light: fine white rays radiating out of the window over the dark wall
  g.save();
  clipPoly(g, wall);
  g.fillStyle = PAPER;
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2 + h(510, i) * 0.04;
    const r0 = 56 + h(511, i) * 10, r1 = r0 + 18 + h(512, i) * (i % 3 === 0 ? 120 : 50);
    const ca = Math.cos(a), sa = Math.sin(a) * 1.25;
    const x0 = 640 + ca * r0, y0 = 255 + sa * r0, x1 = 640 + ca * r1, y1 = 255 + sa * r1;
    const nx = -sa * 0.6, ny = ca * 0.6;
    g.beginPath();
    g.moveTo(x0 + nx, y0 + ny); g.lineTo(x1, y1); g.lineTo(x0 - nx, y0 - ny); g.closePath();
    g.globalAlpha = 0.55 + 0.45 * h(513, i);
    g.fill();
  }
  g.restore();
  // window reveal (thick wall) then the glass
  const reveal = win.map(([x, y]) => [640 + (x - 640) * 1.12, 262 + (y - 262) * 1.06]);
  fillPoly(g, reveal, INK);
  paperPoly(g, win);
  // reveal lit edge carved in white on the left
  strokePts(g, reveal.slice(0, 12), 1, PAPER, 0.9);
  // tracery
  const lw = 1.6;
  strokePts(g, win, lw, INK, 1, true);
  rule(g, 640, sill, 640, 214, 2.2, { end: 0.8 });
  const subL = [[594, sill], ...archPts(594, 636, 262, 40, 10, 0.6), [636, sill]];
  const subR = [[644, sill], ...archPts(644, 686, 262, 40, 10, 0.6), [686, sill]];
  strokePts(g, subL, 1.1, INK, 1, true);
  strokePts(g, subR, 1.1, INK, 1, true);
  g.save(); g.strokeStyle = INK; g.lineWidth = 1.4;
  g.beginPath(); g.arc(640, 198, 15, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(640, 198); g.lineTo(640 + Math.cos(a) * 15, 198 + Math.sin(a) * 15); g.stroke(); }
  g.restore();
  // leaded lattice: hairline diamonds in the sub-lights
  g.save();
  g.beginPath(); poly(g, subL); poly(g, subR); g.clip();
  hatchLines(g, { x: 588, y: 220, w: 104, h: 124 }, { angle: 1.05, gap: 9, width: 0.45, seed: 520, alpha: 0.7, jitter: 0 });
  hatchLines(g, { x: 588, y: 220, w: 104, h: 124 }, { angle: -1.05, gap: 9, width: 0.45, seed: 521, alpha: 0.7, jitter: 0 });
  g.restore();
  rule(g, sx0 - 6, sill + 2, sx1 + 6, sill + 2, 2.6, { end: 0.9 });

  // lectern with the great chained ledger, black against the light (the dormant focus)
  const fy = P(0, FLOOR, z)[1];
  g.save();
  g.translate(640, fy);
  g.scale(1.45, 1.45);
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(-15, 0); g.lineTo(15, 0); g.lineTo(6, -5); g.lineTo(3, -6);
  g.lineTo(2.5, -36); g.lineTo(7, -38); g.lineTo(-7, -38); g.lineTo(-2.5, -36); g.lineTo(-3, -6); g.lineTo(-6, -5);
  g.closePath(); g.fill();
  // slanted desk
  g.beginPath(); g.moveTo(-22, -37); g.lineTo(22, -43); g.lineTo(22, -47); g.lineTo(-22, -42); g.closePath(); g.fill();
  // open ledger: two pages bowing up from the gutter, white with ruled lines
  const pageL = [[-1, -45], [-10, -51], [-21, -48], [-21, -44], [-10, -47], [-1, -42]];
  const pageR = [[1, -45], [10, -52], [21, -51], [21, -47], [10, -48], [1, -42]];
  for (const pg of [pageL, pageR]) {
    fillPoly(g, pg, PAPER);
    strokePts(g, pg, 0.7, INK, 1, true);
  }
  for (let i = 0; i < 3; i++) {
    rule(g, -18, -47.5 + i * 1.3, -4, -45.5 + i * 1.3, 0.35, { alpha: 0.8 });
    rule(g, 4, -46.5 + i * 1.3, 18, -48.5 + i * 1.3, 0.35, { alpha: 0.8 });
  }
  // a ribbon marker hanging from the gutter
  rule(g, 0, -43, 1.5, -30, 1, { end: 0.3 });
  g.restore();
  // chains from the ledger to the floor
  for (const dx of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const cx = 640 + dx * (30 + t * 22), cy = fy - 64 + t * 62 + Math.sin(t * Math.PI) * 5;
      g.save(); g.strokeStyle = INK; g.lineWidth = 0.9;
      g.beginPath(); g.ellipse(cx, cy, i % 2 ? 1.3 : 2.4, i % 2 ? 2.4 : 1.3, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    }
  }
  // flanking blind arcades carved in white hairline
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const cx = 640 + side * (90 + i * 50);
      const a = [[cx - 18, 350], ...archPts(cx - 18, cx + 18, 230, 34, 10, 0.6), [cx + 18, 350]];
      strokePts(g, a, 0.8, PAPER, 0.55);
      strokePts(g, a.map(([x, y]) => [x + side * 2, y + 2]), 0.6, PAPER, 0.25);
    }
  }
  // springing cornice of the far wall
  const c0 = P(XL, CEIL, z), c1 = P(XR, CEIL, z);
  rule(g, c0[0], c0[1], c1[0], c1[1], 1.2, { color: PAPER, alpha: 0.6, end: 0.6 });
  // far floor line
  const f0 = P(XL, FLOOR, z), f1 = P(XR, FLOOR, z);
  rule(g, f0[0], f0[1], f1[0], f1[1], 1.6, { end: 0.7 });
}

// ---------------------------------------------------------------------------------------------
function ceiling(g) {
  const z = ZFAR;
  const far = archPts(XL, XR, CEIL, VAULT, 18, 0.5).map(([x, y]) => P(x, y, z));
  const region = [P(XL, CEIL, -0.6), P(XL, CEIL, z), ...far, P(XR, CEIL, z), P(XR, CEIL, -0.6), [1700, -500], [-500, -500]];
  g.save();
  clipPoly(g, region);
  // ruled hatch along the vanishing direction
  hatchVP(g, VP, { a0: Math.PI * 0.98, a1: Math.PI * 2.02, r0: 120, r1: 1000, gap: 3.4, width: 0.9, seed: 601 });
  // the near vault falls into shadow: a heavier VP hatch that only reaches the outer band
  hatchVP(g, VP, { a0: Math.PI * 0.98, a1: Math.PI * 2.02, r0: 470, r1: 1000, gap: 2.2, width: 1.0, seed: 604 });
  hatchVP(g, VP, { a0: Math.PI * 0.98, a1: Math.PI * 2.02, r0: 600, r1: 1000, gap: 2.4, width: 1.0, seed: 605 });
  // the near edge of the vault in shadow: a feathered band of denser VP hatch along the top
  g.save();
  clipPoly(g, [[-10, -10], [1290, -10], [1290, 150], [1000, 60], [800, 30], [640, 22], [480, 30], [280, 60], [-10, 150]]);
  hatchVP(g, VP, { a0: Math.PI * 0.98, a1: Math.PI * 2.02, r0: 240, r1: 1000, gap: 2.3, width: 1.0, seed: 606 });
  g.restore();
  // second pass into the vault pockets (deepest blacks), heavier on the shadow (right) side
  g.save();
  const pocketR = [[700, -10], [1300, -10], [1300, 120], [820, 150]];
  clipPoly(g, pocketR);
  hatchLines(g, { x: 680, y: -20, w: 640, h: 200 }, { angle: 0.22, gap: 2.4, width: 0.9, seed: 602 });
  g.restore();
  g.save();
  const pocketL = [[-20, -10], [560, -10], [470, 120], [-20, 60]];
  clipPoly(g, pocketL);
  hatchLines(g, { x: -20, y: -20, w: 600, h: 160 }, { angle: -0.25, gap: 4.2, width: 0.7, seed: 603, alpha: 0.85 });
  g.restore();
  g.restore();

  // ribs: transverse arches at every bay, diagonals across each bay, ridge rib
  const ribs = [];
  for (let k = 1; k * BAY < z; k++) ribs.push(k * BAY);
  ribs.push(z);
  const archF = archPts(XL, XR, CEIL, VAULT, 22, 0.5);
  const band = (pts, w, s) => {
    strokePts(g, pts, w + 2.4 * s + 0.8, INK, 1);
    strokePts(g, pts, w, PAPER, 1);
    strokePts(g, pts.map(([x, y]) => [x, y + w * 0.45]), 0.6 + s * 0.8, INK, 0.55);
  };
  // diagonal (groin) ribs first so the transverse ones sit over them
  for (let i = 0; i < ribs.length - 1; i++) {
    const za = i === 0 ? 0.42 : ribs[i - 1] ?? 0.42, zb = ribs[i];
    if (i === 0) continue;
    const s = 1 / (1 + (za + zb) / 2);
    for (const side of [-1, 1]) {
      const pts = [];
      for (let j = 0; j <= 16; j++) {
        const t = j / 16;
        const zz = lerp(side < 0 ? za : zb, side < 0 ? zb : za, t);
        const x = lerp(XL, XR, t);
        const lift = Math.sin(Math.PI * t);
        pts.push(P(x, CEIL - VAULT * Math.pow(lift, 0.7), zz));
      }
      band(pts, 2.2 * s * 2, s);
    }
  }
  for (const zr of ribs) {
    const s = 1 / (1 + zr);
    band(archF.map(([x, y]) => P(x, y, zr)), 9 * s, s);
  }
  // ridge rib and bosses
  const ridge = [];
  for (let zr = 0.9; zr <= z + 0.001; zr += 0.1) ridge.push(P(640, CEIL - VAULT, zr));
  band(ridge, 3, 0.4);
  for (const zr of ribs) {
    const [bx, by] = P(640, CEIL - VAULT, zr);
    if (by < -10) continue;
    const r = 13 / (1 + zr);
    g.save();
    g.fillStyle = INK; g.beginPath(); g.arc(bx, by, r + 1.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAPER; g.beginPath(); g.arc(bx - r * 0.2, by - r * 0.2, r * 0.7, 0, Math.PI * 2); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(bx, by, r * 0.3, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// one side wall: base tone, then bays far to near (shelves, clerestory, pilaster)
function sideWall(g, side) {
  const x = wx(side);
  const region = [P(x, CEIL, -0.6), P(x, CEIL, ZFAR), P(x, FLOOR, ZFAR), P(x, FLOOR, -0.6)];
  const lit = side > 0; // right wall faces the clerestory light
  g.save();
  clipPoly(g, region);
  const aMid = side < 0 ? Math.PI : 0;
  hatchVP(g, VP, { a0: aMid - 1.25, a1: aMid + 1.25, r0: 100, r1: 1100, gap: lit ? 4.6 : 3.0, width: 0.8, seed: 700 + side });
  g.restore();

  const bays = [];
  for (let k = 0; k * BAY < ZFAR - 0.01; k++) bays.push(k);
  for (let bi = bays.length - 1; bi >= 0; bi--) {
    const k = bays[bi];
    const z0 = k * BAY, z1 = Math.min(ZFAR, z0 + BAY);
    shelves(g, side, k, z0 + 0.05, z1, lit);
    clerestory(g, side, k, z0 + 0.05, z1, lit);
    pilaster(g, side, k, z0, lit);
    if (side < 0 && k >= 1 && k <= 4) banner(g, k, z0);
  }
  drips(g, side);
}

// tattered paper banners hung on the shadow-side pilasters: organic dry-brush hems against the
// ruled stone (checklist 10), carrying the Scrivener's quill-and-ledger sigil
function banner(g, k, z0) {
  const z = z0 - 0.004;
  const s = 1 / (1 + z);
  const x0 = XL + 4, x1 = XL + 44, y0 = 40, y1 = 330 + h(2600, k) * 60;
  const n = 9;
  // ragged hem: points along the bottom with tapered tails
  const hem = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const dy = (i % 2 ? -18 : 6) * h(2601 + k, i) + (h(2602 + k, i) < 0.25 ? 26 : 0);
    hem.push(P(lerp(x0, x1, u), y1 + dy, z));
  }
  const shape = [P(x0, y0, z), P(x1, y0, z), ...hem.reverse()];
  fillPoly(g, shape, PAPER);
  // folds: curved hatch on the shadow side of each fold
  g.save(); clipPoly(g, shape);
  for (let f = 0; f < 3; f++) {
    const fx = lerp(x0, x1, 0.2 + f * 0.3);
    for (let j = 0; j < 4; j++) {
      const a = P(fx + j * 2.2, y0 + 10, z), b = P(fx + j * 2.6 + 3, y1 - 10, z);
      rule(g, a[0], a[1], b[0], b[1], 0.7, { alpha: 0.75, end: 0.1, bias: 0.6 });
    }
  }
  g.restore();
  // dry-brush edges: broken outline, heavier on the shadow (right) edge
  rulePath(g, [P(x0, y0, z), P(x0 + 1, (y0 + y1) / 2, z), P(x0, y1 - 8, z)], 1 * s + 0.4);
  rulePath(g, [P(x1, y0, z), P(x1 - 1, (y0 + y1) / 2, z), P(x1, y1 - 8, z)], 2 * s + 0.6);
  for (let i = 0; i < hem.length - 1; i++) {
    const [ax, ay] = hem[i], [bx, by] = hem[i + 1];
    rule(g, ax, ay, bx, by, 1.1 * s, { end: 0.1 });
  }
  // rod
  const r0 = P(x0 - 8, y0, z), r1 = P(x1 + 8, y0, z);
  rule(g, r0[0], r0[1], r1[0], r1[1], 3 * s + 0.6, { end: 0.7 });
  // sigil: a ringed quill crossing an open ledger
  const [cx, cy] = P((x0 + x1) / 2, y0 + 70, z);
  const rr = 12 * s;
  g.save();
  g.strokeStyle = INK; g.lineWidth = 1.1 * s + 0.3;
  g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke();
  g.restore();
  rule(g, cx - rr * 0.6, cy + rr * 0.75, cx + rr * 0.55, cy - rr * 0.8, 2.4 * s, { end: 0.05, bias: 0.7 });
  fillPoly(g, [[cx - rr * 0.65, cy + rr * 0.15], [cx, cy + rr * 0.35], [cx + rr * 0.65, cy + rr * 0.15], [cx + rr * 0.65, cy + rr * 0.4], [cx, cy + rr * 0.6], [cx - rr * 0.65, cy + rr * 0.4]], INK);
}

// ink seeping from the ledgers: tapered drips down the shelf fronts, each ending in a bead
function drips(g, side) {
  const xs = sxOf(side);
  for (let i = 0; i < 26; i++) {
    const z = 0.08 + h(2700 + side, i) * 2.2;
    const si = Math.floor(h(2701 + side, i) * (SHELVES.length - 1)) + 1;
    const y0 = SHELVES[si] + 5;
    const len = 18 + h(2702 + side, i) * 70;
    const s = 1 / (1 + z);
    const [ax, ay] = P(xs, y0, z), [bx, by] = P(xs, y0 + len, z);
    const w = (1.4 + h(2703 + side, i) * 1.6) * s + 0.4;
    rule(g, ax, ay, bx, by, w, { end: 0.25, bias: 0.15 });
    g.save(); g.fillStyle = INK;
    g.beginPath(); g.ellipse(bx, by, w * 0.7, w * 0.95, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

function quadOnWall(xs, z0, z1, y0, y1) {
  return [P(xs, y0, z0), P(xs, y0, z1), P(xs, y1, z1), P(xs, y1, z0)];
}

function shelves(g, side, k, z0, z1, lit) {
  const xs = sxOf(side);
  const fade = clamp01(1.15 - z0 * 0.3); // airy with distance
  // cabinet plinth
  const plinth = quadOnWall(xs, z0, z1, FLOOR, SHELVES[0] + 6);
  fillPoly(g, plinth, PAPER);
  g.save(); clipPoly(g, plinth);
  hatchVP(g, VP, { a0: side < 0 ? Math.PI - 0.6 : -0.6, a1: side < 0 ? Math.PI + 0.6 : 0.6, r0: 20, r1: 1200, gap: lit ? 3.4 : 2.2, width: 0.8, seed: 800 + k * 7 + side });
  g.restore();
  // cabinet doors: verticals carved in white
  const nd = 3;
  for (let d = 1; d < nd; d++) {
    const zz = lerp(z0, z1, d / nd);
    const [ax, ay] = P(xs, FLOOR - 4, zz), [bx, by] = P(xs, SHELVES[0] + 10, zz);
    rule(g, ax, ay, bx, by, 1.4 / (1 + zz), { color: PAPER, alpha: 0.85, end: 0.6 });
  }
  for (let si = 0; si < SHELVES.length - 1; si++) {
    const yb = SHELVES[si], yt = SHELVES[si + 1];
    const gapH = yb - yt;
    // recess behind the books
    const dk = wallDark(side, (z0 + z1) / 2, (yb + yt) / 2);
    const recess = quadOnWall(xs, z0, z1, yb, yt);
    // round 28: the lit right wall sits behind the boss: its recesses are kept a pale
    // tone so the black figure separates from the shelving (Obata checklist 12)
    fillPoly(g, recess, INK, side > 0 ? 0.14 + 0.5 * dk : 0.3 + 0.68 * dk);
    // books
    let z = z0 + 0.008;
    let i = 0;
    const seed = 900 + k * 131 + si * 17 + (side > 0 ? 5000 : 0);
    while (z < z1 - 0.012) {
      const dz = 0.011 + h(seed, i) * 0.016;
      const za = z, zb = Math.min(z1 - 0.004, z + dz);
      z = zb + (h(seed + 1, i) < 0.06 ? 0.02 : 0.0015);
      i++;
      if (h(seed + 2, i) < 0.05) continue; // a gap
      const bh = gapH * (0.6 + h(seed + 3, i) * 0.33);
      const lean = h(seed + 4, i) < 0.05 ? 1 : 0;
      const q = quadOnWall(xs, za, zb, yb, yb - bh);
      if (lean) { q[2] = P(xs, yb - bh * 0.92, zb + 0.012); q[3] = P(xs, yb - bh * 0.95, za + 0.014); }
      const v = h(seed + 5, i);
      const sscale = 1 / (1 + za);
      if (v < 0.04 + 0.72 * dk * dk) {
        fillPoly(g, q, INK, 1);
        if (v < 0.24 && sscale > 0.3) {
          // carved bands on black spines
          for (const fy of [0.16, 0.82]) {
            const yy = yb - bh * fy;
            const [ax, ay] = P(xs, yy, za + 0.002), [bx, by] = P(xs, yy, zb - 0.002);
            rule(g, ax, ay, bx, by, 0.9 * sscale + 0.3, { color: PAPER, alpha: 0.75, end: 0.8 });
          }
        }
      } else {
        fillPoly(g, q, PAPER, 1);
        if (v < 0.35 + 0.5 * dk) {
          g.save(); clipPoly(g, q);
          const b = bbox(q);
          hatchLines(g, b, { angle: Math.PI / 2, gap: lerp(3.4, 1.4, dk), width: 0.6, seed: seed + i, alpha: 0.95 });
          g.restore();
        }
        strokePts(g, q, 0.5 + 0.6 * sscale, INK, 0.9 * fade, true);
        if (sscale > 0.3) {
          const yy = yb - bh * 0.75;
          const [ax, ay] = P(xs, yy, za), [bx, by] = P(xs, yy, zb);
          rule(g, ax, ay, bx, by, 1.2 * sscale, { alpha: 0.9 * fade, end: 0.8 });
        }
      }
    }
    // shelf board: lit front edge as a white receding band ruled in ink
    const sb = quadOnWall(xs + side * -4, z0, z1, yb + 5, yb);
    fillPoly(g, sb, PAPER);
    const [a0x, a0y] = P(xs, yb + 5, z0), [a1x, a1y] = P(xs, yb + 5, z1);
    rule(g, a0x, a0y, a1x, a1y, 1.6 / (1 + z0) + 0.4, { end: 0.5 });
    const [b0x, b0y] = P(xs, yb, z0), [b1x, b1y] = P(xs, yb, z1);
    rule(g, b0x, b0y, b1x, b1y, 0.8 / (1 + z0) + 0.3, { end: 0.5, alpha: 0.8 });
  }
  // top shelf board and cornice
  const yTop = SHELVES[SHELVES.length - 1];
  const cor = quadOnWall(xs, z0, z1, yTop + 4, yTop - 22);
  fillPoly(g, cor, PAPER);
  g.save(); clipPoly(g, cor);
  hatchLines(g, bbox(cor), { angle: 0, gap: 2, width: 0.6, seed: 990 + k, alpha: 0.6 });
  g.restore();
  for (const yy of [yTop + 4, yTop - 10, yTop - 22]) {
    const [ax, ay] = P(xs, yy, z0), [bx, by] = P(xs, yy, z1);
    rule(g, ax, ay, bx, by, 1.5 / (1 + z0) + 0.3, { end: 0.5 });
  }
  // a candle on some shelves (live layer adds the flame)
  if (k >= 1 && k <= 6 && h(1100 + side, k) < (side < 0 ? 0.85 : 0.45)) {
    const si = 1 + Math.floor(h(1101 + side, k) * 4);
    const zz = lerp(z0, z1, 0.3 + h(1102 + side, k) * 0.4);
    const y = SHELVES[si];
    const s = 1 / (1 + zz);
    const [cx, cy] = P(xs + side * -10, y, zz);
    const ch = 26 * s, cw = 7 * s;
    fillPoly(g, [[cx - cw / 2, cy], [cx + cw / 2, cy], [cx + cw / 2, cy - ch], [cx - cw / 2, cy - ch]], PAPER);
    strokePts(g, [[cx - cw / 2, cy], [cx - cw / 2, cy - ch], [cx + cw / 2, cy - ch], [cx + cw / 2, cy]], 0.8 * s + 0.3, INK, 1);
    scene.candles.push({ x: cx, y: cy - ch - 4 * s, s, seed: 40 + scene.candles.length });
  }
}

function clerestory(g, side, k, z0, z1, lit) {
  const xs = wx(side);
  const yTop = SHELVES[SHELVES.length - 1] - 22;
  const za = z0 + 0.07, zb = z1 - 0.07;
  const sill = yTop - 14, spring = CEIL + 70, apex = CEIL + 8;
  // window outline in wall-local (u, y), u along depth
  const shape = [[0, sill], ...archPts(0, 1, spring, spring - apex, 12, 0.7), [1, sill]];
  const pts = shape.map(([u, y]) => P(xs, y, lerp(za, zb, u)));
  const s = 1 / (1 + (za + zb) / 2);
  if (side < 0) {
    // glazed: paper bare, deep reveal on the near side
    const rev = shape.map(([u, y]) => P(xs - 40, y, lerp(za, zb, u)));
    fillPoly(g, hull([...pts, ...rev]), INK);
    paperPoly(g, pts);
    strokePts(g, pts, 1 + s, INK, 1, true);
    // mullion + transom + lattice hairlines
    const m0 = P(xs, sill, (za + zb) / 2), m1 = P(xs, apex + 18, (za + zb) / 2);
    rule(g, m0[0], m0[1], m1[0], m1[1], 2 * s + 0.4, { end: 0.8 });
    const t0 = P(xs, spring, za), t1 = P(xs, spring, zb);
    rule(g, t0[0], t0[1], t1[0], t1[1], 1.6 * s + 0.3, { end: 0.8 });
    g.save(); clipPoly(g, pts);
    const b = bbox(pts);
    hatchLines(g, b, { angle: 1.2, gap: 7 * s + 2, width: 0.45, seed: 1200 + k, alpha: 0.6, jitter: 0 });
    hatchLines(g, b, { angle: -0.3, gap: 7 * s + 2, width: 0.45, seed: 1210 + k, alpha: 0.6, jitter: 0 });
    g.restore();
    scene.shafts.push({ k, xs, za, zb, sill, spring, apex, shape });
  } else {
    // the lit wall: blind arches holding hung pages, carved edge in white
    fillPoly(g, pts, INK, 0.8);
    g.save(); clipPoly(g, pts);
    hatchLines(g, bbox(pts), { angle: 0.15, gap: 2.2, width: 0.8, seed: 1300 + k });
    g.restore();
    strokePts(g, pts, 1.2 * s + 0.3, PAPER, 0.9, true);
    strokePts(g, pts, 0.6, INK, 1, true);
  }
}

function pilaster(g, side, k, z0, lit) {
  if (k === 0) return;
  const x = wx(side), xo = x - side * 46;
  const zb = z0 + 0.05;
  const s = 1 / (1 + z0);
  // face toward the viewer (constant z)
  const face = [P(x, FLOOR, z0), P(xo, FLOOR, z0), P(xo, CEIL - 10, z0), P(x, CEIL - 10, z0)];
  // face toward the hall (constant x)
  const inner = [P(xo, FLOOR, z0), P(xo, FLOOR, zb), P(xo, CEIL - 10, zb), P(xo, CEIL - 10, z0)];
  if (lit) {
    fillPoly(g, inner, INK, 0.9);
    fillPoly(g, face, PAPER);
    g.save(); clipPoly(g, face);
    hatchLines(g, bbox(face), { angle: Math.PI / 2, gap: 3.2 * s + 1, width: 0.7, seed: 1400 + k, alpha: 0.9 });
    g.restore();
  } else {
    fillPoly(g, face, INK);
    fillPoly(g, inner, PAPER);
    g.save(); clipPoly(g, inner);
    fillPoly(g, inner, INK, 0.35);
    hatchLines(g, bbox(inner), { angle: Math.PI / 2, gap: 1.5 * s + 1, width: 0.8, seed: 1450 + k, alpha: 0.95 });
    g.restore();
    // fluting carved in white on the black face
    for (let f = 1; f < 4; f++) {
      const fx = lerp(x, xo, f / 4);
      const [ax, ay] = P(fx, FLOOR - 40, z0), [bx, by] = P(fx, CEIL + 20, z0);
      rule(g, ax, ay, bx, by, 0.9 * s + 0.2, { color: PAPER, alpha: 0.6, end: 0.3 });
    }
  }
  // edges, heavier on the shadow side
  for (const [pt, w] of [[[xo, z0], 2.2], [[xo, zb], 1.0], [[x, z0], 1.2]]) {
    const [ax, ay] = P(pt[0], FLOOR, pt[1]), [bx, by] = P(pt[0], CEIL - 10, pt[1]);
    rule(g, ax, ay, bx, by, w * s + 0.4, { end: 0.5 });
  }
  // base and capital mouldings
  for (const yy of [FLOOR - 30, FLOOR - 36, CEIL + 4, CEIL - 6]) {
    const a = P(x, yy, z0), b = P(xo - side * 8, yy, z0), c = P(xo - side * 8, yy, zb);
    strokePts(g, [a, b, c], 1.1 * s + 0.3, INK, 1);
  }
}

// ---------------------------------------------------------------------------------------------
const TILE_W = 84, TILE_D = 0.085, Z_FRONT = -0.34;
const PATH_HW = 205; // half width of the window's light path (front-plane px)

function floorDark(xc, z) {
  const lat = Math.abs(xc - 640);
  let d = clamp01((lat - PATH_HW + 30) / 430) * 0.95;
  d += clamp01((lat - 560) / 120) * 0.35;
  if (z > 1.6) d *= lerp(1, 0.55, clamp01((z - 1.6) / 1.4)); // airy far floor
  if (z < 0) d += clamp01(-z / 0.32) * 0.28 * (0.35 + clamp01((lat - 120) / 360));
  return d;
}

function floor(g) {
  const region = [P(XL, FLOOR, Z_FRONT), P(XL, FLOOR, ZFAR), P(XR, FLOOR, ZFAR), P(XR, FLOOR, Z_FRONT)];
  fillPoly(g, region, PAPER, 0.0);
  const rows = [];
  for (let z = Z_FRONT; z < ZFAR; z += TILE_D) rows.push(z);
  // tile shading, row by row
  for (let r = 0; r < rows.length; r++) {
    const z0 = rows[r], z1 = Math.min(ZFAR, z0 + TILE_D);
    const off = (r % 2) * TILE_W * 0.5;
    for (let x0 = XL - off; x0 < XR; x0 += TILE_W) {
      const xa = Math.max(XL, x0), xb = Math.min(XR, x0 + TILE_W);
      const q = [P(xa, FLOOR, z0), P(xb, FLOOR, z0), P(xb, FLOOR, z1), P(xa, FLOOR, z1)];
      const b = bbox(q);
      if (b.x > W + 4 || b.x + b.w < -4 || b.y > H + 4) continue;
      const col = Math.round(x0 / TILE_W);
      let d = floorDark((xa + xb) / 2, (z0 + z1) / 2) + (h(1500 + r, col) - 0.5) * 0.12;
      const stain = h(1600 + r, col) < 0.05 && Math.abs((xa + xb) / 2 - 640) > 150;
      if (stain) d += 0.45;
      if (d < 0.2) continue;
      d = Math.min(1, d);
      g.save(); clipPoly(g, q);
      hatchLines(g, b, { angle: 0, gap: lerp(6.5, 1.7, d), width: 0.75, seed: 1700 + r * 61 + col, alpha: 0.9, jitter: 0.2 });
      if (d > 0.72) hatchLines(g, b, { angle: -0.5, gap: lerp(5, 2.2, d), width: 0.6, seed: 1800 + r * 61 + col, alpha: 0.8 });
      g.restore();
    }
  }
  // seams: transverse
  for (let r = 0; r < rows.length; r++) {
    const z = rows[r];
    const s = 1 / (1 + z);
    const a = P(XL, FLOOR, z), b = P(XR, FLOOR, z);
    if (a[1] > H + 4) continue;
    rule(g, a[0], a[1], b[0], b[1], Math.min(2.4, 1.5 * s), { end: 0.4, alpha: 0.95 });
  }
  // seams: longitudinal, staggered per row, with chipped corners
  for (let r = 0; r < rows.length; r++) {
    const z0 = rows[r], z1 = Math.min(ZFAR, z0 + TILE_D);
    const s = 1 / (1 + z0);
    const off = (r % 2) * TILE_W * 0.5;
    for (let x0 = XL - off; x0 < XR; x0 += TILE_W) {
      if (x0 <= XL) continue;
      const a = P(x0, FLOOR, z0), b = P(x0, FLOOR, z1);
      if (a[1] > H + 4 || a[0] < -20 || a[0] > W + 20) continue;
      rule(g, a[0], a[1], b[0], b[1], Math.min(2, 1.2 * s), { end: 0.5, alpha: 0.9 });
    }
  }
  // cracks
  for (let i = 0; i < 40; i++) {
    const z = lerp(Z_FRONT + 0.02, 1.6, Math.pow(h(1900, i), 1.4));
    const x = lerp(XL + 100, XR - 100, h(1901, i));
    if (Math.abs(x - 640) < 260 && h(1930, i) < 0.7) continue; // keep the stage clean
    const pts = [];
    let cx = x, cz = z;
    const n = 3 + Math.floor(h(1902, i) * 4);
    for (let j = 0; j <= n; j++) {
      pts.push(P(cx, FLOOR, cz));
      cx += (h(1903 + j, i) - 0.5) * 34;
      cz += (h(1910 + j, i) - 0.3) * 0.025;
    }
    const s = 1 / (1 + z);
    if (pts[0][1] > H) continue;
    rulePath(g, pts, 1.2 * s + 0.2, { alpha: 0.85 });
    if (h(1920, i) < 0.4) {
      const m = pts[1];
      rulePath(g, [m, [m[0] + (h(1921, i) - 0.5) * 30 * s, m[1] + 8 * s]], 1 * s + 0.2, { alpha: 0.8 });
    }
  }
  // stage line where wall plinths meet floor
  for (const side of [-1, 1]) {
    const a = P(sxOf(side), FLOOR, 0), b = P(sxOf(side), FLOOR, ZFAR);
    rule(g, a[0], a[1], b[0], b[1], 2.4, { end: 0.3 });
  }
}

// ---------------------------------------------------------------------------------------------
// clerestory light: shafts from the left windows down to the floor, cut out as bare paper
const LIGHT = [1, 0.95, -0.28]; // direction in front-plane px (x right, y down, depth toward viewer)

function lightOnFloor(xs, y, z) {
  const t = (FLOOR - y) / LIGHT[1];
  return [xs + LIGHT[0] * t, FLOOR, z + (LIGHT[2] * t) / D];
}

function shafts(g) {
  for (const sh of scene.shafts) {
    const { xs, za, zb, shape } = sh;
    const top = shape.map(([u, y]) => [xs, y, lerp(za, zb, u)]);
    const win2d = top.map(([x, y, z]) => P(x, y, z));
    const land3 = top.map(([x, y, z]) => lightOnFloor(x, y, z));
    const land2d = land3.map(([x, y, z]) => P(x, y, Math.max(z, Z_FRONT)));
    const shaftPoly = hull([...win2d, ...land2d]);
    sh.poly = shaftPoly;
    sh.land = land2d;
    sh.win = win2d;
    const s = 1 / (1 + (za + zb) / 2);
    paperPoly(g, shaftPoly, 0.16);
    paperPoly(g, land2d, 0.92);
    // the beam itself: white ruled streaks scraped from window to floor
    const n = win2d.length;
    for (let j = 0; j < 30; j++) {
      const u = h(2050 + sh.k, j) * (n - 1);
      const i0 = Math.floor(u), i1 = Math.min(n - 1, i0 + 1), f = u - i0;
      const ax = lerp(win2d[i0][0], win2d[i1][0], f), ay = lerp(win2d[i0][1], win2d[i1][1], f);
      const bx = lerp(land2d[i0][0], land2d[i1][0], f), by = lerp(land2d[i0][1], land2d[i1][1], f);
      const e0 = h(2051 + sh.k, j) * 0.15, e1 = 0.55 + h(2052 + sh.k, j) * 0.45;
      const w = 0.8 + Math.pow(h(2053 + sh.k, j), 2) * 7 * s;
      rule(g, lerp(ax, bx, e0), lerp(ay, by, e0), lerp(ax, bx, e1), lerp(ay, by, e1), w,
        { color: PAPER, alpha: 0.5 + 0.4 * h(2054 + sh.k, j), end: 0.05, bias: 0.35 });
    }
    // ruled ray edges, broken
    const edges = [0, Math.floor(shape.length / 2), shape.length - 1];
    for (const ei of edges) {
      const [ax, ay] = win2d[ei], [bx, by] = land2d[ei];
      const cut = 0.25 + h(2000 + sh.k, ei) * 0.4;
      rule(g, ax, ay, ax + (bx - ax) * cut, ay + (by - ay) * cut, 0.7, { alpha: 0.45, end: 0.1, bias: 0.2 });
    }
    scene.motes.push({ poly: shaftPoly, win: win2d, land: land2d });
  }
}

// ---------------------------------------------------------------------------------------------
// hung pages strung across the nave on cords
function pageLines(g) {
  for (const [li, z] of [[0, 2.35], [1, 1.25]]) {
    const s = 1 / (1 + z);
    const x0 = XL + 30, x1 = XR - 30, y0 = -30, sag = 120;
    const cord = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      cord.push(P(lerp(x0, x1, t), y0 + sag * 4 * t * (1 - t), z));
    }
    strokePts(g, cord, 1.1 * s + 0.3, INK, 0.95);
    for (let i = 1; i < 18; i++) {
      const t = i / 18 + (h(2100 + li, i) - 0.5) * 0.02;
      const px = lerp(x0, x1, t), py = y0 + sag * 4 * t * (1 - t);
      if (h(2101 + li, i) < 0.15) continue;
      const [ax, ay] = P(px, py, z);
      const pw = (40 + h(2102 + li, i) * 14) * s, ph = (54 + h(2103 + li, i) * 20) * s;
      const rot = (h(2104 + li, i) - 0.5) * 0.22;
      g.save();
      g.translate(ax, ay);
      g.rotate(rot);
      const inked = h(2105 + li, i) < 0.22;
      g.fillStyle = inked ? INK : PAPER;
      g.fillRect(-pw / 2, 0, pw, ph);
      if (!inked) {
        // lower edge in shadow
        g.fillStyle = INK;
        g.globalAlpha = 0.85;
        for (let l = 0; l < 6; l++) {
          const ly = ph * (0.18 + l * 0.12);
          const lw = pw * (0.55 + h(2106 + li, i * 7 + l) * 0.3);
          g.fillRect(-pw / 2 + pw * 0.12, ly, lw, Math.max(0.6, 1.1 * s));
        }
        g.globalAlpha = 1;
        g.strokeStyle = INK; g.lineWidth = 0.6 + 0.8 * s;
        g.strokeRect(-pw / 2, 0, pw, ph);
        // curled corner
        g.beginPath(); g.moveTo(pw / 2, ph - 8 * s); g.lineTo(pw / 2 - 8 * s, ph); g.lineTo(pw / 2 - 6 * s, ph - 6 * s); g.closePath();
        g.fillStyle = INK; g.fill();
      } else {
        // a single white glyph-line carved in the black page
        g.fillStyle = PAPER;
        g.fillRect(-pw * 0.3, ph * 0.45, pw * 0.6, Math.max(0.7, 1.2 * s));
      }
      // peg
      g.fillStyle = INK;
      g.fillRect(-2 * s, -4 * s, 4 * s, 9 * s);
      g.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// floor clutter: ledger stacks against the walls, ink spills, loose pages, candle clusters
function box3(g, x0, x1, z0, z1, yb, yt, fillFront, opts = {}) {
  const front = [P(x0, yb, z0), P(x1, yb, z0), P(x1, yt, z0), P(x0, yt, z0)];
  const top = [P(x0, yt, z0), P(x1, yt, z0), P(x1, yt, z1), P(x0, yt, z1)];
  const sideX = (x0 + x1) / 2 < VP.x ? x1 : x0;
  const sideF = [P(sideX, yb, z0), P(sideX, yb, z1), P(sideX, yt, z1), P(sideX, yt, z0)];
  fillPoly(g, sideF, opts.sideColor ?? INK, 1);
  fillPoly(g, top, PAPER);
  fillFront(front);
  const s = 1 / (1 + z0);
  strokePts(g, top, 0.7 + 0.8 * s, INK, 1, true);
  strokePts(g, front, 0.9 + 1.2 * s, INK, 1, true);
}

function ledgerStack(g, xc, z, seed, n) {
  let y = FLOOR;
  for (let i = 0; i < n; i++) {
    const w = 70 + h(seed, i) * 50, d = 0.05 + h(seed + 1, i) * 0.03, th = 12 + h(seed + 2, i) * 10;
    const dx = (h(seed + 3, i) - 0.5) * 18;
    const x0 = xc - w / 2 + dx, x1 = xc + w / 2 + dx;
    const dark = h(seed + 4, i) < 0.55;
    box3(g, x0, x1, z, z + d, y, y - th, (front) => {
      const s = 1 / (1 + z);
      if (dark) {
        fillPoly(g, front, INK);
        // page block edge carved in white
        const a = P(x0 + 5, y - th * 0.5, z), b = P(x1 - 3, y - th * 0.5, z);
        rule(g, a[0], a[1], b[0], b[1], th * 0.35 * s, { color: PAPER, end: 0.9, alpha: 0.9 });
        const c = P(x0 + 5, y - th * 0.5, z), e = P(x1 - 3, y - th * 0.5, z);
        rule(g, c[0], c[1], e[0], e[1], 0.5, { end: 0.9, alpha: 0.7 });
      } else {
        fillPoly(g, front, PAPER);
        g.save(); clipPoly(g, front);
        hatchLines(g, bbox(front), { angle: 0, gap: 1.6, width: 0.5, seed: seed + i, alpha: 0.75 });
        g.restore();
      }
    });
    y -= th;
  }
}

function clutter(g) {
  // ledger stacks at the foot of the shelves
  const stacks = [
    [XL + 120, 0.95, 3], [XL + 150, 1.55, 5], [XL + 100, 2.2, 4], [XL + 180, 0.62, 2],
    [XR - 130, 1.1, 4], [XR - 110, 1.85, 6], [XR - 160, 2.6, 3], [XR - 200, 0.7, 2],
  ];
  // far to near so nearer stacks overlap
  stacks.sort((a, b) => b[1] - a[1]);
  for (const [i, [x, z, n]] of stacks.entries()) ledgerStack(g, x, z, 2200 + i * 37, n);

  // ink spills (flattened by perspective) with a white rim highlight
  for (const [i, [x, z, r]] of [[250, 0.4, 60], [1060, 0.2, 80], [890, 1.5, 40]].entries()) {
    const s = 1 / (1 + z);
    const [cx, cy] = P(x, FLOOR, z);
    const pts = [];
    for (let j = 0; j < 22; j++) {
      const a = (j / 22) * Math.PI * 2;
      const rr = r * (0.65 + 0.55 * h(2300 + i, j)) * s;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.22]);
    }
    fillPoly(g, pts, INK);
    g.save(); g.strokeStyle = PAPER; g.lineWidth = 1; g.globalAlpha = 0.8;
    g.beginPath(); g.ellipse(cx - r * 0.2 * s, cy - r * 0.03 * s, r * 0.35 * s, r * 0.05 * s, 0, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
    g.restore();
  }

  // loose pages lying flat
  for (let i = 0; i < 16; i++) {
    const z = lerp(Z_FRONT + 0.04, 2.4, Math.pow(h(2400, i), 1.3));
    let x = lerp(XL + 80, XR - 80, h(2401, i));
    const pw = 60, pd = 0.07;
    const rot = (h(2402, i) - 0.5) * 1.4;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const fx = x + (u * pw / 2) * c - (v * pw * 0.65) * sn;
      const fz = z + ((u * pw / 2) * sn + (v * pw * 0.65) * c) * (pd / pw) * 1.4;
      return P(fx, FLOOR, fz);
    });
    if (corners[0][1] > H) continue;
    fillPoly(g, corners, PAPER);
    strokePts(g, corners, 0.9, INK, 1, true);
    g.save(); clipPoly(g, corners);
    const b = bbox(corners);
    hatchLines(g, b, { angle: Math.atan2(corners[1][1] - corners[0][1], corners[1][0] - corners[0][0]), gap: 3.2, width: 0.55, seed: 2410 + i, alpha: 0.6, broken: 0.6 });
    g.restore();
  }

  // candle clusters on the floor at the shadow wall and the lit wall
  for (const [ci, [x, z, n]] of [[XL + 90, 0.55, 4], [XL + 80, 1.3, 3], [XL + 80, 2.05, 3], [XR - 80, 0.9, 3], [XR - 80, 1.9, 2]].entries()) {
    for (let j = 0; j < n; j++) {
      const zz = z + (h(2500 + ci, j) - 0.5) * 0.06;
      const xx = x + (h(2501 + ci, j) - 0.5) * 60;
      const s = 1 / (1 + zz);
      const [bx, by] = P(xx, FLOOR, zz);
      const ch = (24 + h(2502 + ci, j) * 40) * s, cw = 10 * s;
      // wax pool
      g.save(); g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 0.7;
      g.beginPath(); g.ellipse(bx, by, cw * 1.3, cw * 0.35, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
      const body = [[bx - cw / 2, by], [bx + cw / 2, by], [bx + cw / 2, by - ch], [bx - cw / 2, by - ch]];
      fillPoly(g, body, PAPER);
      // shadow side of the candle hatched
      g.save(); clipPoly(g, body);
      hatchLines(g, { x: bx, y: by - ch, w: cw / 2, h: ch }, { angle: Math.PI / 2, gap: 1.6, width: 0.5, seed: 2510 + ci * 9 + j, alpha: 0.8 });
      g.restore();
      strokePts(g, [[bx - cw / 2, by], [bx - cw / 2, by - ch], [bx + cw / 2, by - ch], [bx + cw / 2, by]], 0.6 + 0.6 * s, INK, 1);
      // drip
      rule(g, bx - cw / 2 + 1, by - ch, bx - cw / 2 + 1, by - ch + ch * 0.4 * h(2503 + ci, j), 1.5 * s, { end: 0.6 });
      scene.candles.push({ x: bx, y: by - ch - 5 * s, s: s * 1.2, seed: 80 + scene.candles.length });
    }
  }
}

// ---------------------------------------------------------------------------------------------
export function buildBack(scale = 1) {
  scene.candles.length = 0;
  scene.shafts.length = 0;
  scene.motes.length = 0;
  const c = offscreen(Math.round(W * scale), Math.round(H * scale));
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const sheet = paper(W, H, { seed: 41 });
  setPaper(sheet);
  g.drawImage(sheet, 0, 0, W, H);

  ceiling(g);
  farWall(g);
  sideWall(g, -1);
  sideWall(g, 1);
  floor(g);
  clutter(g);
  shafts(g);
  pageLines(g);
  return c;
}
