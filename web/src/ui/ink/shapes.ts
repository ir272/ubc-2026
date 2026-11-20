// The few shapes the kit is drawn from. Each one is a motif that appears on Ian's chart reference:
// ruled lines that run past the corner and cross, pencil hatching, the checkered border,
// the medallion's rings and its four-point stars.

import { makeRng } from './rng';
import { stroke, type Pen, type Pt, type Stroke } from './stroke';

export const PEN = {
  /** the chart's ruled lines */
  rule: { w: 1.3, wobble: 0.5, dry: 0.45 },
  /** rhumb lines, inner rings */
  fine: { w: 0.9, wobble: 0.45, dry: 0.6 },
  /** coastlines, the selected thing */
  bold: { w: 1.9, wobble: 0.7, dry: 0.3 },
  /** coloured-pencil shading */
  pencil: { w: 1.15, wobble: 0.6, dry: 0.95 },
} satisfies Record<string, Pen>;

/** Four ruled lines that overshoot the corners and cross. Order: top, right, bottom, left. */
export function ruledBox(x: number, y: number, w: number, h: number, seed: string, pen: Pen = PEN.rule, over = 5): Stroke[] {
  const r = makeRng(seed);
  const o = () => over * (0.55 + 0.9 * r());
  const k = () => (r() - 0.5) * 0.8;
  const t: Pt[] = [[x - o(), y + k()], [x + w + o(), y + k()]];
  const rt: Pt[] = [[x + w + k(), y - o()], [x + w + k(), y + h + o()]];
  const b: Pt[] = [[x + w + o(), y + h + k()], [x - o(), y + h + k()]];
  const l: Pt[] = [[x + k(), y + h + o()], [x + k(), y - o()]];
  return [stroke(t, pen, seed + ':t'), stroke(rt, pen, seed + ':r'), stroke(b, pen, seed + ':b'), stroke(l, pen, seed + ':l')];
}

/** One ruled line. */
export function rule(x1: number, y1: number, x2: number, y2: number, seed: string, pen: Pen = PEN.rule): Stroke {
  return stroke([[x1, y1], [x2, y2]], pen, seed);
}

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Pt[] {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 2.5));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** A rounded box drawn in one go, clockwise from the top left; the end runs a little past the start, as a hand does. */
export function loopBox(x: number, y: number, w: number, h: number, r: number, seed: string, pen: Pen = PEN.rule, overlap = 9): Stroke {
  const rr = Math.min(r, w / 2, h / 2);
  const q = Math.PI / 2;
  const rng = makeRng(seed);
  const lift = 0.5 + rng() * 0.7;
  const pts: Pt[] = [
    [x + rr, y],
    ...arc(x + w - rr, y + rr, rr, rr, -q, 0),
    ...arc(x + w - rr, y + h - rr, rr, rr, 0, q),
    ...arc(x + rr, y + h - rr, rr, rr, q, 2 * q),
    ...arc(x + rr, y + rr, rr, rr, 2 * q, 3 * q).map(([px, py], i, a): Pt => [px, py - (lift * i) / a.length]),
    [x + rr + Math.min(overlap, w - 2 * rr), y - lift - 0.4],
  ];
  return stroke(pts, { ...pen, ends: 'taper' }, seed);
}

/** A ring drawn by hand: slightly out of round, ends overlapping. */
export function ring(cx: number, cy: number, r: number, seed: string, pen: Pen = PEN.rule): Stroke {
  const rng = makeRng(seed);
  const a0 = -Math.PI / 2 + (rng() - 0.5) * 1.2;
  const over = 0.22 + rng() * 0.14;
  const n = Math.max(16, Math.ceil((2 * Math.PI * r) / 2.4));
  const squash = 1 + (rng() - 0.5) * 0.03;
  const pts: Pt[] = [];
  const total = 2 * Math.PI + over;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + total * t;
    const rr = r * (1 + 0.012 * Math.sin(a * 2 + rng.fork('ph')() * 6)) + (t > 0.9 ? (t - 0.9) * 10 * 0.9 : 0);
    pts.push([cx + Math.cos(a) * rr * squash, cy + (Math.sin(a) * rr) / squash]);
  }
  return stroke(pts, { ...pen, ends: 'taper' }, seed);
}

