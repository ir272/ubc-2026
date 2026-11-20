// Shared pen for the designed stage sets: a TypeScript port of lab/stages/common.js (the stage
// options sheet), plus the cache-and-blit plumbing every set uses.
//
// Sets draw in WORLD metres (y up) through a KitView, exactly as on the sheet. Pen widths and hatch
// gaps are sheet pixels (1280 wide showing 26 m) and scale with k = px per metre / (1280 / 26), so a
// cache drawn at any resolution matches the sheet's weights at the sheet's framing.
//
// Behind a fight the drawing is quieter than the sheet: every pen call is multiplied by the current
// tone (alpha and width), set per layer and changed with P.tone(); only P.walk(), the places to
// stand, ignores the tone and keeps the full heavy line.
//
// Each set is drawn once into two offscreen canvases in world space: FAR (sky, moon, far town,
// hills, sea; low resolution, a little parallax) and NEAR (everything else, standing surfaces
// included; never moves against the world). Each frame is one drawImage per layer, cropped to what
// the view shows. drawThumb() draws the same two layers once into a small 16:9 canvas.

import type { InkFrame, StageSet, View } from '../api.ts';
import { H, W } from '../api.ts';
import { ARENA } from '../../sim/arena.ts';
import { arc, BG, ell, makeInk, smooth, TINTS, type Pt } from '../pen.ts';

export type { Pt };

/** the sheet's px per metre at k = 1 */
export const SHEET_PPM = 1280 / 26;

export interface KitView {
  /** px per metre */
  s: number;
  /** pen scale: 1 at the sheet's 1280-wide framing */
  k: number;
  p(x: number, y: number): Pt;
}

/** seeded random, deterministic */
export function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LineOpts {
  w?: number;
  alpha?: number;
  tint?: string | null;
  taper?: number;
  wobble?: number;
  seed?: number;
  closed?: boolean;
}
export interface FormOpts extends LineOpts {
  /** no mask: the shape does not hide what is behind it */
  open?: boolean;
  /** flat wash of a tint at this alpha */
  wash?: number;
  washTint?: string | null;
}
export interface HatchOpts {
  angle?: number;
  gap?: number;
  w?: number;
  tint?: string | null;
  alpha?: number;
  seed?: number;
}
export interface TownOpts {
  seed?: number;
  hMin?: number;
  hMax?: number;
  wMin?: number;
  wMax?: number;
  alpha?: number;
  w?: number;
  tint?: string | null;
  lit?: number;
  spire?: number;
}

export interface Kit {
  g: CanvasRenderingContext2D;
  v: KitView;
  k: number;
  /** set the tone, relative to the layer's: alpha and width multipliers for every call but walk(); 1 = the layer's own */
  tone(a: number, w?: number): void;
  line(pts: Pt[], o?: LineOpts): void;
  /** closed shape: hides what is behind, optional flat wash of a tint, then the outline */
  form(pts: Pt[], o?: FormOpts): void;
  fill(pts: Pt[], tint: string, a: number): void;
  mask(pts: Pt[]): void;
  hatch(pts: Pt[], o?: HatchOpts): void;
  dot(x: number, y: number, r: number, o?: { alpha?: number; tint?: string | null }): void;
  /** a place to stand: the heaviest line on the stage, never toned down */
  walk(x0: number, x1: number, y: number, o?: { w?: number; seed?: number }): void;
  star(x: number, y: number, r: number, a?: number, tint?: string): void;
  sky(seed: number, box: [number, number, number, number], n: number, stars: number[][], skip?: (x: number, y: number) => boolean): void;
  town(x0: number, x1: number, y: number, yBot: number, o?: TownOpts): Pt[];
  /** clip later drawing to a world rectangle until unclip() */
  clipRect(x0: number, y0: number, x1: number, y1: number): void;
  unclip(): void;
  E(cx: number, cy: number, rx: number, ry: number, rot?: number, n?: number): Pt[];
  A(cx: number, cy: number, r: number, a0: number, a1: number, n?: number, ry?: number): Pt[];
  S(pts: Pt[], per?: number, closed?: boolean): Pt[];
  rect(x0: number, y0: number, x1: number, y1: number): Pt[];
}

