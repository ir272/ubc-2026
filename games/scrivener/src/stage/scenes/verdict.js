// Phase 5, the verdict. Still paper and ink, but printed in oxblood: a square-cut red block
// across the head of the sheet carries the winner's name, both score lines and the clock to the
// next match; the winner stands below it at full height; beside it the deciding moment is
// played again, large. Owner: lead.

import {
  W, INK, CREAM, BLOOD, BLOOD_DEEP, paperGround, title, text, underline, caps, numf,
  prog, ease, figure, clamp, seconds, hashNoise, cached, offscreen,
} from '../kit.js';
import { T } from '../../show/timing.js';

const BLOCK_H = 184;
const proseI = (n) => `italic ${n}px Baskerville, Palatino, Georgia, serif`;

// A figure's inked extent at height REF, facing right, measured once per build and pose (a sash
// or a raised blade reaches well past the body), so the scene can keep it whole on screen.
const REF = 240;
const boxes = new Map();
function figureBox(lo, pose, ref = REF) {
  const key = [lo.cls, lo.weapon, lo.spell, lo.charm, pose, ref].join('|');
  let b = boxes.get(key);
  if (b) return b;
  b = { top: -ref * 1.55, bot: 14, left: -ref * 0.5, right: ref * 0.5 };
  try {
    const cw = 960, ch = 640, ox = 480, oy = 540;
    const c = offscreen(cw, ch);
    const g = c.getContext('2d', { willReadFrequently: true });
    figure(g, { loadout: lo, x: ox, y: oy, height: ref, facing: 1, pose, t: 0 });
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
// where to stand a figure of `height` so its whole drawing keeps inside [x0, x1], near `want`
function standX(lo, poses, height, facing, want, x0, x1) {
  // a small figure is drawn with other proportions, so it is measured at its own size
  const ref = height < 200 ? Math.round(height) : REF;
  const k = height / ref;
  let l = Infinity, r = -Infinity;
  for (const p of poses) { const b = figureBox(lo, p, ref); l = Math.min(l, facing > 0 ? b.left : -b.right); r = Math.max(r, facing > 0 ? b.right : -b.left); }
  // too wide for the room at this height: drawn smaller, never cropped
  const kk = Math.min(k, (x1 - x0) / (r - l));
  const lo2 = x0 - l * kk, hi2 = x1 - r * kk;
  return { x: clamp(want, lo2, Math.max(lo2, hi2)), height: ref === REF && kk * REF < 200 ? 200 : kk * ref };
}

// how far above its floor a figure of `height` reaches, at the highest of `poses`
function reach(lo, poses, height) {
  const ref = height < 200 ? Math.round(height) : REF;
  return Math.max(...poses.map((p) => -figureBox(lo, p, ref).top)) * (height / ref);
}

// The red block, as type-high metal prints it: square-cut, the paper showing through in fine
// scratches.
function redBlock(ctx) {
  const c = cached('verdict:block4', W, BLOCK_H + 30, (g) => {
    g.fillStyle = BLOOD;
    g.fillRect(0, 0, W, BLOCK_H);
    g.save();
    g.beginPath(); g.rect(0, 0, W, BLOCK_H); g.clip();
    g.strokeStyle = BLOOD_DEEP; g.lineWidth = 1.2;
    for (let i = -BLOCK_H; i < W; i += 6) { g.globalAlpha = 0.25 + 0.3 * hashNoise(7, i); g.beginPath(); g.moveTo(i, 0); g.lineTo(i + BLOCK_H * 0.6, BLOCK_H + 20); g.stroke(); }
    g.strokeStyle = '#e7e0cc'; g.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const x = hashNoise(11, i) * W, y = hashNoise(12, i) * BLOCK_H, l = 6 + hashNoise(13, i) * 38;
      g.globalAlpha = 0.05 + 0.12 * hashNoise(14, i);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (hashNoise(15, i) - 0.5) * 2); g.stroke();
    }
    g.restore();
  });
  ctx.drawImage(c, 0, 0, W, BLOCK_H + 30);
}

// one contender's tries, on the red: its colour tab and name, then only the tries that happened,
// as plain figures in columns, its best try underlined. The winner's row is set bolder.
const SCORE_X = 940, SCORE_COL0 = 1088, SCORE_STEP = 60;
function scoreRow(ctx, env, id, y, a, won) {
  const { sh } = env;
  const b = env.bot(id);
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = b.accent; ctx.fillRect(SCORE_X - 16, y - 12, 6, 26); ctx.restore();
  title(ctx, b.name.toUpperCase(), SCORE_X, y + 8, 22, { align: 'left', spacing: 2, weight: won ? 'bold' : '', color: CREAM, alpha: a, maxW: SCORE_COL0 - 34 - SCORE_X });
  const mine = sh.attempts.filter((q) => q.entrantId === id);
  const val = (q) => (q.result === 'kill' ? 2 : q.score);
  const best = mine.reduce((m, q) => (!m || val(q) > val(m) ? q : m), null);
  mine.forEach((q, i) => {
    const cx = SCORE_COL0 + i * SCORE_STEP;
    const kill = q.result === 'kill';
    const f = kill ? caps(21, won ? 'bold' : '') : numf(24, won ? 'bold' : '');
    const s = kill ? 'KILL' : `${Math.round(q.score * 100)}%`;
    text(ctx, s, cx, y + 8, f, { color: CREAM, align: 'center', alpha: a });
    if (q === best) {
      ctx.save(); ctx.font = f; const hw = ctx.measureText(s).width / 2 + 3; ctx.restore();
      underline(ctx, cx - hw, cx + hw, y + 19, CREAM, { width: won ? 3.5 : 2, seed: q.index + 2, alpha: a });
    }
  });
  if (env.highlight === id) text(ctx, 'your pick', SCORE_X, y + 26, proseI(16), { color: CREAM, alpha: a }); // the viewer's own bet, under its name
}

