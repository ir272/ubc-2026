// The Scrivener + its hazards. Owner: art. Reads sim state only (never mutates).
// The figure itself is drawn in art/scrivener.js (ink primitives in art/pen.js); the
// pose comes from boss_pose.js (owner: tells). Exported API:
//   drawBoss(ctx, world, t, { contour = true })  t = render clock (ms, deterministic);
//                                  contour: false skips the lit/shaded contour re-inking (masks)
//   drawHazards(ctx, world, t)
//   drawCurseMark(ctx, world, t)   the name being written over the challenger
//   bossPose(boss) -> pose params (re-exported for fx / debug)

import { GROUND_Y, W, H } from '../core/constants.js';
import { clamp, lerp, easeOutCubic, easeInOut } from '../core/math.js';
import { hashNoise } from '../core/rng.js';
import { ATTACKS } from '../sim/attacks.js';
import { BOSS, bossSpeed } from '../sim/boss.js';
import { INK, PAPER, RED, stroke, line, blot, hatch } from './ink.js';
import { drawScrivener, scrivenerShadow } from './art/scrivener.js';
import { ribbonPath as ribbonPathHz } from './art/pen.js';
import { bossPose, drawGlint, drawTellFlare } from './boss_pose.js';
import { drawStyledHazard } from './attack_fx.js';

// Pose table + keyframe tracks live in boss_pose.js (owner: tells).
export { bossPose };

const ART_SCALE = 1.25; // the drawing stands a little taller than the 340px hurtbox

export function drawBoss(ctx, world, t, { contour = true } = {}) {
  const b = world.boss;
  const pose = bossPose(b);
  const deadP = b.state === 'dead' ? clamp(b.stateT / 2600, 0, 1) : 0;
  // a keepBossFigure request is used once, by the world's own draw (not by later redraws of the
  // figure in the same frame, e.g. the thinking freeze's panels)
  const want = contour && FIG_WANT === t;
  if (want) FIG_WANT = null;
  const shown = want && FIG_SHOW && ctx.getTransform ? deviceRects(ctx.getTransform(), FIG_SHOW) : null;
  ctx.save();
  ctx.translate(b.x, GROUND_Y - b.y);
  scrivenerShadow(ctx, b, deadP);
  ctx.scale(b.facing * ART_SCALE, ART_SCALE);
  if (deadP > 0) ctx.globalAlpha = 1 - deadP * 0.85;
  drawTellFlare(ctx, pose, contour); // wind-up flare behind the figure (owner: tells); no paper in alpha masks
  const anchors = figure(ctx, b, pose, t, contour, deadP, want);
  // (qa2) silhouette masks (fx/sil.js) only use the figure's alpha, which the contour pass
  // (ink bands and a paper rim INSIDE the silhouette) does not change: they skip it, which
  // saves its mask work and its threshold filter on every hit-beat frame
  if (contour) {
    const L = shown && FIG && FIG.t === t && FIG.b === b ? FIG.canvas : null;
    const r = contourPass(ctx, (g) => drawScrivener(g, b, pose, t, 0), shown, L);
    const m = ctx.getTransform ? ctx.getTransform() : null;
    DRAWN = r && m ? { t, a: m.a, d: m.d, e: m.e, f: m.f, ...r } : null;
  }
  drawGlint(ctx, pose, anchors, t);
  ctx.restore();
}

