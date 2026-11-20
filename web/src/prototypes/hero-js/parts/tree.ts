// The windswept tree behind the couch. The trunk is a bundle of flowing bark lines that leans right, forks,
// and sends one limb sweeping up and left over the couch, one up, and one out to the right. The foliage is
// eight flat, layered pads; each pad is a dark body covered in about a hundred small leaf marks in three
// brightnesses, with a lacy edge made of the leaves themselves.
// Cost: the trunk and each pad are painted once into sprites. Per frame we draw the three limbs and the
// sub-branches (they flex with the shared wind), blit the pads with a sway, and add the live bits: leaves that
// flare as a gust passes, falling leaves, a hanging lantern and a small owl.
import { GOLD, INK, TREE, WARM, groundY, wind } from '../engine/layout';
import type { Part, Pt } from '../engine/types';
import { type C2, LW, TAU, blob, clamp01, disc, ell, hatch, ink, mod, osc, ribbon, rnd, smooth, spline, sprite, taper, tone, trace } from './right/kit';

const BX = TREE.x;
const GY = groundY(BX);
const FORK_Y = 522;

const T_BODY = tone(INK, 0.15);
const T_SHADE = tone(INK, 0.075);
const T_LIT = tone(INK, 0.26);
const PAD_BODY = tone(INK, 0.1);
const PAD_LIT = tone(INK, 0.19);
const TI = tone(INK, 0.88); // the tree's line: a step under the headline's white
const LAND_SHADE = '#24331b';

// ---- the skeleton (rest pose, scene units) -----------------------------------------------------------
const TRUNK: Pt[] = [[BX - 2, GY + 3], [BX + 1, 628], [BX + 10, 598], [BX + 25, 566], [BX + 36, 540], [BX + 40, 524]];
interface Limb { pts: Pt[]; w0: number; w1: number }
const LIMBS: Limb[] = [
  { pts: [[BX + 26, 550], [BX + 24, 516], [BX + 12, 478], [BX - 24, 438], [BX - 60, 396], [BX - 106, 352], [BX - 154, 326], [BX - 212, 308]], w0: 30, w1: 6 }, // sweeps up and left, high over the couch
  { pts: [[BX + 38, 546], [BX + 46, 516], [BX + 60, 480], [BX + 54, 432], [BX + 66, 386], [BX + 50, 340], [BX + 40, 300]], w0: 26, w1: 6 }, // up
  { pts: [[BX + 44, 552], [BX + 60, 524], [BX + 88, 502], [BX + 126, 492], [BX + 164, 470], [BX + 208, 476]], w0: 24, w1: 6 }, // out to the right
];
interface Pad { x: number; y: number; rx: number; ry: number; seed: number; tilt: number }
// one large pad reaching out over the couch, two medium, the rest small; each tipped a few degrees
const PADS: Pad[] = [
  { x: BX - 236, y: 296, rx: 108, ry: 36, seed: 1, tilt: -0.09 },
  { x: BX - 98, y: 258, rx: 68, ry: 29, seed: 2, tilt: 0.07 },
  { x: BX - 52, y: 350, rx: 42, ry: 18, seed: 3, tilt: -0.13 },
  { x: BX + 40, y: 246, rx: 92, ry: 38, seed: 4, tilt: -0.04 },
  { x: BX + 142, y: 316, rx: 68, ry: 26, seed: 5, tilt: 0.11 },
  { x: BX + 94, y: 388, rx: 38, ry: 17, seed: 6, tilt: -0.07 },
  { x: BX + 178, y: 410, rx: 74, ry: 30, seed: 7, tilt: 0.07 },
  { x: BX + 198, y: 502, rx: 50, ry: 21, seed: 8, tilt: 0.13 },
];
// sub-branches: from a point on a limb (limb index, fraction along it) to the underside of a pad
const SUBS: { limb: number; at: number; pad: number; w: number; bow: number }[] = [
  { limb: 0, at: 1, pad: 0, w: 8, bow: 8 },
  { limb: 0, at: 0.7, pad: 1, w: 9, bow: -10 },
  { limb: 0, at: 0.45, pad: 2, w: 7, bow: 8 },
  { limb: 1, at: 1, pad: 3, w: 7, bow: 6 },
  { limb: 1, at: 0.62, pad: 4, w: 9, bow: 12 },
  { limb: 1, at: 0.4, pad: 5, w: 7, bow: 8 },
  { limb: 2, at: 0.55, pad: 6, w: 9, bow: 10 },
  { limb: 2, at: 1, pad: 7, w: 7, bow: 6 },
];

