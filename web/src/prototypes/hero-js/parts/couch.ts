// The couch and the two friends (far right, under the tree), plus the things around them: a side table
// with two steaming mugs and a shelf of books, a bowl of popcorn (and the pieces that missed), a loose
// cushion, a throw with a fringe, a skateboard pushed under the sofa and a kicked-off pair of shoes.
// The heavy line runs once round the sofa's outer edge; cushions, seams and props use the thinner tiers.
// The seat sags and is shaded under each friend, so they sit in it. The sofa and every prop that never moves are painted once into an offscreen sprite; the
// friends, the steam and the throw are drawn live. Local frame: origin at the couch's left foot on the
// ground, x to the right (0..390), y up is negative; the whole group is tipped to the slope of the ground.
import { BLUE, COUCH, INK, WARM, groundY, wind } from '../engine/layout';
import type { Part, Pt } from '../engine/types';
import { BOWL_FROM_CHEERER, drawCheerer, drawPointer, figure, sneaker } from './right/friends';
import { type C2, LW, TAU, blob, disc, ell, hatch, ink, mixc, mod, rnd, roundRect, sprite, taper, tone, trace } from './right/kit';

const X0 = COUCH.x; // 2330
const CW = 390;
const XC = X0 + CW / 2;
const G = groundY(XC) + 1;
const SLOPE = Math.atan2(groundY(X0 + CW - 30) - groundY(X0 + 30), CW - 60);
const P_HIP: Pt = [112, -104];
const C_HIP: Pt = [256, -104];
const BOWL: Pt = [C_HIP[0] + BOWL_FROM_CHEERER[0], -104];

const OUT = BLUE;
const LINE = tone(BLUE, 0.74); // form lines inside the sofa's silhouette
const SILW = 2.3, FORMW = 2.1; // SILW is added outside the edge, so the outer line reads as about 3.3
const BODY = tone(BLUE, 0.16);
const SHADE = tone(BLUE, 0.08);
const LIT = tone(BLUE, 0.27);
const RIM = mixc(BLUE, INK, 0.45);
const W_OUT = WARM;
const W_BODY = tone(WARM, 0.24);
const W_LIT = tone(WARM, 0.42);
const W_SHADE = tone(WARM, 0.12);
const LAND_SHADE = '#24331b';
const LAND_DEEP = '#18240f';

const local = (c: C2) => {
  c.translate(XC, G);
  c.rotate(SLOPE);
  c.translate(-CW / 2, 0);
};

function clipTo(c: C2, shape: readonly Pt[], smoothed: boolean, paint: () => void) {
  c.save();
  c.beginPath();
  trace(c, shape, true, smoothed);
  c.clip();
  paint();
  c.restore();
}

