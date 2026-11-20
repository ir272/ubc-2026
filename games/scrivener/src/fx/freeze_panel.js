// The "thinking freeze": while a brain decides, world time stops and the frame
// is re-cut into a manga page.
//   A  the Scrivener, close, with the tell in a narration box
//   B  the challenger, closer, its thought in a thought balloon
//   C  the answer: the action as heavy SFX lettering + a red timing stamp
//   D  the stakes: both health bars, attempt, deaths, the stopped clock
// Owner: ui. Reads state only; deterministic on th.elapsed.
//
// drawFreeze(ctx, match, frame, info, t)
//   frame: an offscreen W x H canvas holding the just-rendered world frame
//   info:  { brainLabel, fresh }  fresh: the host rendered `frame` during this very frame;
//          the panels' bitmaps are then built on the next frame, not on top of it

import { W, H, GROUND_Y, AGENT_LABEL } from '../core/constants.js';
import { clamp, easeOutCubic } from '../core/math.js';
import { INK, PAPER, paper, speedLines, tonePattern, offscreen } from '../render/ink.js';
import { AGENT_COLORS, drawAgent } from '../render/agent_draw.js';
import { drawBoss, drawHazards } from '../render/boss_draw.js';
import { FONT, spaced, measureSpaced, fitText, thoughtBalloon, letterLines, captionBox, sfxText, ACTION_WORDS, TIMING_WORDS } from '../ui/letter.js';
import { portrait, quillBar, tally } from '../ui/ornament.js';

const STAMP = '#b3261b';
// the page fades in over this long; after it the paper hides the world frame underneath
export const PAGE_IN_MS = 160;

// (perf r1) Panels A (the Scrivener) and B's background are static once they have slid
// in, but re-rendering them (vector actors through a slanted clip) cost ~10 ms a frame.
// (qa2) The slide-in re-rendered them too, every frame for ~250 ms, and the Scrivener's
// contour pass at 1.1-2.5x zoom on the full canvas made the first freeze frames 40-60 ms.
// Each panel is now drawn ONCE per freeze at its settled geometry into a cached bitmap; the
// slide-in only moves, zooms (about the panel's focus point) and fades that bitmap. A is built
// on the first visible frame, B (which starts 60 ms later) a few frames after, so the work
// never lands on one frame.
const panelCache = new Map(); // name -> { th, s, canvas, x, y, w, h }
// the paper sheet at the target's pixel scale, so each freeze frame blits it 1:1 (resampling
// the 1280x720 sheet up to a 1080p / 1440p backing store every frame was the costliest draw)
let pageCache = null;
function pageAt(ctx) {
  const m = ctx.getTransform();
  const s = Math.hypot(m.a, m.b) || 1;
  const src = paper(W, H, { seed: 31 });
  if (Math.abs(s - 1) < 1e-3) return src;
  if (!pageCache || pageCache.s !== s) {
    const c = offscreen(Math.round(W * s), Math.round(H * s));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    pageCache = { s, c };
  }
  return pageCache.c;
}