// ---- the figure, shared with the hit flash's silhouette ------------------------------
// (qa3) A hit flash (fx/sil.js) used to re-ink the whole figure at full resolution a second
// time, only for its alpha (~3-4 ms of software raster on every flash frame). On frames where
// fx asks for it (keepBossFigure(t), before the world is drawn) the figure is inked into a
// device-res layer, blitted 1:1 onto the page, and the silhouette pass blits the same layer
// instead of drawing it again. Other frames draw straight onto the page as before.
let FIG = null;      // { canvas, t, b, m: [a, b, c, d, e, f], w, h, anchors }
let FIG_WANT = null; // the render time a layer was asked for
let FIG_SHOW = null; // world-space rects where the contour still shows (null: everywhere)
let FIG_CANVAS = null;
// keepBossFigure(t, show): ink the figure at render time t into the shared layer. show (optional):
// the world-space rects ({x, y, w, h}, logical px) outside which fx will paint the boss over
// opaquely this frame (the white flash), so the contour pass only does its work inside them.
export function keepBossFigure(t, show = null) { FIG_WANT = t; FIG_SHOW = show; }
// true when drawBoss(g, world, t, { contour: false }) on a target mapping world px to device px
// as x * k + ox (and k px per logical px on its canvas, like the page's) would blit this frame's
// figure layer instead of inking the figure again
export function bossFigureCached(world, t, k, ox, oy, s) {
  const F = FIG, b = world.boss;
  if (!F || F.t !== t || F.b !== b || Math.abs(F.w - Math.round(W * s)) > 0 || Math.abs(F.h - Math.round(H * s)) > 0) return false;
  const sx = b.facing * ART_SCALE;
  return sameM({ a: k * sx, b: 0, c: 0, d: k * ART_SCALE, e: k * b.x + ox, f: k * (GROUND_Y - b.y) + oy }, F.m);
}
// world rects -> whole device-px rects under the transform m (axis-aligned: scale + translate)
function deviceRects(m, rects) {
  return rects.map((r) => {
    const xa = m.a * r.x + m.e, xb = m.a * (r.x + r.w) + m.e, ya = m.d * r.y + m.f, yb = m.d * (r.y + r.h) + m.f;
    const x = Math.floor(Math.min(xa, xb)), y = Math.floor(Math.min(ya, yb));
    return { x, y, w: Math.ceil(Math.max(xa, xb)) - x, h: Math.ceil(Math.max(ya, yb)) - y };
  });
}
const STATE_KEYS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset', 'font', 'textAlign', 'textBaseline', 'imageSmoothingEnabled'];
const sameM = (m, f) => Math.abs(m.a - f[0]) < 1e-4 && Math.abs(m.b - f[1]) < 1e-4 && Math.abs(m.c - f[2]) < 1e-4
  && Math.abs(m.d - f[3]) < 1e-4 && Math.abs(m.e - f[4]) < 0.01 && Math.abs(m.f - f[5]) < 0.01;
function figure(ctx, b, pose, t, contour, deadP, want) {
  const plain = typeof document === 'undefined' || !ctx.canvas || !ctx.getTransform
    || ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over' || (ctx.filter && ctx.filter !== 'none');
  if (plain || deadP > 0) return drawScrivener(ctx, b, pose, t);
  const cw = ctx.canvas.width, ch = ctx.canvas.height, m = ctx.getTransform();
  if (!contour) {
    // the silhouette pass: the layer inked this frame for the same boss under the same mapping
    const F = FIG;
    if (F && F.t === t && F.b === b && F.w === cw && F.h === ch && sameM(m, F.m)) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(F.canvas, 0, 0);
      ctx.restore();
      return F.anchors;
    }
    return drawScrivener(ctx, b, pose, t);
  }
  if (!want) return drawScrivener(ctx, b, pose, t);
  if (!FIG_CANVAS) FIG_CANVAS = document.createElement('canvas');
  const L = FIG_CANVAS;
  if (L.width !== cw || L.height !== ch) { L.width = cw; L.height = ch; }
  const g = L.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  g.clearRect(0, 0, cw, ch);
  for (const k of STATE_KEYS) g[k] = ctx[k];
  g.setLineDash(ctx.getLineDash());
  g.setTransform(m);
  const anchors = drawScrivener(g, b, pose, t);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(L, 0, 0);
  ctx.restore();
  FIG = { canvas: L, t, b, m: [m.a, m.b, m.c, m.d, m.e, m.f], w: cw, h: ch, anchors };
  return anchors;
}