function backCushion(c: C2, x0: number, x1: number, seed: number) {
  const m = (x0 + x1) / 2;
  const shape: Pt[] = [[x0 + 7, -104], [x0 + 2, -128], [x0 + 3, -160], [x0 + 10, -185], [m - 30, -191], [m + 30, -191.5], [x1 - 10, -185], [x1 - 3, -160], [x1 - 2, -128], [x1 - 7, -104], [m, -102]];
  blob(c, shape, BODY, null);
  clipTo(c, shape, true, () => {
    blob(c, [[x0, -170], [x0 + 12, -196], [x1 - 12, -196], [x1, -172], [x1 - 22, -180], [m, -183], [x0 + 22, -179]], LIT, null);
    blob(c, [[x0, -100], [x0, -122], [m, -117], [x1, -123], [x1, -100]], SHADE, null);
    blob(c, [[x1 - 16, -196], [x1 + 2, -196], [x1 + 2, -100], [x1 - 12, -100], [x1 - 9, -150]], SHADE, null);
  });
  hatch(c, [[x0, -100], [x0, -122], [m, -117], [x1, -123], [x1, -100]], { angle: 0.04, gap: 4.6, color: OUT, alpha: 0.4, seed });
  hatch(c, [[x1 - 15, -190], [x1, -190], [x1, -124], [x1 - 11, -124]], { angle: 1.45, gap: 4.4, color: OUT, alpha: 0.35, seed: seed + 5, smoothed: false });
  blob(c, shape, null, LINE, FORMW);
  // piping just inside the edge
  ink(c, [[x0 + 9, -112], [x0 + 8, -158], [x0 + 15, -181], [m, -186], [x1 - 15, -181], [x1 - 8, -158], [x1 - 9, -112]], LW.hair, OUT, 0.5);
  // button tuft with creases
  disc(c, m, -150, 2.6, LIT, OUT, LW.hair);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4 + rnd(seed + i) * 0.5;
    const l = 13 + rnd(seed + i * 3.1) * 16;
    taper(c, [[m + Math.cos(a) * 4.5, -150 + Math.sin(a) * 4.5], [m + Math.cos(a + 0.12) * l * 0.6, -150 + Math.sin(a + 0.12) * l * 0.6], [m + Math.cos(a) * l, -150 + Math.sin(a) * l]], 1.7, 0.3, OUT, 0.65);
  }
  // corner wrinkles
  taper(c, [[x0 + 12, -176], [x0 + 24, -168], [x0 + 38, -165]], 1.6, 0.3, OUT, 0.55);
  taper(c, [[x1 - 12, -116], [x1 - 26, -122], [x1 - 42, -122]], 1.6, 0.3, OUT, 0.55);
}

function seatCushion(c: C2, x0: number, x1: number, seed: number, dip: number) {
  // the top plane, seen slightly from above
  const front: Pt[] = roundRect(x0 + 1.5, -98, x1 - 1.5, -47, 9);
  blob(c, front, BODY, null, 1, false);
  clipTo(c, front, false, () => {
    blob(c, [[x0, -66], [dip - 40, -63], [dip, -60], [dip + 40, -63], [x1, -66], [x1, -44], [x0, -44]], SHADE, null);
    c.fillStyle = tone(BLUE, 0.215);
    c.fillRect(x0, -99, x1 - x0, 7);
  });
  hatch(c, [[x0 + 4, -64], [x1 - 4, -64], [x1 - 4, -48], [x0 + 4, -48]], { angle: 0.02, gap: 4.2, color: OUT, alpha: 0.38, seed, smoothed: false });
  blob(c, front, null, LINE, FORMW, false);
  ink(c, [[x0 + 9, -87], [dip - 40, -86.5], [dip, -84], [dip + 40, -86.5], [x1 - 9, -87]], LW.hair, OUT, 0.55); // piping
  // the top plane, seen slightly from above: it sags where someone sits and puffs up beside them
  const top: Pt[] = [[x0 + 3, -97.5], [dip - 52, -98.5], [dip - 26, -93.5], [dip, -91.5], [dip + 26, -93.5], [dip + 52, -98.5], [x1 - 3, -97.5], [x1 - 9, -112], [dip + 40, -113], [dip, -110.5], [dip - 40, -113], [x0 + 9, -112]];
  blob(c, top, LIT, null, 1);
  clipTo(c, top, true, () => {
    // the shade crescent where the body presses into the cushion
    blob(c, ell(dip + 6, -100.5, 47, 8.5, 22), tone(BLUE, 0.1), null);
    blob(c, ell(dip + 8, -101, 34, 5.5, 18), tone(BLUE, 0.06), null);
  });
  hatch(c, ell(dip + 8, -99, 44, 6, 18), { angle: 0.02, gap: 3.2, color: OUT, alpha: 0.3, seed: seed + 3 });
  blob(c, top, null, LINE, FORMW);
  taper(c, [[dip - 60, -101], [dip - 44, -103.5], [dip - 30, -101]], 1.5, 0.3, OUT, 0.5);
  taper(c, [[dip + 62, -101.5], [dip + 48, -104], [dip + 36, -101.5]], 1.5, 0.3, OUT, 0.5);
  // sag creases under the sitter
  taper(c, [[dip - 34, -90], [dip - 14, -82], [dip, -80]], 1.7, 0.3, OUT, 0.6);
  taper(c, [[dip + 36, -90], [dip + 18, -84], [dip + 6, -78]], 1.7, 0.3, OUT, 0.6);
  taper(c, [[dip - 6, -76], [dip - 2, -68]], 1.5, 0.3, OUT, 0.5);
}