/** how far the wind pushes a point of the tree at time t: nothing at the fork, most at the top */
function sway(x: number, y: number, t: number, lag = 0): Pt {
  const h = clamp01((FORK_Y - y) / 235);
  const k = h ** 1.35;
  const w = wind(t - lag - h * 0.22, x);
  return [w * 10 * k + osc(t, 5.3, x * 0.01) * 1.6 * k, -Math.abs(w) * 1.6 * k + osc(t, 3.7, x * 0.02) * 0.8 * k];
}
const moved = (p: Pt, t: number, lag = 0): Pt => {
  const d = sway(p[0], p[1], t, lag);
  return [p[0] + d[0], p[1] + d[1]];
};
function along(pts: readonly Pt[], u: number): Pt {
  const f = clamp01(u) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  return [pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * k, pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * k];
}

// ---- leaves ----------------------------------------------------------------------------------------
interface Leaf { x: number; y: number; a: number; l: number; w: number; tone: 0 | 1 | 2; ph: number }
function leafPath(c: C2, x: number, y: number, a: number, l: number, w: number) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const hx = ca * l * 0.5, hy = sa * l * 0.5, nx = -sa * w, ny = ca * w;
  c.moveTo(x - hx, y - hy);
  c.quadraticCurveTo(x + nx, y + ny, x + hx, y + hy);
  c.quadraticCurveTo(x - nx, y - ny, x - hx, y - hy);
}
interface Clump { x: number; y: number; rx: number; ry: number }
// each pad is a row of leafy clumps, fat in the middle and thinning to wind-combed tips
const CLUMPS: Clump[][] = PADS.map((p) => {
  const out: Clump[] = [];
  const m = Math.max(4, Math.round(p.rx / 15));
  for (let i = 0; i < m; i++) {
    const k = m === 1 ? 0 : (i / (m - 1)) * 2 - 1; // -1 .. 1 along the pad
    const s = p.seed * 31.7 + i * 5.3;
    const fat = 1 - 0.62 * Math.abs(k) ** 1.6;
    out.push({
      x: k * p.rx * 0.86 + (rnd(s) - 0.5) * 8,
      y: (rnd(s + 1) - 0.5) * p.ry * 0.55 - fat * p.ry * 0.12 + Math.abs(k) * p.ry * 0.18,
      rx: p.ry * (0.72 + rnd(s + 2) * 0.35) * (0.55 + 0.6 * fat),
      ry: p.ry * (0.55 + rnd(s + 3) * 0.28) * (0.45 + 0.6 * fat),
    });
  }
  // a second, higher row on the bigger pads so the top edge is lumpy, not a line
  if (p.rx > 70) for (let i = 0; i < 3; i++) {
    const s = p.seed * 17.1 + i * 9.7;
    out.push({ x: (rnd(s) - 0.5) * p.rx * 1.1, y: -p.ry * (0.42 + rnd(s + 1) * 0.3), rx: p.ry * (0.5 + rnd(s + 2) * 0.25), ry: p.ry * (0.34 + rnd(s + 3) * 0.16) });
  }
  return out;
});
const LEAVES: Leaf[][] = PADS.map((p, pi) => {
  const out: Leaf[] = [];
  const clumps = CLUMPS[pi]!;
  clumps.forEach((cl, ci) => {
    const count = Math.round(10 + (cl.rx * cl.ry) / 15);
    for (let i = 0; i < count; i++) {
      const s = p.seed * 91.7 + ci * 13.9 + i * 3.13;
      const th = rnd(s) * TAU;
      const rim = i % 5 < 2; // two fifths of the marks sit on (and past) the edge, which makes it lacy
      const r = rim ? 0.86 + rnd(s + 1) * 0.36 : Math.sqrt(rnd(s + 1)) * 0.9;
      const x = cl.x + Math.cos(th) * cl.rx * r, y = cl.y + Math.sin(th) * cl.ry * r * (Math.sin(th) > 0 ? 0.8 : 1);
      // brighter toward the upper left of each clump, dimmer inside and underneath
      const light = -Math.cos(th) * 0.4 - Math.sin(th) * 0.85 + (rnd(s + 2) - 0.5) * 0.9 - x / p.rx * 0.2 - y / p.ry * 0.25 + (rim ? 0.1 : -0.15);
      out.push({
        x, y,
        a: th * (rim ? 1 : 0.3) + (rnd(s + 3) - 0.5) * 2.4,
        l: 5.5 + rnd(s + 4) * 5,
        w: 2.8 + rnd(s + 5) * 2,
        tone: light > 0.5 ? 2 : light > -0.2 ? 1 : 0,
        ph: rnd(s + 6) * TAU,
      });
    }
  });
  return out;
});
// the leaves that flare when a gust passes
const FLARE: Leaf[][] = LEAVES.map((ls) => ls.filter((l, i) => l.tone > 0 && i % 6 === 0));

