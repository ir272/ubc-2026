// Wick: a candle sprite. A stub of dripping wax in a tin saucer, stubby limbs, a flame for hair.
(function () {
  const { smooth, ell, limb } = Ink;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const nrm = (d) => [-d[1], d[0]];
  const fr = (o, d) => { const n = nrm(d); return (t, s) => [o[0] + d[0] * t + n[0] * s, o[1] + d[1] * t + n[1] * s]; };

  // a lower edge of wax, right to left, with drips hanging off it: [x, length, half-width]
  function dripEdge(F, x0, x1, base, drips) {
    const out = [F(x0, base)];
    for (const [x, len, w] of drips) {
      out.push(F(x + w * 1.6, base + 1), F(x + w * 0.7, base + len * 0.55), F(x + w * 1.05, base + len - w * 0.4), F(x, base + len + w * 0.7), F(x - w * 1.05, base + len - w * 0.4), F(x - w * 0.7, base + len * 0.55), F(x - w * 1.6, base + 1));
    }
    out.push(F(x1, base));
    return out;
  }

  CAST.push({
    id: 'wick', group: 'fast', name: 'Wick', kind: 'Fast and light',
    look: 'A stub of a candle come alive: dripping wax, a tin saucer for a belt, stubby fists and a flame for hair.',
    does: [
      ['Flame Dart', 'Flicks a dart of fire off its own head.'],
      ['Snuff', 'Goes out in a wisp of smoke and relights somewhere else.'],
      ['Flare', 'Burns bright and shoots straight up.'],
    ],
    draw(ink, pose) {
      const T = pose === 'ability';
      // ---- joints ----
      const lean = T ? 0.26 : 0.05;
      const hip = T ? [6, -30] : [0, -30];
      const lc = Math.cos(lean), ls = Math.sin(lean);
      const U = (x, y) => [hip[0] + x * lc - y * ls, hip[1] + x * ls + y * lc]; // the candle's own frame
      const kneeF = T ? [30, -14] : [16, -14], footF = T ? [36, 0] : [18, 0];
      const kneeB = T ? [-12, -12] : [-10, -13], footB = T ? [-26, 0] : [-14, 0];
      const shF = U(19, -26), shB = U(-19, -28);
      const elbowF = T ? U(36, -30) : U(32, -20), handF = T ? U(54, -36) : U(38, -36);
      const elbowB = T ? U(-32, -22) : U(-32, -20), handB = T ? U(-42, -34) : U(-36, -36);
      const wick = U(1, -70);
      const sweep = T ? 1 : 0.22; // how far the flame is blown back

      // ---- back arm and back leg ----
      const stub = (a, b, c, w, sd) => { ink.form(smooth([...limb(a, b, w, w * 0.85)], 2, true), { seed: sd }); ink.form(limb(b, c, w * 0.85, w * 0.75), { seed: sd + 1 }); };
      stub(shB, elbowB, handB, 5.6, 10);
      ink.form(ell(handB[0], handB[1], 6.2, 5.6, -0.4), { seed: 12, w: 2.2 });
      ink.form(limb([hip[0] - 7, hip[1]], kneeB, 7.5, 6.5), { seed: 14 });
      ink.form(limb(kneeB, add(footB, [0, -5]), 6.5, 6), { seed: 15 });
      ink.form(smooth([add(footB, [-9, 0]), add(footB, [-8, -8]), add(footB, [4, -9]), add(footB, [11, -4]), add(footB, [11, 0])], 4, true), { seed: 16, w: 2.2 });

      // ---- the saucer, back rim ----
      const sc = U(0, 2);
      ink.form(ell(sc[0], sc[1], 36, 7.5, lean), { seed: 20, w: 2.2 });
      // the finger loop at the back
      const loop = U(-44, 0);
      ink.form(ell(loop[0], loop[1], 9, 8, lean), { seed: 22, w: 2.4 });
      ink.mask(ell(loop[0], loop[1], 4.6, 3.8, lean));
      ink.cut(ell(loop[0], loop[1], 4.6, 3.8, lean), { closed: true, w: 1.3, seed: 23 });

      // ---- the candle body ----
      const body = smooth([U(-21, 3), U(-22, -30), U(-20, -58), U(-16, -68), U(-6, -66), U(4, -63), U(14, -66), U(21, -60), U(22, -30), U(21, 3)], 6, true);
      ink.form(body, { w: 2.8, seed: 30 });
      ink.hatch(smooth([U(-21, 3), U(-22, -30), U(-20, -56), U(-11, -56), U(-12, -20), U(-9, 3)], 5, true), { angle: 1.45 + lean, gap: 3.6, seed: 31 });
      // wax streaks and an old crack
      ink.cut(smooth([U(-6, -30), U(-7, -14), U(-5, 0)], 5), { w: 1.3, seed: 32 });
      ink.cut(smooth([U(14, -18), U(16, -6), U(15, 2)], 5), { w: 1.2, seed: 33 });
      ink.cut(smooth([U(4, -12), U(7, -6), U(5, 0)], 5), { w: 1.1, seed: 34 });

      // the melted top: a coat of wax pooled at the rim and running down in drips
      const coat = smooth([U(-19, -60), U(-16, -71), U(-6, -68), U(4, -65), U(14, -69), U(23, -62), U(23.5, -54),
        ...dripEdge(U, 23, -22.5, -52, [[20, 14, 2.6], [11, 5, 2.4], [-3, 27, 3], [-15, 10, 2.6]]), U(-22.5, -54)], 4, true);
      ink.form(coat, { w: 2.4, seed: 40 });
      ink.cut(smooth([U(-14, -64), U(-4, -61), U(6, -60), U(16, -63)], 5), { w: 1.4, seed: 41 });
      ink.cut(smooth([U(-1, -52), U(-3, -36)], 3), { w: 1.1, seed: 42 });
      // a drip that ran past the edge on the back and set there
      ink.form(smooth([U(-20, -40), U(-25, -36), U(-26, -22), U(-23, -17), U(-21, -24), U(-20.5, -34)], 5, true), { w: 2, seed: 43 });

      // ---- the face: set low, under the melt; a scowl ----
      const eA = U(5, -41), eB = U(15, -42);
      ink.form(ell(eA[0], eA[1], 3.4, 4.4, lean), { w: 1.7, seed: 50 });
      ink.form(ell(eB[0], eB[1], 3, 4.2, lean), { w: 1.7, seed: 51 });
      ink.dot(eA[0] + 1, eA[1] + 0.8, 1.6, { free: ink.mode === 'line' });
      ink.dot(eB[0] + 1, eB[1] + 0.8, 1.5, { free: ink.mode === 'line' });
      ink.cut([U(0, -47.5), U(8, -45)], { w: 1.8, seed: 52 });
      ink.cut([U(12, -45.5), U(19, -48)], { w: 1.8, seed: 53 });
      ink.cut(smooth(T ? [U(6, -33), U(11, -30), U(16, -33)] : [U(6, -32), U(11, -33.5), U(16, -32)], 4), { w: 1.6, seed: 54 });

      // ---- the saucer, front: a shallow tin dish with a rolled lip ----
      const dish = smooth([U(-38, -1), U(-34, 9), U(-20, 13), U(20, 13), U(34, 9), U(38, -1), U(20, 4), U(-20, 4)], 5, true);
      ink.form(dish, { w: 2.6, seed: 60 });
      ink.cut(smooth([U(-35, 3), U(-20, 7.5), U(20, 7.5), U(35, 3)], 6), { w: 1.3, seed: 61 });
      ink.hatch(smooth([U(-34, 9), U(-20, 13), U(10, 13), U(4, 8), U(-20, 8), U(-35, 4)], 5, true), { angle: 0.25, gap: 2.8, seed: 62 });
      ink.dot(...U(28, 6), 1.3);
      ink.dot(...U(-26, 7), 1.3);

      // ---- front leg ----
      ink.form(limb([hip[0] + 8, hip[1] + 6], kneeF, 7.5, 6.5), { seed: 70 });
      ink.form(limb(kneeF, add(footF, [0, -5]), 6.5, 6), { seed: 71 });
      ink.form(smooth([add(footF, [-8, 0]), add(footF, [-8, -8]), add(footF, [5, -9]), add(footF, [13, -4]), add(footF, [13, 0])], 4, true), { seed: 72, w: 2.2 });
      ink.cut([add(kneeF, [-5, 1]), add(kneeF, [3, 3])], { w: 1.2, seed: 73 });

      // ---- front arm ----
      stub(shF, elbowF, handF, 5.8, 80);
      if (T) {
        // fingers flicked open after the throw
        const d = unit(elbowF, handF);
        ink.form(ell(handF[0], handF[1], 6, 5.4, Math.atan2(d[1], d[0])), { seed: 83, w: 2.2 });
        [-0.8, -0.2, 0.4].forEach((a, i) => {
          const an = Math.atan2(d[1], d[0]) + a, fd = [Math.cos(an), Math.sin(an)], p0 = add(handF, fd, 4.5);
          ink.form(limb(p0, add(p0, fd, 7 - i), 2.2, 1.8), { seed: 84 + i, w: 1.7 });
        });
      } else {
        // a mitten fist raised, knuckles forward
        const P = fr(handF, unit(elbowF, handF));
        ink.form(smooth([P(-6, -6), P(3, -7.5), P(8, -4), P(8.5, 3), P(3, 7), P(-6, 6)], 4, true), { seed: 83, w: 2.2 });
        ink.cut([P(3, -5), P(4, 4)], { w: 1.1, seed: 84 });
        ink.cut([P(-3, -6), P(2, -2)], { w: 1.1, seed: 85 });
      }

      // ---- the wick and the flame for hair ----
      const wTop = add(wick, [T ? -3 : 1, -9]);
      ink.line(smooth([wick, add(wick, [0.5, -5]), wTop], 4), { w: 2.6, taper: 0.2, seed: 90 });
      // flame in the frame of the wick: x forward, y up, swept back by `sweep`
      const F = (x, y) => { const k = -y / 60; return add(wTop, [x - sweep * 62 * k * k - (T ? 10 * k : 0), y * (1 - sweep * 0.18)]); };
      const flame = smooth([F(-12, 3), F(-18, -8), F(-21, -20), F(-34, -26), F(-22, -32), F(-19, -44), F(-30, -58), F(-14, -54), F(-11, -68), F(-6, -88), F(-1, -66), F(5, -54), F(12, -62), F(11, -46), F(15, -30), F(15, -14), F(11, 3)], 6, true);
      ink.form(flame, { tint: 'gold', w: 2.6, seed: 100 });
      ink.hatch(smooth([F(-12, 2), F(-18, -8), F(-21, -20), F(-34, -26), F(-22, -32), F(-19, -44), F(-12, -40), F(-8, -12)], 5, true), { tint: 'gold', angle: 1.2, gap: 3.2, seed: 101 });
      ink.cut(smooth([F(-14, -36), F(-10, -50), F(-6, -64)], 4), { tint: 'gold', w: 1.3, seed: 106 });
      // the hot core, cream inside the gold
      ink.form(smooth([F(-6, 1), F(-8, -9), F(-6, -20), F(-1, -30), F(1, -20), F(6, -9), F(5, 1)], 5, true), { w: 1.9, seed: 102 });
      // two licks curling off the back
      ink.line(smooth([F(-30, -60), F(-38, -66), F(-36, -76), F(-44, -80)], 5), { tint: 'gold', w: 1.8, taper: 0.8, seed: 104 });
      ink.line(smooth([F(12, -64), F(14, -72), F(9, -82)], 5), { tint: 'gold', w: 1.5, taper: 0.8, seed: 105 });

      // ---- Flame Dart: a pointed tongue of fire with a tail of licks, thrown from the hand ----
      if (T) {
        const tip = [258, -94], d = unit([150, -76], tip), P = fr(tip, d);
        // the flick: a whipped stroke from the fingers into the dart's tail
        ink.line(smooth([add(handF, [8, -4]), [92, -82], [124, -84], [150, -84]], 6), { tint: 'gold', w: 1.6, taper: 0.9, seed: 120 });
        ink.line(smooth([add(handF, [6, 2]), [96, -70], [130, -74]], 6), { tint: 'gold', w: 1.2, taper: 0.9, seed: 121 });
        const dart = smooth([P(0, 0), P(-24, -8), P(-52, -12), P(-70, -20), P(-64, -9), P(-90, -6), P(-74, 0), P(-94, 9), P(-66, 9), P(-74, 18), P(-48, 11), P(-22, 7)], 6, true);
        ink.form(dart, { tint: 'gold', w: 2.6, seed: 122 });
        ink.form(smooth([P(-8, 0), P(-26, -4), P(-46, -5), P(-38, 0), P(-48, 4), P(-24, 3.5)], 5, true), { w: 1.8, seed: 123 });
        ink.hatch(smooth([P(-24, 7), P(-48, 11), P(-74, 18), P(-66, 9), P(-46, 5)], 5, true), { tint: 'gold', angle: 0.2, gap: 2.8, seed: 124 });
        // the air it parts: three dry strokes behind
        [[-100, -14, 70], [-104, 4, 90], [-98, 16, 60]].forEach(([t, s, l], i) => ink.line([P(t - l, s * 1.4), P(t, s)], { tint: 'gold', w: 1.3 + (i === 1 ? 0.5 : 0), taper: 0.9, seed: 125 + i }));
      }
    },
  });
})();
