// The game world that has spilled out of the TV. Right of the set a craggy peak (a camp on its top plateau,
// an overhang, two sheer faces) stands behind the trail the walkers come down, with a second crag further
// right; left of the set three terraces are stacked up behind it; below the ground line the mass steps down.
// The land never moves and is painted once (see left/land.ts). Drawn live on top: the campfire and its smoke,
// the spring's three ribbons falling into the pool, foam and mist, the water wheel, glints running down the
// stream, five coins in an arc over the bridge, two flags, a hopping slime and grass tufts.
import { BLUE, GOLD, GREEN_LINE, INK, ORANGE, WARM, wind } from '../engine/layout';
import type { Part, Pt } from '../engine/types';
import { GREEN_SHADE, TAU, W_DET, cache, capsule, clamp01, disc, fillPts, line, mod, rnd, seg, shape, taper, tone, tuft, type Ctx } from './left/kit';
import { BRIDGE, CAMP, FLAGS, FRONT_BOX, LAND_BOX, POOL_Y, SLIME_LEDGE, SPRING, STREAM, WHEEL, paintFront, paintLand } from './left/land';

function flag(ctx: Ctx, x: number, y: number, t: number, col: string, s = 1) {
  seg(ctx, x, y + 1, x, y - 44 * s, 2.2, INK);
  disc(ctx, x, y - 45.5 * s, 2.2, GOLD);
  const pts: Pt[] = [], back: Pt[] = [];
  const w = wind(t, x), len = 26 * s;
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const wave = Math.sin(t * 6.1 - u * 5.2 + x) * (1.2 + 2.6 * u) * (0.6 + 0.6 * Math.abs(w)) + (1 - Math.abs(w)) * u * u * 6;
    pts.push([x + u * len, y - 42 * s + wave + u * 2]);
    back.push([x + u * len, y - 42 * s + wave + 13 * s * (1 - u * 0.25) + u * 2]);
  }
  const notch: Pt = [x + len * 0.8, (pts[6]![1] + back[6]![1]) / 2];
  shape(ctx, [...pts, notch, ...back.reverse()], tone(col, 0.5), col, 1.5);
}

const LIVE_TUFTS: { x: number; y: number; h: number; sd: number }[] = [
  [712, 327], [748, 328], [812, 464], [866, 468], [928, 553], [1048, 650], [20, 295], [128, 235], [64, 423], [150, 572], [674, 467], [734, 413],
].map(([x, y], i) => ({ x: x!, y: y!, h: 9 + rnd(i * 3.1) * 7, sd: 50 + i * 11 }));

const COINS: Pt[] = [0, 1, 2, 3, 4].map((i) => {
  const u = i / 4;
  return [BRIDGE.a[0] + 4 + u * (BRIDGE.b[0] - BRIDGE.a[0] - 8), 652 - 30 * Math.sin(Math.PI * (0.12 + 0.76 * u))] as Pt;
});

