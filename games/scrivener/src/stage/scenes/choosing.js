// Phase 2, the choosing. Picture cards on paper. The boss's temper is revealed first. Then, under a
// plate that says who is picking what, three cards are dealt: they are lifted in turn while the
// model weighs them, one is taken, and it slides to the taker's side where it settles in that
// fighter's hand of four, under its name. The figure changes as class and weapon are taken.
// Owner: lead.

import {
  W, H, INK, RED, paperGround, title, text, underline, caps,
  prog, ease, figure, emblem, itemOf, SLOTS, lerp, clamp, hashNoise, measureSpaced, easeInOut, offscreen,
} from '../kit.js';
import { T } from '../../show/timing.js';

const SHEET = '#f1ead7';
export const SLOT_LABEL = { cls: 'CLASS', weapon: 'WEAPON', spell: 'SPELL', charm: 'CHARM' };
const proseI = (n) => `italic ${n}px Baskerville, Palatino, Georgia, serif`;
const cardName = (kind, id) => String(itemOf(kind, id).name || '').replace(/^The /, '').toUpperCase();

// ---- the card: one design at every size --------------------------------------------------------
// The sheet with its flat shadow and ruled edge, an optional red slot word at its head, the art,
// and the name (one line, or two when it does not fit).
function twoLines(ctx, name, font, sp) {
  const words = name.split(' ');
  if (words.length < 2) return null;
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const wd = Math.max(measureSpaced(ctx, a, font, sp), measureSpaced(ctx, b, font, sp));
    if (!best || wd < best.w) best = { w: wd, lines: [a, b] };
  }
  return best;
}
export function fitName(ctx, name, size, maxW, min = 14) {
  for (let s = size; s >= min; s -= 0.5) {
    const f = caps(s, 'bold');
    if (measureSpaced(ctx, name, f, 1) <= maxW) return { lines: [name], size: s, ok: true };
    const two = twoLines(ctx, name, f, 1);
    if (two && two.w <= maxW) return { lines: two.lines, size: s, ok: true };
  }
  const two = twoLines(ctx, name, caps(min, 'bold'), 1);
  return { lines: two ? two.lines : [name], size: min, ok: false };
}

export function pickCard(ctx, kind, id, cx, cy, w, h, {
  accent = RED, edge = INK, label = '', nameColor = INK, nameSize = 0, minName = 14,
  lift = 0, chosen = 0, alpha = 1, rot = 0, rise = 10,
} = {}) {
  if (!id || alpha <= 0) return;
  const name = cardName(kind, id);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy - lift * rise);
  ctx.rotate(rot);
  const k = 1 + lift * 0.04 + chosen * 0.05;
  ctx.scale(k, k);
  const x = -w / 2, y = -h / 2;
  ctx.fillStyle = 'rgba(20,14,6,0.3)';
  ctx.fillRect(x + 5 + lift * 4, y + 7 + lift * 6, w, h);
  ctx.fillStyle = SHEET;
  ctx.fillRect(x, y, w, h);
  const lw0 = Math.max(2.4, w / 80);
  const lw = lerp(lw0, lw0 * 1.7, chosen);
  ctx.lineWidth = lw;
  ctx.strokeStyle = edge;
  ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  if (chosen > 0) {
    ctx.save();
    ctx.globalAlpha *= chosen;
    ctx.strokeStyle = accent;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
    ctx.restore();
  }
  const pad = Math.max(9, w * 0.075);
  let top = y + pad;
  if (label) {
    const ls = clamp(w * 0.09, 13, 19);
    title(ctx, label, 0, top + ls * 0.8, ls, { color: RED, font: caps, weight: 'bold', spacing: ls * 0.2, maxW: w - 2 * pad });
    top += ls + pad * 0.6;
  }
  const fit = fitName(ctx, name, nameSize || Math.max(minName, w * 0.11), w - pad * 1.2, minName);
  const lh = fit.size * 1.1;
  const bottom = y + h - pad * 0.95;
  const artBot = bottom - fit.lines.length * lh - pad * 0.35;
  const art = Math.max(10, Math.min(w - 2 * pad, artBot - top));
  // the art stays inside its card
  ctx.save();
  ctx.beginPath(); ctx.rect(x + lw, y + lw, w - 2 * lw, h - 2 * lw); ctx.clip();
  emblem(ctx, kind, id, 0, (top + artBot) / 2, art, { accent });
  ctx.restore();
  fit.lines.forEach((l, i) => {
    const base = bottom - (fit.lines.length - 1 - i) * lh - fit.size * 0.12;
    title(ctx, l, 0, base, fit.size, { color: nameColor, font: caps, weight: 'bold', spacing: 1, maxW: w - pad * 0.6 });
  });
  ctx.restore();
}

