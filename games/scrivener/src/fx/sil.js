// Actor silhouettes for impact frames, hit flashes and death cards. Owner: feedback.
// Re-renders drawBoss / drawAgent into an offscreen buffer and recolours it, so
// the effects follow whatever the art layer draws (pose, collapse, blade...).
// Buffers match the target context's scale (devicePixelRatio) so the flash
// lines up pixel for pixel with the world under it.
//
// Cost (perf r1): a hit frame used to spend ~45 ms in software raster, almost all of it
// in RESAMPLED full-frame drawImage calls: outline taps at fractional offsets, and taps
// drawn straight into the zoomed (punch-in) inverted panel. Now
//  - every buffer carries `bb`, the device-pixel rect it can hold (the challenger's is a
//    small box around it; the Scrivener's wings, blade and tell flare reach most of the
//    frame so it keeps the whole frame), and all work is bounded to that rect;
//  - outline taps land on whole device pixels (a straight blit, no filtering);
//  - `outlinedLayer` composes several outlined actors 1:1 into one layer, so a zoomed
//    panel pays for a single scaled draw instead of eighteen.

import { W, H, GROUND_Y } from '../core/constants.js';
import { offscreen } from '../render/ink.js';
import { drawBoss, drawnBossBounds, bossFigureCached } from '../render/boss_draw.js';
import { drawAgent } from '../render/agent_draw.js';
import { BOSS } from '../sim/boss.js';

const pool = new Map();
function buf(key, s) {
  const w = Math.round(W * s), h = Math.round(H * s);
  let b = pool.get(key);
  if (!b || b.width !== w || b.height !== h) { b = offscreen(w, h); b.bb = { x: 0, y: 0, w, h }; pool.set(key, b); }
  return b;
}

export function scaleOf(ctx) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

