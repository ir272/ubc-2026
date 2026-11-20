// The land: the frontmost layer of ground across the whole scene. At the left it is a low terraced
// foreground in front of the hills; from x ~ 1000 it is a STRIP of land, 45 to 110 units thick, with bare
// paper below it, as in Ian's picture. Everything here is still, so it is painted once into a cache:
// body green, a lit sheen under the top line, a shade plane toward the underside with hatching, strata
// hairlines that follow the form, embedded stones, roots under the tree, a worn footpath, a ragged
// underside with hanging root hairs and crumbled pebbles, and the heavy glowing contour on top.
import {
  BLUE, COUCH, GREEN, GREEN_DEEP, GREEN_LINE, GREEN_LIT, GREEN_SHADE, GREEN_SHEEN, H, INK, LINE, ORANGE, PAPER, SIGN, TREE, W, WARM, landTopY, rnd,
  tone, underY,
} from '../engine/layout';
import type { Part, Pen, Pt } from '../engine/types';
import { paintSheet } from './world/paper';
import { TAU, arc, blob, mod, noise } from './world/util';

const X0 = -20, X1 = W + 20;

/** the drawn top line: landTopY with its corners eased and the faintest hand irregularity */
export function topY(x: number): number {
  const s = (landTopY(x - 14) + 2 * landTopY(x) + landTopY(x + 14)) / 4;
  return s + noise(x / 46, 3) * 1.3 + noise(x / 17, 9) * 0.5;
}
/** the drawn underside: underY made ragged, with small overhangs */
function botY(x: number): number {
  if (x <= 880) return H + 40;
  const notch = Math.max(0, noise(x / 60, 21) - 0.45) * 22; // a bite out of the underside now and then
  return underY(x) + noise(x / 31, 5) * 5 + noise(x / 9, 13) * 1.8 - notch;
}
const sample = (fn: (x: number) => number, a: number, b: number, step = 6): Pt[] => {
  const out: Pt[] = [];
  for (let x = a; x < b; x += step) out.push([x, fn(x)]);
  out.push([b, fn(b)]);
  return out;
};

// inner terraces of the left foreground mass: each a contour with nearer, darker land in front of it
export const TERRACES: Pt[][] = [
  [[-20, 872], [60, 860], [150, 858], [180, 884], [300, 890], [420, 884], [450, 912], [600, 922], [700, 918], [760, 950], [830, 1010]],
  [[-20, 950], [90, 940], [220, 946], [250, 968], [420, 978], [520, 1010]],
];
const TERRACE_FILL = ['#2c3d20', '#243219'];

// A gully cut by a small stream runs diagonally down the foreground, across both terraces, so the long
// horizontals are broken. Centre line from its spring under the front edge to the bottom of the sheet.
// It picks up the hill stream where that runs under the land's front edge (parts/left/land.ts ends its
// STREAM at about 574, 804) and carries it on, down and to the left, off the bottom of the sheet.
export const GULLY: Pt[] = [[582, 790], [570, 818], [552, 850], [530, 882], [508, 910], [484, 930], [452, 944], [424, 962], [398, 984], [366, 998], [330, 1014]];
const GULLY_W = [6, 9, 12, 14, 14, 17, 18, 16, 19, 20, 22];

// the stretch of land the couch, its side table and the kicked-off shoes stand on, the trunk, and the sign post
const STANDS: [number, number, number][] = [[COUCH.x - 78, COUCH.x + 404, 1], [TREE.x - 64, TREE.x + 74, 0.8], [SIGN.x - 36, SIGN.x + 46, 0.7]];

