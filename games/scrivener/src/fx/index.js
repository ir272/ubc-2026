// Feedback layer: wires bus events to hit flashes, impact frames, ink, shake,
// SFX lettering and the stagger / death sequences. Owner: feedback.
// Advanced by SIM ticks (fx.tick(dt)) so captures are deterministic.
//
//   const fx = createFx(bus);
//   fx.tick(dt)                    once per sim tick
//   fx.shakeOffset(px) -> {x,y}    apply before drawing the world (px: device px per logical px;
//                                  the offset is snapped to whole device pixels)
//   fx.drawBehind(ctx, world, t)   floor stains and pools (after arena, before actors)
//   fx.drawFront(ctx, world, t)    (kept for API compatibility; draws nothing)
//   fx.drawPost(ctx, world, t)     screen-space: flashes, impact frames, cards, ink, SFX
//                                  (after the whole world, before the HUD)
//   fx.drawOverlay(ctx, match, frame, info, t)  thinking-freeze panels
//   fx.reset()
//
// The language (Obata impact grammar mapped onto measured Ten Piedad timings):
//  - challenger strikes the boss: the boss burns white inside an ink contour
//    (~100ms) then bleeds a red after-image (to ~220ms); a crescent slash, a white
//    impact void, local focus lines, ink spray and a lettered SFX. Heavy hits open
//    with a one-beat inverted panel.
//  - the boss strikes the challenger: sim hit-stop (~117ms); the page inverts
//    (black, white focus lines, the body burnt white), then a white silhouette in
//    an ink contour, then a launched knockback with motion lines, ghosts and blood.
//  - poise break: inverted panel with the boss cracked like glazed ink, torn
//    shards, tremble marks for the whole stagger.
//  - killing blow: inverted panel + cut, then a red-ink splash card with the
//    figure split along the cut, then ledger pages fall onto a spreading pool.
//  - challenger death: inverted panel, the body turns red, an ink iris closes.

import { GROUND_Y, W, H } from '../core/constants.js';
import { clamp, easeOutCubic, lerp } from '../core/math.js';
import { hashNoise } from '../core/rng.js';
import { INK, PAPER, blot, stroke } from '../render/ink.js';
import { createShake } from './shake.js';
import { createSplatter } from './splatter.js';
import { drawFreeze } from './freeze_panel.js';
import { focusLines, impactStar, slashArc, motionLines } from './impact.js';
import { drawSfx, sfxWord } from './letters.js';
import { sils, blit, outlined, scaleOf } from './sil.js';
import { drawBoss, keepBossFigure } from '../render/boss_draw.js';
import { BLOOD, BLOOD_HOT, drawInverted, drawBossDeathCard, bossDeathInvertExtras, bossDeathInvertUnder, BD, AD, drawAgentDeathAfter } from './sequences.js';

const BOSS_STAGGER_MS = 2400;

