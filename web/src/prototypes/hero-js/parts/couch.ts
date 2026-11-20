// The couch and the two friends watching the game. A small two-seat couch on the ground at COUCH, outlined in
// BLUE with a very dark flat fill; two friends sit on it in profile, facing left toward the TV.
//   Friend A (left, nearer the TV) points at the TV, waves, points again: 6.4 s loop.
//   Friend B (right) waves from the elbow, cheers with both arms, leans in to talk: 9.1 s loop.
// Both breathe (3.6 s, 4.3 s), bob their heads, and tap a foot now and then (5.3 s, 7.7 s).
// Everything is drawn in a local frame: origin at the couch's left foot on the ground, x right, y up negative,
// rotated to the slope of the ground under the couch.
import { BLUE, COUCH, groundY } from '../engine/layout';
import type { Part, Pen, Pt } from '../engine/types';
import { add, bump, smooth, closeLoop, lerp, limb, mod, osc, polar, ring, roundRect, stepper } from './right/kit';

const DARK = '#131b28'; // the flat fill of the couch and the friends
const LW = 4.5; // outline width

type Shape = { pts: Pt[]; r: number; fill?: string; seed: number };

function shape(pen: Pen, s: Shape) {
  if (s.r <= 0) return;
  pen.fill(s.pts, s.fill ?? DARK, smooth((s.r - 0.45) / 0.55));
  if (s.fill === BLUE) return; // hair: a flat fill only
  pen.stroke(closeLoop(s.pts), { color: BLUE, width: LW, reveal: s.r, seed: s.seed });
}

// ---------- the couch ----------

function couchShapes(r: (i: number) => number): Shape[] {
  const back: Pt[] = [[30, -58], [30, -112], [44, -130], [170, -135], [298, -132], [312, -114], [312, -58]];
  const armL: Pt[] = [[0, -14], [0, -84], [6, -100], [24, -105], [42, -99], [47, -84], [47, -14]];
  const armR: Pt[] = armL.map(([x, y]) => [340 - x, y] as Pt).reverse();
  return [
    { pts: [[14, -16], [28, -16], [24, 0], [16, 0]], r: r(0), seed: 301 },
    { pts: [[312, -16], [326, -16], [324, 0], [316, 0]], r: r(0), seed: 302 },
    { pts: back, r: r(1), seed: 303 },
    { pts: roundRect(6, -60, 334, -14, 8), r: r(2), seed: 304 },
    { pts: roundRect(40, -76, 172, -56, 8), r: r(3), seed: 305 },
    { pts: roundRect(168, -76, 300, -56, 8), r: r(3), seed: 306 },
    { pts: armL, r: r(4), seed: 307 },
    { pts: armR, r: r(4), seed: 308 },
  ];
}

// ---------- the friends ----------

interface Pose {
  hipX: number;
  torsoA: number; // angle of the spine, hip to shoulder (-PI/2 is straight up)
  torsoLen: number;
  headBob: number;
  headTilt: number;
  near: [number, number]; // upper arm and forearm angles, absolute
  far: [number, number];
  finger: number; // 0..1 how far the pointing finger is out
  tapNear: number; // toe lift, radians
  tapFar: number;
  hair: 'short' | 'long';
}

const HEAD_R = 21;

