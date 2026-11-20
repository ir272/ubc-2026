// Fighter rig and poses. Owner: art. Pure math, no canvas.
// Local space: feet on y = 0, y up is negative, the figure faces +x, 1 unit = 1 px at fight scale.
// Angles use the old swordsman's convention: dirv(a) = [sin a, cos a]
//   0 = straight down, PI/2 = forward, PI = straight up, > PI = up and back.

export const dirv = (a) => [Math.sin(a), Math.cos(a)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
export const mix = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];

// Body proportions per class. hipH: hip height standing; torso: hip -> shoulder; crouchDrop:
// how far the hip sinks at crouch 1; stance: half the gap between the feet; lean0: rest lean.
export const CLS = {
  duelist:   { hipH: 38, torso: 34, thigh: 20, shin: 20, upper: 13, fore: 13, crouchDrop: 14, stance: 5,  lean0: 0.05 },
  warden:    { hipH: 39, torso: 33, thigh: 21, shin: 20, upper: 13, fore: 13, crouchDrop: 12, stance: 9,  lean0: 0.0 },
  thief:     { hipH: 29, torso: 28, thigh: 19, shin: 19, upper: 13, fore: 13, crouchDrop: 8,  stance: 12, lean0: 0.55 },
  hexer:     { hipH: 46, torso: 39, thigh: 24, shin: 24, upper: 15, fore: 15, crouchDrop: 12, stance: 4,  lean0: -0.05 },
  archivist: { hipH: 40, torso: 34, thigh: 21, shin: 21, upper: 14, fore: 13, crouchDrop: 12, stance: 6,  lean0: 0.1 },
  penitent:  { hipH: 37, torso: 31, thigh: 20, shin: 19, upper: 17, fore: 17, crouchDrop: 12, stance: 10, lean0: 0.4, armOff: [9, 6] },
};
export const CLASS_IDS = Object.keys(CLS);

// Weapon rest poses and strike keyframes. Keys: armA, bend (forearm = armA + bend), wpnA,
// lean (added to lean0), crouch, offA, offBend, hipX (a lunge step), offW (far-hand weapon).
const K = (o) => ({ armA: 0.6, bend: 0, wpnA: 2.4, lean: 0, crouch: 0, offA: 0.35, offBend: 0.5, hipX: 0, offW: 2.2, ...o });

