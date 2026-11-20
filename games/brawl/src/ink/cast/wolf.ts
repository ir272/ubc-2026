// THE WOLF (fighter id 'vise'): a werewolf caught mid-change, bent double in a torn shirt and split
// trousers, inked by the pen from the posed joints. The approved drawing is lab/cast/wolf.js.
//
// How the wolf hangs off the biped skeleton: the engine's neck is his withers (the top of the
// shoulders, under the hump); the real neck and the long head hang forward and down from there,
// aimed by the head tilt. The hind legs are wolf legs: thigh, shin and a long hock drawn from the
// hip and the foot point, the knee forward and the hock back. The shirt takes the side tint.
//
// Where nothing is aimed (idle, walk, run, jumps, win, lose, the howl, the pounce and the wall run)
// the drawing moves the hands, feet or spine itself so he moves like an animal: a four-limbed
// gallop with the paws touching down, a level leap, a rear-up howl. In strikes, hands and feet stay
// where the joints say. Bites (jab, fair, uair, grab, throws, holding) send the jaws to the hitbox.
//
// Deterministic: fixed seeds on every pen call, no Math.random, no Date.
import type { Build, CharacterDef, FigureExtra, Joints } from '../api.ts';
import type { Pen, Pt } from '../pen.ts';
import { h01, smooth } from '../pen.ts';
import { FIGHTERS } from '../../sim/fighters.ts';
import type { Hitbox, MoveDef, MoveId } from '../../sim/types.ts';

const BUILD: Build = { height: 190, hipY: 90, torso: 100, neckLen: 24, arm: [58, 54], leg: [50, 46], shoulderX: 30, stanceX: 54, hunch: 0.85, propLen: 0, heft: 1.1 };
const ARM: [number, number] = [58, 54];
const A = ARM[0] + ARM[1];
const LEG = BUILD.leg[0] + BUILD.leg[1];
/** the drawn wolf leg: thigh, shin and the long hock bone, more than the engine's leg so it folds */
const THIGH = 48, SHIN = 42, META = 34;
/** head scale against the sheet */
const HK = 1.08;

// ---- small math ----
const PI = Math.PI;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const c01 = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const inOutSine = (u: number): number => 0.5 - 0.5 * Math.cos(PI * c01(u));
const outQuad = (u: number): number => 1 - (1 - c01(u)) ** 2;
const add = (a: Pt, v: Pt, k = 1): Pt => [a[0] + v[0] * k, a[1] + v[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt): number => Math.hypot(v[0], v[1]);
const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const perp = (d: Pt): Pt => [-d[1], d[0]];
const dir = (a: number): Pt => [Math.cos(a), Math.sin(a)];
const angOf = (v: Pt): number => Math.atan2(v[1], v[0]);
const mixP = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const within = (p: Pt, c: Pt, r: number): Pt => { const d = sub(p, c), l = len(d); return l <= r ? p : add(c, d, r / (l || 1)); };
const cross = (a: Pt, b: Pt): number => a[0] * b[1] - a[1] * b[0];
const rot = (v: Pt, a: number): Pt => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };

/** two-bone IK from a toward t; the middle joint goes to the side of n. Returns [middle, end]. */
function ik2(a: Pt, t: Pt, l1: number, l2: number, n: Pt): [Pt, Pt] {
  let dx = t[0] - a[0], dy = t[1] - a[1];
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
  const ux = dx / d, uy = dy / d;
  const dd = clamp(d, Math.abs(l1 - l2) + 1, (l1 + l2) * 0.999);
  const end: Pt = [a[0] + ux * dd, a[1] + uy * dd];
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let nx = -uy, ny = ux;
  if (nx * n[0] + ny * n[1] < 0) { nx = -nx; ny = -ny; }
  return [[a[0] + ux * along + nx * h, a[1] + uy * along + ny * h], end];
}

/** which side of the shoulder-hand line the engine put the elbow */
function elbowSign(s: Pt, h: Pt, e: Pt): number { return cross(sub(h, s), sub(e, s)) >= 0 ? 1 : -1; }
function armIK(s: Pt, h: Pt, sign: number): [Pt, Pt] {
  const d = unit(sub(h, s));
  const n: Pt = sign >= 0 ? [-d[1], d[0]] : [d[1], -d[0]];
  return ik2(s, h, ARM[0], ARM[1], n);
}
/** the shoulders off the withers, the way the pose engine places them */
function shouldersOf(hip: Pt, wit: Pt): [Pt, Pt] {
  const u = unit(sub(wit, hip)), f: Pt = [-u[1], u[0]];
  return [add(add(wit, f, 16.5), u, -7.2), add(add(wit, f, -16.5), u, -9)];
}

