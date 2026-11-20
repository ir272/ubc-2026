// 2. Character select and 3. stage select (both in phase 'select').
//
// The roster stands in tall ruled plates. Each bot has a bracket in its side tint ([ for side 0,
// ] for side 1) that drifts between plates while it thinks: a schedule made only from the bot id
// and the show clock, so it never gives the real pick away. At selectRevealMs both picks flip: the
// brackets go to the chosen plates, those plates re-ink in the side tint and their figures step
// forward, the rest drop back. About 2 s later the stage select takes over: a grid of the stages'
// thumbnails in ruled frames, a gold frame that hops across them, slows, and lands on ctx.stage
// about 2 s before the phase ends, with the stage's name written under it.

import type { InkFrame } from '../api.ts';
import { W } from '../api.ts';
import type { FighterId, Side } from '../../sim/types.ts';
import { TIMING } from '../../show/events.ts';
import { ell, h01, smooth, type Pen, type Pt } from '../pen.ts';
import {
  C, NEUTRAL_TINT, boundsAt, devK, draw, figBounds, fitSize, lerp, newInk, out, pageFrame, ruledBox, span, stand, strHash, text, textW, tintOf,
} from './kit.ts';
import { drawTitle } from './call.ts';
import { stageName, stagesOnOffer, thumb, type Env } from './env.ts';
import type { Bounds } from './kit.ts';

const TOP = 150;
const Y1 = 548;
const FEET = Y1 - 80;
/** the stage select starts this long after the flip */
export const STAGE_AFTER_FLIP = 2000;
/** the draw lands this long before the phase ends (the fallback without strikes) */
const LAND_BEFORE_END = 2000;
/** the last strike lands this long before the phase ends */
const LAST_STRIKE_BEFORE_END = 3000;
/** the first strike, after the grid has drawn in */
const FIRST_STRIKE = 1500;

function plates(n: number): { x0: number; x1: number }[] {
  const pw = n <= 2 ? 290 : n === 3 ? 250 : n === 4 ? 220 : n === 5 ? 190 : 164;
  const gap = n <= 2 ? 110 : n === 3 ? 64 : n === 4 ? 40 : n === 5 ? 30 : 26;
  const total = n * pw + (n - 1) * gap;
  const left = (W - total) / 2;
  return Array.from({ length: n }, (_, i) => ({ x0: left + i * (pw + gap), x1: left + i * (pw + gap) + pw }));
}

/** the step forward at the flip */
const STEP = 1.08;
/** clear paper between a figure's drawn edge and its plate's rules */
const MARGIN = 13;

/** One scale for the whole roster, so heights compare truly: the largest at which every figure's
 *  drawn bounds (stepped forward) fit its plate with a margin. */
function figScale(f: InkFrame, ids: FighterId[], pw: number): number {
  let s = 1.25;
  for (const id of ids) {
    const b = figBounds(f, id);
    s = Math.min(s, (pw - 2 * MARGIN) / ((b.x1 - b.x0) * STEP), (FEET - TOP - 30) / ((-b.y0) * STEP));
  }
  return s;
}

/** feet x so the figure's drawn bounds are centred on cx */
function feetFor(b: Bounds, s: number, facing: 1 | -1, cx: number): number {
  const a = boundsAt(b, s, facing);
  return cx - (a.x0 + a.x1) / 2;
}

/** One size for every name; a name too long for the plate breaks onto two lines at a space. */
function nameLayout(g: CanvasRenderingContext2D, names: string[], maxW: number): { size: number; lines: string[][] } {
  const base = 22;
  const lines = names.map((nm) => {
    if (textW(g, nm, base, 600) <= maxW) return [nm];
    const words = nm.split(' ');
    if (words.length < 2) return [nm];
    let best: string[] = [nm];
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const w = Math.max(textW(g, a, base, 600), textW(g, b, base, 600));
      if (w < bestW) { bestW = w; best = [a, b]; }
    }
    return best;
  });
  let size = base;
  for (const ls of lines) for (const l of ls) size = Math.min(size, Math.floor((base * maxW) / Math.max(1, textW(g, l, base, 600))));
  return { size: Math.max(12, size), lines };
}

