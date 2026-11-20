// THE EMPTY ARMOUR (fighter id 'kiln'): a suit of plate with nobody inside, held together by habit,
// a fire burning in the empty collar where the head should be and a greatsword taller than its
// legs. The approved drawing is lab/cast/armour.js (heavy sheet, third row), made more angular here:
// chamfered steel plates with sharp flutes instead of the sheet's rounded toy plates.
//
// Every piece of the suit is its own plate, drawn through a small transform of its own (partXf):
// - the plates lag and clatter a little behind the motion (speed, a landing, a blow, a strike);
// - gaps at the elbows and knees are cut through to the black (nothing inside);
// - armoured frames lock the plates tight: no lag, the gaps close, heavier outlines;
// - Fall Apart (recover) drops the suit to a heap and throws the plates up in a loose tumbling
//   column that snaps back together; the entrance assembles it from the heap; knocked down, the
//   plates lie in a slump; in defeat they sag.
// The collar fire is its face: it leans against the motion, flares on attacks, gutters when hurt,
// nearly goes out in defeat and roars tall in victory. Abilities: Grave Cleave (special, the blade
// catches fire and leaves a wall of flame, projectile kind 'wave' / 'flame'), Collar Fire
// (special2, a cone of fire breathed from the collar), Fall Apart (recover).
//
// The side shows on the torn tabard and a band on the sword grip (FigureExtra.sideTint); the fire
// stays red. Deterministic: fixed seeds on every pen call, no Math.random, no Date.
import type { Build, CharacterDef, FigureExtra, Joints } from '../api.ts';
import type { Hitbox, MoveDef, Projectile } from '../../sim/types.ts';
import { FIGHTERS } from '../../sim/fighters.ts';
import type { Pen, Pt } from '../pen.ts';
import { ell, h01, mix, smooth } from '../pen.ts';

const BUILD: Build = { height: 225, hipY: 110, torso: 95, neckLen: 20, arm: [50, 48], leg: [56, 54], shoulderX: 32, stanceX: 56, hunch: 0.08, propLen: 120, heft: 1.5 };
const ARM = BUILD.arm;
const PL = BUILD.propLen;

// ------------------------------------------------------------------------------------------------
// small math
// ------------------------------------------------------------------------------------------------

const PI = Math.PI;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt): number => Math.hypot(v[0], v[1]);
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const dirA = (a: number): Pt => [Math.cos(a), Math.sin(a)];
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const c01 = (v: number): number => clamp(v, 0, 1);
const ease = (u: number): number => 0.5 - 0.5 * Math.cos(PI * c01(u));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const rot = (v: Pt, a: number): Pt => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
/** from p toward q by distance d */
const toward = (p: Pt, q: Pt, d: number): Pt => add(p, unit(sub(q, p)), d);
function angLerp(a0: number, a1: number, u: number): number {
  let d = a1 - a0;
  while (d > PI) d -= 2 * PI;
  while (d < -PI) d += 2 * PI;
  return a0 + d * u;
}

/** two-bone IK from a toward t; the middle joint goes to the side of n */
function ik2(a: Pt, t: Pt, l1: number, l2: number, n: Pt): [Pt, Pt] {
  let d = sub(t, a), l = len(d);
  if (l < 1e-6) { d = [0, 1]; l = 1; }
  const u: Pt = [d[0] / l, d[1] / l];
  const dd = clamp(l, Math.abs(l1 - l2) + 1, (l1 + l2) * 0.999);
  const end = add(a, u, dd);
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let nx = -u[1], ny = u[0];
  if (nx * n[0] + ny * n[1] < 0) { nx = -nx; ny = -ny; }
  return [[a[0] + u[0] * along + nx * h, a[1] + u[1] * along + ny * h], end];
}

function moveDef(s: FigureExtra['state']): MoveDef | null {
  if (!s.move) return null;
  const d = FIGHTERS[s.fighter];
  return d ? d.moves[s.move] ?? null : null;
}

function hbAt(md: MoveDef, f: number): Hitbox | null {
  let best: Hitbox | null = null;
  for (const h of md.hitboxes) if (f >= h.from && f <= h.to && (!best || h.r > best.r)) best = h;
  return best;
}

// ------------------------------------------------------------------------------------------------
// the plates: each drawn through its own transform
// ------------------------------------------------------------------------------------------------

/** rotate by r about c, then move by o */
interface Xf { c: Pt; o: Pt; r: number }
const xfPt = (x: Xf, p: Pt): Pt => { const v = rot(sub(p, x.c), x.r); return [x.c[0] + v[0] + x.o[0], x.c[1] + v[1] + x.o[1]]; };

/** a pen that draws through whichever plate transform is current */
function partPen(ink: Pen, cur: { x: Xf | null }): Pen {
  const M = (pts: Pt[]): Pt[] => { const x = cur.x; return x ? pts.map((p) => xfPt(x, p)) : pts; };
  return {
    mode: ink.mode, BG: ink.BG, INK: ink.INK, TINTS: ink.TINTS,
    form: (pts, o) => ink.form(M(pts), o),
    cut: (pts, o) => ink.cut(M(pts), o),
    line: (pts, o) => ink.line(M(pts), o),
    hatch: (pts, o) => ink.hatch(M(pts), o),
    dot: (x, y, r, o) => { const p = cur.x ? xfPt(cur.x, [x, y]) : [x, y]; ink.dot(p[0], p[1], r, o); },
    mask: (pts) => ink.mask(M(pts)),
  };
}

/** what the suit is doing this frame, beyond the joints */
interface Suit {
  /** lag of the loose plates against the motion (local units, per unit of plate weight) */
  lag: Pt;
  /** clatter amplitude and its clock */
  rattle: number;
  rf: number;
  /** 1 = armoured: plates locked tight */
  lock: number;
  /** defeat: plates sag; knocked down: plates slump to the floor */
  sag: number;
  slump: number;
  /** Fall Apart: 0 = together, 1 = apart; col 0 = in a heap, 1 = in the rising column */
  apart: number;
  col: number;
  spinT: number;
  /** flame size, and how far it leans back (units across per unit up) */
  fire: number;
  fireLean: number;
}

