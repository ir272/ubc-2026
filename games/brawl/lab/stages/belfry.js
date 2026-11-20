// The Belfry: the open top of a bell tower at night.
(function () {
  const layout = {
    main: { x0: -8, x1: 8, y: 0 },
    soft: [{ x0: -5.4, x1: -2.6, y: 2.5 }, { x0: 2.6, x1: 5.4, y: 2.5 }, { x0: -1.5, x1: 1.5, y: 4.8 }],
  };

  function draw(ctx, view) {
    const P = StageKit.pen(ctx, view);
    const { S, E, A, rect } = P;
    const r = StageKit.rng(11);
    P.clear();

    // sky
    P.sky(3, [-13, -1, 13, 10.5], 70, [[-9.6, 8.6, 0.35], [9.8, 9.2, 0.28], [-2.6, 9.0, 0.2, 0.5], [11.4, 4.6, 0.22, 0.6]],
      (x, y) => Math.hypot(x + 10.2, y - 4.6) < 2.4 || (Math.abs(x) < 7 && y > 9.2));

    // the moon, low over the left, behind everything
    const moon = E(-10.2, 4.6, 1.5, 1.5, 0, 40);
    P.form(moon, { w: 1.5, alpha: 0.85, tint: 'yellow', wash: 0.16 });
    P.hatch(S([[-9.6, 5.9], [-8.8, 5.0], [-8.75, 4.1], [-9.4, 3.3], [-9.75, 4.2], [-9.7, 5.2]], 5, true), { angle: 1.2, gap: 4, tint: 'yellow', alpha: 0.45 });

    // the town far below: two rows, the farther one thinner and dimmer
    P.line([[-13, -0.9], [-6, -0.7], [3, -1.0], [13, -0.8]], { w: 0.9, alpha: 0.22, taper: 0.8 });
    P.town(-13.2, 13.2, -1.6, -4.4, { seed: 21, hMin: 0.2, hMax: 0.7, wMin: 0.35, wMax: 0.9, alpha: 0.32, w: 0.9, tint: 'blue', spire: 0.08, lit: 0.08 });
    P.town(-13.2, 13.2, -2.9, -4.4, { seed: 22, hMin: 0.3, hMax: 1.2, wMin: 0.7, wMax: 1.6, alpha: 0.6, w: 1.1, tint: 'blue', spire: 0.04, lit: 0.12 });

    // the tower below the belfry floor
    const wall = [[-7.2, -1.05], [7.2, -1.05], [7.35, -4.4], [-7.35, -4.4]];
    P.mask(wall);
    P.line([[-7.2, -1.05], [-7.35, -4.4]], { w: 2, taper: 0.2 });
    P.line([[7.2, -1.05], [7.35, -4.4]], { w: 2, taper: 0.2 });
    for (let i = 0, y = -1.55; y > -4.4; y -= 0.55, i++) {
      P.line([[-7.25, y], [7.25, y]], { w: 0.9, alpha: 0.32, taper: 0.3 });
      for (let x = -7.2 + (i % 2) * 0.7 + 0.2; x < 7.1; x += 1.4) {
        if (Math.abs(Math.abs(x) - 3.4) < 0.75) continue;
        P.line([[x, y], [x, y + 0.5]], { w: 0.8, alpha: 0.28, taper: 0.3 });
      }
    }
    P.hatch([[3.6, -1.05], [7.2, -1.05], [7.35, -4.4], [3.6, -4.4]], { angle: 1.15, gap: 7, alpha: 0.14 });
    for (const cx of [-3.4, 3.4]) {
      const win = [[cx - 0.5, -4.4], [cx - 0.5, -2.4], ...A(cx, -2.4, 0.5, Math.PI, 0, 10).map((q, i) => [q[0], -2.4 + Math.sin((i / 10) * Math.PI) * 0.8])];
      const lancet = [[cx - 0.5, -4.4], [cx - 0.5, -2.4], [cx - 0.3, -1.85], [cx, -1.6], [cx + 0.3, -1.85], [cx + 0.5, -2.4], [cx + 0.5, -4.4]];
      P.form(lancet, { w: 1.8 });
      for (let y = -2.3; y > -4.4; y -= 0.32) P.line([[cx - 0.42, y], [cx + 0.42, y - 0.12]], { w: 0.9, alpha: 0.55, taper: 0.2 });
      void win;
    }

    // back of the belfry: a low far parapet with blind arcading, dim
    P.line([[-5.9, 1.7], [5.9, 1.7]], { w: 1.1, alpha: 0.35, taper: 0.2 });
    P.line([[-5.9, 0.9], [5.9, 0.9]], { w: 1, alpha: 0.25, taper: 0.2 });
    for (let x = -5.6; x < 5.0; x += 0.9) P.line([[x, 0.95], [x, 1.3], [x + 0.2, 1.52], [x + 0.45, 1.6], [x + 0.7, 1.52], [x + 0.9, 1.3]], { w: 0.8, alpha: 0.22, taper: 0.4 });

    // floor slab with corbels under it
    P.form([[-8, 0], [8, 0], [8, -0.62], [-8, -0.62]], { w: 2.4 });
    P.line([[-7.95, -0.2], [7.95, -0.2]], { w: 1, alpha: 0.5, taper: 0.3 });
    for (let x = -7.4; x < 7.5; x += 1.2) P.form([[x - 0.18, -0.62], [x + 0.18, -0.62], [x + 0.14, -0.88], [x, -1.05], [x - 0.14, -0.88]], { w: 1.3, alpha: 0.8 });

    // the great pointed arch of the belfry opening, on two pillars
    const ys = 3.6, ai = 5.9, R = 6.8, ao = 6.6, Ro = 7.6;
    const arcPts = (half, rad, n) => {
      const c = rad - half, out = [];
      const hgt = Math.sqrt(rad * rad - c * c);
      for (let i = 0; i <= n; i++) { const y = ys + (hgt * i) / n; out.push([c - Math.sqrt(rad * rad - (y - ys) * (y - ys)), y]); }
      return out;
    };
    const inL = arcPts(ai, R, 18), outL = arcPts(ao, Ro, 18);
    const inner = inL.concat(inL.slice(0, -1).reverse().map((q) => [-q[0], q[1]]));
    // spandrel walls above the arch, then the opening is masked back out
    const wallTop = 10.6;
    const shell = [[-7.05, 0], [-5.9, 0], ...inner.map((q) => q), [5.9, 0], [7.05, 0], [7.05, wallTop], [-7.05, wallTop]];
    P.mask(shell);
    // stone courses in the spandrels and pillars, dim
    for (let i = 0, y = 0.6; y < wallTop; y += 0.55, i++) {
      for (const sx of [-1, 1]) {
        const xin = y < ys ? 5.9 : Math.abs(inner.reduce((best, q) => (Math.abs(q[1] - y) < Math.abs(best[1] - y) && q[0] < 0 ? q : best), inner[0])[0]);
        if (xin > 7.0) continue;
        P.line([[sx * (xin + 0.75), y], [sx * 7.0, y]], { w: 0.8, alpha: y < ys ? 0.4 : 0.3, taper: 0.3 });
        const j = xin + 0.75 + ((i % 2) ? 0.35 : 0.0);
        if (j < 6.9) P.line([[sx * j, y], [sx * j, y + 0.55]], { w: 0.8, alpha: 0.28, taper: 0.3 });
      }
    }
    // voussoirs: the arch ring, with radial joints
    for (const sx of [-1, 1]) {
      const iL = inL.map((q) => [sx < 0 ? q[0] : -q[0], q[1]]);
      const oL = outL.map((q) => [sx < 0 ? q[0] : -q[0], q[1]]);
      P.line(iL, { w: 2.6, taper: 0.1 });
      P.line(oL, { w: 1.8, alpha: 0.85, taper: 0.1 });
      for (let i = 2; i < 18; i += 2) P.line([iL[i], oL[i]], { w: 1, alpha: 0.6, taper: 0.2 });
      // pillar faces and the capital at the springing
      P.line([[sx * 5.9, 0], [sx * 5.9, ys]], { w: 2.6, taper: 0.05 });
      P.line([[sx * 7.05, 0], [sx * 7.05, 10.5]], { w: 2.2, taper: 0.05 });
      P.form([[sx * 5.75, ys - 0.05], [sx * 7.05, ys - 0.05], [sx * 7.05, ys + 0.3], [sx * 5.75, ys + 0.3]], { w: 1.8 });
      P.form([[sx * 5.75, 0], [sx * 7.05, 0], [sx * 7.05, 0.5], [sx * 5.75, 0.5]], { w: 1.8 });
      P.hatch([[sx * 5.9, 0.5], [sx * 6.3, 0.5], [sx * 6.3, ys - 0.05], [sx * 5.9, ys - 0.05]], { angle: 1.3, gap: 4.5, alpha: 0.45 });
      // brace from the pillar up to the beam
      P.form([[sx * 5.9, 1.05], [sx * 4.75, 2.14], [sx * 4.45, 2.14], [sx * 5.9, 1.5]], { w: 1.6 });
    }
    // keystone
    const kTop = inner[18][1];
    P.form([[-0.3, kTop - 0.05], [0.3, kTop - 0.05], [0.42, kTop + 0.8], [-0.42, kTop + 0.8]], { w: 1.8 });

    // the roof beams (soft platforms)
    for (const s of layout.soft.slice(0, 2)) {
      P.form([[s.x0, s.y], [s.x1, s.y], [s.x1, s.y - 0.36], [s.x0, s.y - 0.36]], { w: 2.2 });
      P.line([[s.x0 + 0.3, s.y - 0.17], [s.x1 - 0.7, s.y - 0.2]], { w: 0.9, alpha: 0.5, taper: 0.8 });
      P.line(E(s.x0 + 0.12, s.y - 0.18, 0.06, 0.12, 0, 10), { w: 0.9, alpha: 0.6, closed: true });
      P.line(E(s.x1 - 0.12, s.y - 0.18, 0.06, 0.12, 0, 10), { w: 0.9, alpha: 0.6, closed: true });
      for (const x of [s.x0 + 0.5, s.x1 - 0.5]) P.line([[x, s.y - 0.02], [x, s.y - 0.34]], { w: 1.4, alpha: 0.7, taper: 0.1 });
    }

    // iron rods from the arch down to the high beam, behind the bell
    for (const x of [-1.25, 1.25]) {
      P.line([[x, 4.8], [x, 10.0]], { w: 1.5, alpha: 0.8, taper: 0.1 });
      for (let y = 5.4; y < 9.9; y += 0.55) P.line(E(x, y, 0.07, 0.2, 0, 8), { w: 0.8, alpha: 0.45, closed: true });
    }
    const top = layout.soft[2];
    P.form([[top.x0, top.y], [top.x1, top.y], [top.x1, top.y - 0.36], [top.x0, top.y - 0.36]], { w: 2.2 });
    P.line([[top.x0 + 0.4, top.y - 0.19], [top.x1 - 0.5, top.y - 0.17]], { w: 0.9, alpha: 0.5, taper: 0.8 });

    // the great bell
    const bell = S([[0, 9.2], [0.78, 9.15], [1.0, 8.85], [1.05, 8.2], [1.18, 7.6], [1.45, 7.2], [1.78, 6.95], [1.72, 6.82], [0, 6.78], [-1.72, 6.82], [-1.78, 6.95], [-1.45, 7.2], [-1.18, 7.6], [-1.05, 8.2], [-1.0, 8.85], [-0.78, 9.15]], 6, true);
    P.form(bell, { w: 2.4, tint: 'gold', wash: 0.12 });
    P.hatch(S([[-1.0, 8.85], [-1.05, 8.2], [-1.18, 7.6], [-1.45, 7.2], [-1.75, 6.9], [-0.7, 6.85], [-0.45, 7.6], [-0.5, 8.9]], 5, true), { angle: 1.4, gap: 5, tint: 'gold', alpha: 0.7 });
    P.line(S([[-1.02, 8.6], [0, 8.55], [1.02, 8.6]], 6), { w: 1.1, alpha: 0.7, taper: 0.3 });
    P.line(S([[-1.02, 8.45], [0, 8.4], [1.03, 8.45]], 6), { w: 1.1, alpha: 0.7, taper: 0.3 });
    P.line(S([[-1.5, 7.18], [0, 7.1], [1.5, 7.18]], 6), { w: 1.2, alpha: 0.75, taper: 0.3 });
    P.line(E(0, 6.86, 1.62, 0.12, 0, 26), { w: 1, alpha: 0.6, closed: true });
    P.form(E(0.06, 6.74, 0.15, 0.13, 0, 14), { w: 1.4 });
    // crown loops and the iron hanger from the keystone
    for (const x of [-0.35, 0, 0.35]) P.line(A(x, 9.2, 0.13, Math.PI, 0, 8, -0.2).map((q) => [q[0], 9.2 + (9.2 - q[1])]), { w: 1.4, taper: 0.2 });
    P.form([[-0.9, 9.32], [0.9, 9.32], [0.9, 9.6], [-0.9, 9.6]], { w: 1.8 });
    P.line([[0, 9.6], [0, kTop]], { w: 2.2, taper: 0.05 });
    void rect;

    // standing surfaces, heaviest lines on the stage
    P.walk(layout.main.x0, layout.main.x1, 0, { w: 5.2 });
    for (const s of layout.soft) P.walk(s.x0, s.x1, s.y);

    P.figure(-2.2, 0);
    P.figure(4.3, 2.5, true);
  }

  STAGES.push({ id: 'belfry', name: 'The Belfry', look: 'The open top of a bell tower at night, fought on the floor and roof beams under a great bronze bell, with the town and a low moon far below.', layout, draw });
})();
