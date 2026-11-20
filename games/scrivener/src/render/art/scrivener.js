// The Scrivener, inked. Owner: art. Reads boss state + pose only (never mutates).
//
// ORIGINAL design (not any Death Note character): a gaunt, hunched death-god scribe.
// A long pale bone skull with a pen-nib slit in the brow, a stitched mouth and two swept
// horns; a ruff of black quills standing off the shoulders; black bookmark ribbons
// trailing from the skull; a black coat with an open ribcage front, a chain belt, paper
// talismans and an inkwell; gaunt skeletal arms (a knuckled humerus in a torn black
// sleeve, two thin crossing forearm bones, carpal pebbles) ending in sinew-webbed bone
// hands with long talons; black sinewy legs; wings of layered, curved, thorned black
// quills; a quill-hilted nib blade and a black ledger. Anatomy primitives: bone.js.
//
// Drawn as an ink illustration: solid black masses carved with white, pen contours
// that swell on the shadow side, hatching that wraps the forms, dot tone for greys.

import { lerp, clamp } from '../../core/math.js';
import { hashNoise } from '../../core/rng.js';
import { INK, PAPER, RED, hatch, tonePattern, offscreen } from '../ink.js';
import {
  LIGHT, spline, quad, ribbonPath, penPath, pen, spikePts, spikePath, spike, contour,
  polyPath, poly, tone, wrapHatchPath,
} from './pen.js';
import { gripHand, clawHand } from './claw.js';
import { olecranon } from './limb.js';
import { inkBlades, massBlades, crossPocket } from './blades.js';
import { bone, pebblePts, pebbles, quillPts, quillWidth, dryTatterPath, scrapesPath } from './bone.js';
import { has, drawPart, drawPartAffine } from './puppet.js';
import { ink } from './paint/pen.js';
import { SUTURE } from './paint/hand_skull.js';
import { inkEdge } from './paint/brush.js';

// ---- round 34: the hand's wobble on the live-inked parts --------------------------------
// The baked parts carry a living ink edge (paint/brush.js inkEdge). What is still inked
// live (wing arms, ruff, ribbons, neck, pauldron, belt) gets the same hand: while the
// figure is drawn, every vertex its pens lay down is nudged by a smooth two-octave field
// read at the vertex's own (local) position, so contours drift off the machine curve,
// thin strokes swell and pinch, and a shared edge stays shared. The blade, the ledger
// and the chain are hard objects and keep their ruled lines (JIT off around them).
let JIT = 0;
const JIT_SEEN = new WeakSet();
function jitterOn(ctx) {
  if (!ctx || JIT_SEEN.has(ctx) || typeof ctx.lineTo !== 'function') return;
  const proto = Object.getPrototypeOf(ctx);
  if (!proto || !proto.lineTo) return;
  const lt = proto.lineTo, mt = proto.moveTo, cp = proto.closePath, bp = proto.beginPath;
  // the pen position (unjittered) and the subpath start, so a long straight run is cut
  // into short spans that each take the wobble (a ruler-straight edge is the tell of vector)
  let cx = 0, cy = 0, sx = 0, sy = 0, has = false;
  const span = (self, x, y) => {
    if (has) {
      const dx = x - cx, dy = y - cy;
      const L2 = dx * dx + dy * dy, n = L2 < 64 ? 0 : Math.min(8, Math.floor(Math.sqrt(L2) / 5));
      for (let k = 1; k < n; k++) { const px = cx + dx * k / n, py = cy + dy * k / n; const j = wob(px, py); lt.call(self, px + j[0], py + j[1]); }
    }
    const j = wob(x, y);
    lt.call(self, x + j[0], y + j[1]);
    cx = x; cy = y;
  };
  ctx.lineTo = function (x, y) {
    if (JIT) return span(this, x, y);
    has = false;
    return lt.call(this, x, y);
  };
  ctx.moveTo = function (x, y) {
    if (JIT) { const j = wob(x, y); cx = sx = x; cy = sy = y; has = true; return mt.call(this, x + j[0], y + j[1]); }
    has = false;
    return mt.call(this, x, y);
  };
  ctx.closePath = function () {
    if (JIT && has) { span(this, sx, sy); cx = sx; cy = sy; }
    return cp.call(this);
  };
  ctx.beginPath = function () { has = false; return bp.call(this); };
  JIT_SEEN.add(ctx);
}
const WJ = [0, 0];
// the field is tabulated once (periodic, 64 units, 0.5-unit cells) and read bilinearly:
// sines per vertex cost ~4 ms a frame at the vertex counts the figure lays down
const WT = 128, WC = 2; // cells, cells per unit
const WX = new Float32Array(WT * WT), WY = new Float32Array(WT * WT);
for (let j = 0; j < WT; j++) for (let i = 0; i < WT; i++) {
  const x = i / WC, y = j / WC, P = (2 * Math.PI) / (WT / WC);
  // long drift (~11 units) + short tremor (~2.6 units), both periodic over the table
  const a = Math.sin(6 * P * x + 1.9 * Math.sin(5 * P * y + 0.7));
  const b = Math.sin(6 * P * y + 1.7 * Math.sin(4 * P * x + 2.1));
  const c = Math.sin(25 * P * x + 13 * P * y + 1.1 * Math.sin(19 * P * y));
  const d = Math.sin(24 * P * y - 11 * P * x + 1.2 * Math.sin(17 * P * x));
  WX[j * WT + i] = 0.62 * a + 0.24 * c;
  WY[j * WT + i] = 0.62 * b + 0.24 * d;
}
function wob(x, y) {
  let fx = x * WC, fy = y * WC;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  fx -= ix; fy -= iy;
  const x0 = ix & (WT - 1), y0 = iy & (WT - 1), x1 = (x0 + 1) & (WT - 1), y1 = (y0 + 1) & (WT - 1);
  const i00 = y0 * WT + x0, i10 = y0 * WT + x1, i01 = y1 * WT + x0, i11 = y1 * WT + x1;
  const ax = WX[i00] + (WX[i10] - WX[i00]) * fx, bx = WX[i01] + (WX[i11] - WX[i01]) * fx;
  const ay = WY[i00] + (WY[i10] - WY[i00]) * fx, by = WY[i01] + (WY[i11] - WY[i01]) * fx;
  WJ[0] = JIT * (ax + (bx - ax) * fy);
  WJ[1] = JIT * (ay + (by - ay) * fy);
  return WJ;
}
const ruled = (fn) => { const k = JIT; JIT = 0; try { return fn(); } finally { JIT = k; } };

const dirv = (a) => [Math.sin(a), Math.cos(a)]; // 0 = down, +PI/2 = forward (+x)
const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
const BONE = '#ece6d4';
const HI = '#fbf8ef'; // glint white, brighter than the paper
const HS = 0.8; // round 29: 0.7 -> 0.8, the skull carries the face of the boss. skull scale (round 11: smaller on a longer body, ~1/8 of the figure: gaunt, not big-headed)

// ---- rig ------------------------------------------------------------------------
// Shared with boss_pose.js weaponGeom() (owner: tells) so strike FX trace the drawing.
export const RIG = { legLen: 186, torso: 142, upper: 86, fore: 106, blade: 140 };
// The spine is an S, not a post: the lumbar sags back a little, then the upper back
// rolls forward into a hump that thrusts the neck and shoulders ahead of the hips.
export function hunchOff(s) {
  const k = clamp((s - 0.3) / 0.75, 0, 1.2);
  // round 23: a deeper S (line of action): the lumbar sags back further and the
  // thoracic hump rolls the shoulders well ahead of the hips
  return 50 * k * k - 13 * Math.sin(Math.PI * clamp(s, 0, 1));
}

const R0fw = (pose) => [Math.cos(pose.lean), Math.sin(pose.lean)];

function rig(b, pose, t) {
  const breathe = pose.breathe != null ? Math.sin(pose.breathe / 600) * 3 : 0;
  const walkPh = pose.walk != null ? pose.walk / 220 : null;
  const shiver = pose.shiver ? Math.sin(t / 25) * 1.5 : 0;
  const legLen = RIG.legLen;
  const H = [shiver, -(legLen - pose.crouch * 66) + breathe];
  const torso = RIG.torso;
  const u = [Math.sin(pose.lean), -Math.cos(pose.lean)];
  const fw = [Math.cos(pose.lean), Math.sin(pose.lean)];
  const P = (s, o) => { const oo = o + hunchOff(s); return [H[0] + u[0] * torso * s + fw[0] * oo, H[1] + u[1] * torso * s + fw[1] * oo]; };
  const S = P(1, 0);
  const headA = pose.lean * 0.6 + pose.head;
  const neckBase = P(1.0, 10);
  // round 23: the neck is thrust FORWARD out of the front of the hump (not up), so the
  // skull hangs at the height of the hump and the hump is the top of the silhouette
  const raise = clamp((Math.max(pose.sh, pose.bsh) - 2) / 0.9, 0, 1);
  const nd = dirv(Math.PI - (headA * 0.5 + lerp(1.38, 1.0, raise))); // arms overhead: the neck rises to them
  const neck = add(add(neckBase, [nd[0], nd[1]], 25), R0fw(pose), 18 * raise);
  const headRot = headA * 0.75 + 0.18;
  const drag = clamp((b.vx || 0) * -b.facing / 115, -1, 1); // + when moving forward
  return { H, P, S, u, fw, headA, neckBase, neck, headRot, walkPh, drag, torso };
}

function arm(sh, a1, a2) {
  const d1 = dirv(a1), d2 = dirv(a1 + a2);
  const elbow = [sh[0] + d1[0] * RIG.upper, sh[1] + d1[1] * RIG.upper];
  const hand = [elbow[0] + d2[0] * RIG.fore, elbow[1] + d2[1] * RIG.fore];
  return { sh, elbow, hand, angle: a1 + a2, d2 };
}

// ---- limbs ----------------------------------------------------------------------

function limbOutline(A, B, rA, rB, bulge = 0.2) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const L = [], R = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const r = lerp(rA, rB, s) * (1 + bulge * Math.sin(Math.PI * Math.min(1, s * 1.5)));
    const cx = A[0] + dx * s, cy = A[1] + dy * s;
    L.push([cx + nx * r, cy + ny * r]);
    R.push([cx - nx * r, cy - ny * r]);
  }
  return { pts: L.concat(R.reverse()), nx, ny, len, dx, dy };
}

// Black sinewy limb: a white gap separates it from black behind it, form is carved with
// white rim light and short white wrap strokes on the lit side, and pale bandage cuffs
// bind it with torn ends hanging.
function blackLimb(ctx, A, B, rA, rB, { seed = 1, far = false, cuffs = 1, bulge = 0.22, t = 0, halo = true } = {}) {
  const o = limbOutline(A, B, rA, rB, bulge);
  const lit = o.nx * LIGHT[0] + o.ny * LIGHT[1];
  const ls = lit > 0 ? 1 : -1; // lit side sign along n
  const ux = o.dx / o.len, uy = o.dy / o.len;
  const at = (s, sd, pad = 0) => {
    const r = lerp(rA, rB, s) * (1 + bulge * Math.sin(Math.PI * Math.min(1, s * 1.5))) + pad;
    return [A[0] + ux * s * o.len + o.nx * r * sd, A[1] + uy * s * o.len + o.ny * r * sd];
  };
  if (halo && !far) {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    const L = [], Rr = [];
    for (let i = 0; i <= 6; i++) { L.push(at(i / 6, 1, 1.6)); Rr.push(at(i / 6, -1, 1.6)); }
    polyPath(ctx, L.concat(Rr.reverse()));
    ctx.fill();
  }
  poly(ctx, o.pts, INK);
  if (far) return;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  // rim light inset from the lit contour, broken in two
  const rim1 = [], rim2 = [];
  for (let i = 0; i <= 5; i++) { const s = 0.06 + i * 0.07; rim1.push(at(s, ls * 0.62)); }
  for (let i = 0; i <= 5; i++) { const s = 0.5 + i * 0.08; rim2.push(at(s, ls * 0.6)); }
  ribbonPath(ctx, rim1, (tt) => 1.2 * Math.sin(Math.PI * tt) + 0.1);
  ribbonPath(ctx, rim2, (tt) => 1.0 * Math.sin(Math.PI * tt) + 0.1);
  // tendon / bone line down the middle
  ribbonPath(ctx, [at(0.18, ls * 0.05), at(0.45, ls * -0.12), at(0.8, ls * 0.0)], (tt) => 0.8 * Math.sin(Math.PI * tt));
  // white wrap strokes curling in from the lit edge
  wrapHatchPath(ctx, A, B, rA * 0.9, rB * 0.9, { from: 0.12, to: 0.88, side: ls, step: 4.2, reach: 0.38, width: 0.85, seed, curl: 0.5 });
  ctx.fill();
  for (let k = 0; k < cuffs; k++) {
    const s0 = cuffs === 1 ? 0.78 + hashNoise(seed + 3, k) * 0.08 : 0.2 + k * 0.5 + hashNoise(seed + 3, k) * 0.1;
    const band = [];
    for (let j = 0; j < 3; j++) {
      const ss = s0 + j * 4.2 / o.len;
      const e1 = at(ss, 1, 1.1), e2 = at(ss + 5 / o.len, -1, 1.1);
      band.push([e1, [lerp(e1[0], e2[0], 0.5) + ux * 3, lerp(e1[1], e2[1], 0.5) + uy * 3], e2]);
    }
    ctx.fillStyle = BONE;
    ctx.beginPath();
    for (const [e1, c, e2] of band) ribbonPath(ctx, quad(e1, c, e2, 5), () => 3.6);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (const [e1, c, e2] of band) {
      const pts = quad(e1, c, e2, 5);
      ribbonPath(ctx, pts.map((p) => [p[0] + ux * 1.9, p[1] + uy * 1.9]), (tt) => 0.4 + 1.1 * Math.abs(tt - (ls > 0 ? 0 : 1)));
      ribbonPath(ctx, pts.map((p) => [p[0] - ux * 1.9, p[1] - uy * 1.9]), () => 0.5);
    }
    ctx.fill();
    // torn end
    if (hashNoise(seed + 5, k) > 0.25) {
      const root = band[2][ls > 0 ? 2 : 0];
      const sw = Math.sin(t / 380 + seed) * 3;
      const tip = [root[0] + sw - 4, root[1] + 16 + hashNoise(seed + 6, k) * 14];
      ctx.fillStyle = BONE;
      ctx.beginPath(); spikePath(ctx, root, tip, 4.2, 3); ctx.fill();
      contour(ctx, spikePts(root, tip, 3, 7).concat([[root[0] + 2, root[1]]]), { min: 0.4, max: 1.2, closed: false, breaks: false });
    }
  }
}

