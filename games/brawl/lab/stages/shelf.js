// The Long Shelf: the top of the library's tallest bookcase. The books are giant; the fighters are small.
(function () {
  const layout = {
    main: { x0: -8, x1: 8, y: 0 },
    soft: [{ x0: -7.0, x1: -4.4, y: 2.3 }, { x0: -4.0, x1: -1.2, y: 4.6 }, { x0: 2.6, x1: 5.4, y: 2.5 }, { x0: 2.6, x1: 5.4, y: 5.0 }],
  };
  const SPINE_TINTS = ['coral', 'green', 'blue', 'gold'];

  function draw(ctx, view) {
    const P = StageKit.pen(ctx, view);
    const { S, E } = P;
    P.clear();

    // the vaults beyond: ribbed pointed arches on thin far columns, very dim
    const cols = [-12.5, -6.5, -0.5, 5.5, 11.5];
    for (const x of cols) {
      P.line([[x - 0.25, -4.2], [x - 0.25, 5.4]], { w: 1, alpha: 0.3, taper: 0.1 });
      P.line([[x + 0.25, -4.2], [x + 0.25, 5.4]], { w: 1, alpha: 0.3, taper: 0.1 });
      P.line([[x - 0.45, 5.4], [x + 0.45, 5.4]], { w: 1, alpha: 0.3, taper: 0.2 });
    }
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i] + 0.25, b = cols[i + 1] - 0.25, m = (a + b) / 2;
      P.line(S([[a, 5.4], [a + 0.6, 8.0], [m - 1.0, 9.9], [m, 10.4]], 8), { w: 1.1, alpha: 0.3, taper: 0.3 });
      P.line(S([[b, 5.4], [b - 0.6, 8.0], [m + 1.0, 9.9], [m, 10.4]], 8), { w: 1.1, alpha: 0.3, taper: 0.3 });
      P.line(S([[a, 5.4], [m - 1.4, 8.6], [m + 0.8, 10.6]], 8), { w: 0.8, alpha: 0.18, taper: 0.5 });
      P.line(S([[b, 5.4], [m + 1.4, 8.6], [m - 0.8, 10.6]], 8), { w: 0.8, alpha: 0.18, taper: 0.5 });
      // far bookcases between the columns: shelves and thin spines
      for (let y = 4.6; y > -4.2; y -= 1.1) {
        P.line([[a + 0.1, y], [b - 0.1, y]], { w: 0.8, alpha: 0.24, taper: 0.2 });
        const r = StageKit.rng(40 + i * 13 + Math.round(y * 10));
        for (let x = a + 0.2; x < b - 0.3; x += 0.14 + r() * 0.16) {
          if (r() < 0.12) { x += 0.3; continue; }
          P.line([[x, y + 0.05], [x + (r() < 0.1 ? 0.15 : 0), y + 0.55 + r() * 0.35]], { w: 0.7, alpha: 0.17, taper: 0.2, wobble: 0.3 });
        }
      }
    }

    // the brass rail the ladder hangs from
    P.line([[-13, 9.35], [13, 9.35]], { w: 1.8, tint: 'gold', alpha: 0.75, taper: 0.05 });
    for (const x of [-9.5, -3, 3.5, 10]) P.line([[x, 9.35], [x, 9.9]], { w: 1.4, tint: 'gold', alpha: 0.6, taper: 0.1 });

    // pages hung on strings
    const strings = [[[-13, 8.2], [-10.6, 7.4], [-8.4, 7.9]], [[8.6, 8.3], [10.6, 7.5], [13, 8.0]]];
    strings.forEach((st, si) => {
      const pts = S(st, 10);
      P.line(pts, { w: 0.9, alpha: 0.55, taper: 0.2 });
      const r = StageKit.rng(70 + si);
      for (let i = 3; i < pts.length - 3; i += 4) {
        const [x, y] = pts[i], tilt = (r() - 0.5) * 0.25, w = 0.55 + r() * 0.2, h = 0.75 + r() * 0.2;
        const c = Math.cos(tilt), s = Math.sin(tilt);
        const q = (dx, dy) => [x + dx * c - dy * s, y + dx * s + dy * c];
        const page = [q(-w / 2, 0), q(w / 2, 0), q(w / 2, -h), q(-w / 2, -h)];
        P.form(page, { w: 1.1, alpha: 0.7 });
        for (let k = 1; k < 5; k++) P.line([q(-w / 2 + 0.1, -k * h / 5.5), q(w / 2 - 0.1 - (k === 4 ? 0.2 : 0), -k * h / 5.5)], { w: 0.7, alpha: 0.4, taper: 0.4 });
      }
    });

    // the chandelier: a ring of candles on a chain, the warm centre
    P.line([[0.4, 10.6], [0.4, 8.1]], { w: 1.3, alpha: 0.8, taper: 0.05 });
    for (let y = 10.3; y > 8.2; y -= 0.24) P.line(E(0.4, y, 0.05, 0.11, 0, 8), { w: 0.8, alpha: 0.6, closed: true });
    P.line([[0.4, 8.1], [-0.9, 7.25]], { w: 1, alpha: 0.6 });
    P.line([[0.4, 8.1], [1.7, 7.25]], { w: 1, alpha: 0.6 });
    P.form(E(0.4, 7.2, 1.45, 0.2, 0, 30), { w: 1.8 });
    for (const [x, h] of [[-0.75, 0.55], [-0.15, 0.7], [0.95, 0.62], [1.55, 0.5], [0.4, 0.8]]) {
      P.form([[x - 0.1, 7.22], [x + 0.1, 7.22], [x + 0.1, 7.22 + h], [x - 0.1, 7.22 + h]], { w: 1.3 });
      const fy = 7.22 + h + 0.05;
      P.form(S([[x, fy], [x + 0.09, fy + 0.12], [x + 0.02, fy + 0.34], [x - 0.08, fy + 0.13]], 5, true), { w: 1.1, tint: 'gold', wash: 0.55 });
    }

    // the bookcase under the deck: cornice, then a shelf of giant spines
    const caseBody = [[-7.7, -0.85], [7.7, -0.85], [7.7, -4.4], [-7.7, -4.4]];
    P.mask(caseBody);
    P.line([[-7.7, -0.85], [-7.7, -4.4]], { w: 2.4, taper: 0.1 });
    P.line([[7.7, -0.85], [7.7, -4.4]], { w: 2.4, taper: 0.1 });
    P.line([[-7.25, -0.85], [-7.25, -4.4]], { w: 1.2, alpha: 0.6, taper: 0.1 });
    P.line([[7.25, -0.85], [7.25, -4.4]], { w: 1.2, alpha: 0.6, taper: 0.1 });
    P.form([[-7.25, -3.55], [7.25, -3.55], [7.25, -3.85], [-7.25, -3.85]], { w: 1.8 });
    const rs = StageKit.rng(5);
    let x = -7.1;
    while (x < 7.0) {
      const bw = 0.32 + rs() * 0.42, h = 2.1 + rs() * 0.45;
      if (x + bw > 7.15) break;
      if (rs() < 0.07) { // a gap with one leaning volume
        const lw = 0.45, lean = 0.5;
        const pts = [[x + 0.05, -3.55], [x + 0.05 + lw, -3.55], [x + 0.05 + lw + lean, -3.55 + h * 0.95], [x + 0.05 + lean, -3.55 + h * 0.97]];
        P.form(pts, { w: 1.6 });
        x += lw + lean + 0.15; continue;
      }
      const sp = [[x, -3.55], [x + bw, -3.55], [x + bw, -3.55 + h], [x, -3.55 + h]];
      const t = rs() < 0.22 ? SPINE_TINTS[Math.floor(rs() * 4)] : null;
      P.form(sp, { w: 1.5, wash: t ? 0.16 : 0, tint: undefined, washTint: t });
      const top = -3.55 + h;
      P.line([[x + 0.05, top - 0.3], [x + bw - 0.05, top - 0.3]], { w: 0.9, alpha: 0.6, taper: 0.2 });
      P.line([[x + 0.05, top - 0.38], [x + bw - 0.05, top - 0.38]], { w: 0.9, alpha: 0.6, taper: 0.2 });
      P.line([[x + 0.05, -3.25], [x + bw - 0.05, -3.25]], { w: 0.9, alpha: 0.5, taper: 0.2 });
      if (bw > 0.5 && rs() < 0.6) P.line(E(x + bw / 2, top - 1.0, bw * 0.22, 0.3, 0, 14), { w: 0.9, alpha: 0.45, closed: true });
      if (rs() < 0.35) P.hatch(sp, { angle: 1.35, gap: 5, alpha: 0.28 });
      x += bw;
    }
    // cornice moulding: the deck's face
    P.form([[-8, 0], [8, 0], [8, -0.3], [7.85, -0.42], [7.7, -0.42], [7.7, -0.85], [-7.7, -0.85], [-7.7, -0.42], [-7.85, -0.42], [-8, -0.3]], { w: 2.4 });
    P.line([[-7.9, -0.3], [7.9, -0.3]], { w: 1, alpha: 0.6, taper: 0.2 });
    for (let xx = -7.4; xx < 7.5; xx += 0.5) P.line([[xx, -0.5], [xx, -0.78]], { w: 0.9, alpha: 0.5, taper: 0.3 });

    // the rolling ladder: giant, hooked to the rail, feet on the shelf
    for (const lx of [2.35, 5.65]) {
      P.form([[lx - 0.14, 0], [lx + 0.14, 0], [lx + 0.14, 9.2], [lx - 0.14, 9.2]], { w: 1.8 });
      P.line(S([[lx, 9.2], [lx - 0.05, 9.55], [lx + 0.18, 9.62], [lx + 0.22, 9.38]], 5), { w: 1.6, tint: 'gold' });
      P.form(E(lx, 0.12, 0.16, 0.16, 0, 12), { w: 1.4 });
    }
    for (const y of [7.5]) P.form([[2.5, y], [5.5, y], [5.5, y - 0.2], [2.5, y - 0.2]], { w: 1.4, alpha: 0.7 });
    for (const s of layout.soft.slice(2)) {
      P.form([[s.x0 - 0.1, s.y], [s.x1 + 0.1, s.y], [s.x1 + 0.1, s.y - 0.26], [s.x0 - 0.1, s.y - 0.26]], { w: 2 });
    }

    // stacks of giant folios (soft platforms): lying books, the top cover is the place to stand
    function stack(x0, x1, y0, y1, seed) {
      const r = StageKit.rng(seed);
      let y = y0;
      const books = [];
      while (y < y1 - 0.05) {
        const th = Math.min(y1 - y, 0.35 + r() * 0.35);
        const inset0 = y + th >= y1 - 0.01 ? 0 : (r() - 0.3) * 0.4, inset1 = y + th >= y1 - 0.01 ? 0 : (r() - 0.3) * 0.4;
        books.push([x0 + inset0, x1 - inset1, y, y + th]);
        y += th;
      }
      books.forEach(([a, b, ya, yb], i) => {
        const t = r() < 0.3 ? SPINE_TINTS[(seed + i) % 4] : null;
        P.form([[a, ya], [b, ya], [b, yb], [a, yb]], { w: 1.7, wash: t ? 0.16 : 0, washTint: t });
        // page block on the fore-edge
        const pe = r() < 0.5 ? a : b - 0.25;
        for (let k = 1; k < 4; k++) P.line([[pe + 0.04, ya + (yb - ya) * k / 4], [pe + 0.24, ya + (yb - ya) * k / 4]], { w: 0.7, alpha: 0.5, taper: 0.3 });
        P.line([[pe, ya + 0.04], [pe, yb - 0.04]], { w: 0.9, alpha: 0.6, taper: 0.2 });
        if (r() < 0.5) P.line([[(a + b) / 2 - 0.4, (ya + yb) / 2], [(a + b) / 2 + 0.4, (ya + yb) / 2]], { w: 0.8, alpha: 0.45, taper: 0.5 });
      });
    }
    stack(-7.0, -4.4, 0, 2.3, 3);
    stack(-4.0, -1.2, 0, 4.6, 8);

    // a guttered candle on the shelf's back corner
    P.form([[6.55, 0], [7.15, 0], [7.15, 1.35], [6.95, 1.45], [6.8, 1.3], [6.55, 1.4]], { w: 1.6 });
    P.line(S([[6.6, 1.35], [6.62, 0.9], [6.58, 0.6]], 4), { w: 1, alpha: 0.6 });
    P.form(S([[6.85, 1.5], [6.98, 1.66], [6.87, 2.05], [6.74, 1.68]], 5, true), { w: 1.2, tint: 'gold', wash: 0.55 });

    P.walk(layout.main.x0, layout.main.x1, 0, { w: 5.2 });
    for (const s of layout.soft) P.walk(s.x0, s.x1, s.y);

    P.figure(-0.4, 0);
    P.figure(4.0, 5.0, true);
  }

  STAGES.push({ id: 'shelf', name: 'The Long Shelf', look: 'The top of the tallest bookcase in the library, among stacks of giant books and the rungs of a rolling ladder, under a hanging ring of candles.', layout, draw });
})();
