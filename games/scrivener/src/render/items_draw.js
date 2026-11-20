// Engraved item plates and the in-fight spell effects. Owner: art.
//   drawItemIcon(ctx, kind, id, x, y, size, { ink, accent, plate })
//     kind: 'cls' | 'weapon' | 'spell' | 'charm' | 'temper'. A small vignette in line and hatch,
//     centred on (x, y), inside a size x size square. Readable at 64 px, rich at 220 px.
//   drawSpellFx(ctx, world, t)
//     candle bolts (world.hazards kind 'bolt'), the knot (world.boss.bound), the burn
//     (world.boss.burn), the hex mark (world.boss.hexed). Read defensively; absent = nothing.
// Deterministic (hashNoise only); no images, no text.

import { hashNoise } from '../core/rng.js';
import { GROUND_Y } from '../core/constants.js';
import { INK, PAPER, RED, blot } from './ink.js';
import { spline, quad, ribbonPath, penPath, spikePath, contour, poly, polyPath, LIGHT } from './art/pen.js';
import { hatchIn, paperForm, inkForm, ellPts, rectPts, rimLight, stipple, bbox, BONE } from './fighter_parts/engrave.js';
import { drawWeapon, lamp, smoke } from './fighter_parts/weapons.js';
import { drawFighterFigure, flame, sigil } from './agent_draw.js';

export const ITEM_IDS = {
  cls: ['duelist', 'warden', 'thief', 'hexer', 'archivist', 'penitent'],
  weapon: ['sabre', 'maul', 'knives', 'pole', 'censer', 'quill'],
  spell: ['candle', 'blot', 'margin', 'knot', 'mend', 'echo'],
  charm: ['seal', 'bookmark', 'ribbon', 'ember', 'nib', 'sandglass', 'lens'],
  temper: ['enraged', 'ironbound', 'tinder', 'slow', 'restless', 'counting'],
};

// ---- unit-space helpers (a plate is 200 x 200 units, centred) ---------------------------
let D = 1;             // units per device pixel for the plate being drawn
let INKC = INK;
let PLATE_ON = true;
const LW = (units, px) => Math.max(units, px * D);
const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const lerpA = (a, b, t) => a + (b - a) * t;
const S0 = () => ({ hi: true, lod: 2, D, t: 1600, drag: 0, sway: 0 });

function paperObj(ctx, pts, { angle = 0.8, gap = 3.2, lo = 0.35, cross = true, crossLo = 0.65, line = 2.2, fill = PAPER, bias = 0, seed = 1, bend = 0 } = {}) {
  paperForm(ctx, pts, {
    fill,
    hatch: { angle, gap: LW(gap, 2.3), w: LW(0.95, 0.75), lo, seed, bias, bend },
    cross: cross ? { angle: angle + 1.25, gap: LW(gap * 1.15, 2.6), w: LW(0.85, 0.7), lo: crossLo, seed: seed + 7, bias } : null,
    line: { min: LW(0.5, 0.45), max: LW(line, 1.25), seed },
  });
}
function inkObj(ctx, pts, { angle = 1.2, gap = 3.0, lo = 0.25, rim = true, seed = 3, bend = 0 } = {}) {
  inkForm(ctx, pts, { carve: { angle, gap: LW(gap, 2.3), w: LW(1.1, 0.8), lo, seed, bend } });
  if (rim) rimLight(ctx, pts, { D, inset: 1.8, w: 1.3, seed });
}
function pen(ctx, pts, w, color = INK, head = 0.2, tail = 0.3) {
  ctx.fillStyle = color; ctx.beginPath(); penPath(ctx, pts, LW(w, w * 0.5), head, tail); ctx.fill();
}
function lines(ctx, list, w, color = INK) {
  ctx.fillStyle = color; ctx.beginPath();
  for (const pts of list) penPath(ctx, pts, LW(w, 0.6), 0.15, 0.25);
  ctx.fill();
}

// the vignette: horizontal ruled lines in a ragged oval, heavier toward the ground
function plate(ctx, seed = 1, { ground = 52, rx = 86, ry = 82 } = {}) {
  if (!PLATE_ON) return;
  const gap = LW(4.2, 2.8);
  ctx.fillStyle = INKC;
  ctx.beginPath();
  let i = 0;
  for (let y = -ry; y <= ry; y += gap, i++) {
    const u = y / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - u * u)) * (0.86 + 0.14 * hashNoise(seed, i));
    if (half < 6) continue;
    const below = y > ground;
    const w = LW(below ? 1.0 : 0.55, below ? 0.75 : 0.42) * (below ? 1 : 0.6 + 0.5 * (y + ry) / (2 * ry));
    const x0 = -half + (hashNoise(seed + 1, i) - 0.5) * 8, x1 = half + (hashNoise(seed + 2, i) - 0.5) * 8;
    ribbonPath(ctx, [[x0, y], [(x0 + x1) / 2, y + (hashNoise(seed + 3, i) - 0.5) * 0.6], [x1, y]], (t) => w * Math.min(1, Math.sin(Math.PI * t) * 4));
  }
  ctx.fill();
}
// a cast shadow on the ground: dense short strokes
function groundShadow(ctx, cx, cy, rx, ry = 6) {
  const pts = ellPts(cx, cy, rx, ry, 0, 26);
  hatchIn(ctx, pts, { mode: 'shadow', color: INKC, angle: 0.02, gap: LW(2.0, 1.6), w: LW(1.3, 0.9), lo: 0, flat: 0.75, seed: 5, light: [0, -1] });
}

// ---- shared objects ---------------------------------------------------------------------
// a closed book in three-quarter view: cover, page block, bands
function book(ctx, c, w, h, a, { depth = 14, bands = true, dark = true, seed = 1 } = {}) {
  const P = (x, y) => add(c, rot([x, y], a));
  const top = [P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2 + depth * 0.6, -h / 2 + depth * 0.5), P(-w / 2 + depth * 0.6, -h / 2 + depth * 0.5)];
  const front = [P(-w / 2, -h / 2), P(-w / 2 + depth * 0.6, -h / 2 + depth * 0.5), P(-w / 2 + depth * 0.6, h / 2 + depth * 0.5), P(-w / 2, h / 2)];
  const face = [P(-w / 2 + depth * 0.6, -h / 2 + depth * 0.5), P(w / 2 + depth * 0.6, -h / 2 + depth * 0.5), P(w / 2 + depth * 0.6, h / 2 + depth * 0.5), P(-w / 2 + depth * 0.6, h / 2 + depth * 0.5)];
  // page edges show on the right and bottom edges of the face
  const pages = [P(w / 2 + depth * 0.6 - 3, -h / 2 + depth * 0.5 + 3), P(w / 2 + depth * 0.6 + 2, -h / 2 + depth * 0.5 + 5), P(w / 2 + depth * 0.6 + 2, h / 2 + depth * 0.5 + 1), P(w / 2 + depth * 0.6 - 3, h / 2 + depth * 0.5 - 1)];
  paperObj(ctx, pages, { angle: a + Math.PI / 2, gap: 1.6, lo: 0.0, cross: false, line: 1.2, seed: seed + 1 });
  if (dark) {
    inkObj(ctx, face, { angle: a + 0.8, gap: 3.0, lo: 0.3, seed: seed + 2 });
    inkObj(ctx, front, { angle: a + 1.4, gap: 2.6, lo: 0.5, seed: seed + 3, rim: false });
  } else {
    paperObj(ctx, face, { angle: a + 0.8, seed: seed + 2 });
    paperObj(ctx, front, { angle: a + 1.4, lo: 0.1, seed: seed + 3 });
  }
  if (bands) {
    ctx.fillStyle = dark ? PAPER : INK; ctx.beginPath();
    for (const s of [0.18, 0.82]) {
      const a0 = mix(front[0], front[3], s), a1 = mix(front[1], front[2], s);
      ribbonPath(ctx, [a0, a1], () => LW(1.6, 0.9));
    }
    // a blind-tooled frame on the cover
    const inset = (p, q, r, k) => mix(mix(p, q, k), mix(r, q, k), 0.5);
    const f = face.map((p) => mix(p, mix(face[0], face[2], 0.5), 0.18));
    for (let i = 0; i < 4; i++) ribbonPath(ctx, [f[i], f[(i + 1) % 4]], () => LW(0.7, 0.5));
    ctx.fill();
  }
  return { face, top, front };
}