function friendShapes(p: Pose, r: (i: number) => number, seed: number): { shapes: Shape[]; finger?: [Pt, Pt, number]; eye: Pt; eyeR: number } {
  const hip: Pt = [p.hipX, -66];
  const S = polar(hip, p.torsoA, p.torsoLen);
  const head = add(polar(S, p.torsoA + p.headTilt * 0.5, 33), 0, p.headBob);
  const tilt = p.headTilt;

  // legs: hip, knee, ankle; the foot pivots on the heel for a tap
  const leg = (dx: number, dy: number, tap: number, ri: number, sd: number): Shape[] => {
    const H: Pt = [p.hipX + 4 + dx, -60 + dy];
    const K: Pt = [p.hipX - 58 + dx, -80 + dy];
    const A: Pt = [p.hipX - 64 + dx, -11 + dy * 0.3];
    const toe = polar(A, Math.PI + tap, 24);
    return [
      { pts: limb([A, toe], [15, 11]), r: r(ri), seed: sd },
      { pts: limb([H, K, A], [28, 21, 15]), r: r(ri), seed: sd + 1 },
    ];
  };
  const arm = (a: [number, number], drop: number, ri: number, sd: number): { s: Shape[]; hand: Pt; fa: number } => {
    const As = polar(S, p.torsoA, -drop);
    const E = polar(As, a[0], 44);
    const Hn = polar(E, a[1], 42);
    const hand = polar(E, a[1], 45);
    return {
      s: [
        { pts: limb([As, E, Hn], [16, 14, 12]), r: r(ri), seed: sd },
        { pts: ring(hand, 8.5, 14), r: r(ri), seed: sd + 1 },
      ],
      hand,
      fa: a[1],
    };
  };

  // the head: a slightly tall oval with a nose bump on the left (the face side)
  const noseA = Math.PI - 0.12 + tilt;
  const headPts = ring(head, (th) => {
    let d = th - noseA;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const nose = 6 * Math.exp(-(d * d) / 0.018);
    const oval = 1 + 0.08 * Math.sin(th) ** 2;
    return HEAD_R * oval + nose;
  }, 40);

  // hair: a flat BLUE cap over the top and back of the head
  const hairPts: Pt[] = [];
  if (p.hair === 'short') {
    for (let i = 0; i <= 16; i++) {
      const th = Math.PI + 0.45 + tilt + (i / 16) * (Math.PI + 0.1);
      hairPts.push(polar(head, th, HEAD_R + 5 + 3.5 * Math.abs(Math.sin(i * 1.7))));
    }
    const inner = add(head, 4, 4);
    for (let i = 16; i >= 0; i--) {
      const th = Math.PI + 0.45 + tilt + (i / 16) * (Math.PI + 0.1);
      hairPts.push(polar(inner, th, HEAD_R - 4));
    }
  } else {
    for (let i = 0; i <= 14; i++) {
      const th = Math.PI + 0.55 + tilt + (i / 14) * (Math.PI - 0.3);
      hairPts.push(polar(head, th, HEAD_R + 5));
    }
    const sway = 3 * Math.sin(tilt * 4);
    hairPts.push(add(head, 25 + sway, 22), add(head, 22 + sway, 46), add(head, 8 + sway, 52), add(head, 4, 26));
    const inner = add(head, 3, 3);
    for (let i = 12; i >= 0; i--) {
      const th = Math.PI + 0.55 + tilt + (i / 12) * (Math.PI - 0.6);
      hairPts.push(polar(inner, th, HEAD_R - 3));
    }
  }

  const farArm = arm(p.far, 10, 1, seed + 10);
  const nearArm = arm(p.near, 8, 6, seed + 20);
  const torso = limb([hip, S], [42, 38]);
  const neck = limb([polar(S, p.torsoA, -6), head], 14);

  const shapes: Shape[] = [
    ...farArm.s,
    ...leg(13, -4, p.tapFar, 2, seed + 30),
    { pts: torso, r: r(0), seed: seed + 40 },
    ...leg(0, 0, p.tapNear, 3, seed + 50),
    { pts: neck, r: r(4), seed: seed + 60 },
    { pts: headPts, r: r(4), seed: seed + 61 },
    { pts: hairPts, r: r(5), fill: BLUE, seed: seed + 62 },
    ...nearArm.s,
  ];
  const eye = polar(head, Math.PI + 0.38 + tilt, 12);
  const finger: [Pt, Pt, number] | undefined =
    p.finger > 0.02 ? [polar(nearArm.hand, nearArm.fa, 7), polar(nearArm.hand, nearArm.fa, 8 + 14 * p.finger), r(6)] : undefined;
  return { shapes, finger, eye, eyeR: r(5) };
}

const PI = Math.PI;
const UP = PI * 1.5; // angle of "straight up" kept in the same branch as "left" (PI)