function arm(c: C2, x0: number) {
  const x1 = x0 + 44;
  const shape = roundRect(x0, -156, x1, -27, 12);
  blob(c, shape, BODY, null, 1, false);
  clipTo(c, shape, false, () => {
    blob(c, [[x0 - 2, -160], [x1 + 2, -160], [x1 + 2, -146], [x0 + 22, -141], [x0 - 2, -145]], LIT, null);
    c.fillStyle = SHADE;
    c.fillRect(x1 - 10, -150, 12, 130);
    c.fillRect(x0, -44, 46, 20);
  });
  hatch(c, [[x1 - 9, -138], [x1 - 1, -138], [x1 - 1, -48], [x1 - 9, -48]], { angle: 1.5, gap: 4.4, color: OUT, alpha: 0.4, seed: x0, smoothed: false });
  hatch(c, [[x0 + 3, -43], [x1 - 11, -43], [x1 - 11, -30], [x0 + 3, -30]], { angle: 0.03, gap: 4.2, color: OUT, alpha: 0.35, seed: x0 + 9, smoothed: false });
  blob(c, shape, null, LINE, FORMW, false);
  ink(c, roundRect(x0 + 6.5, -149.5, x1 - 6.5, -34, 7), LW.hair, OUT, 0.5, false, true); // welt seam
  ink(c, [[x0 + 12, -143], [x0 + 22, -146], [x1 - 12, -143]], LW.hair, RIM, 0.6);
  disc(c, x0 + 22, -128, 1.8, LIT, OUT, LW.hair); // a single button
}

function leg(c: C2, x: number, splay: number, top: number, bottom: number, w: number, dark: boolean) {
  const shape: Pt[] = [[x - w, top], [x + w, top], [x + w * 0.45 + splay, bottom], [x - w * 0.45 + splay, bottom]];
  blob(c, shape, dark ? W_SHADE : W_BODY, null, 1, false);
  if (!dark) blob(c, [[x - w * 0.6 + splay * 0.75, bottom - 7], [x + w * 0.6 + splay * 0.75, bottom - 7], [x + w * 0.45 + splay, bottom], [x - w * 0.45 + splay, bottom]], tone(WARM, 0.85), null, 1, false);
  blob(c, shape, null, dark ? tone(WARM, 0.6) : W_OUT, dark ? LW.detail : LW.form, false);
}

function mug(c: C2, x: number, y: number, w: number, h: number, band: string) {
  ink(c, [[x - w / 2, y - h * 0.78], [x - w / 2 - 6, y - h * 0.7], [x - w / 2 - 6.5, y - h * 0.3], [x - w / 2, y - h * 0.22]], LW.detail, W_OUT, 1);
  const body = roundRect(x - w / 2, y - h, x + w / 2, y, 2.5);
  blob(c, body, W_LIT, null, 1, false);
  clipTo(c, body, false, () => {
    c.fillStyle = W_BODY;
    c.fillRect(x + w / 2 - 4, y - h, 5, h);
    c.fillStyle = band;
    c.fillRect(x - w / 2, y - h * 0.62, w, h * 0.26);
  });
  blob(c, body, null, W_OUT, LW.detail, false);
  ink(c, [[x - w / 2 + 2, y - h + 2.4], [x + w / 2 - 2, y - h + 2.4]], LW.hair, W_OUT, 0.7, false);
}