export const WPN = {
  sabre: {
    rest: K({}),
    wind: K({ armA: 2.8, wpnA: 3.3, lean: -0.15 }),
    act: K({ armA: 1.2, wpnA: 0.9, lean: 0.30 }),
    rec: K({ armA: 1.1, wpnA: 0.9, lean: 0.20 }),
    alt: (k) => ({ ...k, wpnA: Math.PI - k.wpnA + 1.2 }),
    guard: K({ armA: 1.75, bend: 1.3, wpnA: 3.05, crouch: 0.3, lean: -0.05 }),
    ready: K({ armA: 1.2, bend: 0.5, wpnA: 1.95, crouch: 0.3, lean: 0.15 }),
    victory: K({ armA: 3.0, bend: 0.05, wpnA: 3.1, lean: -0.08 }),
  },
  maul: {
    rest: K({ armA: 0.3, bend: 1.9, wpnA: 3.75, offA: 0.5, offBend: 1.6 }),
    wind: K({ armA: 3.15, bend: 0.25, wpnA: 4.95, lean: -0.3, crouch: 0.1 }),
    act: K({ armA: 1.3, bend: 0.0, wpnA: 1.25, lean: 0.45, crouch: 0.4, hipX: 6 }),
    rec: K({ armA: 1.15, bend: 0.0, wpnA: 1.3, lean: 0.4, crouch: 0.4, hipX: 6 }),
    guard: K({ armA: 1.1, bend: 1.0, wpnA: 2.65, crouch: 0.3 }),
    ready: K({ armA: 0.9, bend: 0.9, wpnA: 2.3, crouch: 0.3, lean: 0.1 }),
    victory: K({ armA: 2.9, bend: 0.2, wpnA: 3.3, lean: -0.1 }),
    twoHand: 0.62,     // where along the haft the far hand grips (0 = main hand, 1 = past it)
  },
  knives: {
    rest: K({ armA: 0.55, bend: 1.35, wpnA: 2.25, offA: 0.85, offBend: 1.25, offW: 2.0, crouch: 0.15, lean: 0.08 }),
    wind: K({ armA: 0.25, bend: 2.1, wpnA: 1.95, offA: 1.2, offBend: 1.1, offW: 2.1, crouch: 0.2, lean: 0.12 }),
    act: K({ armA: 1.55, bend: 0.05, wpnA: 1.62, offA: 0.4, offBend: 1.7, offW: 2.3, crouch: 0.25, lean: 0.3, hipX: 4 }),
    rec: K({ armA: 1.25, bend: 0.5, wpnA: 1.75, offA: 0.6, offBend: 1.5, offW: 2.2, crouch: 0.2, lean: 0.22, hipX: 3 }),
    // odd cuts: the far hand jabs while the near one draws back
    alt: (k) => ({ ...k, armA: k.offA, bend: k.offBend, wpnA: k.offW, offA: k.armA, offBend: k.bend, offW: k.wpnA }),
    guard: K({ armA: 1.6, bend: 1.35, wpnA: 2.9, offA: 1.5, offBend: 1.4, offW: 3.4, crouch: 0.35 }),
    ready: K({ armA: 1.1, bend: 0.9, wpnA: 1.9, offA: 1.0, offBend: 1.0, offW: 2.0, crouch: 0.35, lean: 0.2 }),
    victory: K({ armA: 2.8, bend: 0.2, wpnA: 3.2, offA: 2.6, offBend: 0.3, offW: 3.4 }),
  },
  pole: {
    rest: K({ armA: 0.75, bend: 0.55, wpnA: 2.2, offA: 0.4, offBend: 1.0 }),
    wind: K({ armA: 0.25, bend: 1.5, wpnA: 1.95, lean: -0.12, hipX: -3 }),
    act: K({ armA: 1.5, bend: 0.1, wpnA: 1.72, lean: 0.32, crouch: 0.25, hipX: 12 }),
    rec: K({ armA: 1.4, bend: 0.2, wpnA: 1.78, lean: 0.25, crouch: 0.2, hipX: 9 }),
    guard: K({ armA: 1.0, bend: 1.3, wpnA: 2.7, crouch: 0.3 }),
    ready: K({ armA: 1.1, bend: 0.6, wpnA: 1.9, crouch: 0.3, lean: 0.12 }),
    victory: K({ armA: 2.75, bend: 0.3, wpnA: 2.95, lean: -0.08 }),
    grip: 40,          // units of pole behind the main hand
    twoHand: -0.75,    // far hand grips behind the main hand (fraction of `grip`)
  },
  censer: {
    rest: K({ armA: 0.55, bend: 0.55, wpnA: 0.12 }),
    wind: K({ armA: 2.95, bend: 0.2, wpnA: 5.1, lean: -0.15 }),
    act: K({ armA: 1.45, bend: 0.0, wpnA: 1.75, lean: 0.3, hipX: 4 }),
    rec: K({ armA: 1.05, bend: 0.2, wpnA: 0.9, lean: 0.2 }),
    guard: K({ armA: 1.95, bend: 1.3, wpnA: 0.2, crouch: 0.3 }),
    ready: K({ armA: 1.0, bend: 0.5, wpnA: 0.5, crouch: 0.3, lean: 0.12 }),
    victory: K({ armA: 2.9, bend: 0.1, wpnA: 0.15, lean: -0.1 }),
    chain: true,
  },
  quill: {
    rest: K({ armA: 0.7, bend: 0.45, wpnA: 2.05 }),
    wind: K({ armA: 2.9, bend: 0.2, wpnA: 3.65, lean: -0.18 }),
    act: K({ armA: 1.25, bend: 0.0, wpnA: 0.75, lean: 0.36, hipX: 3 }),
    rec: K({ armA: 1.12, bend: 0.0, wpnA: 0.8, lean: 0.25 }),
    alt: (k) => ({ ...k, wpnA: Math.PI - k.wpnA + 1.1 }),
    guard: K({ armA: 1.75, bend: 1.3, wpnA: 3.0, crouch: 0.3, lean: -0.05 }),
    ready: K({ armA: 1.15, bend: 0.5, wpnA: 1.85, crouch: 0.3, lean: 0.15 }),
    victory: K({ armA: 2.95, bend: 0.1, wpnA: 3.15, lean: -0.08 }),
  },
};
export const WEAPON_IDS = Object.keys(WPN);

