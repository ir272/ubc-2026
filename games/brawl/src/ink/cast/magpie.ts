// THE MAGPIE (fighter id 'tick'): a small hunched thief in a hood with a pointed tip, a long-beaked
// bird mask, a mantle and cloak of layered feathers, three long tail feathers dragging behind, thin
// wrapped legs in pointed curled shoes and knives at the belt. Drawn by the pen from the posed
// joints; the look is the approved sheet, lab/cast/magpie.js (its frames are kept: U() is the
// sheet's hip frame, H() its head frame), with feathered sleeves and a knife in the front hand.
//
// Motion: the head bobs and cocks in twitches like a bird's, the tail flicks, the cloak, the hem
// feathers, the hood tip and the tail stream against the motion (FigureExtra.drag) and ruffle on
// a hit. Feather Knives flings the back arm out like a wing; Snatch bursts into loose feathers and
// re-forms from them; Updraft spreads both arms as feathered wings.
//
// The side shows on the hood and the mantle's top row of feathers (FigureExtra.sideTint); the
// tail sheen, the sash and the knife trails stay the Magpie's blue.
// Every pen call has a fixed seed so nothing boils from frame to frame.
import type { Build, CharacterDef, FigureExtra, Joints } from '../api.ts';
import type { FighterState, MoveDef, Projectile } from '../../sim/types.ts';
import { FIGHTERS } from '../../sim/fighters.ts';
import type { Pen, Pt } from '../pen.ts';
import { ell, h01, mix, smooth } from '../pen.ts';

const BUILD: Build = { height: 140, hipY: 56, torso: 50, neckLen: 16, arm: [27, 26], leg: [30, 28], shoulderX: 13, stanceX: 28, hunch: 0.24, propLen: 26, heft: 0.6 };
const ARM = BUILD.arm[0] + BUILD.arm[1];
const HK = 0.85; // head scale against the sheet's head units
const BLUE = 'blue';

// ------------------------------------------------------------------------------------------------
// small math
// ------------------------------------------------------------------------------------------------

const PI = Math.PI;
const TAU = PI * 2;
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt): number => Math.hypot(v[0], v[1]);
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const dirA = (a: number): Pt => [Math.cos(a), Math.sin(a)];
const rotV = (v: Pt, a: number): Pt => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const c01 = (v: number): number => clamp(v, 0, 1);
const ease = (u: number): number => 0.5 - 0.5 * Math.cos(PI * c01(u));
const frac = (v: number): number => v - Math.floor(v);