// (qa2) Where the figure was last inked, in device px: the contour pass measures it every frame.
// fx/sil.js bounds the Scrivener's silhouette work to it (it used to take the whole frame: a hit
// flash was ~15 full-frame composites). Valid only for the same render time and the same
// world -> device mapping (k px per logical px, offset ox/oy), i.e. later in the same frame.
let DRAWN = null;
export function drawnBossBounds(world, t, k, ox, oy) {
  const D = DRAWN, b = world.boss;
  if (!D || D.t !== t) return null;
  const close = (u, v) => Math.abs(u - v) < 0.01;
  if (!close(D.a, b.facing * ART_SCALE * k) || !close(D.d, ART_SCALE * k)) return null;
  if (!close(D.e, b.x * k + ox) || !close(D.f, (GROUND_Y - b.y) * k + oy)) return null;
  return { x: D.x, y: D.y, w: D.w, h: D.h };
}

// ---- the outer contour, re-inked by light ------------------------------------------
// round 27: after the figure is inked on the page, its silhouette is re-cut in screen
// space against the window light (upper left). Every edge that turns away from the
// light gets an ink band that swells to ~3 px at 1x where the edge faces straight
// down-and-back (under the jaw, the arms, the ledger, the hem, the feet on the floor)
// and fades to nothing as the edge turns toward the light; every edge facing the light
// gets an ink hairline at the very rim, so the paper gap behind it reads as rim light,
// not as a pasted keyline. One contour, no single mechanical width.
// The silhouette is taken from a half-resolution re-inking of the figure, cropped to its
// measured bounds (the band is a soft-edged brush mask laid over the full-res figure).
const LIGHT = [-0.56, -0.83];  // toward the window shaft (screen space)
const SHADE = [0.5, 0.866];    // the shadow side
const Q = 0.5;                 // mask resolution
let CB = null;
function cbuf(w, h) {
  if (!CB) {
    const mk = () => document.createElement('canvas');
    CB = { o: mk(), a: mk(), r: mk(), w: mk(), s: mk(), last: null };
  }
  for (const c of [CB.o, CB.a, CB.r, CB.w]) if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); CB.last = null; }
  return CB;
}
const CELL = 6; // bbox probe resolution (mask px)
// shown: optional device-px rects; the band is only computed and drawn inside them (the rest of
// the figure is painted over this frame); layer: the figure inked at full resolution this frame
// (figure()), the mask's source in that case. The probe still measures the whole figure.
function contourPass(ctx, draw, shown = null, layer = null) {
  if (typeof document === 'undefined' || !ctx.canvas || !ctx.getTransform) return;
  const m = ctx.getTransform();
  const W = ctx.canvas.width, H = ctx.canvas.height;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [lx, ly] of [[-440, -660], [440, -660], [-440, 90], [440, 90]]) {
    const X = m.a * lx + m.c * ly + m.e, Y = m.b * lx + m.d * ly + m.f;
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
  const bw = Math.ceil((x1 - x0) * Q), bh = Math.ceil((y1 - y0) * Q);
  if (bw < 16 || bh < 16) return;
  // (qa2) size the mask buffers for the largest box this target can give (the box is clamped
  // to the canvas): growing four canvases mid-fight, the first time the Scrivener's box got a
  // few px bigger, cost a ~30 ms frame
  const B = cbuf(Math.max(bw, Math.ceil(W * Q)), Math.max(bh, Math.ceil(H * Q)));
  const o = B.o.getContext('2d'), a = B.a.getContext('2d'), r = B.r.getContext('2d'), w = B.w.getContext('2d');
  const k = Math.max(0.5, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / ART_SCALE) * Q; // mask px per 1x screen px
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
  if (B.last) o.clearRect(B.last[0], B.last[1], B.last[2], B.last[3]); else o.clearRect(0, 0, B.o.width, B.o.height);
  if (shown && layer) {
    // (qa3) under the white flash the band only shows in a few small windows (and there only
    // through the challenger's anti-aliased edge and in the ink pool at the feet): the mask is
    // taken from the figure already inked at full resolution this frame, halved, instead of
    // inking the whole figure a second time
    o.imageSmoothingEnabled = true;
    o.drawImage(layer, x0, y0, x1 - x0, y1 - y0, 0, 0, (x1 - x0) * Q, (y1 - y0) * Q);
  } else {
    o.setTransform(m.a * Q, m.b * Q, m.c * Q, m.d * Q, (m.e - x0) * Q, (m.f - y0) * Q);
    draw(o);
    o.setTransform(1, 0, 0, 1, 0, 0);
  }
  // the figure's real bounds: probe a 1/6 copy of the mask
  const sw = Math.ceil(bw / CELL), sh = Math.ceil(bh / CELL);
  if (B.s.width !== sw || B.s.height !== sh) { B.s.width = sw; B.s.height = sh; }
  const sc = B.s.getContext('2d', { willReadFrequently: true });
  sc.clearRect(0, 0, sw, sh);
  sc.drawImage(B.o, 0, 0, sw * CELL, sh * CELL, 0, 0, sw, sh);
  const d = sc.getImageData(0, 0, sw, sh).data;
  let cx0 = sw, cy0 = sh, cx1 = -1, cy1 = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3]) { if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
  if (cx1 < 0) { B.last = null; return null; }
  const pad = 4;
  const bx = Math.max(0, cx0 * CELL - CELL - pad), by = Math.max(0, cy0 * CELL - CELL - pad);
  const ex = Math.min(bw, (cx1 + 2) * CELL + pad), ey = Math.min(bh, (cy1 + 2) * CELL + pad);
  const tw = ex - bx, th = ey - by;
  B.last = [bx, by, tw, th];
  const bounds = { x: x0 + bx / Q, y: y0 + by / Q, w: tw / Q, h: th / Q }; // the figure's inked bounds
  // the windows in box px (grown 2 px for the upscale's bilinear reach), clipped to the box
  let win = null;
  if (shown) {
    win = [];
    for (const r of shown) {
      const wx0 = Math.max(0, Math.floor((r.x - x0) * Q - bx) - 2), wy0 = Math.max(0, Math.floor((r.y - y0) * Q - by) - 2);
      const wx1 = Math.min(tw, Math.ceil((r.x + r.w - x0) * Q - bx) + 2), wy1 = Math.min(th, Math.ceil((r.y + r.h - y0) * Q - by) + 2);
      if (wx1 > wx0 && wy1 > wy0) win.push([wx0, wy0, wx1 - wx0, wy1 - wy0]);
    }
    if (!win.length) return bounds; // all of it is painted over this frame
  }
  const put = (g, op, dx, dy) => { g.globalCompositeOperation = op; g.drawImage(B.o, bx, by, tw, th, dx, dy, tw, th); };
  // keep the unbounded ops to the box (or to its visible windows: every op is per pixel, so the
  // pixels inside a window come out exactly as they would with the whole box computed)
  const clip = (g) => { g.save(); g.beginPath(); if (win) for (const q of win) g.rect(q[0], q[1], q[2], q[3]); else g.rect(0, 0, tw, th); g.clip(); };
  const over = (op) => { a.globalCompositeOperation = op; a.drawImage(B.r, 0, 0, tw, th, 0, 0, tw, th); };
  // 1. r = the interior that survives both cuts: pixels whose neighbour 2.2 px toward
  // the shade AND whose neighbour 0.9 px toward the light are both inside the figure;
  // a = the silhouette minus it = a light band on every shadowed edge + the lit hairline
  clip(r); clip(a);
  put(r, 'copy', -SHADE[0] * 2.2 * k, -SHADE[1] * 2.2 * k);
  put(r, 'destination-in', -LIGHT[0] * 0.9 * k, -LIGHT[1] * 0.9 * k);
  put(a, 'copy', 0, 0);
  over('destination-out');
  // 2. the full brush (4.5 px) where the form behind the edge runs at least 8 px deep,
  // so a thin claw, horn or needle keeps its white and its point
  put(r, 'copy', 0, 0);
  put(r, 'destination-out', -SHADE[0] * 4.5 * k, -SHADE[1] * 4.5 * k);
  put(r, 'destination-in', SHADE[0] * 8 * k, SHADE[1] * 8 * k);
  over('source-over');
  // 3. where the feet meet the floor shadow: a 7 px pool of ink, fading out upward
  const fy = (m.f - y0) * Q - by; // the rig's floor line in box px
  // (round 29: only the strip of rows near the floor is touched)
  const sy0 = Math.max(0, Math.floor(fy - 42 * k)), sh0 = th - sy0;
  if (sh0 > 0) {
    r.globalCompositeOperation = 'copy';
    r.drawImage(B.o, bx, by + sy0, tw, sh0, 0, sy0, tw, sh0);
    r.globalCompositeOperation = 'destination-out';
    r.drawImage(B.o, bx, by + sy0, tw, sh0, 0, sy0 - 7 * k, tw, sh0);
    r.globalCompositeOperation = 'destination-in';
    const gr = r.createLinearGradient(0, fy - 40 * k, 0, fy - 4 * k);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    r.fillStyle = gr; r.fillRect(0, sy0, tw, sh0);
    a.globalCompositeOperation = 'source-over';
    a.drawImage(B.r, 0, sy0, tw, sh0, 0, sy0, tw, sh0);
  }
  // 4. round 29: the LIT side is not inked. Where an edge faces the window shaft a
  // tapered paper rim (up to ~2.4 px, dying to nothing as the edge turns away, by the
  // cosine of the shift) is cut just inside the silhouette. The pale parts carry their
  // paper lift gaps on the side away from the light, so on the lit side the rim cuts
  // into their own ink contour and leaves it a hairline over light.
  clip(w);
  // rim = figure between 0.6 and 2.4 px in from a lit edge (so a hairline of the old
  // contour stays outside it), only where the form runs 7 px deep behind it (the light
  // and the shade are opposite, so it never meets the shaded band); broken into long dashes, so along the lit side the
  // contour alternates between a hairline over a paper rim and a plain black edge
  put(w, 'copy', -LIGHT[0] * 0.6 * k, -LIGHT[1] * 0.6 * k);
  put(w, 'destination-out', -LIGHT[0] * 2.4 * k, -LIGHT[1] * 2.4 * k);
  put(w, 'destination-in', LIGHT[0] * 7 * k, LIGHT[1] * 7 * k);
  {
    const BK = breakTile(k), T = BK.tile;
    const sx = (((-((m.e - x0) * Q - bx)) % T) + T) % T, sy = (((-((m.f - y0) * Q - by)) % T) + T) % T;
    const cw = Math.min(tw, BK.width - sx), chh = Math.min(th, BK.height - sy);
    w.globalCompositeOperation = 'destination-out';
    w.drawImage(BK, sx, sy, cw, chh, 0, 0, cw, chh);
  }
  // (qa3) an opaque fill 'source-atop' = 'source-in' (colour x the mask's alpha, the same
  // pixels), but bounded: no layer for it
  w.globalCompositeOperation = 'source-atop';
  w.fillStyle = PAPER; w.fillRect(0, 0, tw, th);
  a.globalCompositeOperation = 'source-atop';
  a.fillStyle = INK; a.fillRect(0, 0, tw, th);
  // one layer (ink band + paper rim), so the threshold filter runs once
  a.globalCompositeOperation = 'source-over';
  a.drawImage(B.w, 0, 0, tw, th, 0, 0, tw, th);
  r.restore(); a.restore(); w.restore();
  w.globalCompositeOperation = 'source-over';
  a.globalCompositeOperation = 'source-over'; r.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  // the upscaled mask is re-sharpened to a hard ink edge (an alpha threshold)
  // (qa2) clip to the drawn rect (whole px): the filter's layer otherwise spans the whole clip
  // (the canvas), ~1.5 ms more software raster per frame for the same pixels
  ctx.beginPath();
  if (shown) {
    const ux0 = x0 + bx / Q, uy0 = y0 + by / Q, ux1 = ux0 + tw / Q, uy1 = uy0 + th / Q;
    for (const r of shown) {
      const rx0 = Math.max(ux0, r.x), ry0 = Math.max(uy0, r.y), rx1 = Math.min(ux1, r.x + r.w), ry1 = Math.min(uy1, r.y + r.h);
      if (rx1 > rx0 && ry1 > ry0) ctx.rect(rx0, ry0, rx1 - rx0, ry1 - ry0);
    }
  } else ctx.rect(x0 + bx / Q, y0 + by / Q, tw / Q, th / Q);
  ctx.clip();
  ctx.filter = threshFilter();
  ctx.drawImage(B.a, 0, 0, tw, th, x0 + bx / Q, y0 + by / Q, tw / Q, th / Q);
  ctx.restore();
  return bounds;
}
// where the lit hairline survives: long irregular dashes (in 1x screen px, pinned to
// the figure so they do not crawl): where the lit rim is left out
const BREAKT = new Map();
// (qa2) k used to key this cache exactly, so any zoom that changes every frame (the hit
// punch-ins, the freeze page's slide-in) built a new ~1700 px sheet of ~35,000 arcs on every
// frame (20-40 ms each) and kept all of them (~12 MB apiece). Now k snaps to 1/8-octave steps
// (the dashes change size by at most 4.5%), the cache holds a few sheets, and a sheet is one
// T x T cell (its 34 dashes, wrapped across the cell edges) filled out as a pattern: the same
// periodic sheet as before, for ~300 arcs.
const BREAKT_MAX = 6;
// the dash tile at mask scale k, repeated over a sheet big enough for any box, cached
function breakTile(k) {
  const kq = 2 ** (Math.round(Math.log2(Math.max(1e-3, k)) * 8) / 8);
  const key = Math.round(kq * 1000);
  const hit = BREAKT.get(key);
  if (hit) { BREAKT.delete(key); BREAKT.set(key, hit); return hit; } // most recently used last
  const T = Math.max(8, Math.round(96 * kq));
  const reps = 2 + Math.ceil(1600 / T);
  const cell = document.createElement('canvas');
  cell.width = T; cell.height = T;
  const c = cell.getContext('2d');
  c.fillStyle = '#000';
  for (let i = 0; i < 34; i++) {
    const x = hashNoise(91, i) * T, y = hashNoise(92, i) * T, rr = (3 + hashNoise(93, i) * 7) * kq;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const cx = x + ox * T, cy = y + oy * T;
      if (cx + rr < 0 || cx - rr > T || cy + rr < 0 || cy - rr > T) continue;
      c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.fill();
    }
  }
  const big = document.createElement('canvas');
  big.width = T * reps; big.height = T * reps;
  const h = big.getContext('2d');
  h.fillStyle = h.createPattern(cell, 'repeat');
  h.fillRect(0, 0, big.width, big.height);
  big.tile = T;
  BREAKT.set(key, big);
  while (BREAKT.size > BREAKT_MAX) BREAKT.delete(BREAKT.keys().next().value);
  return big;
}
let THRESH = null;
function threshFilter() {
  if (THRESH) return THRESH;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = '<filter id="scrivener-ink-thresh" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="3.2" intercept="-1.1"/></feComponentTransfer></filter>';
  document.body.appendChild(svg);
  THRESH = 'url(#scrivener-ink-thresh)';
  return THRESH;
}

