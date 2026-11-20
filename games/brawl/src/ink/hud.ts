// The fight HUD, option A "corner plates" (the owner's pick from lab/hud, captures/lead/hud/a.png).
// Per side, in a bottom corner: a ruled plate whose rules run past the corners and cross; a ringed
// portrait (tick ring in the side tint); the fighter name, the bot name and the model label in
// Shantell Sans; the damage percent as a pen-drawn numeral that heats from cream to red, grows
// heavier, doubles its strokes, tilts and trembles as the damage climbs (fully hot about 150%);
// candles for lives standing on the plate like a mantel (lit with a gold flame, or snuffed with a
// curl of smoke). The fight clock sits top centre over a gold rule with a diamond.
//
// Cost: everything that does not change from frame to frame (plate, portrait, names, candles, the
// clock face) is drawn once into an offscreen canvas per piece and blitted. Only the motion (count
// up, kick, tremble, the snuffing candle) is drawn live.

import type { CharacterDef, InkFrame, InkModule, Joints } from './api.ts';
import { W } from './api.ts';
import type { FighterDef, FighterId, Side } from '../sim/types.ts';
import { ell, h01, INK, makeInk, noise, smooth, TINTS, type InkMode, type Pen, type Pt } from './pen.ts';
import { INK_FONT, inkFontVersion } from './font.ts';
import { drawFigure, extraFor, standState } from './figures.ts';
import { pose } from './pose.ts';

/** the old serif stack (the pose sheet and the screens still use it) */
export const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

// ---- colours (lab/hud/kit.js) ----
const C = { ink: INK, soft: '#d7d5cf', dim: '#959389', gold: '#c5a559', red: '#c4604a', heat: '#d39a7c' };

// ---- layout (1280x720 units) ----
const PW = 456;
const Y0 = 618;
const Y1 = 696;
const RING = 38;
const NUM_H = 54;
const CANDLE_S = 1.15;
/** the box each side's plate cache covers */
const PLATE_BOX = { y: 556, h: 164, pad: 16 };
/** the box the numeral cache covers, around the numeral's centre and baseline */
const NUM_BOX = { w: 230, h: 104, cx: 115, base: 80 };
const CLOCK_BOX = { x: W / 2 - 110, y: 8, w: 220, h: 70 };

const ARENA_PHASES = new Set(['predictions', 'fight', 'break', 'verdict']);
const COUNT_MS = 250;
const KICK_MS = 260;
const SNUFF_MS = 1000;

// ---- the danger scale ----
const danger = (dmg: number): number => Math.max(0, Math.min(1, (dmg - 15) / 135));
const hex = (h: string): number[] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function lerpC(a: string, b: string, t: number): string {
  const A = hex(a), B = hex(b);
  return 'rgb(' + A.map((v, i) => Math.round(v + (B[i]! - v) * t)).join(',') + ')';
}
/** cream, then the coral pencil, then the red pencil */
function dangerColor(t: number): string {
  if (t < 0.25) return C.ink;
  if (t < 0.65) return lerpC(C.ink, C.heat, (t - 0.25) / 0.4);
  return lerpC(C.heat, C.red, (t - 0.65) / 0.35);
}
const easeOut = (p: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);