/** a bent tube along a path as one closed outline */
function tube(path: Pt[], w0: number, w1: number, per = 4): Pt[] {
  const p = path.length > 2 ? smooth(path, per) : path;
  const n = p.length, L: Pt[] = [], R: Pt[] = [];
  let a0 = 0, a1 = 0;
  for (let i = 0; i < n; i++) {
    const d = unit(sub(p[Math.min(n - 1, i + 1)]!, p[Math.max(0, i - 1)]!)), nn: Pt = [-d[1], d[0]], w = w0 + ((w1 - w0) * i) / Math.max(1, n - 1);
    L.push(add(p[i]!, nn, w)); R.push(add(p[i]!, nn, -w));
    if (i === 0) a0 = Math.atan2(nn[1], nn[0]);
    if (i === n - 1) a1 = Math.atan2(nn[1], nn[0]);
  }
  const capE: Pt[] = [], capS: Pt[] = [];
  for (let j = 1; j < 6; j++) capE.push(add(p[n - 1]!, dirA(a1 - (PI * j) / 6), w1));
  for (let j = 1; j < 6; j++) capS.push(add(p[0]!, dirA(a0 + PI - (PI * j) / 6), w0));
  return L.concat(capE, R.reverse(), capS);
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

/** a frame on a direction: P(along, across) */
const frameOn = (o: Pt, d: Pt) => (t: number, s: number): Pt => [o[0] + d[0] * t - d[1] * s, o[1] + d[1] * t + d[0] * s];

// ------------------------------------------------------------------------------------------------
// the move timeline
// ------------------------------------------------------------------------------------------------

function moveDef(s: FighterState): MoveDef | null {
  if (!s.move) return null;
  const d = FIGHTERS[s.fighter];
  return d ? d.moves[s.move] ?? null : null;
}

/** 0..1: rises through the wind-up, holds through the strike, eases off in the recovery */
function envelope(md: MoveDef, f: number, charging: boolean): number {
  const S = Math.max(1, md.startup), A = md.active, R = Math.max(1, md.recovery);
  if (charging) return ease(f / Math.max(1, S * 0.7));
  const up = ease((f - 1) / Math.max(1, S * 0.85));
  const down = 1 - ease((f - S - A) / (R * 0.6));
  return Math.min(up, down);
}

/** the frame Snatch vanishes on (the sim's blink frame, else the end of the startup) */
function blinkFrame(md: MoveDef): number {
  const b = (md as MoveDef & { blink?: { frame: number } }).blink;
  return b ? b.frame : md.startup;
}

// ------------------------------------------------------------------------------------------------
// parts
// ------------------------------------------------------------------------------------------------

/** one feather's outline from its root a to its tip b; bend curls the tip to one side */
function featherPts(a: Pt, b: Pt, w: number, bend: number): Pt[] {
  const L = len(sub(b, a)), P = frameOn(a, unit(sub(b, a)));
  return smooth([P(0, -w * 0.5), P(L * 0.3, -w), P(L * 0.72, -w * 0.72 + bend * 0.4), P(L, bend), P(L * 0.74, w * 0.55 + bend * 0.5), P(L * 0.34, w * 0.95), P(0, w * 0.5)], 3, true);
}

interface FeatherOpts { bend?: number; tint?: string; cut?: boolean; hatch?: string; w?: number }
function feather(ink: Pen, a: Pt, b: Pt, w: number, seed: number, o: FeatherOpts = {}): void {
  const k = o.bend ?? 0;
  const pts = featherPts(a, b, w, k);
  ink.form(pts, { w: o.w ?? 1.9, seed, tint: o.tint });
  if (o.hatch) ink.hatch(pts, { angle: Math.atan2(b[1] - a[1], b[0] - a[0]) + 0.5, gap: 3.2, w: 0.85, tint: o.hatch, seed: seed + 2 });
  if (o.cut) {
    const L = len(sub(b, a)), P = frameOn(a, unit(sub(b, a)));
    ink.cut(smooth([P(L * 0.04, 0), P(L * 0.5, k * 0.15), P(L * 0.88, k * 0.75)], 3), { w: 1.1, seed: seed + 1 });
  }
}

/** an arm in a feathered sleeve: smooth along the top, three feathers lapping down the underside
 *  with their points trailing back toward the shoulder; `hint` says which side is the underside */
function sleevePts(sh: Pt, el: Pt, wr: Pt, w: number, tl: number, hint: Pt): { poly: Pt[]; at: (t: number, s: number) => Pt } {
  const path = smooth([sh, el, wr], 4);
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + len(sub(path[i]!, path[i - 1]!)));
  const total = cum[cum.length - 1]! || 1;
  const posT = (t: number): { p: Pt; d: Pt } => {
    const s = clamp(t, 0, 1) * total;
    let i = 1;
    while (i < path.length - 1 && cum[i]! < s) i++;
    const a = path[i - 1]!, b = path[i]!, seg = cum[i]! - cum[i - 1]! || 1;
    return { p: mix(a, b, (s - cum[i - 1]!) / seg), d: unit(sub(b, a)) };
  };
  const mid = posT(0.5);
  const side = dot([-mid.d[1], mid.d[0]], hint) >= 0 ? 1 : -1;
  const at = (t: number, s: number): Pt => { const q = posT(t); return add(q.p, [-q.d[1] * side, q.d[0] * side], s); };
  const wt = (t: number): number => w * (1 - 0.22 * t);
  const top: Pt[] = [];
  for (let k = 0; k <= 6; k++) { const t = k / 6; top.push(at(t, -wt(t))); }
  const endCap = add(posT(1).p, posT(1).d, w * 0.55);
  const bot: Pt[] = [at(1, wt(1) * 0.9)];
  const roots = [0.97, 0.66, 0.36];
  roots.forEach((r, j) => {
    const L = tl * (1 - 0.15 * j);
    bot.push(at(r - 0.1, wt(r) + L * 0.7), at(r - 0.27, wt(r) * 0.7 + L), at(r - 0.25, wt(r) * 0.85));
  });
  bot.push(at(0, wt(0) * 0.8));
  const startCap = add(posT(0).p, posT(0).d, -w * 0.6);
  return { poly: smooth(top.concat([endCap], bot, [startCap]), 2, true), at };
}

/** a gloved fist closed round a grip, the knuckles toward the hand's travel */
function fist(ink: Pen, hand: Pt, from: Pt, r: number, seed: number): void {
  const P = frameOn(hand, unit(sub(hand, from)));
  ink.form(smooth([P(-r * 0.9, -r * 0.85), P(r * 0.4, -r * 1.05), P(r * 1.2, -r * 0.8), P(r * 1.35, 0), P(r * 1.15, r * 0.85), P(r * 0.2, r), P(-r * 0.9, r * 0.8)], 3, true), { w: 1.8, seed });
  ink.cut([P(r * 0.55, -r * 0.75), P(r * 0.7, r * 0.6)], { w: 1, seed: seed + 1 });
}

/** the leaf-bladed knife held at grip, the blade along d */
function knife(ink: Pen, grip: Pt, d: Pt, L: number, seed: number, pommel = true): void {
  const P = frameOn(grip, d);
  if (pommel) ink.form(ell(...P(-9, 0), 2.8, 2.8, 0, 12), { w: 1.4, seed });
  ink.form(smooth([P(2, -4), P(5, -1.6), P(L * 0.45, -3.8), P(L, 0), P(L * 0.5, 3.4), P(5, 1.6), P(2, 4)], 3, true), { w: 1.8, seed: seed + 1 });
  ink.cut([P(7, 0), P(L * 0.8, -0.4)], { w: 1, seed: seed + 2 });
}

