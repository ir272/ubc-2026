// The two friends on the couch. Both are built from closed, opaque shapes painted back to front so nothing
// shows through, and each is drawn around its own hip (the point where it sits on the seat), facing left
// toward the television.
//   the pointer: curly hair, a zip jacket with the hood down, khaki trousers, one leg crossed over the other;
//                leans forward off the cushion and holds a long straight arm out at the TV
//   the cheerer: long hair over one shoulder, a striped sweater, one knee hugged up and one leg tucked under;
//                waves, throws both arms up, claps, leans in to talk
// Line weight comes from three passes over each figure (see `figure`): a pale rim nudged toward the TV, the
// heavy silhouette, then the fills with thinner form and detail lines. So the outer edge of a person is the
// only place the heavy line appears. Arms are posed by joint angles (shoulder and elbow), blended between held
// poses, so a hand travels on an arc. Acting is a 40 s loop; breathing, blinks, foot taps and hair lag run under it.
import { BLUE, GOLD, INK, ORANGE, WARM, wind } from '../../engine/layout';
import type { Pt } from '../../engine/types';
import { type C2, TAU, bump, hatch, ink, lerp, limb, mix, mixc, mod, osc, polar, reach, rnd, rot, taper, tone, trace, track } from './kit';

// line tiers for a figure about 250 units tall
// SIL is what a shape adds outside its edge; FORM and DET are drawn inside the edge. So an outer edge reads
// as SIL + FORM (about 3.2) and an edge inside the figure as FORM alone.
const SIL = 1.3, FORM = 1.9, DET = 1.4, HAIR = 1.05;

const OUT = BLUE;
const RIM = mixc(BLUE, INK, 0.5);
const LINE = tone(BLUE, 0.9);
const FEAT = '#1a110b'; // facial features are dark marks on the warm skin
const MOUTH = tone(ORANGE, 0.1);
const TONGUE = tone(ORANGE, 0.72);
const TEETH = tone(INK, 0.95);

interface Skin { base: string; shade: string; line: string; blush: string }
const SKIN_P: Skin = { base: tone(mixc(ORANGE, WARM, 0.5), 0.66), shade: tone(ORANGE, 0.42), line: tone(ORANGE, 0.2), blush: tone(ORANGE, 0.9) };
const SKIN_C: Skin = { base: tone(mixc(WARM, INK, 0.5), 0.8), shade: tone(mixc(WARM, ORANGE, 0.4), 0.56), line: tone(ORANGE, 0.26), blush: tone(ORANGE, 0.95) };

// the pointer: a lit blue jacket over khaki trousers
const J = { body: tone(BLUE, 0.4), shade: tone(BLUE, 0.27), lit: tone(BLUE, 0.55), far: tone(BLUE, 0.3), farSh: tone(BLUE, 0.2), rib: tone(BLUE, 0.33) };
const K = { body: tone(WARM, 0.36), shade: tone(WARM, 0.22), lit: tone(WARM, 0.5), far: tone(WARM, 0.25), farSh: tone(WARM, 0.15), line: tone(WARM, 0.85) };
const HP = { body: tone(BLUE, 0.16), lit: tone(BLUE, 0.3), line: tone(BLUE, 0.78) };
// the cheerer: a dark sweater with ink stripes, light jeans, warm hair
const SW = { body: tone(BLUE, 0.25), shade: tone(BLUE, 0.15), far: tone(BLUE, 0.18), farSh: tone(BLUE, 0.11), stripe: tone(INK, 0.82), stripeFar: tone(INK, 0.5), rib: tone(INK, 0.6) };
const JE = { body: tone(mixc(BLUE, INK, 0.22), 0.56), shade: tone(BLUE, 0.38), lit: tone(mixc(BLUE, INK, 0.3), 0.7), far: tone(BLUE, 0.36), farSh: tone(BLUE, 0.24) };
const HC = { body: tone(WARM, 0.5), lit: tone(WARM, 0.68), shade: tone(WARM, 0.32), line: tone(WARM, 0.96), dark: tone(WARM, 0.18) };
const SHOE = tone(INK, 0.58);
const SOLE = tone(INK, 0.9);

export const LOOP = 40;

type Keys = readonly (readonly [number, number])[];
// the pointer: the long point is the main held pose
const K_POINT: Keys = [[0, 0], [2.0, 0], [2.14, -0.1], [2.6, 1], [9.4, 1], [10.0, 0], [18.4, 0], [18.54, -0.1], [19.0, 1], [25.6, 1], [26.2, 0], [35.2, 0], [35.34, -0.1], [35.8, 1], [39.0, 1], [39.6, 0]];
const K_PWAVE: Keys = [[0, 0], [10.2, 0], [10.7, 1], [13.0, 1], [13.6, 0], [26.6, 0], [27.1, 1], [29.6, 1], [30.2, 0]];
const K_PGLANCE: Keys = [[0, 0], [13.4, 0], [13.8, 1], [15.6, 1], [16.1, 0], [30.6, 0], [31.0, 1], [33.4, 1], [33.9, 0]];
const K_LAUGH: Keys = [[0, 0], [14.0, 0], [14.25, 1], [15.4, 1], [15.9, 0], [32.4, 0], [32.65, 1], [33.5, 1], [33.9, 0]];
// the cheerer
const K_CWAVE: Keys = [[0, 0], [3.4, 0], [3.9, 1], [8.6, 1], [9.2, 0]];
const K_CHEER: Keys = [[0, 0], [20.6, 0], [20.75, -0.15], [21.15, 1], [24.6, 1], [25.0, 0]];
const K_CLAP: Keys = [[0, 0], [24.9, 0], [25.25, 1], [27.3, 1], [27.8, 0]];
const K_LEANIN: Keys = [[0, 0], [30.6, 0], [31.2, 1], [33.2, 1], [33.9, 0]];
const K_TALK: Keys = [[0, 0], [31.2, 0], [31.4, 1], [32.4, 1], [32.6, 0]];
const K_REACH: Keys = [[0, 0], [16.4, 0], [17.1, 1], [17.6, 1], [18.2, 0], [35.2, 0], [35.9, 1], [36.4, 1], [37.0, 0]];
const K_EAT: Keys = [[0, 0], [17.6, 0], [18.3, 1], [18.9, 1], [19.5, 0], [36.4, 0], [37.1, 1], [37.7, 1], [38.3, 0]];
const K_CGLANCE: Keys = [[0, 0], [13.6, 0], [14.0, 1], [15.6, 1], [16.1, 0]];

const blinkAt = (t: number, period: number, seed: number) => {
  const k = Math.floor(t / period);
  const start = k * period + rnd(k * 3.7 + seed) * (period - 0.4);
  return t >= start && t < start + 0.12;
};

// ---- the three passes -------------------------------------------------------------------------------
let PASS = 2; // 0: pale rim, 1: silhouette, 2: fills and inner lines

/** draw a figure (or a prop) with a heavy outer edge: `paint` runs three times */
export function figure(c: C2, paint: () => void): void {
  PASS = 0;
  c.save();
  c.translate(-0.85, -0.3);
  paint();
  c.restore();
  PASS = 1;
  paint();
  PASS = 2;
  paint();
}

