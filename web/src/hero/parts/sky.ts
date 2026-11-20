// The night sky. The still part (dust stars, the Milky Way veil, constellation lines, the moon) is painted
// once into the paper sheet (see world/paper.ts). Live on top of it: each dust star's twinkle, the four-point
// sparks and the six-point asterisk stars from Ian's picture (bright ones flare now and then), the moon's
// breathing glow, two small line-drawn clouds that drift a little in their own corners, a shooting star every
// 7 to 11 s, and a glisten that sweeps across the dust every 21 s.
// The quiet box (QUIET) gets only the faintest dust: nothing bright, nothing moving.
import { BLUE, GOLD, INK, QUIET, W, groundY, rnd, tone } from '../engine/layout';
import type { Part, Pen, Pt } from '../engine/types';
import { TAU, arc, mod, rng } from './world/util';

const inQuiet = (x: number, y: number, pad = 0) => x > QUIET.x0 - pad && x < QUIET.x1 + pad && y > QUIET.y0 - pad && y < QUIET.y1 + pad;
// the lowest a star may sit at x: above the TV and its hills, above the tree, clear of the ridge
const maxY = (x: number) => (x < 690 ? 150 : x < 960 ? 290 : x > 2420 ? 180 : groundY(x) - 120);

interface Star {
  x: number;
  y: number;
  kind: 0 | 1 | 2; // dust, spark, asterisk
  r: number;
  base: number;
  col: string;
  tw: number; // twinkle rate, rad/s
  tp: number;
  sp: number; // seconds between flares
  so: number;
  rot: number;
  quiet: boolean;
}

const MOON = { x: 880, y: 150, r: 42 };
const nearMoon = (x: number, y: number) => Math.hypot(x - MOON.x, y - MOON.y) < MOON.r + 26;

// the two clouds: each keeps to its own patch of sky, clear of the antenna, the constellations and the headline
const WISPS: { x: number; y: number; s: number; seed: number; ph: number }[] = [
  { x: 28, y: 52, s: 1, seed: 11, ph: 0 },
  { x: 1476, y: 78, s: 0.94, seed: 23, ph: 2.1 },
];
const WISP_W = 232;
// where no star may sit (the clouds), and where no BRIGHT star may sit (behind the antenna and the things on the TV)
const inWisp = (x: number, y: number) => WISPS.some((w) => x > w.x - 34 && x < w.x + WISP_W * w.s + 34 && y > w.y - 40 && y < w.y + 36);
const nearTvTop = (x: number, y: number) => (x > 236 && x < 524 && y < 178) || (x > 120 && x < 664 && y > 92 && y < 178);

// constellations: star positions and the lines between them. The dipper sits between the antenna and the
// moon; the kite hangs right of the headline, short of the friends.
const DIPPER: Pt[] = [[606, 96], [650, 70], [700, 80], [742, 48], [796, 58], [812, 100], [766, 112]];
const DIPPER_LINES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
const KITE: Pt[] = [[2128, 252], [2198, 206], [2262, 246], [2204, 302], [2226, 350]];
const KITE_LINES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4]];