function blackJoint(ctx, p, r, spikeDir, spikeLen, far) {
  if (!far) { ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(p[0], p[1], r + 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
  if (!far) {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ribbonPath(ctx, [[p[0] - r * 0.6, p[1] - r * 0.5], [p[0], p[1] - r * 0.78], [p[0] + r * 0.6, p[1] - r * 0.5]], (tt) => 1.1 * Math.sin(Math.PI * tt));
    ctx.fill();
  }
  if (spikeDir) {
    // a bone spur with an ink contour
    const base = add(p, spikeDir, r * 0.3), tip = add(p, spikeDir, r + spikeLen);
    ctx.fillStyle = INK;
    ctx.beginPath(); spikePath(ctx, base, add(tip, spikeDir, 1.5), r * 1.35, spikeLen * 0.2); ctx.fill();
    ctx.fillStyle = BONE;
    ctx.beginPath(); spikePath(ctx, add(base, spikeDir, 1.5), add(tip, spikeDir, -2), r * 0.85, spikeLen * 0.2); ctx.fill();
  }
}

// ---- bone arms --------------------------------------------------------------------

const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };

// Upper arm: a gaunt humerus with knobbed ends, its top hidden in a torn black sleeve
// whose hem breaks into dry-brush tatters hanging with gravity.
function upperArm(ctx, A, { far = false, seed = 1, t = 0 } = {}) {
  const { sh, elbow } = A;
  const ud = unit(sh, elbow), un = [-ud[1], ud[0]];
  // round 9: a humerus, not a tube: a thin bowed shaft between a ball head and a broad
  // two-lobed condyle at the elbow, a black tendon strand lying along its shadow side
  {
    const A0 = add(sh, ud, -4), B0 = add(elbow, ud, 2);
    const nnu = [-ud[1], ud[0]];
    const sdk = nnu[0] * LIGHT[0] + nnu[1] * LIGHT[1] > 0 ? -1 : 1; // toward the shadow
    if (!far) {
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ribbonPath(ctx, [A0, lerpP(A0, B0, 0.5), B0], (tt) => 13 + 4 * Math.sin(Math.PI * tt)); ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ribbonPath(ctx, [add(A0, nnu, sdk * 3), add(lerpP(A0, B0, 0.45), nnu, sdk * 8), add(B0, nnu, sdk * 3)], (tt) => 2 + 7 * Math.pow(Math.sin(Math.PI * Math.min(1, tt * 1.05)), 0.8));
    ctx.fill();
    if (!far) {
      // a paper gap round the bone so it lifts off the sinew cord behind it
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ribbonPath(ctx, [add(A0, ud, 3), add(lerpP(A0, B0, 0.5), nnu, 1.6 * sdk), add(B0, ud, -4)], (tt) => 10 + 2 * Math.cos(Math.PI * 2 * tt)); ctx.fill();
    }
    bone(ctx, A0, B0, { r: 3.4, rA: 7.0, rB: 8.2, bow: 1.6 * sdk, far, seed: seed + 9, hatchStep: 2.0 });
  }
  // sleeve
  const L0 = Math.hypot(elbow[0] - sh[0], elbow[1] - sh[1]) * 0.36;
  const end = add(sh, ud, L0);
  const sl = [add(add(sh, ud, -7), un, 11), add(add(sh, ud, L0 * 0.5), un, 13.5), add(end, un, 15), add(end, un, -15), add(add(sh, ud, L0 * 0.5), un, -13), add(add(sh, ud, -7), un, -10.5)];
  ctx.fillStyle = INK;
  ctx.beginPath();
  polyPath(ctx, sl);
  const down = unit([0, 0], [ud[0] * 0.45, ud[1] * 0.45 + 0.9]);
  for (let k = 0; k < 6; k++) {
    const s = k / 5 - 0.5;
    const b0 = add(add(end, un, s * 27), ud, -3);
    const L = (10 + hashNoise(seed + 40, k) * 18) * (far ? 0.7 : 1);
    const sw = Math.sin(t / 430 + k + seed) * 2;
    dryTatterPath(ctx, b0, [b0[0] + down[0] * L + sw, b0[1] + down[1] * L], 6.5, seed * 7 + k, (hashNoise(seed + 41, k) - 0.5) * 6);
  }
  ctx.fill();
  if (far) return;
  // folds in the sleeve carved in white, converging on the shoulder
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const o = (k - 1.4) * 4.6;
    const a = add(add(sh, ud, 2 + k * 2), un, o * 0.4);
    const e = add(add(end, ud, -2 - hashNoise(seed + 50, k) * 6), un, o * 1.5);
    penPath(ctx, quad(a, add(lerpP(a, e, 0.5), un, 1.5), e, 4), 0.7 + hashNoise(seed + 51, k) * 0.5, 0.4, 0.3);
  }
  ctx.fill();
}
const lerpP = (a, b, s) => [lerp(a[0], b[0], s), lerp(a[1], b[1], s)];

// Forearm (round 5): one black sinew mass over the bones, not two tubes. It swells into
// a belly on the under side and pinches into the wrist; the ulna shows as a pale ridge
// along the lit top edge under a hairline; tendons, rim light and wrap ticks are carved
// in white. An olecranon spur and a pale elbow cap overlap its root (the overlap is the
// foreshortening cue), a knot of carpal pebbles sits at the wrist.
function foreArm(ctx, A, { far = false, seed = 1 } = {}) {
  const { sh, elbow, hand } = A;
  const fd = unit(elbow, hand);
  const ud = unit(sh, elbow);
  const out = unit([0, 0], [ud[0] - fd[0], ud[1] - fd[1]]);
  // round 9: a skeletal forearm, not a tube. Two separate bones bow apart and meet again
  // at the wrist, with the black interosseous gap between them: the ulna heavy at the
  // elbow (its olecranon hooks out behind) and thin at the wrist, the radius thin at the
  // elbow and flaring into a broad knuckled end at the wrist. Black sinew strands run in
  // the gap and wrap the shafts, so the limb is bone in ink, never an even bar.
  let nn = [-fd[1], fd[0]];
  if (nn[0] * out[0] + nn[1] * out[1] < 0) nn = [-nn[0], -nn[1]]; // nn points to the ulna side
  const wr = add(hand, fd, -1);
  const L = Math.hypot(wr[0] - elbow[0], wr[1] - elbow[1]);
  const at = (s, o) => add(add(elbow, fd, s * L), nn, o);
  const sep = (s) => 4.4 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.04) / 0.9))), 0.7);
  // the black sinew underlay: wider than both bones, pinched at the wrist, with a
  // paper gap cut round it so it lifts off whatever is behind
  const under = [];
  const N = 14;
  for (let i = 0; i <= N; i++) { const s = i / N; under.push(at(s, sep(s) + 5.2 - 2.2 * s)); }
  for (let i = N; i >= 0; i--) { const s = i / N; under.push(at(s, -sep(s) - 4.6 - 0.6 * Math.sin(Math.PI * s))); }
  if (!far) {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    const halo = under.map((p, i) => { const s = i <= N ? i / N : (2 * N + 1 - i) / N; const sd = i <= N ? 1 : -1; return add(p, nn, sd * (1.6 + 1.2 * Math.sin(Math.PI * s))); });
    polyPath(ctx, halo);
    ctx.fill();
  }
  olecranon(ctx, add(elbow, nn, 2), out, fd, { far, seed });
  ctx.fillStyle = INK;
  ctx.beginPath(); polyPath(ctx, spline(under, 2, true)); ctx.fill();
  if (far) {
    bone(ctx, at(0.02, 3.2), at(0.97, 2.0), { r: 2.2, rA: 5.2, rB: 2.8, bow: 1.6, far: true, seed: seed + 1 });
    bone(ctx, at(0.08, -2.6), at(0.99, -2.4), { r: 2.0, rA: 3.0, rB: 4.6, bow: -1.6, far: true, seed: seed + 2 });
    return;
  }
  // ulna, then the radius laid over it at the wrist end
  bone(ctx, at(0.02, 3.4), at(0.96, 2.2), { r: 2.4, rA: 6.0, rB: 3.0, bow: 2.2, seed: seed + 1, hatchStep: 2.1 });
  bone(ctx, at(0.09, -2.8), at(0.995, -2.4), { r: 2.2, rA: 3.3, rB: 5.2, bow: -2.0, seed: seed + 2, hatchStep: 2.1 });
  // sinew in the gap: two black strands crossing the interosseous space, tapering
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const s0 = 0.22 + k * 0.2 + hashNoise(seed, k) * 0.05;
    ribbonPath(ctx, [at(s0, sep(s0) * 0.9), at(s0 + 0.07, 0), at(s0 + 0.14, -sep(s0 + 0.14) * 0.9)], (tt) => 1.3 * Math.sin(Math.PI * tt) + 0.1);
  }
  ctx.fill();
  // carpal knot at the wrist: small separate bones, each with its own contour
  const cp = [];
  for (let k = 0; k < 4; k++) {
    const c = add(at(1.0, (k - 1.5) * 2.7), fd, 3 + (k % 2) * 2.2);
    cp.push(pebblePts(c, 2.3, 1.8, Math.atan2(fd[1], fd[0]), seed * 5 + k));
  }
  pebbles(ctx, cp);
}

// ---- hands ----------------------------------------------------------------------

// phalanges are collected and inked in two batched fills: an ink underlay a little
// wider than the bone (its outline), then the pale bone with knobbed ends
function phalanx(list, A, B, r, seed, far) {
  list.push([A, B, r, far]);
}
function inkPhalanges(ctx, list) {
  const body = (A, B, r, pad) => {
    const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    ribbonPath(ctx, [A, m, B], (t, i) => (i === 1 ? r * 2 : r * 3.4) + pad);
  };
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const [A, B, r] of list) body(A, B, r, 1.5);
  ctx.fill();
  for (const far of [true, false]) {
    ctx.fillStyle = far ? '#d6cfbb' : BONE;
    ctx.beginPath();
    for (const [A, B, r, f] of list) if (f === far) body(A, B, r, 0);
    ctx.fill();
  }
}

// Skeletal clawed hand: black sinew webbing the bones, knuckled pale phalanges laid
// over it, long curved talons. dir = forearm direction at the wrist; curl 0 open .. 1 fist.
function boneHand(ctx, wrist, dir, curl, seed, { palmSide = 1, spread = 1 } = {}) {
  const d = dir, n = [-d[1] * palmSide, d[0] * palmSide];
  const F = [];
  for (let f = 0; f < 4; f++) {
    const off = (f - 1.5) * 3.7;
    const mc0 = add(add(wrist, d, 2.5), n, off * 0.4);
    const k0 = add(add(wrist, d, 17.5 + (f === 1 || f === 2 ? 2 : 0)), n, off * 1.05);
    let a = Math.atan2(d[1], d[0]) + (f - 1.5) * 0.15 * spread;
    const lens = [13.5, 11, 8.5]; // too long: the fingers outreach the palm twice over
    const pts = [k0];
    let p = k0;
    for (let s2 = 0; s2 < 3; s2++) {
      a += curl * (0.72 + 0.2 * hashNoise(seed, f * 3 + s2)) * -palmSide + (s2 === 0 ? 0.12 * (1 - curl) * palmSide : 0);
      p = [p[0] + Math.cos(a) * lens[s2], p[1] + Math.sin(a) * lens[s2]];
      pts.push(p);
    }
    F.push({ mc0, pts, a });
  }
  {
    const tb = add(add(wrist, d, 4), n, 6);
    let a = Math.atan2(d[1], d[0]) + 0.85 * palmSide;
    const p1 = [tb[0] + Math.cos(a) * 11, tb[1] + Math.sin(a) * 11];
    a -= (0.6 + curl * 0.8) * palmSide;
    const p2 = [p1[0] + Math.cos(a) * 9.5, p1[1] + Math.sin(a) * 9.5];
    F.push({ mc0: add(wrist, d, 1), pts: [tb, p1, p2], a, thumb: true });
  }
  // white gap, then black sinew: palm wedge + finger webbing
  const palm = [add(wrist, n, 5), add(add(F[0].pts[0], n, -2.2), d, 1), add(add(F[3].pts[0], n, 2.2), d, 1), add(wrist, n, -5.5)];
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const f of F) ribbonPath(ctx, [f.mc0, ...f.pts], (t) => 7 - t * 3);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  polyPath(ctx, palm);
  for (const f of F) ribbonPath(ctx, [f.mc0, ...f.pts], (t) => 4.6 - t * 2.4);
  ctx.fill();
  // knuckled bones over the sinew: metacarpals faint, phalanges bright
  const ph = [];
  for (let i = 0; i < F.length; i++) {
    const f = F[i];
    if (!f.thumb) phalanx(ph, add(f.mc0, d, 2), add(f.pts[0], d, -1.5), 0.8, seed + 30 + i, true);
    for (let k = 0; k < f.pts.length - 1; k++) {
      const A = f.pts[k], B = f.pts[k + 1];
      const u = unit(A, B);
      phalanx(ph, add(A, u, 0.8), add(B, u, -0.8), 0.95 - k * 0.12, seed + 40 + i * 4 + k, false);
    }
  }
  inkPhalanges(ctx, ph);
  // talons: long, curved, solid black hooks; their curve is carved by one white
  // highlight on the lit side that tapers out before the point
  const tal = F.map((f) => {
    const tipA = f.a - 0.45 * palmSide;
    const p = f.pts[f.pts.length - 1];
    return quillPts(p, Math.PI / 2 - tipA, f.thumb ? 13 : 19, 0, 5.5 * palmSide, 7);
  });
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const tp of tal) ribbonPath(ctx, tp, (t) => 6.4 * Math.pow(1 - t, 0.85) + 1.2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const tp of tal) ribbonPath(ctx, tp, (t) => 4.6 * Math.pow(1 - t, 0.85) + 0.3);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const tp of tal) {
    const hl = tp.slice(1, -2).map((p, i, a) => {
      const q = tp[i + 2], o = tp[i];
      const dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1;
      const w = (4.6 * Math.pow(1 - (i + 1) / (tp.length - 1), 0.85)) * 0.22 * palmSide;
      return [p[0] - dy / l * w, p[1] + dx / l * w];
    });
    ribbonPath(ctx, hl, (t) => 0.9 * Math.sin(Math.PI * (0.1 + t * 0.9)) + 0.05);
  }
  ctx.fill();
}


// ---- wings ----------------------------------------------------------------------

// A wing is a bony arm (two pale bones, a clawed wrist) with long quill feathers hanging
// from it and a row of short covert quills over their roots. Folded, the elbow stands
// up behind the shoulders and the feathers hang down the back like a cloak.
function wings(ctx, R, pose, t, far) {
  const sp = clamp(pose.wings, 0, 1.4);
  const s1 = clamp(sp, 0, 1);
  const wrap = pose.wrap || 0;
  const base = far ? R.P(0.92, -12) : R.P(0.84, -34); // round 23: rooted off the back, a paper gap between wing and spine
  const fl = Math.sin(t / 340) * 0.03 * (1 + sp);
  let a1 = lerp(-2.5, -2.05, s1) + (far ? 0.18 : 0) + fl;
  let a2 = lerp(-0.42, -2.55, s1) + (far ? 0.2 : 0) + fl * 2 - R.drag * 0.1;
  if (wrap) { a1 = lerp(a1, -2.9, wrap); a2 = lerp(a2, 0.9, wrap); }
  if (pose.wingBack) { a1 = lerp(a1, -1.9, pose.wingBack); a2 = lerp(a2, -1.75, pose.wingBack); }
  // tells (owner: tells): fold 0..1 closes the whole wing into a short tight mass hanging
  // straight down the back, so the weapon arm is the big shape of every wind-up
  const fold = pose.fold || 0;
  if (fold) { a1 = lerp(a1, -2.75, fold); a2 = lerp(a2, -0.12, fold); }
  const sc = (far ? 0.85 : 1) * (1 - 0.3 * fold) * (1 - 0.42 * (pose.tuck || 0)); // tells: tuck shrinks the folded wing tight to the back
  const elbow = add(base, dirv(a1), 60 * sc);
  const wrist = add(elbow, dirv(a2), (66 + 26 * s1) * sc);
  const along = (u, k0, k1) => (u < 0.45 ? add(base, [elbow[0] - base[0], elbow[1] - base[1]], k0 + u * k1) : add(elbow, [wrist[0] - elbow[0], wrist[1] - elbow[1]], (u - 0.45) / 0.55));
  const angAt = (u, lo, hi) => {
    let ang = lerp(lerp(lo[0], lo[1], u), lerp(hi[0], hi[1], u), s1);
    if (wrap) ang = lerp(ang, 0.35 + u * 0.7, wrap);
    if (pose.wingBack) ang = lerp(ang, lerp(-1.05, -2.25, u), pose.wingBack); // tells: fan swept straight back
    if (fold) ang = lerp(ang, -0.08 - u * 0.22, fold);
    return ang - R.drag * 0.1;
  };
  // round 9: the wing is a cape of a dozen long black blades laid like slates. Roots and
  // angles both advance monotonically along the wing arm and every blade bows the same
  // way, so no two centre lines cross; they overlap, and the overlap is carved in white.
  const N = far ? 6 : 9;
  const fs = far ? 50 : 0;
  const prim = [];
  for (let i = 0; i < N; i++) {
    const h = (k) => hashNoise(400 + fs + k * 31, i);
    const u = i / (N - 1); // 0 = by the body, 1 = wingtip
    const ang = angAt(u, [-0.1, -0.5], [-0.55, -2.75]) + (h(2) - 0.5) * 0.05 + Math.sin(t / 330 + i * 0.8) * 0.015 * (1 + sp);
    // round 25: uneven lengths, so the trailing edge is a ragged rhythm, not a comb
    const len = sc * (lerp(140, 236, Math.sin(u * Math.PI * 0.8)) + sp * 45) * (0.72 + h(4) * 0.5) * (i % 3 === 1 ? 0.82 : 1);
    const w = sc * (far ? 24 : 31 + h(7) * 11) * Math.sqrt(Math.min(1.2, len / (200 * sc)));
    // round 25: blades that SWEEP (a brush arc hooking at the end), never ruled chords
    prim.push({ root: along(u, 0.3, 1.5), ang, len: len * 0.88, bend: 0.2 + 0.08 * h(5) + s1 * 0.03, hook: 0.15 + 0.14 * h(11), w, asym: 0.42, seed: 420 + i + fs, u,
      split: !far && h(8) > 0.62 ? (h(9) > 0.5 ? 1 : -1) : 0, carveW: 1.7, carve: h(10) > 0.4 ? 1 : 0, rim: 0, dryGap: 0.58 });
  }
  // round 32: the near wing is ONE black mass carved by a few designed white lines, not
  // every blade outlined, barbed and split (a scatter of slivers at 1x). Alternate blades
  // carry a bold quill shaft (pressed at the root, tapering, one break), three others a
  // long tapered lit-edge fold where they lie over the next, two near the arm a group
  // of wrapping hatch; no barbs, the tip splits only on the longest two.
  if (!far) {
    prim.forEach((G, i) => {
      G.carve = 1;
      G.barbs = 0;
      G.streaks = i >= N - 2 ? 1 : 0;
      G.splits = i >= N - 3 ? 1 : 0;
      // only the outer half of a primary shows past the secondaries: carve it there
      G.shaft = i % 2 === 0 || i === N - 2 ? 1 : 0;
      G.shaftW = 1.5;
      G.shaftSpan = [0.4, 0.68, 0.93];
      G.edge = i % 2 === 1 ? 1 : 0;
      G.edgeSpan = [0.45 + 0.05 * (i % 3), 0.86];
      G.edgeK = 1.3;
      G.hatch = 0;
      G.hatchFrom = 0.26; G.hatchTo = 0.62; G.hatchW = 1.3; G.hatchGap = 16;
    });
  }
  // black envelope behind the roots: the blades read as one design mass, broken into
  // separate points only toward their ends
  {
    const env = [base, elbow, wrist];
    for (let i = N - 1; i >= 0; i--) {
      const G = prim[i];
      const d = dirv(G.ang);
      env.push(add(G.root, d, G.len * 0.66)); // round 25: one big unbroken black mass
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    polyPath(ctx, spline(env, 2, true));
    ctx.fill();
  }
  massBlades(ctx, prim.slice().reverse(), { carve: far ? 0 : 2, edgeW: 1.55, paper: far ? 2.4 : 3.2, needle: 1.7, dry: 1, hatch: far ? 0 : 1, fillFirst: !far });
  if (far) return;
  // secondaries: a middle tier of shorter, broader blades over the primaries' roots
  const sec = [];
  const NS = 5;
  for (let i = 0; i < NS; i++) {
    const h = (k) => hashNoise(520 + k * 23, i);
    const u = (i + 0.2) / NS;
    const ang = angAt(u, [-0.16, -0.55], [-0.6, -2.6]) + (h(2) - 0.5) * 0.05 + Math.sin(t / 300 + i) * 0.015 * (1 + sp);
    const len = sc * (78 + 50 * Math.sin(u * Math.PI * 0.9) + h(3) * 18 + sp * 20);
    sec.push({ root: along(u, 0.2, 1.5), ang, len, bend: 0.15 + 0.05 * h(5), hook: 0.08 + 0.06 * h(8), w: sc * (24 + h(6) * 7), asym: 0.42, seed: 530 + i, carveW: 1.4,
      barbs: 0, streaks: 0, splits: 0, shaft: 1, shaftW: 1.45 - 0.08 * i, shaftSpan: [0.12 + 0.03 * (i % 2), 0.5, 0.86], edge: i % 2 ? 1 : 0, edgeSpan: [0.32, 0.82], edgeK: 1.3, hatch: 0 });
  }
  massBlades(ctx, sec.reverse(), { carve: 2, edgeW: 1.2, needle: 1.6, dry: 0.8, hatch: 0.9, fillFirst: true });
  // the wing arm: a black bony ridge (no pale tubes) with a lit white edge and knobs
  {
    const arm = spline([add(base, dirv(a1), -6), lerpP(base, elbow, 0.5), elbow, lerpP(elbow, wrist, 0.5), wrist], 3);
    ctx.fillStyle = PAPER;
    ctx.beginPath(); ribbonPath(ctx, arm, (tt) => (11 - 5 * tt) * sc + 3.2); ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); ribbonPath(ctx, arm, (tt) => (11 - 5 * tt) * sc * (1 + 0.35 * Math.exp(-Math.pow((tt - 0.5) / 0.08, 2))));
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    const lsd = (() => { const d = unit(base, elbow); return -d[1] * LIGHT[0] + d[0] * LIGHT[1] > 0 ? 1 : -1; })();
    const rim = arm.map((p, i) => {
      const q = arm[Math.min(arm.length - 1, i + 1)], o = arm[Math.max(0, i - 1)];
      const d = unit(o, q), tt = i / (arm.length - 1);
      const off = (11 - 5 * tt) * sc * 0.28 * lsd;
      return [p[0] - d[1] * off, p[1] + d[0] * off];
    });
    const m = Math.floor(rim.length * 0.5);
    ribbonPath(ctx, rim.slice(1, m - 1), (tt) => 1.5 * Math.sin(Math.PI * tt) + 0.05);
    ribbonPath(ctx, rim.slice(m + 1, rim.length - 2), (tt) => 1.1 * Math.sin(Math.PI * tt) + 0.05);
    ctx.fill();
  }
  // coverts: a short overlapping row over the arm, like scales
  const cov = [];
  const NC = 5;
  for (let i = 0; i < NC; i++) {
    const h = (k) => hashNoise(470 + k * 17, i);
    const u = (i + 0.3) / NC;
    const ang = angAt(u, [-0.3, -0.6], [-0.7, -2.5]) + (h(2) - 0.5) * 0.06;
    // round 32: only every other covert keeps its lit edge, so the row over the arm reads
    // as one scalloped black band with a few carved overlaps, not five outlined scales
    cov.push({ root: along(u, 0.12, 1.6), ang, len: sc * (34 + h(3) * 26), bend: 0.08, w: sc * (17 + h(6) * 5), asym: 0.42, seed: 480 + i, carveW: 1.1, rim: 0, edge: i % 2 ? 1 : 0, edgeK: 1.25 });
  }
  massBlades(ctx, cov.reverse(), { carve: 1, edgeW: 1.1 });
  // round 32: the deepest pocket of the wing, under the arm where the blades leave the
  // back, crosshatched in white and feathered out (no edge)
  {
    const G = prim[1]; // the blade next to the body
    const c = add(lerpP(base, wrist, 0.45), dirv(G.ang), 36 * sc);
    const da = Math.PI / 2 - G.ang;
    crossPocket(ctx, c, { rx: 27 * sc, ry: 13 * sc, ang: da, a1: da + 0.45, a2: da - 0.95, pitch: 3.4, w: 1.7, seed: 77 });
  }

  // hooked thorns standing up off the wing arm break the top of the silhouette
  const th = [];
  for (let i = 0; i < 3; i++) {
    const h = (k) => hashNoise(590 + k * 7, i);
    const u = (i + 0.3 + h(1) * 0.3) / 3.2;
    const up = Math.PI - 0.9 + u * 0.5 - s1 * 0.6;
    th.push({ root: along(u, 0.25, 1.5), ang: up, len: sc * (20 + h(3) * 22), bend: -0.12, w: sc * (8 + h(6) * 3), asym: 0.5, seed: 600 + i, carve: 0,
      prof: (tt) => Math.pow(1 - tt, 1.0) });
  }
  // elbow spur and wrist claws
  th.push({ root: add(elbow, dirv(a1), -2), ang: a1 + 0.15, len: 32 * sc, bend: -0.1, w: 10 * sc, seed: 611, carve: 0, prof: (tt) => Math.pow(1 - tt, 0.95) });
  th.push({ root: wrist, ang: a2 + 0.25, len: 26 * sc, bend: 0.14, w: 7 * sc, seed: 612, carve: 0, prof: (tt) => Math.pow(1 - tt, 0.95) });
  th.push({ root: wrist, ang: a2 - 0.45, len: 15 * sc, bend: -0.1, w: 5 * sc, seed: 613, carve: 0, prof: (tt) => Math.pow(1 - tt, 0.95) });
  inkBlades(ctx, th, { halo: 1.4 });
}

