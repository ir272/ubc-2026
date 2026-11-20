// The six weapons, drawn in a hand. Owner: art. Same drawing at fight scale and in the
// portraits and item plates; S.hi / S.lod add the engraving (hatch, grain, rivets).
//   drawWeapon(ctx, id, hand, ang, S, o) -> { tip, head }   (points in local units)
// hand: grip point; ang: weapon direction (dirv convention); S: { hi, D, t, accent }.

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER, RED } from '../ink.js';
import { ribbonPath, penPath, spikePath, contour, poly, polyPath, quad, spline } from '../art/pen.js';
import { hatchIn, paperForm, inkForm, ellPts, rectPts, BONE } from './engrave.js';
import { engrave } from './inkwork.js';
import { dirv, add, mix, WPN } from './pose.js';

const nrm = (d) => [-d[1], d[0]];
// the engraving shows on the stage-sized fighter and up, and on the item plates
const HI = (S) => !!(S.hi || S.lod >= 1);

function grain(ctx, a, b, w, S, n = 3) {
  if (!HI(S)) return;
  const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]) || 1, u = [d[0] / L, d[1] / L], nn = nrm(u);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const off = (i / Math.max(1, n - 1) - 0.5) * w * 0.55;
    const s0 = hashNoise(77, i) * 0.3, s1 = 0.6 + hashNoise(78, i) * 0.4;
    penPath(ctx, [add(add(a, u, L * s0), nn, off), add(add(a, u, L * (s0 + s1) / 2), nn, off + 0.3), add(add(a, u, L * s1), nn, off)], 0.9 * S.D, 0.3, 0.3);
  }
  ctx.fill();
}

// ---- sabre: the old swordsman's blade, ported unchanged at fight scale ----------------
function sabre(ctx, hand, ang, S, o) {
  const len = (o.len || 60);
  const d2 = dirv(ang), n2 = nrm(d2);
  const tip = add(hand, d2, len);
  const b0 = add(hand, d2, 6);
  const curve = o.curve ?? 0;
  const mid = add(add(hand, d2, len * 0.55), n2, curve);
  const blade = [add(b0, n2, 2.4), add(add(tip, d2, -8), n2, 1.8 + curve * 0.4), tip, add(add(tip, d2, -8), n2, -1.8 + curve * 0.4), add(b0, n2, -2.4)];
  if (curve) blade.splice(1, 0, add(mid, n2, 2.2)), blade.splice(5, 0, add(mid, n2, -2.0));
  poly(ctx, blade, o.ghost ? 'rgba(231,224,204,0.0)' : PAPER);
  if (HI(S)) hatchIn(ctx, blade, { mode: 'shadow', color: INK, gamma: 0.12, wobble: 0.08, angle: ang < Math.PI ? 0.4 : -0.4, gap: 2.4 * S.D, w: 1.0 * S.D, lo: 0.45, seed: 31 });
  ctx.fillStyle = INK;
  ctx.beginPath();
  ribbonPath(ctx, [b0, add(tip, d2, -6)], (tt) => 1.1 * (1 - tt) + 0.2);
  ctx.fill();
  contour(ctx, blade, { min: HI(S) ? 0.35 : 0.5, max: HI(S) ? 1.0 : 1.5, breaks: false });
  ctx.fillStyle = INK;
  ctx.beginPath();
  ribbonPath(ctx, [add(b0, n2, 6), add(b0, n2, -6)], (tt) => 3 - Math.abs(tt - 0.5) * 2);
  ribbonPath(ctx, [b0, add(hand, d2, -5)], () => 2.6);
  const pm = add(hand, d2, -6);
  ctx.moveTo(pm[0] + 2, pm[1]); ctx.arc(pm[0], pm[1], 2, 0, Math.PI * 2);
  if (HI(S)) {
    // knuckle bow
    const bow = quad(add(b0, n2, 5.5), add(add(hand, d2, 0), n2, 7), add(hand, d2, -5.5), 8);
    ribbonPath(ctx, bow, () => 0.9);
  }
  ctx.fill();
  if (HI(S)) {
    ctx.fillStyle = PAPER; ctx.beginPath();
    for (let i = 0; i < 4; i++) { const p = add(hand, d2, 3.5 - i * 2); ribbonPath(ctx, [add(p, n2, -1.1), add(add(p, n2, 1.1), d2, 0.8)], () => 0.35); }
    ctx.fill();
  }
  return { tip, head: tip };
}