function paintStatic(c: C2) {
  local(c);
  // contact shadows
  blob(c, ell(CW / 2, 4, 236, 12, 32), LAND_SHADE, null);
  blob(c, ell(CW / 2 + 6, 5, 204, 6.5, 28), LAND_DEEP, null);
  blob(c, ell(-32, 4, 42, 7, 20), LAND_SHADE, null);
  blob(c, ell(-30, 4.5, 30, 3.6, 18), LAND_DEEP, null);

  // ---- side table with two mugs ----
  leg(c, -32, 0, -68, -5, 3.6, true);
  leg(c, -51, -6, -68, 1, 4, false);
  leg(c, -13, 6, -68, 1, 4, false);
  // a low shelf with a stack of books
  blob(c, roundRect(-53, -35.5, -11, -31.5, 1.5), W_BODY, W_OUT, LW.detail, false);
  {
    let y = -35.5;
    for (const [x, w, h, fill, line] of [[-49, 33, 5.6, tone(BLUE, 0.42), OUT], [-46, 29, 4.4, tone(INK, 0.5), INK], [-47.5, 26, 5.2, tone(WARM, 0.6), W_OUT]] as const) {
      const bk = roundRect(x, y - h, x + w, y, 1);
      blob(c, bk, fill, null, 1, false);
      c.fillStyle = tone(INK, 0.85);
      c.fillRect(x + w - 3.2, y - h + 1.1, 2.4, h - 2.2); // page edge
      blob(c, bk, null, line, LW.hair, false);
      ink(c, [[x + 4, y - h + 0.6], [x + 4, y - 0.6]], 0.9, line, 0.8, false);
      y -= h;
    }
  }
  const tableTop = roundRect(-61, -77, -3, -68.5, 3.5);
  blob(c, tableTop, W_BODY, null, 1, false);
  clipTo(c, tableTop, false, () => {
    c.fillStyle = W_LIT;
    c.fillRect(-62, -78, 60, 3.6);
  });
  blob(c, tableTop, null, W_OUT, LW.form, false);
  ink(c, [[-52, -72.5], [-36, -72.5]], LW.hair, W_OUT, 0.5, false);
  ink(c, [[-28, -72], [-12, -72]], LW.hair, W_OUT, 0.5, false);
  mug(c, -44, -77, 13, 15, tone(BLUE, 0.6));
  mug(c, -19, -77, 12, 17, tone(INK, 0.7));

  // ---- a skateboard pushed under the sofa ----
  {
    const deck: Pt[] = [[148, -16.5], [158, -12], [204, -11.4], [250, -12], [263, -17.5], [264.5, -15], [252, -8.8], [204, -8.2], [157, -8.8], [146.5, -14]];
    for (const x of [171, 240]) {
      ink(c, [[x - 5, -8], [x, -5], [x + 5, -8]], LW.detail, tone(INK, 0.7), 1, false);
      disc(c, x - 5.5, -4.6, 4.4, tone(INK, 0.5), tone(INK, 0.9), LW.hair);
      disc(c, x - 5.5, -4.6, 1.3, tone(INK, 0.9));
      disc(c, x + 5.5, -4.6, 4.4, tone(INK, 0.5), tone(INK, 0.9), LW.hair);
      disc(c, x + 5.5, -4.6, 1.3, tone(INK, 0.9));
    }
    blob(c, deck, W_BODY, W_OUT, LW.detail);
    ink(c, [[160, -10.4], [204, -9.8], [249, -10.4]], LW.hair, W_OUT, 0.6);
    for (const x of [186, 204, 222]) ink(c, [[x, -11], [x + 1.5, -8.6]], 2.2, tone(BLUE, 0.7), 1, false); // grip stripes
  }

  // ---- the sofa ----
  leg(c, 72, -2, -28, -9, 5, true);
  leg(c, 318, 2, -28, -9, 5, true);
  // the frame behind the back cushions
  const back = roundRect(34, -197, 356, -100, 10);
  // the heavy line goes round the whole sofa once; everything inside it is drawn at form weight
  c.lineJoin = 'round';
  for (const sh of [back, roundRect(0, -156, 44, -27, 12), roundRect(346, -156, 390, -27, 12), roundRect(8, -47, 382, -27, 4)]) {
    c.beginPath();
    trace(c, sh, true, false);
    c.lineWidth = SILW * 2;
    c.strokeStyle = OUT;
    c.stroke();
  }
  blob(c, back, SHADE, LINE, FORMW, false);
  backCushion(c, 44, 195, 3);
  backCushion(c, 195, 346, 11);
  // each friend throws a shade onto the cushion behind them
  for (const hx of [P_HIP[0], C_HIP[0]]) {
    const sh: Pt[] = [[hx - 8, -106], [hx - 6, -134], [hx + 6, -158], [hx + 24, -166], [hx + 40, -154], [hx + 46, -130], [hx + 44, -106]];
    blob(c, sh, tone(BLUE, 0.095), null);
    hatch(c, sh, { angle: -1.15, gap: 5, color: OUT, alpha: 0.2, seed: hx });
  }
  seatCushion(c, 44, 195, 21, P_HIP[0]);
  seatCushion(c, 195, 346, 29, C_HIP[0]);
  // the front rail
  const rail = roundRect(8, -47, 382, -27, 4);
  blob(c, rail, SHADE, null, 1, false);
  clipTo(c, rail, false, () => {
    c.fillStyle = tone(BLUE, 0.13);
    c.fillRect(8, -48, 374, 6);
  });
  hatch(c, [[46, -39], [344, -39], [344, -29], [46, -29]], { angle: 0.01, gap: 3.6, color: OUT, alpha: 0.3, seed: 41, smoothed: false });
  blob(c, rail, null, LINE, FORMW, false);
  arm(c, 0);
  arm(c, 346);
  ink(c, [[0.6, -144], [0.6, -40]], LW.hair, RIM, 0.75, false); // cool rim on the edge that faces the TV
  leg(c, 26, -5, -27, 0, 7, false);
  leg(c, 364, 5, -27, 0, 7, false);

  // ---- loose cushion leaning in the corner ----
  c.save();
  c.translate(316, -133);
  c.rotate(-0.24);
  const pil: Pt[] = [[-27, -26], [0, -22.5], [27, -26], [23.5, 0], [27, 27], [0, 23], [-27, 26], [-23, 0]];
  blob(c, pil, LIT, null);
  clipTo(c, pil, true, () => {
    blob(c, [[30, -30], [30, 30], [-30, 30], [-8, 16], [14, 4], [18, -20]], tone(BLUE, 0.19), null);
    c.strokeStyle = tone(WARM, 0.7);
    c.lineWidth = LW.hair;
    c.globalAlpha = 0.8;
    c.beginPath();
    for (let i = -3; i <= 3; i++) {
      c.moveTo(i * 12 - 30, -30);
      c.lineTo(i * 12 + 30, 30);
      c.moveTo(i * 12 + 30, -30);
      c.lineTo(i * 12 - 30, 30);
    }
    c.stroke();
  });
  blob(c, pil, null, OUT, FORMW);
  ink(c, [[-21, -20], [0, -17.5], [21, -20], [18.5, 0], [21, 21], [0, 18], [-21, 20], [-18, 0]], LW.hair, OUT, 0.5, true, true);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) taper(c, [[sx * 26, sy * 25.5], [sx * 31, sy * 30]], 2.4, 0.6, OUT, 1);
  c.restore();

  // ---- two leaves that have landed on the couch ----
  for (const [x, y, a] of [[150, -193, 0.3], [296, -106, -0.5], [20, -157.5, 0.2]] as const) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    blob(c, [[-6, 0], [-1, -2.6], [6, 0], [-1, 2.6]], tone(INK, 0.5), INK, LW.hair);
    ink(c, [[-5, 0], [5, 0]], 0.9, INK, 0.8, false);
    c.restore();
  }

  // ---- popcorn that missed ----
  for (const [x, y, r, a] of [[148, -99, 2.6, 0.4], [196, -101.5, 2.3, 1.7], [126, -2, 2.5, 2.6], [137, -1.5, 2.2, 0.9], [229, -100, 2, 3.3]] as const) {
    const pts: Pt[] = [];
    for (let k = 0; k < 6; k++) {
      const th = (k / 6) * TAU + a;
      const rr = r * (0.75 + rnd(x + k * 3.3) * 0.5);
      pts.push([x + Math.cos(th) * rr, y + Math.sin(th) * rr]);
    }
    blob(c, pts, tone(INK, 0.62), INK, 0.9);
  }

  // ---- kicked-off shoes on the grass ----
  figure(c, () => {
    sneaker(c, [330, -12], 0.05, tone(INK, 0.46));
    sneaker(c, [304, -11.5], -0.06);
  });
  ink(c, [[296, -19], [290, -24], [293, -29]], LW.hair, INK, 0.8); // a loose lace
}