function suitFor(x: FigureExtra): Suit {
  const s = x.state;
  const f = s.actionFrame;
  const md = moveDef(s);
  const facing = s.facing || 1;
  const vxl = clamp((x.drag * facing) / 960, -1.6, 1.6);
  const vyl = clamp(s.vy / 0.3, -1.2, 1.2);
  const S: Suit = { lag: [-vxl * 2.8, vyl * 2.6], rattle: 0, rf: f, lock: 0, sag: 0, slump: 0, apart: 0, col: 0, spinT: 0, fire: 1, fireLean: vxl * 0.3 - vyl * 0.05 };
  S.fire = (1 + 0.06 * Math.sin(x.t * 2.1)) * (1 - clamp(s.damage / 450, 0, 0.22));
  switch (s.action) {
    case 'land': S.rattle = 2.6 * Math.exp(-(f - 1) / 3.5); break;
    case 'hitstun': S.rattle = s.hitlag > 0 ? 4 : 3.4 * Math.exp(-(f - 1) / 7); S.rf = f + s.hitlag * 3; S.fire *= 0.5; break;
    case 'knockdown': S.slump = ease(f / 7); S.rattle = 3 * Math.exp(-(f - 1) / 4); S.fire *= 0.4; break;
    case 'getup': S.slump = 1 - ease((f - 2) / 12); S.fire *= lerp(0.4, 1, ease(f / 22)); break;
    case 'lose': { const k = ease(f / 30); S.sag = k; S.fire *= lerp(1, 0.15, k); break; }
    case 'win': S.fire *= lerp(1, 1.7, ease(f / 14)); break;
    case 'entrance': S.apart = 1 - ease((f - 3) / 16); S.fire *= ease((f - 13) / 10); if (f > 19) S.rattle = 2.6 * Math.exp(-(f - 19) / 4); break;
    case 'shield': case 'shieldstun': S.fire *= 0.85; break;
    case 'shieldbreak': S.fire *= 0.55; S.rattle = 1.5; break;
    case 'held': S.rattle = 1.4; S.fire *= 0.7; break;
    case 'helpless': S.fire *= 0.75; break;
    default: break;
  }
  if (md && s.move && (s.action === 'attack' || s.action === 'charge')) {
    const st = md.startup, act = md.active;
    const env = Math.min(ease(f / Math.max(1, st)), 1 - ease((f - st - act) / 14));
    S.fire *= 1 + 0.3 * env;
    if (f > st && s.action === 'attack') S.rattle = Math.max(S.rattle, 1.8 * Math.exp(-(f - st - 1) / 4));
    if (md.armor && f >= md.armor[0] && f <= md.armor[1]) S.lock = 1;
    if (s.move === 'special2') {
      // Collar Fire: the flame swells through the wind-up, then the breath takes over
      S.fire *= 1 + 0.75 * ease(f / st) - 1.3 * c01((f - st) / 2) * (1 - c01((f - st - act) / 10));
      S.lock = Math.max(S.lock, f <= st + act ? c01(f / 3) : 0);
    }
    if (s.move === 'recover') {
      const snapEnd = st + act + 1, snapStart = snapEnd - 6;
      if (f <= st) S.apart = ease(f / st);
      else if (f < snapStart) { S.apart = 1; S.col = ease((f - st) / 8); }
      else { S.apart = 1 - ease((f - snapStart) / (snapEnd - snapStart)); S.col = 1; }
      S.spinT = Math.max(0, f - st);
      S.rattle = f > snapEnd ? 3 * Math.exp(-(f - snapEnd) / 4) : 0;
      S.fire *= lerp(1, 0.6, S.apart * (1 - S.col)) + 0.6 * Math.exp(-Math.abs(f - snapEnd) / 3);
      S.lock = 0;
    }
  }
  if (x.armor > 0 && S.apart < 0.01) S.lock = 1;
  if (S.lock > 0) { S.lag = [S.lag[0] * (1 - S.lock), S.lag[1] * (1 - S.lock)]; S.rattle *= 1 - S.lock; }
  return S;
}

/** the transform of plate i (centre c, how loosely it hangs w) */
function partXf(S: Suit, i: number, c: Pt, w: number, t: number): Xf {
  const ph = i * 1.7;
  let ox = S.lag[0] * w, oy = S.lag[1] * w, r = 0;
  if (S.rattle > 0.01) {
    ox += Math.sin(S.rf * 2.3 + ph) * S.rattle * w;
    oy += Math.cos(S.rf * 2.9 + ph * 1.3) * S.rattle * 0.7 * w;
    r += Math.sin(S.rf * 2.1 + ph) * S.rattle * 0.014 * w;
  }
  if (S.sag > 0) { oy += S.sag * (1 + 6 * w); ox += S.sag * (h01(i * 4.3) - 0.5) * 5 * w; r += S.sag * (h01(i * 3.1) - 0.5) * 0.4 * w; }
  if (S.slump > 0) {
    // knocked flat: the plates settle loosely onto the floor, a little spread and turned
    oy += Math.max(0, -c[1] - 13) * 0.5 * S.slump;
    ox += (h01(i * 5.3) - 0.5) * 18 * S.slump;
    r += (h01(i * 2.7) - 0.5) * 0.7 * S.slump;
  }
  if (S.apart > 0) {
    // a heap on the floor (higher plates on top), or a loose column rising above the feet
    const heap: Pt = [c[0] * 0.5 + (h01(i * 4.1) - 0.5) * 50, -5 - Math.max(0, -c[1]) * 0.17 - h01(i * 6.7) * 8];
    const colm: Pt = [c[0] * 0.3 + (h01(i * 9.1) - 0.5) * 44 + Math.sin(t * 3 + i) * 5, c[1] * 1.62 - 30 - h01(i * 2.2) * 14];
    const tg = mix(heap, colm, S.col);
    ox += (tg[0] - c[0]) * S.apart;
    oy += (tg[1] - c[1]) * S.apart;
    r += S.apart * ((h01(i * 1.9) - 0.5) * 2.4 * (1 - S.col) + ((h01(i * 3.7) - 0.5) * 1.2 + S.spinT * (h01(i * 8.3) - 0.5) * 0.22) * S.col);
  }
  return { c, o: [ox, oy], r };
}

// ------------------------------------------------------------------------------------------------
// shapes
// ------------------------------------------------------------------------------------------------

/** a steel plate from a to b: an elongated octagon with chamfered ends, a little bowed */
function plate(a: Pt, b: Pt, wa: number, wb: number, bow = 0.1): Pt[] {
  const d = unit(sub(b, a)), n: Pt = [-d[1], d[0]];
  const P = (o: Pt, al: number, ac: number): Pt => [o[0] + d[0] * al + n[0] * ac, o[1] + d[1] * al + n[1] * ac];
  const m = mix(a, b, 0.5), wm = (wa + wb) / 2;
  return [P(a, wa * 0.25, wa), P(m, 0, wm * (1 + bow)), P(b, -wb * 0.25, wb), P(b, wb * 0.45, wb * 0.5), P(b, wb * 0.45, -wb * 0.5),
    P(b, -wb * 0.25, -wb), P(m, 0, -wm * (1 + bow * 0.5)), P(a, wa * 0.25, -wa), P(a, -wa * 0.45, -wa * 0.5), P(a, -wa * 0.45, wa * 0.5)];
}

