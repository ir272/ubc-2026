// The game playing on the television: a little side-scroller. Three parallax layers (terraced far mountains,
// mid hills with trees and a tower, the near ground with a grassy edge, strata and a pit), a capped runner who
// jumps a crate, hops the pit, bounces off a slime, raises a checkpoint flag and collects coins that fill a row
// of pips. Everything is a tiling function of time, so nothing ever jumps. Drawn in screen-local units
// (0..330 by 0..270), the caller clips to the glass.
import { BLUE, GOLD, GREEN, GREEN_LINE, INK, ORANGE, WARM } from '../../engine/layout';
import type { Pt } from '../../engine/types';
import {
  GREEN_LIT, GREEN_SHADE, TAU, capsule, clamp01, disc, fillPts, line, mod, rnd, rounded, seg, shape, smooth, taper, tone,
  type Ctx,
} from './kit';

export const GAME_BG = '#12211a';
const SW = 330, SH = 270;
const NEAR_V = 110, TILE = 1320, RUN_GX = 96;
const MID_V = 40, MID_TILE = 440;
const FAR_V = 14, FAR_TILE = 300;

// ---- near ground ----
const GH: readonly Pt[] = [[0, 224], [318, 224], [346, 210], [560, 210], [604, 224], [900, 224], [936, 213], [1180, 213], [1214, 224], [1320, 224]];
function gh(X: number): number {
  const x = mod(X, TILE);
  for (let i = 1; i < GH.length; i++) {
    const a = GH[i - 1]!, b = GH[i]!;
    if (x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return 224;
}
/** the height of the near ground at screen-local x right now (the television draws its terrace from it) */
export const nearGroundAt = (lx: number, t: number) => gh(t * NEAR_V + lx);
const PIT: readonly [number, number] = [560, 604];
const TOP_A: Pt[] = rounded([[-4, 224], [318, 224], [346, 210], [PIT[0], 210]], 6);
const TOP_B: Pt[] = rounded([[PIT[1], 224], [900, 224], [936, 213], [1180, 213], [1214, 224], [TILE + 4, 224]], 6);
const BODY_A: Pt[] = [...TOP_A, [PIT[0] - 3, 290], [-4, 290]];
const BODY_B: Pt[] = [[PIT[1] + 3, 290], ...TOP_B, [TILE + 4, 290]];
const offset = (pts: readonly Pt[], dy: number, x0: number, x1: number): Pt[] => pts.filter((p) => p[0] > x0 && p[0] < x1).map((p) => [p[0], p[1] + dy]);
interface Blade { x: number; h: number; lean: number }
const BLADES: Blade[] = [];
for (let x = 6, i = 0; x < TILE; i++) {
  if (!(x > PIT[0] - 4 && x < PIT[1] + 4)) BLADES.push({ x, h: 3.5 + rnd(i * 3.3) * 5, lean: (rnd(i * 7.1) - 0.5) * 4 });
  x += 6 + rnd(i * 1.7) * 13;
}
interface Strat { x0: number; x1: number; dy: number }
const STRATA: Strat[] = [];
for (let i = 0, x = 10; x < TILE - 40; i++) {
  const len = 24 + rnd(i * 5.1) * 50;
  const dy = 13 + Math.floor(rnd(i * 2.9) * 3) * 12;
  if (!(x + len > PIT[0] - 10 && x < PIT[1] + 10)) STRATA.push({ x0: x, x1: x + len, dy });
  x += len * 0.6 + 10 + rnd(i * 9.3) * 30;
}

// ---- things on the near ground ----
const CRATES = [180, 1090];
interface Coin { x: number; up: number }
const COINS: Coin[] = [
  { x: 150, up: 46 }, { x: 180, up: 62 }, { x: 210, up: 46 },
  { x: 420, up: 22 }, { x: 450, up: 22 }, { x: 480, up: 22 },
  { x: 1060, up: 46 }, { x: 1090, up: 62 }, { x: 1120, up: 46 },
];
const SLIME_X = 762, FLAG_X = 985, STAR_X = 1262;
const DECOR: { x: number; k: 'mush' | 'rock' | 'bush' | 'post' }[] = [
  { x: 26, k: 'post' }, { x: 70, k: 'mush' }, { x: 262, k: 'rock' }, { x: 400, k: 'bush' }, { x: 520, k: 'rock' }, { x: 650, k: 'mush' },
  { x: 700, k: 'bush' }, { x: 860, k: 'rock' }, { x: 1020, k: 'bush' }, { x: 1150, k: 'mush' }, { x: 1196, k: 'rock' }, { x: 1300, k: 'bush' },
];

/** how high the runner is above the ground at world position X (its jumps are tied to the level, not to time) */
function air(X: number): number {
  const x = mod(X, TILE);
  const arc = (c: number, hw: number, h: number) => {
    const u = (x - c) / hw;
    return u > -1 && u < 1 ? h * (1 - u * u) : 0;
  };
  let a = arc(180, 58, 50) + arc(338, 30, 16) + arc(582, 56, 34) + arc(1090, 58, 50) + arc(STAR_X, 36, 30);
  // the slime: land on its head, then a big bounce
  if (x > 700 && x <= SLIME_X) {
    const u = (x - 700) / (SLIME_X - 700);
    a += 14 * u + 30 * Math.sin(Math.PI * u);
  } else if (x > SLIME_X && x < 852) {
    const u = (x - SLIME_X) / (852 - SLIME_X);
    a += 14 * (1 - u) + 58 * Math.sin(Math.PI * u);
  }
  return a;
}

// ---- mid and far layers ----
// the middle distance is terraced like the land outside the set: flats, short risers, one taller bluff
const MID_RAW: Pt[] = [[-4, 172], [38, 172], [50, 160], [104, 160], [116, 146], [170, 146], [186, 166], [248, 166], [262, 179], [304, 179], [316, 168], [370, 168], [384, 176], [412, 176], [420, 172], [444, 172]];
const MID_PTS: Pt[] = rounded(MID_RAW, 4);
const midY = (x: number) => {
  for (let i = 1; i < MID_RAW.length; i++) {
    const p = MID_RAW[i - 1]!, q = MID_RAW[i]!;
    if (x <= q[0]) return p[1] + ((x - p[0]) / (q[0] - p[0])) * (q[1] - p[1]);
  }
  return 172;
};
const MID_TREES: { x: number; k: 'pine' | 'round' | 'poplar'; s: number }[] = [
  { x: 24, k: 'pine', s: 1.25 }, { x: 70, k: 'round', s: 0.85 }, { x: 88, k: 'pine', s: 0.7 }, { x: 140, k: 'poplar', s: 1.1 }, { x: 156, k: 'round', s: 0.6 },
  { x: 284, k: 'round', s: 1.05 }, { x: 332, k: 'pine', s: 1.45 }, { x: 350, k: 'pine', s: 0.85 }, { x: 398, k: 'poplar', s: 0.8 },
];
const TOWER_X = 236;
const FAR_PTS: Pt[] = rounded(
  [[-4, 140], [26, 140], [36, 116], [74, 116], [86, 90], [122, 90], [134, 68], [166, 68], [176, 96], [208, 96], [220, 122], [258, 122], [268, 140], [FAR_TILE + 4, 140]],
  5,
);
const FAR_HATCH: Pt[] = [[31, 125], [80, 100], [128, 76], [172, 80], [214, 106], [263, 128], [150, 84], [100, 104]];
const STARS: { x: number; y: number; p: number }[] = [];
for (let i = 0; i < 16; i++) STARS.push({ x: 14 + rnd(i * 3.7) * 300, y: 12 + rnd(i * 8.3) * 80, p: 1.3 + rnd(i * 2.2) * 2.4 });

function cloud(ctx: Ctx, x: number, y: number, s: number) {
  const pts: Pt[] = [];
  const lobes: [number, number, number][] = [[-16, 0, 8], [-5, -6, 10], [9, -3, 9], [19, 1, 6]];
  for (const [lx, ly, r] of lobes) for (let a = Math.PI; a <= TAU + 0.01; a += 0.5) pts.push([x + (lx + Math.cos(a) * r) * s, y + (ly + Math.sin(a) * r * 0.8) * s]);
  shape(ctx, pts, tone(INK, 0.1), tone(INK, 0.55), 1.3);
}

function heart(ctx: Ctx, x: number, y: number, s: number, full: boolean) {
  ctx.beginPath();
  ctx.moveTo(x, y + 5 * s);
  ctx.bezierCurveTo(x - 9 * s, y - 1 * s, x - 5 * s, y - 8 * s, x, y - 3 * s);
  ctx.bezierCurveTo(x + 5 * s, y - 8 * s, x + 9 * s, y - 1 * s, x, y + 5 * s);
  ctx.closePath();
  ctx.fillStyle = full ? tone(ORANGE, 0.6) : tone(ORANGE, 0.12);
  ctx.fill();
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function star5(cx: number, cy: number, r: number, rot: number, sx = 1): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    out.push([cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr]);
  }
  return out;
}

/** the tiny runner, feet at (x, y): a small filled version of the cap walker, satchel and all */
function runner(ctx: Ctx, x: number, y: number, t: number, up: number) {
  const p = t * 2.9 * TAU;
  const fly = smooth(2, 14, up);
  const bob = (1 - fly) * 1.4 * Math.abs(Math.sin(p));
  const hip: Pt = [x, y - 13 - bob];
  const body = tone(INK, 0.2), dim = tone(INK, 0.6), skin = tone(WARM, 0.55), skinDim = tone(WARM, 0.32);
  const leg = (sgn: number, isFar: boolean) => {
    const sw = Math.sin(p) * sgn;
    const th = (1 - fly) * 0.95 * sw + fly * (sgn > 0 ? 1.1 : -0.5);
    const kb = (1 - fly) * (0.35 + 0.9 * Math.max(0, Math.cos(p) * sgn)) + fly * (sgn > 0 ? 1.3 : 1.0);
    const kx = hip[0] + Math.sin(th) * 6.5, ky = hip[1] + Math.cos(th) * 6.5;
    const fx = kx + Math.sin(th - kb) * 6.5, fy = Math.min(y - 2.2 + fly * 20, ky + Math.cos(th - kb) * 6.5);
    const st = isFar ? dim : INK, fill = isFar ? tone(INK, 0.1) : body;
    capsule(ctx, hip[0], hip[1], kx, ky, 2.7, 2.2, fill, st, 1.2);
    capsule(ctx, kx, ky, fx, fy, 2.2, 1.7, fill, st, 1.2);
    const fa = th - kb + 1.4, c = Math.cos(fa * 0.5), sn = Math.sin(fa * 0.5) * (fly > 0.3 || fy < y - 4 ? 1 : 0);
    const B = (bx: number, by: number): Pt => [fx + bx * c - by * sn, fy + bx * sn + by * c];
    shape(ctx, [B(-2.2, -1.6), B(1.6, -1.8), B(5, 0), B(5.2, 2.2), B(-2.4, 2.2)], isFar ? tone(INK, 0.24) : tone(INK, 0.42), st, 1.1);
  };
  const lean = 0.3 - fly * 0.15;
  const sh: Pt = [hip[0] + Math.sin(lean) * 11, hip[1] - Math.cos(lean) * 11];
  const arm = (sgn: number, isFar: boolean) => {
    const a = (1 - fly) * -1.1 * Math.sin(p) * sgn + fly * (sgn > 0 ? 2.4 : -2.2);
    const ex = sh[0] + Math.sin(a) * 5, ey = sh[1] + 1.5 + Math.cos(a) * 5;
    const f = a + 1.1, hx = ex + Math.sin(f) * 4.6, hy = ey + Math.cos(f) * 4.6;
    const st = isFar ? dim : INK;
    capsule(ctx, ex, ey, hx, hy, 1.7, 1.4, isFar ? skinDim : skin, isFar ? tone(WARM, 0.6) : tone(WARM, 0.95), 1);
    capsule(ctx, sh[0], sh[1] + 1.5, ex, ey, 2.1, 1.9, isFar ? tone(INK, 0.1) : body, st, 1.2);
    disc(ctx, hx + Math.sin(f) * 1.2, hy + Math.cos(f) * 1.2, 1.7, isFar ? skinDim : skin, isFar ? tone(WARM, 0.6) : tone(WARM, 0.95), 1);
  };
  arm(-1, true);
  leg(-1, true);
  // shirt, strap and satchel
  capsule(ctx, hip[0] + 0.4, hip[1], sh[0], sh[1], 4.4, 4.2, body, INK, 1.4);
  line(ctx, [[sh[0] + 2.4, sh[1] - 1], [hip[0] - 3, hip[1] - 1]], 1.4, tone(ORANGE, 0.85));
  const sb = bob * 0.8 + (1 - fly) * 0.8 * Math.sin(p * 2 - 1.2);
  shape(ctx, [[hip[0] - 6.4, hip[1] - 3 + sb], [hip[0] - 0.6, hip[1] - 3.4 + sb], [hip[0] - 0.4, hip[1] + 2.2 + sb], [hip[0] - 6, hip[1] + 2.4 + sb]], tone(ORANGE, 0.45), ORANGE, 1.1);
  // head: hair behind, warm face, the cap with its brim and button
  const hx = sh[0] + 2.2, hy = sh[1] - 6.8;
  for (let i = 0; i < 3; i++) taper(ctx, [[hx - 5, hy + i * 2], [hx - 9 - i, hy + 2.4 + i * 2.4 + Math.sin(p + i) * 0.8]], 2.4, INK, 1, 0, 0.9);
  disc(ctx, hx, hy, 6.4, skin, INK, 1.4);
  shape(ctx, [[hx + 5.6, hy - 0.6], [hx + 8.2, hy + 1], [hx + 5.6, hy + 2.6]], skin, tone(WARM, 0.95), 1);
  ctx.beginPath();
  ctx.arc(hx, hy - 0.4, 7, Math.PI * 1.02, TAU * 0.995);
  ctx.closePath();
  ctx.fillStyle = tone(INK, 0.6);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  shape(ctx, [[hx + 4.4, hy - 2.6], [hx + 11.5, hy - 1.4], [hx + 11.2, hy - 0.2], [hx + 5, hy - 0.6]], tone(INK, 0.8), INK, 1);
  disc(ctx, hx - 0.4, hy - 7.6, 1.1, ORANGE);
  disc(ctx, hx + 3.6, hy + 1.2, 0.95, '#0c100b');
  line(ctx, [[hx + 2.6, hy + 3.6], [hx + 4.2, hy + 4.4], [hx + 5.6, hy + 3.5]], 0.9, '#0c100b');
  leg(1, false);
  arm(1, false);
}

function slime(ctx: Ctx, x: number, y: number, t: number, squash: number) {
  const k = mod(t, 0.94) / 0.94;
  const hop = (1 - squash) * 9 * Math.sin(Math.PI * clamp01((k - 0.2) / 0.8));
  const land = Math.max(squash, k < 0.2 ? Math.sin((k / 0.2) * Math.PI) * 0.35 : 0);
  const w = 12 * (1 + land * 0.5), h = 13 * (1 - land * 0.5);
  const by = y - hop;
  ctx.beginPath();
  ctx.moveTo(x - w, by);
  ctx.bezierCurveTo(x - w, by - h * 1.25, x + w, by - h * 1.25, x + w, by);
  ctx.closePath();
  ctx.fillStyle = tone(BLUE, 0.4);
  ctx.fill();
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 1.7;
  ctx.lineJoin = 'round';
  ctx.stroke();
  disc(ctx, x - 3.6, by - h * 0.5, 1.2, INK);
  disc(ctx, x + 3.6, by - h * 0.5, 1.2, INK);
  line(ctx, [[x - 7, by - h * 0.62], [x - 5, by - h * 0.8]], 1, tone(BLUE, 0.9), 0.8);
  if (squash > 0.3) for (let i = -1; i <= 1; i++) seg(ctx, x + i * 9, by - h - 5, x + i * 14, by - h - 11, 1.2, INK, 0.8);
}

/** Draws the whole game. The origin is the top-left corner of the screen. */
export function drawGame(ctx: Ctx, t: number) {
  ctx.fillStyle = GAME_BG;
  ctx.fillRect(-6, -6, SW + 12, SH + 12);

  // sky: stars, a far bird, clouds
  for (const s of STARS) disc(ctx, s.x, s.y, 0.9, INK, null, 0, 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * s.p + s.x)));
  for (let k = 0; k < 2; k++) {
    const cx = mod(180 + k * 230 - t * 6.5, 460) - 60;
    cloud(ctx, cx, 46 + k * 24, 1 - k * 0.25);
  }
  {
    const bx = mod(t * 21, 520) - 90, by = 74 + 6 * Math.sin(t * 0.9), f = Math.sin(t * 9) * 3.2;
    line(ctx, [[bx - 6, by - f], [bx, by], [bx + 6, by - f]], 1.3, INK, 0.7);
  }

  // far terraced mountains
  const fo = mod(t * FAR_V, FAR_TILE);
  for (let k = 0; k <= 2; k++) {
    const ox = k * FAR_TILE - fo;
    if (ox > SW + 6 || ox + FAR_TILE < -6) continue;
    ctx.save();
    ctx.translate(ox, 0);
    fillPts(ctx, [...FAR_PTS, [FAR_TILE + 4, 290], [-4, 290]], '#22341f');
    line(ctx, FAR_PTS, 1.8, GREEN_LINE, 0.55);
    for (const h of FAR_HATCH) {
      seg(ctx, h[0], h[1], h[0] - 1.5, h[1] + 9, 1, GREEN_LINE, 0.22);
      seg(ctx, h[0] + 4, h[1] + 2, h[0] + 3, h[1] + 8, 1, GREEN_LINE, 0.22);
    }
    ctx.restore();
  }

  // mid hills with trees and a tower
  const mo = mod(t * MID_V, MID_TILE);
  for (let k = 0; k <= 1; k++) {
    const ox = k * MID_TILE - mo;
    if (ox > SW + 6 || ox + MID_TILE < -6) continue;
    ctx.save();
    ctx.translate(ox, 0);
    // tower behind the hill line
    {
      const bx = TOWER_X, by = midY(TOWER_X) + 3;
      shape(ctx, [[bx - 7, by], [bx - 7, by - 26], [bx - 9, by - 26], [bx - 9, by - 32], [bx - 5, by - 32], [bx - 5, by - 29], [bx - 2, by - 29], [bx - 2, by - 32], [bx + 2, by - 32], [bx + 2, by - 29], [bx + 5, by - 29], [bx + 5, by - 32], [bx + 9, by - 32], [bx + 9, by - 26], [bx + 7, by - 26], [bx + 7, by]], tone(GREEN_LINE, 0.14), GREEN_LINE, 1.3, 0.8);
      seg(ctx, bx, by - 20, bx, by - 14, 1.6, GREEN_LINE, 0.7);
      seg(ctx, bx, by - 32, bx, by - 46, 1.2, GREEN_LINE, 0.8);
      const fl = Math.sin(t * 6 + 1) * 1.6;
      fillPts(ctx, [[bx, by - 46], [bx + 10, by - 43 + fl], [bx, by - 40]], ORANGE, 0.85);
    }
    for (const tr of MID_TREES) {
      const tx = tr.x, ty = midY(tx) + 2, s = tr.s, sw = Math.sin(t * 1.3 + tx) * 0.7 * s;
      seg(ctx, tx, ty, tx + sw * 0.3, ty - 9 * s, 1.4, GREEN_LINE, 0.6);
      if (tr.k === 'pine') {
        for (let k = 0; k < (s > 1 ? 3 : 2); k++) shape(ctx, [[tx - (6.5 - k * 1.3) * s, ty - (6 + k * 5.5) * s], [tx + sw * (0.4 + k * 0.3), ty - (16 + k * 5.5) * s], [tx + (6.5 - k * 1.3) * s, ty - (6 + k * 5.5) * s]], GREEN_SHADE, GREEN_LINE, 1.2, 0.72);
      } else if (tr.k === 'round') {
        disc(ctx, tx + sw * 0.5, ty - 13 * s, 7 * s, GREEN_SHADE, GREEN_LINE, 1.2, 0.72, 6 * s);
        disc(ctx, tx - 4.5 * s + sw * 0.4, ty - 9.5 * s, 4 * s, GREEN_SHADE, GREEN_LINE, 1.1, 0.72);
        seg(ctx, tx - 2 * s, ty - 15 * s, tx + 1 * s, ty - 16.5 * s, 1, GREEN_LINE, 0.4);
      } else {
        shape(ctx, [[tx - 3 * s, ty - 6 * s], [tx - 3.6 * s, ty - 16 * s], [tx + sw, ty - 27 * s], [tx + 3.6 * s, ty - 16 * s], [tx + 3 * s, ty - 6 * s]], GREEN_SHADE, GREEN_LINE, 1.2, 0.72);
        seg(ctx, tx, ty - 9 * s, tx + sw * 0.5, ty - 21 * s, 1, GREEN_LINE, 0.35);
      }
    }
    fillPts(ctx, [...MID_PTS, [MID_TILE + 4, 290], [-4, 290]], '#2c4023');
    line(ctx, MID_PTS.map((p) => [p[0], p[1] + 3.6] as Pt), 3.4, '#385029', 0.9);
    for (let i = 1; i < MID_RAW.length; i++) {
      // a few strokes down each riser that faces away from the light
      const p = MID_RAW[i - 1]!, q = MID_RAW[i]!;
      if (q[1] - p[1] < 8) continue;
      fillPts(ctx, [[p[0], p[1] + 3], [q[0] + 2, q[1] + 3], [q[0] + 9, q[1] + 16], [p[0] + 1, p[1] + 22]], '#22331c');
      for (let k = 0; k < 3; k++) seg(ctx, p[0] + 2 + k * 4, p[1] + 5 + k * 3.4, p[0] + 3 + k * 4, p[1] + 12 + k * 3.4, 1, GREEN_LINE, 0.26);
    }
    line(ctx, MID_PTS, 2.2, GREEN_LINE, 0.78);
    for (let i = 0; i < 9; i++) {
      const x = 20 + i * 47, y = midY(x) + 11 + (i % 3) * 5;
      line(ctx, [[x, y], [x + 14, y + 1.5], [x + 24, y + 0.5]], 1, GREEN_LINE, 0.2);
    }
    ctx.restore();
  }

  // near ground
  const cam = t * NEAR_V;
  const Xr = mod(cam + RUN_GX, TILE);
  const no = mod(cam, TILE);
  for (let k = 0; k <= 1; k++) {
    const ox = k * TILE - no;
    if (ox > SW + 10 || ox + TILE < -10) continue;
    const vis = (X: number, m = 30) => X + ox > -m && X + ox < SW + m;
    ctx.save();
    ctx.translate(ox, 0);
    // pit walls
    if (vis(PIT[0], 80)) {
      fillPts(ctx, [[PIT[0] - 3, 214], [PIT[1] + 3, 228], [PIT[1] + 3, 290], [PIT[0] - 3, 290]], '#0a110c');
      for (let i = 0; i < 4; i++) seg(ctx, PIT[0] + 6 + i * 10, 240 + i * 8, PIT[0] + 12 + i * 10, 240 + i * 8, 1, GREEN_LINE, 0.18);
    }
    fillPts(ctx, BODY_A, GREEN);
    fillPts(ctx, BODY_B, GREEN);
    // lit band under the top line, shade low down
    ctx.globalAlpha = 1;
    line(ctx, offset(TOP_A, 4.5, -2, PIT[0] - 4), 5, GREEN_LIT, 0.9);
    line(ctx, offset(TOP_B, 4.5, PIT[1] + 4, TILE + 2), 5, GREEN_LIT, 0.9);
    ctx.fillStyle = GREEN_SHADE;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(-4, 252, TILE + 8, 40);
    ctx.globalAlpha = 1;
    for (const s of STRATA) if (vis(s.x0, 90)) line(ctx, [[s.x0, gh(s.x0) + s.dy], [(s.x0 + s.x1) / 2, gh((s.x0 + s.x1) / 2) + s.dy + 1.2], [s.x1, gh(s.x1) + s.dy]], 1, GREEN_LINE, 0.26);
    // pit edges
    line(ctx, [[PIT[0], 210], [PIT[0] - 3, 290]], 1.8, GREEN_LINE, 0.8);
    line(ctx, [[PIT[1], 224], [PIT[1] + 3, 290]], 1.8, GREEN_LINE, 0.8);
    line(ctx, TOP_A, 3, GREEN_LINE);
    line(ctx, TOP_B, 3, GREEN_LINE);
    for (const b of BLADES) if (vis(b.x, 10)) {
      const y = gh(b.x) - 1;
      taper(ctx, [[b.x, y], [b.x + b.lean * 0.4, y - b.h * 0.6], [b.x + b.lean, y - b.h]], 1.7, GREEN_LINE, 0.9, 0, 0.9);
    }
    // decor
    for (const d of DECOR) {
      if (!vis(d.x)) continue;
      const x = d.x, y = gh(x);
      if (d.k === 'mush') {
        seg(ctx, x, y, x, y - 6, 2.2, INK, 0.9);
        ctx.beginPath();
        ctx.arc(x, y - 6, 5.5, Math.PI, TAU);
        ctx.closePath();
        ctx.fillStyle = tone(ORANGE, 0.55);
        ctx.fill();
        ctx.strokeStyle = ORANGE;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        disc(ctx, x - 2, y - 8.5, 0.9, INK);
        disc(ctx, x + 2.2, y - 7.6, 0.7, INK);
      } else if (d.k === 'rock') {
        shape(ctx, [[x - 7, y], [x - 5, y - 6], [x + 1, y - 8], [x + 6, y - 4], [x + 8, y]], GREEN_SHADE, GREEN_LINE, 1.3, 0.9);
        seg(ctx, x + 1, y - 7, x + 2, y - 2, 1, GREEN_LINE, 0.4);
      } else if (d.k === 'bush') {
        const pts: Pt[] = [];
        for (let a = Math.PI; a <= TAU + 0.01; a += 0.35) pts.push([x + Math.cos(a) * 10, y + Math.sin(a) * (7 + 2 * Math.sin(a * 5 + x))]);
        shape(ctx, pts, GREEN_LIT, GREEN_LINE, 1.3, 0.95);
        disc(ctx, x - 3, y - 4, 1, ORANGE);
        disc(ctx, x + 4, y - 3, 1, ORANGE);
      } else {
        seg(ctx, x, y, x, y - 17, 1.8, GREEN_LINE);
        shape(ctx, [[x - 6, y - 19], [x + 6, y - 19], [x + 11, y - 15], [x + 6, y - 11], [x - 6, y - 11]], tone(GOLD, 0.2), GREEN_LINE, 1.3);
      }
    }
    for (const cx of CRATES) {
      if (!vis(cx)) continue;
      const y = gh(cx);
      shape(ctx, [[cx - 10, y - 20], [cx + 10, y - 20], [cx + 10, y], [cx - 10, y]], tone(GOLD, 0.22), GOLD, 1.8);
      line(ctx, [[cx - 10, y - 20], [cx + 10, y]], 1.2, GOLD, 0.8);
      line(ctx, [[cx + 10, y - 20], [cx - 10, y]], 1.2, GOLD, 0.8);
      line(ctx, [[cx - 10, y - 15], [cx + 10, y - 15]], 1, GOLD, 0.5);
    }
    // checkpoint flag: it runs up the pole as the runner passes
    if (vis(FLAG_X, 40)) {
      const y = gh(FLAG_X);
      const dx = mod(Xr - FLAG_X + TILE / 2, TILE) - TILE / 2;
      const up = smooth(-6, 44, dx);
      seg(ctx, FLAG_X, y, FLAG_X, y - 40, 1.8, INK);
      disc(ctx, FLAG_X, y - 41, 1.8, GOLD);
      const fy = y - 12 - 24 * up, fl = Math.sin(t * 7 + 2) * 1.8;
      fillPts(ctx, [[FLAG_X, fy - 5], [FLAG_X + 8, fy - 3 + fl * 0.5], [FLAG_X + 15, fy + fl], [FLAG_X + 8, fy + 3 + fl * 0.5], [FLAG_X, fy + 5]], up > 0.5 ? ORANGE : tone(ORANGE, 0.5));
      shape(ctx, [[FLAG_X - 5, y], [FLAG_X - 3, y - 4], [FLAG_X + 3, y - 4], [FLAG_X + 5, y]], GREEN_SHADE, GREEN_LINE, 1.2);
    }
    // coins and the star: they spin, bob, and pop when collected
    const pickup = (X: number, up: number, i: number, big: boolean) => {
      if (!vis(X, 40)) return;
      const dx = mod(Xr - X + TILE / 2, TILE) - TILE / 2; // > 0 once the runner has passed
      const y = gh(X) - up + Math.sin(t * 3.1 + i * 1.3) * 1.6;
      if (dx < 0) {
        const sp = Math.cos(t * 5.2 + i * 0.9);
        if (big) {
          shape(ctx, star5(X, y, 8.5, 0, 0.35 + 0.65 * Math.abs(sp)), tone(GOLD, 0.5), GOLD, 1.5);
        } else {
          disc(ctx, X, y, 5.6 * (0.25 + 0.75 * Math.abs(sp)), tone(GOLD, 0.45), GOLD, 1.5, 1, 5.6);
          seg(ctx, X, y - 2.4, X, y + 2.4, 1.1, GOLD, 0.9);
        }
      } else if (dx < 40) {
        const u = dx / 40;
        for (let r = 0; r < 6; r++) {
          const a = (r / 6) * TAU + 0.4, r0 = 4 + u * 9, r1 = r0 + 4 * (1 - u);
          seg(ctx, X + Math.cos(a) * r0, y - u * 8 + Math.sin(a) * r0, X + Math.cos(a) * r1, y - u * 8 + Math.sin(a) * r1, 1.3, GOLD, 1 - u);
        }
      }
    };
    COINS.forEach((c, i) => pickup(c.x, c.up, i, false));
    pickup(STAR_X, 40, 11, true);
    if (vis(SLIME_X, 40)) {
      const dx = mod(Xr - SLIME_X + TILE / 2, TILE) - TILE / 2;
      slime(ctx, SLIME_X, gh(SLIME_X), t, Math.exp(-(dx * dx) / 240));
    }
    ctx.restore();
  }

  // the runner, its shadow and the dust it kicks up
  const up = air(Xr);
  const inPit = Xr > PIT[0] && Xr < PIT[1];
  const gy = inPit ? 217 : gh(Xr);
  if (!inPit) disc(ctx, RUN_GX, gy + 1.5, 8 * (1 - 0.5 * clamp01(up / 50)), '#16210f', null, 0, 0.7, 2);
  if (up < 2 && !inPit) {
    for (let i = 0; i < 3; i++) {
      const u = mod(t * 2.9 * 2 + i / 3, 1);
      disc(ctx, RUN_GX - 6 - u * 18, gy - 1 - u * 5, 1.2 + u * 2.4, null, GREEN_LINE, 1, 0.55 * (1 - u));
    }
  }
  ctx.save();
  ctx.translate(RUN_GX, gy - up);
  ctx.scale(1.32, 1.32);
  runner(ctx, 0, 0, t, up);
  ctx.restore();

  // hearts and the row of coin pips
  const beat = 1 + 0.12 * Math.max(0, Math.sin(t * 4.4)) ** 6;
  heart(ctx, 46, 30, 1, true);
  heart(ctx, 64, 30, 1, true);
  heart(ctx, 82, 30, beat, true);
  let got = 0;
  for (const c of COINS) if (c.x < Xr) got++;
  const bank = Xr > STAR_X; // the star banks the row
  for (let i = 0; i < COINS.length; i++) {
    const x = 292 - i * 10.5, on = i < got && !(bank && Math.sin(t * 22) > 0);
    disc(ctx, x, 30, 3.4, on ? GOLD : null, GOLD, 1.2, on ? 1 : 0.5);
  }
}
