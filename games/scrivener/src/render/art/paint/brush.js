// Offline ink brush. Owner: art. Used ONLY by the sprite bake (tools/ink_bake.mjs ->
// paint/bake.html); the game never runs this code, it draws the baked PNGs.
//
// A stroke is a brush dragged along a spline: its width follows a pressure curve
// (a quick landing with a small swell where the hairs splay, a long lift-off into a
// point), the hand wobbles a little, the edge has paper tooth, and a dry brush breaks
// into separate bristle tracks that run out of ink at different moments. A blunt end
// pools a bead of ink. Everything is seeded and deterministic.
//
// All coordinates are in art units; the bake scales the canvas so 1 unit = S px.

export const INK = '#0d0c0b';
export const PAPER = '#e7e0cc';
export const BONE = '#ece6d4';
export const HI = '#fbf8ef';
export const RED = '#8e1b12';

// ---- seeded randomness ------------------------------------------------------------

export function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s, i) => { const r = rng(s * 7919 + i * 104729 + 13); r(); return r(); };
// smooth 1-D value noise in [-1, 1]
export function noise1(seed) {
  return (x) => {
    const i = Math.floor(x), f = x - i;
    const a = hash(seed, i) * 2 - 1, b = hash(seed, i + 1) * 2 - 1;
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
export const mix = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
export const norm = (d) => { const l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };

// ---- paths ------------------------------------------------------------------------

// Catmull-Rom through the points, `k` samples per span
export function spline(pts, k = 8, closed = false) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  const n = pts.length;
  const P = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// even arc-length resample
export function resample(pts, step = 0.4) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s0 = 0;
    while (acc + seg - s0 >= step) {
      const need = step - acc;
      s0 += need;
      const t = s0 / seg;
      out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      acc = 0;
    }
    acc += seg - s0;
  }
  const last = pts[pts.length - 1];
  const o = out[out.length - 1];
  if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.3) out.push(last);
  return out;
}
export function arcLen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; }
function normals(P, closed = false) {
  const n = P.length;
  return P.map((p, i) => {
    const a = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)];
    const b = closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
    const d = norm([b[0] - a[0], b[1] - a[1]]);
    return [-d[1], d[0]];
  });
}
export function cubic(a, c1, c2, e, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]]);
  }
  return out;
}

// ---- the brush ----------------------------------------------------------------------

// Fill one ribbon: centre line P with full widths W, edges roughened by paper tooth.
function ribbon(g, P, W, { tooth = 0.12, seed = 1 } = {}) {
  if (P.length < 2) return;
  const N = normals(P);
  const nl = noise1(seed * 3 + 1), nr = noise1(seed * 3 + 2);
  const L = [], R = [];
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const h = W[i] / 2;
    const tl = h > 0.05 ? tooth * (nl(s * 1.7) * 0.7 + nl(s * 5.3) * 0.3) * Math.min(1, h * 2) : 0;
    const tr = h > 0.05 ? tooth * (nr(s * 1.7) * 0.7 + nr(s * 5.3) * 0.3) * Math.min(1, h * 2) : 0;
    L.push(add(P[i], N[i], h + tl));
    R.push(add(P[i], N[i], -h - tr));
  }
  g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
}

// pressure envelope: landing, splay swell, long lift-off
function envelope(t, tin, tout, pin, pout) {
  const a = tin > 0 ? Math.pow(Math.sin(Math.min(1, t / tin) * Math.PI / 2), pin) : 1;
  const b = tout > 0 ? Math.pow(Math.sin(Math.min(1, (1 - t) / tout) * Math.PI / 2), pout) : 1;
  return a * b;
}

/**
 * stroke(g, pts, opts): one brush stroke along the spline through pts.
 *  w        max width (units)
 *  tin/tout taper lengths as fractions of the stroke (0 = blunt)
 *  pin/pout taper shape (1 = round shoulder, 2 = needle)
 *  press(t) extra pressure multiplier
 *  swell    landing swell (0..0.5)
 *  wob      hand wobble amplitude (units)
 *  dry      0..1 dry-brush breakup toward the end
 *  edgeDry  0..1 bristle breakup along the edges for the whole stroke
 *  pool     ink bead at a blunt end
 *  color, seed, tooth
 */
