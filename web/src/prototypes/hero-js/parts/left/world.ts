// Shared by the TV, the hills and the walkers: the line where the game world spills out of the screen and
// down to the ground, and the surface the walkers step on. Pure functions of x and time.
import { groundY } from '../../engine/layout';
import type { Pt } from '../../engine/types';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/** Smooth curve y(x) through the points (cubic Hermite with Catmull-Rom tangents). */
export function hermite(pts: readonly Pt[], x: number): number {
  const n = pts.length;
  if (x <= pts[0]![0]) return pts[0]![1];
  if (x >= pts[n - 1]![0]) return pts[n - 1]![1];
  let i = 1;
  while (pts[i]![0] < x) i++;
  const a = pts[i - 1]!, b = pts[i]!;
  const p = pts[Math.max(0, i - 2)]!, q = pts[Math.min(n - 1, i + 1)]!;
  const h = b[0] - a[0];
  const ma = ((b[1] - p[1]) / (b[0] - p[0])) * h;
  const mb = ((q[1] - a[1]) / (q[0] - a[0])) * h;
  const u = (x - a[0]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * ma + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * mb;
}

/** The top of the spill: starts as a point at the screen's bottom edge, runs over the bezel and down to the ground. */
const SPILL: readonly Pt[] = [
  [410, 486], [450, 462], [500, 458], [560, 468], [640, 488], [720, 512], [800, 550], [870, 600], [930, 650], [990, 705],
];
export const SPILL_X0 = 410;
export const SPILL_X1 = 990;

/** A slow wave travelling outward along a hill line, so the world looks like it is still flowing out. */
export function flow(x: number, t: number, amp: number): number {
  return amp * (0.62 * Math.sin(x / 68 - t * 1.55) + 0.38 * Math.sin(x / 31 - t * 2.35 + 1.1));
}

export function spillTop(x: number, t: number): number {
  const amp = 6 * smooth(SPILL_X0, SPILL_X0 + 60, x) * (1 - smooth(850, 975, x));
  return hermite(SPILL, x) + flow(x, t, amp);
}

/** Where a walker's feet go: the spill while it is above the ground, then the ground. */
export function walkY(x: number, t: number): number {
  return x < 985 ? Math.min(groundY(x), spillTop(x, t)) : groundY(x);
}

export function circle(cx: number, cy: number, r: number, n = 28, ry = r): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Rounded rectangle outline, clockwise from the top-left corner's end. */
export function roundRect(x: number, y: number, w: number, h: number, r: number, n = 6): Pt[] {
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  out.push(out[0]!);
  return out;
}