/** where a bot's bracket is (a fractional plate index) while it thinks: from its id and the clock */
export function drift(seed: number, n: number, ms: number): number {
  if (n <= 1) return 0;
  let cur = Math.floor(h01(seed) * n) % n;
  let t = 700 + h01(seed + 1) * 900;
  for (let k = 0; k < 400; k++) {
    if (ms < t) return cur;
    const nxt = (cur + 1 + Math.floor(h01(seed + k * 3 + 7) * (n - 1))) % n;
    const mv = 340 + Math.abs(nxt - cur) * 70;
    if (ms < t + mv) return lerp(cur, nxt, out((ms - t) / mv));
    cur = nxt;
    t += mv + 650 + h01(seed + k * 5 + 11) * 1500;
  }
  return cur;
}

function bracket(ink: Pen, x: number, Y0: number, side: Side, tint: string, p: number, seed: number): void {
  bracketAt(ink, x, Y0 - 18, Y1 + 18, side, tint, p, seed);
}

/** a bot's marker: [ for side 0, ] for side 1, from top to bot at x */
function bracketAt(ink: Pen, x: number, top: number, bot: number, side: Side, tint: string, p: number, seed: number): void {
  const dir = side === 0 ? 1 : -1;
  const foot = 15;
  const path: Pt[] = [[x + dir * foot, top + 1], [x, top], [x - dir * 0.6, (top + bot) / 2], [x, bot], [x + dir * foot, bot - 1]];
  draw(ink, path, out(p), { w: 3.2, seed, taper: 0.35, tint, wobble: 0.7 });
}

/** the bots' names along the bottom, each in its tint, model label dim beside; fighter under after the flip */
export function botRow(f: InkFrame, ms: number, pickU: number): void {
  const ctx = f.show.ctx;
  if (!ctx) return;
  const g = f.g;
  for (const side of [0, 1] as Side[]) {
    const bot = ctx.bots[side];
    if (!bot) continue;
    const left = side === 0;
    const x = left ? 70 : W - 70;
    const al: CanvasTextAlign = left ? 'left' : 'right';
    const bw = textW(g, bot.name, 30, 650);
    text(g, bot.name, x, 634, { size: 30, weight: 650, color: tintOf(f, side), align: al }, span(ms, 300 + side * 120, 450));
    if (bot.modelLabel) text(g, bot.modelLabel, left ? x + bw + 12 : x - bw - 12, 634, { size: 18, weight: 400, color: C.dim, align: al }, span(ms, 550 + side * 120, 450));
    const pick = ctx.picks?.[side];
    if (pick && pickU > 0) text(g, f.fighterDefs[pick]?.name ?? pick, x, 664, { size: 19, weight: 500, color: C.soft, align: al }, pickU);
  }
}

function paperWash(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number): void {
  if (a <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, a);
  g.fillStyle = C.paper;
  g.fillRect(x, y, w, h);
  g.restore();
}

