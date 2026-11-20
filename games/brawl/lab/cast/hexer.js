// The Hexer: a tall hooded witch with a crooked staff. Tint: green (sash, charm, the hex).
(function () {
  const { smooth, ell, mix, h01 } = Ink;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const perp = (d) => [-d[1], d[0]];
  const dir = (a) => [Math.cos(a), Math.sin(a)];

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
    for (let j = 1; j < 6; j++) { const a = a1 - (Math.PI * j) / 6; capE.push(add(p[n - 1], dir(a), w1)); }
    for (let j = 1; j < 6; j++) { const a = a0 + Math.PI - (Math.PI * j) / 6; capS.push(add(p[0], dir(a), w0)); }
    return L.concat(capE, R.reverse(), capS);
  }
  /** A ragged edge from a to b: n uneven tatters hanging along `down` (a unit vector), pulled by `skew`. */
  function rag(a, b, n, depth, seed, down = [0, 1], skew = 0) {
    const steps = [];
    for (let i = 0; i < n; i++) steps.push(0.55 + 0.9 * h01(seed + i * 1.37));
    const tot = steps.reduce((x, y) => x + y, 0);
    const out = [a];
    let c = 0;
    for (let i = 0; i < n; i++) {
      const t0 = c / tot, t1 = (c + steps[i]) / tot; c += steps[i];
      const r = h01(seed + i * 5.13), long = r > 0.82 ? 1.7 : 1;
      const k = depth * (0.35 + 0.9 * h01(seed + i * 2.71)) * long;
      const tp = mix(a, b, t0 + (t1 - t0) * (0.4 + 0.3 * r));
      out.push([tp[0] + down[0] * k + skew * k, tp[1] + down[1] * k]);
      const np = mix(a, b, t1);
      const kn = i === n - 1 ? 0 : -depth * 0.18 * h01(seed + i * 7.7);
      out.push([np[0] + down[0] * kn, np[1] + down[1] * kn]);
    }
    return out;
  }
  /** An open hand: long bony fingers from the wrist along angle `ang`; side = which way the thumb sits. */
  function openHand(ink, wrist, ang, o = {}) {
    const k = o.k ?? 1, spread = o.spread ?? 1, curl = o.curl ?? 0.35, side = o.side ?? 1;
    const d = dir(ang), n = perp(d);
    const at = (a, b) => [wrist[0] + (d[0] * a + n[0] * b) * k, wrist[1] + (d[1] * a + n[1] * b) * k];
    const lens = [17, 21, 20, 15];
    for (let i = 3; i >= 0; i--) {
      const off = (i - 1.5) * 2.5 * side;
      const base = at(7, off), a = ang + (i - 1.5) * 0.2 * spread * side;
      const j1 = add(base, dir(a), lens[i] * 0.5 * k), a2 = a + curl * side, tip = add(j1, dir(a2), lens[i] * 0.5 * k);
      ink.form(tube([base, j1, tip], 1.35 * k, 0.55 * k, 3), { w: 1.1 });
    }
    const tb = at(2, -side * 4.5), ta = ang - side * 0.75;
    ink.form(tube([tb, add(tb, dir(ta), 7 * k), add(tb, dir(ta + side * 0.3), 13 * k)], 2 * k, 0.8 * k, 3), { w: 1.15 });
    ink.form(smooth([at(-4, -4.5 * side), at(4, -6 * side), at(9, -4.5 * side), at(9.5, 5 * side), at(2, 5.5 * side), at(-4, 4 * side)], 4, true), { w: 1.4 });
    ink.cut([at(1, 2.5 * side), at(7, 3 * side)], { w: 1 });
  }
  /** A hand closed round a pole: back of the hand in front, knuckles across the pole. */
  function grip(ink, c, up, o = {}) {
    const k = o.k ?? 1, v = perp(up); // v points across the pole, toward the front
    const at = (a, b) => [c[0] + (up[0] * a + v[0] * b) * k, c[1] + (up[1] * a + v[1] * b) * k];
    ink.form(smooth([at(-8, -7), at(8, -8), at(9, -1), at(7, 6), at(-1, 7.5), at(-8, 6), at(-10, -1)], 4, true), { w: 1.6 });
    for (let i = 0; i < 3; i++) ink.cut([at(-4.5 + i * 4.2, 2.5), at(-5 + i * 4.2, 7.5)], { w: 1, taper: 0.6 });
    ink.cut(smooth([at(-6, -4), at(0, -3), at(6, -4.5)], 4), { w: 0.9, taper: 0.8 });
    ink.form(tube([at(5, -8), at(9, -2), at(9, 4)], 2.2 * k, 1.2 * k, 3), { w: 1.2 });
  }

  CAST.push({
    id: 'hexer', group: 'reach', name: 'The Hexer', kind: 'Long reach and spells',
    look: 'A tall witch in a tattered robe and a long hood that bends at the tip, leaning on a crooked staff with a charm tied to it.',
    does: [
      ['Hex Bolt', 'A bolt of green ink-fire leaves the staff and crosses the whole stage.'],
      ['Ward', 'She scratches a mark on the floor; whoever steps on it is stuck fast for a moment.'],
      ['Crow Flight', 'She bursts into a flock of crows and gathers again higher up.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      // ---- joints ----
      const X = A ? -62 : 0; // the cast pose stands further back so the bolt has room
      const J = (x, y) => [x + X, y];
      const footB = A ? J(-46, 0) : [-14, 0], footF = A ? J(46, 0) : [16, 0];
      const hip = A ? J(6, -96) : [0, -100];
      const neck = A ? J(28, -164) : [6, -168];
      const head = A ? J(40, -180) : [12, -186];
      const shB = A ? J(12, -156) : [-10, -160], shF = A ? J(32, -154) : [16, -158];
      const elB = A ? J(-12, -150) : [-30, -126], handB = A ? J(-40, -168) : [-44, -96];
      const staffBot = A ? J(44, -138) : [54, 0], staffTop = A ? J(262, -190) : [48, -222];
      const up = unit(staffBot, staffTop), sv = perp(up); // sv: across the staff, toward the front
      const gripF = mix(staffBot, staffTop, A ? 0.17 : 0.4);
      const elF = A ? J(52, -128) : [34, -124], handF = gripF;
      const sweep = A ? -30 : 0; // how far the hem and tails trail behind
      const tipHood = A ? J(-30, -226) : [-40, -240];

      // ---- the sash tails, behind ----
      const knot = [hip[0] - 18, hip[1] - 2];
      const tail1 = smooth([knot, [knot[0] - 14 + sweep * 0.4, knot[1] + 18], [knot[0] - 22 + sweep, knot[1] + 34 - (A ? 22 : 0)], [knot[0] - 36 + sweep * 1.4, knot[1] + 46 - (A ? 34 : 0)]], 6);
      const tail2 = smooth([knot, [knot[0] - 8 + sweep * 0.3, knot[1] + 22], [knot[0] - 10 + sweep * 0.8, knot[1] + 44 - (A ? 18 : 0)], [knot[0] - 20 + sweep * 1.2, knot[1] + 62 - (A ? 30 : 0)]], 6);
      for (const [t, w, s] of [[tail1, 5.5, 41], [tail2, 4.5, 43]]) {
        const sh = tube(t, w * 0.75, w * 0.45, 1);
        const end = t[t.length - 1], d = unit(t[t.length - 3], end);
        ink.form(sh, { tint: 'green', w: 1.6, seed: s });
        ink.hatch(sh, { tint: 'green', angle: Math.atan2(d[1], d[0]) + 0.15, gap: 2.6, w: 0.8, seed: s + 1 });
        // a forked, frayed end
        ink.line([end, add(end, d, 9), add(add(end, d, 14), perp(d), 3)], { tint: 'green', w: 1.4, taper: 0.9 });
      }

      // ---- the far arm ----
      ink.form(tube([shB, elB, mix(elB, handB, 0.75)], 6, 8.5, 4), { w: 2.2 });
      ink.hatch(tube([shB, elB, mix(elB, handB, 0.75)], 6, 8.5, 4), { angle: 1.0, gap: 3.6, w: 0.9 });
      const bAng = Math.atan2(handB[1] - elB[1], handB[0] - elB[0]);
      openHand(ink, mix(elB, handB, 0.72), bAng, { side: A ? -1 : 1, spread: A ? 1.6 : 0.8, curl: A ? -0.25 : 0.45 });

      // ---- the pointed shoes ----
      for (const [f, s] of [[footB, 51], [footF, 53]]) {
        ink.form(smooth([[f[0] - 8, -9], [f[0] + 4, -10], [f[0] + 14, -5], [f[0] + 24, -7], [f[0] + 22, -1], [f[0] + 12, 0], [f[0] - 9, 0]], 4, true), { w: 1.8, seed: s });
      }

      // ---- the robe ----
      const hemF = [footF[0] + 22 + sweep * 0.2, -12], hemB = [footB[0] - (A ? 24 : 40) + sweep, -10];
      const front = smooth([add(shF, [6, 0]), add(shF, [12, 26]), add(hip, [20, 0]), mix(add(hip, [24, 0]), hemF, 0.55), hemF], 5);
      const hem = rag(hemF, hemB, 6, 16, A ? 70 : 60, [0, 1], A ? -0.5 : 0).slice(1, -1).map((p) => [p[0], Math.min(p[1], 0)]);
      const backPts = A
        ? [hemB, [hip[0] - 44, -44], [hip[0] - 26, hip[1] + 10], [shB[0] - 10, shB[1] + 16], [shB[0] - 4, shB[1] - 2]]
        : [hemB, [hip[0] - 40, -44], [hip[0] - 26, hip[1] + 6], [shB[0] - 10, shB[1] + 26], [shB[0] - 2, shB[1] - 6]];
      const back = smooth(backPts, 5);
      const robe = front.concat(hem, back);
      ink.form(robe, { w: 2.8, seed: 61 });
      // shadow side: the back third of the robe
      const shade = smooth([backPts[4], backPts[3], backPts[2], backPts[1], [hemB[0] + 4, -1], [hemB[0] + 30, -1], mix(hip, hemB, 0.5), [hip[0] - 8, hip[1] + 4], [shB[0] + 4, shB[1] + 10]], 4, true);
      ink.hatch(shade.map((q) => [q[0], Math.min(q[1], -12)]), { angle: 1.22, gap: 4.2, w: 1, seed: 63 });
      // folds from the waist to the hem notches
      const fold = (pts, w = 1.5) => ink.cut(smooth(pts, 6), { w });
      fold([add(hip, [10, 6]), add(hip, [14, 40]), [hemF[0] - 8, -26], [hemF[0] - 10, -6]]);
      fold([add(hip, [-2, 8]), add(hip, [0, 46]), mix(hip, [hemB[0] + 40, 0], 0.8), [hemB[0] + 46, -8]], 1.6);
      fold([add(hip, [-14, 10]), mix(hip, hemB, 0.5), [hemB[0] + 22, -8]], 1.3);
      fold([add(hip, [4, 30]), add(hip, [6, 62]), [hemF[0] - 26, -10]], 1.2);
      fold([add(shF, [2, 30]), add(hip, [8, -18]), add(hip, [10, -4])], 1.2);

      // ---- the sash round the waist and its knot ----
      const sash = smooth([add(hip, [-22, -10]), add(hip, [0, -12]), add(hip, [22, -10]), add(hip, [23, 1]), add(hip, [0, 0]), add(hip, [-22, 2])], 5, true);
      ink.form(sash, { tint: 'green', w: 1.9, seed: 71 });
      ink.hatch(sash, { tint: 'green', angle: 1.1, gap: 3, w: 0.9, seed: 72 });
      ink.form(ell(knot[0], knot[1] - 4, 6, 5, 0.4, 14), { tint: 'green', w: 1.6, seed: 73 });

      // ---- the shawl over the shoulders, ragged at the bottom ----
      const sw = A ? -10 : 0;
      const shawl = smooth([add(neck, [-14, 4]), add(shB, [-10, 4]), add(shB, [-16, 26]), add(shB, [-22 + sw, 54]), add(shB, [-12, 44]), add(shB, [-10, 50]),
        add(shB, [0, 36]), add(mix(shB, shF, 0.6), [0, 24]), add(shF, [10, 20]), add(shF, [16, 12]), add(shF, [12, 2]), add(neck, [16, 4])], 4, true);
      ink.form(shawl, { w: 2.5, seed: 85 });
      ink.hatch(smooth([add(shB, [-12, 2]), add(shB, [-16, 26]), add(shB, [-20 + sw, 50]), add(shB, [-8, 40]), add(shB, [2, 32]), add(shB, [4, 6])], 4, true), { angle: 1.3, gap: 3.6, w: 0.9, seed: 86 });
      ink.cut(smooth([add(neck, [-2, 8]), add(shB, [-4, 22]), add(shB, [-14 + sw, 44])], 5), { w: 1.3 });
      ink.cut(smooth([add(neck, [8, 8]), add(shF, [4, 12]), add(shF, [2, 20])], 5), { w: 1.2 });

      // ---- the hood: a long cone bent back at the tip ----
      const H = (x, y) => [head[0] + x, head[1] + y];
      const lean = A ? 0.18 : 0;
      const Hr = (x, y) => { const c = Math.cos(lean), s = Math.sin(lean); return [head[0] + x * c - y * s, head[1] + x * s + y * c]; };
      const tipH = A ? Hr(-70, -36) : tipHood;
      const hood = smooth([Hr(6, 24), Hr(-18, 22), Hr(-27, 4), Hr(-28, -18), Hr(-38, -36), mix(Hr(-38, -36), tipH, 0.75), add(tipH, [1, 2]), add(tipH, [-1, -1]), mix(tipH, Hr(-42, -46), 0.3), Hr(-42, -46), Hr(-24, -36), Hr(-6, -26), Hr(12, -16), Hr(22, -4), Hr(18, 12), Hr(12, 22)], 5, true);
      ink.form(hood, { w: 2.8, seed: 91 });
      ink.hatch(smooth([Hr(-18, 22), Hr(-27, 4), Hr(-28, -18), Hr(-36, -38), Hr(-20, -30), Hr(-12, -8), Hr(-8, 18)], 4, true), { angle: 1.35, gap: 3.6, w: 0.95, seed: 92 });
      ink.cut(smooth([Hr(-10, 20), Hr(-16, -2), Hr(-22, -26), Hr(-34, -42)], 5), { w: 1.3 });
      ink.cut(smooth([Hr(-2, 20), Hr(-6, 0), Hr(-8, -20)], 5), { w: 1.1 });
      // the opening and the face inside it
      const hole = smooth([Hr(6, -14), Hr(15, -9), Hr(17, 4), Hr(13, 18), Hr(5, 16), Hr(3, 0)], 5, true);
      ink.mask(hole);
      ink.cut(hole, { closed: true, w: 1.5, taper: 0 });
      // hooked nose and pointed chin, cream in both treatments
      ink.form(smooth([Hr(9, 14), Hr(14, 13), Hr(20, 9), Hr(19, 14), Hr(13, 19), Hr(8, 19)], 4, true), { w: 1.2, seed: 96 });
      ink.form(smooth([Hr(9, -7), Hr(16, -4), Hr(24, 1), Hr(27, 6), Hr(24, 9), Hr(22, 5), Hr(15, 4), Hr(10, 3)], 4, true), { w: 1.3, seed: 95 });
      ink.cut([Hr(10, 10), Hr(15, 9.5)], { w: 1, taper: 0.5 });
      ink.dot(...Hr(11, -4), 1.6, { free: true });
      ink.line([Hr(8, -8), Hr(14, -7)], { w: 1.1, taper: 0.8 });
      // grey hair hanging out of the hood
      for (let i = 0; i < 4; i++) ink.cut(smooth([Hr(4 + i * 1.5, 14), Hr(2 + i * 2, 30), Hr(-2 + i * 3 + (A ? -6 : 0), 46 + i * 3)], 5), { w: 1.1 });

      // ---- the crooked staff ----
      const L = Math.hypot(staffTop[0] - staffBot[0], staffTop[1] - staffBot[1]);
      const kink = [0, 0.18, 0.37, 0.55, 0.74, 0.9, 1].map((t, i) => add(add(staffBot, up, t * L), sv, [0, 2.5, -1.5, 2, -2.5, 1, 0][i]));
      const crook = [add(staffTop, up, 6), add(add(staffTop, up, 7), sv, 10), add(add(staffTop, up, 1), sv, 18), add(add(staffTop, up, -8), sv, 18), add(add(staffTop, up, -13), sv, 13)];
      const staffPath = smooth(kink.concat(crook), 5);
      ink.line(staffPath, { w: 3.6, taper: 0.12, seed: 101 });
      // knots and bark
      for (const t of [0.28, 0.63, 0.82]) {
        const p = staffPath[Math.round(t * 30)], s2 = t === 0.63 ? 1 : -1;
        ink.line([add(p, sv, s2 * 1), add(add(p, sv, s2 * 7), up, 6)], { w: 2.2, taper: 0.7 });
      }
      // the charm: a cord, a carved green token, three hanging threads
      const hang = crook[4];
      const g = A ? unit([0, 0], [-0.55, 1]) : [0, 1];
      const tok = add(hang, g, 16);
      ink.line([hang, mix(hang, tok, 0.5), tok], { w: 1.2, taper: 0.2 });
      const td = g, tn = perp(td);
      const T = (a, b) => add(add(tok, td, a), tn, b);
      const token = smooth([T(0, 0), T(4, 5), T(12, 5.5), T(17, 0), T(12, -5.5), T(4, -5)], 4, true);
      ink.form(token, { tint: 'green', w: 1.6, seed: 105 });
      ink.cut([T(4, -2.5), T(13, 2.5)], { w: 1, tint: 'green' });
      ink.cut([T(4, 2.5), T(13, -2.5)], { w: 1, tint: 'green' });
      for (let i = -1; i <= 1; i++) ink.line(smooth([T(17, i * 2), T(24, i * 3.5 + (A ? 3 : 0)), T(30, i * 3 + (A ? 7 : 0))], 4), { w: 1, taper: 0.8, tint: 'green' });

      // ---- the near arm, a bell sleeve, the hand round the staff ----
      const wristF = add(handF, sv, -9);
      const sleeve = tube([shF, elF, wristF], 6.5, 10.5, 4);
      ink.form(sleeve, { w: 2.4, seed: 111 });
      const sd = unit(elF, wristF), sn = perp(sd);
      ink.cut(smooth([add(elF, sn, -5), add(mix(elF, wristF, 0.5), sn, -3), add(wristF, sn, -6)], 4), { w: 1.2 });
      ink.cut(smooth([add(add(elF, sd, -10), sn, 4), add(elF, sn, 2), add(add(elF, sd, 8), sn, 5)], 4), { w: 1.1 });
      // ragged cuff
      ink.form(rag(add(wristF, sn, 10.5), add(wristF, sn, -10.5), 4, 4, 117, sd).concat([add(add(wristF, sd, -5), sn, -10), add(add(wristF, sd, -5), sn, 10)]), { w: 1.6, seed: 118 });
      grip(ink, handF, up, { k: 0.85 });

      // ---- the hex bolt ----
      if (A) {
        const tip = add(add(staffTop, up, 10), sv, 6);
        // a flare off the crook
        for (let i = 0; i < 3; i++) {
          const a = -0.9 + i * 0.5;
          ink.line(smooth([tip, add(tip, dir(a), 7), add(add(tip, dir(a), 13), dir(a - 1.3), 4)], 4), { tint: 'green', w: 1.6, taper: 0.9, seed: 130 + i });
        }
        const hx = 338, hy = -200;
        // the trail: braided strokes from the staff to the head
        for (let i = 0; i < 4; i++) {
          const pts = [];
          for (let k = 0; k <= 12; k++) {
            const t = k / 12, x = tip[0] + 6 + t * (hx - 40 - tip[0]);
            pts.push([x, tip[1] + (hy - tip[1]) * t + Math.sin(t * 9 + i * 1.6) * (1.5 + t * 3.5) + (i - 1.5) * 1.6 * t]);
          }
          ink.line(pts, { tint: 'green', w: 0.9 + i * 0.3, taper: 0.95, seed: 140 + i });
        }
        // tongues streaming back from the head: each one wavers and curls up at the end
        const leaf = (c0, len, ang, wmax, curl, seed, wav = 0.22, ph = 0) => {
          const C = [c0];
          for (let k = 1; k <= 14; k++) { const t = k / 14; C.push(add(C[k - 1], dir(ang + curl * t * t + wav * Math.sin(t * 6.3 + ph)), len / 14)); }
          const L = [], R = [];
          for (let k = 0; k <= 14; k++) {
            const t = k / 14, d = unit(C[Math.max(0, k - 1)], C[Math.min(14, k + 1)]), n = perp(d);
            const w = wmax * (t < 0.15 ? 0.6 + t * 2.6 : Math.pow(1 - (t - 0.15) / 0.85, 1.3));
            L.push(add(C[k], n, w)); R.push(add(C[k], n, -w));
          }
          const sh = L.concat(R.reverse());
          ink.form(sh, { tint: 'green', w: 1.5, seed });
          return C;
        };
        // flicks rising off the trail
        for (let i = 0; i < 2; i++) {
          const t = 0.45 + i * 0.25, b = [tip[0] + 6 + t * (hx - 40 - tip[0]), tip[1] + (hy - tip[1]) * t - 2];
          leaf(b, 16 + i * 6, -2.2, 2.4 + i * 0.6, -0.9, 170 + i, 0.3, i);
        }
        const tongues = [
          [[hx - 8, hy + 4], 120, Math.PI - 0.06, 7, 0.5, 0.2, 0],
          [[hx - 12, hy - 6], 92, Math.PI + 0.22, 8, 0.9, 0.25, 1.5],
          [[hx - 8, hy + 8], 78, Math.PI - 0.1, 7, 0.75, 0.25, 3],
          [[hx - 14, hy - 10], 58, Math.PI + 0.5, 6, 1.0, 0.3, 4],
          [[hx - 18, hy + 6], 44, Math.PI + 0.1, 5, 1.2, 0.3, 2],
        ];
        tongues.forEach(([c, len, ang, w, cu, wav, ph], i) => {
          const C = leaf(c, len, ang, w, cu, 150 + i, wav, ph);
          if (i < 3) ink.cut(smooth(C.slice(2, 10), 3), { tint: 'green', w: 0.9 });
        });
        // the leading edge: short fat tongues rooted at the front, so the bolt is all fire, no body
        [[[hx + 8, hy + 1], 40, Math.PI - 0.05, 9, 0.9, 0.2, 0.5], [[hx + 4, hy - 4], 30, Math.PI + 0.3, 7, 1.1, 0.25, 2.5], [[hx + 2, hy + 7], 28, Math.PI - 0.25, 6.5, 0.9, 0.25, 1]]
          .forEach(([c, len, ang, w, cu, wav, ph], i) => { const C = leaf(c, len, ang, w, cu, 180 + i, wav, ph); ink.cut(smooth(C.slice(1, 9), 3), { tint: 'green', w: 0.9 }); });
      }
    },
  });
})();