export function stroke(g, pts, o = {}) {
  const {
    w = 2, tin = 0.15, tout = 0.5, pin = 0.8, pout = 1.1, press = null, swell = 0.18, wob = 0.25,
    dry = 0, edgeDry = 0, pool = 0, color = INK, seed = 1, tooth = 0.1, k = 8, step = 0.3, alpha = 1,
  } = o;
  let P = resample(spline(pts, k), step);
  if (P.length < 2) return;
  const total = arcLen(P);
  const N = normals(P);
  const nw = noise1(seed * 11 + 5), np = noise1(seed * 11 + 6);
  let s = 0;
  const T = [], W = [];
  P = P.map((p, i) => {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const t = total > 0 ? s / total : 0;
    T.push(t);
    const off = wob * (nw(s / 9) * 0.8 + nw(s / 3.1) * 0.2) * Math.sin(Math.PI * t);
    let width = w * envelope(t, tin, tout, pin, pout) * (1 + swell * Math.exp(-Math.pow((t - Math.max(0.06, tin * 0.9)) / 0.07, 2)));
    width *= 1 + 0.08 * np(s / 4);
    if (press) width *= press(t);
    W.push(Math.max(0, width));
    return add(p, N[i], off);
  });
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  if (!dry && !edgeDry) {
    g.beginPath();
    ribbon(g, P, W, { tooth: tooth * Math.min(1, w), seed });
    if (pool) {
      const e = P[P.length - 1], r = W[W.length - 1] * 0.5 + pool;
      g.moveTo(e[0] + r, e[1]); g.arc(e[0], e[1], r, 0, Math.PI * 2);
      const a = P[0], r0 = W[0] * 0.5 + pool * 0.6;
      if (r0 > 0.3) { g.moveTo(a[0] + r0, a[1]); g.arc(a[0], a[1], r0, 0, Math.PI * 2); }
    }
    g.fill();
    g.restore();
    return;
  }
  // bristle model: a solid wet core plus separate hair tracks that run dry
  const B = clamp(Math.round(w / 0.42), 5, 48);
  const r = rng(seed * 31 + 7);
  const hairs = [];
  for (let j = 0; j < B; j++) {
    const l = (j + 0.5) / B * 2 - 1 + (r() - 0.5) * 0.6 / B;
    const edge = Math.abs(l);
    hairs.push({
      l,
      load: 1.05 - r() * 0.25,
      rate: (dry * (0.5 + r() * 1.3) + edgeDry * edge * edge * 2.2) * (1 + edge * 1.4),
      nz: noise1(seed * 97 + j * 13),
      start: edgeDry * edge * r() * 0.15,
    });
  }
  g.beginPath();
  // wet core
  const coreK = 1 - 0.75 * Math.max(dry, edgeDry * 0.8);
  ribbon(g, P, W.map((x, i) => x * coreK * (1 - dry * T[i] * 0.6)), { tooth: tooth * 0.5, seed });
  for (const h of hairs) {
    let run = null;
    const flush = () => { if (run && run.P.length > 1) ribbon(g, run.P, run.W, { tooth: 0.03, seed: seed + 3 }); run = null; };
    for (let i = 0; i < P.length; i++) {
      const t = T[i];
      const ink = h.load - h.rate * t + 0.38 * h.nz(t * total / 2.2) + 0.12 * h.nz(t * total / 0.7 + 40);
      const on = ink > 0.3 && t >= h.start;
      if (on) {
        if (!run) run = { P: [], W: [] };
        run.P.push(add(P[i], N[i], h.l * W[i] / 2));
        run.W.push((W[i] / B) * 1.75 * clamp(ink * 1.3, 0.35, 1));
      } else flush();
    }
    flush();
  }
  g.fill();
  g.restore();
}

