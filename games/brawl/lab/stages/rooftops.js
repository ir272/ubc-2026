// Lamp Street: across the rooftops of an old town at night. The street lamps below are the only warm colour.
(function () {
  const layout = {
    main: { x0: -8, x1: 8, y: 0 },
    soft: [{ x0: -6.4, x1: -3.6, y: 2.5 }, { x0: -1.5, x1: 1.5, y: 4.8 }, { x0: 2.6, x1: 5.4, y: 2.5 }],
  };

  function draw(ctx, view) {
    const P = StageKit.pen(ctx, view);
    const { S, E } = P;
    P.clear();

    P.sky(23, [-13, 1.5, 13, 10.5], 90, [[-11.2, 9.2, 0.3], [-7.4, 6.8, 0.22, 0.6], [6.8, 9.6, 0.34], [11.4, 7.4, 0.24, 0.65]],
      (x, y) => Math.hypot(x - 9.6, y - 8.6) < 1.2);
    // a thin cream crescent, no colour, the lamps keep the warmth
    P.line(P.A(9.6, 8.6, 0.8, 1.9, 4.6, 20), { w: 1.8, taper: 0.8 });
    P.line(S([[9.45, 9.35], [9.15, 8.6], [9.5, 7.85]], 8), { w: 1.1, alpha: 0.7, taper: 0.9 });

    // the far town: a long skyline, thin and dim, with a church
    P.town(-13.2, 13.2, 0.3, -4.5, { seed: 41, hMin: 0.3, hMax: 1.6, wMin: 0.5, wMax: 1.2, alpha: 0.3, w: 0.9, tint: 'blue', spire: 0.05 });
    P.town(-13.2, 13.2, -0.9, -4.5, { seed: 44, hMin: 0.4, hMax: 1.6, wMin: 0.8, wMax: 1.6, alpha: 0.45, w: 1.1, tint: 'blue', spire: 0.03 });

    // nearer houses beside the deck, lower, with pitched roofs and chimneys (not places to stand)
    function house(x0, x1, eave, ridge, seed, flip) {
      const m = (x0 + x1) / 2;
      const shape = [[x0, -4.5], [x0, eave], [m, ridge], [x1, eave], [x1, -4.5]];
      P.mask(shape);
      P.line(shape, { w: 1.8, alpha: 0.85, taper: 0.1 });
      const r = StageKit.rng(seed);
      // roof tiles: short strokes in rows down both slopes
      for (let k = 1; k < 5; k++) {
        const t = k / 5;
        for (let u = 0.12; u < 0.9; u += 0.16) {
          const xa = x0 + (m - x0) * u, ya = eave + (ridge - eave) * u - t * 0.0;
          const xb = x1 - (x1 - m) * u, yb = ya;
          const d = 0.35 * t;
          if (r() < 0.5) P.line([[xa + d, ya - d * 0.3], [xa + d + 0.1, ya - d * 0.3 - 0.06]], { w: 0.8, alpha: 0.35, taper: 0.4 });
          if (r() < 0.5) P.line([[xb - d, yb - d * 0.3], [xb - d - 0.1, yb - d * 0.3 - 0.06]], { w: 0.8, alpha: 0.35, taper: 0.4 });
        }
      }
      for (let y = eave - 0.2; y > eave - 0.4; y -= 1) P.line([[x0 - 0.15, eave], [x1 + 0.15, eave]], { w: 1.2, alpha: 0.7, taper: 0.2 });
      // windows, dark
      for (let y = eave - 1.0; y > -4.2; y -= 1.6) {
        for (let x = x0 + 0.5; x < x1 - 0.8; x += 1.2) {
          const win = [[x, y], [x + 0.55, y], [x + 0.55, y - 0.85], [x, y - 0.85]];
          P.line(win, { w: 1, alpha: 0.55, closed: true });
          P.line([[x + 0.275, y], [x + 0.275, y - 0.85]], { w: 0.8, alpha: 0.4, taper: 0.1 });
          if (r() < 0.5) P.hatch(win, { angle: 1.2, gap: 3.5, alpha: 0.4 });
        }
      }
      // chimney
      const cx = m + (flip ? -1 : 1) * (x1 - x0) * 0.22;
      const cy = eave + (ridge - eave) * (1 - Math.abs(cx - m) / ((x1 - x0) / 2));
      P.form([[cx - 0.2, cy - 0.1], [cx + 0.2, cy - 0.1], [cx + 0.2, cy + 0.65], [cx - 0.2, cy + 0.65]], { w: 1.3, alpha: 0.8 });
    }
    house(-13.4, -9.4, -1.8, -0.2, 3, true);
    house(9.2, 13.4, -2.4, -0.9, 4, false);

    // street lamps far below in the gaps: the warm notes
    for (const [x, base, top] of [[-8.75, -4.5, -1.7], [8.55, -4.5, -2.0], [12.2, -4.5, -3.0]]) {
      P.line([[x, base], [x, top]], { w: 1.4, alpha: 0.85, taper: 0.1 });
      P.line(S([[x, top], [x + 0.3, top + 0.25], [x + 0.55, top + 0.1]], 5), { w: 1.2, alpha: 0.85 });
      const lx = x + 0.55, ly = top - 0.05;
      const cage = [[lx - 0.22, ly], [lx + 0.22, ly], [lx + 0.15, ly - 0.45], [lx - 0.15, ly - 0.45]];
      P.form(cage, { w: 1.4, tint: 'gold', wash: 0.5 });
      P.form(S([[lx, ly - 0.08], [lx + 0.07, ly - 0.22], [lx, ly - 0.38], [lx - 0.07, ly - 0.22]], 5, true), { w: 1, tint: 'yellow', wash: 0.8 });
      // the lit cobbles: a short run of gold hatch on the street under it
      P.hatch(S([[lx - 0.9, -4.5], [lx - 0.5, -3.9], [lx + 0.6, -3.9], [lx + 1.0, -4.5]], 4, true), { angle: 0.25, gap: 4, tint: 'gold', alpha: 0.45 });
    }

    // the main building: a flat roof with a coping, brick front, dark windows
    const body = [[-7.6, -0.42], [7.6, -0.42], [7.6, -4.5], [-7.6, -4.5]];
    P.mask(body);
    P.line([[-7.6, -0.42], [-7.6, -4.5]], { w: 2.4, taper: 0.1 });
    P.line([[7.6, -0.42], [7.6, -4.5]], { w: 2.4, taper: 0.1 });
    for (let i = 0, y = -0.8; y > -4.5; y -= 0.38, i++) {
      if (i % 3) continue;
      P.line([[-7.55, y], [7.55, y]], { w: 0.8, alpha: 0.18, taper: 0.4 });
    }
    for (const x of [-6.2, -3.6, -1.0, 1.6, 4.2]) {
      const win = [[x, -1.3], [x + 1.1, -1.3], [x + 1.1, -3.1], [x, -3.1]];
      P.form([[x - 0.12, -3.1], [x + 1.22, -3.1], [x + 1.22, -3.28], [x - 0.12, -3.28]], { w: 1.3 });
      P.form(win, { w: 1.7 });
      P.line([[x + 0.55, -1.3], [x + 0.55, -3.1]], { w: 1, alpha: 0.75, taper: 0.1 });
      P.line([[x, -2.2], [x + 1.1, -2.2]], { w: 1, alpha: 0.75, taper: 0.1 });
      P.hatch(win, { angle: 1.25, gap: 4, alpha: 0.3 });
      P.line([[x - 0.12, -1.3], [x + 0.55, -1.0], [x + 1.22, -1.3]], { w: 1.2, alpha: 0.8 });
    }
    // drainpipe
    P.line([[7.25, -0.42], [7.25, -4.5]], { w: 1.6, alpha: 0.8, taper: 0.05 });
    P.line([[6.95, -0.42], [7.4, -0.42]], { w: 1.4, alpha: 0.8 });
    // the coping
    P.form([[-8, 0], [8, 0], [8, -0.42], [-8, -0.42]], { w: 2.4 });
    P.line([[-7.95, -0.15], [7.95, -0.15]], { w: 1, alpha: 0.5, taper: 0.3 });

    // the stair tower behind the roof, with the sign bracket off its side
    const tw = [[-3.1, 0], [-1.55, 0], [-1.55, 7.2], [-2.32, 8.6], [-3.1, 7.2]];
    P.form(tw, { w: 1.8, alpha: 0.85 });
    P.line([[-3.25, 7.2], [-1.4, 7.2]], { w: 1.4, alpha: 0.85 });
    for (let y = 0.5; y < 7.0; y += 0.45) P.line([[-3.05, y], [-1.6, y]], { w: 0.7, alpha: 0.22, taper: 0.3 });
    P.form([[-2.6, 5.6], [-2.05, 5.6], [-2.05, 6.5], [-2.32, 6.75], [-2.6, 6.5]], { w: 1.3 });
    P.hatch([[-2.6, 5.6], [-2.05, 5.6], [-2.05, 6.5], [-2.6, 6.5]], { angle: 1.2, gap: 3, alpha: 0.6 });
    P.hatch([[-3.1, 0], [-2.7, 0], [-2.7, 7.2], [-3.1, 7.2]], { angle: 1.3, gap: 4.5, alpha: 0.35 });

    // the chimney stack (soft platform is its cap)
    const ch = layout.soft[0];
    const stack = [[ch.x0 + 0.5, 0], [ch.x1 - 0.5, 0], [ch.x1 - 0.5, ch.y - 0.3], [ch.x0 + 0.5, ch.y - 0.3]];
    P.form(stack, { w: 2 });
    for (let i = 0, y = 0.3; y < ch.y - 0.35; y += 0.3, i++) {
      P.line([[ch.x0 + 0.5, y], [ch.x1 - 0.5, y]], { w: 0.8, alpha: 0.4, taper: 0.2 });
      for (let x = ch.x0 + 0.5 + (i % 2) * 0.3 + 0.3; x < ch.x1 - 0.55; x += 0.6) P.line([[x, y - 0.3], [x, y]], { w: 0.7, alpha: 0.35, taper: 0.2 });
    }
    P.hatch(S([[ch.x0 + 0.5, ch.y - 0.3], [ch.x1 - 0.5, ch.y - 0.3], [ch.x1 - 0.5, ch.y - 1.0], [ch.x0 + 1.2, ch.y - 0.7], [ch.x0 + 0.5, ch.y - 1.3]], 3, true), { angle: 1.2, gap: 3.2, alpha: 0.55 });
    P.form([[ch.x0, ch.y], [ch.x1, ch.y], [ch.x1, ch.y - 0.3], [ch.x0, ch.y - 0.3]], { w: 2 });

    // the washing pole, its arm a platform; a line of washing to the tower
    const ar = layout.soft[2];
    const px = ar.x1 + 0.12;
    P.form([[px - 0.11, 0], [px + 0.11, 0], [px + 0.09, 3.7], [px - 0.09, 3.7]], { w: 1.8 });
    P.form(E(px, 3.8, 0.14, 0.14, 0, 12), { w: 1.4 });
    P.form([[ar.x0, ar.y], [ar.x1, ar.y], [ar.x1, ar.y - 0.2], [ar.x0, ar.y - 0.2]], { w: 2 });
    P.line([[px - 0.1, 1.5], [ar.x1 - 1.0, ar.y - 0.2]], { w: 1.6, taper: 0.1 });
    P.form([[px - 0.14, 0], [px + 0.14, 0], [px + 0.14, 0.3], [px - 0.14, 0.3]], { w: 1.2 });
    const wl = S([[px, 3.6], [1.6, 2.95], [-1.55, 3.55]], 12);
    P.line(wl, { w: 1, alpha: 0.75, taper: 0.1 });
    const at = (x) => { let best = wl[0]; for (const q of wl) if (Math.abs(q[0] - x) < Math.abs(best[0] - x)) best = q; return best[1]; };
    // a shirt, a sheet, two socks
    { const x = 3.6, y = at(3.6) - 0.02;
      const shirt = [[x - 0.35, y], [x + 0.35, y], [x + 0.6, y - 0.35], [x + 0.42, y - 0.48], [x + 0.3, y - 0.36], [x + 0.28, y - 1.05], [x - 0.3, y - 1.05], [x - 0.3, y - 0.36], [x - 0.42, y - 0.48], [x - 0.6, y - 0.35]];
      P.form(shirt, { w: 1.4, tint: 'blue', wash: 0.2 });
      P.line([[x - 0.12, y], [x, y - 0.18], [x + 0.12, y]], { w: 1, tint: 'blue', alpha: 0.8 }); }
    { const x0 = 0.9, x1 = 2.5, y0 = at(x0), y1 = at(x1);
      const sheet = [[x0, y0], ...S([[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - 0.05], [x1, y1]], 6), [x1, y1], [x1 + 0.08, y1 - 1.25], [x1 - 0.5, y1 - 1.18], [x0 + 0.6, y1 - 1.32], [x0 - 0.05, y0 - 1.2]];
      P.form(sheet, { w: 1.4 });
      P.line(S([[x0 + 0.5, y0 - 0.1], [x0 + 0.45, y0 - 0.7], [x0 + 0.6, y0 - 1.2]], 5), { w: 0.9, alpha: 0.5, taper: 0.7 });
      P.line(S([[x0 + 1.1, y1 - 0.1], [x0 + 1.15, y1 - 0.6], [x0 + 1.05, y1 - 1.1]], 5), { w: 0.9, alpha: 0.5, taper: 0.7 }); }
    for (const x of [-0.2, 0.25]) { const y = at(x); P.form([[x - 0.08, y], [x + 0.08, y], [x + 0.08, y - 0.42], [x + 0.2, y - 0.52], [x + 0.16, y - 0.62], [x - 0.08, y - 0.55]], { w: 1.1 }); }
    for (const x of [3.25, 3.95, 1.0, 2.4, -0.2, 0.25]) { const y = at(x); P.line([[x, y + 0.08], [x, y - 0.12]], { w: 1.4, alpha: 0.9, taper: 0 }); }

    // the sign bracket (top platform) with a blank hanging sign and a key drawn on it
    const sg = layout.soft[1];
    P.form([[sg.x0 - 0.06, sg.y], [sg.x1, sg.y], [sg.x1, sg.y - 0.14], [sg.x0 - 0.06, sg.y - 0.14]], { w: 1.8 });
    P.line(S([[sg.x0, sg.y - 1.3], [sg.x0 + 0.7, sg.y - 0.75], [sg.x0 + 1.7, sg.y - 0.3], [sg.x1 - 0.2, sg.y - 0.16]], 8), { w: 1.6 });
    P.line(S([[sg.x0 + 0.5, sg.y - 0.14], [sg.x0 + 0.85, sg.y - 0.5], [sg.x0 + 0.55, sg.y - 0.72], [sg.x0 + 0.35, sg.y - 0.5], [sg.x0 + 0.55, sg.y - 0.4]], 6), { w: 1.2, alpha: 0.85 });
    P.line(S([[sg.x0 + 1.4, sg.y - 0.14], [sg.x0 + 1.75, sg.y - 0.4], [sg.x0 + 2.0, sg.y - 0.28]], 6), { w: 1.1, alpha: 0.8 });
    for (const x of [sg.x0 + 0.85, sg.x1 - 0.35]) P.line([[x, sg.y - 0.14], [x, sg.y - 0.55]], { w: 1.1, alpha: 0.9, taper: 0 });
    const board = [[sg.x0 + 0.6, sg.y - 0.55], [sg.x1 - 0.1, sg.y - 0.55], [sg.x1 - 0.1, sg.y - 1.55], [sg.x0 + 0.6, sg.y - 1.55]];
    P.form(board, { w: 1.8 });
    P.line([[sg.x0 + 0.72, sg.y - 0.67], [sg.x1 - 0.22, sg.y - 0.67], [sg.x1 - 0.22, sg.y - 1.43], [sg.x0 + 0.72, sg.y - 1.43]], { w: 0.8, alpha: 0.55, closed: true });
    const kx = (sg.x0 + 0.6 + sg.x1 - 0.1) / 2, ky = sg.y - 1.05;
    P.line(E(kx - 0.42, ky, 0.15, 0.15, 0, 14), { w: 1.3, closed: true });
    P.line([[kx - 0.27, ky], [kx + 0.5, ky]], { w: 1.3, taper: 0.1 });
    P.line([[kx + 0.3, ky], [kx + 0.3, ky - 0.15]], { w: 1.2, taper: 0 });
    P.line([[kx + 0.46, ky], [kx + 0.46, ky - 0.2]], { w: 1.2, taper: 0 });

    P.walk(layout.main.x0, layout.main.x1, 0, { w: 5.2 });
    for (const s of layout.soft) P.walk(s.x0, s.x1, s.y);

    P.figure(-5.0, 2.5);
    P.figure(4.4, 0, true);
  }

  STAGES.push({ id: 'rooftops', name: 'Lamp Street', look: 'Across the rooftops of an old town at night, on a flat roof, a chimney, a washing pole and a sign bracket, with the street lamps lit far below.', layout, draw });
})();
