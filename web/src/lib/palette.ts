// Reads the colours out of a reference picture and maps them onto the site's colour roles.
// Nothing here chooses a colour: the ground, the text colour and the action colour are all taken
// from the picture; the in-between steps (panels, hover, dividers, quiet text) are mixes of those.
export type RGB = [number, number, number];

export const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export const unhex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hsv = ([r, g, b]: RGB) => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx / 255 };
};
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export interface Extracted {
  /** ground, text, action, second colour, third colour */
  roles: [RGB, RGB, RGB, RGB, RGB];
  /** the picture's main colours, most common first */
  swatches: RGB[];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('could not load the picture'));
    img.src = src;
  });
}

export function extract(img: HTMLImageElement): Extracted {
  const N = 72;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data;
  // 4 bits a channel: 4096 bins, each keeping its true average colour
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 128) continue;
    const k = ((d[i]! >> 4) << 8) | ((d[i + 1]! >> 4) << 4) | (d[i + 2]! >> 4);
    const e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += d[i]!;
    e.g += d[i + 1]!;
    e.b += d[i + 2]!;
    bins.set(k, e);
    total++;
  }
  // merge near-identical bins into clusters
  const raw = [...bins.values()].sort((a, b) => b.n - a.n).map((e) => ({ n: e.n, c: [e.r / e.n, e.g / e.n, e.b / e.n] as RGB }));
  const clusters: { n: number; c: RGB }[] = [];
  for (const e of raw) {
    const near = clusters.find((k) => Math.abs(k.c[0] - e.c[0]) + Math.abs(k.c[1] - e.c[1]) + Math.abs(k.c[2] - e.c[2]) < 42);
    if (near) {
      const t = near.n + e.n;
      near.c = [(near.c[0] * near.n + e.c[0] * e.n) / t, (near.c[1] * near.n + e.c[1] * e.n) / t, (near.c[2] * near.n + e.c[2] * e.n) / t];
      near.n = t;
    } else clusters.push({ n: e.n, c: e.c });
  }
  clusters.sort((a, b) => b.n - a.n);
  const share = (k: { n: number }) => k.n / Math.max(1, total);
  const ground = clusters[0]?.c ?? [0, 0, 0];

  // text: the picture's own colour with the strongest contrast against the ground, if it is readable
  const byContrast = clusters.filter((k) => share(k) > 0.004).sort((a, b) => contrast(b.c, ground) - contrast(a.c, ground))[0];
  const text: RGB = byContrast && contrast(byContrast.c, ground) >= 7 ? byContrast.c : lum(ground) > 0.4 ? [14, 14, 16] : [255, 255, 255];

  // action: the most vivid colour that stands out from the ground
  const vivid = clusters
    .filter((k) => share(k) > 0.003 && contrast(k.c, ground) >= 2)
    .map((k) => ({ k, s: hsv(k.c) }))
    .filter((e) => e.s.s >= 0.3 && e.s.v >= 0.35)
    .sort((a, b) => b.s.s * (0.5 + b.s.v) * share(b.k) ** 0.25 - a.s.s * (0.5 + a.s.v) * share(a.k) ** 0.25);
  const action: RGB = vivid[0]?.k.c ?? text;
  const h0 = hsv(action).h;
  const second = vivid.find((e) => hueGap(e.s.h, h0) >= 40)?.k.c ?? mix(text, ground, 0.25);
  const h1 = hsv(second).h;
  const third = vivid.find((e) => hueGap(e.s.h, h0) >= 40 && hueGap(e.s.h, h1) >= 40)?.k.c ?? mix(text, ground, 0.4);
  return { roles: [ground, text, action, second, third], swatches: clusters.slice(0, 7).map((k) => k.c) };
}

export const packRoles = (roles: RGB[]) => roles.map((c) => hex(c).slice(1)).join('.');
export const unpackRoles = (s: string | undefined): RGB[] | null => {
  if (!s || !/^([0-9a-f]{6}\.){4}[0-9a-f]{6}$/i.test(s)) return null;
  return s.split('.').map(unhex);
};

/** The site's colour tokens from five role colours. */
export function tokensFromRoles(roles: RGB[]): { vars: Record<string, string>; light: boolean; meta: string } {
  const [ground, text, action, second, third] = roles as [RGB, RGB, RGB, RGB, RGB];
  const on = (c: RGB): RGB => (contrast(c, [0, 0, 0]) >= contrast(c, [255, 255, 255]) ? [0, 0, 0] : [255, 255, 255]);
  const light = lum(ground) > 0.4;
  const vars = {
    '--bg': hex(ground),
    '--surface': hex(mix(ground, text, 0.035)),
    '--raised': hex(mix(ground, text, 0.09)),
    '--hover': hex(mix(ground, text, 0.15)),
    '--line': hex(mix(ground, text, 0.11)),
    '--keyline': hex(mix(ground, text, 0.2)),
    '--text': hex(text),
    '--text-2': hex(mix(text, ground, 0.34)),
    '--text-3': hex(mix(text, ground, 0.48)),
    '--accent': hex(action),
    '--on-accent': hex(on(action)),
    '--side-a': hex(contrast(second, ground) >= 2.5 ? second : mix(second, text, 0.5)),
    '--side-b': hex(contrast(third, ground) >= 2.5 ? third : mix(third, text, 0.5)),
    '--side-c': hex(mix(text, ground, 0.2)),
    '--on-side-a': hex(on(second)),
    '--on-side-b': hex(on(third)),
    '--on-side-c': hex(ground),
  };
  return { vars, light, meta: hex(mix(ground, text, 0.035)) };
}