const full = (b) => ({ x: 0, y: 0, w: b.width, h: b.height });
function clampRect(r, b) {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(b.width, Math.ceil(r.x + r.w)), y1 = Math.min(b.height, Math.ceil(r.y + r.h));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
function union(a, b) {
  if (!a || !a.w || !a.h) return b;
  if (!b || !b.w || !b.h) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
const grow = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

// Where `who` can draw, in device px. The challenger measured at most ~141 px either side
// of its x and ~158 px above its feet (tools: 3000 sampled frames); the box adds margin.
// M = { k, ox, oy }: world logical px -> buffer device px (x * k + ox).
function region(who, world, M, b, t) {
  if (who === 'boss') {
    // (qa2) the figure's bounds as the contour pass measured them this frame (same mapping),
    // grown for the glint and the tell flare; the whole frame when they do not apply
    const r = drawnBossBounds(world, t, M.k, M.ox, M.oy);
    return r ? clampRect(grow(r, 40 * M.k), b) : full(b);
  }
  if (who !== 'agent') return full(b);
  const a = world.agent;
  const x0 = a.x - 210, y0 = GROUND_Y - a.y - 240;
  return clampRect({ x: x0 * M.k + M.ox, y: y0 * M.k + M.oy, w: 420 * M.k, h: (a.y + 248) * M.k }, b);
}

// Device-pixel source rect -> logical destination, offset by (dx, dy) logical px.
function drawBB(ctx, c, dx = 0, dy = 0) {
  const r = c.bb || full(c);
  if (!r.w || !r.h) return;
  const s = c.width / W;
  ctx.drawImage(c, r.x, r.y, r.w, r.h, r.x / s + dx, r.y / s + dy, r.w / s, r.h / s);
}

// whole-device-pixel tap offsets for an outline of radius r (logical px) at scale s
const tapCache = new Map();
function taps(r, s) {
  r = Math.round(r * 4) / 4; // bounded cache: radii snap to quarter pixels
  const key = `${r}|${s}`;
  let t = tapCache.get(key);
  if (!t) {
    t = [];
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ox = Math.round(Math.cos(a) * r * s), oy = Math.round(Math.sin(a) * r * s);
      const k = `${ox},${oy}`;
      if (!seen.has(k)) { seen.add(k); t.push([ox, oy]); }
    }
    tapCache.set(key, t);
  }
  return t;
}

// A per-frame cache of masks: create one per drawPost call.
//   const S = sils(ctx, world, t, shake)
//   S.get('boss', color)   -> canvas (W*s x H*s, content inside canvas.bb), actor tinted `color`
//   S.cut(canvas, who)     -> remove `who`'s shape from a tinted canvas
//   S.view(z, fx, fy)      -> (before any get) pre-zoom the buffers by z about screen point
//                             (fx, fy), so a punched-in panel blits them 1:1 instead of resampling
//   S.setWorld(g)          -> give g the world -> buffer transform (to draw onto a buffer)
export function sils(ctx, world, t, shake) {
  const s = scaleOf(ctx);
  let raw = {};
  let tinted = {};
  let firstTint = {}; // who -> the first tinted copy made this frame (its alpha is the thick mask)
  let nTint = 0;
  let M = { k: s, ox: shake.x * s, oy: shake.y * s };
  // draw `who` (alpha is what counts) into g, clipped to bb and kept above the floor line
  const paint = (who, g, bb, times = 1) => {
    g.save();
    g.beginPath(); g.rect(bb.x, bb.y, bb.w, bb.h); g.clip();
    g.setTransform(M.k, 0, 0, M.k, M.ox, M.oy);
    // keep the soft floor shadow out of the mask
    // (throes is drawn standing, so its floor shadow is clipped like the others)
    g.beginPath(); g.rect(-50, -50, W + 100, GROUND_Y - 1 + 50); g.clip();
    for (let i = 0; i < times; i++) {
      if (who === 'boss') drawBoss(g, world, t, { contour: false }); // alpha only: no contour re-inking
      else if (who === 'throes') {
        // the death-splash pose: the scribe flung back, wings thrown open
        // (render-only copy of the boss in its mid phase-change pose)
        const bs = world.boss;
        drawBoss(g, { ...world, hazards: [], boss: { ...bs, state: 'phase_change', stateT: BOSS.phaseChangeMs * 0.45, attackId: null, writing: false, vx: 0 } }, t, { contour: false });
      } else {
        // draw the agent as if not blinking (solid), so the mask is opaque.
        // Shallow copies: the real world state is never touched.
        drawAgent(g, { ...world, agent: { ...world.agent, invulnT: 0 } }, t);
      }
    }
    g.restore();
  };
  const reset = (b) => {
    const g = b.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(b.bb.x, b.bb.y, b.bb.w, b.bb.h);
    return g;
  };
  const render = (who) => {
    if (raw[who]) return raw[who];
    const b = buf(`raw_${who}`, s);
    const bb = region(who, world, M, b, t);
    const g = reset(b);
    b.bb = bb;
    paint(who, g, bb);
    raw[who] = b;
    return b;
  };
  return {
    s,
    zoom: 1,
    view(z, fx, fy) {
      raw = {}; tinted = {}; firstTint = {}; nTint = 0;
      this.zoom = z;
      // screen = f + z * (world + shake - f)
      M = { k: s * z, ox: s * (fx * (1 - z) + z * shake.x), oy: s * (fy * (1 - z) + z * shake.y) };
    },
    setWorld(g) { g.setTransform(M.k, 0, 0, M.k, M.ox, M.oy); },
    get(who, color) {
      const key = `${who}|${color}`;
      if (tinted[key]) return tinted[key];
      // (qa3) the thick mask is made once per actor and frame: a second colour is a copy of the
      // first tint recoloured (same alpha). The Scrivener's first tint is drawn straight from
      // the figure layer its world draw left this frame (two blits), with no raw copy between
      const first = firstTint[who];
      const direct = !first && !raw[who] && who === 'boss' && M.k === s && bossFigureCached(world, t, M.k, M.ox, M.oy, s);
      const src = first || direct ? null : render(who);
      const b = buf(`t_${who}_${nTint++}`, s);
      const bb = first ? first.bb : src ? src.bb : region(who, world, M, b, t);
      const g = reset(b);
      b.bb = bb;
      if (bb.w && bb.h) {
        if (direct) paint(who, g, bb, 2); // drawn twice: thickens the alpha like the two blits below
        g.save();
        g.beginPath(); g.rect(bb.x, bb.y, bb.w, bb.h); g.clip(); // bounds the unbounded source-in
        if (first) g.drawImage(first, bb.x, bb.y, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h);
        else if (src) {
          g.drawImage(src, bb.x, bb.y, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h);
          // thicken alpha (anti-aliased or semi-transparent strokes become solid)
          g.drawImage(src, bb.x, bb.y, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h);
        }
        // an opaque colour: 'source-atop' gives the same pixels as 'source-in', bounded (no layer)
        g.globalCompositeOperation = /^#[0-9a-f]{6}$/i.test(color) ? 'source-atop' : 'source-in';
        g.fillStyle = color;
        g.fillRect(bb.x, bb.y, bb.w, bb.h);
        g.restore();
      }
      tinted[key] = b;
      if (!first) firstTint[who] = b;
      return b;
    },
    // remove `who`'s shape from a tinted canvas (so the front actor stays visible)
    cut(canvas, who) {
      // a cut tint no longer carries the actor's whole alpha: later colours start afresh
      for (const k of Object.keys(firstTint)) if (firstTint[k] === canvas) delete firstTint[k];
      const src = render(who);
      const r = src.bb;
      if (!r.w || !r.h) return;
      const g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      g.globalCompositeOperation = 'source-over';
    },
    // Several outlined silhouettes composed 1:1 into one layer, in order:
    //   S.outlinedLayer([[fill, outline, r], ...]) -> canvas to blit()
    outlinedLayer(list) {
      const L = buf('layer', s);
      const g = L.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(L.bb.x, L.bb.y, L.bb.w, L.bb.h);
      let bb = null;
      for (const [fill, outline, r] of list) {
        const T = taps(r, s);
        const o = outline.bb, f = fill.bb;
        for (const [ox, oy] of T) g.drawImage(outline, o.x, o.y, o.w, o.h, o.x + ox, o.y + oy, o.w, o.h);
        g.drawImage(fill, f.x, f.y, f.w, f.h, f.x, f.y, f.w, f.h);
        bb = union(bb, union(grow(o, Math.ceil(r * s) + 1), f));
      }
      L.bb = clampRect(bb || { x: 0, y: 0, w: 0, h: 0 }, L);
      return L;
    },
  };
}

// Composite a buffer onto ctx in logical 1280x720 coordinates (only its live rect).
export function blit(ctx, canvas, dx = 0, dy = 0, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const s = canvas.width / W;
  // whole device pixels: an unfiltered blit instead of a resample
  drawBB(ctx, canvas, Math.round(dx * s) / s, Math.round(dy * s) / s);
  ctx.restore();
}

// Silhouette with an outline: `outline` copy drawn at 8 offsets, `fill` on top.
export function outlined(ctx, fill, outline, r = 3, alpha = 1) {
  if (alpha <= 0) return;
  const s = fill.width / W;
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (const [ox, oy] of taps(r, s)) drawBB(ctx, outline, ox / s, oy / s);
  drawBB(ctx, fill);
  ctx.restore();
}