// a loose page with ruled lines of script
function page(ctx, pts, { lineGap = 9, seed = 1, written = true, angle = 0, hatch = 0.45, ruled = null } = {}) {
  paperObj(ctx, pts, { angle: angle + 0.9, gap: 3.0, lo: hatch, cross: false, line: 1.8, seed });
  if (!written) return;
  const bb = bbox(pts);
  ctx.save(); ctx.beginPath(); polyPath(ctx, pts); ctx.clip();
  ctx.fillStyle = INKC; ctx.beginPath();
  const ca = Math.cos(angle), sa = Math.sin(angle);
  let i = 0;
  for (let y = bb.y0 + lineGap; y < bb.y1 - lineGap * 0.5; y += lineGap, i++) {
    let x = bb.x0 + 10;
    while (x < bb.x1 - 12) {
      const L = 6 + hashNoise(seed, i * 37 + Math.floor(x)) * 16;
      const xe = Math.min(bb.x1 - 10, x + L);
      const pts2 = [];
      for (let k = 0; k <= 6; k++) { const xx = x + (xe - x) * (k / 6); pts2.push([xx, y + Math.sin(xx * 0.9 + i) * 0.9]); }
      const r = pts2.map(([px, py]) => { const dx = px - bb.cx, dy = py - bb.cy; return [bb.cx + dx * ca - dy * sa, bb.cy + dx * sa + dy * ca]; });
      penPath(ctx, r, LW(1.0, 0.6), 0.1, 0.2);
      x = xe + 4;
    }
  }
  ctx.fill();
  ctx.restore();
}

function chainRun(ctx, a, b, r, seed = 1) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(L / (r * 2.1)));
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const p = mix(a, b, (i + 0.5) / n);
    if (i % 2) {
      const bar = rectPts(p[0], p[1], r * 2.4, r * 0.75, ang);
      paperObj(ctx, bar, { angle: ang, gap: 1.6, lo: 0.2, cross: false, line: 1.2, seed: seed + i });
    } else {
      const outer = ellPts(p[0], p[1], r * 1.45, r, ang, 18);
      paperObj(ctx, outer, { angle: ang + 1.2, gap: 1.6, lo: 0.25, cross: false, line: 1.6, seed: seed + i });
      ctx.fillStyle = INKC; ctx.beginPath(); ctx.ellipse(p[0], p[1], r * 0.8, r * 0.38, ang, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function hourglass(ctx, c, h, { sand = 0.6, seed = 1, w = null } = {}) {
  const W = w || h * 0.5;
  const top = c[1] - h / 2, bot = c[1] + h / 2;
  // frame: two plates and three turned posts
  const plateT = rectPts(c[0], top - 3, W + 16, 7, 0), plateB = rectPts(c[0], bot + 3, W + 16, 7, 0);
  inkObj(ctx, plateT, { angle: 0.1, gap: 2.0, lo: 0.4, seed });
  inkObj(ctx, plateB, { angle: 0.1, gap: 2.0, lo: 0.4, seed: seed + 1 });
  // glass
  const g = spline([[c[0] - W / 2, top + 2], [c[0] + W / 2, top + 2], [c[0] + W * 0.42, c[1] - h * 0.18], [c[0] + 2.5, c[1]], [c[0] + W * 0.42, c[1] + h * 0.18], [c[0] + W / 2, bot - 2], [c[0] - W / 2, bot - 2], [c[0] - W * 0.42, c[1] + h * 0.18], [c[0] - 2.5, c[1]], [c[0] - W * 0.42, c[1] - h * 0.18]], 4, true);
  poly(ctx, g, PAPER);
  // sand: a cone below, a dished level above, the falling thread
  const sb = bot - 2 - (h / 2 - 4) * sand;
  const pile = [[c[0] - W * 0.47, bot - 2], [c[0] + W * 0.47, bot - 2], [c[0] + W * 0.3, sb + 4], [c[0], sb - 2], [c[0] - W * 0.3, sb + 4]];
  const st = c[1] - 4 - (h / 2 - 8) * (1 - sand);
  const upper = spline([[c[0] - W * 0.4, st], [c[0], st + 3], [c[0] + W * 0.4, st], [c[0] + W * 0.36, c[1] - h * 0.16], [c[0] + 2, c[1] - 1], [c[0] - 2, c[1] - 1], [c[0] - W * 0.36, c[1] - h * 0.16]], 3, true);
  ctx.save(); ctx.beginPath(); polyPath(ctx, g); ctx.clip();
  for (const sp of [pile, upper]) { poly(ctx, sp, PAPER); stipple(ctx, sp, { r: LW(0.55, 0.45), gap: LW(1.8, 1.4), mode: 'shadow', lo: 0.0, seed: seed + 5 }); }
  ctx.restore();
  ctx.fillStyle = INKC; ctx.beginPath(); ribbonPath(ctx, [[c[0], c[1]], [c[0], sb - 2]], () => LW(0.7, 0.6)); ctx.fill();
  hatchIn(ctx, g, { mode: 'shadow', color: INKC, angle: 1.5, gap: LW(2.6, 2), w: LW(0.8, 0.6), lo: 0.55, seed: seed + 9 });
  // glints
  pen(ctx, [[c[0] - W * 0.3, top + 8], [c[0] - W * 0.36, c[1] - h * 0.2]], 1.6, PAPER);
  contour(ctx, g, { min: LW(0.5, 0.45), max: LW(1.8, 1.1) });
  // posts
  for (const x of [c[0] - W / 2 - 5, c[0] + W / 2 + 5]) {
    const post = ribbonPts([[x, top], [x, c[1] - h * 0.25], [x, c[1]], [x, c[1] + h * 0.25], [x, bot]], (t) => LW(3.2, 1.6) + 2.2 * Math.abs(Math.sin(t * Math.PI * 4)));
    inkObj(ctx, post, { angle: 0.1, gap: 1.6, lo: 0.35, seed: seed + 11 + x, rim: true });
  }
}
function ribbonPts(pts, wf) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const w = wf(i / (n - 1), i) * 0.5, p = pts[i];
    L.push([p[0] - dy * w, p[1] + dx * w]); R.push([p[0] + dy * w, p[1] - dx * w]);
  }
  return L.concat(R.reverse());
}