const tintOf = (t: string | null | undefined): string | undefined => (t ? t : undefined);

export function pen(g: CanvasRenderingContext2D, v: KitView, tone: { a: number; w: number } = { a: 1, w: 1 }): Kit {
  const ink = makeInk(g, 'line');
  const k = v.k;
  const M = (pts: Pt[]): Pt[] => pts.map((q) => v.p(q[0], q[1]));
  let auto = 500;
  const q = { a: tone.a, w: tone.w };
  const al = (a: number | undefined): number => Math.max(0, Math.min(1, (a ?? 1) * q.a));
  function raw(pts: Pt[], o: LineOpts, full: boolean): void {
    ink.line(M(pts), {
      w: (o.w ?? 1.6) * k * (full ? 1 : q.w),
      alpha: full ? o.alpha : al(o.alpha),
      tint: tintOf(o.tint),
      taper: o.taper ?? 0.5,
      wobble: (o.wobble ?? 0.9) * k,
      seed: o.seed ?? auto++,
      closed: o.closed,
    });
  }
  const P: Kit = {
    g,
    v,
    k,
    tone(a: number, w = 1) {
      q.a = tone.a * a;
      q.w = tone.w * w;
    },
    line(pts, o = {}) {
      raw(pts, o, false);
    },
    form(pts, o = {}) {
      if (!o.open) P.mask(pts);
      if (o.wash) P.fill(pts, o.washTint || o.tint || 'ink', o.wash);
      if (o.w !== 0) P.line(pts, { w: o.w ?? 2.2, alpha: o.alpha, tint: o.tint, closed: true, wobble: o.wobble, seed: o.seed });
    },
    fill(pts, tint, a) {
      const m = M(pts);
      g.save();
      g.globalAlpha = al(a);
      g.fillStyle = TINTS[tint] || tint;
      g.beginPath();
      g.moveTo(m[0][0], m[0][1]);
      for (const p of m) g.lineTo(p[0], p[1]);
      g.closePath();
      g.fill();
      g.restore();
    },
    mask(pts) {
      ink.mask(M(pts));
    },
    hatch(pts, o = {}) {
      ink.hatch(M(pts), { angle: o.angle ?? 0.9, gap: (o.gap ?? 5) * k, w: (o.w ?? 1) * k * q.w, tint: tintOf(o.tint), alpha: al(o.alpha ?? 0.6), seed: o.seed ?? auto++, free: true });
    },
    dot(x, y, r, o = {}) {
      const p = v.p(x, y);
      g.globalAlpha = al(o.alpha);
      ink.dot(p[0], p[1], r * k * Math.sqrt(q.w), { tint: tintOf(o.tint), free: true });
      g.globalAlpha = 1;
    },
    walk(x0, x1, y, o = {}) {
      raw([[x0, y], [(x0 * 2 + x1) / 3, y], [(x0 + x1 * 2) / 3, y], [x1, y]], { w: o.w ?? 4.2, taper: 0.12, wobble: 0.7, seed: o.seed }, true);
    },
    star(x, y, r, a = 0.8, tint) {
      P.line([[x, y + r], [x, y - r]], { w: 1.3, alpha: a, taper: 1, tint, wobble: 0.2 });
      P.line([[x - r * 0.6, y], [x + r * 0.6, y]], { w: 1.2, alpha: a, taper: 1, tint, wobble: 0.2 });
      P.dot(x, y, 1.2, { alpha: a, tint });
    },
    sky(seed, box, n, stars, skip) {
      const r = rng(seed);
      for (let i = 0; i < n; i++) {
        const x = box[0] + r() * (box[2] - box[0]);
        const y = box[1] + r() * (box[3] - box[1]);
        if (skip && skip(x, y)) continue;
        P.dot(x, y, 0.6 + r() * 0.7, { alpha: 0.25 + r() * 0.35 });
      }
      for (const st of stars) P.star(st[0], st[1], st[2], st[3] ?? 0.75);
    },
    town(x0, x1, y, yBot, o = {}) {
      const r = rng(o.seed ?? 7);
      const top: Pt[] = [[x0, yBot]];
      const lit: Pt[] = [];
      let x = x0;
      while (x < x1) {
        const bw = (o.wMin ?? 0.6) + r() * ((o.wMax ?? 1.5) - (o.wMin ?? 0.6));
        const h = y + (o.hMin ?? 0.3) + r() * ((o.hMax ?? 1.1) - (o.hMin ?? 0.3));
        const kind = r();
        const xa = x;
        const xb = Math.min(x1, x + bw);
        top.push([xa, h]);
        if (kind < (o.spire ?? 0.06)) {
          const m = (xa + xb) / 2;
          const t = h + 0.5 + bw * 0.3;
          top.push([m - bw * 0.22, h], [m - bw * 0.22, t], [m - bw * 0.3, t], [m, t + 0.9 + r() * 0.4], [m + bw * 0.3, t], [m + bw * 0.22, t], [m + bw * 0.22, h]);
        } else if (kind < 0.62) {
          top.push([(xa + xb) / 2, h + bw * (0.35 + r() * 0.25)]); // gable
        } else if (kind < 0.8 && bw > 0.9) {
          top.push([xa + bw * 0.25, h], [xa + bw * 0.25, h + 0.35], [xa + bw * 0.38, h + 0.35], [xa + bw * 0.38, h]); // chimney
        }
        top.push([xb, h]);
        if (r() < (o.lit ?? 0)) lit.push([xa + bw * (0.3 + r() * 0.4), h - 0.3 - r() * 0.6]);
        x = xb;
      }
      top.push([x1, yBot]);
      P.mask(top);
      P.line(top.slice(1, -1), { w: o.w ?? 1, alpha: o.alpha ?? 0.4, tint: o.tint, taper: 0.2, wobble: 0.5 });
      for (const p of lit) P.dot(p[0], p[1], 1.5, { tint: 'gold', alpha: 0.75 });
      return top;
    },
    clipRect(x0, y0, x1, y1) {
      const a = v.p(x0, y1);
      const b = v.p(x1, y0);
      g.save();
      g.beginPath();
      g.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      g.clip();
    },
    unclip() {
      g.restore();
    },
    E: (cx, cy, rx, ry, rot = 0, n = 28) => ell(cx, cy, rx, ry, rot, n),
    A: (cx, cy, r, a0, a1, n = 14, ry = r) => arc(cx, cy, r, a0, a1, n, ry),
    S: (pts, per = 8, closed = false) => smooth(pts, per, closed),
    rect: (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  };
  return P;
}

export const mix = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ---- the cache and the blit ----

interface Layer {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  ppm: number;
}
/** the near layer covers the whole camera range (blast lines plus framing margin) */
export const NEAR: Layer = { x0: -19.5, x1: 19.5, y0: -9.5, y1: 14.5, ppm: 100 };
/** the far layer: lower resolution, wider for the parallax travel */
export const FAR: Layer = { x0: -23, x1: 23, y0: -12, y1: 17, ppm: 56 };
/** the world point the far layer is still at (parallax is measured from here) */
const PAR_CX = 0;
const PAR_CY = 3;
/** default tones behind a fight: far is dimmest */
export const TONE_FAR = { a: 0.55, w: 0.75 };
export const TONE_NEAR = { a: 0.52, w: 0.62 };
/** the stage select thumbnail: canvas size and the world box it shows */
const THUMB_W = 768;
const THUMB_H = 432;
const THUMB_CX = 0;
const THUMB_CY = 2.6;
const THUMB_SPAN = 24;

export interface SetSpec {
  id: string;
  name: string;
  /** sky, moon, far town, hills, sea: drawn at low resolution, moved a little against the view */
  far?(P: Kit): void;
  /** everything else, the standing surfaces included */
  near(P: Kit): void;
  /** 0 = the far layer is fixed to the world; 0.1 = it follows the view by a tenth */
  parallax?: number;
}

function layerCanvas(L: Layer, paint: (P: Kit) => void, tone: { a: number; w: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round((L.x1 - L.x0) * L.ppm);
  c.height = Math.round((L.y1 - L.y0) * L.ppm);
  const g = c.getContext('2d')!;
  const v: KitView = { s: L.ppm, k: L.ppm / SHEET_PPM, p: (x, y) => [(x - L.x0) * L.ppm, (L.y1 - y) * L.ppm] };
  paint(pen(g, v, tone));
  return c;
}

/** one drawImage of the part of the layer the view shows; the layer sits at world offset (ox, oy) */
function blit(g: CanvasRenderingContext2D, view: View, c: HTMLCanvasElement, L: Layer, ox: number, oy: number): void {
  const dx = view.x(L.x0 + ox);
  const dy = view.y(L.y1 + oy);
  const dw = (L.x1 - L.x0) * view.scale;
  const dh = (L.y1 - L.y0) * view.scale;
  const cx0 = Math.max(0, dx);
  const cy0 = Math.max(0, dy);
  const cx1 = Math.min(W, dx + dw);
  const cy1 = Math.min(H, dy + dh);
  if (cx1 <= cx0 || cy1 <= cy0) return;
  const fx = c.width / dw;
  const fy = c.height / dh;
  g.drawImage(c, (cx0 - dx) * fx, (cy0 - dy) * fy, (cx1 - cx0) * fx, (cy1 - cy0) * fy, cx0, cy0, cx1 - cx0, cy1 - cy0);
}

function free(c: HTMLCanvasElement | null): void {
  if (c) {
    c.width = 0;
    c.height = 0;
  }
}

export function makeSet(spec: SetSpec): StageSet {
  let near: HTMLCanvasElement | null = null;
  let far: HTMLCanvasElement | null = null;
  let thumb: HTMLCanvasElement | null = null;
  const par = spec.parallax ?? 0.1;
  let disposed = false;

  function buildNear(): void {
    if (!near && !disposed) near = layerCanvas(NEAR, spec.near, TONE_NEAR);
  }
  function buildFar(): void {
    if (!far && spec.far && !disposed) far = layerCanvas(FAR, spec.far, TONE_FAR);
  }
  // draw the caches ahead of the first arena frame when the page has a quiet moment (a set is made
  // at the select screen); draw() builds whatever is still missing, so this only moves the cost
  const idle = (fn: () => void): void => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 400 });
    else if (typeof setTimeout === 'function') setTimeout(fn, 30);
  };
  if (typeof document !== 'undefined') idle(() => (buildFar(), idle(buildNear)));

  function buildThumb(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = THUMB_W;
    c.height = THUMB_H;
    const g = c.getContext('2d')!;
    g.fillStyle = BG;
    g.fillRect(0, 0, THUMB_W, THUMB_H);
    const s = THUMB_W / THUMB_SPAN;
    const top = THUMB_CY + (THUMB_H / s) / 2;
    // a touch heavier than true scale, so the small picture still reads
    const v: KitView = { s, k: (s / SHEET_PPM) * 1.3, p: (x, y) => [THUMB_W / 2 + (x - THUMB_CX) * s, (top - y) * s] };
    // brighter than behind a fight: nothing stands in front of a thumbnail
    if (spec.far) spec.far(pen(g, v, { a: 0.8, w: 0.85 }));
    spec.near(pen(g, v, { a: 0.85, w: 0.85 }));
    return c;
  }

  return {
    id: spec.id,
    name: spec.name,
    arena: ARENA,
    draw(f: InkFrame) {
      buildFar();
      buildNear();
      const g = f.g;
      const v = f.view;
      g.imageSmoothingEnabled = true;
      if (far) blit(g, v, far, FAR, (v.cx - PAR_CX) * par, (v.cy - PAR_CY) * par);
      if (near) blit(g, v, near, NEAR, 0, 0);
    },
    drawThumb(g, x, y, w, h) {
      if (!thumb) thumb = buildThumb();
      // cover the box, cropping the 16:9 picture about its centre if the box is another shape
      const a = w / h;
      let sw = THUMB_W;
      let sh = THUMB_H;
      if (a > THUMB_W / THUMB_H) sh = THUMB_W / a;
      else sw = THUMB_H * a;
      g.save();
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(thumb, (THUMB_W - sw) / 2, (THUMB_H - sh) / 2, sw, sh, x, y, w, h);
      g.restore();
    },
    dispose() {
      disposed = true;
      free(near);
      free(far);
      free(thumb);
      near = far = thumb = null;
    },
  };
}
