// The between-fight screens' drawing kit: the fight HUD's vocabulary (ruled plates whose rules cross
// at the corners, rings with a tick ring, pen numerals, the gold rule with a lozenge) made to draw
// themselves in. Everything is a pure function of the progress values it is given, so a viewer who
// joins in the middle of a screen sees the same picture as one who watched it from the start.

import type { FighterId, Side } from '../../sim/types.ts';
import type { InkFrame } from '../api.ts';
import { W } from '../api.ts';
import { BG, INK, TINTS, ell, h01, makeInk, smooth, type Pen, type Pt } from '../pen.ts';
import { INK_FONT } from '../font.ts';
import { pose } from '../pose.ts';
import { drawFigure, extraFor, standState } from '../figures.ts';

export const C = {
  paper: BG,
  ink: INK,
  soft: '#d7d5cf',
  dim: '#959389',
  faint: '#4d4b50',
  gold: TINTS.gold!,
};

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** strong ease-out */
export const out = (u: number): number => 1 - (1 - clamp01(u)) ** 3;
export const out4 = (u: number): number => 1 - (1 - clamp01(u)) ** 4;
export const inOut = (u: number): number => { const x = clamp01(u); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
/** 0..1 over [t0, t0 + dur] */
export const span = (t: number, t0: number, dur: number): number => clamp01((t - t0) / dur);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

export function tintOf(f: InkFrame, side: Side): string {
  return TINTS[f.sideTints[side]] ?? INK;
}

// ---- partial lines: the pen drawing itself ----

/** the first fraction t of a polyline, by length */
export function upto(pts: Pt[], t: number): Pt[] {
  if (t >= 1) return pts;
  if (t <= 0 || pts.length < 2) return [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  let want = total * t;
  const outp: Pt[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d >= want) {
      const k = d > 0 ? want / d : 0;
      outp.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
      return outp;
    }
    want -= d;
    outp.push(b);
  }
  return outp;
}

/** a pen line drawn up to fraction t (nothing at 0) */
export function draw(ink: Pen, pts: Pt[], t: number, o: Parameters<Pen['line']>[1] = {}): void {
  if (t <= 0.003) return;
  const p = upto(pts, t);
  if (p.length < 2) return;
  ink.line(p, o);
}

// ---- the chart's ruled box ----

export interface BoxOpts {
  over?: number;
  w?: number;
  seed?: number;
  /** tint per rule: top, right, bottom, left */
  tints?: [string, string, string, string];
  tint?: string;
  alpha?: number;
  /** fill the inside with paper first (over a picture) */
  mask?: number;
}

/** Four rules that run past the corners and cross. p 0..1 draws them in, one after another. */
export function ruledBox(ink: Pen, g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, p: number, o: BoxOpts = {}): void {
  if (p <= 0) return;
  const over = o.over ?? 9, sd = o.seed ?? 100, w = o.w ?? 1.8;
  if (o.mask) {
    g.save();
    g.globalAlpha = clamp01(o.mask) * out(p * 2);
    g.fillStyle = BG;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
  }
  const rules: Pt[][] = [
    [[x0 - over, y0], [x1 + over, y0]],
    [[x1, y0 - over * 0.7], [x1, y1 + over]],
    [[x1 + over * 0.8, y1], [x0 - over * 0.6, y1]],
    [[x0, y1 + over * 0.7], [x0, y0 - over]],
  ];
  for (let i = 0; i < 4; i++) {
    const t = out(span(p, i * 0.12, 0.64));
    draw(ink, rules[i]!, t, { w, seed: sd + i, taper: 0.5, tint: o.tints?.[i] ?? o.tint, alpha: o.alpha });
  }
}

/** a short ornamental rule with a lozenge in the middle, drawn out from the centre */
export function flourish(ink: Pen, cx: number, half: number, y: number, p: number, seed: number, tint = C.gold, alpha = 1): void {
  if (p <= 0) return;
  const t = out(p);
  draw(ink, [[cx - 7, y], [cx - half, y]], t, { w: 1.2, seed, taper: 0.8, tint, alpha });
  draw(ink, [[cx + 7, y], [cx + half, y]], t, { w: 1.2, seed: seed + 1, taper: 0.8, tint, alpha });
  const s = out(span(p, 0, 0.5));
  if (s > 0) ink.form([[cx - 5 * s, y], [cx, y - 3.5 * s], [cx + 5 * s, y], [cx, y + 3.5 * s]], { w: 1.1, seed: seed + 2, tint, wash: 1 });
}

/** the portrait ring: a pen circle, a thin ring in the side colour and its ticks, drawn round */
export function tickRing(ink: Pen, cx: number, cy: number, r: number, tint: string, p: number, seed: number): void {
  if (p <= 0) return;
  const t = out(p);
  const n = 40;
  draw(ink, ell(cx, cy, r, r, -Math.PI / 2, 36).concat([[cx, cy - r]]), t, { w: 2, seed: seed + 1, taper: 0.3 });
  draw(ink, ell(cx, cy, r + 6, r + 6, -Math.PI / 2, 40).concat([[cx, cy - r - 6]]), t, { w: 1.1, seed: seed + 2, tint, taper: 0.3 });
  const shown = Math.floor(n * t);
  for (let i = 0; i < shown; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2, r0 = r + 6, r1 = r + (i % 3 ? 9 : 12);
    ink.line([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], { w: 0.9, seed: seed + 10 + i, taper: 0, tint });
  }
}

/** the crossing mark: two long strokes that cross, a ring and a gold lozenge where they meet */
export function crossMark(ink: Pen, cx: number, cy: number, r: number, p: number, seed: number, tints: [string, string] = [INK, INK]): void {
  if (p <= 0) return;
  // four arms drawn out from the middle: the left two in side 0's tint, the right two in side 1's
  const a = 0.86, c = Math.cos(a) * r, s0 = Math.sin(a) * r;
  const arms: [number, number, number][] = [[-1, -1, 0], [-1, 1, 0], [1, -1, 1], [1, 1, 1]];
  arms.forEach(([dx, dy, side], i) => {
    const pts: Pt[] = [[cx + dx * c * 0.2, cy + dy * s0 * 0.2], [cx + dx * c, cy + dy * s0]];
    draw(ink, pts, out(span(p, 0.06 * i, 0.5)), { w: 3.2, seed: seed + i * 3, taper: 0.75, tint: tints[side as 0 | 1] });
  });
  const rr = r * 0.36;
  const q = span(p, 0.35, 0.65);
  if (q > 0) {
    ink.mask(ell(cx, cy, rr + 13, rr + 13, 0, 36));
    tickRing(ink, cx, cy, rr, C.gold, q, seed + 2);
    const s = out(q) * rr * 0.5;
    ink.form([[cx - s, cy], [cx, cy - s * 0.62], [cx + s, cy], [cx, cy + s * 0.62]], { w: 1.2, seed: seed + 3, tint: C.gold, wash: 1 });
    ink.line([[cx - rr * 0.78, cy], [cx - s - 3, cy]], { w: 1, seed: seed + 4, taper: 0.6, alpha: 0.7 * out(q) });
    ink.line([[cx + s + 3, cy], [cx + rr * 0.78, cy]], { w: 1, seed: seed + 5, taper: 0.6, alpha: 0.7 * out(q) });
  }
}

// ---- text ----

export interface TextOpts { size?: number; weight?: number; color?: string; align?: CanvasTextAlign; alpha?: number }

export function font(size: number, weight = 500): string {
  return `${weight} ${size}px ${INK_FONT}`;
}

export function textW(g: CanvasRenderingContext2D, s: string, size: number, weight = 500): number {
  g.font = font(size, weight);
  return g.measureText(s).width;
}

/** the largest size up to `size` at which s fits in maxW */
export function fitSize(g: CanvasRenderingContext2D, s: string, size: number, weight: number, maxW: number): number {
  const w = textW(g, s, size, weight);
  return w <= maxW ? size : Math.max(10, Math.floor((size * maxW) / w));
}

/** text, optionally written in left to right (reveal 0..1, a soft clip moving with the pen) */
export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts = {}, reveal = 1): number {
  if (!s || reveal <= 0) return 0;
  const size = o.size ?? 20;
  g.save();
  g.font = font(size, o.weight ?? 500);
  g.textAlign = o.align ?? 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = o.color ?? INK;
  g.globalAlpha = (o.alpha ?? 1) * (reveal < 1 ? Math.min(1, reveal * 3) : 1);
  const w = g.measureText(s).width;
  if (reveal < 1) {
    const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    g.beginPath();
    g.rect(left - 4, y - size * 1.3, (w + 8) * out(reveal), size * 1.8);
    g.clip();
  }
  g.fillText(s, x, y);
  g.restore();
  return w;
}

