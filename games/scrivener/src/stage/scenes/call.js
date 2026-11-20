// Phase 1, the call. A dark ledger leaf with the Scrivener stirring behind it, and a versus
// card: each contender on its own plate, its name written in, the model behind it and, when it
// has fought before, drawn as it last fought. No bets yet. Owner: lead.

import {
  W, H, INK, CREAM, RED, nightGround, title, text, written, underline, roman,
  prog, ease, measureSpaced, figure, offscreen, clamp,
} from '../kit.js';
import { createWorld } from '../../sim/world.js';
import { drawBoss } from '../../render/boss_draw.js';
import { GROUND_Y } from '../../core/constants.js';

const SHEET = '#f1ead7';
const proseI = (n) => `italic ${n}px Baskerville, Palatino, Georgia, serif`;
let hall = null; // a world that exists only so the boss can be drawn breathing in the dark

// A class draws taller or wider than its `height` says (a raised pole, a shield, a sash), so each
// build is drawn once off screen and its inked extent kept; both plates then use one scale that
// lets either figure stand whole under the model line.
const REF = 240;
const boxes = new Map();
function figureBox(lo) {
  const key = lo && lo.cls ? [lo.cls, lo.weapon, lo.spell, lo.charm].join('|') : 'unwritten';
  let b = boxes.get(key);
  if (b) return b;
  b = { top: -REF * 1.55, bot: 14, left: -REF * 0.5, right: REF * 0.5 };
  try {
    const cw = 960, ch = 640, ox = 480, oy = 540;
    const c = offscreen(cw, ch);
    const g = c.getContext('2d', { willReadFrequently: true });
    figure(g, { loadout: lo || {}, x: ox, y: oy, height: REF, facing: 1, pose: 'idle', t: 0 });
    const d = g.getImageData(0, 0, cw, ch).data;
    let top = ch, bot = -1, left = cw, right = -1;
    for (let y = 0; y < ch; y++) {
      const row = y * cw * 4;
      for (let x = 0; x < cw; x++) {
        if (d[row + x * 4 + 3] > 40) { if (y < top) top = y; bot = y; if (x < left) left = x; if (x > right) right = x; }
      }
    }
    if (bot > top) b = { top: top - oy, bot: bot - oy, left: left - ox, right: right - ox };
  } catch { /* the guessed box stands in */ }
  boxes.set(key, b);
  return b;
}
// The plates stand tall beside the masthead; the figure's whole drawing sits between FIG_TOP
// and FIG_FLOOR. The scale never drops below 0.84 (a height of 200), where the figure is drawn
// with its full-size proportions on any screen, so the measured box is the one drawn.
const PW = 330, PH = 600, PY = 56;
const FIG_TOP = 168, FIG_FLOOR = 552;
const SHORT_H = 168; // a plate with no figure is only its name and model, set where the tall plate's middle is
function figureScale(env, ids) {
  let k = Infinity;
  for (const id of ids) {
    if (!hasBuild(env.bot(id))) continue;
    const b = figureBox(env.bot(id).last);
    k = Math.min(k, (FIG_FLOOR - FIG_TOP) / (b.bot - b.top), (PW - 40) / (b.right - b.left));
  }
  return clamp(k === Infinity ? 1 : k, 0.84, 1.3);
}
const hasBuild = (b) => !!(b.last && b.last.cls);

