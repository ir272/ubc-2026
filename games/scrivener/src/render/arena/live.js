// Live arena ink: candle sparkles, motes in the clerestory shafts, the chain-lamp flame, and a
// reaction to the boss's second phase (the far window bleeds). Owner: arena.
// Animates on the render clock `t` only; all variation is seeded. Cheap: a few dozen fills.

import { hashNoise } from '../../core/rng.js';
import { INK, PAPER, RED } from '../ink.js';
import { sparkle } from './lib.js';
import { scene } from './back.js';
import { LAMP } from './front.js';

const h = hashNoise;

function flame(ctx, x, y, s, t, seed) {
  const f = 0.85 + 0.15 * Math.sin(t / 110 + seed * 1.7) + 0.08 * Math.sin(t / 47 + seed);
  // subtractive glow: white sparkle cut out of whatever is behind
  sparkle(ctx, x, y - 2 * s, 21 * s * f, { rays: 8, seed, alpha: 0.95, core: 0.32 });
  // tiny ink flame outline at the core
  const fh = 7 * s * f, fw = 2.4 * s;
  const sway = Math.sin(t / 230 + seed) * 1.2 * s;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(x, y + 1.5 * s);
  ctx.quadraticCurveTo(x - fw, y - fh * 0.3, x + sway, y - fh);
  ctx.quadraticCurveTo(x + fw, y - fh * 0.3, x, y + 1.5 * s);
  ctx.stroke();
  ctx.restore();
}

export function drawLiveBack(ctx, world, t) {
  // motes drifting down the shafts: ink specks in the bare-paper light
  ctx.save();
  ctx.fillStyle = INK;
  for (let si = 0; si < scene.motes.length; si++) {
    const m = scene.motes[si];
    const n = m.win.length;
    for (let i = 0; i < 7; i++) {
      const seed = si * 31 + i;
      const a = Math.floor(h(4000, seed) * n), b = Math.floor(h(4001, seed) * n);
      const sp = 0.012 + h(4002, seed) * 0.02;
      const tau = (h(4003, seed) + (t / 1000) * sp) % 1;
      const v = h(4004, seed);
      const wob = Math.sin(t / 900 + seed) * 3;
      const ax = m.win[a][0] + (m.land[a][0] - m.win[a][0]) * tau, ay = m.win[a][1] + (m.land[a][1] - m.win[a][1]) * tau;
      const bx = m.win[b][0] + (m.land[b][0] - m.win[b][0]) * tau, by = m.win[b][1] + (m.land[b][1] - m.win[b][1]) * tau;
      const x = ax + (bx - ax) * v + wob, y = ay + (by - ay) * v;
      const r = 0.7 + h(4005, seed) * 1.1;
      ctx.globalAlpha = 0.35 + 0.5 * Math.sin(Math.PI * tau);
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
  }
  ctx.restore();

  for (const c of scene.candles) flame(ctx, c.x, c.y, c.s, t, c.seed);

  // phase two: the far window bleeds red ink down its lights (the one accent colour)
  const fw = scene.farWindow;
  const boss = world && world.boss;
  const bleed = !boss ? 0 : boss.state === 'phase_change' ? Math.min(1, boss.stateT / 2200) : boss.phase >= 2 ? 1 : 0;
  if (fw && bleed > 0) {
    ctx.save();
    ctx.beginPath();
    const p = fw.pts;
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = RED;
    for (let i = 0; i < 9; i++) {
      const x = 592 + i * 12 + h(4100, i) * 6;
      const len = 30 + h(4101, i) * 150;
      const grow = Math.min(1, bleed * (0.5 + h(4102, i) * 0.6)) * (0.85 + 0.15 * Math.sin(t / 2000 + i));
      const y0 = 150, y1 = y0 + len * grow;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x - 1.6, y0);
      ctx.lineTo(x + 1.6, y0);
      ctx.lineTo(x + 0.6, y1);
      ctx.arc(x, y1, 1.6, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawLiveFront(ctx, world, t) {
  // the chain-lamp's flame, carved out of its black cage
  const f = 0.9 + 0.1 * Math.sin(t / 90) + 0.06 * Math.sin(t / 37);
  sparkle(ctx, LAMP.x, LAMP.y + 6, 26 * f, { rays: 12, seed: 7, alpha: 1, core: 0.25 });
}

export { PAPER };
