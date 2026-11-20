// The "Welcome" sign: a wooden board of three planks nailed to a post, with a brace, a cap, stones packed at
// the foot, a small lantern on an iron bracket and a bird perched on top. The word is LETTERED WITH THE PEN,
// one flowing hand, no font. The post leans a hair with the wind; the board creaks on its nails a moment
// later; the lantern swings and its flame flickers; the bird looks about, flicks its tail and hops.
// The post and the board are cached sprites; only the lantern flame and the bird are drawn live.
import { BLUE, GOLD, GREEN_LINE, GREEN_LIT, GREEN_SHADE, INK, ORANGE, PAPER, SIGN, WARM, rnd, tone, wind } from '../engine/layout';
import type { Part, Pen, Pt } from '../engine/types';
import { topY } from './ridge';
import { TAU, arc, backOut, blob, mod, smooth } from './world/util';

const BOARD_Y = -166; // the board's centre above the foot of the post
const HW = 118, HH = 50;

// ---- the lettering: each letter is one or more pen paths in x-height units (baseline 0, x-height -1)
type Glyph = { adv: number; strokes: Pt[][] };
const GLYPHS: Record<string, Glyph> = {
  W: { adv: 1.62, strokes: [[[-0.06, -1.46], [0.06, -1.62], [0.2, -1.3], [0.4, -0.04], [0.52, -0.3], [0.76, -1.18], [0.9, -0.8], [1.1, -0.04], [1.22, -0.36], [1.42, -1.3], [1.6, -1.68]]] },
  e: { adv: 0.9, strokes: [[[0.1, -0.46], [0.44, -0.5], [0.7, -0.7], [0.62, -0.95], [0.4, -1.02], [0.17, -0.8], [0.11, -0.42], [0.25, -0.1], [0.5, 0], [0.72, -0.1], [0.9, -0.34]]] },
  l: { adv: 0.56, strokes: [[[0, -0.34], [0.2, -0.8], [0.35, -1.46], [0.27, -1.74], [0.15, -1.5], [0.13, -0.5], [0.21, -0.09], [0.38, 0], [0.56, -0.26]]] },
  c: { adv: 0.84, strokes: [[[0.7, -0.74], [0.56, -0.98], [0.32, -0.98], [0.13, -0.66], [0.15, -0.24], [0.36, -0.02], [0.6, -0.06], [0.84, -0.34]]] },
  o: { adv: 0.94, strokes: [[[0.5, -1], [0.25, -0.9], [0.11, -0.52], [0.23, -0.13], [0.45, -0.01], [0.68, -0.18], [0.76, -0.56], [0.64, -0.9], [0.46, -1], [0.52, -0.82], [0.72, -0.76], [0.94, -0.9]]] },
  m: {
    adv: 1.36,
    strokes: [
      [[0.02, -0.9], [0.1, -1], [0.14, -0.6], [0.13, 0]],
      [[0.14, -0.62], [0.27, -0.9], [0.43, -1], [0.55, -0.8], [0.56, 0]],
      [[0.57, -0.62], [0.7, -0.9], [0.86, -1], [0.98, -0.8], [1, -0.22], [1.1, -0.02], [1.22, -0.06], [1.36, -0.3]],
    ],
  },
};
const WORD = 'Welcome';
const UNIT = 27.5; // x-height in scene units
const SLANT = 0.16;
const WORD_W = [...WORD].reduce((a, ch) => a + GLYPHS[ch]!.adv, 0) * UNIT;

function letter(p: Pen, dx: number, dy: number, color: string, width: number, alpha: number) {
  let x = -WORD_W / 2 + 2;
  const base = 15;
  [...WORD].forEach((ch, i) => {
    const g = GLYPHS[ch]!;
    g.strokes.forEach((st, j) => {
      const pts = st.map(([gx, gy]): Pt => [x + (gx - gy * SLANT) * UNIT + dx, base + gy * UNIT + dy]);
      p.stroke(p.curve(pts, 9), { color, width, alpha, seed: 40 + i * 5 + j, taper: [0.12, 0.22], wobble: 0.4 });
    });
    x += g.adv * UNIT;
  });
}