/** a pointed shoe whose toe curls up and back; the toe goes forward across the shin */
function shoe(ink: Pen, knee: Pt, f: Pt, seed: number): void {
  const d = unit(sub(f, knee));
  let toe: Pt = [d[1], -d[0]];
  if (toe[0] < 0 && Math.abs(d[0]) < 0.6) toe = [-toe[0], -toe[1]];
  const B = (x: number, y: number): Pt => [f[0] + toe[0] * x + d[0] * y, f[1] + toe[1] * x + d[1] * y];
  ink.form(smooth([B(-6, -1), B(-5, -8), B(4, -8.5), B(12, -6), B(19, -6), B(24, -10), B(25.5, -15.5), B(21.5, -14.5), B(22.5, -10.5), B(20, -3), B(10, 0.5), B(-4, 0.5)], 3, true), { w: 1.8, seed });
  ink.cut([B(-3, -2), B(17, -2.2)], { w: 0.9, taper: 0.6, seed: seed + 1 });
}

/** a thin wrapped leg and its shoe */
function leg(ink: Pen, hp: Pt, knee: Pt, foot: Pt, seed: number, shade: boolean): void {
  const sd = unit(sub(foot, knee));
  const ankle = add(foot, sd, -6);
  const body = tube([hp, knee, ankle], 5.2, 3.1, 3);
  ink.form(body, { w: 1.9, seed });
  if (shade) ink.hatch(body, { angle: 1.1, gap: 3.4, w: 0.85, seed: seed + 1 });
  const nn: Pt = [-sd[1], sd[0]];
  for (let i = 0; i < 2; i++) {
    const p = mix(knee, ankle, 0.3 + i * 0.32);
    ink.cut([add(add(p, nn, -4), sd, -1.5), add(add(p, nn, 4), sd, 1.5)], { w: 1, seed: seed + 2 + i });
  }
  shoe(ink, knee, foot, seed + 5);
}

/** the hood (in the side's tint), the beak mask and the round glass eye, through the head frame */
function drawHead(ink: Pen, H: (x: number, y: number) => Pt, tipOff: Pt, tint: string, seed: number, o: { eye?: boolean; hoodK?: number } = {}): void {
  const hk = o.hoodK ?? 1;
  const hs = len(sub(H(1, 0), H(0, 0)));
  const Hh = (x: number, y: number): Pt => H(x * hk + (hk - 1) * 6, y * hk + (hk - 1) * 8);
  const tip = add(Hh(-42, -22), tipOff);
  const hood = smooth([Hh(12, 13), Hh(-6, 15), Hh(-18, 9), Hh(-24, -6), tip, Hh(-16, -24), Hh(0, -27), Hh(14, -20), Hh(20, -4), Hh(20, 8)], 4, true);
  ink.form(hood, { w: 2.4, seed, tint });
  ink.hatch(smooth([Hh(-6, 15), Hh(-18, 9), Hh(-24, -6), tip, Hh(-14, -20), Hh(-6, 0)], 4, true), { angle: 1.1, gap: 3.4, w: 0.9, seed: seed + 1 });
  ink.cut(smooth([mix(tip, Hh(-14, -14), 0.15), Hh(-14, -14), Hh(2, -2)], 3), { w: 1.2, seed: seed + 2 });
  const eye = o.eye ?? true;
  if (eye) ink.mask(ell(...H(10, 0), 9 * hs, 12 * hs, Math.atan2(H(1, 0)[1] - H(0, 0)[1], H(1, 0)[0] - H(0, 0)[0]), 16));
  // the beak: long, curved down at the tip
  const beak = smooth([H(4, -10), H(18, -11), H(38, -5), H(60, 9), H(48, 6), H(32, 5), H(18, 9), H(4, 10)], 4, true);
  ink.form(beak, { w: 2.2, seed: seed + 3 });
  ink.cut(smooth([H(14, 1), H(34, 1), H(56, 8)], 3), { w: 1.2, seed: seed + 4 });
  ink.hatch(smooth([H(14, 2), H(34, 2), H(56, 8), H(32, 5), H(16, 9)], 3, true), { angle: 0.3, gap: 2.8, w: 0.85, seed: seed + 5 });
  if (!eye) return;
  ink.cut([H(25, -6), H(30, -5)], { w: 1.3, seed: seed + 6 });
  ink.cut(smooth([H(4, -6), H(-6, -9), H(-20, -8)], 3), { w: 1.5, seed: seed + 7 });
  ink.form(ell(...H(10, -3), 5.2 * hs, 5.2 * hs, 0, 14), { w: 1.8, seed: seed + 8 });
  if (ink.mode === 'mass') ink.dot(...H(11, -3), 1.8);
  else ink.dot(...H(11, -3), 1.8, { free: true });
}