const STARS: Star[] = (() => {
  const out: Star[] = [];
  const hue = (i: number) => {
    const h = rnd(i * 7.77 + 3);
    return h < 0.12 ? GOLD : h < 0.24 ? BLUE : INK;
  };
  const push = (x: number, y: number, kind: 0 | 1 | 2, i: number, quiet = false) => {
    const r = kind === 0 ? (quiet ? 0.9 + rnd(i * 2.2) * 0.5 : 1.1 + rnd(i * 2.2) * 1.1) : kind === 1 ? 5 + rnd(i * 2.2) * 3.6 : 9.5 + rnd(i * 2.2) * 3;
    out.push({
      x, y, kind, r,
      base: kind === 0 ? (quiet ? 0.16 + rnd(i * 8.8) * 0.14 : 0.35 + rnd(i * 8.8) * 0.45) : kind === 1 ? 0.7 + rnd(i * 8.8) * 0.25 : 0.95,
      col: kind === 2 ? INK : hue(i),
      tw: 0.7 + rnd(i * 1.3) * 2.2,
      tp: rnd(i * 4.4) * TAU,
      sp: kind === 0 ? 1e9 : 9 + rnd(i * 6.1) * 10,
      so: rnd(i * 9.9) * 19,
      rot: (rnd(i * 5.5) - 0.5) * 0.5,
      quiet,
    });
  };
  // the asterisk stars: Ian's loose row above the headline, and a few more out to the edges
  const big: Pt[] = [
    [1348, 112], [1842, 128], [2275, 118], [934, 252], [1108, 58], [1772, 42], [2086, 72], [2500, 92], [2806, 128],
    [2942, 52], [112, 128], [964, 52],
  ];
  big.forEach(([x, y], i) => push(x, y, 2, i + 500));
  [...DIPPER, ...KITE].forEach(([x, y], i) => push(x, y, 1, i + 600));
  // clusters of dust with a few sparks in each; the gaps between clusters are part of the design
  const clusters: [number, number, number, number, number, number][] = [
    // cx, cy, spread x, spread y, dust, sparks
    [330, 84, 190, 46, 13, 0], [800, 236, 70, 50, 7, 0], [860, 60, 110, 34, 8, 1], [1230, 82, 220, 42, 17, 2],
    [1900, 88, 200, 44, 15, 2], [2240, 250, 110, 120, 12, 0], [2680, 84, 230, 56, 15, 3], [1240, 512, 210, 44, 9, 1],
    [1690, 506, 190, 40, 8, 1], [2120, 500, 70, 50, 5, 1], [560, 44, 90, 26, 6, 0], [150, 118, 90, 30, 6, 1],
  ];
  let id = 0;
  for (const [cx, cy, sx, sy, nd, ns] of clusters) {
    for (let j = 0; j < nd + ns; j++) {
      for (let tries = 0; tries < 12; tries++) {
        id++;
        const gx = (rnd(id * 3.1) + rnd(id * 5.7 + 1) + rnd(id * 7.3 + 2) - 1.5) * 1.5;
        const gy = (rnd(id * 2.3 + 5) + rnd(id * 4.1 + 6) + rnd(id * 6.7 + 7) - 1.5) * 1.5;
        const x = cx + gx * sx, y = cy + gy * sy;
        const spark = j >= nd;
        if (x < 8 || x > W - 8 || y < 12 || y > maxY(x) || inQuiet(x, y, spark ? 30 : 4) || nearMoon(x, y) || inWisp(x, y)) continue;
        if (spark && nearTvTop(x, y)) continue;
        if (out.some((s) => Math.hypot(s.x - x, s.y - y) < (spark || s.kind ? 34 : 11))) continue;
        push(x, y, spark ? 1 : 0, id);
        break;
      }
    }
  }
  // the quiet box: a thin, uneven veil of the faintest dust
  const q = rng(4242);
  for (let j = 0; j < 26; j++) {
    id++;
    push(QUIET.x0 + 20 + q() * (QUIET.x1 - QUIET.x0 - 40), QUIET.y0 + 14 + q() * (QUIET.y1 - QUIET.y0 - 28), 0, id, true);
  }
  return out;
})();

// the Milky Way veil: two loose rivers of the faintest specks along the top of the sky (still; painted once)
const VEIL: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  const r = rng(1977);
  const river = (x0: number, y0: number, x1: number, y1: number, spread: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const u = r(), off = (r() + r() + r() - 1.5) * spread;
      const x = x0 + (x1 - x0) * u + off * 0.3, y = y0 + (y1 - y0) * u + off + Math.sin(u * 9) * 8;
      if (x < 4 || x > W - 4 || y < 4 || y > Math.min(142, maxY(x)) || nearMoon(x, y) || inWisp(x, y)) continue;
      out.push([x, y, 0.5 + r() * r() * 1.1, 0.1 + r() * 0.3]);
    }
  };
  river(2060, 16, 3000, 120, 34, 170);
  river(920, 34, 2060, 70, 26, 150);
  river(0, 96, 700, 26, 26, 80);
  return out;
})();