function paint(p: Pen) {
  const c = p.ctx;
  const top = sample(topY, X0, X1);
  const under = sample(botY, 884, X1, 5);
  const body: Pt[] = [...top, ...under.slice().reverse(), [884, H + 40], [X0, H + 40]];
  // Below the strip there is only bare paper: the sheet is laid back over whatever a farther layer left
  // hanging under the land's underside. Baked here, so the land and that patch are one blit.
  c.save();
  c.beginPath();
  c.moveTo(884, H + 10);
  for (const [x, y] of under) c.lineTo(x, y - 1);
  c.lineTo(X1, H + 10);
  c.closePath();
  c.clip();
  paintSheet(p);
  c.restore();
  p.fill(body, GREEN);

  // ---- shade plane: the lower part of the strip, and the right-facing flank of the left mass
  const shadeTop = (x: number) => {
    const t = topY(x), b = botY(x);
    // on the flank of the left mass the shade is a wedge that starts as a point at the bottom edge
    const k = x < 1060 ? 0.56 * Math.min(1, (x - 884) / 150) ** 0.7 : x < 1240 ? 0.44 + 0.12 * ((1240 - x) / 180) : 0.44;
    return b - (b - t) * (k * (1 + 0.2 * noise(x / 120, 31))) - noise(x / 37, 33) * 3 * Math.min(1, (x - 884) / 100);
  };
  const shade: Pt[] = [...sample(shadeTop, 884, X1, 8), ...under.slice().reverse()];
  p.fill(shade, GREEN_SHADE);
  p.hatch(shade, { angle: 1.05, gap: 8.5, width: 1.2, color: PAPER, alpha: 0.5, seed: 4, breakup: 0.42 });

  // ---- inner terraces of the left mass. Each nearer layer is a darker green; a broken shade wedge lies in
  // the pockets above its line, and ONE lit sheen band lies under the line: thick on the flats, pinched to
  // nothing on the cliffs. No halo here: the glow belongs to the front edge and the ridge alone.
  const slopeAt = (line: Pt[], i: number) => {
    const a = line[Math.max(0, i - 2)]!, b = line[Math.min(line.length - 1, i + 2)]!;
    return Math.abs((b[1] - a[1]) / Math.max(1, b[0] - a[0]));
  };
  TERRACES.forEach((tr, i) => {
    const line = p.curve(tr, 10);
    // shade in the pockets above the line (the foot of the farther layer), in broken wedges
    let wedge: Pt[] = [];
    const flushWedge = () => {
      if (wedge.length > 3) {
        const up = wedge.map(([x, y], k): Pt => {
          const u = k / (wedge.length - 1);
          return [x + 5, y - (7 + 20 * Math.sin(u * Math.PI) ** 0.7 * (0.7 + 0.3 * noise(x / 40, 46 + i)))];
        }).reverse();
        const shape = [...wedge, ...up];
        p.fill(shape, GREEN_SHADE);
        p.hatch(shape, { angle: 1.25, gap: 8, width: 1.1, color: PAPER, alpha: 0.5, seed: 50 + i + wedge[0]![0], breakup: 0.45 });
      }
      wedge = [];
    };
    line.forEach((q, k) => {
      if (noise(q[0] / 110, 40 + i * 3) > -0.15 || slopeAt(line, k) > 0.45) wedge.push(q);
      else flushWedge();
    });
    flushWedge();
    // the nearer layer itself
    p.fill([...line, [line[line.length - 1]![0], H + 40], [X0, H + 40]], TERRACE_FILL[i]!);
    const sheen: Pt[] = [...line.map(([x, y]): Pt => [x, y + 1.5])];
    for (let k = line.length - 1; k >= 0; k--) {
      const [x, y] = line[k]!;
      const flat = 1 - Math.min(1, slopeAt(line, k) * 2.4);
      sheen.push([x - 2, y + 2 + flat * (9 + 6 * noise(x / 60, 44 + i)) * (0.55 + 0.45 * Math.min(1, Math.max(0, noise(x / 140, 48 + i) + 0.8)))]);
    }
    p.fill(sheen, i ? '#34482a' : GREEN_LIT);
  });
  // ---- lit sheen band just under the top line, in broken brush-lengths; contact shade where things stand
  const standing = (x: number) => STANDS.some(([a, b]) => x > a && x < b);
  let run: Pt[] = [];
  const flush = (col: string, depth: (x: number) => number) => {
    if (run.length > 2) {
      const lower = run.map(([x, y]): Pt => [x, y + depth(x)]).reverse();
      // taper both ends of the band to a point
      p.fill([[run[0]![0] - 10, run[0]![1] + 4], ...run.map(([x, y]): Pt => [x, y + 3]), [run[run.length - 1]![0] + 12, run[run.length - 1]![1] + 5], ...lower], col);
    }
    run = [];
  };
  for (let x = X0; x <= X1; x += 6) {
    const on = !standing(x) && noise(x / 90, 61) > -0.42;
    if (on) run.push([x, topY(x)]);
    else flush(GREEN_LIT, (xx) => 9 + 5 * noise(xx / 44, 63));
  }
  flush(GREEN_LIT, (xx) => 9 + 5 * noise(xx / 44, 63));
  for (let x = X0; x <= X1; x += 6) {
    const on = !standing(x) && noise(x / 70, 67) > 0.25;
    if (on) run.push([x, topY(x) + 1]);
    else flush(GREEN_SHEEN, () => 5.5);
  }
  flush(GREEN_SHEEN, () => 5.5);
  // contact shade: a designed band of land-shade under everything that stands here, deepest in the middle,
  // ragged along its lower edge, hatched, so the couch, the table, the trunk and the post sit IN the land
  for (const [a, b, k] of STANDS) {
    const band: Pt[] = [];
    for (let x = a; x <= b; x += 6) band.push([x, topY(x) + 2.5]);
    for (let x = b; x >= a; x -= 6) {
      const u = (x - a) / (b - a);
      band.push([x, topY(x) + 3 + k * (19 * Math.sin(u * Math.PI) ** 0.45 + 4 * noise(x / 23, 87))]);
    }
    p.fill(band, GREEN_SHADE);
    p.hatch(band, { angle: 0.5, gap: 7, width: 1.1, color: PAPER, alpha: 0.45, seed: 88 + a, breakup: 0.4 });
  }

  // ---- strata: hairlines that follow the form, broken into uneven lengths
  c.save();
  c.lineCap = 'round';
  c.lineWidth = 1.25;
  c.strokeStyle = GREEN_SHEEN;
  c.globalAlpha = 0.8;
  c.beginPath();
  const strata = (depth: (x: number) => number, a: number, b: number, seed: number) => {
    let x = a + rnd(seed) * 40, j = 0;
    while (x < b) {
      const len = 30 + rnd(seed + j * 3.1) * 110;
      let first = true;
      for (let u = x; u <= Math.min(b, x + len); u += 6) {
        const y = topY(u) + depth(u);
        if (y > botY(u) - 5) {
          first = true;
          continue;
        }
        if (first) c.moveTo(u, y);
        else c.lineTo(u, y);
        first = false;
      }
      x += len + 14 + rnd(seed + j * 5.3 + 1) * 46;
      j++;
    }
  };
  strata((x) => 19 + noise(x / 80, 71) * 3, 1000, X1, 1);
  strata((x) => 31 + noise(x / 70, 73) * 4, 1000, X1, 2);
  for (let k = 0; k < 9; k++) strata((x) => 24 + k * 26 + noise(x / 90, 75 + k) * 6 + (x / 40) * (k % 2 ? 1 : -0.6), X0, 1180, 10 + k);
  c.stroke();
  c.restore();

  // ---- cliff faces: short vertical hatch where the top line steps
  c.save();
  c.lineCap = 'round';
  c.lineWidth = 1.2;
  c.strokeStyle = PAPER;
  c.globalAlpha = 0.55;
  c.beginPath();
  for (let x = X0; x < 1010; x += 3.2 + rnd(x) * 2.4) {
    const slope = Math.abs(topY(x + 5) - topY(x - 5)) / 10;
    if (slope < 0.42) continue;
    const y = topY(x) + 7 + rnd(x * 3.3) * 5;
    c.moveTo(x, y);
    c.lineTo(x + 1.5, y + 12 + rnd(x * 7.1) * 20);
  }
  c.stroke();
  c.restore();

  // ---- the worn footpath where the walkers go: pale dashes and grit just under the contour
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = GREEN_LINE;
  c.fillStyle = GREEN_LINE;
  for (let x = 1016, j = 0; x < 2250; j++) {
    const len = 8 + rnd(j * 2.9 + 80) * 22;
    const dy = 9 + rnd(j * 4.7 + 81) * 6;
    c.globalAlpha = 0.2 + rnd(j * 6.1 + 82) * 0.22;
    c.lineWidth = 1.3 + rnd(j * 3.7) * 0.6;
    c.beginPath();
    c.moveTo(x, topY(x) + dy);
    c.lineTo(x + len, topY(x + len) + dy);
    c.stroke();
    if (rnd(j * 8.3 + 83) < 0.35) {
      c.globalAlpha = 0.4;
      c.beginPath();
      c.arc(x + len + 5, topY(x + len + 5) + dy + 2, 1.1, 0, 6.3);
      c.fill();
    }
    x += len + 7 + rnd(j * 5.9 + 84) * 30;
  }
  c.restore();

  // ---- stones embedded in the land: shade body, a lit upper-left facet, a detail outline
  const stone = (x: number, y: number, r: number, seed: number) => {
    const b = blob(x, y, r, r * 0.7, seed, 12, 0.2);
    p.fill(b, GREEN_SHADE);
    p.fill(blob(x - r * 0.22, y - r * 0.2, r * 0.6, r * 0.36, seed + 1, 10, 0.2), GREEN_LIT);
    p.stroke([...b, b[0]!], { color: GREEN_LINE, width: r > 7 ? 1.7 : 1.3, seed, alpha: 0.6 });
    if (r > 6.5) p.stroke([[x + r * 0.1, y + r * 0.1], [x + r * 0.5, y + r * 0.32]], { color: GREEN_LINE, width: 1.1, alpha: 0.45, seed, taper: 0.4 });
  };
  for (let i = 0; i < 20; i++) {
    const x = 1040 + rnd(i * 3.3 + 90) * 1940;
    const t = topY(x), b = botY(x);
    stone(x, t + 18 + rnd(i * 5.1 + 91) * Math.max(4, b - t - 34), 4 + rnd(i * 7.7 + 92) * 6, 100 + i);
  }
  for (let i = 0; i < 14; i++) {
    const x = 20 + rnd(i * 4.1 + 95) * 900;
    stone(x, topY(x) + 30 + rnd(i * 6.3 + 96) * 170, 5 + rnd(i * 2.7 + 97) * 8, 140 + i);
  }

  // ---- roots of the tree, gripping down into the strip
  for (let i = 0; i < 5; i++) {
    const x = TREE.x - 34 + i * 17 + rnd(i * 3.9) * 6;
    const dir = i < 2 ? -1 : 1;
    const len = 34 + rnd(i * 5.5 + 3) * 40;
    const y = topY(x) + 3;
    p.stroke(p.curve([[x, y], [x + dir * 6, y + len * 0.35], [x + dir * 18, y + len * 0.7], [x + dir * (22 + i * 3), y + len]], 6), {
      color: INK, width: 2.2, alpha: 0.5, seed: 200 + i, taper: [0, 0.8],
    });
    p.stroke(p.curve([[x + dir * 8, y + len * 0.4], [x + dir * 20, y + len * 0.5], [x + dir * 30, y + len * 0.48]], 5), {
      color: INK, width: 1.4, alpha: 0.4, seed: 210 + i, taper: [0, 0.9],
    });
  }

  // ---- the underside: a thinner, ragged contour, with root hairs hanging from it and crumbled pebbles below
  p.stroke(under, { color: GREEN_LINE, width: 2.6, seed: 31, alpha: 0.72, wobble: 0 });
  for (let i = 0; i < 46; i++) {
    const x = 1010 + rnd(i * 2.9 + 300) * 1980;
    const y = botY(x) + 1;
    const len = 7 + rnd(i * 4.3 + 301) ** 2 * 26;
    const sw = (rnd(i * 6.7 + 302) - 0.5) * 12;
    p.stroke(p.curve([[x, y], [x + sw * 0.3, y + len * 0.5], [x + sw, y + len]], 5), {
      color: GREEN_LINE, width: 1.4, alpha: 0.45, seed: 320 + i, taper: [0, 0.9],
    });
  }
  const crumbs: [number, number, number][] = [[1310, 20, 4.2], [1322, 34, 2.4], [1905, 18, 3.6], [2466, 22, 4.6], [2478, 38, 2.2], [2860, 16, 3]];
  crumbs.forEach(([x, dy, r], i) => {
    const b = blob(x, underY(x) + dy, r, r * 0.8, 400 + i, 9, 0.22);
    p.fill(b, GREEN_SHADE);
    p.stroke([...b, b[0]!], { color: GREEN_LINE, width: 1.3, alpha: 0.6, seed: 410 + i });
  });

  // ---- the gully and its stream
  paintGully(p);

  // ---- things lying on and in the land: stones, mushrooms, fallen leaves, a burrow, a fossil
  paintProps(p);

  // ---- the terrace contours: form weight, no halo, thinning where they run under the land in front
  TERRACES.forEach((tr, i) => p.stroke(p.curve(tr, 10), { color: GREEN_LINE, width: i ? LINE.form : LINE.form + 0.5, seed: 500 + i, alpha: i ? 0.5 : 0.72, taper: [0.03, 0.3] }));
  // ---- last, the heavy top contour with its glow: the front edge of the land and the ridge
  p.glow(top, { color: GREEN_LINE, width: LINE.contour, seed: 41 });
  // the stream comes over the front edge here: the water breaks the contour, with a tick of foam each side
  {
    const [gx, gy] = GULLY[0]!;
    p.stroke([[gx + 4, gy - 9], [gx, gy + 2], [gx - 5, gy + 14]], { color: tone(BLUE, 0.5), width: 7.5, seed: 680, wobble: 0 });
    p.stroke([[gx + 3, gy - 8], [gx - 1, gy + 3], [gx - 5, gy + 13]], { color: BLUE, width: 1.5, seed: 681, alpha: 0.8, wobble: 0, taper: 0.2 });
    p.stroke([[gx - 7, gy + 6], [gx - 10, gy + 10]], { color: INK, width: 1.3, seed: 682, alpha: 0.7, taper: [0, 0.6] });
    p.stroke([[gx + 6, gy + 1], [gx + 8, gy + 6]], { color: INK, width: 1.3, seed: 683, alpha: 0.7, taper: [0, 0.6] });
  }
}