// a quill pen: shaft + vane
function quillPen(ctx, base, tip, w, { seed = 1, nib: withNib = true } = {}) {
  const d = [tip[0] - base[0], tip[1] - base[1]], L = Math.hypot(d[0], d[1]), u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
  // vane from 25% to 100% toward the tail (base is the nib end)
  const vane = [];
  const N = 14;
  for (let i = 0; i <= N; i++) { const s = 0.22 + 0.78 * (i / N); const half = w * Math.sin(Math.PI * Math.min(1, (s - 0.22) / 0.78 * 1.05)) * (0.8 + 0.2 * Math.sin(i)); vane.push(add(add(base, u, L * s), n, half)); }
  for (let i = N; i >= 0; i--) { const s = 0.22 + 0.78 * (i / N); const half = w * 0.7 * Math.sin(Math.PI * Math.min(1, (s - 0.22) / 0.78 * 1.05)); vane.push(add(add(base, u, L * s), n, -half)); }
  inkObj(ctx, vane, { angle: Math.atan2(u[1], u[0]) + 0.9, gap: 2.2, lo: 0.2, seed });
  // barbs carved
  ctx.fillStyle = PAPER; ctx.beginPath();
  for (let i = 1; i < 16; i++) { const s = 0.26 + i * 0.045; const p = add(base, u, L * s); const hw = w * 0.8 * Math.sin(Math.PI * (s - 0.22) / 0.78); penPath(ctx, [p, add(add(p, n, hw * 0.9), u, hw * 0.5)], LW(0.8, 0.55), 0.2, 0.5); }
  ctx.fill();
  // shaft
  ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [add(base, u, L * 0.08), add(base, u, L * 0.98)], (t) => LW(2.4 * (1 - t * 0.7), 0.8)); ctx.fill();
  if (!withNib) return;
  const nib = [add(base, n, 0), add(add(base, u, L * 0.12), n, 3.2), add(add(base, u, L * 0.12), n, -3.2)];
  paperObj(ctx, nib, { angle: 0.3, gap: 1.6, lo: 0.3, cross: false, line: 1.4, seed: seed + 3 });
  lines(ctx, [[add(base, u, 1.5), add(base, u, L * 0.1)]], 0.8);
}
// the splintered end of a snapped shaft at `at`, the shaft running toward `to`
function splinters(ctx, at, to) {
  const d = [to[0] - at[0], to[1] - at[1]], L = Math.hypot(d[0], d[1]), u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
  const sp = [];
  for (let i = 0; i < 5; i++) sp.push([add(add(at, n, (i - 2) * 1.3), u, 4), add(add(at, n, (i - 2) * 2.2 + (hashNoise(131, i) - 0.5) * 3), u, -6 - hashNoise(132, i) * 9)]);
  ctx.fillStyle = PAPER; ctx.beginPath(); for (const [a, b] of sp) spikePath(ctx, a, b, LW(2.6, 1), 0.6); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); for (const [a, b] of sp) penPath(ctx, [a, b], LW(0.7, 0.45), 0.1, 0.5); ctx.fill();
}
// the front half of a snapped quill: the nib and a hand's length of shaft
function nibHalf(ctx, nibTip, end) {
  const d = [end[0] - nibTip[0], end[1] - nibTip[1]], L = Math.hypot(d[0], d[1]), u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
  const shaft = ribbonPts([add(nibTip, u, L * 0.2), end], (t) => 6.5 - t * 1.2);
  paperObj(ctx, shaft, { angle: Math.atan2(u[1], u[0]) + 1.4, gap: 2.0, lo: 0.4, cross: false, line: 1.8, seed: 133 });
  const nib = spline([nibTip, add(add(nibTip, u, L * 0.12), n, 3.6), add(add(nibTip, u, L * 0.24), n, 3.6), add(add(nibTip, u, L * 0.24), n, -3.6), add(add(nibTip, u, L * 0.12), n, -3.6)], 3, true);
  inkObj(ctx, nib, { angle: 0.5, gap: 1.8, lo: 0.35, seed: 134 });
  ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [add(nibTip, u, 3), add(nibTip, u, L * 0.18)], () => LW(0.9, 0.5)); ctx.fill();
  splinters(ctx, end, nibTip);
}

function spatter(ctx, c, r, n, seed, color = INK) {
  blot(ctx, c[0], c[1], r, seed, color);
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = hashNoise(seed, i) * Math.PI * 2, d = r * (1.2 + hashNoise(seed + 1, i) * 1.8), rr = Math.max(LW(0.9, 0.6), r * 0.12 * (1 - d / (r * 3.2)) + hashNoise(seed + 2, i) * 1.4);
    const p = [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d * 0.8];
    ctx.moveTo(p[0] + rr, p[1]); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2);
    if (hashNoise(seed + 3, i) < 0.4) ribbonPath(ctx, [[c[0] + Math.cos(a) * r * 0.8, c[1] + Math.sin(a) * r * 0.65], p], (t) => rr * 0.9 * t);
  }
  ctx.fill();
}

// a rope along a path: paper, twisted, with a contour (fake over/under by draw order)
function rope(ctx, pts, w, seed = 1) {
  const body = ribbonPts(pts, () => w);
  poly(ctx, body, PAPER);
  ctx.save(); ctx.beginPath(); polyPath(ctx, body); ctx.clip();
  ctx.fillStyle = INKC; ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p = pts[i], q = pts[i + 1];
    const d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(d[0], d[1]) || 1, u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
    const steps = Math.max(1, Math.round(L / (w * 0.55)));
    for (let k = 0; k < steps; k++) {
      const c = mix(p, q, k / steps);
      penPath(ctx, [add(add(c, n, -w * 0.55), u, -w * 0.3), add(add(c, n, w * 0.55), u, w * 0.3)], LW(0.8, 0.55), 0.3, 0.3);
    }
  }
  ctx.fill();
  hatchIn(ctx, body, { mode: 'shadow', color: INKC, angle: 0.4, gap: LW(2.0, 1.6), w: LW(1.0, 0.7), lo: 0.3, seed });
  ctx.restore();
  ctx.fillStyle = INKC; ctx.beginPath();
  const n2 = body.length / 2;
  penPath(ctx, body.slice(0, n2), LW(1.6, 0.9), 0.05, 0.05);
  penPath(ctx, body.slice(n2), LW(1.6, 0.9), 0.05, 0.05);
  ctx.fill();
}

// ---- the plates ---------------------------------------------------------------------------
const CLASS_WEAPON = { duelist: 'sabre', warden: 'quill', thief: 'knives', hexer: 'censer', archivist: 'pole', penitent: 'maul' };