// ---- pen numerals (the HUD's clock hand) ----

type Glyph = { w: number; s?: { p: Pt[]; closed?: boolean }[]; dots?: Pt[] };
const Sg = (pts: Pt[]) => ({ p: smooth(pts, 8) });
const Rg = (pts: Pt[]) => ({ p: pts });
const Og = (cx: number, cy: number, rx: number, ry: number) => ({ p: ell(cx, cy, rx, ry, 0, 26), closed: true });
const GLYPH: Record<string, Glyph> = {
  '0': { w: 0.56, s: [Og(0.28, 0.5, 0.27, 0.5)] },
  '1': { w: 0.34, s: [Rg([[0.02, 0.22], [0.24, 0.02], [0.24, 1]])] },
  '2': { w: 0.56, s: [Sg([[0.03, 0.24], [0.12, 0.06], [0.3, 0], [0.48, 0.08], [0.52, 0.28], [0.4, 0.52], [0.02, 0.98]]), Rg([[0.02, 0.98], [0.56, 0.96]])] },
  '3': { w: 0.54, s: [Sg([[0.04, 0.1], [0.26, 0], [0.48, 0.1], [0.48, 0.32], [0.22, 0.46]]), Sg([[0.22, 0.46], [0.5, 0.56], [0.54, 0.8], [0.32, 1], [0.02, 0.92]])] },
  '4': { w: 0.6, s: [Rg([[0.42, 1], [0.42, 0], [0.0, 0.68], [0.6, 0.68]])] },
  '5': { w: 0.56, s: [Rg([[0.5, 0.01], [0.1, 0.01], [0.06, 0.44]]), Sg([[0.06, 0.44], [0.28, 0.36], [0.5, 0.46], [0.54, 0.74], [0.34, 0.98], [0.04, 0.92]])] },
  '6': { w: 0.55, s: [Sg([[0.48, 0.03], [0.22, 0.12], [0.05, 0.46], [0.06, 0.82], [0.28, 1], [0.5, 0.84], [0.5, 0.6], [0.28, 0.46], [0.06, 0.6]])] },
  '7': { w: 0.56, s: [Rg([[0.0, 0.01], [0.56, 0.01], [0.2, 1]])] },
  '8': { w: 0.56, s: [Og(0.28, 0.24, 0.2, 0.23), Og(0.28, 0.72, 0.26, 0.27)] },
  '9': { w: 0.56, s: [Sg([[0.5, 0.36], [0.28, 0.52], [0.06, 0.4], [0.06, 0.14], [0.28, 0], [0.5, 0.14], [0.5, 0.5], [0.4, 0.84], [0.1, 0.98]])] },
  ':': { w: 0.18, dots: [[0.09, 0.32], [0.09, 0.84]] },
};