function paintPad(c: C2, p: Pad, leaves: Leaf[], clumps: Clump[]) {
  c.translate(p.x, p.y);
  // the dark body is made of leaves too (bigger, darker, opaque): its edge is leaf-shaped, never a soft smudge
  c.beginPath();
  for (let i = 0; i < leaves.length; i++) {
    const l = leaves[i]!;
    leafPath(c, l.x * 0.95, l.y * 0.93 + 1.5, l.a, l.l * 1.9, l.w * 2.2);
  }
  for (const cl of clumps) {
    c.moveTo(cl.x + cl.rx * 0.6, cl.y);
    c.ellipse(cl.x, cl.y, cl.rx * 0.6, cl.ry * 0.6, 0, 0, TAU);
  }
  c.fillStyle = PAD_BODY;
  c.fill();
  // a lighter layer on the upper left of each clump, also leaf by leaf
  c.beginPath();
  for (let i = 0; i < leaves.length; i++) {
    const l = leaves[i]!;
    if (l.tone > 0) leafPath(c, l.x - 1.6, l.y - 1.6, l.a, l.l * 1.35, l.w * 1.5);
  }
  c.fillStyle = PAD_LIT;
  c.fill();
  // a few twigs showing through from where the branch comes in underneath
  for (let i = 0; i < 5; i++) {
    const k = i / 4 - 0.5;
    const tip: Pt = [k * p.rx * 1.3 + (rnd(p.seed * 7 + i) - 0.5) * 12, -p.ry * (0.1 + rnd(p.seed * 3 + i) * 0.4) * (1 - Math.abs(k))];
    taper(c, [[k * 8, p.ry * 0.5], [tip[0] * 0.5, p.ry * 0.2 + Math.abs(k) * 5], tip], 2.4, 0.5, INK, 0.42);
  }
  // leaf marks, dim first so the bright ones sit on top
  const alpha = [0.34, 0.62, 0.92];
  for (let tn = 0; tn < 3; tn++) {
    c.beginPath();
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i]!;
      if (l.tone !== tn || i % 4 === 3) continue;
      leafPath(c, l.x, l.y, l.a, l.l, l.w);
    }
    c.globalAlpha = alpha[tn]!;
    c.fillStyle = INK;
    c.fill();
    // every fourth mark is an open two-stroke sprig instead of a solid leaf
    c.beginPath();
    for (let i = 3; i < leaves.length; i += 4) {
      const l = leaves[i]!;
      if (l.tone !== tn) continue;
      const ca = Math.cos(l.a), sa = Math.sin(l.a);
      c.moveTo(l.x - ca * l.l * 0.55, l.y - sa * l.l * 0.55);
      c.lineTo(l.x, l.y);
      c.lineTo(l.x + Math.cos(l.a + 0.8) * l.l * 0.55, l.y + Math.sin(l.a + 0.8) * l.l * 0.55);
      c.moveTo(l.x, l.y);
      c.lineTo(l.x + Math.cos(l.a - 0.7) * l.l * 0.5, l.y + Math.sin(l.a - 0.7) * l.l * 0.5);
    }
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();
  }
  c.globalAlpha = 1;
}