// round 11: carved quill feathers (paint/parts.js feather): fp/ff primaries (near/far,
// 200 long), fs secondaries (120), fc coverts (60). Never mirrored, so every feather's
// narrow lit vane and white shaft sit on the same side and the barbs rake the same way.
const FEATHER = { fp: [5, 200], ff: [3, 200], fs: [3, 120], fc: [3, 60], fk: [3, 120] };
function feathers(ctx, list, kind) {
  const [nv, L] = FEATHER[kind];
  for (const G of list) {
    const v = Math.abs(G.seed * 7 + 3) % nv;
    const wk = 0.8 + hashNoise(G.seed, 91) * 0.45;
    drawPart(ctx, `${kind}${v}`, G.root[0], G.root[1], -G.ang, (G.w / 22) * wk, G.len / L);
  }
}

// painted wing rags (paint/parts.js rag0..4): root on the wing arm, hanging along `ang`
function rags(ctx, list, far = false) {
  for (const G of list) {
    const v = Math.abs(G.seed * 7 + 3) % 5;
    const wk = 0.72 + hashNoise(G.seed, 91) * 0.6; // strips of uneven width, so the fan has a rhythm
    drawPart(ctx, `${far && has('ragt0') ? 'ragt' : 'rag'}${v}`, G.root[0], G.root[1], -G.ang, (G.w / 26) * wk * (v % 2 ? -1 : 1), G.len / 200);
  }
}

// ---- coat, chest, ornaments ------------------------------------------------------

// leg joints (shared by the legs and by the coat, which drapes over the near knee)
// round 18: a two-bone IK leg with a raised heel. The near foot is planted under the
// knee, the far foot set well BEHIND the hip and the leg driven back to it, so the line
// of action runs skull (forward) -> hump (back) -> hip and knee (forward) -> the planted
// rear foot (back): an S, not a post. The knee always breaks forward.
const THIGH = 90, SHIN = 84, ANKLE_H = 24; // round 25: long gaunt digitigrade legs
function legGeom(R, pose, side, far) {
  const { H } = R;
  const step = R.walkPh != null ? Math.sin(R.walkPh + (side > 0 ? 0 : Math.PI)) * 24 : 0;
  const lift = R.walkPh != null ? Math.max(0, Math.cos(R.walkPh + (side > 0 ? 0 : Math.PI))) * 9 : 0;
  const hip = [H[0] + (far ? -6 : 4), H[1] + 6];
  const ankle = [(far ? -54 : 24) + step, -ANKLE_H - lift]; // round 23: a wider stance, the near foot planted ahead of the hip
  let dx = ankle[0] - hip[0], dy = ankle[1] - hip[1];
  let d = Math.hypot(dx, dy);
  const dmax = THIGH + SHIN - 0.5;
  if (d > dmax) { ankle[0] = hip[0] + dx / d * dmax; ankle[1] = hip[1] + dy / d * dmax; dx = ankle[0] - hip[0]; dy = ankle[1] - hip[1]; d = dmax; }
  const a = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const ux = dx / d, uy = dy / d;
  const c = Math.cos(-a), sn = Math.sin(-a);
  const knee = [hip[0] + THIGH * (ux * c - uy * sn), hip[1] + THIGH * (ux * sn + uy * c)];
  const foot = [ankle[0], ankle[1] + ANKLE_H];
  return { foot, hip, knee, ankle };
}

// A white fold carved into black: hairline at both ends, swelling in the middle.
// Built along a cubic so it bends; `brk` (0..1) cuts a gap in it.
function foldPath(ctx, a, c1, c2, e, w, brk = -1, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]]);
  }
  const prof = (t) => w * 2.1 * Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.8) * (1 - 0.35 * t) + 0.04;
  if (brk > 0 && brk < 1) {
    const k = Math.round(brk * n);
    const A = pts.slice(0, Math.max(2, k)), B = pts.slice(Math.min(n - 1, k + 1));
    ribbonPath(ctx, A, (t) => prof(t * (k / n)));
    if (B.length > 1) ribbonPath(ctx, B, (t) => prof((k + 1) / n + t * (1 - (k + 1) / n)));
  } else ribbonPath(ctx, pts, prof);
}