/** the hitbox a move aims at on this frame: the largest active one, or the nearest in time */
function hitboxAt(md: MoveDef, frame: number): Hitbox | null {
  let best: Hitbox | null = null;
  for (const h of md.hitboxes) if (frame >= h.from && frame <= h.to && (!best || h.r > best.r)) best = h;
  if (best) return best;
  let bd = 1e9;
  for (const h of md.hitboxes) {
    const d = frame < h.from ? h.from - frame : frame - h.to;
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

const BITES: Partial<Record<MoveId, true>> = { jab: true, fair: true, uair: true, grab: true };

// ------------------------------------------------------------------------------------------------
// the wolf's skeleton for this frame, from the joints and the state
// ------------------------------------------------------------------------------------------------

interface PawPose { curl: number; spread: number }
interface Sk {
  hip: Pt; wit: Pt; sF: Pt; sB: Pt; eF: Pt; eB: Pt; hF: Pt; hB: Pt; fF: Pt; fB: Pt;
  head: Pt; muzzle: number; jaw: number; ears: number;
  pF: PawPose; pB: PawPose;
  /** tail: base angle (PI = straight back), droop per segment; mane: how far the fur blows back */
  tailA: number; tailBend: number; mane: number;
  onFloor: boolean;
}

function skeleton(J: Joints, x: FigureExtra): Sk {
  const s = x.state;
  const act = s.action, mv = s.move, f = Math.max(1, s.actionFrame), t = x.t;
  const fd = FIGHTERS[s.fighter] ?? FIGHTERS.vise;
  const md: MoveDef | null = mv && fd ? fd.moves[mv] : null;
  let hip: Pt = J.hip, wit: Pt = J.neck, sF: Pt = J.shoulderF, sB: Pt = J.shoulderB;
  let hF: Pt = J.handF, hB: Pt = J.handB, fF: Pt = J.footF, fB: Pt = J.footB;
  const sideF = elbowSign(J.shoulderF, J.handF, J.elbowF), sideB = elbowSign(J.shoulderB, J.handB, J.elbowB);
  let muzzle = clamp(0.22 + (J.headTilt - (BUILD.hunch + 0.02)) * 0.9, -1.45, 1.1);
  let jaw = 0.3 + 0.05 * Math.sin(t * 2.1);
  let ears = 0.4;
  const pF: PawPose = { curl: 0.75, spread: 0.6 }, pB: PawPose = { curl: 0.75, spread: 0.6 };
  let bite = 0;
  let biteAt: Pt | null = null;
  const vxl = clamp((x.drag * s.facing) / 1200, -1, 1);
  const vy = clamp(s.vy / 0.3, -1, 1);
  let tailA = PI - 0.22 + 0.1 * Math.sin(t * 1.7);
  let tailBend = 0.5 + 0.1 * Math.sin(t * 1.3 + 0.6);
  let mane = 0.35;
  const L = LEG;

  const reshoulder = (): void => { [sF, sB] = shouldersOf(hip, wit); };
  const rearUp = (k: number, lean: number): void => {
    const a0 = angOf(sub(wit, hip)), r = dist(wit, hip);
    wit = add(hip, dir(lerp(a0, -PI / 2 + lean, k)), r);
    reshoulder();
  };
  const hang = (sw: number): void => {
    hF = add(sF, dir(1.28 + sw * 0.32 + 0.03 * Math.sin(t * 2.1)), A * 0.86);
    hB = add(sB, dir(1.42 - sw * 0.32), A * 0.84);
  };

  switch (act) {
    case 'idle': case 'respawn': case 'turn': case 'land':
      hang(0);
      // a wolf stands with the hind feet under the haunches, not a biped's stride
      if (s.grounded) { fB = [lerp(fB[0], hip[0] - 12, 0.7), fB[1]]; fF = [lerp(fF[0], hip[0] + 22, 0.5), fF[1]]; }
      break;
    case 'walk': {
      const ph = (s.x * 100 * s.facing) / (L * 1.25);
      hang(Math.sin(PI * 2 * ph));
      break;
    }
    case 'run': {
      // a gallop: hind pair then fore pair, the paws touching down under the shoulders
      const D = L * 2.5, sf = 0.38;
      const ph = (s.x * 100 * s.facing) / D;
      const foot = (q0: number): Pt => {
        const q = q0 - Math.floor(q0), half = (sf * D) / 2;
        if (q < sf) return [half - (q / sf) * 2 * half, 0];
        const w = (q - sf) / (1 - sf);
        const lift = L * 0.38 * Math.sin(PI * w) ** 0.8 * (1 - 0.35 * w);
        return [-half + inOutSine(w) * 2 * half - Math.sin(PI * w) * L * 0.18 * (1 - w), -lift];
      };
      fF = foot(ph); fB = foot(ph + 0.12);
      const a = foot(ph + 0.5), b = foot(ph + 0.62), cx = wit[0] + 10;
      hF = within([cx + a[0] * 0.9, a[1] * 0.75 - 7], sF, A * 0.97);
      hB = within([cx - 8 + b[0] * 0.9, b[1] * 0.75 - 7], sB, A * 0.97);
      pF.spread = 0.9; pB.spread = 0.9; pF.curl = 0.5; pB.curl = 0.5;
      muzzle = 0.3; jaw = 0.45; ears = 0.7;
      break;
    }
    case 'skid':
      // braking: forepaws braced on the deck ahead
      hF = [wit[0] + 40, -6]; hB = [wit[0] + 24, -6];
      pF.spread = 1; pB.spread = 1; pF.curl = 0.4; pB.curl = 0.4;
      ears = 0.6; jaw = 0.5;
      break;
    case 'rise': case 'fall': {
      const k = act === 'rise' ? 0.85 : 0.35;
      fF = mixP(fF, add(hip, [L * 0.34, L * 0.42]), k);
      fB = mixP(fB, add(hip, [L * 0.02, L * 0.5]), k);
      hF = add(sF, dir(act === 'rise' ? 0.8 : 0.6), A * 0.86);
      hB = add(sB, dir(act === 'rise' ? 1.05 : 0.85), A * 0.86);
      pF.spread = 1.1; pB.spread = 1.0; pF.curl = 0.45;
      jaw = 0.4;
      break;
    }
    case 'win': {
      rearUp(inOutSine(f / 20) * 0.75, 0.25);
      hF = add(sF, dir(0.55), A * 0.6); hB = add(sB, dir(0.9), A * 0.6);
      pF.spread = 1.3; pF.curl = 0.4; pB.spread = 1.2; pB.curl = 0.4;
      const k = inOutSine(f / 20);
      muzzle = lerp(muzzle, -1.2 + 0.05 * Math.sin(t * 9), k); jaw = lerp(jaw, 0.72, k); ears = 0.35;
      tailA = PI - 0.45;
      break;
    }
    case 'lose': {
      const k = inOutSine(f / 24);
      wit = add(wit, [4 * k, 24 * k]); hip = add(hip, [0, 8 * k]); reshoulder();
      hF = [sF[0] + 16, -6]; hB = [sB[0] + 10, -6];
      muzzle = lerp(muzzle, 0.8, k); jaw = 0.12; ears = 1;
      tailA = PI - 1.05; tailBend = 0.6; pF.spread = 0.9; pB.spread = 0.9; pF.curl = 0.4; pB.curl = 0.4;
      break;
    }
    case 'hitstun': case 'held': case 'knockdown': case 'shieldbreak':
      ears = 1; jaw = 0.62; pF.spread = 1.2; pB.spread = 1.2; pF.curl = 0.3; pB.curl = 0.3;
      tailBend = 0.2 + 0.2 * Math.sin(f * 0.7);
      break;
    case 'helpless':
      ears = 0.7; jaw = 0.5; pF.spread = 1.2;
      break;
    case 'shield': case 'shieldstun':
      jaw = 0.55; ears = 0.7; pF.spread = 1.1; pB.spread = 1.1;
      break;
    case 'holding':
      biteAt = add(J.handF, [4, -16]); bite = 1; jaw = 0.1; pF.curl = 1; pB.curl = 1;
      break;
    case 'attack': case 'charge': {
      if (!md || !mv) break;
      const S = md.startup, Ac = md.active, R = md.recovery;
      const actEnd = S + Ac;
      if (md.kind === 'throw') {
        biteAt = add(J.handF, [4, -16]); bite = 1; jaw = 0.1; pF.curl = 1; pB.curl = 1;
        break;
      }
      if (x.movePart === 'active') {
        const both = mv === 'uptilt' || mv === 'upsmash' || mv === 'smash' || mv === 'dair' || mv === 'grab' || mv === 'special';
        pF.spread = 1.4; pF.curl = 0.32;
        if (both) { pB.spread = 1.4; pB.curl = 0.32; }
      }
      if (mv === 'special' && act === 'attack') {
        // POUNCE: crouch, a long level leap claws first, then a skid on all fours
        const lowK = f <= S ? inOutSine(f / S) : 0;
        if (f <= S) {
          hip = add(hip, [-4 * lowK, 16 * lowK]); wit = add(wit, [0, 26 * lowK]); reshoulder();
          hF = mixP(hF, [wit[0] + 34, -7], lowK); hB = mixP(hB, [wit[0] + 18, -7], lowK);
          muzzle = lerp(muzzle, 0.3, lowK); jaw = 0.5; ears = 0.8; tailBend = 0.15; tailA = PI + 0.1;
        } else {
          const front = mixP(J.handF, J.handB, 0.5);
          const lw: Pt = add(front, [-A * 0.8, -6]);
          const lh: Pt = add(lw, [-BUILD.torso * 0.98, 6]);
          const leapF: Pt = add(lh, [-L * 0.55, L * 0.42]), leapB: Pt = add(lh, [-L * 0.82, L * 0.22]);
          // the skid: low, forepaws planted ahead, hind feet braced behind
          const sh: Pt = [J.hip[0] - 10, -60], sw: Pt = [sh[0] + 76, -100];
          const sk = { hip: sh, wit: sw, hF: [sw[0] + 44, -7] as Pt, hB: [sw[0] + 26, -7] as Pt, fF: [sh[0] + 22, 0] as Pt, fB: [sh[0] - 4, 0] as Pt };
          let k = 1, m = 0;
          if (f <= actEnd) k = c01((f - S) / 2);
          else {
            const v = (f - actEnd) / Math.max(1, R);
            m = v < 0.15 ? inOutSine(v / 0.15) : 1;
            k = v < 0.65 ? 1 : 1 - inOutSine((v - 0.65) / 0.35);
          }
          const P = (leap: Pt, skid: Pt, eng: Pt): Pt => mixP(eng, mixP(leap, skid, m), k);
          hip = P(lh, sk.hip, hip); wit = P(lw, sk.wit, wit);
          fF = P(leapF, sk.fF, fF); fB = P(leapB, sk.fB, fB);
          if (m > 0) { hF = P(J.handF, sk.hF, hF); hB = P(J.handB, sk.hB, hB); }
          reshoulder();
          muzzle = lerp(muzzle, lerp(0.02, 0.35, m), k); jaw = lerp(0.8, 0.4, m); ears = 1;
          tailA = PI - 0.45 * k * (1 - m); tailBend = lerp(0.42, 0.06, k);
          mane = 0.9;
          if (m === 0) { pF.spread = 1.5; pF.curl = 0.25; pB.spread = 1.5; pB.curl = 0.25; }
          else { pF.spread = 0.9; pF.curl = 0.4; pB.spread = 0.9; pB.curl = 0.4; }
        }
        break;
      }
      if (mv === 'special2') {
        // HOWL: rear up, paws curled in front, head thrown back, jaws to the sky
        const ff = act === 'charge' ? Math.min(f, S) : f;
        const k = ff <= S ? inOutSine(ff / S) : ff <= actEnd ? 1 : 1 - inOutSine((ff - actEnd) / (R * 0.85));
        hip = add(hip, [-8 * k, 6 * k]);
        rearUp(k * 0.85, 0.18);
        // the howl aims nothing: the paws come up curled from hanging and go back to hanging
        hang(0);
        hF = mixP(hF, add(sF, dir(0.85), A * 0.5), k); hB = mixP(hB, add(sB, dir(0.6), A * 0.5), k);
        const shake = ff > S && ff <= actEnd + 4 ? 0.05 * Math.sin(ff * 2.3) : 0;
        muzzle = lerp(muzzle, -1.3 + shake, k); jaw = lerp(0.3, 0.78, k); ears = 0.5;
        pF.curl = 1; pB.curl = 1; pF.spread = 0.8; pB.spread = 0.8;
        tailA = PI - 0.35 * k; tailBend = 0.5;
        break;
      }
      if (mv === 'recover') {
        // WALL RUN: body near upright, clawing upward, limbs alternating
        const k = f <= S ? inOutSine(f / S) : f <= actEnd ? 1 : 1 - inOutSine((f - actEnd) / (R * 0.6));
        rearUp(k * 0.9, 0.12);
        const c = f * 0.55;
        const sn = Math.sin(c);
        const climbF = add(sF, [10 + 8 * sn, -(A * 0.55 + A * 0.3 * sn)]);
        const climbB = add(sB, [16 - 8 * sn, -(A * 0.55 - A * 0.3 * sn)]);
        const hb = md.hitboxes[0];
        const aim = hb && f >= hb.from && f <= hb.to ? 0.6 : 0;
        hF = mixP(hF, mixP(climbF, J.handF, aim), k); hB = mixP(hB, climbB, k);
        fF = mixP(fF, add(hip, [L * 0.3, L * (0.55 - 0.25 * Math.sin(c + 0.8))]), k);
        fB = mixP(fB, add(hip, [L * 0.12, L * (0.55 + 0.25 * Math.sin(c + 0.8))]), k);
        muzzle = lerp(muzzle, -0.85, k); jaw = 0.55; ears = 0.8;
        pF.spread = 1.3; pF.curl = 0.5; pB.spread = 1.3; pB.curl = 0.5;
        tailA = PI - 1.1 * k; tailBend = 0.15;
        break;
      }
      if (BITES[mv]) {
        const h = hitboxAt(md, Math.max(S + 1, Math.min(f, actEnd)));
        if (h) {
          biteAt = [h.x * 100, -h.y * 100];
          const ff = act === 'charge' ? Math.min(f, S) : f;
          bite = ff <= S ? outQuad((ff - S * 0.25) / (S * 0.75)) : ff <= actEnd ? 1 : 1 - inOutSine((ff - actEnd) / (R * 0.5));
          jaw = ff <= S ? lerp(0.35, 0.85, bite) : ff <= actEnd ? 0.06 : lerp(0.06, 0.32, c01((ff - actEnd) / (R * 0.4)));
          ears = 0.9;
        }
      }
      if (mv === 'smash' || mv === 'upsmash') { jaw = 0.7; ears = 0.8; }
      if (act === 'charge') jaw = 0.75 + 0.05 * Math.sin(f * 2.1);
      break;
    }
  }

  // drag: the tail and mane trail opposite the movement
  tailBend -= 0.35 * Math.abs(vxl);
  tailA += 0.2 * Math.abs(vxl) - 0.25 * Math.max(0, vy) + 0.35 * Math.max(0, -vy);
  mane += 0.4 * Math.abs(vxl);

  // the paws stay on or above the deck while grounded
  const grounded = s.grounded;
  if (grounded) {
    if (hF[1] > -6) hF = [hF[0], -6];
    if (hB[1] > -6) hB = [hB[0], -6];
  }
  // the arms, solved again from the (maybe moved) shoulders to the hands
  let eF: Pt, eB: Pt;
  [eF, hF] = armIK(sF, hF, sideF);
  [eB, hB] = armIK(sB, hB, sideB);

  const u0 = unit(sub(wit, hip));
  // the head hangs forward and down off the withers, the neck following the muzzle
  const nAng = muzzle * 0.75 + 0.42;
  let head = add(add(wit, dir(nAng), 30), [-u0[1], u0[0]], 6);
  if (biteAt && bite > 0) {
    const aa = clamp(angOf(sub(biteAt, mixP(hip, wit, 0.5))), -1.5, 0.95);
    const dd = clamp(dist(biteAt, wit) - 36, 22, 64);
    head = mixP(head, add(wit, dir(aa), dd), bite);
    muzzle = lerp(muzzle, aa, bite);
  }
  return { hip, wit, sF, sB, eF, eB, hF, hB, fF, fB, head, muzzle, jaw, ears, pF, pB, tailA, tailBend, mane, onFloor: grounded };
}

// ------------------------------------------------------------------------------------------------
// shapes
// ------------------------------------------------------------------------------------------------

interface Fur { side: number; t0: number; t1: number; n: number; len: number; seed: number }

/** A limb as one closed outline along a path: half-widths [left, right] by arc-length t, fur
 *  spikes breaking the outline on one side (leaning back toward the path start). */
function strip(path: Pt[], per: number, wfn: (t: number) => [number, number], fur: Fur[] = []): Pt[] {
  let p: Pt[];
  if (path.length > 2) p = smooth(path, per);
  else { p = []; for (let i = 0; i <= 8; i++) p.push(mixP(path[0]!, path[1]!, i / 8)); }
  const n = p.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + dist(p[i]!, p[i - 1]!));
  const total = cum[n - 1]! || 1;
  // spike sample indices per fur run
  const spikes: { i: number; f: Fur; k: number }[] = [];
  for (const fu of fur) for (let k = 0; k < fu.n; k++) {
    const tk = fu.t0 + ((fu.t1 - fu.t0) * (k + 0.5)) / fu.n;
    let bi = 0;
    for (let i = 0; i < n; i++) if (Math.abs(cum[i]! / total - tk) < Math.abs(cum[bi]! / total - tk)) bi = i;
    spikes.push({ i: Math.min(n - 2, Math.max(1, bi)), f: fu, k });
  }
  const Ls: Pt[] = [], Rs: Pt[] = [];
  let d0: Pt = [1, 0], d1: Pt = [1, 0], w0: [number, number] = [1, 1], w1: [number, number] = [1, 1];
  for (let i = 0; i < n; i++) {
    const d = unit(sub(p[Math.min(n - 1, i + 1)]!, p[Math.max(0, i - 1)]!));
    const nn = perp(d);
    const w = wfn(cum[i]! / total);
    Ls.push(add(p[i]!, nn, w[0]));
    Rs.push(add(p[i]!, nn, -w[1]));
    for (const sp of spikes) if (sp.i === i) {
      const l = sp.f.len * (0.65 + 0.6 * h01(sp.f.seed + sp.k * 3.7));
      const side = sp.f.side, ww = side > 0 ? w[0] : w[1];
      const base = add(p[i]!, nn, side * ww);
      const tip = add(add(base, nn, side * l * 0.55), d, -l * 0.85);
      const back = add(base, d, l * 0.25);
      (side > 0 ? Ls : Rs).push(tip, back);
    }
    if (i === 0) { d0 = d; w0 = w; }
    if (i === n - 1) { d1 = d; w1 = w; }
  }
  const e = p[n - 1]!, s0 = p[0]!;
  const we = (w1[0] + w1[1]) / 2, ws = (w0[0] + w0[1]) / 2;
  const endCap: Pt[] = [add(add(e, d1, we * 0.6), perp(d1), we * 0.6), add(e, d1, we * 0.85), add(add(e, d1, we * 0.6), perp(d1), -we * 0.6)];
  const startCap: Pt[] = [add(add(s0, d0, -ws * 0.6), perp(d0), -ws * 0.6), add(s0, d0, -ws * 0.85), add(add(s0, d0, -ws * 0.6), perp(d0), ws * 0.6)];
  return Ls.concat(endCap, Rs.reverse(), startCap);
}

/** A ragged edge from a to b: n uneven teeth pushed out along `out`. */
function rag(a: Pt, b: Pt, n: number, depth: number, seed: number, out: Pt): Pt[] {
  const res: Pt[] = [a];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, r = h01(seed + i * 5.13);
    const tp = mixP(a, b, t0 + (t1 - t0) * (0.35 + 0.3 * r));
    res.push(add(tp, out, depth * (0.4 + 0.9 * h01(seed + i * 2.71)) * (r > 0.8 ? 1.6 : 1)));
    res.push(i === n - 1 ? b : mixP(a, b, t1));
  }
  return res;
}

