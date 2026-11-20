// Strike visuals for the Scrivener's attacks. Owner: tells. Reads sim state only.
//
// Hazards spawned with a `style` (set in attacks.js, copied by boss.js) are drawn
// here instead of by the generic hazard painter in boss_draw.js, so the strike
// itself shows its weight and its exact reach:
//   quill_smear  the pen-blade's crescent smear ending in a scrape along the floor
//   lunge_streak a black streak left behind the body as it crosses the floor
//   geyser       a column of ink bursting out of the floor (ledger slam)
//   ripple       a cresting ink wave running along the floor (ledger slam)
//   slam_book    the ledger's landing: a local white impact burst where the book hits
//                plus a crack along the floor out to the hitbox's full reach
// World coordinates: x = world px, screen y = GROUND_Y - height.

import { GROUND_Y } from '../core/constants.js';
import { clamp, lerp, easeOutCubic } from '../core/math.js';
import { hashNoise } from '../core/rng.js';
import { INK, PAPER, RED, stroke } from './ink.js';

export function drawStyledHazard(ctx, h, world, t) {
  switch (h.style) {
    case 'quill_smear': return true; // round 3: the blade's real path is painted from the pose track (boss_pose drawStrikeUnder)
    case 'lunge_streak': lungeStreak(ctx, h, world); return true;
    case 'geyser': geyser(ctx, h, t); return true;
    case 'ripple': ripple(ctx, h, t); return true;
    case 'slam_book': slamBook(ctx, h, world, t); return true;
    default: return false;
  }
}