interface SO { sil?: number; lw?: number; line?: string; sm?: boolean; inner?: () => void }
/** a closed opaque shape. `sil`: weight it adds to the silhouette; `lw`/`line`: its own inner edge; `inner`: paint clipped inside it */
function S(c: C2, pts: readonly Pt[], fill: string, o: SO = {}): void {
  const sm = o.sm ?? true;
  c.beginPath();
  trace(c, pts, true, sm);
  if (PASS < 2) {
    c.lineWidth = (o.sil ?? SIL) * 2;
    c.lineJoin = 'round';
    c.strokeStyle = PASS === 0 ? RIM : OUT;
    c.stroke();
    return;
  }
  c.fillStyle = fill;
  c.fill();
  const lw = o.lw ?? FORM;
  if (!o.inner && lw <= 0) return;
  c.save();
  c.clip();
  o.inner?.();
  if (lw > 0) {
    // the shape's own edge, kept inside it so it never thickens the silhouette
    c.beginPath();
    trace(c, pts, true, sm);
    c.lineWidth = lw * 2;
    c.lineJoin = 'round';
    c.strokeStyle = o.line ?? LINE;
    c.stroke();
  }
  c.restore();
}
/** an inner line (third pass only) */
function L(c: C2, pts: readonly Pt[], w: number, color: string, alpha = 1, sm = true): void {
  if (PASS === 2) ink(c, pts, w, color, alpha, sm);
}
/** a tapered inner mark (third pass only) */
function T(c: C2, pts: readonly Pt[], w0: number, w1: number, color: string, alpha = 1): void {
  if (PASS === 2) taper(c, pts, w0, w1, color, alpha);
}
function fillPoly(c: C2, pts: readonly Pt[], color: string, sm = true): void {
  c.beginPath();
  trace(c, pts, true, sm);
  c.fillStyle = color;
  c.fill();
}

const ang = (dx: number, dy: number) => {
  const a = Math.atan2(dy, dx);
  return a < 0 ? a + TAU : a;
};
/** joint angles (upper, lower) for a two-bone limb from s that reaches the target; angles in 0..TAU, cut at "straight back" */
function ik(s: Pt, target: Pt, a: number, b: number, bend: 1 | -1): [number, number] {
  const [e, w] = reach(s, target, a, b, bend);
  return [ang(e[0] - s[0], e[1] - s[1]), ang(w[0] - e[0], w[1] - e[1])];
}