/** the still part of the sky, painted into the paper sheet: veil, constellation lines, the moon, the dust at rest */
export function paintSkyStill(p: Pen) {
  const c = p.ctx;
  c.save();
  // veil
  c.fillStyle = INK;
  for (const [x, y, r, a] of VEIL) {
    c.globalAlpha = a;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // constellation hairlines, stopping short of each star as on a star chart
  c.strokeStyle = INK;
  c.lineWidth = 1.2;
  c.lineCap = 'round';
  c.globalAlpha = 0.3;
  c.beginPath();
  const link = (pts: Pt[], lines: [number, number][]) => {
    for (const [a, b] of lines) {
      const [ax, ay] = pts[a]!, [bx, by] = pts[b]!;
      const d = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / d, uy = (by - ay) / d;
      c.moveTo(ax + ux * 12, ay + uy * 12);
      c.lineTo(bx - ux * 12, by - uy * 12);
    }
  };
  link(DIPPER, DIPPER_LINES);
  link(KITE, KITE_LINES);
  c.stroke();
  // dust at rest: half of each star's light is always there; the live layer adds the twinkle
  for (const s of STARS) {
    if (s.kind !== 0) continue;
    c.globalAlpha = s.quiet ? s.base : s.base * 0.5;
    c.fillStyle = s.col;
    if (s.r < 1.5) c.fillRect(s.x - s.r * 0.9, s.y - s.r * 0.9, s.r * 1.8, s.r * 1.8);
    else {
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, TAU);
      c.fill();
    }
  }
  c.restore();
  paintMoon(p);
}

// The crescent: the disc minus a second disc set off to the upper right. Both arcs are computed to their
// exact meeting points, and both outlines taper into those points, so the horns end clean.
function paintMoon(p: Pen) {
  const { x, y, r } = MOON;
  const ox = 17, oy = -8, r1 = 37;
  const d = Math.hypot(ox, oy), th = Math.atan2(oy, ox);
  const al = Math.acos((d * d + r * r - r1 * r1) / (2 * d * r)); // half-angle of the dark limb, seen from the moon's centre
  const be = Math.acos((d * d + r1 * r1 - r * r) / (2 * d * r1)); // the same meeting points seen from the second disc
  const disc = arc(x, y, r, r, 0, TAU, 56);
  // the dark side: barely lighter than the sky, hatched, with a hair of earthshine on its limb
  p.fill(disc, '#10150f');
  p.hatch(disc, { angle: -0.95, gap: 5.5, width: 1.1, color: GOLD, alpha: 0.2, seed: 7, breakup: 0.3 });
  p.stroke(arc(x, y, r - 0.6, r - 0.6, th - al + 0.1, th + al - 0.1, 28), { color: GOLD, width: 1.3, seed: 8, alpha: 0.38, taper: 0.22, wobble: 0 });
  const outer = arc(x, y, r, r, th + al, th + TAU - al, 72);
  const inner = arc(x + ox, y + oy, r1, r1, th + Math.PI + be, th + Math.PI - be, 56);
  const cres: Pt[] = [...outer, ...inner.slice(1, -1)];
  p.fill(cres, tone(GOLD, 0.34));
  // a brighter band along the outer limb that thins to nothing toward each horn: a designed shape, clean edge
  const band: Pt[] = [...outer];
  for (let i = outer.length - 1; i >= 0; i--) {
    const u = i / (outer.length - 1), k = 1 - 0.15 * Math.sin(u * Math.PI) ** 0.8;
    band.push([x + (outer[i]![0] - x) * k, y + (outer[i]![1] - y) * k]);
  }
  p.fill(band, tone(GOLD, 0.54));
  // craters on the lit side: a shade dish with a lit lower rim
  const craters: [number, number, number][] = [[-31, -6, 5.2], [-25, 17, 3.8], [-21, -25, 3.2], [-33, 8, 2], [-14, 30, 2.4]];
  craters.forEach(([dx, dy, cr], i) => {
    p.fill(arc(x + dx, y + dy, cr, cr * 0.82, 0, TAU, 14), tone(GOLD, 0.22));
    p.stroke(arc(x + dx, y + dy, cr, cr * 0.82, 0.2, 2.9, 10), { color: GOLD, width: 1.3, seed: 70 + i, alpha: 0.9, taper: 0.3, wobble: 0 });
  });
  // the outline: two strokes, each thinning into the horns
  p.stroke(inner, { color: GOLD, width: 2, seed: 10, taper: 0.16, wobble: 0, alpha: 0.95 });
  p.stroke(outer, { color: GOLD, width: 3, seed: 9, taper: 0.1, wobble: 0 });
}

