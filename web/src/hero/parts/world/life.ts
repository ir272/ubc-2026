// Small life: fireflies in two loose groups (round the sign and its lantern, round the couch and the tree),
// each drifting on its own looping path and pulsing, a few rising out of the grass; two moths circling the
// glow of the TV screen; and a few seeds riding the wind along the ridge. All pure functions of t.
import { GOLD, INK, TV, groundY, rnd, tvGlow, wind } from '../../engine/layout';
import type { Part } from '../../engine/types';
import { TAU, clamp01, mod, smooth } from './util';

interface Fly { hx: number; hy: number; ax: number; ay: number; w1: number; w2: number; w3: number; p1: number; p2: number; p3: number; wp: number; pp: number; rise: number; s: number; halo: number; lum: number }
const FLIES: Fly[] = (() => {
  const out: Fly[] = [];
  const add = (hx: number, hy: number, i: number, rise: boolean) => {
    // every firefly its own size and brightness; about one in four is far off: a bare point with no halo
    const far = rnd(i * 5.9 + 2) < 0.26;
    out.push({
      hx, hy, ax: 30 + rnd(i * 3.1) * 46, ay: 14 + rnd(i * 5.3) * 26,
      w1: 0.21 + rnd(i * 2.3) * 0.2, w2: 0.47 + rnd(i * 4.9) * 0.3, w3: 0.29 + rnd(i * 6.7) * 0.25,
      p1: rnd(i * 1.1) * TAU, p2: rnd(i * 8.3) * TAU, p3: rnd(i * 9.7) * TAU,
      wp: 1.1 + rnd(i * 7.1) * 1.3, pp: rnd(i * 3.9) * TAU, rise: rise ? 9 + rnd(i * 2.9) * 7 : 0,
      s: far ? 0.5 + rnd(i * 6.1) * 0.2 : 0.75 + rnd(i * 6.1) * 0.6,
      halo: far ? 0 : 6 + rnd(i * 4.7 + 1) * 2.4, lum: far ? 0.5 + rnd(i * 3.3) * 0.2 : 0.65 + rnd(i * 3.3) * 0.35,
    });
  };
  // round the sign (kept below the headline: nothing above y 470 here)
  [[1868, 610], [1930, 560], [1962, 640], [2040, 520], [2092, 590], [2140, 632], [2010, 600], [1800, 640]].forEach(([x, y], i) => add(x!, y!, i + 1, i > 5));
  // round the couch and the tree
  [[2268, 560], [2310, 470], [2400, 420], [2520, 400], [2610, 440], [2700, 560], [2790, 600], [2860, 520], [2930, 610], [2460, 610], [2740, 470]].forEach(([x, y], i) => add(x!, y!, i + 31, i > 7));
  // a few down the ridge so the middle of the land is never dead
  [[1180, 640], [1420, 650], [1640, 640], [1300, 668]].forEach(([x, y], i) => add(x!, y!, i + 61, true));
  return out;
})();

const SEEDS = Array.from({ length: 6 }, (_, i) => ({ per: 15 + rnd(i * 3.3 + 70) * 9, off: rnd(i * 5.7 + 71) * 30, x0: 1000 + rnd(i * 7.9 + 72) * 500, len: 700 + rnd(i * 2.1 + 73) * 700, h: 26 + rnd(i * 4.3 + 74) * 60, p: rnd(i * 6.9) * TAU }));

