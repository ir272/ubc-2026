// Shared drawing kit for the show's scenes. Owner: lead. Browser only, deterministic:
// everything animates on times passed in, never on a clock read here.

import { INK, PAPER, PAPER_DARK, GREY, RED, paper, offscreen, line as inkLine, stroke as inkStroke, wrapText } from '../render/ink.js';
import { FONT, spaced, measureSpaced } from '../ui/letter.js';
import { brushBand, cached } from '../ui/ornament.js';
import { clamp, lerp, easeOutCubic, easeInOut, smoothstep } from '../core/math.js';
import { hashNoise } from '../core/rng.js';
import * as agentDraw from '../render/agent_draw.js';
import { CLASSES, WEAPONS, SPELLS, CHARMS, TEMPERS } from '../sim/loadout.js';

export { INK, PAPER, PAPER_DARK, GREY, RED, FONT, spaced, measureSpaced, clamp, lerp, easeOutCubic, easeInOut, smoothstep, hashNoise, wrapText, brushBand, inkLine, inkStroke };

export const W = 1280, H = 720;
export const NIGHT = '#0b0a09';
export const BLOOD = '#7a160f';
export const BLOOD_DEEP = '#4d0c08';
export const CREAM = '#efe8d4';
export const TABLES = { cls: CLASSES, weapon: WEAPONS, spell: SPELLS, charm: CHARMS, temper: TEMPERS };
export const SLOT_WORD = { cls: 'class', weapon: 'weapon', spell: 'spell', charm: 'charm' };
export const SLOTS = ['cls', 'weapon', 'spell', 'charm'];

// If an emblem throws, a plain ruled lozenge stands in so the scene still draws.
import * as items from '../render/items_draw.js';

export const itemOf = (kind, id) => (TABLES[kind] && TABLES[kind][id]) || { id, name: String(id || ''), effect: '' };

// 0..1 progress of `age` through [start, start + dur]
export const prog = (age, start, dur) => clamp((age - start) / dur, 0, 1);
export const ease = (age, start, dur) => easeOutCubic(prog(age, start, dur));

// ---- grounds --------------------------------------------------------------------------
export function paperGround(ctx, seed = 9) {
  ctx.drawImage(paper(W, H, { seed }), 0, 0, W, H);
}

export function nightGround(ctx) {
  const c = cached('ground:night', W, H, (g) => {
    g.fillStyle = NIGHT;
    g.fillRect(0, 0, W, H);
    // faint laid-paper lines, like the dark endpapers of a ledger
    g.globalAlpha = 0.05;
    g.strokeStyle = CREAM;
    g.lineWidth = 1;
    for (let y = 18; y < H; y += 18) { g.beginPath(); g.moveTo(0, y + hashNoise(3, y) * 2); g.lineTo(W, y + hashNoise(4, y) * 2); g.stroke(); }
    g.globalAlpha = 1;
    const v = g.createRadialGradient(W / 2, H * 0.45, 120, W / 2, H / 2, 820);
    v.addColorStop(0, 'rgba(60,52,40,0.22)');
    v.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  });
  ctx.drawImage(c, 0, 0, W, H);
}

export function bloodGround(ctx) {
  const c = cached('ground:blood', W, H, (g) => {
    g.fillStyle = BLOOD;
    g.fillRect(0, 0, W, H);
    // engraved hatching darkens toward the edges
    g.strokeStyle = BLOOD_DEEP;
    g.lineWidth = 1.4;
    for (let i = -H; i < W; i += 7) {
      const edge = Math.min(1, Math.abs(i + H / 2 - W / 2) / (W * 0.62));
      g.globalAlpha = 0.12 + 0.55 * edge * edge;
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke();
    }
    g.globalAlpha = 1;
    const v = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 800);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20,2,0,0.6)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  });
  ctx.drawImage(c, 0, 0, W, H);
}

// ---- lettering ------------------------------------------------------------------------
export const roman = (size, weight = '') => `${weight} ${size}px ${FONT.roman}`.trim();
export const caps = (size, weight = '') => `${weight} ${size}px ${FONT.caps}`.trim();
export const ital = (size) => `italic ${size}px ${FONT.caps}`;
export const numf = (size, weight = '') => `${weight} ${size}px ${FONT.num}`.trim();

// Spaced capitals that never run wider than maxW (the spacing gives first, then the size).
export function title(ctx, text, x, y, size, { color = INK, spacing = size * 0.16, align = 'center', maxW = 0, alpha = 1, font = roman, weight = '' } = {}) {
  let s = size, sp = spacing;
  if (maxW) {
    for (let i = 0; i < 28; i++) {
      const w = measureSpaced(ctx, text, font(s, weight), sp);
      if (w <= maxW) break;
      if (sp > s * 0.04) sp *= 0.8; else s *= 0.93;
    }
  }
  spaced(ctx, text, x, y, { font: font(s, weight), color, spacing: sp, align, alpha });
  return { size: s, spacing: sp, width: measureSpaced(ctx, text, font(s, weight), sp) };
}