/** a long arm: tapered upper arm, a muscled forearm narrowing to a real wrist, fur on the outer edge */
function armShape(s: Pt, e: Pt, w: Pt, k: number, sd: number): Pt[] {
  const outerL = cross(sub(w, s), sub(e, s)) > 0;
  const wf = (t: number): [number, number] => {
    const base = t < 0.52 ? lerp(14.5, 10, t / 0.52) : lerp(10, 5.2, (t - 0.52) / 0.48);
    const g = Math.exp(-(((t - 0.66) / 0.12) ** 2));
    const o = (base + 3.4 * g) * k, i = (base + 1.2 * g) * k;
    return outerL ? [o, i] : [i, o];
  };
  const so = outerL ? 1 : -1;
  return strip([s, e, w], 5, wf, [
    { side: so, t0: 0.4, t1: 0.8, n: 4, len: 9 * k, seed: sd },
    { side: -so, t0: 0.8, t1: 0.96, n: 2, len: 5.5 * k, seed: sd + 7 },
  ]);
}

/** A big hand: one outline of palm, four thick fingers and hooked claws, a dewclaw on the back. */
function pawShape(w: Pt, a: number, k: number, p: PawPose): Pt[] {
  const d = dir(a), n = perp(d);
  const P = (u: number, v: number): Pt => [w[0] + (d[0] * u + n[0] * v) * k, w[1] + (d[1] * u + n[1] * v) * k];
  const Q = (q: Pt): Pt => P(q[0], q[1]);
  const pts: Pt[] = [P(-4, -5.5), P(2, -7.5), P(5, -13), P(6.5, -8.5), P(9, -8.5)];
  const lens = [15, 18, 17, 12];
  for (let i = 0; i < 4; i++) {
    const base: Pt = [11, -6 + i * 4.2];
    const fa = (i - 1.5) * 0.24 * p.spread;
    const f1 = dir(fa), up1: Pt = [f1[1], -f1[0]];
    const j1 = add(base, f1, lens[i]! * 0.55);
    const f2 = rot(f1, p.curl * 0.7), up2: Pt = [f2[1], -f2[0]];
    const tip = add(j1, f2, lens[i]! * 0.45);
    const f3 = rot(f2, p.curl * 0.9 + 0.25);
    const claw = add(add(tip, f3, 7.5), up2, -0.5);
    pts.push(Q(add(base, up1, 2.6)), Q(add(j1, up1, 2.7)), Q(add(tip, up2, 2.3)), Q(claw), Q(add(tip, up2, -1.6)), Q(add(j1, up1, -2.5)));
  }
  pts.push(P(7, 10), P(-1, 9), P(-4, 5.5));
  return pts;
}