// ---- the board (drawn about its own centre)
const PLANKS: { y0: number; y1: number; x0: number; x1: number; k: number }[] = [
  { y0: -HH, y1: -17, x0: -HW + 3, x1: HW, k: 0.25 },
  { y0: -17, y1: 16, x0: -HW - 3, x1: HW - 5, k: 0.21 },
  { y0: 16, y1: HH, x0: -HW + 1, x1: HW + 3, k: 0.18 },
];
function board(p: Pen) {
  const c = p.ctx;
  const wood = (k: number) => tone(WARM, k);
  PLANKS.forEach((pl, i) => {
    const ch = 4; // chamfered ends
    const shape: Pt[] = [
      [pl.x0 + ch, pl.y0], [pl.x1 - ch, pl.y0], [pl.x1, pl.y0 + ch], [pl.x1, pl.y1 - ch], [pl.x1 - ch, pl.y1], [pl.x0 + ch, pl.y1],
      [pl.x0, pl.y1 - ch], [pl.x0, pl.y0 + ch],
    ];
    p.fill(shape, wood(pl.k));
    // lit top edge of each plank; shade along the bottom of the lowest
    p.fill([[pl.x0 + ch, pl.y0 + 1], [pl.x1 - ch, pl.y0 + 1], [pl.x1 - 2, pl.y0 + 5], [pl.x0 + 2, pl.y0 + 5]], wood(pl.k + 0.13));
    if (i === 2) {
      const band: Pt[] = [[pl.x0 + 1, pl.y1 - 9], [pl.x1 - 1, pl.y1 - 10], [pl.x1 - 1, pl.y1 - ch], [pl.x1 - ch, pl.y1 - 1], [pl.x0 + ch, pl.y1 - 1], [pl.x0 + 1, pl.y1 - ch]];
      p.fill(band, wood(0.09));
      p.hatch(band, { angle: 0.9, gap: 6, width: 1.1, color: PAPER, alpha: 0.5, seed: 12 + i, breakup: 0.3 });
    }
    // grain: long hairlines that run the plank, broken, drifting a little
    c.save();
    c.strokeStyle = WARM;
    c.lineWidth = 1.15;
    c.lineCap = 'round';
    c.globalAlpha = 0.42;
    c.beginPath();
    for (let g = 0; g < 4; g++) {
      const gy = pl.y0 + 8 + g * 6.4 + rnd(i * 7 + g) * 2;
      let x = pl.x0 + 8 + rnd(i * 3 + g * 5) * 30;
      while (x < pl.x1 - 14) {
        const len = 22 + rnd(x * 0.37 + g) * 70;
        const e = Math.min(pl.x1 - 8, x + len);
        c.moveTo(x, gy);
        c.bezierCurveTo(x + (e - x) * 0.3, gy - 1.6, x + (e - x) * 0.7, gy + 1.6, e, gy + (rnd(x + g) - 0.5) * 2);
        x = e + 8 + rnd(x * 0.11 + g * 3) * 26;
      }
    }
    c.stroke();
    c.restore();
    p.stroke([...shape, shape[0]!], { color: WARM, width: 2.6, seed: 20 + i, wobble: 0.4 });
  });
  // two knots: rings with the grain bending round them
  for (const [kx, ky, i] of [[-84, -34, 0], [88, 33, 1]] as const) {
    p.fill(arc(kx, ky, 4.6, 3.2, 0, TAU, 12), tone(WARM, 0.1));
    p.stroke(arc(kx, ky, 4.6, 3.2, 0, TAU, 12), { color: WARM, width: 1.3, seed: 30 + i, alpha: 0.8 });
    p.stroke(arc(kx, ky, 8.4, 5.6, 0.5, 5.6, 14), { color: WARM, width: 1.1, seed: 32 + i, alpha: 0.45, taper: 0.3 });
  }
  // a split in the end of the middle plank, and a chip out of the top one
  p.stroke([[HW - 5, 0], [HW - 20, -2], [HW - 34, 1]], { color: WARM, width: 1.5, seed: 35, taper: [0, 0.9], alpha: 0.9 });
  p.fill([[-HW + 3, -HH + 4], [-HW + 12, -HH], [-HW + 3, -HH]], PAPER);
  // nail heads at the corners, each with a pin-point of light
  for (const [nx, ny] of [[-HW + 14, -34], [HW - 12, -34], [-HW + 12, 34], [HW - 10, 34]] as const) {
    c.fillStyle = tone(INK, 0.16);
    c.beginPath();
    c.arc(nx, ny, 3.4, 0, TAU);
    c.fill();
    c.fillStyle = tone(INK, 0.7);
    c.beginPath();
    c.arc(nx, ny, 2.3, 0, TAU);
    c.fill();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(nx - 0.7, ny - 0.7, 0.9, 0, TAU);
    c.fill();
  }
  // the word, drawn once at a firm weight: painted letters, no ghost behind them
  letter(p, 0, 0, INK, 3.7, 1);
  // a deliberate swash under the word: it starts as a hair, swells, loops back and lifts
  p.stroke(p.curve([[-64, 35], [-30, 31], [10, 32.5], [44, 30], [62, 26.5], [66, 31], [54, 35.5], [30, 36.5]], 8), {
    color: INK, width: 2.4, seed: 90, taper: [0.5, 0.3], wobble: 0.3,
  });
}