/** a flute down a plate, off its centre line */
function flute(a: Pt, b: Pt, off: number): Pt[] {
  const d = unit(sub(b, a)), n: Pt = [-d[1], d[0]];
  return [add(add(a, d, 4), n, off), add(mix(a, b, 0.5), n, off * 1.15), add(add(b, d, -3), n, off * 0.8)];
}

/** an elbow or knee cop: a pointed six-sided boss on the joint, along the limb d */
function cop(c: Pt, d0: Pt, r: number): Pt[] {
  const d = unit(d0), n: Pt = [-d[1], d[0]];
  const P = (al: number, ac: number): Pt => [c[0] + d[0] * al + n[0] * ac, c[1] + d[1] * al + n[1] * ac];
  return [P(-r, 0), P(-r * 0.45, r * 0.95), P(r * 0.55, r * 0.9), P(r * 1.05, 0), P(r * 0.55, -r * 0.85), P(-r * 0.45, -r * 0.9)];
}

/** a flame tongue along a bent path: wide low down, thin and whipping at the tip (from the sheet) */
function lick(path: Pt[], wd: number): Pt[] {
  const pts = smooth(path, 6), n = pts.length, L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const u = i / (n - 1), w = wd * Math.pow(1 - u, 0.9) * (0.55 + 0.45 * Math.sin(PI * Math.min(1, u * 1.6 + 0.2)));
    L.push([pts[i]![0] - dy * w, pts[i]![1] + dx * w]); R.push([pts[i]![0] + dy * w, pts[i]![1] - dx * w]);
  }
  return L.concat(R.reverse());
}

/** a sabaton: pointed steel shoe at the foot, the toe forward across the shin */
function sabaton(ink: Pen, knee: Pt, f: Pt, seed: number, w: number, lames: boolean): void {
  const d = unit(sub(f, knee));
  let toe: Pt = [d[1], -d[0]];
  if (toe[0] < 0 && Math.abs(d[0]) < 0.6) toe = [-toe[0], -toe[1]];
  // a foot on the floor stands flat on it
  const flat = 1 - c01((-f[1] - 4) / 22);
  toe = unit(mix(toe, [1, 0], flat));
  const up: Pt = [toe[1], -toe[0]];
  const B = (x: number, y: number): Pt => [f[0] + toe[0] * x + up[0] * y, f[1] + toe[1] * x + up[1] * y];
  ink.form([B(-12, 1), B(-13, 13), B(-3, 17), B(8, 13), B(19, 6), B(32, 1.5), B(34, -0.5), B(14, -1.5), B(-7, -1.5)], { w: 2.2 * w, seed });
  if (lames) {
    ink.cut([B(2, 15), B(4, -0.5)], { w: 1.1, taper: 0.2, seed: seed + 1 });
    ink.cut([B(10, 11.5), B(12, -0.5)], { w: 1.1, taper: 0.2, seed: seed + 2 });
  }
}

/** a mailed fist on the end of the forearm: a flared cuff and the plated fist */
function gauntlet(ink: Pen, h: Pt, from: Pt, seed: number, w: number): void {
  const d = unit(sub(h, from)), n: Pt = [-d[1], d[0]];
  const G = (a: number, c: number): Pt => [h[0] + d[0] * a + n[0] * c, h[1] + d[1] * a + n[1] * c];
  ink.form([G(-20, -10), G(-7, -7.5), G(-7, 7.5), G(-20, 11), G(-24, 0.5)], { w: 2 * w, seed });
  ink.form([G(-9, -9), G(4, -10.5), G(12, -7.5), G(14.5, 2), G(9, 10.5), G(-6, 9.5)], { w: 2.2 * w, seed: seed + 1 });
  ink.cut([G(3, -9.5), G(5, 9)], { w: 1.15, taper: 0.2, seed: seed + 2 });
  ink.cut([G(9, -7.5), G(10.5, 8)], { w: 1, taper: 0.2, seed: seed + 3 });
}

/** a layered pauldron at the shoulder: lames down the arm and a fluted dome; sc size, rp turn, guard = raised neck guard */
function pauldron(ink: Pen, s: Pt, rp: number, sc: number, seed: number, w: number, near: boolean): void {
  const P = (pts: Pt[]): Pt[] => pts.map((p) => add(s, rot([p[0] * sc, p[1] * sc], rp)));
  const nl = near ? 2 : 1;
  for (let i = nl - 1; i >= 0; i--) {
    ink.form(P([[-20 + i * 2, 5 + i * 9], [0, 1 + i * 9], [23 - i, 6 + i * 9], [21 - i, 15 + i * 9], [0, 11 + i * 9], [-18 + i * 2, 14 + i * 9]]), { w: 2 * w, seed: seed + i });
  }
  const dome = P([[-25, 5], [-21, -10], [-6, -21], [15, -17], [29, -3], [26, 8], [2, 4]]);
  ink.form(dome, { w: 2.6 * w, seed: seed + 4 });
  ink.hatch(P([[-24, 4], [-20, -10], [-6, -20], [-4, 4]]), { angle: 1.1, gap: 3.6, w: 1, seed: seed + 5 });
  if (near) {
    ink.cut(P([[-16, -9], [-2, -16], [22, -5]]), { w: 1.4, taper: 0.3, seed: seed + 6 });
    ink.cut(P([[-6, -3], [6, -8], [24, 3]]), { w: 1.1, taper: 0.4, seed: seed + 7 });
    // the raised guard standing up beside the collar
    ink.form(P([[-19, -8], [-17, -27], [-9, -24], [-6, -15]]), { w: 1.8 * w, seed: seed + 8 });
  }
}

/** flames rising from the collar at O, up the vector `up`, size k, tips leaning back by `lean` */
function collarFire(ink: Pen, O: Pt, up: Pt, k: number, lean: number, t: number, seed: number): void {
  if (k < 0.04) return;
  const rt: Pt = [-up[1], up[0]];
  const F = (fx: number, fy0: number): Pt => { const fy = fy0 * 1.2; const x2 = fx - lean * fy; return [O[0] + rt[0] * x2 + up[0] * fy, O[1] + rt[1] * x2 + up[1] * fy]; };
  const fl = (i: number): number => Math.sin(t * 9.3 + i * 2.1) * 3 + Math.sin(t * 14.7 + i * 1.3) * 2;
  const wk = Math.sqrt(k);
  const tl = ink.mode === 'line' ? 'red' : undefined;
  ink.form(lick([F(-10, 0), F(-15 + fl(5), 16 * k), F(-8 + fl(6), 32 * k), F(-16 + fl(7) * 1.5, 48 * k)], 8 * wk), { tint: 'red', w: 1.8, seed: seed + 1 });
  ink.form(lick([F(10, 0), F(15 + fl(8), 15 * k), F(8 + fl(9), 29 * k), F(14 + fl(10) * 1.5, 41 * k)], 7 * wk), { tint: 'red', w: 1.8, seed: seed + 2 });
  ink.form(lick([F(0, 0), F(5 + fl(1), 21 * k), F(-5 + fl(2), 41 * k), F(4 + fl(3) * 1.4, 59 * k), F(-3 + fl(4) * 1.8, 74 * k)], 11 * wk), { tint: 'red', w: 2, seed: seed + 3 });
  ink.cut([F(0, 3), F(3 + fl(1) * 0.8, 22 * k), F(-3 + fl(2) * 0.8, 38 * k), F(1 + fl(3), 50 * k)], { tint: tl, w: 1.3, seed: seed + 4 });
  if (k > 0.5) {
    const h0 = 66 * k + Math.sin(t * 5.1) * 5;
    ink.form(lick([F(5 + fl(11), h0), F(1 + fl(12), h0 + 11 * k), F(8 + fl(13), h0 + 21 * k)], 3.4 * wk), { tint: 'red', w: 1.5, seed: seed + 5 });
  }
}