/** the hind paw: a long pad on the deck with three claws at the front */
function hindPawShape(toe: Pt, fdv: Pt): Pt[] {
  const n = perp(fdv);
  const P = (u: number, v: number): Pt => add(add(toe, fdv, u), n, v);
  const top = smooth([P(-8, -1), P(-6, -9), P(2, -11), P(10, -9)], 3);
  return top.concat([P(14, -8), P(20, -5.5), P(15, -5), P(20, -2.5), P(15, -2), P(19, 0.6), P(12, 1), P(-2, 1)]);
}

function hindLeg(hip: Pt, foot: Pt, onFloor: boolean): { knee: Pt; hock: Pt; fdv: Pt } {
  const d = dist(hip, foot);
  const ext = c01((d - 45) / (THIGH + SHIN + META - 45));
  const a = angOf(sub(hip, foot)) - (0.8 * (1 - ext) + 0.05);
  const hock0 = add(foot, dir(a), META);
  const kd = unit(sub(hock0, hip));
  const [knee, hock] = ik2(hip, hock0, THIGH, SHIN, [kd[1], -kd[0]]);
  let fa = angOf(sub(foot, hock)) - 0.85;
  if (onFloor) fa = lerp(fa, 0.02, c01((foot[1] + 14) / 12));
  return { knee, hock, fdv: dir(fa) };
}