// white carving over black: a fold or rim light, hairline at both ends
export function carve(g, pts, o = {}) {
  stroke(g, pts, { w: 1.1, tin: 0.3, tout: 0.45, pin: 1, pout: 1.2, swell: 0.1, wob: 0.15, color: PAPER, tooth: 0.05, ...o });
}

// a filled shape with a brushed (not vector) edge
export function mass(g, outline, o = {}) {
  const { color = INK, rough = 0.25, seed = 1, k = 6, scale = 3 } = o;
  const P = resample(spline(outline, k, true), 0.3);
  const N = normals(P, true);
  const nz = noise1(seed * 5 + 9);
  let s = 0;
  g.fillStyle = color;
  g.beginPath();
  P.forEach((p, i) => {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const q = add(p, N[i], rough * (nz(s / scale) * 0.75 + nz(s / (scale * 0.3)) * 0.25));
    if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
  });
  g.closePath();
  g.fill();
}
export function pathOf(g, outline, k = 6) {
  const P = spline(outline, k, true);
  g.beginPath();
  P.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
}

/**
 * contourLine: an ink contour whose weight follows the light. Thick (wMax) where the
 * surface turns away from the light, thinning to a hairline and breaking where it
 * faces it. `side` = +1 if the shape's interior is on the right of the walk direction.
 */
export function contourLine(g, pts, o = {}) {
  const { light = [0.41, -0.91], wMin = 0.35, wMax = 2.4, closed = false, side = 1, seed = 1, breaks = 0.55, k = 6, color = INK, dryEnd = 0 } = o;
  const P = resample(spline(pts, k, closed), 0.3);
  if (closed) P.push(P[0]);
  const N = normals(P);
  const nz = noise1(seed * 17 + 3);
  const runs = [];
  let cur = null;
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const out = [-N[i][0] * side, -N[i][1] * side]; // outward normal
    const lit = out[0] * light[0] + out[1] * light[1];
    const sh = smooth(-0.15, 0.85, -lit);
    let wv = lerp(wMin, wMax, sh) * (1 + 0.18 * nz(s / 5));
    const gap = breaks > 0 && lit > breaks && nz(s / 7 + 50) > 0.1;
    if (gap) { if (cur) { runs.push(cur); cur = null; } continue; }
    if (!cur) cur = { P: [], W: [] };
    cur.P.push(P[i]); cur.W.push(wv);
  }
  if (cur) runs.push(cur);
  g.fillStyle = color;
  g.beginPath();
  for (const r of runs) {
    if (r.P.length < 2) continue;
    const n = r.P.length;
    const W = r.W.map((x, i) => {
      const e = Math.min(i, n - 1 - i) * 0.3; // taper into each break
      return x * Math.min(1, 0.15 + e / 2.2);
    });
    ribbon(g, r.P, W, { tooth: 0.1, seed: seed + runs.indexOf(r) });
  }
  g.fill();
}

/**
 * Cross-contour hatching on a limb: `axis(s)` -> {p, d, r} for s in [0,1] (centre,
 * unit direction, radius). Each hatch starts at the shadow contour (heaviest there) and
 * wraps round the cylinder toward the light, tapering to a hair. `bow` is how far the
 * cross-section ellipse bows along the axis (the view from slightly above).
 */