// ---- trunk -----------------------------------------------------------------------------------------
function paintTrunk(c: C2) {
  // contact shadow and roots
  blob(c, ell(BX + 8, GY + 7, 96, 9, 24), LAND_SHADE, null);
  blob(c, ell(BX + 8, GY + 8, 60, 4.5, 20), '#18240f', null);
  const line = spline(TRUNK, 8);
  const n = line.length;
  const wAt = (u: number) => 60 - 13 * smooth(u * 1.5) - 4 * u;
  const side = (k: number, wob: number, ph: number): Pt[] =>
    line.map((p, i) => {
      const a = line[Math.max(0, i - 1)]!, b = line[Math.min(n - 1, i + 1)]!;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const u = i / (n - 1);
      const off = (k + wob * Math.sin(u * 7 + ph)) * wAt(u) * 0.5;
      return [p[0] + (dy / l) * off, p[1] - (dx / l) * off] as Pt;
    });
  const left = side(-1, 0, 0), right = side(1, 0, 0);
  const shape = [...left, ...[...right].reverse()];
  blob(c, shape, T_BODY, null, 1, false);
  // shaded right side and lit left edge
  blob(c, [...side(0.35, 0.12, 1), ...[...right].reverse()], T_SHADE, null, 1, false);
  blob(c, [...left, ...[...side(-0.62, 0.08, 2)].reverse()], T_LIT, null, 1, false);
  hatch(c, [...side(0.4, 0.1, 1), ...[...right].reverse()], { angle: -1.1, gap: 5, color: INK, alpha: 0.32, seed: 5, smoothed: false });
  // the bundle of bark lines that twist round each other up the trunk
  ink(c, side(-0.5, 0.26, 0.4), LW.form, TI, 0.95, false);
  ink(c, side(-0.12, 0.34, 2.3), LW.form, TI, 0.95, false);
  ink(c, side(0.24, 0.3, 4.3), LW.form, TI, 0.9, false);
  ink(c, side(0.56, 0.2, 1.0), LW.detail, TI, 0.85, false);
  ink(c, side(-0.74, 0.12, 5.2).slice(3, n - 8), LW.detail, TI, 0.75, false);
  ink(c, side(0.76, 0.1, 3.1).slice(10, n - 3), LW.hair, TI, 0.6, false);
  ink(c, side(-0.3, 0.2, 1.2).slice(14, n - 6), LW.hair, TI, 0.55, false);
  ink(c, side(0.4, 0.16, 5.6).slice(4, n - 16), LW.hair, TI, 0.5, false);
  ink(c, left, LW.sil + 0.3, TI, 1, false);
  ink(c, right, LW.sil + 0.3, TI, 1, false);
  // the foot of the trunk closes on the ground, and the roots splay out over it
  ink(c, [left[0]!, [BX - 2, GY + 6], right[0]!], LW.form, TI, 1);
  const roots: Pt[][] = [
    [[BX - 16, GY - 22], [BX - 36, GY - 5], [BX - 70, GY + 5]],
    [[BX + 14, GY - 22], [BX + 36, GY - 4], [BX + 76, GY + 6]],
    [[BX - 2, GY - 12], [BX + 6, GY + 2], [BX + 24, GY + 11]],
    [[BX - 8, GY - 10], [BX - 18, GY + 3], [BX - 34, GY + 10]],
  ];
  for (const r of roots) {
    const poly = ribbon(spline(r, 6), 22, 3);
    blob(c, poly, T_BODY, null, 1, false);
    const m = poly.length / 2;
    ink(c, poly.slice(2, m), LW.form, TI, 1, false);
    ink(c, poly.slice(m, poly.length - 2), LW.form, TI, 1, false);
    taper(c, [[r[0]![0], r[0]![1] + 2], [r[1]![0], r[1]![1] + 1.5], r[2]!], 1.6, 0.4, INK, 0.6);
  }
  // a hollow and two knots
  const hol = along(TRUNK, 0.42);
  c.save();
  c.translate(hol[0] - 3, hol[1]);
  c.rotate(-0.25);
  blob(c, ell(0, 0, 4.6, 9, 14), tone(INK, 0.03), INK, LW.detail);
  ink(c, [[-7, -9], [-8.5, 0], [-6.5, 10]], LW.hair, INK, 0.6);
  ink(c, [[7, -8], [8.6, 1], [6, 11]], LW.hair, INK, 0.6);
  c.restore();
  for (const [u, dx, r] of [[0.2, 7, 3.4], [0.72, -6, 2.8]] as const) {
    const k = along(TRUNK, u);
    disc(c, k[0] + dx, k[1], r, T_SHADE, INK, LW.hair);
    ink(c, ell(k[0] + dx, k[1], r + 2.6, r + 3.6, 10).slice(0, 7), 0.9, INK, 0.55);
  }
  // short bark ticks
  for (let i = 0; i < 44; i++) {
    const u = 0.04 + rnd(i * 3.3) * 0.9;
    const p = along(TRUNK, u);
    const o = (rnd(i * 7.7) - 0.5) * wAt(u) * 0.8;
    ink(c, [[p[0] + o, p[1]], [p[0] + o + 1.2, p[1] - 5 - rnd(i) * 5]], 0.9, INK, 0.4, false);
  }
  // grass at the foot, in front of the roots
  for (let i = 0; i < 9; i++) {
    const x = BX - 46 + i * 13 + rnd(i * 5.1) * 8;
    const h = 9 + rnd(i * 2.3) * 11;
    taper(c, [[x, GY + 7], [x + (rnd(i) - 0.5) * 4, GY + 7 - h * 0.6], [x + (rnd(i * 9) - 0.4) * 10, GY + 7 - h]], 2.2, 0.4, '#e9e2b8', 0.75);
  }
}

