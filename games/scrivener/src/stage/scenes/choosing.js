// Phase 2, the choosing. An open book. The boss's temper is revealed first. Then three engraved
// plates are dealt for whoever is choosing: the cursor weighs them, one is taken and the other two
// fade. Each build is listed by name under its contender as it grows. Owner: lead.

import {
  W, H, INK, RED, paperGround, title, text, underline, roman,
  prog, ease, figure, emblem, itemOf, SLOTS, lerp, clamp, hashNoise, measureSpaced, easeInOut, cached, offscreen,
} from '../kit.js';
import { T } from '../../show/timing.js';

const FIG = { 0: { x: 140, facing: 1 }, 1: { x: W - 140, facing: -1 } };
const PLATE_W = 232, PLATE_H = 300, PLATE_Y = 400, PLATE_GAP = 244;
// the side column: name, then the build one piece per line, then the figure standing under it
const NAME_Y = 196, LIST_Y = 238, LIST_LH = 30, LIST_W = 200;
const FIG_FLOOR = 662, FIG_H = 246, FIG_CLEAR = 30, EDGE = 16, COL_IN = 268;
const LIST_FOOT = LIST_Y + 3 * LIST_LH + 7; // the last line's descenders
const CARD_NAME = (w) => w * 0.118, CARD_SP = () => 1;
const FIGURE_SWAP_MS = 520; // a pick reaches the figure this long after it lands
const prose = (n, w = '') => `${w} ${n}px Baskerville, Palatino, Georgia, serif`.trim();
const proseI = (n) => `italic ${n}px Baskerville, Palatino, Georgia, serif`;


// An offered card: the sheet with one edge, the art and the name. Once taken, the edge turns to
// the taker's colour.
function card(ctx, kind, id, cx, cy, w, h, { accent = RED, lift = 0, chosen = 0, alpha = 1, rot = 0, nameSize = CARD_NAME(w) } = {}) {
  const it = itemOf(kind, id);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy - lift * 10);
  ctx.rotate(rot);
  const k = 1 + lift * 0.04 + chosen * 0.05;
  ctx.scale(k, k);
  const x = -w / 2, y = -h / 2;
  ctx.fillStyle = 'rgba(20,14,6,0.28)';
  ctx.fillRect(x + 5 + lift * 4, y + 7 + lift * 6, w, h);
  ctx.fillStyle = '#f1ead7';
  ctx.fillRect(x, y, w, h);
  const lw = lerp(2.4, 4, chosen);
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  if (chosen > 0) {
    ctx.save();
    ctx.globalAlpha *= chosen;
    ctx.strokeStyle = accent;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
    ctx.restore();
  }
  const win = w - 36;
  emblem(ctx, kind, id, 0, y + 20 + win / 2, win, { accent });
  title(ctx, it.name.replace(/^The /, '').toUpperCase(), 0, y + h - 40, nameSize, { spacing: CARD_SP(w), weight: 'bold' });
  ctx.restore();
}

// one title size for the three cards on the table: the largest at which the longest name fits
function cardNameSize(ctx, kind, ids, w) {
  let s = CARD_NAME(w);
  for (const id of ids) {
    const n = itemOf(kind, id).name.replace(/^The /, '').toUpperCase();
    while (s > 12 && measureSpaced(ctx, n, roman(s, 'bold'), CARD_SP(w)) > w - 32) s -= 0.5;
  }
  return s;
}

// The inked extent of a build at REF height, facing right, across a few moments of its sash, so
// the figure can be placed whole under the list, inside the frame and clear of the cards.
const REF = 120;
const boxes = new Map();
function figureBox(lo) {
  const key = SLOTS.map((s) => lo[s] || '').join('|');
  let b = boxes.get(key);
  if (b) return b;
  b = { top: -REF * 1.5, left: -REF * 0.6, right: REF * 0.6 };
  try {
    const cw = 520, ch = 360, ox = 260, oy = 300;
    const c = offscreen(cw, ch);
    const g = c.getContext('2d', { willReadFrequently: true });
    for (const t of [0, 450, 900, 1350]) figure(g, { loadout: lo, x: ox, y: oy, height: REF, facing: 1, pose: 'idle', t });
    const d = g.getImageData(0, 0, cw, ch).data;
    let top = ch, left = cw, right = -1;
    for (let y = 0; y < ch; y++) {
      const row = y * cw * 4;
      for (let x = 0; x < cw; x++) if (d[row + x * 4 + 3] > 40) { if (y < top) top = y; if (x < left) left = x; if (x > right) right = x; }
    }
    if (right > left) b = { top: top - oy, left: left - ox, right: right - ox };
  } catch { /* the guessed box stands in */ }
  boxes.set(key, b);
  return b;
}
// Height and floor x for a build: as tall as FIG_H allows while its top stays FIG_CLEAR under the
// list, its back (sash included) inside the frame and its front clear of the cards.
function figurePlace(lo, idx) {
  const b = figureBox(lo);
  const pad = 1.05; // the start a pick gives it
  let h = Math.min(FIG_H, REF * (FIG_FLOOR - LIST_FOOT - FIG_CLEAR) / (-b.top * pad));
  h = Math.min(h, REF * (COL_IN - EDGE) / ((b.right - b.left) * pad));
  const s = (h / REF) * pad;
  // facing right on the left page; the right page is its mirror
  const x = Math.min(Math.max(FIG[0].x, EDGE - b.left * s), COL_IN - b.right * s);
  return { h, x: idx === 0 ? x : W - x };
}