export function wrapHatch(g, axis, o = {}) {
  const { s0 = 0, s1 = 1, step = 1.8, len = 0.55, w = 0.75, bow = 0.35, light = [0.41, -0.91], seed = 1, color = INK, jitter = 0.35, sideFix = 0, lenFn = null } = o;
  const r = rng(seed);
  g.fillStyle = color;
  g.beginPath();
  // total length along the axis
  let L = 0, prev = axis(s0).p;
  for (let i = 1; i <= 40; i++) { const q = axis(lerp(s0, s1, i / 40)).p; L += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  const n = Math.max(1, Math.floor(L / step));
  for (let i = 0; i <= n; i++) {
    const s = lerp(s0, s1, (i + (r() - 0.5) * jitter) / n);
    const A = axis(clamp(s, 0, 1));
    const nn = [-A.d[1], A.d[0]];
    let sd = sideFix || ((nn[0] * light[0] + nn[1] * light[1]) > 0 ? -1 : 1); // toward the shadow
    const ln = (lenFn ? lenFn(s) : len) * (0.75 + r() * 0.5);
    if (ln <= 0.02) continue;
    const pts = [];
    const M = 8;
    for (let k = 0; k <= M; k++) {
      const th = (k / M) * ln * Math.PI; // 0 at the shadow edge
      const across = Math.cos(th) * A.r * 0.97;
      const along = Math.sin(th) * A.r * bow;
      pts.push(add(add(A.p, nn, sd * across), A.d, along));
    }
    ribbonPts(g, pts, (t) => w * Math.pow(1 - t, 0.9) * (0.75 + r() * 0.5) + 0.05, seed + i);
  }
  g.fill();
}

// a ribbon from explicit points + width function (no subpath begin/fill: batched)
export function ribbonPts(g, pts, wf, seed = 1) {
  const P = resample(spline(pts, 6), 0.3);
  const total = arcLen(P);
  let s = 0;
  const W = P.map((p, i) => { if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return Math.max(0, wf(total ? s / total : 0)); });
  ribbon(g, P, W, { tooth: 0.05, seed });
}

// parallel curved hatching laid inside a clip path
export function hatchField(g, clipFn, o = {}) {
  const { origin = [0, 0], dir = [1, 0], spacing = 1.6, count = 20, len = 20, curve = 0, w = 0.6, seed = 1, color = INK, taper = [0.25, 0.6], jitter = 0.3, lenJ = 0.4 } = o;
  const r = rng(seed);
  const d = norm(dir), n = [-d[1], d[0]];
  g.save();
  g.beginPath(); clipFn(g); g.clip();
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < count; i++) {
    const c = add(origin, n, (i + (r() - 0.5) * jitter) * spacing);
    const ln = len * (1 - lenJ / 2 + r() * lenJ);
    const a = add(c, d, -ln / 2 + (r() - 0.5) * ln * 0.2), e = add(c, d, ln / 2);
    const m = add(mix(a, e, 0.5), n, curve * ln);
    const P = resample(spline([a, m, e], 8), 0.3);
    const total = arcLen(P);
    let s = 0;
    const W = P.map((p, k) => { if (k) s += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); const t = s / total; return w * envelope(t, taper[0], taper[1], 0.8, 1.1); });
    ribbon(g, P, W, { tooth: 0.04, seed: seed + i });
  }
  g.fill();
  g.restore();
}

// a tapered thorn / talon / tatter: a curved spike from base (width w) to a point
export function spike(g, base, tip, w, o = {}) {
  const { bend = 0.15, color = INK, seed = 1, dry = 0, pin = 0.6, pout = 1.6 } = o;
  const d = [tip[0] - base[0], tip[1] - base[1]];
  const n = [-d[1], d[0]];
  const m = add(mix(base, tip, 0.5), n, bend);
  stroke(g, [base, m, tip], { w, tin: 0, tout: 0.95, pin, pout, swell: 0, wob: 0.15, dry, color, seed, tooth: 0.08 });
}

// small closed shapes: beads / studs with a dot highlight each
export function bead(g, c, r, o = {}) {
  const { hl = true, color = INK } = o;
  g.fillStyle = color;
  g.beginPath(); g.arc(c[0], c[1], r, 0, Math.PI * 2); g.fill();
  if (hl) {
    g.fillStyle = HI;
    g.beginPath(); g.arc(c[0] - r * 0.35, c[1] - r * 0.35, Math.max(0.35, r * 0.28), 0, Math.PI * 2); g.fill();
  }
}

