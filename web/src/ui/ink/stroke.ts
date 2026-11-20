// One pen stroke. The line is not an SVG stroke: it is a filled ribbon whose width follows a
// pressure model (slower and heavier at the ends and in corners, lighter on the straights), with a
// seeded wobble and a dry-pen tooth. `guide` is the centre line, used as a mask to draw the ribbon on.

import { clamp, makeRng, noise1 } from './rng';

export type Pt = readonly [number, number];

export interface Pen {
  /** nominal width in px */
  w: number;
  /** 0 = ruler straight, 1 = a steady hand */
  wobble?: number;
  /** 0..1, how much the pen skips on the paper */
  dry?: number;
  /** how the stroke starts and stops; `none` for closed loops */
  ends?: 'taper' | 'blunt' | 'none';
}

export interface Stroke {
  /** closed outline, to be filled */
  d: string;
  /** centre line, for the draw-on mask */
  guide: string;
  len: number;
  w: number;
}

const f = (n: number) => String(Math.round(n * 100) / 100);

function resample(pts: readonly Pt[], step: number): { X: number[]; Y: number[] } {
  const X = [pts[0]![0]];
  const Y = [pts[0]![1]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg === 0) continue;
    let d = step - carry;
    while (d <= seg) {
      X.push(ax + ((bx - ax) * d) / seg);
      Y.push(ay + ((by - ay) * d) / seg);
      d += step;
    }
    carry = seg - (d - step);
  }
  const [lx, ly] = pts[pts.length - 1]!;
  const n = X.length - 1;
  if (Math.hypot(X[n]! - lx, Y[n]! - ly) > step * 0.35) {
    X.push(lx);
    Y.push(ly);
  } else if (n > 0) {
    X[n] = lx;
    Y[n] = ly;
  }
  return { X, Y };
}

export function stroke(points: readonly Pt[], pen: Pen, seed: string): Stroke {
  const rng = makeRng(seed);
  const step = pen.w < 1.2 ? 1.8 : 2.2;
  const { X, Y } = resample(points, step);
  const N = X.length;
  if (N < 2) return { d: '', guide: '', len: 0, w: pen.w };

  const S = new Array<number>(N).fill(0);
  for (let i = 1; i < N; i++) S[i] = S[i - 1]! + Math.hypot(X[i]! - X[i - 1]!, Y[i]! - Y[i - 1]!);
  const L = S[N - 1]!;

  // wobble: a slow drift plus a faint tremor, both off the line's normal
  const wob = pen.wobble ?? 1;
  if (wob > 0 && N > 2) {
    const nLow = noise1(rng.fork('low'), 70);
    const nMid = noise1(rng.fork('mid'), 22);
    const nTr = noise1(rng.fork('tr'), 4.5);
    const amp = 0.75 * wob * clamp(L / 120, 0.25, 1.25);
    const dx = new Array<number>(N);
    const dy = new Array<number>(N);
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(N - 1, i + 1);
      const tx = X[b]! - X[a]!;
      const ty = Y[b]! - Y[a]!;
      const l = Math.hypot(tx, ty) || 1;
      const off = amp * (nLow(S[i]!) + 0.3 * nMid(S[i]!)) + 0.13 * wob * nTr(S[i]!);
      dx[i] = (ty / l) * off;
      dy[i] = (-tx / l) * off;
    }
    for (let i = 0; i < N; i++) {
      X[i] = X[i]! + dx[i]!;
      Y[i] = Y[i]! + dy[i]!;
    }
  }

  // tangents, normals, turning
  const NX = new Array<number>(N);
  const NY = new Array<number>(N);
  const th = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(N - 1, i + 1);
    const tx = X[b]! - X[a]!;
    const ty = Y[b]! - Y[a]!;
    const l = Math.hypot(tx, ty) || 1;
    NX[i] = ty / l;
    NY[i] = -tx / l;
    th[i] = Math.atan2(ty, tx);
  }
  const wrap = (a: number) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);
  const ends = pen.ends ?? 'taper';

  // pen speed 0..1: slow at the start, the stop and in corners
  const V = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(N - 1, i + 2);
    const turn = Math.abs(wrap(th[b]! - th[a]!)) / Math.max(1, b - a);
    const vC = 1 / (1 + turn * 6);
    const vA = ends === 'none' ? 1 : Math.min(1, Math.sqrt((S[i]! + 0.6) / 9));
    const vD = ends === 'none' ? 1 : Math.min(1, Math.sqrt((L - S[i]! + 0.6) / 12));
    V[i] = Math.min(vA, vD, vC);
  }

  const nW = noise1(rng.fork('w'), 9);
  const nP = noise1(rng.fork('p'), 40);
  const nTooth = noise1(rng.fork('tooth'), 6);
  const dry = pen.dry ?? 0.5;
  const hw = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    const s = S[i]!;
    let h = 0.5 * pen.w * (0.8 + 0.42 * (1 - V[i]!)) * (1 + 0.12 * nW(s)) * (1 + 0.09 * nP(s));
    if (ends !== 'none') {
      const t0 = Math.min(0.3 * L, 4);
      const t1 = Math.min(0.4 * L, ends === 'taper' ? 9 : 4);
      if (s < t0) h *= 0.6 + 0.4 * (s / t0);
      if (L - s < t1) h *= (ends === 'taper' ? 0.3 : 0.6) + (ends === 'taper' ? 0.7 : 0.4) * ((L - s) / t1);
    }
    if (dry > 0 && V[i]! > 0.6) {
      const d = nTooth(s);
      if (d > 0.35) h *= 1 - 0.55 * dry * Math.min(1, (d - 0.35) / 0.3);
    }
    hw[i] = Math.max(0.16, h);
  }

  // ribbon outline: left side forward, right side back, smoothed through midpoints
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) ring.push([X[i]! + NX[i]! * hw[i]!, Y[i]! + NY[i]! * hw[i]!]);
  for (let i = N - 1; i >= 0; i--) ring.push([X[i]! - NX[i]! * hw[i]!, Y[i]! - NY[i]! * hw[i]!]);
  const M = ring.length;
  const mid = (i: number): [number, number] => {
    const a = ring[i % M]!;
    const b = ring[(i + 1) % M]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const m0 = mid(0);
  let d = `M${f(m0[0])} ${f(m0[1])}`;
  for (let i = 1; i <= M; i++) {
    const p = ring[i % M]!;
    const m = mid(i);
    d += `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  d += 'Z';

  let guide = `M${f(X[0]!)} ${f(Y[0]!)}`;
  for (let i = 1; i < N; i++) guide += `L${f(X[i]!)} ${f(Y[i]!)}`;

  return { d, guide, len: L, w: pen.w };
}
