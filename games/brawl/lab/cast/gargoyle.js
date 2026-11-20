// The Gargoyle: a stone gargoyle come down off a cathedral roof.
(function () {
  const { smooth, ell, limb, mix, h01 } = Ink;
  const O = (p, x, y) => [p[0] + x, p[1] + y];
  const place = (pts, at, ang, s = 1) => pts.map(([x, y]) => [at[0] + (x * Math.cos(ang) - y * Math.sin(ang)) * s, at[1] + (x * Math.sin(ang) + y * Math.cos(ang)) * s]);
  // a closed tapering tube along a path (horn, tail, finger)
  function tube(path, w0, w1, per = 6) {
    const pts = smooth(path, per), n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const w = w0 + (w1 - w0) * (i / (n - 1));
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    return L.concat(R.reverse());
  }
  // a jagged crack in the stone
  function crack(ink, a, b, seed, w = 1.3) {
    const pts = [a];
    for (let i = 1; i < 5; i++) { const p = mix(a, b, i / 5); pts.push([p[0] + (h01(seed + i) - 0.5) * 8, p[1] + (h01(seed + i * 5) - 0.5) * 8]); }
    pts.push(b);
    ink.cut(pts, { w, taper: 0.6, wobble: 0.3 });
  }
  // a stone claw: a heavy pad with hooked talons. `ang` points the fingers.
  function claw(ink, c, ang, s, spread = 1) {
    const P = (pts) => place(pts, c, ang, s);
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.32 * spread;
      const base = [6 * Math.cos(a), 6 * Math.sin(a)], tip = [22 * Math.cos(a), 22 * Math.sin(a)];
      ink.form(P(tube([base, mix(base, tip, 0.6), tip], 4.6, 3.2, 4)), { w: 1.8 });
      ink.form(P(smooth([[tip[0] - 2, tip[1] - 3], [tip[0] + 8, tip[1] - 1], [tip[0] + 11, tip[1] + 6], [tip[0] + 4, tip[1] + 3], [tip[0] - 1, tip[1] + 3]], 3, true)), { w: 1.4 });
    }
    ink.form(P(smooth([[-12, -9], [6, -11], [12, -2], [8, 10], [-10, 10], [-15, 0]], 4, true)), { w: 2.2 });
    ink.cut(P([[2, -8], [8, -1], [4, 7]]), { w: 1.1 });
  }

  CAST.push({
    id: 'gargoyle', group: 'heavy', name: 'The Gargoyle', kind: 'Heavy hitter',
    look: 'A stone gargoyle climbed down off a cathedral roof: ram horns, bat wings folded like a cloak, heavy claws and a shoulder with a chunk knocked out of it.',
    does: [
      ['Rubble Spit', 'Coughs up a block of masonry and spits it in a high arc.'],
      ['Stone Skin', 'Sets hard while it charges. One hit glances off it.'],
      ['Wing Lift', 'Beats its wings once for a short, heavy climb into the air.'],
    ],
    draw(ink, pose) {
      const cast = pose === 'ability';
      // joints (feet on y = 0, up is -y, facing +x)
      const head = cast ? [100, -186] : [80, -166], headAng = cast ? -0.34 : 0.04, jaw = cast ? 0.55 : 0.16;
      const neck = cast ? [70, -176] : [52, -164];
      const hip = cast ? [-26, -66] : [-34, -62];
      const shF = cast ? [40, -164] : [30, -154], elbF = cast ? [94, -102] : [84, -98], handF = cast ? [92, -10] : [78, -10];
      const shB = cast ? [16, -170] : [8, -162], elbB = cast ? [68, -100] : [58, -96], handB = cast ? [62, -10] : [50, -10];
      const kneeF = cast ? [18, -76] : [10, -72], ankF = cast ? [-4, -16] : [-12, -16], toeF = cast ? [22, -6] : [14, -6];
      const kneeB = cast ? [-2, -80] : [-10, -76], ankB = cast ? [-32, -16] : [-40, -16], toeB = cast ? [-8, -6] : [-16, -6];
      const wingRoot = cast ? [-2, -172] : [-8, -168], wrist = cast ? [-44, -264] : [-34, -244];
      const tail = [O(hip, -16, 8), O(hip, -48, 30), [-96, -18], [-120, -8]];

      // the tail, along the floor to a spade
      ink.form(tube(tail, 9, 3), { w: 2.2 });
      const tip = tail[3];
      ink.form(smooth([O(tip, 4, 0), O(tip, -10, -10), O(tip, -20, -2), O(tip, -10, 4)], 3, true), { w: 2 });
      for (let i = 1; i < 6; i++) { const p = mix(tail[1], tail[2], i / 6); ink.cut([O(p, -1, -5), O(p, 1, 5)], { w: 1 }); }

      // the far wing behind everything: spread when it spits
      // the far arm and claw
      ink.form(limb(shB, elbB, 15, 11), { w: 2.4 });
      ink.form(limb(elbB, O(handB, -4, -8), 12, 7), { w: 2.4 });
      claw(ink, handB, 0.15, 0.9);

      // the near wing, folded like a cloak: leading bone up to the wrist, fingers falling behind
      const tips = cast
        ? [O(wrist, -44, 4), O(wrist, -74, 52), O(wrist, -84, 112), O(wrist, -70, 176)]
        : [O(wrist, -30, 26), O(wrist, -52, 76), O(wrist, -62, 132), O(wrist, -54, 196)];
      const wing = [wingRoot, O(wrist, 8, 10), O(wrist, 4, -2), wrist];
      for (let i = 0; i < tips.length; i++) {
        wing.push(tips[i]);
        if (i < tips.length - 1) { const m = mix(tips[i], tips[i + 1], 0.5), k = mix(m, O(wrist, 10, 40), 0.22); wing.push(...smooth([mix(tips[i], k, 0.4), k, mix(tips[i + 1], k, 0.4)], 3)); }
      }
      wing.push(O(hip, -20, -16), O(hip, 4, -50));
      ink.form(wing, { w: 2.8 });
      for (const t of tips) ink.cut(smooth([O(wrist, -2, 6), mix(O(wrist, -2, 6), t, 0.5), t], 4), { w: 1.6, taper: 0.4 });
      ink.cut(smooth([wingRoot, O(wrist, 4, 12)], 4), { w: 1.6 });
      ink.hatch([mix(wrist, tips[2], 0.45), tips[2], tips[3], O(hip, -20, -16), O(hip, 4, -50)], { angle: 1.3, gap: 4.6, w: 1 });
      ink.hatch([O(wrist, 0, 4), tips[0], mix(tips[0], tips[1], 0.5), O(wrist, 6, 30)], { angle: 0.4, gap: 3.4, w: 1, tint: 'green', alpha: 0.9 });
      ink.form(smooth([O(wrist, -2, 2), O(wrist, -6, -12), O(wrist, -16, -16), O(wrist, -6, -6)], 3, true), { w: 1.6 });

      // haunches, shins and feet: crouched like it is still on the roof edge
      for (const [k, a, t, s] of [[kneeB, ankB, toeB, 0.92], [kneeF, ankF, toeF, 1]]) {
        ink.form(smooth([O(hip, -22, -10), O(hip, 4, -24), O(k, 6, -14), O(k, 14, -2), O(k, 8, 10), O(hip, 4, 20), O(hip, -20, 14)], 5, true), { w: 2.6 });
        ink.form(limb(k, a, 11 * s, 6 * s), { w: 2.4 });
        ink.form(limb(a, O(t, -10, -2), 6 * s, 7 * s), { w: 2.2 });
        claw(ink, O(t, -8, -2), 0.08, s);
        ink.cut(smooth([O(k, -2, -6), O(k, 4, 2), O(k, 2, 10)], 4), { w: 1.2 });
      }

      // the body: barrel chest thrown forward, a ridge of spines down the back
      const body = smooth([O(neck, 6, 6), O(neck, 4, 34), O(shF, 20, 50), O(hip, 46, -6), O(hip, 14, 18), O(hip, -20, 6), O(hip, -26, -36), O(shB, -36, 6), O(shB, -6, -16), O(neck, -10, -14)], 6, true);
      ink.form(body, { w: 3 });
      for (let i = 0; i < 5; i++) { const p = mix(O(shB, -30, -10), O(hip, -24, -12), i / 5); ink.form([O(p, -2, 4), O(p, -12, -4), O(p, 4, -2)], { w: 1.6 }); }
      ink.hatch(smooth([O(shB, -36, 0), O(shB, -10, -8), O(hip, 10, -20), O(hip, 6, 18), O(hip, -22, 4), O(hip, -26, -30)], 5, true), { angle: 1.1, gap: 4.2, w: 1.1 });
      // carved ribs and the belly plates of a roof spout
      for (let i = 0; i < 4; i++) ink.cut(smooth([O(neck, 2 - i * 4, 18 + i * 12), O(neck, -14 - i * 6, 24 + i * 13), O(neck, -26 - i * 8, 22 + i * 14)], 4), { w: 1.3 });
      crack(ink, O(hip, 30, -6), O(hip, 4, -40), 13);

      // the near arm, with the chipped shoulder
      ink.form(limb(elbF, O(handF, -6, -8), 13, 8), { w: 2.6 });
      ink.form(limb(shF, elbF, 17, 13), { w: 2.6 });
      ink.cut(smooth([O(elbF, -8, -6), O(elbF, 2, 4), O(elbF, 10, -2)], 4), { w: 1.2 });
      ink.hatch(limb(shF, elbF, 17, 13).slice(0, 8).concat([elbF, shF]), { angle: 1.4, gap: 4, w: 1 });
      ink.hatch(limb(elbF, O(handF, -6, -8), 13, 8).slice(0, 8).concat([O(handF, -6, -8), elbF]), { angle: 1.5, gap: 4, w: 1 });
      // the shoulder boss with a bite knocked out of its top
      const sh = O(shF, 2, -2);
      ink.form([O(sh, -18, 4), O(sh, -16, -10), O(sh, -6, -18), O(sh, -1, -11), O(sh, 3, -14), O(sh, 6, -8), O(sh, 11, -11), O(sh, 18, -4), O(sh, 19, 8), O(sh, 8, 16), O(sh, -10, 14)], { w: 2.6 });
      ink.cut([O(sh, -1, -11), O(sh, 1, -4), O(sh, 6, -8)], { w: 1.2, taper: 0.2 });
      crack(ink, O(sh, 1, -4), O(sh, -6, 14), 31, 1.2);
      crack(ink, O(sh, 4, -2), O(sh, 16, 8), 37, 1.1);
      claw(ink, handF, 0.12, 1.05, 1.1);

      // the head: heavy brow, a spout snout and a gaping jaw, ram horns curling back
      const H = (pts) => place(pts, head, headAng);
      ink.form(H(tube([[-16, -16], [-26, -40], [-46, -56], [-74, -58]], 5, 1.2)), { w: 2 }); // far horn
      ink.form(H(smooth([[-14, 10], [0, 14], [26, 10 + jaw * 26], [38, 12 + jaw * 34], [34, 20 + jaw * 34], [14, 26 + jaw * 20], [-8, 24]], 4, true)), { w: 2.4 });
      for (let i = 0; i < 4; i++) ink.form(H([[10 + i * 7, 12 + jaw * (8 + i * 7)], [13 + i * 7, 4 + jaw * (8 + i * 7)], [16 + i * 7, 12 + jaw * (8 + i * 7)]]), { w: 1.1 });
      ink.form(H(smooth([[-22, 2], [-18, -18], [0, -24], [16, -18], [26, -10], [40, -6], [46, 2], [42, 8], [30, 6], [14, 10], [-4, 16], [-18, 14]], 4, true)), { w: 2.8 });
      for (let i = 0; i < 4; i++) ink.form(H([[18 + i * 6, 6], [21 + i * 6, 15 - (i === 0 ? -3 : 0)], [24 + i * 6, 6]]), { w: 1.1 });
      ink.mask(H(smooth([[6, -12], [16, -12], [18, -6], [8, -4]], 3, true)));
      ink.dot(...H([[13, -8]])[0], 1.8, { free: true });
      ink.cut(H(smooth([[-2, -20], [12, -16], [24, -12]], 4)), { w: 1.6 });
      ink.cut(H(smooth([[30, -6], [36, -2], [40, 2]], 3)), { w: 1.2 });
      ink.dot(...H([[42, -1]])[0], 1.4);
      ink.cut(H(smooth([[-10, -4], [-2, 4], [10, 8]], 4)), { w: 1.1 });
      ink.hatch(H(smooth([[-22, 2], [-18, -16], [-6, -18], [-4, 14], [-18, 14]], 3, true)), { angle: 1.2, gap: 3.4, w: 1 });
      // the ear and the near horn
      ink.form(H(smooth([[-8, -10], [-26, -26], [-14, -6]], 3, true)), { w: 1.8 });
      const horn = H(tube([[-8, -18], [-16, -44], [-38, -64], [-70, -70], [-84, -62]], 8, 1.2));
      ink.form(horn, { w: 2.4 });
      for (const t of [[-12, -30], [-18, -44], [-28, -55], [-42, -63], [-56, -67]]) ink.cut(H([[t[0] - 6, t[1] + 2], [t[0] + 4, t[1] - 5]]), { w: 1.1 });
      ink.hatch(H(smooth([[-10, -26], [-4, -10], [-14, -10], [-18, -24]], 3, true)), { angle: 0.6, gap: 3, w: 1, tint: 'green' });

      if (cast) {
        // the spat block: a broken piece of cornice with its moulding still on it
        const b = [266, -214], R = -0.4;
        const B = (pts) => place(pts, b, R);
        // the arc it flew along, broken into strokes
        const arcPts = smooth([H([[46, 12]])[0], [160, -236], [216, -246], O(b, -24, 0)], 10);
        for (let i = 0; i < arcPts.length - 4; i += 6) ink.line(arcPts.slice(i, i + 5), { tint: 'green', w: 2.4, taper: 0.5 });
        ink.line(smooth([O(b, -40, 16), [200, -214], [150, -200]], 6), { w: 1.2, taper: 0.9, alpha: 0.5 });
        ink.form(B([[-20, -12], [6, -18], [22, -10], [24, 12], [14, 18], [8, 12], [-2, 20], [-18, 14]]), { w: 2.6 });
        ink.cut(B([[-20, -12], [-4, -4], [22, -10]]), { w: 1.3, taper: 0.1 });
        ink.cut(B([[-4, -4], [-2, 20]]), { w: 1.3, taper: 0.1 });
        ink.cut(B([[-16, 0], [-6, 6]]), { w: 1.1 }); ink.cut(B([[-16, 6], [-6, 12]]), { w: 1.1 });
        ink.hatch(B([[-4, -4], [22, -10], [24, 12], [14, 18], [8, 12], [-2, 20]]), { angle: 1.2, gap: 3.4, w: 1 });
        ink.hatch(B([[-20, -12], [6, -18], [22, -10], [-4, -4]]), { angle: 0.3, gap: 3, w: 1, tint: 'green' });
        // two chips thrown with it
        ink.form(place([[-4, -3], [4, -4], [3, 4], [-3, 3]], [222, -246], 0.5, 1.2), { w: 1.4 });
        ink.form(place([[-3, -2], [3, -3], [2, 3]], [298, -230], 1.1, 1.3), { w: 1.3 });
        // grit falling from the mouth
        const m = H([[34, 18 + jaw * 30]])[0];
        for (let i = 0; i < 3; i++) ink.line([O(m, 2 + i * 5, 6 + i * 2), O(m, 3 + i * 6, 12 + i * 3)], { w: 1.2, taper: 0.5 });
      }
    },
  });
})();