// soft dilation of whatever has been drawn: a paper "lift" gap round the part
// round 19: `bias` = { dir: [x, y], min } makes the gap directional: full width on the
// side facing `dir`, shrinking to `min` of it on the far side (a drawn lift, not a ring)
export function halo(canvas, px, color = PAPER, bias = null) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const h = c.getContext('2d');
  const steps = bias ? 32 : 16;
  const bd = bias ? norm(bias.dir) : null;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    let r = px;
    if (bd) {
      const k = Math.max(0, Math.cos(a) * bd[0] + Math.sin(a) * bd[1]);
      r = px * (bias.min + (1 - bias.min) * Math.pow(k, 0.8));
    }
    // fill in the ring so a wide directional gap has no holes
    for (let j = 1; j <= Math.max(1, Math.ceil(r / 3)); j++) {
      const rr = r * j / Math.max(1, Math.ceil(r / 3));
      h.drawImage(canvas, Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  h.drawImage(canvas, 0, 0);
  h.globalCompositeOperation = 'source-in';
  h.fillStyle = color;
  h.fillRect(0, 0, c.width, c.height);
  h.globalCompositeOperation = 'source-over';
  h.drawImage(canvas, 0, 0);
  return c;
}

/**
 * formShade: how an inker shades a round form. A solid black shadow shape runs along the
 * shadow side, kept off the contour by a sliver of reflected light; its inner edge is
 * feathered into the light by tapered, bowed hatch strokes of uneven length (cross-
 * contours, so they wrap the volume). `axis(s)` -> {p, d, r} as for wrapHatch.
 */
export function formShade(g, axis, o = {}) {
  const {
    s0 = 0, s1 = 1, core = 0.2, rim = 0.12, feather = 0.45, step = 1.15, w = 0.85, bow = 0.4,
    light = [0.41, -0.91], seed = 1, coreNoise = 0.55, color = INK, endFade = 0.12, sideFix = 0, coreFn = null,
    groups = 0, // round 20: >0 gathers the feathering into separate groups (strokes per unit of s)
  } = o;
  const nzg = noise1(seed * 19 + 4);
  const nz = noise1(seed * 19 + 1), nz2 = noise1(seed * 19 + 2);
  const r = rng(seed * 5 + 3);
  const at = (s) => {
    const A = axis(clamp(s, 0, 1));
    const nn = [-A.d[1], A.d[0]];
    const sd = sideFix || ((nn[0] * light[0] + nn[1] * light[1]) > 0 ? -1 : 1);
    const fade = smooth(s0, s0 + endFade, s) * (1 - smooth(s1 - endFade, s1, s));
    const c = (coreFn ? coreFn(s) : core) * (1 + coreNoise * (nz(s * 9) * 0.7 + nz(s * 23) * 0.3)) * fade;
    return { A, nn, sd, c: Math.max(0, c) };
  };
  const pos = (Q, th) => add(add(Q.A.p, Q.nn, Q.sd * Math.cos(th) * Q.A.r), Q.A.d, Math.sin(th) * Q.A.r * bow);
  const thOf = (x) => Math.acos(clamp(x, -1, 1));
  g.fillStyle = color;
  g.beginPath();
  // the shadow shape
  const M = 90, outer = [], inner = [];
  for (let i = 0; i <= M; i++) {
    const Q = at(lerp(s0, s1, i / M));
    const rimK = rim * (0.7 + 0.6 * (nz2(i * 0.31) * 0.5 + 0.5));
    outer.push(pos(Q, thOf(1 - rimK)));
    inner.push(pos(Q, thOf(1 - rimK - 2 * Q.c)));
  }
  const poly = outer.concat(inner.reverse());
  poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  // feathering strokes out of the shadow's edge
  let L = 0, prev = axis(s0).p;
  for (let i = 1; i <= 40; i++) { const q = axis(lerp(s0, s1, i / 40)).p; L += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  const n = Math.max(1, Math.floor(L / step));
  for (let i = 0; i <= n; i++) {
    const s = lerp(s0, s1, (i + (r() - 0.5) * 0.6) / n);
    const Q = at(s);
    if (Q.c < 0.01) continue;
    const x0 = 1 - rim - 2 * Q.c;
    let len = feather * (0.25 + r() * 1.05) * (0.6 + 0.4 * (nz(s * 31 + 7) + 1));
    if (groups) {
      // a group swells to long strokes in its middle and thins to short nicks between
      const gv = nzg(s * groups) * 0.7 + nzg(s * groups * 2.3 + 9) * 0.3;
      if (gv < -0.3) { if (r() < 0.7) continue; len *= 0.25; }
      else len *= 0.55 + 0.9 * smooth(-0.3, 0.6, gv);
    }
    const th0 = thOf(x0 + 0.25 * Q.c), th1 = thOf(Math.max(-0.98, x0 - len));
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push(pos(Q, lerp(th0, th1, k / 6)));
    ribbonPts(g, pts, (t) => w * (0.8 + r() * 0.4) * Math.pow(1 - t, 1.1) + 0.04, seed + i);
  }
  g.fill();
}

// round 29: a paper lift gap whose width is DRAWN, not dilated: its radius at every
// point is the part's halo width x the light bias x a smooth noise along the contour,
// so the gap swells, tapers to nothing and breaks (where two forms simply merge into
// one black), instead of running round the part as an even keyline. Exact nearest-
// edge distances (dead-reckoning distance transform), so it stays crisp at any width.
export function haloVar(canvas, px, color = PAPER, bias = null, { seed = 1, wave = 60, lo = -0.4, hi = 1.95 } = {}) {
  const W = canvas.width, H = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const N = W * H, INF = 1e9;
  const d = new Float32Array(N).fill(INF), nx = new Int32Array(N).fill(-1), ny = new Int32Array(N).fill(-1);
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) if (src[i * 4 + 3] >= 128) { d[i] = 0; nx[i] = x; ny[i] = y; }
  const relax = (x, y, i, qx, qy) => {
    if (qx < 0 || qy < 0 || qx >= W || qy >= H) return;
    const j = qy * W + qx;
    if (nx[j] < 0) return;
    const dd = Math.hypot(x - nx[j], y - ny[j]);
    if (dd < d[i]) { d[i] = dd; nx[i] = nx[j]; ny[i] = ny[j]; }
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!d[i]) continue; relax(x, y, i, x - 1, y - 1); relax(x, y, i, x, y - 1); relax(x, y, i, x + 1, y - 1); relax(x, y, i, x - 1, y); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!d[i]) continue; relax(x, y, i, x + 1, y); relax(x, y, i, x - 1, y + 1); relax(x, y, i, x, y + 1); relax(x, y, i, x + 1, y + 1); }
  // smooth value noise on a lattice `wave` px apart
  const R = rng(seed);
  const gw = Math.ceil(W / wave) + 2, gh = Math.ceil(H / wave) + 2;
  const lat = new Float32Array(gw * gh).map(() => R());
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const fx = x / wave, fy = y / wave, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const a = lat[iy * gw + ix], b = lat[iy * gw + ix + 1], c = lat[(iy + 1) * gw + ix], e = lat[(iy + 1) * gw + ix + 1];
    return (a + (b - a) * tx) + ((c + (e - c) * tx) - (a + (b - a) * tx)) * ty;
  };
  const bd = bias ? norm(bias.dir) : null;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const og = out.getContext('2d');
  const img = og.createImageData(W, H);
  const o = img.data;
  const col = color.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
  const maxR = px * Math.max(1, hi) + 2;
  for (let i = 0; i < N; i++) {
    if (d[i] === 0 || d[i] > maxR || nx[i] < 0) continue;
    const x = i % W, y = (i - x) / W;
    let r = px;
    if (bd) {
      const ux = (x - nx[i]) / (d[i] || 1), uy = (y - ny[i]) / (d[i] || 1);
      const k = Math.max(0, ux * bd[0] + uy * bd[1]);
      r = px * (bias.min + (1 - bias.min) * Math.pow(k, 0.8));
    }
    // the noise is read at the nearest edge point, so the width runs ALONG the contour
    r *= Math.max(0, lo + (hi - lo) * noise(nx[i], ny[i]));
    const a = Math.max(0, Math.min(1, r - (d[i] - 0.5)));
    if (a <= 0) continue;
    o[i * 4] = col[0]; o[i * 4 + 1] = col[1]; o[i * 4 + 2] = col[2]; o[i * 4 + 3] = Math.round(a * 255);
  }
  og.putImageData(img, 0, 0);
  og.drawImage(canvas, 0, 0);
  return out;
}