// Class-specific rests for some weapons (the penitent drags the maul, arms hanging).
const CLASS_REST = {
  penitent: {
    maul: { armA: 0.3, bend: 0.25, wpnA: 1.02, offA: 0.2, offBend: 0.3, twoHand: false },
    sabre: { armA: 0.35, bend: 0.6, offA: 0.15, offBend: 0.3 },
    quill: { armA: 0.35, bend: 0.7, offA: 0.15, offBend: 0.3 },
    pole: { offA: 0.15, offBend: 0.4 },
    censer: { armA: 0.4, bend: 0.4, offA: 0.15, offBend: 0.3 },
    knives: { armA: 0.4, bend: 1.2, offA: 0.6, offBend: 1.0 },
  },
};
export function restOf(cls, weapon) {
  const W = WPN[weapon] || WPN.sabre;
  const o = CLASS_REST[cls] && CLASS_REST[cls][weapon];
  return o ? { ...W.rest, ...o } : W.rest;
}

function mixKey(a, b, u) {
  const o = {};
  for (const k in a) o[k] = typeof a[k] === 'number' ? lerp(a[k], b[k] ?? a[k], u) : a[k];
  return o;
}

// Weapon pose for a strike: phase 'wind' | 'act' | 'rec' with u in 0..1.
export function strikeKey(weapon, phase, u, combo = 0, heavy = false, cls = null) {
  const W = WPN[weapon] || WPN.sabre;
  const rest = cls ? restOf(cls, weapon) : W.rest;
  let k;
  if (phase === 'wind') k = mixKey(rest, W.wind, u);
  else if (phase === 'act') k = mixKey(W.wind, W.act, weapon === 'sabre' ? u : 1 - Math.pow(1 - u, 2));
  else k = mixKey(W.act, W.rec, Math.min(1, u * 2));
  if (heavy && weapon !== 'maul') {
    // heavy: a deeper wind, a longer lunge
    if (phase === 'wind') { k.armA += 0.25 * u; k.lean -= 0.08 * u; k.crouch += 0.15 * u; }
    else { k.lean += 0.08; k.crouch += 0.15; k.hipX += 4; }
  }
  if (combo % 2 === 1 && W.alt && weapon !== 'censer') k = W.alt(k);
  return k;
}

// Two-bone IK: the joint between a and b, on the side whose x has sign `side`.
export function ik(a, b, l1, l2, side = 1) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy) || 1e-3;
  const dd = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const ux = dx / d, uy = dy / d;
  let nx = -uy, ny = ux;
  if (nx * side < 0 || (Math.abs(nx) < 1e-3 && ny > 0)) { nx = -nx; ny = -ny; }
  return [a[0] + ux * along + nx * h, a[1] + uy * along + ny * h];
}

// Solve the joints for a pose P.
//   P: { lean, crouch, armA, bend, wpnA, offA, offBend, hipX, legPh, stride, tuck, kneel, lift, offTarget }
// Portrait proportions: longer legs, a longer trunk and arms (the head is drawn smaller
// by the body code). About 1.2x the fight sprite's height in the same units.
export const ADULT = { leg: 1.36, torso: 1.14, arm: 1.2, stance: 1.05, height: 1.17 };
function adultOf(C) {
  return { ...C, hipH: C.hipH * ADULT.leg, thigh: C.thigh * ADULT.leg, shin: C.shin * ADULT.leg, torso: C.torso * ADULT.torso, upper: C.upper * ADULT.arm, fore: C.fore * ADULT.arm, stance: C.stance * ADULT.stance, crouchDrop: C.crouchDrop * ADULT.leg, armOff: C.armOff, adult: true };
}