function coat(ctx, R, pose, t, b) {
  const { H, P } = R;
  const hemY = -(40 - pose.crouch * 22);
  const sway = Math.sin(t / 520) * 3 - R.drag * 10;
  const K = legGeom(R, pose, 1, false).knee;
  const kx = K[0] + 7, ky = K[1];
  const backHem = [H[0] - 58 + sway, hemY - 6];
  const frontHem = [Math.min(kx - 4, H[0] + 44) + sway * 0.5, hemY + 3];
  const belt = P(0.06, 0);
  // silhouette: hunched back, cinched waist, the skirt flaring off the hip and
  // tenting forward over the near knee before it falls to the hem
  const back = spline([P(1.07, -2), P(0.98, -26), P(0.82, -40), P(0.6, -37), P(0.36, -27), P(0.14, -23), P(-0.06, -33),
    [H[0] - 48 + sway * 0.6, lerp(H[1], hemY, 0.5)], backHem], 3);
  const hem = [];
  const NT = 9;
  for (let i = 0; i <= NT; i++) {
    const u = i / NT;
    const x = lerp(backHem[0], frontHem[0], u) + (hashNoise(30, i) - 0.5) * 6;
    const y = lerp(backHem[1], frontHem[1], u) + Math.sin(u * Math.PI) * 7 + hashNoise(31, i) * 9;
    hem.push([x, y]);
  }
  const front = spline([frontHem, [kx + 1 + sway * 0.3, lerp(ky, hemY, 0.5)], [kx + 3, ky + 4], [kx, ky - 10], [lerp(kx, belt[0] + 20, 0.55), lerp(ky, belt[1], 0.55)],
    P(0.06, 19), P(0.32, 14), P(0.56, 17), P(0.8, 22), P(0.99, 17), P(1.08, 9)], 3);
  const outline = back.concat(hem, front);
  // a white gap cut between the coat's back and the black wing behind it, widest at
  // the hump, vanishing toward the hip so the two masses still lock together
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  {
    // two brush strokes, not one even ribbon: the first swells hard over the hump and
    // tapers to a point; the second lands again lower down, thinner, and dies out
    const bk = back.slice(1, Math.floor(back.length * 0.82));
    const m = Math.floor(bk.length * 0.5);
    ribbonPath(ctx, bk.slice(0, m), (tt) => 0.3 + 6.5 * Math.pow(Math.sin(Math.PI * Math.min(1, tt * 1.4) * 0.5), 1.3) * Math.pow(1 - tt, 0.9));
    ribbonPath(ctx, bk.slice(m + 2), (tt) => 0.1 + 3.2 * Math.pow(Math.sin(Math.PI * tt), 1.2) * (1 - 0.6 * tt));
  }
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  polyPath(ctx, outline);
  // the hem rags: single tapered strokes of very different lengths, trailing back
  for (let i = 0; i < 12; i++) {
    const u = (i + 0.15 + hashNoise(32, i) * 0.7) / 12;
    const x = lerp(backHem[0], frontHem[0], u);
    const y = lerp(backHem[1], frontHem[1], u) + Math.sin(u * Math.PI) * 7 + 2;
    const h = hashNoise(33, i);
    const L = (h < 0.35 ? 8 + h * 18 : 18 + h * 30) * (1 - pose.crouch * 0.5);
    const tip = [x - 6 - R.drag * 9 + Math.sin(t / 400 + i) * 2.5 + (hashNoise(36, i) - 0.5) * 9, Math.min(-1, y + L)];
    const w = 5 + hashNoise(34, i) * 6;
    if (hashNoise(37, i) > 0.55) dryTatterPath(ctx, [x, y - 8], tip, w, 700 + i, (hashNoise(35, i) - 0.5) * 9);
    else spikePath(ctx, [x, y - 8], tip, w, (hashNoise(35, i) - 0.5) * 10, 8);
  }
  ctx.fill();

  // ---- folds carved in white ----
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  const knot = P(0.05, 14), knotB = P(0.03, -16); // tension points at the chained belt
  // pulls: from the belt diagonally down onto the knee, fanning, each bowing outward
  // all of them leave one knot on the belt and spread as they reach the knee
  const pulls = [[0.0, 1.55, -1, 0], [0.3, 1.0, -1, 3], [0.55, 1.35, 0.55, -2], [0.85, 0.85, -1, 5]];
  pulls.forEach(([f, w, brk, o], i) => {
    const a = add(knot, [-f * 10 - 2, 3 + o * 0.4]);
    const e = [kx - 4 - f * 20 + hashNoise(60, i) * 3, ky - 13 + f * 22];
    const c1 = [lerp(a[0], e[0], 0.25) - 3 - f * 4, lerp(a[1], e[1], 0.25) + 4];
    const c2 = [lerp(a[0], e[0], 0.7) - f * 9, lerp(a[1], e[1], 0.7) + 2 - f * 3];
    foldPath(ctx, a, c1, c2, e, w, brk);
  });
  // the back of the skirt is pulled the other way, off the back of the belt
  foldPath(ctx, add(knotB, [0, 4]), add(knotB, [-6, 18]), add(knotB, [-10, 34]), add(knotB, [-14, 52]), 0.9, 0.5);
  // the break at the knee: hooked folds wrapping the front of the kneecap
  for (let k = 0; k < 3; k++) {
    const r = 9 + k * 6;
    const a = [kx - 3 - k * 2, ky - r * 0.9], e = [kx - 4 - k * 3, ky + r * 0.85];
    foldPath(ctx, a, [kx + r * 0.25, ky - r * 0.45], [kx + r * 0.2, ky + r * 0.4], e, 1.25 - k * 0.25, -1, 8);
  }
  // white hatch wrapping the lit top of the knee
  for (let k = 0; k < 5; k++) {
    const a0 = -2.2 + k * 0.22;
    const p0 = [kx - 6 + Math.cos(a0) * 15, ky + Math.sin(a0) * 13];
    const p1 = [kx - 6 + Math.cos(a0 + 0.25) * 9, ky + Math.sin(a0 + 0.25) * 8];
    ribbonPath(ctx, [p0, [lerp(p0[0], p1[0], 0.5) + 1, lerp(p0[1], p1[1], 0.5)], p1], (tt) => 0.75 * (1 - tt) + 0.04);
  }
  // below the knee: the cloth falls in long folds that drift back with the drag and
  // break before the hem
  const falls = [[[kx - 6, ky + 16], 0.35, 1.3, 0.7], [[kx - 15, ky + 8], 0.15, 1.0, -1], [[kx - 26, ky + 4], 0.55, 0.85, 0.6]];
  falls.forEach(([a, u, w, brk], i) => {
    const e = [lerp(backHem[0], frontHem[0], 1 - u * 0.35) - 6 - R.drag * 6, lerp(backHem[1], frontHem[1], 1 - u * 0.35) + 2 - hashNoise(62, i) * 6];
    foldPath(ctx, a, [a[0] - 1, lerp(a[1], e[1], 0.35)], [e[0] + 3, lerp(a[1], e[1], 0.75)], e, w, brk);
  });
  // the back skirt: one long gravity fold off the hip, and a short pinch near the hem
  {
    const a = P(-0.02, -30), e = [backHem[0] + 16 + sway * 0.4, backHem[1] + 2];
    foldPath(ctx, a, [a[0] - 6, lerp(a[1], e[1], 0.35)], [e[0] + 2, lerp(a[1], e[1], 0.7)], e, 0.9, 0.62);
    const m = [lerp(backHem[0], frontHem[0], 0.38), lerp(backHem[1], frontHem[1], 0.38) + 4];
    foldPath(ctx, [m[0] + 4, m[1] - 34], [m[0] + 1, m[1] - 22], [m[0] - 2, m[1] - 10], [m[0] - 4, m[1]], 0.8);
  }
  // round 7: the skirt below the chain belt. Gravity folds hang off the belt as
  // white lines carved into the black with a brush: each leaves the belt as a point,
  // swells to ~4 px a fifth of the way down under pen pressure and then tapers out to
  // a point well before the hem; some break and land again, a few fork. Their spacing
  // is uneven: they bunch where the belt knot pulls the cloth and open out behind.
  {
    const brush = (pts, w) => ribbonPath(ctx, pts, (tt) => w * Math.pow(Math.min(1, tt / 0.16), 0.6) * Math.pow(1 - tt, 1.25) + 0.03);
    const bL = P(0.03, -24), bR = P(0.07, 12);
    const gf = [0.03, 0.12, 0.2, 0.27, 0.38, 0.47, 0.55, 0.64, 0.76, 0.88];
    gf.forEach((u, i) => {
      const h = (k) => hashNoise(880 + k * 13, i);
      const a = [lerp(bL[0], bR[0], u), lerp(bL[1], bR[1], u) + 5 + h(1) * 4];
      const reach = 0.62 + h(2) * 0.36;
      const hx = lerp(backHem[0] + 6, frontHem[0] - 10, u) + sway * 0.5 - R.drag * 5 + (h(3) - 0.5) * 8;
      const e = [lerp(a[0], hx, reach), lerp(a[1], hemY + 4, reach)];
      const c1 = [lerp(a[0], e[0], 0.3) + (h(4) - 0.5) * 14 - 3, lerp(a[1], e[1], 0.3)];
      const c2 = [lerp(a[0], e[0], 0.7) - (h(4) - 0.5) * 12 + 2, lerp(a[1], e[1], 0.7)];
      const pts = [];
      for (let j = 0; j <= 8; j++) {
        const tt = j / 8, v = 1 - tt;
        pts.push([v * v * v * a[0] + 3 * v * v * tt * c1[0] + 3 * v * tt * tt * c2[0] + tt * tt * tt * e[0],
          v * v * v * a[1] + 3 * v * v * tt * c1[1] + 3 * v * tt * tt * c2[1] + tt * tt * tt * e[1]]);
      }
      const w = 3.4 + h(5) * 2.2;
      if (h(6) < 0.4) {
        // broken: the brush lifts and lands again lower down, lighter
        brush(pts.slice(0, 5), w);
        ribbonPath(ctx, pts.slice(6), (tt) => w * 0.6 * Math.sin(Math.PI * tt) * (1 - 0.5 * tt) + 0.03);
      } else brush(pts, w);
      if (h(7) > 0.7) {
        // a fork: a thinner companion splitting off the main fold
        const f0 = pts[3], f1 = [pts[6][0] + 5 + h(8) * 4, pts[6][1] + 2];
        brush(quad(f0, [lerp(f0[0], f1[0], 0.4) + 2, lerp(f0[1], f1[1], 0.5)], f1, 6), w * 0.55);
      }
    });
    // compression under the belt links: short V-wedges where the cloth bunches
    for (let i = 0; i < 6; i++) {
      const u = 0.08 + i * 0.16 + (hashNoise(890, i) - 0.5) * 0.05;
      const top = [lerp(bL[0], bR[0], u), lerp(bL[1], bR[1], u) + 3];
      const L = 7 + hashNoise(891, i) * 7;
      const tip = [top[0] + (hashNoise(892, i) - 0.5) * 3, top[1] + L];
      ribbonPath(ctx, [[top[0] - 3, top[1]], [lerp(top[0] - 3, tip[0], 0.5), lerp(top[1], tip[1], 0.5)], tip], (tt) => 2.6 * Math.pow(1 - tt, 1.1) + 0.03);
      ribbonPath(ctx, [[top[0] + 3, top[1]], [lerp(top[0] + 3, tip[0], 0.5) + 0.5, lerp(top[1], tip[1], 0.55)], [tip[0] + 1, tip[1] - 2]], (tt) => 1.6 * Math.pow(1 - tt, 1.1) + 0.03);
    }
  }
  // rim light: a broken hairline inset from the lit front edge (shadow side stays solid)
  {
    const rim = front.slice(1, Math.floor(front.length * 0.42)).map((p) => [p[0] - 2.4, p[1] + 0.6]);
    for (let s = 0; s < rim.length - 3; s += 3) {
      if (hashNoise(43, s) > 0.62) continue;
      ribbonPath(ctx, rim.slice(s, s + 4), (tt) => 1.15 * Math.sin(Math.PI * tt) + 0.05);
    }
  }
  // the coat over the hunch: two folds wrapping the back, one dragging off the shoulder
  for (let k = 0; k < 2; k++) {
    const inset = 7 + k * 9;
    foldPath(ctx, P(0.99 - k * 0.04, -22 + inset * 0.5), P(0.86, -38 + inset), P(0.6, -36 + inset), P(0.4 + k * 0.05, -27 + inset * 0.8), k ? 1.0 : 1.4, k ? 0.5 : -1);
  }
  foldPath(ctx, P(0.88, -6), P(0.7, -12), P(0.45, -10), P(0.2, -18), 0.9, 0.4);
  // round 8: the back of the coat is cloth, not a cut-out. Folds drop off the hump in
  // sheaves: each sheaf is one main fold with two or three hairline companions of
  // falling length beside it (the sheen on black cloth), some broken, some hooking
  // round toward the belt where the chain cinches it.
  {
    const sheaves = [
      [0.95, -30, 0.62, -34, 0.3, -30, 1.3, 3],
      [0.9, -18, 0.58, -24, 0.24, -22, 1.1, 2],
      [0.78, -6, 0.52, -12, 0.2, -8, 0.9, 3],
      [0.62, -36, 0.4, -32, 0.12, -38, 1.0, 2],
    ];
    sheaves.forEach(([s0, o0, s1, o1, s2, o2, w, m], i) => {
      for (let j = 0; j < m; j++) {
        const h = (k) => hashNoise(940 + i * 7 + k, j);
        const off = j * (2.6 + h(1) * 1.6) * (i % 2 ? 1 : -1);
        const cut = 1 - j * (0.2 + h(2) * 0.12);
        const a = P(s0 - j * 0.02, o0 + off * 0.5), c1 = P(lerp(s0, s1, 0.5), o1 + off), c2 = P(lerp(s1, s2, 0.4), o1 + off * 1.1 + (o2 - o1) * 0.4);
        const e = P(lerp(s0, s2, cut), lerp(o0, o2, cut) + off * 1.2);
        foldPath(ctx, a, c1, c2, e, j ? w * (0.45 + 0.15 * h(3)) : w, h(4) < 0.35 ? 0.4 + h(5) * 0.3 : -1, 9);
      }
    });
    // the cinch: above the chain belt the coat is gathered, so folds converge on the
    // belt knot from the back and the ribs in long tapering diagonals
    const kn = P(0.07, 6);
    for (let j = 0; j < 6; j++) {
      const h = (k) => hashNoise(975 + k, j);
      const st = P(0.34 + j * 0.05 + h(1) * 0.04, -34 + j * 7 + h(2) * 4);
      const e = add(kn, [(h(3) - 0.5) * 8, -2 - h(4) * 4]);
      const c1 = lerpP(st, e, 0.35), c2 = lerpP(st, e, 0.7);
      foldPath(ctx, st, add(c1, [-2, 3]), add(c2, [-1, 2]), e, j % 2 ? 0.75 : 1.15, h(5) < 0.3 ? 0.55 : -1, 9);
    }
    // short hooked pinches where the hump rolls over (crescent wrinkles)
    for (let k = 0; k < 4; k++) {
      const c = P(0.9 - k * 0.07, -26 + k * 4 + hashNoise(960, k) * 4);
      const r = 5 + hashNoise(961, k) * 4;
      ribbonPath(ctx, [[c[0] - r, c[1] - r * 0.3], [c[0] - r * 0.2, c[1] + r * 0.35], [c[0] + r * 0.7, c[1] + r * 0.1]], (tt) => 1.3 * Math.sin(Math.PI * tt) * (1 - 0.4 * tt) + 0.03);
    }
  }
  // a few dry-brush scrapes rising from the hem, in two clumps
  const scr = [];
  for (let i = 0; i < 7; i++) {
    const u2 = (i < 4 ? 0.12 + i * 0.035 : 0.62 + (i - 4) * 0.04) + hashNoise(46, i) * 0.02;
    const x = lerp(backHem[0], frontHem[0], u2), y = lerp(backHem[1], frontHem[1], u2) + Math.sin(u2 * Math.PI) * 7 + 3;
    const L = 6 + hashNoise(47, i) * 12;
    scr.push([[x, y], [x - 1.5 + hashNoise(49, i) * 2, y - L], 0.5 + hashNoise(50, i) * 0.5]);
  }
  scrapesPath(ctx, scr);
  ctx.fill();

  ribs(ctx, R, t);

  return { hemY, backHem, frontHem };
}

function ribs(ctx, R, t) {
  const { P, u, fw } = R;
  // the coat hangs open over a gaunt, pale chest that curves with the hunch
  const chest = spline([P(1.0, 15), P(0.84, 21), P(0.62, 18), P(0.44, 10), P(0.4, -4), P(0.6, -11), P(0.84, -9), P(0.98, -4)], 3, true);
  poly(ctx, chest, BONE);
  ctx.save();
  ctx.beginPath(); polyPath(ctx, chest); ctx.clip();
  ctx.fillStyle = INK;
  ctx.beginPath();
  // the back of the cage turns away into one black mass; its edge is not a line but
  // the ends of the ribs breaking out of it
  polyPath(ctx, spline([P(1.02, -20), P(1.0, -3), P(0.9, -5.5), P(0.8, -1), P(0.7, -4.5), P(0.6, 0), P(0.5, -2), P(0.38, 3), P(0.36, -20)], 2));
  // under the cage the belly sinks into a black hollow
  polyPath(ctx, spline([P(0.55, -4), P(0.53, 8), P(0.47, 16), P(0.38, 14), P(0.38, -6)], 2, true));
  // rib gaps: black sickles sweeping down to the sternum, unevenly spaced, the lower
  // (floating) ribs stopping short so the cage reads as bone, not a ladder
  const RS = [[0.935, 1.0, 4.4], [0.85, 1.0, 4.0], [0.775, 0.9, 3.8], [0.705, 0.7, 3.4], [0.645, 0.48, 2.8]];
  RS.forEach(([s, reach, w], k) => {
    const a2 = P(s + 0.01, -4), c = P(s + 0.05, 6 + reach * 4), e = P(s - 0.05 - reach * 0.04, -3 + reach * 20);
    ribbonPath(ctx, quad(a2, c, e, 9), (tt) => w * Math.pow(1 - tt, 0.9) + 0.15);
  });
  // short hatch on each rib's shadowed lower edge, wrapping the bone
  RS.forEach(([s, reach], k) => {
    for (let j = 0; j < 3; j++) {
      const tt = 0.2 + j * 0.22;
      if (tt > reach) continue;
      const q = quad(P(s + 0.01 - 0.045, -4), P(s + 0.05 - 0.045, 6 + reach * 4), P(s - 0.05 - reach * 0.04 - 0.045, -3 + reach * 20), 9)[Math.round(tt * 9)];
      ribbonPath(ctx, [q, add(q, u, 3.4)], (t2) => 1.0 * (1 - t2) + 0.05);
    }
  });
  // sternum: a pale blade with a heavy black edge on its shadow side
  penPath(ctx, [P(0.98, 13), P(0.86, 16), P(0.74, 16.5), P(0.66, 14)], 2.4, 0.2, 0.4);
  ctx.fill();
  // white carved into the black back: the lit crest of each rib as it turns away
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  RS.forEach(([s], k) => ribbonPath(ctx, [P(s - 0.035, -16), P(s - 0.03, -9), P(s - 0.04, -3)], (tt) => 1.1 * Math.sin(Math.PI * tt) + 0.05));
  ctx.fill();
  ctx.restore();
  contour(ctx, chest, { min: 0.6, max: 3, seed: 77 });
  // ragged lapel edge of the coat over the back of the chest
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const s = 0.96 - k * 0.11;
    const base = P(s, -12 + Math.sin(k) * 1.5);
    const tip = add(add(base, fw, 9 + hashNoise(78, k) * 6), u, -6);
    spikePath(ctx, add(base, fw, -3), tip, 7, 2);
  }
  ctx.fill();
}

