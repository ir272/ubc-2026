// The Lamplighter: a gaunt figure on stilts in a caped greatcoat and a tall bent hat, with a lamp
// pole longer than he is. Tint: gold (the lantern and its fire).
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
  /** A hand closed round a pole: back of the hand in front, knuckles across the pole. */
  function grip(ink, c, up, o = {}) {
    const k = o.k ?? 1, v = perp(up);
    const at = (a, b) => [c[0] + (up[0] * a + v[0] * b) * k, c[1] + (up[1] * a + v[1] * b) * k];
    ink.form(smooth([at(-8, -7), at(8, -8), at(9, -1), at(7, 6), at(-1, 7.5), at(-8, 6), at(-10, -1)], 4, true), { w: 1.6 });
    for (let i = 0; i < 3; i++) ink.cut([at(-4.5 + i * 4.2, 2.5), at(-5 + i * 4.2, 7.5)], { w: 1, taper: 0.6 });
    ink.cut(smooth([at(-6, -4), at(0, -3), at(6, -4.5)], 4), { w: 0.9, taper: 0.8 });
    ink.form(tube([at(5, -8), at(9, -2), at(9, 4)], 2.2 * k, 1.2 * k, 3), { w: 1.2 });
  }
  /** A flame: a tongue from its root c0, rising along `ang`, bending by `curl`. */
  function tongue(c0, len, ang, wmax, curl, wav = 0, ph = 0) {
    const C = [c0];
    for (let k = 1; k <= 10; k++) { const t = k / 10; C.push(add(C[k - 1], dir(ang + curl * t * t + wav * Math.sin(t * 6 + ph)), len / 10)); }
    const L = [], R = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, d = unit(C[Math.max(0, k - 1)], C[Math.min(10, k + 1)]), n = perp(d);
      const w = wmax * (t < 0.3 ? 0.7 + t : Math.pow(1 - (t - 0.3) / 0.7, 1.1));
      L.push(add(C[k], n, w)); R.push(add(C[k], n, -w));
    }
    return L.concat(R.reverse());
  }
  /** The lantern: hooded cap, glass cage, the flame inside. c = the ring at its top, a = tilt. */
  function lantern(ink, c, a, o = {}) {
    const P = (x, y) => rot([c[0] + x, c[1] + y], c, a);
    const k = o.broken ? 1 : 0;
    // cap and chimney
    ink.form(smooth([P(-11, 12), P(-6, 6), P(-2, 3), P(2, 3), P(6, 6), P(11, 12)], 3).concat([P(9, 13), P(-9, 13)]), { w: 1.9, seed: 301 });
    ink.form([P(-3, 3), P(-2.5, -1), P(2.5, -1), P(3, 3)], { w: 1.3, seed: 302 });
    ink.line(smooth([P(0, -1), P(-3, -5), P(0, -8), P(3, -5), P(0, -1)], 3), { w: 1.3, taper: 0 });
    // the glass cage
    const glass = [P(-8, 14), P(8, 14), P(10 + k * 3, 32), P(-10, 32)];
    ink.form(glass, { w: 2, seed: 303 });
    ink.mask([P(-6, 16), P(6, 16), P(7.5 + k * 2, 30), P(-7.5, 30)]);
    ink.hatch([P(-6, 16), P(6, 16), P(7.5, 30), P(-7.5, 30)], { tint: 'gold', angle: a + 0.5, gap: 2.6, w: 0.8, alpha: 0.55, seed: 304 });
    // the flame on its wick
    ink.form(tongue(P(0, 29), 12, a - Math.PI / 2, 3, 0.5), { tint: 'gold', w: 1.3, seed: 305 });
    ink.line([P(0, 30), P(0, 27)], { w: 1.2, taper: 0 });
    // bars
    for (const x of [-4, 4]) ink.line([P(x * 1.0, 14), P(x * 1.2, 32)], { w: 1.2, taper: 0 });
    if (o.broken) { ink.line([P(10, 22), P(5, 25), P(8, 28)], { w: 1, taper: 0.5 }); }
    // base
    ink.form([P(-12, 32), P(12, 32), P(10, 37), P(-10, 37)], { w: 1.8, seed: 306 });
    ink.cut([P(-9, 34.5), P(9, 34.5)], { w: 0.9, taper: 0.3 });
  }

  CAST.push({
    id: 'lamplighter', group: 'reach', name: 'The Lamplighter', kind: 'Long reach and spells',
    look: 'A gaunt man on wooden stilts in a caped greatcoat and a tall dented hat, with a lamp pole longer than he is.',
    does: [
      ['Lantern Toss', 'He lobs the lantern off his pole; it smashes into a patch of fire on the floor.'],
      ['Long Sweep', 'A slow sweep of the pole that reaches a third of the way across the stage.'],
      ['Pole Vault', 'He plants the pole in the air below him and vaults back onto the stage.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      const X = A ? -46 : 0;
      const J = (x, y) => [x + X, y];
      // ---- joints ----
      const stB = A ? J(-34, 0) : [-18, 0], stF = A ? J(40, 0) : [16, 0];    // where the stilts meet the floor
      const ankB = A ? J(-30, -56) : [-17, -58], ankF = A ? J(32, -58) : [14, -60];
      const kneeB = A ? J(-14, -100) : [-12, -100], kneeF = A ? J(28, -104) : [17, -102];
      const hip = A ? J(4, -138) : [0, -136];
      const shB = A ? J(14, -186) : [-6, -188], shF = A ? J(30, -184) : [12, -188];
      const neck = A ? J(28, -192) : [6, -194];
      const head = A ? J(36, -205) : [10, -207];
      const poleBut = A ? J(-14, -146) : [-124, -122], poleTip = A ? J(236, -258) : [112, -240];
      const pu = unit(poleBut, poleTip);
      const handB = A ? mix(poleBut, poleTip, 0.16) : mix(poleBut, poleTip, 0.25);
      const handF = A ? mix(poleBut, poleTip, 0.33) : mix(poleBut, poleTip, 0.74);
      const elB = A ? J(-2, -170) : [-34, -158], elF = A ? J(44, -164) : [36, -160];
      const sweep = A ? -18 : 0;

      // ---- the far arm, reaching to the pole ----
      ink.form(tube([shB, elB, handB], 5.5, 4.5, 4), { w: 2.2, seed: 201 });
      ink.hatch(tube([shB, elB, handB], 5.5, 4.5, 4), { angle: 0.6, gap: 3.4, w: 0.9, seed: 202 });

      // ---- stilts and legs, far one first ----
      const leg = (st, ank, knee, far, s) => {
        const sd = unit(st, knee), sn = perp(sd);
        const top = add(knee, sd, -10);
        // the stilt: a planed pole with a rubber foot and a footrest
        ink.line([add(st, sn, 3), add(top, sn, 3)], { w: 4.2, taper: 0.06, seed: s });
        ink.form(smooth([add(st, sn, -1), add(add(st, sd, 5), sn, -0.5), add(add(st, sd, 5), sn, 7), add(st, sn, 7.5)], 3, true), { w: 1.5, seed: s + 1 });
        ink.form([add(add(ank, sd, 2), sn, -14), add(add(ank, sd, 2), sn, 6), add(add(ank, sd, -2), sn, 6), add(add(ank, sd, -2), sn, -10)], { w: 1.5, seed: s + 2 });
        // the leg, thin as a rail
        const lg = tube([hip, knee, ank], 6.5, 4.2, 4);
        ink.form(lg, { w: 2.3, seed: s + 3 });
        if (far) ink.hatch(lg, { angle: 0.5, gap: 3.2, w: 0.9, seed: s + 4 });
        ink.cut(smooth([add(knee, sd, -12), add(knee, sn, -1.5), add(knee, sd, 8)], 3), { w: 1.1 });
        // the boot on its rest
        const bp = add(ank, sd, -2);
        ink.form(smooth([add(bp, [-5, -12]), add(bp, [5, -12]), add(bp, [6, -4]), add(bp, [15, -3]), add(bp, [18, 0]), add(bp, [16, 1.5]), add(bp, [-7, 1.5]), add(bp, [-7, -4])], 3, true), { w: 1.9, seed: s + 5 });
        ink.cut([add(bp, [-6, -1.2]), add(bp, [16, -1.2])], { w: 0.9, taper: 0.3 });
        // straps round shin and stilt
        for (const t of [0.35, 0.72]) {
          const q = mix(ank, knee, t);
          ink.form([add(q, sn, -6.5), add(add(q, sn, -6.5), sd, 3.6), add(add(q, sn, 7.5), sd, 3.6), add(q, sn, 7.5)], { w: 1.3, seed: s + 6 + t * 10 });
          ink.dot(...add(add(q, sn, 4), sd, 1.8), 0.9);
        }
      };
      leg(stB, ankB, kneeB, true, 210);
      leg(stF, ankF, kneeF, false, 230);

      // ---- the greatcoat ----
      const hemF = [hip[0] + 22, -86], hemB = [hip[0] - 34 + sweep, -76];
      const coat = smooth([
        add(shF, [4, 2]), add(shF, [8, 26]), [hip[0] + 13, hip[1] - 14], [hip[0] + 15, hip[1] + 4], hemF,
        [hemF[0] - 12, hemF[1] + 2], [hip[0] - 4, -84], [hip[0] - 12, -88], [hip[0] - 16, -80], hemB,
        [hip[0] - 26, hip[1] + 6], [hip[0] - 15, hip[1] - 14], add(shB, [-10, 26]), add(shB, [-6, -2]),
      ], 4, true);
      ink.form(coat, { w: 2.7, seed: 241 });
      ink.hatch(smooth([add(shB, [-6, 4]), add(shB, [-10, 26]), [hip[0] - 15, hip[1] - 14], [hip[0] - 26, hip[1] + 6], hemB, [hip[0] - 10, -84], [hip[0] - 6, hip[1]], [hip[0] - 4, hip[1] - 30], add(shB, [6, 10])], 4, true), { angle: 1.15, gap: 4, w: 1, seed: 242 });
      // the split up the back and the folds of the skirt
      ink.cut(smooth([[hip[0] - 10, hip[1] + 10], [hip[0] - 12, -104], [hip[0] - 12, -88]], 3), { w: 1.4 });
      ink.cut(smooth([[hip[0] + 8, hip[1] + 6], [hip[0] + 11, -112], [hemF[0] - 4, -90]], 3), { w: 1.2 });
      ink.cut(smooth([[hip[0] - 12, hip[1] + 8], [hip[0] - 18, -104], [hemB[0] + 8, -80]], 3), { w: 1.2 });
      // belt, buttons, pocket flap
      ink.cut([[hip[0] - 13, hip[1] - 12], [hip[0] + 13, hip[1] - 13]], { w: 1.8, taper: 0.2 });
      ink.cut([[hip[0] - 13, hip[1] - 8], [hip[0] + 14, hip[1] - 9]], { w: 1.2, taper: 0.2 });
      ink.form([[hip[0] + 2, hip[1] - 15], [hip[0] + 8, hip[1] - 15], [hip[0] + 8, hip[1] - 6], [hip[0] + 2, hip[1] - 6]], { w: 1.2, seed: 243 });
      for (let i = 0; i < 4; i++) ink.dot(...mix(add(shF, [7, 18]), [hip[0] + 11, hip[1] - 18], i / 3), 1.4);
      ink.cut([[hip[0] - 6, hip[1] + 18], [hip[0] + 6, hip[1] + 17]], { w: 1.3, taper: 0.3 });

      // ---- the caped collar: two short capes, one over the other ----
      const cape = (drop, wide, seed) => smooth([
        add(neck, [-10, 0]), add(shB, [-wide * 0.6, drop * 0.3]), add(shB, [-wide - 4, drop]),
        add(mix(shB, shF, 0.35), [0, drop + 3]), add(shF, [wide + 4, drop - 2]), add(shF, [wide * 0.6, drop * 0.3]), add(neck, [12, 0]),
      ], 4, true);
      const cape1 = cape(38, 10, 251);
      ink.form(cape1, { w: 2.4, seed: 251 });
      ink.hatch(smooth([add(shB, [-12, 8]), add(shB, [-12, 38]), add(mix(shB, shF, 0.3), [0, 42]), add(shB, [4, 12])], 4, true), { angle: 1.25, gap: 3.6, w: 0.9, seed: 252 });
      ink.form(cape(21, 8, 253), { w: 2.2, seed: 253 });
      ink.cut(smooth([add(shB, [-2, 6]), add(shB, [-4, 18])], 3), { w: 1.1 });
      ink.cut(smooth([add(shF, [2, 6]), add(shF, [4, 18])], 3), { w: 1.1 });
      ink.cut(smooth([add(mix(shB, shF, 0.4), [0, 26]), add(mix(shB, shF, 0.4), [-1, 40])], 3), { w: 1.1 });

      // ---- head: a long gaunt profile, scarf up to the chin ----
      const Hd = (x, y) => [head[0] + x, head[1] + y];
      // hair wisps out the back
      for (let i = 0; i < 3; i++) ink.line(smooth([Hd(-7, -4 + i * 3), Hd(-13, -1 + i * 4), Hd(-19 - i * 2, 4 + i * 4)], 3), { w: 1.1, taper: 0.8 });
      const face = smooth([Hd(-8, -8), Hd(4, -10), Hd(8, -7), Hd(9, -3), Hd(16, 3), Hd(10, 4), Hd(10, 7), Hd(8, 10), Hd(9, 13), Hd(4, 16), Hd(-6, 14), Hd(-9, 4)], 3, true);
      ink.form(face, { w: 2, seed: 261 });
      ink.hatch(smooth([Hd(-8, -6), Hd(-2, -6), Hd(0, 6), Hd(-4, 14), Hd(-9, 4)], 3, true), { angle: 1.1, gap: 2.6, w: 0.8, seed: 262 });
      ink.dot(...Hd(4, -3), 1.3);
      ink.cut(smooth([Hd(1, -5.5), Hd(4, -6.2), Hd(7, -5.5)], 3), { w: 0.9 });
      ink.cut(smooth([Hd(3, 3), Hd(2, 7), Hd(4, 10)], 3), { w: 0.9 });
      ink.cut([Hd(6, 9.5), Hd(9, 9)], { w: 0.9, taper: 0.4 });
      // scarf
      const scarf = smooth([Hd(-10, 10), Hd(2, 13), Hd(10, 12), Hd(11, 18), Hd(4, 21), Hd(-10, 20)], 3, true);
      ink.form(scarf, { w: 1.9, seed: 263 });
      for (let i = 0; i < 3; i++) ink.cut([Hd(-6 + i * 5, 12.5), Hd(-7 + i * 5, 20)], { w: 1, taper: 0.4 });
      const tail = A ? [Hd(-12, 16), Hd(-26, 18), Hd(-44, 12), Hd(-58, 16)] : [Hd(-10, 16), Hd(-18, 24), Hd(-22, 38), Hd(-20, 50)];
      ink.form(tube(tail, 4, 3, 4), { w: 1.8, seed: 264 });
      ink.cut([tail[3], add(tail[3], unit(tail[2], tail[3]), 5)], { w: 1 });
      // the hat: a tall stovepipe, dented and leaning back
      const hb = Hd(0, -9), tilt = A ? -0.2 : -0.12;
      const HT = (x, y) => rot([hb[0] + x, hb[1] + y], hb, tilt);
      ink.form(smooth([HT(-11, 0), HT(-11.5, -12), HT(-10, -17), HT(-12, -24), HT(-12, -29), HT(-8, -31), HT(4, -31), HT(12, -30), HT(11, -22), HT(9, -16), HT(10, -6), HT(10, 0)], 3, true), { w: 2.5, seed: 271 });
      ink.hatch(smooth([HT(-11, -1), HT(-11.5, -12), HT(-10, -18), HT(-12, -26), HT(-12, -33), HT(-6, -34), HT(-4, -20), HT(-5, -1)], 3, true), { angle: 1.4, gap: 2.8, w: 0.9, seed: 272 });
      ink.cut(smooth([HT(-10, -18), HT(-2, -20), HT(9, -16)], 3), { w: 1.2 });
      ink.form([HT(-11, -2), HT(10.5, -2), HT(10.5, -7), HT(-11, -7)], { w: 1.5, seed: 273 });
      ink.form(smooth([HT(-17, 3), HT(-12, -1), HT(0, -0.5), HT(12, -1), HT(19, -2), HT(16, 2), HT(0, 3.5), HT(-12, 4)], 3, true), { w: 2, seed: 274 });

      // ---- the lamp pole ----
      ink.line([poleBut, poleTip], { w: 3.6, taper: 0.08, seed: 281 });
      ink.line([poleBut, add(poleBut, pu, 7)], { w: 6, taper: 0, seed: 282 });            // iron ferrule
      ink.line([add(poleTip, pu, -12), add(poleTip, pu, -4)], { w: 5.2, taper: 0, seed: 283 }); // brass collar
      // the hook at the tip and the snuffer cone beside it
      const hk = [add(poleTip, pu, -2), add(poleTip, pu, 4), add(add(poleTip, pu, 9), [0, 1], 5), add(add(poleTip, pu, 7), [0, 1], 11), add(add(poleTip, pu, 2), [0, 1], 11)];
      ink.line(smooth(hk, 4), { w: 2, taper: 0.3 });
      const ring = hk[4];
      if (!A) {
        lantern(ink, add(ring, [0, 8]), 0.04);
        ink.line([ring, add(ring, [0, 8])], { w: 1.3, taper: 0 });
      }

      // ---- the near arm and its hands on the pole ----
      grip(ink, handB, pu, { k: 0.85 });
      const wr = add(handF, perp(pu), -8);
      const sl = tube([shF, elF, wr], 6, 6.5, 4);
      ink.form(sl, { w: 2.4, seed: 291 });
      ink.cut(smooth([add(elF, [-4, -6]), add(elF, [1, 1]), add(elF, [-2, 7])], 3), { w: 1.1 });
      const cd = unit(elF, wr), cn = perp(cd);
      ink.form([add(add(wr, cd, -6), cn, 7), add(add(wr, cd, 1), cn, 7.5), add(add(wr, cd, 1), cn, -7.5), add(add(wr, cd, -6), cn, -7)], { w: 1.6, seed: 292 });
      grip(ink, handF, pu, { k: 0.85 });

      // ---- the lantern toss ----
      if (A) {
        // its arc: dashes from the pole tip to where it smashes
        const arcPts = smooth([add(ring, [6, 4]), [ring[0] + 40, -258], [282, -232], [306, -170], [312, -96], [306, -44]], 8);
        for (let i = 2; i < arcPts.length - 4; i += 4) ink.line([arcPts[i], arcPts[i + 2]], { w: 1.4 - i * 0.012, taper: 0.4, tint: 'gold', seed: 310 + i });
        // the fire on the floor behind it, then the lantern landing in it
        const F = [[258, 0, 24, -1.9, 6, -0.6], [274, 0, 46, -1.7, 10, 0.7], [292, 0, 68, -1.55, 12, -0.6], [312, 0, 56, -1.65, 11, 0.8], [326, 0, 70, -1.5, 11, -0.7], [338, 0, 34, -1.3, 7, 0.6]];
        F.forEach(([x, y, len, ang, w, cu], i) => {
          const t = tongue([x, y], len, ang, w, cu, 0.28, i * 1.7);
          ink.form(t, { tint: 'gold', w: 1.6, seed: 320 + i });
          if (len > 40) ink.cut(smooth([[x, -6], [x + cu * 3, -len * 0.4], [x + cu * 8, -len * 0.7]], 3), { tint: 'gold', w: 0.9 });
        });
        lantern(ink, [300, -46], 0.75, { broken: true });
        // shards of glass skittering out
        for (let i = 0; i < 5; i++) {
          const b = [292 + i * 12, -4 - (i % 2) * 6], d = dir(-0.4 - i * 0.55);
          ink.line([b, add(b, d, 5 + (i % 3) * 2)], { w: 1.3, taper: 0.4 });
        }
        ink.line([[250, -1], [345, -1]], { tint: 'gold', w: 1.3, taper: 0.8, seed: 340 });
      }
    },
  });
})();
