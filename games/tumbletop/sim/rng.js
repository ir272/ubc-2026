// Seeded PRNG (sfc32 seeded through splitmix32). Pure, deterministic, no globals.

export function splitmix32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Mix two integers into a 32-bit seed (for per-bot streams). */
export function mixSeed(a, b) {
  let h = Math.imul((a >>> 0) ^ 0x27d4eb2f, 0x165667b1) >>> 0;
  h = Math.imul(h ^ ((b >>> 0) + 0x9e3779b9), 0x85ebca6b) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    const sm = splitmix32(seed >>> 0);
    this.a = sm();
    this.b = sm();
    this.c = sm();
    this.d = sm();
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32() {
    let a = this.a, b = this.b, c = this.c, d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next() { return this.nextU32() / 4294967296; }
  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[this.int(arr.length)]; }
  /** Approximate standard normal (Irwin-Hall, 4 samples), bounded to about +-3.5. */
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  state() { return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]; }
}