function drawLimb(c: C2, pts: Pt[], w0: number, w1: number, seed: number) {
  const line = spline(pts, 6);
  const n = line.length;
  const off = (k: number, wob: number): Pt[] =>
    line.map((p, i) => {
      const a = line[Math.max(0, i - 1)]!, b = line[Math.min(n - 1, i + 1)]!;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const u = i / (n - 1);
      const o = (k + wob * Math.sin(u * 6 + seed)) * (w0 + (w1 - w0) * u) * 0.5;
      return [p[0] + (dy / l) * o, p[1] - (dx / l) * o] as Pt;
    });
  const a = off(-1, 0), b = off(1, 0);
  // which side is underneath decides where the shade goes
  const under = b[Math.floor(n / 2)]![1] > a[Math.floor(n / 2)]![1] ? 1 : -1;
  blob(c, [...a, ...[...b].reverse()], T_BODY, null, 1, false);
  blob(c, [...off(under * 0.25, 0.1), ...[...(under > 0 ? b : a)].reverse()], T_SHADE, null, 1, false);
  ink(c, off(-0.36, 0.3), LW.detail, TI, 0.9, false);
  ink(c, off(0.14, 0.36).slice(0, n - 5), LW.detail, TI, 0.8, false);
  ink(c, off(0.52 * under, 0.2).slice(0, n - 10), LW.hair, TI, 0.6, false);
  ink(c, off(-0.64 * under, 0.14).slice(3, n - 14), LW.hair, TI, 0.5, false);
  ink(c, a, LW.form + 0.3, TI, 1, false);
  ink(c, b, LW.form + 0.3, TI, 1, false);
  ink(c, [a[n - 1]!, b[n - 1]!], LW.form, TI, 1, false);
}

// ---- lantern, owl, falling leaves ---------------------------------------------------------------------
function lantern(c: C2, at: Pt, t: number) {
  const sw = wind(t - 0.35, at[0]) * 0.22 + osc(t, 2.9) * 0.05;
  const flick = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 12.7 + 1);
  c.save();
  c.translate(at[0], at[1]);
  c.rotate(sw);
  ink(c, [[0, 0], [0, 30]], LW.hair, WARM, 0.9, false);
  c.translate(0, 30);
  const g = c.createRadialGradient(0, 16, 2, 0, 16, 70);
  g.addColorStop(0, `rgba(231,200,115,${0.3 * flick})`);
  g.addColorStop(0.4, `rgba(231,200,115,${0.09 * flick})`);
  g.addColorStop(1, 'rgba(231,200,115,0)');
  c.fillStyle = g;
  c.fillRect(-72, -56, 144, 144);
  ink(c, [[-4, 3], [0, -2.5], [4, 3]], LW.detail, WARM, 1); // the ring it hangs by
  blob(c, [[-9, 8], [-6, 3], [6, 3], [9, 8]], tone(WARM, 0.4), WARM, LW.detail, false);
  const glass: Pt[] = [[-7.5, 8], [7.5, 8], [9, 27], [-9, 27]];
  blob(c, glass, tone(GOLD, 0.34 + 0.12 * flick), WARM, LW.detail, false);
  ink(c, [[-2.6, 8], [-3.1, 27]], 1, WARM, 0.8, false);
  ink(c, [[2.6, 8], [3.1, 27]], 1, WARM, 0.8, false);
  blob(c, [[0, 12.5 - flick * 2], [2.6, 20], [0, 23.5], [-2.6, 20]], GOLD, null);
  blob(c, [[-10.5, 27], [10.5, 27], [8, 31.5], [-8, 31.5]], tone(WARM, 0.4), WARM, LW.detail, false);
  c.restore();
}