export function rig(cls, P) {
  const C = P.adult ? adultOf(CLS[cls] || CLS.duelist) : (CLS[cls] || CLS.duelist);
  const lean = C.lean0 + (P.lean || 0);
  const crouch = P.crouch || 0;
  let hipY = -(C.hipH - crouch * C.crouchDrop);
  if (P.kneel) hipY = -(C.shin + 6);
  const hip = [P.hipX || 0, hipY - (P.lift || 0)];
  // breath: the chest and shoulders rise and settle (P.breath -1..1)
  const br = P.breath || 0;
  const sh = [hip[0] + Math.sin(lean) * C.torso + br * 0.25, hip[1] - Math.cos(lean) * C.torso - br * 0.9];
  const R = { C, cls, lean, hip, sh };
  // legs: far (-1) then near (+1)
  R.feet = []; R.knees = [];
  for (const s of [-1, 1]) {
    let foot;
    if (P.kneel) {
      foot = s > 0 ? [hip[0] - C.thigh * 0.9, 0] : [hip[0] + C.thigh * 0.85, 0];
    } else if (P.legPh != null) {
      const ph = P.legPh + (s > 0 ? 0 : Math.PI);
      const sw = Math.sin(ph) * 12 * (C.thigh / 20);
      foot = [hip[0] * 0.6 + sw + s * C.stance * 0.6, -Math.max(0, Math.cos(ph)) * 3.5];
    } else {
      foot = [hip[0] * 0.55 + s * (C.stance + (P.stride || 0)), 0];
    }
    if (P.tuck) foot = [mix(foot, hip, 0.25)[0] - s * 2, foot[1] - P.tuck * 10];
    if (P.lift) foot = [foot[0], foot[1] - P.lift];
    const knee = P.kneel && s > 0 ? [hip[0] + 4, -2] : ik(hip, foot, C.thigh, C.shin, 1);
    if (P.kneel && s > 0) foot = [knee[0] - C.shin, -1];
    R.feet.push(foot); R.knees.push(knee);
  }
  // near (weapon) arm, rooted at the shoulder joint (forward of the spine on a hunched body)
  const ao = C.armOff || [0, 0];
  const up = [Math.sin(lean), -Math.cos(lean)], fwd = [-up[1], up[0]];
  const shA = add(add(sh, fwd, ao[0]), up, -ao[1]);
  R.shA = shA;
  if (P.handTarget) {
    // place the weapon hand (portrait carry poses)
    const tgt = P.handTarget;
    const d = Math.hypot(tgt[0] - shA[0], tgt[1] - shA[1]);
    const reach = C.upper + C.fore - 0.3;
    R.hand = d > reach ? add(shA, [(tgt[0] - shA[0]) / d, (tgt[1] - shA[1]) / d], reach) : tgt;
    let e = ik(shA, R.hand, C.upper, C.fore, -1);
    const e2 = ik(shA, R.hand, C.upper, C.fore, 1);
    if (e2[1] > e[1] + 0.5) e = e2;   // the elbow that hangs lower
    R.elbow = e;
  } else {
    const fa = (P.armA ?? 0.6) + (P.bend || 0);
    R.elbow = add(shA, dirv(P.armA ?? 0.6), C.upper);
    R.hand = add(R.elbow, dirv(fa), C.fore);
  }
  // far arm: shoulder a touch behind and lower
  R.shF = [shA[0] - 3.5, shA[1] + 1.5];
  if (P.offTarget) {
    const tgt = P.offTarget;
    R.offFixed = true;
    const d = Math.hypot(tgt[0] - R.shF[0], tgt[1] - R.shF[1]);
    const reach = C.upper + C.fore - 0.5;
    const t2 = d > reach ? add(R.shF, [(tgt[0] - R.shF[0]) / d, (tgt[1] - R.shF[1]) / d], reach) : tgt;
    R.elbowF = ik(R.shF, t2, C.upper, C.fore, -1);
    // prefer an elbow that hangs below the line (no chicken wings)
    if (R.elbowF[1] < Math.min(R.shF[1], t2[1])) R.elbowF = ik(R.shF, t2, C.upper, C.fore, 1);
    R.handF = t2;
    R.offGrip = d <= reach + 4;
  } else {
    const fb = (P.offA ?? 0.35) + (P.offBend || 0);
    R.elbowF = add(R.shF, dirv(P.offA ?? 0.35), C.upper);
    R.handF = add(R.elbowF, dirv(fb), C.fore);
  }
  R.wpnA = P.wpnA ?? 2.4;
  R.offW = P.offW ?? 2.2;
  return R;
}

// Re-aim the far arm at a grip point (two-handed haft). Leaves it alone if out of reach.
export function gripOff(R, tgt) {
  const C = R.C;
  const d = Math.hypot(tgt[0] - R.shF[0], tgt[1] - R.shF[1]);
  const reach = C.upper + C.fore - 0.3;
  if (d > reach + 3) return false;
  const t2 = d > reach ? add(R.shF, [(tgt[0] - R.shF[0]) / d, (tgt[1] - R.shF[1]) / d], reach) : tgt;
  let e = ik(R.shF, t2, C.upper, C.fore, -1);
  if (e[1] < Math.min(R.shF[1], t2[1]) - 2) e = ik(R.shF, t2, C.upper, C.fore, 1);
  R.elbowF = e; R.handF = t2; R.offGrip = true;
  return true;
}

export { lerp, clamp };