function paintBowl(c: C2) {
  const [x, y] = BOWL;
  // popcorn heap
  const pops: [number, number, number][] = [[-10, -17, 4.2], [-3, -20, 4.6], [5, -19.5, 4.4], [11, -17, 4], [-6, -24, 3.8], [2, -25.5, 4], [8, -23.5, 3.6], [-1, -29, 3.2], [-13, -15, 3]];
  for (let i = 0; i < pops.length; i++) {
    const [px, py, r] = pops[i]!;
    const pts: Pt[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + i;
      const rr = r * (0.75 + rnd(i * 7 + k * 3.3) * 0.5);
      pts.push([x + px + Math.cos(a) * rr, y + py + Math.sin(a) * rr]);
    }
    blob(c, pts, tone(INK, 0.62), INK, LW.hair);
  }
  const bowl: Pt[] = [[x - 17, y - 16], [x + 17, y - 16], [x + 13, y - 3], [x + 8, y], [x - 8, y], [x - 13, y - 3]];
  blob(c, bowl, W_BODY, null, 1, false);
  clipTo(c, bowl, false, () => {
    c.fillStyle = W_LIT;
    for (let i = -2; i <= 2; i++) c.fillRect(x + i * 8 - 2, y - 17, 3.6, 18);
    c.fillStyle = W_SHADE;
    c.globalAlpha = 0.7;
    c.fillRect(x + 8, y - 17, 10, 18);
  });
  blob(c, bowl, null, W_OUT, LW.form, false);
  ink(c, [[x - 17, y - 16], [x + 17, y - 16]], LW.form, W_OUT, 1, false);
  ink(c, [[x - 12, y - 12], [x + 12, y - 12]], LW.hair, W_OUT, 0.6, false);
}