function paintWisp(p: Pen, seed: number) {
  // a faint body under the scallops, then the lines: detail weight, every stroke lifting to a point
  const body = p.curve([[50, 8], [60, -4], [78, -9], [96, -2], [108, -14], [128, -19], [148, -12], [158, -2], [168, -6], [182, -5], [192, 4], [150, 9], [96, 9]], 6, true);
  p.fill(body, tone(INK, 0.045));
  const o = { color: INK, width: 1.8, taper: 0.42 as number, wobble: 0.5 };
  p.stroke(p.curve([[0, 10], [52, 7], [130, 9], [206, 5]], 10), { ...o, seed });
  p.stroke(p.curve([[38, 19], [100, 16.5], [170, 18.5], [230, 15]], 10), { ...o, seed: seed + 1 });
  p.stroke(p.curve([[84, 27], [120, 25.5], [160, 27]], 8), { ...o, seed: seed + 3, width: 1.3 });
  p.stroke(p.curve([[52, 7], [60, -4], [76, -9], [92, -4], [98, 2]], 8), { ...o, seed: seed + 4, taper: 0.18 });
  p.stroke(p.curve([[94, 0], [106, -14], [128, -19], [148, -13], [156, -2]], 8), { ...o, seed: seed + 5, taper: 0.18 });
  p.stroke(p.curve([[152, 2], [162, -5], [178, -6], [190, 2]], 8), { ...o, seed: seed + 6, taper: 0.22, width: 1.5 });
  p.stroke(p.curve([[108, -6], [120, -10], [134, -8]], 6), { ...o, seed: seed + 7, width: 1.2, alpha: 0.7 });
}

// a four-point spark: concave sides, the vertical rays a little longer
function sparkPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  const inner = r * 0.17;
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * TAU;
    const rr = i % 2 ? inner : r * (i % 4 === 0 ? 1 : 0.78);
    const px = x + Math.sin(a) * rr, py = y - Math.cos(a) * rr;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// a six-point asterisk: three crossed strokes, each tapered to a point at both ends, rays of uneven length
function asteriskPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, seed: number) {
  for (let k = 0; k < 3; k++) {
    const a = rot + (k * Math.PI) / 3 + (rnd(seed + k) - 0.5) * 0.16;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const l1 = r * (k === 0 ? 1.12 : 0.86 + rnd(seed + k * 3) * 0.2), l2 = r * (k === 0 ? 1.02 : 0.8 + rnd(seed + k * 5) * 0.2);
    const w = Math.max(1.05, r * 0.105);
    ctx.moveTo(x + dx * l1, y + dy * l1);
    ctx.lineTo(x - dy * w, y + dx * w);
    ctx.lineTo(x - dx * l2, y - dy * l2);
    ctx.lineTo(x + dy * w, y - dx * w);
    ctx.closePath();
  }
}

const SHOOT_PERIOD = 9.1;
const SHOOT_LEN = 0.95;

