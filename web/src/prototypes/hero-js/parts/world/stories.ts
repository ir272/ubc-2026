// Tiny stories on the ground, the kind you only find when you look: a snail crossing a stone, a ladybird
// climbing a grass blade, a coin dropped from the game at the foot of the hill (it glints), and somebody in
// the burrow who looks out now and then. All pure functions of t; a few dozen marks, drawn live.
import { GOLD, GREEN_LINE, INK, ORANGE, PAPER, WARM, rnd, tone, wind } from '../../engine/layout';
import type { Part, Pt } from '../../engine/types';
import { BURROW, SNAIL_STONE, topY } from '../ridge';
import { TAU, arc, clamp01, mod, smooth } from './util';

const LADY_X = 1398;
const COIN: Pt = [1012, topY(1012) + 1];

export const stories: Part = {
  id: 'stories',
  z: 15,
  intro: [0, 0.01],
  draw(pen, f) {
    const t = f.t;
    const c = pen.ctx;

    // ---- the snail: creeps a little way along the top of its stone and back, feelers out, body stretching
    {
      const [sx, sr] = SNAIL_STONE;
      const creep = 4.5 * Math.sin(t * 0.09);
      const dir = Math.cos(t * 0.09) >= 0 ? -1 : 1; // it faces the way it is going (it turns while pulled in)
      const turn = Math.abs(Math.cos(t * 0.09)); // 0 at each end of the trip
      const out = smooth(turn * 5); // pulled into the shell while it turns round
      const x = sx + creep, y = topY(sx) - sr * 0.98;
      const str = 1 + 0.07 * Math.sin(t * 1.3);
      c.save();
      c.translate(x, y);
      c.scale(dir < 0 ? 1 : -1, 1); // drawn facing left
      // the foot: a low slug shape, head lifted
      const head = -9 * str * out - 2;
      const foot = pen.curve([[head, -3.6 * out - 0.5], [head + 3, -1.2], [-1, -0.8], [7, -0.6], [10.5 * str, 0.4], [6, 1.2], [-3, 1.2], [head + 1, 0.8]], 5, true);
      pen.fill(foot, tone(INK, 0.3));
      pen.stroke(foot, { color: INK, width: 1.2, seed: 1, wobble: 0 });
      // the feelers, each with a bead on its tip, waving on their own
      if (out > 0.2) {
        for (const [k, len] of [[0, 5.6], [1, 4]] as const) {
          const a = -1.95 + k * 0.5 + 0.22 * Math.sin(t * 1.7 + k * 2.1);
          const bx = head + 0.8 + k * 1.2, by = -3.4 * out;
          const ex = bx + Math.cos(a) * len * out, ey = by + Math.sin(a) * len * out;
          pen.stroke([[bx, by], [ex, ey]], { color: INK, width: 1, seed: 2 + k, wobble: 0 });
          c.fillStyle = INK;
          c.beginPath();
          c.arc(ex, ey, 1, 0, TAU);
          c.fill();
        }
      }
      // the shell: a warm spiral with a lit top and a shade foot
      const shell = arc(2.6, -5.6, 6, 5.6, 0, TAU, 18);
      pen.fill(shell, tone(WARM, 0.3));
      pen.fill(arc(2.6, -4.4, 5.4, 4.2, 0.1, Math.PI - 0.1, 10), tone(WARM, 0.16));
      const sp: Pt[] = [];
      for (let k = 0; k <= 22; k++) {
        const a = 0.6 + k * 0.5, r = 0.5 + k * 0.24;
        sp.push([2.6 + Math.cos(a) * r, -5.6 + Math.sin(a) * r * 0.93]);
      }
      pen.stroke(sp, { color: WARM, width: 1.1, seed: 5, wobble: 0, alpha: 0.9 });
      pen.stroke(shell, { color: WARM, width: 1.5, seed: 6, wobble: 0 });
      c.restore();
      // the silver trail it leaves on the stone
      pen.stroke([[sx - 6, y + 0.6], [sx + 6, y + 0.9]], { color: INK, width: 1, alpha: 0.28, seed: 7, taper: 0.4, wobble: 0 });
    }

    // ---- the ladybird: a tall blade of its own that bends with the wind, and the beetle climbing it
    {
      const x0 = LADY_X, y0 = topY(x0) + 2, h = 50;
      const bend = 9 + wind(t, x0) * h * 0.2 + Math.sin(t * 2.3) * 1.2;
      const tx = x0 + bend, ty = y0 - h + Math.abs(bend) * 0.12;
      const cx = x0 + bend * 0.18, cy = y0 - h * 0.66;
      c.fillStyle = GREEN_LINE;
      c.beginPath();
      c.moveTo(x0 - 1.7, y0);
      c.quadraticCurveTo(cx - 1.3, cy, tx, ty);
      c.quadraticCurveTo(cx + 1.3, cy, x0 + 1.7, y0);
      c.fill();
      // climbs up, rests, climbs down: the pauses matter more than the walking
      const cyc = mod(t, 23) / 23;
      const u = 0.3 + 0.48 * (cyc < 0.35 ? smooth(cyc / 0.35) : cyc < 0.55 ? 1 : cyc < 0.9 ? 1 - smooth((cyc - 0.55) / 0.35) : 0);
      const v = 1 - u;
      const px = v * v * x0 + 2 * v * u * cx + u * u * tx, py = v * v * y0 + 2 * v * u * cy + u * u * ty;
      const ang = Math.atan2(2 * v * (cy - y0) + 2 * u * (ty - cy), 2 * v * (cx - x0) + 2 * u * (tx - cx));
      const down = cyc >= 0.55 && cyc < 0.9;
      c.save();
      c.translate(px, py);
      c.rotate(ang + (down ? Math.PI : 0));
      c.translate(0, down ? 2.6 : -2.6); // it walks on the side of the blade that faces the viewer's left
      // legs ticking, then the dome, the head, the split and the spots
      const moving = (cyc < 0.35 || down) && cyc < 0.9;
      c.strokeStyle = INK;
      c.lineWidth = 0.8;
      c.beginPath();
      for (let k = -1; k <= 1; k++) {
        const sw = moving ? Math.sin(t * 14 + k * 2) * 0.9 : 0;
        c.moveTo(k * 1.8, 1.4);
        c.lineTo(k * 2.2 + sw, 3.4);
      }
      c.stroke();
      c.fillStyle = ORANGE;
      c.beginPath();
      c.ellipse(0, 0, 3.6, 2.8, 0, 0, TAU);
      c.fill();
      c.fillStyle = tone(ORANGE, 0.55);
      c.beginPath();
      c.ellipse(-0.6, 0.9, 3, 1.7, 0, 0, Math.PI);
      c.fill();
      c.fillStyle = PAPER;
      c.beginPath();
      c.ellipse(3.3, 0.2, 1.5, 1.8, 0, 0, TAU); // head, at the front
      for (const [dx, dy] of [[-1.4, -0.9], [0.9, -1.3], [-0.2, 0.7], [1.7, 0.5]] as const) {
        c.moveTo(dx + 0.7, dy);
        c.arc(dx, dy, 0.7, 0, TAU);
      }
      c.fill();
      c.restore();
    }

    // ---- the dropped coin at the foot of the hill: it lies tilted against a pebble and catches the light
    {
      const [x, y] = COIN;
      c.save();
      c.translate(x, y - 3.4);
      c.rotate(-0.3);
      const rim = arc(0, 1.9, 7.4, 4, 0, TAU, 20);
      pen.fill(rim, tone(GOLD, 0.24));
      pen.stroke(rim, { color: GOLD, width: 1.2, seed: 11, wobble: 0, alpha: 0.8 });
      const face = arc(0, 0, 7.4, 4, 0, TAU, 20);
      pen.fill(face, tone(GOLD, 0.44));
      pen.stroke(face, { color: GOLD, width: 1.6, seed: 12, wobble: 0 });
      pen.stroke(arc(0, 0, 4.6, 2.3, 0, TAU, 14), { color: GOLD, width: 1, seed: 13, wobble: 0, alpha: 0.7 });
      c.restore();
      const g = mod(t + 1.7, 6.3);
      if (g < 0.8) {
        const k = Math.sin((g / 0.8) * Math.PI) ** 2, L = 4 + 11 * k;
        c.fillStyle = INK;
        c.globalAlpha = k;
        c.beginPath();
        const gx = x - 4, gy = y - 6;
        c.moveTo(gx - L, gy);
        c.lineTo(gx, gy - 1);
        c.lineTo(gx + L, gy);
        c.lineTo(gx, gy + 1);
        c.closePath();
        c.moveTo(gx, gy - L * 1.2);
        c.lineTo(gx + 1, gy);
        c.lineTo(gx, gy + L * 1.2);
        c.lineTo(gx - 1, gy);
        c.closePath();
        c.fill();
        c.globalAlpha = 1;
      }
    }

    // ---- the burrow: two eyes come to the mouth of the hole, look both ways, blink, and go back in
    {
      const [bx, by] = BURROW;
      const k = Math.floor(t / 19), cyc = t - k * 19 - rnd(k * 2.7 + 5) * 6;
      const show = clamp01(Math.min(cyc / 0.5, (7.5 - cyc) / 0.4));
      if (show > 0.01) {
        const look = cyc < 2 ? -1 : cyc < 2.25 ? -1 + 2 * smooth((cyc - 2) / 0.25) : cyc < 4.6 ? 1 : cyc < 4.85 ? 1 - smooth((cyc - 4.6) / 0.25) : 0;
        const blink = mod(cyc, 2.9) > 2.78;
        const ex = bx + look * 2.6, ey = by + 2.5 + (1 - show) * 5;
        c.globalAlpha = show;
        c.fillStyle = INK;
        c.beginPath();
        for (const sgn of [-1, 1]) {
          if (blink) c.rect(ex + sgn * 3.4 - 1.5, ey - 0.4, 3, 0.8);
          else {
            c.moveTo(ex + sgn * 3.4 + 1.6, ey);
            c.arc(ex + sgn * 3.4, ey, 1.6, 0, TAU);
          }
        }
        c.fill();
        if (!blink) {
          c.fillStyle = PAPER;
          c.beginPath();
          for (const sgn of [-1, 1]) {
            c.moveTo(ex + sgn * 3.4 + look * 0.5 + 0.7, ey);
            c.arc(ex + sgn * 3.4 + look * 0.5, ey, 0.7, 0, TAU);
          }
          c.fill();
        }
        // two ear tips above the eyes when it is right at the mouth
        if (show > 0.9 && cyc > 1 && cyc < 6.5) {
          pen.stroke([[ex - 4.5, ey - 3], [ex - 5.5, ey - 6.5]], { color: INK, width: 1, alpha: 0.45, seed: 21, wobble: 0, taper: [0, 0.6] });
          pen.stroke([[ex + 4.5, ey - 3], [ex + 5.5, ey - 6.5]], { color: INK, width: 1, alpha: 0.45, seed: 22, wobble: 0, taper: [0, 0.6] });
        }
        c.globalAlpha = 1;
      }
    }
  },
};
