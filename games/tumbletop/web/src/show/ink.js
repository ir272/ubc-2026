// The site's hand-drawn line, for the stage's graphics. This is the drawing technique of the site's
// own UI library (Nightline, `web/src/ui/ink/`: rng.ts, stroke.ts, shapes.ts) written out in plain
// JavaScript so the game does not import from the site: a pen stroke is a filled ribbon whose width
// follows pen pressure, with a seeded wobble, so a drawing is the same on every render. Nightline's
// technique is after Kevin Ngo's Looseleaf (MIT).

// ------------------------------------------------------------------ seeded randomness
function mix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return mix(h);
}
function build(seed) {
  let s = seed || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.fork = (name) => build(mix(seed ^ hashStr(name)));
  return next;
}
export const makeRng = (seed) => build(hashStr(String(seed)));
function noise1(r, wl) {
  const base = (r() * 0xffffffff) >>> 0;
  const v = (i) => (mix((base + Math.imul(i, 0x9e3779b1)) >>> 0) / 4294967295) * 2 - 1;
  return (s) => {
    const x = s / wl, i = Math.floor(x), t = x - i, u = t * t * (3 - 2 * t);
    return v(i) * (1 - u) + v(i + 1) * u;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const f = (n) => String(Math.round(n * 100) / 100);

// ------------------------------------------------------------------ one pen stroke
function resample(pts, step) {
  const X = [pts[0][0]], Y = [pts[0][1]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg === 0) continue;
    let d = step - carry;
    while (d <= seg) { X.push(ax + ((bx - ax) * d) / seg); Y.push(ay + ((by - ay) * d) / seg); d += step; }
    carry = seg - (d - step);
  }
  const [lx, ly] = pts[pts.length - 1];
  const n = X.length - 1;
  if (Math.hypot(X[n] - lx, Y[n] - ly) > step * 0.35) { X.push(lx); Y.push(ly); }
  else if (n > 0) { X[n] = lx; Y[n] = ly; }
  return { X, Y };
}

/** A stroke through `points` with pen `{ w, wobble, dry, ends }`: returns the ribbon's path data. */
export function stroke(points, pen, seed) {
  const rng = makeRng(seed);
  const step = pen.w < 1.2 ? 1.8 : 2.2;
  const { X, Y } = resample(points, step);
  const N = X.length;
  if (N < 2) return '';
  const S = new Array(N).fill(0);
  for (let i = 1; i < N; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  const L = S[N - 1];

  const wob = pen.wobble ?? 1;
  if (wob > 0 && N > 2) {
    const nLow = noise1(rng.fork('low'), 70), nMid = noise1(rng.fork('mid'), 22), nTr = noise1(rng.fork('tr'), 4.5);
    const amp = 0.75 * wob * clamp(L / 120, 0.25, 1.25);
    const dx = new Array(N), dy = new Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      const tx = X[b] - X[a], ty = Y[b] - Y[a], l = Math.hypot(tx, ty) || 1;
      const off = amp * (nLow(S[i]) + 0.3 * nMid(S[i])) + 0.13 * wob * nTr(S[i]);
      dx[i] = (ty / l) * off; dy[i] = (-tx / l) * off;
    }
    for (let i = 0; i < N; i++) { X[i] += dx[i]; Y[i] += dy[i]; }
  }

  const NX = new Array(N), NY = new Array(N), th = new Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
    const tx = X[b] - X[a], ty = Y[b] - Y[a], l = Math.hypot(tx, ty) || 1;
    NX[i] = ty / l; NY[i] = -tx / l; th[i] = Math.atan2(ty, tx);
  }
  const wrap = (a) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);
  const ends = pen.ends ?? 'taper';
  const V = new Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
    const turn = Math.abs(wrap(th[b] - th[a])) / Math.max(1, b - a);
    const vC = 1 / (1 + turn * 6);
    const vA = ends === 'none' ? 1 : Math.min(1, Math.sqrt((S[i] + 0.6) / 9));
    const vD = ends === 'none' ? 1 : Math.min(1, Math.sqrt((L - S[i] + 0.6) / 12));
    V[i] = Math.min(vA, vD, vC);
  }
  const nW = noise1(rng.fork('w'), 9), nP = noise1(rng.fork('p'), 40), nTooth = noise1(rng.fork('tooth'), 6);
  const dry = pen.dry ?? 0.5;
  const hw = new Array(N);
  for (let i = 0; i < N; i++) {
    const s = S[i];
    let h = 0.5 * pen.w * (0.8 + 0.42 * (1 - V[i])) * (1 + 0.12 * nW(s)) * (1 + 0.09 * nP(s));
    if (ends !== 'none') {
      const t0 = Math.min(0.3 * L, 4), t1 = Math.min(0.4 * L, ends === 'taper' ? 9 : 4);
      if (s < t0) h *= 0.6 + 0.4 * (s / t0);
      if (L - s < t1) h *= (ends === 'taper' ? 0.3 : 0.6) + (ends === 'taper' ? 0.7 : 0.4) * ((L - s) / t1);
    }
    if (dry > 0 && V[i] > 0.6) {
      const d = nTooth(s);
      if (d > 0.35) h *= 1 - 0.55 * dry * Math.min(1, (d - 0.35) / 0.3);
    }
    hw[i] = Math.max(0.16, h);
  }
  const ring = [];
  for (let i = 0; i < N; i++) ring.push([X[i] + NX[i] * hw[i], Y[i] + NY[i] * hw[i]]);
  for (let i = N - 1; i >= 0; i--) ring.push([X[i] - NX[i] * hw[i], Y[i] - NY[i] * hw[i]]);
  const M = ring.length;
  const mid = (i) => { const a = ring[i % M], b = ring[(i + 1) % M]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const m0 = mid(0);
  let d = `M${f(m0[0])} ${f(m0[1])}`;
  for (let i = 1; i <= M; i++) { const p = ring[i % M], m = mid(i); d += `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`; }
  return d + 'Z';
}

