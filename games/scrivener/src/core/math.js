// Small math helpers. Owner: core. Pure.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const progress = (t, start, dur) => clamp((t - start) / dur, 0, 1);

// Rects are { x0, x1, y0, y1 } in world units (y = height above floor).
export const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