// ---- round 34: the living ink edge ---------------------------------------------------
// A bake-time pass over a finished part (before its paper gap): every edge in it, the
// silhouette AND the carved whites inside the black, is re-inked as ink on paper rather
// than a vector fill. (1) the hand's wobble: the whole image is resampled through a
// smooth two-octave displacement field, so a contour drifts ~1 px off its curve over a
// long wave and roughens over a short one; (2) pressure: the alpha is re-cut to a near
// 1-bit edge at a threshold that swells and starves along the contour (the line breathes
// thicker and thinner); (3) bleed: where the ink surrounds a pixel on most sides (the
// crotch between two spikes, the inside of a corner, the root of a claw) it pools and
// fills; (4) dry brush: on the edges of the big masses, in patches, the edge recedes
// raggedly and splits into streaks running along it, where the brush ran fast;
// (5) greys left by anti-aliasing between ink and paper are snapped to one or the other.
// Thin strokes and needle tips are spared the dry pass, so points stay sharp.
function latticeNoise(seed, wave, W, H) {
  const R = rng(seed);
  const gw = Math.ceil(W / wave) + 3, gh = Math.ceil(H / wave) + 3;
  const lat = new Float32Array(gw * gh).map(() => R());
  return (x, y) => {
    const fx = Math.max(0, x / wave + 1), fy = Math.max(0, y / wave + 1);
    const ix = Math.min(gw - 2, Math.floor(fx)), iy = Math.min(gh - 2, Math.floor(fy));
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = lat[iy * gw + ix], b = lat[iy * gw + ix + 1], c = lat[(iy + 1) * gw + ix], e = lat[(iy + 1) * gw + ix + 1];
    const top = a + (b - a) * tx;
    return top + (c + (e - c) * tx - top) * ty;
  };
}
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[y * W + Math.min(W - 1, Math.max(0, k))] * (k < 0 || k >= W ? 0 : 1);
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = s / n;
      const xo = x - r, xi = x + r + 1;
      if (xo >= 0) s -= src[y * W + xo];
      if (xi < W) s += src[y * W + xi];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = 0; k <= r && k < H; k++) s += tmp[k * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = s / n;
      const yo = y - r, yi = y + r + 1;
      if (yo >= 0) s -= tmp[yo * W + x];
      if (yi < H) s += tmp[yi * W + x];
    }
  }
  return out;
}
export function inkEdge(canvas, { S = 3, seed = 1, amp = 0.8, wave = 11, amp2 = 0.3, wave2 = 2.4, press = 0.14, bleed = 1, dry = 0.5 } = {}) {
  const W = canvas.width, H = canvas.height, N = W * H;
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, W, H), d = img.data;
  // premultiplied source planes
  const A = new Float32Array(N), Rp = new Float32Array(N), Gp = new Float32Array(N), Bp = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = d[i * 4 + 3] / 255; A[i] = a; Rp[i] = d[i * 4] * a; Gp[i] = d[i * 4 + 1] * a; Bp[i] = d[i * 4 + 2] * a; }
  const nx1 = latticeNoise(seed * 3 + 1, wave * S, W, H), ny1 = latticeNoise(seed * 3 + 2, wave * S, W, H);
  const nx2 = latticeNoise(seed * 5 + 7, wave2 * S, W, H), ny2 = latticeNoise(seed * 5 + 8, wave2 * S, W, H);
  const nP = latticeNoise(seed * 7 + 3, 6 * S, W, H), nP2 = latticeNoise(seed * 7 + 4, 1.6 * S, W, H);
  const nD = latticeNoise(seed * 11 + 5, 16 * S, W, H), nT = latticeNoise(seed * 11 + 6, 2.2 * S, W, H);
  const a1 = amp * S * 2, a2 = amp2 * S * 2;
  // 1. displaced bilinear resample
  const A1 = new Float32Array(N), R1 = new Float32Array(N), G1 = new Float32Array(N), B1 = new Float32Array(N);
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const sx = x + a1 * (nx1(x, y) - 0.5) + a2 * (nx2(x, y) - 0.5);
    const sy = y + a1 * (ny1(x, y) - 0.5) + a2 * (ny2(x, y) - 0.5);
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    let aa = 0, rr = 0, gg = 0, bb = 0;
    for (let k = 0; k < 4; k++) {
      const qx = ix + (k & 1), qy = iy + (k >> 1);
      if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
      const wgt = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy);
      const j = qy * W + qx;
      aa += A[j] * wgt; rr += Rp[j] * wgt; gg += Gp[j] * wgt; bb += Bp[j] * wgt;
    }
    A1[i] = aa; R1[i] = rr; G1[i] = gg; B1[i] = bb;
  }
  const r1 = Math.max(1, Math.round(0.7 * S)), r2 = Math.max(2, Math.round(1.5 * S));
  const Ab = boxBlur(A1, W, H, r1), Ab2 = boxBlur(A1, W, H, r2);
  const Rb = bleed ? boxBlur(R1, W, H, r1) : null, Gb = bleed ? boxBlur(G1, W, H, r1) : null, Bb = bleed ? boxBlur(B1, W, H, r1) : null;
  const inkC = [13, 12, 11], papC = [231, 224, 204];
  const Lof = (r, gg, b) => (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
  const Lk = Lof(...inkC), Lp = Lof(...papC);
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    let a = A1[i], pr = R1[i], pg = G1[i], pb = B1[i];
    // 3. bleed: a pixel mostly surrounded by ink pools
    if (bleed && a < 0.5 && Ab[i] > 0.6 - 0.06 * bleed) {
      const k = Ab[i];
      pr = Rb[i] / k; pg = Gb[i] / k; pb = Bb[i] / k; a = 1;
    } else if (a > 0) { pr /= a; pg /= a; pb /= a; }
    // 2. pressure: the cut level breathes along the contour
    let th = 0.5 + press * (2 * nP(x, y) - 1) + press * 0.5 * (2 * nP2(x, y) - 1);
    // 4. dry brush on the edges of the masses, in patches
    let dryCut = false;
    if (dry > 0 && Ab2[i] > 0.4 && Ab[i] < 0.93 && Ab[i] > 0.3) {
      const patch = smooth(0.55, 0.8, nD(x, y)) * dry;
      if (patch > 0) {
        th += patch * 0.35 * nT(x, y);
        // streaks along the edge: stripes across the alpha gradient
        const gx = Ab[Math.min(N - 1, i + 1)] - Ab[Math.max(0, i - 1)], gy = Ab[Math.min(N - 1, i + W)] - Ab[Math.max(0, i - W)];
        const gl = Math.hypot(gx, gy);
        if (gl > 1e-4) {
          const s = (x * gx + y * gy) / gl / S; // across the edge, in art units
          const stripe = Math.sin(s * 2 * Math.PI / 0.95 + 6 * nT(x, y));
          if (stripe > 1 - 0.55 * patch && nT(x * 0.3, y * 0.3) > 0.42) dryCut = true;
        }
      }
    }
    let ao = dryCut ? 0 : smooth(th - 0.1, th + 0.1, a);
    // 5. snap the anti-aliased greys between ink and paper
    if (ao > 0) {
      const L = Lof(pr, pg, pb), t = (L - Lk) / (Lp - Lk);
      if (t > 0.06 && t < 0.94) {
        const tt = smooth(0.35, 0.65, t);
        if (tt < t) { const m = (t - tt) / t; pr += (inkC[0] - pr) * m; pg += (inkC[1] - pg) * m; pb += (inkC[2] - pb) * m; }
        else { const m = (tt - t) / (1 - t); pr += (papC[0] - pr) * m; pg += (papC[1] - pg) * m; pb += (papC[2] - pb) * m; }
      }
    }
    d[i * 4] = Math.round(clamp(pr, 0, 255)); d[i * 4 + 1] = Math.round(clamp(pg, 0, 255)); d[i * 4 + 2] = Math.round(clamp(pb, 0, 255));
    d[i * 4 + 3] = Math.round(ao * 255);
  }
  g.putImageData(img, 0, 0);
  return canvas;
}
