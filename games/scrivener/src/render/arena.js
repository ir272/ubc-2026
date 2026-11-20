// The arena: the Scrivener's archive nave, inked in one-point perspective. Owner: arena.
// Reads state only. Static ink is built once into offscreen canvases at the canvas's backing
// scale (setArenaScale); only candles, motes, the lamp and the phase-two bleed animate.
//
// API: drawArena(ctx, world, t)          background + floor (behind actors)
//      drawArenaFront(ctx, world, t)     foreground ink (in front of actors)
//
// Modules: arena/geom.js (perspective), arena/lib.js (ruled pen + hatch), arena/back.js (nave),
//          arena/front.js (pillars, spandrel, lamp, rubble), arena/live.js (animated ink).

import { W, H } from '../core/constants.js';
import { buildBack } from './arena/back.js';
import { buildFront } from './arena/front.js';
import { drawLiveBack, drawLiveFront } from './arena/live.js';

let back = null;
let front = null;
let builtFor = null;

// The host tells the arena the canvas's backing scale (backing px per logical px). The
// static ink is rebuilt only when that crosses a tier, so a window drag does not rebuild
// it on every resize event.
const TIERS = [1, 1.5, 2, 2.5, 3];
export function setArenaScale(k) {
  const tier = TIERS.find((x) => k <= x + 0.01) || TIERS[TIERS.length - 1];
  if (tier !== builtFor) { builtFor = tier; back = null; front = null; }
}

function ensure() {
  if (back) return;
  if (builtFor == null) builtFor = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  back = buildBack(builtFor);
  front = buildFront(builtFor);
}

export function drawArena(ctx, world, t = 0) {
  ensure();
  // overdraw a little so screen shake never reveals the canvas edge
  ctx.fillStyle = '#0d0c0b';
  ctx.fillRect(-40, -40, W + 80, H + 80);
  ctx.drawImage(back, 0, 0, W, H);
  drawLiveBack(ctx, world, t);
}

export function drawArenaFront(ctx, world, t = 0) {
  ensure();
  ctx.drawImage(front, 0, 0, W, H);
  drawLiveFront(ctx, world, t);
}
