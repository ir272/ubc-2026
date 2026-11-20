// The night sky: four-point ink stars that twinkle and now and then flare into a sparkle, a shooting star
// every several seconds, and the sky "glistening": fine dust drifting slowly, which glints as a faint wave
// of light sweeps across. The middle of SKY (where the headline sits) only gets small, dim stars and dust.
import { INK, SKY, W, groundY } from '../engine/layout';
import type { Part, Pt } from '../engine/types';

function rnd(n: number): number {
  const s = Math.sin(n * 78.233 + 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// the headline area: nothing bright in here
const HEAD = { x0: SKY.x0 + 260, x1: SKY.x1 - 260, y0: SKY.y0 + 110, y1: SKY.y1 - 90 };
const inHead = (x: number, y: number) => x > HEAD.x0 && x < HEAD.x1 && y > HEAD.y0 && y < HEAD.y1;
// how high the sky reaches at x (stars stay above the ground and the hills)
const skyBottom = (x: number) => Math.min(groundY(x) - 90, 560);

interface Star {
  x: number;
  y: number;
  r: number; // ray length
  base: number; // resting brightness
  tw: number; // twinkle rate (rad/s)
  tp: number;
  sp: number; // sparkle period (s)
  so: number; // sparkle offset (s)
  appear: number; // 0..1, when it pops in during the intro
}

const STARS: Star[] = (() => {
  const out: Star[] = [];
  // a few hand-placed bigger stars, like the reference: a loose row high up and a couple lower
  const big: Pt[] = [
    [820, 120], [1300, 95], [1840, 110], [2210, 105], [2560, 70], [2860, 160], [700, 330], [1010, 300],
    [1560, 60], [2440, 300], [90, 90], [380, 70],
  ];
  big.forEach(([x, y], i) => {
    out.push({
      x, y,
      r: 13 + rnd(i * 3.3) * 8,
      base: 0.85,
      tw: 0.9 + rnd(i * 1.9) * 1.6,
      tp: rnd(i * 4.1) * 6.283,
      sp: 5.5 + rnd(i * 6.6) * 7,
      so: rnd(i * 9.2) * 12,
      appear: rnd(i * 2.7) * 0.55,
    });
  });
  // small ones scattered over the whole sky, denser over SKY
  for (let i = 0; out.length < 46 && i < 400; i++) {
    const inSky = rnd(i * 5.1 + 0.3) < 0.62;
    const x = inSky ? SKY.x0 + rnd(i * 7.3) * (SKY.x1 - SKY.x0) : rnd(i * 7.3) * W;
    const y = inSky ? SKY.y0 + rnd(i * 3.9) * (SKY.y1 - SKY.y0) : 20 + rnd(i * 3.9) * 500;
    if (y > skyBottom(x)) continue;
    if (out.some((s) => Math.hypot(s.x - x, s.y - y) < 95)) continue;
    const head = inHead(x, y);
    out.push({
      x, y,
      r: head ? 4 + rnd(i * 2.2) * 2.5 : 5 + rnd(i * 2.2) * 5,
      base: head ? 0.32 : 0.5 + rnd(i * 8.8) * 0.25,
      tw: 1.1 + rnd(i * 1.3) * 2.4,
      tp: rnd(i * 4.4) * 6.283,
      sp: head ? 1e9 : 7 + rnd(i * 6.1) * 9,
      so: rnd(i * 9.9) * 16,
      appear: 0.15 + rnd(i * 2.1) * 0.8,
    });
  }
  return out;
})();

// glistening dust: tiny motes drifting slowly to the right and a touch upward, wrapping round with a fade
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
}
const MOTES: Mote[] = Array.from({ length: 70 }, (_, i) => ({
  x: rnd(i * 13.7 + 1) * W,
  y: 30 + rnd(i * 5.3 + 2) * 470,
  vx: 6 + rnd(i * 3.1 + 3) * 10,
  vy: -1.5 - rnd(i * 2.9 + 4) * 2.5,
  ph: rnd(i * 1.7 + 5) * 6.283,
}));

// a four-point star: concave sides, the vertical rays a little longer than the horizontal ones
function starShape(x: number, y: number, r: number, rot: number): Pt[] {
  const pts: Pt[] = [];
  const inner = r * 0.2;
  for (let i = 0; i < 16; i++) {
    const a = rot + (i / 16) * Math.PI * 2;
    const tip = i % 4 === 0;
    const vert = i % 8 === 4;
    const rr = tip ? r * (vert ? 1 : 0.82) : i % 2 === 0 ? inner : inner * 1.25;
    pts.push([x + Math.sin(a) * rr, y - Math.cos(a) * rr]);
  }
  return pts;
}

const SHOOT_PERIOD = 7.7; // seconds between shooting stars
const SHOOT_LEN = 1.1; // how long one lasts

export const sky: Part = {
  id: 'sky',
  z: 0,
  intro: [0.5, 3.0],
  draw(pen, f) {
    const t = f.t;
    const ctx = pen.ctx;

    // 1. the glistening dust; a soft wave of light sweeps across every ~13 s and makes the motes glint
    const dustIn = Math.max(0, Math.min(1, (f.reveal - 0.3) / 0.7));
    if (dustIn > 0) {
      const sweepX = ((t / 13.3) % 1) * (W + 1200) - 600;
      ctx.save();
      ctx.fillStyle = INK;
      for (const m of MOTES) {
        const span = W + 200;
        const x = ((((m.x + m.vx * t) % span) + span) % span) - 100;
        const y = 30 + ((((m.y - 30 + m.vy * t) % 470) + 470) % 470);
        if (y > skyBottom(x) + 30) continue;
        const edge = Math.min(1, (x + 100) / 160, (W + 100 - x) / 160, (y - 30) / 60, (500 - y) / 60);
        const glint = Math.exp(-(((x - sweepX - (y - 300) * 0.5) / 170) ** 2));
        let a = (0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph)) + 0.55 * glint) * edge * dustIn;
        if (inHead(x, y)) a *= 0.55;
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        const r = 1.6 + glint * 1.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.283);
        ctx.fill();
        if (glint > 0.55 && !inHead(x, y)) {
          // a hair-thin cross glint on the brightest motes
          ctx.fillRect(x - 9 * glint, y - 0.6, 18 * glint, 1.2);
          ctx.fillRect(x - 0.6, y - 9 * glint, 1.2, 18 * glint);
        }
      }
      ctx.restore();
    }

    // 2. the stars
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i]!;
      const g = f.reveal >= 1 ? 1 : Math.max(0, Math.min(1, (f.reveal - s.appear * 0.7) / 0.3));
      if (g <= 0) continue;
      const pop = g >= 1 ? 1 : 1 + 2.6 * (g - 1) ** 3 + 1.6 * (g - 1) ** 2; // overshoot as it pops in
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.tw + s.tp) * Math.sin(t * s.tw * 0.53 + s.tp * 1.7);
      // a sparkle: a short flare every s.sp seconds
      const ph = (((t + s.so) % s.sp) + s.sp) % s.sp;
      const flare = ph < 0.9 ? Math.sin((ph / 0.9) * Math.PI) ** 2 : 0;
      const r = s.r * pop * (0.78 + 0.3 * twinkle + 0.75 * flare);
      const alpha = Math.min(1, s.base * (0.55 + 0.45 * twinkle) + flare * 0.5) * Math.min(1, g * 2);
      pen.fill(starShape(s.x, s.y, r, flare * 0.6), INK, alpha);
      if (flare > 0.05) {
        // long hair-thin rays during the flare
        const L = s.r * (1.2 + 2.2 * flare);
        pen.stroke([[s.x - L, s.y], [s.x + L, s.y]], { width: 1.6, seed: i, alpha: flare * 0.7 });
        pen.stroke([[s.x, s.y - L * 1.2], [s.x, s.y + L * 1.2]], { width: 1.6, seed: i + 50, alpha: flare * 0.7 });
      }
    }

    // 3. a shooting star every SHOOT_PERIOD seconds, after the entrance, along a path picked by its index
    if (f.alive) {
      const n = Math.floor(t / SHOOT_PERIOD);
      const local = t - n * SHOOT_PERIOD - 1.5 - rnd(n * 3.7) * 2.5;
      if (local > 0 && local < SHOOT_LEN) {
        const fromLeft = rnd(n * 1.9) < 0.5;
        const x0 = fromLeft ? 750 + rnd(n * 4.3) * 900 : 1600 + rnd(n * 4.3) * 1000;
        const y0 = 40 + rnd(n * 5.9) * 110;
        const dir = fromLeft ? 1 : -1;
        const dx = dir * 640, dy = 190; // its whole path
        const u = local / SHOOT_LEN;
        const head = 1 - (1 - u) ** 1.6; // fast, easing out as it burns up
        const tail = Math.max(0, head - 0.28);
        const fade = Math.min(1, u * 6) * (1 - u ** 3);
        const hx = x0 + dx * head, hy = y0 + dy * head;
        const tx = x0 + dx * tail, ty = y0 + dy * tail;
        const grad = ctx.createLinearGradient(tx, ty, hx, hy);
        grad.addColorStop(0, 'rgba(242,239,230,0)');
        grad.addColorStop(1, `rgba(242,239,230,${0.95 * fade})`);
        ctx.save();
        ctx.strokeStyle = grad;
        ctx.lineCap = 'round';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.restore();
        pen.fill(starShape(hx, hy, 9 * fade, 0.4), INK, fade);
      }
    }
  },
};