function shinShape(knee: Pt, hock: Pt, toe: Pt, sd: number): Pt[] {
  const th = SHIN / (SHIN + META);
  const wf = (t: number): [number, number] => {
    const b = t < th ? lerp(10, 6, t / th) : lerp(6.2, 4.6, (t - th) / (1 - th));
    const g = 1.6 * Math.exp(-(((t - th) / 0.07) ** 2));
    return [b + g, b + g];
  };
  const back = cross(sub(hock, knee), [-1, 0]) < 0 ? 1 : -1;
  return strip([knee, hock, toe], 3, wf, [{ side: back, t0: 0.08, t1: 0.42, n: 3, len: 7, seed: sd }]);
}

function thighShape(hip: Pt, knee: Pt, sd: number, hairy: boolean): Pt[] {
  const wf = (t: number): [number, number] => {
    const b = lerp(18, 10, t), g = 2.5 * Math.exp(-(((t - 0.35) / 0.2) ** 2));
    return [b + g, b];
  };
  return strip([hip, knee], 0, wf, hairy ? [{ side: -1, t0: 0.5, t1: 0.9, n: 2, len: 6, seed: sd }] : []);
}

// ------------------------------------------------------------------------------------------------
// the head
// ------------------------------------------------------------------------------------------------

function drawHead(ink: Pen, o: Pt, tilt: number, jaw: number, ears: number, k: number, sd: number): void {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const Hr = (xx: number, yy: number): Pt => [o[0] + (xx * c - yy * s) * k, o[1] + (xx * s + yy * c) * k];
  const jc = Math.cos(jaw), js = Math.sin(jaw);
  const Jw = (xx: number, yy: number): Pt => { const x0 = xx - 12, y0 = yy - 6; return Hr(12 + x0 * jc - y0 * js, 6 + x0 * js + y0 * jc); };
  const ef = ears * 8;
  // far ear
  ink.form([Hr(-6, -12), Hr(-13, -17.5 + ef * 0.5), Hr(-20, -20 + ef * 0.8), Hr(-27, -22 + ef * 1.1), Hr(-20, -15 + ef * 0.6), Hr(-14, -10 + ef * 0.3), Hr(-9, -6)], { w: 1.6, seed: sd });
  // the open mouth, the lower jaw dropped, its teeth up
  ink.mask(smooth([Hr(14, 4), Hr(46, 2), Jw(42, 10), Jw(12, 10)], 3, true));
  ink.form(smooth([Jw(10, 6), Jw(26, 8.5), Jw(40, 10), Jw(43, 14), Jw(30, 17), Jw(14, 18), Jw(4, 14)], 4, true), { w: 2.1, seed: sd + 1 });
  const lt: Pt[] = [Jw(15, 10)];
  for (let i = 0; i < 4; i++) { const xx = 18 + i * 5.6; lt.push(Jw(xx, 9.5), Jw(xx + 1.5, i === 3 ? 1.5 : 4.5), Jw(xx + 3, 9.5)); }
  lt.push(Jw(40, 10.5), Jw(39, 12.5), Jw(15, 12.5));
  ink.form(lt, { w: 0.7, seed: sd + 2 });
  // the skull and the long muzzle, a ruff of fur under the cheek
  const sk = smooth([Hr(-16, 6), Hr(-15, -8), Hr(-4, -16), Hr(8, -15), Hr(16, -9), Hr(30, -7), Hr(44, -5), Hr(48, -1), Hr(46, 4), Hr(36, 4), Hr(20, 5), Hr(12, 8), Hr(6, 14)], 4)
    .concat([Hr(3, 21), Hr(-1, 16), Hr(-6, 23), Hr(-9, 15), Hr(-16, 19), Hr(-15, 11), Hr(-22, 10)]);
  ink.form(sk, { w: 2.5, seed: sd + 3 });
  const ut: Pt[] = [Hr(17, 3)];
  for (let i = 0; i < 5; i++) { const xx = 18 + i * 5.2; ut.push(Hr(xx, 4.5), Hr(xx + 1.4, i === 4 ? 13.5 : 9), Hr(xx + 2.8, 4.5)); }
  ut.push(Hr(45, 3));
  ink.form(ut, { w: 0.7, seed: sd + 4 });
  // nose, the bridge, the snarl pulling the lip back, wrinkles
  const np = Hr(46.5, -1.5);
  ink.dot(np[0], np[1], 2.6 * k, { seed: sd + 5 });
  ink.cut(smooth([Hr(16, -9), Hr(30, -6.5), Hr(42, -5)], 4), { w: 1, seed: sd + 6 });
  ink.cut([Hr(21, -7), Hr(23, -3.5), Hr(26, -7), Hr(28, -3.5), Hr(31, -6.5)], { w: 0.9, seed: sd + 7, taper: 0.3 });
  ink.cut(smooth([Hr(11, 8), Hr(17, 3.5), Hr(26, 3.5)], 3), { w: 1.2, seed: sd + 8 });
  // the slanted eye under a heavy brow
  ink.cut(smooth([Hr(2, -11), Hr(10, -13.5), Hr(18, -10)], 3), { w: 1.9, seed: sd + 9, taper: 0.4 });
  const ep = Hr(11.5, -7.5);
  ink.dot(ep[0], ep[1], 1.8 * k, { seed: sd + 10 });
  ink.cut(smooth([Hr(4, 12), Hr(-6, 12), Hr(-14, 4)], 3), { w: 1, seed: sd + 11 });
  // near ear, laid back along the skull
  ink.form([Hr(-1, -14.5), Hr(-9, -19 + ef * 0.4), Hr(-18, -21 + ef * 0.7), Hr(-30, -21 + ef * 1.1), Hr(-21, -14 + ef * 0.6), Hr(-13, -9.5 + ef * 0.3), Hr(-7, -6)], { w: 1.8, seed: sd + 12 });
  ink.cut([Hr(-6, -11.5), Hr(-15, -15.5 + ef * 0.5), Hr(-25, -18.5 + ef)], { w: 1.4, seed: sd + 13 });
}

