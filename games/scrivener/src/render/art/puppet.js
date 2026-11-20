// Cut-out puppet: draws the Scrivener's ink-painted body parts (baked offline by
// tools/ink_bake.mjs from paint/parts.js into assets/sprites/scrivener/) on the rig.
// Owner: art. Loaded with a top-level await, so the sprites are decoded before the game
// boots and the first frame (and every capture) already has them. If they fail to load,
// `ready()` is false and scrivener.js falls back to its vector drawing.

const DIR = new URL('../../../assets/sprites/scrivener/', import.meta.url);
const parts = new Map();
let SCALE = 3;
let ok = false;

async function load() {
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return;
  try {
    const man = await (await fetch(new URL('parts.json', DIR))).json();
    SCALE = man.scale || 3;
    await Promise.all(Object.entries(man.parts).map(async ([name, p]) => {
      const img = new Image();
      img.src = new URL(`${name}.png`, DIR).href;
      await img.decode();
      parts.set(name, { img, box: p.box, w: p.w, h: p.h, mips: [img] });
    }));
    ok = parts.size > 0;
  } catch (e) {
    ok = false;
  }
}
await load();

export const ready = () => ok;
export const has = (name) => ok && parts.has(name);

// a box-filtered half-size copy, built on demand, so a part drawn far below its baked
// resolution does not alias (bilinear on a 3x bake shimmers at 1.25x)
function mip(p, level) {
  while (p.mips.length <= level) {
    const src = p.mips[p.mips.length - 1];
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(src.width / 2));
    c.height = Math.max(1, Math.ceil(src.height / 2));
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    p.mips.push(c);
  }
  return p.mips[level];
}

/**
 * Draw part `name` with its pivot at (x, y), turned by `rot` (radians) and scaled
 * (sx across, sy along). In art units, like the rest of the rig.
 */
export function drawPart(ctx, name, x, y, rot = 0, sx = 1, sy = 1, alpha = 1) {
  const p = parts.get(name);
  if (!p) return false;
  const m = ctx.getTransform();
  const dev = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * Math.sqrt(Math.abs(sx * sy)); // device px per unit
  const ratio = dev / SCALE;
  const level = ratio < 0.3 ? 2 : ratio < 0.6 ? 1 : 0;
  const img = level ? mip(p, level) : p.img;
  const k = 1 << level;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(sx * k / SCALE, sy * k / SCALE);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, (p.box[0] * SCALE) / k, (p.box[1] * SCALE) / k);
  ctx.restore();
  return true;
}

// draw a part through a general affine map (for the skirt, which shears between
// the hip and the hem): local (x, y) -> o + x * ex + y * ey
export function drawPartAffine(ctx, name, o, ex, ey) {
  const p = parts.get(name);
  if (!p) return false;
  const m = ctx.getTransform();
  const dev = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) * Math.sqrt(Math.abs(ex[0] * ey[1] - ex[1] * ey[0]));
  const ratio = dev / SCALE;
  const level = ratio < 0.3 ? 2 : ratio < 0.6 ? 1 : 0;
  const img = level ? mip(p, level) : p.img;
  const k = 1 << level;
  ctx.save();
  ctx.transform(ex[0], ex[1], ey[0], ey[1], o[0], o[1]);
  ctx.scale(k / SCALE, k / SCALE);
  ctx.drawImage(img, (p.box[0] * SCALE) / k, (p.box[1] * SCALE) / k);
  ctx.restore();
  return true;
}
