// The three characters who leave the television, one from each of our games, each drawn the way it looks there:
//   goober    Goober Guys: a gumdrop contestant (Sherbet: teal top, pink bottom), stubby legs in booties, nub
//             arms, big eyes, a sprout on top. It waddles and bounces.
//   duellist  Inkelton: the duellist, a black ink mass with white engraving hatch: round helm with a swept-back
//             crest, a pale neck ribbon and a coloured sash streaming behind, a long ragged coat, a sword. Poised.
//   count     Blood Moon: the Count, a tall gaunt vampire: long pale face, swept-back hair, a stiff collar fin
//             behind the head, a huge cloak cut like bat wings with a red lining, held shut by one hand. He strides.
// One pen for all three, the television's: every figure is stroked as ONE silhouette (all parts stroked first,
// then all fills laid on top, so no joint shows a seam), then gets a few thinner inner lines. Widths are given
// in scene units and do not grow with the figure.
// The walk is driven by distance, not time: a planted foot stays on the exact surface where it landed while
// the body passes over it, and the hips ride on the legs.
import { INK, ORANGE } from '../../engine/layout';
import type { Pt } from '../../engine/types';
import { GREEN_SHADE, TAU, clamp01, curve, disc, fillPts, lerp, line, mod, seg, smooth, taper, tone, trace, type Ctx } from './kit';

export type Kind = 'goober' | 'duellist' | 'count';

export interface Pose {
  /** walk cycle phase in radians; advance it by TAU per cycleLength() of travel so the feet never slide */
  phase: number;
  /** 0 = standing, 1 = walking */
  amp: number;
  /** 0.4..1: how long the stride is (short on the cut steps) */
  stride?: number;
  /** 0..1 in the air: legs tucked */
  tuck?: number;
  /** 0..1 knees bent (anticipation, landing) */
  crouch?: number;
  /** 0..1 the thing each does on the way: goober throws both arms up, duellist thrusts, the Count bares his fangs and opens the cloak */
  act?: number;
  /** 0..1 the greeting at the end: goober waves, duellist brings the sword up in salute */
  greet?: number;
  /** 0..1 a bow from the hips (duellist, Count) */
  bow?: number;
  /** wind at the character, -1..1 */
  wind?: number;
  /** line weight multiplier (thinner for the small picture on the screen) */
  lw?: number;
  /** false: no contact shadow (the game on the screen draws its own) */
  shadow?: boolean;
}

interface Rig { thigh: number; shin: number; step: number; lift: number; bob: number; foot: number; size: number }
// every figure is drawn about 100 units tall and scaled by `size` (scene units per unit)
const RIGS: Record<Kind, Rig> = {
  goober: { thigh: 8, shin: 8, step: 22, lift: 7, bob: 0, foot: 4, size: 0.84 },
  duellist: { thigh: 20, shin: 19, step: 31, lift: 5, bob: 1.2, foot: 3.6, size: 1.14 },
  count: { thigh: 21, shin: 20, step: 40, lift: 7, bob: 1.8, foot: 4.5, size: 1.42 },
};

/** how far the character travels in one full walk cycle (two steps), in scene units at scale s */
export const cycleLength = (kind: Kind, s = 1) => 2 * RIGS[kind].step * RIGS[kind].size * s;
/** how tall the character stands, in scene units at scale 1 */
export const heightOf = (kind: Kind) => 100 * RIGS[kind].size;

// the television's pen: silhouette, form, detail (scene units)
const SIL = 2.6, FORM = 1.9, DET = 1.3;
interface Pen3 { s: number; f: number; d: number }

const DARK = '#0b0e0b';
const TEAL = '#5ad6b4', PINK = '#f088c8', LEAF = '#a6d968', RED = '#d0624a';

// ---- small geometry helpers ----
type V = readonly [number, number];
const add = (a: V, b: V, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const mix = (a: V, b: V, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** a tube of changing half-width along a polyline, as one closed outline (real corners at the joints) */
function tube(path: readonly Pt[], w: readonly number[], cap0 = true, cap1 = true): Pt[] {
  const n = path.length, L: Pt[] = [], R: Pt[] = [];
  let t0: Pt = [1, 0], t1: Pt = [1, 0];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)]!, b = path[Math.min(n - 1, i + 1)]!, p = path[i]!;
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const h = w[Math.min(i, w.length - 1)]!;
    L.push([p[0] - ty * h, p[1] + tx * h]);
    R.push([p[0] + ty * h, p[1] - tx * h]);
    if (i === 0) t0 = [tx, ty];
    if (i === n - 1) t1 = [tx, ty];
  }
  const out: Pt[] = [...L];
  if (cap1) {
    const p = path[n - 1]!, h = w[Math.min(n - 1, w.length - 1)]!;
    for (const a of [0.6, 1.2, Math.PI / 2, Math.PI - 1.2, Math.PI - 0.6]) out.push([p[0] + h * (-t1[1] * Math.cos(a) + t1[0] * Math.sin(a)), p[1] + h * (t1[0] * Math.cos(a) + t1[1] * Math.sin(a))]);
  }
  for (let i = n - 1; i >= 0; i--) out.push(R[i]!);
  if (cap0) {
    const p = path[0]!, h = w[0]!;
    for (const a of [0.6, 1.2, Math.PI / 2, Math.PI - 1.2, Math.PI - 0.6]) out.push([p[0] + h * (t0[1] * Math.cos(a) - t0[0] * Math.sin(a)), p[1] + h * (-t0[0] * Math.cos(a) - t0[1] * Math.sin(a))]);
  }
  return out;
}