// ------------------------------------------------------------------------------------------------
// the figure
// ------------------------------------------------------------------------------------------------

function drawArmour(ink0: Pen, J: Joints, x: FigureExtra): void {
  const s = x.state;
  const f = s.actionFrame;
  const t = x.t;
  const md = moveDef(s);
  const inMove = !!md && (s.action === 'attack' || s.action === 'charge');
  const S = suitFor(x);
  const cur: { x: Xf | null } = { x: null };
  const ink = partPen(ink0, cur);
  const part = (i: number, c: Pt, w: number): void => { cur.x = partXf(S, i, c, w, t); };
  const lock = S.lock;
  const W = 1 + 0.5 * lock; // heavier outlines when locked
  const gapK = 1 - lock; // the gaps close when locked
  const holes = S.apart < 0.05 && S.slump < 0.3;

  // ---- arms: standing still a while, the sword is planted point down and both hands rest on it ----
  let hF = J.handF, eF = J.elbowF, hB = J.handB, eB = J.elbowB, prop = J.prop;
  const rest = s.action === 'idle' ? ease((f - 18) / 14) : 0;
  if (rest > 0.01) {
    const pr = PI / 2 - 0.07;
    const G: Pt = [BUILD.stanceX * 0.55 + 20 + Math.sin(t * 0.83 + 0.4) * 2, -PL * Math.sin(pr) - 1 + Math.sin(t * 2.1) * 0.6];
    [eF, hF] = ik2(J.shoulderF, mix(J.handF, G, rest), ARM[0], ARM[1], [-1, 0.35]);
    prop = angLerp(J.prop, pr, rest);
    [eB, hB] = ik2(J.shoulderB, mix(J.handB, add(hF, dirA(prop), -31), rest), ARM[0], ARM[1], [-1, 0.35]);
  }
  if (inMove && md && s.move === 'special') {
    // Grave Cleave ends low: both hands down in front, the blade cutting along just over the floor
    const st = md.startup, act = md.active;
    const k = f <= st + act + 8 ? ease((f - st + 2) / 3) : 1 - ease((f - st - act - 8) / 12);
    if (k > 0.01) {
      [eF, hF] = ik2(J.shoulderF, mix(hF, add(J.hip, [70, 8]), k), ARM[0], ARM[1], [-1, 0.3]);
      prop = angLerp(prop, 0.4, k);
      [eB, hB] = ik2(J.shoulderB, mix(hB, add(hF, dirA(prop), -24), k), ARM[0], ARM[1], [-1, 0.3]);
    }
  }
  const d = dirA(prop), dn: Pt = [-d[1], d[0]];
  const Sw = (a: number, c: number): Pt => [hF[0] + d[0] * a + dn[0] * c, hF[1] + d[1] * a + dn[1] * c];
  // the back hand on the grip (two-handed swings): its forearm goes over the body
  const gripA = clamp((hB[0] - hF[0]) * d[0] + (hB[1] - hF[1]) * d[1], -40, 10);
  const twoHand = len(sub(hB, Sw(gripA, 0))) < 16;

  // ---- the body frame ----
  const hip = J.hip, chest = J.chest, neck = J.neck;
  const uL = unit(sub(chest, hip)), nL: Pt = [-uL[1], uL[0]];
  const uU = unit(sub(neck, chest)), nU: Pt = [-uU[1], uU[0]];
  const Hf = (fx: number, fy: number): Pt => [hip[0] + nL[0] * fx + uL[0] * fy, hip[1] + nL[1] * fx + uL[1] * fy];
  const Cf = (fx: number, fy: number): Pt => [chest[0] + nU[0] * fx + uU[0] * fy, chest[1] + nU[1] * fx + uU[1] * fy];
  const lean2 = Math.atan2(uU[0], -uU[1]);
  const sF = mix(J.shoulderF, neck, 0.1 * lock), sB = mix(J.shoulderB, neck, 0.1 * lock);

  // cloth drag for the tabard
  const facing = s.facing || 1;
  const vxl = clamp((x.drag * facing) / 960, -1.6, 1.6);
  let dragX = -vxl * 20, lift = clamp(s.vy / 0.3, -1, 1) * 14;
  if (s.action === 'hitstun') { const kx = s.kbx * facing, ky = -s.kby, kl = Math.hypot(kx, ky); if (kl > 1e-4) { dragX -= (kx / kl) * 18; lift -= (ky / kl) * 18; } }
  const flut = Math.sin(t * 8.3) * c01(Math.abs(dragX) / 20) * 4;

  const arm = (i: number, sh: Pt, el: Pt, hd: Pt, near: boolean): { rr: Pt[]; cp: Pt[]; vb: Pt[] } => {
    const g = 7 * gapK + 1.5;
    const a0 = toward(sh, el, 8), a1 = toward(el, sh, 4.5 + g);
    const b0 = toward(el, hd, 4 + g), b1 = toward(hd, el, 14);
    void i; void near;
    return { rr: plate(a0, a1, 10.5, 9), cp: cop(el, sub(hd, sh), 8.5), vb: plate(b0, b1, 9, 7.5) };
  };
  const leg = (kn: Pt, ft: Pt): { cu: Pt[]; po: Pt[]; gr: Pt[] } => {
    const g = 7 * gapK + 1.5;
    const a0 = toward(hip, kn, 6), a1 = toward(kn, hip, 5 + g);
    const up = unit(sub(kn, ft));
    const b0 = toward(kn, ft, 5 + g), b1 = add(ft, up, 13);
    return { cu: plate(a0, a1, 14, 11.5), po: cop(kn, sub(ft, hip), 9.5), gr: plate(b0, b1, 11.5, 7.5) };
  };

  // ================================ back to front ================================
  // 1. the far arm (its forearm and fist come forward over the body when it holds the grip)
  const aB = arm(1, sB, eB, hB, false);
  part(1, mix(sB, eB, 0.5), 0.4);
  ink.form(aB.rr, { w: 2.2 * W, seed: 11 });
  ink.hatch(aB.rr, { angle: 1.15, gap: 3.6, w: 0.9, seed: 12 });
  part(2, eB, 0.9);
  ink.form(aB.cp, { w: 1.8 * W, seed: 13 });
  const backFore = (): void => {
    part(3, mix(eB, hB, 0.6), 0.1);
    ink.form(aB.vb, { w: 2.2 * W, seed: 14 });
    gauntlet(ink, hB, eB, 15, W);
  };
  if (!twoHand) backFore();

  // 2. the far leg, shaded
  const lB = leg(J.kneeB, J.footB);
  part(5, mix(hip, J.kneeB, 0.5), 0.2);
  ink.form(lB.cu, { w: 2.4 * W, seed: 21 });
  ink.hatch(lB.cu, { angle: 1.25, gap: 3.6, w: 0.9, seed: 22 });
  part(6, J.kneeB, 0.7);
  ink.form(lB.po, { w: 1.8 * W, seed: 23 });
  part(7, J.footB, 0);
  ink.form(lB.gr, { w: 2.4 * W, seed: 24 });
  ink.hatch(lB.gr, { angle: 1.3, gap: 3.6, w: 0.9, seed: 25 });
  sabaton(ink, J.kneeB, J.footB, 26, W, false);

  // 3. the tabard: torn cloth in the side's tint, hanging between the legs
  {
    const kneeM = mix(J.kneeF, J.kneeB, 0.5), ankM = mix(J.footF, J.footB, 0.5);
    const tl = Hf(-15, 7), tr = Hf(23, 7);
    const hc = add(add(mix(kneeM, ankM, 0.22), nL, 3), [dragX * 1.1 + flut, lift * 0.9]);
    const hl = add(hc, nL, -21), hr = add(add(hc, nL, 19), [-dragX * 0.15, -lift * 0.1]);
    const ml = add(mix(tl, hl, 0.5), [dragX * 0.35, lift * 0.3]), mr = add(mix(tr, hr, 0.5), [dragX * 0.3, lift * 0.25]);
    const pts: Pt[] = [tl, tr, mr, hr];
    const n = 7;
    for (let i = 1; i < n; i++) {
      const p = mix(hr, hl, i / n);
      const dep = i % 2 ? -(9 + h01(i * 2.3 + 1) * 10) : (h01(i * 5.7) - 0.4) * 7;
      pts.push(add(add(p, uL, dep), [flut * (i % 2 ? 0.5 : -0.3), 0]));
    }
    pts.push(hl, ml);
    part(8, mix(tl, hc, 0.5), 0);
    ink.form(pts, { tint: x.sideTint, w: 2.2 * W, seed: 31 });
    ink.hatch([tl, mix(tl, tr, 0.3), mix(hl, hr, 0.3), hl, ml], { angle: 1.35, gap: 4.2, w: 0.95, seed: 32 });
    ink.cut([mix(tl, tr, 0.55), mix(mix(tl, tr, 0.6), mix(hl, hr, 0.55), 0.55), add(mix(hl, hr, 0.55), uL, 6)], { w: 1.2, seed: 33 });
  }

  // 4. the near leg: cuisse with a lame, knee cop with its fan, fluted greave, pointed sabaton
  const lF = leg(J.kneeF, J.footF);
  if (holes) { cur.x = null; ink.mask(plate(toward(J.kneeF, hip, 12), toward(J.kneeF, J.footF, 12), 5, 5, 0)); }
  part(9, mix(hip, J.kneeF, 0.5), 0.2);
  ink.form(lF.cu, { w: 2.6 * W, seed: 41 });
  ink.cut(plate(mix(hip, J.kneeF, 0.42), mix(hip, J.kneeF, 0.46), 12, 12, 0).slice(0, 3), { w: 1.1, taper: 0.3, seed: 42 });
  ink.cut(flute(toward(hip, J.kneeF, 8), toward(J.kneeF, hip, 12), 4), { w: 1.1, seed: 43 });
  part(11, J.footF, 0);
  ink.form(lF.gr, { w: 2.6 * W, seed: 44 });
  ink.cut(flute(toward(J.kneeF, J.footF, 14), add(J.footF, unit(sub(J.kneeF, J.footF)), 14), 3.5), { w: 1.3, seed: 45 });
  sabaton(ink, J.kneeF, J.footF, 46, W, true);
  part(10, J.kneeF, 0.7);
  {
    const kd = unit(sub(J.footF, hip)), kn: Pt = [kd[1], -kd[0]];
    ink.form([add(J.kneeF, kd, -6), add(add(J.kneeF, kn, 17), kd, -1), add(J.kneeF, kd, 7)], { w: 1.6 * W, seed: 47 });
  }
  ink.form(lF.po, { w: 2 * W, seed: 48 });
  ink.cut(cop(J.kneeF, sub(J.footF, hip), 4).concat([cop(J.kneeF, sub(J.footF, hip), 4)[0]!]), { w: 1, seed: 49 });

  // 5. fauld and tassets: hoops of plate below the breastplate, the tassets following the thighs
  const tasset = (top: Pt, kn: Pt, wd: number): { pts: Pt[]; l1: Pt[]; l2: Pt[] } => {
    const dd = unit(mix(unit(sub(kn, hip)), [-uL[0], -uL[1]], 0.45)), nn: Pt = [-dd[1], dd[0]];
    const P = (a: number, c: number): Pt => [top[0] + dd[0] * a + nn[0] * c, top[1] + dd[1] * a + nn[1] * c];
    return { pts: [P(0, -wd), P(0, wd), P(31, wd + 3), P(36, 0), P(33, -wd - 2)], l1: [P(11, -wd - 0.5), P(11.5, wd + 1)], l2: [P(22, -wd - 1), P(22.5, wd + 2)] };
  };
  {
    const tB = tasset(Hf(-15, 3), J.kneeB, 13);
    part(12, Hf(-15, -12), 1.3);
    ink.form(tB.pts, { w: 2.2 * W, seed: 51 });
    ink.hatch(tB.pts, { angle: 1.2, gap: 3.6, w: 0.9, seed: 52 });
    part(13, Hf(0, 10), 0.5);
    const fauld = [Hf(-32, 19), Hf(-6, 17), Hf(31, 20), Hf(34, 2), Hf(4, -1.5), Hf(-34, 2)];
    ink.form(fauld, { w: 2.4 * W, seed: 53 });
    ink.cut([Hf(-33, 10.5), Hf(0, 8), Hf(33, 11)], { w: 1.15, taper: 0.2, seed: 54 });
    const tF = tasset(Hf(16, 3), J.kneeF, 14);
    part(14, Hf(16, -12), 1.3);
    ink.form(tF.pts, { w: 2.4 * W, seed: 55 });
    ink.cut(tF.l1, { w: 1.1, taper: 0.2, seed: 56 });
    ink.cut(tF.l2, { w: 1.1, taper: 0.2, seed: 57 });
  }

  // 6. the breastplate: angular, a keel down the front, sharp flutes, the far side shaded
  part(15, chest, 0.15);
  if (holes) ink.mask([Hf(-30, 17), Hf(30, 17), Hf(30, 24), Hf(-30, 24)]);
  {
    const bp = [Cf(-24, 39), Cf(-33, 25), Cf(-37, 0), Cf(-30, -30), Cf(-4, -36), Cf(25, -31), Cf(38, -8), Cf(42, 9), Cf(36, 29), Cf(20, 39), Cf(-2, 42)];
    ink.form(bp, { w: 3 * W, seed: 61 });
    ink.hatch([Cf(-24, 39), Cf(-33, 25), Cf(-37, 0), Cf(-30, -30), Cf(-16, -34), Cf(-14, -6), Cf(-17, 22), Cf(-16, 40)], { angle: 1.2, gap: 4, w: 1.05, seed: 62 });
    ink.cut([Cf(12, 38), Cf(20, 8), Cf(13, -33)], { w: 1.7, taper: 0.3, seed: 63 });
    ink.cut([Cf(3, -29), Cf(-1, 2), Cf(-8, 31)], { w: 1.2, taper: 0.5, seed: 64 });
    ink.cut([Cf(25, -26), Cf(33, -2), Cf(32, 22)], { w: 1.2, taper: 0.5, seed: 65 });
    ink.cut([Cf(-29, -24), Cf(-2, -29), Cf(24, -25)], { w: 1.2, taper: 0.2, seed: 66 });
    ink.cut([Cf(26, 6), Cf(30, 12), Cf(27, 17)], { w: 1.1, seed: 67 }); // a dent
    ink.dot(...Cf(-26, -21), 1.5);
    ink.dot(...Cf(28, -19), 1.5);
  }

  // 7. the empty collar: the gorget, the black inside, the fire, the front lip over its roots
  const cO = add(neck, uU, 2);
  const K = (fx: number, fy: number): Pt => [cO[0] + nU[0] * fx + uU[0] * fy, cO[1] + nU[1] * fx + uU[1] * fy];
  part(16, cO, 0.5);
  ink.form([K(-29, -16), K(0, -22), K(29, -15), K(27, -7), K(0, -12), K(-27, -8)], { w: 2.4 * W, seed: 71 });
  ink.form([K(-24, -5), K(-21, 4), K(0, 9), K(23, 4), K(25, -5), K(0, -11)], { w: 2.4 * W, seed: 72 });
  ink.mask(ell(...K(1, -0.5), 16.5, 5, Math.atan2(nU[1], nU[0]), 20));
  {
    const wUp: Pt = [-Math.sin(J.spin || 0), -Math.cos(J.spin || 0)];
    let up = unit(mix(uU, wUp, 0.6));
    let k = S.fire;
    if (inMove && md && s.move === 'special2' && f <= md.startup) {
      // drawn up and forward in the wind-up, toward where the breath will go
      up = unit(mix(up, dirA(-0.6), 0.5 * ease(f / md.startup)));
    }
    const O = K(1, 0);
    collarFire(ink, O, up, k, S.fireLean, t, 73);
    void k;
  }
  ink.form([K(-23, -2), K(0, -6), K(23, -2), K(25, -8), K(0, -13), K(-23, -8)], { w: 2.2 * W, seed: 79 });

  // 8. the far pauldron, behind the collar line
  part(0, sB, 1);
  {
    const aa = Math.atan2(eB[1] - sB[1], eB[0] - sB[0]);
    pauldron(ink, sB, lean2 * 0.8 + clamp(aa - PI / 2, -1.6, 1.6) * 0.35, 0.88, 81, W, false);
  }

  // 9. the greatsword (the far forearm over the body first, if it holds the grip too)
  if (twoHand) backFore();
  part(17, Sw(30, 0), 0);
  ink.form([Sw(16, -6.5), Sw(98, -5), Sw(PL, 0), Sw(98, 5), Sw(16, 6.5)], { w: 2.5 * W, seed: 91 });
  ink.cut([Sw(21, 0.5), Sw(90, 0)], { w: 1.3, taper: 0.4, seed: 92 });
  ink.form([Sw(9, -25), Sw(13, -27), Sw(16, -23), Sw(16, 23), Sw(13, 27), Sw(9, 25)], { w: 2.1 * W, seed: 93 });
  ink.form([Sw(-36, -3.8), Sw(9, -3.8), Sw(9, 3.8), Sw(-36, 3.8)], { tint: x.sideTint, w: 1.6 * W, seed: 94 });
  ink.cut([Sw(-14, -3.5), Sw(-11, 3.5)], { w: 1, taper: 0.1, seed: 95 });
  ink.form([Sw(-48, 0), Sw(-42, -6.5), Sw(-36, 0), Sw(-42, 6.5)], { w: 2 * W, seed: 96 });

  // 10. the near arm: rerebrace, the pauldron over it, the gap and cop at the elbow, vambrace, fist
  const aF = arm(18, sF, eF, hF, true);
  part(18, mix(sF, eF, 0.5), 0.4);
  ink.form(aF.rr, { w: 2.4 * W, seed: 101 });
  ink.cut(plate(mix(sF, eF, 0.55), mix(sF, eF, 0.6), 10, 10, 0).slice(0, 3), { w: 1, taper: 0.3, seed: 102 });
  part(19, sF, 1);
  {
    const aa = Math.atan2(eF[1] - sF[1], eF[0] - sF[0]);
    pauldron(ink, add(sF, uU, 3), lean2 * 0.8 + clamp(aa - PI / 2, -1.7, 1.7) * 0.4, 1.02, 103, W, true);
  }
  if (holes) { cur.x = null; ink.mask(plate(toward(eF, sF, 13), toward(eF, hF, 12), 4.5, 4.5, 0)); }
  part(20, eF, 0.9);
  ink.form(aF.cp, { w: 2 * W, seed: 111 });
  part(21, mix(eF, hF, 0.6), 0.1);
  ink.form(aF.vb, { w: 2.4 * W, seed: 112 });
  ink.cut(flute(toward(eF, hF, 8), toward(hF, eF, 16), 3), { w: 1.1, seed: 113 });
  gauntlet(ink, hF, eF, 114, W);
  cur.x = null;

  // ---- abilities over the figure ----
  if (inMove && md && s.move === 'special') bladeFire(ink0, Sw, md, f, t);
  if (inMove && md && s.move === 'special2' && f > md.startup) {
    const O = K(1, 0);
    let ang = 0.12;
    const hb = hbAt(md, Math.min(f, md.startup + md.active));
    if (hb) ang = clamp(Math.atan2(-hb.y * 100 - O[1], hb.x * 100 + 60 - O[0]), -0.15, 0.45);
    breath(ink0, O, ang, md, f, t);
  }
}

