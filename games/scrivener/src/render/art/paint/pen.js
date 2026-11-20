// Round 24: a hand-authored pen. Owner: art.
// Nothing here generates marks. Every mark of the parts drawn with it (skull, torso and
// open ribcage, the arms and hands, the robe front) is written out one by one as data:
// a spline through points the artist placed, each point carrying its own pen pressure,
// so every stroke has its own entry taper, swell and exit flick.
//
// Stroke data is a small text format, one mark per line:
//   k  x y w, x y w, ...    an ink stroke (w = width in art units at that point)
//   w  x y w, ...           a white line carved into black (paper)
//   h  x y w, ...           a highlight (brighter white), for glints
//   b  x y w, ...           a bone-coloured stroke (lays pale back over ink)
//   K  x y, x y, ...        a closed ink shape (smooth spline through the points)
//   W / H / B               closed shapes in paper / highlight / bone
//   KP / WP / BP            closed shapes with straight edges (hard, ruled objects)
//   #  ...                  a comment
// A stroke's width runs through the points as a Catmull-Rom spline as well, so a point
// with w 0 is a hairline tip and a run of rising widths is a swell.

export const INK = '#0d0c0b';
export const PAPER = '#e7e0cc';
export const BONE = '#ece6d4';
export const HI = '#fbf8ef';
const COL = { k: INK, w: PAPER, h: HI, b: BONE };
const LX = 0.6, LY = -0.8; // the light: from the upper front

// Catmull-Rom through points of any dimension, `k` samples per span
function cr(P, k, closed) {
  const n = P.length, out = [];
  if (n < 2) return P.slice();
  const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push(p1.map((_, d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  if (!closed) out.push(P[n - 1].slice());
  return out;
}

// one pressure stroke: pts = [[x, y, w], ...]
export function penStroke(g, pts, color = INK) {
  if (pts.length < 2) return;
  const S = cr(pts, 10, false);
  const n = S.length;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const hw = Math.max(0.035, S[i][2]) / 2;
    L.push([S[i][0] - dy * hw, S[i][1] + dx * hw]);
    R.push([S[i][0] + dy * hw, S[i][1] - dx * hw]);
  }
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
  // a round-ish tip only where the pen was pressing at the end
  for (let i = n - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  g.fill();
  // pressed ends get a small cap so a heavy start does not look sawn off
  const cap = (p) => { if (p[2] > 0.6) { g.beginPath(); g.arc(p[0], p[1], p[2] / 2, 0, Math.PI * 2); g.fill(); } };
}

export function penShape(g, pts, color = INK, hard = false) {
  const S = hard ? pts : cr(pts, 8, true);
  g.fillStyle = color;
  g.beginPath();
  S.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.fill();
}

const cache = new Map();
export function parse(src) {
  if (cache.has(src)) return cache.get(src);
  const out = [];
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const m = line.match(/^([A-Za-z]+)\s+(.*)$/);
    if (!m) continue;
    const op = m[1];
    const pts = m[2].split(',').map((s) => s.trim().split(/\s+/).map(Number)).filter((p) => p.length >= 2 && p.every((v) => !Number.isNaN(v)));
    out.push({ op, pts });
  }
  cache.set(src, out);
  return out;
}

// draw stroke data, optionally through a point map f([x, y]) -> [x, y] (and a width scale)
export function ink(g, src, { map = null, ws = 1 } = {}) {
  for (const { op, pts } of parse(src)) {
    const P = map ? pts.map((p) => { const q = map(p); return p.length > 2 ? [q[0], q[1], p[2] * ws] : q; }) : pts.map((p) => (p.length > 2 ? [p[0], p[1], p[2] * ws] : p));
    const c = op[0].toLowerCase();
    if (op === 'o') P.forEach((q) => bead(g, q[0], q[1], q[2] ?? 2));
    else if (op === 'n') {
      // an inked bone: the same authored stroke laid twice, ink under bone, the ink
      // shifted toward the shadow so its contour is a hair on the lit side, heavy below
      penStroke(g, P.map((q) => [q[0] - LX * 0.5, q[1] - LY * 0.5, q[2] + 1.15]), INK);
      penStroke(g, P.map((q) => [q[0] + LX * 0.15, q[1] + LY * 0.15, q[2]]), BONE);
    }
    else if (op === op.toLowerCase()) penStroke(g, P, COL[c] || INK);
    else penShape(g, P, { k: INK, w: PAPER, h: HI, b: BONE }[c] || INK, op.length > 1 && op[1] === 'P');
  }
}

// one bead: an ink ring, a bone body, its shadow crescent below and a dot of shine
export function bead(g, x, y, r) {
  g.fillStyle = INK; g.beginPath(); g.arc(x, y, r + Math.max(0.55, r * 0.28), 0, Math.PI * 2); g.fill();
  g.fillStyle = BONE; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.beginPath(); g.ellipse(x + r * 0.12, y + r * 0.22, r * 0.86, r * 0.58, 0, 0.15, Math.PI - 0.15); g.fill();
  g.fillStyle = HI; g.beginPath(); g.arc(x - r * 0.32, y - r * 0.34, Math.max(0.35, r * 0.24), 0, Math.PI * 2); g.fill();
}
