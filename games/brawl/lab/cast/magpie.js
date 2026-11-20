// The Magpie: a small thief in a long-beaked bird mask and a cloak of feathers.
(function () {
  const { smooth, ell, limb } = Ink;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const nrm = (d) => [-d[1], d[0]];
  // a frame on a direction: P(along, across)
  const fr = (o, d) => { const n = nrm(d); return (t, s) => [o[0] + d[0] * t + n[0] * s, o[1] + d[1] * t + n[1] * s]; };
  const dirOf = (a) => [Math.cos(a), Math.sin(a)];

  // one feather from its root a to its tip b; bend curls the tip to one side
  function feather(ink, a, b, w, o = {}) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), P = fr(a, unit(a, b)), k = o.bend || 0;
    const pts = smooth([P(0, -w * 0.5), P(L * 0.3, -w), P(L * 0.72, -w * 0.72 + k * 0.4), P(L, k), P(L * 0.74, w * 0.55 + k * 0.5), P(L * 0.34, w * 0.95), P(0, w * 0.5)], 5, true);
    ink.form(pts, { w: o.w ?? 2.2, seed: o.seed });
    if (o.hatch) ink.hatch(pts, { angle: o.hatchAngle ?? 1.1, gap: o.gap ?? 3.4, w: 0.9, tint: o.hatch, seed: (o.seed || 1) + 3 });
    ink.cut(smooth([P(L * 0.02, 0), P(L * 0.5, k * 0.15), P(L * 0.9, k * 0.75)], 5), { w: 1.2, seed: (o.seed || 1) + 1 });
    // a split in the vane, the way a worn feather parts
    if (o.split) ink.cut([P(L * o.split, -w * 0.9), P(L * (o.split + 0.1), -w * 0.15)], { w: 1.1, seed: (o.seed || 1) + 2 });
  }

  // a narrow leaf-bladed knife; p is the hand (grip), d the direction of the blade
  function knife(ink, p, d, len, o = {}) {
    const P = fr(p, d);
    ink.form(limb(P(-9, 0), P(3, 0), 2.6, 2.4), { w: 1.8 });
    ink.form(ell(...P(-11, 0), 2.6, 2.6), { w: 1.6 });
    ink.form(smooth([P(3, -4.2), P(6, -1.5), P(len * 0.45, -3.6), P(len, 0), P(len * 0.5, 3.2), P(6, 1.5), P(3, 4.2)], 4, true), { w: 2 });
    ink.cut([P(8, 0), P(len * 0.8, -0.4)], { w: 1.1 });
    if (o.notch) ink.cut([P(len * 0.42, 3.2), P(len * 0.5, 1)], { w: 1 });
  }

  // a gloved fist closed round a grip, the knuckles toward d
  function fist(ink, hand, from, r) {
    const d = unit(from, hand), P = fr(hand, d);
    ink.form(smooth([P(-r * 0.9, -r * 0.85), P(r * 0.4, -r * 1.05), P(r * 1.2, -r * 0.8), P(r * 1.35, 0), P(r * 1.15, r * 0.85), P(r * 0.2, r), P(-r * 0.9, r * 0.8)], 4, true), { w: 2 });
    ink.cut([P(r * 0.55, -r * 0.75), P(r * 0.7, r * 0.6)], { w: 1.1 });
    ink.cut([P(-r * 0.4, -r * 0.6), P(r * 0.3, -r * 0.2)], { w: 1.1 });
  }

  CAST.push({
    id: 'magpie', group: 'fast', name: 'The Magpie', kind: 'Fast and light',
    look: 'A small hunched thief in a long-beaked bird mask, a mantle of feathers and a ragged tail, with three knives at the belt.',
    does: [
      ['Feather Knives', 'Throws a fan of three knives, high, level and low.'],
      ['Snatch', 'Blinks through the opponent and comes out behind them.'],
      ['Updraft', 'Spreads the cloak and rides the air upward.'],
    ],
    draw(ink, pose) {
      const T = pose === 'ability';
      // ---- joints ----
      const lean = T ? 0.38 : 0.1;
      const hip = T ? [10, -48] : [0, -52];
      const lc = Math.cos(lean), ls = Math.sin(lean);
      const U = (x, y) => [hip[0] + x * lc - y * ls, hip[1] + x * ls + y * lc]; // torso frame
      const neck = U(4, -56), shF = U(12, -47), shB = U(-6, -50);
      const tilt = T ? 0.1 : 0.04;
      const head = add(neck, [8, -16]);
      const H = (x, y) => [head[0] + x * Math.cos(tilt) - y * Math.sin(tilt), head[1] + x * Math.sin(tilt) + y * Math.cos(tilt)];
      const elbowF = T ? [68, -84] : [32, -78], handF = T ? [98, -86] : [44, -72];
      const elbowB = T ? [8, -66] : [-4, -72], handB = T ? [-14, -60] : [2, -64];
      const kneeF = T ? [40, -30] : [16, -28], ankleF = T ? [36, -7] : [14, -7], toeF = T ? [52, 0] : [30, 0];
      const kneeB = T ? [-14, -30] : [-8, -28], ankleB = T ? [-36, -8] : [-16, -7], toeB = T ? [-22, 0] : [-2, 0];
      const tailRoot = T ? [-18, -46] : [-24, -46];

      // ---- tail: long magpie tail feathers, the sheen in blue ----
      const tailTips = T ? [[-152, -30], [-140, -16], [-120, -6]] : [[-118, -20], [-108, -8], [-92, -2]];
      tailTips.forEach((t, i) => feather(ink, add(tailRoot, [i * 4, i * 3]), t, 6.5 - i * 0.8, { bend: i === 0 ? -3 : 2, hatch: 'blue', hatchAngle: T ? 0.9 : 0.5, seed: 40 + i * 5, split: i === 1 ? 0.55 : 0 }));

      // ---- back leg ----
      const leg = (hp, kn, an, toe, sd) => {
        ink.form(limb(hp, kn, 6, 4.4), { seed: sd });
        ink.form(limb(kn, an, 4.4, 3.2), { seed: sd + 1 });
        for (let i = 0; i < 3; i++) { const p = Ink.mix(kn, an, 0.25 + i * 0.22); ink.cut([add(p, [-4, -1.5]), add(p, [4, 1.5])], { w: 1.1, seed: sd + 2 + i }); }
        const d = unit(an, toe);
        const P = fr(an, d);
        ink.form(smooth([P(-5, 3), P(-3, -4), P(6, -4.5), P(14, -3), add(toe, [5, -5]), add(toe, [2, 0]), [an[0] - 6, 0]], 4, true), { w: 2, seed: sd + 6 });
        ink.cut([[an[0] - 4, -1.6], [toe[0], -1.6]], { w: 1, seed: sd + 7 });
      };
      leg(add(hip, [-4, 2]), kneeB, ankleB, toeB, 60);

      // ---- cloak: the back mass, behind the body ----
      const cloak = T
        ? smooth([[38, -102], [14, -112], [-20, -112], [-58, -102], [-100, -88], [-136, -78], [-110, -60], [-80, -46], [-50, -36], [-20, -31], [8, -32], [22, -60]], 6, true)
        : smooth([[12, -112], [-6, -116], [-24, -108], [-36, -88], [-44, -60], [-52, -34], [-60, -24], [-34, -20], [-8, -22], [8, -28], [12, -60], [14, -92]], 6, true);
      ink.form(cloak, { w: 2.8, seed: 7 });
      ink.hatch(cloak, { angle: T ? 0.55 : 1.25, gap: 4.4, w: 1, seed: 8 });
      const folds = T
        ? [[[10, -104], [-40, -88], [-96, -72]], [[16, -84], [-24, -62], [-60, -44]], [[4, -96], [-40, -78], [-80, -58]]]
        : [[[-8, -108], [-26, -76], [-40, -34]], [[2, -100], [-10, -66], [-22, -26]], [[8, -86], [4, -54], [0, -26]]];
      folds.forEach((f, i) => ink.cut(smooth(f, 6), { w: 1.6, seed: 10 + i }));
      // the feathered hem
      const tier = (line, n, dir, len, w, sd) => {
        for (let i = 0; i < n; i++) {
          const t = (i / (n - 1)) * (line.length - 1), j = Math.min(line.length - 2, Math.floor(t));
          const p = Ink.mix(line[j], line[j + 1], t - j), L = len + (i % 2 ? 6 : -3) - (i === n - 1 ? 6 : 0);
          feather(ink, p, add(p, dir, L), w, { bend: (i % 2 ? 3 : -2.5), seed: sd + i * 3, split: i % 3 === 1 ? 0.5 : 0 });
        }
      };
      const hemDir = unit([0, 0], T ? [-0.78, 0.62] : [-0.28, 1]);
      if (T) {
        tier([[-118, -84], [-80, -78], [-44, -70], [-14, -66]], 6, hemDir, 30, 5.6, 140);
        tier([[-138, -78], [-104, -58], [-66, -40], [-30, -32], [6, -31]], 9, hemDir, 30, 5.2, 20);
      } else {
        tier([[-40, -64], [-24, -62], [-8, -62], [6, -64]], 4, hemDir, 28, 5.6, 140);
        tier([[-60, -30], [-38, -24], [-16, -22], [4, -26]], 7, hemDir, 28, 5.2, 20);
      }

      // the back arm, swung behind in the throw
      if (T) {
        ink.form(limb(shB, elbowB, 5.4, 4.6), { seed: 70 });
        ink.form(limb(elbowB, handB, 4.6, 3.8), { seed: 71 });
        ink.form(ell(handB[0], handB[1], 5, 4.6), { seed: 72, w: 2 });
      }

      // ---- front leg ----
      leg(add(hip, [4, 2]), kneeF, ankleF, toeF, 80);

      // ---- body: a ragged tunic, the sash and the knives ----
      const tunic = smooth([U(-10, -58), U(10, -58), U(20, -40), U(24, -16), U(23, 6), U(16, 13), U(9, 7), U(2, 14), U(-6, 6), U(-12, 12), U(-14, -20)], 5, true);
      ink.form(tunic, { w: 2.4, seed: 90 });
      ink.cut(smooth([U(12, -30), U(15, -12), U(13, 6)], 5), { w: 1.3, seed: 91 });
      ink.hatch(smooth([U(-14, -20), U(-12, 12), U(-6, 6), U(2, 12), U(4, -20)], 5, true), { angle: 1.3, gap: 3.6, seed: 92 });
      const sash = smooth([U(-13, -14), U(6, -16), U(25, -18), U(26, -8), U(6, -5), U(-13, -4)], 5, true);
      ink.form(sash, { tint: 'blue', w: 2.2, seed: 93 });
      ink.cut([U(-10, -9), U(24, -13)], { tint: 'blue', w: 1.1, seed: 94 });
      // knot and two tails
      ink.form(smooth([U(24, -14), U(30, -2), U(26, 12), U(22, 0)], 5, true), { tint: 'blue', w: 1.8, seed: 95 });
      ink.form(smooth([U(22, -12), U(20, 4), U(15, 16), U(17, 2)], 5, true), { tint: 'blue', w: 1.8, seed: 96 });
      // three knives tucked through the sash, hilts up and forward
      [[-6, -0.5], [3, -0.35], [12, -0.2]].forEach(([x, a], i) => {
        const base = U(x, -2), d = dirOf(-Math.PI / 2 + lean + a + 0.5);
        const top = add(base, d, 24);
        ink.form(limb(base, top, 2.6, 2.3), { w: 1.7, seed: 100 + i });
        ink.form(ell(top[0], top[1], 3, 3), { w: 1.6, seed: 104 + i });
        ink.cut([add(base, d, 6), add(add(base, d, 6), nrm(d), 4)], { w: 1.1, seed: 108 + i });
      });

      // ---- the mantle: two rows of feathers round the shoulders ----
      const mc = U(0, -54);
      const row = (n, a0, a1, r0, len, w, sd) => {
        for (let i = 0; i < n; i++) {
          const a = a0 + ((a1 - a0) * i) / (n - 1) + lean;
          const at = a + (Math.PI / 2 + lean * 0.5 - a) * 0.5;
          const base = add(mc, dirOf(a), r0);
          feather(ink, base, add(base, dirOf(at), len - Math.abs(i - (n - 1) * 0.45) * 1.5), w, { bend: i % 2 ? 3 : -3, seed: sd + i * 3, split: i % 3 === 1 ? 0.5 : 0 });
        }
      };
      row(7, Math.PI * 1.05, Math.PI * 0.12, 9, T ? 40 : 38, 7, 120);
      row(5, Math.PI * 0.9, Math.PI * 0.25, 5, 24, 6.5, 150);

      // ---- front arm ----
      ink.form(limb(shF, elbowF, 6, 5), { seed: 170 });
      ink.form(limb(elbowF, handF, 5, 4.2), { seed: 171 });
      { // a feathered cuff
        const d = unit(elbowF, handF), P = fr(add(handF, d, -10), d);
        feather(ink, P(0, -3), P(9, -9), 3.4, { seed: 173 });
        feather(ink, P(0, 3), P(10, 8), 3.4, { seed: 175 });
        ink.cut([P(-1, -5), P(-1, 5)], { w: 1.2, seed: 177 });
      }
      if (T) {
        // the hand just opened: three fingers splayed after the release
        const d = unit(elbowF, handF);
        ink.form(ell(handF[0], handF[1], 5.6, 5, Math.atan2(d[1], d[0])), { w: 2, seed: 180 });
        [-0.7, -0.15, 0.4].forEach((a, i) => {
          const fd = dirOf(Math.atan2(d[1], d[0]) + a), p0 = add(handF, fd, 4);
          ink.form(limb(p0, add(p0, fd, 9 - i), 1.9, 1.5), { w: 1.6, seed: 182 + i });
        });
      } else {
        knife(ink, handF, dirOf(-0.55), 26, { notch: true });
        fist(ink, handF, elbowF, 5.2);
      }

      // ---- hood and beak mask ----
      const hood = smooth([H(12, 13), H(-6, 15), H(-18, 9), H(-24, -6), H(-38, -20), H(-16, -24), H(0, -27), H(14, -20), H(20, -4), H(20, 8)], 6, true);
      ink.form(hood, { w: 2.6, seed: 200 });
      ink.hatch(smooth([H(-6, 15), H(-18, 9), H(-24, -6), H(-38, -20), H(-14, -20), H(-6, 0)], 5, true), { angle: 1.1, gap: 3.4, seed: 201 });
      ink.cut(smooth([H(-34, -19), H(-14, -14), H(2, -2)], 5), { w: 1.3, seed: 202 });
      const face = ell(...H(10, 0), 9, 12, tilt);
      ink.mask(face);
      // the beak: long, curved down at the tip
      const beak = smooth([H(4, -10), H(18, -11), H(38, -5), H(60, 9), H(48, 6), H(32, 5), H(18, 9), H(4, 10)], 6, true);
      ink.form(beak, { w: 2.4, seed: 210 });
      ink.cut(smooth([H(14, 1), H(34, 1), H(56, 8)], 5), { w: 1.3, seed: 211 });
      ink.cut([H(25, -6), H(30, -5)], { w: 1.4, seed: 212 });
      ink.hatch(smooth([H(14, 2), H(34, 2), H(56, 8), H(32, 5), H(16, 9)], 5, true), { angle: 0.3, gap: 2.8, seed: 213 });
      // the eye: a round glass with a dark pupil, a strap back over the hood
      ink.cut(smooth([H(4, -6), H(-6, -9), H(-20, -8)], 5), { w: 1.6, seed: 214 });
      ink.form(ell(...H(10, -3), 5.2, 5.2), { w: 2, seed: 215 });
      ink.dot(...H(11, -3), 1.9, { free: true });
      if (ink.mode === 'mass') ink.dot(...H(11, -3), 1.9);

      // ---- Feather Knives: a fan of three in flight, each with its cut of air ----
      if (T) {
        const o = add(handF, [8, -2]);
        [[-0.24, 150], [-0.03, 206], [0.2, 162]].forEach(([a, dist], i) => {
          const d = dirOf(a), n = nrm(d), p = add(o, d, dist);
          // the trail: three pen strokes thinning back toward the hand
          for (let k = 0; k < 3; k++) {
            const off = (k - 1) * 4.5, l0 = 16 + k * 6, l1 = 70 + (k === 1 ? 46 : 18) + i * 8;
            ink.line([add(add(p, d, -l1), n, off * 1.4), add(add(p, d, -l0 * 0.5 - 8), n, off * 0.6)], { tint: 'blue', w: k === 1 ? 2.2 : 1.5, taper: 0.9, seed: 300 + i * 7 + k });
          }
          knife(ink, add(p, d, -10), d, 30, { notch: i === 1 });
          // a fletch of feather at the pommel so the knife flies true
          feather(ink, add(p, d, -22), add(add(p, d, -36), n, i === 1 ? 4 : -4), 3.6, { seed: 320 + i * 4 });
        });
      }
    },
  });
})();
