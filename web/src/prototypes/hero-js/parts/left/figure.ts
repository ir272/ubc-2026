// The three game characters, built from closed, opaque, outlined shapes on a small skeleton:
//   cap   (ink)    upright and cheerful: cap with brim and button, hair tufts, satchel on a strap, rolled sleeves
//   pack  (orange) short and stout: aviator cap with goggles, a big pack with bedroll, buckles and a dangling mug
//   scarf (blue)   tall and narrow: deep hood with two bright eyes, a long scarf, a ragged cloak, a lantern
// The walk is driven by distance, not time: a foot planted on the ground stays where it is while the body
// passes over it (contact, down, passing, up), the hips ride on the legs through two-bone IK, arms swing
// opposite the legs and the head, pack, satchel, scarf and hem all follow a beat late.
import { BLUE, GOLD, INK, ORANGE, WARM } from '../../engine/layout';
import type { Pt } from '../../engine/types';
import { GREEN_SHADE, TAU, capsule, clamp01, curve, disc, fillPts, lerp, line, mod, seg, shape, smooth, taper, tone, type Ctx } from './kit';

export type Kind = 'cap' | 'pack' | 'scarf';

export interface Pose {
  /** walk cycle phase in radians; advance it by TAU per cycleLength() of travel so the feet never slide */
  phase: number;
  /** 0 = standing, 1 = walking */
  amp: number;
  /** 0..1 greeting, each character in its own way */
  wave?: number;
  /** 0..1 bending down to look at something on the ground */
  bend?: number;
  /** -1..1 head tilt, positive looks up */
  look?: number;
  /** 0..1 legs tucked, arms up (a jump) */
  tuck?: number;
  /** 0..1 knees bent (anticipation, landing) */
  crouch?: number;
  /** wind at the character, -1..1 */
  wind?: number;
  /** 0.4..1: how long the stride is (short on the cut steps); advance the phase by distance / (stride * cycleLength) */
  stride?: number;
  /** 0..1 cap: both arms thrown up after something overhead */
  reach?: number;
  /** 0..1 pack: staff planted, the back of a glove drawn across the brow */
  wipe?: number;
  /** the ground under the body (smoothed); feet use the exact surface */
}

interface Rig {
  thigh: number; shin: number; torso: number; headR: number; step: number; lift: number; bob: number; lean: number;
  armU: number; armF: number; swing: number; elbow: number; size: number; foot: number; legR: readonly [number, number, number];
  armR: readonly [number, number, number]; color: string;
}
const RIGS: Record<Kind, Rig> = {
  cap: { thigh: 20, shin: 20, torso: 36, headR: 19, step: 46, lift: 10, bob: 2.6, lean: 0.1, armU: 15, armF: 14, swing: 0.95, elbow: 0.8, size: 1.4, foot: 1, legR: [6.8, 5.5, 4.3], armR: [5.6, 4.5, 3.3], color: INK },
  pack: { thigh: 13, shin: 13, torso: 31, headR: 20, step: 30, lift: 7, bob: 3.2, lean: 0.15, armU: 12, armF: 11, swing: 0.6, elbow: 0.6, size: 1.54, foot: 1.28, legR: [7.8, 6.6, 5.4], armR: [6.2, 5.2, 4.2], color: ORANGE },
  scarf: { thigh: 25, shin: 25, torso: 44, headR: 16, step: 58, lift: 6, bob: 1.4, lean: 0.07, armU: 17, armF: 16, swing: 0.3, elbow: 0.9, size: 1.36, foot: 0.95, legR: [5.4, 4.4, 3.5], armR: [5.2, 4.6, 4.2], color: BLUE },
};

/** how far the character travels in one full walk cycle (two steps), in scene units at scale s */
export const cycleLength = (kind: Kind, s = 1) => 2 * RIGS[kind].step * RIGS[kind].size * s;

const OUT = 2.3, DET = 1.5, HAIR = 1.05;

function blink(t: number, seed: number): boolean {
  return mod(t + seed * 1.7, 3.3 + seed * 0.9) < 0.12;
}

interface Leg { knee: Pt; ankle: Pt; fa: number; u: number }