function paintGully(p: Pen) {
  const c = p.ctx;
  const n = GULLY.length;
  const left: Pt[] = [], right: Pt[] = [];
  const mid = p.curve(GULLY, 6);
  const wAt = (u: number) => {
    const f = u * (n - 1), i = Math.min(n - 2, Math.floor(f));
    return GULLY_W[i]! + (GULLY_W[i + 1]! - GULLY_W[i]!) * (f - i);
  };
  mid.forEach(([x, y], k) => {
    const a = mid[Math.max(0, k - 1)]!, b = mid[Math.min(mid.length - 1, k + 1)]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    const w = wAt(k / (mid.length - 1)) * (1 + 0.22 * noise(k / 3, 601));
    left.push([x - (dy / dl) * w, y + (dx / dl) * w * 0.7]);
    right.push([x + (dy / dl) * w, y - (dx / dl) * w * 0.7]);
  });
  const bed = [...left, ...right.slice().reverse()];
  p.fill(bed, GREEN_DEEP);
  p.hatch(bed, { angle: 0.9, gap: 6, width: 1.1, color: PAPER, alpha: 0.55, seed: 610, breakup: 0.35 });
  // the lit bank (it faces up and left) and the shaded bank
  p.stroke(right, { color: GREEN_LINE, width: LINE.detail, seed: 611, alpha: 0.7, taper: [0.2, 0.12] });
  p.stroke(left, { color: GREEN_LINE, width: 1.4, seed: 612, alpha: 0.38, taper: [0.25, 0.15] });
  // the water: a thin ribbon down the middle, with a pale fall where it drops over each terrace
  const water = mid.map(([x, y], k): Pt => [x + 2 * noise(k / 2.3, 620), y]);
  p.stroke(water, { color: tone(BLUE, 0.5), width: 5.5, seed: 621, taper: [0.25, 0.02], wobble: 0 });
  p.stroke(water, { color: BLUE, width: 1.5, seed: 622, alpha: 0.75, taper: [0.3, 0.05] });
  // stones in and beside the bed
  for (let i = 0; i < 9; i++) {
    const k = Math.floor((0.08 + (i / 9) * 0.86) * (mid.length - 1));
    const side = i % 2 ? 1 : -1;
    const [x, y] = mid[k]!;
    const w = wAt(k / (mid.length - 1));
    const r = 3.5 + rnd(i * 3.3 + 630) * 4.5;
    const b = blob(x + side * w * (0.7 + rnd(i * 5.1) * 0.5), y + 2, r, r * 0.72, 640 + i, 11, 0.2);
    p.fill(b, GREEN_SHADE);
    p.fill(blob(b[0]![0] - r * 1.2, y + 0.6, r * 0.55, r * 0.32, 650 + i, 9, 0.2), GREEN_LIT);
    p.stroke([...b, b[0]!], { color: GREEN_LINE, width: 1.4, seed: 660 + i, alpha: 0.7 });
  }
}