export function text(ctx, str, x, y, font, { color = INK, align = 'left', alpha = 1, baseline = 'alphabetic' } = {}) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha *= alpha;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Wrapped paragraph, returns the height used.
export function para(ctx, str, x, y, maxW, font, lh, { color = INK, align = 'left', alpha = 1, maxLines = 4 } = {}) {
  ctx.save();
  ctx.font = font;
  const lines = wrapText(ctx, str, maxW).slice(0, maxLines);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha *= alpha;
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  ctx.restore();
  return lines.length * lh;
}

// Text revealed left to right as if written, with the pen's wet edge. reveal 0..1.
export function written(ctx, str, x, y, font, { color = INK, align = 'left', reveal = 1, spacing = 0 } = {}) {
  if (reveal <= 0) return 0;
  const w = measureSpaced(ctx, str, font, spacing);
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  if (reveal < 1) {
    ctx.beginPath();
    ctx.rect(x0 - 8, y - 400, (w + 16) * reveal, 800);
    ctx.clip();
  }
  spaced(ctx, str, x0, y, { font, color, spacing, align: 'left' });
  ctx.restore();
  return x0 + (w + 16) * reveal - 8; // the pen's x
}

// A ruled line with small diamond ends, the house divider.
export function rule(ctx, x0, x1, y, { color = INK, width = 1.5, alpha = 1, diamonds = true } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  if (diamonds) {
    for (const x of [x0, x1]) { ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
}

// A hand-drawn underline in an entrant's colour.
export function underline(ctx, x0, x1, y, color, { width = 5, seed = 1, reveal = 1, alpha = 1 } = {}) {
  if (reveal <= 0) return;
  const n = 14, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * reveal;
    pts.push([lerp(x0, x1, u), y + Math.sin(u * 5 + seed) * 1.6 + (hashNoise(seed, i) - 0.5) * 1.4]);
  }
  inkStroke(ctx, pts, { width, taper: 0.7, color, seed, alpha });
}

// ---- figures and emblems ---------------------------------------------------------------
// The fighter drawn large (portrait scenes). (x, y) is the floor point between the feet.
// An entrant's colour as ink would carry it: pulled a third of the way toward the page's black,
// so the sash sits in the engraving instead of on top of it.
export function inked(hex, k = 0.3) {
  const n = parseInt(String(hex || '#c4612f').slice(1), 16);
  const mix = (v, d) => Math.round(v + (d - v) * k).toString(16).padStart(2, '0');
  return `#${mix(n >> 16, 0x24)}${mix((n >> 8) & 255, 0x20)}${mix(n & 255, 0x1c)}`;
}

export function figure(ctx, { loadout, x, y, height = 360, facing = 1, pose = 'idle', t = 0, accent = '#c4612f', alpha = 1 }) {
  accent = inked(accent);
  ctx.save();
  ctx.globalAlpha *= alpha;
  let ok = false;
  if (agentDraw.drawFighterFigure) {
    try { agentDraw.drawFighterFigure(ctx, { loadout: loadout || {}, x, y, scale: height / 90, facing, pose, t, accent }); ok = true; } catch (e) { warnOnce('figure', e); }
  }
  if (!ok) standIn(ctx, x, y, height, facing, accent, !(loadout && loadout.cls));
  ctx.restore();
}

function standIn(ctx, x, y, h, facing, accent, unwritten) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const k = h / 90;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2 * Math.max(1, k * 0.5);
  ctx.beginPath();
  ctx.moveTo(-17 * k, 0); ctx.quadraticCurveTo(-21 * k, -44 * k, -9 * k, -68 * k);
  ctx.quadraticCurveTo(-12 * k, -86 * k, 1 * k, -90 * k); ctx.quadraticCurveTo(13 * k, -86 * k, 9 * k, -68 * k);
  ctx.quadraticCurveTo(19 * k, -40 * k, 15 * k, 0); ctx.closePath();
  if (unwritten) { ctx.setLineDash([7 * k * 0.5 + 3, 6]); ctx.stroke(); } else {
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(-12 * k, -66 * k, 22 * k, 5 * k);
  }
  ctx.restore();
}

const warned = new Set();
function warnOnce(key, e) { if (!warned.has(key)) { warned.add(key); console.warn(`[stage] ${key} drawing failed`, e); } }

