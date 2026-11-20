// Small helpers shared by the world parts (paper, sky, land, plants, life, sign).
import { rnd } from '../../engine/layout';
import type { Pt } from '../../engine/types';

export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mod = (a: number, p: number) => ((a % p) + p) % p;
export const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** an eased ramp that overshoots a little and settles (for gestures that land on a held pose) */
export const backOut = (v: number) => {
  const x = clamp01(v) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};

/** smooth 1-D value noise, -1..1, period-free; used for ragged edges that must be the same every frame */
export function noise(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return (rnd(i * 1.37 + seed) * (1 - u) + rnd((i + 1) * 1.37 + seed) * u) * 2 - 1;
}

/** an irregular closed pebble or blob: n points round a centre, radius varied by a seeded low-frequency wave */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, n = 14, rough = 0.16): Pt[] {
  const out: Pt[] = [];
  const p1 = rnd(seed) * TAU, p2 = rnd(seed + 3.1) * TAU;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + rough * (0.6 * Math.sin(a * 2 + p1) + 0.4 * Math.sin(a * 3 + p2));
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

/** part of an ellipse as an open line */
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** a proper seeded generator (mulberry32) for layouts and grain: no lattice, no repeats, 0..1 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
