// The small tree behind and to the right of the couch. A trunk that forks into four branches, and a crown of a
// few cloud-like leaf clusters reaching up and left over the couch, all in INK outline over a paper-dark fill.
// The outlines are drawn twice as wide and then covered by the fills, so overlapping shapes merge into one
// clean outline. Motion: branches sway with wind(t, x), more toward their tips; each branch also flutters on
// its own period (1.7 to 2.6 s); the cluster scallops rustle and a few inner leaf marks shimmer; two leaves let
// go on 7.3 s and 11.9 s loops and drift down to the ground. Draws itself on from the trunk upward.
import { INK, INTRO_END, PAPER, TREE, groundY, wind } from '../engine/layout';
import type { Part, Pen, Pt } from '../engine/types';
import { TAU, add, clamp01, closeLoop, limb, mod, osc, polar, ring, smooth, stepper } from './right/kit';

const LW = 4;
const BASE: Pt = [TREE.x, groundY(TREE.x)];

type Branch = { pts: Pt[]; w: number[]; period: number; seed: number };

const TRUNK: Branch = {
  pts: [add(BASE, 0, 14), [2748, 612], [2738, 562], [2724, 522], [2716, 498]],
  w: [38, 29, 24, 22, 20],
  period: 3.1,
  seed: 601,
};
const BRANCHES: Branch[] = [
  { pts: [[2718, 505], [2680, 466], [2622, 436], [2560, 410], [2490, 384]], w: [17, 13, 10, 8, 6], period: 2.3, seed: 611 },
  { pts: [[2716, 505], [2700, 448], [2674, 390], [2652, 338]], w: [17, 13, 10, 7], period: 1.9, seed: 612 },
  { pts: [[2722, 510], [2752, 452], [2784, 398], [2800, 348]], w: [15, 12, 9, 7], period: 2.6, seed: 613 },
  { pts: [[2734, 560], [2782, 530], [2846, 494], [2906, 468]], w: [15, 11, 8, 6], period: 1.7, seed: 614 },
];
/** leaf clusters: centre, radius, which branch carries it */
const CLUSTERS: { c: Pt; r: number; b: number; seed: number }[] = [
  { c: [2478, 360], r: 46, b: 0, seed: 621 },
  { c: [2562, 384], r: 36, b: 0, seed: 622 },
  { c: [2652, 316], r: 56, b: 1, seed: 623 },
  { c: [2728, 286], r: 48, b: 1, seed: 624 },
  { c: [2806, 326], r: 54, b: 2, seed: 625 },
  { c: [2862, 400], r: 36, b: 3, seed: 626 },
  { c: [2910, 448], r: 44, b: 3, seed: 627 },
];

/** how far the wind pushes a point at height above the base (more toward the top, squared) */
function sway(t: number, p: Pt): Pt {
  const h = clamp01((BASE[1] - p[1]) / 420);
  const w = wind(t, p[0]);
  return [p[0] + h * h * 20 * w, p[1] + h * h * 3 * Math.abs(w)];
}

function bendBranch(t: number, b: Branch, i: number): Pt[] {
  const n = b.pts.length;
  return b.pts.map((p, k) => {
    const s = k / (n - 1);
    const q = sway(t, p);
    const fl = s * s;
    return [q[0] + fl * 6 * osc(t, b.period, i * 1.3), q[1] + fl * 4 * osc(t, b.period * 1.37, i)] as Pt;
  });
}

function leafShape(c: Pt, a: number, size: number): Pt[] {
  const raw: Pt[] = [[-1, 0], [-0.45, -0.42], [0.45, -0.38], [1, 0], [0.45, 0.38], [-0.45, 0.42]];
  const ca = Math.cos(a), sa = Math.sin(a);
  return raw.map(([x, y]) => [c[0] + (x * ca - y * sa) * size, c[1] + (x * sa + y * ca) * size] as Pt);
}

function fallingLeaf(pen: Pen, t: number, from: Pt, period: number, delay: number, dir: number) {
  const u = mod(t - delay, period);
  if (t - u < INTRO_END) return; // only cycles that start after the entrance
  const FALL = 5.2;
  const endX = from[0] + dir * 120 + 26 * Math.sin(FALL * 2.1);
  const endY = groundY(endX) - 3;
  const spin = (v: number) => 0.9 * Math.sin(v * 2.1 + 0.6) + v * 0.3 * dir;
  let p: Pt, a: number, alpha: number;
  if (u < FALL) {
    const k = u / FALL;
    p = [from[0] + dir * 120 * k + 26 * Math.sin(u * 2.1), from[1] + (endY - from[1]) * (k * (0.55 + 0.45 * k))];
    a = spin(u);
    alpha = smooth(u / 0.4);
  } else {
    p = [endX, endY];
    a = spin(FALL);
    alpha = 1 - smooth((u - FALL) / 1.6);
  }
  if (alpha > 0) pen.fill(leafShape(p, a, 9), INK, alpha);
}