function quillSmear(ctx, h, world) {
  const b = world.boss;
  const f = h.facing;
  const p = clamp(h.age / Math.max(1, h.ttl), 0, 1);
  const R = h.fx1;                        // the box reach
  const cx = b.x + f * 20, cy = GROUND_Y - b.y - 185;
  const floorA = Math.asin(clamp(185 / R, 0, 1)); // angle below horizontal where the arc meets the floor
  const lead = lerp(-1.75, floorA, easeOutCubic(clamp(p / 0.45, 0, 1)));
  const tail = lerp(-2.2, floorA - 0.25, easeOutCubic(clamp((p - 0.1) / 0.8, 0, 1)));
  const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  const pt = (a, r) => [cx + f * Math.cos(a) * r, cy + Math.sin(a) * r];
  // crescent: outer edge at full reach, inner edge closes toward the tail
  ctx.save();
  ctx.globalAlpha = 0.92 * fade;
  ctx.fillStyle = INK;
  ctx.beginPath();
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const a = lerp(tail, lead, i / N);
    const [x, y] = pt(a, R * (0.98 + 0.03 * hashNoise(h.id, i)));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    const a = lerp(tail, lead, u);
    const [x, y] = pt(a, R * lerp(0.97, 0.52, Math.pow(u, 0.7)));
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // paper speed streaks cut through the smear
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 4; k++) {
    const rr = R * (0.62 + k * 0.09);
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = lerp(tail + 0.15, lead - 0.05, i / 10);
      const [x, y] = pt(a, rr);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  // the scrape: where the nib bites the floor at full reach
  if (p > 0.25) {
    const q = clamp((p - 0.25) / 0.3, 0, 1);
    const x1 = b.x + f * R, x0 = b.x + f * lerp(R, R * 0.45, q);
    stroke(ctx, [[x0, GROUND_Y - 2], [lerp(x0, x1, 0.5), GROUND_Y - 4], [x1, GROUND_Y - 1]], { width: 9, taper: 0.8, seed: h.id, alpha: fade });
    for (let i = 0; i < 7; i++) {
      const u = hashNoise(h.id + 3, i);
      const sx = x1 - f * u * 40, sy = GROUND_Y - 6 - hashNoise(h.id + 4, i) * 40 * q;
      ctx.globalAlpha = fade;
      ctx.fillStyle = i === 0 ? RED : INK;
      ctx.beginPath();
      ctx.arc(sx + f * q * 26 * u, sy, 2 + 3 * hashNoise(h.id + 5, i), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function lungeStreak(ctx, h, world) {
  const b = world.boss;
  const f = h.facing;
  const p = clamp(h.age / Math.max(1, h.ttl), 0, 1);
  const len = Math.min(560, h.age * 1.5 + 60);
  const fade = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
  const head = b.x + f * 40;
  // round 7: the lance point scores the floor from where the dash began to where the tip is
  // now, so every frame of the dash shows how far it has come and where it is going
  const tipX = b.x + f * 345;
  const startX = b.strikeX + f * 300;
  if ((tipX - startX) * f > 10) {
    stroke(ctx, [[startX, GROUND_Y + 2], [lerp(startX, tipX, 0.5), GROUND_Y + 1], [tipX, GROUND_Y - 1]], {
      width: 7, taper: 1, seed: h.id + 31, alpha: fade,
    });
    for (let k = 0; k < 5; k++) {
      const u = (k + 0.5) / 5;
      const x = lerp(startX, tipX, u);
      const hh = (8 + 18 * hashNoise(h.id + 40, k)) * (0.4 + 0.6 * u);
      stroke(ctx, [[x, GROUND_Y], [x - f * hh * 0.9, GROUND_Y - hh]], { width: 3, taper: 1, seed: h.id + 50 + k, alpha: fade });
    }
  }
  for (let i = 0; i < 7; i++) {
    const y = GROUND_Y - b.y - 40 - i * 26 - hashNoise(h.id, i) * 12;
    const l = len * (0.45 + 0.55 * hashNoise(h.id + 1, i));
    const x0 = head - f * (20 + hashNoise(h.id + 2, i) * 30);
    stroke(ctx, [[x0, y], [x0 - f * l * 0.5, y + 1], [x0 - f * l, y + 2]], {
      width: i === 2 || i === 3 ? 22 : 9, taper: 1, seed: h.id + i, alpha: 0.85 * fade,
    });
  }
}

function geyser(ctx, h, t) {
  const cx = (h.x0 + h.x1) / 2;
  const w = (h.x1 - h.x0) * 1.5;
  const p = clamp(h.age / Math.max(1, h.ttl), 0, 1);
  const grow = easeOutCubic(clamp(p / 0.28, 0, 1));
  const H = (h.y1 - h.y0) * grow * (p > 0.6 ? 1 - (p - 0.6) * 0.6 : 1);
  const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  // splash base
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(cx, GROUND_Y, w * 0.9 * (0.6 + grow * 0.6), 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // round 4: a WHITE burst column with a heavy ink contour (the ref's fire pillar, in
  // ink): it reads as a bright pillar on the hatched library, flanked by ink tongues
  const top = GROUND_Y - H;
  const hw = w * 0.42 * (1 - p * 0.3);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.beginPath();
  ctx.moveTo(cx - hw * 1.25, GROUND_Y + 2);
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const j = (hashNoise(h.id + 9 + Math.floor(t / 60), i) - 0.5) * 8;
    ctx.lineTo(cx - hw * (1.25 - u * 0.95) + j, GROUND_Y - H * u);
  }
  ctx.lineTo(cx + 2, top - 18);
  for (let i = 8; i >= 0; i--) {
    const u = i / 8;
    const j = (hashNoise(h.id + 19 + Math.floor(t / 60), i) - 0.5) * 8;
    ctx.lineTo(cx + hw * (1.25 - u * 0.95) + j, GROUND_Y - H * u);
  }
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
  // ink tongues licking up both flanks
  for (let i = 0; i < 4; i++) {
    const sd = i % 2 ? 1 : -1;
    const off = sd * hw * (1.1 + 0.3 * hashNoise(h.id + 5, i));
    const hh = H * (0.45 + 0.4 * hashNoise(h.id, i));
    const lean = sd * (8 + 14 * hashNoise(h.id + 1, i));
    stroke(ctx, [[cx + off, GROUND_Y], [cx + off + lean * 0.4, GROUND_Y - hh * 0.5], [cx + off + lean, GROUND_Y - hh]], {
      width: w * 0.32, taper: 0.8, seed: h.id + i, wobble: 2, alpha: fade,
    });
  }
  // inner speed streaks (it is rising fast)
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * hw * 0.45;
    stroke(ctx, [[x, GROUND_Y - 10 - H * 0.1 * i], [x + 1, GROUND_Y - H * (0.55 + 0.12 * i)]], { width: 2.4, taper: 0.9, seed: h.id + 7 + i, alpha: 0.8 * fade });
  }
  // droplets thrown off the top
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (hashNoise(h.id + 2, i) - 0.5) * 1.6;
    const r = (20 + 50 * hashNoise(h.id + 3, i)) * grow + p * 50;
    ctx.globalAlpha = fade;
    ctx.fillStyle = i === 3 ? RED : INK;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, GROUND_Y - H + Math.sin(a) * r * 0.6 + p * p * 60, 2 + 3.5 * hashNoise(h.id + 4, i), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function ripple(ctx, h, t) {
  const dir = Math.sign(h.vx) || 1;
  const front = dir > 0 ? h.x1 : h.x0;
  const p = clamp(h.age / Math.max(1, h.ttl), 0, 1);
  const fade = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
  const rise = easeOutCubic(clamp(h.age / 70, 0, 1));
  const H = (62 + (h.y1 - h.y0) * 1.3) * (1 - p * 0.4) * rise;
  // round 5: the library floor is pale, so the wave is SOLID INK (round 4's white crest
  // vanished on it): a long black wake along the floor rising into a curling crest,
  // cut by paper speed lines, throwing ink spray. It reads as a thing that travels.
  const L = 170 + 110 * rise;
  const wake = Math.min(Math.abs(h.age * h.vx / 1000), 420);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = INK;
  // the wake it leaves: a tapering black skid on the floor back toward where it started
  ctx.beginPath();
  ctx.moveTo(front - dir * L * 0.6, GROUND_Y - 10);
  ctx.lineTo(front - dir * (L + wake), GROUND_Y - 1);
  ctx.lineTo(front - dir * (L + wake), GROUND_Y + 2);
  ctx.lineTo(front - dir * L * 0.6, GROUND_Y + 4);
  ctx.closePath();
  ctx.fill();
  // the wave body
  ctx.beginPath();
  ctx.moveTo(front - dir * L, GROUND_Y + 3);
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const y = GROUND_Y - H * Math.pow(u, 1.6) * (0.92 + 0.16 * hashNoise(h.id + Math.floor(t / 70), i));
    ctx.lineTo(front - dir * L * (1 - u), y);
  }
  ctx.quadraticCurveTo(front + dir * 30, GROUND_Y - H * 1.12, front + dir * 24, GROUND_Y - H * 0.5);
  ctx.quadraticCurveTo(front + dir * 6, GROUND_Y - H * 0.62, front + dir * 10, GROUND_Y + 3);
  ctx.closePath();
  ctx.fill();
  // paper speed lines combed through the body
  ctx.strokeStyle = PAPER;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const u = 0.25 + i * 0.17;
    const y = GROUND_Y - H * u * 0.75;
    ctx.lineWidth = i % 2 ? 1.4 : 2.2;
    ctx.beginPath();
    ctx.moveTo(front - dir * (8 + 10 * i), y);
    ctx.lineTo(front - dir * L * (0.45 + 0.3 * hashNoise(h.id + 11, i)), y + 3);
    ctx.stroke();
  }
  // the curl's white lip
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(front - dir * L * 0.3, GROUND_Y - H * 0.62);
  ctx.quadraticCurveTo(front, GROUND_Y - H * 0.98, front + dir * 18, GROUND_Y - H * 0.72);
  ctx.stroke();
  ctx.restore();
  // spray thrown forward off the crest
  for (let i = 0; i < 7; i++) {
    const sx = front + dir * (hashNoise(h.id + 6, i + Math.floor(t / 90)) * 46 - 12);
    const sy = GROUND_Y - H - 4 - hashNoise(h.id + 7, i) * 26;
    ctx.globalAlpha = fade;
    ctx.fillStyle = i === 2 ? RED : INK;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.8 + 2.6 * hashNoise(h.id + 8, i), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Where the ledger lands: a white burst with an ink contour exactly at the book, focus
// wedges converging on it, and a crack along the floor out to the box's full reach.
// Local on purpose (no full-page flash) so the player sees where it hit and how far.
function slamBook(ctx, h, world, t) {
  const b = world.boss;
  const f = h.facing;
  const age = h.age;
  const reachX = f > 0 ? h.x1 : h.x0;
  const cx = b.x + f * 300, cy = GROUND_Y - 2; // under the landed ledger (boss_pose slam_down book, ~250 local x 1.25)
  // floor crack to full reach (stays for the whole active box)
  const q = easeOutCubic(clamp(age / 90, 0, 1));
  const fade = clamp(1 - (age - Math.max(1, h.ttl) * 0.7) / (Math.max(1, h.ttl) * 0.6), 0, 1);
  const crackEnd = lerp(cx, reachX, q);
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    pts.push([lerp(b.x - f * 40, crackEnd, u), GROUND_Y - 1 - (i % 2 ? 3 : 0) * (1 - u)]);
  }
  stroke(ctx, pts, { width: 7, taper: 0.85, seed: h.id + 31, alpha: fade });
  // burst: first ~170 ms only
  if (age > 170) return;
  const k = 1 - age / 170;
  const g = easeOutCubic(clamp(age / 60, 0, 1));
  ctx.save();
  // (r14) no ink focus wedges: 18 black wedges around the landing point buried the book, the
  // arms and the challenger at the contact. Only the low dust line at the book base remains.
  // low white dust burst along the floor at the book's base, with an ink contour
  ctx.globalAlpha = Math.min(1, 1.6 * k);
  const W = 60 + 60 * g, H = 16 + 16 * g; // (r14) smaller: it sat over the landed book
  ctx.beginPath();
  ctx.moveTo(cx - W, cy + 4);
  for (let i = 1; i < 14; i++) {
    const u = i / 14;
    const x = cx - W + u * 2 * W;
    const hh = H * Math.sin(u * Math.PI) * (i % 2 ? 0.45 : 0.9 + 0.5 * hashNoise(h.id + 3, i));
    ctx.lineTo(x, cy + 4 - hh);
  }
  ctx.lineTo(cx + W, cy + 4);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}
