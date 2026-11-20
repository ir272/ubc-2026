// Full-screen sequences: inverted impact frames, the boss's killing-blow splash
// card, the challenger's death. Owner: feedback.
// Everything here is a pure function of (age, event data, world): no hidden
// state, so captures at any moment are repeatable.

import { W, H, GROUND_Y } from '../core/constants.js';
import { clamp, easeOutCubic, easeInCubic, lerp } from '../core/math.js';
import { hashNoise } from '../core/rng.js';
import { INK, PAPER, stroke, tonePattern } from '../render/ink.js';
import { focusLines, impactStar, crack } from './impact.js';
import { drawSfx } from './letters.js';
import { blit } from './sil.js';

export const BLOOD = '#a3141b';
export const BLOOD_HOT = '#c4161f';
export const CARD_BG = '#100605';

// ---------------------------------------------------------------- inverted frame
// The negative panel: black page, white focus lines driving into the impact,
// the struck body burnt white, the other one a black cut-out rimmed in white.
//  inv: { age, ms, focus: 'boss'|'agent', x, y, seed, crack, red, word, dir }
export function drawInverted(ctx, S, world, inv, sh, drawExtras, drawUnder) {
  const p = clamp(inv.age / inv.ms, 0, 1);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(-40, -40, W + 80, H + 80);
  const fx = inv.x + sh.x, fy = inv.y + sh.y;
  // halftone glow: screentone dots swelling toward the impact
  for (const [r, dot] of [[520, 1.1], [360, 1.7], [220, 2.4]]) {
    ctx.beginPath();
    ctx.ellipse(fx, fy, r * 1.2, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = tonePattern(ctx, dot, 6, PAPER);
    ctx.globalAlpha = 0.55;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  focusLines(ctx, fx, fy, 150 + p * 40, 1600, 110, inv.seed, { color: PAPER, alpha: 0.92, width: 10 });
  // punch-in: the panel is cut closer on the impact than the shot around it
  const z = 1 + (inv.zoom ?? 0.12) * (1 - 0.4 * p);
  // (perf r1) the silhouettes are rendered already zoomed, then blitted 1:1 in screen space
  S.view(z, fx, fy);
  const screen = ctx.getTransform();
  const blitScreen = (layer) => { ctx.save(); ctx.setTransform(screen); blit(ctx, layer); ctx.restore(); };
  ctx.translate(fx, fy);
  ctx.scale(z, z);
  ctx.translate(-fx, -fy);
  // floor as a single white brush line
  stroke(ctx, [[-20, GROUND_Y + sh.y + 1], [W / 2, GROUND_Y + sh.y + 3], [W + 20, GROUND_Y + sh.y]], { width: 3, taper: 0.2, color: PAPER, alpha: 0.7, seed: inv.seed });

  if (drawUnder) drawUnder(ctx);
  const focusColor = inv.red ? BLOOD_HOT : PAPER;
  if (inv.focus === 'boss') {
    const boss = S.get('boss', focusColor);
    if (inv.crack) {
      const g = boss.getContext('2d');
      S.setWorld(g);
      g.globalCompositeOperation = 'source-atop';
      const b = world.boss;
      for (let k = 0; k < 3; k++) {
        const y0 = GROUND_Y - b.y - 330 + k * 90;
        crack(g, b.x - 150, y0 + hashNoise(inv.seed, k) * 60, b.x + 150, y0 + 60 + hashNoise(inv.seed + 1, k) * 80, inv.seed + k * 13, { width: 6, color: INK, branches: 5 });
      }
      g.globalCompositeOperation = 'source-over';
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    // (perf r1) composed 1:1 into one layer and blitted once (outline radii scale with the zoom)
    blitScreen(S.outlinedLayer([[boss, S.get('boss', INK), 2.5 * z], [S.get('agent', INK), S.get('agent', PAPER), 2.5 * z]]));
  } else {
    blitScreen(S.outlinedLayer([
      [S.get('boss', INK), S.get('boss', PAPER), 2.5 * z],
      inv.red ? [S.get('agent', focusColor), S.get('agent', PAPER), 3 * z] : [S.get('agent', focusColor), S.get('agent', INK), 2 * z],
    ]));
  }
  if (drawExtras) drawExtras(ctx);
  ctx.restore();
}

// ---------------------------------------------------------------- boss death
// Timeline (ms from the killing blow):
export const BD = { invert: 120, cardEnd: 1450, fadeEnd: 1750 };

// The cut: a line through the torso. Returns world-space geometry.
function cutGeom(world, d) {
  const b = world.boss;
  const dir = d.dir || 1;
  const px = b.x, py = GROUND_Y - b.y - 215;
  const ang = 0.5 * dir; // falls toward the blow's travel direction
  return { px, py, ux: Math.cos(ang) * dir, uy: Math.sin(ang) * dir, dir };
}

function halfPlane(ctx, px, py, ux, uy, side) {
  // polygon covering one side of the line through (px,py) with direction (ux,uy)
  const L = 4000;
  const nx = -uy * side, ny = ux * side;
  ctx.beginPath();
  ctx.moveTo(px - ux * L, py - uy * L);
  ctx.lineTo(px + ux * L, py + uy * L);
  ctx.lineTo(px + ux * L + nx * L, py + uy * L + ny * L);
  ctx.lineTo(px - ux * L + nx * L, py - uy * L + ny * L);
  ctx.closePath();
}

// Red-ink splash card. d: { age, dir, seed, x }
export function drawBossDeathCard(ctx, S, world, d, sh) {
  const a = d.age;
  const cardA = a < BD.cardEnd ? 1 : 1 - clamp((a - BD.cardEnd) / (BD.fadeEnd - BD.cardEnd), 0, 1);
  if (cardA <= 0) return;
  const p = clamp((a - BD.invert) / (BD.cardEnd - BD.invert), 0, 1);
  const g = cutGeom(world, d);
  const b = world.boss;

  ctx.save();
  ctx.globalAlpha = cardA;
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(-40, -40, W + 80, H + 80);

  // camera: the boss's feet pinned near the bottom centre, a slow push-in after
  // an initial punch (1.42 -> 1.22 in 90ms, then creeping to 1.3)
  const punch = 1 - easeOutCubic(clamp((a - BD.invert) / 90, 0, 1));
  const z = 1.2 + 0.08 * p + 0.22 * punch;
  const PY = GROUND_Y - 200; // card pivot: the body's centre
  const cx = W / 2 + g.dir * 40, cy = H / 2 + 40;
  const toCard = (x, y) => [cx + (x - b.x) * z, cy + (y - PY) * z];

  // radiating white streaks behind the figure
  const [fcx, fcy] = toCard(g.px, g.py);
  focusLines(ctx, fcx, fcy, 300 * z, 1700, 84, d.seed + 5, { color: PAPER, alpha: 0.16 + 0.22 * punch, width: 12 });
  focusLines(ctx, fcx, fcy, 420 * z, 1700, 40, d.seed + 6, { color: BLOOD, alpha: 0.5, width: 18 });

  // the silhouette, split along the cut
  const sil = S.get('throes', BLOOD);
  const split = 4 + 26 * easeOutCubic(clamp((a - BD.invert - 60) / 900, 0, 1));
  for (const side of [1, -1]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(z, z);
    ctx.translate(-b.x, -PY);
    halfPlane(ctx, g.px, g.py, g.ux, g.uy, side);
    ctx.clip();
    // upper half slides along the cut and drops a touch; lower half holds
    const k = side === -1 ? 1 : 0;
    ctx.translate(g.ux * split * k - sh.x, g.uy * split * k - sh.y + split * 0.25 * k);
    blit(ctx, sil);
    ctx.restore();
  }

  // the cut itself: a white blade-line across the whole page, thick at first
  const cutW = lerp(30, 5, easeOutCubic(clamp((a - BD.invert) / 320, 0, 1)));
  const L = 1500;
  const [x0, y0] = toCard(g.px - g.ux * L, g.py - g.uy * L);
  const [x1, y1] = toCard(g.px + g.ux * L, g.py + g.uy * L);
  const draw = clamp((a - BD.invert + 40) / 90, 0, 1);
  stroke(ctx, [[x0, y0], [lerp(x0, x1, 0.5 * draw), lerp(y0, y1, 0.5 * draw)], [lerp(x0, x1, draw), lerp(y0, y1, draw)]],
    { width: cutW, taper: 0.9, color: PAPER, seed: d.seed + 9 });

  // blood spray off the cut: stateless ballistic drops
  const tS = Math.max(0, (a - BD.invert) / 1000);
  ctx.fillStyle = BLOOD_HOT;
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const along = (hashNoise(d.seed + 20, i) - 0.5) * 300;
    const side = hashNoise(d.seed + 21, i) < 0.5 ? -1 : 1;
    const sp = 200 + 700 * hashNoise(d.seed + 22, i);
    const spread = (hashNoise(d.seed + 23, i) - 0.5) * 1.2;
    const vx = (-g.uy * side + g.ux * spread) * sp, vy = (g.ux * side + g.uy * spread) * sp - 260;
    const wx = g.px + g.ux * along + vx * tS, wy = g.py + g.uy * along + vy * tS + 900 * tS * tS;
    const [qx, qy] = toCard(wx, wy);
    const r = (1.5 + 4 * hashNoise(d.seed + 24, i)) * z;
    const ang = Math.atan2(vy + 1800 * tS, vx);
    ctx.moveTo(qx + Math.cos(ang) * r * 2.2, qy + Math.sin(ang) * r * 2.2);
    ctx.ellipse(qx, qy, r * 2.2, r * 0.8, ang, 0, Math.PI * 2);
  }
  ctx.fill();

  // the body dissolving: red flecks lifting off the figure
  ctx.fillStyle = BLOOD;
  for (let i = 0; i < 70; i++) {
    const life = ((a - BD.invert) / 1000 + hashNoise(d.seed + 30, i) * 0.9) % 0.9;
    if (a < BD.invert) break;
    const ox = b.x + (hashNoise(d.seed + 31, i) - 0.5) * 220;
    const oy = GROUND_Y - b.y - 20 - hashNoise(d.seed + 32, i) * 300;
    const wx = ox + (hashNoise(d.seed + 33, i) - 0.3) * 160 * life * -g.dir;
    const wy = oy - 140 * life;
    const [qx, qy] = toCard(wx, wy);
    const r = (1 + 3 * hashNoise(d.seed + 34, i)) * (1 - life / 0.9) * z;
    ctx.fillRect(qx - r, qy - r, r * 2, r * 2);
  }

  // panel frame: a splash page, not a screen
  ctx.strokeStyle = PAPER;
  ctx.globalAlpha = cardA * 0.85;
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.lineWidth = 1;
  ctx.strokeRect(26, 26, W - 52, H - 52);

  // the SFX rides the first half of the card
  const sfxA = 1 - clamp((a - 700) / 400, 0, 1);
  if (sfxA > 0) {
    drawSfx(ctx, 'ZASH', W / 2 - g.dir * 360, 230, 100, { ink: PAPER, halo: CARD_BG, rot: -0.2 * g.dir, pop: 1, alpha: sfxA * cardA, seed: d.seed + 3, weight: 0.2 });
  }
  ctx.restore();
}

// Killing-blow inverted frame extras: cut flash + giant star + SFX.
export function bossDeathInvertExtras(ctx, world, d, sh) {
  const g = cutGeom(world, d);
  const L = 1500;
  stroke(ctx, [[g.px - g.ux * L + sh.x, g.py - g.uy * L + sh.y], [g.px + sh.x, g.py + sh.y], [g.px + g.ux * L + sh.x, g.py + g.uy * L + sh.y]],
    { width: 22, taper: 0.9, color: PAPER, seed: d.seed + 9 });
  drawSfx(ctx, 'ZASH', W / 2 - g.dir * 360, 230, 100, { ink: PAPER, halo: INK, rot: -0.2 * g.dir, pop: clamp(d.age / 70, 0, 1), seed: d.seed + 3, weight: 0.2 });
}

export function bossDeathInvertUnder(ctx, d, sh) {
  impactStar(ctx, d.hx + sh.x, d.hy + sh.y, 170, d.seed, { edgeW: 5, spikes: 13 });
}

// ---------------------------------------------------------------- agent death
export const AD = { contact: 120, invert: 150, red: 320, iris: 1500 }; // contact: the killing blow shows in the world first, then the panel

// Closing ink iris + bleed after the inverted frames. d: { age, x, seed }
export function drawAgentDeathAfter(ctx, world, d, sh) {
  const a = d.age - AD.red - AD.contact;
  if (a <= 0) return;
  const p = clamp(a / (AD.iris - AD.red), 0, 1);
  const ax = world.agent.x + sh.x, ay = GROUND_Y - 30 + sh.y;
  ctx.save();
  // the page darkens toward dried blood
  ctx.globalAlpha = 0.28 * easeOutCubic(p);
  ctx.fillStyle = '#3a0805';
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // ink iris: a jagged hole that closes on the fallen challenger
  const R = lerp(1150, 210, easeOutCubic(p));
  for (const [rk, al] of [[1.25, 0.45], [1, 1]]) {
    ctx.beginPath();
    ctx.rect(-40, -40, W + 80, H + 80);
    const n = 64;
    for (let i = n; i >= 0; i--) {
      const ang = (i / n) * Math.PI * 2;
      const spike = hashNoise(d.seed + 40, i % n);
      const rr = R * rk * (0.88 + 0.12 * spike) - (spike > 0.82 ? 40 * (spike - 0.82) / 0.18 * (R / 400) : 0);
      const x = ax + Math.cos(ang) * rr * 1.25, y = ay + Math.sin(ang) * rr * 0.8;
      if (i === n) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.globalAlpha = al;
    ctx.fill('evenodd');
  }
  // ink running down from the top edge
  ctx.globalAlpha = 1;
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const x = hashNoise(d.seed + 50, i) * W;
    const len = easeInCubic(clamp(p * 1.3 - hashNoise(d.seed + 51, i) * 0.3, 0, 1)) * (120 + 380 * hashNoise(d.seed + 52, i));
    const w = 3 + 9 * hashNoise(d.seed + 53, i);
    if (len < 2) continue;
    ctx.moveTo(x - w / 2, -2);
    ctx.lineTo(x - w * 0.3, len);
    ctx.arc(x, len, w * 0.45, Math.PI, 0, true);
    ctx.lineTo(x + w / 2, -2);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}