// ------------------------------------------------------------------------------------------------
// the figure
// ------------------------------------------------------------------------------------------------

function pawAngle(e: Pt, h: Pt, onFloor: boolean): number {
  const a = angOf(sub(h, e));
  if (!onFloor) return a;
  // flatten toward forward along the deck as the paw nears it
  const k = c01((h[1] + 22) / 14);
  let d = 0.18 - a;
  while (d > PI) d -= 2 * PI;
  while (d < -PI) d += 2 * PI;
  return a + d * k;
}

function drawWolf(ink: Pen, J: Joints, x: FigureExtra): void {
  const S = skeleton(J, x);
  const { hip, wit } = S;
  const u = unit(sub(wit, hip));
  const fw: Pt = [-u[1], u[0]];
  const at = (k: number, side: number): Pt => add(mixP(hip, wit, k), fw, side);
  const tint = x.sideTint || 'blue';
  const mass = ink.mode === 'mass';
  const spineAng = angOf(u);

  // ---- the tail: a ragged brush off the rump ----
  {
    let a = S.tailA + 0.5 * (spineAng + 1.07);
    const p0 = add(at(0.04, -17), u, -2);
    const p1 = add(p0, dir(a), 24); a -= S.tailBend;
    const p2 = add(p1, dir(a), 24); a -= S.tailBend;
    const p3 = add(p2, dir(a), 22);
    const tP = smooth([p0, p1, p2, p3], 6);
    const n = tP.length, Lp: Pt[] = [], Rp: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const tt = i / (n - 1), d = unit(sub(tP[Math.min(n - 1, i + 1)]!, tP[Math.max(0, i - 1)]!)), nn = perp(d);
      const w = 5 + 11 * Math.sin(PI * Math.pow(tt, 0.75));
      // ragged locks on both edges, every other sample, swept back toward the base
      const tl = i % 2 === 1 && i > 1 ? 3 + 7 * h01(i * 1.7 + 3) : 0, tr = i % 2 === 0 && i > 1 ? 3 + 7 * h01(i * 2.3 + 8) : 0;
      Lp.push(add(add(tP[i]!, nn, w + tl * 0.7), d, -tl));
      Rp.push(add(add(tP[i]!, nn, -w - tr * 0.7), d, -tr));
    }
    const tipD = unit(sub(tP[n - 1]!, tP[n - 3]!));
    ink.form(Lp.concat([add(tP[n - 1]!, tipD, 9)], Rp.reverse()), { w: 2.2, seed: 21 });
    ink.cut(smooth([tP[3]!, add(tP[Math.floor(n * 0.5)]!, perp(tipD), 4), tP[n - 3]!], 4), { w: 1.1, seed: 22 });
    ink.cut(smooth([add(tP[6]!, perp(tipD), -6), add(tP[Math.floor(n * 0.7)]!, perp(tipD), -7)], 3), { w: 1, seed: 23 });
  }

  // ---- the far arm (in shade) and its paw ----
  {
    const sh = armShape(S.sB, S.eB, S.hB, 0.92, 31);
    ink.form(sh, { w: 2.1, seed: 31 });
    ink.hatch(sh, { angle: 1, gap: 3.6, w: 0.9, seed: 32 });
    const pa = pawShape(S.hB, pawAngle(S.eB, S.hB, S.onFloor), 0.95, S.pB);
    ink.form(pa, { w: 1.5, seed: 33 });
  }

  // ---- the far hind leg ----
  {
    const lg = hindLeg(hip, S.fB, S.onFloor);
    ink.form(shinShape(lg.knee, lg.hock, S.fB, 35), { w: 2, seed: 35 });
    ink.form(hindPawShape(S.fB, lg.fdv), { w: 1.6, seed: 36 });
    const th = thighShape(add(hip, fw, -4), lg.knee, 37, true);
    ink.form(th, { w: 2.1, seed: 37 });
    ink.hatch(th, { angle: 1.1, gap: 3.6, w: 0.9, seed: 38 });
  }

  // ---- the body: one hunched mass from the rump to the withers ----
  const nape = add(at(1, -12), u, 9);
  const hump = at(0.9, -34);
  ink.form(smooth([
    add(at(1, 20), u, 2), at(0.8, 31), at(0.42, 25), add(at(0, 14), u, -8), add(at(0, -8), u, -18),
    add(at(0, -22), u, -2), at(0.45, -26), hump, nape,
  ], 5, true), { w: 2.8, seed: 41 });

  // ---- the neck to the head ----
  const ht = S.muzzle;
  const neckEnd = add(S.head, rot([-5, 7], ht), HK);
  ink.form(strip([add(wit, u, -6), neckEnd], 0, (t) => { const w = lerp(19, 13, t); return [w, w]; }), { w: 2.2, seed: 43 });

  // ---- the near hind leg: a wolf's leg out of trousers ripped off above the knee ----
  {
    const lg = hindLeg(hip, S.fF, S.onFloor);
    ink.form(shinShape(lg.knee, lg.hock, S.fF, 45), { w: 2.3, seed: 45 });
    const pw = hindPawShape(S.fF, lg.fdv);
    ink.form(pw, { w: 1.8, seed: 46 });
    const tn0 = perp(lg.fdv);
    ink.cut([add(add(S.fF, lg.fdv, 3), tn0, -7), add(add(S.fF, lg.fdv, 8), tn0, -1)], { w: 0.9, seed: 47 });
    const tk = unit(sub(lg.knee, hip)), tn = perp(tk);
    const kneeT = add(lg.knee, tk, -9);
    const trouser = [add(add(hip, tn, -18), tk, -4), add(add(hip, tk, -10), tn, 13)].concat(rag(add(kneeT, tn, 13), add(kneeT, tn, -13), 5, 8, 51, tk));
    ink.form(trouser, { w: 2.2, seed: 48 });
    ink.hatch(smooth([add(hip, tn, -16), add(kneeT, tn, -11), add(kneeT, tn, -3), mixP(add(hip, tn, -6), kneeT, 0.4)], 4, true), { angle: 1.2, gap: 3.6, w: 0.9, seed: 49 });
    ink.cut(smooth([add(hip, tn, 4), mixP(hip, kneeT, 0.5), add(kneeT, tn, 6)], 4), { w: 1.2, seed: 50 });
  }

  // ---- the torn shirt in the side's tint, stretched over the back and split ----
  {
    const front0 = at(0.32, 26), back0 = add(at(0.16, -25), u, 0);
    const shirt = smooth([add(at(1, 16), u, 1), at(0.82, 32), mixP(at(0.5, 29), at(0.5, 28), 0.5), front0], 5)
      .concat(rag(front0, back0, 6, 11, 61, [-u[0], -u[1]]).slice(1))
      .concat(smooth([back0, at(0.45, -28.5), at(0.9, -36.5), add(nape, fw, -2), add(at(1, -2), u, 7)], 5).slice(1));
    ink.form(shirt, { tint, w: 2.3, seed: 63 });
    ink.hatch(smooth([at(0.86, 12), at(0.3, 10), at(0.3, 26), at(0.8, 32)], 4, true), mass ? { angle: 1.25, gap: 4.2, w: 0.9, seed: 64 } : { tint, angle: 1.25, gap: 4.2, w: 0.9, seed: 64 });
    // a split down the back, fur bursting through it
    const c0 = at(0.68, -24), c1 = at(0.4, -21);
    const split = smooth([c0, add(mixP(c0, c1, 0.5), fw, -3), c1, add(mixP(c0, c1, 0.5), fw, 6)], 4, true);
    ink.mask(split);
    ink.cut(split, { closed: true, tint, w: 1.3, taper: 0, seed: 65 });
    for (let i = 0; i < 2; i++) {
      const b = mixP(c0, c1, 0.35 + i * 0.3);
      ink.line([add(b, fw, 3), add(add(b, fw, -3), u, -4 - i)], { w: 1.4, taper: 0.8, seed: 66 + i });
    }
    // seams pulling across the back and the chest
    ink.cut(smooth([add(at(1, -6), u, 2), at(0.82, -18), at(0.55, -16)], 5), { tint, w: 1.2, seed: 68 });
    ink.cut(smooth([at(0.9, 18), at(0.7, 14), at(0.5, 22)], 4), { tint, w: 1.1, seed: 69 });
  }

  // ---- the mane: a ragged crest off the hump and up the neck, blown back ----
  {
    const base = smooth([at(0.5, -27), hump, nape, mixP(nape, add(neckEnd, rot([0, -12], ht), HK), 0.6)], 5);
    const m = base.length, outer: Pt[] = [], inner: Pt[] = [];
    const nTeeth = 7;
    for (let i = 0; i < m; i++) {
      const d = unit(sub(base[Math.min(m - 1, i + 1)]!, base[Math.max(0, i - 1)]!));
      const out = perp(d);
      const o = out[0] * fw[0] + out[1] * fw[1] > 0 ? -1 : 1;
      inner.push(add(base[i]!, out, -6 * o));
      outer.push(add(base[i]!, out, 1 * o));
      const tk = ((i + 0.5) / m) * nTeeth;
      if (Math.floor(tk) !== Math.floor(((i + 1.5) / m) * nTeeth) && i > 0 && i < m - 2) {
        const l = 9 + 8 * h01(i * 3.3 + 71) + 4 * Math.sin((PI * i) / m);
        outer.push(add(add(base[i]!, out, (l * 0.65) * o), [-u[0], -u[1]], l * (0.4 + S.mane * 0.6)));
      }
    }
    ink.form(outer.concat(inner.reverse()), { w: 1.8, seed: 71 });
    ink.cut(smooth([mixP(hump, nape, 0.2), mixP(hump, nape, 0.7)], 3), { w: 1, seed: 72 });
  }

  // ---- the near arm: a long furred arm, the torn sleeve, the big hand ----
  {
    const sh = armShape(S.sF, S.eF, S.hF, 1, 81);
    ink.form(sh, { w: 2.4, seed: 81 });
    const fd2 = unit(sub(S.hF, S.eF)), fn2 = perp(fd2);
    const side = cross(sub(S.hF, S.sF), sub(S.eF, S.sF)) > 0 ? 1 : -1;
    ink.cut(smooth([add(mixP(S.eF, S.hF, 0.15), fn2, 4 * side), add(mixP(S.eF, S.hF, 0.5), fn2, 5 * side), add(mixP(S.eF, S.hF, 0.78), fn2, 2 * side)], 3), { w: 1, seed: 82 });
    const sd = unit(sub(S.eF, S.sF)), sn = perp(sd);
    const sleeveEnd = mixP(S.sF, S.eF, 0.5);
    const sleeve = smooth([add(add(S.sF, sd, 6), sn, -17.5), add(add(S.sF, sd, -7), sn, -13), add(S.sF, sd, -13), add(add(S.sF, sd, -7), sn, 13), add(add(S.sF, sd, 6), sn, 17.5)], 4)
      .concat(rag(add(sleeveEnd, sn, 16), add(sleeveEnd, sn, -16), 4, 7, 84, sd));
    ink.form(sleeve, { tint, w: 2.1, seed: 86 });
    ink.cut(smooth([add(S.sF, sn, 5), add(mixP(S.sF, sleeveEnd, 0.6), sn, 3)], 3), { tint, w: 1.1, seed: 87 });
    const pa = pawShape(S.hF, pawAngle(S.eF, S.hF, S.onFloor), 1.12, S.pF);
    ink.form(pa, { w: 1.6, seed: 88 });
    const d = dir(pawAngle(S.eF, S.hF, S.onFloor)), n = perp(d);
    const P = (a: number, b: number): Pt => add(add(S.hF, d, a * 1.12), n, b * 1.12);
    ink.cut([P(8, -4), P(10, 0), P(9, 4)], { w: 0.9, seed: 89 });
  }

  // ---- the head ----
  drawHead(ink, S.head, ht, S.jaw, S.ears, HK, 91);
}

