// The Bellringer: a hunched giant in a monk's cowl with a cracked church bell on a chain.
(function () {
  const { smooth, ell, limb, arc, mix, h01 } = Ink;
  const O = (p, x, y) => [p[0] + x, p[1] + y];
  // local points (x, y) rotated by ang and scaled, then moved to `at`
  const place = (pts, at, ang, s = 1) => pts.map(([x, y]) => [at[0] + (x * Math.cos(ang) - y * Math.sin(ang)) * s, at[1] + (x * Math.sin(ang) + y * Math.cos(ang)) * s]);
  const dirOf = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };

  // a ragged hem from x1 back to x0 along y: long torn teeth
  function hem(x1, x0, y, n, depth, seed) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x0 - x1) * i) / n + (h01(seed + i) - 0.5) * 4;
      out.push([x, i % 2 ? y - depth * (0.5 + h01(seed + i * 3)) : y + (h01(seed + i * 7) - 0.5) * 3]);
    }
    return out;
  }

  // the bell in its own space: crown at 0,0, mouth down +y
  const BELL = smooth([[-13, 2], [0, -1], [13, 2], [22, 7], [26, 17], [27, 31], [30, 46], [36, 58], [42, 66], [40, 72], [20, 74], [0, 75], [-20, 74], [-40, 72], [-42, 66], [-36, 58], [-30, 46], [-27, 31], [-26, 17], [-22, 7]], 3, true);

  function bell(ink, top, ang) {
    const P = (pts) => place(pts, top, ang);
    const tintLine = ink.mode === 'line' ? 'gold' : undefined;
    // clapper hanging out of the mouth, then the bell over it
    ink.form(P(ell(4, 73, 6, 5, 0, 14)), { tint: 'gold', w: 2 });
    ink.form(P(smooth([[-7, 1], [-9, -9], [0, -15], [9, -9], [7, 1]], 4, true)), { tint: 'gold', w: 2.2 });
    ink.cut(P(smooth([[-3, -2], [-4, -8], [0, -10], [4, -8], [3, -2]], 4)), { w: 1.4, tint: tintLine });
    ink.form(P(BELL), { tint: 'gold', w: 3 });
    // shade on the far side, cast bands, the crack
    ink.hatch(P(smooth([[-24, 10], [-12, 8], [-12, 40], [-16, 70], [-40, 70], [-34, 54], [-28, 40], [-26, 16]], 3, true)), { angle: 1.1, gap: 4, w: 1.1, tint: tintLine });
    ink.cut(P(smooth([[-25, 18], [0, 21], [25, 18]], 5)), { w: 1.5, tint: tintLine, taper: 0.2 });
    ink.cut(P(smooth([[-26, 23], [0, 26], [26, 23]], 5)), { w: 1.1, tint: tintLine, taper: 0.2 });
    ink.cut(P(smooth([[-36, 59], [0, 63], [36, 59]], 5)), { w: 1.6, tint: tintLine, taper: 0.2 });
    ink.cut(P(smooth([[-40, 67], [0, 71], [40, 67]], 5)), { w: 1.2, tint: tintLine, taper: 0.2 });
    ink.cut(P([[14, 73], [17, 62], [12, 52], [18, 41], [13, 30], [16, 24]]), { w: 1.8, tint: tintLine, taper: 0.5 });
    ink.cut(P([[12, 52], [6, 47]]), { w: 1.1, tint: tintLine });
    ink.dot(...P([[22, 12]])[0], 1.6, { tint: tintLine });
  }

  // a chain from a to b: flat links alternating with links seen edge on
  function chain(ink, a, b, sag = 0) {
    const d = dirOf(a, b), n = [-d[1], d[0]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(2, Math.round(L / 9));
    const at = (t) => { const p = mix(a, b, t), s = Math.sin(Math.PI * t) * sag; return [p[0] + n[0] * s, p[1] + n[1] * s]; };
    for (let i = 0; i < k; i++) {
      const p = at((i + 0.5) / k), q = at(Math.min(1, (i + 1) / k)), r = at(Math.max(0, i / k));
      const ang = Math.atan2(q[1] - r[1], q[0] - r[0]);
      if (i % 2 === 0) { ink.form(ell(p[0], p[1], 6.4, 4, ang, 16), { w: 1.6 }); ink.cut(ell(p[0], p[1], 3.2, 1.3, ang, 12), { closed: true, w: 1.1 }); }
      else ink.form(limb(O(p, -Math.cos(ang) * 5.5, -Math.sin(ang) * 5.5), O(p, Math.cos(ang) * 5.5, Math.sin(ang) * 5.5), 1.9, 1.9), { w: 1.4 });
    }
  }

  // a big closed fist round a chain, knuckles toward `dir`
  function fist(ink, c, ang, s = 1) {
    const P = (pts) => place(pts, c, ang, s);
    ink.form(P(smooth([[-9, -10], [3, -12], [12, -8], [15, -1], [13, 8], [4, 11], [-8, 10], [-12, 0]], 4, true)), { w: 2.4 });
    ink.cut(P(smooth([[5, -10], [9, -3], [8, 6]], 4)), { w: 1.3 });
    ink.cut(P([[12, -6], [6, -5]]), { w: 1.1 });
    ink.cut(P([[14, 0], [7, 0]]), { w: 1.1 });
    ink.cut(P([[12, 6], [6, 5]]), { w: 1.1 });
    // the thumb laid over the knuckles
    ink.form(P(smooth([[-6, -11], [4, -15], [11, -12], [9, -8], [-2, -6]], 4, true)), { w: 1.7 });
  }

  CAST.push({
    id: 'bellringer', group: 'heavy', name: 'The Bellringer', kind: 'Heavy hitter',
    look: 'A hunched giant in a monk\'s cowl who drags a cracked church bell on a chain and keeps the bell rope coiled in his other fist.',
    does: [
      ['Toll', 'Swings the bell low. The peal rolls along the floor as a wave and hits anyone standing in its way.'],
      ['Bell Drop', 'Heaves the bell over his head and brings it straight down.'],
      ['Rope Climb', 'Throws up the bell rope and hauls himself back to the stage hand over hand.'],
    ],
    draw(ink, pose) {
      const cast = pose === 'ability';
      // joints (feet on y = 0, up is -y, facing +x)
      const head = cast ? [98, -150] : [64, -160];      // centre of the hood opening
      const hump = cast ? [4, -206] : [-30, -210];      // top of the hunched back
      const neck = cast ? [70, -158] : [38, -164];
      const hip = cast ? [6, -88] : [-6, -92];
      const shF = cast ? [62, -160] : [30, -164], elbF = cast ? [104, -124] : [62, -130], handF = cast ? [140, -96] : [80, -114];
      const shB = cast ? [26, -176] : [-14, -182], elbB = cast ? [70, -140] : [-46, -132], handB = cast ? [120, -112] : [-74, -86];
      const kneeF = cast ? [52, -44] : [22, -46], footF = cast ? [70, 0] : [34, 0];
      const kneeB = cast ? [-34, -40] : [-34, -46], footB = cast ? [-64, 0] : [-42, 0];
      const bellTop = cast ? [170, -66] : [O(handF, 6, 0)[0], handF[1] + 30];
      const bellAng = cast ? -1.3 : 0.04;

      if (cast) {
        // the swing: three pen strokes tracing where the bell came from
        for (let i = 0; i < 3; i++) ink.line(smooth([[-40 + i * 10, -28 - i * 12], [40, -6 - i * 8], [120, -14 - i * 10], [176 + i * 6, -50 - i * 14]], 8), { w: 1.6 - i * 0.3, taper: 0.9, alpha: 0.55 });
        // the peal: a wave rolling along the floor, cresting and curling over at its front
        // the back of the wave rising out of the bell mouth, the crest curling over, the face falling to the floor
        ink.line(smooth([[214, -10], [244, -20], [272, -42], [296, -66], [316, -72], [332, -64], [336, -50], [328, -42], [318, -46], [322, -54]], 8), { tint: 'gold', w: 3, taper: 0.35 });
        ink.line(smooth([[328, -42], [326, -24], [334, -8], [344, -2]], 6), { tint: 'gold', w: 2.2, taper: 0.5 });
        for (let i = 0; i < 4; i++) ink.line(smooth([[222 + i * 6, -4 + i], [254 + i * 6, -14 + i * 4], [282 + i * 4, -36 + i * 7], [304 + i * 2, -54 + i * 9], [318, -60 + i * 10]], 8), { tint: 'gold', w: 1.7 - i * 0.25, taper: 0.7 });
        ink.hatch(smooth([[316, -50], [330, -44], [326, -24], [336, -4], [312, -4], [314, -30]], 5, true), { tint: 'gold', free: true, angle: 1.45, gap: 3.6, w: 1, alpha: 0.85 });
        // spray thrown off the lip of the crest, and the floor shaking under the wave
        for (let i = 0; i < 4; i++) ink.line([[314 + i * 6, -74 - (i % 2) * 2], [318 + i * 9, -84 - i * 3]], { tint: 'gold', w: 1.3, taper: 0.8 });
        for (let i = 0; i < 7; i++) { const x = 222 + i * 16; ink.line([[x, 2], [x + 6, 5 + (i % 2) * 2]], { tint: 'gold', w: 1.2, taper: 0.8 }); }
      }

      // the far arm, hanging back with the bell rope coiled in its fist
      ink.form(limb(shB, elbB, 13, 12), { w: 2.4 });
      ink.form(smooth([O(elbB, -11, -8), O(elbB, 12, -6), O(handB, 18, -4), O(handB, 12, 14), O(handB, -14, 10)], 5, true), { w: 2.4 });
      if (!cast) {
        // the coil: loops of rope dropping out of the fist, the woollen grip at the end
        for (let i = 0; i < 3; i++) ink.line(smooth([O(handB, -6, 4), O(handB, -22 - i * 3, 24 + i * 9), O(handB, -8 + i * 2, 44 + i * 10), O(handB, 4, 10)], 8), { w: 2.1 - i * 0.2, taper: 0.2 });
        ink.line(smooth([O(handB, -4, 8), O(handB, -12, 40), O(handB, -20, 70)], 6), { w: 2.2, taper: 0.3 });
        ink.form(limb(O(handB, -18, 62), O(handB, -24, 80), 3.6, 4), { w: 1.6 });
        ink.cut([O(handB, -22, 68), O(handB, -16, 67)], { w: 1.1 }); ink.cut([O(handB, -24, 74), O(handB, -18, 73)], { w: 1.1 });
      }
      fist(ink, handB, cast ? 0.3 : 2.2, 0.95);

      // bare feet under the hem
      for (const [f, s] of [[footB, 0.9], [footF, 1]]) {
        ink.form(smooth([O(f, -16 * s, -12), O(f, 4, -15 * s), O(f, 20 * s, -9), O(f, 26 * s, -3), O(f, 24 * s, 0), O(f, -17 * s, 0)], 4, true), { w: 2.2 });
        for (let t = 0; t < 3; t++) ink.cut([O(f, (13 + t * 4) * s, -7 + t * 1.6), O(f, (15 + t * 4) * s, -1)], { w: 1.1 });
      }

      // the habit: one heavy mass from the hump to a torn hem
      const front = cast ? 30 : 22;
      const body = smooth([
        O(neck, 4, 8), O(neck, 8, 34), [hip[0] + 48 + (cast ? 18 : 0), hip[1] - 2],
        [mix(kneeF, footF, 0.5)[0] + front, -46],
      ], 6).concat(
        hem(footF[0] + front + 6, footB[0] - 24, -6, 11, 13, 41),
        smooth([[footB[0] - 30, -8], [hip[0] - 62, -48], [hip[0] - 50, hip[1] - 22], [hump[0] - 34, hump[1] + 60], [hump[0] - 26, hump[1] + 22], hump, [hump[0] + 32, hump[1] + 12], O(neck, -8, -14)], 6),
      );
      ink.form(body, { w: 3 });
      // shade down the back and folds falling from the belt
      ink.hatch(smooth([[hump[0] - 18, hump[1] + 30], [hump[0] + 4, hump[1] + 50], [hip[0] - 22, hip[1] - 10], [hip[0] - 30, -10], [footB[0] - 30, -8], [hip[0] - 58, -52], [hip[0] - 56, hip[1] - 26], [hump[0] - 24, hump[1] + 60]], 5, true), { angle: 1.15, gap: 4.5, w: 1.1 });
      const belt = [hip[0] - 54, hip[1] - 6];
      for (let i = 0; i < 4; i++) {
        const x0 = hip[0] - 30 + i * 22 + (cast ? 6 : 0);
        ink.cut(smooth([[x0, hip[1] + 4], [x0 - 4 + i * 3, -46], [x0 - 2 + i * 6, -16 - (i % 2) * 6]], 6), { w: 1.6 - i * 0.1 });
      }
      ink.cut(smooth([O(neck, 2, 18), O(neck, -12, 44), [hip[0] + 10, hip[1] - 14]], 6), { w: 1.3 });
      // the rope belt with its knot and hanging ends
      const bl = smooth([belt, [hip[0] - 10, hip[1] + 2], [hip[0] + 30, hip[1] + 2], [hip[0] + 50 + (cast ? 18 : 0), hip[1] - 4]], 6);
      ink.form(bl.concat(bl.slice().reverse().map(([x, y]) => [x, y + 6])), { w: 1.8 });
      for (let i = 1; i < 9; i++) { const p = mix(belt, [hip[0] + 50, hip[1] - 2], i / 9); ink.cut([[p[0] - 2, p[1] - 1], [p[0] + 2, p[1] + 7]], { w: 1 }); }
      const knot = [hip[0] + 34 + (cast ? 12 : 0), hip[1] + 3];
      ink.form(limb(knot, O(knot, cast ? -10 : 4, 44), 3, 2.6), { w: 1.6 });
      ink.form(limb(O(knot, 4, 0), O(knot, cast ? -2 : 12, 34), 3, 2.6), { w: 1.6 });
      ink.form(ell(knot[0], knot[1], 6, 5, 0.4, 14), { w: 1.8 });

      // the near arm in a wide sleeve
      const dF = dirOf(elbF, handF), nF = [-dF[1], dF[0]];
      ink.form(limb(shF, elbF, 16, 14), { w: 2.6 });
      const cuff = O(handF, -dF[0] * 12, -dF[1] * 12);
      const sleeve = smooth([O(elbF, -nF[0] * 14, -nF[1] * 14), O(cuff, -nF[0] * 20, -nF[1] * 20), O(cuff, nF[0] * 22 + dF[0] * 4, nF[1] * 22 + dF[1] * 4), O(elbF, nF[0] * 15 - dF[0] * 4, nF[1] * 15 - dF[1] * 4)], 5, true);
      ink.form(sleeve, { w: 2.6 });
      ink.cut(smooth([O(elbF, nF[0] * 6, nF[1] * 6), mix(elbF, cuff, 0.5), O(cuff, nF[0] * 12, nF[1] * 12)], 5), { w: 1.3 });
      ink.cut(smooth([O(elbF, -nF[0] * 4 - dF[0] * 10, -nF[1] * 4 - dF[1] * 10), O(elbF, -nF[0] * 2, -nF[1] * 2), O(cuff, -nF[0] * 8, -nF[1] * 8)], 5), { w: 1.1 });
      ink.hatch(smooth([O(elbF, -nF[0] * 14, -nF[1] * 14), O(cuff, -nF[0] * 20, -nF[1] * 20), O(cuff, -nF[0] * 4, -nF[1] * 4), O(elbF, -nF[0] * 2, -nF[1] * 2)], 4, true), { angle: Math.atan2(dF[1], dF[0]) + 1.4, gap: 4, w: 1 });

      // the chain from the fist to the bell, and the bell itself
      chain(ink, O(handF, 8, cast ? -2 : 6), bellTop, cast ? 5 : 0);
      bell(ink, bellTop, bellAng);
      fist(ink, handF, Math.atan2(dF[1], dF[0]) + (cast ? 0.2 : 0.4), 1.1);

      // the short cape over the shoulders, torn at its edge
      const capeTop = smooth([O(neck, 4, 10), O(neck, 4, -8), O(hump, 40, 4), O(hump, 14, -5), O(hump, -12, -1), O(hump, -30, 18), O(hump, -38, 48)], 5);
      const capeEdge = [];
      const c0 = O(hump, -38, 50), c1 = O(neck, 14, 30);
      for (let i = 0; i <= 8; i++) { const p = mix(c0, c1, i / 8); capeEdge.push([p[0], p[1] + Math.sin((i / 8) * Math.PI) * 22 + (i % 2 ? 10 + h01(i + 5) * 6 : 0)]); }
      ink.form(capeTop.concat(capeEdge), { w: 2.8 });
      ink.hatch(smooth([O(hump, -28, 30), O(hump, -4, 16), O(hump, 12, 40), mix(c0, c1, 0.4), c0], 5, true), { angle: 1.2, gap: 4, w: 1 });
      for (let i = 0; i < 3; i++) { const p = mix(c0, c1, 0.25 + i * 0.22); ink.cut(smooth([O(p, -6, -18), O(p, -2, 0), O(p, 0, 18 + Math.sin((0.25 + i * 0.22) * Math.PI) * 14)], 5), { w: 1.3 }); }

      // the cowl: a pointed hood thrown forward over a low head
      // the cowl: a peaked hood flopped back toward the hump, deep over a low head
      const hood = smooth([O(head, -30, -30), O(head, -46, -52), O(head, -20, -42), O(head, 6, -38), O(head, 22, -24), O(head, 27, 2), O(head, 14, 22), O(head, -12, 26), O(head, -38, 18), O(head, -46, -4)], 6, true);
      ink.form(hood, { w: 3 });
      ink.cut(smooth([O(head, -30, -24), O(head, -12, -32), O(head, 6, -32)], 6), { w: 1.4 });
      ink.cut(smooth([O(head, -34, 6), O(head, -18, -2), O(head, -10, 18)], 6), { w: 1.3 });
      ink.hatch(smooth([O(head, -40, -6), O(head, -30, -30), O(head, -14, -34), O(head, -12, 20), O(head, -34, 12)], 5, true), { angle: 1.25, gap: 3.6, w: 1 });
      // the opening and the face in it: heavy brow, a broken nose, a lip
      const opening = smooth([O(head, -2, -24), O(head, 16, -18), O(head, 20, 2), O(head, 8, 18), O(head, -6, 10), O(head, -8, -10)], 5, true);
      ink.mask(opening);
      ink.form(smooth([O(head, -2, -16), O(head, 14, -14), O(head, 22, -6), O(head, 30, 2), O(head, 26, 6), O(head, 18, 6), O(head, 20, 11), O(head, 16, 18), O(head, 4, 20), O(head, -4, 8)], 4, true), { w: 1.8 });
      ink.hatch(smooth([O(head, -2, -16), O(head, 6, -14), O(head, 2, 4), O(head, 4, 20), O(head, -4, 8)], 4, true), { angle: 1.3, gap: 3, w: 0.9 });
      ink.cut(smooth([O(head, 2, -12), O(head, 10, -10), O(head, 14, -12)], 4), { w: 1.4 });
      ink.dot(...O(head, 9, -7), 1.6);
      ink.cut(smooth([O(head, 8, 12), O(head, 13, 11), O(head, 18, 12)], 3), { w: 1.3 });
      ink.cut(smooth([O(head, 20, -2), O(head, 18, 3), O(head, 22, 5)], 3), { w: 1 });
      ink.cut(smooth([O(head, -2, -18), O(head, 16, -20), O(head, 22, -14)], 4), { w: 1.2 });
    },
  });
})();