// one name size for the three cards on the table: the largest at which every name sits on one line
function tableNameSize(ctx, kind, ids, w) {
  let s = 24;
  const names = ids.map((id) => cardName(kind, id));
  while (s > 17 && names.some((n) => measureSpaced(ctx, n, caps(s, 'bold'), 1) > w - w * 0.075 * 1.2)) s -= 0.5;
  return s;
}

// a plate: paper with a flat shadow and an ink edge, as the fight's question sits on
function plate(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(20,14,6,0.42)'; ctx.fillRect(x + 5, y + 6, w, h);
  ctx.fillStyle = SHEET; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

// ---- layout --------------------------------------------------------------------------------------
// the offered cards in the middle
const PLATE_W = 210, PLATE_H = 276, PLATE_Y = 414, PLATE_GAP = 224;
const ASK_H = 48, ASK_Y = PLATE_Y - PLATE_H / 2 - 30 - ASK_H;
// each side: the name, the model, the hand of four (two by two), the figure under it
const SIDE_X = 154, NAME_Y = 64;
const HAND_CW = 136, HAND_CH = 172, HAND_GAP = 8, HAND_TOP = 114;
const HAND_FOOT = HAND_TOP + 2 * HAND_CH + HAND_GAP;
const FIG_FLOOR = 700, FIG_H = 240, FIG_CLEAR = 18, EDGE = 14, COL_IN = 296;
// a taken card is held up, then slides to its hand
const SLIDE_AT = 380, SLIDE_MS = 520, LAND = SLIDE_AT + SLIDE_MS;
const FIGURE_SWAP_MS = LAND; // the figure answers the pick as the card lands
const sideX = (idx) => (idx === 0 ? SIDE_X : W - SIDE_X);
function handSlot(idx, i) {
  const x0 = sideX(idx) - HAND_CW - HAND_GAP / 2;
  return { x: x0 + (i % 2) * (HAND_CW + HAND_GAP) + HAND_CW / 2, y: HAND_TOP + Math.floor(i / 2) * (HAND_CH + HAND_GAP) + HAND_CH / 2 };
}

// The inked extent of a build at REF height, facing right, across a few moments of its sash, so
// the figure can be placed whole under the hand, inside the frame and clear of the cards.
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
// Height and floor x for a build: as tall as FIG_H allows while its top stays clear of the hand,
// its back (sash included) inside the frame and its front clear of the cards on the table.
function figurePlace(lo, idx) {
  const b = figureBox(lo);
  const pad = 1.05; // the start a pick gives it
  let h = Math.min(FIG_H, REF * (FIG_FLOOR - HAND_FOOT - FIG_CLEAR) / (-b.top * pad));
  h = Math.min(h, REF * (COL_IN - EDGE) / ((b.right - b.left) * pad));
  const s = (h / REF) * pad;
  const x = Math.min(Math.max(SIDE_X, EDGE - b.left * s), COL_IN - b.right * s);
  return { h, x: idx === 0 ? x : W - x };
}

function loadoutAt(sh, id, ms, delay = FIGURE_SWAP_MS) {
  const lo = {};
  for (const p of sh.picks) if (p.entrantId === id && (p.at == null || p.at + delay <= ms)) lo[p.slot] = p.choice;
  // a late joiner may only have the summary state
  const full = sh.loadouts[id] || {};
  for (const s of SLOTS) if (full[s] && !sh.picks.some((p) => p.entrantId === id && p.slot === s)) lo[s] = full[s];
  return lo;
}

// an empty place in the hand, waiting for its card; in the fighter's colour while that card is being chosen
function emptySlot(ctx, cx, cy, color, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
  ctx.strokeRect(cx - HAND_CW / 2 + 3, cy - HAND_CH / 2 + 3, HAND_CW - 6, HAND_CH - 6);
  ctx.restore();
}

function side(ctx, env, id, idx) {
  const { sh, ms, age, t } = env;
  const b = env.bot(id);
  const cx = sideX(idx);
  const facing = idx === 0 ? 1 : -1;
  const a = ease(age, 300 + idx * 200, 600);
  if (env.highlight === id) text(ctx, 'your pick', cx, 27, proseI(18), { color: b.accent, align: 'center', alpha: a });
  const tn = title(ctx, b.name.toUpperCase(), cx, NAME_Y, 38, { maxW: 272, spacing: 4, weight: 'bold', alpha: a });
  const uw = Math.max(80, tn.width / 2 + 10);
  underline(ctx, cx - uw, cx + uw, NAME_Y + 12, b.accent, { width: 6, seed: idx + 9, reveal: ease(age, 600 + idx * 200, 500) });
  const who = b.scripted ? 'scripted' : b.modelLabel;
  text(ctx, who, cx, NAME_Y + 38, fitFont(ctx, who, proseI, 20, 272), { align: 'center', alpha: a });

  // the hand: four places, filled as each card lands
  const lo = loadoutAt(sh, id, ms, LAND);
  const of = sh.offer;
  SLOTS.forEach((slot, i) => {
    const at = handSlot(idx, i);
    if (!lo[slot]) {
      const now = of && of.entrantId === id && of.slot === slot;
      emptySlot(ctx, at.x, at.y, now ? b.accent : INK, a * (now ? 0.9 : 0.28));
      return;
    }
    const p = sh.picks.find((q) => q.entrantId === id && q.slot === slot);
    const since = p && p.at != null ? ms - p.at - LAND : 9999;
    const settle = 1 - ease(since, 0, 280);
    ctx.save();
    ctx.translate(at.x, at.y); ctx.scale(1 + 0.05 * settle, 1 + 0.05 * settle); ctx.translate(-at.x, -at.y);
    pickCard(ctx, slot, lo[slot], at.x, at.y, HAND_CW, HAND_CH, { accent: b.accent, edge: b.accent, label: SLOT_LABEL[slot], alpha: a, rot: settle * 0.03 * facing });
    ctx.restore();
  });

  // the figure answers each pick with a small start, and breathes while it waits
  const fl = loadoutAt(sh, id, ms);
  const last = sh.picks.filter((p) => p.entrantId === id).slice(-1)[0];
  const pop = last && last.at != null ? 1 - prog(ms - last.at - FIGURE_SWAP_MS, 0, 320) : 0;
  if (fl.cls) {
    const at = figurePlace(fl, idx);
    ctx.save();
    ctx.translate(at.x, FIG_FLOOR);
    ctx.scale(1 + 0.05 * pop, 1 + 0.05 * pop);
    ctx.translate(-at.x, -FIG_FLOOR);
    const clsPick = sh.picks.find((p) => p.entrantId === id && p.slot === 'cls');
    const inkIn = clsPick && clsPick.at != null ? prog(ms - clsPick.at - FIGURE_SWAP_MS, 0, 420) : 1;
    figure(ctx, { loadout: fl, x: at.x, y: FIG_FLOOR, height: at.h, facing, pose: 'idle', t, accent: b.accent, alpha: a * inkIn });
    ctx.restore();
  }
}

// a font of `size`, stepped down until `str` fits `maxW`
function fitFont(ctx, str, font, size, maxW) {
  let s = size;
  ctx.save();
  for (; s > 15; s--) { ctx.font = font(s); if (ctx.measureText(str).width <= maxW) break; }
  ctx.restore();
  return font(s);
}

function temperHead(ctx, env) {
  const { sh, ms } = env;
  if (!sh.temper) return;
  const tAge = sh.temperAt != null ? ms - sh.temperAt : 99999;
  const big = 1 - prog(tAge, T.temperReveal - 1000, 600);
  if (big <= 0) return;
  // The reveal: the temper's art and name on a plate in the middle of the page. They arrive one
  // after the other while it is up (the phase's title band crosses it for the first 1.7 s), so it
  // never stands still for long.
  const tp = itemOf('temper', sh.temper);
  const pw = W - 640, ph = 392;
  const px = 320, py = Math.round((H - ph) / 2);
  ctx.save();
  ctx.globalAlpha = big;
  ctx.fillStyle = 'rgba(20,14,6,0.3)';
  ctx.fillRect(px + 8, py + 10, pw, ph);
  ctx.fillStyle = SHEET;
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
  const pop = ease(tAge, 1600, 1000);
  ctx.save();
  ctx.translate(W / 2, py + 156); ctx.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
  emblem(ctx, 'temper', sh.temper, 0, 0, 240, { alpha: pop });
  ctx.restore();
  const land = ease(tAge, 3600, 600);
  title(ctx, tp.name.toUpperCase(), W / 2, py + 338 - (1 - land) * 16, 64, { color: RED, spacing: 8, weight: 'bold', maxW: pw - 60, alpha: land });
  ctx.restore();
}

// "ASHBY PICKS A WEAPON" on its plate over the cards, the name underlined in its colour
function ask(ctx, b, slot, alpha, slideY) {
  if (alpha <= 0) return;
  const name = b.name.toUpperCase();
  const words = [name, ' PICKS A ', SLOT_LABEL[slot] || ''];
  let qs = 26;
  const sp = 1.6;
  const widths = (sz) => words.map((t) => measureSpaced(ctx, t, caps(sz, 'bold'), sp));
  while (qs > 16 && widths(qs).reduce((n, v) => n + v, 0) > 600) qs -= 1;
  const parts = widths(qs), total = parts[0] + parts[1] + parts[2] + 2 * sp;
  const pw = Math.round(total + 64), px = Math.round(W / 2 - pw / 2), py = ASK_Y + slideY;
  ctx.save();
  ctx.globalAlpha *= alpha;
  plate(ctx, px, py, pw, ASK_H);
  let qx = W / 2 - total / 2;
  const base = py + ASK_H / 2 + qs * 0.36;
  words.forEach((t, i) => {
    title(ctx, t, qx, base, qs, { align: 'left', color: INK, spacing: sp, weight: 'bold', font: caps });
    if (i === 0) { ctx.fillStyle = b.accent; ctx.fillRect(qx, base + 5, parts[0] - sp, 3.5); }
    qx += parts[i] + sp;
  });
  ctx.restore();
}

function table(ctx, env) {
  const { sh, ms } = env;
  const of = sh.offer;
  if (!of) return;
  const b = env.bot(of.entrantId);
  const idx = Math.max(0, sh.order.indexOf(of.entrantId));
  const oAge = ms - of.at;
  const pick = sh.picks.find((p) => p.entrantId === of.entrantId && p.slot === of.slot && (p.at == null || p.at >= of.at));
  const pAge = pick && pick.at != null ? ms - pick.at : -1;
  if (pAge > T.pickHold + 300 || (pick && pick.at == null)) return;

  // the plate says who is picking what; it drops in with the deal and lifts away as the card leaves
  const qIn = ease(oAge, 0, 300), qOut = pAge >= 0 ? prog(pAge, SLIDE_AT, 400) : 0;
  ask(ctx, b, of.slot, qIn * (1 - qOut), -(1 - qIn) * 14 - qOut * 10);

  // the cursor weighs the cards in turn while the model decides
  const thinking = pAge < 0 && oAge > T.pickDeal;
  const stepN = Math.floor(Math.max(0, oAge - T.pickDeal) / 700);
  const start = Math.floor(hashNoise(Math.round(of.at) % 9973, 1) * 3);
  const dir = hashNoise(Math.round(of.at) % 9973, 2) > 0.5 ? 1 : 2;
  const from = (start + stepN * dir) % 3, to = (start + (stepN + 1) * dir) % 3;
  const u = easeInOut(prog((oAge - T.pickDeal) % 700, 400, 300));
  const cursor = thinking ? lerp(from, to, u) : -9;

  const nameSize = tableNameSize(ctx, of.slot, of.options, PLATE_W);
  let flying = null;
  of.options.forEach((id, i) => {
    // each card is laid down in its own place: a short drop, a slight turn that settles
    const dealt = ease(oAge, i * 280, 460);
    if (dealt <= 0) return;
    const x = W / 2 + (i - 1) * PLATE_GAP;
    const y = PLATE_Y - (1 - dealt) * 34;
    const rot = (1 - dealt) * (i - 1) * 0.08 + (hashNoise(i + 3, Math.round(of.at) % 97) - 0.5) * 0.03;
    let alpha = dealt, lift = 0, chosen = 0, dy = 0;
    if (thinking) lift = clamp(1 - Math.abs(cursor - i) * 1.6, 0, 1);
    if (pAge >= 0) {
      if (id === pick.choice) { flying = { id, x, y, rot }; return; }
      alpha = lerp(1, 0.2, prog(pAge, 200, 400)) * (1 - prog(pAge, LAND - 200, 400));
      dy = prog(pAge, 200, 400) * 10;
    }
    const scale = 0.94 + 0.06 * dealt;
    ctx.save();
    ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-x, -y);
    pickCard(ctx, of.slot, id, x, y + dy, PLATE_W, PLATE_H, { accent: b.accent, lift, chosen, alpha, rot, nameSize });
    ctx.restore();
  });

  // the card taken: ringed in the taker's colour, held up a moment, then it slides to the hand
  if (flying && pAge < LAND) {
    const chosen = ease(pAge, 0, 260);
    const s = easeInOut(prog(pAge, SLIDE_AT, SLIDE_MS));
    const to = handSlot(idx, SLOTS.indexOf(of.slot));
    const k = lerp(1, HAND_CW / PLATE_W, s);
    const x = lerp(flying.x, to.x, s);
    const y = lerp(flying.y, to.y, s) - Math.sin(s * Math.PI) * 40;
    const rot = lerp(flying.rot, 0, s) + Math.sin(s * Math.PI) * 0.07 * (idx === 0 ? -1 : 1);
    ctx.save();
    ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y);
    pickCard(ctx, of.slot, flying.id, x, y, PLATE_W, PLATE_H, { accent: b.accent, lift: chosen * (1 - s), chosen, rot, nameSize });
    ctx.restore();
  }
}

export const choosingScene = {
  ground: 'paper',
  draw(ctx, env) {
    const { sh } = env;
    paperGround(ctx, 21);
    sh.order.forEach((id, i) => side(ctx, env, id, i));
    table(ctx, env);
    temperHead(ctx, env);
  },
};