/** Grave Cleave on the blade: it catches fire through the wind-up and streams flame after the cut */
function bladeFire(ink: Pen, Sw: (a: number, c: number) => Pt, md: MoveDef, f: number, t: number): void {
  const st = md.startup, act = md.active;
  const ign = ease((f - st * 0.35) / (st * 0.6));
  const fade = 1 - ease((f - st - act - 2) / 10);
  const k = Math.min(ign, fade);
  if (k < 0.04) return;
  const after = f > st ? 1 : 0;
  const tl = ink.mode === 'line' ? 'red' : undefined;
  for (let i = 0; i < 5; i++) {
    const a = 34 + i * 19;
    const b = Sw(a, 0);
    const L = (20 + h01(i * 3.3) * 20 + after * (40 + i * 9)) * k * (1 + 0.15 * Math.sin(t * 13 + i * 2));
    // streaming back off the blade and up (the cut goes forward and down)
    const sd = unit(after ? [-0.75 + (i - 2) * 0.08, -1] : [-0.25, -1]);
    const sn: Pt = [-sd[1], sd[0]];
    const w = Math.sin(t * 11 + i * 1.7) * 5;
    ink.form(lick([b, add(add(b, sd, L * 0.4), sn, w), add(add(b, sd, L * 0.75), sn, -w * 0.6), add(b, sd, L)], (6 + h01(i * 7.1) * 3 + after * 2) * Math.sqrt(k)), { tint: 'red', w: 1.6, seed: 131 + i });
  }
  if (after && k > 0.3) ink.cut([Sw(30, 0), Sw(PL - 8, 0)], { tint: tl, w: 1.4, seed: 137 });
}