export function numWidth(str: string, h: number, gapK = 0.13): number {
  const gap = gapK * h;
  let w = 0;
  for (const ch of str) { const gl = GLYPH[ch]; if (gl) w += gl.w * h + gap; }
  return w - gap;
}

/** a number in the pen's own hand; y is the baseline */
export function drawNum(ink: Pen, str: string, x: number, y: number, h: number, o: { align?: 'left' | 'center' | 'right'; color?: string; seed?: number; w?: number } = {}): number {
  const gap = 0.13 * h, seed0 = o.seed ?? 11;
  const total = numWidth(str, h);
  let gx = o.align === 'right' ? x - total : o.align === 'center' ? x - total / 2 : x;
  const col = o.color ?? INK;
  const w = o.w ?? h * 0.08;
  let i = 0;
  for (const ch of str) {
    const gl = GLYPH[ch];
    if (!gl) continue;
    const gw = gl.w * h;
    const sd = seed0 * 31 + i * 7;
    const rot = (h01(sd) - 0.5) * 0.05;
    const cx = gx + gw / 2, cy = y - h / 2;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const T = (p: Pt): Pt => { const lx = (p[0] - gl.w / 2) * h, ly = (p[1] - 0.5) * h; return [cx + lx * cr - ly * sr, cy + lx * sr + ly * cr]; };
    if (gl.dots) for (const d of gl.dots) { const P = T(d); ink.dot(P[0], P[1], w * 0.75, { tint: col, free: true }); }
    else gl.s!.forEach((st, k) => ink.line(st.p.map(T), { w, tint: col, seed: sd + k, taper: 0.3, wobble: 0.35 * (h / 60), closed: st.closed }));
    gx += gw + gap;
    i++;
  }
  return total;
}