// ---- maul: binder's maul, a long haft and an iron-bound block -------------------------
function maul(ctx, hand, ang, S) {
  const d = dirv(ang), n = nrm(d);
  const butt = add(hand, d, -8);
  const hc = add(hand, d, 64);
  const neck = add(hand, d, 58);
  // haft
  ctx.fillStyle = INK;
  ctx.beginPath(); ribbonPath(ctx, [butt, neck], (t) => 4.0 - t * 0.8); ctx.fill();
  if (HI(S)) grain(ctx, butt, neck, 3.4, S, 2);
  // bands on the haft
  ctx.fillStyle = PAPER; ctx.beginPath();
  for (const s of [0.05, 0.6]) { const p = add(butt, d, 66 * s); ribbonPath(ctx, [add(p, n, -2.4), add(p, n, 2.4)], () => 1.1); }
  ctx.fill();
  // the head: long across the haft
  const hl = 26, hw = 15;
  const head = [add(add(hc, n, -hl / 2), d, -hw / 2), add(add(hc, n, hl / 2), d, -hw / 2), add(add(hc, n, hl / 2 + 1.5), d, hw / 2), add(add(hc, n, -hl / 2 - 1.5), d, hw / 2)];
  poly(ctx, head, INK);
  if (HI(S)) engrave(ctx, head, { ...S, lod: S.lod || 2 }, { folds: 1, foldAngle: Math.atan2(n[1], n[0]), seed: 41, reach: 0.5 });
  // iron bands at both ends and the struck faces
  ctx.fillStyle = PAPER; ctx.beginPath();
  for (const s of [-1, 1]) {
    const e = add(hc, n, s * (hl / 2 - 3.5));
    ribbonPath(ctx, [add(e, d, -hw / 2 + 0.8), add(e, d, hw / 2 - 0.8)], () => 1.6);
    const f = add(hc, n, s * (hl / 2 + 0.2));
    ribbonPath(ctx, [add(f, d, -hw / 2 + 1.5), add(f, d, hw / 2 - 1.5)], () => 1.0);
  }
  ctx.fill();
  if (HI(S)) {
    ctx.fillStyle = PAPER; ctx.beginPath();
    for (let i = 0; i < 6; i++) { const e = add(add(hc, n, (i - 2.5) * 3.4), d, -hw / 2 + 2); ctx.moveTo(e[0] + 0.6, e[1]); ctx.arc(e[0], e[1], 0.6, 0, Math.PI * 2); }
    ctx.fill();
    contour(ctx, head, { min: 0.3, max: 1.0, color: INK });
  }
  return { tip: add(hc, n, hl / 2), head: hc };
}

// ---- knife: a paper knife, short leaf blade ----------------------------------------
function knife(ctx, hand, ang, S) {
  const d = dirv(ang), n = nrm(d);
  const b0 = add(hand, d, 3.5);
  const tip = add(hand, d, 21);
  const blade = [add(b0, n, 1.8), add(add(b0, d, 7), n, 2.6), tip, add(add(b0, d, 8), n, -1.6), add(b0, n, -1.6)];
  poly(ctx, blade, PAPER);
  if (HI(S)) hatchIn(ctx, blade, { mode: 'shadow', color: INK, gamma: 0.12, wobble: 0.08, angle: ang + 0.6, gap: 2.0 * S.D, w: 0.9 * S.D, lo: 0.4, seed: 51 });
  contour(ctx, blade, { min: HI(S) ? 0.35 : 0.6, max: HI(S) ? 1.0 : 1.4, breaks: false });
  ctx.fillStyle = INK;
  ctx.beginPath();
  ribbonPath(ctx, [add(b0, d, 1), add(tip, d, -4)], (t) => 0.9 * (1 - t) + 0.15);
  ribbonPath(ctx, [add(b0, n, 3.8), add(b0, n, -3.8)], () => 2.0);
  ribbonPath(ctx, [b0, add(hand, d, -5)], () => 2.6);
  ctx.fill();
  return { tip, head: tip };
}

