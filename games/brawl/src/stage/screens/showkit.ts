// Ringout show kit: the shared pieces of the show's screen language (the call, predictions, the
// break, the verdict). One idea runs through all of it: THE CUT. Every big word is sliced by one
// hard diagonal (the same angle everywhere), lands whole with its halves locked a hair apart, and
// leaves by splitting along that cut. Plates are solid, cut at the same angle, with hard offset
// shadows. Every pose is a pure function of a time in ms, so a viewer who joins late lands
// mid-animation on the right frame. Per frame we only write transforms and opacity, and only when
// they change.

import * as THREE from 'three';
import type { FighterView, StageCtx } from '../api.ts';
import { LAYER } from '../api.ts';
import type { FighterId, Side, Stance } from '../../sim/types.ts';
import { FONTS, PALETTE, UI_H, UI_W, el } from '../style.ts';
import { restState, screenFighter } from './shared.ts';

export const FRAME_MS = 1000 / 60;

// ---------------------------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------------------------

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0..1 progress of t through [a, b] */
export const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
export const easeOutCubic = (p: number): number => 1 - (1 - p) * (1 - p) * (1 - p);
export const easeInCubic = (p: number): number => p * p * p;
export const easeOutExpo = (p: number): number => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
export function easeOutBack(p: number, k = 1.4): number {
  const c3 = k + 1;
  const q = p - 1;
  return 1 + c3 * q * q * q + k * q * q;
}

/** A slam: huge to a hair under size in `dur` ms (accelerating into the impact), then a short settle. */
export function slamScale(t: number, dur = 100, from = 1.9): number {
  if (t <= 0) return from;
  if (t < dur) {
    const p = t / dur;
    return from + (0.93 - from) * (p * p);
  }
  return 0.93 + 0.07 * easeOutCubic(seg(t, dur, dur + 110));
}

/** A slide in from `dist` px away: fast, a small overshoot past the mark, settle. */
export function slideIn(t: number, dist: number, dur = 140): number {
  if (t <= 0) return dist;
  return dist * (1 - easeOutBack(clamp01(t / dur), 1.15));
}

/** a hard shake after an impact at `t0`: alternating offsets, decaying over `dur` ms */
export function shake(t: number, t0: number, amp: number, dur = 130): number {
  const d = t - t0;
  if (d < 0 || d > dur) return 0;
  const f = Math.floor(d / FRAME_MS);
  return (f % 2 === 0 ? 1 : -1) * amp * (1 - d / dur);
}

/** 1 during the first `frames` frames after t0 (a flash frame), else 0 */
export function flashFrames(t: number, t0: number, frames = 2, peak = 1): number {
  const d = t - t0;
  return d >= 0 && d < frames * FRAME_MS ? peak * (1 - d / (frames * FRAME_MS + 1)) : 0;
}

// ---------------------------------------------------------------------------------------------
// cheap DOM writes
// ---------------------------------------------------------------------------------------------

const lastTf = new WeakMap<HTMLElement | SVGElement, string>();
const lastOp = new WeakMap<HTMLElement | SVGElement, string>();
const lastTx = new WeakMap<HTMLElement, string>();
const lastVis = new WeakMap<HTMLElement, string>();
const baseDisplay = new WeakMap<HTMLElement, string>();

