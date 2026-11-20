// Shared pen for the stage sheet. Classic script; needs ink.js first.
// Stages draw in WORLD metres (y up). view maps metres to pixels:
//   view = { W, H, s (px per metre), p(x, y) -> [px, py], k (pen scale, 1 at 1280 wide) }
// Pen widths and hatch gaps are given in pixels at 1280 wide and scale with k.
// Weight ladder (at k = 1): main deck top 5.2, soft platform tops 4.2, near set 2.2 to 2.8,
// middle distance 1.4 to 1.8, far 0.9 to 1.2 with alpha 0.3 to 0.55.
(function () {
  const { smooth, ell, arc } = Ink;

  function view(W, H) {
    const s = W / 26;
    const k = W / 1280;
    const yTop = 10.5;
    return { W, H, s, k, yTop, p: (x, y) => [W / 2 + x * s, (yTop - y) * s] };
  }

  // seeded random, deterministic
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pen(ctx, v) {
    const ink = Ink.makeInk(ctx, 'line');
    const k = v.k;
    const M = (pts) => pts.map((q) => v.p(q[0], q[1]));
    let auto = 500;
    const P = {
      ink, v, k, M,
      clear() { ctx.fillStyle = Ink.BG; ctx.fillRect(0, 0, v.W, v.H); },
      /** free pen line through world points */
      line(pts, o = {}) {
        ink.line(M(pts), { w: (o.w ?? 1.6) * k, alpha: o.alpha, tint: o.tint, taper: o.taper ?? 0.5, wobble: (o.wobble ?? 0.9) * k, seed: o.seed ?? auto++, closed: o.closed });
      },
      /** closed shape: hides what is behind, optional flat wash of a tint, then the outline */
      form(pts, o = {}) {
        if (!o.open) P.mask(pts);
        if (o.wash) P.fill(pts, o.washTint || o.tint || 'ink', o.wash);
        if (o.w !== 0) P.line(pts, { w: o.w ?? 2.2, alpha: o.alpha, tint: o.tint, closed: true, wobble: o.wobble, seed: o.seed });
      },
      /** flat fill of a tint at low alpha (the hero's muted hill fill) */
      fill(pts, tint, a) {
        const m = M(pts);
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = Ink.TINTS[tint] || tint;
        ctx.beginPath(); ctx.moveTo(m[0][0], m[0][1]); for (const q of m) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill();
        ctx.restore();
      },
      mask(pts) { ink.mask(M(pts)); },
      hatch(pts, o = {}) {
        ink.hatch(M(pts), { angle: o.angle ?? 0.9, gap: (o.gap ?? 5) * k, w: (o.w ?? 1) * k, tint: o.tint, alpha: o.alpha ?? 0.6, seed: o.seed ?? auto++, free: true });
      },
      dot(x, y, r, o = {}) {
        const q = v.p(x, y);
        if (o.alpha != null) ctx.globalAlpha = o.alpha;
        ink.dot(q[0], q[1], r * k, { tint: o.tint, free: true });
        ctx.globalAlpha = 1;
      },
      /** a place to stand: the heaviest line on the stage */
      walk(x0, x1, y, o = {}) {
        P.line([[x0, y], [(x0 * 2 + x1) / 3, y], [(x0 + x1 * 2) / 3, y], [x1, y]], { w: o.w ?? 4.2, taper: 0.12, wobble: 0.7, seed: o.seed });
      },
      /** the site's four-point star */
      star(x, y, r, a = 0.8, tint) {
        P.line([[x, y + r], [x, y - r]], { w: 1.3, alpha: a, taper: 1, tint, wobble: 0.2 });
        P.line([[x - r * 0.6, y], [x + r * 0.6, y]], { w: 1.2, alpha: a, taper: 1, tint, wobble: 0.2 });
        P.dot(x, y, 1.2, { alpha: a, tint });
      },
      /** scattered sky: tiny dots plus a few four-point stars, inside a box, skipping a keep-out test */
      sky(seed, box, n, stars, skip) {
        const r = rng(seed);
        for (let i = 0; i < n; i++) {
          const x = box[0] + r() * (box[2] - box[0]), y = box[1] + r() * (box[3] - box[1]);
          if (skip && skip(x, y)) continue;
          P.dot(x, y, 0.6 + r() * 0.7, { alpha: 0.25 + r() * 0.35 });
        }
        for (const st of stars) P.star(st[0], st[1], st[2], st[3] ?? 0.75);
      },
      /** a small hooded stand-in, 1.8 m tall, feet at (x, y) */
      figure(x, y, flip = false, tint) {
        const q = v.p(x, y), sc = (1.8 * v.s) / 200;
        ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(flip ? -sc : sc, sc);
        const f = Ink.makeInk(ctx, 'line');
        const o = { w: 5.4, tint };
        f.form(Ink.limb([-6, -150], [-24, -96], 10, 7), o);
        f.form(smooth([[-16, -158], [-30, -100], [-42, -30], [-48, 0], [-8, 4], [40, 0], [32, -40], [28, -100], [24, -156]], 6, true), o);
        f.hatch(smooth([[-16, -150], [-30, -100], [-42, -30], [-46, -2], [-20, -2], [-12, -80]], 5, true), { angle: 1.25, gap: 11, w: 3, tint });
        f.cut(smooth([[8, -118], [4, -60], [10, -6]], 6), { w: 4, tint });
        f.form(smooth([[-14, -160], [-20, -192], [2, -216], [28, -196], [30, -168], [14, -154]], 6, true), o);
        f.mask(ell(15, -180, 9, 12, 0.1));
        f.cut(ell(15, -180, 9, 12, 0.1), { closed: true, w: 3.4, tint });
        f.form(Ink.limb([16, -148], [44, -106], 10, 7), o);
        f.form(ell(46, -102, 8, 8), o);
        ctx.restore();
      },
      /** a row of far roofs as one silhouette from x0 to x1, base y, down to yBot.
       *  o: { seed, hMin, hMax, wMin, wMax, alpha, w, tint, lit (chance of a lit window), spire (chance) } */
      town(x0, x1, y, yBot, o = {}) {
        const r = rng(o.seed ?? 7);
        const top = [[x0, yBot]];
        const lit = [];
        let x = x0;
        while (x < x1) {
          const bw = (o.wMin ?? 0.6) + r() * ((o.wMax ?? 1.5) - (o.wMin ?? 0.6));
          const h = y + (o.hMin ?? 0.3) + r() * ((o.hMax ?? 1.1) - (o.hMin ?? 0.3));
          const kind = r();
          const xa = x, xb = Math.min(x1, x + bw);
          top.push([xa, h]);
          if (kind < (o.spire ?? 0.06)) {
            const m = (xa + xb) / 2;
            const t = h + 0.5 + bw * 0.3; top.push([m - bw * 0.22, h], [m - bw * 0.22, t], [m - bw * 0.3, t], [m, t + 0.9 + r() * 0.4], [m + bw * 0.3, t], [m + bw * 0.22, t], [m + bw * 0.22, h]);
          } else if (kind < 0.62) {
            top.push([(xa + xb) / 2, h + bw * (0.35 + r() * 0.25)]); // gable
          } else if (kind < 0.8 && bw > 0.9) {
            top.push([xa + bw * 0.25, h], [xa + bw * 0.25, h + 0.35], [xa + bw * 0.38, h + 0.35], [xa + bw * 0.38, h]); // chimney
          }
          top.push([xb, h]);
          if (r() < (o.lit ?? 0)) lit.push([xa + bw * (0.3 + r() * 0.4), h - 0.3 - r() * 0.6]);
          x = xb;
        }
        top.push([x1, yBot]);
        P.mask(top);
        P.line(top.slice(1, -1), { w: o.w ?? 1, alpha: o.alpha ?? 0.4, tint: o.tint, taper: 0.2, wobble: 0.5 });
        for (const q of lit) P.dot(q[0], q[1], 1.5, { tint: 'gold', alpha: 0.75 });
        return top;
      },
      E: (cx, cy, rx, ry, rot, n) => ell(cx, cy, rx, ry, rot, n),
      A: (cx, cy, r, a0, a1, n, ry) => arc(cx, cy, r, a0, a1, n, ry),
      S: (pts, per, closed) => smooth(pts, per, closed),
      rect: (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
    };
    return P;
  }

  window.StageKit = { view, pen, rng };
  window.STAGES = window.STAGES || [];
})();
