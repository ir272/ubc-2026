// Seeded randomness for the ink engine. Every wobble comes from a seed, so a drawing is the
// same on every render and in every screenshot (the technique Looseleaf uses).

export type Rng = { (): number; fork(name: string): Rng };

function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix(h);
}

function build(seed: number): Rng {
  let s = seed || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = next as Rng;
  r.fork = (name) => build(mix(seed ^ hashStr(name)));
  return r;
}

export const makeRng = (seed: string): Rng => build(hashStr(seed));

/** Smooth 1D value noise in [-1, 1] with wavelength `wl` px. The value at s never depends on call order. */
export function noise1(r: Rng, wl: number): (s: number) => number {
  const base = (r() * 0xffffffff) >>> 0;
  const v = (i: number) => (mix((base + Math.imul(i, 0x9e3779b1)) >>> 0) / 4294967295) * 2 - 1;
  return (s) => {
    const x = s / wl;
    const i = Math.floor(x);
    const t = x - i;
    const u = t * t * (3 - 2 * t);
    return v(i) * (1 - u) + v(i + 1) * u;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