function drawRoster(f: InkFrame, e: Env, ms: number, R: number, revealed: boolean): void {
  const ctx = f.show.ctx!;
  const g = f.g;
  const ink = newInk(g);
  const roster = ctx.roster.slice(0, 6);
  const n = roster.length;
  if (!n) return;
  const P = plates(n);
  const tf = revealed ? Math.max(0, ms - R) : -1;
  const u = tf >= 0 ? out(tf / 480) : 0;
  const picks = revealed ? ctx.picks : undefined;
  const chosenBy = (i: number): Side[] => (picks ? ([0, 1] as Side[]).filter((s) => picks[s] === roster[i]!.id) : []);
  const k = devK(g);
  const pw0 = P[0]!.x1 - P[0]!.x0;
  const scale = figScale(f, roster.map((c) => c.id), pw0);
  // the plates are as tall as the tallest figure needs, within limits
  const maxH = Math.max(...roster.map((c) => -figBounds(f, c.id).y0 * scale * STEP));
  const Y0 = Math.max(TOP, Math.min(300, FEET - maxH - 44));
  // the row of plates sits midway between the title and the bots' names
  g.save();
  g.translate(0, Math.max(0, (130 + 596) / 2 - (Y0 + Y1) / 2));
  const names = nameLayout(g, roster.map((c) => c.name), pw0 - 22);

  roster.forEach((card, i) => {
    const { x0, x1 } = P[i]!;
    const pw = x1 - x0;
    const cx = (x0 + x1) / 2;
    const facing: 1 | -1 = i < n / 2 ? 1 : -1;
    // centred on what it draws, not on its feet (wide bodies, tails and staffs are off the feet)
    const bnd = figBounds(f, card.id);
    const fx = feetFor(bnd, scale, facing, cx);
    const by = chosenBy(i);
    const t0 = 80 + i * 70;
    ruledBox(ink, g, x0, Y0, x1, Y1, span(ms, t0, 620), { seed: 400 + i * 10, w: 1.7 });
    draw(ink, [[x0 + 16, FEET + 1], [x1 - 16, FEET]], out(span(ms, t0 + 250, 500)), { w: 1.4, seed: 480 + i, taper: 0.7, alpha: 0.7 });
    const sh = out(span(ms, t0 + 350, 400));
    if (sh > 0) ink.hatch(ell(cx, FEET + 6, Math.min(pw * 0.36, 70) * sh, 7, 0, 20), { angle: 0.5, gap: 4, w: 0.9, alpha: 0.4, seed: 490 + i, free: true });
    // the figure: a cached still while it waits, drawn live once chosen (it steps forward)
    const s = scale;
    const sb = boundsAt(bnd, s, facing);
    const hh = -sb.y0;
    const rev = out(span(ms, t0 + 220, 520));
    if (rev > 0) {
      g.save();
      g.beginPath();
      g.rect(x0 + 2, Math.max(Y0 + 2, FEET + 14 - (hh * STEP + 30) * rev), pw - 4, Y1 - Y0);
      g.clip();
      if (by.length && u > 0) {
        const s2 = s * (1 + (STEP - 1) * u);
        stand(f, g, card.id, by[0]!, feetFor(bnd, s2, facing, cx), FEET + 10 * u, s2, facing, tf / 1000);
      } else {
        const sp = e.figs.get(`fig|${card.id}|${s.toFixed(3)}|${facing}|${f.mode}`, k, sb.x0 - 8, sb.y0 - 8, sb.x1 - sb.x0 + 16, sb.y1 - sb.y0 + 16, (cg) => stand(f, cg, card.id, 0, 0, 0, s, facing, 0, NEUTRAL_TINT));
        if (sp) e.figs.blit(g, sp, fx, FEET);
      }
      g.restore();
    }
    // the name
    const size = names.size;
    const ls = names.lines[i]!;
    ls.forEach((line, j) => {
      const y = Y1 - 24 - (ls.length - 1 - j) * size * 1.08;
      text(g, line, cx, y, { size, weight: 600, align: 'center' }, span(ms, t0 + 380 + j * 120, 450));
      if (by.length === 1 && u > 0) text(g, line, cx, y, { size, weight: 600, align: 'center', color: tintOf(f, by[0]!), alpha: u });
    });
    // the chosen plate re-inks in the side tint (both tints when both bots chose it)
    if (by.length && tf >= 0) {
      const a = tintOf(f, by[0]!), b = tintOf(f, by[by.length - 1]!);
      ruledBox(ink, g, x0, Y0, x1, Y1, span(tf, 60, 520), { seed: 440 + i * 10, w: 2.6, tints: [a, b, b, a] });
    }
  });
  // the others drop back
  if (picks && u > 0) {
    roster.forEach((_, i) => {
      if (chosenBy(i).length) return;
      const { x0, x1 } = P[i]!;
      paperWash(g, x0 - 12, Y0 - 12, x1 - x0 + 24, Y1 - Y0 + 24, 0.64 * u);
    });
  }
  // the brackets
  for (const side of [0, 1] as Side[]) {
    const bot = ctx.bots[side];
    if (!bot) continue;
    const seed = strHash(`${bot.id}|${ctx.matchNo}|${side}`);
    let pos = drift(seed, n, Math.min(ms, R));
    if (picks && tf >= 0) {
      const target = roster.findIndex((c) => c.id === picks[side]);
      if (target >= 0) pos = lerp(pos, target, out(tf / 450));
    }
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(pos)));
    const i1 = Math.min(n - 1, i0 + 1);
    const fr = pos - i0;
    const xAt = (i: number) => (side === 0 ? P[i]!.x0 - 10 : P[i]!.x1 + 10);
    const x = lerp(xAt(i0), xAt(i1), fr);
    bracket(ink, x, Y0, side, tintOf(f, side), span(ms, 1000 + side * 160, 520), 600 + side);
  }
  g.restore();
}

