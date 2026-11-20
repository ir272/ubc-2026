// The Empty Armour: plate armour with nobody inside, a fire in the collar, a greatsword.
(function () {
  const { smooth, ell, limb, arc, mix, h01 } = Ink;
  const O = (p, x, y) => [p[0] + x, p[1] + y];
  const place = (pts, at, ang, s = 1) => pts.map(([x, y]) => [at[0] + (x * Math.cos(ang) - y * Math.sin(ang)) * s, at[1] + (x * Math.sin(ang) + y * Math.cos(ang)) * s]);
  const dirOf = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  // a plate between a and b, half-widths wa and wb, square-ish ends (steel, not flesh)
  function plate(a, b, wa, wb, ra = 0.5, rb = 0.5) {
    const d = dirOf(a, b), n = [-d[1], d[0]];
    return smooth([
      O(a, n[0] * wa - d[0] * wa * ra, n[1] * wa - d[1] * wa * ra), O(a, -d[0] * wa * (ra + 0.3), -d[1] * wa * (ra + 0.3)), O(a, -n[0] * wa - d[0] * wa * ra, -n[1] * wa - d[1] * wa * ra),
      O(b, -n[0] * wb + d[0] * wb * rb, -n[1] * wb + d[1] * wb * rb), O(b, d[0] * wb * (rb + 0.3), d[1] * wb * (rb + 0.3)), O(b, n[0] * wb + d[0] * wb * rb, n[1] * wb + d[1] * wb * rb),
    ], 4, true);
  }
  // ruled lines across a plate, like the lames of a joint
  function lames(ink, a, b, w, k, wt = 1.2) {
    const d = dirOf(a, b), n = [-d[1], d[0]];
    for (let i = 1; i <= k; i++) { const p = mix(a, b, i / (k + 1)); ink.cut(smooth([O(p, n[0] * w, n[1] * w), O(p, d[0] * 2.5, d[1] * 2.5), O(p, -n[0] * w, -n[1] * w)], 4), { w: wt, taper: 0.3 }); }
  }
  // a flame tongue: base at b, tip at t, bulging to one side
  function tongue(b, t, wd, lean = 1) {
    const d = dirOf(b, t), n = [-d[1], d[0]], L = Math.hypot(t[0] - b[0], t[1] - b[1]);
    return smooth([O(b, n[0] * wd, n[1] * wd), O(mix(b, t, 0.45), n[0] * wd * 0.9 * lean + d[0] * 2, n[1] * wd * 0.9 * lean), O(mix(b, t, 0.8), n[0] * wd * 0.2, n[1] * wd * 0.2), t, O(mix(b, t, 0.7), -n[0] * wd * 0.5, -n[1] * wd * 0.5), O(mix(b, t, 0.35), -n[0] * wd * 0.8, -n[1] * wd * 0.8), O(b, -n[0] * wd, -n[1] * wd), O(b, -d[0] * L * 0.1, -d[1] * L * 0.1)], 4, true);
  }
  // a licking flame along a bent path: wide low down, thin and whipping at the tip
  function lick(path, wd) {
    const pts = smooth(path, 6), n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const u = i / (n - 1), w = wd * Math.pow(1 - u, 0.9) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.6 + 0.2)));
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    return L.concat(R.reverse());
  }
  // a mailed fist closed on the grip
  function gauntlet(ink, c, from, s = 1) {
    const d = dirOf(from, c), ang = Math.atan2(d[1], d[0]);
    const P = (pts) => place(pts, c, ang, s);
    ink.form(P(smooth([[-20, -9], [-6, -8], [-6, 8], [-20, 10], [-24, 0]], 3, true)), { w: 2 }); // cuff
    ink.form(P(smooth([[-8, -9], [6, -10], [13, -6], [14, 4], [8, 10], [-6, 9], [-10, 0]], 4, true)), { w: 2.2 });
    for (let i = 0; i < 3; i++) ink.cut(P([[4 + i * 3.5, -8], [6 + i * 3.5, 8]]), { w: 1.1, taper: 0.2 });
    ink.form(P(smooth([[-4, -11], [6, -14], [12, -11], [6, -7]], 3, true)), { w: 1.4 }); // thumb
    ink.dot(...P([[-14, 0]])[0], 1.3);
  }

  CAST.push({
    id: 'armour', group: 'heavy', name: 'The Empty Armour', kind: 'Heavy hitter',
    look: 'A suit of plate with nobody inside it, held together by habit, with a fire burning in the collar where the head should be and a greatsword taller than its legs.',
    does: [
      ['Grave Cleave', 'A low sword cut that leaves the blade as a wall of fire and sends it down the stage.'],
      ['Collar Fire', 'Leans in and breathes fire out of the empty collar.'],
      ['Fall Apart', 'Drops into a heap of plates and puts itself back together higher up.'],
    ],
    draw(ink, pose) {
      const cast = pose === 'ability';
      // joints (feet on y = 0, up is -y, facing +x). The torso turns about the waist.
      const waist = cast ? [14, -108] : [0, -110], lean = cast ? 0.26 : 0;
      const T = (pts) => place(pts, waist, lean);
      const [collar, shF, shB, hipF, hipB] = T([[4, -78], [38, -62], [-34, -64], [14, 18], [-12, 18]]);
      const kneeF = cast ? [62, -50] : [24, -50], footF = cast ? [76, 0] : [34, 0];
      const kneeB = cast ? [-36, -42] : [-22, -50], footB = cast ? [-62, 0] : [-30, 0];
      const swAng = cast ? 0.3 : Math.PI / 2 + 0.03, grip = cast ? [104, -116] : [66, -128];
      const S = (pts) => place(pts, grip, swAng);
      const [handF, handB, tip] = S([[3, 0], [-13, 0], [126, 0]]);
      const elbF = cast ? [86, -146] : [56, -138], elbB = cast ? [32, -132] : [-12, -128];

      if (cast) {
        // the cut: a wall of fire leaving the sword and travelling on, tongues streaming back
        const F = [306, -78];
        const crescent = smooth([[F[0] - 6, -170], [F[0] + 22, -130], [F[0] + 34, -78], [F[0] + 26, -24], [F[0] + 4, 4], [F[0] + 4, -30], [F[0] + 8, -78], [F[0] + 2, -130]], 6, true);
        for (let i = 0; i < 8; i++) {
          const y = -156 + i * 21, b = [F[0] + 6 + Math.sin(((y + 170) / 175) * Math.PI) * 12, y];
          const L = 34 + h01(i + 3) * 46 + (i === 2 || i === 5 ? 20 : 0), up = 0.25 + h01(i + 11) * 0.3, bend = (h01(i + 7) - 0.5) * 14;
          ink.form(lick([b, O(b, -L * 0.35, -L * up * 0.2 + bend), O(b, -L * 0.7, -L * up * 0.6 - bend * 0.5), O(b, -L, -L * up)], 9 - Math.abs(i - 3.5)), { tint: 'red', w: 1.8 });
        }
        ink.form(crescent, { tint: 'red', w: 2.8 });
        ink.cut(smooth([[F[0] + 2, -150], [F[0] + 20, -100], [F[0] + 22, -60], [F[0] + 12, -16]], 6), { tint: ink.mode === 'line' ? 'red' : undefined, w: 1.3 });
        // the path it took from the blade, as torn streamers
        for (let i = 0; i < 4; i++) ink.line(smooth([[226 + i * 4, -88 + i * 10], [252, -100 + i * 18], [280 + i * 4, -120 + i * 26]], 6), { tint: 'red', w: 1.8 - i * 0.3, taper: 0.8 });
      }

      // the far leg
      ink.form(plate(hipB, O(kneeB, 0, -6), 11, 9), { w: 2.4 });
      ink.form(plate(O(kneeB, 0, 8), O(footB, 0, -12), 9, 6), { w: 2.4 });
      ink.form(smooth([O(footB, -10, -14), O(footB, 2, -14), O(footB, 16, -6), O(footB, 22, 0), O(footB, -12, 0)], 4, true), { w: 2.2 });
      ink.form(ell(kneeB[0], kneeB[1], 9, 8, 0, 18), { w: 2 });

      // the far arm: a pauldron edge, the rerebrace, an empty gap, the vambrace
      ink.form(plate(shB, O(elbB, -2, -6), 9, 8), { w: 2.2 });
      ink.form(plate(O(elbB, 4, 2), O(handB, -16, 0), 8, 7), { w: 2.2 });

      // the tabard: torn cloth hanging from under the breastplate
      const tb = T([[-18, 2], [20, 2]]);
      const rag = [tb[1], O(tb[1], 6, 30)];
      const n = 7;
      for (let i = 0; i <= n; i++) { const p = mix(O(tb[1], 8, 58), O(tb[0], -8, 58), i / n); rag.push(O(p, 0, i % 2 ? -10 - h01(i + 9) * 8 : (h01(i) - 0.5) * 6)); }
      rag.push(O(tb[0], -6, 30), tb[0]);
      ink.form(rag, { w: 2.2 });
      ink.hatch(rag.slice(0, 2).concat(rag.slice(2, 6)), { angle: 1.35, gap: 4, w: 1 });
      ink.cut(smooth([O(tb[0], 14, 6), O(tb[0], 12, 36), O(tb[0], 16, 50)], 4), { w: 1.2 });

      // the near leg: cuisse, knee cop with its fan, greave, a pointed sabaton
      ink.form(plate(hipF, O(kneeF, 0, -6), 12, 10), { w: 2.6 });
      lames(ink, hipF, O(kneeF, 0, -6), 9, 1, 1.1);
      ink.form(plate(O(kneeF, 0, 8), O(footF, 0, -12), 10, 7), { w: 2.6 });
      ink.cut(smooth([O(kneeF, 4, 12), O(mix(kneeF, footF, 0.5), 4, 0), O(footF, 3, -16)], 4), { w: 1.3 });
      ink.hatch(plate(O(kneeF, -4, 8), O(footF, -3, -12), 6, 4), { angle: 1.4, gap: 3.6, w: 1 });
      const sab = smooth([O(footF, -12, -15), O(footF, 4, -15), O(footF, 18, -7), O(footF, 30, -1), O(footF, 26, 0), O(footF, -13, 0)], 4, true);
      ink.form(sab, { w: 2.4 });
      for (let i = 0; i < 3; i++) ink.cut([O(footF, 2 + i * 6, -14 + i * 3), O(footF, 4 + i * 6, -1)], { w: 1.1 });
      ink.form(smooth([O(kneeF, 8, -6), O(kneeF, 18, 2), O(kneeF, 8, 8)], 3, true), { w: 1.6 });
      ink.form(ell(kneeF[0], kneeF[1], 10, 9, 0, 18), { w: 2.2 });
      ink.cut(ell(kneeF[0] + 1, kneeF[1], 5, 4.5, 0, 14), { closed: true, w: 1.1 });

      // fauld and tassets: hooped skirt of plate
      ink.form(T(smooth([[-30, 2], [-14, 30], [-4, 30], [-2, 4]], 4, true)), { w: 2.2 });
      ink.form(T(smooth([[2, 4], [8, 32], [30, 30], [32, 2]], 4, true)), { w: 2.4 });
      for (let i = 0; i < 2; i++) { ink.cut(T(smooth([[-27 + i * 3, 10 + i * 8], [-16, 12 + i * 8], [-5, 10 + i * 8]], 4)), { w: 1.1 }); ink.cut(T(smooth([[4 + i, 12 + i * 8], [18, 14 + i * 8], [31, 10 + i * 8]], 4)), { w: 1.1 }); }
      ink.form(T(smooth([[-30, -12], [0, -10], [32, -12], [34, 4], [0, 8], [-32, 4]], 4, true)), { w: 2.4 });
      ink.cut(T(smooth([[-31, -4], [0, -1], [33, -4]], 4)), { w: 1.1, taper: 0.2 });

      // the breastplate: a keel down the front, shade on the far side, a dent
      const breast = T(smooth([[-32, -64], [-36, -40], [-28, -14], [0, -8], [34, -14], [42, -42], [36, -68], [14, -76], [-12, -76]], 5, true));
      ink.form(breast, { w: 3 });
      ink.cut(T(smooth([[10, -70], [14, -44], [10, -14]], 5)), { w: 1.6, taper: 0.3 });
      ink.hatch(T(smooth([[-32, -64], [-36, -40], [-28, -14], [-8, -10], [-12, -44], [-10, -72]], 4, true)), { angle: 1.2, gap: 4, w: 1.1 });
      ink.cut(T(smooth([[-24, -24], [4, -20], [32, -24]], 4)), { w: 1.2, taper: 0.2 });
      ink.cut(T(smooth([[20, -40], [26, -34], [24, -28]], 3)), { w: 1.2 });
      ink.cut(T([[22, -48], [27, -44]]), { w: 1 });
      for (const r of [[-18, -60], [-22, -20], [28, -20]]) ink.dot(...T([r])[0], 1.4);

      // the empty collar, its fire, and the gorget rim over the front of it
      const C = (pts) => place(pts, collar, lean * 0.6);
      ink.form(C(smooth([[-22, 6], [-20, -4], [0, -9], [22, -4], [24, 6], [0, 12]], 4, true)), { w: 2.6 });
      ink.mask(C(ell(1, -2, 16, 5, 0, 20)));
      const dr = cast ? -1 : 0.25; // the fire bends back when it lunges
      const flames = [
        [[[-10, -2], [-14 + dr * 4, -18], [-8 + dr * 12, -34], [-16 + dr * 22, -50]], 8],
        [[[10, -2], [16, -16], [8 + dr * 8, -30], [14 + dr * 16, -42]], 7],
        [[[0, -2], [6 + dr * 2, -22], [-6 + dr * 12, -42], [4 + dr * 20, -60], [-4 + dr * 32, -72]], 11],
      ];
      for (const [path, wd] of flames) ink.form(C(lick(path, wd)), { tint: 'red', w: 2 });
      const tl = ink.mode === 'line' ? 'red' : undefined;
      ink.cut(C(smooth([[0, -8], [4 + dr * 2, -24], [-4 + dr * 10, -40], [2 + dr * 16, -52]], 5)), { tint: tl, w: 1.3 });
      ink.cut(C(smooth([[-8, -6], [-10 + dr * 3, -18], [-6 + dr * 8, -28]], 5)), { tint: tl, w: 1.1 });
      ink.form(C(lick([[6 + dr * 18, -64], [2 + dr * 26, -76], [10 + dr * 32, -86]], 3.2)), { tint: 'red', w: 1.6 });
      ink.form(C(smooth([[-22, 2], [0, 7], [22, 2], [24, 8], [0, 14], [-22, 8]], 4, true)), { w: 2.2 });
      ink.form(C(smooth([[-26, 10], [0, 16], [26, 10], [28, 18], [0, 24], [-28, 18]], 4, true)), { w: 2.4 });

      // pauldrons: big layered shoulders, the near one with a raised guard
      for (let i = 1; i >= 0; i--) ink.form(place(smooth([[-20, 6 + i * 9], [0, 2 + i * 9], [16, 6 + i * 9], [16, 14 + i * 9], [0, 11 + i * 9], [-20, 14 + i * 9]], 4, true), shB, lean), { w: 2 });
      ink.form(place(smooth([[-22, 6], [-18, -10], [-2, -18], [14, -12], [20, 4], [0, 4]], 5, true), shB, lean), { w: 2.4 });
      ink.hatch(place(smooth([[-22, 6], [-18, -10], [-2, -18], [-4, 4]], 4, true), shB, lean), { angle: 1.1, gap: 3.6, w: 1 });
      for (let i = 2; i >= 0; i--) ink.form(place(smooth([[-20 + i * 2, 4 + i * 9], [0, 0 + i * 9], [22 - i, 6 + i * 9], [22 - i, 14 + i * 9], [0, 10 + i * 9], [-18 + i * 2, 13 + i * 9]], 4, true), shF, lean), { w: 2.2 });
      const dome = place(smooth([[-24, 4], [-20, -10], [-4, -20], [16, -16], [28, -2], [26, 8], [2, 4]], 5, true), shF, lean);
      ink.form(dome, { w: 2.8 });
      ink.hatch(place(smooth([[-22, 2], [-16, -14], [-4, -18], [-6, 4]], 4, true), shF, lean), { angle: 1.1, gap: 3.6, w: 1 });
      ink.cut(place(smooth([[-18, -6], [0, -14], [20, -6]], 4), shF, lean), { w: 1.3, taper: 0.3 });
      ink.dot(...place([[16, 0]], shF, lean)[0], 1.5); ink.dot(...place([[-14, 0]], shF, lean)[0], 1.5);

      // the sword
      ink.form(S(smooth([[24, -6], [118, -4], [128, 0], [118, 4], [24, 6]], 3, true)), { w: 2.6 });
      ink.cut(S([[28, 0], [100, 0]]), { w: 1.3, taper: 0.4 });
      ink.form(S(smooth([[12, -6], [26, -6], [26, 6], [12, 6]], 2, true)), { w: 2 });
      ink.form(S(smooth([[8, -28], [12, -30], [14, -4], [14, 4], [12, 30], [8, 28], [10, 4], [10, -4]], 3, true)), { w: 2.2 });
      ink.form(S(limb([-24, 0], [8, 0], 3.6, 3.6)), { w: 1.8 });
      for (let i = 0; i < 6; i++) ink.cut(S([[-20 + i * 4.5, -3], [-17 + i * 4.5, 3]]), { w: 1 });
      ink.form(S(smooth([[-24, -6], [-34, -7], [-38, 0], [-34, 7], [-24, 6]], 3, true)), { w: 2 });

      // the near arm, gapped at the elbow where an arm would be
      ink.form(plate(O(shF, 2, 10), O(elbF, 0, -8), 9, 8), { w: 2.4 });
      lames(ink, O(shF, 2, 10), O(elbF, 0, -8), 7, 2, 1);
      ink.form(plate(O(elbF, 4, 6), O(handF, -16 * Math.cos(swAng - (cast ? 0 : 0)), 0), 8, 7), { w: 2.4 });
      ink.form(smooth([O(elbF, -8, -4), O(elbF, 4, -10), O(elbF, 10, 2), O(elbF, -2, 8)], 4, true), { w: 1.8 });
      gauntlet(ink, handB, elbB, 1);
      gauntlet(ink, handF, elbF, 1.05);
    },
  });
})();