// ------------------------------------------------------------------ the shapes (as on the chart)
export const PEN = {
  rule: { w: 1.3, wobble: 0.5, dry: 0.45 },    // the chart's ruled lines
  fine: { w: 0.9, wobble: 0.45, dry: 0.6 },    // rhumb lines, inner rings
  bold: { w: 1.9, wobble: 0.7, dry: 0.3 },     // coastlines, the selected thing
  pencil: { w: 1.15, wobble: 0.6, dry: 0.95 }, // coloured-pencil shading
};

/** One ruled line. */
export const rule = (x1, y1, x2, y2, seed, pen = PEN.rule) => stroke([[x1, y1], [x2, y2]], pen, seed);

/** Four ruled lines that run past the corners and cross. */
export function ruledBox(x, y, w, h, seed, pen = PEN.rule, over = 5) {
  const r = makeRng(seed);
  const o = () => over * (0.55 + 0.9 * r());
  const k = () => (r() - 0.5) * 0.8;
  return stroke([[x - o(), y + k()], [x + w + o(), y + k()]], pen, seed + ':t')
    + stroke([[x + w + k(), y - o()], [x + w + k(), y + h + o()]], pen, seed + ':r')
    + stroke([[x + w + o(), y + h + k()], [x - o(), y + h + k()]], pen, seed + ':b')
    + stroke([[x + k(), y + h + o()], [x + k(), y - o()]], pen, seed + ':l');
}

function arc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 2.5));
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}

