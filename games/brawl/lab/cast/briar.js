// The Briar: a walking rose bush in the shape of a broad-shouldered man, one great rose for a face.
(function () {
  const { smooth, ell, mix, h01 } = Ink;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const fr = (o, u, a, b) => [o[0] + u[0] * a - u[1] * b, o[1] + u[1] * a + u[0] * b];
  function tube(ctrl, wf, per = 6) {
    const p = smooth(ctrl, per), n = p.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], u = unit(a, b), w = wf(i / (n - 1));
      L.push([p[i][0] - u[1] * w, p[i][1] + u[0] * w]); R.push([p[i][0] + u[1] * w, p[i][1] - u[0] * w]);
    }
    return L.concat(R.reverse());
  }
  // add hooked rose prickles along a closed outline: broad base, tip swept back
  function thorny(pts, gap, len, seed, lean = -0.4) {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? -1 : 1, out = [];
    let run = gap * h01(seed), k = 0, skip = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      run += d;
      if (skip > 0) { skip -= d; continue; }
      out.push(a);
      if (run > gap && d > 0.5) {
        run = -gap * 0.5 * h01(seed + k * 3.7);
        const u = [(b[0] - a[0]) / d, (b[1] - a[1]) / d], n = [sgn * u[1], -sgn * u[0]];
        const l = len * (0.85 + 0.4 * h01(seed + k * 1.9)), base = l * 0.6;
        // a curved prickle: up the front edge to the tip, back down to the base
        out.push([a[0] + n[0] * l * 0.45 + u[0] * base * 0.2, a[1] + n[1] * l * 0.45 + u[1] * base * 0.2]);
        out.push([a[0] + n[0] * l + u[0] * l * lean, a[1] + n[1] * l + u[1] * l * lean]);
        out.push([a[0] + n[0] * l * 0.25 + u[0] * base * 0.55, a[1] + n[1] * l * 0.25 + u[1] * base * 0.55]);
        skip = base;
        k++;
      }
    }
    return out;
  }
  function leaf(ink, base, dir, len, wid, o = {}) {
    const u = dir, P = (a, b) => fr(base, u, a * len, b * wid);
    const pts = smooth([P(0, 0), P(0.25, -0.75), P(0.55, -0.95), P(0.85, -0.5), P(1, 0), P(0.8, 0.45), P(0.5, 0.9), P(0.22, 0.7)], 4, true);
    ink.form(pts, { w: o.w ?? 1.8 });
    ink.cut(smooth([P(0.05, 0), P(0.5, 0.06), P(0.92, 0)], 4), { w: 1.1 });
    for (const t of [0.3, 0.5, 0.7]) { ink.cut([P(t, 0.04), P(t + 0.14, -0.55)], { w: 0.9 }); ink.cut([P(t, 0.06), P(t + 0.14, 0.6)], { w: 0.9 }); }
    if (o.shade) ink.hatch(smooth([P(0.1, 0.05), P(0.5, 0.06), P(0.9, 0.02), P(0.5, 0.9), P(0.22, 0.7)], 3, true), { angle: 0.6, gap: 3.4 });
  }
  // a vine limb: thorny tube, a thinner vine wound round it, a leaf or two
  function vineLimb(ink, ctrl, w0, w1, seed, o = {}) {
    const body = thorny(tube(ctrl, (t) => w0 - t * (w0 - w1), 8), o.gap ?? 13, o.thorn ?? 6, seed);
    ink.form(body, { w: o.w ?? 2.4 });
    if (o.shade) ink.hatch(body, { angle: 1.0, gap: 5 });
    // the wound vine: short diagonal crossings
    const p = smooth(ctrl, 8), n = p.length;
    for (let i = 3; i < n - 3; i += o.wind ?? 6) {
      const u = unit(p[i - 1], p[i + 1]), w = w0 - (i / (n - 1)) * (w0 - w1);
      ink.cut(smooth([fr(p[i], u, -5, -w * 0.9), fr(p[i], u, 0, -w * 0.1), fr(p[i], u, 5, w * 0.9)], 3), { w: 1.4, taper: 0.4 });
    }
    return p;
  }
  // tendril fingers that curl at the tips
  function tendril(ink, a, dir, len, curl, w) {
    const pts = [a];
    let ang = Math.atan2(dir[1], dir[0]), p = a;
    for (let i = 0; i < 7; i++) { const s = len / 7; ang += curl * (i / 6) * 0.55; p = add(p, [Math.cos(ang) * s, Math.sin(ang) * s]); pts.push(p); }
    ink.form(tube(pts, (t) => w * (1 - t * 0.8), 4), { w: 1.5 });
  }
  function petal(c, ang, len, wid, sq) {
    const u = [Math.cos(ang), Math.sin(ang)], P = (a, b) => { const q = fr(c, u, a * len, b * wid); return [c[0] + (q[0] - c[0]) * sq, q[1]]; };
    return smooth([P(0.1, -0.3), P(0.55, -0.95), P(0.95, -0.7), P(1.05, -0.1), P(0.98, 0.1), P(1.0, 0.6), P(0.6, 0.95), P(0.1, 0.35)], 4, true);
  }

  CAST.push({
    id: 'briar', group: 'grapple', name: 'The Briar', kind: 'Grabber',
    look: 'A rose bush that walks like a broad-shouldered man: a body of woven thorny vines, one great red rose for a face and long vine arms.',
    does: [
      ['Vine Snare', 'Whips a vine arm out along the floor that wraps round the opponent\'s legs and pulls them off their feet.'],
      ['Thorn Burst', 'Bristles all over and fires thorns out in every direction.'],
      ['Vine Swing', 'Throws a vine up to the ledge and swings back onto the stage.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      // ---- joints -------------------------------------------------------------------
      const lean = A ? 0.32 : 0.1;
      const hip = A ? [0, -84] : [0, -92];
      const B = (x, y) => [hip[0] + x - lean * y, hip[1] + y];
      const head = B(32, -108), neck = B(20, -86);
      const shB = B(-54, -76), shF = B(54, -74);
      const elB = A ? add(shB, [-40, -14]) : add(shB, [-14, 44]);
      const haB = A ? add(shB, [-64, -44]) : add(shB, [-10, 92]);
      const elF = A ? add(shF, [44, 40]) : add(shF, [20, 46]);
      const haF = A ? add(shF, [98, 96]) : add(shF, [22, 96]);
      const kneeB = A ? [-34, -40] : [-26, -48], footB = A ? [-58, 0] : [-28, 0];
      const kneeF = A ? [56, -50] : [30, -50], footF = A ? [62, 0] : [30, 0];

      // ---- back arm (behind everything, in shadow) ------------------------------------
      vineLimb(ink, [shB, mix(shB, elB, 0.5), elB, haB], 11, 5, 11, { shade: true, gap: 22, thorn: 13 });
      const uB = unit(elB, haB);
      for (const [a, c, l] of [[-0.7, 1.4, 22], [-0.2, 1.6, 26], [0.3, 1.8, 24], [0.8, 2.1, 18]]) tendril(ink, haB, fr([0, 0], uB, 1, a), l, A ? -c : c, 3);

      // ---- legs: twisted vine trunks on splayed roots --------------------------------
      for (const [kn, ft, back, sd] of [[kneeB, footB, true, 21], [kneeF, footF, false, 23]]) {
        const an = add(ft, [0, -10]);
        // roots gripping the floor
        for (const [dx, up, w] of [[26, 2, 4], [16, 0, 3], [-18, 1, 3.4], [-8, -1, 2.4]]) {
          ink.form(tube([add(an, [dx * 0.15, 4]), add(ft, [dx * 0.5, -3 - up]), add(ft, [dx, -1]), add(ft, [dx * 1.2, 0])], (t) => w * (1 - t * 0.85), 4), { w: 1.6 });
        }
        vineLimb(ink, [add(hip, [back ? -14 : 14, 0]), kn, an], 13, 8, sd, { shade: back, gap: 24, thorn: 14, wind: 5, w: 2.6 });
      }

      // ---- torso: a broad chest of woven vines --------------------------------------
      const torsoP = [B(-24, 6), B(-28, -18), B(-40, -46), B(-58, -66), B(-64, -84), B(-48, -100), B(-16, -98), B(16, -102), B(48, -98), B(68, -84), B(62, -62), B(42, -38), B(30, -14), B(26, 6), B(0, 10)];
      const torso = thorny(smooth(torsoP, 5, true), 24, 14, 41);
      ink.form(torso, { w: 3.0 });
      ink.hatch(smooth(torsoP, 4, true), { angle: 1.15, gap: ink.mode === 'mass' ? 3.2 : 4.6, w: 1.1 });
      // strands braided across the chest, each one a vine
      const strand = (pts, w, sd) => {
        const t = tube(pts, (x) => w * (0.75 + 0.5 * Math.sin(Math.PI * x)), 6);
        ink.form(thorny(t, 30, 7, sd), { w: 1.9 });
        return t;
      };
      const S = [
        [[B(-60, -80), B(-30, -66), B(4, -44), B(22, -8)], 5.5],
        [[B(62, -80), B(30, -64), B(-6, -40), B(-22, -4)], 6],
        [[B(-40, -98), B(-4, -84), B(34, -66), B(54, -54)], 4.8],
        [[B(-50, -52), B(-20, -32), B(8, -12), B(16, 6)], 4.6],
        [[B(40, -98), B(4, -86), B(-36, -72), B(-56, -62)], 4.6],
        [[B(40, -40), B(14, -24), B(-12, -6), B(-18, 6)], 4.2],
      ];
      const order = [3, 0, 5, 1, 2, 4];
      const tubes = [];
      order.forEach((i, j) => { tubes[i] = strand(S[i][0], S[i][1], 60 + i); });
      // shade on the strands of the back half
      ink.hatch(tubes[3], { angle: 1.1, gap: 4.2 }); ink.hatch(tubes[4], { angle: 1.1, gap: 4.2 });
      // the shoulders: a vine rolled over each one
      strand([B(-66, -64), B(-62, -88), B(-44, -100), B(-20, -96)], 6.5, 71);
      ink.cut(smooth([B(-60, -76), B(-52, -92), B(-36, -98)], 4), { w: 1.1 });

      // ---- leaves at the shoulders, like pauldrons -----------------------------------
      leaf(ink, add(shB, [6, -6]), unit([0, 0], [-0.85, -0.5]), 34, 13, { shade: true });
      leaf(ink, add(shB, [4, 2]), unit([0, 0], [-0.9, 0.2]), 26, 10, { shade: true });

      leaf(ink, add(shF, [6, -4]), unit([0, 0], [0.95, -0.3]), 30, 12);
      // ---- the rose: sepals, outer petals, the cup, the spiral heart -----------------
      const c = head, sq = 0.86, Z = 1.3;
      for (const [a, l0] of [[2.2, 30], [2.75, 26], [0.95, 26], [0.25, 24], [1.6, 22]]) {
        const l = l0 * Z;
        const u = [Math.cos(a), Math.sin(a)];
        ink.form(smooth([fr(c, u, 8, -5), fr(c, u, l * 0.7, -4), fr(c, u, l, 3), fr(c, u, l * 0.6, 4), fr(c, u, 8, 5)], 3, true), { w: 1.6 });
        ink.cut([fr(c, u, 10, 0), fr(c, u, l * 0.8, 1.5)], { w: 0.9 });
      }
      const back = [[-1.55, 24, 15], [-2.4, 23, 14], [-0.7, 23, 14], [3.0, 21, 13], [0.15, 21, 13]].map(([a, l, w]) => [a, l * Z, w * Z]);
      back.forEach(([a, l, w]) => ink.form(petal(c, a, l, w, sq), { tint: 'red', w: 2 }));
      back.forEach(([a, l]) => { const u = [Math.cos(a), Math.sin(a)]; ink.cut(smooth([fr(c, u, l * 0.55, -5), fr(c, u, l * 0.8, 0), fr(c, u, l * 0.62, 6)], 3).map((p) => [c[0] + (p[0] - c[0]) * sq, p[1]]), { tint: 'red', w: 1.1 }); });
      const mid = [[-1.1, 17, 12], [-2.0, 16, 11], [-0.2, 16, 11]].map(([a, l, w]) => [a, l * Z, w * Z]);
      mid.forEach(([a, l, w]) => ink.form(petal(add(c, [0, 2]), a, l, w, sq), { tint: 'red', w: 1.8 }));
      // the cup: the front petals wrapped round the heart, lip rolled back
      const C = (x, y) => [c[0] + x * sq * Z, c[1] + y * Z];
      ink.form(smooth([C(-19, -2), C(-12, -7), C(-4, -3), C(4, -8), C(13, -4), C(20, -6), C(19, 8), C(8, 18), C(-6, 18), C(-17, 10)], 5, true), { tint: 'red', w: 2.2 });
      ink.cut(smooth([C(-16, 0), C(-8, -2), C(-3, 1)], 3), { tint: 'red', w: 1.2 });
      ink.cut(smooth([C(5, -3), C(12, -1), C(17, -2)], 3), { tint: 'red', w: 1.2 });
      ink.cut(smooth([C(-14, 4), C(-8, 13), C(2, 15), C(12, 10)], 5), { tint: 'red', w: 1.1 });
      ink.cut(smooth([C(0, -1), C(-1, 8), C(3, 15)], 3), { tint: 'red', w: 1.1 });
      // the heart: a tight spiral of petals
      const sp = [];
      for (let i = 0; i <= 26; i++) { const t = (i / 26) * Math.PI * 3.1, r = 1.5 + t * 1.7; sp.push(C(Math.cos(t - 1) * r, -10 + Math.sin(t - 1) * r * 0.72)); }
      ink.form(smooth([C(-11, -10), C(-8, -17), C(0, -20), C(9, -16), C(12, -8), C(4, -4), C(-6, -4)], 4, true), { tint: 'red', w: 1.8 });
      ink.cut(sp, { tint: 'red', w: 1.2, taper: 0.6 });

      // ---- front arm and the hand of tendrils -----------------------------------------
      if (!A) {
        const p = vineLimb(ink, [shF, add(mix(shF, elF, 0.5), [4, 0]), elF, haF], 12, 5.5, 31, { gap: 22, thorn: 13 });
        leaf(ink, p[Math.floor(p.length * 0.4)], unit([0, 0], [1, 0.25]), 22, 8.5);
        const uF = unit(elF, haF);
        for (const [a, cu, l] of [[-0.8, -1.6, 26], [-0.25, -1.4, 30], [0.25, -1.7, 28], [0.75, -2.0, 22]]) tendril(ink, haF, fr([0, 0], uF, 1, a), l, cu, 3.4);
      } else {
        // the snare: the arm whips down and out along the floor, then winds round the legs
        const k = [310, 0];
        const out = [shF, elF, haF, [178, -14], [236, -8], [282, -10], [k[0] - 10, -16]];
        for (let i = 0; i < 3; i++) ink.line(smooth([[146 + i * 8, -60 + i * 12], [196, -34 + i * 8], [256, -26 + i * 6]], 5), { tint: 'red', w: 1.5 - i * 0.3, taper: 0.9 });
        const p = vineLimb(ink, out, 12, 4.5, 31, { gap: 22, thorn: 13, wind: 7 });
        leaf(ink, p[Math.floor(p.length * 0.25)], unit([0, 0], [0.6, -0.8]), 22, 8.5);
        leaf(ink, p[Math.floor(p.length * 0.62)], unit([0, 0], [0.3, -1]), 18, 7);
        const coil = [];
        for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2 * 2.2; coil.push([k[0] - Math.sin(t) * 18, -16 - (t / (Math.PI * 2)) * 18 + Math.cos(t) * 5]); }
        [[0, 10], [9, 19], [18, 28], [27, 37], [36, 40]].forEach(([a, b], j) => {
          const seg = coil.slice(a, b + 1);
          ink.form(thorny(tube(seg, (t) => 4.6 - (j + t) * 0.4, 3), 16, 5, 50 + j), { w: 1.9 });
          if (j % 2 === 0) ink.hatch(tube(seg, (t) => 4.4 - (j + t) * 0.45, 3), { angle: 0.4, gap: 3.4 });
        });
        const tip = coil[coil.length - 1];
        tendril(ink, tip, [0.6, -0.8], 18, 2.2, 2.2);
      }
    },
  });
})();
