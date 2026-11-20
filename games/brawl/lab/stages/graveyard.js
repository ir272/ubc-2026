// Gallows Hill: a hilltop graveyard held up by an old retaining wall.
(function () {
  const layout = {
    main: { x0: -8, x1: 8, y: 0 },
    soft: [{ x0: -5.4, x1: -2.6, y: 2.5 }, { x0: -1.5, x1: 1.5, y: 4.8 }, { x0: 2.6, x1: 5.4, y: 2.5 }],
  };

  function draw(ctx, view) {
    const P = StageKit.pen(ctx, view);
    const { S, E } = P;
    P.clear();

    P.sky(9, [-13, -1, 13, 10.5], 80, [[-10.8, 8.4, 0.32], [-3.4, 9.6, 0.24, 0.6], [6.6, 9.3, 0.3], [11.6, 6.8, 0.2, 0.55]],
      (x, y) => Math.hypot(x - 9.4, y - 1.4) < 2.9);

    // the low moon, half behind the far hills
    P.form(E(9.4, 1.4, 2.5, 2.5, 0, 48), { w: 1.6, tint: 'yellow', wash: 0.15, alpha: 0.9 });
    P.hatch(S([[10.6, 3.6], [11.6, 2.4], [11.8, 0.8], [11.0, -0.6], [10.9, 1.2]], 5, true), { angle: 1.15, gap: 4, tint: 'yellow', alpha: 0.4 });

    // far hills, two rows, the hero's flat green inside the outline
    const far = S([[-13.5, -0.4], [-10.5, 0.9], [-7.5, 0.2], [-3.5, 1.3], [0.5, 0.4], [4.5, 1.1], [8, 0.1], [11, 0.8], [13.5, 0.2]], 8);
    P.form(far.concat([[13.5, -4.5], [-13.5, -4.5]]), { open: false, w: 0 });
    P.fill(far.concat([[13.5, -4.5], [-13.5, -4.5]]), 'green', 0.13);
    P.line(far, { w: 1.1, alpha: 0.4, tint: 'green', taper: 0.3 });
    const near = S([[-13.5, -1.8], [-11, -0.9], [-8.6, -1.6], [-4, -2.6], [3, -2.2], [8.4, -1.4], [10.8, -0.6], [13.5, -1.6]], 8);
    P.mask(near.concat([[13.5, -4.5], [-13.5, -4.5]]));
    P.fill(near.concat([[13.5, -4.5], [-13.5, -4.5]]), 'green', 0.22);
    P.line(near, { w: 1.5, alpha: 0.65, taper: 0.3 });
    // a few far cypresses and a lane on the near hills
    for (const [x, y, h] of [[-11.6, -1.05, 1.1], [-11.1, -1.0, 0.8], [10.3, -0.75, 1.0], [11.0, -0.68, 1.3]]) {
      P.form(S([[x, y], [x - 0.18, y + h * 0.4], [x, y + h], [x + 0.18, y + h * 0.4]], 5, true), { w: 1.1, alpha: 0.6, wash: 0.25, tint: 'green' });
    }
    P.line(S([[-12.4, -3.6], [-10.6, -2.6], [-9.6, -1.5]], 6), { w: 0.9, alpha: 0.35 });
    P.line(S([[-12.0, -3.8], [-10.2, -2.7], [-9.3, -1.55]], 6), { w: 0.9, alpha: 0.35 });

    // the crest: turf lip and the retaining wall under it
    const lip = [[-8, 0], [8, 0], [8, -0.55], [-8, -0.55]];
    const wall = [[-7.8, -0.55], [7.8, -0.55], [7.55, -4.5], [-7.55, -4.5]];
    P.mask(wall);
    P.line([[-7.8, -0.55], [-7.55, -4.5]], { w: 2.4, taper: 0.1 });
    P.line([[7.8, -0.55], [7.55, -4.5]], { w: 2.4, taper: 0.1 });
    const rw = StageKit.rng(31);
    for (let row = 0, y = -0.6; y > -4.5; row++) {
      const h = 0.55 + rw() * 0.35;
      const yb = y - h;
      const halfW = (yy) => 7.8 - ((-0.55 - yy) / 3.95) * 0.25;
      let x = -halfW(yb) + 0.05 + (row % 2) * 0.35;
      while (x < halfW(yb) - 0.2) {
        const bw = Math.min(0.8 + rw() * 1.0, halfW(yb) - 0.05 - x);
        const j = () => (rw() - 0.5) * 0.08;
        const stone = S([[x + 0.08, y - 0.05 + j()], [x + bw - 0.08, y - 0.06 + j()], [x + bw - 0.03, (y + yb) / 2], [x + bw - 0.1, yb + 0.06 + j()], [x + 0.1, yb + 0.05 + j()], [x + 0.03, (y + yb) / 2]], 4, true);
        P.line(stone, { w: 1.2, alpha: 0.62, closed: true });
        if (rw() < 0.3) P.hatch(stone, { angle: 1.1, gap: 4.5, alpha: 0.35 });
        x += bw;
      }
      y = yb;
    }
    // a crack down the wall and a few roots hanging over the lip
    P.line([[2.1, -0.6], [2.3, -1.4], [2.0, -2.1], [2.4, -3.0], [2.2, -4.4]], { w: 1.4, alpha: 0.8, taper: 0.6 });
    for (const [x, l] of [[-5.6, 1.4], [-5.3, 0.9], [4.6, 1.2], [6.9, 0.8]]) P.line(S([[x, -0.5], [x + 0.1, -0.5 - l * 0.5], [x - 0.05, -0.5 - l]], 5), { w: 1.2, alpha: 0.75, taper: 0.8 });
    P.form(lip, { w: 2.4, tint: undefined, wash: 0.3, washTint: 'green' });

    // the iron fence along the back of the crest
    P.line([[-7.4, 0.5], [7.5, 0.5]], { w: 1, alpha: 0.5, taper: 0.1 });
    P.line([[-7.4, 1.3], [-1.2, 1.3]], { w: 1, alpha: 0.5, taper: 0.1 });
    P.line([[0.4, 1.3], [7.5, 1.3]], { w: 1, alpha: 0.5, taper: 0.1 });
    for (let x = -7.3; x < 7.5; x += 0.38) {
      if (x > -1.1 && x < 0.3) continue;
      const lean = x > 5 ? (x - 5) * 0.06 : 0;
      P.line([[x, 0.02], [x + lean, 1.55]], { w: 0.9, alpha: 0.5, taper: 0.2 });
      P.line([[x + lean - 0.06, 1.48], [x + lean, 1.7], [x + lean + 0.06, 1.48]], { w: 0.8, alpha: 0.5, taper: 0.1 });
    }

    // headstones, leaning
    const stones = [[-7.3, 0.85, 0.5, -0.12], [-4.7, 1.15, 0.6, 0.08, 'cross'], [-1.9, 0.9, 0.55, -0.18], [1.6, 1.25, 0.65, 0.1], [6.0, 0.95, 0.55, 0.16, 'cross'], [7.05, 0.7, 0.45, -0.1]];
    for (const [x, h, w, tilt, kind] of stones) {
      const c = Math.cos(tilt), s = Math.sin(tilt);
      const q = (dx, dy) => [x + dx * c - dy * s, dy * c + dx * s];
      let pts;
      if (kind === 'cross') {
        const a = w * 0.17;
        pts = [q(-a, 0), q(a, 0), q(a, h * 0.62), q(w / 2, h * 0.62), q(w / 2, h * 0.8), q(a, h * 0.8), q(a, h * 1.12), q(-a, h * 1.12), q(-a, h * 0.8), q(-w / 2, h * 0.8), q(-w / 2, h * 0.62), q(-a, h * 0.62)];
      } else {
        pts = [q(-w / 2, 0), q(w / 2, 0), q(w / 2, h - w / 2)];
        for (let i = 1; i < 10; i++) { const t = (i / 10) * Math.PI; pts.push(q(Math.cos(t) * w / 2, h - w / 2 + Math.sin(t) * w / 2)); }
        pts.push(q(-w / 2, h - w / 2));
      }
      P.form(pts, { w: 1.6 });
      P.hatch(pts.slice(0, Math.ceil(pts.length / 2)).concat([q(0, 0)]), { angle: 1.25, gap: 4, alpha: 0.4 });
      if (!kind) P.line([q(-w * 0.25, h * 0.55), q(w * 0.25, h * 0.55)], { w: 0.9, alpha: 0.5, taper: 0.4 });
    }

    // the mausoleum, its flat roof slab is a platform
    const m = layout.soft[2];
    P.form([[m.x0 + 0.35, 0], [m.x1 - 0.35, 0], [m.x1 - 0.35, m.y - 0.35], [m.x0 + 0.35, m.y - 0.35]], { w: 2 });
    P.form([[m.x0 + 0.15, 0], [m.x1 - 0.15, 0], [m.x1 - 0.15, 0.22], [m.x0 + 0.15, 0.22]], { w: 1.6 });
    for (const x of [m.x0 + 0.6, m.x1 - 0.6]) P.line([[x, 0.25], [x, m.y - 0.4]], { w: 1.4, alpha: 0.8, taper: 0.1 });
    const dx = (m.x0 + m.x1) / 2;
    const door = [[dx - 0.48, 0.22], [dx + 0.48, 0.22], [dx + 0.48, 1.25], ...P.A(dx, 1.25, 0.48, 0, Math.PI, 10).map((q) => [q[0], q[1]])];
    P.form(door, { w: 1.6 });
    for (let x = dx - 0.36; x < dx + 0.4; x += 0.18) P.line([[x, 0.24], [x, 1.25 + Math.sqrt(Math.max(0, 0.23 - (x - dx) * (x - dx))) - 0.05]], { w: 0.9, alpha: 0.75, taper: 0.1 });
    P.hatch([[m.x1 - 0.6, 0.25], [m.x1 - 0.35, 0.25], [m.x1 - 0.35, m.y - 0.35], [m.x1 - 0.6, m.y - 0.35]], { angle: 1.3, gap: 4, alpha: 0.5 });
    P.form([[m.x0, m.y], [m.x1, m.y], [m.x1 - 0.1, m.y - 0.35], [m.x0 + 0.1, m.y - 0.35]], { w: 2 });
    P.line([[m.x1 - 0.7, 1.9], [m.x1 - 0.95, 1.5], [m.x1 - 0.8, 1.1]], { w: 1.1, alpha: 0.75, taper: 0.6 });

    // the dead tree: two long limbs are platforms
    const t1 = layout.soft[0], t2 = layout.soft[1];
    const trunk = S([[-7.75, 0], [-7.2, 0.5], [-7.25, 1.8], [-7.4, 3.4], [-7.05, 5.2], [-7.1, 6.7], [-6.6, 6.8], [-6.45, 5.2], [-6.2, 3.6], [-6.05, 1.8], [-5.8, 0.4], [-5.35, 0]], 6, true);
    // limb to the low platform: flat top from t1.x0 to t1.x1
    const limb1 = [[-6.3, 2.95], ...S([[-5.9, t1.y + 0.05], [-5.4, t1.y], [-4.0, t1.y], [t1.x1, t1.y], [t1.x1 + 0.25, t1.y - 0.05]], 4), [t1.x1 + 0.25, t1.y - 0.18], ...S([[t1.x1, t1.y - 0.26], [-4.0, t1.y - 0.32], [-5.2, t1.y - 0.5], [-5.8, t1.y - 0.95]], 4), [-6.1, 1.3]];
    const limb2 = [[-6.5, 5.3], ...S([[-5.4, 5.0], [-3.6, t2.y + 0.06], [t2.x0, t2.y], [0, t2.y], [t2.x1, t2.y], [t2.x1 + 0.35, t2.y - 0.06]], 4), [t2.x1 + 0.35, t2.y - 0.2], ...S([[t2.x1, t2.y - 0.3], [0, t2.y - 0.34], [t2.x0, t2.y - 0.38], [-3.6, t2.y - 0.5], [-5.2, 4.3], [-6.0, 3.9]], 4), [-6.3, 3.6]];
    P.mask(trunk); P.mask(limb1); P.mask(limb2);
    P.line(trunk, { w: 2.2, closed: true });
    P.line(limb1, { w: 2, closed: true });
    P.line(limb2, { w: 2, closed: true });
    P.mask([[-6.3, 2.95], [-5.95, 2.1], [-6.1, 1.3], [-6.4, 1.6]]);
    P.mask([[-6.5, 5.3], [-6.0, 3.9], [-6.3, 3.6], [-6.55, 4.2]]);
    for (const [a, b] of [[[-6.8, 0.3], [-6.6, 2.4]], [[-6.45, 1.0], [-6.5, 3.8]], [[-6.75, 3.6], [-6.65, 6.2]], [[-5.2, t1.y - 0.15], [-3.6, t1.y - 0.17]], [[-4.6, t2.y - 0.18], [-1.0, t2.y - 0.17]]]) P.line([a, mix(a, b, 0.5), b], { w: 1, alpha: 0.6, taper: 0.7 });
    P.hatch(S([[-7.7, 0], [-7.2, 0.5], [-7.25, 1.8], [-7.4, 3.4], [-7.05, 5.2], [-6.85, 5.2], [-7.0, 3.4], [-6.85, 1.8], [-6.9, 0]], 4, true), { angle: 1.3, gap: 4, alpha: 0.55 });
    for (const [x, y] of [[-4.6, t1.y - 0.3], [-2.4, t2.y - 0.25], [-6.75, 2.6]]) P.line(E(x, y, 0.14, 0.07, 0, 10), { w: 1, alpha: 0.7, closed: true });
    // twigs: thin, dim, never flat
    const twig = (pts, w = 1.2, a = 0.8) => P.line(S(pts, 6), { w, alpha: a, taper: 0.9 });
    twig([[-6.75, 6.6], [-7.2, 7.8], [-7.0, 8.9], [-7.4, 9.6]], 1.6);
    twig([[-7.1, 7.6], [-8.0, 8.2], [-8.5, 9.1]], 1.1);
    twig([[-6.75, 6.6], [-6.2, 7.6], [-5.4, 8.1], [-4.8, 9.0]], 1.4);
    twig([[-5.6, 8.0], [-5.0, 7.6], [-4.3, 7.8]], 1, 0.7);
    twig([[-7.0, 8.7], [-6.4, 9.4], [-6.3, 10.0]], 1, 0.7);
    twig([[t2.x1 + 0.3, t2.y - 0.1], [2.4, 5.2], [3.0, 5.9]], 1.1, 0.75);
    twig([[2.3, 5.15], [2.9, 4.9]], 0.9, 0.6);
    twig([[t1.x1 + 0.2, t1.y - 0.1], [-2.0, 2.9], [-1.6, 3.4]], 1, 0.7);
    twig([[-7.3, 4.6], [-8.1, 5.0], [-8.6, 5.6]], 1, 0.7);
    twig([[-8.1, 5.0], [-8.5, 4.7]], 0.8, 0.55);
    // an old cut rope still tied round the high limb, frayed at the end
    P.line(E(0.7, t2.y - 0.17, 0.1, 0.2, 0, 10), { w: 1.1, alpha: 0.8, closed: true });
    P.line(S([[0.72, t2.y - 0.36], [0.78, 3.9], [0.7, 3.5]], 5), { w: 1.3, alpha: 0.85, taper: 0.3 });
    for (const d of [-0.07, 0, 0.07]) P.line([[0.7, 3.52], [0.7 + d, 3.32]], { w: 0.8, alpha: 0.7, taper: 0.8 });

    // grass along the crest, short, behind the standing line
    const rg = StageKit.rng(12);
    for (let x = -7.8; x < 7.8; x += 0.22 + rg() * 0.3) {
      const h = 0.12 + rg() * 0.22;
      P.line([[x, 0], [x - 0.04, h]], { w: 1, alpha: 0.55, taper: 0.8, tint: rg() < 0.4 ? 'green' : null });
    }

    P.walk(layout.main.x0, layout.main.x1, 0, { w: 5.2 });
    for (const s of layout.soft) P.walk(s.x0, s.x1, s.y);

    P.figure(-4.0, 2.5);
    P.figure(2.4, 0, true);
  }
  const mix = Ink.mix;

  STAGES.push({ id: 'graveyard', name: 'Gallows Hill', look: 'A graveyard on a hilltop held up by an old stone wall, fought on the crest, the limbs of a dead tree and a mausoleum roof, under a low moon.', layout, draw });
})();