/** a wing of five feathers along an arm: coverts at the shoulder, long primaries at the hand */
function wing(ink: Pen, sh: Pt, el: Pt, hd: Pt, amt: number, hint: Pt, sweep: Pt, k: number, seed: number): void {
  for (let i = 4; i >= 0; i--) {
    const t = i / 4;
    const root = t < 0.5 ? mix(sh, el, t * 2) : mix(el, hd, (t - 0.5) * 2);
    const armD = unit(t < 0.5 ? sub(el, sh) : sub(hd, el));
    let perp: Pt = [-armD[1], armD[0]];
    if (dot(perp, hint) < 0) perp = [-perp[0], -perp[1]];
    const dir = unit(add(add(perp, armD, t * t * 1.1), sweep, 0.45));
    const L = (22 + 26 * t) * amt * k;
    feather(ink, root, add(root, dir, L), 5.8 * k * (0.7 + 0.3 * amt), seed + i * 3, { bend: i % 2 ? 2.5 : -2, cut: i >= 3 });
  }
}

// ------------------------------------------------------------------------------------------------
// the figure
// ------------------------------------------------------------------------------------------------

/** where the loose feathers of Snatch sit on the body: sheet hip-frame x, y and the feather's angle */
const LOOSE: [number, number, number][] = [
  [-30, -62, 2.5], [-8, -72, 2.1], [12, -66, 1.3], [22, -40, 1.5], [-42, -32, 2.3], [-52, 0, 2.0],
  [-30, 22, 1.8], [2, 12, 1.6], [18, -12, 1.2], [-74, 8, 2.9], [-96, 16, 3.05], [10, -96, 0.3],
];

function drawLoose(ink: Pen, U: (x: number, y: number) => Pt, rotB: number, k: number, kk: number, gather: boolean): void {
  const c = U(-14, -30);
  LOOSE.forEach(([x, y, a], i) => {
    const p0 = U(x, y);
    const h1 = h01(i * 3.7 + 1), h2 = h01(i * 5.3 + 2), h3 = h01(i * 7.1 + 3);
    const out = unit(sub(p0, c));
    const sw = gather ? -1 : 1;
    const p = add(add(add(p0, out, 85 * k * (0.55 + 0.8 * h1)), [0, -1], (gather ? 10 : 34) * k * h2), [-out[1], out[0]], sw * Math.sin(k * 5 + i) * 10 * k);
    const ang = a + rotB + sw * (h3 - 0.5) * 7 * k;
    const L = (20 + 9 * h2) * kk * (1 - 0.45 * k);
    feather(ink, add(p, dirA(ang), -L * 0.5), add(p, dirA(ang), L * 0.5), L * 0.24, 700 + i * 4, { bend: (h1 - 0.5) * 5, cut: true });
  });
}