/** the unit normal of a segment that points away from the light (down and to the right) */
function awayFromLight(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  let nx = -dy / l, ny = dx / l;
  if (nx * 0.45 + ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

interface TubeO extends SO { stripe?: string; stripeGap?: number }
/** a limb of two segments (a to joint j to b) as one closed shape, with a shade band on its underside */
function tube(c: C2, a: Pt, j: Pt, b: Pt, w: readonly [number, number, number], fill: string, shade: string, o: TubeO = {}): void {
  const line: Pt[] = [a, mix(a, j, 0.5), j, mix(j, b, 0.42), b];
  const widths = [w[0], (w[0] + w[1]) / 2 + 0.8, w[1], (w[1] + w[2]) / 2 + 1.2, w[2]];
  S(c, limb(line, widths, 5), fill, {
    sm: false, ...o,
    inner: () => {
      if (o.stripe) {
        c.strokeStyle = o.stripe;
        c.lineWidth = 3;
        c.lineCap = 'butt';
        c.beginPath();
        const gap = o.stripeGap ?? 10.5;
        for (const [p, q] of [[a, j], [j, b]] as const) {
          const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
          const nx = (-(q[1] - p[1]) / l) * 16, ny = ((q[0] - p[0]) / l) * 16;
          for (let d = gap * (p === a ? 0.6 : 0.95); d < l - gap * 0.45; d += gap) {
            const m = mix(p, q, d / l);
            // a slight bow, so the stripe wraps round the arm
            c.moveTo(m[0] + nx, m[1] + ny);
            c.quadraticCurveTo(m[0] + ((q[0] - p[0]) / l) * 2.4, m[1] + ((q[1] - p[1]) / l) * 2.4, m[0] - nx, m[1] - ny);
          }
        }
        c.stroke();
      }
      c.fillStyle = shade;
      c.globalAlpha = o.stripe ? 0.62 : 1;
      for (const [p, q, w0, w1] of [[a, j, w[0], w[1]], [j, b, w[1], w[2]]] as const) {
        const n = awayFromLight(p, q);
        const k = (w0 + w1) * 0.5 * 0.62;
        c.beginPath();
        trace(c, limb([[p[0] + n[0] * k, p[1] + n[1] * k], [q[0] + n[0] * k, q[1] + n[1] * k]], [w0 + 2, w1 + 2], 4), true, false);
        c.fill();
      }
      c.globalAlpha = 1;
      o.inner?.();
    },
  });
}

/** fold marks on the inside of a bent joint */
function creases(c: C2, a: Pt, j: Pt, b: Pt, w: number, color: string): void {
  if (PASS < 2) return;
  const ua: Pt = [a[0] - j[0], a[1] - j[1]], ub: Pt = [b[0] - j[0], b[1] - j[1]];
  const la = Math.hypot(ua[0], ua[1]) || 1, lb = Math.hypot(ub[0], ub[1]) || 1;
  let bx = ua[0] / la + ub[0] / lb, by = ua[1] / la + ub[1] / lb;
  const bl = Math.hypot(bx, by);
  if (bl < 0.25) {
    // nearly straight: two small ticks across the joint
    const n = awayFromLight(a, b);
    taper(c, [[j[0] + n[0] * w * 0.42, j[1] + n[1] * w * 0.42], [j[0] + n[0] * w * 0.05, j[1] + n[1] * w * 0.05]], 1.5, 0.3, color, 0.7);
    return;
  }
  bx /= bl;
  by /= bl;
  const inn: Pt = [j[0] + bx * w * 0.46, j[1] + by * w * 0.46];
  const base = Math.atan2(-by, -bx);
  for (const [da, len, al] of [[-0.55, 0.62, 0.8], [0.1, 0.78, 0.9], [0.7, 0.55, 0.7]] as const) {
    const tip = polar(inn, base + da, w * len);
    taper(c, [inn, mix(inn, tip, 0.55), tip], 1.6, 0.3, color, al);
  }
}

/** a rib cuff across a limb between fractions k0 and k1 from a to b */
function cuff(c: C2, a: Pt, b: Pt, k0: number, k1: number, w: number, fill: string, line = LINE, ribs = true): void {
  const p = mix(a, b, k0), q = mix(a, b, k1);
  S(c, limb([p, q], [w, w - 0.6], 2), fill, { sm: false, lw: DET, line });
  if (PASS < 2 || !ribs) return;
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const tx = (q[0] - p[0]) / l, ty = (q[1] - p[1]) / l;
  for (let i = -2; i <= 2; i++) {
    const o = (i * w) / 6;
    ink(c, [[p[0] - ty * o + tx, p[1] + tx * o + ty], [q[0] - ty * o - tx, q[1] + tx * o - ty]], HAIR, line, 0.6, false);
  }
}

type HandKind = 'open' | 'relaxed' | 'point' | 'fist' | 'flat';
/** a hand at the wrist w, fingers along `a`. The thumb is on the local -y side; `flip` puts it on the other */
function hand(c: C2, w: Pt, a: number, kind: HandKind, sk: Skin, flip: boolean): void {
  c.save();
  c.translate(w[0], w[1]);
  c.rotate(a);
  if (flip) c.scale(1, -1);
  const o: SO = { sil: 1.8, lw: 0 };
  const finger = (x: number, y: number, d: number, l: number, w0 = 3.8, w1 = 3.1, edge = false) =>
    S(c, limb([[x, y], [x + Math.cos(d) * l, y + Math.sin(d) * l]], [w0, w1], 4), sk.base, { sil: 1.8, lw: edge ? 1.2 : 0, line: sk.line, sm: false });
  S(c, [[-8, -3.9], [1, -4.6], [1, 4.4], [-8, 3.7]], sk.shade, { ...o, sm: false }); // wrist
  if (kind === 'open') {
    finger(3.5, -4.4, -1.2, 9.5, 4.4, 3.5);
    finger(11, -4.2, -0.42, 10.5);
    finger(12.4, -1.3, -0.13, 12.5);
    finger(12.2, 1.9, 0.15, 11.5);
    finger(10.8, 4.6, 0.45, 9, 3.5, 2.9);
    S(c, [[-1, -5.2], [6, -6.4], [11.5, -5.8], [13.4, 0], [11.6, 5.6], [5, 6.2], [-1, 4.8]], sk.base, o);
    L(c, [[4, -1.5], [7.6, 1.2], [8.6, 4.4]], HAIR, sk.line, 0.7);
    L(c, [[3.6, -3.4], [6.4, -4.6]], HAIR, sk.line, 0.6, false);
  } else if (kind === 'relaxed') {
    S(c, [[-1, -5], [6, -6.2], [13, -6], [20, -4.6], [23.5, -1.6], [23.6, 2.2], [20.4, 5], [12, 6], [5, 6], [-1, 4.6]], sk.base, o);
    finger(4.5, -4.2, -0.2, 10, 4.2, 3.4, true);
    L(c, [[13.5, -2.4], [22.8, -1]], HAIR, sk.line, 0.8, false);
    L(c, [[13.4, 0.8], [23, 1.6]], HAIR, sk.line, 0.8, false);
    L(c, [[12.8, 3.6], [21.4, 4.1]], HAIR, sk.line, 0.8, false);
  } else if (kind === 'point') {
    finger(10.5, -3.6, -0.03, 17, 4.3, 3.3);
    S(c, [[-1, -5.2], [6, -6.4], [12, -6], [15, -1.2], [15.6, 3], [13, 6.2], [6, 6.8], [-1, 4.8]], sk.base, o);
    finger(5, -0.8, 0.26, 9, 4.3, 3.6, true);
    L(c, [[11, -1.6], [15, -1.2]], HAIR, sk.line, 0.8, false);
    L(c, [[12.4, 3.2], [15.4, 3.2]], HAIR, sk.line, 0.8, false);
    L(c, [[20.5, -5.2], [20.9, -3.2]], HAIR, sk.line, 0.55, false); // knuckle of the index
  } else if (kind === 'fist') {
    S(c, [[-1, -5.2], [6, -6.6], [12.5, -6], [15.5, -1.6], [15, 3.6], [11.5, 6.6], [5, 6.8], [-1, 4.8]], sk.base, o);
    finger(5, -1.8, 0.3, 8.5, 4.2, 3.6, true);
    L(c, [[11.5, -3.6], [15, -3]], HAIR, sk.line, 0.8, false);
    L(c, [[12.8, 3], [15.2, 3]], HAIR, sk.line, 0.8, false);
  } else {
    finger(5, -3.8, -0.6, 8.5, 4, 3.2);
    S(c, [[-1, -4], [8, -4.8], [17, -4.4], [23, -2.2], [24, 1], [19, 3.8], [8, 4.4], [-1, 3.4]], sk.base, o);
    L(c, [[12, -1.6], [22.4, -0.8]], HAIR, sk.line, 0.8, false);
    L(c, [[12, 1.3], [22, 1.6]], HAIR, sk.line, 0.8, false);
  }
  c.restore();
}

/** a sneaker; origin at the ankle, toe toward screen left, r > 0 tips the toe down */
export function sneaker(c: C2, a: Pt, r: number, fill: string = SHOE): void {
  c.save();
  c.translate(a[0], a[1]);
  c.scale(-1, 1);
  c.rotate(r);
  S(c, [[-9, -8], [-2, -9], [5, -5.5], [13, -0.5], [21, 1.5], [25, 5.5], [25, 9.5], [8, 10], [-9.5, 9.5], [-10.5, 0]], fill, {
    sil: 1.5, lw: DET,
    inner: () => {
      fillPoly(c, [[17, -2], [27, 3], [27, 12], [15, 12], [17.5, 5]], tone(INK, 0.8)); // toe cap
      fillPoly(c, [[-12, -10], [-3, -10], [-5.5, 12], [-12, 12]], tone(BLUE, 0.62)); // heel counter
    },
  });
  S(c, [[-10.6, 8], [25.6, 8], [26.2, 12.2], [-10.6, 12.2]], SOLE, { sil: 1.5, lw: 0, sm: false });
  L(c, [[-10.6, 8.2], [25.6, 8.2]], HAIR, tone(BLUE, 0.5), 1, false);
  L(c, [[16.4, 0.4], [15, 4], [15.8, 7.6]], HAIR, LINE, 0.9);
  for (const [x0, y0, x1, y1] of [[2.5, -5.8, 7, -1], [6.5, -4, 10.5, 0.6], [10, -2, 13.5, 2]] as const) L(c, [[x0, y0], [x1, y1]], 1.2, tone(BLUE, 0.9), 1, false);
  L(c, [[-9, -8], [-12, -10.5]], DET, LINE, 1, false);
  L(c, [[-4.5, -4], [-6, 7]], HAIR, tone(INK, 0.9), 0.7, false);
  c.restore();
}

/** a foot in a thick striped sock, toe toward screen left */
function sock(c: C2, a: Pt, r: number): void {
  c.save();
  c.translate(a[0], a[1]);
  c.scale(-1, 1);
  c.rotate(r);
  const shape: Pt[] = [[-7.5, -11], [1.5, -11.5], [6, -3.5], [15, 0], [22, 4], [22.4, 8.5], [10, 10], [-6, 9.5], [-9.5, 1]];
  S(c, shape, tone(INK, 0.62), {
    sil: 1.5, lw: DET,
    inner: () => {
      c.lineCap = 'butt';
      ink(c, [[-12, -6.5], [9, -8.5]], 2.6, tone(WARM, 0.85), 1, false);
      ink(c, [[-12, -1.5], [11, -4]], 2.6, tone(WARM, 0.85), 1, false);
      fillPoly(c, [[15, -2], [25, 2], [25, 11], [14, 11], [16.5, 5]], tone(WARM, 0.7));
      fillPoly(c, [[-12, 3], [-3, 4.5], [-2, 12], [-12, 12]], tone(WARM, 0.7));
    },
  });
  c.restore();
}

interface Face { blink: boolean; brow: number; mouth: number; look: number; lash: boolean; squint: number }
const skull = (m: number): Pt[] => [
  [1, -22], [12, -19], [19, -9], [20, 3], [16, 13], [8, 19 + m], [-3, 22 + m * 2.2], [-10.5, 21 + m * 2.4], [-14.5, 17 + m * 2],
  [-15, 13.4 + m], [-16.3, 10.9], [-15.5, 8.2], [-21.6, 5.6], [-17.3, -1.5], [-17.6, -8.5], [-13, -17.5], [-6, -21.5],
];
/** the head shape with the shade under the jaw; head-local coordinates, origin at the head centre */
function headShape(c: C2, m: number, sk: Skin): void {
  S(c, skull(m), sk.base, {
    sil: 2.2, lw: 0,
    inner: () => {
      fillPoly(c, [[22, 2], [17, 14], [8, 21 + m], [-3, 24 + m * 2.2], [-12, 23 + m * 2.4], [-9, 17.5 + m * 1.6], [0, 15.5 + m], [9, 11], [14, 1]], sk.shade);
    },
  });
}
/** the face on a left-facing head */
function face(c: C2, f: Face, sk: Skin, browC: string): void {
  if (PASS < 2) return;
  const b = f.brow, m = f.mouth;
  // cheek
  c.save();
  c.globalAlpha = 0.26 + 0.1 * Math.min(1, m + f.squint);
  c.fillStyle = sk.blush;
  c.beginPath();
  c.ellipse(-4, 7.2 - m * 0.8, 4.4, 2.7, -0.2, 0, TAU);
  c.fill();
  c.restore();
  // brow: an arch that lifts
  taper(c, [[-15, -13.2 - b * 3.6], [-10.8, -14.6 - b * 3.8], [-5, -11 - b * 1.6]], 1.7, 0.6, browC, 1);
  // eye
  const ex = -9.8 + f.look * 1.5, ey = -3.6;
  if (f.squint > 0.5) ink(c, [[-13.2, -2.4], [-9.6, -5.2], [-6, -2.6]], DET, FEAT, 1); // laughing: a happy arc
  else if (f.blink) ink(c, [[-13, -3.8], [-9.6, -2.4], [-6.2, -3.8]], DET, FEAT, 1);
  else {
    ink(c, [[-13.3, -5.2], [-9.7, -7.3 - b * 0.9], [-5.9, -5.1]], HAIR, FEAT, 0.85);
    c.beginPath();
    c.ellipse(ex, ey, 2.25, 3 + b * 0.5, 0, 0, TAU);
    c.fillStyle = FEAT;
    c.fill();
    c.beginPath();
    c.arc(ex - 0.7, ey - 1.1, 0.65, 0, TAU);
    c.fillStyle = TEETH;
    c.fill();
    if (f.lash) {
      ink(c, [[-13.3, -5.2], [-15.6, -6.9]], HAIR, FEAT, 0.9, false);
      ink(c, [[-12, -6.3], [-13.5, -8.5]], HAIR, FEAT, 0.9, false);
    }
  }
  // the wing of the nose
  ink(c, [[-15.6, 4.4], [-13.9, 6.4], [-15.3, 8.1]], HAIR, FEAT, 0.7);
  // mouth
  if (m < 0.18) {
    ink(c, [[-15.4, 11.8], [-12.4, 13.9], [-8.6, 13.3], [-5.9, 10.6]], DET, FEAT, 1);
    ink(c, [[-5.3, 8.4], [-4.2, 10.8], [-5.5, 13.2]], HAIR, FEAT, 0.7);
  } else {
    const shape: Pt[] = [[-15.6, 11], [-11, 10.2], [-6, 9.9], [-6.5, 12.6 + m * 5], [-10.4, 13.8 + m * 6.6], [-14.6, 12.8 + m * 4.8]];
    c.save();
    c.beginPath();
    trace(c, shape, true);
    c.fillStyle = MOUTH;
    c.fill();
    c.clip();
    fillPoly(c, [[-17, 9], [-5, 9], [-5, 12.3], [-11, 12.7], [-17, 13.3]], TEETH);
    c.beginPath();
    c.ellipse(-10.2, 13.6 + m * 6.2, 3.4, 1.2 + m * 1.8, 0, 0, TAU);
    c.fillStyle = TONGUE;
    c.fill();
    c.restore();
    ink(c, [...shape, shape[0]!], 1.2, FEAT, 1);
    ink(c, [[-5.2, 7.4], [-3.8, 10.4], [-5.2, 13.6 + m * 2]], HAIR, FEAT, 0.75);
  }
}

function ear(c: C2, x: number, y: number, sk: Skin): void {
  S(c, [[x + 2.6, y - 5.6], [x - 2.6, y - 4.8], [x - 4.2, y + 0.8], [x - 1.2, y + 5.6], [x + 3, y + 3.6]], sk.base, { sil: 1.6, lw: 1.1, line: sk.line });
  L(c, [[x + 0.6, y - 2.6], [x - 1.4, y + 0.2], [x + 0.6, y + 2.4]], HAIR, sk.line, 0.9);
}

// ---- the pointer ------------------------------------------------------------------------------------

interface PoseP {
  lean: number; shake: number; breath: number; head: Pt; tilt: number; nS: Pt; fS: Pt; nA: number; nB: number; fA: number; fB: number;
  point: number; wave: number; glance: number; laugh: number; mouth: number; brow: number;
}
function poseP(t: number): PoseP {
  const u = mod(t, LOOP);
  const point = track(u, K_POINT, 1.1), wave = track(u, K_PWAVE), glance = track(u, K_PGLANCE), laugh = track(u, K_LAUGH, 0);
  const breath = osc(t, 3.9);
  const lean = -0.11 - 0.21 * point - 0.03 * wave + 0.13 * glance + 0.007 * breath + 0.012 * osc(t, 7.3, 1);
  const shake = laugh * Math.sin(t * TAU * 5.2) * 1.5;
  const jab = Math.max(0, Math.sin(t * TAU * 0.55)) ** 8 * Math.max(0, Math.min(1, (point - 0.8) / 0.2)); // a small "there!" now and then
  const at = (x: number, y: number): Pt => {
    const r = rot([x, y - breath * 1.2], lean);
    return [r[0], r[1] + shake];
  };
  const nS = at(5, -83), fS = at(-19, -83), head = at(-8, -120);
  // near arm: an open hand on the thigh, or the long point at the television
  let [nA, nB] = ik(nS, [-41, -23], 48, 46, -1);
  const pt = ik(nS, [nS[0] - 93, nS[1] + 10 - jab * 6 + osc(t, 2.9) * 1.4], 48, 46, -1);
  nA = lerp(nA, pt[0], point);
  nB = lerp(nB, pt[1], point);
  // far arm: in the lap, or up in a wave
  let [fA, fB] = ik(fS, [-44, -12], 46, 44, -1);
  const wv = ik(fS, [fS[0] - 30 + Math.sin(t * TAU * 2.05) * 15, fS[1] - 70 - Math.cos(t * TAU * 4.1) * 3], 46, 44, -1);
  fA = lerp(fA, wv[0], wave);
  fB = lerp(fB, wv[1], wave);
  return {
    lean, shake, breath, head,
    tilt: -lean * 0.72 + 0.13 * point + 0.1 * wave + 0.2 * glance + laugh * 0.05 * Math.sin(t * TAU * 2.6) + 0.02 * osc(t, 6.1),
    nS, fS, nA, nB, fA, fB, point, wave, glance, laugh,
    mouth: Math.max(Math.max(0, point) * (0.42 + 0.22 * Math.sin(t * TAU * 1.3) + jab * 0.3), 0.7 * wave, laugh * (0.75 + 0.25 * Math.sin(t * TAU * 5.2))),
    brow: Math.max(Math.max(0, point) * 0.9, wave * 0.8, laugh * 0.5),
  };
}

// curls: [x, y, r, lit] in head-local coordinates
const CURLS: readonly (readonly [number, number, number, number])[] = [
  [-13.5, -18.5, 5.4, 1], [-7, -25, 6.6, 1], [1.5, -28.5, 7, 1], [10.5, -27, 7, 0], [17.5, -21, 7, 0], [21.5, -12, 6.4, 0], [21.5, -3, 5.6, 0], [18, 5, 5, 0],
  [-2, -19, 6, 1], [7, -19.5, 6.6, 0], [13.5, -12.5, 6.2, 0], [-9, -15.5, 4.4, 1], [15.5, -4.5, 4.6, 0], [-17.5, -14.5, 3.3, 1], [13, 9.5, 3.6, 0],
];

function paintPointer(c: C2, t: number, p: PoseP, lagX: number, lagY: number): void {
  const tapGate = bump(mod(t, 9.2), 1.5, 6.2, 0.6);
  const tap = Math.sin(t * TAU * 1.9) * tapGate;
  const sk = SKIN_P;

  // far leg, planted on the grass
  {
    const h: Pt = [-10, 2], k: Pt = [-58, 3], a: Pt = [-55, 87];
    S(c, limb([mix(k, a, 0.74), a], [11.5, 11], 3), tone(INK, 0.5), { sm: false, sil: 1.8, lw: 0 }); // sock
    tube(c, h, k, mix(k, a, 0.8), [27, 22.5, 16.5], K.far, K.farSh);
    creases(c, h, k, a, 22, K.line);
    L(c, [[-63, 67], [-55, 69.5], [-47.5, 68]], DET, K.line, 0.9);
    sneaker(c, a, -0.02 - Math.max(0, -tap) * 0.2);
  }
  // far arm: rests in the lap, or waves
  {
    const e = polar(p.fS, p.fA, 46), w = polar(e, p.fB, 44);
    tube(c, p.fS, e, mix(e, w, 0.9), [20, 16.5, 13], J.far, J.farSh);
    creases(c, p.fS, e, w, 16.5, LINE);
    hand(c, w, p.fB, p.wave > 0.35 ? 'open' : 'relaxed', sk, false);
    cuff(c, e, w, 0.8, 0.93, 14.6, J.farSh);
  }
  // torso and head
  c.save();
  c.translate(0, p.shake);
  c.rotate(p.lean);
  // the hood lying flat on the shoulders
  S(c, [[3, -97], [15, -97], [27, -86], [29, -69], [20, -62], [11, -70], [7, -85]], J.shade, { lw: FORM });
  L(c, [[9, -92], [19, -84], [23, -70]], HAIR, LINE, 0.7);
  L(c, [[13, -78], [18, -70]], HAIR, LINE, 0.5, false);
  const torso: Pt[] = [[21, 7], [25, -20], [25, -50], [21, -76], [12, -92], [0, -97], [-11, -94], [-23, -85], [-30, -66], [-30, -40], [-26, -14], [-25, 7]];
  S(c, torso, J.body, {
    lw: 0,
    inner: () => {
      fillPoly(c, [[30, 12], [30, -72], [19, -94], [9, -80], [13, -50], [12, -18], [7, 12]], J.shade); // the back, in shade
      fillPoly(c, [[-36, -70], [-26, -90], [-9, -100], [-3, -90], [-16, -80], [-27, -60]], J.lit); // the lit shoulder
      fillPoly(c, [[-32, -5], [-3, -3], [28, -6], [28, 12], [-32, 12]], J.rib, false); // ribbed hem
      for (let i = 0; i < 11; i++) ink(c, [[-27 + i * 5, -2.4], [-27.4 + i * 5, 7]], HAIR, LINE, 0.6, false);
      ink(c, [[-30, -5], [-3, -3], [26, -6]], DET, LINE, 1);
    },
  });
  if (PASS === 2) {
    hatch(c, [[24, -10], [24, -70], [16, -80], [15, -50], [14, -18], [12, -8]], { angle: -1.2, gap: 4.4, color: LINE, alpha: 0.4, seed: 7 });
    // the zip, with its teeth and pull
    const zip: Pt[] = [[-13, -88], [-19, -66], [-20.5, -40], [-18.5, -16], [-17.5, -4]];
    ink(c, zip, DET, tone(INK, 0.85), 1);
    for (let i = 0; i < 12; i++) {
      const y = -82 + i * 6.6;
      const x = -13 - 7.6 * Math.sin(((y + 88) / 84) * Math.PI * 0.62) - 0.4;
      ink(c, [[x - 1.7, y], [x + 1.7, y + 0.3]], 0.9, tone(INK, 0.85), 0.8, false);
    }
    ink(c, [[-14.5, -83], [-17, -78.5]], 2.2, GOLD, 1, false);
    // chest pocket with a flap and a stud, the side pocket welt, the armhole seam, waist folds
    ink(c, [[-11, -70], [-1, -72], [0.5, -60], [-9.5, -58.5], [-11, -70]], HAIR, LINE, 0.9, false);
    ink(c, [[-10.6, -65.6], [0, -67.4]], HAIR, LINE, 0.9, false);
    c.beginPath();
    c.arc(-5.2, -68.4, 1, 0, TAU);
    c.fillStyle = GOLD;
    c.fill();
    ink(c, [[-13, -36], [-3, -28], [1, -12]], DET, LINE, 0.9);
    ink(c, [[-11.6, -34], [-2, -26.6]], HAIR, LINE, 0.5, false);
    ink(c, [[-6, -93], [-4, -80], [3, -68], [13, -64]], HAIR, LINE, 0.75);
    taper(c, [[-27, -22], [-18, -17], [-8, -18]], 1.6, 0.3, LINE, 0.7);
    taper(c, [[-26, -13], [-17, -10], [-10, -11]], 1.4, 0.3, LINE, 0.55);
    taper(c, [[20, -30], [12, -24], [6, -25]], 1.5, 0.3, LINE, 0.6);
  }
  ink2(c, torso, FORM, LINE);
  // neck, tee and collar
  S(c, [[-10, -91], [5, -93], [6.5, -110], [-7, -108]], sk.shade, { sil: 2.1, lw: 0, sm: false });
  S(c, [[-11, -93], [-3, -96], [-5.5, -85]], tone(INK, 0.72), { sil: 1, lw: 0, sm: false });
  S(c, [[-2, -100], [9, -99], [14, -89], [6, -90]], J.lit, { lw: DET });
  S(c, [[-15, -93], [-5, -98.5], [-2, -90], [-11, -84], [-19, -86]], J.lit, { lw: DET });
  L(c, [[-12, -90], [-6, -93.6]], HAIR, LINE, 0.6, false);
  // drawstrings of the hood
  L(c, [[-9, -86], [-11.5, -74], [-10.4, -66]], HAIR, tone(INK, 0.9), 0.9);
  if (PASS === 2) {
    c.beginPath();
    c.arc(-10.3, -65, 1.3, 0, TAU);
    c.fillStyle = tone(INK, 0.9);
    c.fill();
  }
  // head
  c.translate(-8, -120 - p.breath * 0.7);
  c.rotate(p.tilt);
  headShape(c, p.mouth * 0.9, sk);
  ear(c, 7.5, 1.5, sk);
  face(c, { blink: blinkAt(t, 4.3, 1), brow: p.brow, mouth: p.mouth, look: p.glance * 1.4 - 0.2, lash: false, squint: p.laugh }, sk, HP.body);
  L(c, [[-13, 17 + p.mouth * 1.8], [-9, 19.6 + p.mouth * 2]], HAIR, sk.line, 0.5, false); // chin
  // curly hair: one mass, lit toward the TV, covered in loose loops that bounce late
  const cx = (i: number) => CURLS[i]![0] + lagX * (0.35 + rnd(i * 3.1) * 0.5);
  const cy = (i: number) => CURLS[i]![1] + lagY * (0.35 + rnd(i * 5.3) * 0.5) + Math.sin(t * 1.7 + i) * 0.3;
  const circles = (lit: number) => {
    c.beginPath();
    for (let i = 0; i < CURLS.length; i++) {
      if (lit >= 0 && CURLS[i]![3] !== lit) continue;
      c.moveTo(cx(i) + CURLS[i]![2], cy(i));
      c.arc(cx(i), cy(i), CURLS[i]![2], 0, TAU);
    }
  };
  if (PASS < 2) {
    circles(-1);
    c.lineWidth = 2.2 * 2;
    c.strokeStyle = PASS === 0 ? RIM : OUT;
    c.stroke();
  } else {
    circles(-1);
    c.fillStyle = HP.body;
    c.fill();
    circles(1);
    c.fillStyle = HP.lit;
    c.fill();
    c.strokeStyle = HP.line;
    c.lineCap = 'round';
    for (let i = 0; i < CURLS.length; i++) {
      const r = CURLS[i]![2], a0 = rnd(i * 7.7) * TAU;
      c.lineWidth = 1.25;
      c.beginPath();
      c.arc(cx(i), cy(i), r * 0.86, a0, a0 + 3.9);
      c.stroke();
      c.lineWidth = HAIR;
      c.globalAlpha = 0.8;
      c.beginPath();
      c.arc(cx(i) + 0.8, cy(i) + 0.6, r * 0.42, a0 + 2.2, a0 + 6);
      c.stroke();
      c.globalAlpha = 1;
    }
  }
  c.restore();

  // near leg, crossed over the other knee, foot dangling and tapping
  {
    const h: Pt = [-4, -4], k: Pt = [-64, -24], a: Pt = [-84 + tap * 1.5, 37 + tap * 2.5];
    S(c, limb([mix(k, a, 0.72), a], [12, 11.5], 3), tone(INK, 0.66), { sm: false, sil: 1.8, lw: 0 }); // sock
    tube(c, h, k, mix(k, a, 0.78), [30, 24, 17], K.body, K.shade, {
      inner: () => fillPoly(c, limb([[-2, -19], [-34, -29.5], [-66, -38]], [10, 9, 8], 3), K.lit, false), // lit top of the thigh
    });
    creases(c, h, k, a, 24, K.line);
    T(c, [[-16, -10], [-36, -15], [-52, -17]], 1.5, 0.3, K.line, 0.6);
    T(c, [[-70, -6], [-74, 6], [-77, 16]], 1.5, 0.3, K.line, 0.55);
    L(c, [[-8, 6], [-24, 2], [-44, -5]], HAIR, K.line, 0.45); // seam under the thigh
    cuff(c, k, a, 0.71, 0.79, 19.5, K.lit, LINE, false);
    sneaker(c, a, 0.62 + tap * 0.22);
  }
  // near arm: the long point, or an open hand on the thigh
  {
    const e = polar(p.nS, p.nA, 48), w = polar(e, p.nB, 46);
    tube(c, p.nS, e, mix(e, w, 0.9), [24, 19.5, 15], J.body, J.shade, {
      inner: () => {
        // lit top of the sleeve
        const n = awayFromLight(p.nS, e);
        fillPoly(c, limb([[p.nS[0] - n[0] * 13, p.nS[1] - n[1] * 13], [e[0] - n[0] * 11, e[1] - n[1] * 11]], [9, 7], 3), J.lit, false);
      },
    });
    creases(c, p.nS, e, w, 19.5, LINE);
    // shoulder seam and an elbow patch
    const m = mix(p.nS, e, 0.16);
    const n = awayFromLight(p.nS, e);
    L(c, [[m[0] + n[0] * 11, m[1] + n[1] * 11], [m[0] - (e[0] - p.nS[0]) * 0.03, m[1] - (e[1] - p.nS[1]) * 0.03], [m[0] - n[0] * 11, m[1] - n[1] * 11]], HAIR, LINE, 0.8);
    const f1 = mix(e, w, 0.3), f2 = mix(e, w, 0.55);
    T(c, [[f1[0] - n[0] * 5, f1[1] - n[1] * 5], [f1[0] + n[0] * 5, f1[1] + n[1] * 5]], 1.4, 0.3, LINE, 0.55);
    T(c, [[f2[0] - n[0] * 2, f2[1] - n[1] * 2], [f2[0] + n[0] * 6, f2[1] + n[1] * 6]], 1.4, 0.3, LINE, 0.5);
    hand(c, w, p.nB, p.point > 0.4 ? 'point' : 'relaxed', sk, true);
    cuff(c, e, w, 0.8, 0.93, 16.6, J.rib);
  }
}

/** an inner outline for a shape whose own edge was held back (third pass only) */
function ink2(c: C2, pts: readonly Pt[], w: number, color: string): void {
  if (PASS !== 2) return;
  c.save();
  c.beginPath();
  trace(c, pts, true, true);
  c.clip();
  c.lineWidth = w * 2;
  c.lineJoin = 'round';
  c.strokeStyle = color;
  c.stroke();
  c.restore();
}

export function drawPointer(c: C2, t: number): void {
  const p = poseP(t), q = poseP(t - 0.17);
  const lagX = (q.head[0] - p.head[0]) * 0.9, lagY = (q.head[1] - p.head[1]) * 0.9;
  figure(c, () => paintPointer(c, t, p, lagX, lagY));
}

// ---- the cheerer ------------------------------------------------------------------------------------

interface PoseC {
  lean: number; lift: number; breath: number; head: Pt; tilt: number; nS: Pt; fS: Pt; nA: number; nB: number; fA: number; fB: number;
  wave: number; cheer: number; clap: number; mouth: number; brow: number; glance: number; laugh: number; rch: number;
}
/** where the popcorn bowl is, relative to the cheerer's hip */
export const BOWL_FROM_CHEERER: Pt = [-96, -16];

function poseC(t: number): PoseC {
  const u = mod(t, LOOP);
  const wave = track(u, K_CWAVE), cheer = track(u, K_CHEER, 1.6), clap = track(u, K_CLAP), leanIn = track(u, K_LEANIN);
  const talk = track(u, K_TALK, 0), rch = track(u, K_REACH, 0.6), eat = track(u, K_EAT, 0.4), glance = track(u, K_CGLANCE);
  const laugh = track(u, K_LAUGH, 0);
  const breath = osc(t, 4.4, 1.3);
  const hop = Math.abs(Math.sin(t * TAU * 1.35));
  const up = Math.max(0, cheer);
  const lift = up * (3 + 5 * hop) + clap * 1.5 * Math.max(0, Math.sin(t * TAU * 3.6));
  const lean = -0.03 - 0.2 * leanIn - 0.3 * rch + 0.08 * cheer - 0.04 * wave - 0.06 * clap + 0.006 * breath + 0.01 * osc(t, 8.9);
  const shake = laugh * Math.sin(t * TAU * 5.6 + 1) * 1.4;
  const off = -lift + shake;
  const at = (x: number, y: number): Pt => {
    const r = rot([x, y - breath * 1.1], lean);
    return [r[0], r[1] + off];
  };
  const nS = at(5, -78), fS = at(-17, -79), head = at(-6, -113);
  const mouthP: Pt = [head[0] - 15, head[1] + 13];
  const cl = Math.max(0, Math.sin(t * TAU * 3.6)) * 9;
  // near arm: on the raised knee; waves; up in a cheer; claps; dips into the bowl; to the mouth
  let [nA, nB] = ik(nS, [-33, -58], 44, 42, -1);
  const blend = (to: [number, number], k: number) => {
    nA = lerp(nA, to[0], k);
    nB = lerp(nB, to[1], k);
  };
  blend(ik(nS, [nS[0] + 22 + Math.sin(t * TAU * 2.1) * 17, nS[1] - 69 - Math.cos(t * TAU * 4.2) * 3], 44, 42, 1), wave);
  blend(ik(nS, [nS[0] + 34 + Math.sin(t * TAU * 2.7) * 6, nS[1] - 62 - hop * 5], 44, 42, 1), cheer);
  blend(ik(nS, [-52 + cl, -86], 44, 42, -1), clap);
  blend(ik(nS, [BOWL_FROM_CHEERER[0] + 4, BOWL_FROM_CHEERER[1] - 14], 44, 42, -1), rch);
  blend(ik(nS, mouthP, 44, 42, -1), eat);
  // far arm: on the tucked knee; up in the cheer; claps
  let [fA, fB] = ik(fS, [-27, -31], 44, 42, -1);
  const c1 = ik(fS, [fS[0] - 36 - Math.sin(t * TAU * 2.7) * 6, fS[1] - 60 - hop * 5], 44, 42, -1);
  fA = lerp(fA, c1[0], cheer);
  fB = lerp(fB, c1[1], cheer);
  const c2 = ik(fS, [-62 - cl, -88], 44, 42, -1);
  fA = lerp(fA, c2[0], clap);
  fB = lerp(fB, c2[1], clap);
  return {
    lean, lift: off, breath, head,
    tilt: -lean * 0.8 + 0.2 * cheer + 0.08 * wave - 0.06 * leanIn + 0.1 * rch + 0.14 * glance + laugh * 0.06 * Math.sin(t * TAU * 2.8) + 0.02 * osc(t, 5.3),
    nS, fS, nA, nB, fA, fB, wave, cheer, clap, laugh, rch,
    mouth: Math.max(0.95 * up, 0.62 * wave, 0.5 * clap, talk * (0.35 + 0.3 * Math.sin(t * TAU * 4.3)), laugh * (0.75 + 0.25 * Math.sin(t * TAU * 5.6)), 0.4 * Math.max(0, Math.min(1, (eat - 0.6) / 0.3))),
    brow: Math.max(up, wave * 0.75, clap * 0.6, leanIn * 0.3),
    glance,
  };
}

function paintCheerer(c: C2, t: number, p: PoseC, lagX: number, lagY: number, wnd: number): void {
  const sk = SKIN_C;
  const raised = p.cheer > 0.35 || p.wave > 0.35;

  // long hair down the back (the tip lags and lifts a little in the wind)
  c.save();
  c.translate(p.head[0], p.head[1]);
  {
    const sx = lagX * 1.3 + wnd, sy = lagY * 0.5;
    const back: Pt[] = [[-3, -23], [10, -25], [21, -16], [27, 2], [31 + sx * 0.3, 30], [35 + sx * 0.7, 60 + sy], [31 + sx, 86 + sy], [24 + sx * 1.1, 98 + sy], [17 + sx * 0.8, 82 + sy], [11 + sx * 0.4, 56], [7, 30], [4, 10]];
    S(c, back, HC.shade, { sil: 2, lw: 0 });
    for (let i = 0; i < 6; i++) {
      const k = i / 5;
      T(c, [[12 + k * 9, -6 + k * 6], [15 + k * 13 + sx * 0.3, 34], [16 + k * 14 + sx * 0.9, 84 + sy - k * 10]], 1.7, 0.3, i % 2 ? HC.body : HC.line, 0.7);
    }
  }
  c.restore();
  // far leg, tucked under: the thigh lies along the seat and the shin folds back beneath it
  {
    S(c, limb([[-64, 6], [-44, 9], [-22, 10]], [17, 16, 13], 4), JE.farSh, { sm: false, lw: DET });
    const h: Pt = [-8, 1], k: Pt = [-67, -1];
    S(c, limb([h, mix(h, k, 0.5), k], [26, 24, 21], 6), JE.far, {
      sm: false,
      inner: () => fillPoly(c, [[0, 3], [-30, 2], [-72, 4], [-78, 16], [0, 16]], JE.farSh, false),
    });
    L(c, [[-69, -8], [-74, -1], [-70, 7]], HAIR, LINE, 0.7); // the knee
    T(c, [[-58, -9], [-52, -3], [-54, 4]], 1.4, 0.3, LINE, 0.6);
    T(c, [[-22, -9], [-32, -6], [-42, -7]], 1.4, 0.3, LINE, 0.5);
  }
  // far arm
  {
    const e = polar(p.fS, p.fA, 44), w = polar(e, p.fB, 42);
    tube(c, p.fS, e, mix(e, w, 0.9), [17, 14, 11.5], SW.far, SW.farSh, { stripe: SW.stripeFar });
    creases(c, p.fS, e, w, 14, LINE);
    hand(c, w, p.fB, p.cheer > 0.35 ? 'open' : p.clap > 0.3 ? 'flat' : 'relaxed', sk, false);
    cuff(c, e, w, 0.8, 0.93, 13, SW.farSh);
  }
  // torso and head
  c.save();
  c.translate(0, p.lift);
  c.rotate(p.lean);
  const torso: Pt[] = [[19, 7], [23, -20], [21, -50], [16, -72], [8, -85], [-2, -89], [-12, -86], [-21, -77], [-26, -58], [-24, -34], [-21, -12], [-22, 7]];
  S(c, torso, SW.body, {
    lw: 0,
    inner: () => {
      for (let i = 0; i < 9; i++) {
        const y = -80 + i * 10.5;
        ink(c, [[-34, y + 3.5], [-8, y - 1], [28, y + 3]], 3, SW.stripe, 1); // stripes that wrap the body
      }
      c.globalAlpha = 0.62;
      fillPoly(c, [[30, 12], [30, -70], [17, -86], [9, -74], [13, -46], [12, -16], [7, 12]], SW.shade); // the back, in shade
      c.globalAlpha = 1;
      fillPoly(c, [[-30, -5], [-3, -3], [26, -6], [26, 12], [-30, 12]], SW.far, false); // ribbed hem
      for (let i = 0; i < 10; i++) ink(c, [[-24 + i * 5, -2.4], [-24.4 + i * 5, 7]], HAIR, LINE, 0.6, false);
      ink(c, [[-28, -5], [-3, -3], [24, -6]], DET, LINE, 1);
    },
  });
  T(c, [[-23, -24], [-15, -19], [-6, -20]], 1.5, 0.3, LINE, 0.6);
  T(c, [[19, -28], [12, -22], [6, -23]], 1.5, 0.3, LINE, 0.55);
  ink2(c, torso, FORM, LINE);
  // neck and the rolled collar
  S(c, [[-9, -86], [5, -88], [6.5, -103], [-6, -101]], sk.shade, { sil: 2.1, lw: 0, sm: false });
  S(c, [[-14, -86], [-7, -93], [4, -94.5], [12, -89.5], [11, -82.5], [1, -79.5], [-9, -80.5]], SW.body, {
    lw: DET,
    inner: () => {
      for (let i = 0; i < 9; i++) ink(c, [[-13 + i * 3.2, -94], [-12 + i * 3.2, -79]], HAIR, SW.stripeFar, 0.7, false);
    },
  });
  L(c, [[-10, -86.5], [0, -84.5], [9, -87.5]], HAIR, LINE, 0.7);
  // head
  c.translate(-6, -113 - p.breath * 0.7);
  c.rotate(p.tilt);
  headShape(c, p.mouth * 0.9, sk);
  face(c, { blink: blinkAt(t, 5.1, 9), brow: p.brow, mouth: p.mouth, look: p.glance * 0.6, lash: true, squint: Math.max(p.laugh, p.cheer > 0.8 ? 1 : 0) }, sk, HC.dark);
  L(c, [[-13, 17 + p.mouth * 1.8], [-9, 19.6 + p.mouth * 2]], HAIR, sk.line, 0.5, false);
  // hair: swept back from a parting, tucked behind the ear, one long lock over the near shoulder
  const lx = lagX * 1.1 + wnd * 0.8, ly = lagY * 0.4;
  const lock: Pt[] = [[10, 4], [21, 5], [27 + lx * 0.3, 24], [28 + lx * 0.7, 42], [24 + lx, 56 + ly], [19.5 + lx * 1.1, 66 + ly], [17 + lx * 0.9, 52 + ly], [15 + lx * 0.5, 36], [12, 22]];
  S(c, lock, HC.body, {
    sil: 1.9, lw: 0,
    inner: () => fillPoly(c, [[21, 4], [32, 6], [32, 70], [23, 70], [23.5, 44], [22, 24]], HC.shade),
  });
  const cap: Pt[] = [[-15.4, -11.5], [-12.4, -20], [-3, -25.6], [10, -25], [20.5, -16], [24.6, -2], [23.4, 10], [16, 13], [12.6, 6], [10, -3], [4.6, -9.4], [-3, -11.6], [-9.6, -10.4]];
  S(c, cap, HC.body, {
    sil: 2.2, lw: 0,
    inner: () => {
      fillPoly(c, [[-18, -10], [-14, -24], [-2, -29], [8, -27], [-2, -21], [-9, -15], [-12, -8]], HC.lit); // lit crown
      fillPoly(c, [[26, -6], [26, 14], [14, 14], [17, 4], [19, -6], [16, -18]], HC.shade);
    },
  });
  ear(c, 8.5, 2.5, sk);
  if (PASS === 2) {
    c.beginPath();
    c.arc(7.6, 9.6, 1.7, 0, TAU);
    c.fillStyle = GOLD;
    c.fill();
    // the parting and the strands that leave it
    taper(c, [[-7, -23.4], [0, -21], [5, -16]], 1.5, 0.3, HC.dark, 0.9);
    taper(c, [[-12, -18], [-4, -19.5], [6, -15], [12, -5]], 1.6, 0.3, HC.line, 0.8);
    taper(c, [[-13.5, -13.5], [-5, -15], [4, -12], [10, -4]], 1.4, 0.3, HC.line, 0.6);
    taper(c, [[-2, -24.6], [9, -22], [17, -13], [21, 0]], 1.6, 0.3, HC.line, 0.8);
    taper(c, [[4, -21], [13, -15], [18, -4], [19, 8]], 1.4, 0.3, HC.dark, 0.55);
    taper(c, [[14, 8], [19 + lx * 0.3, 26], [20.5 + lx * 0.7, 44], [19.5 + lx, 62 + ly]], 1.7, 0.3, HC.line, 0.85);
    taper(c, [[19, 7], [24 + lx * 0.3, 24], [25 + lx * 0.7, 40], [22.5 + lx, 55 + ly]], 1.5, 0.3, HC.line, 0.7);
    taper(c, [[11.5, 10], [15 + lx * 0.3, 28], [17.5 + lx * 0.6, 46]], 1.4, 0.3, HC.dark, 0.6);
    // a loose wisp at the brow that the wind catches
    taper(c, [[-12, -19], [-16.5, -13], [-17.5 + wnd * 0.5, -6]], 1.5, 0.3, HC.body, 1);
  }
  ink2(c, cap, DET, HC.line);
  c.restore();

  // near leg: knee hugged up, foot flat on the seat
  {
    const h: Pt = [-4, -2], k: Pt = [-32, -56 + p.lift * 0.5], a: Pt = [-37, -7];
    tube(c, h, k, mix(k, a, 0.82), [27, 21.5, 15], JE.body, JE.shade, {
      inner: () => fillPoly(c, [[-12, -8], [-36, -50], [-30, -66], [-18, -44], [-2, -14]], JE.lit), // lit top of the thigh
    });
    creases(c, h, k, a, 21, LINE);
    T(c, [[-10, -16], [-20, -32], [-27, -44]], 1.4, 0.3, LINE, 0.5); // outer seam
    L(c, [[-4, 9], [-14, 8]], HAIR, LINE, 0.5, false);
    cuff(c, k, a, 0.75, 0.83, 17.4, JE.lit, LINE, false);
    sock(c, a, 0.06);
  }
  // near arm
  {
    const e = polar(p.nS, p.nA, 44), w = polar(e, p.nB, 42);
    tube(c, p.nS, e, mix(e, w, 0.9), [19.5, 15.5, 12.5], SW.body, SW.shade, { stripe: SW.stripe });
    creases(c, p.nS, e, w, 15.5, LINE);
    hand(c, w, p.nB, raised ? 'open' : p.clap > 0.3 ? 'flat' : p.rch > 0.5 ? 'fist' : 'relaxed', sk, false);
    cuff(c, e, w, 0.8, 0.93, 14, SW.far);
  }
}

export function drawCheerer(c: C2, t: number, wx: number): void {
  const p = poseC(t), q = poseC(t - 0.2);
  const lagX = q.head[0] - p.head[0], lagY = q.head[1] - p.head[1];
  const wnd = wind(t - 0.2, wx) * 2.2;
  figure(c, () => paintCheerer(c, t, p, lagX, lagY, wnd));
}