function looming(ctx, t, alpha) {
  if (!hall) { hall = createWorld({ seed: 5, agentId: 'none', decisions: false }); hall.boss.aiLock = true; hall.boss.x = 640; hall.agent.x = -900; }
  ctx.save();
  ctx.globalAlpha = alpha;
  const k = 1.5;
  ctx.translate(W / 2, H + 120);
  ctx.scale(k, k);
  ctx.translate(-640, -GROUND_Y);
  try { drawBoss(ctx, hall, t, { contour: false }); } catch { /* the call still reads without it */ }
  ctx.restore();
  // the dark closes over everything but the bone
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(11,10,9,0.96)');
  g.addColorStop(0.2, 'rgba(11,10,9,0.9)');
  g.addColorStop(0.3, 'rgba(11,10,9,0.14)');
  g.addColorStop(0.62, 'rgba(11,10,9,0.34)');
  g.addColorStop(0.78, 'rgba(11,10,9,0.9)');
  g.addColorStop(1, 'rgba(11,10,9,0.96)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// One contender's plate. `side` 0 = left (faces right), 1 = right.
function card(ctx, env, id, side, t0, k) {
  const b = env.bot(id);
  const age = env.age;
  const built = hasBuild(b);
  const pw = PW, ph = built ? PH : SHORT_H;
  const px = side === 0 ? 52 : W - 52 - pw, py = built ? PY : Math.round(PY + (PH - SHORT_H) / 2);
  const cx = px + pw / 2;
  const a = ease(age, t0, 520);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate((side === 0 ? -1 : 1) * (1 - a) * 60, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px + 8, py + 10, pw, ph);
  ctx.fillStyle = SHEET; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);

  // the name, written in
  let size = 62;
  while (size > 34 && measureSpaced(ctx, b.name.toUpperCase(), roman(size, 'bold'), size * 0.07) > pw - 64) size -= 3;
  const f = roman(size, 'bold');
  const reveal = ease(age, t0 + 350, 800);
  const penX = written(ctx, b.name.toUpperCase(), cx, py + 78, f, { color: INK, align: 'center', reveal, spacing: size * 0.07 });
  if (reveal > 0 && reveal < 1) {
    // the nib rides the wet edge at the baseline, leaning away from what is written
    ctx.save();
    ctx.beginPath(); ctx.rect(px + 10, py + 10, pw - 20, ph - 20); ctx.clip();
    ctx.translate(penX + 2, py + 78 + Math.sin(age / 40) * 2);
    ctx.rotate(0.2);
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, -34); ctx.lineTo(-8, -34); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const wN = measureSpaced(ctx, b.name.toUpperCase(), f, size * 0.07);
  underline(ctx, cx - wN / 2 - 4, cx + wN / 2 + 4, py + 94, b.accent, { width: 7, seed: side * 5 + 2, reveal: ease(age, t0 + 1050, 450) });
  // who plays it: the model, or a script standing in
  const ma = prog(age, t0 + 1250, 400);
  const who = b.scripted ? 'scripted' : b.modelLabel;
  let ms = 22;
  while (ms > 16 && measureSpaced(ctx, who, proseI(ms), 0) > pw - 44) ms -= 1;
  text(ctx, who, cx, py + 132, proseI(ms), { align: 'center', alpha: ma });

  // the body, as it last fought, at the scale both plates share
  const fa = prog(age, t0 + 500, 600);
  if (built) {
    const bx = figureBox(b.last);
    const facing = side === 0 ? 1 : -1;
    const fx = cx - ((bx.left + bx.right) / 2) * k * facing;
    const fy = py + FIG_FLOOR - bx.bot * k;
    ctx.save();
    ctx.globalAlpha = a * fa;
    figure(ctx, { loadout: b.last, x: fx, y: fy, height: REF * k, facing, pose: 'idle', t: env.t + side * 900, accent: b.accent });
    ctx.restore();
  }
  if (env.highlight === id) text(ctx, 'your pick', cx, py - 12, proseI(20), { color: CREAM, align: 'center' });
  ctx.restore();
}

export const callScene = {
  ground: 'night',
  draw(ctx, env) {
    const { age, sh, t } = env;
    const [ia, ib] = sh.order;
    ctx.save();
    nightGround(ctx);
    looming(ctx, t, 0.95 * prog(age, 0, 1500));

    // masthead
    const a0 = prog(age, 200, 500);
    title(ctx, 'INKELTON', W / 2, 132, 38, { color: CREAM, spacing: 15, alpha: a0, maxW: 470 });

    if (ia && ib) {
      // the cards wait for the phase's own title to clear
      const k = figureScale(env, [ia, ib]);
      card(ctx, env, ia, 0, 1700, k);
      card(ctx, env, ib, 1, 3500, k);
    }
    ctx.restore();
  },
};
