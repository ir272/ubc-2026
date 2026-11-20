// The stand-in: a hooded, cloaked figure with a staff, drawn by the pen from the posed joints, so
// the pose engine can be judged before the owner picks the cast. Four builds (heavy, fast, reach,
// grab) give it the four sizes; standinWith(build) makes a CharacterDef for any of them.
import type { Build, CharacterDef, FigureExtra, Joints } from '../api.ts';
import type { Pen, Pt } from '../pen.ts';
import { ell, limb, mix, smooth } from '../pen.ts';

export const BUILD_HEAVY: Build = { height: 225, hipY: 100, torso: 80, neckLen: 25, arm: [47, 45], leg: [53, 51], shoulderX: 30, stanceX: 50, hunch: 0.12, propLen: 74, heft: 1.5 };
export const BUILD_FAST: Build = { height: 140, hipY: 62, torso: 46, neckLen: 17, arm: [28, 27], leg: [33, 32], shoulderX: 14, stanceX: 30, hunch: 0.2, propLen: 50, heft: 0.6 };
export const BUILD_REACH: Build = { height: 225, hipY: 110, torso: 74, neckLen: 23, arm: [58, 56], leg: [58, 56], shoulderX: 17, stanceX: 40, hunch: 0.07, propLen: 128, heft: 1.0 };
export const BUILD_GRAB: Build = { height: 190, hipY: 86, torso: 68, neckLen: 20, arm: [51, 49], leg: [45, 44], shoulderX: 30, stanceX: 46, hunch: 0.16, propLen: 64, heft: 1.25 };