// ---- lamplighter's pole: long black shaft, hook, a small lamp swinging from it ----------
function pole(ctx, hand, ang, S, o) {
  const W = WPN.pole;
  const d = dirv(ang), n = nrm(d);
  const g = o.grip ?? W.grip;
  const butt = add(hand, d, -g);
  const tip = add(hand, d, 120 - g);
  ctx.fillStyle = INK;
  ctx.beginPath(); ribbonPath(ctx, [butt, tip], (t) => 3.1 - t * 1.0); ctx.fill();
  if (HI(S)) grain(ctx, butt, tip, 2.6, S, 2);
  // brass ferrules
  ctx.fillStyle = PAPER; ctx.beginPath();
  for (const s of [0.03, 0.28, 0.93]) { const p = mix(butt, tip, s); ribbonPath(ctx, [add(p, n, -2.0), add(p, n, 2.0)], () => 0.9); }
  ctx.fill();
  // hook: up past the tip, then curled down
  const up = [0, -1];
  const h0 = tip, h1 = add(tip, d, 6), h2 = add(add(h1, d, 4), up, -5);
  const hook = spline([add(tip, d, -3), h1, add(add(h1, d, 6), up, 1), add(add(h1, d, 7), up, -4), h2], 3);
  ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, hook, (t) => 2.4 - t * 1.4); ctx.fill();
  // a short spike for the snuffer cone below the hook
  ctx.beginPath(); spikePath(ctx, add(tip, d, 2), add(add(tip, d, 3), n, 6 * Math.sign(n[1] || 1)), 2.4, 0); ctx.fill();
  // lamp hangs from the hook's end
  const sw = (o.sway ?? 0) + Math.sin((S.t || 0) / 260) * 0.15;
  const hang = add(h1, [Math.sin(sw), Math.cos(sw)], 0);
  const lc = add(hang, [Math.sin(sw), Math.cos(sw)], 11);
  ctx.fillStyle = INK;
  ctx.beginPath(); ribbonPath(ctx, [hang, add(hang, [Math.sin(sw), Math.cos(sw)], 5)], () => 0.9); ctx.fill();
  lamp(ctx, lc, 1, sw, S, { lit: true });
  return { tip: lc, head: tip };
}