function spread(ctx) {
  const c = cached('choosing:spread', W, H, (g) => {
    // the gutter of the open book and the stacked page edges
    const gut = g.createLinearGradient(W / 2 - 70, 0, W / 2 + 70, 0);
    gut.addColorStop(0, 'rgba(40,30,15,0)');
    gut.addColorStop(0.5, 'rgba(40,30,15,0.3)');
    gut.addColorStop(1, 'rgba(40,30,15,0)');
    g.fillStyle = gut;
    g.fillRect(W / 2 - 70, 0, 140, H);
    g.strokeStyle = INK;
    g.globalAlpha = 0.45;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
    g.globalAlpha = 0.22;
    for (let i = 0; i < 5; i++) {
      g.beginPath(); g.moveTo(8 + i * 4, 0); g.lineTo(8 + i * 4, H); g.stroke();
      g.beginPath(); g.moveTo(W - 8 - i * 4, 0); g.lineTo(W - 8 - i * 4, H); g.stroke();
    }
    g.globalAlpha = 1;
  });
  ctx.drawImage(c, 0, 0, W, H);
}

function loadoutAt(sh, id, ms) {
  const lo = {};
  for (const p of sh.picks) if (p.entrantId === id && (p.at == null || p.at + FIGURE_SWAP_MS <= ms)) lo[p.slot] = p.choice;
  // a late joiner may only have the summary state
  const full = sh.loadouts[id] || {};
  for (const s of SLOTS) if (full[s] && !sh.picks.some((p) => p.entrantId === id && p.slot === s)) lo[s] = full[s];
  return lo;
}

function page(ctx, env, id, idx) {
  const { sh, ms, age, t } = env;
  const b = env.bot(id);
  const f = FIG[idx];
  const a = ease(age, 300 + idx * 200, 600);
  if (env.highlight === id) text(ctx, 'your pick', f.x, NAME_Y - 50, proseI(18), { color: b.accent, align: 'center', alpha: a });
  title(ctx, b.name.toUpperCase(), f.x, NAME_Y, 40, { maxW: 236, spacing: 4, weight: 'bold', alpha: a });
  underline(ctx, f.x - 96, f.x + 96, NAME_Y + 13, b.accent, { width: 6, seed: idx + 9, reveal: ease(age, 600 + idx * 200, 500) });
  const lo = loadoutAt(sh, id, ms);
  // the build, one piece per line as each is taken: the class first (or the model until then)
  const who = b.scripted ? 'scripted' : b.modelLabel;
  if (!lo.cls) text(ctx, who, f.x, LIST_Y, fit(ctx, who, proseI, 21), { align: 'center', alpha: a });
  SLOTS.forEach((slot, i) => {
    if (!lo[slot]) return;
    const name = itemOf(slot, lo[slot]).name.replace(/^The /, '');
    const p = sh.picks.find((q) => q.entrantId === id && q.slot === slot);
    const pa = p && p.at != null ? prog(ms - p.at - FIGURE_SWAP_MS, 0, 300) : 1;
    text(ctx, name, f.x, LIST_Y + i * LIST_LH, fit(ctx, name, prose, 23), { align: 'center', alpha: a * pa });
  });

  // the figure answers each pick with a small start, and breathes while it waits
  const last = sh.picks.filter((p) => p.entrantId === id).slice(-1)[0];
  const pop = last && last.at != null ? 1 - prog(ms - last.at - FIGURE_SWAP_MS, 0, 320) : 0;
  if (lo.cls) {
    const at = figurePlace(lo, idx);
    ctx.save();
    ctx.translate(at.x, FIG_FLOOR);
    ctx.scale(1 + 0.05 * pop, 1 + 0.05 * pop);
    ctx.translate(-at.x, -FIG_FLOOR);
    const clsPick = sh.picks.find((p) => p.entrantId === id && p.slot === 'cls');
    const inkIn = clsPick && clsPick.at != null ? prog(ms - clsPick.at - FIGURE_SWAP_MS, 0, 420) : 1;
    figure(ctx, { loadout: lo, x: at.x, y: FIG_FLOOR, height: at.h, facing: f.facing, pose: 'idle', t, accent: b.accent, alpha: a * inkIn });
    ctx.restore();
  }
}

