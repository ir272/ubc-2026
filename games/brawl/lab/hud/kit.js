// HUD kit: pen-drawn numerals, the three lives marks, text, and the danger scale.
// Classic script; uses the global Ink pen. Everything is seeded so a state always draws the same.
(function () {
  const { smooth, ell, noise, h01 } = Ink;
  const C = {
    paper: '#141318', ink: '#e6e4de', soft: '#d7d5cf', dim: '#959389', faint: '#4d4b50',
    gold: '#c5a559', coral: '#b58970', blue: '#6687ac', red: '#c4604a',
  };
  const FONT = '"HudHand", "Iowan Old Style", Palatino, Georgia, serif';

  // ---- danger: 0 at a fresh fighter, 1 at about 150% ----
  const danger = (dmg) => Math.max(0, Math.min(1, (dmg - 15) / 135));
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lerpC = (a, b, t) => { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
  /** cream, then the coral pencil, then the red pencil */
  function dangerColor(t) {
    if (t < 0.25) return C.ink;
    if (t < 0.65) return lerpC(C.ink, '#d39a7c', (t - 0.25) / 0.4);
    return lerpC('#d39a7c', C.red, (t - 0.65) / 0.35);
  }

  // ---- the numerals: single pen lines in a unit box (height 1, y down) ----
  const S = (pts) => ({ p: smooth(pts, 8) });
  const R = (pts) => ({ p: pts });
  const O = (cx, cy, rx, ry) => ({ p: ell(cx, cy, rx, ry, 0, 26), closed: true });
  const GLYPH = {
    '0': { w: 0.56, s: [O(0.28, 0.5, 0.27, 0.5)] },
    '1': { w: 0.34, s: [R([[0.02, 0.22], [0.24, 0.02], [0.24, 1]])] },
    '2': { w: 0.56, s: [S([[0.03, 0.24], [0.12, 0.06], [0.3, 0], [0.48, 0.08], [0.52, 0.28], [0.4, 0.52], [0.02, 0.98]]), R([[0.02, 0.98], [0.56, 0.96]])] },
    '3': { w: 0.54, s: [S([[0.04, 0.1], [0.26, 0], [0.48, 0.1], [0.48, 0.32], [0.22, 0.46]]), S([[0.22, 0.46], [0.5, 0.56], [0.54, 0.8], [0.32, 1], [0.02, 0.92]])] },
    '4': { w: 0.6, s: [R([[0.42, 1], [0.42, 0], [0.0, 0.68], [0.6, 0.68]])] },
    '5': { w: 0.56, s: [R([[0.5, 0.01], [0.1, 0.01], [0.06, 0.44]]), S([[0.06, 0.44], [0.28, 0.36], [0.5, 0.46], [0.54, 0.74], [0.34, 0.98], [0.04, 0.92]])] },
    '6': { w: 0.55, s: [S([[0.48, 0.03], [0.22, 0.12], [0.05, 0.46], [0.06, 0.82], [0.28, 1], [0.5, 0.84], [0.5, 0.6], [0.28, 0.46], [0.06, 0.6]])] },
    '7': { w: 0.56, s: [R([[0.0, 0.01], [0.56, 0.01], [0.2, 1]])] },
    '8': { w: 0.56, s: [O(0.28, 0.24, 0.2, 0.23), O(0.28, 0.72, 0.26, 0.27)] },
    '9': { w: 0.56, s: [S([[0.5, 0.36], [0.28, 0.52], [0.06, 0.4], [0.06, 0.14], [0.28, 0], [0.5, 0.14], [0.5, 0.5], [0.4, 0.84], [0.1, 0.98]])] },
    '%': { w: 0.66, s: [R([[0.06, 0.98], [0.6, 0.02]]), O(0.13, 0.18, 0.11, 0.16), O(0.53, 0.82, 0.11, 0.16)] },
    ':': { w: 0.18, dots: [[0.09, 0.32], [0.09, 0.84]] },
  };
  function resample(pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.ceil(d / step));
      for (let j = 1; j <= k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
    return out;
  }
  const glyphScale = (ch, pctScale) => (ch === '%' ? pctScale : 1);
  function numWidth(str, h, o = {}) {
    const ps = o.pct ?? 0.6, gap = (o.gap ?? 0.13) * h;
    let w = 0;
    for (const ch of str) { const g = GLYPH[ch]; if (g) w += g.w * h * glyphScale(ch, ps) + gap; }
    return w - gap;
  }
  /** Draw a number with the pen. y is the baseline. o: { align, t (danger 0..1), color, seed, pct, w } */
  function drawNum(ink, str, x, y, h, o = {}) {
    const t = o.t ?? 0, ps = o.pct ?? 0.6, gap = (o.gap ?? 0.13) * h, seed0 = o.seed ?? 11;
    const total = numWidth(str, h, o);
    let gx = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
    const col = o.color || dangerColor(t);
    const w = o.w ?? h * (0.11 + 0.06 * t);
    const wob = (0.35 + 2.6 * t * t) * (h / 60);
    const tremor = h * 0.034 * Math.pow(t, 1.6);
    let i = 0;
    for (const ch of str) {
      const g = GLYPH[ch]; if (!g) continue;
      const sc = glyphScale(ch, ps), gh = h * sc, gw = g.w * gh;
      const sd = seed0 * 31 + i * 7;
      const rot = (h01(sd) - 0.5) * 0.05 + (h01(sd + 1) - 0.5) * 0.3 * t * t;
      const dy = (h01(sd + 2) - 0.5) * h * 0.1 * t;
      const cx = gx + gw / 2, cy = y - gh / 2 + dy;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const T = (p) => { const lx = (p[0] - g.w / 2) * gh, ly = (p[1] - 0.5) * gh; return [cx + lx * cr - ly * sr, cy + lx * sr + ly * cr]; };
      if (g.dots) { for (const d of g.dots) { const P = T(d); ink.dot(P[0], P[1], w * 0.75, { tint: col, free: true }); } }
      else g.s.forEach((st, k) => {
        let P = resample(st.p.map(T), 2.2);
        const tr = ch === '%' ? tremor * 0.4 : tremor;
        if (tr > 0.05) P = P.map((p, j) => [p[0] + noise(sd + k * 5, j / 2.2) * tr, p[1] + noise(sd + k * 5 + 3, j / 2.2) * tr]);
        ink.line(P, { w, tint: col, seed: sd + k, taper: 0.3, wobble: wob, closed: st.closed });
        if (t > 0.5) ink.line(P.map((p) => [p[0] + 0.9, p[1] + 0.7]), { w: w * 0.55, tint: col, seed: sd + k + 50, taper: 0.5, wobble: wob * 1.4, closed: st.closed, alpha: 0.85 });
      });
      gx += gw + gap; i++;
    }
    return total;
  }

  // ---- text ----
  function text(ctx, str, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.weight ?? 500} ${o.size ?? 20}px ${FONT}`;
    ctx.fillStyle = o.color ?? C.ink;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.fillText(str, x, y);
    const w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }
  function textW(ctx, str, o = {}) { ctx.save(); ctx.font = `${o.weight ?? 500} ${o.size ?? 20}px ${FONT}`; const w = ctx.measureText(str).width; ctx.restore(); return w; }

  // ---- lives marks ----
  /** A: a candle. Lit, or snuffed with a curl of smoke. x is the centre, y the foot. */
  function candle(ink, x, y, s, lit, seed) {
    const bw = 4.2 * s, bh = 17 * s;
    ink.form([[x - bw, y], [x - bw, y - bh + 1], [x - bw * 0.3, y - bh - 1], [x + bw, y - bh + 1.5], [x + bw, y]], { w: 1.6, seed, tint: lit ? C.ink : C.dim });
    ink.line([[x - bw - 3 * s, y + 1], [x + bw + 3 * s, y + 1]], { w: 1.6, seed: seed + 1, tint: lit ? C.ink : C.dim, taper: 0.6 });
    ink.line([[x, y - bh - 0.5], [x + 0.6, y - bh - 4 * s]], { w: 1.4, seed: seed + 2, tint: lit ? C.ink : C.dim, taper: 0.2 });
    if (lit) {
      const fy = y - bh - 4 * s;
      const flame = smooth([[x, fy + 1], [x - 4.2 * s, fy - 5 * s], [x - 1 * s, fy - 12 * s], [x + 0.6 * s, fy - 16 * s], [x + 3.4 * s, fy - 8 * s], [x + 3.6 * s, fy - 2 * s]], 6, true);
      ink.form(flame, { tint: C.gold, w: 1.5, wash: 0.45, seed: seed + 3 });
      ink.line([[x + 0.2, fy - 2 * s], [x + 0.4, fy - 7 * s]], { w: 1.2, tint: C.ink, seed: seed + 4, taper: 0.8 });
    } else {
      const fy = y - bh - 5 * s;
      ink.line(smooth([[x + 0.5, fy], [x + 3 * s, fy - 5 * s], [x - 2 * s, fy - 10 * s], [x + 2 * s, fy - 16 * s], [x - 0.5 * s, fy - 21 * s]], 6), { w: 1.1, tint: C.dim, seed: seed + 5, taper: 0.8, alpha: 0.8 });
    }
  }
  /** B: the chart's four-point star. Kept: a solid star. Lost: an empty ring where it was. */
  function star(ink, x, y, r, on, seed) {
    if (on) {
      const pts = [];
      for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 4, rr = i % 2 ? r * 0.28 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
      ink.form(pts, { tint: C.ink, wash: 1, w: 1.3, seed });
      ink.line([[x - r * 1.35, y], [x + r * 1.35, y]], { w: 0.9, tint: C.gold, seed: seed + 1, taper: 0.9, alpha: 0.8 });
    } else {
      ink.line(ell(x, y, r * 0.38, r * 0.38, 0, 14), { w: 1.1, tint: C.dim, seed, closed: true });
    }
  }
  /** C: a drop of ink. Kept: a full drop. Lost: the outline of one, run dry. */
  function drop(ink, x, y, s, on, seed) {
    const pts = smooth([[x, y - 13 * s], [x + 3.2 * s, y - 6 * s], [x + 5.4 * s, y - 1 * s], [x + 4 * s, y + 4 * s], [x, y + 5.6 * s], [x - 4 * s, y + 4 * s], [x - 5.4 * s, y - 1 * s], [x - 3.2 * s, y - 6 * s]], 5, true);
    if (on) { ink.form(pts, { tint: C.ink, wash: 1, w: 1.4, seed }); ink.line([[x - 2.2 * s, y - 0.5 * s], [x - 1.4 * s, y + 2.4 * s]], { w: 1.4, tint: C.paper, seed: seed + 1, taper: 0.5 }); }
    else ink.line(pts, { w: 1.2, tint: C.dim, seed, closed: true, alpha: 0.85 });
  }
  /** (unused) a tally stroke. Kept: a firm stroke. Lost: a faint stroke struck through. */
  function tally(ink, x, y, hgt, on, seed) {
    ink.line([[x - 1.5, y], [x + 1.5, y - hgt]], { w: on ? 2.6 : 1.4, tint: on ? C.ink : C.faint, seed, taper: 0.35 });
    if (!on) ink.line([[x - 5, y - hgt * 0.35], [x + 6, y - hgt * 0.65]], { w: 1.8, tint: C.dim, seed: seed + 9, taper: 0.4 });
  }

  window.HudKit = { C, FONT, danger, dangerColor, drawNum, numWidth, text, textW, candle, star, tally, drop };
})();