export const hills: Part = {
  id: 'hills',
  z: 10,
  intro: [0.2, 1.4],
  draw(pen, fr) {
    const { t } = fr;
    const ctx = pen.ctx;
    cache(ctx, 'left-land', LAND_BOX, paintLand);

    // the camp on the peak: the fire's glow, a flame of three tongues, smoke curling away downwind
    {
      const [fx, fy] = CAMP.fire;
      const fl = 0.7 + 0.2 * Math.sin(t * 9.3) * Math.sin(t * 3.9) + 0.1 * Math.sin(t * 21);
      const gr = ctx.createRadialGradient(fx, fy - 6, 1, fx, fy - 6, 46);
      gr.addColorStop(0, `rgba(231,200,115,${0.3 * fl})`);
      gr.addColorStop(1, 'rgba(231,200,115,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(fx - 46, fy - 52, 92, 92);
      for (let i = 0; i < 3; i++) {
        const h = (13 - i * 3.4) * (0.8 + 0.3 * Math.sin(t * (8.1 + i * 2.3) + i)), sw = Math.sin(t * (6.3 + i) + i * 2) * 2.2 + wind(t, fx) * 3;
        const bx = fx + (i - 1) * 3.4;
        const pts: Pt[] = [[bx - 3.4 + i * 0.5, fy - 3], [bx - 2.2, fy - 3 - h * 0.5], [bx + sw, fy - 3 - h], [bx + 2.4, fy - 3 - h * 0.45], [bx + 3.4 - i * 0.5, fy - 3]];
        shape(ctx, pts, tone(i === 0 ? ORANGE : GOLD, 0.55 + i * 0.2), i === 0 ? ORANGE : GOLD, 1.1);
      }
      for (let i = 0; i < 2; i++) {
        const u = mod(t * 0.9 + i * 0.5 + 0.2, 1);
        disc(ctx, fx + Math.sin(i * 5 + Math.floor(t * 0.9 + i * 0.5 + 0.2) * 2.4) * 6 + wind(t, fx) * u * 8, fy - 10 - u * 24, 0.9, GOLD, null, 0, 1 - u);
      }
      for (let i = 0; i < 4; i++) {
        const u = mod(t * 0.14 + i / 4, 1), w = wind(t - u * 0.8, fx);
        const sx = fx + 2 + u * u * 34 + w * u * 16, sy = fy - 16 - u * 74;
        const r = 3 + u * 9;
        const pts: Pt[] = [];
        for (let k = 0; k <= 9; k++) {
          const a = -0.6 + (k / 9) * 4.4 + i * 1.3 + u * 2;
          pts.push([sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.75]);
        }
        taper(ctx, pts, 1.7, INK, 0.5 * Math.sin(Math.PI * u) ** 0.8, 0.3, 0.5);
      }
    }

    // a camper on a log by the fire, toasting something on a stick; nods off now and then and starts awake
    {
      const cx = 745, gy = 327.5;
      const k = mod(t, 9.7), doze = k < 2.2 ? Math.sin((k / 2.2) * Math.PI) ** 2 : 0, wake = k > 2.2 && k < 2.5 ? Math.sin(((k - 2.2) / 0.3) * Math.PI) : 0;
      const bob = Math.sin(t * 1.7) * 1.1 + doze * 3.4, lean = 0.2 + doze * 0.16 - wake * 0.2;
      capsule(ctx, cx - 9, gy - 3, cx + 3, gy - 3, 3.3, 3.3, tone(WARM, 0.3), WARM, 1.1);
      disc(ctx, cx + 3.4, gy - 3, 1.7, null, WARM, 0.8, 0.9, 2.6);
      const hipp: Pt = [cx - 2.5, gy - 7], sh: Pt = [hipp[0] + Math.sin(lean) * 10.5, hipp[1] - Math.cos(lean) * 10.5];
      capsule(ctx, hipp[0], hipp[1], cx + 5.6, gy - 8, 2.5, 2.2, tone(BLUE, 0.14), BLUE, 1.1);
      capsule(ctx, cx + 5.6, gy - 8, cx + 7, gy - 2, 2.2, 1.8, tone(BLUE, 0.14), BLUE, 1.1);
      shape(ctx, [[cx + 5, gy - 2.6], [cx + 9, gy - 2.6], [cx + 12, gy - 0.6], [cx + 12, gy + 0.8], [cx + 5, gy + 0.8]], tone(BLUE, 0.3), BLUE, 1);
      capsule(ctx, hipp[0], hipp[1], sh[0], sh[1], 4.1, 3.7, tone(BLUE, 0.22), BLUE, 1.2);
      line(ctx, [[hipp[0] + 3.6, hipp[1] - 1], [sh[0] + 3.4, sh[1] + 1.4]], 1, BLUE, 0.6);
      // the stick, the arm that holds it, the thing being toasted
      const hand: Pt = [sh[0] + 8.6, sh[1] + 5.4 + bob * 0.35], tip: Pt = [CAMP.fire[0] - 1.5, gy - 12.5 + bob];
      line(ctx, [[hand[0] - 2.4, hand[1] + 1], tip], 1.3, WARM);
      disc(ctx, tip[0], tip[1], 2, tone(INK, 0.85), INK, 0.9, 1, 1.6);
      capsule(ctx, sh[0] + 0.6, sh[1] + 1.6, hand[0], hand[1], 2, 1.6, tone(BLUE, 0.22), BLUE, 1.1);
      disc(ctx, hand[0] + 0.8, hand[1] + 0.3, 1.8, tone(WARM, 0.55), tone(WARM, 0.95), 0.9);
      // head: warm face lit by the fire, a bobble hat
      const ha = lean + doze * 0.5 - wake * 0.3, hx = sh[0] + Math.sin(ha) * 6.2 + 0.6, hy = sh[1] - Math.cos(ha) * 6.2;
      disc(ctx, hx, hy, 5.4, tone(WARM, 0.55), BLUE, 1.2);
      fillPts(ctx, [[hx + 2.6, hy - 3.4], [hx + 5.2, hy - 0.6], [hx + 4.4, hy + 2.6], [hx + 2.4, hy + 0.4]], tone(GOLD, 0.75), 0.55);
      ctx.beginPath();
      ctx.arc(hx, hy - 0.6, 5.9, Math.PI * 0.96 + ha, TAU * 0.99 + ha);
      ctx.closePath();
      ctx.fillStyle = tone(ORANGE, 0.5);
      ctx.fill();
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      disc(ctx, hx - Math.sin(-ha) * 0 + Math.sin(ha) * 6.6, hy - 0.6 - Math.cos(ha) * 6.6, 1.8, INK);
      if (doze > 0.3) seg(ctx, hx + 2, hy + 0.6, hx + 4, hy + 0.8, 0.9, '#0c100b');
      else disc(ctx, hx + 3, hy + 0.4, 0.85, '#0c100b');
      shape(ctx, [[hx + 4.8, hy + 0.4], [hx + 6.8, hy + 1.8], [hx + 4.8, hy + 2.8]], tone(WARM, 0.55), tone(WARM, 0.95), 0.8);
      if (doze > 0.3) for (let i = 0; i < 2; i++) {
        // little z's
        const u = mod(t * 0.5 + i * 0.5, 1), zx = hx + 4 + u * 9, zy = hy - 9 - u * 13, zs = 1.6 + u * 1.6;
        line(ctx, [[zx - zs, zy - zs], [zx + zs, zy - zs], [zx - zs, zy + zs], [zx + zs, zy + zs]], 0.9, INK, 0.7 * Math.sin(Math.PI * u));
      }
    }

    FLAGS.forEach((f) => flag(ctx, f.x, f.y, t, f.col, f.s));

    // the front layer of land: the trail and the face below it (tv.ts paints the part that lies over the set again)
    cache(ctx, 'left-front', FRONT_BOX, paintFront);

    // the spring: three ribbons that taper as they fall, with brighter streaks running down them
    {
      const [x, y0] = SPRING, y1 = POOL_Y + 1;
      const ribbons: [number, number, number, number][] = [[-5.5, 2.6, 0.9, 0.2], [0.5, 4.4, 1.6, 0], [6, 2.2, 1.2, 0.55]];
      ribbons.forEach(([dx, w, drift, ph], i) => {
        const sway = Math.sin(t * 2.3 + i * 2) * 0.7;
        const pts: Pt[] = [];
        for (let k = 0; k <= 8; k++) {
          const u = k / 8;
          pts.push([x + dx * (0.55 + 0.45 * u) + sway * u + drift * u * u * 2, y0 + 3 + (y1 - y0 - 3) * u]);
        }
        taper(ctx, pts, w * 1.9, tone(BLUE, 0.5), 0.95, 0.5, 0.02);
        taper(ctx, pts, w * 0.7, tone(BLUE, 0.95), 0.9, 0.3, 0.1);
        for (let j = 0; j < 3; j++) {
          const u = mod(t * (0.95 + i * 0.13) + j / 3 + ph, 1), a = Math.floor(u * 7), b = Math.min(8, a + 2);
          line(ctx, [pts[a]!, pts[b]!], 1.2, INK, 0.75 * Math.sin(Math.PI * u));
        }
      });
      // foam where it lands, rings spreading over the pool, mist drifting up
      for (let i = 0; i < 6; i++) {
        const u = mod(t * 1.5 + i / 6, 1), a = -Math.PI * (0.12 + 0.76 * rnd(i * 3.3 + Math.floor(t * 1.5 + i / 6)));
        disc(ctx, x + 1 + Math.cos(a) * u * 15, y1 - 1 + Math.sin(a) * u * 9 + u * u * 8, 1.4, INK, null, 0, 0.85 * (1 - u));
      }
      for (let i = 0; i < 3; i++) {
        const u = mod(t * 0.55 + i / 3, 1);
        disc(ctx, x + 1, y1 + 2, 6 + u * 30, null, tone(BLUE, 0.9), 1.1, 0.55 * (1 - u), 1.2 + u * 3.2);
      }
      for (let i = 0; i < 3; i++) {
        const u = mod(t * 0.3 + i / 3, 1), mx = x - 10 + i * 10 + Math.sin(t + i * 2) * 3, my = y1 - 4 - u * 22;
        const pts: Pt[] = [];
        for (let k = 0; k <= 6; k++) pts.push([mx + Math.cos(Math.PI + (k / 6) * Math.PI) * (4 + u * 5), my + Math.sin(Math.PI + (k / 6) * Math.PI) * (3 + u * 3)]);
        taper(ctx, pts, 1.4, INK, 0.4 * Math.sin(Math.PI * u), 0.4, 0.4);
      }
    }

    // the water wheel: rim, eight spokes with paddles, turning under the trough; drips off the low side
    {
      const { x, y, r } = WHEEL, a0 = t * 0.85;
      disc(ctx, x, y, r, null, tone(WARM, 0.5), 3.4);
      disc(ctx, x, y, r, null, WARM, 1.3);
      disc(ctx, x, y, r - 5, null, WARM, 1.1, 0.8);
      for (let i = 0; i < 8; i++) {
        const a = a0 + (i / 8) * TAU, cs = Math.cos(a), sn = Math.sin(a);
        seg(ctx, x + cs * 3, y + sn * 3, x + cs * (r - 1), y + sn * (r - 1), 1.5, WARM, 0.95);
        const px = x + cs * (r + 1.5), py = y + sn * (r + 1.5);
        shape(ctx, [[px - sn * 4.5 - cs * 2, py + cs * 4.5 - sn * 2], [px + sn * 4.5 - cs * 2, py - cs * 4.5 - sn * 2], [px + sn * 4.5 + cs * 2.4, py - cs * 4.5 + sn * 2.4], [px - sn * 4.5 + cs * 2.4, py + cs * 4.5 + sn * 2.4]], tone(WARM, 0.3), WARM, 1);
      }
      disc(ctx, x, y, 4, tone(GOLD, 0.5), GOLD, 1.3);
      seg(ctx, x - 6, y + r + 6, x, y, 2.4, WARM);
      seg(ctx, x + 6, y + r + 6, x, y, 2.4, WARM);
      // water off the trough onto the wheel, and drips
      taper(ctx, [[x - 7, y - r - 5], [x - 6, y - r + 2], [x - 4.6, y - r + 9]], 3, tone(BLUE, 0.8), 0.9, 0.1, 0.7);
      for (let i = 0; i < 4; i++) {
        const u = mod(t * 1.1 + i / 4, 1);
        disc(ctx, x - r + 3 + i * 3, y + 4 + u * (r + 8), 1.1, tone(BLUE, 0.95), null, 0, 0.9 * (1 - u));
      }
    }

    // glints running down the stream
    {
      const n = STREAM.length;
      for (let i = 0; i < 9; i++) {
        const u = mod(t * (0.16 + rnd(i * 2.9) * 0.08) + i / 9, 1), k = u * (n - 3);
        const a = STREAM[Math.floor(k)]!, b = STREAM[Math.floor(k) + 2]!, off = (rnd(i * 7.1) - 0.5) * (2 + u * 5);
        taper(ctx, [[a[0] + off, a[1]], [(a[0] + b[0]) / 2 + off, (a[1] + b[1]) / 2 + 0.6], [b[0] + off, b[1]]], 1.4, INK, 0.75 * Math.sin(Math.PI * u), 0.4, 0.4);
      }
      // a little white water where the stream drops off the ledge under the bridge
      for (let i = 0; i < 3; i++) {
        const u = mod(t * 1.2 + i / 3, 1);
        disc(ctx, 662 - u * 9 + i * 2, 692 + u * 7, 1.2, INK, null, 0, 0.7 * (1 - u));
      }
    }

    // five coins in one arc over the bridge
    COINS.forEach((cn, i) => {
      const y = cn[1] + Math.sin(t * 2.05 + i * 0.7) * 2.6, sp = Math.cos(t * 3.1 + i * 0.6);
      disc(ctx, cn[0], y, 6.4 * (0.2 + 0.8 * Math.abs(sp)), tone(GOLD, 0.42), GOLD, W_DET, 1, 6.4);
      if (Math.abs(sp) > 0.4) seg(ctx, cn[0], y - 2.8, cn[0], y + 2.8, 1.1, GOLD, 0.9);
      const tw = mod(t * 0.7 + i * 0.37, 1);
      if (tw < 0.25) {
        const r = 4 * Math.sin((tw / 0.25) * Math.PI);
        seg(ctx, cn[0] + 6 - r, y - 6, cn[0] + 6 + r, y - 6, 1, INK, 0.9);
        seg(ctx, cn[0] + 6, y - 6 - r, cn[0] + 6, y - 6 + r, 1, INK, 0.9);
      }
    });

    // a slime hopping back and forth along a ledge left of the set
    {
      const k = mod(t, 1.07) / 1.07, trip = mod(t / 1.07, 12);
      const hopIdx = Math.floor(trip), dir = hopIdx < 6 ? 1 : -1;
      const steps = hopIdx < 6 ? hopIdx : 12 - hopIdx;
      const mv = clamp01((k - 0.25) / 0.6);
      const x = SLIME_LEDGE.x0 + (steps + dir * mv) * ((SLIME_LEDGE.x1 - SLIME_LEDGE.x0) / 6);
      const gy = SLIME_LEDGE.y + ((x - SLIME_LEDGE.x0) / (SLIME_LEDGE.x1 - SLIME_LEDGE.x0)) * 3;
      const hop = 12 * Math.sin(Math.PI * mv);
      const sq = k < 0.25 ? Math.sin((k / 0.25) * Math.PI) * 0.3 : k > 0.85 ? Math.sin(((k - 0.85) / 0.15) * Math.PI) * 0.25 : -0.12 * Math.sin(Math.PI * mv);
      const w = 11 * (1 + sq), h = 12 * (1 - sq), by = gy - hop;
      disc(ctx, x, gy + 1, 10 * (1 - hop / 30), GREEN_SHADE, null, 0, 0.9, 2.2);
      ctx.beginPath();
      ctx.moveTo(x - w, by);
      ctx.bezierCurveTo(x - w, by - h * 1.3, x + w, by - h * 1.3, x + w, by);
      ctx.closePath();
      ctx.fillStyle = tone(BLUE, 0.36);
      ctx.fill();
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 1.7;
      ctx.lineJoin = 'round';
      ctx.stroke();
      fillPts(ctx, [[x - w * 0.6, by - h * 0.7], [x - w * 0.2, by - h * 0.86], [x - w * 0.3, by - h * 0.62]], tone(BLUE, 0.8), 0.8);
      disc(ctx, x - 3 + dir * 1.5, by - h * 0.48, 1.3, INK);
      disc(ctx, x + 3 + dir * 1.5, by - h * 0.48, 1.3, INK);
      line(ctx, [[x - 1.6 + dir * 1.5, by - h * 0.28], [x + dir * 1.5, by - h * 0.2], [x + 1.6 + dir * 1.5, by - h * 0.28]], 1, INK, 0.8);
    }

    for (const tf of LIVE_TUFTS) tuft(ctx, tf.x, tf.y, tf.h, 3, GREEN_LINE, tf.sd, wind(t, tf.x) * 1.1 + Math.sin(t * 2.7 + tf.sd) * 0.12, 0.9);
  },
};