/**
 * Pencil hatching inside a rectangle: parallel strokes laid down back and forth.
 * Returns one path; fill it with a pencil colour.
 */
export function hatch(
  x: number, y: number, w: number, h: number, seed: string,
  o: { gap?: number; angle?: number; pen?: Pen } = {},
): string {
  if (w <= 1 || h <= 1) return '';
  const rng = makeRng(seed);
  const gap = o.gap ?? 4;
  const th = ((o.angle ?? -58) * Math.PI) / 180;
  const ux = Math.cos(th);
  const uy = Math.sin(th);
  const nx = -uy;
  const ny = ux;
  const corners: Pt[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const cs = corners.map(([px, py]) => px * nx + py * ny);
  const cMin = Math.min(...cs);
  const cMax = Math.max(...cs);
  let d = '';
  let i = 0;
  for (let c = cMin + gap * (0.3 + 0.5 * rng()); c < cMax; c += gap * (0.72 + 0.56 * rng())) {
    // clip p = c*n + t*u to the rectangle
    let t0 = -Infinity;
    let t1 = Infinity;
    const ox = c * nx;
    const oy = c * ny;
    const slab = (o0: number, dir: number, lo: number, hi: number) => {
      if (Math.abs(dir) < 1e-6) {
        if (o0 < lo || o0 > hi) t1 = -Infinity;
        return;
      }
      const a = (lo - o0) / dir;
      const b = (hi - o0) / dir;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    };
    slab(ox, ux, x, x + w);
    slab(oy, uy, y, y + h);
    if (t1 - t0 < 2.5) continue;
    const a = t0 + rng() * 1.6;
    const b = t1 - rng() * 1.6;
    const p0: Pt = [ox + a * ux, oy + a * uy];
    const p1: Pt = [ox + b * ux, oy + b * uy];
    d += stroke(i % 2 ? [p1, p0] : [p0, p1], o.pen ?? PEN.pencil, `${seed}:${i}`).d;
    i++;
  }
  return d;
}

/** A filled plate with a hand-cut edge. */
export function plate(x: number, y: number, w: number, h: number, seed: string): string {
  const rng = makeRng(seed);
  const j = () => (rng() - 0.5) * 1.1;
  const p = (px: number, py: number) => `${(px + j()).toFixed(2)} ${(py + j()).toFixed(2)}`;
  const mx = x + w / 2;
  const my = y + h / 2;
  return `M${p(x + 1.2, y)}L${p(mx, y)}L${p(x + w - 1.2, y)}L${p(x + w, y + 1.2)}L${p(x + w, my)}L${p(x + w, y + h - 1.2)}L${p(x + w - 1.2, y + h)}L${p(mx, y + h)}L${p(x + 1.2, y + h)}L${p(x, y + h - 1.2)}L${p(x, my)}L${p(x, y + 1.2)}Z`;
}

/** The four-point star from the chart's moon medallion. */
export function star4(cx: number, cy: number, r: number, seed: string): string {
  const rng = makeRng(seed);
  const tip = (a: number, k: number): [number, number] => {
    const rr = r * k * (0.94 + 0.12 * rng());
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  const q = Math.PI / 2;
  const tips = [tip(-q, 1.12), tip(0, 0.86), tip(q, 1.12), tip(2 * q, 0.86)];
  const inner = (a: number): [number, number] => {
    const rr = r * 0.17 * (0.9 + 0.2 * rng());
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  const ctr = [inner(-q / 2), inner(q / 2), inner(1.5 * q), inner(2.5 * q)];
  const s = ([a, b]: [number, number]) => `${a.toFixed(2)} ${b.toFixed(2)}`;
  let d = `M${s(tips[0]!)}`;
  for (let i = 0; i < 4; i++) d += `Q${s(ctr[i]!)} ${s(tips[(i + 1) % 4]!)}`;
  return d + 'Z';
}

/** A tick, drawn as one stroke. `size` is its width. */
export function check(cx: number, cy: number, size: number, seed: string, pen: Pen = PEN.bold): Stroke {
  const pts: Pt[] = [
    [cx - size * 0.5, cy + size * 0.02],
    [cx - size * 0.14, cy + size * 0.36],
    [cx + size * 0.5, cy - size * 0.4],
  ];
  return stroke(pts, { ...pen, wobble: 0.3 }, seed);
}

/** A whole drawing treated as one stroke for the draw-on mask: it wipes in left to right. */
export function wipe(d: string, x: number, y: number, w: number, h: number): Stroke {
  return { d, guide: `M${x - 2} ${y + h / 2}L${x + w + 2} ${y + h / 2}`, len: w, w: (h + 6) / 3 };
}

/**
 * The chart's checkered border: a band between two ruled lines, cells alternately filled,
 * with runs of gold. Returns the two rule sets, the ink cells, the gold cells, and a guide that
 * walks the band once (for drawing it on).
 */
export function checkerBand(w: number, h: number, t: number, seed: string, cell = 9) {
  const rng = makeRng(seed);
  const outer = ruledBox(0, 0, w, h, seed + ':o', PEN.rule, 4);
  const inner = ruledBox(t, t, w - 2 * t, h - 2 * t, seed + ':i', PEN.fine, 0);
  let ink = '';
  let gold = '';
  const g = 1.3; // gap to the rules
  let run = 0;
  let isGold = false;
  let idx = 0;
  const quad = (ax: number, ay: number, bx: number, by: number, horiz: boolean) => {
    idx++;
    if (run <= 0) {
      isGold = !isGold && rng() < 0.3;
      run = isGold ? 3 + Math.floor(rng() * 4) : 4 + Math.floor(rng() * 9);
    }
    run--;
    if (idx % 2) return;
    const j = () => ((rng() - 0.5) * 0.9).toFixed(2);
    const x0 = Math.min(ax, bx) + (horiz ? 0.6 : g);
    const x1 = Math.max(ax, bx) - (horiz ? 0.6 : g);
    const y0 = Math.min(ay, by) + (horiz ? g : 0.6);
    const y1 = Math.max(ay, by) - (horiz ? g : 0.6);
    const p = `M${x0 + +j()} ${y0 + +j()}L${x1 + +j()} ${y0 + +j()}L${x1 + +j()} ${y1 + +j()}L${x0 + +j()} ${y1 + +j()}Z`;
    if (isGold) gold += p;
    else ink += p;
  };
  const along = (len: number) => {
    const n = Math.max(1, Math.round(len / cell));
    return { n, s: len / n };
  };
  const top = along(w - 2 * t);
  for (let i = 0; i < top.n; i++) quad(t + i * top.s, 0, t + (i + 1) * top.s, t, true);
  const right = along(h - 2 * t);
  for (let i = 0; i < right.n; i++) quad(w - t, t + i * right.s, w, t + (i + 1) * right.s, false);
  for (let i = top.n - 1; i >= 0; i--) quad(t + i * top.s, h - t, t + (i + 1) * top.s, h, true);
  for (let i = right.n - 1; i >= 0; i--) quad(0, t + i * right.s, t, t + (i + 1) * right.s, false);
  const m = t / 2;
  const guide = `M${m} ${m}L${w - m} ${m}L${w - m} ${h - m}L${m} ${h - m}L${m} ${m}`;
  const cells = (d: string): Stroke => ({ d, guide, len: 2 * (w + h), w: (t + 2) / 3 });
  return { outer, inner, ink: cells(ink), gold: cells(gold) };
}

/** Short radial pencil marks between two radii: the rope ring of the medallion. */
export function radialTicks(cx: number, cy: number, r0: number, r1: number, seed: string, gap = 3.2): string {
  const rng = makeRng(seed);
  const n = Math.max(8, Math.round((2 * Math.PI * ((r0 + r1) / 2)) / gap));
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = ((i + (rng() - 0.5) * 0.5) / n) * 2 * Math.PI;
    const lean = a + 0.35;
    const p0: Pt = [cx + Math.cos(a) * (r0 + rng() * 0.5), cy + Math.sin(a) * (r0 + rng() * 0.5)];
    const p1: Pt = [cx + Math.cos(lean) * (r1 - rng() * 0.5), cy + Math.sin(lean) * (r1 - rng() * 0.5)];
    d += stroke([p0, p1], { w: 0.85, wobble: 0.2, dry: 0.8 }, `${seed}:${i}`).d;
  }
  return d;
}
