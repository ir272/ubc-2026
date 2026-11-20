// The Stitched One: a patchwork giant sewn from odd parts, one arm far bigger than the other,
// a lightning rod and its wire strapped to his back. Tint: yellow (the spark).
(function () {
  const { smooth, ell, mix, h01 } = Ink;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const perp = (d) => [-d[1], d[0]];
  const dir = (a) => [Math.cos(a), Math.sin(a)];
  const O = (p, x, y) => [p[0] + x, p[1] + y];

  function tube(path, w0, w1, per = 4, bulge = 0) {
    const p = path.length > 2 ? smooth(path, per) : path;
    const n = p.length, L = [], R = [];
    let a0 = 0, a1 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), d = unit(p[Math.max(0, i - 1)], p[Math.min(n - 1, i + 1)]), nn = perp(d), w = w0 + (w1 - w0) * t + bulge * Math.sin(Math.PI * t);
      L.push(add(p[i], nn, w)); R.push(add(p[i], nn, -w));
      if (i === 0) a0 = Math.atan2(nn[1], nn[0]);
      if (i === n - 1) a1 = Math.atan2(nn[1], nn[0]);
    }
    const capE = [], capS = [];
    for (let j = 1; j < 6; j++) capE.push(add(p[n - 1], dir(a1 - (Math.PI * j) / 6), w1));
    for (let j = 1; j < 6; j++) capS.push(add(p[0], dir(a0 + Math.PI - (Math.PI * j) / 6), w0));
    return L.concat(capE, R.reverse(), capS);
  }
  /** A sewn seam: the join line and stitches crossing it. */
  function seam(ink, path, n, len = 4, o = {}) {
    const p = smooth(path, 6);
    ink.cut(p, { w: o.w ?? 1.3, taper: 0.3 });
    for (let i = 0; i < n; i++) {
      const k = Math.min(p.length - 2, Math.round(((i + 0.5) / n) * (p.length - 1)));
      const d = unit(p[k], p[k + 1]), nn = perp(d), l = len * (0.8 + 0.4 * h01(i + n));
      ink.cut([add(add(p[k], nn, -l), d, -0.8), add(add(p[k], nn, l), d, 0.8)], { w: o.sw ?? 1.1, taper: 0.2 });
    }
  }
  function rag(a, b, n, depth, seed, out) {
    const res = [a];
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, r = h01(seed + i * 5.13);
      res.push(add(mix(a, b, t0 + (t1 - t0) * (0.35 + 0.3 * r)), out, depth * (0.4 + 0.9 * h01(seed + i * 2.71))));
      res.push(i === n - 1 ? b : mix(a, b, t1));
    }
    return res;
  }
  /** A huge closed fist; `ang` points the knuckles. */
  function fist(ink, c, ang, s = 1) {
    const P = (pts) => pts.map(([x, y]) => [c[0] + (x * Math.cos(ang) - y * Math.sin(ang)) * s, c[1] + (x * Math.sin(ang) + y * Math.cos(ang)) * s]);
    ink.form(P(smooth([[-14, -15], [2, -17], [10, -15], [12, 12], [0, 15], [-12, 14], [-17, 0]], 4, true)), { w: 2.6 });
    // four fingers rolled over, each its own knuckle
    for (let i = 0; i < 4; i++) {
      const y = -13 + i * 7.6;
      ink.form(P(smooth([[6, y - 3.6], [16, y - 4], [21, y - 1], [21, y + 2.6], [16, y + 3.8], [6, y + 3.6]], 3, true)), { w: 1.7 });
      ink.cut(P([[15, y - 2.5], [15.5, y + 2.5]]), { w: 0.9 });
    }
    ink.form(P(smooth([[-8, -15], [6, -20], [14, -16], [11, -11], [-3, -9]], 4, true)), { w: 1.8 });
    ink.hatch(P(smooth([[-14, 0], [-4, 4], [10, 14], [-10, 14], [-17, 2]], 4, true)), { angle: ang + 0.9, gap: 3.2, w: 0.9 });
  }
  /** The thin hand with knobbly fingers, closing round something along `ang`. */
  function thinHand(ink, c, ang, s = 1) {
    const P = (pts) => pts.map(([x, y]) => [c[0] + (x * Math.cos(ang) - y * Math.sin(ang)) * s, c[1] + (x * Math.sin(ang) + y * Math.cos(ang)) * s]);
    ink.form(P(smooth([[-8, -7], [4, -9], [10, -6], [11, 4], [3, 8], [-7, 6]], 4, true)), { w: 1.8 });
    for (let i = 0; i < 3; i++) ink.cut(P([[10, -4 + i * 3.6], [5, -4.4 + i * 3.6]]), { w: 0.9 });
    ink.form(P(smooth([[-4, -8], [6, -12], [11, -10], [8, -6], [-2, -5]], 4, true)), { w: 1.3 });
  }
  function boot(ink, f, s, seed) {
    ink.form(smooth([O(f, -15 * s, -22), O(f, 8 * s, -24), O(f, 14 * s, -14), O(f, 30 * s, -10), O(f, 33 * s, -2), O(f, 30 * s, 0), O(f, -17 * s, 0), O(f, -18 * s, -8)], 4, true), { w: 2.4, seed });
    ink.cut([O(f, -16 * s, -5), O(f, 31 * s, -5)], { w: 1.3, taper: 0.2 });
    for (let i = 0; i < 3; i++) ink.cut([O(f, (2 + i * 4) * s, -21 + i * 4), O(f, (8 + i * 4) * s, -19 + i * 4)], { w: 1 });
    ink.hatch(smooth([O(f, -15 * s, -20), O(f, -4 * s, -22), O(f, -2 * s, -6), O(f, -17 * s, -6)], 3, true), { angle: 1.2, gap: 3.4, w: 0.9 });
  }

  CAST.push({
    id: 'stitched', group: 'monsters', name: 'The Stitched One', kind: 'Made man',
    look: 'A patchwork giant sewn together from parts that do not match, one arm twice the size of the other, in a coat far too small, with a lightning rod and its wire strapped to his back.',
    does: [
      ['Live Wire', 'Slams the lightning rod into the floor. A jagged spark runs along the ground away from him.'],
      ['Haymaker', 'Winds up the big arm and swings. Getting hit does not stop the swing.'],
      ['Hoist', 'Grabs the ledge with the big arm and heaves the rest of himself up after it.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      // ---- joints (feet on y = 0, up is -y, facing +x) ----
      const head = A ? [48, -204] : [10, -214];
      const tilt = A ? 0.22 : 0.04;
      const neck = A ? [38, -186] : [4, -194];
      const shF = A ? [68, -170] : [42, -180], shB = A ? [-20, -180] : [-42, -182];
      const elbF = A ? [104, -148] : [68, -124], fistF = A ? [112, -108] : [72, -66];
      const elbB = A ? [44, -140] : [-58, -134], handB = A ? [100, -158] : [-52, -92];
      const hip = A ? [6, -100] : [0, -104];
      const kneeF = A ? [62, -58] : [30, -56], footF = A ? [74, 0] : [38, 0];
      const kneeB = A ? [-32, -50] : [-26, -56], footB = A ? [-62, 0] : [-34, 0];
      const rodTop = A ? [86, -206] : [-20, -246], rodBot = A ? [150, -2] : [-54, -100];

      // ---- the spark running along the floor ----
      if (A) {
        const zig = (x0, x1, y0, amp, seed, n) => {
          const pts = [];
          for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (h01(seed + i) - 0.5) * 6, y0 - (i % 2 ? amp * (0.5 + h01(seed + i * 3)) : 1 + h01(seed + i * 5) * 3)]); }
          return pts;
        };
        const main = zig(152, 336, -2, 22, 11, 12);
        ink.line(main, { tint: 'yellow', w: 3.2, taper: 0.3, seed: 12 });
        ink.line(main.map(([x, y], i) => [x + 2, y + (i % 2 ? 4 : -2)]), { tint: 'yellow', w: 1.2, taper: 0.4, seed: 14 });
        ink.line(zig(156, 300, -1, 8, 17, 14), { tint: 'yellow', w: 1.4, taper: 0.5, seed: 13 });
        // forks jumping up off the main line
        [[3, 30, -0.4], [6, 40, 0.3], [9, 26, -0.2], [11, 20, 0.4]].forEach(([k, len, lean], i) => {
          const b = main[k], pts = [b];
          for (let j = 1; j <= 4; j++) pts.push([b[0] + lean * len * (j / 4) + (j % 2 ? 4 : -3), b[1] - len * (j / 4)]);
          ink.line(pts, { tint: 'yellow', w: 1.5, taper: 0.8, seed: 20 + i });
        });
        // where the rod went in: the floor split and spitting
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI + 0.35 + i * 0.48, r0 = 8, r1 = 18 + h01(i + 40) * 14;
          const p0 = add(rodBot, dir(a), r0), p1 = add(rodBot, dir(a + 0.15), (r0 + r1) / 2), p2 = add(rodBot, dir(a - 0.1), r1);
          ink.line([p0, p1, p2], { tint: 'yellow', w: 1.5, taper: 0.7, seed: 30 + i });
        }
        for (let i = 0; i < 3; i++) ink.line([[rodBot[0] - 30 + i * 22, -1], [rodBot[0] - 22 + i * 22, -4], [rodBot[0] - 14 + i * 22, -1]], { w: 1.2, taper: 0.6, seed: 37 + i });
      }

      // ---- the rod and its wire (behind him when it is on his back) ----
      const rd = unit(rodBot, rodTop), rn = perp(rd);
      const drawRod = () => {
        ink.form(tube([rodBot, rodTop], 3.2, 2.6), { w: 1.8, seed: 41 });
        // the spike crown on top: a point and two side prongs
        const t = rodTop;
        ink.form([add(t, rn, -3.5), add(t, rd, 22), add(t, rn, 3.5)], { w: 1.6, seed: 42 });
        ink.line([add(t, rd, 4), add(add(t, rd, 14), rn, 9), add(add(t, rd, 18), rn, 9)], { w: 1.6, taper: 0.6, seed: 43 });
        ink.line([add(t, rd, 4), add(add(t, rd, 14), rn, -9), add(add(t, rd, 18), rn, -9)], { w: 1.6, taper: 0.6, seed: 44 });
        // glass insulator collar and the binding of the wire
        const g = add(t, rd, -18);
        ink.form(smooth([add(g, rn, -6), add(add(g, rd, 5), rn, -4), add(add(g, rd, 5), rn, 4), add(g, rn, 6), add(add(g, rd, -6), rn, 3), add(add(g, rd, -6), rn, -3)], 3, true), { w: 1.6, seed: 45 });
        for (let i = 0; i < 4; i++) { const c = add(t, rd, -30 - i * 4); ink.cut([add(c, rn, -4), add(add(c, rn, 4), rd, -2)], { w: 1.2 }); }
        // the wire: coils off the rod and hangs in loops
        const w0 = add(t, rd, -34);
        const wire = A
          ? smooth([w0, add(w0, [-30, 10]), [neck[0] - 30, neck[1] + 6], [shB[0] - 26, shB[1] + 40], [hip[0] - 50, hip[1] + 20], [hip[0] - 70, -40], [hip[0] - 96, -20]], 8)
          : smooth([w0, add(w0, [-26, 22]), add(w0, [-34, 60]), add(w0, [-18, 84]), add(w0, [-30, 98]), add(w0, [-44, 80]), add(w0, [-38, 120]), add(w0, [-50, 140])], 8);
        ink.line(wire, { w: 1.6, taper: 0.15, seed: 46 });
        const end = wire[wire.length - 1], ed = unit(wire[wire.length - 3], end);
        // a clamp at the end of the wire
        ink.form(smooth([add(end, perp(ed), -3), add(add(end, ed, 10), perp(ed), -5), add(add(end, ed, 14), perp(ed), -1), add(add(end, ed, 14), perp(ed), 2), add(add(end, ed, 10), perp(ed), 5), add(end, perp(ed), 3)], 3, true), { w: 1.5, seed: 47 });
        if (A) for (let i = 0; i < 3; i++) { const p = wire[6 + i * 7], q = wire[8 + i * 7]; ink.line([p, add(mix(p, q, 0.5), perp(unit(p, q)), 6), q], { tint: 'yellow', w: 1.3, taper: 0.6, seed: 48 + i }); }
      };
      if (!A) drawRod();

      // ---- the far arm: thin, in a sleeve too short for it ----
      const bArm = tube([shB, elbB, handB], 9, 6.5);
      ink.form(bArm, { w: 2.2, seed: 51 });
      const bd = unit(elbB, handB), bn = perp(bd), cuffB = mix(elbB, handB, 0.45);
      ink.form(tube([shB, elbB, cuffB], 12, 10), { w: 2.3, seed: 52 });
      ink.hatch(tube([shB, elbB, cuffB], 12, 10), { angle: 1, gap: 3.6, w: 0.9, seed: 53 });
      ink.cut([add(cuffB, bn, -10), add(cuffB, bn, 10)], { w: 1.4 });
      seam(ink, [add(mix(cuffB, handB, 0.4), bn, -6), add(mix(cuffB, handB, 0.5), bn, 6)], 3, 2.5);
      thinHand(ink, add(handB, bd, 4), Math.atan2(bd[1], bd[0]), 1);

      // ---- legs: baggy trousers, a sewn patch on the knee, big boots ----
      for (const [h, k, f, s, sd] of [[O(hip, -14, 0), kneeB, footB, 0.95, 61], [O(hip, 14, 0), kneeF, footF, 1.05, 65]]) {
        const leg = tube([h, k, O(f, 0, -20)], 20, 15, 4, 2);
        ink.form(leg, { w: 2.5, seed: sd });
        ink.cut(smooth([O(h, 6, 8), O(k, 4, -6), O(f, 6, -26)], 4), { w: 1.2 });
        ink.cut(smooth([O(k, -10, -2), O(k, -2, 4), O(k, 10, 2)], 3), { w: 1.1 });
        boot(ink, f, s, sd + 1);
      }
      ink.hatch(tube([O(hip, -14, 0), kneeB, O(footB, 0, -20)], 20, 15, 4, 2), { angle: 1.15, gap: 3.6, w: 0.9, seed: 63 });
      const patch = [O(kneeF, -12, -14), O(kneeF, 10, -16), O(kneeF, 13, 6), O(kneeF, -10, 8)];
      ink.form(patch, { w: 1.6, seed: 67 });
      for (let i = 0; i < 4; i++) { const a = patch[i], b = patch[(i + 1) % 4]; for (let j = 1; j < 4; j++) { const m = mix(a, b, j / 4), c = mix(kneeF, m, 0.78); ink.cut([c, mix(c, m, 1.25)], { w: 0.9 }); } }

      // ---- the torso: a barrel chest under a coat that will not close ----
      const chest = smooth([O(neck, -6, 4), O(shF, 8, 4), O(shF, 14, 30), O(hip, 34, -30), O(hip, 30, 6), O(hip, -30, 6), O(hip, -36, -30), O(shB, -6, 22), O(shB, 0, -2)], 5, true);
      ink.form(chest, { w: 3, seed: 71 });
      // the Y seam where the chest was closed up, and a scar across the belly
      seam(ink, [O(neck, 4, 8), O(neck, 18, 30), O(hip, 18, -40), O(hip, 14, -6)], 9, 3.5);
      seam(ink, [O(shF, 10, 10), O(neck, 18, 30)], 3, 3);
      seam(ink, [O(hip, -6, -24), O(hip, 24, -18)], 4, 3);
      ink.hatch(smooth([O(shF, 14, 30), O(hip, 34, -30), O(hip, 30, 4), O(hip, 22, -10), O(shF, 4, 34)], 4, true), { angle: 1.25, gap: 3.6, w: 0.9, seed: 72 });

      // the coat: back panel and a front that stops short; burst at the big shoulder
      const lap = O(neck, 6, 12);
      const coat = smooth([O(neck, -10, -2), O(shB, -4, -6), O(shB, -14, 26), O(hip, -40, -20), O(hip, -42, 4)], 5)
        .concat(rag(O(hip, -42, 4), O(hip, 4, 4), 4, 6, A ? 80 : 81, [0, 1]))
        .concat(smooth([O(hip, 4, 4), O(hip, 4, -40), O(neck, 2, 34), lap], 5));
      ink.form(coat, { w: 2.6, seed: 82 });
      ink.hatch(smooth([O(shB, -4, 0), O(shB, -12, 26), O(hip, -38, -18), O(hip, -38, 0), O(hip, -24, 0), O(hip, -24, -40), O(shB, 6, 10)], 4, true), { angle: 1.18, gap: 4, w: 1, seed: 83 });
      // lapel, straining buttons, seams pulled open
      ink.cut(smooth([lap, O(neck, -4, 24), O(neck, -2, 44)], 4), { w: 1.4 });
      for (let i = 0; i < 3; i++) { const b = mix(O(neck, 0, 40), O(hip, 0, -12), i / 2); ink.dot(b[0], b[1], 2); ink.cut([O(b, 2, -2), O(b, 9, -4)], { w: 1 }); }
      ink.cut(smooth([O(shB, 10, 6), O(hip, -14, -44), O(hip, -18, -4)], 5), { w: 1.2 });
      // the strap holding the rod, across the chest
      const s0 = O(shB, 14, -2), s1 = O(hip, 32, -24);
      const sN = perp(unit(s0, s1));
      ink.form([add(s0, sN, -4), add(s1, sN, -4), add(s1, sN, 4), add(s0, sN, 4)], { w: 1.6, seed: 84 });
      const bk = mix(s0, s1, 0.62);
      ink.form([add(add(bk, sN, -6), unit(s0, s1), -5), add(add(bk, sN, -6), unit(s0, s1), 5), add(add(bk, sN, 6), unit(s0, s1), 5), add(add(bk, sN, 6), unit(s0, s1), -5)], { w: 1.4, seed: 85 });
      ink.cut([add(bk, sN, -6), add(bk, sN, 6)], { w: 1 });

      // ---- the big arm, bare, sewn on at the shoulder ----
      const fd = unit(elbF, fistF), fn = perp(fd);
      const upper = tube([O(shF, -4, 0), elbF], 22, 18, 4, 3);
      const fore = tube([elbF, fistF], 19, 17, 4, 6);
      ink.form(upper, { w: 3, seed: 91 });
      ink.form(fore, { w: 3, seed: 92 });
      ink.hatch(smooth([add(elbF, fn, 6), add(elbF, fn, 18), add(fistF, fn, 20), add(fistF, fn, 8)], 4, true), { angle: Math.atan2(fd[1], fd[0]) + 1.3, gap: 3.6, w: 0.9, seed: 93 });
      // the ring of stitches where it was sewn on, and patches on the forearm
      const ud = unit(shF, elbF), un = perp(ud), ring = add(shF, ud, 12);
      seam(ink, smooth([add(ring, un, -21), add(add(ring, ud, -6), un, 0), add(ring, un, 21)], 4), 7, 3.5);
      seam(ink, [add(mix(elbF, fistF, 0.35), fn, -20), add(mix(elbF, fistF, 0.52), fn, 0), add(mix(elbF, fistF, 0.45), fn, 20)], 6, 3);
      ink.cut(smooth([add(elbF, ud, -18), add(add(elbF, ud, -6), un, -8)], 3), { w: 1.2 });
      ink.cut(smooth([add(elbF, fn, -12), add(add(elbF, fd, 14), fn, -14)], 3), { w: 1.1 });
      // the burst sleeve hanging off the shoulder
      const sl = rag(add(ring, un, -22), add(ring, un, 22), 4, 8, A ? 94 : 95, ud);
      ink.form([O(shF, -10, -14), O(shF, 12, -16)].concat(sl), { w: 2.1, seed: 96 });
      if (A) drawRod();
      fist(ink, A ? mix(rodBot, rodTop, 0.5) : add(fistF, fd, 10), A ? Math.atan2(rd[1], rd[0]) + Math.PI / 2 : Math.atan2(fd[1], fd[0]), A ? 1.2 : 1.3);
      if (A) thinHand(ink, handB, Math.atan2(rd[1], rd[0]) + 1.4, 1.1);

      // ---- neck and head ----
      const Hr = (x, y) => { const c = Math.cos(tilt) * 1.12, s = Math.sin(tilt) * 1.12; return [head[0] + x * c - y * s, head[1] + x * s + y * c]; };
      ink.form(tube([O(neck, -2, 8), Hr(-2, 14)], 12, 11), { w: 2.4, seed: 101 });
      seam(ink, [O(neck, -12, -2), O(neck, 0, 2), O(neck, 10, -4)], 4, 2.6);
      const skull = smooth([Hr(-14, -6), Hr(-16, -18), Hr(-10, -29), Hr(0, -34), Hr(9, -30), Hr(14, -20), Hr(16, -11), Hr(18, -8), Hr(14, -5), Hr(16, -1), Hr(21, 3), Hr(17, 5.5),
        Hr(16, 8), Hr(18, 11), Hr(18, 16), Hr(12, 20), Hr(0, 19), Hr(-8, 14), Hr(-12, 4)], 4, true);
      ink.form(skull, { w: 2.6, seed: 103 });
      // a patch of scalp with hair on it, sewn on at the back
      const hair = [Hr(-9, -26), Hr(-13, -22)].concat(rag(Hr(-13, -22), Hr(-16, 2), 5, 5, 104, [-1, 0.2]), [Hr(-10, 0), Hr(-7, -12), Hr(-6, -22)]);
      ink.form(hair, { w: 1.8, seed: 105 });
      for (let i = 0; i < 3; i++) ink.cut(smooth([Hr(-8 - i, -20 + i * 6), Hr(-11 - i, -16 + i * 7), Hr(-14, -12 + i * 7)], 3), { w: 0.9 });
      seam(ink, [Hr(-4, -33), Hr(-7, -14), Hr(-9, 0)], 6, 2.4, { w: 1.1, sw: 1 });
      // seams across the forehead and down the cheek
      seam(ink, [Hr(-5, -20), Hr(6, -22), Hr(14, -18)], 5, 2.6, { w: 1.1, sw: 1 });
      seam(ink, [Hr(9, -4), Hr(6, 6), Hr(8, 18)], 4, 2.6, { w: 1.1, sw: 1 });
      // heavy flat brow, a sunk eye, a lower lid that sags
      ink.cut(smooth([Hr(4, -10), Hr(11, -10.5), Hr(18, -8.5)], 3), { w: 2, taper: 0.3 });
      ink.hatch(smooth([Hr(6, -9), Hr(15, -8), Hr(14, -3), Hr(7, -3)], 3, true), { angle: 1.25, gap: 2.4, w: 0.85, seed: 106 });
      ink.dot(...Hr(12, -6), 1.6);
      ink.cut(smooth([Hr(8, -2.5), Hr(11.5, -1), Hr(15, -2)], 3), { w: 0.9 });
      // a downturned mouth, jaw too heavy for the face
      ink.cut(smooth([Hr(11, 11), Hr(14, 10), Hr(17, 11)], 3), { w: 1.3 });
      ink.cut(smooth([Hr(4, 14), Hr(10, 17), Hr(16, 16)], 3), { w: 1 });
      ink.hatch(smooth([Hr(-12, 4), Hr(-4, 4), Hr(2, 16), Hr(-8, 14)], 3, true), { angle: 1.3, gap: 2.8, w: 0.85, seed: 107 });
      // a big ear that is not his
      ink.form(smooth([Hr(-2, -9), Hr(-8, -12), Hr(-13, -6), Hr(-12, 3), Hr(-7, 7), Hr(-3, 3)], 4, true), { w: 1.6, seed: 108 });
      ink.cut(smooth([Hr(-4, -7), Hr(-9, -6), Hr(-9, 0), Hr(-6, 2)], 3), { w: 1 });
    },
  });
})();