// An engraved emblem for a class, weapon, spell, charm or temper, centred on (x, y).
export function emblem(ctx, kind, id, x, y, size, { ink = INK, accent = RED, alpha = 1 } = {}) {
  if (!id) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  let ok = false;
  if (items && items.drawItemIcon) {
    try { items.drawItemIcon(ctx, kind, id, x, y, size, { ink, accent }); ok = true; } catch (e) { warnOnce(`icon:${kind}:${id}`, e); }
  }
  if (!ok) {
    const r = size * 0.42;
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, size / 40);
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = `bold ${Math.round(size * 0.36)}px ${FONT.roman}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(itemOf(kind, id).name || '?').replace(/^The /, '').slice(0, 1), x, y + 1);
  }
  ctx.restore();
}

// A plate: the engraved card an item is offered on. Centred on (cx, cy), w x h.
// state: { lift 0..1, struck 0..1, chosen 0..1, alpha }
export function plate(ctx, kind, id, cx, cy, w, h, { accent = RED, lift = 0, struck = 0, chosen = 0, alpha = 1, rot = 0, seed = 1 } = {}) {
  const it = itemOf(kind, id);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy - lift * 10);
  ctx.rotate(rot);
  const k = 1 + lift * 0.04 + chosen * 0.05;
  ctx.scale(k, k);
  const x = -w / 2, y = -h / 2;
  // the sheet, its shadow and the double rule
  ctx.fillStyle = 'rgba(20,14,6,0.28)';
  ctx.fillRect(x + 5 + lift * 4, y + 7 + lift * 6, w, h);
  ctx.fillStyle = '#f1ead7';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.strokeRect(x + 1.2, y + 1.2, w - 2.4, h - 2.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
  // the emblem in its window
  const win = Math.min(w - 30, h * 0.5);
  emblem(ctx, kind, id, 0, y + 18 + win / 2, win, { accent });
  // name and effect
  const nameY = y + 18 + win + 30;
  title(ctx, it.name.replace(/^The /, '').toUpperCase(), 0, nameY, w * 0.118, { maxW: w - 44, spacing: w * 0.012, weight: 'bold' });
  rule(ctx, -w * 0.22, w * 0.22, nameY + 12, { width: 1, diamonds: false });
  para(ctx, it.effect || '', 0, nameY + 38, w - 30, `${Math.max(15, Math.round(w * 0.092))}px Baskerville, Palatino, Georgia, serif`, Math.max(18, w * 0.112), { align: 'center', color: INK, maxLines: 3 });
  if (chosen > 0) {
    ctx.globalAlpha *= chosen;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
  }
  ctx.restore();
  if (struck > 0) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const sgn = 1;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const u = (i / 8) * struck; pts.push([lerp(-w * 0.44, w * 0.44, u), sgn * lerp(h * 0.16, -h * 0.16, u) + Math.sin(u * 6 + seed) * 3]); }
    inkStroke(ctx, pts, { width: 10, taper: 0.55, color: INK, seed });
    ctx.restore();
  }
}

// ---- the prediction clock ----------------------------------------------------------------
// A candle burning down: the stage's way of saying bets are open and for how long. It draws
// no odds, no pools and no buttons. frac = share of the window left (1 -> 0).
export function candle(ctx, x, y, h, frac, t, { color = INK, flame = RED, wax = CREAM, lit = true } = {}) {
  const w = h * 0.2;
  const tall = h * (0.18 + 0.82 * clamp(frac, 0, 1));
  ctx.save();
  // holder
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w * 1.5, y); ctx.lineTo(x + w * 1.5, y); ctx.lineTo(x + w * 1.1, y - h * 0.06); ctx.lineTo(x - w * 1.1, y - h * 0.06); ctx.closePath(); ctx.fill();
  // wax
  ctx.fillStyle = wax;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(x - w / 2, y - h * 0.06 - tall, w, tall);
  ctx.fill(); ctx.stroke();
  // drips
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const dx = x - w / 2 + w * (0.2 + 0.3 * i);
    ctx.beginPath(); ctx.moveTo(dx, y - h * 0.06 - tall); ctx.lineTo(dx, y - h * 0.06 - tall + tall * (0.15 + 0.2 * hashNoise(7, i))); ctx.stroke();
  }
  const top = y - h * 0.06 - tall;
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + 1, top - h * 0.05); ctx.stroke();
  if (lit && frac > 0) {
    const fl = h * 0.16 * (0.9 + 0.12 * Math.sin(t / 90) + 0.06 * Math.sin(t / 37));
    const sway = Math.sin(t / 210) * w * 0.12;
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(x, top - h * 0.04);
    ctx.bezierCurveTo(x - w * 0.42, top - h * 0.07, x - w * 0.2 + sway, top - h * 0.05 - fl * 0.7, x + sway, top - h * 0.05 - fl);
    ctx.bezierCurveTo(x + w * 0.2 + sway, top - h * 0.05 - fl * 0.7, x + w * 0.42, top - h * 0.07, x, top - h * 0.04);
    ctx.fill();
    ctx.fillStyle = wax;
    ctx.beginPath(); ctx.ellipse(x + sway * 0.4, top - h * 0.05 - fl * 0.28, w * 0.1, fl * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    // snuffed: a thread of smoke
    ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x + 1, top - h * 0.05);
    ctx.bezierCurveTo(x + 8 + Math.sin(t / 300) * 4, top - h * 0.14, x - 8, top - h * 0.2, x + 4 + Math.sin(t / 400) * 5, top - h * 0.3); ctx.stroke();
  }
  ctx.restore();
}

// ---- the phase title call ------------------------------------------------------------------
export const PHASE_TITLES = { call: 'THE FIGHTERS', choosing: 'LOADOUTS', fight: 'FIGHT' };
export const TITLE_CALL_MS = 1700;

// A brush band crosses the screen carrying the phase's name. age in ms since the phase began.
export function titleCall(ctx, phase, age, { dark = false } = {}) {
  if (age < 0 || age > TITLE_CALL_MS) return;
  const word = PHASE_TITLES[phase];
  if (!word) return;
  const inn = ease(age, 0, 320);
  const out = easeInOut(prog(age, TITLE_CALL_MS - 420, 420));
  const band = dark ? CREAM : INK;
  const ink = dark ? INK : CREAM;
  ctx.save();
  // the band is brushed on from the left and wiped off to the right: ink, never a fading box
  if (out > 0) { ctx.beginPath(); ctx.rect(lerp(-60, W + 60, out), 0, W + 200, H); ctx.clip(); }
  brushBand(ctx, -40, W + 80, H / 2, 150, { color: band, seed: phase.length * 7 + 3, reveal: inn, streak: dark ? 'rgba(13,12,11,0.08)' : undefined });
  if (inn > 0.55) title(ctx, word, W / 2, H / 2 + 26, 76, { color: ink, spacing: 22, alpha: prog(age, 180, 220), maxW: W - 200 });
  ctx.restore();
}

// The prediction block: the one call to action, drawn the same way wherever a window is open
// (the tape, the walk-on before each try, the break between pairs): the title and a clock of
// the time left, centred in the block's height; when it shuts, the title turns red and the clock
// goes and the title is centred. `question`, `closedLine` and `soonLine` are accepted and not drawn.
//   state: 'open' | 'closed' | 'soon' (nothing yet); left/total in ms; since = ms since it closed
//   backing: a sheet of paper behind it, for when it sits over the fight
export function predictions(ctx, { x, y, w, h = 102, state = 'open', left = 0, total = 1, since = 9999, question = '', openTitle = 'PREDICTIONS OPEN', closedLine = '', soonLine = '', t = 0, backing = false, alpha = 1 }) {
  if (state !== 'open' && state !== 'closed') return;
  const k = h / 102;
  const cy = y + h / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (backing) {
    ctx.fillStyle = 'rgba(13,12,11,0.28)'; ctx.fillRect(x - 14, y - 4, w + 36, h + 20);
    ctx.fillStyle = '#f1ead7'; ctx.fillRect(x - 18, y - 10, w + 36, h + 20);
  }
  const open = state === 'open';
  // open: the title at the left, the clock at the right; closed: no clock, so the title is centred
  if (open) title(ctx, openTitle, x, cy + 11 * k, 30 * k, { align: 'left', spacing: 3 * k, weight: 'bold', maxW: w - 160 * k });
  else title(ctx, 'PREDICTIONS CLOSED', x + w / 2, cy + 11 * k, 30 * k, { color: RED, spacing: 3 * k, weight: 'bold', maxW: w });
  if (open) {
    const s = seconds(left);
    const pulse = left < 6000 ? 1 + 0.05 * Math.sin(t / 90) : 1;
    ctx.save();
    ctx.translate(x + w - 6 * k, cy + 22 * k); ctx.scale(pulse, pulse);
    text(ctx, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 0, 0, `bold ${Math.round(64 * k)}px Baskerville, "Big Caslon", Georgia, serif`, { color: left < 6000 ? RED : INK, align: 'right' });
    ctx.restore();
  }
  ctx.restore();
}

// "7 wins of 12" style form line.
export function recordLine(rec) {
  if (!rec || !rec.played) return 'first appearance';
  return `${rec.wins} ${rec.wins === 1 ? 'win' : 'wins'} of ${rec.played}`;
}

export function seconds(ms) { return Math.max(0, Math.ceil(ms / 1000)); }
export { offscreen, cached };
