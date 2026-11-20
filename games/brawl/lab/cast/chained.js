// The Chained: a hunched penitent brute in a sack hood, bound in chains that trail from both wrists.
(function () {
  const { smooth, ell, limb, mix } = Ink;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  // a point in a frame at o with axis u: a along u, b across (u turned a quarter clockwise on screen)
  const fr = (o, u, a, b) => [o[0] + u[0] * a - u[1] * b, o[1] + u[1] * a + u[0] * b];

  // points spaced evenly along a polyline
  function spaced(pts, step) {
    const out = [pts[0]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let s = step - carry;
      while (s <= d) { out.push(mix(a, b, s / d)); s += step; }
      carry = d - (s - step);
    }
    return out;
  }
  // a tube along a curve, half-width from wf(t)
  function tube(ctrl, wf, per = 6) {
    const p = smooth(ctrl, per), n = p.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], u = unit(a, b), w = wf(i / (n - 1));
      L.push([p[i][0] - u[1] * w, p[i][1] + u[0] * w]); R.push([p[i][0] + u[1] * w, p[i][1] - u[0] * w]);
    }
    return L.concat(R.reverse());
  }
  // a chain of real links along a curve: edge-on links first, face-on links over them
  function chain(ink, ctrl, o = {}) {
    const pitch = o.pitch ?? 10, k = pitch / 10;
    const pts = spaced(smooth(ctrl, 12), pitch);
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1], i]);
    for (const [a, b, i] of segs) {
      if (i % 2 === 0) continue;
      const c = mix(a, b, 0.5), u = unit(a, b);
      ink.form(limb(fr(c, u, -6.6 * k, 0), fr(c, u, 6.6 * k, 0), 2.3 * k, 2.3 * k), { w: 1.5 * k });
    }
    for (const [a, b, i] of segs) {
      if (i % 2 === 1) continue;
      const c = mix(a, b, 0.5), r = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ink.form(ell(c[0], c[1], 7.6 * k, 4.8 * k, r, 18), { w: 1.7 * k });
      const hole = ell(c[0], c[1], 4.4 * k, 1.7 * k, r, 14);
      ink.mask(hole);
      ink.cut(hole, { closed: true, w: 1.05 * k, taper: 0 });
    }
    return pts;
  }
  // a big closed fist hanging from the wrist w, knuckles along u
  function fist(ink, w, u, s) {
    const P = (a, b) => fr(w, u, a * s, b * s);
    ink.form(smooth([P(-0.1, -0.78), P(0.1, 0.8), P(0.75, 1.0), P(1.2, 0.82), P(1.5, 0.35), P(1.48, -0.3), P(1.25, -0.82), P(0.75, -1.0), P(0.3, -0.95)], 5, true), { w: 2.4 });
    // knuckle ridge and the folded fingers
    ink.cut(smooth([P(0.95, 0.9), P(1.12, 0.3), P(1.1, -0.35), P(0.98, -0.8)], 5), { w: 1.4 });
    ink.cut([P(1.14, 0.3), P(1.46, 0.22)], { w: 1.2 });
    ink.cut([P(1.12, -0.12), P(1.48, -0.16)], { w: 1.2 });
    ink.cut([P(1.08, -0.5), P(1.38, -0.6)], { w: 1.2 });
    // thumb laid across the front
    ink.form(smooth([P(0.25, -0.7), P(0.65, -1.2), P(1.05, -1.18), P(1.18, -0.9), P(0.85, -0.72)], 4, true), { w: 1.6 });
    ink.cut([P(0.9, -1.12), P(1.08, -0.98)], { w: 1 });
  }
  // an open hand flung forward after the throw, fingers spread
  function openHand(ink, w, u, s) {
    const P = (a, b) => fr(w, u, a * s, b * s);
    const fingers = [[-0.55, -0.95, -0.95], [-0.2, -0.45, -0.2], [0.15, 0.1, 0.35], [0.5, 0.65, 0.8]];
    fingers.forEach(([b0, b1, b2], i) => {
      const L = i === 3 ? 1.55 : 1.85;
      ink.form(tube([P(0.9, b0), P(1.4, b1), P(1.4 + L * 0.45, b2 + 0.15), P(1.25 + L * 0.6, b2 + 0.55)], (t) => s * (0.24 - t * 0.09), 4), { w: 1.5 });
    });
    ink.form(smooth([P(-0.1, -0.75), P(0.15, 0.8), P(0.95, 0.85), P(1.15, 0.0), P(0.95, -0.85)], 5, true), { w: 2.2 });
    ink.cut(smooth([P(0.3, 0.45), P(0.7, 0.05), P(0.8, -0.5)], 4), { w: 1.1 });
    ink.form(tube([P(0.35, -0.8), P(0.75, -1.25), P(1.15, -1.55)], (t) => s * (0.28 - t * 0.1), 4), { w: 1.5 });
  }
  // a bare foot, heel at the ankle's back, toes forward
  function foot(ink, f, s = 1) {
    const [x, y] = f;
    ink.form(smooth([[x - 12 * s, y - 14], [x + 4 * s, y - 15], [x + 10 * s, y - 8], [x + 22 * s, y - 6], [x + 27 * s, y - 2], [x + 25 * s, y], [x - 14 * s, y], [x - 15 * s, y - 6]], 4, true), { w: 2.3 });
    for (const t of [14, 18.5, 23]) ink.cut([[x + t * s, y - 7 + (t - 14) * 0.45], [x + (t + 1.5) * s, y - 0.5]], { w: 1.1 });
    ink.cut([[x - 9 * s, y - 2.5], [x + 10 * s, y - 2.5]], { w: 1, taper: 0.9 });
  }

  CAST.push({
    id: 'chained', group: 'grapple', name: 'The Chained', kind: 'Grabber',
    look: 'A hunched penitent with huge bare shoulders and a sack over his head, bound in chains that drag from both wrists.',
    does: [
      ['Chain Throw', 'Throws a wrist chain that wraps the opponent from across the stage and yanks them in.'],
      ['Drag and Slam', 'Swings the caught opponent up over his head and down into the floor.'],
      ['Chain Climb', 'Throws a chain onto the stage edge and hauls himself back up.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      // ---- joints -------------------------------------------------------------------
      const lean = A ? 0.24 : 0.07;
      const hip = A ? [4, -84] : [0, -90];
      const B = (x, y) => [hip[0] + x - lean * y, hip[1] + y]; // the torso, sheared by the lean
      const head = B(46, -88), neck = B(34, -76);
      const shB = B(-40, -70), shF = B(20, -56);
      const elB = A ? add(shB, [-30, 30]) : add(shB, [-16, 46]);
      const haB = A ? add(shB, [-20, 70]) : add(shB, [-10, 88]);
      const elF = A ? add(shF, [40, -6]) : add(shF, [16, 46]);
      const haF = A ? add(shF, [80, -16]) : add(shF, [22, 88]);
      const kneeB = A ? [-34, -44] : [-30, -47], footB = A ? [-62, 0] : [-30, 0];
      const kneeF = A ? [62, -48] : [36, -49], footF = A ? [70, 0] : [34, 0];
      const ankB = add(footB, [-3, -12]), ankF = add(footF, [-3, -12]);
      const uB = unit(elB, haB), uF = unit(elF, haF);

      // ---- the back wrist's chain, trailing behind on the floor ---------------------
      const tailB = A
        ? [add(haB, [-6, 8]), [-62, -34], [-78, -6], [-104, -3], [-130, -3], [-152, -6]]
        : [add(haB, [-8, 6]), [-72, -36], [-78, -6], [-96, -3], [-114, -3], [-126, -8]];
      chain(ink, tailB, { pitch: 9.5 });

      // ---- back arm (in shadow) -----------------------------------------------------
      const fore = (sh, el, ha) => tube([el, mix(el, ha, 0.3), ha], (t) => 13 + 3.5 * Math.sin(Math.PI * Math.min(1, t * 1.6)) - t * 3.5, 5);
      const upper = (sh, el) => tube([sh, mix(sh, el, 0.5), el], (t) => 15 + 2 * Math.sin(Math.PI * t) - t * 3, 5);
      const foreB = fore(shB, elB, haB), upB = upper(shB, elB);
      ink.form(foreB); ink.hatch(foreB, { angle: 1.1, gap: 5.5 });
      ink.form(upB); ink.hatch(upB, { angle: 1.1, gap: 5.5 });
      fist(ink, add(haB, mix([0, 0], uB, 4)), uB, 13);
      ink.form(tube([add(haB, mix([0, 0], uB, -6)), add(haB, mix([0, 0], uB, 4))], () => 13.5, 3), { w: 2.2 });
      ink.cut([fr(haB, uB, -1, -12), fr(haB, uB, -1, 12)], { w: 1.2, taper: 0.2 });

      // ---- legs: wrapped shins, bare feet -------------------------------------------
      for (const [kn, an, ft, back] of [[kneeB, ankB, footB, true], [kneeF, ankF, footF, false]]) {
        const thigh = tube([add(hip, [back ? -14 : 12, 0]), kn], (t) => 17 - t * 5, 5);
        const shin = tube([kn, mix(kn, an, 0.4), an], (t) => 12.5 + 2.5 * Math.sin(Math.PI * Math.min(1, t * 1.5)) - t * 5, 5);
        ink.form(shin);
        if (back) ink.hatch(shin, { angle: 1.0, gap: 5.5 });
        // the wrapping: rag strips wound round the shin
        const u = unit(kn, an);
        for (let i = 0; i < 4; i++) {
          const c = mix(kn, an, 0.3 + i * 0.17);
          ink.cut([fr(c, u, -3, -11), fr(c, u, 3, 11)], { w: 1.3, taper: 0.3 });
        }
        foot(ink, ft);
        ink.form(thigh);
        if (back) ink.hatch(thigh, { angle: 1.0, gap: 5.5 });
        ink.cut(smooth([fr(kn, unit(hip, kn), -6, -8), fr(kn, unit(hip, kn), 2, -2), fr(kn, unit(hip, kn), 4, 7)], 4), { w: 1.2 });
      }

      // ---- the sackcloth skirt, torn at the hem -------------------------------------
      const hemB = [kneeB[0] - 10, -54], hemF = [kneeF[0] + 6, -58];
      const hem = [];
      const jag = [0, 9, 1, 12, -1, 7, 2, 13, 0, 8, -2];
      for (let i = 0; i < jag.length; i++) {
        const p = mix(hemF, hemB, i / (jag.length - 1));
        hem.push([p[0] + (i % 2 ? 2 : -1), p[1] + jag[i] * 0.9 - 4]);
      }
      const skirt = [B(-36, -8), B(-28, 0), ...[B(34, 0)], B(36, -8), [hemF[0] + 2, hemF[1] - 8], ...hem, [hemB[0] - 3, hemB[1] - 10]];
      ink.form(smooth(skirt, 3, true));
      ink.hatch(smooth([B(-36, -6), B(-12, 0), [hemB[0] + 22, -48], [hemB[0] - 2, -50]], 4, true), { angle: 1.2, gap: 4 });
      for (const [x0, x1] of [[-14, -22], [4, 2], [20, 26]]) ink.cut(smooth([B(x0, 4), add(B(x0, 4), [(x1 - x0) * 0.4, 18]), [hip[0] + x1 + lean * 40, -56]], 4), { w: 1.2 });

      // ---- torso: the hunched hump of a back, chest pushed forward ------------------
      const torso = smooth([B(38, -72), B(52, -56), B(50, -38), B(40, -20), B(32, -6), B(30, 2), B(-28, 2), B(-34, -16), B(-50, -44), B(-58, -70), B(-50, -92), B(-28, -106), B(2, -104), B(26, -90)], 5, true);
      ink.form(torso, { w: 3.0 });
      // shade on the back
      ink.hatch(smooth([B(-28, 0), B(-34, -16), B(-52, -44), B(-58, -70), B(-50, -92), B(-34, -102), B(-34, -74), B(-30, -46), B(-18, -18)], 4, true), { angle: 1.15, gap: 5.5 });
      // muscle: the pec, the ribs, the spine, the shoulder blade
      ink.cut(smooth([B(30, -58), B(40, -44), B(50, -44)], 5), { w: 1.6 });
      ink.cut(smooth([B(36, -34), B(30, -28), B(38, -22)], 4), { w: 1.2 });
      ink.cut(smooth([B(32, -22), B(26, -16), B(33, -10)], 4), { w: 1.1 });
      ink.cut(smooth([B(14, -40), B(18, -30), B(14, -20)], 4), { w: 1.1 });
      ink.cut(smooth([B(-10, -100), B(-28, -66), B(-34, -30), B(-24, -6)], 6), { w: 1.5 });
      ink.cut(smooth([B(-20, -80), B(-40, -66), B(-46, -46)], 5), { w: 1.3 });
      ink.cut(smooth([B(-2, -100), B(14, -84), B(22, -74)], 4), { w: 1.3 });

      // ---- the sash (tint), knotted at the hip, tails flying back -------------------
      const sashTop = [B(-32, -4), B(-8, -8), B(16, -6), B(36, -10)], sashBot = [B(37, 4), B(16, 6), B(-8, 4), B(-31, 8)];
      const tailA = A ? [[-30, -82], [-56, -78], [-80, -66], [-96, -64], [-82, -74], [-58, -88]] : [[-26, -82], [-46, -70], [-60, -48], [-66, -38], [-56, -50], [-42, -72]];
      ink.form(smooth(tailA.map((p, i) => add(p, [hip[0] + (i > 2 ? -4 : 0), hip[1] + 90])), 4, true), { tint: 'blue', w: 2 });
      const tailB2 = A ? [[-28, -86], [-60, -92], [-90, -88], [-102, -94], [-84, -98], [-56, -98]] : [[-24, -86], [-44, -84], [-62, -66], [-74, -60], [-64, -74], [-44, -92]];
      ink.form(smooth(tailB2.map((p) => add(p, [hip[0], hip[1] + 90])), 4, true), { tint: 'blue', w: 2 });
      const sash = smooth([...sashTop, ...sashBot], 4, true);
      ink.form(sash, { tint: 'blue', w: 2.2 });
      ink.hatch(sash, { tint: 'blue', angle: 0.3, gap: 3.4, w: 0.9 });
      ink.form(ell(B(-26, 2)[0], B(-26, 2)[1], 8, 7, 0.4, 16), { tint: 'blue', w: 2 });
      ink.cut(smooth([B(-30, -2), B(-25, 2), B(-22, 7)], 3), { tint: 'blue', w: 1.1 });

      // ---- a chain worn across the chest, from the far shoulder to the hip ---------
      chain(ink, [B(30, -84), B(36, -70), B(22, -46), B(2, -24), B(-20, -8), B(-30, 0)], { pitch: 8.6 });

      // ---- front arm ----------------------------------------------------------------
      const foreF = fore(shF, elF, haF), upF = upper(shF, elF);
      ink.form(foreF, { w: 2.8 });
      ink.cut(smooth([fr(elF, uF, 6, -6), fr(elF, uF, 20, -9), fr(elF, uF, 34, -6)], 4), { w: 1.3 });
      ink.cut(smooth([fr(elF, uF, 10, 8), fr(elF, uF, 22, 5)], 3), { w: 1.1 });
      // chain wound round the forearm
      for (let i = 0; i < 2; i++) {
        const c = fr(elF, uF, 18 + i * 9, 0);
        ink.cut(smooth([fr(c, uF, -4, -14), fr(c, uF, 0, 0), fr(c, uF, 4, 14)], 3), { w: 1.6, taper: 0.2 });
      }
      ink.form(upF, { w: 2.8 });
      ink.cut(smooth([fr(shF, unit(shF, elF), 12, 10), fr(shF, unit(shF, elF), 26, 12), fr(shF, unit(shF, elF), 38, 8)], 4), { w: 1.3 });
      // the deltoid, a boulder of a shoulder
      const ud = unit(shF, elF), D = (a, b) => fr(shF, ud, a, b);
      const delt = smooth([D(-10, 14), D(-14, 0), D(-8, -14), D(6, -18), D(18, -15), D(28, -6), D(24, 8), D(8, 15)], 5, true);
      ink.form(delt, { w: 2.8 });
      ink.cut(smooth([D(-2, -12), D(12, -6), D(24, -10)], 4), { w: 1.2 });
      // ---- the sack hood: slumped point flopping back, ragged cowl on the shoulders --
      const H = (x, y) => [head[0] + x, head[1] + y];
      const hood = smooth([H(19, -8), H(23, 4), H(18, 15), H(13, 19), H(20, 26), H(15, 34), H(2, 40), H(-12, 36), H(-30, 42), H(-40, 30), H(-30, 12), H(-28, -6), H(-36, -16), H(-52, -14), H(-42, -27), H(-20, -32), H(2, -28), H(14, -19)], 5, true);
      ink.form(hood, { w: 2.8 });
      ink.hatch(smooth([H(-40, 30), H(-30, 12), H(-28, -6), H(-36, -16), H(-52, -14), H(-42, -27), H(-26, -26), H(-18, -4), H(-16, 40)], 4, true), { angle: 1.25, gap: 4.6 });
      // the cowl's folds
      ink.cut(smooth([H(-6, 22), H(-4, 32), H(0, 42)], 3), { w: 1.2 });
      ink.cut(smooth([H(8, 24), H(10, 34), H(8, 42)], 3), { w: 1.1 });
      // the seam down the crown with its stitches
      const seam = smooth([H(8, -26), H(14, -14), H(17, -2)], 5);
      ink.cut(seam, { w: 1.2 });
      for (let i = 1; i < seam.length - 1; i += 3) ink.cut([add(seam[i], [-2.6, -1]), add(seam[i], [2.6, 1.2])], { w: 1, taper: 0 });
      // the rope tied round the neck, its end hanging
      ink.cut(smooth([H(-24, 16), H(-4, 20), H(16, 18)], 5), { w: 1.6 });
      ink.cut(smooth([H(-6, 15), H(-3, 22), H(-8, 25)], 3), { w: 1.2 });
      ink.line(smooth([H(18, 17), H(22, 26), H(19, 36)], 4), { w: 1.6, taper: 0.8 });
      // eye holes, cut ragged, a glint in each
      const eyeN = smooth([H(4, -2), H(9, -6), H(14, -2), H(13, 3), H(7, 4)], 4, true);
      const eyeF = smooth([H(17, -3), H(21, -5), H(22, 0), H(19, 3)], 4, true);
      ink.mask(eyeN); ink.cut(eyeN, { closed: true, w: 1.3 });
      ink.mask(eyeF); ink.cut(eyeF, { closed: true, w: 1.1 });
      const g1 = H(10, -1), g2 = H(20, -1);
      ink.dot(g1[0], g1[1], 1.5, { free: true }); ink.dot(g2[0], g2[1], 1.1, { free: true });
      // burlap weave on the lit side
      ink.cut([H(-6, 6), H(2, 10)], { w: 0.9 }); ink.cut([H(0, -14), H(8, -11)], { w: 0.9 }); ink.cut([H(-12, -20), H(-4, -18)], { w: 0.9 });

      // hand and manacle
      if (A) openHand(ink, add(haF, mix([0, 0], uF, 3)), uF, 12);
      else fist(ink, add(haF, mix([0, 0], uF, 4)), uF, 13.5);
      const cuff = tube([add(haF, mix([0, 0], uF, -7)), add(haF, mix([0, 0], uF, 4))], () => 14, 3);
      ink.form(cuff, { w: 2.4 });
      ink.cut([fr(haF, uF, -2.5, -13), fr(haF, uF, -2.5, 13)], { w: 1.2, taper: 0.2 });
      for (const b of [-8, 8]) { const r = fr(haF, uF, 1, b); ink.dot(r[0], r[1], 1.4); }

      // ---- the front chain ------------------------------------------------------------
      if (!A) {
        chain(ink, [fr(haF, uF, 0, -15), [92, -46], [96, -10], [106, -3], [124, -4], [118, -12]], { pitch: 9.5 });
      } else {
        // thrown: it leaves the cuff, arcs over and wraps three times round its catch
        const out = [fr(haF, uF, 0, -14), [178, -196], [228, -214], [272, -196], [300, -160]];
        const coil = [];
        for (let i = 0; i <= 40; i++) {
          const t = (i / 40) * Math.PI * 2 * 2.4;
          coil.push([306 + Math.sin(t) * 26, -150 + (t / (Math.PI * 2)) * 22 + Math.cos(t) * 6]);
        }
        // the swing that threw it
        for (let i = 0; i < 3; i++) ink.line(smooth([[150 + i * 6, -152 + i * 9], [196, -196 + i * 10], [250, -204 + i * 11], [286, -182 + i * 12]], 6), { tint: 'blue', w: 1.6 - i * 0.3, taper: 0.9 });
        chain(ink, out.concat(coil.slice(1)), { pitch: 9.5 });
        // the slack end dropping off the wrap
        const end = coil[coil.length - 1];
        chain(ink, [end, add(end, [10, 18]), add(end, [4, 34])], { pitch: 9 });
      }
    },
  });
})();
