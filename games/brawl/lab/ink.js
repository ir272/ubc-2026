// Ink kit for the cast lab: a hand-held pen on black, in the site's ink colours.
// Classic script (no modules) so the page also opens from a file. Everything is deterministic:
// the wobble depends only on `seed` and the distance along the line.
//
// Space: 1 unit = 1 px at scale 1. Characters draw in LOCAL space: feet on y = 0, up is -y,
// facing +x (to the right). A human-size figure is about 200 units tall.
//
// Two treatments from the SAME drawing code (the owner picks one):
//   mode 'line': hollow figures, cream outline on black (the site's hero picture)
//   mode 'mass': solid figures, cream masses with black cuts (The Scrivener, turned to night)
// Use form() for every closed body part, cut() for detail INSIDE a form, line() for free lines
// outside any form (a staff, a string, a whisker, a spell), hatch() for shade, and both
// treatments come out right.
(function () {
  const BG = '#141318';
  const INK = '#e6e4de';
  const TINTS = { ink: INK, gold: '#c5a559', blue: '#7f9fc6', green: '#7aa58d', coral: '#c58f73', yellow: '#b9ae6c', red: '#c4604a' };

  const h01 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  // smooth 1-D noise in -1..1
  const noise = (seed, s) => {
    const i = Math.floor(s), f = s - i, u = f * f * (3 - 2 * f);
    return (h01(seed * 17.31 + i) * (1 - u) + h01(seed * 17.31 + i + 1) * u) * 2 - 1;
  };

  /** Catmull-Rom through the points: a hand-drawn curve from a few control points. */
  function smooth(pts, per = 8, closed = false) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const out = [];
    const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let j = 0; j < per; j++) {
        const t = j / per, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  }
  function ell(cx, cy, rx, ry, rot = 0, n = 28) {
    const out = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  }
  function arc(cx, cy, r, a0, a1, n = 14, ry = r) {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]); }
    return out;
  }
  /** A limb as one closed shape: from a to b, half-width wa at a and wb at b, rounded ends. */
  function limb(a, b, wa, wb) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const ang = Math.atan2(dy, dx), out = [];
    for (let i = 0; i <= 6; i++) { const t = ang + Math.PI / 2 + (Math.PI * i) / 6; out.push([a[0] + Math.cos(t) * wa, a[1] + Math.sin(t) * wa]); }
    for (let i = 0; i <= 6; i++) { const t = ang - Math.PI / 2 + (Math.PI * i) / 6; out.push([b[0] + Math.cos(t) * wb, b[1] + Math.sin(t) * wb]); }
    return out;
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function resample(pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 1e-6) continue;
      const k = Math.max(1, Math.ceil(d / step));
      for (let j = 1; j <= k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
    return out;
  }

  function polyPath(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  /** The pen: a filled ribbon with pressure and a small drift. */
  function ribbon(ctx, pts0, o) {
    const w = o.w ?? 2.4, seed = o.seed ?? 1, taper = o.taper ?? 0.45, wob = o.wobble ?? 0.9, closed = !!o.closed;
    let pts = closed ? pts0.concat([pts0[0]]) : pts0;
    if (pts.length < 2) return;
    pts = resample(pts, 3.2);
    const n = pts.length;
    if (n < 2) return;
    const L = [], R = [];
    let s = 0, total = 0;
    for (let i = 1; i < n; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const tl = Math.min(total * 0.45, 26 * (w / 2.4)) || 1;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const nx = -dy, ny = dx;
      // drift fades at the ends of a closed line so it meets itself
      const fade = closed ? Math.min(1, s / 14, (total - s) / 14) : 1;
      const d = noise(seed, s / 23) * wob * fade + noise(seed + 9, s / 7) * wob * 0.25 * fade;
      let press = 0.8 + 0.28 * noise(seed + 4, s / 37);
      if (!closed && taper > 0) press *= 1 - taper * (1 - Math.min(1, s / tl, (total - s) / tl)) ;
      const hw = Math.max(0.2, (w * press) / 2);
      const x = pts[i][0] + nx * d, y = pts[i][1] + ny * d;
      L.push([x + nx * hw, y + ny * hw]); R.push([x - nx * hw, y - ny * hw]);
    }
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  function makeInk(ctx, mode = 'line') {
    let auto = 100;
    const col = (o) => (o && o.tint ? TINTS[o.tint] || o.tint : INK);
    const ink = {
      mode, BG, INK, TINTS,
      /** a closed body part. o: { tint, w, seed, bare (no outline in line mode) } */
      form(pts, o = {}) {
        const seed = o.seed ?? auto++;
        ctx.beginPath(); polyPath(ctx, pts);
        if (mode === 'line') {
          ctx.fillStyle = BG; ctx.fill();
          if (o.wash) { ctx.globalAlpha = o.wash; ctx.fillStyle = col(o); ctx.fill(); ctx.globalAlpha = 1; }
          ctx.fillStyle = col(o);
          ribbon(ctx, pts, { w: o.w ?? 2.6, seed, closed: true, wobble: o.wobble });
        } else {
          ctx.fillStyle = col(o); ctx.fill();
          ctx.fillStyle = BG;
          ribbon(ctx, pts, { w: (o.w ?? 2.6) * 0.8, seed, closed: true, wobble: o.wobble });
        }
      },
      /** detail inside a form: a fold, a seam, a face line. Cream in 'line', a black cut in 'mass'. */
      cut(pts, o = {}) {
        ctx.fillStyle = mode === 'line' ? col(o) : BG;
        ribbon(ctx, pts, { w: o.w ?? 1.8, seed: o.seed ?? auto++, taper: o.taper ?? 0.7, wobble: o.wobble ?? 0.6, closed: o.closed });
      },
      /** a free line outside any form: staff, string, whisker, spell. Always drawn in ink or the tint. */
      line(pts, o = {}) {
        ctx.fillStyle = col(o);
        if (o.alpha != null) ctx.globalAlpha = o.alpha;
        ribbon(ctx, pts, { w: o.w ?? 2.4, seed: o.seed ?? auto++, taper: o.taper ?? 0.45, wobble: o.wobble, closed: o.closed });
        ctx.globalAlpha = 1;
      },
      /** parallel pen lines clipped to a shape: shade or a tint of colour. o: { angle, gap, w, tint, alpha, free }
       *  free: true = lines outside any form (always ink or tint), else a cut in 'mass'. */
      hatch(pts, o = {}) {
        const angle = o.angle ?? 0.9, gap = o.gap ?? 5, w = o.w ?? 1.1, seed = o.seed ?? auto++;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + gap;
        const ux = Math.cos(angle), uy = Math.sin(angle), nx = -uy, ny = ux;
        ctx.save();
        ctx.beginPath(); polyPath(ctx, pts); ctx.clip();
        ctx.fillStyle = mode === 'mass' && !o.free && !o.tint ? BG : col(o);
        ctx.globalAlpha = o.alpha ?? (mode === 'mass' ? 1 : 0.85);
        let i = 0;
        for (let d = -R; d <= R; d += gap, i++) {
          const j = (h01(seed * 3.1 + i) - 0.5) * gap * 0.5;
          const a = [cx + nx * (d + j) - ux * R, cy + ny * (d + j) - uy * R];
          const b = [cx + nx * (d + j) + ux * R, cy + ny * (d + j) + uy * R];
          ribbon(ctx, [a, b], { w, seed: seed + i, taper: 0, wobble: 0.5 });
        }
        ctx.restore();
      },
      /** a small filled mark: an eye, a rivet, a spark. Cream in 'line', black in 'mass' unless free. */
      dot(x, y, r, o = {}) {
        ctx.fillStyle = mode === 'mass' && !o.free && !o.tint ? BG : col(o);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      },
      /** black shape that hides what is behind it (both treatments) */
      mask(pts) { ctx.fillStyle = BG; ctx.beginPath(); polyPath(ctx, pts); ctx.fill(); },
    };
    return ink;
  }

  window.Ink = { makeInk, smooth, ell, arc, limb, mix, noise, h01, BG, INK, TINTS };
  window.CAST = window.CAST || [];
})();