// ---- hazards -----------------------------------------------------------------

export function drawHazards(ctx, world, t) {
  const b = world.boss;
  for (const h of world.hazards) {
    if (h.style && drawStyledHazard(ctx, h, world, t)) continue;
    const cx = (h.x0 + h.x1) / 2;
    if (h.kind === 'melee') {
      // the nib's sweep: a crescent of dense ruled speed lines with a heavy leading edge
      const p = clamp(h.age / Math.max(1, h.ttl), 0, 1);
      const r = Math.abs(h.x1 - h.x0);
      const ox = h.facing > 0 ? h.x0 : h.x1;
      const cy = GROUND_Y - h.y0 - 130;
      const a1 = lerp(-1.25, 0.95, Math.min(1, 0.35 + p * 1.2));
      const a0 = lerp(-1.25, a1, Math.min(0.85, p * 1.4));
      const k = 1 - p * 0.7;
      ctx.save();
      ctx.fillStyle = INK;
      ctx.beginPath();
      for (let l = 0; l < 10; l++) {
        const rr = r * (0.62 + l * 0.04);
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const a = lerp(a0 + l * 0.02, a1, i / 12);
          pts.push([ox + h.facing * Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.95]);
        }
        const w = (l === 9 ? 7 : 1.3 + hashNoise(h.id, l) * 0.9) * k;
        ribbonPathHz(ctx, pts, (tt) => w * Math.pow(tt, l === 9 ? 0.8 : 1.6));
      }
      ctx.fill();
      ctx.restore();
    } else if (h.kind === 'page' || h.kind === 'storm_page') {
      ctx.save();
      const y = GROUND_Y - (h.y0 + h.y1) / 2;
      if (h.kind === 'storm_page' && !h.landed) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y + 4, 26 * (1 - h.y0 / 600) + 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.translate(cx, y);
      ctx.rotate((h.spin - 0.5) * 2 + h.age / 90 * (h.landed ? 0 : 1));
      const w = h.x1 - h.x0, hh = h.y1 - h.y0;
      ctx.fillStyle = PAPER;
      ctx.fillRect(-w / 2, -hh / 2, w, hh);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-w / 2, -hh / 2, w, hh);
      for (let l = 0; l < 3; l++) line(ctx, -w / 2 + 4, -hh / 2 + 7 + l * 7, w / 2 - 6, -hh / 2 + 7 + l * 7, 1, { seed: h.id * 3 + l });
      ctx.restore();
    } else if (h.kind === 'shockwave') {
      const w = h.x1 - h.x0;
      for (let i = 0; i < 6; i++) {
        const x = h.x0 + (i / 5) * w;
        const ht = (h.y1 - h.y0) * (0.5 + hashNoise(h.id, i + Math.floor(t / 60)) * 0.8);
        stroke(ctx, [[x, GROUND_Y], [x + Math.sign(h.vx) * 6, GROUND_Y - ht]], { width: 7, taper: 0.9, seed: h.id + i });
      }
    } else if (h.kind === 'detonation') {
      const warn = h.age < h.delay;
      if (warn) {
        ctx.save();
        ctx.strokeStyle = RED;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(h.age / 40);
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y + 2, (h.x1 - h.x0) / 2, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        const p = clamp((h.age - h.delay) / (h.ttl - h.delay), 0, 1);
        for (let i = 0; i < 12; i++) {
          const x = h.x0 + hashNoise(h.id, i) * (h.x1 - h.x0);
          const top = GROUND_Y - (h.y1 - h.y0) * (0.4 + 0.6 * hashNoise(h.id + 1, i)) * (p < 0.3 ? p / 0.3 : 1);
          stroke(ctx, [[x, GROUND_Y], [x + (hashNoise(h.id + 2, i) - 0.5) * 30, top]], { width: 16, taper: 0.9, seed: h.id + i, alpha: 1 - p * 0.6 });
        }
      }
    } else if (h.kind === 'gust') {
      for (let i = 0; i < 10; i++) {
        const y = GROUND_Y - 20 - hashNoise(h.id, i) * 260;
        const x = b.x + h.facing * (80 + ((h.age * 0.9 + hashNoise(h.id + 1, i) * 600) % 700));
        line(ctx, x, y, x + h.facing * 60, y + 2, 1.5, { seed: h.id + i, alpha: 0.6 });
      }
    }
  }
}

