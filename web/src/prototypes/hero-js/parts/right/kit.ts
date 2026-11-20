// Small geometry and timing helpers shared by the couch and the tree (right side of the hero).
import type { Pt } from '../../engine/types';

export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mod = (a: number, p: number) => ((a % p) + p) % p;
/** a sine with a period in seconds */
export const osc = (t: number, period: number, phase = 0) => Math.sin((t * TAU) / period + phase);
/** 0 outside [a, b], 1 inside, with smooth ramps of length `ramp` at both ends */
export const bump = (u: number, a: number, b: number, ramp: number) =>
  smooth((u - a) / ramp) * (1 - smooth((u - (b - ramp)) / ramp));
export const polar = (p: Pt, a: number, len: number): Pt => [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len];
export const add = (p: Pt, dx: number, dy: number): Pt => [p[0] + dx, p[1] + dy];

/** a closed list of points (first point repeated at the end so a partial reveal still closes) */
export function closeLoop(pts: readonly Pt[]): Pt[] {
  return [...pts, pts[0]!];
}

/** points round a centre; `rf(theta)` gives the radius */
export function ring(c: Pt, rf: number | ((th: number) => number), n = 28, a0 = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const th = a0 + (i / n) * TAU;
    const r = typeof rf === 'number' ? rf : rf(th);
    out.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r]);
  }
  return out;
}

/** the outline of a thick limb along a centre line: sides offset by half the width, round caps at both ends */
export function limb(c: readonly Pt[], w: number | readonly number[], capSteps = 6): Pt[] {
  const n = c.length;
  const wd = (i: number) => (typeof w === 'number' ? w : w[i]!) / 2;
  const nrm: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = c[i + 1]![0] - c[i]![0];
    const dy = c[i + 1]![1] - c[i]![1];
    const l = Math.hypot(dx, dy) || 1;
    nrm.push([-dy / l, dx / l]);
  }
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let nx: number, ny: number;
    if (i === 0) [nx, ny] = nrm[0]!;
    else if (i === n - 1) [nx, ny] = nrm[n - 2]!;
    else {
      const a = nrm[i - 1]!, b = nrm[i]!;
      nx = a[0] + b[0];
      ny = a[1] + b[1];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const d = Math.max(0.6, nx * a[0] + ny * a[1]);
      nx /= d;
      ny /= d;
    }
    const h = wd(i);
    const p = c[i]!;
    L.push([p[0] + nx * h, p[1] + ny * h]);
    R.push([p[0] - nx * h, p[1] - ny * h]);
  }
  const out: Pt[] = [...L];
  const ne = nrm[n - 2]!;
  const ae = Math.atan2(ne[1], ne[0]);
  for (let s = 1; s < capSteps; s++) out.push(polar(c[n - 1]!, ae - (Math.PI * s) / capSteps, wd(n - 1)));
  for (let i = n - 1; i >= 0; i--) out.push(R[i]!);
  const n0 = nrm[0]!;
  const a0 = Math.atan2(n0[1], n0[0]);
  for (let s = 1; s < capSteps; s++) out.push(polar(c[0]!, a0 + Math.PI - (Math.PI * s) / capSteps, wd(0)));
  return out;
}

/** a rounded rectangle as points */
export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): Pt[] {
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a: number) => {
    for (let s = 0; s <= 4; s++) out.push(polar([cx, cy], a + (s / 4) * (Math.PI / 2), r));
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return out;
}

/** reveal of step i of n spread through the window [a, b] of the part's reveal, each step taking `dur` */
export function stepper(reveal: number, a: number, b: number, n: number, dur: number) {
  return (i: number) => {
    const start = a + ((b - a - dur) * i) / Math.max(1, n - 1);
    return clamp01((reveal - start) / dur);
  };
}
