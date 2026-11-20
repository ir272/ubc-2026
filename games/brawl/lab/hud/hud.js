// Fight HUD options over a stand-in fight. hud.html?v=a|b|c&dmg0=37&dmg1=140&lives0=2&lives1=1
// Keys 1 2 3 switch the option.
(function () {
  const K = HudKit, C = K.C;
  const { smooth, ell } = Ink;
  const q = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : d; };
  const S = {
    v: ['a', 'b', 'c'].includes(q.get('v')) ? q.get('v') : 'a',
    clock: q.get('clock') || '2:14',
    sides: [
      { fighter: 'The Hexer', bot: 'Marlow', model: 'Haiku 5.5', dmg: num('dmg0', 37), lives: num('lives0', 2), accent: C.coral },
      { fighter: 'The Bellringer', bot: 'Brick', model: 'Qwen 3.7 Flash', dmg: num('dmg1', 140), lives: num('lives1', 1), accent: C.blue },
    ],
  };
  const STOCKS = 3;
  const W = 1280, H = 720;
  const cv = document.getElementById('stage');
  const ctx = cv.getContext('2d');
  const demo = (window.CAST || []).find((c) => c.id === 'demo');

  // where the stand-in fighters stand (feet) and how big they are
  const FIG = [{ x: 560, y: 520, s: 0.85, flip: false }, { x: 872, y: 390, s: 0.85, flip: true }];

  function figure(f) {
    if (!demo) return;
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.flip ? -f.s : f.s, f.s);
    demo.draw(Ink.makeInk(ctx, 'line'), 'stand');
    ctx.restore();
  }

  // ---------- the stand-in fight ----------
  function stage() {
    const ink = Ink.makeInk(ctx, 'line');
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    for (const [x, y, r] of [[110, 150, 1.3], [300, 230, 1], [700, 140, 1.4], [1010, 300, 1.1], [1180, 170, 1.2], [560, 300, 0.9], [1220, 420, 1]]) ink.dot(x, y, r, { free: true });
    // main stage: a floating slab
    const slab = smooth([[230, 520], [640, 519], [1050, 520], [1012, 546], [900, 568], [640, 584], [380, 568], [268, 546]], 6, true);
    ink.form(slab, { w: 2.2, seed: 40 });
    ink.hatch(smooth([[250, 532], [640, 540], [1030, 532], [900, 566], [640, 582], [380, 566]], 5, true), { angle: 0.35, gap: 6, w: 0.9, alpha: 0.45, seed: 41 });
    ink.line([[226, 520], [1054, 520]], { w: 2.8, seed: 42, taper: 0.2 });
    // two platforms
    for (const [x0, x1, y, sd] of [[262, 444, 390, 50], [782, 964, 390, 60]]) {
      ink.line([[x0, y], [x1, y]], { w: 2.4, seed: sd, taper: 0.25 });
      ink.line([[x0 + 10, y + 7], [x1 - 10, y + 7]], { w: 1.1, seed: sd + 1, taper: 0.6, alpha: 0.55 });
    }
    FIG.forEach(figure);
  }

  // ---------- shared drawn pieces ----------
  /** the chart's ruled box: four rules that run past the corners and cross */
  function ruledBox(ink, x0, y0, x1, y1, o = {}) {
    const over = o.over ?? 9, sd = o.seed ?? 100, w = o.w ?? 1.8;
    ink.mask([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    ink.line([[x0 - over, y0], [x1 + over, y0]], { w, seed: sd, taper: 0.5 });
    ink.line([[x0 - over * 0.6, y1], [x1 + over * 0.8, y1]], { w, seed: sd + 1, taper: 0.5 });
    ink.line([[x0, y0 - over], [x0, y1 + over * 0.7]], { w, seed: sd + 2, taper: 0.5 });
    ink.line([[x1, y0 - over * 0.7], [x1, y1 + over]], { w, seed: sd + 3, taper: 0.5 });
  }
  function headPortrait(cx, cy, r, flip, accent, seed) {
    const ink = Ink.makeInk(ctx, 'line');
    ink.mask(ell(cx, cy, r + 9, r + 9, 0, 40));
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.clip();
    ink.hatch(ell(cx, cy, r, r, 0, 30), { tint: accent, angle: flip ? 2.3 : 0.85, gap: 4.5, w: 1, alpha: 0.5, seed });
    const s = 0.95;
    ctx.translate(cx - (flip ? -6 : 6) * s, cy + 168 * s);
    ctx.scale(flip ? -s : s, s);
    if (demo) demo.draw(Ink.makeInk(ctx, 'line'), 'stand');
    ctx.restore();
    ink.line(ell(cx, cy, r, r, 0, 36), { w: 2, closed: true, seed: seed + 1 });
    ink.line(ell(cx, cy, r + 6, r + 6, 0, 40), { w: 1.1, closed: true, seed: seed + 2, tint: accent });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, r0 = r + 6, r1 = r + (i % 3 ? 9 : 12);
      ink.line([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], { w: 0.9, seed: seed + 10 + i, taper: 0, tint: accent });
    }
  }
  /** a short ornamental rule with a lozenge in the middle, like the chart's scale bar ends */
  function flourish(ink, x0, x1, y, seed, tint) {
    const m = (x0 + x1) / 2;
    ink.line([[x0, y], [m - 7, y]], { w: 1.2, seed, taper: 0.8, tint });
    ink.line([[m + 7, y], [x1, y]], { w: 1.2, seed: seed + 1, taper: 0.8, tint });
    ink.form([[m - 5, y], [m, y - 3.5], [m + 5, y], [m, y + 3.5]], { w: 1.1, seed: seed + 2, tint, wash: 1 });
  }

  // ---------- A: corner plates ----------
  function optA() {
    const ink = Ink.makeInk(ctx, 'line');
    const PW = 456, Y0 = 618, Y1 = 696;
    S.sides.forEach((sd, i) => {
      const left = i === 0;
      const x0 = left ? 30 : W - 30 - PW, x1 = x0 + PW;
      ruledBox(ink, x0, Y0, x1, Y1, { seed: 200 + i * 10 });
      const t = K.danger(sd.dmg);
      const mcx = left ? x0 + 50 : x1 - 50, mcy = Y0 + 14;
      headPortrait(mcx, mcy, 38, !left, sd.accent, 300 + i * 40);
      // names
      const tx = left ? x0 + 108 : x1 - 108, al = left ? 'left' : 'right';
      K.text(ctx, sd.fighter, tx, Y0 + 33, { size: 25, weight: 600, align: al });
      const bw = K.text(ctx, sd.bot, tx, Y0 + 59, { size: 18, weight: 500, align: al, color: C.soft });
      K.text(ctx, sd.model, left ? tx + bw + 9 : tx - bw - 9, Y0 + 59, { size: 15, weight: 400, align: al, color: C.dim });
      // lives: candles standing on the plate's top rule, like a mantel
      for (let k = 0; k < STOCKS; k++) {
        const cx = left ? tx + 12 + k * 27 : tx - 12 - k * 27;
        K.candle(ink, cx, Y0 - 2, 1.15, k < sd.lives, 400 + i * 20 + k * 3);
      }
      // the damage numeral
      const nx = left ? x1 - 18 : x0 + 18;
      K.drawNum(ink, Math.round(sd.dmg) + '%', nx, Y1 - 13, 54, { align: left ? 'right' : 'left', t, seed: 7 + i * 13 });
    });
    // clock, top centre
    K.drawNum(ink, S.clock, W / 2, 50, 30, { align: 'center', color: C.ink, seed: 90, w: 2.4 });
    flourish(ink, W / 2 - 60, W / 2 + 60, 66, 95, C.gold);
  }

  // ---------- B: running head ----------
  function optB() {
    const ink = Ink.makeInk(ctx, 'line');
    const RY = 62, cx = W / 2, mr = 40;
    // the rule: a heavy line over a thin one, broken by the clock medallion
    for (const [a, b] of [[22, cx - mr - 8], [cx + mr + 8, W - 22]]) {
      ink.line([[a, RY], [b, RY]], { w: 2, seed: 500 + a, taper: 0.15 });
      ink.line([[a + 4, RY + 8], [b - 4, RY + 8]], { w: 1, seed: 510 + a, taper: 0.15, alpha: 0.8 });
    }
    // scale-bar cells between the two lines, in each side's pencil near its end of the rule
    S.sides.forEach((sd, i) => {
      const left = i === 0;
      for (let k = 0; k < 14; k++) {
        const xa = left ? 26 + k * 12 : W - 26 - (k + 1) * 12;
        if (k % 2 === 0) ink.hatch([[xa, RY + 1], [xa + 12, RY + 1], [xa + 12, RY + 7.5], [xa, RY + 7.5]], { tint: sd.accent, angle: 1.2, gap: 1.8, w: 1.3, alpha: 1, seed: 520 + i * 40 + k, free: true });
        ink.line([[xa, RY + 1], [xa, RY + 8]], { w: 0.8, seed: 560 + i * 40 + k, taper: 0, alpha: 0.7 });
      }
      for (let k = 0; k < 20; k++) {
        const xa = left ? 220 + k * 13 : W - 220 - k * 13;
        ink.line([[xa, RY + 7], [xa, RY + (k % 5 ? 10 : 13)]], { w: 0.8, seed: 600 + i * 30 + k, taper: 0, alpha: 0.6 });
      }
    });
    // clock medallion
    ink.mask(ell(cx, RY + 3, mr + 4, mr + 4, 0, 40));
    ink.line(ell(cx, RY + 3, mr, mr, 0, 40), { w: 1.8, closed: true, seed: 650 });
    ink.line(ell(cx, RY + 3, mr - 6, mr - 6, 0, 40), { w: 1, closed: true, seed: 651, tint: C.gold });
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2, r0 = mr - 6, r1 = mr - (k % 4 ? 2.5 : 0.5);
      ink.line([[cx + Math.cos(a) * r0, RY + 3 + Math.sin(a) * r0], [cx + Math.cos(a) * r1, RY + 3 + Math.sin(a) * r1]], { w: 0.8, seed: 660 + k, taper: 0, tint: C.gold, alpha: 0.85 });
    }
    K.drawNum(ink, S.clock, cx, RY + 13, 23, { align: 'center', color: C.ink, seed: 91, w: 2.2 });
    // the two heads
    S.sides.forEach((sd, i) => {
      const left = i === 0, al = left ? 'left' : 'right';
      const t = K.danger(sd.dmg);
      const nx = left ? cx - mr - 30 : cx + mr + 30;
      const nw = K.drawNum(ink, Math.round(sd.dmg) + '%', nx, RY - 9, 44, { align: left ? 'right' : 'left', t, seed: 17 + i * 13 });
      // fighter name above the rule at the outer edge
      const ox = left ? 30 : W - 30;
      K.text(ctx, sd.fighter, ox, RY - 12, { size: 27, weight: 600, align: al });
      // bot and model below the rule
      const bw = K.text(ctx, sd.bot, ox, RY + 34, { size: 18, weight: 500, align: al, color: C.soft });
      K.text(ctx, sd.model, left ? ox + bw + 9 : ox - bw - 9, RY + 34, { size: 15, weight: 400, align: al, color: C.dim });
      // lives: stars hung under the rule beneath the numeral
      for (let k = 0; k < STOCKS; k++) {
        const sx = left ? nx - 10 - k * 22 : nx + 10 + k * 22;
        ink.line([[sx, RY + 8], [sx, RY + 17]], { w: 0.8, seed: 700 + i * 10 + k, taper: 0, alpha: 0.6 });
        K.star(ink, sx, RY + 27, 9, k < sd.lives, 720 + i * 10 + k);
      }
    });
  }

  // ---------- C: on the fighter ----------
  function optC() {
    const ink = Ink.makeInk(ctx, 'line');
    // names small in the top corners
    S.sides.forEach((sd, i) => {
      const left = i === 0, al = left ? 'left' : 'right', ox = left ? 34 : W - 34;
      K.text(ctx, sd.fighter, ox, 44, { size: 23, weight: 600, align: al });
      const bw = K.text(ctx, sd.bot, ox, 68, { size: 17, weight: 500, align: al, color: C.soft });
      K.text(ctx, sd.model, left ? ox + bw + 8 : ox - bw - 8, 68, { size: 15, weight: 400, align: al, color: C.dim });
      const fw = K.textW(ctx, sd.fighter, { size: 23, weight: 600 });
      ink.line(left ? [[ox, 52], [ox + Math.min(fw, 90), 51]] : [[ox - Math.min(fw, 90), 51], [ox, 52]], { w: 2.2, tint: sd.accent, seed: 800 + i, taper: 0.7 });
    });
    // clock top centre between two short rules
    K.drawNum(ink, S.clock, W / 2, 56, 32, { align: 'center', color: C.ink, seed: 92, w: 2.5 });
    ink.line([[W / 2 - 92, 41], [W / 2 - 50, 41]], { w: 1.1, seed: 810, taper: 0.8, tint: C.gold });
    ink.line([[W / 2 + 50, 41], [W / 2 + 92, 41]], { w: 1.1, seed: 811, taper: 0.8, tint: C.gold });
    // a chart label beside each fighter, behind the back, tied to the shoulder by a leader line
    S.sides.forEach((sd, i) => {
      const f = FIG[i], t = K.danger(sd.dmg);
      const back = f.flip ? 1 : -1; // the side behind the fighter
      const str = Math.round(sd.dmg) + '%', nh = 38;
      const tw = Math.max(92, K.numWidth(str, nh) + 30), th = 54;
      const tcx = f.x + back * (78 + tw / 2), tcy = f.y - 244 * f.s;
      const hw = tw / 2, hh = th / 2;
      // leader: from the label's near corner down to the shoulder, ending in a small ring
      const corner = [tcx - back * hw, tcy + hh];
      const shoulder = [f.x + back * 10, f.y - 152 * f.s];
      ink.line([corner, shoulder], { w: 1.4, tint: sd.accent, seed: 820 + i, taper: 0.1 });
      ink.line(ell(shoulder[0], shoulder[1], 3.2, 3.2, 0, 10), { w: 1.2, closed: true, tint: sd.accent, seed: 825 + i });
      ctx.save();
      ctx.translate(tcx, tcy);
      ctx.rotate(-back * 0.12 * t * t);
      ruledBox(ink, -hw, -hh, hw, hh, { over: 7, w: 1.7, seed: 830 + i * 7 });
      K.drawNum(ink, str, 0, nh / 2 - 1, nh, { align: 'center', t, seed: 27 + i * 13 });
      ctx.restore();
      // lives: drops of ink under the label
      for (let k = 0; k < STOCKS; k++) K.drop(ink, tcx - 22 + k * 22, tcy + hh + 24, 1.25, k < sd.lives, 860 + i * 10 + k);
    });
  }

  function render() {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    stage();
    ({ a: optA, b: optB, c: optC })[S.v]();
    document.body.dataset.ready = '1';
    document.body.dataset.font = document.fonts && document.fonts.check('600 20px HudHand') ? 'HudHand' : 'fallback';
  }
  addEventListener('keydown', (e) => {
    const v = { 1: 'a', 2: 'b', 3: 'c' }[e.key];
    if (v) { S.v = v; q.set('v', v); history.replaceState(null, '', '?' + q.toString()); render(); }
  });
  render();
  if (document.fonts) document.fonts.load('600 20px HudHand').then(render, render);
})();
