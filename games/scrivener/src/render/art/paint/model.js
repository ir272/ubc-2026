// Round 28: modelling the black masses. Owner: art. Bake-only (paint/parts.js runs it on
// each painted part before its paper halo); the game never runs this code.
//
// A painted part arrives as flat black shapes with a few carved folds. Obata never
// leaves black flat where it turns toward the light: the edge of a black mass that
// faces the light is broken down into the paper with pen marks, so the value steps
// from solid black, through white strokes carved into it, to paper. This pass reads
// the part's own ink and does that along every lit-facing black edge:
//   - tapered WHITE strokes carved from the lit edge INTO the black, each starting
//     wide at the edge (breaking the contour there) and dying to a point inside,
//     bowed so they wrap the form like cross-contours, unequal in length and spacing,
//     longest where the edge faces the light squarely, none on the shadow side;
//   - a short crossing white layer only on the most squarely lit rim, so the very
//     edge goes to an open crosshatch (lighter value) before the paper;
//   - where the black meets a pale (bone) area instead of the background, interleaved
//     BLACK tapered strokes run out of the mass into the bone, so the two values
//     interlock like a comb instead of meeting at a decal edge.
// The shadow-side edges are left untouched: a heavy, unbroken black silhouette.
// All sizes are in baked pixels (3 px per art unit; the game shows 1.25 px per unit).

import { rng, PAPER, INK } from './brush.js';

// chamfer distance: for `inv` false, inside the mask to the nearest pixel outside it
// (image borders count as outside); for `inv` true, outside the mask to the mask
function chamfer(M, W, H, inv) {
  const N = W * H, d = new Float32Array(N), s2 = Math.SQRT2;
  for (let i = 0; i < N; i++) d[i] = (inv ? !M[i] : M[i]) ? 1e6 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (d[i] === 0) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + s2); if (x < W - 1) v = Math.min(v, d[i - W + 1] + s2); }
    if (!inv && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) v = Math.min(v, 1);
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (d[i] === 0) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + s2); if (x > 0) v = Math.min(v, d[i + W - 1] + s2); }
    d[i] = v;
  }
  return d;
}