export const sky: Part = {
  id: 'sky',
  z: 0,
  intro: [0, 0.01],
  draw(pen, f) {
    const t = f.t;
    const ctx = pen.ctx;

    // the glisten: a soft diagonal band of light that crosses the sky in 7 s, every 21 s
    const sweepX = (mod(t, 21) / 7) * (W + 900) - 450;
    const glintAt = (x: number, y: number) => Math.exp(-(((x - sweepX - (y - 300) * 0.55) / 150) ** 2));

    // 1. the moon's breathing glow (the moon itself is in the still sheet): one cached soft disc
    {
      const br = 0.5 + 0.5 * Math.sin(t * 0.43);
      ctx.save();
      ctx.translate(MOON.x - 10, MOON.y + 4);
      ctx.globalAlpha = 0.5 + 0.5 * br;
      pen.cache('moonglow', { x: -150, y: -150, w: 300, h: 300 }, (p) => {
        const g = p.ctx.createRadialGradient(0, 0, 30, 0, 0, 150);
        g.addColorStop(0, 'rgba(231,200,115,0.12)');
        g.addColorStop(0.4, 'rgba(231,200,115,0.05)');
        g.addColorStop(1, 'rgba(231,200,115,0)');
        p.ctx.fillStyle = g;
        p.ctx.fillRect(-150, -150, 300, 300);
      });
      ctx.restore();
    }

    // 2. the clouds, each a cached sprite drifting a little way and back in its own patch of sky
    for (const w of WISPS) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.06 * Math.sin(t * 0.21 + w.ph);
      ctx.translate(w.x + 15 * Math.sin(t * 0.047 + w.ph) + 3 * Math.sin(t * 0.131 + w.ph * 2), w.y + 2 * Math.sin(t * 0.083 + w.ph));
      ctx.scale(w.s, w.s);
      pen.cache(`wisp${w.seed}`, { x: -6, y: -26, w: WISP_W + 12, h: 60 }, (p) => paintWisp(p, w.seed));
      ctx.restore();
    }

    // 3. the stars: the twinkle of the dust (its resting light is in the still sheet), then the bright ones
    ctx.save();
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i]!;
      if (s.quiet) continue;
      const tw = Math.sin(t * s.tw + s.tp) * Math.sin(t * s.tw * 0.53 + s.tp * 1.7); // -1..1, irregular
      if (s.kind === 0) {
        const gl = glintAt(s.x, s.y);
        const a = s.base * 0.5 * tw + gl * 0.5;
        if (a < 0.07) continue;
        ctx.globalAlpha = Math.min(1, a);
        ctx.fillStyle = s.col;
        const rr = s.r * (1 + gl * 0.5);
        ctx.fillRect(s.x - rr * 0.9, s.y - rr * 0.9, rr * 1.8, rr * 1.8);
        continue;
      }
      const ph = mod(t + s.so, s.sp);
      const flare = ph < 0.9 ? Math.sin((ph / 0.9) * Math.PI) ** 2 : 0;
      const r = s.r * (0.9 + 0.1 * tw + 0.35 * flare);
      ctx.globalAlpha = Math.min(1, s.base * (0.78 + 0.22 * tw) + flare * 0.3);
      ctx.fillStyle = s.col;
      ctx.beginPath();
      if (s.kind === 1) sparkPath(ctx, s.x, s.y, r, s.rot + flare * 0.5);
      else {
        asteriskPath(ctx, s.x, s.y, r, s.rot + 0.05 * Math.sin(t * 0.7 + s.tp), i);
        ctx.moveTo(s.x + 1.5, s.y);
        ctx.arc(s.x, s.y, 1.5, 0, TAU);
      }
      ctx.fill();
      if (flare > 0.04) {
        // a short four-ray glint, hair thin and tapered
        const L = s.r * (1.3 + 2.1 * flare);
        ctx.globalAlpha = flare * 0.75;
        ctx.beginPath();
        ctx.moveTo(s.x - L, s.y);
        ctx.lineTo(s.x, s.y - 0.9);
        ctx.lineTo(s.x + L, s.y);
        ctx.lineTo(s.x, s.y + 0.9);
        ctx.closePath();
        ctx.moveTo(s.x, s.y - L * 1.25);
        ctx.lineTo(s.x + 0.9, s.y);
        ctx.lineTo(s.x, s.y + L * 1.25);
        ctx.lineTo(s.x - 0.9, s.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // 5. a shooting star every 7 to 11 s, kept in the band above the headline
    {
      const n = Math.floor(t / SHOOT_PERIOD);
      const local = t - n * SHOOT_PERIOD - rnd(n * 3.7 + 1) * (SHOOT_PERIOD - SHOOT_LEN - 0.2);
      if (local > 0 && local < SHOOT_LEN) {
        const dir = rnd(n * 1.9 + 2) < 0.5 ? 1 : -1;
        const x0 = dir > 0 ? 640 + rnd(n * 4.3) * 1500 : 1300 + rnd(n * 4.3) * 1500;
        const y0 = 22 + rnd(n * 5.9) * 46;
        const dx = dir * 560, dy = 62;
        const u = local / SHOOT_LEN;
        const head = 1 - (1 - u) ** 1.7; // fast, easing out as it burns up
        const tail = Math.max(0, head - 0.3 * (1 - u * 0.5));
        const fade = Math.min(1, u * 7) * (1 - u ** 3);
        const H0: Pt = [x0 + dx * head, y0 + dy * head];
        const T0: Pt = [x0 + dx * tail, y0 + dy * tail];
        pen.stroke([T0, H0], { width: 9, taper: [1, 0], alpha: 0.12 * fade, seed: n, wobble: 0 });
        pen.stroke([T0, H0], { width: 3, taper: [1, 0], alpha: 0.95 * fade, seed: n, wobble: 0 });
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.fillStyle = INK;
        ctx.beginPath();
        sparkPath(ctx, H0[0], H0[1], 8 * fade + 2, 0.5);
        ctx.fill();
        ctx.restore();
      }
    }
  },
};
