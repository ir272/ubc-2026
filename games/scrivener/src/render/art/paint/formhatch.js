// Round 31: modelling the black masses with the pen. Owner: art. Bake-only.
// The black parts (torso, robe, far arms, shins) were flat slabs with a few even white
// ticks. Obata models a black mass the way he models a lit one, only in negative:
//   - FOLDS: long white negative lines, heavy on the shadow side of the form, swelling,
//     then thinning and breaking into dashes as they come round into the light;
//   - FRINGES: short curved hatch strokes in GROUPS laid off a lit edge or off a fold's
//     lit flank, each landing heavy and lifting into a point, curved round the volume,
//     lengths and gaps uneven, a group of 3-6 then a gap;
//   - POCKETS: a crosshatch mesh only where the form folds deepest (under the cage,
//     the armpit, under the robe), feathered out so it has no edge.
// Every mark is clipped to the existing ink (white carves) or to the bone (black hatch),
// so nothing spills onto the paper. Sizes in art units (1 unit = 1.25 px at 1x).

import { penStroke, INK, PAPER } from './pen.js';
import { rng } from './brush.js';

// round 31 scale for 1x legibility (1 unit = 1.25 px at 1x)
// round 32: fewer, bolder marks: at 1x the dense white fringes averaged to a grey that
// made the black arms and robe read pale and unmodelled; wider pitch, heavier strokes
export const BOLD = { pitch: 2.25, w: 1.95, len: 1.5, xpitch: 1.75, xw: 1.85, fold: 1.45 };

// round 32: drop the hairline white strokes ('w' marks whose widest point is under minW
// art units) from a pen.js text: below ~1 px at 1x they only grey the black
export function dropHairlines(T, minW) {
  return T.split('\n').filter((l) => {
    const m = l.trim().match(/^w\s+(.*)$/);
    if (!m) return true;
    const ws = m[1].split(',').map((p) => parseFloat(p.trim().split(/\s+/)[2]));
    return Math.max(...ws) >= minW;
  }).join('\n');
}
const nrm = (d) => { const l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
const rot = (d, a) => { const c = Math.cos(a), s = Math.sin(a); return [d[0] * c - d[1] * s, d[0] * s + d[1] * c]; };

// Catmull-Rom resample of a guide polyline to points every `step` units
function guide(P, step = 0.5) {
  const out = [];
  const n = P.length;
  const get = (i) => P[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.ceil(L / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(P[n - 1].slice(0, 2));
  // arc length
  let s = 0;
  const S = [0];
  for (let i = 1; i < out.length; i++) { s += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]); S.push(s); }
  const at = (u) => {
    const target = u * s;
    let i = 1; while (i < S.length - 1 && S[i] < target) i++;
    const f = (target - S[i - 1]) / ((S[i] - S[i - 1]) || 1);
    const a = out[i - 1], b = out[i];
    return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], d: nrm([b[0] - a[0], b[1] - a[1]]) };
  };
  return { pts: out, len: s, at };
}

// ---- clipping: draw marks only inside the ink (or only inside the bone) ---------------
let maskCache = null;
function maskOf(canvas, kind) {
  const W = canvas.width, H = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const m = document.createElement('canvas'); m.width = W; m.height = H;
  const mg = m.getContext('2d');
  const id = mg.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const a = src[i * 4 + 3];
    const l = 0.3 * src[i * 4] + 0.59 * src[i * 4 + 1] + 0.11 * src[i * 4 + 2];
    const on = a > 110 && (kind === 'ink' ? l < 90 : l >= 90);
    id.data[i * 4 + 3] = on ? 255 : 0;
  }
  mg.putImageData(id, 0, 0);
  if (kind === 'ink') {
    // round 32: grow the ink mask ~2 px over the part's own opaque pixels, so a mark
    // laid over an older carved line covers its anti-aliased edge too (that edge was
    // left out of the mask and showed as a dotted dark seam down the middle of the fold)
    const op = document.createElement('canvas'); op.width = W; op.height = H;
    const og = op.getContext('2d');
    const od = og.createImageData(W, H);
    for (let i = 0; i < W * H; i++) od.data[i * 4 + 3] = src[i * 4 + 3] > 110 ? 255 : 0;
    og.putImageData(od, 0, 0);
    const g2 = document.createElement('canvas'); g2.width = W; g2.height = H;
    const gg = g2.getContext('2d');
    for (const [dx, dy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]]) gg.drawImage(m, dx, dy);
    gg.globalCompositeOperation = 'destination-in';
    gg.drawImage(op, 0, 0);
    return g2;
  }
  return m;
}
// run fn(g2) with g's transform on a scratch canvas, then keep only what falls inside
// the `kind` mask of the canvas as it was BEFORE the marks, and lay it on
export function within(g, kind, fn) {
  const c = g.canvas, W = c.width, H = c.height;
  const mask = maskOf(c, kind);
  const s = document.createElement('canvas'); s.width = W; s.height = H;
  const sg = s.getContext('2d');
  sg.setTransform(g.getTransform());
  sg.lineJoin = 'round';
  fn(sg);
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.globalCompositeOperation = 'destination-in';
  sg.drawImage(mask, 0, 0);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(s, 0, 0);
  g.restore();
}