// a font of `size`, stepped down until `str` fits the side column
function fit(ctx, str, font, size) {
  let s = size;
  ctx.save();
  for (; s > 16; s--) { ctx.font = font(s); if (ctx.measureText(str).width <= LIST_W) break; }
  ctx.restore();
  return font(s);
}

function temperHead(ctx, env) {
  const { sh, ms } = env;
  if (!sh.temper) return;
  const tAge = sh.temperAt != null ? ms - sh.temperAt : 99999;
  const big = 1 - prog(tAge, T.temperReveal - 1000, 600);
  if (big <= 0) return;
  // The reveal: the temper's art and name on a plate in the middle of the spread. They arrive one
  // after the other while it is up (the phase's title band crosses it for the first 1.7 s), so it
  // never stands still for long.
  const tp = itemOf('temper', sh.temper);
  const pw = W - 600, ph = 392;
  const px = 300, py = Math.round((H - ph) / 2);
  ctx.save();
  ctx.globalAlpha = big;
  ctx.fillStyle = 'rgba(20,14,6,0.25)';
  ctx.fillRect(px + 8, py + 10, pw, ph);
  ctx.fillStyle = '#f1ead7';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
  const pop = ease(tAge, 1600, 1000);
  ctx.save();
  ctx.translate(W / 2, py + 156); ctx.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
  emblem(ctx, 'temper', sh.temper, 0, 0, 240, { alpha: pop });
  ctx.restore();
  const land = ease(tAge, 3600, 600);
  title(ctx, tp.name.toUpperCase(), W / 2, py + 338 - (1 - land) * 16, 68, { color: RED, spacing: 9, weight: 'bold', maxW: 640, alpha: land });
  ctx.restore();
}

function table(ctx, env) {
  const { sh, ms } = env;
  const of = sh.offer;
  if (!of) return;
  const b = env.bot(of.entrantId);
  const oAge = ms - of.at;
  const pick = sh.picks.find((p) => p.entrantId === of.entrantId && p.slot === of.slot && (p.at == null || p.at >= of.at));
  const pAge = pick && pick.at != null ? ms - pick.at : -1;
  if (pAge > T.pickHold + 300) return;

  // the cursor: a nib that weighs the plates in turn while the model decides
  const thinking = pAge < 0 && oAge > T.pickDeal;
  const stepN = Math.floor(Math.max(0, oAge - T.pickDeal) / 700);
  const start = Math.floor(hashNoise(Math.round(of.at) % 9973, 1) * 3);
  const dir = hashNoise(Math.round(of.at) % 9973, 2) > 0.5 ? 1 : 2;
  const from = (start + stepN * dir) % 3, to = (start + (stepN + 1) * dir) % 3;
  const u = easeInOut(prog((oAge - T.pickDeal) % 700, 400, 300));
  const cursor = thinking ? lerp(from, to, u) : -9;

  const nameSize = cardNameSize(ctx, of.slot, of.options, PLATE_W);
  of.options.forEach((id, i) => {
    // each plate is laid down in its own place: a short drop, a slight turn that settles, no flying across the page
    const dealt = ease(oAge, i * 280, 460);
    if (dealt <= 0) return;
    const baseX = W / 2 + (i - 1) * PLATE_GAP;
    let x = baseX, y = PLATE_Y - (1 - dealt) * 34, alpha = dealt, rot = (1 - dealt) * (i - 1) * 0.08 + (hashNoise(i + 3, Math.round(of.at) % 97) - 0.5) * 0.03;
    let lift = 0, chosen = 0, scale = 0.94 + 0.06 * dealt;
    if (thinking) lift = clamp(1 - Math.abs(cursor - i) * 1.6, 0, 1);
    if (pAge >= 0) {
      if (id === pick.choice) {
        chosen = ease(pAge, 0, 260);
        lift = chosen;
        alpha = 1 - prog(pAge, T.pickHold - 500, 400);
      } else {
        alpha = lerp(1, 0.2, prog(pAge, 250, 500)) * (1 - prog(pAge, T.pickHold - 500, 400));
        y += prog(pAge, 250, 500) * 10;
      }
    }
    ctx.save();
    ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-x, -y);
    card(ctx, of.slot, id, x, y, PLATE_W, PLATE_H, { accent: b.accent, lift, chosen, alpha, rot, nameSize });
    ctx.restore();
  });

  // who is choosing: the name alone, in its colour, drawn over the plates so nothing ever crosses it
  const ha = prog(oAge, 0, 300) * (pAge > 0 ? 1 - prog(pAge, T.pickHold - 300, 300) : 1);
  title(ctx, b.name.toUpperCase(), W / 2, NAME_Y, 40, { spacing: 3, weight: 'bold', color: b.accent, alpha: ha });
}

export const choosingScene = {
  ground: 'paper',
  draw(ctx, env) {
    const { sh } = env;
    paperGround(ctx, 21);
    spread(ctx);
    sh.order.forEach((id, i) => page(ctx, env, id, i));
    table(ctx, env);
    temperHead(ctx, env);
  },
};