export function drawWalker(ctx: Ctx, kind: Kind, x: number, y: number, s: number, pose: Pose, t: number, ground: (x: number) => number) {
  const R = RIGS[kind];
  const sz = s * R.size;
  if (sz <= 0.02) return;
  const C = R.color;
  const amp = pose.amp, ph = pose.phase;
  const wave = pose.wave ?? 0, bend = pose.bend ?? 0, look = pose.look ?? 0, tuck = pose.tuck ?? 0, crouch = pose.crouch ?? 0;
  const wnd = pose.wind ?? 0;
  const gl = (fx: number) => (ground(x + fx * sz) - y) / sz;
  const body = tone(C, 0.16), shade = tone(C, 0.08), lit = tone(C, 0.3), farLine = tone(C, 0.6);
  const skin = kind === 'scarf' ? tone(C, 0.4) : tone(WARM, 0.56), skinShade = tone(WARM, 0.34), skinLine = kind === 'scarf' ? C : tone(WARM, 0.95);

  // ---- skeleton ----
  const stride = pose.stride ?? 1, reach = pose.reach ?? 0, wipe = pose.wipe ?? 0;
  const step = R.step * stride;
  const bounce = kind === 'pack' ? wave * 7 * Math.abs(Math.sin(t * 6)) : 0;
  const LL = R.thigh + R.shin;
  const hipStand = LL * 0.985 + 4 * R.foot, hipWalk = Math.sqrt(LL * LL - (step / 2) ** 2) + 4 * R.foot + R.bob * 0.7;
  const hip: [number, number] = [-bend * 5 - wipe * 2, -(lerp(hipStand, hipWalk, amp) - LL * (crouch * 0.22 + bend * 0.1 + tuck * 0.05)) + R.bob * amp * Math.cos(2 * ph - 0.7) - bounce];
  // where each ankle wants to be. A planted foot stays on the exact surface where it landed; a swinging
  // foot travels from the tread it left to the tread it will land on.
  const target = (off: number, stand: number) => {
    const u = mod((ph + off) / TAU, 1);
    let fx: number, lift = 0, fa: number, gy: number;
    const idle = (1 - amp) * stand;
    if (u < 0.5) {
      const k = u / 0.5;
      fx = (step / 2 - step * k) * amp + idle;
      fa = k < 0.15 ? -0.35 * (1 - k / 0.15) : k > 0.7 ? 0.55 * ((k - 0.7) / 0.3) : 0;
      if (k > 0.7) lift = 6 * R.foot * ((k - 0.7) / 0.3);
      gy = gl(fx);
    } else {
      const k = (u - 0.5) / 0.5, e = k * k * (3 - 2 * k);
      fx = (-step / 2 + step * e) * amp + idle;
      lift = R.lift * (0.5 + 0.5 * stride) * Math.sin(Math.PI * k) ** 0.9 + 6 * R.foot * (1 - k) ** 2;
      fa = lerp(0.55, -0.35, smooth(0.15, 1, k));
      gy = lerp(gl(-(k + 0.5) * step * amp + idle), gl((1.5 - k) * step * amp + idle), e);
    }
    lift *= amp;
    fa *= amp;
    fx = lerp(fx, stand * 1.6 + 3, tuck);
    lift += tuck * (R.thigh * 0.7);
    fa = lerp(fa, 0.6, tuck);
    return { ax: fx, ay: gy * (1 - tuck) - lift - 4 * R.foot, fa, u };
  };
  const tn = target(0, 5), tf = target(Math.PI, -5);
  // the hips ride low enough for both legs to reach (this is what makes a walker sink onto each step down)
  for (const tg of [tn, tf]) {
    const dx = tg.ax - hip[0], m = LL * 0.985;
    if (Math.abs(dx) < m) hip[1] = Math.max(hip[1], tg.ay - Math.sqrt(m * m - dx * dx));
  }
  const leg = (tg: { ax: number; ay: number; fa: number; u: number }): Leg => {
    let ax = tg.ax, ay = tg.ay;
    const dx = ax - hip[0], dy = ay - hip[1];
    const d0 = Math.hypot(dx, dy) || 1;
    const d = Math.min(d0, LL * 0.998);
    ax = hip[0] + (dx / d0) * d;
    ay = hip[1] + (dy / d0) * d;
    const base = Math.atan2(dy, dx);
    const th = Math.acos(Math.max(-1, Math.min(1, (R.thigh * R.thigh + d * d - R.shin * R.shin) / (2 * R.thigh * d))));
    return { knee: [hip[0] + R.thigh * Math.cos(base - th), hip[1] + R.thigh * Math.sin(base - th)], ankle: [ax, ay], fa: tg.fa, u: tg.u };
  };
  const near = leg(tn), far = leg(tf);

  const waddle = kind === 'pack' ? 0.09 * Math.sin(ph) * amp : kind === 'cap' ? 0.03 * Math.sin(ph) * amp : 0;
  const tl = R.lean * amp + bend * 0.8 + waddle + (kind === 'scarf' ? -wave * 0.12 : 0) - tuck * 0.1 - reach * 0.16 + wipe * 0.2;
  const U: Pt = [Math.sin(tl), -Math.cos(tl)], V: Pt = [Math.cos(tl), Math.sin(tl)];
  const P = (u: number, v: number): Pt => [hip[0] + U[0] * u + V[0] * v, hip[1] + U[1] * u + V[1] * v];
  const neck = P(R.torso, 0);
  const hl = tl * 0.45 - look * 0.4 + bend * 0.25 + wipe * 0.16;
  const late = R.bob * 0.6 * amp * Math.cos(2 * ph - 1.5);
  const H: Pt = [neck[0] + Math.sin(hl) * R.headR * 0.78, neck[1] - Math.cos(hl) * R.headR * 0.78 + late];
  // a point on the head, in the head's own tilted frame (hx forward, hy down)
  const ch = Math.cos(hl * 0.8), sh = Math.sin(hl * 0.8);
  const HP = (hx: number, hy: number): Pt => [H[0] + hx * ch - hy * sh, H[1] + hx * sh + hy * ch];

  const arm = (side: number) => {
    // side +1 = near arm (swings against the near leg), -1 = far arm
    const sw = -side * Math.cos(ph) * amp;
    let stretch = 1;
    let aU = R.swing * sw + 0.05, aF = aU + R.elbow * (0.45 + 0.55 * Math.max(0, sw)) * (0.35 + 0.65 * amp) + 0.15;
    if (kind === 'scarf' && side > 0) {
      // the lantern is carried out in front
      aU = 0.8 + 0.1 * sw;
      aF = aU + 0.7;
    }
    if (kind === 'pack' && side > 0) {
      // the staff hand
      aU = 0.5 + 0.34 * sw;
      aF = aU + 1.2;
    }
    if (bend > 0 && side > 0) {
      aU = lerp(aU, 0.75, bend);
      aF = lerp(aF, 0.5, bend);
    }
    if (tuck > 0) {
      aU = lerp(aU, side > 0 ? 2.2 : -2.0, tuck * 0.8);
      aF = lerp(aF, side > 0 ? 2.7 : -2.5, tuck * 0.8);
    }
    if (reach > 0) {
      aU = lerp(aU, side > 0 ? 2.72 : 2.3, reach);
      aF = lerp(aF, side > 0 ? 2.95 : 2.62, reach);
      stretch = 1 + 0.28 * reach;
    }
    if (wipe > 0) {
      if (side > 0) {
        aU = lerp(aU, 0.62, wipe);
        aF = lerp(aF, 1.62, wipe);
      } else {
        aU = lerp(aU, 2.5, wipe);
        aF = lerp(aF, 3.0 + 0.22 * Math.sin(t * 5.6), wipe);
        stretch = 1 + 0.25 * wipe;
      }
    }
    if (wave > 0) {
      if (kind === 'cap' && side > 0) {
        aU = lerp(aU, 2.0, wave);
        aF = lerp(aF, 2.5 + 0.5 * Math.sin(t * 9.2), wave);
        stretch = 1 + 0.3 * wave;
      } else if (kind === 'pack') {
        aU = lerp(aU, side > 0 ? 2.4 : 1.2, wave);
        aF = lerp(aF, side > 0 ? 2.8 : 2.2 + 0.5 * Math.sin(t * 12), wave);
        stretch = 1 + 0.15 * wave;
      } else if (kind === 'scarf' && side > 0) {
        aU = lerp(aU, 2.5, wave);
        aF = lerp(aF, 2.8 + 0.1 * Math.sin(t * 3.3), wave);
        stretch = 1 + 0.42 * wave;
      }
    }
    const sp = P(R.torso - 6, kind === 'scarf' ? 1 : 0.5);
    const a1 = aU - tl, a2 = aF - tl;
    const el: Pt = [sp[0] + Math.sin(a1) * R.armU * stretch, sp[1] + Math.cos(a1) * R.armU * stretch];
    const hand: Pt = [el[0] + Math.sin(a2) * R.armF * stretch, el[1] + Math.cos(a2) * R.armF * stretch];
    return { sp, el, hand, a2 };
  };
  const armN = arm(1), armF = arm(-1);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sz, sz);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // contact shadow and a dust tick at each footfall
  const off = clamp01(-hip[1] / (R.thigh + R.shin) - 0.8) * 4 + tuck;
  disc(ctx, 0, gl(0) + 2, (R.step * 0.32 + 9) * (1 - 0.4 * clamp01(off)), GREEN_SHADE, null, 0, 0.8 * (1 - 0.5 * clamp01(off)), 3.2);
  for (const l of [near, far]) {
    if (amp > 0.5 && l.u < 0.2 && tuck < 0.1) {
      const k = l.u / 0.2, fx = l.ankle[0] - 6, fy = l.ankle[1] + 4 * R.foot;
      seg(ctx, fx - 2 - k * 7, fy - 1 - k * 3, fx - 6 - k * 9, fy - 3 - k * 5, 1.2, C, 0.6 * (1 - k));
      seg(ctx, fx - 4 - k * 5, fy, fx - 9 - k * 8, fy - 0.5, 1.2, C, 0.5 * (1 - k));
    }
  }

  const boot = (l: Leg, fill: string, stroke: string) => {
    const f = R.foot, c = Math.cos(l.fa), sn = Math.sin(l.fa);
    const B = (bx: number, by: number): Pt => [l.ankle[0] + (bx * c - by * sn) * f, l.ankle[1] + (bx * sn + by * c) * f];
    const toe = kind === 'scarf' ? 15 : 12.5;
    shape(ctx, [B(-5, -5), B(4.2, -5.4), B(8.5, -2.6), B(toe, kind === 'scarf' ? -1.5 : 0.2), B(toe + 0.5, 4), B(-5.6, 4), B(-6, 0)], fill, stroke, OUT * 0.9);
    line(ctx, [B(-5.4, 1.8), B(toe, 1.8)], HAIR, stroke, 0.7);
    if (kind === 'pack') {
      line(ctx, [B(-5, -3), B(4.6, -3.4)], DET, stroke);
      for (let i = 0; i < 3; i++) line(ctx, [B(-2 + i * 4.6, 2), B(-2 + i * 4.6, 4)], HAIR, stroke, 0.8);
    } else if (kind === 'cap') {
      line(ctx, [B(-5.2, -2.8), B(4.6, -3.2)], HAIR, stroke);
      line(ctx, [B(3, -3.6), B(6, -1.2)], HAIR, stroke, 0.8);
    }
  };
  const drawLeg = (l: Leg, isFar: boolean) => {
    const fill = isFar ? shade : body, st = isFar ? farLine : C;
    capsule(ctx, hip[0], hip[1], l.knee[0], l.knee[1], R.legR[0], R.legR[1], fill, st, OUT);
    capsule(ctx, l.knee[0], l.knee[1], l.ankle[0], l.ankle[1], R.legR[1], R.legR[2], fill, st, OUT);
    // a fold at the knee
    const kx = l.knee[0], ky = l.knee[1];
    seg(ctx, kx - R.legR[1] * 0.7, ky + 0.5, kx - 0.5, ky + 1.6, HAIR, st, 0.8);
    boot(l, isFar ? tone(C, 0.14) : lit, st);
  };
  /** a mitt: a palm that widens from the wrist, a rounded finger end, a thumb on the forward side */
  const mitt = (w: Pt, a2: number, r: number, fill: string, st: string): Pt => {
    const dx = Math.sin(a2), dy = Math.cos(a2), nx = dy, ny = -dx;
    const M = (u: number, v: number): Pt => [w[0] + (dx * u + nx * v) * r, w[1] + (dy * u + ny * v) * r];
    shape(ctx, [M(0.2, 0.6), M(0.7, 1.55), M(1.25, 1.6), M(1.4, 0.8)], fill, st, DET);
    shape(ctx, curve([M(-0.2, -0.82), M(0.6, -1.02), M(1.5, -0.95), M(2.2, -0.5), M(2.3, 0.2), M(1.8, 0.85), M(0.9, 0.98), M(-0.2, 0.8)], 3, true), fill, st, OUT * 0.8);
    line(ctx, [M(1.3, -0.1), M(2.1, -0.15)], HAIR, st, 0.75);
    line(ctx, [M(1.3, 0.4), M(1.95, 0.4)], HAIR, st, 0.5);
    return M(0.9, 0.2);
  };
  /** a limb of two tapered segments that overlap at the elbow, a fold inside the bend, a cuff, a mitt */
  const drawArm = (a: ReturnType<typeof arm>, isFar: boolean, sleeve: string, foreFill: string, cuff: 'roll' | 'glove' | 'bell' = 'roll') => {
    const st = isFar ? farLine : C;
    const sk = isFar ? skinShade : skin;
    const [r0, r1, r2] = R.armR;
    capsule(ctx, a.el[0], a.el[1], a.hand[0], a.hand[1], r1 * 0.94, cuff === 'bell' ? r2 * 1.3 : r2, isFar ? (cuff === 'roll' ? skinShade : shade) : foreFill, cuff === 'roll' && !isFar ? skinLine : st, OUT);
    capsule(ctx, a.sp[0], a.sp[1], a.el[0], a.el[1], r0, r1 * 1.06, isFar ? shade : sleeve, st, OUT);
    const dx = Math.sin(a.a2), dy = Math.cos(a.a2), nx = dy, ny = -dx;
    if (cuff === 'roll') {
      // the rolled sleeve: a fat band just below the elbow
      const cx = a.el[0] + dx * 2.2, cy = a.el[1] + dy * 2.2, w = r1 + 1.5;
      shape(ctx, [[cx - nx * w - dx * 1.8, cy - ny * w - dy * 1.8], [cx + nx * w - dx * 1.8, cy + ny * w - dy * 1.8], [cx + nx * w + dx * 1.8, cy + ny * w + dy * 1.8], [cx - nx * w + dx * 1.8, cy - ny * w + dy * 1.8]], isFar ? shade : lit, st, DET);
    } else {
      // a fold inside the elbow, and a band at the wrist
      seg(ctx, a.el[0] + nx * r1 * 0.9, a.el[1] + ny * r1 * 0.9, a.el[0] + nx * 0.6 + dx * 2, a.el[1] + ny * 0.6 + dy * 2, HAIR, st, 0.85);
      const cx = a.hand[0] - dx * 1.2, cy = a.hand[1] - dy * 1.2, w = (cuff === 'bell' ? r2 * 1.3 : r2) + 1.3;
      shape(ctx, [[cx - nx * w - dx * 1.7, cy - ny * w - dy * 1.7], [cx + nx * w - dx * 1.7, cy + ny * w - dy * 1.7], [cx + nx * w + dx * 1.7, cy + ny * w + dy * 1.7], [cx - nx * w + dx * 1.7, cy - ny * w + dy * 1.7]], isFar ? shade : tone(C, 0.42), st, DET);
    }
    const glove = cuff === 'glove';
    return mitt(a.hand, a.a2, kind === 'pack' ? 4.7 : 4.1, glove ? (isFar ? tone(C, 0.2) : tone(C, 0.36)) : cuff === 'bell' ? tone(C, 0.5) : sk, glove || cuff === 'bell' ? st : isFar ? tone(WARM, 0.6) : skinLine);
  };
  /** a small nose on the profile and the line of the cheek */
  const nose = (r: number) => {
    shape(ctx, curve([HP(r - 3.4, -1.4), HP(r + 2.6, 1.2), HP(r + 3.2, 4), HP(r + 0.6, 5.6), HP(r - 3.6, 5.4)], 3, true), skin, skinLine, DET);
    fillPts(ctx, [HP(r - 5.4, -1.6), HP(r - 1.3, -0.2), HP(r - 1.5, 5), HP(r - 5.6, 6.4)], skin);
  };
  const eye = (p: Pt, r: number, closed: boolean, col: string) => {
    if (closed) seg(ctx, p[0] - r, p[1], p[0] + r, p[1], 1.3, col);
    else disc(ctx, p[0], p[1], r, col);
  };
  const happy = clamp01(wave + tuck);

  if (kind === 'cap') {
    drawArm(armF, true, shade, skinShade);
    drawLeg(far, true);
    drawLeg(near, false);
    // shirt
    const tp = curve([P(-3, -9), P(-3, 9.5), P(12, 10.5), P(26, 9.5), P(34, 6), P(37.5, 2), P(37.5, -4), P(28, -9), P(12, -9.6)], 5, true);
    shape(ctx, tp, body, C, OUT);
    fillPts(ctx, curve([P(-2, 5), P(-2, 9), P(12, 10), P(26, 9), P(33, 5.4), P(26, 4.5), P(12, 5.4)], 4, true), shade);
    fillPts(ctx, curve([P(4, -8.6), P(18, -8.6), P(30, -7.4), P(28, -5.4), P(12, -6)], 4, true), lit);
    line(ctx, [P(2.5, -9.4), P(2.5, 10)], DET, C);
    line(ctx, [P(-0.2, -9.2), P(-0.2, 9.6)], HAIR, C, 0.7);
    shape(ctx, [P(1, 2), P(4, 2), P(4, 5.6), P(1, 5.6)], tone(GOLD, 0.6), GOLD, HAIR);
    line(ctx, [P(37, 3), P(31, 5.4), P(33.5, 0.5)], DET, C);
    line(ctx, [P(20, 9.6), P(16, 3), P(10, 2.5)], HAIR, C, 0.55);
    // satchel strap across the chest, satchel bouncing on the hip a beat late
    line(ctx, [P(36, -4.5), P(20, 3), P(5, 9.6)], 2.4, tone(ORANGE, 0.85));
    const sb = 2.2 * amp * Math.cos(2 * ph - 1.9), sa = 0.16 * amp * Math.sin(ph - 0.9) + tl * 0.5;
    const sc = P(4, 2), cs = Math.cos(sa), ss = Math.sin(sa);
    const SP = (bx: number, by: number): Pt => [sc[0] + bx * cs - by * ss, sc[1] + sb + bx * ss + by * cs];
    shape(ctx, [SP(-9, 0), SP(8, 0), SP(9, 11), SP(6.5, 15), SP(-7.5, 15), SP(-10, 11)], tone(ORANGE, 0.3), ORANGE, OUT * 0.9);
    shape(ctx, [SP(-9.4, 0), SP(8.4, 0), SP(8.8, 6), SP(-0.5, 9), SP(-9.8, 6)], tone(ORANGE, 0.48), ORANGE, DET);
    disc(ctx, SP(-0.5, 7.4)[0], SP(-0.5, 7.4)[1], 1.6, GOLD);
    line(ctx, [SP(-6, 12.6), SP(5, 12.6)], HAIR, ORANGE, 0.7);
    // near arm: rolled sleeve, bare forearm. While it waves it passes behind the big head, so the face stays clear
    const nearArm = () => {
      drawArm(armN, false, body, skin);
    };
    if (wave > 0.02 || reach > 0.3) nearArm();
    // head: hair tufts behind, face, cap
    for (let i = 0; i < 4; i++) {
      const a0 = HP(-13 + i * 2.5, 3 + i * 3.2), fl = Math.sin(t * 3.1 + i) * 0.8 - wnd * 2 + amp * Math.cos(2 * ph - 2.2 - i * 0.3) * 1.2;
      taper(ctx, [a0, HP(-21 + i * 2 + fl * 0.4, 7 + i * 3.6 + fl), HP(-25 + i * 2.5 + fl, 12 + i * 3.4 + fl * 1.5)], 6.5, C, 1, 0, 0.9);
    }
    disc(ctx, H[0], H[1], R.headR - 1, skin, C, OUT, 1, R.headR, hl * 0.8);
    nose(R.headR - 1);
    // shade under the cap and along the jaw, a blush, the ear as a small C
    fillPts(ctx, curve([HP(-17, -2), HP(0, -4), HP(17, -5), HP(16, -1.6), HP(0, -0.6), HP(-17, 2)], 3, true), skinShade, 0.9);
    fillPts(ctx, curve([HP(-14, 9), HP(-6, 15.4), HP(4, 17.6), HP(-2, 13), HP(-9, 7)], 3, true), skinShade, 0.9);
    disc(ctx, HP(3.6, 7.4)[0], HP(3.6, 7.4)[1], 3, tone(ORANGE, 0.85), null, 0, 0.5);
    {
      const e = HP(-7.4, 3.4);
      ctx.beginPath();
      ctx.ellipse(e[0], e[1], 3.4, 4.4, hl * 0.8, 0.9, TAU - 0.9);
      ctx.strokeStyle = skinLine;
      ctx.lineWidth = DET;
      ctx.stroke();
      line(ctx, [HP(-8.6, 2.4), HP(-7, 3.8), HP(-8.2, 5)], HAIR, skinLine, 0.8);
    }
    const bl = blink(t, 1), wide = Math.max(happy, reach);
    eye(HP(7.5, 1.2), 2.3 + wide * 0.5, bl, '#0c100b');
    eye(HP(14.2, 0.8), 1.9 + wide * 0.4, bl, '#0c100b');
    if (!bl) {
      disc(ctx, HP(8.2, 0.5)[0], HP(8.2, 0.5)[1], 0.8, INK);
      disc(ctx, HP(14.8, 0.2)[0], HP(14.8, 0.2)[1], 0.7, INK);
    }
    line(ctx, curve([HP(4.4, -3.6 - wide * 2), HP(7.4, -5.2 - wide * 2.2), HP(10.4, -4.6 - wide * 2)], 3), DET, '#0c100b');
    line(ctx, curve([HP(12.4, -4.8 - wide * 2), HP(14.6, -5.4 - wide * 2), HP(16.4, -4.2 - wide * 1.6)], 3), DET, '#0c100b');
    if (wide > 0.3) shape(ctx, curve([HP(7.6, 8), HP(11.4, 7.4), HP(15, 7.6), HP(14, 12.4), HP(10.4, 13)], 3, true), '#0c100b', skinLine, HAIR);
    else {
      line(ctx, curve([HP(7.4, 8.4), HP(11, 11), HP(15, 8.6)], 4), DET, '#0c100b');
      line(ctx, [HP(6.6, 7.4), HP(7.6, 9)], HAIR, '#0c100b', 0.8);
    }
    // the cap
    const capPts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 1.05 + (i / 12) * Math.PI * 0.93;
      capPts.push(HP(Math.cos(a) * 20, -1.5 + Math.sin(a) * 20.6));
    }
    shape(ctx, [...capPts, HP(18.5, -5.5), HP(0, -4.6), HP(-19, -3)], tone(C, 0.58), C, OUT);
    shape(ctx, [HP(14, -8.6), HP(26, -7), HP(34, -3.2), HP(33, -1), HP(24, -3.2), HP(16, -4.6)], tone(C, 0.8), C, DET);
    line(ctx, curve([HP(-18, -4.8), HP(0, -7.2), HP(17, -7.6)], 4), HAIR, tone(C, 0.2), 0.9);
    line(ctx, curve([HP(-1, -21.6), HP(6, -15), HP(9, -7.4)], 4), HAIR, tone(C, 0.2), 0.8);
    disc(ctx, HP(-1, -22.4)[0], HP(-1, -22.4)[1], 2.2, tone(ORANGE, 0.9), C, 1);
    if (!(wave > 0.02 || reach > 0.3)) nearArm();
  } else if (kind === 'pack') {
    drawArm(armF, true, shade, shade, 'glove');
    drawLeg(far, true);
    drawLeg(near, false);
    // the pack swings a beat behind the body; the mug dangles behind that
    const pa = 0.08 * amp * Math.sin(ph - 0.9) - bend * 0.1, pv = 1.6 * amp * Math.cos(2 * ph - 1.6);
    const piv = P(28, -9), pc = Math.cos(tl + pa), ps = Math.sin(tl + pa);
    const K = (u: number, v: number): Pt => [piv[0] + ps * (u - 28) + pc * (v + 9), piv[1] - pc * (u - 28) + ps * (v + 9) + pv];
    const hang = K(3, -31), ma = 0.5 * amp * Math.sin(2 * ph - 2.4) - wnd * 0.35 + 0.08 * Math.sin(t * 2.3);
    const M = (bx: number, by: number): Pt => [hang[0] + bx * Math.cos(ma) - by * Math.sin(ma), hang[1] + bx * Math.sin(ma) + by * Math.cos(ma)];
    line(ctx, [hang, M(0, 6)], DET, C);
    shape(ctx, [M(-4.6, 6), M(4.6, 6), M(4, 15), M(-4, 15)], tone(INK, 0.3), INK, DET);
    line(ctx, curve([M(-4.6, 8), M(-8, 10.5), M(-4.2, 13)], 4), DET, INK);
    line(ctx, [M(-3.6, 8.6), M(3.8, 8.6)], HAIR, INK, 0.7);
    // bedroll on top
    const br = curve([K(33, -31), K(40, -30), K(42, -18), K(40, -7), K(33, -6), K(31, -18)], 5, true);
    shape(ctx, br, tone(C, 0.3), C, OUT * 0.9);
    line(ctx, [K(32, -24), K(41.4, -24)], DET, C);
    line(ctx, [K(32, -12), K(41.4, -12)], DET, C);
    disc(ctx, K(36.5, -30.4)[0], K(36.5, -30.4)[1], 4.2, tone(C, 0.2), C, HAIR, 1, 2.2, tl + pa);
    disc(ctx, K(36.5, -30.4)[0], K(36.5, -30.4)[1], 2, null, C, HAIR, 0.8, 1, tl + pa);
    // pack body
    const pk = curve([K(0, -12), K(-1, -30), K(8, -34), K(24, -34), K(32, -30), K(32, -11), K(16, -9)], 5, true);
    shape(ctx, pk, tone(C, 0.2), C, OUT);
    fillPts(ctx, curve([K(1, -13), K(0, -22), K(14, -21), K(30, -22), K(31, -12), K(16, -10)], 4, true), tone(C, 0.1));
    fillPts(ctx, curve([K(8, -33), K(24, -33), K(30, -30), K(24, -29.5), K(8, -30)], 4, true), tone(C, 0.36));
    line(ctx, curve([K(22, -33.4), K(21, -22), K(22.4, -10.4)], 4), DET, C);
    shape(ctx, [K(3, -31), K(15, -31.6), K(15, -21), K(3, -20.4)], tone(C, 0.26), C, DET);
    line(ctx, [K(11.5, -31.2), K(11.5, -20.8)], HAIR, C);
    disc(ctx, K(9, -26)[0], K(9, -26)[1], 1.5, GOLD);
    shape(ctx, [K(20, -27), K(24.4, -27), K(24.4, -23.4), K(20, -23.4)], tone(GOLD, 0.6), GOLD, HAIR);
    line(ctx, [K(28, -33), K(28, -11)], HAIR, C, 0.6);
    // jacket
    const tp = curve([P(-3, -12), P(-3.5, 13), P(10, 15.5), P(22, 13.5), P(30, 7.5), P(33.5, 2), P(33.5, -5), P(24, -12), P(10, -13)], 5, true);
    shape(ctx, tp, body, C, OUT);
    fillPts(ctx, curve([P(-2.5, 7), P(-2.5, 12.4), P(10, 14.8), P(22, 12.8), P(29, 7), P(20, 7.4), P(8, 8.6)], 4, true), shade);
    fillPts(ctx, curve([P(4, -12), P(16, -12), P(26, -10), P(22, -8.4), P(8, -9.4)], 4, true), lit);
    line(ctx, [P(0.6, -12.4), P(0.2, 13.6)], DET, C);
    line(ctx, curve([P(32, 4.5), P(18, 8), P(1, 9)], 4), HAIR, C, 0.8);
    for (let i = 0; i < 3; i++) disc(ctx, P(8 + i * 8, 8.4 - i * 0.6)[0], P(8 + i * 8, 8.4 - i * 0.6)[1], 1.1, C);
    shape(ctx, [P(6, -4), P(14, -4), P(14, 4), P(6, 4)], tone(C, 0.22), C, HAIR);
    line(ctx, [P(11.6, -4), P(11.6, 4)], HAIR, C);
    // shoulder strap and chest buckle
    line(ctx, curve([P(31.5, -6), P(25, 4), P(13, 8), P(6, -12)], 5), 2.8, tone(C, 0.75));
    shape(ctx, [P(21, 3.4), P(25, 4.6), P(23.8, 8.2), P(19.8, 7)], tone(GOLD, 0.6), GOLD, HAIR);
    // collar roll
    disc(ctx, P(33, -1)[0], P(33, -1)[1], 8.5, tone(C, 0.4), C, DET, 1, 4, tl + 1.57);
    // head: aviator cap with ear flap, goggles pushed up
    disc(ctx, H[0], H[1], R.headR, skin, C, OUT, 1, R.headR - 1, hl * 0.8);
    nose(R.headR);
    fillPts(ctx, curve([HP(-10, 10), HP(-2, 16.4), HP(8, 18), HP(2, 13.4), HP(-6, 8)], 3, true), skinShade, 0.9);
    const hat: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 0.82 + (i / 12) * Math.PI * 1.02;
      hat.push(HP(Math.cos(a) * 21, -0.5 + Math.sin(a) * 20.4));
    }
    shape(ctx, [...hat, HP(12, -6.5), HP(0, -2.6), HP(-4, 6), HP(-16.6, 11)], tone(C, 0.5), C, OUT);
    const fw = 1.4 * amp * Math.cos(2 * ph - 2.6) - wnd * 1.5;
    shape(ctx, curve([HP(-13, 2), HP(-3.6, 1), HP(-1.6, 12 + fw * 0.4), HP(-6 + fw, 19 + fw * 0.3), HP(-12.4 + fw, 15)], 4, true), tone(C, 0.36), C, DET);
    disc(ctx, HP(-6.4 + fw * 0.6, 14)[0], HP(-6.4 + fw * 0.6, 14)[1], 1.3, GOLD);
    line(ctx, curve([HP(-8, -19), HP(-2, -11), HP(-1.4, -2.6)], 4), HAIR, tone(C, 0.15), 0.9);
    line(ctx, curve([HP(-19.6, -4.4), HP(-4, -9), HP(18, -9.6)], 4), 3, tone(BLUE, 0.6));
    disc(ctx, HP(9.4, -11)[0], HP(9.4, -11)[1], 6.6, tone(BLUE, 0.42), BLUE, DET, 1, 5.6, hl * 0.8 - 0.1);
    disc(ctx, HP(18.4, -9.4)[0], HP(18.4, -9.4)[1], 3.6, tone(BLUE, 0.42), BLUE, DET, 1, 5, hl * 0.8 - 0.1);
    line(ctx, [HP(6.4, -13.4), HP(9, -14.6)], HAIR, INK, 0.9);
    const bl = blink(t, 2) || wipe > 0.4;
    eye(HP(8.6, 1), 2.4, bl, '#0c100b');
    eye(HP(15.4, 0.6), 2, bl, '#0c100b');
    if (!bl) {
      disc(ctx, HP(9.3, 0.3)[0], HP(9.3, 0.3)[1], 0.8, INK);
      disc(ctx, HP(16, 0)[0], HP(16, 0)[1], 0.7, INK);
    }
    line(ctx, curve([HP(5.4, -2.6 - happy + wipe * 1.5), HP(8.4, -4.2 - happy), HP(11, -3.8 - happy)], 3), DET, '#0c100b');
    line(ctx, curve([HP(13.4, -4 - happy), HP(15.6, -4.4 - happy), HP(17.6, -3 - happy + wipe)], 3), DET, '#0c100b');
    disc(ctx, HP(4.6, 7.8)[0], HP(4.6, 7.8)[1], 3.2, tone(ORANGE, 0.9), null, 0, 0.5);
    if (wipe > 0.4) disc(ctx, HP(12.4, 10)[0], HP(12.4, 10)[1], 2.2, '#0c100b', skinLine, HAIR, 1, 2.8); // phew
    else if (happy > 0.3 || bend > 0.5) shape(ctx, curve([HP(8, 7.4), HP(12, 6.8), HP(16, 7), HP(15, 12.4), HP(10.4, 12.8)], 3, true), '#0c100b', skinLine, HAIR);
    else line(ctx, curve([HP(7.6, 7.8), HP(11.6, 11), HP(16, 8)], 4), DET, '#0c100b');
    // the staff: planted ahead, left behind as the body passes over it, then swung forward again
    {
      const su = mod((ph + 1.2) / TAU, 1), D2 = 2 * step;
      let tx = su < 0.6 ? 34 - D2 * su : lerp(34 - D2 * 0.6, 34, smooth(0.6, 1, su)), tlift = su < 0.6 ? 0 : 7 * Math.sin(Math.PI * ((su - 0.6) / 0.4));
      tx = lerp(22, tx, amp) + wipe * 3;
      tlift *= amp;
      const g = armN.hand;
      let T: Pt = [tx, gl(tx) - tlift];
      if (wave > 0) T = [lerp(T[0], g[0] + 10, wave), lerp(T[1], g[1] + 44, wave)];
      const dl = Math.hypot(g[0] - T[0], g[1] - T[1]) || 1, ux = (g[0] - T[0]) / dl, uy = (g[1] - T[1]) / dl;
      const top: Pt = [g[0] + ux * 17, g[1] + uy * 17];
      line(ctx, [T, top], 3.6, tone(WARM, 0.45));
      line(ctx, [[T[0] + 0.8, T[1]], [top[0] + 0.8, top[1]]], 1.3, WARM);
      disc(ctx, top[0], top[1], 3, tone(WARM, 0.6), WARM, 1.2);
      seg(ctx, T[0] + ux * 5 - uy * 2.4, T[1] + uy * 5 + ux * 2.4, T[0] + ux * 5 + uy * 2.4, T[1] + uy * 5 - ux * 2.4, 1.6, GOLD);
      line(ctx, curve([[g[0] + ux * 8, g[1] + uy * 8], [g[0] + ux * 3 - 5, g[1] + uy * 3 + 6 + 1.5 * Math.sin(t * 3 + ph)], [g[0] - 3, g[1] + 10]], 4), HAIR, GOLD, 0.9);
      if (su < 0.08 && amp > 0.5) seg(ctx, T[0] - 3, T[1] - 1, T[0] - 8, T[1] - 4, 1.2, C, 0.6);
    }
    drawArm(armN, false, body, body, 'glove');
    if (wipe >= 0.3) {
      // the far arm comes across in front: the back of the glove on the brow, and two drops flicked off
      mitt(armF.hand, armF.a2, 4.9, tone(C, 0.36), C);
      for (let i = 0; i < 2; i++) {
        const u = mod(t * 1.3 + i * 0.5, 1), p0 = HP(-2 - i * 5, -17);
        disc(ctx, p0[0] - u * 12 - i * 3, p0[1] - 10 * Math.sin(Math.PI * u) + u * 6, 1.3, tone(BLUE, 0.9), null, 0, wipe * (1 - u), 1.9);
      }
    }
  } else {
    drawLeg(far, true);
    drawLeg(near, false);
    // scarf tails streaming behind (drawn before the cloak so the knot sits on top)
    const knot = P(R.torso - 2, -7);
    const tail = (len: number, dy: number, phs: number, fill: string, wdt: number) => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7, lagBob = R.bob * amp * Math.cos(2 * ph - 0.7 - u * 2.4) * 2;
        pts.push([
          knot[0] - u * len * (0.72 + 0.2 * amp + 0.12 * Math.max(0, wnd)) + Math.sin(t * 2.1 + phs) * u * 2,
          knot[1] + dy * u + u * u * len * (0.34 - 0.2 * amp) + Math.sin(t * 4.3 - u * 4.6 + phs) * (0.8 + u * 4.2) * (0.5 + 0.5 * amp) + lagBob,
        ]);
      }
      const Lp: Pt[] = [], Rp: Pt[] = [];
      for (let i = 0; i <= 7; i++) {
        const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(7, i + 1)]!;
        const tx = b[0] - a[0], ty = b[1] - a[1], tn = Math.hypot(tx, ty) || 1, w = wdt * (1 - 0.2 * (i / 7));
        Lp.push([pts[i]![0] - (ty / tn) * w, pts[i]![1] + (tx / tn) * w]);
        Rp.push([pts[i]![0] + (ty / tn) * w, pts[i]![1] - (tx / tn) * w]);
      }
      shape(ctx, [...Lp, ...Rp.reverse()], fill, ORANGE, DET);
      for (const i of [5, 6]) line(ctx, [Lp[i]!, Rp[7 - i]!], HAIR, ORANGE, 0.9);
      const e = pts[7]!, d = pts[6]!;
      for (let k = -1; k <= 1; k++) seg(ctx, e[0], e[1] + k * wdt * 0.7, e[0] + (e[0] - d[0]) * 0.5, e[1] + (e[1] - d[1]) * 0.5 + k * wdt, HAIR, ORANGE);
    };
    tail(44, 6, 1.3, tone(ORANGE, 0.3), 3.2);
    tail(62, -2, 0, tone(ORANGE, 0.5), 3.8);
    // cloak with a ragged hem that trails
    const tr = 3 + 6 * amp + 5 * Math.max(0, wnd) + 1.5 * Math.sin(t * 3.3);
    const hw = (i: number) => Math.sin(t * 4.6 + i * 1.7) * 1.3 * (0.4 + amp);
    const cloak: Pt[] = [
      P(44, 4.5), P(30, 8.6), P(10, 9.6), P(-10, 10.4), P(-21, 10.8 + hw(0)), P(-16.5, 6 + hw(1)), P(-23, 2 + hw(2)), P(-18, -3 - tr * 0.2 + hw(3)),
      P(-25, -7.5 - tr * 0.5 + hw(4)), P(-20, -11.5 - tr * 0.7), P(-27.5, -15.5 - tr + hw(5)), P(-9, -13 - tr * 0.5), P(14, -10.4), P(34, -8.4), P(44, -5.5),
    ];
    shape(ctx, cloak, body, C, OUT);
    fillPts(ctx, [P(42, 4), P(30, 8), P(10, 9), P(-10, 9.8), P(-19, 9.6), P(-15, 5), P(8, 4.4), P(30, 3.6)], shade);
    fillPts(ctx, [P(40, -5), P(14, -9.6), P(-6, -12 - tr * 0.4), P(-4, -8.6 - tr * 0.3), P(14, -6.6), P(38, -2.6)], lit);
    line(ctx, curve([P(38, 0), P(14, 1), P(-8, -1 - tr * 0.2), P(-21, -1.6 - tr * 0.3)], 5), HAIR, C, 0.7);
    line(ctx, curve([P(30, -5), P(8, -6), P(-12, -8 - tr * 0.4)], 5), HAIR, C, 0.5);
    line(ctx, curve([P(26, 5), P(6, 5.6), P(-14, 5.6)], 5), HAIR, C, 0.5);
    shape(ctx, [P(-9, 2.6), P(-2.6, 2.4), P(-2.8, 8), P(-9.2, 8)], tone(C, 0.26), C, HAIR);
    for (let i = 0; i < 3; i++) seg(ctx, P(-8 + i * 2.2, 1.6)[0], P(-8 + i * 2.2, 1.6)[1], P(-8 + i * 2.2, 3.4)[0], P(-8 + i * 2.2, 3.4)[1], HAIR, C, 0.8);
    // near sleeve, and the lantern swinging from the hand
    const sleeve = body;
    void sleeve;
    const la = 0.34 * amp * Math.sin(2 * ph - 2.0) - wnd * 0.3 + 0.06 * Math.sin(t * 2.7) + wave * 0.2 * Math.sin(t * 4.1);
    const hd: Pt = [armN.hand[0] + Math.sin(armN.a2) * 2, armN.hand[1] + Math.cos(armN.a2) * 2];
    const Lt = (bx: number, by: number): Pt => [hd[0] + bx * Math.cos(la) - by * Math.sin(la), hd[1] + 3 + bx * Math.sin(la) + by * Math.cos(la)];
    const fl = 0.75 + 0.2 * Math.sin(t * 9.1) * Math.sin(t * 3.7) + 0.05 * Math.sin(t * 23);
    const lc = Lt(0, 14);
    const gr = ctx.createRadialGradient(lc[0], lc[1], 1, lc[0], lc[1], 34);
    gr.addColorStop(0, `rgba(231,200,115,${0.34 * fl})`);
    gr.addColorStop(1, 'rgba(231,200,115,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(lc[0] - 34, lc[1] - 34, 68, 68);
    line(ctx, curve([Lt(0, 0), Lt(-3, 4), Lt(0, 8), Lt(3, 4), Lt(0, 0)], 3), HAIR, GOLD);
    shape(ctx, [Lt(-3.6, 8), Lt(3.6, 8), Lt(5.4, 11), Lt(5, 18.4), Lt(-5, 18.4), Lt(-5.4, 11)], tone(GOLD, 0.3 + 0.25 * fl), GOLD, DET);
    disc(ctx, lc[0], lc[1] + 0.6, 2.4, tone(GOLD, 0.95), null, 0, 0.6 + 0.4 * fl, 3.2);
    line(ctx, [Lt(-5.2, 11), Lt(5.2, 11)], HAIR, GOLD);
    line(ctx, [Lt(-4, 20), Lt(4, 20)], DET, GOLD);
    drawArm(armN, false, body, body, 'bell');
    // hood: a deep cowl with a drooping tip; the face is in shadow with two bright eyes
    const droop = 2 + 3 * amp * Math.cos(2 * ph - 2.4) * 0.5 + wnd * -2 + Math.sin(t * 2.2) * 0.8;
    const hood = curve([P(R.torso - 1, -7), HP(-17, 6), HP(-20, -7), HP(-17 - droop * 0.4, -18), HP(-23 - droop, -25 + droop * 0.6), HP(-8, -20), HP(4, -19.6), HP(13, -15), HP(17.6, -4), HP(15.4, 8), HP(8, 15), P(R.torso - 1, 6)], 5, true);
    shape(ctx, hood, tone(C, 0.2), C, OUT);
    fillPts(ctx, curve([HP(-16, 4), HP(-18.6, -7), HP(-14, -16), HP(-6, -18.6), HP(-10, -8), HP(-10, 4)], 4, true), tone(C, 0.3));
    disc(ctx, HP(7.4, -1.4)[0], HP(7.4, -1.4)[1], 9.2, '#06090a', tone(C, 0.75), DET, 1, 11.6, hl * 0.8 + 0.12);
    line(ctx, curve([HP(-20, -22 + droop * 0.4), HP(-6, -15), HP(1, -12.4)], 4), HAIR, C, 0.7);
    line(ctx, curve([HP(-17, 0), HP(-10, 6), HP(-4, 13)], 4), HAIR, C, 0.6);
    const bl = blink(t, 3);
    const ec = tone(GOLD, 0.95);
    disc(ctx, HP(7.6, -2.4)[0], HP(7.6, -2.4)[1], 7, GOLD, null, 0, 0.1);
    if (bl) {
      seg(ctx, HP(3, -2.4)[0], HP(3, -2.4)[1], HP(6.6, -2.4)[0], HP(6.6, -2.4)[1], 1.3, ec);
      seg(ctx, HP(9.6, -2.4)[0], HP(9.6, -2.4)[1], HP(12.6, -2.4)[0], HP(12.6, -2.4)[1], 1.3, ec);
    } else {
      disc(ctx, HP(4.8, -2.4)[0], HP(4.8, -2.4)[1], 1.9, ec, null, 0, 1, 2.7 - happy * 0.9);
      disc(ctx, HP(11.2, -2.6)[0], HP(11.2, -2.6)[1], 1.6, ec, null, 0, 1, 2.4 - happy * 0.8);
    }
    // the scarf wrapped at the neck, knot behind
    shape(ctx, curve([P(R.torso + 2.4, -8.6), P(R.torso + 3.4, 0), P(R.torso + 1, 9), P(R.torso - 5.6, 8.4), P(R.torso - 4, 0), P(R.torso - 5, -8)], 4, true), tone(ORANGE, 0.5), ORANGE, OUT * 0.85);
    line(ctx, curve([P(R.torso - 1, -6), P(R.torso, 0), P(R.torso - 2, 7)], 4), HAIR, ORANGE, 0.8);
    disc(ctx, knot[0], knot[1], 3.6, tone(ORANGE, 0.6), ORANGE, DET);
    disc(ctx, P(R.torso - 8, 5)[0], P(R.torso - 8, 5)[1], 1.6, GOLD);
  }
  ctx.restore();
}