export const verdictScene = {
  ground: 'blood',
  draw(ctx, env) {
    const { sh, age, t, ms } = env;
    paperGround(ctx, 30);
    redBlock(ctx);
    const v = sh.verdict;
    if (!v || !v.winnerId) return;
    const win = env.bot(v.winnerId);
    const loserId = sh.order.find((x) => x !== v.winnerId);
    const lo = sh.loadouts[v.winnerId] || {};
    const FIG_R = 390; // the winner stands left of this
    // the replay box, 16:9, centred in the room right of the winner and under the red; the name
    // shares its left edge
    const bw = 800, bh = 450;
    const box = { x: Math.round((FIG_R + W - 40) / 2 - bw / 2), y: Math.round((BLOCK_H + 690) / 2 - bh / 2), w: bw, h: bh };
    const X = box.x - 5; // the frame's outer edge

    // the name, printed out of the red
    title(ctx, win.name.toUpperCase(), X - 4, 140, 124, { align: 'left', color: CREAM, spacing: 8, weight: 'bold', maxW: SCORE_X - 24 - X, alpha: prog(age, 500, 260) });
    // both ledgers, on the red at the right, and under them the clock to the next match
    scoreRow(ctx, env, v.winnerId, 70, prog(age, 1700, 400), true);
    scoreRow(ctx, env, loserId, 126, prog(age, 2100, 400), false);
    if (sh.next && sh.next.at != null) {
      const left = sh.next.ms - (ms - sh.next.at);
      if (left > 0) {
        const s = seconds(left);
        const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        const cf = numf(30, 'bold');
        ctx.save(); ctx.font = cf; const cw = ctx.measureText(clock).width; ctx.restore();
        text(ctx, clock, SCORE_COL0 + 2 * SCORE_STEP + 26, 170, cf, { color: CREAM, align: 'right' });
        text(ctx, 'Next match', SCORE_COL0 + 2 * SCORE_STEP + 26 - cw - 12, 170, proseI(22), { color: CREAM, align: 'right' });
      }
    }

    // the winner, full height, under the block: it arrives, breathes, then raises its weapon.
    // Its highest reach, in either pose, stays clear of the red.
    const a0 = ease(age, 150, 520);
    const FLOOR = box.y + box.h, POSES = ['ready', 'victory'];
    const lim = FLOOR - (BLOCK_H + 12) - 6;
    let ws = standX(lo, POSES, 390, 1, 196, 22, FIG_R);
    for (let i = 0; i < 3; i++) {
      const up = reach(lo, POSES, ws.height);
      if (up <= lim) break;
      ws = standX(lo, POSES, ws.height * (lim / up) - 1, 1, 196, 22, FIG_R);
    }
    ctx.save();
    ctx.globalAlpha = a0;
    ctx.translate(-(1 - a0) * 70, 0);
    figure(ctx, { loadout: lo, x: ws.x, y: FLOOR + Math.sin(t / 700) * 1.5, height: ws.height, facing: 1, pose: age > 1500 ? 'victory' : 'ready', t, accent: win.accent });
    ctx.restore();

    // the deciding moment, again: the picture of this screen. The plate is up from the first
    // frame with the try's opening still in it; at verdictReplayAt the try starts to play inside it.
    const rAge = age - T.verdictReplayAt;
    const ba = ease(age, 0, 280);
    ctx.save();
    ctx.globalAlpha = ba;
    ctx.fillStyle = 'rgba(20,14,6,0.3)';
    ctx.fillRect(box.x + 8, box.y + 10, box.w, box.h);
    ctx.fillStyle = INK;
    ctx.fillRect(box.x - 5, box.y - 5, box.w + 10, box.h + 10);
    const ok = env.fight && v.deciding ? env.fight.drawReplay(ctx, box, v.deciding.index, Math.max(0, rAge)) : false;
    if (!ok) {
      // no recording to play: the plate still carries the deciding try, as its result in large
      ctx.fillStyle = '#e7e0cc'; ctx.fillRect(box.x, box.y, box.w, box.h);
      const q = v.deciding && sh.attempts.find((x) => x.index === v.deciding.index);
      const big = q ? (q.result === 'kill' ? 'KILL' : `${Math.round(q.score * 100)}%`) : win.name.toUpperCase();
      title(ctx, big, box.x + box.w / 2, box.y + box.h / 2 + 40, 120, { weight: 'bold', spacing: 10, maxW: box.w - 80 });
    }
    ctx.restore();
  },
};
