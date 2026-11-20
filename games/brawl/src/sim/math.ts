// Deterministic math for the sim: a seeded PRNG whose state lives in FightState.rng, angle helpers
// built from a polynomial (basic arithmetic only), and a string hash. Integer ops (| ^ >>> Math.imul)
// are exact in every engine; + - * / and Math.sqrt are IEEE correctly rounded, so results are
// bit-identical in node and in any browser.

const PI = 3.141592653589793;
const DEG = PI / 180;

/** 32-bit FNV-1a over a string with a given basis, returns uint32. */
export function fnv32(str: string, basis: number): number {
  let h = basis >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 16 hex chars from a string (two independent FNV lanes). */
export function hash64(str: string): string {
  const a = fnv32(str, 2166136261);
  const b = fnv32(str, 0x9e3779b9);
  return hex8(a) + hex8(b);
}

function hex8(n: number): string {
  let s = (n >>> 0).toString(16);
  while (s.length < 8) s = '0' + s;
  return s;
}

/** PRNG state (sfc32) from any string seed. */
export function seedRng(seed: string): number[] {
  const r = [fnv32(seed, 2166136261) | 0, fnv32(seed, 0x85ebca6b) | 0, fnv32(seed, 0xc2b2ae35) | 0, 1];
  for (let i = 0; i < 16; i++) rnd(r);
  return r;
}

/** Uniform in [0, 1). Advances the state in place. */
export function rnd(r: number[]): number {
  let a = r[0] | 0, b = r[1] | 0, c = r[2] | 0, d = r[3] | 0;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  r[0] = a; r[1] = b; r[2] = c; r[3] = d;
  return (t >>> 0) / 4294967296;
}

export function rndInt(r: number[], n: number): number {
  return Math.floor(rnd(r) * n);
}

export function rndRange(r: number[], lo: number, hi: number): number {
  return lo + (hi - lo) * rnd(r);
}

/** sin of x radians for x in [0, pi/2] (Taylor to x^13, error < 1e-11). */
function sinQ(x: number): number {
  const x2 = x * x;
  return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156))))));
}

export function sinDeg(deg: number): number {
  let d = deg - 360 * Math.floor(deg / 360);
  let sign = 1;
  if (d >= 180) { d -= 180; sign = -1; }
  if (d > 90) d = 180 - d;
  return sign * sinQ(d * DEG);
}

export function cosDeg(deg: number): number {
  return sinDeg(deg + 90);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