/** Collar Fire: a cone of flame tongues about 2.4 m long breathed from the collar at O along ang */
function breath(ink: Pen, O: Pt, ang: number, md: MoveDef, f: number, t: number): void {
  const st = md.startup, act = md.active;
  const grow = ease((f - st) / 2.5);
  const off = f > st + act ? ease((f - st - act) / 9) : 0; // after the breath: it lifts off and burns out
  // a low steady breath, swelling with each hit: two short puffs, then the full burst
  let pulse = md.hitboxes.length ? 0.45 : 1;
  for (const h of md.hitboxes) {
    const str = h.damage >= 8 || h === md.hitboxes[md.hitboxes.length - 1] ? 1.1 : 0.78;
    pulse = Math.max(pulse, str * ease((f - h.from + 2) / 2) * (1 - ease((f - h.to - 0.5) / 2.5)));
  }
  if (f > st + act) pulse = 1.1;
  const k = grow * (1 - off) * pulse;
  if (k < 0.03) return;
  const Lc = 240;
  const tl = ink.mode === 'line' ? 'red' : undefined;
  const at = (a: number, s0: number, sd: number, w: number, rise: number): Pt => {
    const d = dirA(a), n: Pt = [-d[1], d[0]];
    return [O[0] + d[0] * s0 + n[0] * w, O[1] + d[1] * s0 + n[1] * w - rise];
  };
  const s0 = Lc * 0.55 * off;
  // the body of the breath: a cone widening from the collar, its far end torn into tips
  const L = Lc * k;
  const wOf = (sx: number): number => 7 + (sx - s0) * 0.26;
  {
    // the edges lick in and out (a lick every other point, drifting with t)
    const top: Pt[] = [], bot: Pt[] = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10, sx = s0 + L * 0.78 * u, rise = u * u * 20 * k;
      const lk = (j % 2 ? 9 : -4) * u * (0.8 + 0.4 * Math.sin(t * 12 + j * 1.7));
      top.push(at(ang, sx + (j % 2 ? 6 : 0) * u, 0, -wOf(sx) - lk, rise + (j % 2 ? 5 : 0) * u));
      bot.push(at(ang, sx + (j % 2 ? 0 : 5) * u, 0, wOf(sx) + lk * 0.8, rise));
    }
    const e = s0 + L * 0.78, we = wOf(e), re = 20 * k;
    const tips: Pt[] = [at(ang, e + 22 * k, 0, -we * 0.75, re + 8), at(ang, e - 10 * k, 0, -we * 0.3, re), at(ang, e + 30 * k + Math.sin(t * 11) * 6, 0, we * 0.05, re + 4),
      at(ang, e - 6 * k, 0, we * 0.45, re), at(ang, e + 16 * k, 0, we * 0.85, re - 2)];
    ink.form(top.concat(tips, bot.reverse()), { tint: 'red', w: 2.4, seed: 141 });
  }
  // tongues fanning out of it and running on past the end
  for (let i = 0; i < 6; i++) {
    const c = i - 2.5;
    const a = ang + c * 0.11 + (h01(i * 3.3) - 0.5) * 0.06;
    const sa = s0 + L * (0.12 + 0.18 * h01(i * 2.1));
    const lat = c * wOf(sa) * 0.3;
    const Lt = L * (0.55 + 0.4 * h01(i * 7.7 + 0.4)) * (1 + 0.08 * Math.sin(t * 13 + i * 1.9));
    const pts: Pt[] = [];
    for (let j = 0; j <= 4; j++) {
      const u = j / 4, sx = sa + Lt * u;
      pts.push(at(a, sx, 0, lat + Math.sin(sx / 34 - t * 17 + i * 1.3) * 8 * u, u * u * (14 + h01(i * 5.5) * 18) * k));
    }
    ink.form(lick(pts, (9 + h01(i * 5.1) * 6) * Math.sqrt(k)), { tint: 'red', w: 1.7, seed: 142 + i });
  }
  for (let i = 0; i < 3; i++) {
    const c = i - 1, sa = s0 + 16 + i * 10, sb = s0 + L * (0.5 + 0.12 * i);
    ink.cut([at(ang, sa, 0, c * 4, 0), at(ang, (sa + sb) / 2, 0, c * wOf((sa + sb) / 2) * 0.45 + Math.sin(t * 14 + i) * 5, 4 * k), at(ang, sb, 0, c * wOf(sb) * 0.55, 10 * k)], { tint: tl, w: 1.3, taper: 0.6, seed: 151 + i });
  }
}