// ---- a fold: a long negative line, heavy in the shadow, breaking in the light -----------
// pts: guide points [x, y] from the SHADOW end to the LIT end. w: the widest. brk: where
// (0..1) it starts to break up; dashes after that get shorter and thinner.
export function fold(g, pts, { w: wIn = 1.4, brk = 0.6, color = PAPER, seed = 1, swell = 0.3, lead = 0.12 } = {}) {
  const G = guide(pts, 0.4);
  const r = rng(seed);
  const w = wIn * BOLD.fold;
  const N = 40;
  const width = (u) => {
    const landing = Math.min(1, u / lead);
    const body = u < swell ? 0.75 + 0.25 * (u / swell) : 1 - 0.55 * ((u - swell) / (1 - swell));
    return w * Math.max(0.04, landing * body);
  };
  // the solid run
  const solid = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * brk;
    const q = G.at(u).p;
    let wv = width(u);
    if (i === N) wv = 0.05;
    if (i === 0) wv = 0.05;
    solid.push([q[0], q[1], wv]);
  }
  penStroke(g, solid, color);
  // the broken run: dashes with gaps, shrinking
  let u = brk + 0.03 + r() * 0.03;
  let k = 0;
  while (u < 0.98 && k < 8) {
    const dl = (1 - u) * (0.35 + r() * 0.25);
    const u1 = Math.min(0.99, u + dl);
    const a = G.at(u).p, m = G.at((u + u1) / 2).p, b = G.at(u1).p;
    const wv = width(u) * (0.9 - k * 0.12);
    if (wv < 0.12) break;
    penStroke(g, [[a[0], a[1], 0.05], [m[0], m[1], wv], [b[0], b[1], 0.04]], color);
    u = u1 + 0.025 + r() * 0.05;
    k++;
  }
  return G;
}