function ellipse(c: V, rx: number, ry: number, rot = 0, n = 18): Pt[] {
  const out: Pt[] = [], cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
    out.push([c[0] + ex * cr - ey * sr, c[1] + ex * sr + ey * cr]);
  }
  return out;
}

/** the middle joint of a two-bone limb from a to b; bend +1 or -1 picks the side it folds to */
function ik2(a: V, b: V, l1: number, l2: number, bend: number): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.min(Math.hypot(dx, dy) || 1, (l1 + l2) * 0.999);
  const base = Math.atan2(dy, dx);
  const th = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  return [a[0] + l1 * Math.cos(base + bend * th), a[1] + l1 * Math.sin(base + bend * th)];
}

interface Piece { p: readonly Pt[]; f: string }
/**
 * One silhouette out of several opaque pieces: every piece is stroked first, then every fill is laid on top,
 * so the outline runs round the whole group and no line shows where two pieces join.
 */
function mass(ctx: Ctx, pieces: readonly Piece[], stroke: string, w: number) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = w * 2;
  for (const q of pieces) {
    trace(ctx, q.p, true);
    ctx.stroke();
  }
  for (const q of pieces) {
    ctx.fillStyle = q.f;
    trace(ctx, q.p, true);
    ctx.fill();
  }
}

function blink(t: number, seed: number): boolean {
  return mod(t + seed * 1.7, 3.3 + seed * 0.9) < 0.12;
}

// ---- the walk: where the hips and the two feet are ----
interface Leg { knee: Pt; ankle: Pt; fa: number; u: number }
interface Gait { hip: Pt; near: Leg; far: Leg }
function gait(R: Rig, pose: Pose, gl: (fx: number) => number): Gait {
  const amp = pose.amp, ph = pose.phase, tuck = pose.tuck ?? 0, crouch = pose.crouch ?? 0;
  const stride = pose.stride ?? 1;
  const step = R.step * stride;
  const LL = R.thigh + R.shin;
  const hipStand = LL * 0.985 + R.foot, hipWalk = Math.sqrt(LL * LL - (step / 2) ** 2) + R.foot + R.bob * 0.7;
  const hip: [number, number] = [0, -(lerp(hipStand, hipWalk, amp) - LL * (crouch * 0.24 + tuck * 0.05)) + R.bob * amp * Math.cos(2 * ph - 0.7)];
  // A planted foot stays on the exact surface where it landed; a swinging foot travels from the tread it
  // left to the tread it will land on.
  const target = (off: number, stand: number) => {
    const u = mod((ph + off) / TAU, 1);
    let fx: number, lift = 0, fa: number, gy: number;
    const idle = (1 - amp) * stand;
    if (u < 0.5) {
      const k = u / 0.5;
      fx = (step / 2 - step * k) * amp + idle;
      fa = k < 0.15 ? -0.35 * (1 - k / 0.15) : k > 0.7 ? 0.55 * ((k - 0.7) / 0.3) : 0;
      if (k > 0.7) lift = 1.5 * R.foot * ((k - 0.7) / 0.3);
      gy = gl(fx);
    } else {
      const k = (u - 0.5) / 0.5, e = k * k * (3 - 2 * k);
      fx = (-step / 2 + step * e) * amp + idle;
      lift = R.lift * (0.5 + 0.5 * stride) * Math.sin(Math.PI * k) ** 0.9 + 1.5 * R.foot * (1 - k) ** 2;
      fa = lerp(0.55, -0.35, smooth(0.15, 1, k));
      gy = lerp(gl(-(k + 0.5) * step * amp + idle), gl((1.5 - k) * step * amp + idle), e);
    }
    lift *= amp;
    fa *= amp;
    fx = lerp(fx, stand * 1.6 + 3, tuck);
    lift += tuck * (R.thigh * 0.7);
    fa = lerp(fa, 0.6, tuck);
    return { ax: fx, ay: gy * (1 - tuck) - lift - R.foot, fa, u };
  };
  const tn = target(0, 0.24 * R.step * 0.5), tf = target(Math.PI, -0.24 * R.step * 0.5);
  // the hips ride low enough for both legs to reach (this is what makes a walker sink onto each step down)
  for (const tg of [tn, tf]) {
    const dx = tg.ax - hip[0], m = LL * 0.985;
    if (Math.abs(dx) < m) hip[1] = Math.max(hip[1], tg.ay - Math.sqrt(m * m - dx * dx));
  }
  const leg = (tg: { ax: number; ay: number; fa: number; u: number }): Leg => {
    const dx = tg.ax - hip[0], dy = tg.ay - hip[1];
    const d0 = Math.hypot(dx, dy) || 1, d = Math.min(d0, LL * 0.998);
    const ankle: Pt = [hip[0] + (dx / d0) * d, hip[1] + (dy / d0) * d];
    return { knee: ik2(hip, ankle, R.thigh, R.shin, -1), ankle, fa: tg.fa, u: tg.u };
  };
  return { hip, near: leg(tn), far: leg(tf) };
}

/** the contact shadow on the ground and a dust tick at each footfall */
function contact(ctx: Ctx, R: Rig, g: Gait, pose: Pose, gl: (fx: number) => number, rx: number, color: string, pen: Pen3) {
  const tuck = pose.tuck ?? 0;
  if (pose.shadow !== false) {
    const off = clamp01(-g.hip[1] / (R.thigh + R.shin + R.foot) - 1.05) * 4 + tuck;
    disc(ctx, 0, gl(0) + 1.5, rx * (1 - 0.4 * clamp01(off)), GREEN_SHADE, null, 0, 0.8 * (1 - 0.5 * clamp01(off)), rx * 0.14);
  }
  for (const l of [g.near, g.far]) {
    if (pose.amp > 0.5 && l.u < 0.2 && tuck < 0.1) {
      const k = l.u / 0.2, fx = l.ankle[0] - 5, fy = l.ankle[1] + R.foot;
      seg(ctx, fx - 2 - k * 6, fy - 1 - k * 3, fx - 5 - k * 8, fy - 3 - k * 5, pen.d, color, 0.6 * (1 - k));
      seg(ctx, fx - 4 - k * 5, fy, fx - 8 - k * 7, fy - 0.5, pen.d, color, 0.5 * (1 - k));
    }
  }
}