function owl(c: C2, at: Pt, t: number) {
  const k = Math.floor(t / 6.7);
  const u = t - k * 6.7;
  const lookA = rnd(k * 3.1) > 0.5 ? 1 : -1, lookB = rnd(k * 3.1 + 5) > 0.5 ? 1 : -1;
  const look = lookA + (lookB - lookA) * smooth((u - 3.2) / 0.25); // snaps its gaze to a new side
  const blink = mod(t + 1.3, 4.9) < 0.14;
  const bob = Math.max(0, Math.sin(clamp01((u - 3.2) / 0.5) * Math.PI)) * 1.5;
  c.save();
  c.translate(at[0], at[1] - bob);
  // tail and feet
  blob(c, [[3, -4], [9, 6], [3, 8], [-1, 0]], T_SHADE, INK, LW.hair);
  ink(c, [[-5, -1], [-5.5, 2.5]], 1.2, WARM, 1, false);
  ink(c, [[1, -1], [1.5, 2.5]], 1.2, WARM, 1, false);
  const body: Pt[] = [[-9, -4], [-10.5, -14], [-8, -24], [-9.5, -30.5], [-4, -27.5], [4, -27.5], [9.5, -30.5], [8, -24], [10.5, -14], [9, -4], [0, -1]];
  blob(c, body, T_BODY, INK, LW.detail);
  // chest flecks and a folded wing
  for (let i = 0; i < 5; i++) ink(c, [[-4 + (i % 3) * 3.4, -12 + Math.floor(i / 3) * 4], [-3 + (i % 3) * 3.4, -10.5 + Math.floor(i / 3) * 4]], 0.9, INK, 0.7, false);
  ink(c, [[6.5, -18], [9, -10], [6, -4.5]], 1, INK, 0.7);
  // face
  for (const s of [-1, 1]) {
    disc(c, s * 4.2 + look * 0.5, -21, 3.7, T_SHADE, INK, 1);
    if (blink) ink(c, [[s * 4.2 - 2.4 + look * 0.5, -21], [s * 4.2 + 2.4 + look * 0.5, -21]], 1.2, INK, 1, false);
    else disc(c, s * 4.2 + look * 1.6, -21, 1.5, GOLD);
  }
  blob(c, [[-1.3 + look * 0.6, -18.5], [1.3 + look * 0.6, -18.5], [look * 0.6, -15.5]], WARM, null, 1, false);
  c.restore();
}

function fallingLeaves(c: C2, t: number) {
  const per = 2.7, life = 7.5;
  const k1 = Math.floor(t / per);
  c.fillStyle = INK;
  for (let k = k1 - 3; k <= k1; k++) {
    const start = k * per + rnd(k * 7.9) * 1.4;
    const u = (t - start) / life;
    if (u < 0 || u > 1) continue;
    const p = PADS[Math.floor(rnd(k * 3.3) * PADS.length)]!;
    const x0 = p.x + (rnd(k * 5.7) - 0.5) * p.rx * 1.4, y0 = p.y + p.ry * 0.5;
    const drift = 30 + rnd(k * 9.1) * 60 + wind(start, x0) * 20;
    const landX = x0 + drift;
    // leaves over the couch come to rest on its back; the others reach the grass
    const landY = landX < BX - 20 ? GY - 196 : groundY(Math.min(2995, landX)) - 2;
    const fall = clamp01(u / 0.8);
    const e = fall * fall * 0.35 + fall * 0.65;
    const flutter = 1 - fall;
    const x = x0 + drift * fall + Math.sin(fall * 13 + k) * 16 * Math.sin(fall * Math.PI);
    const y = y0 + (landY - y0) * e + Math.cos(fall * 13 + k) * 3 * flutter;
    const a = fall < 1 ? Math.sin(fall * 13 + k) * 1.1 + fall * 2 : Math.sin(13 + k) * 1.1 + 2;
    const alpha = smooth(u / 0.04) * (1 - smooth((u - 0.86) / 0.14));
    c.globalAlpha = alpha * 0.95;
    c.beginPath();
    leafPath(c, x, y, a, 9, 2.6 * (0.45 + 0.55 * Math.abs(Math.cos(fall * 9 + k))));
    c.fill();
  }
  c.globalAlpha = 1;
}