// draw(ctx) renders the panel at its settled geometry (box). The bitmap is blitted with
// alpha k, shifted by (dx, dy), scaled by `zoom` about (px, py) (settled coords) and clipped
// to `pts` (the sliding panel). zoom >= 1 and a pivot inside the convex panel keep it covered.
function cachedPanel(ctx, name, th, box, draw, { k = 1, pts = null, dx = 0, dy = 0, zoom = 1, px = 0, py = 0 } = {}) {
  const m = ctx.getTransform();
  const s = Math.hypot(m.a, m.b) || 1;
  let c = panelCache.get(name);
  if (!c || c.th !== th || c.s !== s) {
    const x = Math.floor(box.x) - 2, y = Math.floor(box.y) - 2;
    const w = Math.ceil(box.w) + 4, h = Math.ceil(box.h) + 4;
    const canvas = c && c.canvas && c.canvas.width === Math.ceil(w * s) && c.canvas.height === Math.ceil(h * s) ? c.canvas : offscreen(Math.ceil(w * s), Math.ceil(h * s));
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(s, 0, 0, s, -x * s, -y * s);
    draw(g);
    c = { th, s, canvas, x, y, w, h };
    panelCache.set(name, c);
  }
  if (k >= 1 && !dx && !dy && zoom === 1) { ctx.drawImage(c.canvas, c.x, c.y, c.w, c.h); return; }
  ctx.save();
  ctx.globalAlpha *= k;
  if (pts) clipTo(ctx, pts);
  ctx.translate(dx + px, dy + py);
  ctx.scale(zoom, zoom);
  ctx.translate(-px, -py);
  ctx.drawImage(c.canvas, c.x, c.y, c.w, c.h);
  ctx.restore();
}
const ramp = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const short = (label) => String(label || '').replace(/^[a-z-]+\//, '');

function poly(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function bbox(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Render a zoomed view of the world into panel `pts`: the frame buffer gives the
// (softened) background, the actors are redrawn crisp as vectors on top.
function worldView(ctx, frame, world, t, box, fx, fy, z, { actors = true, mirror = false } = {}) {
  ctx.save();
  ctx.translate(box.x + box.w * 0.5, box.y + box.h * 0.5);
  ctx.scale(mirror ? -z : z, z);
  ctx.translate(-fx, -fy);
  ctx.drawImage(frame, 0, 0, W, H);
  if (actors) {
    drawBoss(ctx, world, t);
    drawHazards(ctx, world, t);
    drawAgent(ctx, world, t);
  }
  ctx.restore();
}

function panelFrame(ctx, pts, width = 4) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  poly(ctx, pts);
  ctx.stroke();
  ctx.restore();
}

function clipTo(ctx, pts) {
  ctx.beginPath();
  poly(ctx, pts);
  ctx.clip();
}

export function drawFreeze(ctx, match, frame, info = {}, t = 0) {
  const w = match.world;
  const th = w.thinking;
  if (!th) return;
  const e = th.elapsed;
  const a = w.agent, b = w.boss;
  const agent = match.current;
  const who = AGENT_LABEL[agent] || agent;
  const color = AGENT_COLORS[agent] || INK;
  const p = match.pending && match.pending.kind === 'decide' ? match.pending : null;
  const reply = p && p.reply && p.revealAt != null && e >= p.revealAt ? p.reply : null;
  const rk = reply ? e - p.revealAt : 0;

  // ---- the page
  const pageK = easeOutCubic(ramp(e, 0, PAGE_IN_MS));
  ctx.save();
  ctx.globalAlpha = pageK;
  ctx.drawImage(pageAt(ctx), 0, 0, W, H);
  ctx.restore();
  if (pageK < 0.05) return;

  // (qa2) the world frame and panel A's bitmap are each a few ms of raster: never both at once
  const build = !info.fresh;
  const slide = (k, d) => (1 - easeOutCubic(k)) * d;
  const kA = ramp(e, 0, 200), kB = ramp(e, 60, 260), kC = ramp(e, 120, 320), kD = ramp(e, 30, 230);
  const A1 = [[14, 14], [706, 14], [646, 506], [14, 506]];
  const B1 = [[718, 14], [1266, 14], [1266, 268], [687, 268]];
  const A = A1.map(([x, y]) => [x - slide(kA, 40), y]);
  const B = B1.map(([x, y]) => [x + slide(kB, 50), y]);
  const C = [[686, 280], [1266, 280], [1266, 506], [658, 506]].map(([x, y]) => [x + slide(kC, 50), y]);
  const D = [[14, 518], [1266, 518], [1266, 706], [14, 706]].map(([x, y]) => [x, y + slide(kD, 30)]);

  // ---- A: the Scrivener, close
  {
    const box = bbox(A1); // settled geometry: the cached bitmap is drawn here, then slid
    // staging: the Scrivener always faces into the page, toward the challenger's panel
    const mirrorA = b.facing < 0, sA = mirrorA ? -1 : 1;
    const zA1 = 1.12, zA = zA1 + (1 - easeOutCubic(kA)) * 0.12;
    // the zoom keeps the Scrivener pinned at (box centre + 4% of the width, centre)
    const fx = b.x - (0.04 * box.w) / (sA * zA1), fy = GROUND_Y - b.y - 300;
    const px = box.x + box.w * 0.54, py = box.y + box.h * 0.5;
    if (build) cachedPanel(ctx, 'A', th, box, (ctx) => {
    ctx.save();
    clipTo(ctx, A1);
    worldView(ctx, frame, w, t, box, fx, fy, zA1, { mirror: mirrorA });
    // focus lines from the rim inward (tension), leaving the figure clear
    speedLines(ctx, box.x + box.w * 0.55, box.y + box.h * 0.42, 250, 620, 60, 17, { alpha: 0.6, width: 3.4 });
    // the tell, as narration
    const pose = (th.pose || '').toUpperCase();
    const fit = fitText(ctx, pose, (s) => `bold ${s}px ${FONT.letter}`, 300, 150, [17, 16, 15, 14, 13]);
    const bw = Math.max(220, fit.w + 34), bh = fit.h + 26;
    const bx = Math.min(box.x + box.w - bw - 74, 360), by = 42;
    captionBox(ctx, bx, by, bw, bh, { width: 2.2 });
    ctx.save();
    ctx.font = `bold ${fit.size}px ${FONT.letter}`;
    ctx.fillStyle = INK;
    ctx.textBaseline = 'top';
    fit.lines.forEach((l, i) => {
      ctx.save();
      ctx.translate(bx + 17, by + 14 + i * fit.lh);
      ctx.transform(1, 0, -0.1, 1, 0, 0);
      ctx.fillText(l, 0, 0);
      ctx.restore();
    });
    ctx.restore();
    // tab: what this box is
    ctx.fillStyle = INK;
    ctx.fillRect(bx, by - 20, 132, 20);
    spaced(ctx, 'THE TELL', bx + 10, by - 5, { font: `12px ${FONT.caps}`, color: PAPER, spacing: 4 });
    ctx.restore();
    }, { k: kA, pts: A, dx: A[0][0] - A1[0][0], zoom: zA / zA1, px, py });
    panelFrame(ctx, A);
  }

  // ---- B: the challenger, closer, thinking
  {
    const box1 = bbox(B1), box = bbox(B);
    const zB1 = 2.3, zB = zB1 + (1 - easeOutCubic(kB)) * 0.2;
    const headY = GROUND_Y - a.y - 86;
    // the challenger sits right, facing left across the gutter at the Scrivener
    const mirrorB = a.facing > 0, sB = mirrorB ? -1 : 1;
    // the zoom keeps the challenger pinned at (box centre + 20% of the width, centre)
    const fx = a.x - (box1.w * 0.2) / (sB * zB1), fy = headY + 12;
    const ax1 = box1.x + box1.w * 0.5 + sB * (a.x - fx) * zB1, ay1 = box1.y + box1.h * 0.5 + (headY - fy) * zB1;
    const px = box1.x + box1.w * 0.7, py = box1.y + box1.h * 0.5;
    const dxB = B[0][0] - B1[0][0];
    // the face, live (slid + zoomed like the bitmap): the balloon's tail points at it
    const ax = px + dxB + (ax1 - px) * (zB / zB1), ay = py + (ay1 - py) * (zB / zB1);
    if (kB > 0 && build) cachedPanel(ctx, 'B', th, box1, (ctx) => {
      ctx.save();
      clipTo(ctx, B1);
      worldView(ctx, frame, w, t, box1, fx, fy, zB1, { mirror: mirrorB });
      // screentone dusk over the background, then crisp focus lines on the face
      ctx.fillStyle = tonePattern(ctx, 1.3, 5);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(box1.x, box1.y, box1.w, box1.h);
      ctx.globalAlpha = 1;
      speedLines(ctx, ax1, ay1, 150, 520, 46, 23, { alpha: 0.55, width: 2.6 });
      // the heartbeat
      sfxText(ctx, 'BA-DUMP', box1.x + box1.w - 70, box1.y + box1.h - 18, 24, { fill: PAPER, outline: INK, outlineW: 3, rot: -0.12, weight: 800 });
      ctx.restore();
    }, { k: kB, pts: B, dx: dxB, zoom: zB / zB1, px, py });
    ctx.save();
    ctx.globalAlpha = kB;
    clipTo(ctx, B);

    // the thought balloon
    const bcx = box.x + box.w * 0.38, bcy = box.y + box.h * 0.47;
    const tail = [ax - 30, ay - 4];
    if (reply && reply.thought) {
      const text = reply.thought.toUpperCase();
      const fit = fitText(ctx, text, (s) => `bold ${s}px ${FONT.letter}`, 270, 130, [26, 24, 22, 20, 18, 16]);
      const rx = Math.max(120, fit.w / 2 + 46), ry = Math.max(66, fit.h / 2 + 34);
      const pk = easeOutCubic(ramp(rk, 0, 140));
      thoughtBalloon(ctx, bcx, bcy, rx * (0.85 + 0.15 * pk), ry * (0.85 + 0.15 * pk), tail, { seed: 29 });
      letterLines(ctx, fit.lines, bcx, bcy + 1, fit.size, { lh: fit.lh, reveal: ramp(rk, 40, 280) });
    } else {
      thoughtBalloon(ctx, bcx, bcy, 92, 52, tail, { seed: 29 });
      const n = 1 + (Math.floor(e / 260) % 3);
      ctx.fillStyle = INK;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = kB * (i < n ? 1 : 0.18);
        ctx.beginPath(); ctx.arc(bcx - 24 + i * 24, bcy + 2, 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = kB;
    }
    ctx.restore();
    // speaker tag on the panel edge
    ctx.save();
    ctx.globalAlpha = kB;
    const tag = `${who} THINKS`;
    const tf = `bold 13px ${FONT.caps}`;
    const tw = measureSpaced(ctx, tag, tf, 3) + 22;
    ctx.fillStyle = color;
    ctx.fillRect(B[3][0] + 12, B[3][1] - 34, tw, 22);
    spaced(ctx, tag, B[3][0] + 12 + tw / 2, B[3][1] - 18, { font: tf, color: PAPER, spacing: 3, align: 'center' });
    ctx.restore();
    panelFrame(ctx, B);
  }

  // ---- C: the answer
  {
    const box = bbox(C);
    ctx.save();
    ctx.globalAlpha = kC;
    clipTo(ctx, C);
    ctx.fillStyle = '#efe9d8';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const cx = box.x + box.w * 0.5 + 6, cy = box.y + box.h * 0.5;
    if (reply) {
      const sk = easeOutCubic(ramp(rk, 0, 150));
      // impact: black burst lines behind the word
      speedLines(ctx, cx, cy, 70, 420, 60, 41, { alpha: 0.85 * sk, width: 5 });
      ctx.fillStyle = '#efe9d8';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 250 * sk, 62 * sk, -0.04, 0, Math.PI * 2);
      ctx.fill();
      const word = ACTION_WORDS[reply.action] || String(reply.action || 'HOLD').toUpperCase().replace(/_/g, ' ');
      const size = word.length > 10 ? 70 : 84;
      const z = 1.35 - 0.35 * sk;
      ctx.save();
      ctx.translate(cx, cy + size * 0.34);
      ctx.scale(z, z);
      sfxText(ctx, word, 0, 0, size, { fill: INK, outline: PAPER, outlineW: 8, alpha: sk, rot: -0.05, shear: -0.2 });
      ctx.restore();
      // timing stamp (hanko)
      const stk = ramp(rk, 110, 220);
      if (stk > 0) {
        const tword = TIMING_WORDS[reply.timing] || String(reply.timing || '').toUpperCase();
        const sx = box.x + box.w - 104, sy = box.y + box.h - 34;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-0.12);
        const s2 = 1.6 - 0.6 * easeOutCubic(stk);
        ctx.scale(s2, s2);
        ctx.globalAlpha *= stk;
        ctx.strokeStyle = STAMP;
        ctx.lineWidth = 3.5;
        const sw = measureSpaced(ctx, tword, `bold 24px ${FONT.caps}`, 4) + 34;
        ctx.strokeRect(-sw / 2, -24, sw, 46);
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-sw / 2 + 5, -19, sw - 10, 36);
        spaced(ctx, tword, 0, 8, { font: `bold 24px ${FONT.caps}`, color: STAMP, spacing: 4, align: 'center' });
        ctx.restore();
      }
    } else {
      // waiting: the question hangs
      ctx.fillStyle = tonePattern(ctx, 1.1, 4.5);
      ctx.globalAlpha = 0.5 * kC;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = kC;
      sfxText(ctx, 'WHICH WAY…?', cx, cy + 22, 62, { fill: PAPER, outline: INK, outlineW: 5, rot: -0.04 });
    }
    // caption tab
    captionBox(ctx, C[0][0] + 6, C[0][1] + 12, 168, 26, { dark: true, width: 1.5 });
    spaced(ctx, reply ? `${who} ANSWERS` : `${who} DECIDES`, C[0][0] + 90, C[0][1] + 30, { font: `bold 12px ${FONT.caps}`, color: PAPER, spacing: 3, align: 'center' });
    ctx.restore();
    panelFrame(ctx, C);
  }

  // ---- D: the stakes (black panel)
  {
    const box = bbox(D);
    ctx.save();
    ctx.globalAlpha = kD;
    clipTo(ctx, D);
    ctx.fillStyle = '#0c0b0a';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    // faint white rain of ink-flecks like a night panel
    ctx.strokeStyle = 'rgba(231,224,204,0.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = box.x + ((i * 97) % box.w), y0 = box.y + ((i * 53) % box.h);
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x - 10, y0 + 40); ctx.stroke();
    }
    const y0 = box.y;
    // challenger
    portrait(ctx, box.x + 74, y0 + 92, 50, color, agent === 'claude' ? 3 : 5);
    spaced(ctx, who, box.x + 146, y0 + 56, { font: `32px ${FONT.roman}`, color: PAPER, spacing: 6 });
    const nw = measureSpaced(ctx, who, `32px ${FONT.roman}`, 6);
    ctx.font = `italic 15px ${FONT.roman}`;
    ctx.fillStyle = '#a39b88';
    ctx.fillText(short(info.brainLabel), box.x + 146 + nw + 14, y0 + 55);
    quillBar(ctx, box.x + 146, y0 + 74, 330, 14, a.hp / a.maxHp, a.hp / a.maxHp, { finial: 'right', casing: PAPER, channel: '#3a352e' });
    ctx.font = `16px ${FONT.num}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(`${Math.max(0, Math.ceil(a.hp))} / ${a.maxHp}`, box.x + 146, y0 + 118);
    ctx.fillStyle = '#a39b88';
    ctx.font = `14px ${FONT.num}`;
    ctx.fillText(`${a.flasks} flask${a.flasks === 1 ? '' : 's'} left`, box.x + 236, y0 + 118);
    const sc = match.score[agent];
    spaced(ctx, `ATTEMPT ${match.attempt}`, box.x + 146, y0 + 152, { font: `15px ${FONT.num}`, color: PAPER, spacing: 4 });
    if (sc && sc.deaths) {
      spaced(ctx, 'FALLEN', box.x + 286, y0 + 152, { font: `12px ${FONT.caps}`, color: '#a39b88', spacing: 3 });
      tally(ctx, box.x + 350, y0 + 154, sc.deaths, { h: 16, gap: 6, color: '#d85a45', seed: 70, max: 10 });
    }

    // the stopped clock
    const mid = box.x + box.w / 2;
    spaced(ctx, 'TIME STANDS STILL', mid, y0 + 48, { font: `14px ${FONT.caps}`, color: '#a39b88', spacing: 6, align: 'center' });
    const secs = reply ? p.revealAt / 1000 : e / 1000;
    spaced(ctx, `${secs.toFixed(1)}s`, mid, y0 + 108, { font: `52px ${FONT.num}`, color: PAPER, spacing: 2, align: 'center' });
    ctx.font = `italic 15px ${FONT.roman}`;
    ctx.fillStyle = '#a39b88';
    ctx.textAlign = 'center';
    ctx.fillText(reply ? 'the answer is written' : `${who.toLowerCase()} is thinking…`, mid, y0 + 140);
    ctx.textAlign = 'left';
    // dial ticks around the time
    ctx.strokeStyle = 'rgba(231,224,204,0.35)';
    ctx.lineWidth = 1.2;
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(mid + d * 90, y0 + 92); ctx.lineTo(mid + d * 150, y0 + 92); ctx.stroke();
    }

    // the Scrivener
    const rx = box.x + box.w - 30;
    spaced(ctx, 'THE SCRIVENER', rx, y0 + 56, { font: `30px ${FONT.roman}`, color: PAPER, spacing: 7, align: 'right' });
    quillBar(ctx, rx - 410, y0 + 74, 352, 14, b.hp / b.maxHp, b.hp / b.maxHp, { finial: 'right', casing: PAPER, channel: '#3a352e', ticks: 10, clasp: 0.5 });
    ctx.font = `16px ${FONT.num}`;
    ctx.fillStyle = PAPER;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round((b.hp / b.maxHp) * 100)}% of its ink remains`, rx - 58, y0 + 118);
    ctx.fillStyle = '#a39b88';
    ctx.font = `12px ${FONT.caps}`;
    ctx.letterSpacing = '3px';
    ctx.fillText(b.phase >= 2 ? 'SECOND FOLIO · FASTER, FURIOUS' : 'FIRST FOLIO', rx - 58, y0 + 152);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
    ctx.restore();
    panelFrame(ctx, D);
  }
}

