// Shared helpers for the built-in placeholder renderers. Flat drawing only; colours and type come
// from the active theme's CSS variables.

export interface Theme {
  bg: string; surface: string; raised: string; hover: string; line: string;
  text: string; text2: string; text3: string; accent: string;
  sides: string[];
  ui: string; num: string; numWeight: string;
}

export function theme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    bg: v('--bg', '#000'), surface: v('--surface', '#000'), raised: v('--raised', '#141414'), hover: v('--hover', '#1f1f1f'),
    line: v('--line', '#222'), text: v('--text', '#fff'), text2: v('--text-2', '#aaa'), text3: v('--text-3', '#888'),
    accent: v('--accent', '#ff4f1f'),
    sides: ['--side-a', '--side-b', '--side-c'].map((n) => v(n, '#fff')),
    ui: v('--font-ui', 'sans-serif'), num: v('--font-num', 'sans-serif'), numWeight: v('--num-weight', '700'),
  };
}

export interface Stage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dpr: number;
  destroy(): void;
}

/** A canvas that fills `el` and tracks its size (CSS pixels in w/h; ctx is pre-scaled by dpr). */
export function stage(el: HTMLElement, onFrame: (s: Stage, now: number, dt: number) => void): Stage {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const s: Stage = { canvas, ctx, w: 1, h: 1, dpr: 1, destroy };
  const resize = () => {
    const r = el.getBoundingClientRect();
    s.dpr = Math.min(2, window.devicePixelRatio || 1);
    s.w = Math.max(1, r.width);
    s.h = Math.max(1, r.height);
    canvas.width = Math.round(s.w * s.dpr);
    canvas.height = Math.round(s.h * s.dpr);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  let raf = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    onFrame(s, now, dt);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  function destroy() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.remove();
  }
  return s;
}

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export function easeOutBounce(t: number) {
  t = clamp(t, 0, 1);
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
