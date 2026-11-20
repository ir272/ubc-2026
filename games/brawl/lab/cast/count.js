// The Count: a tall gaunt vampire lord in a stiff high collar and a cloak cut like bat wings.
// Tint: red (the cloak lining).
(function () {
  const { smooth, ell, mix, h01 } = Ink;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const perp = (d) => [-d[1], d[0]];
  const dir = (a) => [Math.cos(a), Math.sin(a)];
  const O = (p, x, y) => [p[0] + x, p[1] + y];

  /** A bent tube along a path as one closed outline. */
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

  /** A bat-wing edge through sharp tips: each span between two tips sags in toward `inside`. */
  function scallops(tips, depth, inside, n = 6) {
    const out = [tips[0]];
    for (let i = 1; i < tips.length; i++) {
      const a = tips[i - 1], b = tips[i], m = mix(a, b, 0.5);
      let nn = perp(unit(a, b));
      if ((inside[0] - m[0]) * nn[0] + (inside[1] - m[1]) * nn[1] < 0) nn = [-nn[0], -nn[1]];
      const d = depth * (0.75 + 0.5 * h01(i * 3.3 + tips.length));
      for (let k = 1; k < n; k++) { const t = k / n, s = Math.sin(Math.PI * Math.pow(t, 0.8)); out.push(add(mix(a, b, t), nn, d * s)); }
      out.push(b);
    }
    return out;
  }

  /** One bat seen from the front, wings spread: centre c, half-span s, wing lift ph (-1 down .. 1 up), turned by rot. */
  function bat(ink, c, s, ph, rot, seed) {
    const P = ([x, y]) => [c[0] + (x * Math.cos(rot) - y * Math.sin(rot)) * s, c[1] + (x * Math.sin(rot) + y * Math.cos(rot)) * s];
    const T = [1.0, -0.22 - 0.6 * ph], W = [0.52, -0.4 - 0.32 * ph], F1 = [0.76, 0.14 - 0.42 * ph], F2 = [0.46, 0.28 - 0.18 * ph], B = [0.12, 0.2];
    // ear, shoulder, the leading edge up to the wrist, then the scalloped trailing edge back to the body
    const right = [[0.07, -0.25], [0.13, -0.46], [0.15, -0.2], [0.2, -0.16], mix([0.2, -0.16], W, 0.5).map((v, i) => v + (i ? -0.05 : 0)), W]
      .concat(scallops([T, F1, F2, B], 0.1, [0.3, -0.1], 3), [[0.09, 0.4], [0.03, 0.47]]);
    const left = right.slice().reverse().map(([x, y]) => [-x, y]);
    ink.form(right.concat(left).map(P), { w: 1.2, seed });
  }

  /** A long bony hand with hooked nails: wrist, direction of the fingers, curl, thumb side. */
  function claw(ink, wrist, ang, o = {}) {
    const k = o.k ?? 1, spread = o.spread ?? 0.6, curl = o.curl ?? 0.5, side = o.side ?? 1;
    const d = dir(ang), n = perp(d);
    const at = (a, b) => [wrist[0] + (d[0] * a + n[0] * b) * k, wrist[1] + (d[1] * a + n[1] * b) * k];
    const lens = [19, 24, 23, 17];
    for (let i = 3; i >= 0; i--) {
      const base = at(8, (i - 1.5) * 2.6 * side), a = ang + (i - 1.5) * 0.18 * spread * side;
      const j1 = add(base, dir(a), lens[i] * 0.45 * k), a2 = a + curl * side, j2 = add(j1, dir(a2), lens[i] * 0.33 * k), a3 = a2 + curl * 0.9 * side;
      const tip = add(j2, dir(a3), lens[i] * 0.22 * k);
      ink.form(tube([base, j1, j2, tip], 1.5 * k, 0.7 * k, 3), { w: 1.1 });
      ink.cut([add(j1, dir(a + Math.PI / 2), 1.2 * k), add(j1, dir(a - Math.PI / 2), 1.2 * k)], { w: 0.8, taper: 0.3 });
      // the nail: a hooked spike out of the fingertip
      ink.line([j2, tip, add(tip, dir(a3 + curl * 0.8 * side), 5 * k)], { w: 1.3, taper: 0.85 });
    }
    const tb = at(3, -side * 5), ta = ang - side * 0.8;
    ink.form(tube([tb, add(tb, dir(ta), 8 * k), add(tb, dir(ta + side * 0.5), 14 * k)], 2 * k, 0.8 * k, 3), { w: 1.15 });
    ink.form(smooth([at(-5, -5 * side), at(4, -6.5 * side), at(10, -4.5 * side), at(10.5, 5 * side), at(2, 5.5 * side), at(-5, 4 * side)], 4, true), { w: 1.4 });
    ink.cut([at(1, -1 * side), at(8, -2 * side)], { w: 0.9 });
  }

  function boot(ink, f, seed) {
    ink.form(smooth([O(f, -9, -16), O(f, 3, -17), O(f, 8, -9), O(f, 20, -5), O(f, 27, -1), O(f, 20, 0), O(f, -3, -1), O(f, -4, 0), O(f, -10, 0), O(f, -11, -6)], 4, true), { w: 2, seed });
    ink.cut([O(f, -3, -3), O(f, 22, -3)], { w: 1, taper: 0.6 });
    ink.cut(smooth([O(f, 0, -15), O(f, 5, -10), O(f, 6, -5)], 3), { w: 1 });
  }

  CAST.push({
    id: 'count', group: 'monsters', name: 'The Count', kind: 'Vampire',
    look: 'A tall, gaunt vampire lord with a long face and swept-back hair, a stiff collar standing up behind his head, and a huge cloak cut like bat wings that he holds shut with one clawed hand.',
    does: [
      ['Bat Swarm', 'Throws the cloak open and a stream of bats pours out of it and flies across the stage.'],
      ['Mist Step', 'Comes apart into mist and forms again right behind the opponent.'],
      ['Bat Form', 'Turns into one great bat and flies back to the stage.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      // ---- joints (feet on y = 0, up is -y, facing +x) ----
      const head = A ? [-16, -208] : [14, -208];      // centre of the skull
      const tilt = A ? -0.2 : 0;                       // head thrown back in the cast
      const neck = A ? [-24, -176] : [8, -178];
      const shF = A ? [-8, -168] : [24, -168], shB = A ? [-44, -170] : [-16, -170];
      const elbF = A ? [26, -190] : [26, -128], handF = A ? [58, -222] : [42, -140];
      const elbB = A ? [-80, -190] : [-30, -120], handB = A ? [-114, -220] : [-20, -100];
      const hip = A ? [-28, -102] : [0, -104];
      const kneeF = A ? [4, -54] : [12, -54], footF = A ? [16, 0] : [20, 0];
      const kneeB = A ? [-60, -52] : [-8, -54], footB = A ? [-84, 0] : [-16, 0];
      const jaw = A ? 7 : 0;                           // how far the jaw drops
      const hk = 1.15; // head scale
      const Hr = (x, y) => { const c = Math.cos(tilt) * hk, s = Math.sin(tilt) * hk; return [head[0] + x * c - y * s, head[1] + x * s + y * c]; };

      // ---- legs and boots ----
      const leg = (h, k, f, s) => {
        const t = tube([O(h, 0, 0), k, O(f, 0, -12)], 8, 5.5, 4);
        ink.form(t, { w: 2.1, seed: s });
        ink.cut(smooth([O(k, -3, -20), O(k, 1, 0), O(f, 2, -18)], 4), { w: 1.1 });
        boot(ink, f, s + 1);
      };
      leg(O(hip, -6, 0), kneeB, footB, 11);
      if (!A) ink.hatch(tube([O(hip, -6, 0), kneeB, O(footB, 0, -12)], 8, 5.5, 4), { angle: 1.1, gap: 3.6, w: 0.9 });

      if (!A) {
        leg(O(hip, 6, 0), kneeF, footF, 13);
        // ---- the cloak, wrapped shut ----
        const hemTips = [[60, -36], [36, -24], [10, -15], [-20, -9], [-52, -7], [-82, -13], [-108, -28]];
        const inside = [-10, -90];
        const cloak = smooth([[-34, -180], [-18, -182], [8, -184], [28, -176], [40, -162], [48, -146], [48, -124], [50, -96], [54, -66], [60, -36]], 5)
          .concat(scallops(hemTips, 11, inside).slice(1),
            smooth([[-108, -28], [-96, -72], [-78, -118], [-60, -158], [-46, -180], [-34, -184]], 5).slice(1));
        ink.form(cloak, { w: 3, seed: 21 });
        // shade down the back third
        ink.hatch(smooth([[-36, -178], [-56, -150], [-76, -112], [-96, -66], [-104, -30], [-82, -14], [-56, -9], [-44, -60], [-30, -120], [-22, -170]], 4, true), { angle: 1.18, gap: 4.2, w: 1.05, seed: 23 });
        // folds that run down to the points of the hem, like the bones of a wing
        const folds = [
          [[36, -128], [30, -84], [36, -24]],
          [[22, -150], [12, -90], [10, -15]],
          [[0, -166], [-10, -100], [-20, -9]],
          [[-18, -170], [-36, -100], [-52, -7]],
          [[-34, -176], [-58, -104], [-82, -13]],
        ];
        folds.forEach((f, i) => ink.cut(smooth(f, 8), { w: 1.7 - i * 0.08, seed: 30 + i }));
        // the lining turned back along the front edge
        const lin = smooth([[46, -128], [48, -100], [52, -70], [58, -40]], 5);
        ink.form(lin.concat(lin.slice().reverse().map(([x, y], i) => [x - 4 - (i / lin.length) * 3, y + 2])), { tint: 'red', w: 1.4, seed: 37 });
        // the hand holding it shut: fingers over the edge, nails into the cloth
        claw(ink, O(handF, 6, -2), Math.PI * 0.86, { k: 1.05, side: -1, curl: 0.55, spread: 0.7 });
      } else {
        // ---- the cloak thrown open: two wings, the lining showing ----
        const back = [O(shB, -6, -6), O(elbB, -4, -10), O(handB, -2, -6), [-130, -236]];
        const backTips = [[-130, -236], [-152, -186], [-162, -130], [-156, -76], [-134, -32], [-100, -12]];
        const backWing = smooth(back, 5).concat(scallops(backTips, 13, [-90, -120]).slice(1), smooth([[-100, -12], [-60, -26], [-40, -100], [-36, -160]], 5).slice(1));
        ink.form(backWing, { w: 3, seed: 41 });
        // the red inside, set in from the edge
        const backLin = scallops([[-118, -222], [-142, -182], [-150, -130], [-144, -80], [-124, -42], [-96, -26]], 11, [-90, -120])
          .concat(smooth([[-96, -26], [-62, -38], [-50, -100], [-50, -160], [-80, -194]], 5).slice(1));
        ink.form(backLin, { tint: 'red', w: 1.5, seed: 43 });
        ink.hatch(backLin, { tint: 'red', angle: 1.25, gap: 4.4, w: 1, seed: 44 });
        // the wing bones fanning from the hand to each point
        for (const t of backTips.slice(1)) ink.cut(smooth([O(handB, -4, 2), mix(handB, t, 0.5), t], 4), { w: 1.4, tint: ink.mode === 'line' ? undefined : 'red' });

        const frontTips = [[74, -238], [96, -188], [100, -132], [88, -78], [62, -34], [26, -14]];
        const frontWing = smooth([O(shF, 0, -6), O(elbF, 2, -10), O(handF, 4, -6), [74, -238]], 5)
          .concat(scallops(frontTips, 13, [30, -120]).slice(1), smooth([[26, -14], [-6, -40], [-14, -110], [-12, -160]], 5).slice(1));
        ink.form(frontWing, { w: 3, seed: 45 });
        ink.hatch(smooth([[-10, -150], [20, -170], [10, -110], [26, -60], [26, -14], [-6, -40], [-14, -110]], 4, true), { angle: 1.1, gap: 4.2, w: 1, seed: 46 });
        for (const t of frontTips.slice(1)) ink.cut(smooth([O(handF, 2, 4), mix(handF, t, 0.5), t], 4), { w: 1.5 });

        // ---- the bats pouring out ----
        const path = smooth([[96, -150], [140, -172], [196, -164], [250, -192], [300, -204], [334, -226]], 10);
        ink.line(path.slice(2, 38), { w: 1, taper: 0.9, alpha: 0.4, seed: 50 });
        ink.line(path.slice(6, 28).map(([x, y]) => [x, y + 18]), { w: 0.9, taper: 0.9, alpha: 0.35, seed: 51 });
        // thick where they leave the cloak, thinning out as they go
        const bats = [
          [0.0, -10, 9, 0.6], [0.02, 10, 10, -0.7], [0.06, -2, 12, 0.2], [0.09, -22, 9, 0.9], [0.12, 18, 11, -0.4],
          [0.18, -12, 13, 0.5], [0.24, 10, 12, -0.9], [0.32, -24, 14, 0.1], [0.4, 14, 15, 0.8], [0.5, -10, 17, -0.3],
          [0.6, 22, 13, 0.6], [0.7, -20, 16, -0.8], [0.82, 4, 20, 0.4], [0.95, -12, 15, -0.2],
        ];
        bats.forEach(([t, off, s, ph], i) => {
          const k = Math.min(path.length - 2, Math.round(t * (path.length - 1)));
          const d = unit(path[k], path[k + 1]), c = add(path[k], perp(d), off);
          bat(ink, c, s, ph, Math.atan2(d[1], d[0]) * 0.5 + (h01(i * 7.1) - 0.5) * 0.5, 60 + i);
        });

        // ---- the body between the wings ----
        leg(O(hip, 6, 0), kneeF, footF, 13);
        const sleeveB = tube([shB, elbB, O(handB, 6, 4)], 7, 6, 4);
        ink.form(sleeveB, { w: 2.2, seed: 71 });
        ink.hatch(sleeveB, { angle: 0.9, gap: 3.6, w: 0.9, seed: 72 });
        claw(ink, O(handB, 4, 2), -Math.PI * 0.62, { k: 0.95, side: 1, curl: 0.45, spread: 0.9 });
      }

      // ---- the torso (only seen with the cloak open) ----
      if (A) {
        const torso = smooth([O(neck, -14, 6), O(neck, 12, 4), O(shF, 6, 14), O(hip, 16, -10), O(hip, 14, 6), O(hip, -12, 6), O(hip, -14, -12), O(shB, 0, 18)], 5, true);
        ink.form(torso, { w: 2.6, seed: 81 });
        // waistcoat opening, buttons, the shirt front and its ruffle
        ink.cut(smooth([O(neck, 4, 10), O(neck, 0, 34), O(hip, 4, -8)], 5), { w: 1.4 });
        ink.cut(smooth([O(neck, -8, 10), O(neck, -4, 34), O(hip, 4, -8)], 5), { w: 1.2 });
        for (let i = 0; i < 4; i++) ink.dot(...mix(O(neck, 6, 40), O(hip, 8, -14), i / 3), 1.5);
        for (let i = 0; i < 3; i++) ink.cut(smooth([O(neck, -2 + i * 3, 8 + i * 4), O(neck, 6 + i * 2, 12 + i * 5), O(neck, 0 + i * 3, 18 + i * 4)], 3), { w: 1 });
        ink.hatch(smooth([O(shB, 0, 18), O(neck, -12, 12), O(neck, -6, 40), O(hip, -6, -10), O(hip, -12, 4)], 4, true), { angle: 1.2, gap: 3.6, w: 0.9, seed: 83 });
        const sleeveF = tube([shF, elbF, O(handF, -4, 6)], 7, 6, 4);
        ink.form(sleeveF, { w: 2.3, seed: 85 });
        ink.cut(smooth([O(elbF, -10, 6), O(elbF, 0, 2), O(elbF, 6, 8)], 3), { w: 1 });
        claw(ink, O(handF, -2, 4), -Math.PI * 0.3, { k: 1.05, side: -1, curl: 0.5, spread: 0.9 });
      }

      // ---- the high collar: one stiff fin standing up behind the head, lined in red ----
      const collar = smooth([Hr(-2, 32), Hr(-18, 28), Hr(-30, 10), Hr(-36, -12), Hr(-40, -30), Hr(-36, -27), Hr(-28, -22), Hr(-20, -8), Hr(-10, 12), Hr(4, 28)], 5, true);
      ink.form(collar, { w: 2.6, seed: 91 });
      const collarIn = smooth([Hr(-8, 24), Hr(-20, 20), Hr(-28, 4), Hr(-33, -18), Hr(-26, -16), Hr(-16, -2), Hr(-6, 14)], 5, true);
      ink.form(collarIn, { tint: 'red', w: 1.3, seed: 92 });
      ink.hatch(collarIn, { tint: 'red', angle: 1.3, gap: 3.2, w: 0.9, seed: 93 });

      // ---- neck and head ----
      ink.form(tube([O(neck, 0, 8), Hr(1, 22)], 6.5, 6.5), { w: 2, seed: 95 });
      ink.cut(smooth([O(neck, 4, 0), Hr(6, 26), Hr(7, 22)], 3), { w: 1 });
      const face = smooth([Hr(-2, -27), Hr(8, -22), Hr(13, -14), Hr(14.5, -9), Hr(12.5, -6), Hr(14, -2), Hr(19, 3), Hr(24, 9), Hr(22, 11.5), Hr(17, 11),
        Hr(16.5, 13.5), Hr(14.5, 15 + jaw * 0.3), Hr(15.5, 17.5 + jaw), Hr(15.5, 22 + jaw), Hr(17.5, 28 + jaw), Hr(12, 31 + jaw), Hr(3, 27 + jaw * 0.5), Hr(-4, 19), Hr(-9, 7), Hr(-11, -7), Hr(-9, -20)], 4, true);
      ink.form(face, { w: 2.5, seed: 97 });
      // the deep eye under a heavy brow, sunken cheek, lines from the nose
      ink.hatch(smooth([Hr(4, -9), Hr(12, -7), Hr(11, -1.5), Hr(5, -1)], 4, true), { angle: 1.2, gap: 2.4, w: 0.85, seed: 98 });
      ink.cut(smooth([Hr(2, -12), Hr(9, -10.5), Hr(15, -7)], 3), { w: 1.9, taper: 0.35 });
      ink.dot(...Hr(10, -4.5), 1.5);
      ink.cut(smooth([Hr(6, 0), Hr(9.5, 1.5), Hr(13, 0.5)], 3), { w: 0.9 });
      ink.cut(smooth([Hr(-2, 3), Hr(5, 8), Hr(9, 9)], 4), { w: 1.3 });
      ink.cut(smooth([Hr(1, 12), Hr(5, 17), Hr(6, 23)], 4), { w: 1 });
      ink.cut(smooth([Hr(16, 11.5), Hr(13.5, 14), Hr(12.5, 17)], 3), { w: 1 });
      ink.cut(smooth([Hr(2, -18), Hr(8, -17), Hr(11, -15)], 3), { w: 0.85 });
      ink.cut(smooth([Hr(13, 24 + jaw), Hr(15, 26 + jaw)], 2), { w: 0.85 });
      if (A) {
        // the mouth thrown open, two long fangs
        const mouth = smooth([Hr(16.5, 13.8), Hr(10, 14.5), Hr(9, 18 + jaw * 0.6), Hr(15.5, 17.5 + jaw)], 3, true);
        ink.mask(mouth);
        ink.cut(mouth, { closed: true, w: 1.2, taper: 0 });
        ink.form([Hr(15, 14), Hr(14.4, 21), Hr(12.8, 14.3)], { w: 1, seed: 101 });
        ink.form([Hr(11.8, 14.6), Hr(11.3, 19), Hr(10.2, 15)], { w: 0.9, seed: 102 });
      } else {
        // thin shut mouth, one fang over the lip
        ink.cut(smooth([Hr(9, 14.5), Hr(12.5, 15), Hr(16.5, 14)], 3), { w: 1.2 });
        ink.form([Hr(14.8, 14.6), Hr(14.4, 19.5), Hr(12.9, 14.8)], { w: 0.9, seed: 101 });
      }
      // hair combed flat and straight back from a high forehead, ending in points at the nape
      const hair = smooth([Hr(8, -21), Hr(4, -28), Hr(-6, -32), Hr(-17, -29), Hr(-23, -19), Hr(-25, -4), Hr(-29, 10), Hr(-21, 4), Hr(-22, 16), Hr(-15, 6), Hr(-11, -1), Hr(-9, -11), Hr(-3, -16), Hr(3, -18)], 4, true);
      ink.form(hair, { w: 2.4, seed: 105 });
      for (let i = 0; i < 4; i++) ink.cut(smooth([Hr(5 - i * 2.5, -23 + i * 2), Hr(-8 - i, -28 + i * 3), Hr(-18 + i, -19 + i * 3), Hr(-22 + i * 1.5, -2 + i * 4)], 5), { w: 1.05, seed: 106 + i });
      // pointed ear laid back
      ink.form(smooth([Hr(-3, 1), Hr(-6, -9), Hr(-15, -17), Hr(-11, -5), Hr(-9, 5), Hr(-4, 6)], 4, true), { w: 1.5, seed: 111 });
      ink.cut(smooth([Hr(-5, 2), Hr(-8, -5), Hr(-11, -11)], 3), { w: 0.9 });
    },
  });
})();