// ---- a fringe: hatch groups rooted along a guide, laid to one side ------------------------
// side +1 lays them to the left of the guide's direction (canvas y down: rotate d by -90),
// -1 to the right. len(u) -> [min,max] length at guide position u (0..1).
export function fringe(g, pts, o = {}) {
  const {
    side = 1, len = [3, 7], pitch: pitch0 = 1.9, w: w0 = 0.95, tilt = 0, bow = 0.18, group = [3, 6], gap = [1.4, 3.2],
    color = PAPER, seed = 1, u0 = 0, u1 = 1, inset = 0.4, taper = 'lift', jitter = 0.12, shape = null,
  } = o;
  const G = guide(pts, 0.3);
  const r = rng(seed);
  // must survive 1x (1.25 px/unit): fewer, bolder marks rather than hairline fields
  const lenAt0 = typeof len === 'function' ? len : () => len;
  const lenAt = (u) => lenAt0(u).map((v) => v * BOLD.len);
  const pitch = pitch0 * BOLD.pitch, w = w0 * BOLD.w;
  let s = u0 * G.len + r() * pitch;
  const end = u1 * G.len;
  while (s < end) {
    const m = group[0] + Math.floor(r() * (group[1] - group[0] + 1));
    const peak = r(); // where in the group the longest stroke sits
    const gtilt = tilt + (r() - 0.5) * jitter * 2;
    const gscale = 0.6 + r() * 0.8;
    for (let j = 0; j < m && s < end; j++) {
      const u = s / G.len;
      const { p, d } = G.at(u);
      const n = side > 0 ? [d[1], -d[0]] : [-d[1], d[0]];
      const [lo, hi] = lenAt(u);
      const t = m > 1 ? j / (m - 1) : 0.5;
      const grade = 1 - 0.6 * Math.abs(t - peak);
      const L = Math.max(0.8, (lo + (hi - lo) * r()) * grade * gscale * (shape ? shape(u) : 1));
      const dir = rot(n, (gtilt + (r() - 0.5) * jitter) * side);
      const curve = [d[0] * bow * L * (side > 0 ? 1 : 1), d[1] * bow * L];
      const a = [p[0] - dir[0] * inset, p[1] - dir[1] * inset];
      const pt = (f, wv) => [a[0] + dir[0] * L * f + curve[0] * f * f, a[1] + dir[1] * L * f + curve[1] * f * f, wv];
      const wj = w * (0.8 + 0.4 * r()) * (0.7 + 0.3 * grade);
      if (taper === 'both') penStroke(g, [pt(0, 0.05), pt(0.3, wj), pt(0.6, wj * 0.75), pt(1, 0.04)], color);
      else penStroke(g, [pt(0, wj * 0.8), pt(0.14, wj), pt(0.5, wj * 0.55), pt(0.8, wj * 0.2), pt(1, 0.03)], color);
      s += pitch * (0.8 + 0.45 * r());
    }
    s += pitch * (gap[0] + (gap[1] - gap[0]) * r());
  }
}

// ---- a pocket: crosshatch feathered inside an ellipse -------------------------------------
export function pocket(g, c, o = {}) {
  const { rx = 8, ry = 5, ang = 0, pitch: p0 = 1.8, w: w0 = 0.6, a1 = 0.5, a2 = -0.6, color = PAPER, seed = 1, bow = 0.08, layers = 2 } = o;
  const r = rng(seed);
  const pitch = p0 * BOLD.xpitch, w = w0 * BOLD.xw;
  const fams = [a1, a2].slice(0, layers);
  fams.forEach((fa, f) => {
    const dir = [Math.cos(fa), Math.sin(fa)];
    const per = [-dir[1], dir[0]];
    const R = Math.max(rx, ry);
    for (let k = -R; k <= R; k += pitch * (0.85 + 0.3 * r())) {
      // chord of the ellipse along dir at offset k (in ellipse-local coords)
      const pts = [];
      for (let t = -R * 1.2; t <= R * 1.2; t += 0.25) {
        const x = per[0] * k + dir[0] * t, y = per[1] * k + dir[1] * t;
        const lx = x * Math.cos(-ang) - y * Math.sin(-ang), ly = x * Math.sin(-ang) + y * Math.cos(-ang);
        if ((lx / rx) ** 2 + (ly / ry) ** 2 <= 1) pts.push(t);
      }
      if (pts.length < 4) continue;
      let t0 = pts[0], t1 = pts[pts.length - 1];
      // ragged ends, each line its own length, so the patch has no outline; the second
      // layer stays nearer the middle (the deepest part)
      const span = t1 - t0;
      const lo = f ? 0.22 + 0.25 * r() : 0.04 + 0.32 * r();
      const hi = f ? 0.22 + 0.25 * r() : 0.04 + 0.32 * r();
      t0 += span * lo; t1 -= span * hi;
      if (r() < (f ? 0.3 : 0.12)) continue;
      if (t1 - t0 < 1.2) continue;
      const P = (t, wv) => {
        const b = Math.sin(((t - t0) / (t1 - t0)) * Math.PI) * bow * (t1 - t0);
        return [c[0] + per[0] * (k + b) + dir[0] * t, c[1] + per[1] * (k + b) + dir[1] * t, wv];
      };
      const wj = w * (0.75 + 0.5 * r()) * (f ? 0.85 : 1);
      penStroke(g, [P(t0, 0.04), P(t0 + (t1 - t0) * 0.25, wj), P(t0 + (t1 - t0) * 0.6, wj * 0.8), P(t1, 0.04)], color);
    }
  });
}