/** A rounded box drawn in one go; the end runs a little past the start, as a hand does. */
export function loopBox(x, y, w, h, r, seed, pen = PEN.rule, overlap = 9) {
  const rr = Math.min(r, w / 2, h / 2), q = Math.PI / 2;
  const rng = makeRng(seed);
  const lift = 0.5 + rng() * 0.7;
  const pts = [
    [x + rr, y],
    ...arc(x + w - rr, y + rr, rr, rr, -q, 0),
    ...arc(x + w - rr, y + h - rr, rr, rr, 0, q),
    ...arc(x + rr, y + h - rr, rr, rr, q, 2 * q),
    ...arc(x + rr, y + rr, rr, rr, 2 * q, 3 * q).map(([px, py], i, a) => [px, py - (lift * i) / a.length]),
    [x + rr + Math.min(overlap, w - 2 * rr), y - lift - 0.4],
  ];
  return stroke(pts, { ...pen, ends: 'taper' }, seed);
}

/** Pencil hatching inside a rectangle: parallel strokes laid down back and forth. */
export function hatch(x, y, w, h, seed, o = {}) {
  if (w <= 1 || h <= 1) return '';
  const rng = makeRng(seed);
  const gap = o.gap ?? 4;
  const th = ((o.angle ?? -58) * Math.PI) / 180;
  const ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
  const cs = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => px * nx + py * ny);
  const cMin = Math.min(...cs), cMax = Math.max(...cs);
  let d = '', i = 0;
  for (let c = cMin + gap * (0.3 + 0.5 * rng()); c < cMax; c += gap * (0.72 + 0.56 * rng())) {
    let t0 = -Infinity, t1 = Infinity;
    const ox = c * nx, oy = c * ny;
    const slab = (o0, dir, lo, hi) => {
      if (Math.abs(dir) < 1e-6) { if (o0 < lo || o0 > hi) t1 = -Infinity; return; }
      const a = (lo - o0) / dir, b = (hi - o0) / dir;
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    };
    slab(ox, ux, x, x + w); slab(oy, uy, y, y + h);
    if (t1 - t0 < 2.5) continue;
    const a = t0 + rng() * 1.6, b = t1 - rng() * 1.6;
    const p0 = [ox + a * ux, oy + a * uy], p1 = [ox + b * ux, oy + b * uy];
    d += stroke(i % 2 ? [p1, p0] : [p0, p1], o.pen ?? PEN.pencil, `${seed}:${i}`);
    i++;
  }
  return d;
}

/** A filled plate with a hand-cut edge. */
export function plate(x, y, w, h, seed) {
  const rng = makeRng(seed);
  const j = () => (rng() - 0.5) * 1.1;
  const p = (px, py) => `${(px + j()).toFixed(2)} ${(py + j()).toFixed(2)}`;
  const mx = x + w / 2, my = y + h / 2;
  return `M${p(x + 1.2, y)}L${p(mx, y)}L${p(x + w - 1.2, y)}L${p(x + w, y + 1.2)}L${p(x + w, my)}L${p(x + w, y + h - 1.2)}L${p(x + w - 1.2, y + h)}L${p(mx, y + h)}L${p(x + 1.2, y + h)}L${p(x, y + h - 1.2)}L${p(x, my)}L${p(x, y + 1.2)}Z`;
}

/** The four-point star from the chart's moon medallion. */
export function star4(cx, cy, r, seed) {
  const rng = makeRng(seed);
  const q = Math.PI / 2;
  const tip = (a, k) => { const rr = r * k * (0.94 + 0.12 * rng()); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; };
  const tips = [tip(-q, 1.12), tip(0, 0.86), tip(q, 1.12), tip(2 * q, 0.86)];
  const inner = (a) => { const rr = r * 0.17 * (0.9 + 0.2 * rng()); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; };
  const ctr = [inner(-q / 2), inner(q / 2), inner(1.5 * q), inner(2.5 * q)];
  const s = ([a, b]) => `${a.toFixed(2)} ${b.toFixed(2)}`;
  let d = `M${s(tips[0])}`;
  for (let i = 0; i < 4; i++) d += `Q${s(ctr[i])} ${s(tips[(i + 1) % 4])}`;
  return d + 'Z';
}

