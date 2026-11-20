// Phase 5, the verdict. Still paper and ink, but printed in oxblood: the winner very large at the
// left, the deciding moment replayed as the big picture, the name and result on a red band across
// the foot, the loser as one small line. The clock to the next match sits alone in a bottom corner.
// (Ian chose this "winner poster" over a two-bar layout on 2026-11-20.) Owner: lead.

import {
  W, INK, CREAM, RED, BLOOD, BLOOD_DEEP, paperGround, title, text, caps, numf,
  prog, ease, figure, clamp, seconds, hashNoise, cached, offscreen,
} from '../kit.js';
import { T } from '../../show/timing.js';

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

// A red block, as type-high metal prints it: square-cut, the paper showing through in fine
// scratches. One cached print per height.
function redBlock(ctx, y, h) {
  const c = cached(`verdict:block:${h}`, W, h, (g) => {
    g.fillStyle = BLOOD;
    g.fillRect(0, 0, W, h);
    g.strokeStyle = BLOOD_DEEP; g.lineWidth = 1.2;
    for (let i = -h; i < W; i += 6) { g.globalAlpha = 0.25 + 0.3 * hashNoise(7, i); g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h * 0.6, h + 20); g.stroke(); }
    g.strokeStyle = '#e7e0cc'; g.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const x = hashNoise(11, i) * W, yy = hashNoise(12, i) * h, l = 6 + hashNoise(13, i) * 38;
      g.globalAlpha = 0.05 + 0.12 * hashNoise(14, i);
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + l, yy + (hashNoise(15, i) - 0.5) * 2); g.stroke();
    }
  });
  ctx.drawImage(c, 0, y, W, h);
}

// a fighter's result: its best go, as the boss's health left (a kill beats any figure)
function resultOf(sh, id) {
  const mine = sh.attempts.filter((q) => q.entrantId === id);
  const val = (q) => (q.result === 'kill' ? 2 : q.score || 0);
  const best = mine.reduce((m, q) => (!m || val(q) > val(m) ? q : m), null);
  if (!best) return { kill: false, left: 1, label: '' };
  const kill = best.result === 'kill';
  const left = kill ? 0 : clamp(1 - (best.score || 0), 0, 1);
  return { kill, left, label: kill ? 'KILL' : `${Math.round(left * 100)}%` };
}

// the clock to the next match: alone in a bottom corner, nothing else near it
function nextClock(ctx, env, x, y, { align = 'left', color = INK } = {}) {
  const { sh, ms } = env;
  if (!sh.next || sh.next.at == null) return;
  const left = sh.next.ms - (ms - sh.next.at);
  if (left <= 0) return;
  const a = prog(ms - sh.next.at, 0, 300);
  const s = seconds(left);
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const cf = numf(34, 'bold'), lf = proseI(22);
  ctx.save(); ctx.font = cf; const cw = ctx.measureText(clock).width; ctx.font = lf; const lw = ctx.measureText('Next match').width; ctx.restore();
  if (align === 'right') {
    text(ctx, clock, x, y, cf, { color, align: 'right', alpha: a });
    text(ctx, 'Next match', x - cw - 14, y, lf, { color, align: 'right', alpha: a });
  } else {
    text(ctx, 'Next match', x, y, lf, { color, alpha: a });
    text(ctx, clock, x + lw + 14, y, cf, { color, alpha: a });
  }
}

// the deciding moment, again: the plate is up from the first frame with the go's opening still in
// it; at verdictReplayAt the go starts to play inside it
function replayPlate(ctx, env, box, v, win) {
  const { sh, age } = env;
  const rAge = age - T.verdictReplayAt;
  ctx.save();
  ctx.globalAlpha = ease(age, 0, 280);
  ctx.fillStyle = 'rgba(20,14,6,0.3)';
  ctx.fillRect(box.x + 8, box.y + 10, box.w, box.h);
  ctx.fillStyle = INK;
  ctx.fillRect(box.x - 5, box.y - 5, box.w + 10, box.h + 10);
  const ok = env.fight && v.deciding ? env.fight.drawReplay(ctx, box, v.deciding.index, Math.max(0, rAge)) : false;
  if (!ok) {
    // no recording to play: the plate still carries the deciding go, as its result in large
    ctx.fillStyle = '#e7e0cc'; ctx.fillRect(box.x, box.y, box.w, box.h);
    const q = v.deciding && sh.attempts.find((x) => x.index === v.deciding.index);
    const big = q ? (q.result === 'kill' ? 'KILL' : `${Math.round((1 - q.score) * 100)}%`) : win.name.toUpperCase();
    title(ctx, big, box.x + box.w / 2, box.y + box.h / 2 + 40, 120, { weight: 'bold', spacing: 10, maxW: box.w - 80 });
  }
  ctx.restore();
}