export function clockText(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// ---- figures ----

/** a character standing, feet at (x, y), px per unit s, facing +1 right; tint = the sash (default: the side's) */
export function stand(f: InkFrame, g: CanvasRenderingContext2D, id: FighterId, side: Side, x: number, y: number, s: number, facing: 1 | -1, t: number, tint?: string): void {
  const ch = f.cast[id];
  const def = f.fighterDefs[id];
  if (!ch || !def) return;
  const st = standState(id, { facing });
  const other = standState(id, { facing: facing === 1 ? -1 : 1, x: facing * 2 });
  const J = pose(st, st, 1, other, def, ch, t, f.dt);
  drawFigure(g, ch, J, extraFor(st, def, t, tint ?? f.sideTints[side]), x, y, s, facing, f.mode);
}

/** the pen's cream-grey: the side colour's stand-in before a bot has picked */
export const NEUTRAL_TINT = '#959389';

/** a figure's drawn extent in figure units, feet at (0, 0), facing +1: x0..x1, y0 (top, negative)..y1 */
export interface Bounds { x0: number; x1: number; y0: number; y1: number }
const boundsCache = new Map<string, Bounds>();

/** Measure what a character actually draws standing (cloak, tail, staff), once per id and mode. */
export function figBounds(f: InkFrame, id: FighterId): Bounds {
  const key = `${id}|${f.mode}`;
  const hit = boundsCache.get(key);
  if (hit) return hit;
  const h = (f.fighterDefs[id]?.height ?? 2) * 100;
  // fallback when nothing can be measured: the hurtbox, generously
  let b: Bounds = { x0: -h * 0.35, x1: h * 0.35, y0: -h * 1.1, y1: 6 };
  if (typeof document !== 'undefined') {
    const S = 0.5, CW = 900, CH = 800, OX = 450, OY = 620; // half scale is plenty to find edges
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    const cg = c.getContext('2d', { willReadFrequently: true });
    if (cg) {
      try {
        stand(f, cg, id, 0, OX, OY, S, 1, 0, NEUTRAL_TINT);
        const d = cg.getImageData(0, 0, CW, CH).data;
        let x0 = CW, x1 = -1, y0 = CH, y1 = -1;
        for (let y = 0; y < CH; y++) {
          for (let x = 0; x < CW; x++) {
            if (d[(y * CW + x) * 4 + 3]! > 24) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 > x0 && y1 > y0) b = { x0: (x0 - OX) / S, x1: (x1 + 1 - OX) / S, y0: (y0 - OY) / S, y1: (y1 + 1 - OY) / S };
      } catch {
        /* keep the fallback */
      }
    }
    c.width = 0;
    c.height = 0;
  }
  boundsCache.set(key, b);
  return b;
}

/** the bounds for a facing, scaled: px offsets from the feet point */
export function boundsAt(b: Bounds, s: number, facing: 1 | -1): Bounds {
  return facing === 1
    ? { x0: b.x0 * s, x1: b.x1 * s, y0: b.y0 * s, y1: b.y1 * s }
    : { x0: -b.x1 * s, x1: -b.x0 * s, y0: b.y0 * s, y1: b.y1 * s };
}

/** feet x that centres the drawn bounds on cx, then keeps them inside [minX, maxX] */
export function placeFigure(b: Bounds, s: number, facing: 1 | -1, cx: number, minX: number, maxX: number): number {
  const a = boundsAt(b, s, facing);
  let x = cx - (a.x0 + a.x1) / 2;
  if (x + a.x1 > maxX) x = maxX - a.x1;
  if (x + a.x0 < minX) x = minX - a.x0;
  return x;
}

/** figure height in px at scale s (from the fighter's hurtbox height, 2 m when unknown) */
export function figH(f: InkFrame, id: FighterId, s: number): number {
  return (f.fighterDefs[id]?.height ?? 2) * 100 * s;
}

// ---- offscreen sprites ----

/** device px per layout px for this frame */
export function devK(g: CanvasRenderingContext2D): number {
  return g.canvas.width / W;
}

export interface Sprite { c: HTMLCanvasElement; x: number; y: number; w: number; h: number }

/** A small cache of offscreen drawings in layout px (x, y, w, h) at the device scale. */
export function spriteCache(limit = 24) {
  const m = new Map<string, Sprite>();
  return {
    get(key: string, k: number, x: number, y: number, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): Sprite | null {
      const full = `${key}|${k.toFixed(3)}`;
      let sp = m.get(full);
      if (!sp) {
        if (typeof document === 'undefined') return null;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * k));
        c.height = Math.max(1, Math.ceil(h * k));
        const cg = c.getContext('2d');
        if (!cg) return null;
        cg.setTransform(k, 0, 0, k, -x * k, -y * k);
        paint(cg);
        sp = { c, x, y, w, h };
        m.set(full, sp);
        if (m.size > limit) {
          const first = m.keys().next().value as string;
          const old = m.get(first);
          if (old) { old.c.width = 0; old.c.height = 0; }
          m.delete(first);
        }
      }
      return sp;
    },
    blit(g: CanvasRenderingContext2D, sp: Sprite, dx = 0, dy = 0, alpha = 1): void {
      if (alpha <= 0) return;
      const a = g.globalAlpha;
      g.globalAlpha = a * alpha;
      g.drawImage(sp.c, sp.x + dx, sp.y + dy, sp.w, sp.h);
      g.globalAlpha = a;
    },
    clear(): void {
      for (const sp of m.values()) { sp.c.width = 0; sp.c.height = 0; }
      m.clear();
    },
  };
}
export type SpriteCache = ReturnType<typeof spriteCache>;

// ---- the page frame for the covering screens ----

/** a double rule round the page, crossing at the corners, drawn in over p */
export function pageFrame(ink: Pen, g: CanvasRenderingContext2D, p: number): void {
  ruledBox(ink, g, 26, 24, W - 26, 696, p, { over: 14, w: 1.5, seed: 900, alpha: 0.75 });
  ruledBox(ink, g, 34, 32, W - 34, 688, span(p, 0.15, 0.85), { over: 0, w: 0.9, seed: 910, alpha: 0.35 });
}

export function newInk(g: CanvasRenderingContext2D): Pen {
  return makeInk(g, 'line');
}