// stones sitting on the land's top edge: [x, radius]
const STONES: [number, number][] = [
  [96, 11], [118, 6], [262, 8], [430, 12], [452, 6], [742, 7], [884, 10], [1068, 9], [1084, 5], [1236, 12], [1260, 6],
  [1404, 7], [1548, 10], [1566, 5.5], [1712, 8], [1846, 11], [1866, 6], [1990, 7], [2052, 9], [2176, 8], [2232, 10], [2246, 5],
  [2786, 9], [2836, 12], [2858, 6.5], [2952, 8],
];
const MUSHROOMS: [number, number][] = [[1186, 1], [1968, 0.85], [2204, 1.1], [2896, 0.9], [2910, 0.6], [520, 1], [1640, 0.7]];
/** where the snail's stone is (the stories part puts the snail on it) */
export const SNAIL_STONE: readonly [number, number] = [1236, 12];
/** the burrow in the face of the strip (the stories part puts the eyes in it) */
export const BURROW: readonly [number, number] = [1512, topY(1512) + 31];

function paintProps(p: Pen) {
  STONES.forEach(([x, r], i) => {
    const y = topY(x) - r * 0.28;
    const b = blob(x, y, r, r * 0.72, 700 + i, 12, 0.2);
    p.fill(b, GREEN_SHADE);
    // lit upper-left facet, a clean designed shape
    p.fill(blob(x - r * 0.24, y - r * 0.24, r * 0.62, r * 0.34, 730 + i, 10, 0.2), GREEN_LIT);
    p.stroke([...b, b[0]!], { color: GREEN_LINE, width: r > 8 ? 1.9 : 1.5, seed: 760 + i, alpha: 0.82 });
    if (r > 7) {
      // a facet crack and a lichen tick
      p.stroke([[x + r * 0.15, y - r * 0.5], [x + r * 0.28, y], [x + r * 0.1, y + r * 0.4]], { color: GREEN_LINE, width: 1.2, alpha: 0.55, seed: 790 + i, taper: 0.4 });
      p.stroke(arc(x - r * 0.4, y - r * 0.05, 2.4, 1.8, 0.4, 4.4, 6), { color: INK, width: 1.2, alpha: 0.6, seed: 820 + i });
    }
  });
  MUSHROOMS.forEach(([x, s], i) => {
    const y = topY(x) + 2;
    const stem = [[x - 2.6 * s, y], [x - 2 * s, y - 9 * s], [x + 2 * s, y - 9 * s], [x + 2.8 * s, y]] as const;
    p.fill(stem, tone(INK, 0.3));
    p.stroke(stem, { color: INK, width: 1.4, seed: 850 + i, alpha: 0.9 });
    const cap = [...arc(x, y - 9 * s, 9 * s, 8 * s, Math.PI, Math.PI * 2, 12), [x - 9 * s, y - 9 * s] as const];
    p.fill(cap, tone(ORANGE, 0.5));
    p.fill([...arc(x, y - 9 * s, 9 * s, 8 * s, Math.PI * 1.55, Math.PI * 2, 8), [x + 2 * s, y - 9 * s] as const], tone(ORANGE, 0.28));
    p.stroke(cap, { color: ORANGE, width: 1.8, seed: 860 + i });
    p.ctx.fillStyle = INK;
    for (const [dx, dy, rr] of [[-4, -4.4, 1.3], [1.5, -5.6, 1.1], [-0.6, -2.4, 0.9]] as const) {
      p.ctx.beginPath();
      p.ctx.arc(x + dx * s, y - 9 * s + dy * s, rr * s, 0, 6.3);
      p.ctx.fill();
    }
  });
  // fallen leaves under the tree
  for (let i = 0; i < 13; i++) {
    const x = TREE.x - 170 + rnd(i * 3.7 + 900) * 400;
    if (x > W - 10) continue;
    const y = topY(x) + 4 + rnd(i * 5.1 + 901) * 9;
    const a = (rnd(i * 7.3 + 902) - 0.5) * 1.4;
    const dx = Math.cos(a) * 5.5, dy = Math.sin(a) * 5.5;
    const leaf = p.curve([[x - dx, y - dy], [x - dy * 0.5, y + dx * 0.5], [x + dx, y + dy], [x + dy * 0.5, y - dx * 0.5]], 5, true);
    p.fill(leaf, tone(INK, 0.3));
    p.stroke(leaf, { color: INK, width: 1.2, alpha: 0.65, seed: 910 + i });
    p.stroke([[x - dx, y - dy], [x + dx, y + dy]], { color: INK, width: 1, alpha: 0.45, seed: 930 + i });
  }
  // a burrow in the face of the strip: a dark mouth with a lit lip above, a spill of dug earth below
  {
    const [bx, by] = BURROW;
    p.fill(blob(bx + 3, by + 13, 19, 5, 941, 12, 0.2), GREEN_SHADE);
    p.fill(arc(bx, by, 13, 9.5, 0, TAU, 16), PAPER);
    p.stroke(arc(bx, by, 13, 9.5, Math.PI * 0.9, Math.PI * 2.1, 14), { color: GREEN_LINE, width: LINE.detail, seed: 942, alpha: 0.8, taper: 0.12 });
    for (let i = 0; i < 5; i++) {
      const b = blob(bx - 14 + i * 8 + rnd(i * 3 + 943) * 3, by + 13 + rnd(i * 5 + 944) * 3, 2.2 + rnd(i * 7) * 1.6, 1.8, 945 + i, 8, 0.2);
      p.fill(b, GREEN_LIT);
    }
  }
  // a fossil shell in the strip: a small spiral, hairline
  {
    const fx = 2452, fy = topY(2452) + 52;
    const sp: Pt[] = [];
    for (let k = 0; k <= 30; k++) {
      const a = k * 0.42, r = 1 + k * 0.3;
      sp.push([fx + Math.cos(a) * r, fy + Math.sin(a) * r * 0.9]);
    }
    p.fill(arc(fx, fy, 10.4, 9.4, 0, TAU, 16), GREEN_SHADE);
    p.stroke(sp, { color: GREEN_LINE, width: 1.3, seed: 950, alpha: 0.7, wobble: 0 });
    for (let k = 20; k < 30; k += 2) {
      const a = k * 0.42, r0 = 1 + (k - 15) * 0.3, r1 = 1 + k * 0.3;
      p.stroke([[fx + Math.cos(a) * r0, fy + Math.sin(a) * r0 * 0.9], [fx + Math.cos(a) * r1, fy + Math.sin(a) * r1 * 0.9]], { color: GREEN_LINE, width: 1, alpha: 0.5, seed: 951 + k, wobble: 0 });
    }
  }
  // a cairn beside the path: four stones stacked by somebody who walked here before
  {
    const cx = 1668, base = topY(cx) + 1;
    let y = base;
    ([[12, 7.5, 0], [9, 6, 1.5], [6.6, 4.8, -1], [4.2, 3.4, 0.6]] as const).forEach(([rx, ry, dx], i) => {
      y -= ry * 0.92;
      const b = blob(cx + dx, y, rx, ry, 960 + i, 12, 0.14);
      p.fill(b, i % 2 ? '#2a3a20' : GREEN_SHADE);
      p.fill(blob(cx + dx - rx * 0.25, y - ry * 0.3, rx * 0.6, ry * 0.36, 965 + i, 10, 0.2), GREEN_LIT);
      p.stroke([...b, b[0]!], { color: GREEN_LINE, width: i < 2 ? LINE.detail : 1.4, seed: 970 + i, alpha: 0.85 });
      if (i < 2) p.stroke([[cx + dx + rx * 0.2, y - ry * 0.4], [cx + dx + rx * 0.45, y + ry * 0.3]], { color: GREEN_LINE, width: 1.1, alpha: 0.5, seed: 975 + i, taper: 0.4 });
      y -= ry * 0.92;
    });
  }
  // a short rope fence where the path leaves the hill: three weathered posts, the rope sagging between them
  {
    const posts = [1102, 1146, 1192];
    const tops: Pt[] = posts.map((x, i): Pt => [x + (i - 1) * 1.5, topY(x) - 24 - (i === 1 ? 3 : 0)]);
    for (let i = 0; i < 2; i++) {
      const [ax, ay] = tops[i]!, [bx, by] = tops[i + 1]!;
      for (const [off, sag] of [[5, 7], [13, 5]] as const) {
        p.stroke(p.curve([[ax, ay + off], [(ax + bx) / 2 - 4, (ay + by) / 2 + off + sag], [bx, by + off]], 8), { color: WARM, width: 1.5, seed: 980 + i * 2 + off, alpha: 0.85, wobble: 0.3 });
      }
    }
    posts.forEach((x, i) => {
      const [tx, ty] = tops[i]!, by = topY(x) + 3;
      const body: Pt[] = [[x - 3.4, by], [tx - 2.8, ty], [tx + 2.8, ty], [x + 3.4, by]];
      p.fill(body, tone(WARM, 0.2));
      p.fill([[x + 0.6, by], [tx + 0.6, ty], [tx + 2.8, ty], [x + 3.4, by]], tone(WARM, 0.1));
      p.stroke([[tx - 1, ty + 5], [x - 1, by - 3]], { color: WARM, width: 1, alpha: 0.4, seed: 985 + i, wobble: 0 });
      p.stroke(body, { color: WARM, width: 2, seed: 988 + i, wobble: 0.3 });
      const cap: Pt[] = [[tx - 4.2, ty], [tx, ty - 3.6], [tx + 4.2, ty]];
      p.fill(cap, tone(WARM, 0.32));
      p.stroke([...cap, cap[0]!], { color: WARM, width: 1.6, seed: 991 + i, wobble: 0.3 });
    });
  }
  // the dropped game coin at the foot of the hill is drawn live (it glints): see world/stories.ts
}