/** a shoe at an ankle: points given heel to toe in the foot's own frame (x forward, y down, sole at y = foot) */
function shoe(l: Leg, pts: readonly Pt[], k = 1): Pt[] {
  const c = Math.cos(l.fa), s = Math.sin(l.fa);
  return pts.map(([bx, by]) => [l.ankle[0] + (bx * c - by * s) * k, l.ankle[1] + (bx * s + by * c) * k] as Pt);
}

// ============================================================ Goober Guys: a gumdrop contestant
// the game's gumdrop profile: a soft rolled sole, near-straight flanks, a broad full dome
const G_PROF: readonly Pt[] = [[13, 3.2], [23, 1.8], [30, -1.5], [34.4, -6.3], [36, -12.2], [35.8, -18.5], [34.4, -25.9], [32.3, -34.7], [29.8, -43.6], [26.6, -51.7], [22.4, -58.8], [16.8, -64.7], [9, -69.7]];
const G_BODY: readonly Pt[] = [...G_PROF, [0, -71.8], ...G_PROF.slice().reverse().map(([x, y]) => [-x, y] as Pt), [0, 3.6]];
const G_SHOE: readonly Pt[] = [[-6, 0.5], [-5, -3.2], [1, -4], [6, -2.8], [9.6, 0.2], [10, 4], [-5.6, 4]];

function goober(ctx: Ctx, pose: Pose, t: number, gl: (fx: number) => number, pen: Pen3) {
  const R = RIGS.goober;
  const amp = pose.amp, ph = pose.phase, tuck = pose.tuck ?? 0, crouch = pose.crouch ?? 0, greet = pose.greet ?? 0, act = pose.act ?? 0;
  const wnd = pose.wind ?? 0;
  const g = gait(R, pose, gl);
  const up = Math.max(tuck * 0.9, act); // both arms thrown up
  // the bounce: up over each planted foot, squashed at each landing, stretched at the top
  const hop = 4.6 * amp * Math.abs(Math.sin(ph)) ** 0.8 * (1 - tuck);
  const sq = 0.075 * amp * Math.cos(2 * ph - 0.5) * (1 - tuck) + 0.2 * crouch - 0.12 * tuck + 0.02 * Math.sin(t * 2.1) * (1 - amp);
  const sx = 1 + sq * 0.7, sy = 1 - sq;
  const rock = 0.1 * amp * Math.sin(ph + 0.4) + 0.05 * amp - 0.1 * tuck + 0.06 * greet * Math.sin(t * 9);
  const bx = g.hip[0], by = g.hip[1] + 3 - hop;
  const cr = Math.cos(rock), sr = Math.sin(rock);
  const B = (px: number, py: number): Pt => [bx + px * sx * cr - py * sy * sr, by + px * sx * sr + py * sy * cr];

  const body = tone(TEAL, 0.5), far = tone(TEAL, 0.32), belly = tone(PINK, 0.56), sole = tone(PINK, 0.3);
  contact(ctx, R, g, pose, gl, 30, TEAL, pen);

  const armAt = (root: Pt, a: number, len: number): Pt[] => {
    const d: Pt = [Math.sin(a), Math.cos(a)];
    return tube([root, add(root, d, len * 0.55), add(root, d, len)], [4.8, 4.6, 3.9]);
  };
  // the far arm pokes out past the front, the far leg and the near leg hang from the rounded underside
  const aFar = lerp(1.05 + 0.6 * amp * Math.cos(ph), 2.45 - 0.2 * Math.sin(t * 9 + 1), up);
  const legOf = (l: Leg, rx: number) => tube([B(rx, -2), l.ankle], [4.4, 3.7], false, true);
  mass(ctx, [{ p: armAt(B(30, -27), aFar, 14), f: far }, { p: legOf(g.far, 9), f: far }, { p: legOf(g.near, -8), f: body }], TEAL, pen.s);
  mass(ctx, [{ p: curve(shoe(g.far, G_SHOE), 2, true), f: tone(PINK, 0.2) }, { p: curve(shoe(g.near, G_SHOE), 2, true), f: sole }], PINK, pen.f);
  for (const l of [g.far, g.near]) line(ctx, shoe(l, [[-5, 1.8], [9.6, 1.8]]), pen.d, PINK, 0.8);

  // the gumdrop: teal dome, pink dipped bottom
  const outline = G_BODY.map(([x, y]) => B(x, y));
  mass(ctx, [{ p: outline, f: body }], TEAL, pen.s);
  ctx.save();
  trace(ctx, outline, true);
  ctx.clip();
  const dip: Pt[] = [];
  for (let x = -40; x <= 40; x += 8) dip.push(B(x, -22 + 2.6 * Math.sin(x * 0.3 + 1)));
  fillPts(ctx, [...dip, B(40, 8), B(-40, 8)], belly);
  fillPts(ctx, [B(-40, -62), B(-26, -54), B(-30, -32), B(-28, -12), B(-12, -1), B(22, 2), B(22, 10), B(-45, 10)], '#06100c', 0.3);
  ctx.restore();
  line(ctx, dip, pen.d, PINK, 0.9);
  line(ctx, curve([B(6, -63), B(17, -57), B(24.5, -47)], 4), pen.d, tone(TEAL, 1), 0.75);

  // the near arm, low on the side: it swings against the near leg, waves, or goes up
  const aNear = lerp(lerp(-0.25 - 0.75 * amp * Math.cos(ph), -2.5 + 0.4 * Math.sin(t * 9), greet), -2.5, up);
  mass(ctx, [{ p: armAt(B(-4, -25), aNear, 15), f: body }], TEAL, pen.f);

  // the face, turned toward where it is going
  const happy = up > 0.35 || greet > 0.5;
  const bl = blink(t, 1);
  const eye = (c: Pt, rx: number, ry: number) => {
    if (happy) line(ctx, curve([add(c, [-rx, 1.6]), add(c, [0, -2.8]), add(c, [rx, 1.6])], 4), pen.d * 1.3, DARK);
    else if (bl) seg(ctx, c[0] - rx, c[1], c[0] + rx, c[1], pen.d * 1.2, DARK);
    else {
      disc(ctx, c[0], c[1], rx, INK, DARK, pen.d * 0.8, 1, ry, rock);
      disc(ctx, c[0] + rx * 0.24, c[1] + ry * 0.08, rx * 0.6, '#1c1428', null, 0, 1, ry * 0.62, rock);
      disc(ctx, c[0] - rx * 0.05, c[1] - ry * 0.3, rx * 0.22, INK);
    }
  };
  eye(B(8, -41), 6.2, 7.6);
  eye(B(24.5, -42), 4.7, 6.9);
  // an open grin with the tongue showing
  fillPts(ctx, curve([B(11.5, -29.5), B(18, -28.6), B(24, -30), B(22, -23.4), B(15.4, -22.6)], 3, true), DARK);
  disc(ctx, B(18.6, -24.6)[0], B(18.6, -24.6)[1], 2.3, PINK);

  // the sprout: a stem and two leaves, a beat behind the body
  const sa = rock + 0.3 * amp * Math.sin(2 * ph - 1.9) - wnd * 0.3 + 0.08 * Math.sin(t * 2.3) - 0.3 * tuck;
  const root = B(1, -71), sd: Pt = [Math.sin(sa), -Math.cos(sa)], tip = add(root, sd, 8);
  const leaf = (a: number, len: number): Pt[] => {
    const d: Pt = [Math.sin(a), -Math.cos(a)], n: Pt = [d[1], -d[0]];
    return curve([tip, add(add(tip, d, len * 0.5), n, len * 0.3), add(tip, d, len), add(add(tip, d, len * 0.55), n, -len * 0.24)], 3, true);
  };
  line(ctx, [root, tip], pen.f, LEAF);
  mass(ctx, [{ p: leaf(sa - 1.05, 11), f: tone(LEAF, 0.5) }, { p: leaf(sa + 0.9, 9), f: tone(LEAF, 0.5) }], LEAF, pen.d);
}

