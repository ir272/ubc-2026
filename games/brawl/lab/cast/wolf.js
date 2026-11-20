// The Wolf: a werewolf caught mid-change in a torn shirt and split trousers. Tint: blue (the shirt).
(function () {
  const { smooth, mix, h01 } = Ink;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const perp = (d) => [-d[1], d[0]];
  const dir = (a) => [Math.cos(a), Math.sin(a)];
  const O = (p, x, y) => [p[0] + x, p[1] + y];

  function tube(path, w0, w1, per = 4) {
    const p = path.length > 2 ? smooth(path, per) : path;
    const n = p.length, L = [], R = [];
    let a0 = 0, a1 = 0;
    for (let i = 0; i < n; i++) {
      const d = unit(p[Math.max(0, i - 1)], p[Math.min(n - 1, i + 1)]), nn = perp(d), w = w0 + ((w1 - w0) * i) / (n - 1);
      L.push(add(p[i], nn, w)); R.push(add(p[i], nn, -w));
      if (i === 0) a0 = Math.atan2(nn[1], nn[0]);
      if (i === n - 1) a1 = Math.atan2(nn[1], nn[0]);
    }
    const capE = [], capS = [];
    for (let j = 1; j < 6; j++) capE.push(add(p[n - 1], dir(a1 - (Math.PI * j) / 6), w1));
    for (let j = 1; j < 6; j++) capS.push(add(p[0], dir(a0 + Math.PI - (Math.PI * j) / 6), w0));
    return L.concat(capE, R.reverse(), capS);
  }
  /** A ragged edge from a to b: n uneven teeth pushed out along `out`. */
  function rag(a, b, n, depth, seed, out) {
    const res = [a];
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, r = h01(seed + i * 5.13);
      const tp = mix(a, b, t0 + (t1 - t0) * (0.35 + 0.3 * r));
      res.push(add(tp, out, depth * (0.4 + 0.9 * h01(seed + i * 2.71)) * (r > 0.8 ? 1.6 : 1)));
      res.push(i === n - 1 ? b : mix(a, b, t1));
    }
    return res;
  }
  /** Fur: short strokes along a path, leaning back from the direction of travel, pushed to one side. */
  function fur(ink, path, n, len, side, seed, o = {}) {
    const p = smooth(path, 6);
    for (let i = 0; i < n; i++) {
      const k = Math.min(p.length - 2, Math.round(((i + 0.5) / n) * (p.length - 1)));
      const d = unit(p[k], p[k + 1]), nn = perp(d), l = len * (0.7 + 0.6 * h01(seed + i));
      const a = add(p[k], nn, side * 1), b = add(add(a, nn, side * l * 0.8), d, -l * 0.6);
      (o.free ? ink.line : ink.cut)([a, mix(a, b, 0.5), b], { w: o.w ?? 1.1, taper: 0.8, seed: seed + i, tint: o.tint });
    }
  }
  /** A big hand with thick fingers and hooked claws, fingers along `ang`. */
  function paw(ink, wrist, ang, o = {}) {
    const k = o.k ?? 1, spread = o.spread ?? 0.5, curl = o.curl ?? 0.6, side = o.side ?? 1;
    const d = dir(ang), n = perp(d);
    const at = (a, b) => [wrist[0] + (d[0] * a + n[0] * b) * k, wrist[1] + (d[1] * a + n[1] * b) * k];
    const lens = [17, 21, 20, 15];
    for (let i = 3; i >= 0; i--) {
      const base = at(10, (i - 1.5) * 4 * side), a = ang + (i - 1.5) * 0.2 * spread * side;
      const j1 = add(base, dir(a), lens[i] * 0.55 * k), a2 = a + curl * side, tip = add(j1, dir(a2), lens[i] * 0.4 * k);
      ink.form(tube([base, j1, tip], 2.9 * k, 2 * k, 3), { w: 1.3 });
      const a3 = a2 + curl * 0.9 * side;
      ink.form([add(tip, dir(a2 + Math.PI / 2), 1.8 * k), add(add(tip, dir(a3), 8 * k), dir(a3 + 1.4 * side), 2 * k), add(tip, dir(a2 - Math.PI / 2), 1.8 * k)], { w: 1.1 });
    }
    const tb = at(4, -side * 7), ta = ang - side * 0.9;
    ink.form(tube([tb, add(tb, dir(ta), 9 * k), add(tb, dir(ta + side * 0.6), 15 * k)], 3 * k, 2 * k, 3), { w: 1.2 });
    ink.form(smooth([at(-7, -6 * side), at(4, -9 * side), at(12, -8 * side), at(15, 0), at(12, 9 * side), at(2, 8.5 * side), at(-7, 5 * side)], 4, true), { w: 1.6 });
    for (let i = 0; i < 3; i++) ink.cut([at(-2 + i * 4, -6 * side), at(1 + i * 4, -9 * side)], { w: 0.9 });
  }
  /** A digitigrade lower leg: knee, hock, toes on the floor (or pointing back in a leap). */
  function hindPaw(ink, hock, toe, seed) {
    const d = unit(hock, toe);
    ink.form(tube([hock, toe], 7.5, 5.5), { w: 2, seed });
    ink.form(smooth([add(toe, d, -10), add(add(toe, d, -4), perp(d), -7), add(add(toe, d, 10), perp(d), -6), add(add(toe, d, 14), perp(d), 1), add(add(toe, d, 6), perp(d), 6), add(toe, d, -8)], 4, true), { w: 1.8, seed: seed + 1 });
    for (let i = 0; i < 3; i++) {
      const b = add(add(toe, d, 12 + i * 0.5), perp(d), -4 + i * 3.2);
      ink.line([b, add(b, d, 5), add(add(b, d, 7), perp(d), 3)], { w: 1.3, taper: 0.8, seed: seed + 2 + i });
    }
    ink.cut([add(add(toe, d, 2), perp(d), -6), add(add(toe, d, 6), perp(d), 4)], { w: 0.9 });
  }

  CAST.push({
    id: 'wolf', group: 'monsters', name: 'The Wolf', kind: 'Werewolf',
    look: 'A man halfway into a wolf, bent double in a torn shirt and split trousers, with arms so long the claws nearly drag on the floor.',
    does: [
      ['Pounce', 'A long, flat leap. If it lands on the opponent, it pins them and bowls them over.'],
      ['Howl', 'Throws its head back and howls. Anyone close by staggers.'],
      ['Wall Run', 'Digs its claws into the side of the stage and runs straight up it.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      // ---- joints (feet on y = 0, up is -y, facing +x) ----
      const head = A ? [104, -114] : [66, -136];
      const tilt = A ? 0.08 : 0.1;
      const neck = A ? [76, -112] : [38, -142];
      const hump = A ? [18, -138] : [-16, -174];
      const chest = A ? [72, -88] : [40, -108];
      const belly = A ? [0, -80] : [8, -84];
      const rump = A ? [-60, -112] : [-50, -112];
      const shF = A ? [54, -110] : [16, -140], elbF = A ? [104, -104] : [50, -100], wristF = A ? [150, -92] : [56, -40];
      const shB = A ? [36, -120] : [-2, -150], elbB = A ? [88, -128] : [-10, -100], wristB = A ? [140, -124] : [8, -44];
      const hipF = A ? [-40, -96] : [-16, -96], kneeF = A ? [-70, -72] : [12, -58], hockF = A ? [-110, -62] : [-14, -24], toeF = A ? [-136, -50] : [6, 0];
      const hipB = A ? [-56, -104] : [-34, -98], kneeB = A ? [-92, -88] : [-18, -56], hockB = A ? [-128, -82] : [-46, -24], toeB = A ? [-154, -72] : [-26, 0];
      const tail = A ? [[-70, -112], [-104, -126], [-134, -132], [-162, -126]] : [[-52, -104], [-78, -96], [-94, -76], [-104, -52]];
      const jaw = A ? 0.55 : 0.4;

      // ---- the leap: the arc it left the floor on, speed strokes, grit kicked up ----
      if (A) {
        ink.line(smooth([[-160, 0], [-120, -30], [-40, -48], [60, -50], [160, -40]], 10), { tint: 'blue', w: 1.3, taper: 0.9, alpha: 0.7, seed: 3 });
        for (let i = 0; i < 6; i++) {
          const y = -150 + i * 16, x0 = -150 + (i % 2) * 22 + h01(i) * 10;
          ink.line([[x0, y], [x0 + 40 + h01(i + 3) * 30, y + 2]], { tint: 'blue', w: 1.4, taper: 0.9, seed: 4 + i });
        }
        for (let i = 0; i < 5; i++) ink.line([[-150 + i * 8, -2], [-160 + i * 5 - h01(i) * 8, -12 - h01(i + 9) * 14]], { w: 1.1, taper: 0.8, seed: 12 + i });
        for (let i = 0; i < 4; i++) ink.dot(-164 + i * 9, -18 - h01(i + 21) * 18, 1.4 + h01(i) * 0.8, { free: true });
      }

      // ---- the tail: a ragged brush ----
      const tP = smooth(tail, 6);
      const tailShape = (() => {
        const L = [], R = [], n = tP.length;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1), d = unit(tP[Math.max(0, i - 1)], tP[Math.min(n - 1, i + 1)]), nn = perp(d);
          const w = 4 + 10 * Math.sin(Math.PI * Math.pow(t, 0.75));
          const tl = h01(i * 1.7 + 3), tr = h01(i * 2.3 + 8);
          L.push(add(add(tP[i], nn, w + (tl > 0.6 ? 5 * tl : 0)), d, tl > 0.6 ? -6 * tl : 0));
          R.push(add(add(tP[i], nn, -w - (tr > 0.65 ? 5 * tr : 0)), d, tr > 0.65 ? -6 * tr : 0));
        }
        return L.concat([add(tP[n - 1], unit(tP[n - 3], tP[n - 1]), 8)], R.reverse());
      })();
      ink.form(tailShape, { w: 2.2, seed: 21 });
      fur(ink, tail, 9, 9, 1, 22, { free: true });
      for (let i = 0; i < 3; i++) fur(ink, tP.slice(4 + i * 3, tP.length - 6 + i), 5, 7, i % 2 ? 1 : -1, 24 + i * 9);
      ink.line([tP[tP.length - 1], add(tP[tP.length - 1], unit(tP[tP.length - 3], tP[tP.length - 1]), 10)], { w: 1.6, taper: 0.9 });

      // ---- the far arm and far leg ----
      ink.form(tube([shB, elbB, wristB], 11, 8), { w: 2.2, seed: 31 });
      ink.hatch(tube([shB, elbB, wristB], 11, 8), { angle: 1, gap: 3.5, w: 0.9, seed: 32 });
      fur(ink, [elbB, mix(elbB, wristB, 0.5), wristB], 4, 6, -1, 33);
      paw(ink, wristB, Math.atan2(wristB[1] - elbB[1], wristB[0] - elbB[0]), { k: 0.9, side: -1, curl: A ? 0.45 : 0.7, spread: A ? 1.2 : 0.5 });
      ink.form(tube([hipB, kneeB, hockB], 15, 7.5), { w: 2.2, seed: 35 });
      ink.hatch(tube([hipB, kneeB, hockB], 15, 7.5), { angle: 1.1, gap: 3.5, w: 0.9, seed: 36 });
      hindPaw(ink, hockB, toeB, 37);

      // ---- the body: one hunched mass from the rump to the neck ----
      const body = smooth([O(neck, 4, 12), chest, mix(chest, belly, 0.5), belly, O(hipF, 6, 6), O(rump, 6, 10), rump, mix(rump, hump, 0.5), hump, O(neck, -6, -12)], 6, true);
      ink.form(body, { w: 2.8, seed: 41 });

      // ---- the near leg: torn trousers to the knee, then a wolf's leg ----
      ink.form(tube([hipF, kneeF, hockF], 16, 8), { w: 2.4, seed: 43 });
      fur(ink, [kneeF, mix(kneeF, hockF, 0.5), hockF], 5, 6, 1, 44);
      hindPaw(ink, hockF, toeF, 45);
      // the trouser leg, ripped off above the knee
      const tk = unit(hipF, kneeF), tn = perp(tk);
      const kneeT = add(kneeF, tk, -6);
      const trouser = [add(hipF, tn, -20), add(add(hipF, tk, -8), tn, 16)].concat(rag(add(kneeT, tn, 16), add(kneeT, tn, -16), 5, 10, A ? 50 : 51, tk));
      ink.form(trouser, { w: 2.2, seed: 47 });
      ink.cut(smooth([add(hipF, tn, 4), mix(hipF, kneeT, 0.5), add(kneeT, tn, 6)], 4), { w: 1.2 });
      ink.hatch(smooth([add(hipF, tn, -18), add(kneeT, tn, -14), add(kneeT, tn, -4), mix(add(hipF, tn, -6), kneeT, 0.4)], 4, true), { angle: 1.2, gap: 3.6, w: 0.9, seed: 48 });
      ink.cut([add(mix(hipF, kneeT, 0.4), tn, 8), add(mix(hipF, kneeT, 0.62), tn, 2)], { w: 1 });

      // ---- the torn shirt, stretched over the back and split ----
      const shirt = smooth([O(neck, 6, 10), O(chest, -2, 4), mix(chest, belly, 0.45), O(belly, 4, -6)], 5)
        .concat(rag(O(belly, 4, -6), O(rump, 14, -2), 6, 12, A ? 60 : 61, A ? [0.2, 1] : [0, 1]))
        .concat(smooth([O(rump, 14, -2), O(mix(rump, hump, 0.5), 2, 2), O(hump, 0, 2), O(neck, -6, -10)], 5));
      ink.form(shirt, { tint: 'blue', w: 2.3, seed: 63 });
      ink.hatch(smooth([O(hump, 2, 4), mix(rump, hump, 0.5), O(rump, 12, 2), O(belly, -8, 4), O(chest, -24, 4)], 4, true), { tint: 'blue', angle: 1.2, gap: 4, w: 0.9, seed: 64 });
      // a split down the back with fur bursting through it
      const s0 = mix(hump, rump, 0.15), s1 = mix(hump, rump, 0.55);
      const split = smooth([O(s0, 2, 2), O(mix(s0, s1, 0.5), 10, 10), O(s1, 6, 8), O(mix(s0, s1, 0.5), -2, 6)], 4, true);
      ink.mask(split);
      ink.cut(split, { closed: true, tint: 'blue', w: 1.3, taper: 0 });
      fur(ink, [O(s0, 2, 2), O(mix(s0, s1, 0.5), 2, 4), O(s1, 2, 4)], 6, 7, -1, 66, { free: true });
      // seams and folds pulling across the back
      ink.cut(smooth([O(neck, -4, 2), O(hump, 10, 16), O(mix(hump, rump, 0.6), 8, 22)], 5), { tint: 'blue', w: 1.2 });
      ink.cut(smooth([O(chest, -12, -10), O(chest, -20, 10), O(belly, 6, -18)], 4), { tint: 'blue', w: 1.1 });
      // the mane rising off the hump above the collar
      fur(ink, [O(neck, -4, -10), O(hump, 12, -2), O(hump, -12, 4)], 8, 9, 1, 70, { free: true });

      // ---- the near arm: a torn sleeve, a long furred forearm, the big hand ----
      const sleeveEnd = mix(shF, elbF, 0.85), sd = unit(shF, elbF), sn = perp(sd);
      const foreF = add(mix(elbF, wristF, 0.35), perp(unit(elbF, wristF)), A ? -4 : 4);
      ink.form(tube([shF, elbF, foreF, wristF], 14, 8.5), { w: 2.4, seed: 81 });
      fur(ink, [elbF, mix(elbF, wristF, 0.5), wristF], 6, 7, -1, 82);
      fur(ink, [elbF, mix(elbF, wristF, 0.6)], 3, 6, 1, 83);
      const sleeve = smooth([add(add(shF, sd, -2), sn, -16), add(add(shF, sd, -12), sn, -10), add(shF, sd, -16), add(add(shF, sd, -12), sn, 11), add(add(shF, sd, -2), sn, 16)], 4).concat(rag(add(sleeveEnd, sn, 15), add(sleeveEnd, sn, -15), 4, 8, A ? 84 : 85, sd));
      ink.form(sleeve, { tint: 'blue', w: 2.1, seed: 86 });
      ink.cut(smooth([add(shF, sn, 4), add(mix(shF, sleeveEnd, 0.6), sn, 2)], 3), { tint: 'blue', w: 1.1 });
      paw(ink, wristF, Math.atan2(wristF[1] - elbF[1], wristF[0] - elbF[0]), { k: 1.05, side: -1, curl: A ? 0.4 : 0.75, spread: A ? 1.4 : 0.6 });

      // ---- the head: ears laid flat, jaws open ----
      const Hr = (x, y) => { const c = Math.cos(tilt), s = Math.sin(tilt); return [head[0] + x * c - y * s, head[1] + x * s + y * c]; };
      const J = (x, y) => { const c = Math.cos(jaw), s = Math.sin(jaw), x0 = x - 12, y0 = y - 6; return Hr(12 + x0 * c - y0 * s, 6 + x0 * s + y0 * c); };
      // far ear
      ink.form(smooth([Hr(-6, -12), Hr(-26, -22), Hr(-34, -24), Hr(-20, -14), Hr(-10, -6)], 4, true), { w: 1.6, seed: 91 });
      // the lower jaw, dropped open, teeth up
      const lower = smooth([J(10, 6), J(26, 8), J(40, 10), J(42, 14), J(30, 17), J(14, 18), J(4, 14)], 4, true);
      ink.mask(smooth([Hr(14, 4), Hr(44, 2), J(42, 10), J(12, 10)], 3, true));
      ink.cut(smooth([Hr(14, 6), J(24, 8), J(38, 10)], 3), { w: 1, taper: 0.4 });
      ink.form(lower, { w: 2.2, seed: 93 });
      for (let i = 0; i < 4; i++) { const x = 18 + i * 6; ink.form([J(x, 9), J(x + 1.5, 4 - (i === 3 ? 3 : 0)), J(x + 3, 9)], { w: 0.8, seed: 94 + i }); }
      // the skull and the long muzzle
      const skull = smooth([Hr(-16, 6), Hr(-14, -8), Hr(-4, -16), Hr(8, -15), Hr(16, -9), Hr(30, -7), Hr(44, -5), Hr(48, -1), Hr(46, 4), Hr(36, 4), Hr(20, 5), Hr(12, 8), Hr(4, 16), Hr(-8, 16)], 4, true);
      ink.form(skull, { w: 2.6, seed: 99 });
      for (let i = 0; i < 5; i++) { const x = 18 + i * 5.5; ink.form([Hr(x, 4.5), Hr(x + 1.5, 9 + (i === 4 ? 4 : 0)), Hr(x + 3, 4.5)], { w: 0.8, seed: 100 + i }); }
      ink.form([Hr(42, 4), Hr(41, 13), Hr(38, 4)], { w: 0.9, seed: 106 });
      ink.form(smooth([Hr(43, -4), Hr(48, -3), Hr(49, 1), Hr(45, 1)], 3, true), { w: 1.2, seed: 107 });
      ink.dot(...Hr(46, -1.5), 1.6);
      ink.cut(smooth([Hr(16, -9), Hr(30, -6), Hr(42, -5)], 4), { w: 1 });
      // lip pulled back in a snarl, wrinkles over the nose
      ink.cut(smooth([Hr(12, 8), Hr(18, 3), Hr(26, 3)], 3), { w: 1.2 });
      for (let i = 0; i < 3; i++) ink.cut(smooth([Hr(22 + i * 4, -7), Hr(24 + i * 4, -4), Hr(23 + i * 4, -1)], 3), { w: 0.9 });
      // the slanted eye under a heavy brow
      ink.form(smooth([Hr(6, -7), Hr(11, -9.5), Hr(16, -8), Hr(11, -5)], 3, true), { w: 1, seed: 108 });
      ink.dot(...Hr(11.5, -7.5), 1.3);
      ink.cut(smooth([Hr(2, -11), Hr(10, -13), Hr(18, -10)], 3), { w: 1.7, taper: 0.4 });
      ink.hatch(smooth([Hr(-14, -6), Hr(-4, -12), Hr(-2, 6), Hr(-8, 15), Hr(-16, 6)], 4, true), { angle: 1.3, gap: 3, w: 0.9, seed: 109 });
      // ruff of fur round the cheek
      fur(ink, [Hr(4, 16), Hr(-6, 18), Hr(-16, 8), Hr(-16, -4)], 7, 8, -1, 110, { free: true });
      // near ear, flat back along the skull
      ink.form(smooth([Hr(-2, -14), Hr(-20, -22), Hr(-36, -22), Hr(-22, -12), Hr(-8, -6)], 4, true), { w: 1.8, seed: 117 });
      ink.cut(smooth([Hr(-8, -11), Hr(-20, -17), Hr(-30, -20)], 3), { w: 1 });
    },
  });
})();