// The challenger's name being written in the ledger appears over its head.
export function drawCurseMark(ctx, world, t) {
  const b = world.boss, a = world.agent;
  if (!(b.state === 'active' && b.attackId === 'written_name')) return;
  const local = b.stateT * bossSpeed(b);
  const p = clamp(local / ATTACKS.written_name.curse.writeMs, 0, 1);
  // (tells r9) the wet ink ring seeping out under the challenger, sliding with them and
  // darkening as the line nears its end (it stops dead and erupts when the pen lifts)
  if (p < 1) {
    const rw = ATTACKS.written_name.curse.det.w / 2;
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.55 * p;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(a.x, GROUND_Y + 3, rw * (0.45 + 0.55 * easeOutCubic(p)), 7 + 5 * p, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6 + 0.4 * p;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2 + 2 * p;
    ctx.beginPath();
    ctx.ellipse(a.x, GROUND_Y + 3, rw, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const n = Math.ceil(p * 7);
  for (let i = 0; i < n; i++) {
    const x = a.x - 42 + i * 13;
    const y = GROUND_Y - a.y - 120 + Math.sin(t / 200 + i) * 3;
    stroke(ctx, [[x, y - 10], [x + 6, y], [x + 2, y + 10]], { width: 3, seed: 600 + i, color: RED });
  }
}