// ------------------------------------------------------------------------------------------------
// the abilities' own lines
// ------------------------------------------------------------------------------------------------

function drawWolfMove(ink: Pen, J: Joints, x: FigureExtra): void {
  const s = x.state;
  const mv = s.move, f = Math.max(1, s.actionFrame);
  const fd = FIGHTERS[s.fighter] ?? FIGHTERS.vise;
  const md = mv && fd ? fd.moves[mv] : null;
  const howl = (k: number, n: number, reach: number, seed: number): void => {
    const S = skeleton(J, x);
    const m = add(S.head, dir(S.muzzle), 50 * HK);
    for (let i = 0; i < n; i++) {
      const sg = i - (n - 1) / 2;
      const a = S.muzzle + sg * 0.3;
      const L = reach * (0.75 + 0.35 * h01(seed + i * 1.9)) * k;
      const curve = sg >= 0 ? 1 : -1;
      const p0 = add(m, dir(a), 10 + 6 * Math.abs(sg));
      ink.line([p0, add(m, dir(a + 0.05 * curve), 10 + L * 0.55), add(m, dir(a + 0.12 * curve), 10 + L)], { w: 3.4 + 2 * k, taper: 0.95, tint: i % 2 ? x.sideTint : undefined, seed: seed + i });
    }
  };
  if (s.action === 'win' && f > 16) {
    const k = 0.6 + 0.4 * Math.abs(Math.sin(x.t * 1.4));
    howl(k, 3, 70, 140);
    return;
  }
  if (!md || !mv || (s.action !== 'attack' && s.action !== 'charge')) return;
  const S0 = md.startup, actEnd = md.startup + md.active;
  if (mv === 'special2' && s.action === 'attack' && f > S0 && f <= actEnd + 8) {
    const grow = outQuad((f - S0) / 4) * (f > actEnd ? 1 - (f - actEnd) / 9 : 1);
    howl(grow, 5, 190, 120);
    return;
  }
  if (mv === 'special' && s.action === 'attack' && f > S0) {
    const S = skeleton(J, x);
    const v = f <= actEnd ? 1 : 1 - c01((f - actEnd) / (md.recovery * 0.25));
    if (v > 0 && f <= actEnd + 6) {
      // speed strokes streaming off the back of the leap
      for (let i = 0; i < 4; i++) {
        const y = S.hip[1] - 26 + i * 15 + (i % 2) * 3;
        const x0 = S.hip[0] - 34 - h01(i + 3) * 18 - (i === 1 || i === 2 ? 10 : 0);
        ink.line([[x0, y], [x0 - (50 + h01(i + 7) * 45) * v, y + 1.5]], { w: 1.7, taper: 0.9, seed: 130 + i, alpha: 0.85 });
      }
    }
    if (f > actEnd) {
      // the skid: grit lines thrown back off the hind feet along the deck
      const k = c01((f - actEnd) / 3) * (1 - c01((f - actEnd - md.recovery * 0.25) / (md.recovery * 0.3)));
      if (k > 0.02) for (let i = 0; i < 3; i++) {
        const b: Pt = [S.fB[0] - 8 - i * 9, -1];
        ink.line([b, add(b, dir(PI + 0.25 + i * 0.22), (18 + i * 6) * k)], { w: 1.3, taper: 0.8, seed: 136 + i });
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
// the portrait: head and shoulders, snarling, about 100 units wide on the origin
// ------------------------------------------------------------------------------------------------

function drawPortrait(ink: Pen, t: number): void {
  void t;
  // shoulders and the hump of the back, the mane rising off them
  ink.form(smooth([[-52, 56], [-50, 22], [-38, -2], [-18, -12], [8, -2], [26, 18], [36, 56]], 4, true), { w: 2.4, seed: 201 });
  ink.cut(smooth([[-30, 56], [-26, 30], [-10, 14], [14, 18]], 4), { w: 1.2, seed: 202 });
  ink.cut(smooth([[-44, 40], [-38, 20], [-24, 8]], 3), { w: 1, seed: 203 });
  const mane: Pt[] = [[-46, 18], [-52, 2], [-40, 6], [-44, -12], [-30, -6], [-30, -24], [-18, -12], [-12, -28], [-6, -10], [4, -18], [6, -2]];
  ink.form(mane.concat([[-4, 2], [-20, 0], [-36, 10]]), { w: 1.6, seed: 204 });
  drawHead(ink, [-14, 4], 0.12, 0.42, 0.2, 1.2, 210);
}

export const WOLF: CharacterDef = {
  id: 'vise',
  build: BUILD,
  anims: {
    jab: { anim: 'charge' },
    tilt: { anim: 'swingSide' },
    uptilt: { anim: 'swingUp', hand: 'both' },
    dash: { anim: 'charge' },
    smash: { anim: 'slam', hand: 'both' },
    upsmash: { anim: 'swingUp', hand: 'both' },
    nair: { anim: 'spin' },
    fair: { anim: 'charge' },
    bair: { anim: 'kick' },
    uair: { anim: 'castUp' },
    dair: { anim: 'slam', hand: 'both' },
    grab: { anim: 'reach', hand: 'both' },
    throwf: { anim: 'throwObj', hand: 'both' },
    throwb: { anim: 'throwObj', hand: 'both' },
    throwu: { anim: 'throwObj', hand: 'both' },
    special: { anim: 'reach', hand: 'both' },
    special2: { anim: 'castUp', hand: 'both' },
    recover: { anim: 'leap' },
  },
  draw: drawWolf,
  drawMove: drawWolfMove,
  portrait: drawPortrait,
};