const GULLY_MID: Pt[] = [];

export const ridge: Part = {
  id: 'ridge',
  z: 12,
  intro: [0, 0.01],
  draw(pen, f) {
    pen.cache('land', { x: 0, y: 600, w: W, h: H - 600 }, paint);
    // the stream runs: pale glints slide down the water, quicker over the two falls
    const c = pen.ctx, t = f.t;
    if (!GULLY_MID.length) GULLY_MID.push(...pen.curve(GULLY, 6));
    const m = GULLY_MID, n = m.length - 1;
    c.save();
    c.strokeStyle = INK;
    c.lineCap = 'round';
    c.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const u = mod(t * (0.085 + (i % 3) * 0.012) + i / 9, 1);
      const fpos = u * n, k = Math.min(n - 1, Math.floor(fpos)), fr = fpos - k;
      const a = m[k]!, b = m[k + 1]!;
      const x = a[0] + (b[0] - a[0]) * fr + Math.sin(i * 2.4) * 1.6, y = a[1] + (b[1] - a[1]) * fr;
      const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
      const len = 3 + 3 * Math.abs(dy / dl);
      c.globalAlpha = 0.6 * Math.min(1, u * 8, (1 - u) * 5);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (dx / dl) * len, y + (dy / dl) * len);
      c.stroke();
    }
    c.restore();
  },
};