// a small cage lantern, centred at c, size k (1 = 7 x 10 units)
export function lamp(ctx, c, k, rot, S, { lit = true } = {}) {
  ctx.save();
  ctx.translate(c[0], c[1]);
  ctx.rotate(-rot);
  ctx.scale(k, k);
  const glass = [[-3.4, -3.2], [3.4, -3.2], [4, 3.6], [-4, 3.6]];
  poly(ctx, glass, PAPER);
  if (HI(S)) hatchIn(ctx, glass, { mode: 'shadow', color: INK, gamma: 0.12, wobble: 0.08, angle: 0.2, gap: 1.3 * S.D / k, w: 0.6 * S.D / k, lo: 0.55, seed: 61 });
  ctx.fillStyle = INK;
  ctx.beginPath();
  polyPath(ctx, [[-4.6, -3.3], [0, -7.6], [4.6, -3.3], [3.4, -2.2], [-3.4, -2.2]]);   // cap
  polyPath(ctx, [[-4.8, 3.2], [4.8, 3.2], [3.6, 5.6], [-3.6, 5.6]]);                    // base
  ribbonPath(ctx, [[-3.6, -2.6], [-4.2, 3.6]], () => 1.0);
  ribbonPath(ctx, [[3.6, -2.6], [4.2, 3.6]], () => 1.0);
  ribbonPath(ctx, [[0, -3], [0, 3.4]], () => 0.7);
  ctx.moveTo(1.4, -9); ctx.arc(0, -9, 1.4, 0, Math.PI * 2);
  ctx.fill();
  if (lit) {
    // the flame: a small black tongue (the frame is lit, not glowing)
    ctx.fillStyle = INK;
    ctx.beginPath(); spikePath(ctx, [-1.2, 2.2], [0.4, -1.8 + Math.sin((S.t || 0) / 90) * 0.4], 2.0, 0.6); ctx.fill();
    if (HI(S)) {
      ctx.fillStyle = INK; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.45; ribbonPath(ctx, [[Math.cos(a) * 6.5, Math.sin(a) * 6.5 - 1], [Math.cos(a) * 9.5, Math.sin(a) * 9.5 - 1]], (t) => 0.5 * (1 - t)); }
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- censer: a pierced ball on a chain, smoking --------------------------------------
function censer(ctx, hand, ang, S, o) {
  const d = dirv(ang);
  const L = o.chain ?? 27;
  const c = add(hand, d, L + 6);
  // chain: alternating links
  const links = 8;
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < links; i++) {
    const p0 = add(hand, d, (L * i) / links), p1 = add(hand, d, (L * (i + 0.9)) / links);
    const m = mix(p0, p1, 0.5);
    const r = L / links / 2;
    if (i % 2 === 0) { ctx.moveTo(m[0] + r, m[1]); ctx.ellipse(m[0], m[1], r, r * 0.55, Math.atan2(d[1], d[0]), 0, Math.PI * 2); }
    else ribbonPath(ctx, [p0, p1], () => 1.0);
  }
  ctx.fill();
  if (!HI(S)) {
    ctx.fillStyle = PAPER; ctx.beginPath();
    for (let i = 0; i < links; i += 2) { const m = add(hand, d, (L * (i + 0.45)) / links); ctx.moveTo(m[0] + 0.5, m[1]); ctx.arc(m[0], m[1], 0.5, 0, Math.PI * 2); }
    ctx.fill();
  }
  // smoke first (behind the ball): curling ink wisps drifting up and away from the swing
  smoke(ctx, add(c, [0, -6]), S, o.smoke ?? 1, o.drift ?? -1);
  // the body: lidded ball
  const body = ellPts(c[0], c[1] + 1, 6.6, 6.0, 0, 22);
  paperForm(ctx, body, { hatch: HI(S) ? { angle: 0.9, gap: 2.2 * S.D, w: 0.9 * S.D, lo: 0.35, gamma: 0.12, seed: 71 } : null, line: { min: HI(S) ? 0.4 : 0.7, max: HI(S) ? 1.2 : 1.6 } });
  ctx.fillStyle = INK;
  ctx.beginPath();
  ribbonPath(ctx, [[c[0] - 6.4, c[1] - 0.5], [c[0], c[1] + 0.6], [c[0] + 6.4, c[1] - 0.5]], () => 1.6);   // band
  polyPath(ctx, [[c[0] - 4.2, c[1] - 4.6], [c[0], c[1] - 10.5], [c[0] + 4.2, c[1] - 4.6]]);             // lid
  polyPath(ctx, [[c[0] - 2.6, c[1] + 6.6], [c[0] + 2.6, c[1] + 6.6], [c[0] + 3.4, c[1] + 8.6], [c[0] - 3.4, c[1] + 8.6]]);
  for (let i = 0; i < 5; i++) { const x = c[0] - 4 + i * 2, y = c[1] + 3.2 + (i % 2) * 0.6; ctx.moveTo(x + 0.75, y); ctx.arc(x, y, 0.75, 0, Math.PI * 2); }
  ctx.fill();
  // red coals through the piercings
  ctx.fillStyle = RED; ctx.beginPath();
  for (let i = 0; i < 3; i++) { const x = c[0] - 3 + i * 3, y = c[1] - 2.4; ctx.moveTo(x + 0.8, y); ctx.arc(x, y, 0.8, 0, Math.PI * 2); }
  ctx.fill();
  return { tip: c, head: c };
}

// engraved smoke: a few wavering threads rising from p and leaning with `drift`
export function smoke(ctx, p, S, amount = 1, drift = -1, scale = 1) {
  const t = (S.t || 0) / 1000;
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const pts = [];
    const H = (22 + i * 5) * scale;
    for (let k = 0; k <= 14; k++) {
      const u = k / 14;
      pts.push([p[0] + (i - 1) * 1.6 * scale + drift * u * u * 12 * scale + Math.sin(u * 7 + t * 3 + i * 2.1) * 2.2 * scale * u, p[1] - u * H]);
    }
    const w = (HI(S) ? 0.75 : 0.95) * amount * (i === 1 ? 1 : 0.7);
    ribbonPath(ctx, pts, (tt) => w * Math.sin(Math.PI * Math.min(1, tt * 1.15)) * (1 - tt * 0.3) + 0.04);
  }
  ctx.fill();
}