function miniSkull(ctx, c, r, rot) {
  ctx.save();
  ctx.translate(c[0], c[1]);
  ctx.rotate(rot);
  const cran = [[-r, -0.2 * r], [-0.95 * r, -0.85 * r], [-0.5 * r, -1.25 * r], [0.5 * r, -1.25 * r], [0.95 * r, -0.85 * r], [r, -0.2 * r], [0.7 * r, 0.45 * r], [0.55 * r, 1.1 * r], [-0.55 * r, 1.1 * r], [-0.7 * r, 0.45 * r]];
  const sp = spline(cran, 3, true);
  ctx.fillStyle = INK; ctx.beginPath(); polyPath(ctx, sp.map(([x, y]) => [x * 1.16 + 0.15, y * 1.12 + 0.45])); ctx.fill();
  ctx.fillStyle = BONE; ctx.beginPath(); polyPath(ctx, sp); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath();
  ctx.ellipse(-0.42 * r, -0.2 * r, 0.33 * r, 0.3 * r, 0.3, 0, Math.PI * 2);
  ctx.ellipse(0.42 * r, -0.2 * r, 0.33 * r, 0.3 * r, -0.3, 0, Math.PI * 2);
  ctx.moveTo(0, 0.18 * r); ctx.lineTo(0.14 * r, 0.42 * r); ctx.lineTo(-0.14 * r, 0.42 * r); ctx.closePath();
  ctx.rect(-0.46 * r, 0.62 * r, 0.92 * r, 0.12 * r);
  for (let k = -1; k <= 1; k++) ctx.rect(k * 0.24 * r - 0.04 * r, 0.6 * r, 0.08 * r, 0.42 * r);
  ctx.fill();
  ctx.fillStyle = HI; ctx.beginPath(); ctx.arc(-0.3 * r, -0.85 * r, Math.max(0.4, 0.17 * r), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function beltAndCharms(ctx, R, pose, t) {
  const { P } = R;
  // chain belt: distinct links
  const a = P(0.05, -27), b = P(0.09, 20);
  const N = 9;
  const dx = (b[0] - a[0]) / N, dy = (b[1] - a[1]) / N;
  const ang = Math.atan2(dy, dx);
  // round 14: a studded black girdle under the chain: a band with a row of bone studs,
  // each a separate closed shape with a shade crescent and a dot of shine
  {
    const gd = unit(P(0.02, -29), P(0.1, 22)), gn = [-gd[1], gd[0]];
    const g0 = add(P(0.02, -29), gn, -7.5), g1 = add(P(0.1, 22), gn, -7.5); // above the chain
    const band = [add(g0, gn, -4.5), add(g1, gn, -4.5), add(g1, gn, 4.5), add(g0, gn, 4.5)];
    poly(ctx, band, INK);
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ribbonPath(ctx, [add(g0, gn, -3.6), add(g1, gn, -3.6)], (tt) => 0.7 * Math.sin(Math.PI * (0.04 + tt * 0.92)));
    ribbonPath(ctx, [add(g0, gn, 3.7), add(g1, gn, 3.7)], (tt) => 0.55 * Math.sin(Math.PI * (0.04 + tt * 0.92)));
    ctx.fill();
    const SN = 13, studs = [];
    for (let i = 0; i < SN; i++) studs.push([add(lerpP(g0, g1, (i + 0.5) / SN), gn, 0.2), 1.55 + (i % 3 === 1 ? 0.45 : 0)]);
    ctx.fillStyle = BONE;
    ctx.beginPath(); for (const [[x, y], r] of studs) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); } ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); for (const [[x, y], r] of studs) { ctx.moveTo(x + r * 0.9, y + 0.2); ctx.ellipse(x + 0.2, y + 0.35, r * 0.85, r * 0.5, 0, 0, Math.PI); } ctx.fill();
    ctx.fillStyle = HI;
    ctx.beginPath(); for (const [[x, y], r] of studs) { ctx.moveTo(x - r * 0.3 + 0.5, y - r * 0.35); ctx.arc(x - r * 0.3, y - r * 0.35, 0.5, 0, Math.PI * 2); } ctx.fill();
    // round 27: three small skulls riveted over the girdle, each its own closed bone
    // shape: ink rim heavier below, two solid black sockets, a nasal notch, a row of
    // teeth and a dot of shine on the brow
    [[0.18, 3.6], [0.5, 4.3], [0.82, 3.4]].forEach(([u, r], j) => {
      miniSkull(ctx, add(lerpP(g0, g1, u), gn, 1.2), r, Math.atan2(gd[1], gd[0]) - Math.PI / 2 + (j - 1) * 0.12);
    });
  }
  const L = [];
  for (let i = 0; i <= N; i++) L.push([a[0] + dx * i, a[1] + dy * i + Math.sin((i / N) * Math.PI) * 3, ang]);
  linksPath(ctx, L);
  // a second, finer strand: small bone beads in a shallow loop under the chain, with
  // bone teeth hung off it on short cords
  {
    const a3 = P(0.035, -24), e3 = P(0.08, 18);
    const c3 = [(a3[0] + e3[0]) / 2 + Math.sin(t / 820 + 1) * 1.2, Math.max(a3[1], e3[1]) + 15];
    const pts = quad(a3, c3, e3, 22).slice(1, -1);
    ctx.fillStyle = INK;
    ctx.beginPath(); pts.forEach(([x, y], i) => { const r = (i % 4 === 0 ? 2.2 : 1.6) + 0.7; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }); ctx.fill();
    ctx.fillStyle = BONE;
    ctx.beginPath(); pts.forEach(([x, y], i) => { const r = i % 4 === 0 ? 2.2 : 1.6; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }); ctx.fill();
    ctx.fillStyle = HI;
    ctx.beginPath(); pts.forEach(([x, y], i) => { const r = i % 4 === 0 ? 2.2 : 1.6; const hx = x - r * 0.35, hy = y - r * 0.4; ctx.moveTo(hx + 0.5, hy); ctx.arc(hx, hy, 0.5, 0, Math.PI * 2); }); ctx.fill();
    // teeth: tapered bone spikes hanging off every fourth bead, uneven lengths
    ctx.fillStyle = INK;
    ctx.beginPath();
    pts.forEach(([x, y], i) => { if (i % 4 || i === 0) return; const L2 = 7 + hashNoise(91, i) * 7; spikePath(ctx, [x, y + 1.5], [x + 0.6, y + 2 + L2 + 1.2], 4.6, 0.4); });
    ctx.fill();
    ctx.fillStyle = BONE;
    ctx.beginPath();
    pts.forEach(([x, y], i) => { if (i % 4 || i === 0) return; const L2 = 7 + hashNoise(91, i) * 7; spikePath(ctx, [x, y + 2], [x + 0.6, y + 2 + L2], 2.8, 0.4); });
    ctx.fill();
  }
  // paper talismans hanging from the belt
  const strips = [[-14, 40, 0], [-2, 52, 1], [10, 36, 2]];
  for (const [o, len, i] of strips) {
    const top = P(0.04, o);
    const sw = Math.sin(t / 650 + i * 1.7) * 0.07 - R.drag * 0.25 + 0.06;
    const d = [Math.sin(sw), Math.cos(sw)];
    const n = [-d[1], d[0]];
    const w = 7.5;
    const bot = add(top, d, len);
    const pts = [add(top, n, w / 2), add(top, n, -w / 2), add(add(bot, n, -w / 2), d, -2), add(bot, n, -1), add(add(bot, n, w / 2), d, 2)];
    poly(ctx, pts, PAPER);
    contour(ctx, pts, { min: 0.5, max: 1.6, seed: 60 + i });
    // brush-written glyphs
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let g = 0; g < 4; g++) {
      const c = add(top, d, 8 + g * (len - 14) / 4);
      const h1 = hashNoise(70 + i, g), h2 = hashNoise(80 + i, g);
      penPath(ctx, [add(c, n, -2.4), add(add(c, n, 0), d, h1 * 1.5), add(add(c, n, 2.4), d, 0.6)], 1.3, 0.2, 0.5);
      penPath(ctx, [add(add(c, n, -0.5 + h2), d, -2), add(add(c, n, h2 - 0.8), d, 3.5)], 1.1, 0.1, 0.6);
    }
    ctx.fill();
    if (i === 1) {
      ctx.fillStyle = RED;
      const c = add(top, d, len - 9);
      ctx.fillRect(c[0] - 2.4, c[1] - 2.4, 4.8, 4.8);
    }
  }
  // round 12: a swag of bone beads looped under the chain: each a separate closed bead
  // (ink ring, pale bone, a shade crescent and one dot of shine), graded in size
  {
    const a2 = P(0.045, -25), e2 = P(0.075, 14);
    const c2 = [(a2[0] + e2[0]) / 2 + Math.sin(t / 700) * 1.5, Math.max(a2[1], e2[1]) + 36];
    const pts = quad(a2, c2, e2, 12).slice(1, -1);
    const rad = pts.map((_, i) => 2.4 + 1.2 * Math.sin(Math.PI * (i + 0.5) / pts.length));
    ctx.fillStyle = INK;
    ctx.beginPath(); pts.forEach(([x, y], i) => { const r = rad[i] + 0.9; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }); ctx.fill();
    ctx.fillStyle = BONE;
    ctx.beginPath(); pts.forEach(([x, y], i) => { const r = rad[i]; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }); ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath(); pts.forEach(([x, y], i) => { const r = rad[i]; ctx.moveTo(x + r * 0.95, y + 0.3); ctx.ellipse(x, y + 0.3, r * 0.95, r * 0.8, 0, 0, Math.PI); ctx.ellipse(x - 0.3, y - 0.2, r * 0.8, r * 0.45, 0, Math.PI, 0, true); }); ctx.fill();
    ctx.fillStyle = HI;
    ctx.beginPath(); pts.forEach(([x, y], i) => { const r = rad[i] * 0.3; const hx = x - rad[i] * 0.35, hy = y - rad[i] * 0.4; ctx.moveTo(hx + r, hy); ctx.arc(hx, hy, r, 0, Math.PI * 2); }); ctx.fill();
    // a pendant skull-bead at the bottom of the swag
    const m = pts[pts.length >> 1];
    const sk = [m[0] + 0.5, m[1] + 6.5];
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(sk[0], sk[1], 4.6, 5.0, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BONE; ctx.beginPath(); ctx.ellipse(sk[0], sk[1] - 0.3, 3.6, 4.0, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath();
    ctx.ellipse(sk[0] - 1.4, sk[1] - 0.6, 1.1, 1.3, 0, 0, Math.PI * 2); ctx.ellipse(sk[0] + 1.4, sk[1] - 0.6, 1.1, 1.3, 0, 0, Math.PI * 2);
    ctx.rect(sk[0] - 1.6, sk[1] + 2.2, 3.2, 0.7); ctx.fill();
  }
  // inkwell on a short chain at the back hip
  const hk = P(0.02, -21);
  const sw = Math.sin(t / 560) * 0.1 - R.drag * 0.3;
  ctx.save();
  ctx.translate(hk[0], hk[1]);
  ctx.rotate(sw);
  ctx.fillStyle = BONE;
  for (let i = 0; i < 3; i++) { ctx.fillRect(-0.8, 2 + i * 4, 1.6, 2.6); }
  const bottle = [[-3, 14], [3, 14], [4, 17], [7, 20], [7, 30], [5.5, 32], [-5.5, 32], [-7, 30], [-7, 20], [-4, 17]];
  poly(ctx, bottle, BONE);
  poly(ctx, [[-7, 23], [7, 23], [7, 30], [5.5, 32], [-5.5, 32], [-7, 30]], INK);
  contour(ctx, bottle, { min: 0.6, max: 1.8, seed: 91, breaks: false });
  ctx.fillStyle = PAPER;
  ctx.beginPath(); penPath(ctx, [[-5, 20.5], [-5.2, 29]], 1.3, 0.2, 0.3); ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(-3.4, 11.5, 6.8, 3.2);
  ctx.restore();
}

function beads(ctx, R) {
  const { P } = R;
  const a = P(1.02, -13), c = P(0.62, 30), e = P(1.02, 15);
  const pts = quad(a, c, e, 15);
  const list = pts.slice(1, -1);
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const [x, y] of list) { ctx.moveTo(x + 3.3, y); ctx.arc(x, y, 3.3, 0, Math.PI * 2); }
  ctx.fill();
  ctx.fillStyle = BONE;
  ctx.beginPath();
  for (const [x, y] of list) { ctx.moveTo(x + 2.3, y); ctx.arc(x, y, 2.3, 0, Math.PI * 2); }
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const [x, y] of list) { ctx.moveTo(x + 1.6, y + 1); ctx.arc(x + 0.4, y + 1, 1.2, 0, Math.PI); }
  ctx.fill();
  // pendant: a small bone nib
  const m = pts[8];
  const tip = [m[0] + 1, m[1] + 15];
  ctx.fillStyle = INK;
  ctx.beginPath(); spikePath(ctx, [m[0], m[1] + 1], [tip[0], tip[1] + 1.5], 9.5, 0); ctx.fill();
  ctx.fillStyle = BONE;
  ctx.beginPath(); spikePath(ctx, [m[0], m[1] + 2], tip, 7, 0); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(m[0] + 0.3, m[1] + 6, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ribbonPath(ctx, [[m[0] + 0.4, m[1] + 7], tip], (tt) => 0.8 * (1 - tt) + 0.1); ctx.fill();
}

// ---- quill ruff -------------------------------------------------------------------

function ruff(ctx, R, pose, t) {
  const { P } = R;
  const n = 9;
  const flare = clamp(pose.wings, 0, 1.3) * 0.25;
  // round 9: a stiff collar of black blades fanning up and back behind the skull, roots
  // and angles both advancing round the collar so none cross; long ones behind
  const Q = [];
  for (let i = 0; i < n; i++) {
    const h = (k) => hashNoise(55 + k * 13, i);
    const u = i / (n - 1);
    const root = P(lerp(0.9, 1.06, Math.sin(u * Math.PI * 0.5)), lerp(-28, 4, u));
    const a = lerp(-1.8, -0.45, u) + (h(2) - 0.5) * 0.06 + Math.sin(t / 380 + i) * 0.02 - flare * (1 - u) - pose.lean * 0.4;
    const len = (22 + 46 * Math.sin(Math.PI * (0.12 + u * 0.72))) * (0.85 + h(4) * 0.3) * (u > 0.85 ? 0.7 : 1);
    Q.push({ root, ang: Math.PI - a, len, bend: -0.1 - 0.05 * h(5), w: 11 + h(7) * 5, asym: 0.45, seed: 560 + i, carveW: 1.1, rim: 0, len2: len });
  }
  Q.sort((p, q) => q.len2 - p.len2);
  if (true) {
    massBlades(ctx, Q.map((q) => ({ ...q, w: q.w * 1.2 })), { carve: 1, edgeW: 1.0 });
  } else if (has('fk0')) {
    // round 11: the collar is the same carved quill feathers as the wing, smaller, so the
    // mass behind the skull reads as layered feathers, each with its white shaft
    feathers(ctx, Q.map((q) => ({ ...q, w: q.w * 1.25 })), 'fk');
  } else if (has('ragc0')) {
    // the collar's blades have no paper gaps between them: one black spiky mass
    for (const q of Q) {
      const v = [0, 2, 4][Math.abs(q.seed) % 3];
      drawPart(ctx, `ragc${v}`, q.root[0], q.root[1], -q.ang, (q.w * 1.3 / 26) * (q.seed % 2 ? -1 : 1), q.len / 200);
    }
  } else if (has('rag0')) rags(ctx, Q.map((q) => ({ ...q, w: q.w * 1.25 })));
  else inkBlades(ctx, Q, { halo: 1.5 });
}

// ---- head -----------------------------------------------------------------------

// Profile skull (faces +x), origin at the top of the neck. A long, back-swept cranium
// (smooth dome) and an ANGULAR face: a sharp brow shelf jutting over a deep socket, a
// cheekbone point with a notch under it, a beaked muzzle, then a long narrow jaw that
// runs down to a tapered point of a chin and turns back at a hard jaw corner.
const CRANIUM = [[-9, 5], [-21, -5], [-36, -15], [-50, -27], [-55, -39], [-47, -51], [-29, -58], [-8, -61], [9, -57], [20, -49]];
const FACE = [[27, -42.5], [34, -39.5], [23.5, -36], [21.5, -29.5], [29.5, -23.5], [24, -20], [32.5, -14.5], [34.5, -6.5], [29, -3.5], [32, 4], [30.5, 13], [26.5, 22], [21.5, 32], [15, 25], [8, 18], [0, 14], [-8, 14.5], [-10, 8]];
const SKULL = spline(CRANIUM, 3).slice(0, -1).concat(FACE);

function headPoint(R, p, hs) {
  const c = Math.cos(R.headRot), s = Math.sin(R.headRot);
  return [R.neck[0] + (p[0] * c - p[1] * s) * hs, R.neck[1] + (p[0] * s + p[1] * c) * hs];
}