// ---- the post, brace, bracket and the stones at its foot (drawn about the foot)
function post(p: Pen) {
  const wood = (k: number) => tone(WARM, k);
  const body: Pt[] = [[-8.5, 8], [-6.5, -228], [6.5, -228], [8.5, 8]];
  // the brace behind the post, up to the underside of the board
  const brace: Pt[] = [[4, -66], [64, -119], [73, -119], [8, -54]];
  p.fill(brace, wood(0.13));
  p.hatch(brace, { angle: -0.72, gap: 5, width: 1, color: WARM, alpha: 0.35, seed: 3, breakup: 0.3 });
  p.stroke([...brace, brace[0]!], { color: WARM, width: 2.2, seed: 61, wobble: 0.4 });
  // the iron bracket for the lantern: an arm, a strut and a curled end
  p.stroke([[-6, -108], [-50, -108]], { color: WARM, width: 2.6, seed: 62, wobble: 0.3 });
  p.stroke(p.curve([[-7, -88], [-22, -93], [-32, -108]], 6), { color: WARM, width: 1.8, seed: 63 });
  p.stroke(arc(-53, -104, 4.2, 4.2, -Math.PI / 2, Math.PI * 1.1, 10), { color: WARM, width: 1.8, seed: 64, taper: [0, 0.6] });
  p.fill(body, wood(0.2));
  p.fill([[1.5, 8], [1.5, -228], [6.5, -228], [8.5, 8]], wood(0.1)); // the shaded right face
  p.fill([[-8.5, 8], [-6.5, -228], [-4.2, -228], [-5.6, 8]], wood(0.32)); // the lit left edge
  // grain down the post
  for (let g = 0; g < 5; g++) {
    const gx = -4 + g * 2.3;
    let y = -4 - rnd(g * 3.1) * 20;
    while (y > -222) {
      const len = 18 + rnd(y * 0.3 + g) * 44;
      p.stroke([[gx, y], [gx + 0.5, Math.max(-224, y - len)]], { color: WARM, width: 1.1, alpha: 0.4, seed: 70 + g });
      y -= len + 8 + rnd(y * 0.7 + g) * 16;
    }
  }
  p.stroke([[-8.5, 8], [-6.5, -228]], { color: WARM, width: 2.8, seed: 65, wobble: 0.4 });
  p.stroke([[8.5, 8], [6.5, -228]], { color: WARM, width: 2.8, seed: 66, wobble: 0.4 });
  // the cap
  const cap: Pt[] = [[-10.5, -227], [10.5, -227], [7, -235.5], [-7, -235.5]];
  p.fill(cap, wood(0.34));
  p.stroke([...cap, cap[0]!], { color: WARM, width: 2.2, seed: 67, wobble: 0.3 });
  // stones packed round the foot: shade body, lit facet, land-coloured outline
  for (const [sx, sy, sr, i] of [[-17, 4, 10, 0], [15, 5, 8, 1], [-1, 9, 6.5, 2], [29, 7, 4.6, 3], [-31, 8, 4, 4]] as const) {
    const b = blob(sx, sy, sr, sr * 0.74, 80 + i, 12, 0.2);
    p.fill(b, GREEN_SHADE);
    p.fill(blob(sx - sr * 0.24, sy - sr * 0.26, sr * 0.6, sr * 0.34, 85 + i, 10, 0.2), GREEN_LIT);
    p.stroke([...b, b[0]!], { color: GREEN_LINE, width: sr > 7 ? 1.9 : 1.5, seed: 88 + i, alpha: 0.8 });
  }
}