// ---- the numerals: single pen lines in a unit box (height 1, y down) ----
interface Stroke { p: Pt[]; closed?: boolean }
interface Glyph { w: number; s?: Stroke[]; dots?: Pt[] }
const S = (pts: Pt[]): Stroke => ({ p: smooth(pts, 8) });
const R = (pts: Pt[]): Stroke => ({ p: pts });
const O = (cx: number, cy: number, rx: number, ry: number): Stroke => ({ p: ell(cx, cy, rx, ry, 0, 26), closed: true });
const GLYPH: Record<string, Glyph> = {
  '0': { w: 0.56, s: [O(0.28, 0.5, 0.27, 0.5)] },
  '1': { w: 0.34, s: [R([[0.02, 0.22], [0.24, 0.02], [0.24, 1]])] },
  '2': { w: 0.56, s: [S([[0.03, 0.24], [0.12, 0.06], [0.3, 0], [0.48, 0.08], [0.52, 0.28], [0.4, 0.52], [0.02, 0.98]]), R([[0.02, 0.98], [0.56, 0.96]])] },
  '3': { w: 0.54, s: [S([[0.04, 0.1], [0.26, 0], [0.48, 0.1], [0.48, 0.32], [0.22, 0.46]]), S([[0.22, 0.46], [0.5, 0.56], [0.54, 0.8], [0.32, 1], [0.02, 0.92]])] },
  '4': { w: 0.6, s: [R([[0.42, 1], [0.42, 0], [0.0, 0.68], [0.6, 0.68]])] },
  '5': { w: 0.56, s: [R([[0.5, 0.01], [0.1, 0.01], [0.06, 0.44]]), S([[0.06, 0.44], [0.28, 0.36], [0.5, 0.46], [0.54, 0.74], [0.34, 0.98], [0.04, 0.92]])] },
  '6': { w: 0.55, s: [S([[0.48, 0.03], [0.22, 0.12], [0.05, 0.46], [0.06, 0.82], [0.28, 1], [0.5, 0.84], [0.5, 0.6], [0.28, 0.46], [0.06, 0.6]])] },
  '7': { w: 0.56, s: [R([[0.0, 0.01], [0.56, 0.01], [0.2, 1]])] },
  '8': { w: 0.56, s: [O(0.28, 0.24, 0.2, 0.23), O(0.28, 0.72, 0.26, 0.27)] },
  '9': { w: 0.56, s: [S([[0.5, 0.36], [0.28, 0.52], [0.06, 0.4], [0.06, 0.14], [0.28, 0], [0.5, 0.14], [0.5, 0.5], [0.4, 0.84], [0.1, 0.98]])] },
  '%': { w: 0.66, s: [R([[0.06, 0.98], [0.6, 0.02]]), O(0.13, 0.18, 0.11, 0.16), O(0.53, 0.82, 0.11, 0.16)] },
  ':': { w: 0.18, dots: [[0.09, 0.32], [0.09, 0.84]] },
};
function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(d / step));
    for (let j = 1; j <= k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  return out;
}
interface NumOpts { align?: 'left' | 'right' | 'center'; t?: number; color?: string; seed?: number; w?: number }
const PCT = 0.6;
const GAP = 0.13;
function numWidth(str: string, h: number): number {
  let w = 0;
  for (const ch of str) {
    const g = GLYPH[ch];
    if (g) w += g.w * h * (ch === '%' ? PCT : 1) + GAP * h;
  }
  return Math.max(0, w - GAP * h);
}
/** a number drawn with the pen; y is the baseline (lab/hud/kit.js drawNum) */
function drawNum(ink: Pen, str: string, x: number, y: number, h: number, o: NumOpts = {}): number {
  const t = o.t ?? 0, gap = GAP * h, seed0 = o.seed ?? 11;
  const total = numWidth(str, h);
  let gx = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
  const col = o.color ?? dangerColor(t);
  const w = o.w ?? h * (0.11 + 0.06 * t);
  const wob = (0.35 + 2.6 * t * t) * (h / 60);
  const tremor = h * 0.034 * Math.pow(t, 1.6);
  let i = 0;
  for (const ch of str) {
    const g = GLYPH[ch];
    if (!g) continue;
    const gh = h * (ch === '%' ? PCT : 1), gw = g.w * gh;
    const sd = seed0 * 31 + i * 7;
    const rot = (h01(sd) - 0.5) * 0.05 + (h01(sd + 1) - 0.5) * 0.3 * t * t;
    const dy = (h01(sd + 2) - 0.5) * h * 0.1 * t;
    const cx = gx + gw / 2, cy = y - gh / 2 + dy;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const T = (p: Pt): Pt => {
      const lx = (p[0] - g.w / 2) * gh, ly = (p[1] - 0.5) * gh;
      return [cx + lx * cr - ly * sr, cy + lx * sr + ly * cr];
    };
    if (g.dots) {
      for (const d of g.dots) {
        const P = T(d);
        ink.dot(P[0], P[1], w * 0.75, { tint: col, free: true });
      }
    } else {
      g.s!.forEach((st, k) => {
        let P = resample(st.p.map(T), 2.2);
        const tr = ch === '%' ? tremor * 0.4 : tremor;
        if (tr > 0.05) P = P.map((p, j): Pt => [p[0] + noise(sd + k * 5, j / 2.2) * tr, p[1] + noise(sd + k * 5 + 3, j / 2.2) * tr]);
        ink.line(P, { w, tint: col, seed: sd + k, taper: 0.3, wobble: wob, closed: st.closed });
        if (t > 0.5) ink.line(P.map((p): Pt => [p[0] + 0.9, p[1] + 0.7]), { w: w * 0.55, tint: col, seed: sd + k + 50, taper: 0.5, wobble: wob * 1.4, closed: st.closed, alpha: 0.85 });
      });
    }
    gx += gw + gap;
    i++;
  }
  return total;
}

