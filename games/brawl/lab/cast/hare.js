// The Hare: a lean long-eared duelist with a rapier and a short cape, on long bent hare legs.
(function () {
  const { smooth, ell, limb, mix } = Ink;
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (a, b) => { const d = sub(b, a), l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  const nrm = (d) => [-d[1], d[0]];
  const fr = (o, d) => { const n = nrm(d); return (t, s) => [o[0] + d[0] * t + n[0] * s, o[1] + d[1] * t + n[1] * s]; };

  // a closed strip along a path: half-width w(t); notch = [t, depth] bites the upper edge
  function strip(path, w, notch) {
    const n = path.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), q = path[Math.min(n - 1, i + 1)], o = path[Math.max(0, i - 1)];
      const d = unit(o, q), nn = nrm(d);
      let wl = w(t);
      if (notch && Math.abs(t - notch[0]) < 0.035) wl -= notch[1];
      L.push(add(path[i], nn, wl)); R.push(add(path[i], nn, -w(t)));
    }
    return L.concat(R.reverse());
  }

  // a hare leg in puffed breeches: a full haunch, a garter, a thin furred shin back to the hock,
  // then the long foot to the toes
  function hareLeg(ink, hp, kn, hock, toe, sd, shade) {
    const L = Math.hypot(kn[0] - hp[0], kn[1] - hp[1]), P = fr(hp, unit(hp, kn));
    ink.form(limb(kn, hock, 5.2, 3.8), { seed: sd + 3 });
    ink.cut(smooth([mix(kn, hock, 0.3), add(mix(kn, hock, 0.45), [-4, 0]), mix(kn, hock, 0.55)], 3), { w: 1.1, seed: sd + 7 });
    const haunch = smooth([P(-8, -11), P(L * 0.3, -14), P(L * 0.75, -11), P(L + 2, -6), P(L + 3, 5), P(L * 0.7, 11), P(L * 0.25, 13), P(-8, 10)], 5, true);
    ink.form(haunch, { seed: sd, w: 2.6 });
    if (shade) ink.hatch(haunch, { angle: 1.0, gap: 3.4, seed: sd + 1 });
    ink.cut(smooth([P(2, -4), P(L * 0.5, -6), P(L - 4, -3)], 4), { w: 1.3, seed: sd + 2 });
    ink.cut(smooth([P(4, 5), P(L * 0.5, 6), P(L - 4, 4)], 4), { w: 1.3, seed: sd + 8 });
    ink.cut([P(L - 3, -8), P(L - 2, 8)], { w: 2, seed: sd + 9, taper: 0.2 });
    // the foot: heel tuft at the hock, long sole, toes
    const d = unit(hock, toe), F = fr(hock, d), FL = Math.hypot(toe[0] - hock[0], toe[1] - hock[1]);
    ink.form(smooth([F(-5, 3), F(-7, -3), F(-2, -5.5), F(FL * 0.5, -4.4), F(FL + 1, -4.6), F(FL + 6, -1), F(FL + 4, 3), F(FL * 0.4, 3.6)], 4, true), { w: 2.2, seed: sd + 4 });
    ink.cut([F(FL - 2, -4), F(FL + 1, 2)], { w: 1.1, seed: sd + 5 });
    ink.cut([F(FL - 7, -4), F(FL - 5, 2.5)], { w: 1.1, seed: sd + 10 });
    ink.cut(smooth([F(-4, -4), F(-10, -6), F(-6, 0)], 3), { w: 1.2, seed: sd + 6 });
  }

  CAST.push({
    id: 'hare', group: 'fast', name: 'The Hare', kind: 'Fast and light',
    look: 'A lean long-eared fencer in a buttoned doublet and a short cape, rapier out, on long bent hare legs.',
    does: [
      ['Lunge', 'A very long, very fast thrust across half the stage.'],
      ['Counter Step', 'Hops back from a blow and stabs in answer.'],
      ['Moon Leap', 'A huge jump that ends in a kick.'],
    ],
    draw(ink, pose) {
      const T = pose === 'ability';
      // ---- joints ----
      const hip = T ? [46, -52] : [0, -78];
      const lean = T ? 0.62 : 0.12;
      const lc = Math.cos(lean), ls = Math.sin(lean);
      const U = (x, y) => [hip[0] + x * lc - y * ls, hip[1] + x * ls + y * lc]; // torso frame
      const neck = U(6, -52), shF = U(10, -46), shB = U(-4, -48);
      const head = T ? add(neck, [16, -10]) : add(neck, [12, -14]);
      const kneeF = T ? [100, -44] : [24, -48], hockF = T ? [98, -14] : [10, -15], toeF = T ? [128, -1] : [40, -1];
      const kneeB = T ? [10, -30] : [-2, -48], hockB = T ? [-30, -16] : [-26, -15], toeB = T ? [-6, -1] : [4, -1];
      const elbowF = T ? add(shF, [26, 0]) : [34, -102], handF = T ? add(shF, [52, -1]) : [54, -104];
      const elbowB = T ? add(shB, [-24, -8]) : [-22, -132], handB = T ? add(shB, [-44, -22]) : [-14, -156];
      const bladeD = T ? unit([0, 0], [1, -0.01]) : unit([0, 0], [1, -0.32]);
      const bladeLen = T ? 142 : 84;
      const tip = add(handF, bladeD, bladeLen);
      const earBack = T ? 0.9 : 0; // ears blown back in the lunge
      const hc = Math.cos(T ? 0.08 : 0), hs = Math.sin(T ? 0.08 : 0);
      const Hh = (x, y) => [head[0] + x * hc - y * hs, head[1] + x * hs + y * hc];

      // ---- back arm, raised behind (the fencer's balance) ----
      ink.form(limb(shB, elbowB, 5, 4.2), { seed: 10 });
      ink.form(limb(elbowB, handB, 4.2, 3.4), { seed: 11 });
      ink.cut([mix(elbowB, handB, 0.7), add(mix(elbowB, handB, 0.7), nrm(unit(elbowB, handB)), 3)], { w: 1.1, seed: 12 });
      { // the hand, fingers curled up and loose
        const P = fr(handB, unit(elbowB, handB));
        ink.form(smooth([P(-3, -4), P(4, -4.5), P(8, -2), P(7, 2.5), P(2, 4.5), P(-3, 4)], 4, true), { w: 1.8, seed: 13 });
        ink.cut([P(4, -3), P(5.5, 2)], { w: 1, seed: 14 });
      }

      // ---- back leg ----
      hareLeg(ink, add(hip, [-4, 0]), kneeB, hockB, toeB, 20, true);

      // ---- the cape, behind the body ----
      const cape = T
        ? smooth([U(6, -56), U(-6, -58), U(-26, -56), U(-50, -46), U(-70, -44), U(-60, -38), U(-64, -30), U(-46, -30), U(-40, -22), U(-26, -26), U(-10, -22), U(-2, -40)], 6, true)
        : smooth([U(8, -58), U(-6, -60), U(-18, -52), U(-30, -36), U(-40, -16), U(-32, -18), U(-30, -8), U(-20, -14), U(-14, -6), U(-8, -16), U(-2, -30), U(4, -46)], 6, true);
      ink.form(cape, { w: 2.6, seed: 30 });
      // red lining showing in the shadow of the fold
      const lining = T
        ? smooth([U(-26, -54), U(-50, -46), U(-70, -44), U(-60, -38), U(-64, -30), U(-46, -30), U(-34, -42)], 5, true)
        : smooth([U(-18, -50), U(-30, -36), U(-40, -16), U(-32, -18), U(-30, -8), U(-24, -24)], 5, true);
      ink.hatch(lining, { tint: 'red', angle: T ? 0.3 : 1.2, gap: 3, w: 1.1, seed: 31 });
      ink.cut(smooth(T ? [U(-8, -54), U(-28, -42), U(-48, -32)] : [U(-6, -54), U(-14, -32), U(-20, -12)], 5), { w: 1.5, seed: 32 });
      ink.cut(smooth(T ? [U(-2, -48), U(-16, -34), U(-28, -26)] : [U(0, -46), U(-4, -30), U(-8, -16)], 5), { w: 1.3, seed: 33 });

      // ---- torso: a short buttoned doublet with a flared skirt ----
      const doublet = smooth([U(-10, -2), U(-12, -26), U(-8, -48), U(2, -56), U(12, -52), U(16, -36), U(12, -14), U(10, -2)], 6, true);
      ink.form(doublet, { w: 2.6, seed: 40 });
      ink.hatch(smooth([U(-10, -2), U(-12, -26), U(-8, -48), U(-2, -50), U(-4, -20), U(-2, -2)], 5, true), { angle: 1.3 + lean, gap: 3.4, seed: 41 });
      for (let i = 0; i < 4; i++) ink.dot(...U(12.5 - i * 0.6, -44 + i * 9), 1.5);
      ink.cut(smooth([U(14, -46), U(13.5, -26), U(11, -6)], 5), { w: 1.2, seed: 42 });
      // the skirt of the doublet, slashed in tabs
      const skirt = smooth([U(-12, -6), U(12, -6), U(16, 4), U(10, 10), U(6, 4), U(0, 12), U(-6, 4), U(-12, 10), U(-16, 2)], 4, true);
      ink.form(skirt, { w: 2.2, seed: 43 });
      ink.cut([U(-12, -6), U(13, -6)], { tint: 'red', w: 2.6, seed: 44, taper: 0.2 });

      // ---- front leg ----
      hareLeg(ink, add(hip, [4, 2]), kneeF, hockF, toeF, 50, false);

      // ---- a falling-band collar and the head ----
      ink.form(smooth([U(-4, -54), U(14, -56), U(16, -50), U(6, -46), U(-6, -48)], 4, true), { w: 2, seed: 60 });
      // ears first: one tall with a nick out of it, one broken over halfway
      const earW = (k) => (t) => Math.max(0.8, 7 * k * Math.pow(Math.sin(Math.PI * (0.13 + 0.87 * t)), 0.6));
      const ear = (path, k, notch, sd) => {
        const c = smooth(path, 6);
        ink.form(smooth(strip(c, earW(k), notch), 1, true), { w: 2.4, seed: sd });
        // the inner ear: a long lobe of shadow down the middle
        const inner = smooth(strip(c.slice(2, Math.floor(c.length * 0.86)), (t) => earW(k * 0.5)(0.1 + t * 0.8)), 1, true);
        ink.cut(inner, { closed: true, w: 1.2, seed: sd + 1 });
        ink.hatch(inner, { angle: T ? 1.2 : 0.4, gap: 2.8, w: 0.9, seed: sd + 2 });
      };
      ear(T ? [Hh(-6, -12), Hh(-24, -24), Hh(-46, -28), Hh(-72, -24)] : [Hh(-5, -12), Hh(-6, -36), Hh(-10, -60), Hh(-18, -84)], 1.1, [0.6, 3.6], 70);
      ear(T ? [Hh(2, -14), Hh(-14, -20), Hh(-32, -16), Hh(-50, -8), Hh(-64, -2)] : [Hh(2, -14), Hh(8, -34), Hh(9, -50), Hh(1, -61), Hh(-14, -63)], 1, null, 74);

      // the skull: long, the snout forward, a tuft of cheek fur under the jaw
      const skull = smooth([Hh(-12, 2), Hh(-12, -8), Hh(-4, -15), Hh(8, -15), Hh(20, -10), Hh(28, -3), Hh(29, 2), Hh(24, 6), Hh(14, 7), Hh(6, 10), Hh(0, 8), Hh(-4, 12), Hh(-6, 6)], 6, true);
      ink.form(skull, { w: 2.6, seed: 80 });
      ink.hatch(smooth([Hh(-12, 2), Hh(-12, -8), Hh(-6, -12), Hh(-2, 0), Hh(-4, 12), Hh(-6, 6)], 5, true), { angle: 1.0, gap: 3, seed: 81 });
      // the eye: a narrow almond with a hard lid
      ink.form(smooth([Hh(6, -6), Hh(11, -9.5), Hh(16, -6.5), Hh(11, -4.5)], 4, true), { w: 1.7, seed: 82 });
      ink.dot(...Hh(12, -6.6), 1.5, { free: ink.mode === 'line' });
      ink.cut([Hh(4, -10.5), Hh(17, -9)], { w: 1.8, seed: 83 });
      // nose, split lip, whiskers
      ink.dot(...Hh(27.5, -1), 1.7);
      ink.cut(smooth([Hh(26, 1), Hh(25, 4), Hh(21, 5)], 3), { w: 1.2, seed: 84 });
      ink.cut(smooth([Hh(-4, 0), Hh(2, 4), Hh(0, 8)], 3), { w: 1.2, seed: 85 });
      [[-6, 0.5], [-1, 0.9], [4, 1.4]].forEach(([dy, k], i) => ink.line(smooth([Hh(24, 2 + i), Hh(36, dy + 1), Hh(46 + i * 2, dy * 2 + 4 + k)], 4), { w: 1, taper: 0.9, seed: 86 + i }));

      // ---- front arm and the rapier ----
      ink.form(limb(shF, elbowF, 5.4, 4.4), { seed: 90 });
      ink.cut([mix(shF, elbowF, 0.5), add(mix(shF, elbowF, 0.5), nrm(unit(shF, elbowF)), -4)], { w: 1.1, seed: 91 });
      ink.form(limb(elbowF, handF, 4.4, 3.6), { seed: 92 });
      { // a flared glove cuff at the wrist
        const P = fr(handF, unit(elbowF, handF));
        ink.form(smooth([P(-15, -4.6), P(-5, -7.5), P(-3, -6.5), P(-3, 6.5), P(-5, 7.5), P(-15, 4.6)], 3, true), { w: 2, seed: 96 });
        ink.cut([P(-9, -5), P(-9, 5)], { w: 1.1, seed: 97 });
      }
      // a red ribbon tied round the forearm, its ends flying back
      const rb = mix(shF, elbowF, 0.62), rbd = unit(elbowF, shF);
      ink.cut([add(rb, nrm(rbd), 4.2), add(rb, nrm(rbd), -4.2)], { tint: 'red', w: 2.4, taper: 0.1, seed: 93 });
      ink.line(smooth([rb, add(rb, [-8, T ? -2 : 6]), add(rb, [-18, T ? -6 : 14])], 4), { tint: 'red', w: 1.8, taper: 0.8, seed: 94 });
      ink.line(smooth([rb, add(rb, [-10, T ? 3 : 10]), add(rb, [-15, T ? 7 : 20])], 4), { tint: 'red', w: 1.4, taper: 0.8, seed: 95 });
      { // the rapier: blade, quillons, a cup and a knuckle bow over the fist
        const P = fr(handF, bladeD);
        ink.line([P(10, 0), tip], { w: 2.4, taper: 0.55, seed: 100 });
        ink.line([P(14, 0.9), P(bladeLen * 0.45, 0.6)], { w: 0.9, taper: 0.7, seed: 101 });
        ink.line([P(7, -11), P(7, 11)], { w: 2, taper: 0.4, seed: 102 });
        ink.form(smooth([P(5, -7), P(11, -6), P(12, 0), P(11, 6), P(5, 7)], 4, true), { w: 2, seed: 103 });
        ink.line(smooth([P(7, 6), P(2, 9), P(-6, 7), P(-11, 2)], 4), { w: 1.6, taper: 0.3, seed: 104 });
        ink.form(ell(...P(-12, 0), 3, 3), { w: 1.6, seed: 105 });
        // the fist on the grip
        ink.form(smooth([P(-8, -5), P(2, -5.5), P(5, -2), P(5, 3.5), P(0, 5.5), P(-8, 4.5)], 4, true), { w: 2, seed: 106 });
        ink.cut([P(0, -4), P(0.6, 4)], { w: 1.1, seed: 107 });
      }

      // ---- Lunge: the thrust tearing a line through the air ahead of the point ----
      if (T) {
        const P = fr(tip, bladeD);
        ink.line([P(-120, -9), P(40, -2.5)], { tint: 'red', w: 1.4, taper: 0.9, seed: 120 });
        ink.line([P(-90, 9), P(46, 2.5)], { tint: 'red', w: 1.4, taper: 0.9, seed: 121 });
        ink.line([P(-40, -16), P(20, -6)], { tint: 'red', w: 1.1, taper: 0.9, seed: 122 });
        ink.line([P(4, 0), P(60, 0)], { tint: 'red', w: 2.2, taper: 0.9, seed: 123 });
        // dust kicked from the back foot, and the drag lines of the long slide
        ink.line(smooth([[-14, -2], [-34, -8], [-52, -6]], 4), { w: 1.4, taper: 0.9, seed: 124 });
        ink.line(smooth([[-12, -1], [-30, -16], [-44, -22]], 4), { w: 1.2, taper: 0.9, seed: 125 });
        ink.line([[60, -2], [118, -2]], { w: 1.3, taper: 0.9, seed: 126 });
      }
    },
  });
})();