// ============================================================ Inkelton: the duellist
const D_SHOE: readonly Pt[] = [[-5, 0], [-4, -3.4], [2, -3.8], [6, -1.6], [9.8, 0.8], [10.2, 3.6], [-4.8, 3.6]];

function duellist(ctx: Ctx, pose: Pose, t: number, gl: (fx: number) => number, pen: Pen3) {
  const R = RIGS.duellist;
  const amp = pose.amp, ph = pose.phase, tuck = pose.tuck ?? 0, act = pose.act ?? 0, greet = pose.greet ?? 0, bow = pose.bow ?? 0;
  const wnd = pose.wind ?? 0;
  const g = gait(R, pose, gl);
  const hip = g.hip;
  const BLACK = tone(INK, 0.045), CREAM = tone(INK, 0.66), SASH = tone(ORANGE, 0.6);
  contact(ctx, R, g, pose, gl, 26, INK, pen);

  // the spine: upright, a little forward when it thrusts or bows
  const tl = 0.04 * amp + 0.5 * bow + 0.16 * act - 0.05 * tuck;
  const U: Pt = [Math.sin(tl), -Math.cos(tl)], Vv: Pt = [Math.cos(tl), Math.sin(tl)];
  const P = (u: number, v: number): Pt => [hip[0] + U[0] * u + Vv[0] * v, hip[1] + U[1] * u + Vv[1] * v];
  const hl = tl * 0.7 + bow * 0.25;
  const late = R.bob * 0.6 * amp * Math.cos(2 * ph - 1.5);
  const neck = P(37, 0.5);
  const H: Pt = [neck[0] + Math.sin(hl) * 8.6, neck[1] - Math.cos(hl) * 8.6 + late];
  const ch = Math.cos(hl), sh = Math.sin(hl);
  const HP = (hx: number, hy: number): Pt => [H[0] + hx * ch - hy * sh, H[1] + hx * sh + hy * ch];

  // ribbons streaming behind: they lag the body, lift with speed and ripple
  const ribbon = (root: Pt, len: number, dy: number, phs: number, droop: number, w: readonly number[]): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      pts.push([
        root[0] - u * len * (0.74 + 0.18 * amp + 0.1 * Math.max(0, wnd)) + Math.sin(t * 2.1 + phs) * u * 1.4,
        root[1] + dy * u + u * u * len * (droop - 0.24 * amp) + Math.sin(t * 4.3 - u * 4.6 + phs) * (0.5 + u * 2.6) * (0.5 + 0.5 * amp) + 1.9 * amp * Math.cos(2 * ph - 0.7 - u * 2.4),
      ]);
    }
    return tube(pts, w, false, false);
  };
  const nape = P(35.5, -4.5), knot = P(3, -7.4);
  mass(ctx, [{ p: ribbon(nape, 21, 3, 1.3, 0.3, [1.4, 2.4, 2.7, 2.7, 2.5, 2.2, 1.6]), f: tone(INK, 0.5) }, { p: ribbon(nape, 31, -3, 0, 0.26, [1.5, 2.6, 3, 3, 2.9, 2.6, 1.8]), f: CREAM }], INK, pen.f);
  mass(ctx, [{ p: ribbon(knot, 27, 5, 2.2, 0.5, [1.4, 2.8, 3.2, 3.1, 2.6, 1.7, 0.5]), f: tone(ORANGE, 0.42) }, { p: ribbon(knot, 36, -1, 0.7, 0.4, [1.5, 3, 3.5, 3.4, 2.9, 1.9, 0.5]), f: SASH }], ORANGE, pen.f);

  // the far arm swings a little behind the coat
  const sF = P(33, -1), swF = 0.3 * amp * Math.cos(ph);
  const hF: Pt = [sF[0] + Math.sin(swF - 0.1) * 22, sF[1] + Math.cos(swF - 0.1) * 22];
  // legs: dark shins under the coat, pale shoes
  const legOf = (l: Leg) => tube([hip, l.knee, l.ankle], [4.2, 3.4, 2.5]);
  mass(ctx, [{ p: tube([sF, ik2(sF, hF, 12.5, 12, 1), hF], [3.2, 2.8, 2.4]), f: BLACK }, { p: legOf(g.far), f: BLACK }, { p: legOf(g.near), f: BLACK }], tone(INK, 0.7), pen.f);
  mass(ctx, [{ p: curve(shoe(g.far, D_SHOE), 2, true), f: tone(INK, 0.45) }, { p: curve(shoe(g.near, D_SHOE), 2, true), f: CREAM }], INK, pen.f);
  for (const l of [g.far, g.near]) line(ctx, shoe(l, [[-4.4, 1.6], [10, 1.8]]), pen.d, DARK, 0.9);

  // the coat: one black mass from the helm to a ragged hem that follows the feet
  const lead = g.near.ankle[0] > g.far.ankle[0] ? g.near.ankle : g.far.ankle, trail = lead === g.near.ankle ? g.far.ankle : g.near.ankle;
  const F: Pt = [lead[0] + 7 + 2 * amp, lead[1] - 6 - 10 * tuck], Bk: Pt = [trail[0] - 14 - 5 * amp - 6 * tuck, trail[1] - 5.5 - 16 * tuck];
  const wF = P(3, 6.8), wB = P(3, -7.2);
  const hem: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const p = mix(F, Bk, i / 6);
    hem.push([p[0], p[1] + Math.sin(t * 3.7 + i * 1.9) * 0.5 + (i % 2 ? 0.8 : 0)]);
    if (i < 6) {
      const m = mix(F, Bk, (i + 0.55) / 6);
      hem.push([m[0] + 0.6, m[1] - 4.4 - 1.8 * Math.sin(i * 2.3 + 1)]);
    }
  }
  const skirt: Pt[] = [wF, ...curve([wF, [(wF[0] + F[0]) / 2 + 2.5, (wF[1] + F[1]) / 2], F], 4).slice(1, -1), ...hem, ...curve([Bk, [(wB[0] + Bk[0]) / 2 - 3, (wB[1] + Bk[1]) / 2 + 2], wB], 4).slice(1)];
  const torso: Pt[] = [P(-1, -7.6), P(-1, 7), P(14, 7.6), P(27, 8.2), P(34.5, 7), P(37.5, 3), P(37.5, -3.4), P(35, -8.2), P(20, -8.4)];
  const helm = ellipse(H, 8.3, 8.8, hl);
  const crest: Pt[] = [HP(-4.5, -7.4), HP(-17.5, -6.8), HP(-7.6, -2.2)];
  const collar: Pt[] = [P(33, -6.6), P(39.5, -5), P(39.5, 5.6), P(33, 6.8)];
  mass(ctx, [{ p: skirt, f: BLACK }, { p: torso, f: BLACK }, { p: collar, f: BLACK }, { p: helm, f: BLACK }, { p: crest, f: BLACK }], INK, pen.s);
  // the engraving: streaks down the skirt, hatch across the chest, three arcs on the helm
  for (const [v, f] of [[4.4, 0.12], [1.4, 0.36], [-2.2, 0.6], [-5.2, 0.84]] as const) {
    const a = P(0.5, v), b = mix(F, Bk, f);
    taper(ctx, [a, mix(a, b, 0.5), [b[0], b[1] - 7]], pen.d * 1.3, INK, 0.62, 0.1, 0.5);
  }
  for (let i = 0; i < 4; i++) seg(ctx, P(11 + i * 6, -6.2)[0], P(11 + i * 6, -6.2)[1], P(11 + i * 6, -0.6 - (i % 2) * 1.6)[0], P(11 + i * 6, -0.6 - (i % 2) * 1.6)[1], pen.d, INK, 0.6);
  for (let i = 0; i < 2; i++) line(ctx, curve([HP(-4.4 + i * 0.6, -5.4 + i * 2.8), HP(0.6, -7 + i * 2.8), HP(5.4 + i * 0.6, -5.2 + i * 2.8)], 3), pen.d, INK, 0.72);
  // the visor: a slit and the pale ground behind it
  line(ctx, [HP(2.6, 1.2), HP(8, 0.8)], pen.d * 1.5, INK);
  line(ctx, [HP(4, 3.6), HP(7.6, 3.3)], pen.d, INK, 0.6);

  // the sash round the waist, knotted at the back
  mass(ctx, [{ p: [P(0.2, -7.8), P(5.6, -7.8), P(4.6, 7.4), P(-0.6, 7.4)], f: SASH }, { p: ellipse(knot, 3.1, 3.1, 0, 12), f: SASH }], ORANGE, pen.d);

  // the sword arm. Carried point down in front, as in the game; thrust; brought up in salute; swept low in the bow.
  let hu = 13, hv = 11, ang = Math.PI - 0.14;
  hu = lerp(hu, 27, act);
  hv = lerp(hv, 23.5, act);
  ang = lerp(ang, 1.5, act);
  hu = lerp(hu, 30.5, greet);
  hv = lerp(hv, 10, greet);
  ang = lerp(ang, 0.05, greet);
  hu = lerp(hu, 13, bow);
  hv = lerp(hv, 15, bow);
  ang = lerp(ang, 2.25, bow);
  ang += 0.07 * amp * Math.sin(ph - 0.6) * (1 - act) * (1 - greet);
  const sN = P(33, 1.5), hand = P(hu + 0.6 * amp * Math.sin(2 * ph - 1.2), hv);
  const d: Pt = [Math.sin(ang), -Math.cos(ang)], n: Pt = [d[1], -d[0]];
  const gd = add(hand, d, 2.6);
  // blade, guard and pommel
  mass(ctx, [{ p: [add(gd, n, 1.5), add(add(gd, d, 39), n, 1.3), add(gd, d, 45), add(add(gd, d, 39), n, -1.3), add(gd, n, -1.5)], f: CREAM }], INK, pen.d);
  line(ctx, [add(gd, d, 3), add(gd, d, 36)], pen.d * 0.8, DARK, 0.55);
  line(ctx, [add(gd, n, 5), add(gd, n, -5)], pen.f * 1.15, INK);
  disc(ctx, hand[0] - d[0] * 3.4, hand[1] - d[1] * 3.4, 1.9, INK);
  mass(ctx, [{ p: tube([sN, ik2(sN, hand, 12.5, 12, 1), hand], [3.5, 3, 2.5]), f: BLACK }, { p: ellipse(hand, 2.7, 2.7, 0, 10), f: BLACK }], INK, pen.f);
  const el = ik2(sN, hand, 12.5, 12, 1);
  for (const f of [0.4, 0.7]) {
    const c = mix(sN, el, f), ax = el[0] - sN[0], ay = el[1] - sN[1], al = Math.hypot(ax, ay) || 1;
    seg(ctx, c[0] - (ay / al) * 2.2, c[1] + (ax / al) * 2.2, c[0] + (ay / al) * 2.2, c[1] - (ax / al) * 2.2, pen.d, INK, 0.65);
  }
}