const add = (a: Pt, v: Pt, k = 1): Pt => [a[0] + v[0] * k, a[1] + v[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const dirA = (a: number): Pt => [Math.cos(a), Math.sin(a)];

function drawStandin(b: Build, ink: Pen, J: Joints, x: FigureExtra): void {
  const k = b.height / 200; // overall scale
  const bulk = b.shoulderX / 22; // broad builds get thicker limbs
  const th = (v: number): number => v * k * (0.7 + 0.3 * bulk);
  const s = x.state;
  // cloth drag in local units: moving forward pushes the cloth back; falling lifts it
  const dragX = clamp((-x.drag * (s ? s.facing : 1)) / 900, -1.4, 1.4) * 26 * k;
  const lift = clamp(((s ? s.vy : 0) * 6000) / 1400, -1, 1) * 18 * k;
  const flutter = Math.sin(x.t * 7.3) * (Math.abs(dragX) / (26 * k)) * 4 * k;

  const u = unit(sub(J.neck, J.hip)); // up the spine
  const n: Pt = [-u[1], u[0]]; // forward across it
  const chestW = th(14) + b.shoulderX * 0.35;
  const waistW = th(12) + b.shoulderX * 0.25;
  const seed = 11;

  // ---- the cloak's back drape (behind everything) ----
  {
    const top = add(J.neck, n, -chestW * 0.4);
    const sb = add(J.shoulderB, n, -th(6));
    const hemB = add(add(J.kneeB, n, -th(14)), [dragX * 1.2 - flutter, lift]);
    const hemM = add(add(mix(J.kneeB, J.kneeF, 0.35), u, -th(6)), [dragX * 0.8, lift * 0.6]);
    const waistB = add(J.hip, n, -waistW - th(6));
    ink.form(smooth([top, sb, add(waistB, [dragX * 0.3, 0]), hemB, add(hemB, n, th(10)), hemM, J.hip, J.chest], 5, true), { w: 2.4, seed: seed + 1 });
    ink.hatch(smooth([sb, add(waistB, [dragX * 0.3, 0]), hemB, add(hemB, n, th(8)), add(J.hip, n, -th(4)), J.chest], 4, true), { angle: 1.25, gap: 4.5 * k + 1.5, w: 1, seed: seed + 2 });
  }

  // ---- back arm and back leg ----
  ink.form(limb(J.shoulderB, J.elbowB, th(8), th(7.5)), { seed: seed + 3 });
  ink.form(limb(J.elbowB, J.handB, th(8), th(5.5)), { seed: seed + 4 });
  hand(ink, J.elbowB, J.handB, th(6.5), seed + 5, false);
  ink.form(limb(J.hip, J.kneeB, th(10), th(8)), { seed: seed + 6 });
  ink.form(limb(J.kneeB, J.footB, th(8), th(6)), { seed: seed + 7 });
  boot(ink, J.kneeB, J.footB, th(7), seed + 8);

  // ---- front leg ----
  ink.form(limb(J.hip, J.kneeF, th(10.5), th(8.5)), { seed: seed + 9 });
  ink.form(limb(J.kneeF, J.footF, th(8.5), th(6.5)), { seed: seed + 10 });
  boot(ink, J.kneeF, J.footF, th(7.5), seed + 11);

  // ---- the robe: torso and a short skirt that follows the knees ----
  {
    const nb = add(J.neck, n, -chestW * 0.7), nf = add(J.neck, n, chestW * 0.6);
    const cf = add(J.chest, n, chestW), cb = add(J.chest, n, -chestW * 0.95);
    const wf = add(J.hip, n, waistW), wb = add(J.hip, n, -waistW);
    const hemF = add(add(mix(J.hip, J.kneeF, 0.7), n, th(8)), [dragX * 0.25, lift * 0.3]);
    const hemB = add(add(mix(J.hip, J.kneeB, 0.75), n, -th(9)), [dragX * 0.6 - flutter * 0.5, lift * 0.5]);
    const hemMid = add(mix(hemF, hemB, 0.5), u, th(3));
    const robe = smooth([nb, nf, cf, wf, hemF, hemMid, hemB, wb, cb], 5, true);
    ink.form(robe, { w: 2.6, seed: seed + 12 });
    // folds
    ink.cut(smooth([add(J.hip, n, waistW * 0.3), mix(J.hip, hemMid, 0.6), add(hemMid, n, th(4))], 5), { w: 1.4, seed: seed + 13 });
    ink.cut(smooth([add(J.hip, n, -waistW * 0.4), mix(J.hip, hemB, 0.55), add(hemB, n, th(8))], 5), { w: 1.3, seed: seed + 14 });
    ink.cut(smooth([add(J.neck, n, chestW * 0.2), add(J.chest, n, chestW * 0.35), add(J.hip, n, waistW * 0.55)], 5), { w: 1.2, seed: seed + 15 });
  }

  // ---- the sash in the side's tint, its tails trailing ----
  {
    const top = add(J.hip, u, th(14)), bot = add(J.hip, u, th(3));
    const band = smooth([add(top, n, waistW + 2), add(top, n, -waistW - 2), add(bot, n, -waistW - 3), add(bot, n, waistW + 3)], 3, true);
    ink.form(band, { tint: x.sideTint, w: 1.8, seed: seed + 16 });
    const knot = add(add(J.hip, u, th(8)), n, -waistW - 1);
    const t1 = add(knot, [-th(12) + dragX * 0.9 - flutter, th(16) + lift * 0.8]);
    const t2 = add(knot, [-th(18) + dragX * 1.2 + flutter, th(10) + lift]);
    ink.form(limb(knot, t1, th(3.4), th(2.4)), { tint: x.sideTint, w: 1.4, seed: seed + 17 });
    ink.form(limb(knot, t2, th(3), th(2)), { tint: x.sideTint, w: 1.4, seed: seed + 18 });
  }

  // ---- the hood ----
  {
    const hr = Math.max(9, (b.height - b.hipY - b.torso - b.neckLen) * 1.0 + 3 * k);
    const a = J.headTilt;
    const hu: Pt = [Math.sin(a), -Math.cos(a)], hn: Pt = [Math.cos(a), Math.sin(a)];
    const c = J.head;
    const P = (fx: number, fy: number): Pt => add(add(c, hn, fx * hr), hu, fy * hr);
    // the hood: a rounded cowl with a peak falling behind, the cowl spreading onto the shoulders
    const peak = add(P(-1.35, 0.55), [dragX * 0.5, lift * 0.4]);
    const hood = smooth([P(0.95, -0.95), P(1.05, 0.15), P(0.85, 1.05), add(J.neck, n, chestW * 0.55), add(J.neck, n, -chestW * 0.75), P(-1.1, -0.2), peak, P(-0.85, 0.9), P(-0.2, 1.25), P(0.6, 1.15)], 4, true);
    ink.form(hood, { w: 2.5, seed: seed + 19 });
    // face opening: a dark hollow with two eyes
    const face = smooth([P(0.3, 0.75), P(0.92, 0.55), P(1.0, -0.35), P(0.55, -0.85), P(0.18, -0.25)], 5, true);
    ink.mask(face);
    ink.cut(face.concat([face[0]]), { w: 1.3, seed: seed + 20, taper: 0.3 });
    const eye = (fx: number, fy: number): void => { const p = P(fx, fy); ink.dot(p[0], p[1], Math.max(1.4, hr * 0.09), { free: true }); };
    eye(0.78, 0.05); eye(0.52, 0.12);
    ink.cut(smooth([P(-0.35, 0.95), P(-0.75, 0.3), P(-0.8, -0.5)], 4), { w: 1.2, seed: seed + 21 });
  }

  // ---- the staff, then the front arm and the hand that grips it ----
  if (b.propLen > 0) {
    const d = dirA(J.prop);
    const butt = add(J.handF, d, -b.propLen * 0.28), tip = add(J.handF, d, b.propLen);
    ink.line([butt, tip], { w: 3.4 * k + 1, taper: 0.15, seed: seed + 22 });
    // a crook at the head of the staff
    const nn: Pt = [-d[1], d[0]];
    const c1 = add(tip, d, 6 * k), c2 = add(add(tip, d, 9 * k), nn, -8 * k), c3 = add(add(tip, d, 2 * k), nn, -12 * k);
    ink.line(smooth([tip, c1, c2, c3], 5), { w: 3 * k + 0.8, taper: 0.5, seed: seed + 23 });
    ink.line([add(tip, d, -10 * k), add(tip, d, -20 * k)], { tint: x.sideTint, w: 5 * k + 1, taper: 0, seed: seed + 24 });
  }
  ink.form(limb(J.shoulderF, J.elbowF, th(8.5), th(8)), { seed: seed + 25 });
  ink.form(limb(J.elbowF, J.handF, th(8.5), th(6)), { seed: seed + 26 });
  // the sleeve cuff
  ink.cut([add(mix(J.elbowF, J.handF, 0.72), unit(sub(J.handF, J.elbowF)), 0), add(mix(J.elbowF, J.handF, 0.72), [0, 0])], { w: 1 });
  hand(ink, J.elbowF, J.handF, th(7), seed + 27, b.propLen > 0);
}

/** a mitten hand at the end of the forearm; `fist` when it holds the staff */
function hand(ink: Pen, elbow: Pt, h: Pt, r: number, seed: number, fist: boolean): void {
  const d = unit(sub(h, elbow));
  const a = Math.atan2(d[1], d[0]);
  const c = add(h, d, r * 0.5);
  ink.form(ell(c[0], c[1], r * (fist ? 1.05 : 1.2), r * (fist ? 0.95 : 0.75), a, 18), { w: 1.6, seed });
  if (fist) {
    const nn: Pt = [-d[1], d[0]];
    ink.cut([add(c, nn, -r * 0.5), add(add(c, nn, -r * 0.5), d, r * 0.7)], { w: 1, seed: seed + 1 });
  }
}

/** a soft boot pointing forward from the ankle */
function boot(ink: Pen, knee: Pt, f: Pt, r: number, seed: number): void {
  const d = unit(sub(f, knee));
  // the toe points forward across the shin, toward +x when standing
  const fw: Pt = [-d[1] * -1, d[0] * -1];
  const toe: Pt = fw[0] >= 0 ? fw : [-fw[0], -fw[1]];
  const heel = add(f, toe, -r * 0.6), tipP = add(add(f, toe, r * 2.1), d, r * 0.35);
  ink.form(smooth([add(heel, d, -r * 0.9), add(f, d, -r * 1.1), add(tipP, d, -r * 0.6), tipP, add(heel, d, r * 0.45)], 4, true), { w: 1.8, seed });
}

export function standinWith(build: Build): CharacterDef {
  return {
    id: 'kiln',
    build,
    anims: {},
    draw(ink, J, x) { drawStandin(build, ink, J, x); },
    portrait(ink, t) {
      // head and shoulders only, from the standing joints
      void t;
      ink.form(smooth([[-40, 50], [-30, 0], [0, -10], [30, 0], [40, 50]], 5, true));
      ink.form(smooth([[22, -30], [24, 6], [0, 18], [-26, 8], [-30, -20], [-44, -6], [-20, -52], [10, -50]], 4, true));
      const face = smooth([[6, 8], [20, 2], [20, -22], [8, -36], [2, -14]], 5, true);
      ink.mask(face);
      ink.dot(16, -16, 2.2, { free: true }); ink.dot(10, -14, 2, { free: true });
    },
  };
}

export const STANDIN: CharacterDef = standinWith(BUILD_HEAVY);