function drawMagpie(ink: Pen, J: Joints, x: FigureExtra): void {
  const s = x.state;
  const md = moveDef(s);
  const f = s.actionFrame;
  const t = x.t;
  const inMove = !!md && (s.action === 'attack' || s.action === 'charge');
  const mv = inMove ? s.move : null;
  const e = inMove && md ? envelope(md, f, s.action === 'charge') : 0;
  const sulk = s.action === 'lose';
  const won = s.action === 'win';

  // ---- Snatch: burst into feathers before the blink, re-form from them after ----
  let burst = 0, gather = false;
  if (mv === 'special2' && md) {
    const bf = blinkFrame(md);
    if (f < bf) burst = ease((f - 1.2) / Math.max(1, bf - 2.2));
    else { burst = 1 - ease((f - bf - 0.4) / 2.6); gather = true; }
  }

  // ---- arms the moves take over from the pose engine ----
  let hF = J.handF, eF = J.elbowF, hB = J.handB, eB = J.elbowB;
  let wingF = 0, wingB = 0, cloakRot = 0, ruffle = 0;
  let knifeMode: 'hold' | 'fan' | 'open' | 'none' = 'hold';
  if (mv === 'special' && md) {
    // Feather Knives: the back arm flung out behind like a wing, the cloak streaming after it
    const rel = md.projectile ? md.projectile.frame : md.startup + 1;
    wingB = e; cloakRot = 0.95 * e;
    const tB = mix(J.handB, add(J.shoulderB, dirA(PI - 0.3), ARM * 0.96), e);
    [eB, hB] = ik2(J.shoulderB, tB, BUILD.arm[0], BUILD.arm[1], [0, 1]);
    knifeMode = f < rel ? 'fan' : f < rel + 13 ? 'open' : 'hold';
  }
  if (mv === 'recover' && md) {
    // Updraft: both arms spread wide and high, the cloak's feathers fanned from them as wings
    const k = ease(f / Math.max(1, md.startup)) * (1 - ease((f - md.startup - md.active) / Math.max(1, md.recovery * 0.8)));
    wingF = k; wingB = k;
    const flap = Math.sin(f * 0.55) * 0.18 * k;
    const tF = mix(J.handF, add(J.shoulderF, dirA(-0.55 + flap), ARM * 0.95), k);
    const tB = mix(J.handB, add(J.shoulderB, dirA(-2.55 - flap), ARM * 0.95), k);
    [eF, hF] = ik2(J.shoulderF, tF, BUILD.arm[0], BUILD.arm[1], [0, -1]);
    [eB, hB] = ik2(J.shoulderB, tB, BUILD.arm[0], BUILD.arm[1], [0, -1]);
    knifeMode = k > 0.3 ? 'none' : 'hold';
  }
  if (mv === 'nair') { wingF = 0.55 * e; wingB = 0.55 * e; cloakRot = 0.5 * e; }
  if (mv === 'grab' || s.action === 'holding' || (mv && md && md.kind === 'throw')) knifeMode = 'none';
  if (s.action === 'hitstun') { ruffle = s.tumble ? 1 : 0.7; knifeMode = s.tumble ? 'none' : 'hold'; }
  if (s.action === 'helpless' || s.action === 'ledgehang' || s.action === 'ledgeclimb' || s.action === 'held' || s.action === 'knockdown' || s.action === 'getup') knifeMode = 'none';
  if (s.action === 'shieldbreak') { ruffle = 0.6; knifeMode = 'none'; }
  if (burst > 0) ruffle = Math.max(ruffle, burst * 2.5);
  if (won) {
    // a stolen coin flipped off the back hand at the chest
    const k = ease((f - 6) / 14);
    const tB = mix(J.handB, add(J.shoulderB, [ARM * 0.62, ARM * 0.2]), k);
    [eB, hB] = ik2(J.shoulderB, tB, BUILD.arm[0], BUILD.arm[1], [0, 1]);
  }
  if (sulk) {
    // both hands up under the chin, holding the cloak shut over the head
    const k = ease(f / 20);
    [eF, hF] = ik2(J.shoulderF, mix(J.handF, add(J.neck, [16, 6]), k), BUILD.arm[0], BUILD.arm[1], [0, 1]);
    [eB, hB] = ik2(J.shoulderB, mix(J.handB, add(J.neck, [12, 10]), k), BUILD.arm[0], BUILD.arm[1], [0, 1]);
    knifeMode = 'none';
  }

  // ---- the body frame (the sheet's hip frame) ----
  const hip = J.hip, neck = J.neck;
  const u = unit(sub(neck, hip));
  const n: Pt = [-u[1], u[0]];
  const back: Pt = [-n[0], -n[1]];
  const kk = len(sub(neck, hip)) / 56;
  const U = (a: number, b: number): Pt => [hip[0] + (n[0] * a - u[0] * b) * kk, hip[1] + (n[1] * a - u[1] * b) * kk];
  const rotB = Math.atan2(n[1], n[0]);
  const spin = J.spin || 0;
  const wDown: Pt = [Math.sin(spin), Math.cos(spin)];
  const down = unit(mix([-u[0], -u[1]], wDown, 0.5));

  // cloth drag: against the motion; falling lifts the hem; a launch flings it
  const facing = s.facing || 1;
  const vxl = (x.drag * facing) / 6000;
  let dvW: Pt = [clamp(-vxl / 0.15, -1.4, 1.4) * 30, clamp(s.vy / 0.12, -1, 1) * 24];
  if (s.action === 'hitstun') {
    const kx = s.kbx * facing, ky = -s.kby, kl = Math.hypot(kx, ky);
    if (kl > 1e-4) dvW = add(dvW, [-(kx / kl) * 30, -(ky / kl) * 30]);
  }
  if (mv === 'recover' && md) dvW = add(dvW, [0, 22 * wingF]);
  const dv = rotV(dvW, -spin);
  const flut = Math.sin(t * 9.3) * c01(len(dvW) / 30) * 4;
  const floorY = s.grounded && Math.abs(spin) < 0.01 ? -1.5 : 1e9;
  const onFloor = (p: Pt): Pt => [p[0], Math.min(p[1], floorY)];

  // ---- the bird's twitches: the head bobs and cocks in jumps, the tail flicks ----
  const calm = s.action === 'idle' || s.action === 'respawn' || won ? 1 : s.action === 'walk' ? 0.7 : s.action === 'shield' ? 0.4 : 0;
  let bob = 0, cock = 0;
  if (calm > 0) {
    const ph = frac(t * 1.7);
    const poke = ph < 0.1 ? ease(ph / 0.1) : ph < 0.55 ? 1 : 1 - ease((ph - 0.55) / 0.1);
    bob = (poke - 0.5) * 7 * calm;
    const st = Math.floor(t * 1.15);
    const c0 = (h01(st * 1.7 + 0.3) - 0.45) * 0.42, c1 = (h01((st - 1) * 1.7 + 0.3) - 0.45) * 0.42;
    cock = (c1 + (c0 - c1) * ease(frac(t * 1.15) * 7)) * calm;
  }
  if (s.action === 'run') bob = Math.sin(t * 15) * 3;
  if (won) cock += 0.32 * ease(f / 16);
  let flick = 0;
  if (calm > 0) { const p2 = frac(t * 0.55 + 0.3); flick = (p2 < 0.07 ? ease(p2 / 0.07) : 1 - ease((p2 - 0.07) / 0.3)) * calm; }

  if (burst > 0.97) return;
  const bodyOn = burst < 0.4;

  // ---- the head frame ----
  const tilt = J.headTilt - 0.75 * J.lean + cock + (sulk ? 0.35 : 0);
  const ct = Math.cos(tilt) * HK, st = Math.sin(tilt) * HK;
  const head = add(add(J.head, n, 4 + bob), u, sulk ? -6 : 0);
  const H = (hx: number, hy: number): Pt => [head[0] + hx * ct - hy * st, head[1] + hx * st + hy * ct];

  if (!bodyOn) { drawLoose(ink, U, rotB, burst, kk, gather); return; }

  // ================================ the drawing, back to front ================================
  const hint = unit(add(down, back, 0.35));

  // 1. the tail: three long feathers from behind the hip, blue sheen, streaming with the motion
  {
    let td = unit(add(add(back, down, 0.28), u, flick * 0.42 + (sulk ? -0.5 : 0)));
    const m = c01(len(dvW) / 34);
    if (m > 0.01) td = unit(add(td, unit(dv), m * 1.1));
    const lens = [88, 80, 68];
    for (let i = 0; i < 3; i++) {
      const root = U(-20 + i * 4, 2 + i * 3);
      const d = rotV(td, -0.08 + i * 0.085 + flut * 0.006 * (i + 1));
      const tip = onFloor(add(add(root, d, lens[i]! * kk), dv, 0.2));
      feather(ink, root, tip, (6.4 - i * 0.8) * kk, 20 + i * 5, { bend: i === 0 ? -3 : 2, hatch: BLUE, cut: true });
    }
  }

  // 2. the cloak's back mass: hangs from the shoulders, swings back and out like a wing in a throw
  const pivot = U(-14, -50);
  const hang = (p: Pt, w: number): Pt => {
    let q = p;
    if (cloakRot > 0.001) {
      const r = sub(q, pivot);
      q = add(pivot, rotV(r, cloakRot * Math.sqrt(w)), 1 + 0.35 * cloakRot * w);
    }
    if (ruffle > 0) q = add(q, unit(sub(q, pivot)), ruffle * 6 * w);
    return onFloor(add(add(q, dv, w), [flut * w, 0]));
  };
  const sc = sulk ? 1.12 : 1;
  const cB1 = hang(U(-36, -36), 0.2), cB2 = hang(U(-46 * sc, -8), 0.5), cB3 = hang(U(-56 * sc, 18), 0.8), cB4 = hang(U(-64 * sc, 30), 1);
  const cF1 = hang(U(-34, 34), 1), cF2 = hang(U(-8, 32), 0.85), cF3 = hang(U(8, 25), 0.6);
  const cloak = smooth([U(12, -60), U(-6, -64), U(-24, -56), cB1, cB2, cB3, cB4, cF1, cF2, cF3, U(12, -8), U(14, -40)], 4, true);
  ink.form(cloak, { w: 2.6, seed: 40 });
  ink.hatch(cloak, { angle: rotB + 1.25 + cloakRot * 0.8, gap: 4.4, w: 1, seed: 41 });
  ink.cut(smooth([U(-8, -56), mix(U(-26, -30), cB2, 0.5), cB3], 4), { w: 1.4, seed: 42 });
  ink.cut(smooth([U(2, -46), mix(U(-14, -10), cF1, 0.4), mix(cF1, cB4, 0.3)], 4), { w: 1.4, seed: 43 });
  // the feathered hem
  {
    const hemDir = unit(add(add(rotV(down, cloakRot * 0.9), back, 0.3), dv, 1 / 45));
    const hem = [cB4, cF1, cF2, cF3];
    for (let i = 0; i < 6; i++) {
      const q = (i / 5) * 2.9, j = Math.min(2, Math.floor(q));
      const p = mix(hem[j]!, hem[j + 1]!, q - j);
      const L = (27 + (i % 2 ? 6 : -3)) * kk * (1 + 0.25 * ruffle);
      const tip = onFloor(add(p, rotV(hemDir, (i - 2.5) * 0.06 + ruffle * (i % 2 ? 0.3 : -0.3)), L));
      feather(ink, add(p, hemDir, -6), tip, 5.2 * kk, 50 + i * 3, { bend: i % 2 ? 3 : -2.5, cut: i % 2 === 1 });
    }
  }

  // 3. the back arm: its wing, the feathered sleeve, the hand
  if (wingB > 0.02) wing(ink, J.shoulderB, eB, hB, wingB, hint, add(back, down, 0.4), kk, 70);
  if (!sulk) {
    const sl = sleevePts(J.shoulderB, eB, hB, 5 * kk + 0.6, 6, hint);
    ink.form(sl.poly, { w: 1.9, seed: 90 });
    ink.hatch(sl.poly, { angle: 0.9, gap: 3.6, w: 0.85, seed: 91 });
    ink.form(ell(hB[0], hB[1], 4.6, 4.2, 0, 12), { w: 1.7, seed: 92 });
  }

  // 4. legs
  leg(ink, U(-4, 2), J.kneeB, J.footB, 100, true);
  leg(ink, U(4, 2), J.kneeF, J.footF, 110, false);

  // 5. the body: a ragged tunic, the blue sash, two knives through it
  {
    const lo = (p: Pt, w: number): Pt => add(p, dv, w * 0.25);
    const tunic = smooth([U(-10, -58), U(10, -58), U(20, -40), U(24, -16), lo(U(23, 6), 0.5), lo(U(16, 13), 1), lo(U(9, 7), 0.8), lo(U(2, 14), 1), lo(U(-6, 6), 0.8), lo(U(-12, 12), 1), U(-14, -20)], 4, true);
    ink.form(tunic, { w: 2.2, seed: 120 });
    ink.cut(smooth([U(12, -30), U(15, -12), U(13, 6)], 3), { w: 1.2, seed: 121 });
    ink.hatch(smooth([U(-14, -20), U(-12, 12), U(-6, 6), U(2, 12), U(4, -20)], 3, true), { angle: rotB + 1.3, gap: 3.6, w: 0.9, seed: 122 });
    // the knives at the belt, hilts up and forward (the third is in the hand)
    [[-6, -0.5], [5, -0.3]].forEach(([bx, a], i) => {
      const base = U(bx!, -2), d = dirA(-PI / 2 + a! + 0.5 + rotB);
      ink.form(tube([base, add(base, d, 20 * kk)], 2.2, 3.1, 2), { w: 1.5, seed: 124 + i });
      ink.cut([add(base, d, 6), add(add(base, d, 6), [-d[1], d[0]], 4)], { w: 1, seed: 126 + i });
    });
    ink.form(smooth([U(-13, -14), U(6, -16), U(25, -18), U(26, -8), U(6, -5), U(-13, -4)], 3, true), { tint: BLUE, w: 2, seed: 128 });
    ink.form(smooth([U(24, -14), lo(U(30, -2), 1.2), lo(U(27, 12), 2), lo(U(21, 0), 1)], 3, true), { tint: BLUE, w: 1.6, seed: 129 });
  }

  // 6. the mantle: a long row of feathers round the shoulders, then the top row in the side's tint
  {
    const mc = U(0, -54);
    const dA = Math.atan2(down[1], down[0]);
    const row = (nf: number, a0: number, a1: number, r0: number, L0: number, w: number, seed: number, tint?: string): void => {
      for (let i = 0; i < nf; i++) {
        const a = a0 + ((a1 - a0) * i) / (nf - 1) + rotB;
        const at = a + (dA - a) * (0.5 - 0.32 * c01(ruffle)) + ruffle * 0.15 * (i % 2 ? 1 : -1);
        const base = add(mc, dirA(a), r0 * kk);
        const L = (L0 - Math.abs(i - (nf - 1) * 0.45) * 1.5) * kk * (1 + 0.22 * c01(ruffle));
        const tip = add(add(base, dirA(at), L), dv, 0.12);
        feather(ink, base, tip, w * kk, seed + i * 3, { bend: i % 2 ? 3 : -3, tint, cut: !tint && i % 2 === 0 });
      }
    };
    row(7, PI * 1.05, PI * 0.12, 9, sulk ? 46 : 38, 7, 140);
    row(5, PI * 0.92, PI * 0.25, 5, sulk ? 30 : 24, 6.6, 170, x.sideTint);
  }

  // 7. the front arm: its wing, the feathered sleeve, the hand and the knife
  if (wingF > 0.02) wing(ink, J.shoulderF, eF, hF, wingF, hint, add(back, down, 0.4), kk, 190);
  {
    const sl = sleevePts(J.shoulderF, eF, hF, 5.4 * kk + 0.6, 6.5, hint);
    ink.form(sl.poly, { w: 2, seed: 210 });
    ink.cut([sl.at(0.71, 5), sl.at(0.86, 0.5)], { w: 1, seed: 211 });
    ink.cut([sl.at(0.41, 5), sl.at(0.56, 0.5)], { w: 1, seed: 212 });
    const fa = unit(sub(hF, eF));
    if (knifeMode === 'open') {
      // the hand just opened after the release: three fingers splayed
      const a0 = Math.atan2(fa[1], fa[0]);
      ink.form(ell(hF[0], hF[1], 5.4, 4.8, a0, 12), { w: 1.8, seed: 220 });
      [-0.7, -0.12, 0.45].forEach((a, i) => {
        const p0 = add(hF, dirA(a0 + a), 4);
        ink.form(tube([p0, add(p0, dirA(a0 + a), 8.5 - i)], 1.8, 1.3, 2), { w: 1.4, seed: 221 + i });
      });
    } else if (knifeMode === 'fan') {
      // three knives fanned in the fist, ready to fling
      for (let i = 0; i < 3; i++) knife(ink, hF, dirA(J.prop + (i - 1) * 0.42), 24, 230 + i * 3, i === 1);
      fist(ink, hF, eF, 4.8, 240);
    } else if (knifeMode === 'hold') {
      let ka = J.prop;
      if (won) { const p = frac(t * 0.45); if (p < 0.4) ka -= TAU * 2 * ease(p / 0.4); }
      knife(ink, hF, dirA(ka), BUILD.propLen, 230);
      fist(ink, hF, eF, 4.8, 240);
    } else {
      fist(ink, hF, eF, 4.6, 240);
    }
  }
  if (sulk) fist(ink, hB, eB, 4.4, 244);

  // 8. the hood and the beak mask
  drawHead(ink, H, add(dv, [flut, -flut * 0.5], 0.3), x.sideTint, 300, { eye: !sulk, hoodK: sulk ? 1.3 : 1 });

  // the win: a stolen coin spinning up off the back hand and dropping back into it
  if (won && f > 18) {
    const p = frac(t * 0.9 + 0.2);
    const hgt = 4 * p * (1 - p) * 52;
    const c = add(hB, [2, -7 - hgt]);
    const flip = Math.cos(p * TAU * 3);
    ink.form(ell(c[0], c[1], Math.abs(flip) * 4.6 + 0.9, 4.6, 0, 14), { tint: 'gold', w: 1.3, seed: 320 });
  }

  // the re-forming from feathers (Snatch): the last loose feathers settling in over the body
  if (burst > 0.03) drawLoose(ink, U, rotB, burst, kk, gather);
}