const PLATES = {
  cls(ctx, id, A) {
    plate(ctx, 11);
    groundShadow(ctx, 0, 76, 40, 6);
    const k = id === 'thief' ? 1.85 : id === 'hexer' ? 1.42 : id === 'penitent' ? 1.6 : 1.55;
    const pose = id === 'thief' ? 'ready' : 'idle';
    drawFighterFigure(ctx, { loadout: { cls: id, weapon: CLASS_WEAPON[id], charm: null }, x: id === 'archivist' ? -18 : id === 'penitent' ? -16 : -6, y: 76, scale: k, facing: 1, pose, t: 1600, accent: A, ground: false });
  },

  weapon(ctx, id, A) {
    plate(ctx, 21);
    const S = { ...S0(), accent: A };
    ctx.save();
    switch (id) {
      case 'sabre': {
        groundShadow(ctx, 0, 72, 50, 5);
        ctx.translate(-50, 52); ctx.scale(2.45, 2.45); S.D = D / 2.45;
        drawWeapon(ctx, 'sabre', [0, 0], 2.42, S, { noBinding: true });
        break;
      }
      case 'maul': {
        groundShadow(ctx, 10, 74, 56, 6);
        ctx.translate(-56, 58); ctx.scale(2.0, 2.0); S.D = D / 2.0;
        drawWeapon(ctx, 'maul', [0, 0], 2.36, S, { noBinding: true });
        break;
      }
      case 'knives': {
        groundShadow(ctx, 0, 72, 46, 5);
        ctx.scale(3.4, 3.4); S.D = D / 3.4;
        drawWeapon(ctx, 'knife', [-10, 9], 2.42, S, { noBinding: true });
        drawWeapon(ctx, 'knife', [10, 9], 3.86, S, { noBinding: true });
        break;
      }
      case 'pole': {
        groundShadow(ctx, 0, 74, 60, 5);
        ctx.translate(-30, 30); ctx.scale(1.38, 1.38); S.D = D / 1.38;
        drawWeapon(ctx, 'pole', [0, 0], 2.36, S, { noBinding: true, sway: 0.05 });
        break;
      }
      case 'censer': {
        groundShadow(ctx, 0, 76, 34, 5);
        ctx.translate(-4, -72); ctx.scale(2.9, 2.9); S.D = D / 2.9;
        // the hand's ring at the top of the chain
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.arc(0, 0, 1.8, 0, Math.PI * 2, true); ctx.fill();
        drawWeapon(ctx, 'censer', [0, 2], 0.08, S, { noBinding: true, drift: 1, chain: 34 });
        break;
      }
      case 'quill': {
        groundShadow(ctx, 0, 74, 50, 5);
        ctx.translate(-14, 18); ctx.scale(1.95, 1.95); S.D = D / 1.95;
        drawWeapon(ctx, 'quill', [0, 0], 2.36, S, { noBinding: true });
        break;
      }
    }
    ctx.restore();
  },

  spell(ctx, id, A) {
    plate(ctx, 31);
    const S = { ...S0(), accent: A };
    switch (id) {
      case 'candle': {
        groundShadow(ctx, 0, 72, 44, 6);
        // dish
        const dish = spline([[-40, 62], [40, 62], [34, 70], [-34, 70]], 3, true);
        inkObj(ctx, dish, { angle: 0.1, gap: 2.4, lo: 0.3 });
        const ring = ellPts(36, 60, 7, 6, 0, 16);
        inkObj(ctx, ring, { gap: 2, lo: 0.4, rim: false });
        ctx.fillStyle = PAPER; ctx.beginPath(); ctx.ellipse(36, 60, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
        // candle: a wax column with runs
        const wax = spline([[-14, 62], [-14, -8], [-10, -12], [-3, -10], [4, -14], [10, -12], [14, -8], [14, 62]], 4, true);
        paperObj(ctx, wax, { angle: 1.55, gap: 2.8, lo: 0.4, seed: 33 });
        for (const [x, L] of [[-9, 24], [6, 36], [12, 14]]) {
          const run = spline([[x - 2.5, -10], [x - 2.8, -10 + L * 0.6], [x - 1.8, -10 + L], [x + 1.5, -10 + L + 1], [x + 2.4, -10 + L * 0.5], [x + 2.5, -11]], 3, true);
          paperObj(ctx, run, { angle: 1.55, gap: 2.2, lo: 0.55, cross: false, line: 1.3, seed: 34 + x });
        }
        lines(ctx, [[[0, -12], [1, -22]]], 1.6);
        // the flame, and engraved light around it
        ctx.save(); ctx.translate(1, -24); ctx.scale(3.4, 3.4);
        flame(ctx, [0, 0], 1.6, { ...S, D: D / 3.4 }, A);
        ctx.restore();
        ctx.fillStyle = INK; ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const a = -Math.PI / 2 + (i - 6.5) * 0.2;
          const r0 = 40 + hashNoise(35, i) * 4, r1 = r0 + 10 + hashNoise(36, i) * 14;
          ribbonPath(ctx, [[1 + Math.cos(a) * r0, -40 + Math.sin(a) * r0], [1 + Math.cos(a) * r1, -40 + Math.sin(a) * r1]], (t) => LW(1.2, 0.7) * (1 - t));
        }
        ctx.fill();
        break;
      }
      case 'blot': {
        // a page in perspective, an ink blot spreading into a ward
        const pg = [[-70, 30], [58, 14], [76, 62], [-56, 80]];
        groundShadow(ctx, 6, 76, 70, 6);
        page(ctx, pg, { lineGap: 7, seed: 37, angle: -0.12, hatch: 0.5 });
        // the blot rises up off the page like a shield
        const sh = spline([[-34, 46], [-40, -10], [-28, -52], [0, -66], [28, -52], [40, -10], [34, 46], [0, 54]], 4, true);
        const jag = sh.map((p, i) => add(p, [Math.cos(i) * 2.5 * hashNoise(39, i), Math.sin(i * 1.7) * 2.5 * hashNoise(40, i)]));
        inkObj(ctx, jag, { angle: 0.9, gap: 3.0, lo: 0.25, seed: 41, bend: 6 });
        // wet highlights
        pen(ctx, quad([-22, -36], [-10, -54], [12, -54]), 3.0, PAPER, 0.2, 0.4);
        pen(ctx, quad([-28, -8], [-30, 14], [-24, 30]), 2.0, PAPER, 0.2, 0.4);
        spatter(ctx, [44, 52], 6, 9, 43);
        spatter(ctx, [-50, 58], 4, 6, 44);
        // runs down the page
        ctx.fillStyle = INK; ctx.beginPath();
        for (const x of [-18, 6, 22]) { ribbonPath(ctx, [[x, 48], [x + 1, 60 + hashNoise(45, x + 30) * 8]], (t) => LW(3.4, 1.2) * (1 - t * 0.4)); ctx.moveTo(x + 3, 62 + hashNoise(45, x + 30) * 8); ctx.arc(x + 1, 62 + hashNoise(45, x + 30) * 8, 2.6, 0, Math.PI * 2); }
        ctx.fill();
        break;
      }
      case 'margin': {
        // a tall page torn down its margin rule, and a petitioner stepping through the tear
        groundShadow(ctx, 0, 76, 60, 6);
        const tear = (x0, dir) => {
          const pts = [];
          for (let i = 0; i <= 14; i++) { const y = -70 + i * 10; pts.push([x0 + dir * (hashNoise(47, i) * 5), y]); }
          return pts;
        };
        const left = [[-64, -70]].concat(tear(-12, -1)).concat([[-64, 70]]);
        const rtear = tear(14, 1);
        const right = rtear.concat([[62, 70], [62, -70]]);
        page(ctx, left, { lineGap: 9, seed: 48, hatch: 0.55 });
        page(ctx, right, { lineGap: 9, seed: 49, hatch: 0.4 });
        // the margin rule in the accent
        ctx.fillStyle = A; ctx.beginPath(); ribbonPath(ctx, [[-20, -66], [-20, 66]], () => LW(2.2, 1)); ctx.fill();
        // the dark between the pages
        const gapP = tear(-12, -1).concat(rtear.slice().reverse());
        hatchIn(ctx, gapP, { mode: 'shadow', color: INK, angle: 0.3, gap: LW(2.2, 1.6), w: LW(1.0, 0.7), lo: 0, flat: 0.8, seed: 50 });
        drawFighterFigure(ctx, { loadout: { cls: 'duelist', weapon: 'sabre', charm: null }, x: 6, y: 72, scale: 1.45, facing: 1, pose: 'ready', t: 1600, accent: A, ground: false });
        break;
      }
      case 'knot': {
        groundShadow(ctx, 0, 76, 50, 6);
        const N = 220, pts = [];
        for (let i = 0; i <= N; i++) {
          const t = (i / N) * Math.PI * 2 + 0.6;
          pts.push([(Math.sin(t) + 2 * Math.sin(2 * t)) * 20, (Math.cos(t) - 2 * Math.cos(2 * t)) * 20 - 6]);
        }
        // cut the loop open into two tails
        const cut = 0, tails = [[pts[N - 4][0] - 30, pts[N - 4][1] + 40], [pts[4][0] + 34, pts[4][1] + 44]];
        const path = [tails[1]].concat(pts.slice(6, N - 6)).concat([tails[0]]);
        // find crossings
        const sm = path.filter((_, i) => i % 2 === 0);
        const cross = [];
        for (let i = 0; i < sm.length; i++) for (let j = i + 12; j < sm.length; j++) {
          if (Math.hypot(sm[i][0] - sm[j][0], sm[i][1] - sm[j][1]) < 3.5) { if (!cross.some(([a, b]) => Math.abs(a - i) < 8 && Math.abs(b - j) < 8)) cross.push([i, j]); }
        }
        const W = 14;
        rope(ctx, sm, W, 51);
        // alternate over/under along the rope
        const events = [];
        cross.forEach(([i, j], k) => { events.push([i, k]); events.push([j, k]); });
        events.sort((a, b) => a[0] - b[0]);
        const over = new Set();
        const seen = {};
        events.forEach(([idx, k], e) => { if (e % 2 === 0) over.add(idx); });
        for (const idx of over) rope(ctx, sm.slice(Math.max(0, idx - 6), Math.min(sm.length, idx + 7)), W, 52 + idx);
        // frayed ends
        for (const e of [sm[0], sm[sm.length - 1]]) {
          ctx.fillStyle = INK; ctx.beginPath();
          for (let i = 0; i < 5; i++) spikePath(ctx, e, add(e, [Math.cos(i * 1.2) * 8, 6 + Math.sin(i * 1.7) * 4]), LW(1.6, 0.6), 0.5);
          ctx.fill();
        }
        break;
      }
      case 'mend': {
        // a torn page closed with stitches, the needle drawing the thread on
        groundShadow(ctx, 0, 76, 64, 6);
        const pg = [[-66, -50], [60, -64], [70, 54], [-58, 68]];
        page(ctx, pg, { lineGap: 8, seed: 55, angle: -0.1, hatch: 0.5 });
        // the tear: a jagged dark line
        const tr = [];
        for (let i = 0; i <= 10; i++) tr.push([-52 + i * 11, -10 + Math.sin(i * 1.9) * 6 + (hashNoise(56, i) - 0.5) * 6]);
        ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, tr, (t) => LW(3.6, 1.3) * Math.sin(Math.PI * t) + LW(0.6, 0.4)); ctx.fill();
        // cross stitches in the accent thread
        ctx.fillStyle = A; ctx.beginPath();
        for (let i = 1; i < 8; i++) {
          const c = tr[i];
          ribbonPath(ctx, [add(c, [-4, -7]), add(c, [4, 7])], () => LW(2.4, 1.0));
          ribbonPath(ctx, [add(c, [-4, 7]), add(c, [4, -7])], () => LW(2.4, 1.0));
        }
        ctx.fill();
        // thread from the last stitch up to the needle in an arc
        const nd = [40, -54];
        ctx.fillStyle = A; ctx.beginPath(); ribbonPath(ctx, quad(tr[7], [56, -2], nd, 12), () => LW(1.8, 0.9)); ctx.fill();
        // the needle
        const nb = [70, -84];
        const needle = ribbonPts([nd, mix(nd, nb, 0.5), nb], (t) => LW(4.2 - t * 3.6, 0.8));
        paperObj(ctx, needle, { angle: 0.4, gap: 1.4, lo: 0.3, cross: false, line: 1.5 });
        ctx.fillStyle = INK; ctx.beginPath(); const eye = mix(nd, nb, 0.12); ctx.ellipse(eye[0], eye[1], 1.0, 2.2, -0.75, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'echo': {
        // a blade and its echo a beat behind: the echo is cut in outline only
        groundShadow(ctx, 0, 72, 52, 5);
        const SS = { ...S, D: D / 2.2 };
        ctx.save(); ctx.translate(-40, 56); ctx.scale(2.2, 2.2);
        // the echo: the blade's outline, hatched, turned back along the swing
        const ga = 2.95, gd = [Math.sin(ga), Math.cos(ga)], gn = [-gd[1], gd[0]];
        const h0 = [0, 0], b0 = add(h0, gd, 6), tip = add(h0, gd, 60);
        const blade = [add(b0, gn, 2.6), add(add(tip, gd, -8), gn, 2.0), tip, add(add(tip, gd, -8), gn, -2.0), add(b0, gn, -2.6)];
        poly(ctx, blade, PAPER);
        hatchIn(ctx, blade, { mode: 'shadow', color: INK, angle: ga + 0.9, gap: 1.3 * SS.D * 2, w: 0.55 * SS.D * 2, lo: 0.0, flat: 0.6, seed: 57 });
        contour(ctx, blade, { min: 0.3, max: 0.8, breaks: true, seed: 58 });
        ctx.fillStyle = INK; ctx.beginPath();
        ribbonPath(ctx, [add(b0, gn, 6), add(b0, gn, -6)], () => 1.1);
        ribbonPath(ctx, [b0, add(h0, gd, -6)], () => 1.0);
        ctx.fill();
        drawWeapon(ctx, 'sabre', [0, 0], 2.36, SS, { noBinding: true });
        ctx.restore();
        // ruled arcs swept from the echo to the blade
        ctx.fillStyle = INK; ctx.beginPath();
        for (let l = 0; l < 6; l++) {
          const r = 96 + l * 7;
          const pts = [];
          for (let i = 0; i <= 12; i++) { const a = lerpA(-1.95 + 0.08 * l, -0.85, i / 12); pts.push([-40 + Math.cos(a) * r, 56 + Math.sin(a) * r]); }
          ribbonPath(ctx, pts, (t) => LW(1.7, 0.8) * Math.pow(t, 1.3) * (0.6 + 0.4 * hashNoise(59, l)));
        }
        ctx.fill();
        break;
      }
    }
  },

  charm(ctx, id, A) {
    plate(ctx, 41);
    const S = { ...S0(), accent: A };
    switch (id) {
      case 'seal': {
        groundShadow(ctx, 0, 74, 60, 6);
        // a folded letter, and the seal on its flap with two ribbon tails
        const letter = [[-70, -30], [66, -46], [74, 52], [-62, 66]];
        paperObj(ctx, letter, { angle: 0.9, gap: 3.2, lo: 0.5, seed: 61 });
        lines(ctx, [[[-68, -28], [2, 14], [72, -44]]], 1.4);
        const tails = [spline([[2, 18], [-10, 40], [-24, 72]], 4), spline([[6, 18], [20, 44], [16, 76]], 4)];
        for (const tl of tails) { const r = ribbonPts(tl, (t) => 10 - t * 2); paperObj(ctx, r, { angle: 1.4, gap: 2.0, lo: 0.3, seed: 62, cross: false, line: 1.6 }); }
        const wax = spline(Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; const r = 32 + (hashNoise(63, i) - 0.5) * 7; return [4 + Math.cos(a) * r, 10 + Math.sin(a) * r * 0.92]; }), 3, true);
        paperObj(ctx, wax, { fill: A, angle: 0.8, gap: 2.6, lo: 0.45, seed: 64, line: 2.4 });
        const inner = ellPts(4, 10, 21, 19.5, 0, 28);
        contour(ctx, inner, { min: LW(0.6, 0.5), max: LW(2.2, 1.0), light: [-LIGHT[0], -LIGHT[1]] });
        // impressed device: a nib
        ctx.save(); ctx.translate(4, 10); ctx.scale(0.24, 0.24);
        ctx.fillStyle = INK; ctx.beginPath();
        ctx.moveTo(0, 64); ctx.bezierCurveTo(-8, 40, -30, 14, -27, -20); ctx.lineTo(-19, -38); ctx.lineTo(-19, -62); ctx.lineTo(19, -62); ctx.lineTo(19, -38); ctx.lineTo(27, -20); ctx.bezierCurveTo(30, 14, 8, 40, 0, 64); ctx.closePath(); ctx.fill();
        ctx.fillStyle = A; ctx.beginPath(); ctx.arc(0, -11, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-2, -4, 4, 60);
        ctx.restore();
        pen(ctx, quad([-18, -6], [-8, -18], [8, -20]), 2.2, PAPER, 0.2, 0.4);
        break;
      }
      case 'bookmark': {
        groundShadow(ctx, 0, 74, 66, 6);
        book(ctx, [-14, 36], 124, 40, -0.08, { depth: 34, seed: 65 });
        // the iron strip standing out of the pages, pierced, with a tassel
        const strip = [[2, 22], [20, 22], [22, -64], [11, -76], [0, -64]];
        paperObj(ctx, strip, { angle: 0.2, gap: 2.0, lo: 0.25, seed: 66, line: 2.4, fill: '#d9d2bd' });
        ctx.fillStyle = INK; ctx.beginPath();
        for (let i = 0; i < 5; i++) { const y = -52 + i * 14; ctx.moveTo(11 + 3.4, y); ctx.ellipse(11, y, 3.4, 4.4, 0, 0, Math.PI * 2); }
        ctx.fill();
        ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [[18, -60], [19, 16]], () => LW(1.3, 0.6)); ctx.fill();
        // tassel cord and tassel
        const tc = [11, -76];
        ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, quad(tc, [28, -86], [42, -66], 8), () => LW(2.2, 0.9)); ctx.fill();
        const tas = spline([[38, -66], [46, -66], [50, -38], [34, -38]], 3, true);
        inkObj(ctx, tas, { angle: 1.5, gap: 1.8, lo: 0.3, seed: 67 });
        ctx.fillStyle = A; ctx.beginPath(); ribbonPath(ctx, [[37, -63], [47, -63]], () => LW(3, 1)); ctx.fill();
        break;
      }
      case 'ribbon': {
        groundShadow(ctx, 0, 74, 50, 6);
        // a bow of silk with two long tails
        const loopL = spline([[0, -6], [-26, -40], [-56, -36], [-52, -6], [-26, 4]], 4, true);
        const loopR = spline([[0, -6], [24, -44], [54, -40], [54, -10], [26, 2]], 4, true);
        const tailL = ribbonPts(spline([[-4, 2], [-18, 30], [-34, 56], [-44, 74]], 4), (t) => 16 - t * 6);
        const tailR = ribbonPts(spline([[4, 2], [16, 26], [26, 52], [44, 70]], 4), (t) => 16 - t * 6);
        for (const [p, s, a] of [[tailL, 71, 1.0], [tailR, 72, 0.6], [loopL, 73, 0.4], [loopR, 74, 2.4]]) paperObj(ctx, p, { angle: a, gap: 2.6, lo: 0.35, seed: s, line: 2.0 });
        // the inside of the loops in shadow
        for (const [c, rx, ry, s] of [[[-34, -22], 12, 7, 75], [[34, -24], 12, 7, 76]]) {
          const e = ellPts(c[0], c[1], rx, ry, -0.3, 18);
          hatchIn(ctx, e, { mode: 'shadow', color: INK, angle: 0.4, gap: LW(2.0, 1.5), w: LW(1.0, 0.7), lo: 0, flat: 0.8, seed: s });
        }
        // V-cut ends
        ctx.fillStyle = PAPER; ctx.beginPath(); polyPath(ctx, [[-50, 72], [-40, 68], [-44, 80]]); polyPath(ctx, [[38, 72], [48, 64], [52, 78]]); ctx.fill();
        const knot = spline([[-10, -14], [10, -14], [12, 6], [-10, 6]], 3, true);
        paperObj(ctx, knot, { angle: 0.8, gap: 2.0, lo: 0.2, seed: 77, line: 2.2 });
        break;
      }
      case 'ember': {
        groundShadow(ctx, 0, 70, 48, 7);
        // a ring standing on its edge, a red coal set in the bezel
        const outer = ellPts(0, 26, 46, 42, 0, 40), inner = ellPts(0, 28, 33, 30, 0, 40);
        const band = outer.concat(inner.slice().reverse());
        ctx.save();
        ctx.beginPath(); polyPath(ctx, outer); polyPath(ctx, inner.slice().reverse()); ctx.fill('evenodd');
        ctx.restore();
        ctx.fillStyle = PAPER; ctx.beginPath(); polyPath(ctx, outer); polyPath(ctx, inner.slice().reverse()); ctx.fill('evenodd');
        ctx.save(); ctx.beginPath(); polyPath(ctx, outer); polyPath(ctx, inner.slice().reverse()); ctx.clip('evenodd');
        hatchIn(ctx, outer, { mode: 'shadow', color: INK, angle: 1.3, gap: LW(2.2, 1.7), w: LW(1.0, 0.7), lo: 0.3, seed: 78, clip: false });
        hatchIn(ctx, outer, { mode: 'shadow', color: INK, angle: 0.1, gap: LW(2.6, 1.9), w: LW(0.9, 0.6), lo: 0.6, seed: 79, clip: false });
        ctx.restore();
        contour(ctx, outer, { min: LW(0.6, 0.5), max: LW(2.4, 1.2) });
        contour(ctx, inner, { min: LW(0.6, 0.5), max: LW(1.8, 1.0), light: [-LIGHT[0], -LIGHT[1]] });
        // bezel claws and the stone
        const bz = spline([[-20, -14], [20, -14], [16, -26], [-16, -26]], 3, true);
        paperObj(ctx, bz, { angle: 0.3, gap: 1.8, lo: 0.3, seed: 80, line: 2 });
        const stone = spline(Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; const r = 15 + (hashNoise(81, i) - 0.5) * 4; return [Math.cos(a) * r, -40 + Math.sin(a) * r * 0.85]; }), 3, true);
        paperObj(ctx, stone, { fill: A, angle: 0.7, gap: 2.0, lo: 0.4, seed: 82, line: 2.2 });
        // cracks in the coal, pale where it burns
        lines(ctx, [[[-8, -44], [-2, -38], [-4, -30]], [[2, -48], [6, -40], [12, -38]]], 1.2, PAPER);
        // the heat, drawn as short wavering rules
        ctx.fillStyle = INK; ctx.beginPath();
        for (let i = 0; i < 5; i++) { const x = -16 + i * 8; const pts = []; for (let k = 0; k <= 6; k++) pts.push([x + Math.sin(k * 1.4 + i) * 2.2, -60 - k * 4.4]); ribbonPath(ctx, pts, (t) => LW(1.3, 0.6) * Math.sin(Math.PI * t)); }
        ctx.fill();
        break;
      }
      case 'nib': {
        groundShadow(ctx, 0, 76, 34, 6);
        // a big steel nib, point down, split by spite; a drop at the point
        const nib = spline([[0, 64], [-10, 40], [-34, 10], [-30, -26], [-22, -42], [-22, -70], [22, -70], [22, -42], [30, -26], [34, 10], [10, 40]], 4, true);
        paperObj(ctx, nib, { angle: 0.6, gap: 2.8, lo: 0.3, seed: 83, line: 2.6, fill: '#ddd6c2' });
        // the shoulder line, the breather hole, the slit, a crack across
        ctx.fillStyle = INK; ctx.beginPath();
        ribbonPath(ctx, [[-24, -40], [24, -40]], () => LW(2.0, 1));
        ribbonPath(ctx, [[-22, -56], [22, -56]], () => LW(1.2, 0.8));
        ribbonPath(ctx, [[0, -6], [0, 62]], (t) => LW(2.4, 1.0) * (1 - t * 0.5));
        ctx.moveTo(6, -12); ctx.arc(0, -12, 6, 0, Math.PI * 2);
        ctx.fill();
        lines(ctx, [[[-28, 4], [-14, 10], [-8, 2], [0, 12]]], 1.6);
        // engraved scrollwork on the shoulders
        lines(ctx, [quad([-20, -30], [-12, -36], [-6, -26], 8), quad([20, -30], [12, -36], [6, -26], 8), quad([-24, -14], [-18, -6], [-10, -14], 8)], 1.1);
        const drop = spline([[0, 66], [5, 76], [0, 82], [-5, 76]], 4, true);
        poly(ctx, drop, INK);
        pen(ctx, [[-1.5, 72], [-2.5, 77]], 1.2, PAPER);
        break;
      }
      case 'sandglass': {
        groundShadow(ctx, 0, 76, 46, 6);
        hourglass(ctx, [0, -2], 136, { sand: 0.62, seed: 85, w: 64 });
        break;
      }
      case 'lens': {
        groundShadow(ctx, 0, 76, 64, 6);
        const pg = [[-72, -10], [44, -30], [62, 66], [-56, 78]];
        page(ctx, pg, { lineGap: 7, seed: 87, angle: -0.17, hatch: 0.55 });
        // handle
        const hd = ribbonPts([[38, 24], [58, 50], [76, 74]], (t) => 12 - t * 3);
        inkObj(ctx, hd, { angle: 0.8, gap: 2.0, lo: 0.25, seed: 88 });
        ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, [[52, 42], [58, 48]], () => LW(2.5, 1)); ctx.fill();
        // the rim and the glass, with the lines beneath swollen in it
        const rim = ellPts(0, -6, 48, 46, 0, 40), glass = ellPts(0, -6, 40, 38, 0, 40);
        inkObj(ctx, rim, { angle: 0.4, gap: 2.0, lo: 0.3, seed: 89 });
        poly(ctx, glass, PAPER);
        ctx.save(); ctx.beginPath(); polyPath(ctx, glass); ctx.clip();
        ctx.fillStyle = INK; ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const y = -30 + i * 15;
          let x = -40;
          while (x < 40) { const L = 10 + hashNoise(90, i * 13 + Math.floor(x + 50)) * 22; const pts = []; for (let k = 0; k <= 6; k++) { const xx = x + L * k / 6; const bulge = 1 + 0.25 * Math.cos((xx / 40) * Math.PI / 2); pts.push([xx * bulge * 0.9, y + Math.sin(xx * 0.5) * 1.2 - (xx * 0.17)]); } penPath(ctx, pts, LW(2.4, 1.0), 0.1, 0.2); x += L + 6; }
        }
        ctx.fill();
        ctx.restore();
        hatchIn(ctx, glass, { mode: 'shadow', color: INK, angle: 2.4, gap: LW(2.6, 2), w: LW(0.8, 0.6), lo: 0.7, seed: 91 });
        pen(ctx, quad([-26, -30], [-18, -40], [-4, -42]), 3.6, PAPER, 0.2, 0.4);
        contour(ctx, glass, { min: LW(0.6, 0.5), max: LW(1.6, 0.8), light: [-LIGHT[0], -LIGHT[1]] });
        break;
      }
    }
  },

  temper(ctx, id, A) {
    plate(ctx, 51);
    const S = { ...S0(), accent: A };
    switch (id) {
      case 'enraged': {
        groundShadow(ctx, 0, 72, 74, 7);
        // a pool of spilt ink thrown across the ground, splashed up
        spatter(ctx, [4, 56], 30, 22, 101);
        spatter(ctx, [-52, -34], 6, 7, 102);
        spatter(ctx, [58, -40], 5, 6, 103);
        // the quill, snapped: the feathered half flung down across the pool
        quillPen(ctx, [-8, 30], [-80, -56], 17, { seed: 104, nib: false });
        splinters(ctx, [-8, 30], [-80, -56]);
        // the nib half, short, point up, its end splintered
        nibHalf(ctx, [16, 22], [62, -64]);
        // oxblood drops among the black
        ctx.fillStyle = A; ctx.beginPath();
        for (const [x, y, r] of [[40, 30, 4.4], [-34, 62, 3.6], [62, 60, 3], [-6, 8, 2.6], [26, -20, 2.2]]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
        ctx.fill();
        break;
      }
      case 'ironbound': {
        groundShadow(ctx, 0, 74, 72, 7);
        const b = book(ctx, [-8, 20], 112, 70, -0.06, { depth: 30, seed: 105 });
        // iron straps and clasps across the cover
        for (const s of [0.28, 0.72]) {
          const a0 = mix(b.front[0], b.front[3], s), a1 = mix(b.face[1], b.face[2], s);
          const strap = ribbonPts([a0, mix(a0, a1, 0.5), add(a1, [4, 0])], () => 10);
          paperObj(ctx, strap, { fill: '#d6cfba', angle: 0.2, gap: 2.0, lo: 0.25, seed: 106, line: 2.2 });
          ctx.fillStyle = INK; ctx.beginPath();
          for (let k = 0; k < 5; k++) { const p = mix(a0, a1, 0.1 + k * 0.2); ctx.moveTo(p[0] + 2, p[1]); ctx.arc(p[0], p[1], 2, 0, Math.PI * 2); }
          ctx.fill();
        }
        // a chain wrapped round, a padlock hanging
        chainRun(ctx, [-76, -24], [64, 50], 5.2, 107);
        const lk = [42, 66];
        const shackle = ribbonPts(spline([[lk[0] - 9, lk[1] - 6], [lk[0] - 9, lk[1] - 18], [lk[0], lk[1] - 24], [lk[0] + 9, lk[1] - 18], [lk[0] + 9, lk[1] - 6]], 4), () => 4);
        paperObj(ctx, shackle, { fill: '#d6cfba', angle: 0.4, gap: 1.6, lo: 0.3, cross: false, seed: 108, line: 1.8 });
        const body = spline([[lk[0] - 14, lk[1] - 6], [lk[0] + 14, lk[1] - 6], [lk[0] + 13, lk[1] + 14], [lk[0] - 13, lk[1] + 14]], 3, true);
        inkObj(ctx, body, { angle: 0.6, gap: 2.0, lo: 0.25, seed: 109 });
        ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(lk[0], lk[1] + 2, 2.6, 0, Math.PI * 2); polyPath(ctx, [[lk[0] - 1.4, lk[1] + 3], [lk[0] + 1.4, lk[1] + 3], [lk[0] + 2, lk[1] + 10], [lk[0] - 2, lk[1] + 10]]); ctx.fill();
        break;
      }
      case 'tinder': {
        groundShadow(ctx, 0, 74, 70, 6);
        // a page whose lower corner has lifted, curled and caught
        const pg = [[-72, -56], [60, -66], [68, 18], [30, 66], [-64, 70]];
        page(ctx, pg, { lineGap: 8, seed: 111, angle: -0.08, hatch: 0.45 });
        // the curl: the underside of the corner, rolled back over the page
        const curl = spline([[68, 18], [56, 30], [42, 44], [30, 66], [26, 52], [34, 36], [50, 22]], 4, true);
        paperObj(ctx, curl, { angle: 0.5, gap: 2.0, lo: 0.05, seed: 112, line: 2.2 });
        // the charred lip along the burning edge
        const ch = [];
        for (let i = 0; i <= 12; i++) { const p = mix([70, 16], [28, 68], i / 12); ch.push(add(p, [4 + hashNoise(113, i) * 4, 3 + hashNoise(114, i) * 4])); }
        const char = [[64, 10], [74, 14]].concat(ch).concat([[24, 74], [20, 66]]);
        inkObj(ctx, char, { angle: 0.8, gap: 2.4, lo: 0.4, seed: 115 });
        // tongues licking up off the char
        for (let i = 0; i < 4; i++) {
          const p = ch[1 + i * 3];
          const k = 2.7 - i * 0.25;
          ctx.save(); ctx.translate(p[0] + 2, p[1]); ctx.rotate(-0.25); ctx.scale(k, k);
          flame(ctx, [0, 0], 1.15, { ...S, t: 1300 + i * 410, D: D / k, hi: true }, A);
          ctx.restore();
        }
        ctx.save(); ctx.translate(46, -6); ctx.scale(3, 3); smoke(ctx, [0, 0], { ...S, hi: true, t: 2200 }, 1.4, -1, 1); ctx.restore();
        break;
      }
      case 'slow': {
        groundShadow(ctx, 0, 76, 56, 6);
        hourglass(ctx, [0, -6], 128, { sand: 0.12, seed: 117, w: 58 });
        // a snail on the base, its shell a spiral
        const sc = [34, 54];
        const bodyS = spline([[sc[0] - 30, 70], [sc[0] - 30, 64], [sc[0] - 10, 60], [sc[0] + 14, 62], [sc[0] + 22, 54], [sc[0] + 28, 52], [sc[0] + 30, 58], [sc[0] + 24, 70]], 4, true);
        paperObj(ctx, bodyS, { fill: BONE, angle: 0.3, gap: 2.0, lo: 0.3, seed: 118, line: 2 });
        lines(ctx, [[[sc[0] + 24, 54], [sc[0] + 26, 44]], [[sc[0] + 28, 54], [sc[0] + 33, 46]]], 1.2);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(sc[0] + 26, 43, 1.6, 0, Math.PI * 2); ctx.arc(sc[0] + 33, 45, 1.6, 0, Math.PI * 2); ctx.fill();
        const shell = ellPts(sc[0] - 4, sc[1] - 2, 17, 16, 0, 30);
        paperObj(ctx, shell, { angle: 0.6, gap: 2.2, lo: 0.3, seed: 119, line: 2.4 });
        const sp = [];
        for (let i = 0; i <= 40; i++) { const a = i * 0.32; const r = 15 * (1 - i / 46); sp.push([sc[0] - 4 + Math.cos(a) * r, sc[1] - 2 + Math.sin(a) * r * 0.95]); }
        ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, sp, (t) => LW(2.0 - t * 1.2, 0.6)); ctx.fill();
        break;
      }
      case 'restless': {
        // a desk edge, pages lifting off it in a draught
        const desk = [[-86, 52], [86, 40], [86, 54], [-86, 66]];
        inkObj(ctx, desk, { angle: 0.05, gap: 2.4, lo: 0.25, seed: 121 });
        const front = [[-86, 66], [86, 54], [86, 82], [-86, 90]];
        inkObj(ctx, front, { angle: 1.5, gap: 2.0, lo: 0.6, seed: 122, rim: false });
        const pg = (c, w, h, a, lift, seed) => {
          const pts = [];
          const n = 8;
          for (let i = 0; i <= n; i++) { const s = i / n; pts.push(add(c, rot([-w / 2 + w * s, -h / 2 - Math.sin(s * Math.PI) * lift], a))); }
          for (let i = n; i >= 0; i--) { const s = i / n; pts.push(add(c, rot([-w / 2 + w * s, h / 2 - Math.sin(s * Math.PI) * lift * 0.7], a))); }
          page(ctx, pts, { lineGap: 6, seed, angle: a, hatch: 0.4 });
        };
        pg([-20, 44], 70, 10, -0.06, 2, 123);
        pg([-34, 10], 58, 22, -0.35, 8, 124);
        pg([20, -22], 54, 30, 0.42, 10, 125);
        pg([-18, -60], 46, 26, -0.6, 12, 126);
        // draught lines
        ctx.fillStyle = INK; ctx.beginPath();
        for (let i = 0; i < 5; i++) { const y = -70 + i * 26; const pts = []; for (let k = 0; k <= 10; k++) pts.push([44 + k * 4, y + Math.sin(k * 0.8 + i) * 3 - k * 1.5]); ribbonPath(ctx, pts, (t) => LW(1.3, 0.7) * Math.sin(Math.PI * t)); }
        ctx.fill();
        break;
      }
      case 'counting': {
        groundShadow(ctx, 0, 76, 66, 6);
        const pg = [[-72, -62], [58, -70], [68, 66], [-64, 74]];
        page(ctx, pg, { lineGap: 30, seed: 127, angle: -0.06, hatch: 0.5, written: false });
        // rows of names: a scrawl, then tally marks; the finished ones struck through
        for (let r = 0; r < 4; r++) {
          const y = -42 + r * 28;
          ctx.fillStyle = INK; ctx.beginPath();
          const sc = [];
          for (let k = 0; k <= 12; k++) sc.push([-58 + k * 3.2, y + Math.sin(k * 1.9 + r) * 3.5 - k * 0.2]);
          penPath(ctx, sc, LW(2.2, 0.9), 0.1, 0.3);
          const groups = r === 3 ? 1 : 2;
          for (let g = 0; g < groups; g++) {
            const gx = -10 + g * 36;
            for (let m = 0; m < 4; m++) penPath(ctx, [[gx + m * 6, y - 10], [gx + m * 6 + 1, y + 9]], LW(2.8, 1.0), 0.2, 0.3);
            penPath(ctx, [[gx - 4, y + 7], [gx + 24, y - 7]], LW(2.8, 1.0), 0.2, 0.3);
          }
          if (r < 2) penPath(ctx, [[-62, y + 1], [0, y - 2]], LW(1.4, 0.7), 0.1, 0.1);
          ctx.fill();
        }
        // the last tally half drawn, the pen still on it
        ctx.fillStyle = A; ctx.beginPath();
        penPath(ctx, [[30, 34 + 12], [31, 48 + 12]], LW(2.2, 0.9), 0.2, 0.05);
        ctx.fill();
        quillPen(ctx, [31, 60], [84, -40], 12, { seed: 128 });
        break;
      }
    }
  },
};