function ribbons(ctx, R, pose, t) {
  const hs = HS;
  const root = headPoint(R, [-36, -30], hs);
  for (let i = 0; i < 3; i++) {
    const len = 96 + i * 26;
    const pts = [root];
    for (let k = 1; k <= 7; k++) {
      const u = k / 7;
      const wave = Math.sin(t / 420 + u * 4.5 + i * 1.3) * 11 * u;
      pts.push([root[0] - 10 - u * len * (0.55 + i * 0.08) - R.drag * 22 * u + wave * 0.4, root[1] + u * len * (0.85 - i * 0.12) + wave]);
    }
    const sp = spline(pts, 2);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ribbonPath(ctx, sp, (tt) => 5.5 - tt * 1.5 + Math.sin(tt * 9 + i) * 1.2);
    ctx.fill();
    // forked bookmark end
    const e = sp[sp.length - 1], q = sp[sp.length - 3];
    const dx = e[0] - q[0], dy = e[1] - q[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    ctx.beginPath();
    spikePath(ctx, [e[0] + nx * 1.5, e[1] + ny * 1.5], [e[0] + dx / l * 9 + nx * 4, e[1] + dy / l * 9 + ny * 4], 3, 0);
    spikePath(ctx, [e[0] - nx * 1.5, e[1] - ny * 1.5], [e[0] + dx / l * 9 - nx * 4, e[1] + dy / l * 9 - ny * 4], 3, 0);
    ctx.fill();
    // a white fold line carved down each ribbon
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    penPath(ctx, sp.slice(3, 9).map((p) => [p[0] + 0.8, p[1]]), 0.9, 0.3, 0.4);
    ctx.fill();
  }
}

// The skull and its horns never change in the head's own frame (only the ink tear
// and the pupil do), so they are inked once into a bitmap and stamped each frame.
const HEAD_BOX = [-132, -122, 176, 162]; // x, y, w, h in head units
function headArt(g) {
  // round 27: horns swept back off the cranium, black, each ringed by CROSS-CONTOUR
  // arcs carved in white (heavy where they leave the shadowed underside, dying to a
  // point toward the lit top, spaced unevenly and closing up toward the tip), a broken
  // rim of light along the top edge, and a needle tip
  const horns = [
    { pts: quillPts([-14, -58], Math.PI + 1.05, 108, -18, -32, 22), w: 22, rings: 5, seed: 31 },
    { pts: quillPts([-32, -52], Math.PI + 1.35, 82, -10, -19, 18), w: 17, rings: 4, seed: 32 },
    { pts: quillPts([-46, -40], Math.PI + 1.7, 52, -5, 10, 14), w: 12, rings: 3, seed: 33 },
  ];
  const hw = (h) => (tt) => h.w * Math.pow(Math.sin(Math.min(1, tt / 0.08 * 0.5 + 0.5) * Math.PI / 2), 0.7) * Math.pow(1 - tt, 0.9) + 0.04;
  g.fillStyle = PAPER;
  g.beginPath();
  for (const h of horns) ribbonPath(g, h.pts, (tt) => hw(h)(tt) + 4.2 * (1 - tt));
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  for (const h of horns) ribbonPath(g, h.pts, hw(h));
  g.fill();
  const frame = (h, u) => {
    const P = spline(h.pts, 1);
    const n = h.pts.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f)), r = f - i;
    const p = lerpP(h.pts[i], h.pts[i + 1], r);
    const d = unit(h.pts[i], h.pts[i + 1]);
    return { p, d, nr: [-d[1], d[0]], w: hw(h)(u) / 2 };
  };
  g.fillStyle = PAPER;
  g.beginPath();
  horns.forEach((h) => {
    // which side of the horn faces the light (up): its normal with negative y
    const f0 = frame(h, 0.3), up = f0.nr[1] < 0 ? 1 : -1;
    for (let k = 0; k < h.rings; k++) {
      const u = 0.06 + 0.42 * Math.pow((k + 0.45 * hashNoise(h.seed, k)) / h.rings, 1.25);
      const { p, d, nr, w } = frame(h, u);
      if (w < 1.2) continue;
      // from the shadow edge across the form, bowing toward the tip (a ring on a cone)
      const e0 = add(p, nr, -up * w * 0.92);
      const reach = 1.2 + 0.4 * hashNoise(h.seed + 1, k);
      const m1 = add(add(p, nr, -up * w * (0.92 - reach * 0.6)), d, w * 0.38);
      const e1 = add(add(p, nr, -up * w * (0.92 - reach * 1.15)), d, w * 0.5);
      ribbonPath(g, quad(e0, m1, e1, 6), (tt) => Math.min(w * 0.42, 0.55 + w * 0.13) * Math.pow(1 - tt, 1.1) + 0.06);
    }
    // the lit top edge: one long highlight riding just inside the top contour, swelling
    // over the curve of the horn and dying to a needle well short of the tip, broken once
    const rim = [];
    for (let k = 1; k < h.pts.length - 2; k++) {
      const u = k / (h.pts.length - 1);
      const { p, nr, w } = frame(h, u);
      rim.push(add(p, nr, up * w * (0.5 - 0.25 * u)));
    }
    const cut = Math.floor(rim.length * (0.3 + 0.1 * hashNoise(h.seed, 9)));
    ribbonPath(g, rim.slice(0, cut), (tt) => (h.w * 0.07 + 0.3) * Math.sin(Math.PI * Math.min(1, tt * 1.05 + 0.03)) + 0.05);
    ribbonPath(g, rim.slice(cut + 1), (tt) => (h.w * 0.13 + 0.5) * Math.pow(Math.sin(Math.PI * Math.min(1, tt * 0.9 + 0.05)), 0.8) * (1 - tt * 0.6) + 0.05);
  });
  g.fill();

  const sk = SKULL;
  // a white gap around the skull lifts it off whatever is behind
  // round 29: pushed back and down, away from the light, so it parts the skull from the
  // black ruff and horns behind it but never doubles the lit brow and crown (where the
  // contour pass cuts the skull's own outline to a hairline over a rim of light)
  // round 34: not a uniform 10 px keyline: a brushed paper gap that swells to ~13 where
  // the skull meets the black behind it and pinches to a hairline in places, so the
  // figure is parted from itself by paper the way a pen leaves it, not by an outline
  g.save();
  g.translate(-4, 3.4);
  g.fillStyle = PAPER;
  g.beginPath();
  {
    const loop = sk.concat([sk[0]]);
    ribbonPath(g, loop, (tt, i) => {
      const n = 0.5 + 0.5 * Math.sin(tt * 19.0 + 2.2 * Math.sin(tt * 7.0 + 1.3));
      return 1.2 + 11.5 * Math.pow(n, 1.6) * (0.75 + 0.25 * Math.sin(tt * 43));
    });
  }
  g.fill();
  g.restore();
  poly(g, sk, BONE);
  // round 27: the skull rebuilt as designed bone PLANES and solid black cavities. Light
  // from up-front: crown, brow shelf, cheekbone, zygomatic arch, muzzle and chin are
  // clean bone; the back of the cranium, the temple hollow, the huge orbit, the nasal
  // aperture, the hollow under the arch and the jaw's underside are solid ink; the dome
  // turns into its shadow through short cross-contour hatch, and the teeth are separate
  // closed shapes, each with its own glint.
  g.save();
  g.beginPath(); polyPath(g, sk); g.clip();
  const blob = (pts, k = 3, color = INK) => { g.fillStyle = color; g.beginPath(); polyPath(g, spline(pts, k, true)); g.fill(); };
  const taper = (pts, w, color = INK, p = 1.0) => { g.fillStyle = color; g.beginPath(); ribbonPath(g, pts, (tt) => w * Math.pow(1 - tt, p) + 0.08); g.fill(); };
  const swellL = (pts, w, color = INK) => { g.fillStyle = color; g.beginPath(); ribbonPath(g, pts, (tt) => w * Math.pow(Math.sin(Math.PI * tt), 0.8) + 0.06); g.fill(); };
  // 1. the occipital mass with a clean S terminator
  const TERM = [[-22, -66], [-28, -57], [-33, -48], [-35, -39], [-32.5, -29], [-26, -20], [-18, -11.5], [-12.5, -3], [-11.5, 8], [-12, 20]];
  blob(TERM.concat([[-75, 20], [-75, -70]]), 3);
  // 2. cross-contour hatch: strokes leaving the terminator and wrapping over the dome
  // toward the light, bowing up with the crown; unequal lengths, each dying to a point
  g.fillStyle = INK; g.beginPath();
  const TS = spline(TERM.slice(0, 6), 6);
  const picks = [2, 5, 7, 10, 12, 15, 18, 20, 23, 26];
  picks.forEach((i, j) => {
    if (i >= TS.length - 1) return;
    const p = TS[i], q = TS[i + 1];
    const d = unit(p, q), nrm = [-d[1], d[0]];
    const fw = nrm[0] > 0 ? nrm : [-nrm[0], -nrm[1]];
    const L = [15, 9, 19, 7, 13, 17, 8, 12, 6, 10][j];
    const bow = 0.3 * (1 - i / TS.length);
    const e = add(add(p, fw, L), [0, -1], L * bow);
    const c = add(add(p, fw, L * 0.5), [0, -1], L * bow * 0.8);
    ribbonPath(g, quad(add(p, fw, -1.5), c, e, 8), (tt) => (1.1 + L * 0.05) * Math.pow(1 - tt, 1.3) + 0.04);
  });
  // a short crossing layer only in the deepest shadow pocket just behind the terminator
  for (let i = 0; i < 5; i++) {
    const y = -54 + i * 4.4, x = -32 - (i % 2) * 1.5 + Math.abs(i - 2) * 1.6;
    ribbonPath(g, quad([x + 4, y - 2.5], [x + 2, y + 0.5], [x + 3.2, y + 4.5], 4), (tt) => 0.9 * Math.pow(1 - tt, 1.1) + 0.05);
  }
  g.fill();
  // 3. the temple hollow under the temporal ridge: a tongue of black, crosshatched
  // where it meets the light so it does not end as a hard decal edge
  // round 29: not a second black almond (it read as another eye): the temporal fossa is
  // a fan of curved hatch hanging off the temporal ridge, heavy at the back where it
  // runs into the occipital shadow and shortening forward, each stroke dying to a point
  g.fillStyle = INK; g.beginPath();
  [[-33, -39.4, 10, 2.2], [-29.6, -38.8, 9, 1.9], [-26.2, -38.2, 7.6, 1.6], [-22.8, -37.4, 8.2, 1.5], [-19.4, -36.4, 6.4, 1.3], [-16, -35.4, 5.2, 1.1], [-12.6, -34.2, 3.8, 0.9], [-9.4, -33, 2.8, 0.7]].forEach(([x, y, L, w]) => {
    ribbonPath(g, quad([x, y], [x + 0.9, y + L * 0.55], [x + 2.6, y + L], 6), (tt) => w * Math.pow(1 - tt, 1.2) + 0.04);
  });
  ribbonPath(g, quad([-35, -40.6], [-20, -38.8], [-6, -33.2], 10), (tt) => 1.5 * Math.pow(Math.sin(Math.PI * tt), 0.7) * (1 - 0.5 * tt) + 0.05);
  g.fill();
  // 4. the orbit: one large solid black socket under the jutting brow shelf
  blob([[2, -40.5], [8, -46.5], [18, -47.5], [27.5, -43.5], [29, -35], [25, -27], [17, -22.5], [9, -24], [3.5, -31]], 3);
  // 5. under the arch: a black wedge, heavy behind, thinning forward to a point
  blob([[-13, -21.5], [-4, -20.6], [5, -20.4], [12, -20.8], [4, -18], [-4, -16], [-10, -15.2], [-12.8, -17]], 2);
  // 6. the nasal aperture: an inverted heart cut deep into the muzzle, with a white
  // septum spur
  blob([[22.5, -22], [27.8, -19], [31.8, -10.8], [28.2, -12.2], [25.4, -8.4], [22, -13.6]], 2);
  taper([[26.4, -10.4], [26.6, -14], [26, -17.4]], 1.0, BONE);
  // 7. the mouth: one black slot whose back corner hooks up under the cheekbone
  blob([[-4, -10], [1, -7], [8, -6.8], [20, -7.2], [32, -6.6], [31.6, 3], [29, 10], [17, 12], [6, 11], [0, 7], [-3.5, -1]], 2);
  // 8. the mandible's underside in shadow
  blob([[-13, 11.5], [-4, 12], [5, 14.8], [11.5, 19.2], [17, 24.8], [21.6, 31.5], [23, 40], [-14, 40]], 2);
  [[[-1, 12.4], [0.4, 9.4], [2.2, 7.6]], [[4.6, 14.8], [6.2, 11.8], [8.6, 10.8]], [[10.4, 18.6], [12.6, 15.4], [15.4, 13.6]], [[15.4, 23.4], [18, 19.6], [21, 17.6]]].forEach((pts, i) => taper(pts, [2.2, 1.8, 1.5, 1.1][i]));
  // round 28: the cheek turns under the zygomatic arch: a group of curved hatch hangs
  // off the black wedge into the bone of the cheek, graded, the longest at the back
  // where the face is deepest, dying to points before the mouth; a shorter group hangs
  // off the temple hollow, and a crossing layer only in the pocket behind the arch
  g.fillStyle = INK; g.beginPath();
  [[-11.6, -16.2, 7.6], [-9.2, -16.0, 6.6], [-6.6, -16.4, 7.2], [-4.0, -16.8, 5.4], [-1.4, -17.4, 4.6], [3.4, -18.4, 3.6], [5.8, -18.9, 2.8]].forEach(([x, y, L], i) => {
    ribbonPath(g, quad([x, y - 1], [x + 0.6, y + L * 0.5], [x + 1.8 + i * 0.12, y + L], 5), (tt) => (0.95 + L * 0.06) * Math.pow(1 - tt, 1.15) + 0.04);
  });
  [[-30, -31.4, 5.5], [-26.6, -30.4, 7], [-23.2, -30, 4.6], [-19.6, -30, 6], [-16, -30.8, 3.6]].forEach(([x, y, L]) => {
    ribbonPath(g, quad([x, y - 1], [x + 0.9, y + L * 0.5], [x + 2.4, y + L], 4), (tt) => 0.95 * Math.pow(1 - tt, 1.1) + 0.04);
  });
  [[-12.6, -12.6], [-10.6, -12.2], [-8.6, -12.4]].forEach(([x, y]) => {
    ribbonPath(g, quad([x - 1.6, y - 2.6], [x, y], [x + 1.8, y + 1.8], 3), (tt) => 0.7 * Math.pow(1 - tt, 1.1) + 0.04);
  });
  g.fill();
  // 9. the scowl: one heavy crease driving down the brow into the socket
  g.fillStyle = INK; g.beginPath();
  ribbonPath(g, quad([-1, -57], [6, -51], [10, -45], 5), (tt) => 0.1 + 3.2 * Math.pow(tt, 1.2));
  g.fill();
  // white carved into the black: reflected light on the jaw's back edge, a rim along
  // the back of the cranium, the zygomatic arch running back into the shadow
  swellL([[-10.5, -12], [-12.6, -2], [-12.2, 6], [-10.4, 12.5]], 1.4, BONE);
  swellL([[-36, -59], [-48, -50], [-52, -39], [-46, -27], [-34, -17.5]], 1.3, BONE);
  taper([[-14, -23.8], [-19, -23.2], [-25, -21.4]], 1.5, BONE, 1.0);
  // the teeth: separate long bone shapes standing in the black slot (upper row hangs
  // from the gum line, lower row rises from the jaw), no two alike, a glint on each
  const tooth = (x, y0, len, w, dir, lean) => {
    const tip = [x + lean, y0 + dir * len];
    return [[x - w / 2, y0 - dir * 1.5], [x + w / 2, y0 - dir * 1.5], [x + w * 0.45 + lean * 0.4, y0 + dir * len * 0.45], tip, [x - w * 0.42 + lean * 0.5, y0 + dir * len * 0.5]];
  };
  const UP = [[3, 5.2, 2.6], [6.6, 7.6, 3.0], [10.4, 10.4, 3.4], [14.2, 6.4, 3.2], [18, 11.4, 3.6], [21.8, 8, 3.4], [25.6, 12.6, 3.8], [29.4, 7.2, 3.2]];
  const LO = [[5, 6.4, 2.8], [8.8, 8.8, 3.2], [12.6, 6, 3.2], [16.4, 9.8, 3.4], [20.2, 7.2, 3.4], [24, 10.4, 3.4], [27.6, 6, 3.0]];
  const T = UP.map(([x, l, w], i) => tooth(x, -6.8, l, w, 1, 0.5 + (i % 2) * 0.4)).concat(LO.map(([x, l, w], i) => tooth(x, 10.8, l, w, -1, -0.4 + (i % 2) * 0.3)));
  g.fillStyle = BONE; g.beginPath(); for (const q of T) polyPath(g, spline(q, 2, true)); g.fill();
  g.fillStyle = INK; g.beginPath();
  // each tooth's shadow side: a hairline down its back edge, heavier toward the root
  for (const q of T) ribbonPath(g, [q[1], q[2], q[3]], (tt) => 0.9 * (1 - tt) + 0.05);
  g.fill();
  g.fillStyle = HI; g.beginPath();
  for (const q of T) { const c = lerpP(q[0], q[3], 0.32); g.moveTo(c[0] + 0.55, c[1]); g.arc(c[0], c[1], 0.55, 0, Math.PI * 2); }
  g.fill();
  // the gum lines: broken hairlines along the roots
  g.fillStyle = INK; g.beginPath();
  ribbonPath(g, [[2, -8.4], [10, -8.2], [18, -8.4]], (tt) => 0.8 * Math.sin(Math.PI * tt) + 0.05);
  ribbonPath(g, [[21, -8.3], [27, -8], [31, -7.4]], (tt) => 0.7 * Math.sin(Math.PI * tt) + 0.05);
  ribbonPath(g, [[4, 12.3], [14, 12.6], [24, 12.2]], (tt) => 0.8 * Math.sin(Math.PI * tt) + 0.05);
  g.fill();
  g.restore();

  ink(g, SUTURE);
  g.fillStyle = INK;
  g.beginPath();
  // a crack from the nib slit down into the brow
  ribbonPath(g, [[8, -54], [11.5, -50], [10, -47], [14, -44.5]], (tt) => 1.8 * (1 - tt) + 0.08);
  // pen-nib breather hole + slit on the brow
  g.moveTo(10.8, -56); g.arc(8, -56, 2.8, 0, Math.PI * 2);
  penPath(g, [[5.5, -58.5], [-1, -61.5]], 2.4, 0.1, 0.5);
  g.fill();
  // light carved by subtraction: the lit top of the brow shelf and the crest of the
  // cheekbone, each one swelling glint
  g.fillStyle = HI;
  g.beginPath();
  ribbonPath(g, [[-2, -50], [9, -50.5], [20, -48.4], [31.5, -41.6]], (tt) => 2.2 * Math.sin(Math.PI * tt) + 0.06);
  ribbonPath(g, [[-8, -24.4], [6, -23.2], [18, -23], [26, -23.6]], (tt) => 2.0 * Math.sin(Math.PI * tt) + 0.06);
  g.fill();
  contour(g, sk, { min: 0.6, max: 3.6, seed: 7 });
}

function head(ctx, R, b, t, pose) {
  const hs = HS;
  ctx.save();
  ctx.translate(R.neck[0], R.neck[1]);
  ctx.rotate(R.headRot);
  ctx.scale(hs, hs);
  stamp(ctx, 'head', HEAD_BOX, headArt, 4);
  // ink tear from the socket, running down the cheek
  const drip = (t / 1600) % 1;
  ctx.fillStyle = INK;
  ctx.beginPath();
  penPath(ctx, [[18, -24], [19, -15], [18.2, -8], [19.4, 0 + drip * 10]], 3.6, 0.05, 0.35);
  ctx.fill();
  // the eye (round 12): no staring ring. The socket stays a carved black pit and the
  // eye is a single pinprick of light deep in it (red in phase 2), with a hairline
  // glint struck off toward the brow -- the one point of light in the face
  {
    const ex = 18.5, ey = -32.5;
    ctx.fillStyle = b.phase >= 2 ? RED : HI;
    ctx.beginPath(); ctx.ellipse(ex, ey, 2.3, 1.9, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = HI;
    ctx.beginPath();
    ribbonPath(ctx, [[ex - 2.3, ey - 2], [ex - 4.6, ey - 3.8]], (tt) => 0.9 * (1 - tt) + 0.05);
    ctx.fill();
  }
  ctx.restore();
}

function neck(ctx, R) {
  // a stringy black neck thrust forward out of the hump, its vertebrae standing up
  // along the back as a row of pale spurs, the throat a tight sinew carved in white
  const a = add(R.neckBase, R.fw, -6), b = headPoint(R, [-8, 2], HS);
  blackLimb(ctx, a, b, 7.5, 4.6, { seed: 97, cuffs: 0, bulge: -0.15 });
  const d = unit(a, b), n = [d[1], -d[0]]; // n = up/back side of the neck
  const sp = [];
  for (let i = 0; i < 4; i++) {
    const p = add(lerpP(a, b, 0.12 + i * 0.24), n, 5.5 - i * 0.6);
    sp.push([p, add(add(p, n, 6.5 - i), d, -3.5)]);
  }
  ctx.fillStyle = INK;
  ctx.beginPath(); for (const [p, q] of sp) spikePath(ctx, add(p, n, -1.5), add(q, n, 1.6), 7.2 - sp.indexOf(sp.find((e) => e[0] === p)) * 0.6, 1.2); ctx.fill();
  ctx.fillStyle = BONE;
  ctx.beginPath(); for (const [p, q] of sp) spikePath(ctx, p, q, 4.4, 1.2); ctx.fill();
  // round 14: a collar of bone beads strung tight round the base of the neck, wrapping
  // it (an ellipse seen from the side: the front beads bigger, the back ones hidden),
  // each its own closed shape with a dot of shine
  const cb = lerpP(a, b, 0.18);
  const list = [];
  for (let i = 0; i < 9; i++) {
    const th = -0.4 + i * 0.42; // front of the throat round under to the nape
    const c = add(add(cb, n, Math.cos(th) * 9.5 - 1), d, Math.sin(th) * 3.2);
    list.push([c, 2.3 - Math.abs(i - 3) * 0.15]);
  }
  ctx.fillStyle = INK;
  ctx.beginPath(); for (const [[x, y], r] of list) { ctx.moveTo(x + r + 0.8, y); ctx.arc(x, y, r + 0.8, 0, Math.PI * 2); } ctx.fill();
  ctx.fillStyle = BONE;
  ctx.beginPath(); for (const [[x, y], r] of list) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); } ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); for (const [[x, y], r] of list) { ctx.moveTo(x + r * 0.9, y + 0.3); ctx.ellipse(x + 0.2, y + 0.4, r * 0.85, r * 0.5, 0, 0, Math.PI); } ctx.fill();
  ctx.fillStyle = HI;
  ctx.beginPath(); for (const [[x, y], r] of list) { ctx.moveTo(x - r * 0.3 + 0.55, y - r * 0.35); ctx.arc(x - r * 0.3, y - r * 0.35, 0.55, 0, Math.PI * 2); } ctx.fill();
}

// ---- blade ----------------------------------------------------------------------