// ---- the lantern body (drawn hanging from its own top, at 0,0)
function lantern(p: Pen) {
  const iron = WARM;
  p.stroke([[0, 0], [0, 9]], { color: iron, width: 1.5, seed: 1 }); // chain
  p.stroke(arc(0, 2.5, 2, 2.4, 0, TAU, 8), { color: iron, width: 1.1, seed: 2 });
  const roof: Pt[] = [[-3, 9], [3, 9], [10.5, 17], [-10.5, 17]];
  p.fill(roof, tone(WARM, 0.3));
  p.stroke([...roof, roof[0]!], { color: iron, width: 1.9, seed: 3, wobble: 0.3 });
  const glass: Pt[] = [[-8, 17], [8, 17], [6.4, 39], [-6.4, 39]];
  p.fill(glass, tone(GOLD, 0.34));
  p.fill([[1.5, 17], [8, 17], [6.4, 39], [1.5, 39]], tone(GOLD, 0.22));
  p.stroke([...glass, glass[0]!], { color: iron, width: 1.8, seed: 4, wobble: 0.3 });
  p.stroke([[0, 17], [0, 39]], { color: iron, width: 1.2, seed: 5, alpha: 0.75 });
  p.stroke([[-7.3, 27], [7.3, 27]], { color: iron, width: 1.1, seed: 6, alpha: 0.6 });
  const foot: Pt[] = [[-8.5, 39], [8.5, 39], [6, 43.5], [-6, 43.5]];
  p.fill(foot, tone(WARM, 0.2));
  p.stroke([...foot, foot[0]!], { color: iron, width: 1.7, seed: 7, wobble: 0.3 });
}

/** a pose that changes every `period` seconds: returns the eased blend from the previous value to the current one */
function held(t: number, period: number, seed: number, values: readonly number[], move = 0.22): number {
  const k = Math.floor(t / period), u = (t - k * period) / move;
  const pick = (n: number) => values[Math.floor(rnd(n * 3.71 + seed) * values.length)]!;
  const a = pick(k - 1), b = pick(k);
  return a + (b - a) * backOut(u);
}