// ============================================================ Blood Moon: the Count
// Points are in the units of the game's own character sheet (240 tall, hips at y = -104), scaled here.
const CK = 0.4167;
const C_FRONT: readonly Pt[] = [[-34, -180], [-18, -182], [8, -184], [28, -176], [40, -162], [48, -146], [48, -124], [50, -96], [54, -66]];
const C_FRONT_OPEN: readonly Pt[] = [[-34, -180], [-18, -182], [8, -184], [28, -178], [44, -172], [58, -182], [72, -188], [86, -150], [93, -104]];
const C_HEM: readonly Pt[] = [[60, -40], [36, -30], [10, -22], [-20, -17], [-52, -15], [-82, -19], [-108, -32]];
const C_BACK: readonly (readonly [number, number, number])[] = [[-96, -72, 0.7], [-78, -118, 0.4], [-60, -158, 0.15], [-46, -180, 0.03], [-34, -184, 0]];
const C_INNER: readonly (readonly [number, number, number])[] = [[-44, -60, 0.4], [-30, -120, 0.14], [-22, -170, 0]];
const C_COLLAR: readonly Pt[] = [[-2, 32], [-18, 28], [-30, 10], [-36, -12], [-40, -30], [-36, -27], [-28, -22], [-20, -8], [-10, 12], [4, 28]];
const C_COLLAR_IN: readonly Pt[] = [[-8, 24], [-20, 20], [-28, 4], [-33, -18], [-26, -16], [-16, -2], [-6, 14]];
const C_HAIR: readonly Pt[] = [[8, -21], [4, -28], [-6, -32], [-17, -29], [-23, -19], [-25, -4], [-29, 10], [-21, 4], [-22, 16], [-15, 6], [-11, -1], [-9, -11], [-3, -16], [3, -18]];
const C_EAR: readonly Pt[] = [[-3, 1], [-6, -9], [-15, -17], [-11, -5], [-9, 5], [-4, 6]];
const C_BOOT: readonly Pt[] = [[-4.6, 2], [-3.8, -2.4], [1.2, -2.8], [3.4, 0.6], [8.4, 2.3], [11.6, 4.1], [8.4, 4.5], [-4.2, 4.5]];