function quillBlade(ctx, A, pose, b, t) {
  // while both hands hoist the ledger the blade is turned into a reverse grip
  const hoist = clamp(pose.book, 0, 1) - clamp(pose.book - 1, 0, 1);
  const ang = A.angle + pose.blade + hoist * 2.7;
  const d = dirv(ang);
  const n = [-d[1], d[0]];
  const G = add(A.hand, A.d2, 4);
  ctx.save();
  // pommel: a tuft of quill vanes
  const pom = add(G, d, -24);
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a2 = Math.atan2(-d[1], -d[0]) + (i - 1.5) * 0.32;
    spikePath(ctx, add(pom, d, 4), [pom[0] + Math.cos(a2) * (20 + i * 3), pom[1] + Math.sin(a2) * (20 + i * 3)], 6, (i - 1.5) * 3);
  }
  ctx.fill();
  // shaft
  const shaft = [add(add(pom, d, 2), n, 2.8), add(add(G, d, 16), n, 3.4), add(add(G, d, 16), n, -3.4), add(add(pom, d, 2), n, -2.8)];
  poly(ctx, shaft, BONE);
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const p = add(pom, d, 5 + k * 5);
    ribbonPath(ctx, [add(p, n, 3.2), add(add(p, n, -3.2), d, 3)], () => 1.6);
  }
  ctx.fill();
  contour(ctx, shaft, { min: 0.5, max: 1.6, breaks: false });
  // ferrule
  const f0 = add(G, d, 15), f1 = add(G, d, 24);
  const fer = [add(f0, n, 5), add(f1, n, 7), add(f1, n, -7), add(f0, n, -5)];
  poly(ctx, fer, INK);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (const s of [-3, 3]) { const p = add(add(f0, d, 4.5), n, s); ctx.moveTo(p[0] + 1.3, p[1]); ctx.arc(p[0], p[1], 1.3, 0, Math.PI * 2); }
  ctx.fill();
  // the nib blade: long, slightly curved, crisp
  const bw = clamp((pose.bladeW == null ? 1.5 : pose.bladeW) / 1.5, 0.8, 1.6); // tells: blade swells when cocked
  const L = RIG.blade * (1 + (bw - 1) * 0.3);
  const spine = [], edge = [], mid = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const curve = 16 * s * s;
    const c = add(add(f1, d, s * L), n, curve);
    const ws = 7.5 * bw * Math.pow(1 - s, 0.75) + 0.2;
    const we = 11 * bw * Math.pow(1 - Math.pow(s, 1.25), 0.85) + 0.2;
    spine.push(add(c, n, ws));
    edge.push(add(c, n, -we));
    mid.push(c);
  }
  const bladePts = spine.concat(edge.slice().reverse());
  poly(ctx, bladePts, PAPER);
  // polished black band hugging the spine (the reflection)
  ctx.fillStyle = INK;
  ctx.beginPath();
  const band = [];
  for (let i = 0; i <= N; i++) band.push([lerp(spine[i][0], mid[i][0], 0.35), lerp(spine[i][1], mid[i][1], 0.35)]);
  ribbonPath(ctx, band.slice(0, 12), (tt) => 5.5 * (1 - tt) + 0.2);
  // ruled hatching on the edge half (hard metal: straight, parallel)
  for (let r = 0; r < 4; r++) {
    const k = 0.45 + r * 0.13;
    const lp = [];
    for (let i = 1; i <= 10 - r * 2; i++) lp.push([lerp(mid[i][0], edge[i][0], k), lerp(mid[i][1], edge[i][1], k)]);
    if (lp.length > 1) ribbonPath(ctx, lp, (tt) => 0.75 * (1 - tt) + 0.15);
  }
  // nib slit and breather hole
  const hole = mid[2];
  ctx.moveTo(hole[0] + 3.4, hole[1]); ctx.arc(hole[0], hole[1], 3.4, 0, Math.PI * 2);
  ribbonPath(ctx, mid.slice(2), (tt) => 1.5 * (1 - tt) + 0.2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.beginPath(); ctx.arc(hole[0] - 0.8, hole[1] - 0.8, 1.1, 0, Math.PI * 2); ctx.fill();
  contour(ctx, bladePts, { min: 0.6, max: 2.2, breaks: false });
  // a glint cut out of the black band
  const g = band[4];
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a2 = k * Math.PI / 2 + 0.3;
    const len = k % 2 ? 4 : 7;
    ribbonPath(ctx, [g, [g[0] + Math.cos(a2) * len, g[1] + Math.sin(a2) * len]], (tt) => 1.6 * (1 - tt));
  }
  ctx.fill();
  ctx.restore();
  const tip = spine[N];
  // ink beading off the nib
  if (b.state === 'tell' || b.state === 'idle' || b.state === 'walk') {
    ctx.fillStyle = INK;
    for (let i = 0; i < 3; i++) {
      const ph = ((t / 700 + i / 3) % 1);
      if (ph > 0.85) continue;
      const r = 2.6 * (1 - ph * 0.5);
      const x = tip[0], y = tip[1] + ph * 70;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 2.4);
      ctx.quadraticCurveTo(x + r, y - r * 0.4, x, y + r);
      ctx.quadraticCurveTo(x - r, y - r * 0.4, x, y - r * 2.4);
      ctx.fill();
    }
  }
  return tip;
}

// ---- ledger ---------------------------------------------------------------------

const BOOKPOS = [
  { off: [-26, 70], rot: 0.08 }, // round 13: hangs from the claw by its fore-edge corner, so the blade fist stays clear in front of it
  { off: [-30, -34], rot: -1.18 }, // round 10: held up and BEHIND the skull, tilted, so the profile stays clear
  { off: [30, 4], rot: 1.45 },
  { off: [10, -10], rot: -0.4 },
];
function bookXform(pose) {
  const v = clamp(pose.book, 0, 3);
  const i = Math.min(2, Math.floor(v)), f = v - i;
  const a = BOOKPOS[i], c = BOOKPOS[i + 1];
  return { off: [lerp(a.off[0], c.off[0], f), lerp(a.off[1], c.off[1], f)], rot: lerp(a.rot, c.rot, f) };
}

// Stamp a static drawing from a bitmap cache. The bitmap is inked at the power-of-two
// resolution just above the current device scale (so it is never minified more than
// 2:1 and hairlines survive), one bitmap per level.
const stamps = new Map();
function stamp(ctx, key, [bx, by, bw, bh], draw, maxLevel = 8) {
  const m = ctx.getTransform();
  const sc = Math.hypot(m.a, m.b);
  const level = Math.min(maxLevel, Math.max(0.5, 2 ** Math.ceil(Math.log2(Math.max(0.01, sc)))));
  const k = key + level;
  let c = stamps.get(k);
  if (!c) {
    c = offscreen(Math.ceil(bw * level), Math.ceil(bh * level));
    const g = c.getContext('2d');
    g.setTransform(level, 0, 0, level, -bx * level, -by * level);
    draw(g);
    // round 34: the stamped skull and horns get the same living ink edge as the baked
    // sprites (wobble, pressure, bleed, snapped greys); the ledger cover stays ruled
    if (key === 'head' && level >= 1) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      inkEdge(c, { S: level * 0.8, seed: 77 + level, amp: 0.85, amp2: 0.32, dry: 0.5, press: 0.12 });
    }
    stamps.set(k, c);
  }
  const q = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, bx, by, bw, bh);
  ctx.imageSmoothingQuality = q;
}

// The ledger's cover (black board, white crosshatch net, highlights, spine bands,
// emblem, corner fittings, clasp) never changes in the book's own frame, so it is
// inked once into a 5x bitmap and stamped each frame (it was ~0.4 ms of fills).
function drawCover(g, hw, hh) {
  // the cover
  const cv = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  poly(g, cv, INK);
  // worn leather lit from the upper fore-edge: a white crosshatch net that is dense at
  // that corner and thins out across the board (the strokes shorten and drop out), so
  // the grey is built from lines, never from a gradient fill
  g.save();
  g.beginPath(); g.rect(-hw + 1, -hh + 1, hw * 2 - 2, hh * 2 - 2); g.clip();
  g.fillStyle = PAPER;
  g.beginPath();
  const corner = [hw * 0.55, hh + 4]; // lit from below the fore-edge: the board under the claw stays black
  for (const [ang, gap, reach, wmax, sd] of [[-0.95, 2.3, 0.72, 0.75, 361], [0.62, 2.7, 0.42, 0.6, 362]]) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let k = -70; k <= 70; k += gap) {
      // a line of direction (ca, sa) offset k along its normal from the corner
      const ox = corner[0] - sa * k, oy = corner[1] + ca * k;
      const hk = hashNoise(sd, Math.round(k * 10));
      for (let j = 0; j < 3; j++) {
        const s0 = -60 + j * 40 + hk * 12, s1 = s0 + 22 + hashNoise(sd + 1, Math.round(k * 10) + j) * 16;
        const p0 = [ox + ca * s0, oy + sa * s0], p1 = [ox + ca * s1, oy + sa * s1];
        const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        const d = Math.hypot(m[0] - corner[0], m[1] - corner[1]) / (hh * 2 * reach);
        if (d > 1 || hashNoise(sd + 2, Math.round(k * 10) + j * 7) < d * d * 0.8) continue;
        const w = wmax * (1 - d * 0.75);
        ribbonPath(g, [p0, m, p1], (tt) => w * Math.sin(Math.PI * tt) + 0.04);
      }
    }
  }
  g.fill();
  // round 15 (ref 07): a fine white crosshatch net along the top board where the light
  // grazes it under the claws, dying out down the cover (short strokes, both directions)
  g.beginPath();
  for (const [ang, sd] of [[0.78, 371], [-0.78, 372]]) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let k = -hw - 20; k <= hw + 20; k += 1.75) {
      const hk = hashNoise(sd, Math.round(k * 10));
      const depth = 9 + hk * 9;
      const x0 = k, y0 = -hh + 1;
      const L = depth / Math.abs(sa);
      const p0 = [x0, y0], p1 = [x0 + ca * L * Math.sign(sa), y0 + Math.abs(sa) * L];
      ribbonPath(g, [p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], p1], (tt) => 0.5 * Math.pow(1 - tt, 1.3) + 0.04);
    }
  }
  g.fill();
  // and a dot-tone grey worn into the lower board by the spine: three bands, the dots
  // shrinking as they move into the black (a tone gradient, never a ramp)
  const toneBand = (pts, dot) => {
    g.save(); g.beginPath(); polyPath(g, pts); g.clip();
    g.fillStyle = PAPER; g.beginPath();
    for (let y = -hh; y <= hh; y += 1.65) for (let x = -hw + ((Math.round(y / 1.65) % 2) ? 0.95 : 0); x <= hw; x += 1.9) { g.moveTo(x + dot, y); g.arc(x, y, dot, 0, Math.PI * 2); }
    g.fill(); g.restore();
  };
  toneBand([[-hw + 4, hh * 0.05], [-hw + 16, hh * 0.18], [-hw + 22, hh * 0.55], [-hw + 18, hh - 2], [-hw + 4, hh - 2]], 0.28);
  toneBand([[-hw + 4, hh * 0.3], [-hw + 11, hh * 0.38], [-hw + 15, hh * 0.65], [-hw + 12, hh - 2], [-hw + 4, hh - 2]], 0.42);
  toneBand([[-hw + 4, hh * 0.55], [-hw + 8, hh * 0.62], [-hw + 9, hh - 2], [-hw + 4, hh - 2]], 0.6);
  g.restore();
  // the page block showing along the fore-edge: a paper strip of fine leaves
  g.fillStyle = PAPER;
  g.beginPath(); g.rect(hw - 0.2, -hh + 2.5, 3.6, hh * 2 - 4); g.fill();
  g.fillStyle = INK;
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const x = hw + 0.5 + k * 0.55;
    ribbonPath(g, [[x, -hh + 3 + hashNoise(380, k) * 4], [x + 0.1, 0], [x, hh - 2 - hashNoise(381, k) * 6]], (tt) => (k % 2 ? 0.18 : 0.28) * Math.sin(Math.PI * tt) + 0.03);
  }
  ribbonPath(g, [[hw + 3.4, -hh + 2.5], [hw + 3.6, hh - 1.5]], () => 0.55);
  g.fill();
  // a long white highlight down the spine edge and along the top board
  g.beginPath();
  ribbonPath(g, [[-hw + 2.2, -hh + 4], [-hw + 2.6, 0], [-hw + 2.2, hh - 6]], (tt) => 1.3 * Math.sin(Math.PI * tt) + 0.1);
  ribbonPath(g, [[-hw + 8, -hh + 1.6], [hw - 12, -hh + 1.4]], (tt) => 0.8 * Math.sin(Math.PI * tt) + 0.05);
  g.fill();
  // spine bands
  g.fillStyle = PAPER;
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const y = -hh + 10 + k * 17;
    ribbonPath(g, [[-hw + 0.5, y], [-hw + 5, y + 0.5]], () => 1.3);
  }
  // a worn scrape along the bottom edge of the cover (lit by subtraction)
  ribbonPath(g, [[-hw + 8, hh - 4], [0, hh - 3.4], [hw - 10, hh - 4.2]], (tt) => 1.0 * Math.sin(Math.PI * tt));
  // emblem: a ring and an upright nib
  for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
    ribbonPath(g, [[2 + Math.cos(a0) * 9, -4 + Math.sin(a0) * 9], [2 + Math.cos(a1) * 9, -4 + Math.sin(a1) * 9]], () => (Math.sin(a0) > 0 ? 1.3 : 0.7));
  }
  spikePath(g, [2, 6], [2, -14], 5.5, 0);
  g.fill();
  g.fillStyle = INK;
  g.beginPath(); g.arc(2, -1.5, 1.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); ribbonPath(g, [[2, -2], [2, -13]], (tt) => 0.9 * (1 - tt)); g.fill();
  // corner fittings with rivets
  for (const [sx, sy] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
    const c = [sx * hw, sy * hh];
    const fit = [c, [c[0] - sx * 11, c[1]], [c[0] - sx * 3, c[1] - sy * 3], [c[0], c[1] - sy * 11]];
    poly(g, fit, BONE);
    contour(g, fit, { min: 0.6, max: 1.4, breaks: false });
    g.fillStyle = INK;
    g.beginPath(); g.arc(c[0] - sx * 3.6, c[1] - sy * 3.6, 0.95, 0, Math.PI * 2); g.fill();
  }
  // clasp strap across the fore-edge
  poly(g, [[hw - 4, -5], [hw + 7, -4], [hw + 7, 4], [hw - 4, 5]], INK);
  const bk = [[hw + 2, -3.2], [hw + 6.5, -3.2], [hw + 6.5, 3.2], [hw + 2, 3.2]];
  poly(g, bk, BONE);
  contour(g, bk, { min: 0.5, max: 1.2, breaks: false });
}
function cover(ctx, hw, hh) {
  stamp(ctx, 'cover', [-hw - 2, -hh - 2, hw * 2 + 11, hh * 2 + 4], (g) => drawCover(g, hw, hh));
}