interface Hop { t: number; i: number }

/** the hops of the drawn frame, oldest first: slows down and lands on `chosen` at `land` */
function hops(n: number, chosen: number, start: number, land: number): Hop[] {
  const outp: Hop[] = [{ t: land, i: chosen }];
  let t = land;
  for (let k = 1; k < 80; k++) {
    t -= 72 + 500 * Math.exp(-0.42 * (k - 1));
    if (t < start) break;
    outp.push({ t, i: (((chosen - k) % n) + n) % n });
  }
  return outp.reverse();
}

function grid(n: number): { x: number; y: number; w: number; h: number }[] {
  const cols = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const gapX = 40, gapY = 66;
  const tw = Math.min(n === 4 ? 272 : 286, (1040 - (cols - 1) * gapX) / cols);
  const th = (tw * 9) / 16;
  const totalH = rows * th + (rows - 1) * gapY;
  const top = 138 + Math.max(0, (400 - totalH) / 2);
  const outp: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const rowW = inRow * tw + (inRow - 1) * gapX;
    const c = i - r * cols;
    outp.push({ x: (W - rowW) / 2 + c * (tw + gapX), y: top + r * (th + gapY), w: tw, h: th });
  }
  return outp;
}

function drawStages(f: InkFrame, e: Env, sms: number, landAt: number): void {
  const ctx = f.show.ctx!;
  const g = f.g;
  const ink = newInk(g);
  const ids = stagesOnOffer(f);
  const chosen = ids.indexOf(ctx.stage ?? '');
  if (chosen < 0) return;
  const n = ids.length;
  const B = grid(n);
  const landed = sms >= landAt;
  const lu = landed ? out((sms - landAt) / 480) : 0;
  ids.forEach((id, i) => {
    const b = B[i]!;
    const t0 = 60 + i * 60;
    thumb(f, e, id, b.x, b.y, b.w, b.h, out(span(sms, t0 + 180, 420)));
    ruledBox(ink, g, b.x, b.y, b.x + b.w, b.y + b.h, span(sms, t0, 520), { seed: 700 + i * 10, w: 1.5, over: 8 });
    if (landed && i !== chosen) paperWash(g, b.x - 10, b.y - 10, b.w + 20, b.h + 20, 0.62 * lu);
  });
  // the hopping frame
  const H = hops(n, chosen, Math.min(700, landAt - 600), landAt);
  let k = -1;
  for (let j = 0; j < H.length; j++) if (H[j]!.t <= sms) k = j;
  if (k >= 0) {
    const cur = H[k]!;
    const prev = H[Math.max(0, k - 1)]!;
    const m = k === 0 ? 1 : out((sms - cur.t) / 90);
    const a = B[prev.i]!, b = B[cur.i]!;
    const x = lerp(a.x, b.x, m), y = lerp(a.y, b.y, m), w = lerp(a.w, b.w, m), h = lerp(a.h, b.h, m);
    const pad = 9;
    const p0 = span(sms, H[0]!.t, 160);
    ruledBox(ink, g, x - pad, y - pad, x + w + pad, y + h + pad, p0, { seed: 760 + (landed ? 0 : cur.i), w: 2.6, over: 13, tint: C.gold });
    if (landed) {
      ruledBox(ink, g, x - pad - 6, y - pad - 6, x + w + pad + 6, y + h + pad + 6, lu, { seed: 780, w: 1.1, over: 6, tint: C.gold, alpha: 0.85 });
      const name = stageName(e, ids[chosen]!);
      if (name) {
        const size = fitSize(g, name, 28, 650, w + 80);
        text(g, name, x + w / 2, y + h + 44, { size, weight: 650, align: 'center' }, span(sms, landAt + 80, 520));
      }
    }
  }
}

type Box = { x: number; y: number; w: number; h: number };

