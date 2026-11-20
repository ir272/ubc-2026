// Ink / blood particles, floor stains, torn-paper shards and falling ledger pages.
// Owner: feedback. Deterministic: seeded from the event tick, advanced by sim ticks.
import { GROUND_Y } from '../core/constants.js';
import { makeRng, rand, range, hash2, hashNoise } from '../core/rng.js';
import { INK, RED, PAPER, blot } from '../render/ink.js';

const MAX_DROPS = 420, MAX_STAINS = 240, MAX_SHARDS = 90;

export function createSplatter() {
  let drops = [];
  let stains = [];
  let shards = [];

  function addStain(x, r, seed, color, flat = 0.35) {
    if (stains.length >= MAX_STAINS) stains.shift();
    stains.push({ x, y: GROUND_Y + 3 + (seed % 16), r, seed, color, flat });
  }

  return {
    // A spray of drops. dir = +1/-1 sets the main throw direction.
    //  spread: radians of the cone around the throw axis; up: bias upward (0..1)
    burst(x, y, dir, count, seed, { speed = 420, color = INK, size = 4, spread = 1.1, up = 0.35, gravity = 1500 } = {}) {
      const r = makeRng(hash2(seed, 99));
      const sx = Math.sign(dir || 1);
      for (let i = 0; i < count && drops.length < MAX_DROPS; i++) {
        const back = rand(r) < 0.12; // a few drops kick back toward the attacker
        const a = (rand(r) - 0.5) * spread * 2 - up * 0.9; // 0 = along dir, negative = upward
        const v = speed * range(r, 0.25, 1.25) * (back ? 0.45 : 1);
        drops.push({
          x, y, vx: Math.cos(a) * v * sx * (back ? -1 : 1), vy: Math.sin(a) * v - range(r, 40, 180),
          r: size * range(r, 0.35, 1.5), life: 0, color, seed: hash2(seed, i), g: gravity,
        });
      }
    },
    // Torn paper / shattered ink shards (poise break, deaths).
    shatter(x, y, count, seed, { speed = 520, color = PAPER, edge = INK, size = 12 } = {}) {
      const r = makeRng(hash2(seed, 77));
      for (let i = 0; i < count && shards.length < MAX_SHARDS; i++) {
        const a = rand(r) * Math.PI * 2;
        const v = speed * range(r, 0.35, 1.1);
        shards.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8 - 220, rot: rand(r) * 6, vr: range(r, -14, 14),
          s: size * range(r, 0.5, 1.4), life: 0, ttl: range(r, 700, 1400), color, edge, seed: hash2(seed, i), flutter: 0 });
      }
    },
    // Ledger pages drifting down (boss death).
    pages(x0, x1, count, seed) {
      const r = makeRng(hash2(seed, 55));
      for (let i = 0; i < count && shards.length < MAX_SHARDS; i++) {
        shards.push({ x: range(r, x0, x1), y: range(r, -120, 140), vx: range(r, -40, 40), vy: range(r, 40, 90), rot: rand(r) * 6, vr: range(r, -2, 2),
          s: range(r, 14, 24), life: 0, ttl: range(r, 2600, 4200), color: PAPER, edge: INK, seed: hash2(seed, i), flutter: 1, ruled: true });
      }
    },
    pool(x, r, seed, color = INK) { addStain(x, r, seed, color, 0.22); },
    tick(dt) {
      const s = dt / 1000;
      for (const d of drops) {
        d.life += dt;
        d.vy += d.g * s;
        d.vx *= Math.pow(0.6, s);
        d.x += d.vx * s;
        d.y += d.vy * s;
        if (d.y >= GROUND_Y + 4) {
          d.dead = true;
          addStain(d.x + d.vx * 0.02, d.r * 1.7, d.seed, d.color);
        }
      }
      drops = drops.filter((d) => !d.dead && d.life < 2500);
      for (const p of shards) {
        p.life += dt;
        if (p.flutter) {
          p.vx += Math.sin((p.life + p.seed % 997) / 260) * 90 * s;
          p.vy = Math.min(p.vy + 60 * s, 110);
        } else {
          p.vy += 1100 * s;
          p.vx *= Math.pow(0.4, s);
        }
        p.x += p.vx * s;
        p.y += p.vy * s;
        p.rot += p.vr * s;
        if (p.y > GROUND_Y + 6) { p.y = GROUND_Y + 6; p.vx *= 0.5; p.vr = 0; p.vy = 0; }
      }
      shards = shards.filter((p) => p.life < p.ttl);
    },
    drawStains(ctx) {
      for (const st of stains) {
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.scale(1, st.flat / 0.8);
        blot(ctx, 0, 0, st.r, st.seed, st.color, 0.85);
        ctx.restore();
      }
    },
    drawDrops(ctx) {
      ctx.save();
      for (const d of drops) {
        const sp = Math.hypot(d.vx, d.vy);
        const stretch = 1 + Math.min(3.2, sp / 260);
        ctx.fillStyle = d.color;
        ctx.beginPath();
        // tear-drop streak: elongated along velocity, trailing behind the head
        const ang = Math.atan2(d.vy, d.vx);
        const len = d.r * stretch;
        ctx.ellipse(d.x - Math.cos(ang) * len * 0.5, d.y - Math.sin(ang) * len * 0.5, len, d.r * 0.8, ang, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    drawShards(ctx) {
      for (const p of shards) {
        const fade = p.flutter ? Math.min(1, (p.ttl - p.life) / 500) : Math.min(1, (p.ttl - p.life) / 300);
        if (fade <= 0) continue;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.flutter) ctx.scale(Math.cos(p.life / 180 + (p.seed % 13)), 1);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        if (p.ruled) {
          ctx.rect(-p.s * 0.5, -p.s * 0.7, p.s, p.s * 1.4);
        } else {
          const n = 3 + (p.seed % 3);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const rr = p.s * (0.45 + 0.7 * hashNoise(p.seed, i));
            if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
        if (p.ruled) {
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          for (let k = -2; k <= 2; k++) { ctx.moveTo(-p.s * 0.35, k * p.s * 0.22); ctx.lineTo(p.s * 0.35, k * p.s * 0.22); }
          ctx.stroke();
        }
        ctx.restore();
      }
    },
    reset() { drops = []; stains = []; shards = []; },
    get count() { return drops.length + shards.length; },
  };
}

export { RED };