export function createFx(bus) {
  const shake = createShake();
  const splat = createSplatter();
  let st;
  const fresh = () => ({
    marks: [],          // local marks: star / slash / focus / sfx / whiff
    bossFlash: null,    // { age, ms, white }
    agentFlash: null,   // { age, from, ms }
    invert: null,       // { age, ms, focus, x, y, seed, crack, red }
    knock: null,        // { age, ms, dir, seed, x0 }
    stagger: null,      // { age, ms, seed }
    bossDeath: null,    // { age, dir, seed, hx, hy, pagesDone }
    agentDeath: null,   // { age, x, seed }
    edge: null,
    decals: [],         // ink/blood flicks painted on the scene { x, y, dir, seed, age, ms, color, scale }
  });
  st = fresh();
  const decal = (d) => { d.age = 0; st.decals.push(d); if (st.decals.length > 10) st.decals.shift(); };
  const mark = (m) => { m.age = 0; st.marks.push(m); if (st.marks.length > 24) st.marks.shift(); };

  bus.on('shake', (e) => shake.add(e.mag, e.ms));

  bus.on('hit', (e) => {
    const seed = (e.tick || 1) * 7 + 3;
    const y = GROUND_Y - (e.y || 60);
    const dir = e.dir || 1;
    if (e.target === 'boss') {
      const heavy = !!e.heavy;
      st.bossFlash = { age: 0, ms: heavy ? 300 : 220, white: heavy ? 130 : 100 };
      if (heavy) st.invert = { age: 0, ms: 60, focus: 'boss', x: e.x, y, seed };
      mark({ kind: 'slash', x: e.x - dir * 30, y, dir, ms: heavy ? 220 : 170, r: heavy ? 130 : 100, seed, heavy, tilt: heavy ? -0.2 : (seed % 2 ? -0.7 : 0.5) });
      mark({ kind: 'star', x: e.x, y, ms: heavy ? 200 : 130, size: heavy ? 130 : 80, seed });
      mark({ kind: 'focus', x: e.x, y, ms: heavy ? 170 : 120, r0: heavy ? 120 : 90, r1: heavy ? 420 : 280, seed });
      mark({ kind: 'sfx', word: sfxWord(heavy ? 'boss_heavy' : 'boss_light', null, heavy, seed), x: e.x + dir * 70, y: y - (heavy ? 120 : 95), size: heavy ? 80 : 60, ms: heavy ? 560 : 440, seed, rot: -0.15 * dir });
      // the Scrivener bleeds ink, with a thread of red
      splat.burst(e.x, y, dir, heavy ? 34 : 18, seed, { speed: heavy ? 640 : 480, size: heavy ? 6 : 4.5, color: INK, spread: 0.9, up: 0.3 });
      splat.burst(e.x, y, dir, heavy ? 10 : 5, seed + 1, { speed: 420, size: 3.5, color: BLOOD, spread: 0.7, up: 0.5 });
      shake.kick(dir, 0.15, heavy ? 11 : 4, heavy ? 300 : 200);
      decal({ x: e.x + dir * 100, y: y - 20, dir, seed, ms: 1600, color: INK, scale: heavy ? 1.3 : 0.9 });
    } else {
      const heavy = !!e.heavy;
      // (tells r9) the boss's contact frame stays IN THE WORLD: no full-screen negative panel
      // here, so the limb at full reach, the struck body and the hit point all stay on screen;
      // the challenger burns white inside an ink contour from the first frame instead.
      st.agentFlash = { age: 0, from: 0, ms: heavy ? 200 : 180 };
      st.knock = { age: 0, ms: heavy ? 720 : 480, dir, seed, x0: e.x, heavy };
      // (tells r12) a small burst AT the contact point, and the lettering up in the empty
      // corner above and behind the challenger, clear of the boss's body and weapon path
      // (tells r14) smaller still: the burst sat right on the landed nib / book at the contact
      mark({ kind: 'star', x: e.x - dir * 16, y: y - 6, ms: 150, size: heavy ? 50 : 44, seed, under: true });
      mark({ kind: 'focus', x: e.x, y, ms: 90, r0: 34, r1: 76, seed });
      mark({ kind: 'sfx', word: sfxWord('agent', e.attackId, heavy, seed), x: e.x + dir * 150, y: Math.min(y - 300, 250), size: heavy ? 54 : 46, ms: 380, seed, rot: 0.14 * dir });
      splat.burst(e.x, y, dir, 22 + Math.round(e.damage * 0.8), seed, { speed: 560, size: 4.5, color: BLOOD, spread: 1.0, up: 0.35 });
      splat.burst(e.x, y, -dir, 6, seed + 2, { speed: 260, size: 3, color: BLOOD, spread: 1.2, up: 0.7 });
      shake.kick(dir, 0.35, heavy ? 16 : 11, 320);
      decal({ x: e.x, y, dir, seed, ms: 2200, color: BLOOD, scale: heavy ? 1.25 : 1 });
    }
  });

  bus.on('poise.break', (e) => {
    const seed = (e.tick || 1) * 5 + 11;
    st.invert = { age: 0, ms: 130, focus: 'boss', x: e.x, y: GROUND_Y - 200, seed, crack: true };
    st.stagger = { age: 0, ms: BOSS_STAGGER_MS, seed, x: e.x, drip: 0 };
    st.bossFlash = { age: 0, ms: 520, white: 300 };
    splat.shatter(e.x, GROUND_Y - 200, 26, seed, { speed: 620, size: 14 });
    st.marks = st.marks.filter((m) => m.kind !== 'sfx');
    mark({ kind: 'sfx', word: sfxWord('stagger'), x: e.x, y: GROUND_Y - 430, size: 96, ms: 900, seed, rot: -0.1 });
    shake.kick(0, 1, 14, 380);
  });

  bus.on('boss.phase', (e) => {
    const seed = (e.tick || 1) * 3 + 17;
    st.invert = { age: 0, ms: 110, focus: 'boss', x: e.x, y: GROUND_Y - 220, seed };
    splat.shatter(e.x, GROUND_Y - 260, 30, seed, { speed: 700, size: 12 });
    splat.burst(e.x, GROUND_Y - 260, 1, 30, seed + 1, { speed: 650, size: 5, spread: 3.1, up: 0.2 });
  });

  bus.on('boss.death', (e) => {
    const seed = (e.tick || 1) * 13 + 5;
    const hit = st.marks.filter((m) => m.kind === 'star').pop();
    const dir = hit ? Math.sign(e.x - hit.x) || 1 : 1;
    // the blow travels from the contact point through the body
    st.bossDeath = { age: 0, dir, seed, hx: hit ? hit.x : e.x, hy: hit ? hit.y : GROUND_Y - 200, pagesDone: false, x: e.x };
    st.invert = null;
    st.stagger = null;
    st.marks = st.marks.filter((m) => m.kind !== 'sfx');
    splat.burst(e.x, GROUND_Y - 200, st.bossDeath.dir, 50, seed, { speed: 760, size: 7, color: INK, spread: 1.4, up: 0.4 });
    splat.burst(e.x, GROUND_Y - 200, st.bossDeath.dir, 30, seed + 1, { speed: 600, size: 5, color: BLOOD, spread: 1.4, up: 0.4 });
    shake.kick(st.bossDeath.dir, 0.4, 18, 420);
  });

  bus.on('agent.death', (e) => {
    const seed = (e.tick || 1) * 11 + 7;
    st.agentDeath = { age: 0, x: e.x, seed };
    st.invert = null;
    splat.burst(e.x, GROUND_Y - 50, st.knock ? st.knock.dir : 1, 46, seed, { speed: 680, color: BLOOD, size: 5.5, spread: 1.3, up: 0.45 });
    st.marks = st.marks.filter((m) => m.kind !== 'sfx');
    mark({ kind: 'sfx', word: sfxWord('agent_death'), x: e.x, y: GROUND_Y - 230, size: 92, ms: 1100, seed, rot: -0.12 });
  });

  bus.on('dodge', (e) => {
    mark({ kind: 'whiff', x: e.x, y: GROUND_Y - (e.y || 40), ms: 220, seed: (e.tick || 1) * 9, dir: 1 });
  });

  bus.on('hazard.land', (e) => splat.burst(e.x, GROUND_Y - 4, 1, 4, Math.round(e.x) + (e.tick || 0), { speed: 180, size: 2, color: INK, spread: 1.4, up: 0.8 }));
  bus.on('match.attempt', () => { splat.reset(); shake.reset(); st = fresh(); });

  function tick(dt, world) {
    shake.tick(dt);
    splat.tick(dt);
    for (const m of st.marks) m.age += dt;
    for (const d of st.decals) d.age += dt;
    st.decals = st.decals.filter((d) => d.age < d.ms);
    st.marks = st.marks.filter((m) => m.age < m.ms);
    for (const k of ['bossFlash', 'agentFlash', 'invert', 'knock', 'stagger', 'edge']) {
      const o = st[k];
      if (o) { o.age += dt; if (o.age >= o.ms) st[k] = null; }
    }
    if (st.bossDeath) {
      const d = st.bossDeath;
      d.age += dt;
      if (!d.pagesDone && d.age >= BD.cardEnd) {
        d.pagesDone = true;
        splat.pages(d.x - 420, d.x + 420, 26, d.seed);
      }
    }
    if (st.agentDeath) st.agentDeath.age += dt;
    // a staggered Scrivener leaks ink from the wound
    const sg = st.stagger;
    if (sg && sg.age > 200 && sg.age < sg.ms - 300 && Math.floor(sg.age / 170) !== sg.drip) {
      sg.drip = Math.floor(sg.age / 170);
      const k = sg.drip;
      splat.burst(sg.x + (hashNoise(sg.seed, k) - 0.5) * 90, GROUND_Y - 150 - hashNoise(sg.seed + 1, k) * 90, hashNoise(sg.seed + 2, k) < 0.5 ? -1 : 1, 2, sg.seed + k, { speed: 70, size: 3.5, color: k % 3 ? INK : BLOOD, spread: 0.4, up: -1.2 });
    }
  }

  // ------------------------------------------------------------ drawing
  // a flick of ink/blood thrown across the scene from the wound: drawn on in
  // ~70ms, then it hangs there and fades like wet ink soaking in
  function drawDecal(ctx, d) {
    const on = clamp(d.age / 70, 0, 1);
    const fade = 1 - clamp((d.age - d.ms * 0.55) / (d.ms * 0.45), 0, 1);
    if (fade <= 0) return;
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a = (hashNoise(d.seed, i) - 0.62) * 1.5; // mostly along dir, biased upward
      const len = (40 + 150 * hashNoise(d.seed + 1, i)) * d.scale * on;
      const x0 = d.x + d.dir * 8, y0 = d.y + (hashNoise(d.seed + 2, i) - 0.5) * 16;
      const x1 = x0 + Math.cos(a) * len * d.dir, y1 = y0 + Math.sin(a) * len;
      stroke(ctx, [[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 + 3], [x1, y1]], { width: (3 + 6 * hashNoise(d.seed + 3, i)) * d.scale, taper: 0.9, color: d.color, alpha: 0.9 * fade, seed: d.seed + i,
        pressure: (t) => 1.2 - t * 0.9 });
      if (on >= 1 && i % 2 === 0) blot(ctx, x1 + Math.cos(a) * 14 * d.dir, y1 + Math.sin(a) * 14, 2.5 + 3 * hashNoise(d.seed + 4, i), d.seed + i, d.color, 0.9 * fade);
    }
  }

  function drawBehind(ctx, world, t) {
    // (qa3) a boss flash silhouettes the figure this frame: have it inked into a reusable layer.
    // In its white part the silhouette (paper fill, ink outline) covers the whole figure except
    // where the challenger is cut out of it and below the silhouette's floor line, so the
    // contour is only worked out there (the challenger reaches at most ~141 px either side of
    // its x and ~158 px above its feet, see sil.js)
    const bf = st.bossFlash;
    if (bf && world.boss.state !== 'dead') {
      const a = world.agent;
      keepBossFigure(t, bf.age < bf.white ? [
        { x: a.x - 160, y: GROUND_Y - a.y - 180, w: 320, h: 196 },
        { x: -100, y: GROUND_Y - 4, w: W + 200, h: H - GROUND_Y + 104 },
      ] : null);
    }
    splat.drawStains(ctx);
    for (const d of st.decals) drawDecal(ctx, d);
    // spreading pools under the dead
    const pool = (x, r, seed, color) => {
      ctx.save();
      ctx.translate(x, GROUND_Y + 6);
      ctx.scale(1, 0.16);
      blot(ctx, 0, 0, r, seed, color, 0.9);
      ctx.restore();
    };
    if (st.bossDeath) {
      const p = easeOutCubic(clamp((st.bossDeath.age - 300) / 2400, 0, 1));
      if (p > 0) { pool(world.boss.x, 40 + 230 * p, st.bossDeath.seed, INK); pool(world.boss.x + 30, 20 + 120 * p, st.bossDeath.seed + 1, BLOOD); }
    }
    if (st.agentDeath && world.agent.dead) {
      const p = easeOutCubic(clamp((st.agentDeath.age - 200) / 1600, 0, 1));
      if (p > 0) pool(world.agent.x, 10 + 90 * p, st.agentDeath.seed, BLOOD);
    }
  }

  // layer: undefined = all, 'under' = stars only, 'over' = everything but stars
  function drawMarks(ctx, world, onDark, layer) {
    for (const m of st.marks) {
      if (layer === 'under' && m.kind !== 'star') continue;
      if (layer === 'over' && m.kind === 'star') continue;
      if (layer === 'flashUnder' && !m.under) continue;
      if (layer === 'flashOver' && m.under) continue;
      const p = clamp(m.age / m.ms, 0, 1);
      switch (m.kind) {
        case 'focus':
          if (!onDark) focusLines(ctx, m.x, m.y, m.r0 * (1 + 0.3 * p), m.r1, 46, m.seed + 1, { color: INK, alpha: 1 - p * p, width: 6 });
          break;
        case 'slash': {
          const drawOn = clamp(m.age / 50, 0, 1);
          slashArc(ctx, m.x, m.y, m.r * (1 + 0.15 * p), m.dir, m.seed, { p: drawOn, alpha: 1 - clamp((p - 0.4) / 0.6, 0, 1), width: m.heavy ? 30 : 20, tilt: m.tilt });
          break;
        }
        case 'star': {
          const k = m.age < 40 ? lerp(0.6, 1.1, m.age / 40) : lerp(1.1, 0.4, (m.age - 40) / (m.ms - 40));
          impactStar(ctx, m.x, m.y, m.size * k, m.seed + Math.floor(m.age / 50), { alpha: p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25, edgeW: 3.5 });
          break;
        }
        case 'sfx': {
          const fade = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
          drawSfx(ctx, m.word, m.x, m.y - p * 16, m.size, { ink: onDark ? PAPER : INK, halo: onDark ? INK : PAPER, rot: m.rot, pop: clamp(m.age / 60, 0, 1), alpha: fade, seed: m.seed });
          break;
        }
        case 'whiff': {
          const a = world.agent;
          motionLines(ctx, a.x, GROUND_Y - a.y - 30, a.rollDir || a.facing || 1, 90, 50, 7, m.seed, { alpha: 0.7 * (1 - p), width: 3 });
          break;
        }
        default: break;
      }
    }
  }

  function drawKnock(ctx, world, S) {
    const k = st.knock;
    if (!k || world.agent.dead) return;
    const a = world.agent;
    const p = clamp(k.age / k.ms, 0, 1);
    if (k.age < 90 || a.state !== 'hitstun') return;
    const v = Math.abs(a.kbV || 0);
    const fade = 1 - p;
    const cy = GROUND_Y - a.y - 44;
    motionLines(ctx, a.x, cy, k.dir, 90 + v * 0.6, 110, 14, k.seed + Math.floor(k.age / 60), { alpha: fade, width: 5, halo: PAPER });
    // kicked-up dust at the heels
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const q = clamp((k.age - 90 - i * 40) / 360, 0, 1);
      if (q <= 0 || q >= 1) continue;
      const x = a.x - k.dir * (16 + i * 18) - k.dir * q * 30;
      blot(ctx, x, GROUND_Y - 6 - q * 22, 8 + q * 20, k.seed + i, INK, 0.35 * (1 - q));
    }
    ctx.restore();
    // ghost after-images strung back along the slide toward the contact point
    const span = k.x0 - a.x;
    if (S && Math.abs(span) > 10) {
      const ghost = S.get('agent', INK);
      for (let i = 1; i <= 3; i++) blit(ctx, ghost, span * (i / 3), 0, 0.42 * fade * (1 - i / 4));
    }
  }

  function drawStagger(ctx, world) {
    const s = st.stagger;
    const b = world.boss;
    if (!s || b.state !== 'stagger') return;
    const p = s.age / s.ms;
    const fade = p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15;
    // tremble marks (paired short strokes) either side of the body
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.globalAlpha = fade;
    const jit = Math.floor(s.age / 70);
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const yy = GROUND_Y - b.y - 120 - (i >> 1) * 70;
      const xx = b.x + side * (120 + 14 * hashNoise(s.seed + jit, i));
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const ox = side * k * 9, oy = (k - 1) * 16;
        ctx.moveTo(xx + ox, yy + oy - 8);
        ctx.lineTo(xx + ox + side * 6, yy + oy + 8);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEdge(ctx) {
    const e = st.edge;
    if (!e) return;
    const p = e.age / e.ms;
    const a = (1 - p) * 0.55;
    if (a <= 0) return;
    // red ink seeping in from the frame edges
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = BLOOD;
    ctx.beginPath();
    const n = 18;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const d = (30 + 70 * hashNoise(e.seed || 5, side * n + i)) * (1 - p * 0.5);
        if (side === 0) { ctx.moveTo(t0 * W, 0); ctx.lineTo((t0 + t1) / 2 * W, d); ctx.lineTo(t1 * W, 0); }
        if (side === 1) { ctx.moveTo(t0 * W, H); ctx.lineTo((t0 + t1) / 2 * W, H - d); ctx.lineTo(t1 * W, H); }
        if (side === 2) { ctx.moveTo(0, t0 * H); ctx.lineTo(d, (t0 + t1) / 2 * H); ctx.lineTo(0, t1 * H); }
        if (side === 3) { ctx.moveTo(W, t0 * H); ctx.lineTo(W - d, (t0 + t1) / 2 * H); ctx.lineTo(W, t1 * H); }
      }
    }
    ctx.fill();
    ctx.restore();
  }

  function drawPost(ctx, world, t) {
    const sh = shake.offset(scaleOf(ctx));
    const S = sils(ctx, world, t, sh);
    const inWorld = (fn) => { ctx.save(); ctx.translate(sh.x, sh.y); fn(); ctx.restore(); };

    // killing blow: inverted beat, then the splash card
    const bd = st.bossDeath;
    if (bd && bd.age < BD.fadeEnd) {
      if (bd.age < BD.invert) {
        drawInverted(ctx, S, world, { age: bd.age, ms: BD.invert, focus: 'boss', x: bd.hx, y: bd.hy, seed: bd.seed }, sh, () => {
          inWorld(() => splat.drawDrops(ctx));
          bossDeathInvertExtras(ctx, world, bd, sh);
        }, () => bossDeathInvertUnder(ctx, bd, sh));
        return;
      }
      if (bd.age < BD.cardEnd) { drawBossDeathCard(ctx, S, world, bd, sh); return; }
    }

    // challenger death: inverted white beat, then the body turns red
    // (tells r9) the killing contact shows in the world first (AD.contact), then the panel
    const ad = st.agentDeath;
    if (ad && ad.age >= AD.contact && ad.age < AD.red + AD.contact) {
      const age = ad.age - AD.contact;
      const red = age >= AD.invert;
      const a = world.agent;
      drawInverted(ctx, S, world, { age, ms: AD.red, focus: 'agent', x: a.x, y: GROUND_Y - a.y - 44, seed: ad.seed, red }, sh, () => {
        inWorld(() => {
          splat.drawDrops(ctx);
          drawMarks(ctx, world, true, 'over');
        });
      }, () => inWorld(() => {
        if (!red) impactStar(ctx, a.x, GROUND_Y - a.y - 44, 190, ad.seed, { edgeW: 4 });
        drawMarks(ctx, world, true, 'under');
      }));
      return;
    }

    // one-beat negative panel (boss hits the challenger, heavy hits, poise break)
    const inv = st.invert;
    if (inv) {
      drawInverted(ctx, S, world, inv, sh, () => inWorld(() => {
        splat.drawDrops(ctx);
        splat.drawShards(ctx);
        drawMarks(ctx, world, true, 'over');
      }), () => inWorld(() => drawMarks(ctx, world, true, 'under')));
      return;
    }

    // ---- normal frame: the world is already drawn underneath
    inWorld(() => { drawKnock(ctx, world, S); drawMarks(ctx, world, false, 'flashUnder'); });

    const bf = st.bossFlash;
    if (bf && world.boss.state !== 'dead') {
      // On the show the cut is the contender's: the boss takes the colour of whoever struck it, so a
      // blow landed on the boss is never read as a blow landed on the fighter (red is the fighter's
      // own hurt). Without a contender colour (the old page, the replay) it is white, then red.
      const tint = world.agent && world.agent.accent;
      if (tint) {
        const p = bf.age / bf.ms;
        const wash = S.get('boss', tint);
        S.cut(wash, 'agent');
        blit(ctx, wash, 0, 0, 0.82 * (1 - p * p));
      } else if (bf.age < bf.white) {
        const fill = S.get('boss', PAPER);
        const edge = S.get('boss', INK);
        S.cut(fill, 'agent');
        S.cut(edge, 'agent');
        outlined(ctx, fill, edge, 3);
      } else {
        const p = (bf.age - bf.white) / (bf.ms - bf.white);
        const red = S.get('boss', BLOOD_HOT);
        S.cut(red, 'agent');
        blit(ctx, red, 0, 0, 0.75 * (1 - p));
      }
    }
    const af = st.agentFlash;
    if (af && af.age >= af.from && (!world.agent.dead || (ad && ad.age < AD.contact))) {
      outlined(ctx, S.get('agent', PAPER), S.get('agent', INK), 2.5);
    }

    inWorld(() => {
      drawStagger(ctx, world);
      splat.drawShards(ctx);
      splat.drawDrops(ctx);
      drawMarks(ctx, world, false, 'flashOver');
    });

    if (ad) drawAgentDeathAfter(ctx, world, ad, sh);
    // a short paper flash as the death card lets go of the world
    if (bd && bd.age >= BD.cardEnd && bd.age < BD.fadeEnd) {
      ctx.save();
      drawBossDeathCard(ctx, S, world, bd, sh);
      ctx.restore();
    }
  }

  // true when drawPost will paint an opaque full-frame panel over the world this frame
  // (inverted beats, the killing-blow card): the host can skip drawing the world under it
  function covers() {
    const bd = st.bossDeath;
    if (bd && bd.age < BD.cardEnd) return true;
    const ad = st.agentDeath;
    if (ad && ad.age >= AD.contact && ad.age < AD.red + AD.contact) return true;
    return !!st.invert;
  }

  return {
    tick,
    covers,
    shakeOffset: (px) => shake.offset(px),
    drawBehind,
    drawFront() {},
    drawPost,
    drawOverlay(ctx, match, frame, info, t) { drawFreeze(ctx, match, frame, info, t); },
    reset() { shake.reset(); splat.reset(); st = fresh(); },
    // (qa2) The first hit of a session paid one-off costs (the silhouette buffers and their
    // first raster) on top of the impact beat: a ~48 ms frame mid-fight. The host calls this
    // once at boot, before the first frame is shown: it draws the hit beats into ctx (the real
    // frame paints over them) and leaves the fx state as it was.
    warm(ctx, world, t) {
      const saved = st;
      const a = world.agent;
      const y = GROUND_Y - a.y - 44;
      try {
        for (const focus of ['agent', 'boss']) {
          st = fresh();
          st.invert = { age: 20, ms: 62, focus, x: a.x, y, seed: 1 };
          drawPost(ctx, world, t);
        }
        st = fresh();
        // (qa3) the boss flash reuses the figure's layer: allocate and raster it once here too
        keepBossFigure(t);
        drawBoss(ctx, world, t);
        st.bossFlash = { age: 10, ms: 220, white: 100 };
        st.agentFlash = { age: 70, from: 62, ms: 125 };
        drawPost(ctx, world, t);
        st.bossFlash.age = 150;
        drawPost(ctx, world, t);
      } finally {
        st = saved;
      }
    },
    get state() { return st; },
  };
}