export const life: Part = {
  id: 'life',
  z: 33,
  intro: [0, 0.01],
  draw(pen, f) {
    const t = f.t;
    const c = pen.ctx;

    // seeds drifting on the wind: a hair stem under a tuft of fine rays
    c.save();
    c.strokeStyle = INK;
    c.lineWidth = 1;
    c.lineCap = 'round';
    for (const s of SEEDS) {
      const u = mod(t + s.off, s.per) / s.per;
      const x = s.x0 + s.len * (u + 0.04 * Math.sin(u * TAU * 2 + s.p));
      const y = groundY(x) - s.h - 34 * Math.sin(u * Math.PI) + 7 * Math.sin(t * 1.3 + s.p) - wind(t, x) * 6;
      const a = Math.min(1, u * 8, (1 - u) * 8) * 0.6;
      if (a <= 0.01) continue;
      const tilt = 0.5 + 0.3 * Math.sin(t * 1.1 + s.p);
      c.globalAlpha = a;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - Math.sin(tilt) * 7, y + Math.cos(tilt) * 7);
      for (let k = -2; k <= 2; k++) {
        const b = -Math.PI / 2 + tilt * 0.6 + k * 0.42;
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(b) * 5.5, y + Math.sin(b) * 5.5);
      }
      c.stroke();
    }
    c.restore();

    // fireflies: a small soft halo (one cached sprite, scaled per firefly) and a bright core
    const halo = pen.layer('halo', { x: -16, y: -16, w: 32, h: 32 }, (p) => {
      const g = p.ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
      g.addColorStop(0, 'rgba(231,200,115,0.5)');
      g.addColorStop(0.3, 'rgba(231,200,115,0.2)');
      g.addColorStop(1, 'rgba(231,200,115,0)');
      p.ctx.fillStyle = g;
      p.ctx.fillRect(-16, -16, 32, 32);
    });
    for (const fl of FLIES) {
      let x = fl.hx + fl.ax * Math.sin(t * fl.w1 + fl.p1) + fl.ax * 0.35 * Math.sin(t * fl.w2 + fl.p2);
      let y = fl.hy + fl.ay * Math.sin(t * fl.w3 + fl.p3) + fl.ay * 0.4 * Math.cos(t * fl.w2 * 1.3 + fl.p1);
      let a = 0.22 + 0.78 * smooth(0.5 + 0.9 * Math.sin(t * fl.wp + fl.pp) * Math.sin(t * fl.wp * 0.37 + fl.p2));
      if (fl.rise) {
        // these lift out of the grass, glow, and go dark before they sink back
        const u = mod(t + fl.pp * 3, fl.rise) / fl.rise;
        const g = groundY(x) - 8;
        y = g - (g - y) * smooth(u * 1.6);
        a *= clamp01(Math.min(u * 6, (1 - u) * 4));
      }
      x += wind(t, x) * 5;
      a *= fl.lum;
      if (a < 0.02) continue;
      c.globalAlpha = a;
      if (halo && fl.halo) {
        const r = fl.halo * (0.8 + 0.2 * a);
        c.drawImage(halo.cv, x - r, y - r, r * 2, r * 2);
      }
      c.fillStyle = GOLD;
      c.beginPath();
      c.arc(x, y, 1.9 * fl.s, 0, TAU);
      c.fill();
      c.fillStyle = INK;
      c.beginPath();
      c.arc(x - 0.3, y - 0.3, 0.8 * fl.s, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;

    // two moths circling the screen's glow: a body and two wings that beat
    const sc = TV.screen;
    const glow = tvGlow(t);
    for (let i = 0; i < 2; i++) {
      const w = 0.83 + i * 0.36, ph = i * 2.4;
      const cx = sc.x + sc.w * (0.62 + 0.18 * Math.sin(t * 0.19 + i)), cy = sc.y + sc.h * (0.3 + 0.16 * Math.sin(t * 0.27 + i * 2));
      const rx = 108 - i * 34 + 16 * Math.sin(t * 0.41 + ph), ry = 62 - i * 18 + 10 * Math.sin(t * 0.53 + ph);
      const a = t * w + ph;
      const x = cx + Math.cos(a) * rx + 6 * Math.sin(t * 7.3 + ph), y = cy + Math.sin(a) * ry + 5 * Math.sin(t * 9.1 + ph);
      const heading = Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx);
      const beat = Math.abs(Math.sin(t * 21 + ph * 3));
      c.save();
      c.translate(x, y);
      c.rotate(heading);
      c.globalAlpha = 0.7 + 0.3 * glow;
      c.fillStyle = INK;
      c.beginPath();
      c.ellipse(0, 0, 4.2, 1.5, 0, 0, TAU);
      c.fill();
      c.globalAlpha = 0.5 + 0.25 * glow;
      for (const sgn of [-1, 1]) {
        c.beginPath();
        c.moveTo(1.5, 0);
        c.quadraticCurveTo(3, sgn * 7 * (0.25 + 0.75 * beat), -2.5, sgn * 8.5 * (0.2 + 0.8 * beat));
        c.quadraticCurveTo(-4.5, sgn * 3, -1.5, 0);
        c.fill();
      }
      c.restore();
    }
  },
};