/** the wall of flame Grave Cleave sends along the floor (kind 'wave' now, 'flame' after the rules update) */
function flameWall(ink: Pen, p: Projectile, t: number): void {
  const sy = p.vx < 0 ? -1 : 1;
  const spent = (p as Projectile & { cd?: number }).cd === 1;
  const id = p.id % 50;
  const tl = ink.mode === 'line' ? 'red' : undefined;
  const fl = (i: number, a: number): number => (Math.sin(t * 9.1 + i * 2.3 + id) * 0.6 + Math.sin(t * 15.3 + i * 1.1 + id * 0.7) * 0.4) * a;
  if (p.floor) {
    // burning on the floor: a row of low tongues
    const r = Math.max(40, p.r * 100);
    const Yf = (xx: number, h: number): Pt => [xx, -h * sy];
    for (let i = 0; i < 6; i++) {
      const bx = -r + (i + 0.5) * (2 * r / 6) + fl(i, 4);
      const hgt = 22 + h01(i * 3.1 + id) * 30 + fl(i + 7, 6);
      ink.form(lick([Yf(bx, 0), Yf(bx + fl(i + 2, 5), hgt * 0.4), Yf(bx - fl(i + 3, 6), hgt * 0.75), Yf(bx + fl(i + 4, 7), hgt)], 7), { tint: 'red', w: 1.5, seed: 160 + i });
    }
    return;
  }
  const base = 45; // the floor is 0.45 m under the centre
  const Y = (xx: number, h: number): Pt => [xx, (base - h) * sy];
  const top = 140 + fl(1, 6);
  const crescent = smooth([Y(4, 0), Y(26, 22), Y(33 + fl(2, 3), 66), Y(24, 108), Y(2 + fl(3, 4), top - 8), Y(-14 + fl(4, 5), top + 2),
    Y(-6, top - 20), Y(10, 104), Y(14, 64), Y(4, 22)], 5, true);
  if (spent) {
    ink.line(crescent, { tint: 'red', closed: true, w: 1.6, alpha: 0.35, seed: 170 + id });
    for (let i = 0; i < 3; i++) {
      const h = 30 + i * 38;
      ink.line([Y(-2, h), Y(-40, h + 10 + fl(i, 6)), Y(-80, h + 22)], { tint: 'red', w: 1.4, alpha: 0.3, taper: 0.8, seed: 175 + i });
    }
    return;
  }
  // tongues streaming back off the wall, uneven: heights, lengths, rise and bend all vary
  for (let i = 0; i < 9; i++) {
    const h = clamp(10 + i * 15 + (h01(i * 4.7 + 0.3) - 0.5) * 12, 4, top - 16);
    const along = Math.sin(PI * h / top);
    const bx = 12 * along - 4;
    const L = (30 + 82 * h01(i * 2.9 + 1.1)) * (0.65 + 0.55 * along) * (0.9 + 0.12 * Math.sin(t * 7 + i * 1.7));
    const rise = 0.08 + 0.42 * h01(i * 6.1);
    const bend = fl(i + 10, 10);
    const wd = (5 + 6 * h01(i * 3.7)) * (0.6 + 0.4 * along);
    ink.form(lick([Y(bx, h), Y(bx - L * 0.33, h + L * rise * 0.15 + bend), Y(bx - L * 0.66, h + L * rise * 0.5 - bend * 0.6), Y(bx - L, h + L * rise + bend * 0.4)], wd), { tint: 'red', w: 1.6, seed: 180 + i });
  }
  // two low licks running along the floor behind it
  ink.form(lick([Y(-2, 3), Y(-40, 5 + fl(20, 3)), Y(-80, 9), Y(-118 - fl(21, 8), 17)], 7), { tint: 'red', w: 1.5, seed: 191 });
  ink.form(lick([Y(-16, 4), Y(-38, 12 + fl(22, 3)), Y(-62, 13), Y(-78, 24)], 5), { tint: 'red', w: 1.4, seed: 192 });
  ink.form(crescent, { tint: 'red', w: 2.8, seed: 193 });
  ink.cut([Y(6, 8), Y(20, 50), Y(19, 92), Y(3, top - 18)], { tint: tl, w: 1.4, seed: 194 });
}