export function drawItemIcon(ctx, kind, id, x, y, size, { ink = INK, accent = RED, plate: withPlate = true } = {}) {
  const f = PLATES[kind];
  if (!f) return;
  ctx.save();
  ctx.translate(x, y);
  const k = size / 184;
  ctx.scale(k, k);
  const m = ctx.getTransform();
  D = 1 / (Math.hypot(m.a, m.b) || k);
  INKC = ink;
  PLATE_ON = withPlate !== false;
  f(ctx, id, accent || RED);
  ctx.restore();
}

// ---- in-fight spell effects ------------------------------------------------------------------
export function drawSpellFx(ctx, world, t) {
  if (!world) return;
  const b = world.boss;
  const SS = { hi: false, D: 1, t };
  // Candleflame bolts
  for (const h of world.hazards || []) {
    if (h.kind !== 'bolt') continue;
    const cx = (h.x0 + h.x1) / 2, cy = GROUND_Y - (h.y0 + h.y1) / 2;
    const dir = (h.vx || h.facing || 1) >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(dir, 1);
    // ruled speed lines behind
    ctx.fillStyle = INK; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const y = -8 + i * 4; const L = 30 + hashNoise(h.id || 7, i) * 34; ribbonPath(ctx, [[-10 - L, y], [-8, y * 0.5]], (tt) => 1.5 * tt); }
    ctx.fill();
    // the flame laid on its side, streaming back
    ctx.rotate(-Math.PI / 2);
    ctx.scale(2.3, 2.3);
    flame(ctx, [0, 3], 1.4, { ...SS, D: 1 / 2.3, t: t + (h.id || 0) * 97 }, RED);
    ctx.restore();
  }
  if (!b) return;
  const bx = b.x, f = b.facing || -1;
  // the Binder's Knot: black cords round the body, a knot at the front
  if (b.bound) {
    const tt = typeof b.bound === 'number' ? b.bound : 1;
    for (let i = 0; i < 3; i++) {
      const y = GROUND_Y - (110 + i * 75);
      const rx = 78 - i * 6;
      const pts = [];
      for (let k = 0; k <= 16; k++) { const a = Math.PI * (k / 16); pts.push([bx + Math.cos(a) * rx * -f * -1, y + Math.sin(a) * 12 + Math.sin(t / 120 + k + i) * 0.8]); }
      ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, pts, () => 10); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, pts, () => 6); ctx.fill();
      ctx.fillStyle = PAPER; ctx.beginPath();
      for (let k = 1; k < pts.length - 1; k += 2) ribbonPath(ctx, [add(pts[k], [-1.4, -1.6]), add(pts[k], [1.4, 1.6])], () => 0.8);
      ctx.fill();
      // the knot and its loose ends at the front
      const kx = bx + f * (rx * 0.25), ky = y + 11;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(kx, ky, 7, 5, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      for (let e = 0; e < 2; e++) ribbonPath(ctx, spline([[kx, ky], [kx + f * (8 + e * 6), ky + 10 + e * 4 + Math.sin(t / 150 + e) * 2], [kx + f * (6 + e * 10), ky + 22 + e * 6]], 3), (q) => 3.4 - q * 2.4);
      ctx.fill();
    }
  }
  // the burn: small tongues of oxblood licking up the body
  if (b.burn) {
    for (let i = 0; i < 6; i++) {
      const life = ((t / 700 + hashNoise(601, i)) % 1);
      const k = Math.sin(Math.PI * life);
      if (k < 0.1) continue;
      const x = bx + (hashNoise(602, i) - 0.5) * 100;
      const y = GROUND_Y - (40 + hashNoise(603, i) * 250) - life * 12;
      ctx.save(); ctx.translate(x, y); ctx.scale(2.1 * k, 2.1 * k);
      flame(ctx, [0, 0], 1.2, { ...SS, D: 1 / 2, t: t + i * 140 }, RED);
      ctx.restore();
    }
  }
  // the hex: a mark written on its chest
  if (b.hexed) {
    const c = [bx + f * 10, GROUND_Y - 235];
    ctx.save();
    ctx.translate(c[0], c[1]);
    sigil(ctx, [0, 0], 1, SS, 2.6, PAPER);
    ctx.restore();
  }
}