/** translate (px), scale, then optional skew (deg); written only when it changes */
export function put(e: HTMLElement, x = 0, y = 0, s = 1, skew = 0): void {
  const tr = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)})${skew ? ` skewX(${skew}deg)` : ''}`;
  if (lastTf.get(e) !== tr) {
    e.style.transform = tr;
    lastTf.set(e, tr);
  }
}
/** scaleX only (bars), from the left edge */
export function putScaleX(e: HTMLElement, sx: number): void {
  const tr = `scaleX(${Math.max(0, sx).toFixed(4)})`;
  if (lastTf.get(e) !== tr) {
    e.style.transform = tr;
    lastTf.set(e, tr);
  }
}
export function fade(e: HTMLElement, o: number): void {
  const v = o <= 0.001 ? '0' : o >= 0.999 ? '1' : o.toFixed(3);
  if (lastOp.get(e) !== v) {
    e.style.opacity = v;
    lastOp.set(e, v);
  }
}
export function text(e: HTMLElement, s: string): boolean {
  if (lastTx.get(e) === s) return false;
  e.textContent = s;
  lastTx.set(e, s);
  return true;
}
export function shown(e: HTMLElement, on: boolean): void {
  if (!baseDisplay.has(e)) baseDisplay.set(e, e.style.display === 'none' ? '' : e.style.display);
  const v = on ? baseDisplay.get(e)! : 'none';
  if (lastVis.get(e) !== v) {
    e.style.display = v;
    lastVis.set(e, v);
  }
}

// ---------------------------------------------------------------------------------------------
// the cut
// ---------------------------------------------------------------------------------------------

/** The diagonal: where the cut crosses the left and right edges of a word's box (fractions of its
 *  height), so it climbs to the right. Every cut word and every plate edge uses this slope. */
export const CUT_L = 0.66;
export const CUT_R = 0.36;
/** plates are cut at this horizontal run per px of height (the same slope as a cut word, roughly) */
export const PLATE_SLOPE = 0.32;

/** a ring of hard text-shadows (an outline) plus a hard offset drop */
export function inkOutline(px: number, drop: number, color: string = PALETTE.ink): string {
  const parts: string[] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push(`${(Math.cos(a) * px).toFixed(1)}px ${(Math.sin(a) * px).toFixed(1)}px 0 ${color}`);
  }
  if (drop > 0) {
    for (let d = 1; d <= drop; d += Math.max(1, Math.floor(drop / 4))) parts.push(`${d + px * 0.6}px ${d + px * 0.6}px 0 ${color}`);
  }
  return parts.join(',');
}

export interface CutWordOpts {
  size: number;
  top: string;
  bottom: string;
  weight?: string;
  skew?: number;
  outline?: number;
  drop?: number;
  /** vertical gap of the cut, as a fraction of the box height */
  gap?: number;
  /** slide of the halves along the cut at rest (px): top goes left, bottom goes right */
  rest?: number;
  letterSpacing?: string;
  lineHeight?: number;
  family?: string;
  /** colour shown inside the letters along the cut (default ink when outlined, else none) */
  back?: string | null;
  /** a text-shadow to use instead of the ink outline and drop */
  shadow?: string;
  /** a CSS background painted inside the letters over the flat colour (a hard-banded fill) */
  fill?: string;
}

/**
 * A word sliced by the diagonal. Two stacked copies of the same text, each clipped to its side of
 * the cut. `root` is positioned by the caller (its transform is the caller's); `pose` moves the
 * halves apart along the cut.
 */
export class CutWord {
  root: HTMLDivElement;
  private inner: HTMLDivElement;
  private sizer: HTMLSpanElement;
  private a: HTMLDivElement;
  private b: HTMLDivElement;
  private c: HTMLDivElement | null;
  private rest: number;
  private txt = '';
  private host: HTMLElement | null;
  /** `parent` should be a box of its own: measure() sizes it to the word */
  constructor(parent: HTMLElement, o: CutWordOpts) {
    this.host = null;
    this.rest = o.rest ?? 0;
    this.root = el('div', parent, { position: 'absolute', left: '0', top: '0', willChange: 'transform, opacity', pointerEvents: 'none' });
    this.inner = el('div', this.root, { position: 'relative', transform: `skewX(${o.skew ?? -12}deg)` });
    const font: Partial<CSSStyleDeclaration> = {
      fontFamily: o.family ?? FONTS.display,
      fontWeight: o.weight ?? '900',
      fontSize: `${o.size}px`,
      lineHeight: String(o.lineHeight ?? 0.86),
      letterSpacing: o.letterSpacing ?? '0',
      whiteSpace: 'nowrap',
      textTransform: 'uppercase',
    };
    const sh = o.shadow ?? (o.outline || o.drop ? inkOutline(o.outline ?? 0, o.drop ?? 0) : 'none');
    // the sizer holds the box (and keeps room for the outline)
    this.sizer = el('span', this.inner, { ...font, display: 'inline-block', visibility: 'hidden', padding: `${(o.outline ?? 0) + 4}px ${(o.outline ?? 0) + 6}px` });
    // a gap of 0 means the word reads whole at rest: the halves overlap a little so no hairline
    // shows along the cut
    const g = (o.gap ?? 0.035) > 0 ? (o.gap ?? 0.035) / 2 : -0.02;
    const l = CUT_L * 100;
    const r = CUT_R * 100;
    const clipA = `polygon(-20% -20%, 120% -20%, 120% ${r - g * 100 - 20 * (CUT_L - CUT_R)}%, 100% ${r - g * 100}%, 0% ${l - g * 100}%, -20% ${l - g * 100 + 20 * (CUT_L - CUT_R)}%)`;
    const clipB = `polygon(-20% ${l + g * 100 + 20 * (CUT_L - CUT_R)}%, 0% ${l + g * 100}%, 100% ${r + g * 100}%, 120% ${r + g * 100 - 20 * (CUT_L - CUT_R)}%, 120% 120%, -20% 120%)`;
    const half = (color: string, clip: string) =>
      el('div', this.inner, {
        ...font,
        position: 'absolute',
        inset: '0',
        color,
        textShadow: sh,
        clipPath: clip,
        padding: `${(o.outline ?? 0) + 4}px ${(o.outline ?? 0) + 6}px`,
        willChange: 'transform',
      });
    const back = o.back !== undefined ? o.back : o.outline ? PALETTE.ink : null;
    this.c = back ? half(back, 'none') : null;
    this.a = half(o.top, clipA);
    this.b = half(o.bottom, clipB);
    // a fill painted inside the letters (no shadow: text-shadow would paint over it), riding each half
    if (o.fill) {
      for (const h of [this.a, this.b]) {
        const fl = el('div', h, {
          ...font, position: 'absolute', inset: '0', color: 'transparent', background: o.fill, backgroundClip: 'text', textShadow: 'none',
          padding: `${(o.outline ?? 0) + 4}px ${(o.outline ?? 0) + 6}px`,
        });
        (fl.style as unknown as Record<string, string>).webkitBackgroundClip = 'text';
        this.fills.push(fl);
      }
    }
    this.pose(0, 1);
  }
  private fills: HTMLDivElement[] = [];
  setText(s: string): void {
    if (s === this.txt) return;
    this.txt = s;
    this.sizer.textContent = s;
    this.a.textContent = s;
    this.b.textContent = s;
    for (let i = 0; i < this.fills.length; i++) {
      this.fills[i].textContent = s;
      (i === 0 ? this.a : this.b).appendChild(this.fills[i]);
    }
    if (this.c) this.c.textContent = s;
  }
  /** width and height of the word's box (reads layout: call only after setText, not per frame) */
  measure(): { w: number; h: number } {
    const w = this.sizer.offsetWidth;
    const h = this.sizer.offsetHeight;
    // the caller's box takes the word's size, so its scale (a slam) works about its own centre
    const p = this.root.parentElement;
    if (p && p !== this.host) {
      p.style.width = `${w}px`;
      p.style.height = `${h}px`;
    }
    return { w, h };
  }
  setColors(top: string, bottom: string): void {
    if (this.a.style.color !== top) this.a.style.color = top;
    if (this.b.style.color !== bottom) this.b.style.color = bottom;
  }
  /** split: 0 = at rest (halves a hair apart), larger = px the halves slide apart along the cut */
  pose(split: number, opacity: number, lift = 0): void {
    const d = this.rest + split;
    // along the cut: it climbs to the right, so the top half goes up-left, the bottom down-right
    const k = 0.32;
    put(this.a, -d, -d * k - lift);
    put(this.b, d, d * k + lift);
    // the backing only fills the cut while the halves are close; once they fly it goes
    if (this.c) fade(this.c, split > 30 ? 0 : 1);
    fade(this.root, opacity);
  }
}

// ---------------------------------------------------------------------------------------------
// plates
// ---------------------------------------------------------------------------------------------

/** clip-path for a plate whose left and/or right edge is cut on the show's slope */
export function slopeClip(h: number, left: boolean, right: boolean): string {
  const run = Math.round(h * PLATE_SLOPE);
  const l0 = left ? `${run}px 0` : '0 0';
  const l1 = '0 100%';
  const r0 = '100% 0';
  const r1 = right ? `calc(100% - ${run}px) 100%` : '100% 100%';
  return `polygon(${l0}, ${r0}, ${r1}, ${l1})`;
}

export interface Plate {
  root: HTMLDivElement;
  face: HTMLDivElement;
  shadow: HTMLDivElement;
}
/** A solid plate with a hard ink offset shadow (a second plate, because clip-path eats box-shadow). */
export function plate(
  parent: HTMLElement,
  box: { left: number; top: number; width: number; height: number },
  bg: string,
  cut: { left?: boolean; right?: boolean } = { right: true },
  drop = 6,
): Plate {
  const root = el('div', parent, {
    position: 'absolute',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    willChange: 'transform, opacity',
  });
  const clip = slopeClip(box.height, !!cut.left, !!cut.right);
  const shadow = el('div', root, { position: 'absolute', inset: '0', background: PALETTE.ink, clipPath: clip, transform: `translate(${drop}px, ${drop}px)` });
  const face = el('div', root, { position: 'absolute', inset: '0', background: bg, clipPath: clip, overflow: 'hidden' });
  if (drop <= 0) shadow.style.display = 'none';
  return { root, face, shadow };
}

// ---------------------------------------------------------------------------------------------
// stance marks (our own glyphs: one per stance, drawn as hard solid shapes)
// ---------------------------------------------------------------------------------------------

const SVGNS = 'http://www.w3.org/2000/svg';
const MARKS: Record<Stance, string> = {
  // two forward chevrons: go in
  rush: 'M2 3 L11 3 L20 12 L11 21 L2 21 L11 12 Z M12 3 L18 3 L27 12 L18 21 L12 21 L21 12 Z',
  // a post with an arrow pointing away from it: hold distance
  keepaway: 'M22 2 L27 2 L27 22 L22 22 Z M2 12 L10 4 L10 9 L19 9 L19 15 L10 15 L10 20 Z',
  // a hook: show something, then take it
  bait: 'M5 2 L11 2 L11 14 Q11 17 14 17 Q17 17 17 14 L17 10 L13 10 L20 3 L27 10 L23 10 L23 14 Q23 23 14 23 Q5 23 5 14 Z',
  // a slab with a foot: hold the line
  wall: 'M9 2 L19 2 L19 19 L25 19 L25 23 L3 23 L3 19 L9 19 Z',
};

/** an inline SVG stance mark, `size` px, mirrored for side 1 so it points at the opponent */
export function stanceMark(parent: HTMLElement, size: number, color: string): { svg: SVGSVGElement; set(stance: Stance | null, side: 0 | 1): void } {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 29 25');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(Math.round((size * 25) / 29)));
  svg.style.display = 'block';
  svg.style.flex = '0 0 auto';
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('fill', color);
  svg.appendChild(path);
  parent.appendChild(svg);
  let key = '';
  return {
    svg,
    set(stance, side) {
      const k = `${stance}:${side}`;
      if (k === key) return;
      key = k;
      path.setAttribute('d', stance ? MARKS[stance] : '');
      svg.style.transform = side === 1 ? 'scaleX(-1)' : '';
    },
  };
}

// ---------------------------------------------------------------------------------------------
// the window clock (predictions and the break share it)
// ---------------------------------------------------------------------------------------------

/**
 * The clock for an open window: one big numeral of seconds left on a navy plate; in the last five
 * seconds the plate flips to hazard and every second kicks.
 * Not betting UI: no odds, no pools, no buttons. Just how long is left.
 */
export class WindowClock {
  root: HTMLDivElement;
  private face: Plate;
  private hot: HTMLDivElement;
  private num: HTMLDivElement;
  private numWrap: HTMLDivElement;
  private urgentOn = false;
  readonly w: number;
  readonly h: number;
  constructor(parent: HTMLElement, x: number, y: number, w = 196, h = 150) {
    this.w = w;
    this.h = h;
    this.root = el('div', parent, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, willChange: 'transform, opacity' });
    this.face = plate(this.root, { left: 0, top: 0, width: w, height: h }, PALETTE.navy, { left: true, right: true }, 7);
    this.hot = el('div', this.face.face, { position: 'absolute', inset: '0', background: PALETTE.hazard, opacity: '0' });
    this.numWrap = el('div', this.face.face, { position: 'absolute', left: '0', right: '0', top: `${Math.round(h * 0.1)}px`, textAlign: 'center', willChange: 'transform' });
    this.num = el('div', this.numWrap, {
      fontFamily: FONTS.display,
      fontWeight: '900',
      fontSize: `${Math.round(h * 0.74)}px`,
      lineHeight: '1',
      color: PALETTE.hazard,
      transform: 'skewX(-10deg)',
      letterSpacing: '-0.01em',
      fontVariantNumeric: 'tabular-nums',
    });
  }
  /** msLeft and durationMs of the window. Returns the seconds shown. */
  update(msLeft: number, durationMs: number): number {
    const secs = Math.max(0, Math.ceil(msLeft / 1000));
    text(this.num, String(secs));
    void durationMs;
    const urgent = msLeft <= 5000;
    if (urgent !== this.urgentOn) {
      this.urgentOn = urgent;
      this.num.style.color = urgent ? PALETTE.navy : PALETTE.hazard;
      fade(this.hot, urgent ? 1 : 0);
    }
    // every second in the last five kicks: the numeral lands big and settles
    if (urgent && msLeft > 0) {
      const into = 1000 - (msLeft % 1000 || 1000);
      put(this.numWrap, 0, 0, slamScale(into, 70, 1.45));
      put(this.root, shake(into, 0, 5, 140), 0);
    } else {
      put(this.numWrap, 0, 0, 1);
      put(this.root, 0, 0);
    }
    return secs;
  }
}

/** count words the way the 20-word rule does: any run of letters or digits */
export function words(...parts: (string | null | undefined)[]): number {
  let n = 0;
  for (const p of parts) if (p) n += (p.match(/[A-Za-z0-9%']+/g) ?? []).length;
  return n;
}

/** fit a single line of display type into `maxW` px: returns the font size to use */
export function fitSize(textLen: number, base: number, maxW: number, emPerChar = 0.47): number {
  const need = textLen * emPerChar * base;
  return need <= maxW ? base : Math.max(24, Math.floor(maxW / (textLen * emPerChar)));
}

// ---------------------------------------------------------------------------------------------
// the countdown's clock (shared by the countdown and the break's lock beat)
// ---------------------------------------------------------------------------------------------

export interface CountdownInfo {
  /** ms from the phase start to tick 0 (the playback's countdown plus its delay) */
  total: number;
  /** how many numbers are called (3 at the start, fewer on a short resume) */
  nums: number;
  /** the lock beat runs from the phase start for this long, then the numbers */
  lockLen: number;
  /** ms until tick 0 */
  left: number;
  /** ms since tick 0 (negative before) */
  goT: number;
  /** the first countdown of the match (else a resume) */
  isStart: boolean;
}

/** Reads the countdown of the current fight phase. The total is phaseMs + countdownMs while the
 *  countdown runs (exact for any frame); a viewer who joins after it ends falls back to `fallback`. */
export class CountdownTrack {
  private key = NaN;
  private total = 0;
  read(
    phaseMs: number,
    now: number,
    countdownMs: number,
    lives: [number, number] | undefined,
    fullLives: number,
    fallback: (isStart: boolean) => number,
  ): CountdownInfo {
    const key = Math.round(now - phaseMs);
    if (countdownMs > 0) {
      this.key = key;
      this.total = phaseMs + countdownMs;
    }
    const isStart = !lives || (lives[0] >= fullLives && lives[1] >= fullLives);
    const total = key === this.key ? this.total : fallback(isStart);
    const nums = Math.max(1, Math.min(3, Math.floor((total - 300) / 1000)));
    return { total, nums, lockLen: Math.max(0, total - nums * 1000), left: Math.max(0, total - phaseMs), goT: phaseMs - total, isStart };
  }
}

/** a hex bolt head: the lives token. Filled = a life left, hollow = gone. */
export function boltToken(parent: HTMLElement, size: number, slot: string): { root: HTMLDivElement; fill: SVGPathElement; set(on: boolean): void } {
  const root = el('div', parent, { position: 'relative', width: `${size}px`, height: `${size}px`, flex: '0 0 auto', willChange: 'transform, opacity' });
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.style.display = 'block';
  const hex = 'M12 1 L22 6.5 L22 17.5 L12 23 L2 17.5 L2 6.5 Z';
  const back = document.createElementNS(SVGNS, 'path');
  back.setAttribute('d', hex);
  back.setAttribute('fill', PALETTE.ink);
  back.setAttribute('transform', 'translate(1.6 1.6)');
  const fill = document.createElementNS(SVGNS, 'path');
  fill.setAttribute('d', hex);
  const slotP = document.createElementNS(SVGNS, 'path');
  slotP.setAttribute('d', 'M6 13.6 L18 9 L18 11.6 L6 16.2 Z');
  svg.append(back, fill, slotP);
  root.appendChild(svg);
  let st: boolean | null = null;
  return {
    root,
    fill,
    set(on) {
      if (on === st) return;
      st = on;
      fill.setAttribute('fill', on ? PALETTE.white : PALETTE.steel);
      fill.setAttribute('stroke', on ? 'none' : PALETTE.steelLight);
      fill.setAttribute('stroke-width', on ? '0' : '1.5');
      slotP.setAttribute('fill', on ? slot : PALETTE.navy);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// camera space: a robot (or anything) locked to the camera, placed in 1280x720 UI px
// ---------------------------------------------------------------------------------------------

/**
 * A group glued to the camera `depth` m in front of it, with a child `px` scaled so one unit is one
 * UI px (x right from the left edge, y down from the top). Call sync() every frame it is visible,
 * after the camera module has moved the camera (screens update after it).
 */
export class CamSpace {
  readonly root = new THREE.Group();
  readonly px = new THREE.Group();
  private ctx: StageCtx;
  private depth: number;
  constructor(ctx: StageCtx, depth: number) {
    this.ctx = ctx;
    this.depth = depth;
    this.root.add(this.px);
    this.root.visible = false;
    ctx.scene.add(this.root);
  }
  sync(): void {
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    cam.matrixWorld.decompose(this.root.position, this.root.quaternion, this.root.scale);
    this.root.scale.set(1, 1, 1);
    const halfH = this.depth * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const k = (2 * halfH) / UI_H;
    const kx = k * (cam.aspect / (UI_W / UI_H));
    this.px.position.set((-UI_W / 2) * kx, (UI_H / 2) * k, -this.depth);
    this.px.scale.set(kx, -k, k);
  }
  dispose(): void {
    this.root.removeFromParent();
  }
}

/** A fighter view standing in camera space: feet at a UI px point, a given px height. */
export class HeroRobot {
  readonly holder = new THREE.Group();
  readonly view: FighterView;
  readonly id: FighterId;
  private facing: 1 | -1 = 1;
  private side: Side;
  private h: number;
  constructor(ctx: StageCtx, parent: THREE.Object3D, id: FighterId, side: Side, alt: boolean, layer: number) {
    this.id = id;
    this.side = side;
    this.h = ctx.fighterDefs[id]?.height ?? 2;
    this.view = screenFighter(ctx, id, side, ctx.sideColors[side], alt);
    const flip = new THREE.Group();
    flip.scale.set(1, -1, 1);
    this.holder.add(flip);
    flip.add(this.view.root);
    parent.add(this.holder);
    this.face(1, true);
    this.view.root.traverse((o) => {
      o.layers.set(layer);
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }
  face(f: 1 | -1, force = false): void {
    if (f === this.facing && !force) return;
    this.facing = f;
    const s = restState(this.id, f);
    try {
      this.view.pose(s, s, 1, restState(this.id, f === 1 ? -1 : 1), 0, this.side);
    } catch {
      /* a view under construction elsewhere: showPose still places it */
    }
  }
  private boxes = new Map<string, { cx: number; top: number; bottom: number; w: number }>();
  /** the robot's box in its own units (y down) for a pose, measured once per pose and facing */
  box(pose: 'win' | 'versus' | 'wait', t: number): { cx: number; top: number; bottom: number; w: number } {
    const k = `${pose}|${this.facing}`;
    let b = this.boxes.get(k);
    if (b) return b;
    const pos = this.holder.position.clone();
    const sc = this.holder.scale.clone();
    this.holder.position.set(0, 0, 0);
    this.holder.scale.set(1, 1, 1);
    this.view.showPose(pose, t);
    this.holder.updateMatrixWorld(true);
    // only what is drawn and solid: skip hidden parts and see-through ones (ground marks, smears)
    const inv = this.holder.matrixWorld.clone().invert();
    const lb = new THREE.Box3();
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    this.view.root.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((mt) => !mt || mt.transparent || !mt.visible)) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const gb = mesh.geometry.boundingBox!;
      m.multiplyMatrices(inv, mesh.matrixWorld);
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z).applyMatrix4(m);
        lb.expandByPoint(v);
      }
    });
    this.holder.position.copy(pos);
    this.holder.scale.copy(sc);
    b = { cx: (lb.min.x + lb.max.x) / 2, top: lb.min.y, bottom: lb.max.y, w: lb.max.x - lb.min.x };
    if (!isFinite(b.top) || b.bottom - b.top < 0.2) b = { cx: 0, top: -this.h, bottom: 0, w: this.h * 0.6 };
    this.boxes.set(k, b);
    return b;
  }
  /** fit a measured pose box: its centre at x, its top and bottom at the given UI px */
  fit(pose: 'win' | 'versus' | 'wait', t: number, x: number, top: number, bottom: number, flat = 1, maxW = Infinity): void {
    const b = this.box(pose, t);
    const k = Math.min((bottom - top) / (b.bottom - b.top), maxW / Math.max(0.01, b.w));
    this.holder.position.set(x - b.cx * k, bottom - b.bottom * k, 0);
    this.holder.scale.set(k, k, k * flat);
  }
  /** feet at (x, y) UI px, `heightPx` tall; `flat` squashes depth so a big robot keeps its shape */
  place(x: number, y: number, heightPx: number, flat = 1): void {
    const k = heightPx / this.h;
    this.holder.position.set(x, y, 0);
    this.holder.scale.set(k, k, k * flat);
  }
  dispose(): void {
    this.view.dispose();
    this.holder.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------------
// call dressing: arc flicks and slope streaks (only ever around a call that just slammed)
// ---------------------------------------------------------------------------------------------

function h01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Welding arcs that jump off the edges of a call for its first frames: jagged arc-white strokes with
 * an ember edge, re-dealt every two frames, fewer each time, gone by `frames`. Our version of the
 * electricity a big call crackles with. SVG laid out in UI px.
 */
export class ArcFlicks {
  readonly svg: SVGSVGElement;
  private paths: { under: SVGPathElement; over: SVGPathElement }[] = [];
  private last = -1;
  constructor(parent: HTMLElement, n = 9, under: string = PALETTE.ember, over: string = PALETTE.white) {
    const NS = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('width', '1280');
    this.svg.setAttribute('height', '720');
    this.svg.setAttribute('viewBox', '0 0 1280 720');
    Object.assign(this.svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible', pointerEvents: 'none' });
    for (let i = 0; i < n; i++) {
      const u = document.createElementNS(NS, 'path');
      u.setAttribute('fill', 'none');
      u.setAttribute('stroke', under);
      u.setAttribute('stroke-width', '13');
      u.setAttribute('stroke-linejoin', 'miter');
      const o = document.createElementNS(NS, 'path');
      o.setAttribute('fill', 'none');
      o.setAttribute('stroke', over);
      o.setAttribute('stroke-width', '5.5');
      o.setAttribute('stroke-linejoin', 'miter');
      this.svg.append(u, o);
      this.paths.push({ under: u, over: o });
    }
    parent.appendChild(this.svg);
  }
  /** t ms since the slam; the call's box in UI px. Returns whether anything is drawn. */
  update(t: number, box: { x: number; y: number; w: number; h: number }, frames = 14, seed = 0): boolean {
    const f = Math.floor(t / FRAME_MS);
    const on = t >= 0 && f < frames;
    this.svg.style.display = on ? '' : 'none';
    if (!on) return false;
    const deal = Math.floor(f / 2);
    if (deal === this.last) return true;
    this.last = deal;
    const live = Math.max(2, Math.round(this.paths.length * (1 - f / frames)));
    for (let i = 0; i < this.paths.length; i++) {
      const p = this.paths[i];
      if (i >= live) {
        p.under.setAttribute('d', '');
        p.over.setAttribute('d', '');
        continue;
      }
      const k = seed * 31 + deal * 7.3 + i * 13.1;
      // start on the box edge, run outward in 4 to 6 hard kinks
      const side = Math.floor(h01(k) * 4);
      const along = h01(k + 1);
      let x = side === 0 ? box.x + along * box.w : side === 1 ? box.x + box.w : side === 2 ? box.x + along * box.w : box.x;
      let y = side === 0 ? box.y : side === 1 ? box.y + along * box.h : side === 2 ? box.y + box.h : box.y + along * box.h;
      const dx = side === 1 ? 1 : side === 3 ? -1 : (h01(k + 2) - 0.5) * 1.2;
      const dy = side === 0 ? -1 : side === 2 ? 1 : (h01(k + 3) - 0.5) * 1.2;
      let d = `M${x.toFixed(0)} ${y.toFixed(0)}`;
      const n = 3 + Math.floor(h01(k + 4) * 3);
      for (let j = 0; j < n; j++) {
        const step = 18 + h01(k + 5 + j) * 26;
        const kink = (h01(k + 9 + j) - 0.5) * 56;
        x += dx * step - dy * kink;
        y += dy * step + dx * kink;
        d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
      }
      p.under.setAttribute('d', d);
      p.over.setAttribute('d', d);
    }
    return true;
  }
}

/** Speed streaks along the show's slope that rip through a call as it enters (hard bars, no blur). */
export class SlopeStreaks {
  readonly root: HTMLDivElement;
  private bars: HTMLDivElement[] = [];
  constructor(parent: HTMLElement, n = 9, colors: string[] = [PALETTE.white, PALETTE.hazard, PALETTE.white, PALETTE.ink]) {
    this.root = el('div', parent, { position: 'absolute', left: '0', top: '0', width: '1280px', height: '720px', display: 'none', pointerEvents: 'none' });
    for (let i = 0; i < n; i++) {
      this.bars.push(el('div', this.root, {
        position: 'absolute', left: '0', top: '0', width: `${260 + h01(i + 40) * 420}px`, height: `${3 + Math.floor(h01(i + 70) * 3) * 4}px`,
        background: colors[i % colors.length], willChange: 'transform', transformOrigin: '0 50%',
      }));
      this.bars[i].style.rotate = '-17.7deg';
    }
  }
  /** t ms since the call started entering; it streaks for `dur` ms around the box centre (cx, cy) */
  update(t: number, cx: number, cy: number, spread: number, dur = 170, dir = 1): void {
    const on = t >= 0 && t < dur;
    shown(this.root, on);
    if (!on) return;
    const p = t / dur;
    for (let i = 0; i < this.bars.length; i++) {
      const off = (h01(i + 3) - 0.5) * 2 * spread;
      const lag = h01(i + 11) * 0.35;
      const q = clamp01((p - lag) / (1 - lag));
      // along the slope: x runs, y climbs at the show's angle
      const run = (q - 0.5) * 2600 * dir;
      const x = cx + run - 300;
      const y = cy + off - run * 0.32;
      put(this.bars[i], x, y, 1, 0);
      fade(this.bars[i], q > 0 && q < 1 ? 1 : 0);
    }
  }
}
