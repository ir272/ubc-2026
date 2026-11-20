// The Angler: a fish-headed fisher in oilskins and a sou'wester, with a long rod, a line and a big
// hook. Tint: blue (the line and the hat band).
(function () {
  const { smooth, ell, mix, h01 } = Ink;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const perp = (d) => [-d[1], d[0]];
  const dir = (a) => [Math.cos(a), Math.sin(a)];
  const rot = (p, c, a) => { const x = p[0] - c[0], y = p[1] - c[1], cs = Math.cos(a), sn = Math.sin(a); return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]; };

  /** A bent tube along a path as one closed outline (no seam at the joints). */
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
  /** A webbed hand closed round the rod: knuckles, a fin of skin between the fingers. */
  function grip(ink, c, up, o = {}) {
    const k = o.k ?? 1, v = perp(up);
    const at = (a, b) => [c[0] + (up[0] * a + v[0] * b) * k, c[1] + (up[1] * a + v[1] * b) * k];
    ink.form(smooth([at(-8, -7), at(7, -8), at(9, -1), at(8, 6), at(-1, 8), at(-8, 6), at(-10, -1)], 4, true), { w: 1.6 });
    for (let i = 0; i < 3; i++) ink.cut([at(-4.5 + i * 4.2, 2.5), at(-5 + i * 4.2, 8)], { w: 1, taper: 0.6 });
    ink.cut(smooth([at(-6, -3), at(0, -2), at(6, -3.5)], 4), { w: 0.9, taper: 0.8 });
    // claws over the rod
    for (let i = 0; i < 3; i++) ink.line([at(-5 + i * 4.2, 8.5), at(-6 + i * 4.2, 11)], { w: 1.1, taper: 0.9 });
    ink.form(tube([at(5, -8), at(9, -2), at(9, 4)], 2.2 * k, 1.2 * k, 3), { w: 1.2 });
  }
  /** The hook: an eye, a long shank, the bend and a barb. c = the eye; a = turn. */
  function hook(ink, c, a, s = 1, o = {}) {
    const P = (x, y) => rot([c[0] + x * s, c[1] + y * s], c, a);
    ink.line(smooth([P(0, 3), P(-3, 0), P(0, -3), P(3, 0), P(0, 3)], 3), { w: 1.6, taper: 0, tint: o.tint });
    const bend = smooth([P(0, 3), P(0, 18), P(-1, 28), P(-8, 34), P(-15, 31), P(-17, 22)], 6);
    ink.line(bend, { w: 3, taper: 0.5, seed: 401 });
    ink.line([P(-17, 22), P(-12, 27)], { w: 1.8, taper: 0.6, seed: 402 });
  }

  CAST.push({
    id: 'angler', group: 'reach', name: 'The Angler', kind: 'Long reach and spells',
    look: 'A hunched fish-headed fisher in creased oilskins and a wide rain hat, with a whippy rod, a line and a hook as big as a hand.',
    does: [
      ['Hook and Reel', 'He casts the hook across the stage; if it catches someone he reels them in to his feet.'],
      ['Bubble', 'He blows one slow bubble that traps whatever it touches and floats it upward.'],
      ['Line Swing', 'He hooks the edge of the stage and swings back up on the line.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      const X = A ? -60 : 0;
      const J = (x, y) => [x + X, y];
      // ---- joints ----
      const footB = A ? J(-34, 0) : [-18, 0], footF = A ? J(34, 0) : [18, 0];
      const kneeB = A ? J(-20, -50) : [-12, -52], kneeF = A ? J(30, -56) : [20, -54];
      const hip = A ? J(0, -98) : [0, -98];
      const hump = A ? J(-10, -160) : [-18, -156];        // the hunched back
      const shB = A ? J(8, -156) : [-4, -154], shF = A ? J(24, -152) : [14, -152];
      const neck = A ? J(32, -158) : [22, -158];
      const head = A ? J(52, -168) : [40, -170];          // centre of the fish head
      const rodBut = A ? J(0, -100) : [-8, -80];
      const rodGrip = A ? J(54, -128) : [34, -106];
      const rodTip = A ? J(244, -232) : [118, -238];
      const ru = unit(rodBut, rodGrip);
      const handB = mix(rodBut, rodGrip, 0.18), handF = rodGrip;
      const elB = A ? J(-8, -118) : [-14, -110], elF = A ? J(36, -112) : [24, -112];

      // ---- far arm ----
      ink.form(tube([shB, elB, handB], 6.5, 5, 4), { w: 2.2, seed: 501 });
      ink.hatch(tube([shB, elB, handB], 6.5, 5, 4), { angle: 0.4, gap: 3.4, w: 0.9, seed: 502 });

      // ---- boots and the legs of the oilskin trousers ----
      for (const [f, kn, s] of [[footB, kneeB, 510], [footF, kneeF, 520]]) {
        const lg = tube([add(hip, [s === 510 ? -6 : 6, 0]), kn, add(f, [0, -12])], 8, 8, 4);
        ink.form(lg, { w: 2.3, seed: s });
        if (s === 510) ink.hatch(lg, { angle: 0.4, gap: 3.4, w: 0.9, seed: s + 1 });
        // the sea boot: wide top, rolled cuff, blunt toe
        const bt = smooth([add(kn, [-10, 8]), add(kn, [10, 8]), add(f, [9, -14]), add(f, [11, -6]), add(f, [21, -4]), add(f, [22, 0]), add(f, [-11, 0]), add(f, [-10, -10])], 3, true);
        ink.form(bt, { w: 2.3, seed: s + 2 });
        ink.form(smooth([add(kn, [-12, 3]), add(kn, [12, 2]), add(kn, [12, 11]), add(kn, [-12, 12])], 3, true), { w: 1.7, seed: s + 3 });
        ink.cut([add(f, [-10, -3]), add(f, [21, -3])], { w: 1.2, taper: 0.2 });
        ink.cut(smooth([add(kn, [-4, 16]), add(mix(kn, f, 0.55), [-3, 0]), add(f, [-5, -8])], 3), { w: 1.1 });
        ink.cut(smooth([add(kn, [6, 18]), add(mix(kn, f, 0.6), [7, 0])], 3), { w: 1 });
      }

      // ---- the oilskin smock: stiff, creased, down past the knees ----
      const hemF = [hip[0] + 30, -46], hemB = [hip[0] - 32 + (A ? -10 : 0), -42];
      const coat = smooth([
        add(neck, [-4, 4]), add(shF, [8, 6]), add(shF, [14, 30]), [hip[0] + 22, hip[1] - 6], [hip[0] + 26, hip[1] + 20], hemF,
        [hip[0] + 14, -40], [hip[0] - 6, -44], [hip[0] - 20, -39], hemB,
        [hip[0] - 28, hip[1] + 10], [hip[0] - 26, hip[1] - 16], add(hump, [-8, 12]), add(hump, [-4, -6]), add(hump, [12, -12]),
      ], 4, true);
      ink.form(coat, { w: 2.8, seed: 531 });
      ink.hatch(smooth([add(hump, [-4, -4]), add(hump, [-8, 12]), [hip[0] - 26, hip[1] - 16], [hip[0] - 28, hip[1] + 10], hemB, [hip[0] - 12, -42], [hip[0] - 10, hip[1]], add(hump, [8, 10])], 4, true), { angle: 1.1, gap: 4, w: 1, seed: 532 });
      // creases that break across the stiff cloth
      const cr = [[[-18, -6], [-6, -2], [4, -6]], [[-20, 20], [-4, 24], [10, 20]], [[-16, 40], [2, 44], [18, 40]], [[2, 8], [12, 4], [20, 8]], [[0, 30], [12, 34], [24, 30]]];
      cr.forEach((c, i) => ink.cut(smooth(c.map((q) => add(hip, q)), 3), { w: 1.2 + (i % 2) * 0.2 }));
      ink.cut(smooth([add(shF, [4, 20]), [hip[0] + 14, hip[1] - 6], [hip[0] + 16, hip[1] + 20], [hemF[0] - 8, hemF[1] - 2]], 3), { w: 1.3 });
      // toggles down the front
      for (let i = 0; i < 4; i++) {
        const t = mix(add(shF, [10, 14]), [hip[0] + 20, hip[1] + 18], i / 3);
        ink.cut([add(t, [-3, 0]), add(t, [3, 0.5])], { w: 2, taper: 0.2 });
      }
      // patch pocket
      ink.form([[hip[0] - 2, hip[1] + 6], [hip[0] + 14, hip[1] + 6], [hip[0] + 13, hip[1] + 22], [hip[0] - 1, hip[1] + 22]], { w: 1.3, seed: 533 });
      ink.cut([[hip[0] - 2, hip[1] + 10], [hip[0] + 14, hip[1] + 10]], { w: 1, taper: 0.2 });

      // ---- the turned-up collar ----
      ink.form(smooth([add(neck, [-14, 6]), add(neck, [-12, -10]), add(neck, [2, -12]), add(neck, [10, -6]), add(neck, [10, 6]), add(neck, [-2, 10])], 3, true), { w: 2.2, seed: 541 });
      ink.cut(smooth([add(neck, [-8, -6]), add(neck, [-6, 6])], 3), { w: 1 });

      // ---- the fish head ----
      const F = (x, y) => [head[0] + x, head[1] + y];
      // a spiny dorsal fin rising out from under the hat brim at the back
      const fb = F(-20, 4);
      const fin = [fb, F(-30, -6), F(-30, 2), F(-40, -2), F(-36, 7), F(-46, 6), F(-40, 13), F(-50, 15), add(hump, [6, -8]), F(-14, 14)];
      ink.form(fin, { w: 1.6, seed: 551 });
      for (const [a, b] of [[F(-22, 6), F(-29, -2)], [F(-26, 9), F(-38, 1)], [F(-30, 12), F(-44, 7)], [F(-34, 15), F(-47, 13)]]) ink.cut([a, b], { w: 0.9 });
      const fh = smooth([F(-20, 12), F(-24, 0), F(-18, -12), F(-2, -16), F(14, -14), F(26, -8), F(32, -2), F(34, 4), F(28, 6), F(32, 10), F(26, 15), F(10, 16), F(-6, 16)], 4, true);
      ink.form(fh, { w: 2.6, seed: 552 });
      // shadow under the jaw
      ink.hatch(smooth([F(-20, 12), F(-12, 6), F(6, 10), F(24, 12), F(26, 15), F(10, 16), F(-6, 16)], 3, true), { angle: 1.2, gap: 2.8, w: 0.9, seed: 553 });
      // the mouth: thick lips, turned down, a few needle teeth
      ink.cut(smooth([F(34, 5), F(24, 7), F(14, 10), F(8, 13)], 4), { w: 1.8, taper: 0.5 });
      ink.cut(smooth([F(30, 0), F(26, 3)], 3), { w: 1.1 });
      for (let i = 0; i < 3; i++) ink.cut([F(28 - i * 5, 6.5 + i * 0.8), F(27 - i * 5, 9 + i * 0.8)], { w: 0.9, taper: 0.9 });
      // the eye: big, round, a ring of lid and a hard black pupil
      ink.form(ell(F(12, -6)[0], F(12, -6)[1], 6.2, 6.2, 0, 18), { w: 1.6, seed: 554 });
      ink.mask(ell(F(13, -6)[0], F(13, -6)[1], 2.6, 3, 0, 12));
      ink.dot(F(12, -7.5)[0], F(12, -7.5)[1], 0.9, { free: true });
      ink.cut(smooth([F(4, -13), F(12, -14), F(19, -11)], 3), { w: 1.1 });
      // gill slits and a few scales
      for (let i = 0; i < 3; i++) ink.cut(smooth([F(-6 - i * 4, -6), F(-9 - i * 4, 2), F(-6 - i * 4, 11)], 3), { w: 1.2 - i * 0.15 });
      for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) {
        const c = F(-16 + i * 6 + r * 3, -10 + r * 5);
        ink.cut(smooth([add(c, [-2.5, 0]), add(c, [0, 2.2]), add(c, [2.5, 0])], 3), { w: 0.9, taper: 0.4 });
      }
      // barbels hanging from the corner of the mouth
      ink.line(smooth([F(28, 9), F(34, 16), F(32, 26), F(36, 34)], 4), { w: 1.3, taper: 0.8 });
      ink.line(smooth([F(22, 11), F(24, 20), F(20, 28)], 4), { w: 1.1, taper: 0.8 });

      // ---- the sou'wester: brim long at the back, a blue band ----
      const hc = F(-2, -14), ht = A ? -0.12 : -0.06;
      const HT = (x, y) => rot([hc[0] + x, hc[1] + y], hc, ht);
      ink.form(smooth([HT(-17, 0), HT(-15, -9), HT(-6, -14), HT(8, -14), HT(16, -8), HT(17, 0)], 4).concat([HT(16, 2), HT(-17, 2)]), { w: 2.4, seed: 561 });
      ink.hatch(smooth([HT(-17, 1), HT(-15, -9), HT(-6, -14), HT(-4, -6), HT(-7, 1)], 3, true), { angle: 1.3, gap: 2.8, w: 0.9, seed: 562 });
      ink.cut(smooth([HT(-4, -14), HT(1, -7), HT(3, 1)], 3), { w: 1.1 });
      const band = [HT(-17, -1), HT(17, -1), HT(16.5, -5), HT(-16.5, -5)];
      ink.form(band, { tint: 'blue', w: 1.4, seed: 563 });
      ink.hatch(band, { tint: 'blue', angle: 0.2, gap: 2.2, w: 0.8, seed: 564 });
      const brim = smooth([HT(-44, 24), HT(-34, 8), HT(-14, 0), HT(8, 0), HT(28, 4), HT(34, 9), HT(22, 9), HT(6, 5), HT(-14, 7), HT(-28, 16), HT(-40, 28)], 4, true);
      ink.form(brim, { w: 2.3, seed: 565 });
      ink.cut(smooth([HT(-34, 18), HT(-20, 9), HT(0, 3), HT(24, 5)], 4), { w: 1, taper: 0.6 });
      // chin strap
      ink.cut([HT(-8, 6), F(-2, 16)], { w: 1.1, taper: 0.3 });

      // ---- the rod, its reel, the line and the hook ----
      const rp = A
        ? smooth([rodBut, rodGrip, mix(rodGrip, rodTip, 0.5), add(rodTip, [-6, -6]), rodTip], 8)
        : smooth([rodBut, rodGrip, [82, -152], [108, -200], rodTip], 8);
      // a tapered rod: thick cork butt, a whip toward the tip
      for (let i = 0; i < rp.length - 1; i++) {
        const t = i / (rp.length - 1);
        ink.line([rp[i], rp[i + 1]], { w: 4.4 - t * 3.2, taper: 0, wobble: 0.3, seed: 570 + i });
      }
      // line guides
      for (const t of [0.42, 0.6, 0.76, 0.9]) {
        const i = Math.round(t * (rp.length - 1)), q = rp[i], d = unit(rp[i - 1], rp[i + 1]), n = perp(d);
        ink.line([q, add(q, n, 4)], { w: 1, taper: 0 });
      }
      // the reel under the grip: a drum and a crank
      const rc = add(mix(rodBut, rodGrip, 0.45), perp(ru), 9);
      ink.form(ell(rc[0], rc[1], 7, 7, 0, 18), { w: 2, seed: 581 });
      ink.form(ell(rc[0], rc[1], 3, 3, 0, 12), { w: 1.2, seed: 582 });
      const crank = add(rc, dir(A ? -0.6 : 2.2), 9);
      ink.line([rc, crank], { w: 1.6, taper: 0 });
      ink.form(ell(crank[0], crank[1], 2.4, 1.6, 0.4, 10), { w: 1.1, seed: 583 });
      ink.line([add(rc, perp(ru), -6), add(mix(rodBut, rodGrip, 0.45), [0, 0])], { w: 1.4, taper: 0 });

      const tip = rp[rp.length - 1];
      if (!A) {
        // the line hangs straight down to a lead weight and the hook
        const sink = [tip[0], -150], eye = [tip[0], -132];
        ink.line([tip, sink], { tint: 'blue', w: 1.3, taper: 0, seed: 590 });
        ink.form(smooth([add(sink, [0, -4]), add(sink, [3.5, 2]), add(sink, [0, 7]), add(sink, [-3.5, 2])], 3, true), { w: 1.4, seed: 591 });
        ink.line([add(sink, [0, 7]), add(eye, [0, -3])], { tint: 'blue', w: 1.2, taper: 0, seed: 592 });
        hook(ink, eye, 0.05, 1, { tint: 'blue' });
      } else {
        // the cast: the line whips out in a long arc, the hook flying point-first
        const eye = [322, -112];
        const lp = smooth([tip, [tip[0] + 34, -238], [276, -214], [306, -168], eye], 10);
        ink.line(lp, { tint: 'blue', w: 1.5, taper: 0.1, seed: 593 });
        // the slack it is paying out, and speed strokes behind the hook
        for (let i = 0; i < 3; i++) {
          const b = add(eye, [-14 - i * 4, -16 + i * 7]);
          ink.line([b, add(b, dir(-2.3), 22 - i * 4)], { tint: 'blue', w: 1.2, taper: 0.9, seed: 595 + i });
        }
        hook(ink, eye, -0.55, 1.5, { tint: 'blue' });
      }

      // ---- near arm: oilskin sleeve, the hands on the rod ----
      grip(ink, handB, ru, { k: 0.85 });
      const wr = add(handF, perp(ru), -9);
      const sl = tube([shF, elF, wr], 8, 7.5, 4);
      ink.form(sl, { w: 2.5, seed: 601 });
      ink.cut(smooth([add(elF, [-6, -8]), add(elF, [0, 0]), add(elF, [-5, 8])], 3), { w: 1.2 });
      ink.cut(smooth([add(mix(shF, elF, 0.5), [-6, 0]), add(mix(shF, elF, 0.5), [5, 2])], 3), { w: 1.1 });
      const cd = unit(elF, wr), cn = perp(cd);
      ink.form([add(add(wr, cd, -6), cn, 8.5), add(add(wr, cd, 1), cn, 9), add(add(wr, cd, 1), cn, -9), add(add(wr, cd, -6), cn, -8.5)], { w: 1.6, seed: 602 });
      grip(ink, handF, ru, { k: 0.9 });
    },
  });
})();