export const sign: Part = {
  id: 'sign',
  z: 26,
  intro: [0, 0.01],
  draw(pen, f) {
    const t = f.t;
    const c = pen.ctx;
    const fx = SIGN.x, fy = topY(fx) + 3;

    // the post is stiff: it answers the wind a little and late; the board lags the post and creaks
    const w = wind(t - 0.15, fx);
    const sway = 0.014 * w + 0.003 * Math.sin(t * 1.13 + 0.6);
    const creak = 0.022 * (wind(t - 0.5, fx) - 0.4 * w) + 0.005 * Math.sin(t * 2.71) - 0.022;

    c.save();
    c.translate(fx, fy);
    c.rotate(sway);
    pen.cache('signpost', { x: -70, y: -242, w: 150, h: 262 }, post);

    // the lantern: glow first (a light source, so a gradient is allowed), then the swinging body, then the flame
    const swing = 0.16 * wind(t - 0.32, fx - 50) + 0.03 * Math.sin(t * 2.3);
    const flick = 0.78 + 0.12 * Math.sin(t * 9.3) + 0.06 * Math.sin(t * 23.1 + 1) + 0.04 * Math.sin(t * 5.1 + 2);
    c.save();
    c.translate(-53, -100);
    c.rotate(swing);
    const R = 96 + 10 * flick;
    const g = c.createRadialGradient(0, 28, 2, 0, 28, R);
    g.addColorStop(0, `rgba(231,200,115,${0.3 * flick})`);
    g.addColorStop(0.3, `rgba(231,200,115,${0.1 * flick})`);
    g.addColorStop(1, 'rgba(231,200,115,0)');
    c.fillStyle = g;
    c.fillRect(-R, 28 - R, R * 2, R * 2);
    pen.cache('lantern', { x: -14, y: -2, w: 28, h: 50 }, lantern);
    // the flame: a teardrop that leans against the swing and flickers
    const lean = -swing * 6 + Math.sin(t * 11.7) * 0.7, fh = 9 + 2.4 * Math.sin(t * 13.3) * flick;
    c.fillStyle = GOLD;
    c.beginPath();
    c.moveTo(-2.6, 35);
    c.quadraticCurveTo(-3.6, 30, lean, 35 - fh);
    c.quadraticCurveTo(3.6, 30, 2.6, 35);
    c.quadraticCurveTo(0, 37.5, -2.6, 35);
    c.fill();
    c.fillStyle = INK;
    c.beginPath();
    c.ellipse(lean * 0.3, 33.4, 1.2, 2.1, 0, 0, TAU);
    c.fill();
    c.restore();

    // the board, turning a hair about its nails
    c.translate(0, BOARD_Y);
    c.rotate(creak);
    pen.cache('signboard', { x: -HW - 10, y: -HH - 8, w: HW * 2 + 20, h: HH * 2 + 16 }, board);
    // warm lantern light catching the lower left edge of the board: a thin rim that follows the flame
    pen.stroke([[-HW + 2, -HH + 30], [-HW - 1, 0], [-HW + 3, HH - 4], [-HW + 8, HH + 1], [-HW + 70, HH + 1]], {
      color: GOLD, width: 2, alpha: 0.55 * flick, seed: 95, taper: [0.5, 0.6], wobble: 0,
    });

    // ---- the bird on the top edge: looks about in held poses, flicks its tail, hops now and then
    {
      const hopT = mod(t + 3.1, 11.3);
      const hop = hopT < 0.42 ? Math.sin((hopT / 0.42) * Math.PI) : 0;
      const squash = hopT > 0.42 && hopT < 0.62 ? Math.sin(((hopT - 0.42) / 0.2) * Math.PI) * 0.12 : 0;
      const shuffle = held(t, 11.3, 5, [58, 66, 74, 80], 0.42); // where along the board it stands after each hop
      const look = held(t, 2.7, 9, [-0.5, -0.15, 0.2, 0.5, -0.3]); // head angle; mostly toward the TV at the left
      const bob = Math.sin(t * 1.57) * 0.5;
      const tail = 0.14 * wind(t - 0.1, fx) + (mod(t, 3.9) < 0.25 ? 0.5 * Math.sin((mod(t, 3.9) / 0.25) * Math.PI) : 0);
      const blink = mod(t + 1.3, 4.3) < 0.12;
      c.save();
      c.translate(shuffle, -HH - 2 - hop * 8);
      c.scale(1, 1 - squash);
      const ink = { color: INK, seed: 300, wobble: 0.3 };
      // legs
      pen.stroke([[-2, -5], [-3, 0], [-6, 0.5]], { ...ink, width: 1.3 });
      pen.stroke([[3, -5], [3, 0], [0, 0.5]], { ...ink, width: 1.3, seed: 301 });
      // tail feathers, behind the body
      c.save();
      c.translate(8, -11);
      c.rotate(-0.25 + tail);
      const tf: Pt[] = [[0, -2.5], [15, -5], [16, -1], [14.5, 2.5], [0, 2.5]];
      pen.fill(tf, tone(BLUE, 0.4));
      pen.stroke([...tf, tf[0]!], { ...ink, width: 1.5, seed: 302 });
      pen.stroke([[4, 0], [14, -1.2]], { ...ink, width: 1, seed: 303, alpha: 0.7 });
      c.restore();
      // body: a plump teardrop, breathing
      const by = -12 + bob * 0.4;
      const bodyPts = pen.curve([[-9, by - 3], [-3, by - 8.5], [6, by - 6.5], [11, by], [6, by + 6.5], [-3, by + 7.5], [-9.5, by + 3]], 6, true);
      pen.fill(bodyPts, tone(INK, 0.2));
      pen.fill(pen.curve([[-8, by + 1], [-2, by + 3], [5, by + 2.5], [6, by + 6], [-3, by + 7.2], [-9, by + 3.4]], 5, true), tone(INK, 0.34)); // pale belly
      pen.stroke(bodyPts, { ...ink, width: 1.8, seed: 304 });
      // folded wing, the one blue accent
      const wing = pen.curve([[-3, by - 4], [5, by - 4.5], [11.5, by + 1], [3, by + 3], [-3, by + 1]], 5, true);
      pen.fill(wing, tone(BLUE, 0.5));
      pen.stroke(wing, { color: BLUE, width: 1.4, seed: 305 });
      pen.stroke([[0, by - 1], [7, by + 0.4]], { color: BLUE, width: 1, seed: 306, alpha: 0.8 });
      // head: turns in held poses
      c.save();
      c.translate(-8, by - 7 + bob);
      c.rotate(look * 0.5);
      const head = arc(0, 0, 6.6, 6.2, 0, TAU, 16);
      pen.fill(head, tone(INK, 0.2));
      pen.stroke(head, { ...ink, width: 1.8, seed: 307 });
      const beak: Pt[] = [[-5.6, -1.2], [-11.5, 1 + look * 1.2], [-5.4, 2.4]];
      pen.fill(beak, GOLD);
      pen.stroke([...beak, beak[0]!], { color: ORANGE, width: 1, seed: 308 });
      c.fillStyle = INK;
      c.beginPath();
      if (blink) c.rect(-3.6, -1.4, 3, 0.9);
      else c.arc(-2.2, -1.2, 1.5, 0, TAU);
      c.fill();
      pen.stroke(arc(1.5, -5.4, 3, 2, Math.PI * 1.05, Math.PI * 1.9, 5), { ...ink, width: 1.1, seed: 309, taper: [0, 0.7] }); // a crest feather
      c.restore();
      c.restore();
    }
    c.restore();
    void smooth;
  },
};