export const tree: Part = {
  id: 'tree',
  z: 22,
  intro: [1.4, 2.6],
  draw(pen, f) {
    if (f.reveal <= 0) return;
    const t = f.t;
    const rv = stepper(f.reveal, 0, 1, 3 + CLUSTERS.length, 0.3);

    // wood: trunk then branches, outlines first (double width), then the fills merge them
    const trunk = TRUNK.pts.map((p) => sway(t, p));
    const branches = BRANCHES.map((b, i) => bendBranch(t, b, i));
    const wood: { pts: Pt[]; r: number; seed: number }[] = [
      { pts: limb(trunk, TRUNK.w), r: rv(0), seed: TRUNK.seed },
      ...branches.map((c, i) => ({ pts: limb(c, BRANCHES[i]!.w), r: rv(1 + (i >> 1)), seed: BRANCHES[i]!.seed })),
    ];
    const ctx = pen.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(2400, 0);
    for (let x = 2400; x <= 3000; x += 20) ctx.lineTo(x, groundY(x) - 2);
    ctx.lineTo(3000, 0);
    ctx.closePath();
    ctx.clip();
    for (const s of wood) if (s.r > 0) pen.stroke(closeLoop(s.pts), { color: INK, width: LW * 2, reveal: s.r, seed: s.seed });
    for (const s of wood) if (s.r > 0) pen.fill(s.pts, PAPER, smooth((s.r - 0.4) / 0.6));
    ctx.restore();

    // crown: each cluster rides the tip of its branch and rustles
    const crowns = CLUSTERS.map((cl, i) => {
      const br = BRANCHES[cl.b]!;
      const tip = branches[cl.b]![br.pts.length - 1]!;
      const rest = br.pts[br.pts.length - 1]!;
      const c = add(cl.c, tip[0] - rest[0] + 2.5 * osc(t, 1.1 + i * 0.13, i), tip[1] - rest[1] + 1.8 * osc(t, 1.4 + i * 0.11, i * 2));
      const ph = 0.5 * osc(t, 2.2 + i * 0.3, i) + 0.4 * wind(t, c[0]);
      const breathe = 1 + 0.025 * osc(t, 1.6 + i * 0.2, i);
      const pts = ring(c, (th) => cl.r * breathe * (0.86 + 0.16 * Math.abs(Math.sin(3.5 * th + ph + i))), 56);
      return { c, pts, r: rv(3 + i), seed: cl.seed, cl };
    });
    for (const k of crowns) if (k.r > 0) pen.stroke(closeLoop(k.pts), { color: INK, width: LW * 2, reveal: k.r, seed: k.seed });
    for (const k of crowns) if (k.r > 0) pen.fill(k.pts, PAPER, smooth((k.r - 0.4) / 0.6));

    // a few leaf marks inside each cluster that shimmer
    crowns.forEach((k, i) => {
      if (k.r < 1) return;
      for (let j = 0; j < 2; j++) {
        const a = i * 2.1 + j * (TAU / 2.6);
        const p = polar(k.c, a, k.cl.r * 0.48);
        const tw = 0.5 + 0.5 * osc(t, 1.3 + 0.17 * j + 0.11 * i, i + j * 2);
        const d = 0.35 * osc(t, 0.9 + 0.1 * j, i * 3 + j);
        pen.stroke([polar(p, a + 2.4 + d, 7), p, polar(p, a + 0.7 + d, 7)], {
          color: INK,
          width: 3,
          alpha: 0.25 + 0.6 * tw,
          seed: k.seed * 10 + j,
        });
      }
    });

    // the leaves that let go
    if (f.alive) {
      const c4 = crowns[4]!, c6 = crowns[6]!, c2 = crowns[2]!;
      fallingLeaf(pen, t, add(c4.c, -10, c4.cl.r * 0.8), 7.3, 0.5, 1);
      fallingLeaf(pen, t, add(c6.c, 0, c6.cl.r * 0.8), 11.9, 4.2, -0.6);
      fallingLeaf(pen, t, add(c2.c, 20, c2.cl.r * 0.85), 9.7, 2.0, 0.9);
    }
  },
};
