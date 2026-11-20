// Screen shake (deterministic, sim-clock driven). Owner: feedback.
// Two parts:
//  - trauma: smooth value-noise rumble, falls off quadratically;
//  - kick:   a directional camera punch in the hit direction that springs back
//            (heavy blows shove the whole frame, then it rings out).
import { hashNoise } from '../core/rng.js';

const smooth = (seed, x) => {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hashNoise(seed, i) * (1 - u) + hashNoise(seed, i + 1) * u) - 0.5;
};

export function createShake() {
  const s = { t: 0, items: [], kicks: [] };
  return {
    add(mag, ms) { s.items.push({ mag, ms, age: 0 }); },
    // dx, dy: direction (unit-ish); mag: px of the first shove
    kick(dx, dy, mag, ms = 260) { s.kicks.push({ dx, dy, mag, ms, age: 0 }); if (s.kicks.length > 6) s.kicks.shift(); },
    tick(dt) {
      s.t += dt;
      for (const it of s.items) it.age += dt;
      for (const k of s.kicks) k.age += dt;
      s.items = s.items.filter((it) => it.age < it.ms);
      s.kicks = s.kicks.filter((k) => k.age < k.ms);
    },
    // px: device pixels per logical px of the target. (qa3) The offset is snapped to whole
    // device pixels, so the shaken frame's full-frame paper layers (arena, foreground) are
    // blitted instead of resampled: a sub-pixel shake made them ~3 ms more per hit frame.
    offset(px = 0) {
      let m = 0;
      for (const it of s.items) m += it.mag * Math.pow(1 - it.age / it.ms, 2);
      m = Math.min(m, 24);
      const f = s.t / 28;
      let x = smooth(71, f) * 2 * m, y = smooth(72, f + 17.3) * 2 * m;
      for (const k of s.kicks) {
        const p = k.age / k.ms;
        // snap out on the first frame, damped spring back through zero
        const v = Math.cos(p * Math.PI * 2.2) * Math.pow(1 - p, 2.2);
        x += k.dx * k.mag * v;
        y += k.dy * k.mag * v;
      }
      if (px > 0) { x = Math.round(x * px) / px; y = Math.round(y * px) / px; }
      return { x, y };
    },
    reset() { s.items = []; s.kicks = []; },
  };
}