/** A tick, drawn as one stroke. `size` is its width. */
export const check = (cx, cy, size, seed, pen = PEN.bold) => stroke(
  [[cx - size * 0.5, cy + size * 0.02], [cx - size * 0.14, cy + size * 0.36], [cx + size * 0.5, cy - size * 0.4]],
  { ...pen, wobble: 0.3 }, seed);

// ------------------------------------------------------------------ DOM helpers
const NS = 'http://www.w3.org/2000/svg';

/** An svg laid over (or under) a host element, in the host's own px; it never takes pointer events. */
export function inkSvg(host, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `tk-ink${cls ? ' ' + cls : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  host.insertBefore(svg, host.firstChild);
  return svg;
}
/** Replace an svg's drawing: `layers` is [{ d, fill }] bottom first. */
export function inkSet(svg, layers) {
  let html = '';
  for (const l of layers) if (l && l.d) html += `<path d="${l.d}" fill="${l.fill}"${l.o != null ? ` opacity="${l.o}"` : ''}/>`;
  svg.innerHTML = html;
}

const INK = 'var(--ink)', PAPER = 'var(--ink-paper)', GOLD = 'var(--ink-gold)';

/**
 * Draw the frame an element asks for with `data-ink`:
 *   box    paper ground inside four crossing rules
 *   plate  a hand-cut paper plate, no line
 *   loop   a paper plate inside a hand-drawn loop
 *   band   a paper band between two long rules (full-width strips)
 *   gold   as box, the rules in gold
 * Measured in the element's own layout px (offsetWidth), so it is right at any stage scale.
 */
export function inkFrame(node) {
  const kind = node.dataset.ink;
  const w = node.offsetWidth, h = node.offsetHeight;
  if (!kind || !w || !h) return;
  if (node._inkW === w && node._inkH === h && node._inkK === kind) return;
  node._inkW = w; node._inkH = h; node._inkK = kind;
  const svg = node._ink ?? (node._ink = inkSvg(node));
  const seed = node.dataset.seed || `${kind}:${w}x${h}`;
  const layers = [];
  if (kind === 'plate') layers.push({ d: plate(0, 0, w, h, seed), fill: PAPER });
  else if (kind === 'loop') {
    layers.push({ d: plate(1, 1, w - 2, h - 2, seed), fill: PAPER });
    layers.push({ d: loopBox(0, 0, w, h, Math.min(h / 2, 14), seed, PEN.rule), fill: INK });
  } else if (kind === 'band') {
    layers.push({ d: plate(0, 0, w, h, seed), fill: PAPER });
    layers.push({ d: rule(3, 4, w - 3, 4, seed + ':t') + rule(w - 4, h - 4, 4, h - 4, seed + ':b'), fill: INK });
  } else {
    // the rules sit just inside the paper's edge and cross at the corners, as the chart's border does
    const m = Math.min(6, h * 0.14);
    layers.push({ d: plate(0, 0, w, h, seed), fill: PAPER });
    layers.push({ d: ruledBox(m, m, w - 2 * m, h - 2 * m, seed, kind === 'gold' ? PEN.bold : PEN.rule, m * 0.75), fill: kind === 'gold' ? GOLD : INK });
  }
  inkSet(svg, layers);
}
/** Frame every `[data-ink]` under `root` (call after building or when a text changes a size). */
export function inkAll(root) {
  for (const n of root.querySelectorAll('[data-ink]')) inkFrame(n);
}

/** A Gumble's two colours as a pencil-shaded swatch (svg markup, `w` by `h` px). */
export function swatchSvg(a, b, w, h, seed) {
  const half = w / 2;
  return `<svg class="tk-sw" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
    + `<path d="M0 0H${f(half)}V${h}H0Z" fill="${a}"/><path d="M${f(half)} 0H${w}V${h}H${f(half)}Z" fill="${b}"/>`
    + `<path d="${ruledBox(0.5, 0.5, w - 1, h - 1, seed, PEN.fine, 1.5)}" fill="var(--ink)"/></svg>`;
}