/** two pen strokes crossing the thumbnail out, drawing themselves from t = 0 */
function crossOut(ink: Pen, b: Box, tint: string, t: number, seed: number): void {
  if (t <= 0) return;
  const ix = b.w * 0.1, iy = b.h * 0.12, mx = b.x + b.w / 2, my = b.y + b.h / 2;
  const s1 = smooth([[b.x + ix, b.y + iy], [mx + 5, my - 4], [b.x + b.w - ix * 0.8, b.y + b.h - iy * 1.1]], 6);
  const s2 = smooth([[b.x + b.w - ix * 1.15, b.y + iy * 0.8], [mx - 4, my - 2], [b.x + ix * 1.25, b.y + b.h - iy * 0.9]], 6);
  draw(ink, s1, out(t / 260), { w: 4.4, tint, seed, taper: 0.55, wobble: 1.2 });
  draw(ink, s2, out((t - 210) / 260), { w: 4.4, tint, seed: seed + 1, taper: 0.55, wobble: 1.2 });
}

/** the survivor: a gold frame, a second rule round it, its name written under */
function survivor(f: InkFrame, e: Env, ink: Pen, b: Box, id: string, u: number, t: number): void {
  const g = f.g;
  const pad = 9;
  ruledBox(ink, g, b.x - pad, b.y - pad, b.x + b.w + pad, b.y + b.h + pad, u, { seed: 760, w: 2.6, over: 13, tint: C.gold });
  ruledBox(ink, g, b.x - pad - 6, b.y - pad - 6, b.x + b.w + pad + 6, b.y + b.h + pad + 6, span(t, 200, 500), { seed: 780, w: 1.1, over: 6, tint: C.gold, alpha: 0.85 });
  const name = stageName(e, id);
  if (name) text(g, name, b.x + b.w / 2, b.y + b.h + 44, { size: fitSize(g, name, 28, 650, b.w + 80), weight: 650, align: 'center' }, span(t, 280, 520));
}

/**
 * The strike: the bots cross stages out in turn (ctx.strikes), evenly spaced from FIRST_STRIKE to
 * `last`. For each strike the striker's bracket leaves its post beside the grid, closes on the
 * thumbnail, inks a cross over it in its tint and goes back; the thumbnail drops back. Then the
 * survivor gets the gold frame and its name. All from sms.
 */
