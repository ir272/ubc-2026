// The Mimic: an iron-bound treasure chest on short clawed legs, teeth round the lid, a very long tongue.
(function () {
  const { smooth, ell, mix } = Ink;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const fr = (o, u, a, b) => [o[0] + u[0] * a - u[1] * b, o[1] + u[1] * a + u[0] * b];
  const rot = (p, c, a) => { const x = p[0] - c[0], y = p[1] - c[1], cs = Math.cos(a), sn = Math.sin(a); return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]; };
  function tube(ctrl, wf, per = 6) {
    const p = smooth(ctrl, per), n = p.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], u = unit(a, b), w = wf(i / (n - 1));
      L.push([p[i][0] - u[1] * w, p[i][1] + u[0] * w]); R.push([p[i][0] + u[1] * w, p[i][1] - u[0] * w]);
    }
    return L.concat(R.reverse());
  }
  // convex hull, for a box seen with its depth
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // a row of teeth along a rim from a to b, pointing to side n (+1/-1), sizes from the list
  function teeth(ink, a, b, side, sizes, o = {}) {
    const u = unit(a, b), n = sizes.length, step = Math.hypot(b[0] - a[0], b[1] - a[1]) / n;
    for (let i = 0; i < n; i++) {
      const s = sizes[i], c = mix(a, b, (i + 0.5) / n), hw = Math.min(step * 0.55, 2.2 + s * 0.28);
      const hook = o.hook ?? 0.18;
      ink.form(smooth([fr(c, u, -hw, side * 2), fr(c, u, -hw * 0.7, -side * s * 0.55), fr(c, u, s * hook, -side * s), fr(c, u, hw * 0.75, -side * s * 0.45), fr(c, u, hw, side * 2)], 3, true), { w: 1.3 });
    }
  }
  // a short scaly leg: hip, knee, foot with three hooked claws
  function leg(ink, hp, kn, ft, dir, shade) {
    const thigh = tube([hp, kn], (t) => 9.5 - t * 3, 3), shin = tube([kn, mix(kn, ft, 0.5), add(ft, [0, -5])], (t) => 6.2 - t * 1.8, 3);
    ink.form(shin, { w: 2.2 });
    if (shade) ink.hatch(shin, { angle: 1.0, gap: 4 });
    // the toes and their claws
    for (const [dx, up] of [[15, 5], [10, 2], [-9, 3]]) {
      const t0 = add(ft, [dir * dx * 0.2, -5]), t1 = add(ft, [dir * dx * 0.75, -4 - up * 0.6]), tip = add(ft, [dir * dx * 1.15, 0.5]);
      ink.form(tube([t0, t1, tip], (t) => 3.2 - t * 2.9, 4), { w: 1.4 });
    }
    ink.form(ell(ft[0], ft[1] - 5, 6.5, 4.5, 0, 14), { w: 1.8 });
    ink.form(thigh, { w: 2.4 });
    if (shade) ink.hatch(thigh, { angle: 1.0, gap: 4 });
    const u = unit(kn, ft);
    for (let i = 0; i < 2; i++) { const c = mix(kn, ft, 0.25 + i * 0.25); ink.cut(smooth([fr(c, u, -1, -4), fr(c, u, 2, 0), fr(c, u, -1, 4)], 3), { w: 1 }); }
    ink.cut(smooth([fr(kn, unit(hp, kn), -6, -4), fr(kn, unit(hp, kn), -2, 0), fr(kn, unit(hp, kn), -6, 4)], 3), { w: 1 });
  }

  CAST.push({
    id: 'mimic', group: 'grapple', name: 'The Mimic', kind: 'Grabber',
    look: 'An iron-bound treasure chest that walks on four short clawed legs, with teeth round the lid, an eye in the wood and a tongue far too long for it.',
    does: [
      ['Tongue Lash', 'The tongue shoots out across the stage, wraps round the opponent and drags them back to the teeth.'],
      ['Swallow and Spit', 'Shuts the lid on a caught opponent, chews, then spits them out hard.'],
      ['Coin Burst', 'Jumps high on a burst of coins blown out from underneath.'],
    ],
    draw(ink, pose) {
      const A = pose === 'ability';
      // ---- joints -------------------------------------------------------------------
      const tilt = A ? 0.1 : 0;                 // the whole chest pitching forward
      const pivot = [40, -30];
      const T = (p) => rot(p, pivot, tilt);
      const open = A ? 1.2 : 0.4;               // the lid, radians open
      const D = [20, -12];                      // depth: the far end of the chest
      const x0 = -48, x1 = 44, yb = -30, yr = -78; // the near end: back, front, bottom, rim
      const hinge = [x0, yr];
      const hipsN = [[-30, yb + 2], [26, yb + 2]], hipsF = [[-30 + D[0] * 0.8, yb - 6], [26 + D[0] * 0.8, yb - 6]];
      const feetN = A ? [[-44, 0], [44, 0]] : [[-38, 0], [40, 0]];
      const feetF = A ? [[-20, 0], [66, 0]] : [[-16, 0], [62, 0]];
      const kneesN = A ? [[-50, -18], [50, -20]] : [[-46, -18], [44, -20]];
      const kneesF = A ? [[-28, -20], [70, -22]] : [[-24, -20], [64, -22]];
      const L = (p) => T(rot(p, hinge, -open)); // lid space (closed position) to screen
      const mouth = L([x0 + 70, yr + 2]);

      // ---- far legs (in shadow) -----------------------------------------------------
      for (let i = 0; i < 2; i++) leg(ink, T(hipsF[i]), kneesF[i], feetF[i], i ? 1 : -1, true);

      // ---- the box --------------------------------------------------------------------
      const near = [[x0, yb], [x1, yb], [x1 + 1, yr], [x0 - 1, yr]].map(T);
      const far = near.map((p) => add(p, D));
      ink.form(hull(near.concat(far)), { w: 2.8 });
      // front face: shade and planks running back
      const frontFace = [near[1], far[1], far[2], near[2]];
      ink.hatch(frontFace, { angle: 1.35, gap: 4.4 });
      ink.cut([mix(near[1], near[2], 0.36), mix(far[1], far[2], 0.36)], { w: 1.2 });
      ink.cut([mix(near[1], near[2], 0.68), mix(far[1], far[2], 0.68)], { w: 1.2 });
      // the open top: a dark mouth
      const top = [near[3], near[2], far[2], far[3]];
      ink.mask(top);
      ink.form(near, { w: 3.0 });
      // planks with grain on the near end
      const NP = (u, v) => { const a = mix(near[0], near[1], u), b = mix(near[3], near[2], u); return mix(a, b, v); };
      ink.cut([NP(0.02, 0.35), NP(0.98, 0.35)], { w: 1.4, taper: 0.2 });
      ink.cut([NP(0.02, 0.68), NP(0.98, 0.68)], { w: 1.4, taper: 0.2 });
      ink.cut(smooth([NP(0.08, 0.18), NP(0.3, 0.14), NP(0.45, 0.2), NP(0.62, 0.15)], 5), { w: 1 });
      ink.cut(smooth([NP(0.55, 0.52), NP(0.7, 0.47), NP(0.9, 0.52)], 5), { w: 1 });
      ink.cut(smooth([NP(0.1, 0.84), NP(0.28, 0.8), NP(0.4, 0.86)], 4), { w: 1 });
      const knot = NP(0.22, 0.52);
      ink.cut(ell(knot[0], knot[1], 4.5, 2.4, 0.1, 12), { closed: true, w: 1 });
      ink.cut(smooth([NP(0.06, 0.46), NP(0.2, 0.43), NP(0.36, 0.5)], 4), { w: 0.9 });
      // iron band down the middle and gold corner brackets with rivets
      const band = [NP(0.44, 0), NP(0.56, 0), NP(0.56, 1), NP(0.44, 1)];
      ink.form(band, { w: 1.8 });
      for (const v of [0.18, 0.5, 0.84]) { const r = NP(0.5, v); ink.dot(r[0], r[1], 1.5); }
      for (const [u, v, su, sv] of [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]]) {
        const br = [NP(u, v), NP(u + su * 0.2, v), NP(u + su * 0.2, v + sv * 0.12), NP(u + su * 0.07, v + sv * 0.12), NP(u + su * 0.07, v + sv * 0.4), NP(u, v + sv * 0.4)];
        ink.form(br, { tint: 'gold', w: 1.6 });
        const r = NP(u + su * 0.04, v + sv * 0.06); ink.dot(r[0], r[1], 1.3);
      }
      // coins lying in the mouth, behind the teeth
      for (const [u, k] of [[0.3, 0], [0.55, 1], [0.78, 2]]) {
        const c = add(mix(near[3], near[2], u), [D[0] * 0.5, D[1] * 0.5 + 1]);
        ink.form(ell(c[0], c[1], 5.5, 2.2, -0.15 + k * 0.1, 14), { tint: 'gold', w: 1.3 });
      }
      // lower teeth along the near rim and round the front rim
      teeth(ink, add(near[3], [4, 0]), add(near[2], [-2, 0]), 1, [6, 8, 6, 9, 7, 8, 11, 7, 13]);
      teeth(ink, add(near[2], [1, -1]), add(far[2], [-2, 1]), 1, [12, 8, 7]);

      // ---- the tongue -------------------------------------------------------------------
      if (!A) {
        const tg = tube([add(near[2], [-14, -4]), add(near[2], [8, -6]), add(near[2], [22, 2]), add(near[2], [28, 20]), add(near[2], [28, 40]), add(near[2], [36, 48]), add(near[2], [42, 42])], (t) => 8 - t * 4, 7);
        ink.form(tg, { w: 2.4 });
        ink.cut(smooth([add(near[2], [6, -4]), add(near[2], [20, 4]), add(near[2], [26, 22])], 5), { w: 1.1 });
        ink.hatch(smooth([add(near[2], [26, 8]), add(near[2], [40, 10]), add(near[2], [40, 44]), add(near[2], [16, 44])], 3, true), { angle: 0.5, gap: 3.6 });
      } else {
        // lashed out across the floor, wrapped twice round its catch
        const c = [314, -78];
        const m0 = add(near[2], [-16, -4]);
        const reach = [m0, add(near[2], [14, -14]), [140, -96], [220, -88], [282, -86], [c[0] - 4, c[1] - 20]];
        for (let i = 0; i < 3; i++) ink.line(smooth([[120 + i * 10, -118 + i * 4], [190, -116 + i * 3], [250, -106 + i * 2]], 5), { tint: 'gold', w: 1.5 - i * 0.3, taper: 0.9 });
        for (let i = 0; i < 2; i++) ink.line(smooth([[150 + i * 14, -72 - i * 3], [216, -66 - i * 2], [262, -68]], 5), { tint: 'gold', w: 1.2, taper: 0.9 });
        ink.form(tube(reach, (t) => 8 - t * 3, 8), { w: 2.4 });
        ink.cut(smooth([add(near[2], [14, -14]), [140, -96], [220, -88], [276, -86]], 6), { w: 1.1 });
        // the wrap: loops drawn in order so each passes over the last
        const coil = [];
        for (let i = 0; i <= 44; i++) { const t = (i / 44) * Math.PI * 2 * 2.3; coil.push([c[0] - Math.sin(t) * 22, c[1] - 22 + (t / (Math.PI * 2)) * 18 + Math.cos(t) * 6]); }
        const pieces = [[0, 10], [9, 20], [19, 29], [28, 38], [37, 44]];
        pieces.forEach(([a, b], k) => {
          const seg = coil.slice(a, b + 1);
          ink.form(tube(seg, (t) => 5.2 - (k + t) * 0.4, 3), { w: 2 });
          if (k % 2 === 1) ink.hatch(tube(seg, (t) => 5.2 - (k + t) * 0.4, 3), { angle: 0.4, gap: 3.4 });
        });
        const tip = coil[coil.length - 1];
        ink.form(tube([tip, add(tip, [10, 6]), add(tip, [14, -2]), add(tip, [8, -6])], (t) => 3.2 - t * 2, 4), { w: 1.5 });
      }

      // ---- the lid --------------------------------------------------------------------
      const lidP = [[0, 0], [96, 0], [97, -9], [90, -19], [72, -26], [48, -29], [24, -26], [6, -19], [-1, -9]].map((p) => [p[0] + x0, p[1] + yr]);
      const lidN = smooth(lidP, 3, true).map(L);
      const lidF = lidN.map((p) => add(p, D));
      ink.form(hull(lidN.concat(lidF)), { w: 2.8 });
      // the top boards running back, shaded where the barrel turns away
      const LP = (u, v) => L([x0 + u * 96, yr + v]);
      for (const v of [-21, -28]) ink.cut([add(LP(v === -21 ? 0.82 : 0.5, v), [2, -1]), add(LP(v === -21 ? 0.82 : 0.5, v), [D[0] - 2, D[1] + 1])], { w: 1.1 });
      // the inside of the lid, dark, seen through the open front
      ink.form(lidN, { w: 3.0 });
      ink.hatch(smooth([LP(0, -9), LP(0.06, -19), LP(0.25, -26), LP(0.25, -6), LP(0.05, -2)], 3, true), { angle: 1.1, gap: 4 });
      // lid planks
      ink.cut(smooth([LP(0.04, -10), LP(0.5, -12), LP(0.96, -10)], 5), { w: 1.3 });
      // the eye in the knot, wood grain swirling round it
      const eye = LP(0.7, -17), ue = unit(LP(0, 0), LP(1, 0));
      const lidW = A ? 6.5 : 4.6;
      ink.cut(smooth([fr(eye, ue, -14, -9), fr(eye, ue, -2, -12), fr(eye, ue, 10, -10), fr(eye, ue, 18, -4)], 5), { w: 1 });
      ink.cut(smooth([fr(eye, ue, -16, 6), fr(eye, ue, -4, 10), fr(eye, ue, 8, 9), fr(eye, ue, 16, 4)], 5), { w: 1 });
      const almond = smooth([fr(eye, ue, -9, 0), fr(eye, ue, 0, -lidW), fr(eye, ue, 9, 0), fr(eye, ue, 0, lidW)], 5, true);
      ink.mask(almond);
      ink.cut(almond, { closed: true, w: 1.4 });
      const pup = smooth([fr(eye, ue, 1.5, -lidW + 1), fr(eye, ue, 2.6, 0), fr(eye, ue, 1.5, lidW - 1), fr(eye, ue, 0.4, 0)], 3, true);
      ink.form(pup, { w: 0.8, tint: 'gold' });
      // band and gold brackets on the lid
      ink.form([LP(0.44, 0), LP(0.56, 0), LP(0.56, -29), LP(0.44, -29)].map((p) => p), { w: 1.8 });
      const r1 = LP(0.5, -6), r2 = LP(0.5, -20); ink.dot(r1[0], r1[1], 1.5); ink.dot(r2[0], r2[1], 1.5);
      ink.form([LP(0, 0), LP(0.17, 0), LP(0.17, -4), LP(0.06, -4), LP(0.05, -13), LP(-0.005, -11)], { tint: 'gold', w: 1.5 });
      ink.form([LP(1, 0), LP(0.83, 0), LP(0.83, -4), LP(0.94, -4), LP(0.95, -13), LP(1.005, -11)], { tint: 'gold', w: 1.5 });
      // the hasp hanging from the front edge of the lid
      const hp = add(LP(1, 0), [D[0] * 0.5, D[1] * 0.5]), uh = unit(LP(1, -10), LP(1, 0));
      ink.form(smooth([fr(hp, uh, -6, -5), fr(hp, uh, -6, 5), fr(hp, uh, 9, 5), fr(hp, uh, 13, 0), fr(hp, uh, 9, -5)], 3, true), { tint: 'gold', w: 1.6 });
      const kh = fr(hp, uh, 4, 0); ink.dot(kh[0], kh[1], 1.6);
      // upper teeth down the lid's rim
      teeth(ink, LP(0.08, 0), LP(0.98, 0), -1, [7, 9, 7, 10, 8, 12, 9, 15], { hook: -0.15 });
      teeth(ink, add(LP(1, 0), [1, 0]), add(LP(1, 0), [D[0] - 2, D[1] + 1]), -1, [12, 9, 10]);

      // ---- near legs ------------------------------------------------------------------
      for (let i = 0; i < 2; i++) leg(ink, T(hipsN[i]), kneesN[i], feetN[i], i ? 1 : -1, false);
    },
  });
})();