function steam(c: C2, x: number, y: number, t: number, seed: number) {
  for (let i = 0; i < 2; i++) {
    const per = 3.1 + i * 0.9 + rnd(seed + i) * 0.6;
    const u = mod(t / per + rnd(seed * 3 + i), 1);
    const rise = u * 34;
    const a = Math.sin(u * Math.PI) * 0.6;
    const sway = (k: number) => Math.sin(t * 1.3 + seed + i * 2 + k * 2.4) * (2 + k * 4) + wind(t, X0) * k * 5;
    const pts: Pt[] = [];
    for (let k = 0; k <= 4; k++) pts.push([x + (i - 0.5) * 5 + sway(k / 4), y - rise - k * 5.5]);
    taper(c, pts, 0.5, 0.4, INK, a, 2);
  }
}

function throwBlanket(c: C2, t: number) {
  const g = wind(t, X0 + 370), g2 = wind(t - 0.25, X0 + 370);
  const lift = Math.max(0, g) * 3.5;
  const hemY = (x: number) => -86 + Math.sin(x * 0.21 + 1) * 2.2 - lift * ((x - 340) / 54) + Math.sin(t * 2.1 + x * 0.3) * 0.5;
  const hem: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const x = 394 - i * 8.6 + g2 * 1.8;
    hem.push([x, hemY(x)]);
  }
  const shape: Pt[] = [[340, -152], [346, -160.5], [368, -162], [388, -160], [394.5, -150], [395 + g * 0.8, -118], ...hem, [341, -120]];
  blob(c, shape, W_BODY, null);
  clipTo(c, shape, true, () => {
    blob(c, [[338, -164], [396, -164], [396, -150], [366, -154], [338, -148]], W_LIT, null);
    for (const dy of [14, 24]) {
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const p = hem[i]!;
        if (i === 0) c.moveTo(p[0] + 4, p[1] - dy);
        else c.lineTo(p[0] - (i === 6 ? 4 : 0), p[1] - dy);
      }
      c.lineWidth = 4.2;
      c.strokeStyle = tone(WARM, 0.62);
      c.stroke();
    }
    c.fillStyle = W_SHADE;
    c.globalAlpha = 0.75;
    c.fillRect(384, -150, 14, 80);
  });
  blob(c, shape, null, W_OUT, LW.form);
  // folds
  taper(c, [[352, -156], [354, -130], [351 + g2, -100]], 1.6, 0.3, W_OUT, 0.7);
  taper(c, [[372, -158], [375, -134], [373 + g2, -104]], 1.6, 0.3, W_OUT, 0.7);
  ink(c, [[343, -150], [366, -155], [393, -149]], LW.hair, W_OUT, 0.6);
  // fringe
  for (let i = 0; i < 12; i++) {
    const k = i / 11;
    const x = 343 + k * 50 + g2 * 1.8 * (1 - k * 0.2);
    const y = hemY(x) + 0.5;
    const s = wind(t - 0.3 - k * 0.1, X0 + 340 + k * 50) * 4 + Math.sin(t * 3.1 + i * 1.9) * 0.7;
    taper(c, [[x, y], [x + s * 0.4, y + 6], [x + s, y + 11.5 + rnd(i) * 3]], 1.7, 0.4, W_OUT, 0.95);
  }
}