function poseA(t: number): Pose {
  const u = mod(t, 6.4);
  const wave = bump(u, 2.6, 5.4, 0.45);
  const point = 1 - wave;
  const jab = 0.11 * osc(t, 0.8) * point;
  const waveSwing = 0.5 * osc(t, 0.52);
  const nearU = lerp(PI + 0.2 + jab, PI + 0.62, wave);
  const nearF = lerp(PI + 0.16 + jab * 0.6, UP - 0.3 + waveSwing, wave);
  const tapEnv = bump(mod(t, 5.3), 1.0, 2.7, 0.25);
  return {
    hipX: 118,
    torsoA: -PI / 2 - lerp(0.2, 0.08, wave) - 0.02 * osc(t, 3.6),
    torsoLen: 84 * (1 + 0.016 * osc(t, 3.6)),
    headBob: 2.4 * osc(t, 2.3) + 1.5 * osc(t, 0.9) * point,
    headTilt: 0.07 * osc(t, 4.1, 1) + 0.12 * wave,
    near: [nearU, nearF],
    far: [2.0 + 0.04 * osc(t, 3.6), 3.08],
    finger: point,
    tapNear: 0.42 * (0.5 - 0.5 * Math.cos((t * 2 * PI) / 0.44)) * tapEnv,
    tapFar: 0,
    hair: 'short',
  };
}

function poseB(t: number): Pose {
  const u = mod(t, 9.1);
  const wave = bump(u, 0.4, 3.3, 0.45);
  const cheer = bump(u, 4.0, 5.9, 0.35);
  const lean = bump(u, 6.4, 8.8, 0.6);
  const bounce = 0.13 * osc(t, 0.5);
  // the near arm: resting on the lap, then each move blended over it
  let nu = 2.02 + 0.03 * osc(t, 4.3);
  let nf = PI - 0.1;
  nu = lerp(nu, PI + 0.62, wave);
  nf = lerp(nf, UP - 0.12 + 0.48 * osc(t, 0.6), wave);
  nu = lerp(nu, 3.95 + bounce, cheer);
  nf = lerp(nf, 4.5 + bounce, cheer);
  nu = lerp(nu, 2.45, lean);
  nf = lerp(nf, 3.55 + 0.3 * osc(t, 0.8), lean);
  let fu = 1.9;
  let ff = PI - 0.2;
  fu = lerp(fu, 5.1 - bounce, cheer);
  ff = lerp(ff, 4.85 - bounce, cheer);
  const tapEnv = bump(mod(t, 7.7), 3.0, 4.7, 0.25);
  return {
    hipX: 228,
    torsoA: -PI / 2 - 0.12 - 0.3 * lean + 0.16 * cheer - 0.02 * osc(t, 4.3),
    torsoLen: 86 * (1 + 0.016 * osc(t, 4.3)) + 4 * cheer,
    headBob: 2 * osc(t, 2.9, 1) + 3 * osc(t, 0.5) * cheer,
    headTilt: 0.06 * osc(t, 5.2) + 0.13 * osc(t, 0.7) * lean - 0.1 * cheer,
    near: [nu, nf],
    far: [fu, ff],
    finger: 0,
    tapNear: 0.38 * (0.5 - 0.5 * Math.cos((t * 2 * PI) / 0.38)) * tapEnv,
    tapFar: 0,
    hair: 'long',
  };
}

export const couch: Part = {
  id: 'couch',
  z: 24,
  intro: [1.6, 2.8],
  draw(pen, f) {
    if (f.reveal <= 0) return;
    const x0 = COUCH.x;
    const x1 = COUCH.x + 340;
    const y0 = groundY(x0);
    const ctx = pen.ctx;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(Math.atan2(groundY(x1) - y0, x1 - x0));

    shapesOut(pen, couchShapes(stepper(f.reveal, 0, 0.42, 5, 0.18)));
    const a = friendShapes(poseA(f.t), stepper(f.reveal, 0.36, 0.86, 7, 0.16), 400);
    const b = friendShapes(poseB(f.t), stepper(f.reveal, 0.5, 1, 7, 0.16), 500);
    for (const fr of [b, a]) {
      shapesOut(pen, fr.shapes);
      if (fr.eyeR > 0) pen.fill(ring(fr.eye, 2.4, 10), BLUE, fr.eyeR);
      if (fr.finger) pen.stroke([fr.finger[0], fr.finger[1]], { color: BLUE, width: 6, reveal: fr.finger[2], seed: 9 });
    }
    ctx.restore();
  },
};

function shapesOut(pen: Pen, list: Shape[]) {
  for (const s of list) shape(pen, s);
}