function count(ctx: Ctx, pose: Pose, t: number, gl: (fx: number) => number, pen: Pen3) {
  const R = RIGS.count;
  const amp = pose.amp, ph = pose.phase, tuck = pose.tuck ?? 0, act = pose.act ?? 0, bow = pose.bow ?? 0;
  const wnd = pose.wind ?? 0;
  const g = gait(R, pose, gl);
  const hip = g.hip;
  const CLOTH = tone(INK, 0.17), SHADE = tone(INK, 0.085), PALE = tone(INK, 0.6), LINING = tone(RED, 0.72);
  contact(ctx, R, g, pose, gl, 34, INK, pen);

  // a long forward lean when he strides; thrown back when he bares his fangs; a deep bow
  const tl = 0.1 * amp + 0.46 * bow - 0.13 * act - 0.05 * tuck;
  const U: Pt = [Math.sin(tl), -Math.cos(tl)], Vv: Pt = [Math.cos(tl), Math.sin(tl)];
  const C = (X: number, Y: number): Pt => {
    const u = (-Y - 104) * CK, v = X * CK;
    return [hip[0] + U[0] * u + Vv[0] * v, hip[1] + U[1] * u + Vv[1] * v];
  };
  const late = R.bob * 0.7 * amp * Math.cos(2 * ph - 1.6);
  const hc = C(14, -208);
  const hl = tl + 0.2 * bow - 0.14 * act + 0.03 * amp * Math.sin(2 * ph - 2.2);
  const head = (rot: number, dy: number) => {
    const c = Math.cos(rot) * 1.15 * CK, s = Math.sin(rot) * 1.15 * CK;
    return (x: number, y: number): Pt => [hc[0] + x * c - y * s, hc[1] + dy + x * s + y * c];
  };
  const Hf = head(hl, late), Hc = head(tl, late * 0.5); // the face nods; the collar stays with the shoulders

  // legs and pointed boots, mostly under the cloak
  const legOf = (l: Leg) => tube([hip, l.knee, [l.ankle[0], l.ankle[1] - 1]], [3.5, 2.9, 2.3]);
  mass(ctx, [{ p: legOf(g.far), f: SHADE }, { p: curve(shoe(g.far, C_BOOT), 2, true), f: SHADE }], tone(INK, 0.7), pen.f);
  mass(ctx, [{ p: legOf(g.near), f: CLOTH }, { p: curve(shoe(g.near, C_BOOT), 2, true), f: CLOTH }], INK, pen.f);
  line(ctx, shoe(g.near, [[-3.6, 2.9], [9.6, 3.1]]), pen.d, INK, 0.7);

  // the cloak: the hem's wing points trail behind the stride, ripple, and never sink into the ground
  const off: Pt[] = C_HEM.map((_, i) => {
    const f = i / 6;
    return [
      -f * amp * 18 - f * tuck * 26 + (i === 0 ? 28 : i === 1 ? 22 : 0) * act + 7 * Math.sin(2 * ph - 0.9 * i - 0.5) * amp * (0.35 + f) + 12 * wnd * f + 2.5 * Math.sin(t * 1.7 - i * 0.8),
      -f * amp * 10 + 5 * Math.sin(2 * ph - 0.9 * i - 2) * amp * (0.3 + f) - tuck * f * 60 - (i === 0 ? 22 : i === 1 ? 4 : 0) * act + 2 * Math.sin(t * 1.9 - i),
    ];
  });
  const tips: Pt[] = C_HEM.map(([X, Y], i) => {
    const p = C(X + off[i]![0], Y + off[i]![1]);
    return [p[0], Math.min(p[1], gl(p[0]) - 1.6)];
  });
  const front: Pt[] = C_FRONT.map(([X, Y], i) => C(lerp(X, C_FRONT_OPEN[i]![0], act), lerp(Y, C_FRONT_OPEN[i]![1], act)));
  const back: Pt[] = C_BACK.map(([X, Y, f]) => C(X + off[6]![0] * f, Y + off[6]![1] * f));
  const inside = C(-10, -90);
  const hem: Pt[] = [tips[0]!];
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1]!, b = tips[i]!;
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const m = mix(a, b, 0.5);
    if ((inside[0] - m[0]) * nx + (inside[1] - m[1]) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    for (const u of [0.25, 0.5, 0.75]) hem.push(add(mix(a, b, u), [nx, ny], 3.4 * Math.sin(Math.PI * u ** 0.8)));
    hem.push(b);
  }
  const cloak: Pt[] = [...curve([...front, tips[0]!], 3).slice(0, -1), ...hem, ...curve([tips[6]!, ...back], 3).slice(1)];
  const collar = curve(C_COLLAR.map(([x, y]) => Hc(x, y)), 3, true);
  mass(ctx, [{ p: cloak, f: CLOTH }, { p: collar, f: CLOTH }], INK, pen.s);
  // the back third in shade, hatched along the fall of the cloth
  const inner: Pt[] = C_INNER.map(([X, Y, f]) => C(X + off[4]![0] * f, Y + off[4]![1] * f));
  ctx.save();
  trace(ctx, cloak, true);
  ctx.clip();
  fillPts(ctx, [C(-36, -182), ...back.slice().reverse(), tips[6]!, tips[5]!, tips[4]!, ...inner], SHADE);
  for (const f of [0.2, 0.45, 0.7]) line(ctx, curve([mix(back[1]!, inner[1]!, f), mix(back[0]!, inner[0]!, f), mix(tips[6]!, tips[4]!, f * 0.9 + 0.05)], 4), pen.d, INK, 0.5);
  ctx.restore();
  // folds that run down to the points of the hem, like the bones of a wing
  line(ctx, curve([C(22, -150), mix(C(12, -90), tips[2]!, 0.15), add(tips[2]!, [0.4, -3])], 5), pen.d * 1.2, INK, 0.85);
  line(ctx, curve([C(0, -166), mix(C(-10, -100), tips[3]!, 0.15), add(tips[3]!, [0.6, -3])], 5), pen.d * 1.2, INK, 0.85);
  line(ctx, curve([C(36, -128), mix(C(30, -84), tips[1]!, 0.15), add(tips[1]!, [0.3, -3])], 5), pen.d * 1.2, INK, 0.7);
  // the red lining turned back along the front edge; it opens wide when he throws the cloak open
  const edge: Pt[] = [front[6]!, front[7]!, front[8]!, tips[0]!];
  const seam: readonly Pt[] = [[46, -164], [40, -124], [36, -84], [33, -48]];
  const turn: Pt[] = edge.map((p, i) => mix(add(p, [-1.5 - i * 0.45, 0.8]), C(seam[i]![0], seam[i]![1]), act)).reverse();
  mass(ctx, [{ p: [...curve(edge, 3), mix(tips[0]!, add(tips[1]!, [0, -1.6]), act), ...curve(turn, 3)], f: LINING }], RED, pen.d * 0.8);
  mass(ctx, [{ p: curve(C_COLLAR_IN.map(([x, y]) => Hc(x, y)), 3, true), f: LINING }], RED, pen.d);

  // neck, the long pale face, the hair combed straight back, the pointed ear
  const jaw = 7 * act;
  const face: readonly Pt[] = [
    [-2, -27], [8, -22], [13, -14], [14.5, -9], [12.5, -6], [14, -2], [19, 3], [24, 9], [22, 11.5], [17, 11], [16.5, 13.5], [14.5, 15 + jaw * 0.3],
    [15.5, 17.5 + jaw], [15.5, 22 + jaw], [17.5, 28 + jaw], [12, 31 + jaw], [3, 27 + jaw * 0.5], [-4, 19], [-9, 7], [-11, -7], [-9, -20],
  ];
  mass(ctx, [{ p: tube([C(8, -168), Hf(1, 22)], [2.3, 2.3], false, false), f: PALE }, { p: curve(face.map(([x, y]) => Hf(x, y)), 2, true), f: PALE }], INK, pen.f);
  mass(ctx, [{ p: curve(C_HAIR.map(([x, y]) => Hf(x, y)), 3, true), f: tone(INK, 0.05) }], INK, pen.f);
  for (let i = 0; i < 2; i++) line(ctx, curve([Hf(3 - i * 4, -23 + i * 3), Hf(-9 - i, -27 + i * 4), Hf(-19 + i, -17 + i * 4), Hf(-22 + i * 2, 0 + i * 5)], 4), pen.d, INK, 0.7);
  mass(ctx, [{ p: curve(C_EAR.map(([x, y]) => Hf(x, y)), 3, true), f: PALE }], INK, pen.d);
  // heavy brow, sunken eye, the line of the cheek, a thin mouth with a fang (thrown open when he hisses)
  line(ctx, curve([Hf(2, -12), Hf(9, -10.5), Hf(15, -7)], 3), pen.d * 1.5, DARK);
  disc(ctx, Hf(10, -4.5)[0], Hf(10, -4.5)[1], 0.85, DARK);
  line(ctx, curve([Hf(-2, 3), Hf(5, 8), Hf(9, 9)], 3), pen.d, DARK, 0.75);
  if (act > 0.3) {
    fillPts(ctx, [Hf(16.5, 13.8), Hf(9.5, 14.5), Hf(8.5, 18 + jaw * 0.6), Hf(15.5, 17.5 + jaw)], DARK);
    fillPts(ctx, [Hf(15.2, 14), Hf(14.4, 21), Hf(12.8, 14.3)], INK);
    fillPts(ctx, [Hf(11.8, 14.6), Hf(11.3, 19), Hf(10.2, 15)], INK);
  } else {
    line(ctx, curve([Hf(8.5, 14.6), Hf(12.5, 15.2), Hf(16.5, 14)], 3), pen.d, DARK);
    fillPts(ctx, [Hf(15.2, 14.4), Hf(14.4, 20), Hf(12.6, 14.8)], INK);
  }

  // the hand that holds the cloak shut: pale, long nails into the cloth
  const hd = C(lerp(44, 73, act), lerp(-140, -186, act));
  for (let i = 0; i < 3; i++) seg(ctx, hd[0] - 1, hd[1] - 1.6 + i * 1.7, hd[0] - 6.4, hd[1] - 0.4 + i * 2.2, pen.d * 1.25, INK);
  mass(ctx, [{ p: ellipse(add(hd, [0.6, 0.4]), 3.3, 2.7, 0.3, 10), f: PALE }], INK, pen.d);
}

