// Seeded RNG. Owner: core. Pure.
// The generator state is a plain object { s } so it survives structuredClone / JSON.
// Never use Math.random in sim or render code; use these.

export function makeRng(seed = 1) {
  return { s: (seed >>> 0) || 0x9e3779b9 };
}

// mulberry32
export function rand(r) {
  let t = (r.s = (r.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const range = (r, a, b) => a + (b - a) * rand(r);
export const int = (r, a, b) => Math.floor(range(r, a, b + 1));
export const chance = (r, p) => rand(r) < p;
export const pick = (r, arr) => arr[Math.floor(rand(r) * arr.length)];

export function weighted(r, items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return items[0];
  let x = rand(r) * total;
  for (const it of items) {
    x -= Math.max(0, weightOf(it));
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

// FNV-1a 32-bit
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hash2(a, b) {
  let h = Math.imul((a >>> 0) ^ 0x85ebca6b, 0xc2b2ae35) ^ Math.imul((b >>> 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

// Stateless deterministic noise in [0,1) for render code: noise(seed, i)
export function hashNoise(seed, i) {
  return hash2(seed, i) / 4294967296;
}

// Convenience closure (render-side only; keep sim state in makeRng objects).
export function seededFn(seed) {
  const r = makeRng(seed);
  return () => rand(r);
}