// ---- quill: a long stolen quill-blade with its vane behind the hand --------------------
function quill(ctx, hand, ang, S) {
  const d = dirv(ang), n = nrm(d);
  const len = 64;
  const b0 = add(hand, d, 4);
  const tip = add(hand, d, len);
  // vane behind the hand: a black feather fanning back
  const vb = add(hand, d, -3), vt = add(hand, d, -26);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ribbonPath(ctx, [vb, vt], (t) => 1.6 * (1 - t) + 0.3);
  for (let i = 0; i < 9; i++) {
    const s = 0.12 + i * 0.1;
    const base = mix(vb, vt, s);
    const L = 9 * Math.sin(Math.PI * Math.min(1, s * 1.15)) + 1.5;
    for (const side of [1, -1]) {
      if (side < 0 && i % 2) continue;
      const tp = add(add(base, n, side * L * (side > 0 ? 1 : 0.7)), d, -L * 0.6);
      spikePath(ctx, base, tp, 1.9, side * 0.6);
    }
  }
  ctx.fill();
  // blade: a long nib, swollen near the grip, split down the middle
  const blade = [
    add(b0, n, 2.3), add(add(b0, d, 12), n, 3.6), add(add(b0, d, 34), n, 2.6), tip,
    add(add(b0, d, 34), n, -2.4), add(add(b0, d, 12), n, -3.2), add(b0, n, -2.3),
  ];
  const sp = spline(blade, 3, true);
  poly(ctx, sp, PAPER);
  if (HI(S)) hatchIn(ctx, sp, { mode: 'shadow', color: INK, gamma: 0.12, wobble: 0.08, angle: ang + 1.0, gap: 2.0 * S.D, w: 0.9 * S.D, lo: 0.35, seed: 81 });
  // the ink-dipped point
  ctx.save(); ctx.beginPath(); polyPath(ctx, sp); ctx.clip();
  ctx.fillStyle = INK; ctx.beginPath();
  const dip = add(b0, d, len - 16);
  ribbonPath(ctx, [add(dip, d, -3), add(dip, d, 6), tip], () => 12);
  ctx.fill(); ctx.restore();
  ctx.fillStyle = INK; ctx.beginPath();
  ribbonPath(ctx, [add(b0, d, 14), add(b0, d, len - 14)], (t) => 0.9 * Math.sin(Math.PI * t) + 0.15);
  const hole = add(b0, d, 13);
  ctx.moveTo(hole[0] + 1.3, hole[1]); ctx.arc(hole[0], hole[1], 1.3, 0, Math.PI * 2);
  // collar where the vane meets the blade
  ribbonPath(ctx, [add(hand, n, 3.2), add(hand, n, -3.2)], () => 2.4);
  ctx.fill();
  contour(ctx, sp, { min: HI(S) ? 0.35 : 0.55, max: HI(S) ? 1.0 : 1.5, breaks: false });
  return { tip, head: tip };
}

const DRAW = { sabre, maul, knives: knife, knife, pole, censer, quill };

export function drawWeapon(ctx, id, hand, ang, S, o = {}) {
  const f = DRAW[id] || sabre;
  const r = f(ctx, hand, ang, S, o);
  if (S.accent && (S.lod >= 1 || S.binding) && !o.noBinding) binding(ctx, id, hand, ang, S, o);
  return r;
}

// the contender's colour on the weapon: a binding wound on below the head or above the
// guard, its two short ends fluttering
const BIND_AT = { sabre: 8.5, quill: 6, knife: -4.5, knives: -4.5, maul: 50, censer: 3, pole: null };
function binding(ctx, id, hand, ang, S, o) {
  const d = dirv(ang), n = nrm(d);
  let at = BIND_AT[id];
  if (id === 'pole') at = 120 - (o.grip ?? WPN.pole.grip) - 9;
  if (at == null) return;
  const p = add(hand, d, at);
  const half = id === 'maul' ? 2.6 : id === 'pole' ? 2.2 : 1.9;
  ctx.fillStyle = S.accent; ctx.beginPath();
  for (let k = 0; k < 3; k++) { const q = add(p, d, (k - 1) * 1.3); ribbonPath(ctx, [add(add(q, n, half), d, -0.6), add(add(q, n, -half), d, 0.6)], () => 1.15); }
  ctx.fill();
  const t = S.t || 0;
  for (let i = 0; i < 2; i++) {
    const ph = t / 330 + i * 1.7;
    const base = add(p, n, half * (i ? -0.6 : 0.6));
    const pts = [base];
    for (let j = 1; j <= 3; j++) { const u = j / 3; pts.push([base[0] - u * (8 + i * 2) + Math.sin(ph - u * 2) * 1.2 * u, base[1] + u * (3 + i * 2) + Math.sin(ph * 1.4 - u * 3) * 1.4 * u]); }
    ctx.fillStyle = S.accent; ctx.beginPath(); ribbonPath(ctx, pts, (tt) => 2.2 - tt * 1.4); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath();
    ribbonPath(ctx, pts.map((q) => [q[0], q[1] + 1.0]), (tt) => (0.5 * (1 - tt) + 0.15) * Math.max(1, (S.D || 1) * 1.2));
    ctx.fill();
  }
}

// The tip point of a weapon held at hand/ang (for swing trails), without drawing.
export function weaponTip(id, hand, ang) {
  const d = dirv(ang);
  switch (id) {
    case 'maul': return add(hand, d, 66);
    case 'knives': return add(hand, d, 21);
    case 'pole': return add(hand, d, 80);
    case 'censer': return add(hand, d, 33);
    case 'quill': return add(hand, d, 64);
    default: return add(hand, d, 60);
  }
}

export { BONE };
