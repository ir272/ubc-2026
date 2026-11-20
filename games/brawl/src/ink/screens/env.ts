// What the screens keep between frames: only caches of drawings that never change (figure sprites,
// stage thumbnails, the sets that draw them). No show state is accumulated here.

import type { InkFrame, StageSet } from '../api.ts';
import * as Sets from '../sets/index.ts';
import { C, ruledBox, spriteCache, devK, type SpriteCache, newInk } from './kit.ts';

export interface Env {
  figs: SpriteCache;
  thumbs: SpriteCache;
  sets: Map<string, StageSet | null>;
}

export function createEnv(): Env {
  return { figs: spriteCache(16), thumbs: spriteCache(16), sets: new Map() };
}

export function disposeEnv(e: Env): void {
  e.figs.clear();
  e.thumbs.clear();
  for (const s of e.sets.values()) {
    try {
      s?.dispose?.();
    } catch {
      /* a set that cannot let go is not the screens' problem */
    }
  }
  e.sets.clear();
}

/** the stages on offer: ctx.stages, else the sets' STAGE_IDS, else none */
export function stagesOnOffer(f: InkFrame): string[] {
  const c = f.show.ctx?.stages;
  if (c && c.length) return c;
  const ids = (Sets as unknown as { STAGE_IDS?: string[] }).STAGE_IDS;
  return Array.isArray(ids) ? ids : [];
}

/** the drawn set for this id, or null when no set by that id exists yet */
export function setOf(e: Env, id: string): StageSet | null {
  if (e.sets.has(id)) return e.sets.get(id) ?? null;
  let s: StageSet | null = null;
  try {
    const made = Sets.setFor(id);
    s = made && made.id === id ? made : null;
  } catch {
    s = null;
  }
  e.sets.set(id, s);
  return s;
}

/** Draw the stage's thumbnail in the box (cached), or nothing when the set has no thumbnail. */
export function thumb(f: InkFrame, e: Env, id: string, x: number, y: number, w: number, h: number, alpha = 1): boolean {
  const s = setOf(e, id);
  if (!s || !s.drawThumb) return false;
  const sp = e.thumbs.get(`${id}|${x.toFixed(1)}|${y.toFixed(1)}|${w.toFixed(1)}|${h.toFixed(1)}`, devK(f.g), x, y, w, h, (g) => {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = C.paper;
    g.fillRect(x, y, w, h);
    try {
      s.drawThumb!(g, x, y, w, h);
    } catch (err) {
      console.warn('[ringout screens] drawThumb', id, err);
    }
    g.restore();
    lift(g, THUMB_LIFT);
  });
  if (!sp) return false;
  e.thumbs.blit(f.g, sp, 0, 0, alpha);
  return true;
}

/** how much brighter than the set draws it a thumbnail is shown (fine lines go grey when small) */
const THUMB_LIFT = 1.6;
const PAPER_RGB = [0x14, 0x13, 0x18];

/** spread every pixel away from the paper colour by k, once, when the sprite is made */
function lift(g: CanvasRenderingContext2D, k: number): void {
  try {
    const c = g.canvas;
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        const p = PAPER_RGB[j]!;
        const v = p + (d[i + j]! - p) * k;
        d[i + j] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    g.putImageData(img, 0, 0);
  } catch {
    /* no pixel access: the thumbnail stays as drawn */
  }
}

/** the name of the stage, if its set exists */
export function stageName(e: Env, id: string): string {
  return setOf(e, id)?.name ?? '';
}

export { ruledBox, newInk };