export const MAGPIE: CharacterDef = {
  id: 'tick',
  build: BUILD,
  anims: {
    jab: { anim: 'jab' }, tilt: { anim: 'swingSide' }, uptilt: { anim: 'swingUp' }, dash: { anim: 'thrust' },
    smash: { anim: 'kick' }, upsmash: { anim: 'kickUp' },
    nair: { anim: 'spin' }, fair: { anim: 'swingSide' }, bair: { anim: 'kick' }, uair: { anim: 'swingUp' }, dair: { anim: 'stomp' },
    grab: { anim: 'reach', hand: 'both' }, throwf: { anim: 'throwObj', hand: 'both' }, throwb: { anim: 'throwObj', hand: 'both' }, throwu: { anim: 'throwObj', hand: 'both' },
    special: { anim: 'cast' }, special2: { anim: 'swingSide' }, recover: { anim: 'leap' },
  },
  draw(ink, J, x) {
    drawMagpie(ink, J, x);
  },
  drawProjectile(ink: Pen, p: Projectile, t: number) {
    // a leaf-bladed knife about 0.45 m long, feather fletching at the pommel, three thin blue
    // strokes trailing; a spent one (cd 1) is a faint outline with one faint stroke
    const spent = p.cd === 1;
    const sy = p.vx < 0 ? -1 : 1; // the stage turns the picture to the travel: keep the fletching on one side
    const seed = 600 + (p.id % 40) * 7;
    const Y = (q: Pt): Pt => [q[0], q[1] * sy];
    const blade = smooth([[-2, -3.4], [4, -4.8], [12, -4.6], [24, 0], [12, 4.6], [4, 4.8], [-2, 3.4]] as Pt[], 3, true).map(Y);
    if (spent) {
      ink.line(blade, { closed: true, w: 1.2, alpha: 0.35, seed });
      ink.line([[-14, 0], [-58, 0]], { tint: BLUE, w: 1.2, taper: 0.9, alpha: 0.3, seed: seed + 1 });
      return;
    }
    for (let i = 0; i < 3; i++) {
      const y = (i - 1) * 5;
      const L = i === 1 ? 74 : 52;
      const pts: Pt[] = [];
      for (let j = 0; j <= 4; j++) pts.push(Y([-24 - (L * j) / 4, y * (1 + j * 0.35) + Math.sin(t * 13 + j * 1.4 + i * 2 + p.id) * 1.4 * (j / 4)]));
      ink.line(pts, { tint: BLUE, w: i === 1 ? 2.2 : 1.5, taper: 0.9, seed: seed + 1 + i });
    }
    feather(ink, Y([-11, -1]), Y([-27, -8]), 3.6, seed + 4, { bend: -1 });
    feather(ink, Y([-11, 1]), Y([-27, 8]), 3.6, seed + 6, { bend: 1 });
    ink.form(tube([[-13, 0], [-2, 0]], 2.3, 2.3, 2), { w: 1.4, seed: seed + 8 });
    ink.form(ell(-14, 0, 3.1, 3.1, 0, 12), { w: 1.4, seed: seed + 9 });
    ink.form(blade, { w: 1.8, seed: seed + 10 });
    ink.form(tube([[-2, -6.5], [-2, 6.5]], 1.6, 1.6, 2), { w: 1.3, seed: seed + 11 });
    ink.cut([[3, 0], [19, -0.3 * sy]], { w: 1, seed: seed + 12 });
  },
  portrait(ink, t) {
    void t;
    // the mantle round the shoulders, then the hood and the long beak
    for (let i = 0; i < 7; i++) {
      const a = PI * 0.95 - (PI * 0.85 * i) / 6;
      const base: Pt = [-8 + Math.cos(a) * 18, 18 + Math.sin(a) * 6];
      feather(ink, base, add(base, dirA(a + (PI / 2 - a) * 0.55), 40 - Math.abs(i - 3) * 2), 8, 500 + i * 3, { bend: i % 2 ? 3 : -3, cut: i % 2 === 0 });
    }
    for (let i = 0; i < 5; i++) {
      const a = PI * 0.9 - (PI * 0.65 * i) / 4;
      const base: Pt = [-8 + Math.cos(a) * 9, 12 + Math.sin(a) * 4];
      feather(ink, base, add(base, dirA(a + (PI / 2 - a) * 0.55), 24), 7.5, 530 + i * 3, { bend: i % 2 ? 3 : -3 });
    }
    const head: Pt = [-12, -12];
    const H = (hx: number, hy: number): Pt => [head[0] + hx * 1.05, head[1] + hy * 1.05];
    drawHead(ink, H, [0, 0], 'ink', 560);
  },
};