export const ARMOUR: CharacterDef = {
  id: 'kiln',
  build: BUILD,
  anims: {
    jab: { anim: 'jab', hand: 'B' }, tilt: { anim: 'thrust', hand: 'both' }, uptilt: { anim: 'swingUp' }, dash: { anim: 'charge' },
    smash: { anim: 'slam', hand: 'both' }, upsmash: { anim: 'swingUp', hand: 'both' },
    nair: { anim: 'spin' }, fair: { anim: 'swingOver', hand: 'both' }, bair: { anim: 'kick' }, uair: { anim: 'swingUp' }, dair: { anim: 'stomp' },
    grab: { anim: 'reach', hand: 'both' }, throwf: { anim: 'throwObj', hand: 'both' }, throwb: { anim: 'throwObj', hand: 'both' }, throwu: { anim: 'throwObj', hand: 'both' },
    special: { anim: 'slam', hand: 'both' }, special2: { anim: 'charge' }, recover: { anim: 'leap' },
  },
  draw(ink, J, x) { drawArmour(ink, J, x); },
  drawProjectile(ink: Pen, p: Projectile, t: number) {
    if (p.kind === 'wave' || p.kind === 'flame') flameWall(ink, p, t);
    else {
      const sy = p.vx < 0 ? -1 : 1;
      ink.form(lick([[20, 0], [-10, -6 * sy], [-40, 4 * sy], [-70, -6 * sy]], 12), { tint: 'red', w: 1.6, seed: 199 });
    }
  },
  portrait(ink, t) {
    // the breastplate top, the two pauldrons, the gorget and the fire in the empty collar
    ink.form([[-40, 58], [-43, 24], [-30, 10], [28, 10], [44, 24], [42, 58]], { w: 2.8, seed: 501 });
    ink.hatch([[-40, 58], [-43, 24], [-30, 10], [-8, 10], [-6, 58]], { angle: 1.2, gap: 4, w: 1, seed: 502 });
    ink.cut([[8, 14], [13, 36], [9, 58]], { w: 1.6, taper: 0.3, seed: 503 });
    pauldron(ink, [-40, 22], -0.15, 0.9, 504, 1, false);
    pauldron(ink, [40, 22], 0.12, 1.05, 512, 1, true);
    ink.form([[-30, 12], [0, 6], [30, 12], [28, 2], [0, -3], [-28, 2]], { w: 2.4, seed: 521 });
    ink.form([[-24, -2], [-21, -10], [0, -14], [23, -10], [25, -2], [0, 4]], { w: 2.4, seed: 522 });
    ink.mask(ell(1, -6, 17, 5, 0, 20));
    collarFire(ink, [1, -5], [0, -1], 0.95, 0, t, 523);
    ink.form([[-23, -3], [0, 1], [23, -3], [25, 4], [0, 8], [-23, 4]], { w: 2.2, seed: 529 });
  },
};