/** a piece of popcorn tossed up from the bowl now and then, and caught */
function toss(c: C2, t: number) {
  const per = 13.7;
  const k = Math.floor(t / per);
  const u = (t - k * per - 4 - rnd(k * 5.1) * 3) / 0.9;
  if (u < 0 || u > 1) return;
  const x = BOWL[0] + 2 + u * 10, y = BOWL[1] - 30 - Math.sin(u * Math.PI) * 46;
  c.save();
  c.translate(x, y);
  c.rotate(u * 7);
  blob(c, [[-3, -1], [-1, -3.4], [2.4, -2.4], [3.4, 0.6], [1, 3], [-2.4, 2.2]], tone(INK, 0.7), INK, 1);
  c.restore();
}

export const couch: Part = {
  id: 'couch',
  z: 24,
  intro: [1.6, 2.8],
  draw(pen, f) {
    const c = pen.ctx;
    const t = f.t;
    const s = sprite(c, 'right-sofa', X0 - 80, G - 215, CW + 110, 240, paintStatic);
    c.drawImage(s.cv, X0 - 80, G - 215, s.w, s.h);
    c.save();
    local(c);
    steam(c, -44, -93, t, 1);
    steam(c, -19, -95, t, 7);
    c.save();
    c.translate(P_HIP[0], P_HIP[1]);
    drawPointer(c, t);
    c.restore();
    paintBowl(c);
    toss(c, t);
    c.save();
    c.translate(C_HIP[0], C_HIP[1]);
    drawCheerer(c, t, X0 + C_HIP[0]);
    c.restore();
    throwBlanket(c, t);
    c.restore();
  },
};