function drawStrikes(f: InkFrame, e: Env, sms: number, last: number): void {
  const ctx = f.show.ctx!;
  const g = f.g;
  const ink = newInk(g);
  const ids = stagesOnOffer(f);
  const strikes = (ctx.strikes ?? []).filter((s) => ids.includes(s.stage));
  const n = ids.length;
  const B = grid(n);
  const k = strikes.length;
  const lastAt = Math.max(FIRST_STRIKE, last);
  const step = k > 1 ? (lastAt - FIRST_STRIKE) / (k - 1) : 0;
  const tAt = (i: number) => FIRST_STRIKE + i * step;
  const lead = Math.max(250, Math.min(950, step * 0.4 || 950));
  const survT = (k ? tAt(k - 1) : FIRST_STRIKE) + 900;
  const sv = Math.max(0, ids.indexOf(ctx.stage ?? ''));
  const su = sms >= survT ? out((sms - survT) / 520) : 0;

  ids.forEach((id, i) => {
    const b = B[i]!;
    const t0 = 60 + i * 60;
    thumb(f, e, id, b.x, b.y, b.w, b.h, out(span(sms, t0 + 180, 420)));
    ruledBox(ink, g, b.x, b.y, b.x + b.w, b.y + b.h, span(sms, t0, 520), { seed: 700 + i * 10, w: 1.5, over: 8 });
  });
  // struck thumbnails drop back, then the crosses go over them
  strikes.forEach((st, i) => {
    const b = B[ids.indexOf(st.stage)]!;
    const t = sms - tAt(i);
    if (t > 250) paperWash(g, b.x - 10, b.y - 10, b.w + 20, b.h + 20, 0.6 * out((t - 250) / 420));
  });
  strikes.forEach((st, i) => crossOut(ink, B[ids.indexOf(st.stage)]!, tintOf(f, st.by), sms - tAt(i), 820 + i * 4));
  // the survivor; the struck ones fade further
  if (su > 0) {
    ids.forEach((_, i) => {
      if (i === sv) return;
      const b = B[i]!;
      paperWash(g, b.x - 12, b.y - 12, b.w + 24, b.h + 24, 0.45 * su);
    });
    survivor(f, e, ink, B[sv]!, ids[sv]!, su, sms - survT);
  }

  // the brackets: each bot keeps a post beside the grid and goes out to strike
  const gx0 = Math.min(...B.map((b) => b.x)), gx1 = Math.max(...B.map((b) => b.x + b.w));
  const gy0 = Math.min(...B.map((b) => b.y)), gy1 = Math.max(...B.map((b) => b.y + b.h));
  for (const side of [0, 1] as Side[]) {
    const post: [number, number, number] = [side === 0 ? gx0 - 30 : gx1 + 30, gy0 - 14, gy1 + 14];
    let r = post;
    let turn = -1;
    strikes.forEach((st, i) => {
      if (st.by !== side || sms < tAt(i) - lead) return;
      turn = i;
    });
    if (turn >= 0) {
      const b = B[ids.indexOf(strikes[turn]!.stage)]!;
      const at: [number, number, number] = [side === 0 ? b.x - 12 : b.x + b.w + 12, b.y - 12, b.y + b.h + 12];
      const t = sms - tAt(turn);
      const m = t < 600 ? out((t + lead) / Math.min(450, lead)) : 1 - out((t - 600) / 450);
      r = [lerp(post[0], at[0], m), lerp(post[1], at[1], m), lerp(post[2], at[2], m)];
      // its name beside the grid while it is its turn
      const bot = ctx.bots[side];
      if (bot && t < 1100) {
        const nx = side === 0 ? gx0 - 46 : gx1 + 46;
        const maxW = side === 0 ? gx0 - 46 - 42 : W - 42 - nx;
        const a = t < 800 ? 1 : 1 - out((t - 800) / 300);
        text(g, bot.name, nx, (gy0 + gy1) / 2 + 8, { size: fitSize(g, bot.name, 22, 650, maxW), weight: 650, color: tintOf(f, side), align: side === 0 ? 'right' : 'left', alpha: a }, out((t + lead) / 300));
      }
    }
    bracketAt(ink, r[0], r[1], r[2], side, tintOf(f, side), span(sms, 500 + side * 150, 520), 860 + side);
  }
}

export function drawSelect(f: InkFrame, e: Env): void {
  const ctx = f.show.ctx;
  if (!ctx) return;
  const g = f.g;
  const ms = f.show.phaseMs;
  const R = f.show.selectRevealMs > 0 ? f.show.selectRevealMs : TIMING.selectReveal;
  const dur = f.show.phaseDurationMs > 0 ? f.show.phaseDurationMs : TIMING.select;
  // the flip is drawn from R on; picks that arrive late flip at once, early ones wait for R. The
  // fighters hold about 2 s after the flip, then the stage select (strikes) takes over.
  const revealed = !!(f.show.picksRevealed && ctx.picks) && ms >= R;
  const flipAt = R;
  const stageStart = flipAt + STAGE_AFTER_FLIP;
  const ids = stagesOnOffer(f);
  const withStage = revealed && !!ctx.stage && ids.includes(ctx.stage) && ms >= stageStart;
  const ink = newInk(g);

  const fade = withStage ? out((ms - stageStart) / 320) : 0;
  if (fade < 1) {
    drawTitle(f, 'Fighters', ms, 200);
    drawRoster(f, e, ms, flipAt, revealed);
    paperWash(g, 0, 0, W, 600, fade);
  }
  if (withStage) {
    const sms = ms - stageStart - 200;
    if (sms > 0) {
      drawTitle(f, 'Stage', sms, 0);
      if (ctx.strikes && ctx.strikes.length) drawStrikes(f, e, sms, dur - LAST_STRIKE_BEFORE_END - stageStart - 200);
      else drawStages(f, e, sms, Math.max(900, dur - LAND_BEFORE_END - stageStart - 200));
    }
  }
  pageFrame(ink, g, 1);
  botRow(f, 1e9, revealed ? span(ms, flipAt + 300, 450) : 0);
}