const box = (p: Pad) => ({ x: p.x - p.rx * 1.3 - 14, y: p.y - p.ry * 1.5 - 14, w: p.rx * 2.6 + 28, h: p.ry * 2.8 + 28 });

export const tree: Part = {
  id: 'tree',
  z: 22,
  intro: [1.4, 2.6],
  draw(pen, f) {
    const c = pen.ctx;
    const t = f.t;
    // limbs flex with the wind (the fork stays put)
    const limbs = LIMBS.map((l) => l.pts.map((p) => moved(p, t)));
    // sub-branches and pads: later and wider than the limb below them
    const padAt = PADS.map((p) => {
      const d = sway(p.x, p.y + p.ry, t, 0.2);
      return { dx: d[0] * 1.2, dy: d[1] * 1.2, r: wind(t - 0.3, p.x) * 0.028 + osc(t, 4.1 + p.seed * 0.37, p.seed) * 0.008 };
    });
    for (const s of SUBS) {
      const from = along(limbs[s.limb]!, s.at);
      const p = PADS[s.pad]!, d = padAt[s.pad]!;
      const to: Pt = [p.x + d.dx, p.y + p.ry * 0.4 + d.dy];
      const via: Pt = [(from[0] + to[0]) / 2 + s.bow * 0.4, (from[1] + to[1]) / 2 + s.bow];
      taper(c, [from, via, to], s.w, 1.8, T_BODY, 1);
      const line = spline([from, via, to], 6);
      const rb = ribbon(line, s.w, 1.8);
      ink(c, rb.slice(0, line.length), LW.detail, TI, 1, false);
      ink(c, rb.slice(line.length), LW.detail, TI, 1, false);
    }
    const tr = sprite(c, 'right-trunk', BX - 100, 500, 220, GY + 26 - 500, paintTrunk);
    c.drawImage(tr.cv, BX - 100, 500, tr.w, tr.h);
    drawLimb(c, limbs[2]!, LIMBS[2]!.w0, LIMBS[2]!.w1, 3);
    drawLimb(c, limbs[1]!, LIMBS[1]!.w0, LIMBS[1]!.w1, 2);
    drawLimb(c, limbs[0]!, LIMBS[0]!.w0, LIMBS[0]!.w1, 1);

    {
      const o = along(limbs[2]!, 0.6);
      owl(c, [o[0], o[1] - 6], t);
    }
    lantern(c, along(limbs[0]!, 0.6), t);

    // foliage pads
    for (let i = 0; i < PADS.length; i++) {
      const p = PADS[i]!, d = padAt[i]!, b = box(p);
      const sp = sprite(c, `right-pad-${i}`, b.x, b.y, b.w, b.h, (g) => paintPad(g, p, LEAVES[i]!, CLUMPS[i]!));
      c.save();
      c.translate(p.x + d.dx, p.y + d.dy);
      c.rotate(d.r + p.tilt);
      c.drawImage(sp.cv, b.x - p.x, b.y - p.y, sp.w, sp.h);
      // leaves that tilt and flare as a gust crosses this pad
      const gust = Math.max(0, wind(t, p.x));
      c.fillStyle = INK;
      for (const l of FLARE[i]!) {
        const fl = 0.5 + 0.5 * Math.sin(t * (2.2 + (l.ph % 1.7)) + l.ph);
        const a = clamp01(gust * 1.5 * fl + 0.25 * fl * fl);
        if (a < 0.04) continue;
        c.globalAlpha = a;
        c.beginPath();
        leafPath(c, l.x + gust * 1.5, l.y - 0.6, l.a + Math.sin(t * 3.3 + l.ph) * (0.25 + gust * 0.6), l.l * 1.12, l.w * 1.25);
        c.fill();
      }
      c.globalAlpha = 1;
      c.restore();
    }
    fallingLeaves(c, t);
  },
};
