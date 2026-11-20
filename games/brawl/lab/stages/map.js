// The Map Table: the fight happens on the chart itself.
(function () {
  const layout = {
    main: { x0: -8, x1: 8, y: 0 },
    soft: [{ x0: -5.6, x1: -2.4, y: 2.5 }, { x0: 2.6, x1: 5.4, y: 2.5 }, { x0: -1.5, x1: 1.5, y: 4.8 }],
  };
  const B = { x0: -12.55, x1: 12.55, y0: -3.85, y1: 10.2 };

  function draw(ctx, view) {
    const P = StageKit.pen(ctx, view);
    const { S, E, A } = P;
    P.clear();

    // ruled lines across the chart
    for (const y of [7.4, -1.9]) P.line([[B.x0 + 0.4, y], [B.x1 - 0.4, y]], { w: 0.9, alpha: 0.38, taper: 0.1 });
    for (const x of [-9.4, 10.4]) P.line([[x, B.y0 + 0.4], [x, B.y1 - 0.4]], { w: 0.9, alpha: 0.38, taper: 0.1 });

    // rhumb lines from the two roses, clipped to the chart
    ctx.save();
    const c0 = view.p(B.x0 + 0.4, B.y1 - 0.4), c1 = view.p(B.x1 - 0.4, B.y0 + 0.4);
    ctx.beginPath(); ctx.rect(c0[0], c0[1], c1[0] - c0[0], c1[1] - c0[1]); ctx.clip();
    const roses = [[-9.4, 7.4, 1.75], [10.4, -1.9, 1.2]];
    roses.forEach(([cx, cy], ri) => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.0001;
        P.line([[cx, cy], [cx + Math.cos(a) * 30, cy + Math.sin(a) * 30]], { w: 0.8, alpha: i % 2 ? 0.16 : 0.3, tint: i % 4 === 0 ? null : 'gold', taper: 0.05, seed: 300 + ri * 20 + i });
      }
    });
    // a big wind circle around the first rose
    P.line(A(-9.4, 7.4, 5.6, -1.4, 0.4, 40), { w: 0.9, alpha: 0.3, tint: 'gold', taper: 0.3 });
    ctx.restore();

    // compass roses
    function rose(cx, cy, R) {
      P.form(E(cx, cy, R, R, 0, 60), { w: 1.6 });
      P.line(E(cx, cy, R * 0.9, R * 0.9, 0, 60), { w: 1.1, tint: 'gold', closed: true, alpha: 0.9 });
      P.line(E(cx, cy, R * 0.62, R * 0.62, 0, 50), { w: 1, closed: true, alpha: 0.7 });
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2, l = i % 4 === 0 ? 0.12 : 0.06;
        P.line([[cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9], [cx + Math.cos(a) * R * (0.9 + l), cy + Math.sin(a) * R * (0.9 + l)]], { w: 0.8, alpha: 0.7, taper: 0, wobble: 0.1 });
      }
      for (const [n, len, w] of [[8, 0.6, 0.075], [8, 1.0, 0.11], [4, 1.3, 0.14]]) {
        for (let i = 0; i < n; i++) {
          // short points sit between the others; the long four and the diagonal four share a step
          const ang = (i / n) * Math.PI * 2 + (len < 0.7 ? Math.PI / 8 : 0);
          const tip = [cx + Math.cos(ang) * R * len, cy + Math.sin(ang) * R * len];
          const l = [cx + Math.cos(ang + Math.PI / 2) * R * w, cy + Math.sin(ang + Math.PI / 2) * R * w];
          const rr = [cx + Math.cos(ang - Math.PI / 2) * R * w, cy + Math.sin(ang - Math.PI / 2) * R * w];
          if (len === 1.0 && i % 2 === 0) continue;
          P.form([[cx, cy], l, tip, rr], { w: len > 1.1 ? 1.5 : 1.1 });
          P.fill([[cx, cy], l, tip], len > 1.1 ? 'gold' : 'ink', len > 1.1 ? 0.55 : 0.35);
        }
      }
      P.form(E(cx, cy, R * 0.07, R * 0.07, 0, 12), { w: 1 });
      P.line([[cx, cy + R * 1.3], [cx - 0.12, cy + R * 1.3 - 0.3], [cx, cy + R * 1.3 + 0.45], [cx + 0.12, cy + R * 1.3 - 0.3], [cx, cy + R * 1.3]], { w: 1.2 });
    }
    rose(-9.4, 7.4, 1.75);
    rose(10.4, -1.9, 1.2);

    // the medallion: a moon and stars in a ring, green inside
    const mx = 4.4, my = 8.4;
    P.form(E(mx, my, 1.15, 1.15, 0, 50), { w: 1.8 });
    P.line(E(mx, my, 1.0, 1.0, 0, 50), { w: 1, closed: true, alpha: 0.8 });
    P.form(E(mx, my, 0.82, 0.82, 0, 44), { w: 1.2, tint: 'green', wash: 0.3 });
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; P.line([[mx + Math.cos(a) * 1.0, my + Math.sin(a) * 1.0], [mx + Math.cos(a) * 1.13, my + Math.sin(a) * 1.13]], { w: 0.7, alpha: 0.5, taper: 0, wobble: 0.1 }); }
    P.line(S([[mx + 0.12, my + 0.42], [mx - 0.28, my + 0.18], [mx - 0.26, my - 0.22], [mx + 0.12, my - 0.42]], 6), { w: 1.6, taper: 0.6 });
    P.line(S([[mx + 0.12, my + 0.42], [mx - 0.08, my + 0.05], [mx + 0.12, my - 0.42]], 6), { w: 1.1, taper: 0.7 });
    P.star(mx + 0.38, my + 0.3, 0.13, 0.9, 'gold'); P.star(mx + 0.45, my - 0.3, 0.1, 0.9, 'gold'); P.star(mx - 0.45, my - 0.45, 0.09, 0.8, 'gold');

    // the little ship, top right
    const sx = 9.6, sy = 7.6;
    P.form(S([[sx - 1.0, sy + 0.35], [sx + 1.0, sy + 0.35], [sx + 0.75, sy - 0.05], [sx - 0.7, sy - 0.05]], 4, true), { w: 1.4 });
    for (const [x, h] of [[sx - 0.45, 1.3], [sx + 0.2, 1.6]]) {
      P.line([[x, sy + 0.35], [x, sy + 0.35 + h]], { w: 1.1 });
      P.form([[x - 0.38, sy + 0.55 + h * 0.12], [x + 0.32, sy + 0.55 + h * 0.12], [x + 0.26, sy + 0.42 + h * 0.58], [x - 0.3, sy + 0.42 + h * 0.58]], { w: 1 });
      P.hatch([[x - 0.38, sy + 0.55 + h * 0.12], [x - 0.05, sy + 0.55 + h * 0.12], [x - 0.05, sy + 0.42 + h * 0.58], [x - 0.3, sy + 0.42 + h * 0.58]], { angle: 1.4, gap: 3, alpha: 0.5 });
      P.form([[x - 0.28, sy + 0.45 + h * 0.64], [x + 0.24, sy + 0.45 + h * 0.64], [x + 0.18, sy + 0.32 + h * 0.92], [x - 0.22, sy + 0.32 + h * 0.92]], { w: 1 });
    }
    P.line([[sx - 1.4, sy - 0.1], [sx + 1.3, sy - 0.08]], { w: 0.8, alpha: 0.5, tint: 'blue', taper: 0.8 });

    // little wave marks scattered on the open sea
    const rs = StageKit.rng(83);
    for (let i = 0; i < 26; i++) {
      const x = -11 + rs() * 22, y = -3.2 + rs() * 12.6;
      if (y < 0.6 && Math.abs(x) < 9) continue;
      if (Math.hypot(x + 9.4, y - 7.4) < 2.4 || Math.hypot(x - 4.4, y - 8.4) < 1.5 || Math.hypot(x - 9.6, y - 8.2) < 1.8 || Math.hypot(x - 10.4, y + 1.9) < 1.8) continue;
      if (y > 1.6 && y < 5.6 && x > -6.2 && x < 6.2) continue;
      P.line(S([[x - 0.22, y], [x - 0.11, y + 0.07], [x, y], [x + 0.11, y + 0.07], [x + 0.22, y]], 4), { w: 0.9, tint: 'blue', alpha: 0.55, taper: 0.5 });
    }

    // a small far islet and a rock, low and dim
    P.form(S([[-11.6, -3.0], [-10.9, -2.6], [-10.2, -2.9], [-10.4, -3.25], [-11.3, -3.3]], 5, true), { w: 1.1, alpha: 0.55 });
    P.line([[-11.1, -2.95], [-10.85, -2.68], [-10.6, -2.95]], { w: 0.9, alpha: 0.5 });

    // THE ISLAND: its north shore is the deck
    const coast = S([
      [8, 0], [8.05, -0.35], [7.7, -0.7], [7.9, -1.25], [7.4, -1.5], [7.2, -2.05], [6.5, -2.1], [6.2, -1.7], [5.8, -2.05], [5.9, -2.6], [5.1, -2.9], [4.3, -2.75],
      [3.9, -2.35], [3.2, -2.45], [2.7, -3.1], [2.0, -3.35], [1.3, -3.2], [0.9, -2.75], [0.3, -2.6], [-0.2, -3.0], [-1.2, -3.2], [-2.4, -2.95], [-2.8, -2.45],
      [-3.5, -2.3], [-4.0, -2.75], [-4.9, -2.9], [-5.6, -2.5], [-5.95, -2.0], [-6.6, -1.95], [-7.1, -1.45], [-7.65, -1.3], [-7.6, -0.75], [-8.05, -0.35], [-8, 0],
    ], 3);
    // blue shore ripples outside the coast (sides and south only)
    for (const [d, a] of [[0.18, 0.75], [0.36, 0.45], [0.56, 0.25]]) {
      const off = coast.map(([x, y]) => [x * (1 + d / 8.6), y * (1 + d / 2.4) - d * 0.4]);
      P.line(off.slice(3, -3), { w: 1.2, tint: 'blue', alpha: a, taper: 0.4 });
    }
    const island = coast.concat([[-8, 0]]);
    P.mask(island);
    // coloured hatching in patches like the reference
    P.hatch(S([[-7.2, -0.4], [-4.8, -0.5], [-4.6, -1.6], [-6.0, -2.1], [-7.2, -1.4]], 5, true), { angle: 0.9, gap: 4, tint: 'green', alpha: 0.6 });
    P.hatch(S([[-1.8, -0.5], [1.6, -0.4], [2.2, -1.4], [0.6, -2.3], [-1.6, -1.7]], 5, true), { angle: 0.7, gap: 4.5, tint: 'coral', alpha: 0.5 });
    P.hatch(S([[3.4, -0.5], [6.8, -0.4], [6.6, -1.4], [4.6, -2.2], [3.3, -1.5]], 5, true), { angle: 1.0, gap: 4, tint: 'yellow', alpha: 0.5 });
    // mountains
    for (const [x, y, w, h] of [[-0.6, -1.45, 0.7, 0.75], [0.25, -1.55, 0.6, 0.6], [1.0, -1.35, 0.5, 0.48], [-1.3, -1.25, 0.45, 0.4]]) {
      P.form([[x - w / 2, y], [x - w * 0.05, y + h], [x + w / 2, y]], { w: 1.3, open: true });
      P.hatch([[x - w * 0.05, y + h], [x + w / 2, y], [x + w * 0.05, y]], { angle: 1.4, gap: 3, alpha: 0.6 });
    }
    // little trees
    const rt = StageKit.rng(61);
    for (let i = 0; i < 26; i++) {
      const x = -7.0 + rt() * 3.0, y = -0.5 - rt() * 1.5;
      if (y < -2.0 + (x + 7) * 0.1) continue;
      P.line([[x, y], [x, y + 0.14]], { w: 0.8, alpha: 0.8, taper: 0.2 });
      P.line(E(x, y + 0.24, 0.11, 0.12, 0, 10), { w: 0.9, closed: true, alpha: 0.85 });
    }
    // villages: tiny houses
    for (const [x, y] of [[3.6, -1.0], [3.95, -1.1], [4.3, -0.95], [5.6, -1.6], [5.9, -1.7], [-3.4, -1.9], [-3.1, -2.0]]) {
      P.line([[x - 0.12, y], [x - 0.12, y + 0.14], [x, y + 0.26], [x + 0.12, y + 0.14], [x + 0.12, y], [x - 0.12, y]], { w: 0.9, alpha: 0.85, taper: 0.1 });
    }
    // a river and a road
    P.line(S([[0.6, -1.7], [1.4, -2.1], [1.2, -2.6], [1.5, -3.05]], 6), { w: 1.2, tint: 'blue', alpha: 0.85, taper: 0.4 });
    P.line(S([[-3.2, -1.95], [-1.6, -2.3], [0.2, -2.0], [2.4, -1.9], [3.8, -1.1]], 8), { w: 0.8, alpha: 0.45, taper: 0.2 });
    P.line(island, { w: 2.6, closed: true, wobble: 1.1 });

    // the scale bar (soft platform), ticks hang under it
    const sb = layout.soft[0];
    P.form([[sb.x0, sb.y], [sb.x1, sb.y], [sb.x1, sb.y - 0.2], [sb.x0, sb.y - 0.2]], { w: 1.6 });
    const n = 8, step = (sb.x1 - sb.x0) / n;
    for (let i = 0; i < n; i++) {
      const a = sb.x0 + i * step;
      if (i % 2 === 0) P.fill([[a, sb.y], [a + step, sb.y], [a + step, sb.y - 0.2], [a, sb.y - 0.2]], i === 2 ? 'gold' : 'ink', i === 2 ? 0.7 : 0.75);
      P.line([[a, sb.y - 0.2], [a, sb.y - 0.36]], { w: 0.9, alpha: 0.8, taper: 0 });
      for (let k = 1; k < 4 && i === 0; k++) P.line([[a + (step * k) / 4, sb.y - 0.2], [a + (step * k) / 4, sb.y - 0.3]], { w: 0.7, alpha: 0.7, taper: 0 });
    }
    P.line([[sb.x1, sb.y - 0.2], [sb.x1, sb.y - 0.36]], { w: 0.9, alpha: 0.8, taper: 0 });
    P.line([[sb.x1 + 0.08, sb.y - 0.1], [sb.x1 + 0.3, sb.y - 0.1]], { w: 0.9 });
    P.line([[sb.x1 + 0.2, sb.y - 0.02], [sb.x1 + 0.3, sb.y - 0.1], [sb.x1 + 0.2, sb.y - 0.18]], { w: 0.9 });

    // cartouches: banners with curled ends and no words on them
    function banner(s) {
      const h = 0.48, y = s.y;
      // curled tails behind, below the top line
      for (const side of [-1, 1]) {
        const ex = side < 0 ? s.x0 : s.x1;
        const tail = [[ex, y - 0.12], [ex + side * 0.55, y - 0.2], [ex + side * 0.32, y - h * 0.62], [ex + side * 0.6, y - h - 0.12], [ex, y - h - 0.05]];
        P.form(tail, { w: 1.3 });
        P.hatch(tail, { angle: 1.2, gap: 3.5, alpha: 0.5 });
      }
      const body = [[s.x0, y], [s.x1, y], [s.x1, y - h], ...S([[s.x1, y - h], [(s.x0 + s.x1) / 2, y - h - 0.08], [s.x0, y - h]], 6), [s.x0, y - h]];
      P.form(body, { w: 1.8 });
      P.line([[s.x0 + 0.12, y - 0.1], [s.x1 - 0.12, y - 0.1]], { w: 0.8, alpha: 0.5, taper: 0.2 });
      P.line([[s.x0 + 0.12, y - h + 0.06], [s.x1 - 0.12, y - h + 0.04]], { w: 0.8, alpha: 0.5, taper: 0.2 });
      P.line(E(s.x0 + 0.05, y - h / 2, 0.08, h / 2, 0, 12), { w: 1.1, closed: true });
      P.line(E(s.x1 - 0.05, y - h / 2, 0.08, h / 2, 0, 12), { w: 1.1, closed: true });
    }
    banner(layout.soft[1]);
    banner(layout.soft[2]);

    // the checkered border
    const bw = 0.26;
    P.line([[B.x0, B.y0], [B.x1, B.y0], [B.x1, B.y1], [B.x0, B.y1]], { w: 1.8, closed: true });
    P.line([[B.x0 + bw, B.y0 + bw], [B.x1 - bw, B.y0 + bw], [B.x1 - bw, B.y1 - bw], [B.x0 + bw, B.y1 - bw]], { w: 1.2, closed: true });
    P.line([[B.x0 + bw + 0.12, B.y0 + bw + 0.12], [B.x1 - bw - 0.12, B.y0 + bw + 0.12], [B.x1 - bw - 0.12, B.y1 - bw - 0.12], [B.x0 + bw + 0.12, B.y1 - bw - 0.12]], { w: 0.8, alpha: 0.6, closed: true });
    const cell = 0.3, rc = StageKit.rng(77);
    const runs = [
      [[B.x0 + bw, B.y1 - bw], [1, 0], B.x1 - B.x0 - 2 * bw], [[B.x0 + bw, B.y0], [1, 0], B.x1 - B.x0 - 2 * bw],
      [[B.x0, B.y0 + bw], [0, 1], B.y1 - B.y0 - 2 * bw], [[B.x1 - bw, B.y0 + bw], [0, 1], B.y1 - B.y0 - 2 * bw],
    ];
    for (const [o, d, len] of runs) {
      let goldRun = 0;
      for (let t = 0, i = 0; t < len - 0.01; t += cell, i++) {
        if (goldRun <= 0 && rc() < 0.04) goldRun = 5 + Math.floor(rc() * 5);
        const a = [o[0] + d[0] * t, o[1] + d[1] * t];
        const L = Math.min(cell, len - t);
        const sq = d[0] ? [[a[0], a[1]], [a[0] + L, a[1]], [a[0] + L, a[1] + bw], [a[0], a[1] + bw]] : [[a[0], a[1]], [a[0] + bw, a[1]], [a[0] + bw, a[1] + L], [a[0], a[1] + L]];
        if (goldRun > 0) { P.fill(sq, 'gold', 0.6); goldRun--; } else if (i % 2 === 0) P.fill(sq, 'ink', 0.7);
      }
    }
    for (const [x, y] of [[B.x0, B.y0], [B.x1 - bw, B.y0], [B.x0, B.y1 - bw], [B.x1 - bw, B.y1 - bw]]) P.form([[x, y], [x + bw, y], [x + bw, y + bw], [x, y + bw]], { w: 1.2, tint: 'gold', wash: 0.5 });

    P.walk(layout.main.x0, layout.main.x1, 0, { w: 5.4 });
    for (const s of layout.soft) P.walk(s.x0, s.x1, s.y);

    P.figure(-4.4, 2.5);
    P.figure(1.8, 0, true);
  }

  STAGES.push({ id: 'map', name: 'The Map Table', look: 'A fight on an old sea chart, standing on the north shore of an island with a scale bar and two blank banners to climb, between compass roses.', layout, draw });
})();
