// The Night Ship: the deck of an old sailing ship at sea. Four yards on two masts are the platforms.
(function () {
  const layout = {
    main: { x0: -8, x1: 8, y: 0 },
    soft: [{ x0: -5.6, x1: -2.4, y: 2.5 }, { x0: -5.2, x1: -2.8, y: 5.0 }, { x0: 2.4, x1: 5.6, y: 2.5 }, { x0: 2.8, x1: 5.2, y: 5.0 }],
  };

  function draw(ctx, view) {
    const P = StageKit.pen(ctx, view);
    const { S, E } = P;
    P.clear();

    P.sky(17, [-13, -0.6, 13, 10.5], 110, [[-10.6, 8.9, 0.34], [-0.4, 9.7, 0.26, 0.65], [8.2, 7.6, 0.24, 0.6], [11.8, 9.6, 0.3], [-12, 3.6, 0.2, 0.5]],
      (x, y) => Math.hypot(x + 9.6, y - 6.2) < 1.6);
    // a thin moon
    const moon = E(-9.6, 6.2, 1.05, 1.05, 0, 36);
    P.fill(moon, 'yellow', 0.14);
    P.line(P.A(-9.6, 6.2, 1.05, -2.4, 2.4, 24), { w: 1.6, tint: 'yellow', taper: 0.7 });
    P.line(S([[-10.2, 7.06], [-9.45, 6.3], [-10.2, 5.34]], 8), { w: 1.2, tint: 'yellow', alpha: 0.7, taper: 0.8 });

    // the sea: horizon, then rows of drawn waves, nearer rows bigger and brighter
    P.line([[-13, -0.65], [13, -0.65]], { w: 1, alpha: 0.35, taper: 0.4 });
    const rows = [[-1.0, 0.45, 0.25, 0.25], [-1.45, 0.65, 0.33, 0.3], [-2.0, 0.9, 0.42, 0.38], [-2.7, 1.25, 0.55, 0.5], [-3.5, 1.7, 0.72, 0.62]];
    rows.forEach(([y, wl, amp, a], ri) => {
      const r = StageKit.rng(90 + ri);
      for (let x = -13.4 + r() * wl; x < 13.4; x += wl * (1.6 + r() * 1.2)) {
        const crest = S([[x, y], [x + wl * 0.35, y + amp * 0.45], [x + wl * 0.62, y + amp * 0.62], [x + wl * 0.75, y + amp * 0.35], [x + wl * 0.6, y + amp * 0.15]], 6);
        P.line(crest, { w: 0.9 + ri * 0.3, alpha: a, taper: 0.7, tint: ri > 2 ? null : 'blue' });
        P.line([[x - wl * 0.5, y - 0.02], [x, y]], { w: 0.8 + ri * 0.2, alpha: a * 0.7, taper: 0.9 });
        if (ri >= 2 && r() < 0.6) P.hatch([[x + wl * 0.1, y + 0.02], [x + wl * 0.55, y + amp * 0.5], [x + wl * 0.6, y + 0.02]], { angle: 1.3, gap: 3.5, tint: 'blue', alpha: 0.6 });
      }
    });

    // the hull
    const hull = S([[-8.15, 0], [8.0, 0], [8.6, 0.3], [8.2, -0.9], [7.3, -2.2], [5.6, -3.0], [0, -3.2], [-6.2, -3.0], [-7.6, -2.3], [-7.95, -1.0]], 6, true);
    P.mask(hull);
    P.hatch(S([[-7.6, -2.0], [-6.2, -2.75], [0, -2.95], [5.6, -2.75], [7.2, -2.0], [5.6, -2.5], [0, -2.6], [-6.0, -2.45]], 5, true), { angle: 1.2, gap: 4, alpha: 0.45 });
    for (const [y, a] of [[-0.45, 0.45], [-1.6, 0.45], [-2.1, 0.4], [-2.55, 0.35]]) {
      const k = (-y) / 3.2;
      P.line(S([[-7.95 + k * 0.45, y], [0, y - k * 0.15], [8.0 - k * 1.6, y + 0.05]], 8), { w: 0.9, alpha: a, taper: 0.4 });
    }
    // the wale and the gun ports
    P.form(S([[-7.95, -1.0], [0, -1.12], [8.2, -0.9], [8.15, -1.22], [0, -1.42], [-7.9, -1.3]], 6, true), { w: 1.8 });
    for (let x = -6.4; x < 6.6; x += 1.6) {
      P.form([[x - 0.28, -0.62], [x + 0.28, -0.62], [x + 0.28, -0.98], [x - 0.28, -0.98]], { w: 1.4 });
      P.hatch([[x - 0.28, -0.62], [x + 0.28, -0.62], [x + 0.28, -0.98], [x - 0.28, -0.98]], { angle: 0.2, gap: 3, alpha: 0.7 });
    }
    P.line(hull, { w: 2.6, closed: true });
    // stern windows and the rudder
    P.line([[-7.95, -1.0], [-8.3, -1.4], [-7.9, -2.4]], { w: 1.6, alpha: 0.85 });
    // waves in front of the waterline
    const rw = StageKit.rng(99);
    for (let x = -8.6; x < 9; x += 1.0 + rw() * 0.5) {
      const y = -2.95 + rw() * 0.2, wl = 1.1 + rw() * 0.4;
      const crest = S([[x, y], [x + wl * 0.35, y + 0.35], [x + wl * 0.62, y + 0.48], [x + wl * 0.78, y + 0.26], [x + wl * 0.6, y + 0.1]], 6);
      P.mask(crest.concat([[x + wl * 0.8, -4.5], [x - 0.2, -4.5]]));
      P.line(crest, { w: 1.6, alpha: 0.85, taper: 0.6 });
      P.line([[x - wl * 0.5, y - 0.03], [x, y]], { w: 1.3, alpha: 0.6, taper: 0.9 });
    }
    // the bowsprit and the stern lantern, outside the deck
    P.line([[7.6, 0.2], [12.2, 2.6]], { w: 2.4, taper: 0.4 });
    P.line([[8.4, 0.25], [8.9, -0.9]], { w: 1.2, alpha: 0.7 });
    P.line([[-8.15, 0.2], [-8.9, 1.25]], { w: 1.6, taper: 0.2 });
    P.form([[-9.15, 1.25], [-8.65, 1.25], [-8.6, 0.6], [-9.2, 0.6]], { w: 1.5, tint: 'gold', wash: 0.35 });
    P.line([[-9.15, 1.25], [-8.9, 1.5], [-8.65, 1.25]], { w: 1.3, tint: 'gold' });

    // far-side rail along the deck, dim
    P.line([[-7.9, 0.75], [7.6, 0.75]], { w: 1, alpha: 0.4, taper: 0.1 });
    for (let x = -7.6; x < 7.6; x += 0.8) P.line([[x, 0.05], [x, 0.75]], { w: 0.8, alpha: 0.32, taper: 0.1 });

    // rigging: shrouds with ratlines, stays, all thin
    const top = 9.8;
    for (const mx of [-4, 4]) {
      for (const [bx, a] of [[mx - 2.2, 0.55], [mx + 2.2, 0.55]]) {
        P.line([[mx, top - 0.4], [bx, 0.05]], { w: 1, alpha: a, taper: 0.1 });
        P.line([[mx, top - 0.4], [bx + Math.sign(mx - bx) * 0.5, 0.05]], { w: 1, alpha: a, taper: 0.1 });
        for (let y = 0.6; y < 8.4; y += 0.6) {
          const t = y / (top - 0.4), x1 = bx + (mx - bx) * t, x2 = bx + Math.sign(mx - bx) * 0.5 + (mx - (bx + Math.sign(mx - bx) * 0.5)) * t;
          P.line([[x1, y], [x2, y]], { w: 0.7, alpha: 0.28, taper: 0.2 });
        }
      }
    }
    P.line(S([[-4, top - 0.2], [0, top - 1.0], [4, top - 0.2]], 8), { w: 1, alpha: 0.5, taper: 0.1 });
    P.line([[4, top - 0.5], [12.2, 2.6]], { w: 1, alpha: 0.55, taper: 0.1 });
    P.line([[4, 6.8], [11.0, 2.0]], { w: 0.9, alpha: 0.4, taper: 0.1 });
    P.line([[-4, top - 0.5], [-8.4, 0.3]], { w: 0.9, alpha: 0.45, taper: 0.1 });

    // masts
    for (const mx of [-4, 4]) {
      P.form([[mx - 0.17, 0], [mx + 0.17, 0], [mx + 0.12, top], [mx - 0.12, top]], { w: 2 });
      P.form([[mx - 0.2, top], [mx + 0.2, top], [mx + 0.2, top + 0.25], [mx - 0.2, top + 0.25]], { w: 1.4 });
      P.line([[mx - 0.17, 3.6], [mx + 0.17, 3.6]], { w: 1, alpha: 0.6 });
      P.line([[mx - 0.17, 6.4], [mx + 0.17, 6.4]], { w: 1, alpha: 0.6 });
      // pennant
      const pen = S([[mx, top + 0.25], [mx - 0.9, top + 0.15], [mx - 1.9, top + 0.3], [mx - 2.6, top + 0.12]], 6);
      const pen2 = S([[mx - 2.6, top + 0.12], [mx - 1.8, top - 0.05], [mx - 0.9, top - 0.05], [mx, top - 0.05]], 6);
      P.form(pen.concat(pen2), { w: 1.2, tint: 'red', wash: 0.3 });
    }

    // yards with furled sails under them
    for (const s of layout.soft) {
      const mid = (s.x0 + s.x1) / 2, th = 0.22;
      const yard = [[s.x0, s.y], [s.x1, s.y], [s.x1 + 0.12, s.y - th * 0.4], [s.x1, s.y - th * 0.7], [mid, s.y - th], [s.x0, s.y - th * 0.7], [s.x0 - 0.12, s.y - th * 0.4]];
      // the furled sail: a lumpy roll hanging under the yard, tied with gaskets
      const r = StageKit.rng(Math.round(s.x0 * 10 + s.y * 7) + 200);
      const roll = [[s.x0 + 0.15, s.y - th * 0.6]];
      for (let x = s.x0 + 0.25; x < s.x1 - 0.2; x += 0.42) roll.push([x + 0.21, s.y - th - 0.32 - r() * 0.16]);
      roll.push([s.x1 - 0.15, s.y - th * 0.6]);
      const rollShape = S(roll, 5).concat([[s.x1 - 0.15, s.y - 0.05], [s.x0 + 0.15, s.y - 0.05]]);
      P.form(rollShape, { w: 1.6 });
      P.hatch(rollShape, { angle: 1.4, gap: 4.5, alpha: 0.35 });
      for (let x = s.x0 + 0.65; x < s.x1 - 0.3; x += 0.85) P.line([[x, s.y - 0.12], [x + 0.08, s.y - th - 0.38]], { w: 1, alpha: 0.7, taper: 0.2 });
      P.form(yard, { w: 2 });
      // lifts from the mast to the yard ends
      P.line([[mid, s.y + 1.5], [s.x0 + 0.05, s.y]], { w: 0.8, alpha: 0.45, taper: 0.1 });
      P.line([[mid, s.y + 1.5], [s.x1 - 0.05, s.y]], { w: 0.8, alpha: 0.45, taper: 0.1 });
    }

    P.walk(layout.main.x0, layout.main.x1, 0, { w: 5.2 });
    for (const s of layout.soft) P.walk(s.x0, s.x1, s.y);

    P.figure(-1.4, 0);
    P.figure(3.2, 2.5, true);
  }

  STAGES.push({ id: 'ship', name: 'The Night Ship', look: 'The deck of an old sailing ship on a calm night sea, with the yards of its two masts as ledges to climb.', layout, draw });
})();