// the winner: it arrives, breathes, then raises its weapon. Its whole drawing, in either pose,
// keeps inside [x0, x1] and under `top`.
function winnerFigure(ctx, env, lo, accent, { want, x0, x1, floor, top, height }) {
  const { age, t } = env;
  const POSES = ['ready', 'victory'];
  const lim = floor - top;
  let ws = standX(lo, POSES, height, 1, want, x0, x1);
  for (let i = 0; i < 3; i++) {
    const up = reach(lo, POSES, ws.height);
    if (up <= lim) break;
    ws = standX(lo, POSES, ws.height * (lim / up) - 1, 1, want, x0, x1);
  }
  const a0 = ease(age, 150, 520);
  ctx.save();
  ctx.globalAlpha = a0;
  ctx.translate(-(1 - a0) * 70, 0);
  figure(ctx, { loadout: lo, x: ws.x, y: floor + Math.sin(t / 700) * 1.5, height: ws.height, facing: 1, pose: age > 1500 ? 'victory' : 'ready', t, accent });
  ctx.restore();
}

// ---- the winner poster ------------------------------------------------------------------------------
const B = { BAND_Y: 524, FIG_R: 452 };
function drawB(ctx, env, v, win, loserId, lo) {
  const { sh, age } = env;
  const bandH = 720 - B.BAND_Y;
  redBlock(ctx, B.BAND_Y, bandH);
  // the deciding moment is the picture: large, at the head of the sheet
  const bw = 784, bh = 441;
  const box = { x: W - 40 - bw, y: 44, w: bw, h: bh };
  replayPlate(ctx, env, box, v, win);
  // the winner, very large, standing in front of the red band
  winnerFigure(ctx, env, lo, win.accent, { want: 232, x0: 14, x1: B.FIG_R - 22, floor: 700, top: 22, height: 600 });

  // on the band: the name, its result beside it, the loser as one small line, the clock in the corner
  const X = box.x;
  const res = resultOf(sh, v.winnerId);
  const nm = title(ctx, win.name.toUpperCase(), X - 6, B.BAND_Y + 116, 118, { align: 'left', color: CREAM, spacing: 8, weight: 'bold', maxW: 520, alpha: prog(age, 500, 260) });
  const ra = prog(age, 1300, 300);
  const rx = X - 6 + nm.width + 40 + (1 - ease(age, 1300, 300)) * 20;
  if (res.kill) title(ctx, 'KILL', rx, B.BAND_Y + 114, 64, { align: 'left', color: CREAM, spacing: 6, alpha: ra, maxW: W - 44 - rx });
  else text(ctx, res.label, rx, B.BAND_Y + 116, numf(74), { color: CREAM, alpha: ra });
  if (env.highlight === v.winnerId) text(ctx, 'your pick', X, B.BAND_Y + 21, proseI(17), { color: CREAM, alpha: prog(age, 900, 300) });

  const lb = env.bot(loserId);
  const lres = resultOf(sh, loserId);
  const la = prog(age, 2100, 350);
  const ly = B.BAND_Y + 170;
  ctx.save(); ctx.globalAlpha *= la; ctx.fillStyle = lb.accent; ctx.fillRect(X, ly - 17, 5, 22); ctx.restore();
  const ln = title(ctx, lb.name.toUpperCase(), X + 14, ly, 20, { align: 'left', color: CREAM, spacing: 2, alpha: la, maxW: 220 });
  const lf = lres.kill ? caps(19) : numf(22);
  text(ctx, lres.label, X + 14 + ln.width + 16, ly, lf, { color: CREAM, alpha: la });
  if (env.highlight === loserId) {
    ctx.save(); ctx.font = lf; const fw = ctx.measureText(lres.label).width; ctx.restore();
    text(ctx, 'your pick', X + 14 + ln.width + 16 + fw + 18, ly, proseI(17), { color: CREAM, alpha: la });
  }
  nextClock(ctx, env, W - 40, B.BAND_Y + 176, { align: 'right', color: CREAM });
}

export const verdictScene = {
  ground: 'blood',
  draw(ctx, env) {
    const { sh } = env;
    paperGround(ctx, 30);
    const v = sh.verdict;
    if (!v || !v.winnerId) { redBlock(ctx, B.BAND_Y, 720 - B.BAND_Y); return; }
    const win = env.bot(v.winnerId);
    const loserId = sh.order.find((x) => x !== v.winnerId);
    const lo = sh.loadouts[v.winnerId] || {};
    drawB(ctx, env, v, win, loserId, lo);
  },
};