export function modelInk(canvas, o = {}) {
  const {
    light = [0.8, -0.6], // toward the light, canvas px axes (y down)
    spacing = 7.5, // mean gap between white strokes along the edge (px)
    len = 30, // longest carved stroke (px)
    width = 3.2, // carved stroke width at the edge (px)
    bow = 0.22, // how far the stroke bends along `axis` per unit length
    axis = [0, 1], // the direction cross-contours bow toward (down a hanging limb)
    thr = 0.12, // minimum litness for a stroke
    cross = 0.62, // litness above which a crossing layer is added
    crossLen = 0.42,
    teeth = 1, // black strokes out into bone (0 = off)
    seed = 1,
    minSpan = 12, // black thinner than this (px) across is left solid
    folds = 0, // spacing (px) of hatch groups peeling off carved folds (0 = off)
    maxDepth = 0.55, // never carve deeper than this fraction of the local thickness
    region = null, // optional (x, y) => bool in px: where strokes may start
  } = o;
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, W, H);
  const D = img.data;
  const N = W * H;
  const ink = new Uint8Array(N), solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = D[i * 4 + 3];
    if (a < 110) continue;
    solid[i] = 1;
    const l = 0.3 * D[i * 4] + 0.59 * D[i * 4 + 1] + 0.11 * D[i * 4 + 2];
    if (l < 90) ink[i] = 1;
  }
  // close the ink over the carved folds (a white hairline inside the black is not an
  // edge of the mass): dilate by `close` px, then erode back
  const close = o.close ?? 5;
  const raw = ink.slice();
  {
    const out = chamfer(raw, W, H, true);
    const dil = new Uint8Array(N);
    for (let i = 0; i < N; i++) dil[i] = raw[i] || out[i] <= close ? 1 : 0;
    const inn = chamfer(dil, W, H, false);
    for (let i = 0; i < N; i++) ink[i] = (raw[i] || (dil[i] && inn[i] > close)) && solid[i] ? 1 : 0;
  }
  const dist = chamfer(ink, W, H, false);
  // a blurred ink field for smooth edge normals
  const R = 4;
  const tmp = new Float32Array(N), B = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -R; x < W + R; x++) {
      if (x + R < W && x + R >= 0) acc += ink[y * W + x + R];
      if (x - R - 1 >= 0 && x - R - 1 < W) acc -= ink[y * W + x - R - 1];
      if (x >= 0 && x < W) tmp[y * W + x] = acc;
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -R; y < H + R; y++) {
      if (y + R < H && y + R >= 0) acc += tmp[(y + R) * W + x];
      if (y - R - 1 >= 0 && y - R - 1 < H) acc -= tmp[(y - R - 1) * W + x];
      if (y >= 0 && y < H) B[y * W + x] = acc;
    }
  }
  const at = (A, x, y) => { const xi = Math.max(0, Math.min(W - 1, x | 0)), yi = Math.max(0, Math.min(H - 1, y | 0)); return A[yi * W + xi]; };
  const normal = (x, y) => {
    const gx = at(B, x + 2, y) - at(B, x - 2, y), gy = at(B, x, y + 2) - at(B, x, y - 2);
    const l = Math.hypot(gx, gy);
    return l < 1e-3 ? null : [-gx / l, -gy / l]; // outward, from ink toward the light side
  };
  const L = (() => { const l = Math.hypot(light[0], light[1]) || 1; return [light[0] / l, light[1] / l]; })();
  const AX = (() => { const l = Math.hypot(axis[0], axis[1]) || 1; return [axis[0] / l, axis[1] / l]; })();

  // the edge pixels of the ink, in a seeded shuffled order
  const edges = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (!ink[i]) continue;
    if (ink[i - 1] && ink[i + 1] && ink[i - W] && ink[i + W]) continue;
    edges.push(i);
  }
  const r = rng(seed * 7 + 3);
  for (let i = edges.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = edges[i]; edges[i] = edges[j]; edges[j] = t; }

  // spacing control on a coarse grid
  const cell = 3, GW = Math.ceil(W / cell), GH = Math.ceil(H / cell);
  const taken = [];
  const occ = new Map();
  const near = (x, y, rad) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), k = Math.ceil(rad / cell);
    for (let yy = cy - k; yy <= cy + k; yy++) for (let xx = cx - k; xx <= cx + k; xx++) {
      const L2 = occ.get(yy * GW + xx); if (!L2) continue;
      for (const q of L2) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 < rad * rad) return true;
    }
    return false;
  };
  const mark = (x, y) => { const k = Math.floor(y / cell) * GW + Math.floor(x / cell); if (!occ.has(k)) occ.set(k, []); occ.get(k).push([x, y]); };

  const white = [], black = [];
  const isInk = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < W && yi < H && ink[yi * W + xi] === 1; };
  // put a point onto the ink edge by searching along the normal
  const snap = (x, y, n) => {
    if (isInk(x, y)) { for (let q = 1; q < 10; q++) if (!isInk(x + n[0] * q, y + n[1] * q)) return [Math.round(x + n[0] * (q - 1)), Math.round(y + n[1] * (q - 1))]; return null; }
    for (let q = 1; q < 10; q++) if (isInk(x - n[0] * q, y - n[1] * q)) return [Math.round(x - n[0] * q), Math.round(y - n[1] * q)];
    return null;
  };
  const span = (x, y, n) => { let t = 0; for (let q = 1; q < 400; q++) { if (!isInk(x - n[0] * q, y - n[1] * q)) break; t = q; } return t; };
  // Hatch comes in GROUPS: 2-5 strokes laid side by side along the edge with one shared
  // tilt, graded in length (longest in the middle or at one end), then a gap. A comb of
  // identical teeth reads as fur; groups read as a pen working round the form.
  for (const i of edges) {
    const x = i % W, y = (i / W) | 0;
    if (region && !region(x, y)) continue;
    const n = normal(x, y); if (!n) continue;
    const lit = n[0] * L[0] + n[1] * L[1];
    if (lit < thr) continue;
    const k = (lit - thr) / (1 - thr);
    if (span(x, y, n) < minSpan) continue; // a thin strip (a tatter, a spur) is not modelled
    const gap = spacing * (1.6 - 0.5 * k) * (0.8 + 0.5 * r());
    if (near(x, y, gap * 1.4)) continue;
    const m = 2 + Math.floor(r() * (2 + 2 * k)); // strokes in this group
    const tilt = (r() - 0.5) * 0.7 + (n[0] * AX[1] - n[1] * AX[0] > 0 ? -0.18 : 0.18); // lean toward the axis
    const sp = spacing * (0.62 + 0.25 * r()) * (1.05 - 0.25 * k);
    const shape = r(); // 0..1: where in the group the longest stroke sits
    const t = [-n[1], n[0]];
    const dirSign = r() < 0.5 ? 1 : -1;
    const glen = len * (0.35 + 0.65 * k) * (r() < 0.2 ? 0.45 : r() > 0.8 ? 1.25 : 0.75 + 0.3 * r());
    for (let j = 0; j < m; j++) {
      const q = snap(x + t[0] * sp * j * dirSign, y + t[1] * sp * j * dirSign, n);
      if (!q) break;
      const nq = normal(q[0], q[1]); if (!nq) break;
      const lq = nq[0] * L[0] + nq[1] * L[1];
      if (lq < thr * 0.7) break;
      if (j > 0 && near(q[0], q[1], sp * 0.7)) break;
      mark(q[0], q[1]);
      const kq = (lq - thr) / (1 - thr);
      const u = m > 1 ? j / (m - 1) : 0.5;
      const grade = 1 - 0.55 * Math.abs(u - shape) * (0.8 + 0.4 * r());
      const Ls = glen * grade * (0.85 + 0.3 * r());
      const ox = Math.round(q[0] + nq[0] * 2.5), oy = Math.round(q[1] + nq[1] * 2.5);
      const bone = ox >= 0 && oy >= 0 && ox < W && oy < H && solid[oy * W + ox] && !ink[oy * W + ox];
      white.push({ x: q[0], y: q[1], n: nq, k: kq, Ls, w: width * (0.75 + 0.4 * kq) * (0.85 + 0.3 * r()), bone, tilt, rr: r() });
      if (kq > (cross - thr) / (1 - thr) && j % 2 === 0) white.push({ x: q[0], y: q[1], n: nq, k: kq, Ls: Ls * crossLen * (0.7 + 0.5 * r()), w: width * 0.65, bone, tilt: tilt - Math.sign(tilt || 1) * 0.95, rr: r() });
      if (bone && teeth && j % 2 === 1) black.push({ x: q[0] + t[0] * sp * 0.5 * dirSign, y: q[1] + t[1] * sp * 0.5 * dirSign, n: nq, k: kq, Ls: Ls * 0.5 * teeth, w: width * 0.85, tilt: -tilt, rr: r() });
    }
  }

  // Fold flanks: the carved white folds already inside the black get short groups of
  // hatch peeling off their lit side, so a fold reads as a ridge turning into shadow.
  if (folds > 0) {
    const fold = [];
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (!(ink[i] && !raw[i] && solid[i])) continue; // a carved pixel inside the mass
      if (dist[i] < 5) continue; // not right at the silhouette
      fold.push(i);
    }
    for (let i = fold.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const tt = fold[i]; fold[i] = fold[j]; fold[j] = tt; }
    const occF = new Map();
    const nearF = (x, y, rad) => { const cx = Math.floor(x / 8), cy = Math.floor(y / 8), kk = Math.ceil(rad / 8); for (let yy = cy - kk; yy <= cy + kk; yy++) for (let xx = cx - kk; xx <= cx + kk; xx++) { const l2 = occF.get(yy * 10000 + xx); if (l2) for (const q of l2) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 < rad * rad) return true; } return false; };
    const markF = (x, y) => { const kk = Math.floor(y / 8) * 10000 + Math.floor(x / 8); if (!occF.has(kk)) occF.set(kk, []); occF.get(kk).push([x, y]); };
    const isCarve = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return false; const ii = yi * W + xi; return ink[ii] && !raw[ii]; };
    for (const i of fold) {
      const x = i % W, y = (i / W) | 0;
      if (nearF(x, y, folds)) continue;
      // the carve's local direction: the axis of least change of the carve mask
      let best = null, bl = 0;
      for (let a = 0; a < 12; a++) {
        const th = a * Math.PI / 12, d = [Math.cos(th), Math.sin(th)];
        let l = 0; while (l < 14 && isCarve(x + d[0] * l, y + d[1] * l) && isCarve(x - d[0] * l, y - d[1] * l)) l++;
        if (l > bl) { bl = l; best = d; }
      }
      if (!best || bl < 4) continue;
      let nn = [-best[1], best[0]];
      if (nn[0] * L[0] + nn[1] * L[1] < 0) nn = [-nn[0], -nn[1]];
      // only folds turned across the light get flank hatch (|n.L| large)
      const lit = nn[0] * L[0] + nn[1] * L[1];
      if (lit < 0.3) continue;
      markF(x, y);
      // the hatch leaves the shadow side of the ridge (away from the light): walk out of the carve
      const side = [-nn[0], -nn[1]];
      let e = [x, y]; for (let q = 0; q < 8 && isCarve(e[0], e[1]); q++) e = [e[0] + side[0], e[1] + side[1]];
      const m = 2 + Math.floor(r() * 3);
      const sp = spacing * (0.6 + 0.2 * r());
      const glen = len * 0.42 * (0.7 + 0.6 * r());
      const tilt = 0.55 + 0.3 * r();
      const dir = r() < 0.5 ? 1 : -1;
      for (let j = 0; j < m; j++) {
        const px = e[0] + best[0] * sp * j * dir, py = e[1] + best[1] * sp * j * dir;
        if (!isInk(px, py)) break;
        white.push({ x: Math.round(px), y: Math.round(py), n: nn, k: lit, Ls: glen * (1 - 0.18 * j) * (0.85 + 0.3 * r()), w: width * 0.72, tilt: tilt * (best[0] * AX[0] + best[1] * AX[1] > 0 ? 1 : -1) * 0.5, rr: r(), fold: true });
      }
    }
  }

  // march a stroke from the edge into the ink (sign -1) or out into the bone (+1)
  const path = (s, sign) => {
    let d = sign < 0 ? [-s.n[0], -s.n[1]] : [s.n[0], s.n[1]];
    if (s.tilt) { const a = s.tilt; const c = Math.cos(a), sn = Math.sin(a); d = [d[0] * c - d[1] * sn, d[0] * sn + d[1] * c]; }
    // the start sits just across the edge so the contour itself is broken
    let p = s.fold ? [s.x + 0.5 - d[0] * 1.2, s.y + 0.5 - d[1] * 1.2] : [s.x + 0.5 - d[0] * 1.6, s.y + 0.5 - d[1] * 1.6];
    const pts = [p.slice()];
    const step = 1.5;
    // the span of black straight in from this edge point
    let thick = 0;
    for (let q = 1; q < 400; q++) { const xx = Math.round(s.x - s.n[0] * q), yy = Math.round(s.y - s.n[1] * q); if (xx < 0 || yy < 0 || xx >= W || yy >= H || !ink[yy * W + xx]) break; thick = q; }
    const lim = sign < 0 ? Math.min(s.Ls, Math.max(5, thick * maxDepth)) : s.Ls;
    const bend = bow * (s.rr < 0.5 ? 1 : 0.6);
    let run = 0;
    while (run < lim) {
      // bow toward the axis: a cross-contour ring on a cylinder
      d = [d[0] + AX[0] * bend * step / Math.max(8, lim) * 2, d[1] + AX[1] * bend * step / Math.max(8, lim) * 2];
      const l = Math.hypot(d[0], d[1]); d = [d[0] / l, d[1] / l];
      p = [p[0] + d[0] * step, p[1] + d[1] * step];
      run += step;
      const xi = p[0] | 0, yi = p[1] | 0;
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) break;
      const ii = yi * W + xi;
      if (run > 3 && sign < 0 && (!ink[ii] || !raw[ii])) break; // came out the other side / into a carve
      if (run > 3 && sign > 0 && (ink[ii] || !solid[ii])) break;
      pts.push(p.slice());
    }
    return pts;
  };
  const ribbon = (pts, w0) => {
    if (pts.length < 3) return;
    const n = pts.length, Lft = [], Rgt = [];
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const t = k / (n - 1);
      // a quick landing, then a long lift-off into a point
      const w = w0 * Math.min(1, 0.55 + t * 6) * Math.pow(1 - t, 1.15) + 0.15;
      Lft.push([a[0] * 0 + pts[k][0] - dy / l * w / 2, pts[k][1] + dx / l * w / 2]);
      Rgt.push([pts[k][0] + dy / l * w / 2, pts[k][1] - dx / l * w / 2]);
    }
    g.moveTo(Lft[0][0], Lft[0][1]);
    for (const q of Lft) g.lineTo(q[0], q[1]);
    for (let k = n - 1; k >= 0; k--) g.lineTo(Rgt[k][0], Rgt[k][1]);
    g.closePath();
  };
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  // black teeth first (into the bone), then the white carving into the black
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = INK; g.beginPath();
  for (const s of black) ribbon(path(s, 1), s.w);
  g.fill();
  g.fillStyle = PAPER; g.beginPath();
  for (const s of white) ribbon(path(s, -1), s.w);
  g.fill();
  g.restore();
  return { strokes: white.length, teeth: black.length };
}