function ledger(ctx, handP, pose, t, b, grip = false) {
  const X = bookXform(pose);
  const open = pose.bookOpen;
  const cx = handP[0] + X.off[0], cy = handP[1] + X.off[1];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(X.rot);
  const hw = 30, hh = 41;
  let spineWorld;
  const hoisted = pose.book > 0.4 && pose.book < 2.5;
  // tells: the hoisted ledger swells (bookScale); tuned for the old small book, so damped here
  const bs = pose.bookScale == null ? 1 : pose.bookScale <= 1 ? pose.bookScale : 1 + (pose.bookScale - 1) * 0.6;
  if (bs !== 1) ctx.scale(bs, bs);
  if (open > 0.3 && hoisted) {
    // pages tearing loose and flapping out of the fore-edge
    for (let k = 0; k < 5; k++) {
      const fl = Math.sin(t / 70 + k * 1.9) * 0.22 * open;
      const a = -0.9 + k * 0.42 + fl;
      const L = 28 + hashNoise(340, k) * 14;
      ctx.save();
      ctx.translate(hw - 4, -hh * 0.7 + k * (hh * 1.4 / 4));
      ctx.rotate(a);
      // a thin sheet curling as it tears free: narrow at the binding, the free corner lifting
      const curl = Math.sin(t / 55 + k) * 4;
      const tw = 4.5 + hashNoise(341, k) * 2;
      const pg = spline([[0, -2], [L * 0.45, -tw + curl * 0.3], [L, -tw * 0.6 + curl], [L + 3, tw * 0.7 + curl * 1.2], [L * 0.5, tw + curl * 0.4], [0, 2]], 3);
      poly(ctx, pg, PAPER);
      ctx.fillStyle = INK;
      ctx.beginPath();
      // the names on it: short brush dashes, not ruled lines
      for (let r = 0; r < 2; r++) {
        for (let j = 0; j < 3; j++) {
          const x0 = 7 + j * (L * 0.27) + hashNoise(342 + k, r * 3 + j) * 3;
          const y0 = -tw * 0.35 + r * tw * 0.75 + curl * (x0 / L) * 0.8;
          ribbonPath(ctx, [[x0, y0], [x0 + 3, y0 - 0.6], [x0 + 6 + hashNoise(343, j + k) * 3, y0 + 0.3]], (tt) => 1.1 * Math.sin(Math.PI * (0.15 + tt * 0.85)) + 0.05);
        }
      }
      ctx.fill();
      contour(ctx, pg, { min: 0.35, max: 1.8, seed: 350 + k });
      ctx.restore();
    }
  }
  if (open > 0.3 && !hoisted) {
    const pw = 24 + open * 20;
    // cover behind the pages
    poly(ctx, [[-pw - 3, -hh - 2], [pw + 3, -hh - 2], [pw + 3, hh + 3], [-pw - 3, hh + 3]], INK);
    // loose pages fanning up when it is hoisted
    if (pose.book < 2.5) {
      for (let k = 0; k < 3; k++) {
        const a = -0.5 + k * 0.45 + Math.sin(t / 90 + k * 2) * 0.25 * open;
        ctx.save();
        ctx.rotate(a);
        const pg = [[0, 0], [pw * 0.9, -6], [pw * 0.95, -hh * 1.6], [3, -hh * 1.5]];
        poly(ctx, pg, PAPER);
        contour(ctx, pg, { min: 0.5, max: 1.5, seed: 300 + k });
        ctx.restore();
      }
    }
    for (const s of [-1, 1]) {
      const pg = [[0, -hh + 1], [s * pw, -hh - 1], [s * pw, hh], [0, hh + 1.5]];
      poly(ctx, pg, PAPER);
      contour(ctx, pg, { min: 0.5, max: 1.7, seed: 310 + s });
    }
    // gutter shadow in hatch
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const y = -hh + 5 + k * 7.6;
      ribbonPath(ctx, [[-1, y], [-8, y + 2]], (tt) => 1.1 * (1 - tt));
      ribbonPath(ctx, [[1, y], [8, y + 2]], (tt) => 1.1 * (1 - tt));
    }
    // ruled lines, and the names written so far
    const written = b.writing ? clamp((b.stateT) / 2400, 0, 1) : 1;
    for (let r = 0; r < 8; r++) {
      const y = -hh + 7 + r * 8.4;
      for (const s of [-1, 1]) {
        if (s > 0 && r / 8 >= written) continue;
        const x0 = s * 8, x1 = s * (pw - 5);
        const pts = [];
        for (let k = 0; k <= 6; k++) pts.push([lerp(x0, x1, k / 6), y + (hashNoise(320 + r * 2 + s, k) - 0.5) * 2.4]);
        if (!(s > 0 && r === 7)) ribbonPath(ctx, pts, (tt) => 1.2 * (0.6 + 0.4 * Math.sin(tt * 40 + r)));
      }
    }
    ctx.fill();
    if (written >= 1 || !b.writing) {
      const y = -hh + 7 + 7 * 8.4;
      ctx.fillStyle = RED;
      ctx.beginPath();
      penPath(ctx, [[9, y], [pw * 0.4, y - 1.5], [pw * 0.7, y + 1], [pw - 6, y - 0.5]], 2.2, 0.1, 0.3);
      ctx.fill();
    }
    spineWorld = [cx, cy + Math.cos(X.rot) * hh];
  }
  if (!(open > 0.3 && !hoisted)) {
    // the book as a block seen a little from above and in front: the fore-edge pages
    // and the top edge of the pages recede along the same depth vector, boxed by the
    // back board, so a claw hooked over the top reads as wrapping it
    const DX = 6.5, DY = -4.5;
    const back = [[-hw + 1, -hh], [-hw + 1 + DX, -hh + DY], [hw + DX, -hh + DY], [hw + DX, hh + DY], [hw, hh]];
    poly(ctx, back, INK); // the back board, a thin black rim behind the pages
    const pt = [[-hw + 2.5, -hh + 0.5], [-hw + 2.5 + DX * 0.8, -hh + DY * 0.8 + 0.6], [hw + DX * 0.8 - 0.5, -hh + DY * 0.8 + 0.6], [hw - 0.5, -hh + 0.5]];
    const pb = [[hw - 0.5, -hh + 1], [hw + DX * 0.8 - 0.5, -hh + DY * 0.8 + 1], [hw + DX * 0.8 - 0.5, hh + DY * 0.8 - 1], [hw - 0.5, hh - 1.5]];
    poly(ctx, pt, PAPER);
    poly(ctx, pb, PAPER);
    ctx.fillStyle = INK;
    ctx.beginPath();
    for (let k = 0; k < 14; k++) {
      const y = -hh + 6 + k * 5.1;
      ribbonPath(ctx, [[hw, y], [hw + DX * 0.8 - 1, y + DY * 0.8]], () => 0.5);
    }
    for (let k = 1; k < 3; k++) {
      const f = k / 3;
      ribbonPath(ctx, [[-hw + 3 + DX * 0.8 * f, -hh + DY * 0.8 * f + 0.5], [-hw * 0.1 + DX * 0.8 * f, -hh + DY * 0.8 * f + 0.6 + 0.3 * k], [hw - 1 + DX * 0.8 * f, -hh + DY * 0.8 * f + 0.5]], (tt) => 0.45 + 0.2 * Math.sin(tt * 9 + k));
    }
    ctx.fill();
    cover(ctx, hw, hh);
    spineWorld = [cx + Math.cos(X.rot) * -hw - Math.sin(X.rot) * hh * 0.7, cy + Math.sin(X.rot) * -hw + Math.cos(X.rot) * hh * 0.7];
    if (grip) {
      // the claw hooked over the top board, in the book's own frame
      const c = Math.cos(X.rot), s = Math.sin(X.rot);
      const ox = -X.off[0] / bs, oy = -X.off[1] / bs;
      const ad = [Math.sin(pose.bsh + pose.bel), Math.cos(pose.bsh + pose.bel)];
      gripHand(ctx, [ox * c + oy * s, -ox * s + oy * c], hw, hh, 240, { dir: [ad[0] * c + ad[1] * s, -ad[0] * s + ad[1] * c] });
    }
  }
  ctx.restore();
  return spineWorld;
}

// a chain of distinct links along a sagging curve (batched: three fills for the whole chain)
function chain(ctx, a, e, sag, seed) {
  const c = [(a[0] + e[0]) / 2, Math.max(a[1], e[1]) + sag];
  const dist = Math.hypot(e[0] - a[0], e[1] - a[1]) + sag;
  const n = Math.max(3, Math.floor(dist / 6.2));
  const pts = quad(a, c, e, n);
  const L = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1];
    L.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, Math.atan2(q[1] - p[1], q[0] - p[0])]);
  }
  linksPath(ctx, L);
}
function linksPath(ctx, L) {
  // each link is its own closed shape: ink outline, pale metal ring, a shadow crescent
  // on its lower inner edge and a white glint dot
  const k = 1.15;
  ctx.fillStyle = INK;
  ctx.beginPath();
  L.forEach(([x, y, r], i) => { ctx.moveTo(x + 5 * k, y); ctx.ellipse(x, y, 4.7 * k, (i % 2 ? 1.7 : 3.2) * k, r, 0, Math.PI * 2); });
  ctx.fill();
  ctx.fillStyle = BONE;
  ctx.beginPath();
  L.forEach(([x, y, r], i) => {
    if (i % 2) { ctx.moveTo(x + 3.5 * k, y); ctx.ellipse(x, y, 3.5 * k, 0.6 * k, r, 0, Math.PI * 2); }
    else { ctx.moveTo(x + 3.6 * k, y); ctx.ellipse(x, y - 0.2, 3.6 * k, 2.2 * k, r, 0, Math.PI * 2); }
  });
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  L.forEach(([x, y, r], i) => {
    if (i % 2) return;
    ctx.moveTo(x + 2.2 * k, y); ctx.ellipse(x, y, 2.2 * k, 0.95 * k, r, 0, Math.PI * 2);
    // shadow crescent along the lower half of the ring
    ctx.moveTo(x + Math.cos(r) * 3.5 * k, y + Math.sin(r) * 3.5 * k);
    ctx.ellipse(x, y, 3.5 * k, 2.1 * k, r, 0, Math.PI, false);
    ctx.ellipse(x, y + 0.5, 3.0 * k, 1.3 * k, r, Math.PI, 0, true);
  });
  ctx.fill();
  ctx.fillStyle = HI;
  ctx.beginPath();
  L.forEach(([x, y, r], i) => {
    const gx = x - Math.cos(r) * 1.6 * k + Math.sin(r) * 1.1 * k, gy = y - Math.sin(r) * 1.6 * k - Math.cos(r) * 1.1 * k;
    const rr = i % 2 ? 0.55 : 0.75;
    ctx.moveTo(gx + rr, gy); ctx.arc(gx, gy, rr, 0, Math.PI * 2);
  });
  ctx.fill();
}

// ---- legs and feet ------------------------------------------------------------------

function leg(ctx, R, pose, side, far, t, part = 'all') {
  const { foot, hip, knee, ankle } = legGeom(R, pose, side, far);
  if (has('shin') && has('foot')) {
    // round 18: the thigh is a plain black mass (it lives under the coat); the shin and
    // the clawed foot are ink-painted parts (paint/legs.js)
    if (part !== 'lower') blackLimb(ctx, add(hip, [-5, 4]), knee, 8.5, 7.5, { seed: 200 + side * 7, far, cuffs: 0, t, halo: false }); // round 28: the near thigh is modelled (rim + wrap hatch)
    if (part === 'upper') return;
    const ang = Math.atan2(ankle[0] - knee[0], ankle[1] - knee[1]);
    const len = Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1]);
    drawPart(ctx, far ? 'foot_far' : 'foot', ankle[0], ankle[1], foot[1] < -1 ? 0.18 : 0);
    drawPart(ctx, far ? 'shin_far' : 'shin', knee[0], knee[1], -ang, 1, len / 64); // painted 64 long
    return;
  }
  blackLimb(ctx, hip, knee, 10, 6.5, { seed: 200 + side * 7, far, cuffs: 0, t });
  blackLimb(ctx, knee, ankle, 6.5, 3.8, { seed: 210 + side * 7, far, cuffs: far ? 0 : 1, bulge: 0.3, t });
  blackJoint(ctx, knee, 6.5, [0.95, -0.35], 12, far);
  // clawed black foot with pale talons
  ctx.fillStyle = INK;
  ctx.beginPath();
  polyPath(ctx, [add(ankle, [-5, -2]), add(ankle, [5, 0]), [foot[0] + 8, foot[1] - 4], [foot[0] + 6, foot[1]], [foot[0] - 10, foot[1]]]);
  for (let k = 0; k < 3; k++) {
    const b0 = [foot[0] + 4 + k * 1.5, foot[1] - 3 + k * 0.8];
    spikePath(ctx, b0, [foot[0] + 18 + k * 3 - k * k * 2, foot[1] + 0.2], 4.8 - k * 0.6, -2 - k);
  }
  spikePath(ctx, [foot[0] - 6, foot[1] - 2], [foot[0] - 19, foot[1] + 0.5], 4, 1.5);
  ctx.fill();
  if (far) return;
  ctx.fillStyle = BONE;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const b0 = [foot[0] + 15 + k * 3 - k * k * 2, foot[1] - 1.6];
    spikePath(ctx, b0, [b0[0] + 8, foot[1] + 0.4], 2.4, -1.5);
  }
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  penPath(ctx, [add(ankle, [3, 3]), [foot[0] + 4, foot[1] - 3.5], [foot[0] + 14, foot[1] - 1.8]], 1.0, 0.2, 0.5);
  ctx.fill();
}

// ---- shadow ---------------------------------------------------------------------

export function scrivenerShadow(ctx, b, deadP) {
  const w = 74 + deadP * 150;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(0, b.y + 3, w, 5 + deadP * 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const s = i % 2 ? 1 : -1;
    const y = b.y + 1 + (hashNoise(17, i) - 0.5) * 7;
    const x0 = s * (w * 0.6), x1 = s * (w + 18 + hashNoise(18, i) * 50);
    ribbonPath(ctx, [[x0, y], [(x0 + x1) / 2, y + 0.4], [x1, y + 0.8]], (tt) => 2.6 * (1 - tt) + 0.1);
  }
  ctx.fill();
}

// ---- the figure -----------------------------------------------------------------------

// jit: the wobble's strength (0 for the half-res contour mask: a sub-pixel there, so it
// is not worth its vertices)
export function drawScrivener(ctx, b, pose, t, jit = 1) {
  if (jit) jitterOn(ctx);
  JIT = jit;
  try { return drawScrivener0(ctx, b, pose, t); } finally { JIT = 0; }
}
function drawScrivener0(ctx, b, pose, t) {
  const R = rig(b, pose, t);
  const farSh = R.P(0.98, -10);
  const nearSh = R.P(0.97, -2);
  const farArm = arm(farSh, pose.bsh, pose.bel);
  const nearArm = arm(nearSh, pose.sh, pose.el);

  wings(ctx, R, pose, t, true);
  ribbons(ctx, R, pose, t);
  leg(ctx, R, pose, -1, true, t);
  // far arm sits behind the body
  if (has('uarm_far')) {
    drawPart(ctx, 'uarm_far', farArm.sh[0], farArm.sh[1], -pose.bsh);
    drawPart(ctx, 'farm_far', farArm.elbow[0], farArm.elbow[1], -farArm.angle);
  } else {
    upperArm(ctx, farArm, { seed: 230, t });
    foreArm(ctx, farArm, { seed: 231 });
  }
  wings(ctx, R, pose, t, false);
  const paintedLegs = has('shin') && has('foot') && has('torso') && has('skirt');
  leg(ctx, R, pose, 1, false, t, paintedLegs ? 'upper' : 'all');
  if (has('torso') && has('skirt')) paintedCoat(ctx, R, pose, t);
  else { coat(ctx, R, pose, t, b); beads(ctx, R); }
  if (paintedLegs) leg(ctx, R, pose, 1, false, t, 'lower');
  beltAndCharms(ctx, R, pose, t);
  // ledger + the far hand gripping its top edge. When the claw hangs it from its top
  // board (grip) the book is held out in front of everything, so it is inked last and
  // the claw on it is never crossed by the blade arm.
  const grip = pose.book < 0.3 && !(pose.bookOpen > 0.3);
  const book = () => {
    const spineW = ruled(() => ledger(ctx, farArm.hand, pose, t, b, grip));
    const belt = R.P(0.06, -14);
    if (Math.hypot(spineW[0] - belt[0], spineW[1] - belt[1]) < 190) ruled(() => chain(ctx, spineW, belt, 26 - pose.crouch * 10, 5));
    else ruled(() => chain(ctx, spineW, [spineW[0] - 4 + Math.sin(t / 120) * 3, spineW[1] + 30], 3, 5)); // torn free, dangling
  };
  if (!grip) {
    book();
    if (has('hand_claw')) drawPart(ctx, 'hand_claw', farArm.hand[0], farArm.hand[1], -farArm.angle);
    else clawHand(ctx, farArm.hand, farArm.d2, pose.book >= 0.5 ? 0.55 : 0.8, 240, { palmSide: -1 });
  }
  ruff(ctx, R, pose, t);
  // round 10: with the near arm raised overhead the skull is inked over it, so the
  // gaunt profile is never cut by the arm (the ledger slam's wind-up)
  const headOver = pose.sh > 2.2 && pose.book > 0.4;
  if (!headOver) { neck(ctx, R); head(ctx, R, b, t, pose); }
  // near arm, blade, hand on top
  const painted = has('uarm');
  if (painted) drawPart(ctx, 'uarm', nearArm.sh[0], nearArm.sh[1], -pose.sh);
  else upperArm(ctx, nearArm, { seed: 250, t });
  const tip = ruled(() => quillBlade(ctx, nearArm, pose, b, t));
  if (painted) drawPart(ctx, 'farm', nearArm.elbow[0], nearArm.elbow[1], -nearArm.angle);
  else foreArm(ctx, nearArm, { seed: 251 });
  shoulder(ctx, nearArm.sh, R, t);
  if (painted) drawPart(ctx, 'hand_grip', nearArm.hand[0], nearArm.hand[1], -nearArm.angle);
  else clawHand(ctx, nearArm.hand, nearArm.d2, 0.95, 260, { palmSide: 1 });
  if (grip) book();
  if (headOver) { neck(ctx, R); head(ctx, R, b, t, pose); }
  return { tip, book: farArm.hand, head: headPoint(R, [12, -30], HS) };
}

// the ink-painted coat: the skirt shears between the belt and the hem (which stays on
// the floor as the hips drop), the torso turns with the lean about the hip
const SKIRT_L = 84; // paint/parts.js SKIRT_LEN
function paintedCoat(ctx, R, pose, t) {
  const belt = R.P(0.06, 0);
  // round 18: the hem rides the near knee (the coat stops there and the shins show)
  const kneeY = legGeom(R, pose, 1, false).knee[1];
  const hemY = Math.max(kneeY + 2, belt[1] + 60);
  const sway = Math.sin(t / 520) * 3 - R.drag * 10;
  const hemC = [R.H[0] - 8 + sway, hemY];
  drawPartAffine(ctx, 'skirt', belt, [1, 0], [(hemC[0] - belt[0] + 8) / SKIRT_L, (hemC[1] - belt[1]) / SKIRT_L]);
  drawPart(ctx, 'torso', R.H[0], R.H[1], pose.lean, 1, RIG.torso / 134); // painted at 134
}

// a pauldron of overlapping black quill-scales, rimmed in white
function shoulder(ctx, p, R, t) {
  const Q = [];
  for (let k = 0; k < 4; k++) {
    const a = -1.9 + k * 0.55;
    const d = [Math.sin(a), -Math.cos(a)];
    Q.push([d, add(p, d, -4), add(p, d, 20 + (k === 1 ? 6 : 0))]);
  }
  // round 12: no white halo round each scale (it read as a spiky asterisk); the scales
  // fuse into the black of the coat and only their lit edges are carved in hairline
  ctx.fillStyle = INK;
  ctx.beginPath(); for (const [, base, tip] of Q) spikePath(ctx, base, tip, 11.5, 3); ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.beginPath(); for (const [d, base, tip] of Q) { const n = [-d[1], d[0]]; ribbonPath(ctx, [add(add(base, d, 6), n, 2.6), add(add(tip, d, -6), n, 0.6)], (tt) => 1.1 * Math.sin(Math.PI * Math.min(1, tt * 1.1 + 0.05)) + 0.05); } ctx.fill();
}