// ---- drawn pieces ----
/** the chart's ruled box: four rules that run past the corners and cross */
function ruledBox(ink: Pen, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const over = 9, w = 1.8;
  ink.mask([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  ink.line([[x0 - over, y0], [x1 + over, y0]], { w, seed, taper: 0.5 });
  ink.line([[x0 - over * 0.6, y1], [x1 + over * 0.8, y1]], { w, seed: seed + 1, taper: 0.5 });
  ink.line([[x0, y0 - over], [x0, y1 + over * 0.7]], { w, seed: seed + 2, taper: 0.5 });
  ink.line([[x1, y0 - over * 0.7], [x1, y1 + over]], { w, seed: seed + 3, taper: 0.5 });
}
/** a short rule with a lozenge in the middle */
function flourish(ink: Pen, x0: number, x1: number, y: number, seed: number, tint: string): void {
  const m = (x0 + x1) / 2;
  ink.line([[x0, y], [m - 7, y]], { w: 1.2, seed, taper: 0.8, tint });
  ink.line([[m + 7, y], [x1, y]], { w: 1.2, seed: seed + 1, taper: 0.8, tint });
  ink.form([[m - 5, y], [m, y - 3.5], [m + 5, y], [m, y + 3.5]], { w: 1.1, seed: seed + 2, tint, wash: 1 });
}
function candleBody(ink: Pen, x: number, y: number, s: number, lit: boolean, seed: number): void {
  const bw = 4.2 * s, bh = 17 * s, tint = lit ? C.ink : C.dim;
  ink.form([[x - bw, y], [x - bw, y - bh + 1], [x - bw * 0.3, y - bh - 1], [x + bw, y - bh + 1.5], [x + bw, y]], { w: 1.6, seed, tint });
  ink.line([[x - bw - 3 * s, y + 1], [x + bw + 3 * s, y + 1]], { w: 1.6, seed: seed + 1, tint, taper: 0.6 });
  ink.line([[x, y - bh - 0.5], [x + 0.6, y - bh - 4 * s]], { w: 1.4, seed: seed + 2, tint, taper: 0.2 });
}
function flamePts(x: number, y: number, s: number, k: number): Pt[] {
  const fy = y - 17 * s - 4 * s;
  const q = (dx: number, dy: number): Pt => [x + dx * s * k, fy + dy * s * k];
  return smooth([[x, fy + 1], q(-4.2, -5), q(-1, -12), q(0.6, -16), q(3.4, -8), q(3.6, -2)], 6, true);
}
function smokePts(x: number, y: number, s: number): Pt[] {
  const fy = y - 17 * s - 5 * s;
  return smooth([[x + 0.5, fy], [x + 3 * s, fy - 5 * s], [x - 2 * s, fy - 10 * s], [x + 2 * s, fy - 16 * s], [x - 0.5 * s, fy - 21 * s]], 6);
}
/** a candle: lit with a gold flame, or snuffed with a curl of smoke. x is the centre, y the foot. */
function candle(ink: Pen, x: number, y: number, s: number, lit: boolean, seed: number): void {
  candleBody(ink, x, y, s, lit, seed);
  if (lit) {
    const fy = y - 17 * s - 4 * s;
    ink.form(flamePts(x, y, s, 1), { tint: C.gold, w: 1.5, wash: 0.45, seed: seed + 3 });
    ink.line([[x + 0.2, fy - 2 * s], [x + 0.4, fy - 7 * s]], { w: 1.2, tint: C.ink, seed: seed + 4, taper: 0.8 });
  } else {
    ink.line(smokePts(x, y, s), { w: 1.1, tint: C.dim, seed: seed + 5, taper: 0.8, alpha: 0.8 });
  }
}
/** the candle going out: p 0..1 over SNUFF_MS. Ends exactly on the snuffed candle. */
function candleSnuffing(ink: Pen, x: number, y: number, s: number, seed: number, p: number): void {
  candleBody(ink, x, y, s, p > 0.12, seed);
  // the flame shrinks to the wick in the first 120 ms
  const fp = p / 0.12;
  if (fp < 1) {
    const k = 1 - easeOut(fp);
    if (k > 0.05) ink.form(flamePts(x, y, s, k), { tint: C.gold, w: 1.5 * Math.max(0.5, k), wash: 0.45, seed: seed + 3 });
  }
  // the curl draws itself up from the wick and settles
  const full = smokePts(x, y, s);
  const rp = easeOut(Math.max(0, (p - 0.05) / 0.6));
  const n = Math.max(2, Math.round(full.length * rp));
  const drift = (1 - easeOut(p)) * 2.4;
  const curl = full.slice(0, n).map((q, j): Pt => [q[0] + Math.sin(j * 0.5 + p * 9) * drift, q[1]]);
  if (rp > 0.02) ink.line(curl, { w: 1.1, tint: C.dim, seed: seed + 5, taper: 0.8, alpha: 0.8 });
  // a second wisp lets go and rises away, fading
  if (p > 0.15) {
    const wp = (p - 0.15) / 0.85;
    const lift = -6 - wp * 20 * s;
    const a = 0.55 * Math.sin(Math.PI * wp);
    if (a > 0.03) ink.line(full.slice(Math.floor(full.length * 0.45)).map((q, j): Pt => [q[0] + Math.sin(j * 0.7 + wp * 5) * 1.6 + wp * 3, q[1] + lift]), { w: 0.9, tint: C.dim, seed: seed + 6, taper: 0.9, alpha: a });
  }
}

/** a standing pose of the character for the portrait (the pose engine, or a plain stand if it fails) */
function standJoints(ch: CharacterDef, def: FighterDef | undefined, id: FighterId): Joints {
  try {
    if (def) {
      const s = standState(id);
      const other = standState(id, { x: 1.4, facing: -1 });
      const J = pose(s, s, 1, other, def, ch, 0, 0);
      if (J && Array.isArray(J.head)) return J;
    }
  } catch {
    /* the pose engine is mid-edit: fall through */
  }
  const b = ch.build;
  const hip: Pt = [0, -b.hipY], neck: Pt = [b.hunch * 20, -b.hipY - b.torso], head: Pt = [neck[0] + 4, neck[1] - b.neckLen];
  const sh = (d: number): Pt => [neck[0] + d * b.shoulderX * 0.3, neck[1] + 6];
  const down = (p: Pt, l: number, dx = 0): Pt => [p[0] + dx, p[1] + l];
  const sF = sh(1), sB = sh(-1), eF = down(sF, b.arm[0], 4), eB = down(sB, b.arm[0], -2);
  const kF: Pt = [b.stanceX * 0.25, -b.leg[1]], kB: Pt = [-b.stanceX * 0.25, -b.leg[1]];
  return {
    hip, chest: [neck[0] * 0.5, (hip[1] + neck[1]) / 2], neck, head, headTilt: 0, lean: b.hunch,
    shoulderF: sF, elbowF: eF, handF: down(eF, b.arm[1], 6), shoulderB: sB, elbowB: eB, handB: down(eB, b.arm[1], 2),
    kneeF: kF, footF: [b.stanceX * 0.5, 0], kneeB: kB, footB: [-b.stanceX * 0.5, 0], prop: -Math.PI / 2, spin: 0, stretch: 1,
  };
}

/** the ringed portrait: hatch in the side tint, the face, a cream ring, a tinted ring with ticks */
function portrait(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, flip: boolean, accent: string, seed: number, ch: CharacterDef | undefined, def: FighterDef | undefined, id: FighterId, mode: InkMode, sideTint: string): void {
  const ink = makeInk(g, 'line');
  ink.mask(ell(cx, cy, r + 9, r + 9, 0, 40));
  g.save();
  g.beginPath();
  g.arc(cx, cy, r - 2, 0, Math.PI * 2);
  g.clip();
  ink.hatch(ell(cx, cy, r, r, 0, 30), { tint: accent, angle: flip ? 2.3 : 0.85, gap: 4.5, w: 1, alpha: 0.5, seed });
  if (ch) {
    try {
      const facing = flip ? -1 : 1;
      if (ch.portrait) {
        // head and shoulders about 100 units wide, centred on its origin
        const s = (r * 2) / 100;
        g.translate(cx, cy + 4);
        g.scale(facing * s, s);
        ch.portrait(makeInk(g, mode), 0);
      } else {
        // the standing figure, placed so the head fills the ring
        const J = standJoints(ch, def, id);
        const s = (r * 5) / Math.max(80, ch.build.height);
        const px = cx - facing * 3 - facing * s * J.head[0];
        const py = cy + 2 - s * J.head[1];
        drawFigure(g, ch, J, extraFor(standState(id), def, 0, sideTint), px, py, s, facing, mode);
      }
    } catch (e) {
      console.warn('[ringout ink] hud portrait', e);
    }
  }
  g.restore();
  ink.line(ell(cx, cy, r, r, 0, 36), { w: 2, closed: true, seed: seed + 1 });
  ink.line(ell(cx, cy, r + 6, r + 6, 0, 40), { w: 1.1, closed: true, seed: seed + 2, tint: accent });
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2, r0 = r + 6, r1 = r + (i % 3 ? 9 : 12);
    ink.line([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], { w: 0.9, seed: seed + 10 + i, taper: 0, tint: accent });
  }
}

function text(g: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign, maxW?: number): number {
  g.font = `${weight} ${size}px ${INK_FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  const w = g.measureText(str).width;
  if (maxW && w > maxW) {
    g.fillText(str, x, y, maxW);
    return maxW;
  }
  g.fillText(str, x, y);
  return w;
}

// ---- offscreen caches ----
interface Layer { c: HTMLCanvasElement; g: CanvasRenderingContext2D; key: string }
function layer(): Layer | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  return g ? { c, g, key: '' } : null;
}
/** size the layer for a box of w x h units at k device px per unit, clear it, and set the transform
 *  so (ox, oy) in units is its top left */
function begin(L: Layer, w: number, h: number, k: number, ox: number, oy: number): void {
  const cw = Math.ceil(w * k), chh = Math.ceil(h * k);
  if (L.c.width !== cw || L.c.height !== chh) {
    L.c.width = cw;
    L.c.height = chh;
  }
  L.g.setTransform(1, 0, 0, 1, 0, 0);
  L.g.globalAlpha = 1;
  L.g.globalCompositeOperation = 'source-over';
  L.g.clearRect(0, 0, cw, chh);
  L.g.setTransform(k, 0, 0, k, -ox * k, -oy * k);
}

interface SideAnim {
  /** damage as last seen, and the number on screen counting toward it */
  target: number;
  from: number;
  countAt: number;
  kickAt: number;
  dir: Pt;
  lives: number;
  snuffAt: number;
  snuffIdx: number;
}
const freshAnim = (): SideAnim => ({ target: 0, from: 0, countAt: -1e9, kickAt: -1e9, dir: [0, 0], lives: -1, snuffAt: -1e9, snuffIdx: -1 });

export function createHud(): InkModule {
  const plates: [Layer | null, Layer | null] = [layer(), layer()];
  const nums: [Layer | null, Layer | null] = [layer(), layer()];
  const clock = layer();
  const anim: [SideAnim, SideAnim] = [freshAnim(), freshAnim()];
  let lastNow = -1;
  let lastKey = '';

  function geom(side: Side) {
    const left = side === 0;
    const x0 = left ? 30 : W - 30 - PW, x1 = x0 + PW;
    return {
      left, x0, x1,
      mcx: left ? x0 + 50 : x1 - 50,
      mcy: Y0 + 14,
      tx: left ? x0 + 108 : x1 - 108,
      nx: left ? x1 - 18 : x0 + 18,
      candleX: (k: number) => (left ? x0 + 108 + 12 + k * 27 : x1 - 108 - 12 - k * 27),
    };
  }

  /** advance the motion for one side from what the frame says */
  function track(f: InkFrame, side: Side, dmg: number, lives: number): void {
    const a = anim[side];
    const now = f.now;
    if (a.lives < 0) {
      // first sight (a viewer joining mid-fight): no motion for what already happened
      a.target = a.from = dmg;
      a.lives = lives;
      return;
    }
    if (dmg > a.target + 0.01) {
      a.from = shownDamage(a, now);
      a.countAt = now;
      a.kickAt = now;
      a.dir = [0, 0];
      for (const ev of f.fight?.events ?? []) {
        if (ev.t === 'hit' && ev.to === side) {
          const l = Math.hypot(ev.dx, ev.dy) || 1;
          a.dir = [ev.dx / l, -ev.dy / l];
        }
      }
    } else if (dmg < a.target - 0.01) {
      a.from = dmg;
      a.countAt = -1e9;
    }
    a.target = dmg;
    if (a.lives >= 0 && lives === a.lives - 1) {
      a.snuffAt = now;
      a.snuffIdx = lives;
    } else if (lives > a.lives) {
      a.snuffAt = -1e9;
      a.snuffIdx = -1;
    }
    a.lives = lives;
  }
  function shownDamage(a: SideAnim, now: number): number {
    const p = (now - a.countAt) / COUNT_MS;
    if (p >= 1) return a.target;
    return a.from + (a.target - a.from) * easeOut(p);
  }

  function drawPlate(f: InkFrame, L: Layer, side: Side, k: number, d: { fid: FighterId | null; fname: string; bot: string; model: string; total: number; lives: number; skip: number; hl: boolean }): void {
    const G = geom(side);
    const ox = G.x0 - PLATE_BOX.pad, w = PW + PLATE_BOX.pad * 2;
    begin(L, w, PLATE_BOX.h, k, ox, PLATE_BOX.y);
    const g = L.g;
    const ink = makeInk(g, 'line');
    const accent = TINTS[f.sideTints[side]] ?? INK;
    ruledBox(ink, G.x0, Y0, G.x1, Y1, 200 + side * 10);
    const ch = d.fid ? f.cast[d.fid] : undefined;
    const def = d.fid ? f.fighterDefs[d.fid] : undefined;
    portrait(g, G.mcx, G.mcy, RING, !G.left, accent, 300 + side * 40, ch, def, d.fid ?? 'kiln', f.mode, f.sideTints[side]);
    const al: CanvasTextAlign = G.left ? 'left' : 'right';
    const room = PW - 108 - 168;
    text(g, d.fname, G.tx, Y0 + 33, 25, 600, C.ink, al, room + 20);
    const bw = text(g, d.bot, G.tx, Y0 + 59, 18, 500, C.soft, al, room);
    if (d.model) {
      const left = room + 40 - bw - 9;
      if (left > 24) text(g, d.model, G.left ? G.tx + bw + 9 : G.tx - bw - 9, Y0 + 59, 15, 400, C.dim, al, left);
    }
    if (d.hl && d.bot) {
      const a = G.left ? G.tx : G.tx - bw, b = G.left ? G.tx + bw : G.tx;
      makeInk(g, 'line').line([[a - 1, Y0 + 66], [(a + b) / 2, Y0 + 66.6], [b + 2, Y0 + 65.6]], { w: 1.7, tint: C.gold, seed: 470 + side, taper: 0.7, wobble: 0.5 });
    }
    for (let i = 0; i < d.total; i++) {
      if (i === d.skip) continue;
      candle(makeInk(g, 'line'), G.candleX(i), Y0 - 2, CANDLE_S, i < d.lives, 400 + side * 20 + i * 3);
    }
  }

  function drawNumLayer(L: Layer, side: Side, k: number, str: string, t: number): void {
    begin(L, NUM_BOX.w, NUM_BOX.h, k, 0, 0);
    drawNum(makeInk(L.g, 'line'), str, NUM_BOX.cx, NUM_BOX.base, NUM_H, { align: 'center', t, seed: 7 + side * 13 });
  }

  function drawClockLayer(L: Layer, k: number, str: string, red: boolean): void {
    begin(L, CLOCK_BOX.w, CLOCK_BOX.h, k, CLOCK_BOX.x, CLOCK_BOX.y);
    const ink = makeInk(L.g, 'line');
    drawNum(ink, str, W / 2, 50, 30, { align: 'center', color: red ? C.red : C.ink, seed: 90, w: 2.4 });
    flourish(ink, W / 2 - 60, W / 2 + 60, 66, 95, C.gold);
  }

  return {
    draw(f: InkFrame) {
      // a bench sets globalThis.__ringoutHudStats = { n, ms, max } to time the HUD (tools only)
      const stats = (globalThis as { __ringoutHudStats?: { n: number; ms: number; max: number } }).__ringoutHudStats;
      if (!stats) return drawHud(f);
      const t0 = performance.now();
      drawHud(f);
      const ms = performance.now() - t0;
      stats.n++;
      stats.ms += ms;
      stats.max = Math.max(stats.max, ms);
    },
    dispose() {
      for (const L of [plates[0], plates[1], nums[0], nums[1], clock]) {
        if (L) {
          L.c.width = 0;
          L.c.height = 0;
        }
      }
    },
  };

  function drawHud(f: InkFrame): void {
    const ph = f.show.phase;
    if (f.post.cover || !ARENA_PHASES.has(ph)) return;
    const ctx = f.show.ctx;
    const fight = f.fight;
    const ids: [FighterId | null, FighterId | null] = fight
      ? [fight.state.fighters[0].fighter, fight.state.fighters[1].fighter]
      : ctx?.picks
        ? [ctx.picks[0], ctx.picks[1]]
        : [null, null];
    if (!ids[0] && !ids[1]) return;
    const g = f.g;
    const k = Math.max(0.25, g.getTransform().a || 1);
    const now = f.now;
    // a new match, or the clock went back: no motion carried over
    const matchKey = `${ctx?.matchNo ?? ''}|${ids[0]}|${ids[1]}`;
    if (now < lastNow - 1 || matchKey !== lastKey) {
      anim[0] = freshAnim();
      anim[1] = freshAnim();
    }
    lastNow = now;
    lastKey = matchKey;
    const header = ctx?.header;
    const total0 = header?.lives ?? 2;
    const fresh = ph === 'predictions';
    const fontV = inkFontVersion();

    for (const side of [0, 1] as Side[]) {
      const id = ids[side];
      if (!id) continue;
      const st = fight?.state.fighters[side];
      const dmg = fresh || !st ? 0 : Math.max(0, st.damage);
      const lives = fresh || !st ? total0 : Math.max(0, st.lives);
      const total = Math.max(total0, lives);
      track(f, side, dmg, lives);
      const a = anim[side];
      const G = geom(side);

      // the tremble of a launched fighter's plate
      let jx = 0, jy = 0;
      if (st && st.tumble && st.action === 'hitstun' && !fresh) {
        jx = noise(31 + side * 7, now / 38) * 1.3;
        jy = noise(57 + side * 7, now / 41) * 0.9;
      }

      // the plate, from its cache
      const snuffP = (now - a.snuffAt) / SNUFF_MS;
      const snuffing = snuffP >= 0 && snuffP < 1 && a.snuffIdx >= 0 && a.snuffIdx < total;
      const bot = ctx?.bots[side];
      const d = {
        fid: id,
        fname: f.fighterDefs[id]?.name ?? id,
        bot: bot?.name ?? '',
        model: bot?.modelLabel ?? '',
        total,
        lives,
        skip: snuffing ? a.snuffIdx : -1,
        hl: f.show.highlight === side,
      };
      const PL = plates[side];
      const ox = G.x0 - PLATE_BOX.pad, pw = PW + PLATE_BOX.pad * 2;
      if (PL) {
        const key = [k, fontV, f.mode, f.sideTints[side], d.fid, d.fname, d.bot, d.model, d.total, d.lives, d.skip, d.hl].join('|');
        if (key !== PL.key) {
          drawPlate(f, PL, side, k, d);
          PL.key = key;
        }
        g.drawImage(PL.c, ox + jx, PLATE_BOX.y + jy, pw, PLATE_BOX.h);
      }
      if (snuffing) candleSnuffing(makeInk(g, 'line'), G.candleX(a.snuffIdx) + jx, Y0 - 2 + jy, CANDLE_S, 400 + side * 20 + a.snuffIdx * 3, snuffP);

      // the numeral: counts up, kicks, shakes along the hit
      const shown = Math.round(shownDamage(a, now));
      const str = `${shown}%`;
      const t = danger(shown);
      const NL = nums[side];
      if (NL) {
        const key = `${k}|${str}`;
        if (key !== NL.key) {
          drawNumLayer(NL, side, k, str, t);
          NL.key = key;
        }
        const nw = numWidth(str, NUM_H);
        const cx = G.left ? G.nx - nw / 2 : G.nx + nw / 2;
        const base = Y1 - 13;
        const kp = (now - a.kickAt) / KICK_MS;
        let sc = 1, sx = 0, sy = 0;
        if (kp >= 0 && kp < 1) {
          const e = 1 - easeOut(kp);
          sc = 1 + 0.12 * e;
          const amp = 4 * e * Math.cos(kp * Math.PI * 3);
          sx = a.dir[0] * amp;
          sy = a.dir[1] * amp;
        }
        // scaled about the numeral's middle; the top left snapped to a device pixel
        const mx = cx + jx + sx, my = base - NUM_H / 2 + jy + sy;
        const dx = Math.round((mx - NUM_BOX.cx * sc) * k) / k;
        const dy = Math.round((my - (NUM_BOX.base - NUM_H / 2) * sc) * k) / k;
        g.drawImage(NL.c, dx, dy, NUM_BOX.w * sc, NUM_BOX.h * sc);
      }
    }

    // the fight clock
    if (fight && clock) {
      const sudden = fight.state.phase === 'sudden';
      let str = '0:00';
      if (!sudden && fight.ticksLeft > 0) {
        const secs = Math.ceil(fight.ticksLeft / 60);
        str = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      }
      const key = `${k}|${str}|${sudden}`;
      if (key !== clock.key) {
        drawClockLayer(clock, k, str, sudden);
        clock.key = key;
      }
      g.drawImage(clock.c, CLOCK_BOX.x, CLOCK_BOX.y, CLOCK_BOX.w, CLOCK_BOX.h);
    }
  }
}