/**
 * Draws one of the cast with its feet at (x, y). `s` scales the whole figure (1 on the ridge, small inside the
 * television), `ground(x)` is the exact surface under a foot in the same coordinates as x and y.
 */
export function drawCast(ctx: Ctx, kind: Kind, x: number, y: number, s: number, pose: Pose, t: number, ground: (x: number) => number) {
  const sz = s * RIGS[kind].size;
  if (sz <= 0.02) return;
  const gl = (fx: number) => (ground(x + fx * sz) - y) / sz;
  const k = (pose.lw ?? 1) / sz;
  const pen: Pen3 = { s: SIL * k, f: FORM * k, d: DET * k };
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sz, sz);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (kind === 'goober') goober(ctx, pose, t, gl, pen);
  else if (kind === 'duellist') duellist(ctx, pose, t, gl, pen);
  else count(ctx, pose, t, gl, pen);
  ctx.restore();
}

/** one small bat seen from the front: centre, half-span, wing lift -1..1, turn. The Count leaves as a few of these. */
export function drawBat(ctx: Ctx, cx: number, cy: number, s: number, lift: number, rot: number) {
  if (s < 0.4) return;
  const c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
  const half: readonly Pt[] = [[0.07, -0.25], [0.13, -0.46], [0.15, -0.2], [0.52, -0.4 - 0.32 * lift], [1, -0.22 - 0.6 * lift], [0.76, 0.14 - 0.42 * lift], [0.6, 0.12 - 0.3 * lift], [0.46, 0.28 - 0.18 * lift], [0.3, 0.16], [0.12, 0.2], [0.06, 0.44]];
  const pts: Pt[] = [...half, ...half.slice().reverse().map(([x, y]) => [-x, y] as Pt)].map(([x, y]) => [cx + x * c - y * sn, cy + x * sn + y * c] as Pt);
  mass(ctx, [{ p: pts, f: tone(INK, 0.17) }], INK, Math.min(DET, s * 0.14));
}
