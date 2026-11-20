// The old television at the far left. A game plays on its screen (rolling hills scroll by, a little runner
// hops the crates) and the game's ground spills over the bezel and out into the world. Alive: the antenna
// sways and now and then gets nudged and rings out, a warm glow breathes around the set, the picture flickers
// every few seconds and the volume knob drifts.
import { GOLD, GREEN, GREEN_LINE, INK, PAPER, TV, WARM } from '../engine/layout';
import type { Part, Pen, Pt } from '../engine/types';
import { drawFigure } from './left/figure';
import { circle, clamp01, roundRect, smooth, spillTop } from './left/world';

const BODY_FILL = '#1c1710';
const SCREEN_BG = '#0d1610';
const S = TV.screen;
const BOT = TV.y + 390; // underside of the cabinet; the legs reach TV.y + TV.h
const RIGHT = TV.x + TV.w;

/** brightness of the picture: 1 normally, dips in short flickers on two unrelated periods */
function bright(t: number): number {
  let b = 1;
  const k1 = t % 6.3;
  if (k1 < 0.32) b = Math.sin(k1 * 70) > 0 ? 0.45 : 0.9;
  const k2 = (t + 2.2) % 9.7;
  if (k2 < 0.14) b = Math.min(b, 0.3);
  return b;
}

/** the antenna nudge: a damped ring every 5.9 s, plus a slow sway */
function wob(t: number, delay: number): number {
  const k = (t + 100 - delay) % 5.9;
  return 0.045 * Math.sin(t * 1.7 + delay * 3) + 0.15 * Math.exp(-2.2 * k) * Math.sin(k * 13);
}

// the game on the screen
const NEAR_V = 120; // scroll speed of the near hills, units per second
const JUMP = 1.9; // seconds between jumps
const RUN_X = S.x + 110;
const nearY = (x: number, t: number) => {
  const X = x + t * NEAR_V;
  return S.y + 210 + 14 * Math.sin(X / 50) + 7 * Math.sin(X / 23 + 2);
};
const farY = (x: number, t: number) => {
  const X = x + t * 34;
  return S.y + 125 + 22 * Math.sin(X / 62) + 12 * Math.sin(X / 27 + 1);
};

function drawGame(pen: Pen, t: number) {
  const x0 = S.x - 5, x1 = S.x + S.w + 5, yb = S.y + S.h + 5;
  pen.fill([[x0, S.y - 5], [x1, S.y - 5], [x1, yb], [x0, yb]], SCREEN_BG);
  const line = (fy: (x: number, t: number) => number): Pt[] => {
    const out: Pt[] = [];
    for (let x = x0; x <= x1; x += 6) out.push([x, fy(x, t)]);
    return out;
  };
  const far = line(farY);
  pen.fill([...far, [x1, yb], [x0, yb]], GREEN, 0.55);
  pen.stroke(far, { color: GREEN_LINE, width: 2.5, alpha: 0.5, seed: 41 });
  const near = line(nearY);
  pen.fill([...near, [x1, yb], [x0, yb]], GREEN);
  pen.stroke(near, { color: GREEN_LINE, width: 3.5, seed: 42 });

  // crates that pass under the runner at the top of each jump
  const D = JUMP * NEAR_V;
  const p = (t % JUMP) / JUMP;
  for (let k = -1; k <= 2; k++) {
    const cx = RUN_X + (0.5 - p) * D + k * D;
    if (cx < x0 - 20 || cx > x1 + 20) continue;
    const gy = nearY(cx, t) + 2;
    const box: Pt[] = [[cx - 11, gy - 22], [cx + 11, gy - 22], [cx + 11, gy], [cx - 11, gy]];
    pen.fill(box, SCREEN_BG);
    pen.stroke(box, { color: GOLD, width: 3, close: true, seed: 43 + k });
    pen.stroke([[cx - 4, gy - 15], [cx + 4, gy - 7]], { color: GOLD, width: 2.5, seed: 47 });
  }

  // the runner
  const q = clamp01((p - 0.3) / 0.4);
  const air = q > 0 && q < 1 ? Math.sin(Math.PI * q) : 0;
  const fy = nearY(RUN_X, t) + 1 - 62 * air;
  drawFigure(pen, RUN_X, fy, 0.42, INK, 'cap', { phase: t * Math.PI * 2 * 2.4, amp: 1.35 * (1 - air), tuck: air, lean: 0.22 }, t, 1, 50);
}

/** the strokes of the set, each with its slot in the entrance (fractions of this part's reveal) */
export const tv: Part = {
  id: 'tv',
  z: 20,
  intro: [0.6, 2.0],
  draw(pen, f) {
    const { t } = f;
    const r = f.alive ? 1 : f.reveal;
    if (r <= 0) return;
    const seg = (a: number, b: number) => clamp01((r - a) / (b - a));
    const ctx = pen.ctx;
    const br = bright(t);
    const on = smooth(0.55, 0.85, r);

    // warm glow breathing around the set
    const glow = on * br * (0.13 + 0.05 * Math.sin(t * 1.25) + 0.025 * Math.sin(t * 3.1 + 1));
    if (glow > 0.005) {
      const gx = S.x + S.w / 2, gy = S.y + S.h / 2;
      const g = ctx.createRadialGradient(gx, gy, 60, gx, gy, 460);
      g.addColorStop(0, `rgba(216,176,106,${glow})`);
      g.addColorStop(1, 'rgba(216,176,106,0)');
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(gx - 470, gy - 470, 940, 940);
      ctx.restore();
    }

    // antenna (behind the cabinet top)
    const base: Pt = [TV.x + 290, TV.y];
    const rod = (ang: number, len: number, seed: number, rv: number) => {
      const a = ang;
      const tip: Pt = [base[0] + Math.sin(a) * len, base[1] - 14 - Math.cos(a) * len];
      const mid: Pt = [base[0] + Math.sin(a) * len * 0.5 - Math.cos(a) * 4 * (a - ang), base[1] - 14 - Math.cos(a) * len * 0.5];
      pen.stroke([[base[0], base[1] - 14], mid, tip], { color: WARM, width: 5, seed, reveal: rv });
      if (rv >= 1) pen.stroke(circle(tip[0], tip[1], 6, 12), { color: WARM, width: 4, seed: seed + 1, close: true });
    };
    const ra = seg(0.38, 0.62);
    rod(-0.62 + wob(t, 0), 150, 21, ra);
    rod(0.52 + wob(t, 0.22), 138, 23, seg(0.42, 0.66));
    const dome: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      dome.push([base[0] + Math.cos(a) * 40, base[1] + 2 + Math.sin(a) * 22]);
    }
    pen.fill(dome, BODY_FILL, seg(0.3, 0.45));
    pen.stroke(dome, { color: WARM, width: 4.5, seed: 25, reveal: seg(0.3, 0.45) });

    // legs
    const legs: Pt[][] = [
      [[TV.x + 70, BOT], [TV.x + 58, TV.y + TV.h], [TV.x + 88, TV.y + TV.h]],
      [[RIGHT - 70, BOT], [RIGHT - 58, TV.y + TV.h], [RIGHT - 88, TV.y + TV.h]],
    ];
    legs.forEach((l, i) => pen.stroke(l, { color: WARM, width: 6, seed: 27 + i, reveal: seg(0.5 + i * 0.05, 0.7 + i * 0.05) }));

    // cabinet
    const body = roundRect(TV.x, TV.y, TV.w, BOT - TV.y, 24);
    pen.fill(body, BODY_FILL, seg(0.25, 0.5));
    pen.stroke(body, { color: WARM, width: 6, seed: 1, reveal: seg(0, 0.32) });
    const bezel = roundRect(S.x - 22, S.y - 22, S.w + 44, S.h + 44, 40);
    pen.stroke(bezel, { color: WARM, width: 3.5, alpha: 0.85, seed: 2, reveal: seg(0.12, 0.42) });

    // the screen and its game, clipped to the rounded glass
    const glass = roundRect(S.x, S.y, S.w, S.h, 34);
    if (on > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(glass[0]![0], glass[0]![1]);
      for (const p of glass) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.clip();
      drawGame(pen, t);
      // fading the picture in, and the flicker, are both a veil of paper over it
      const veil = 1 - on * br;
      if (veil > 0.01) pen.fill(glass, PAPER, veil);
      // a soft light at the centre of the tube
      const gx = S.x + S.w / 2, gy = S.y + S.h / 2;
      const g = ctx.createRadialGradient(gx, gy, 20, gx, gy, 230);
      g.addColorStop(0, `rgba(242,239,230,${0.06 * on * br})`);
      g.addColorStop(1, 'rgba(242,239,230,0)');
      ctx.fillStyle = g;
      ctx.fillRect(S.x, S.y, S.w, S.h);
      ctx.restore();
    } else {
      pen.fill(glass, SCREEN_BG, seg(0.2, 0.5));
    }
    pen.stroke(glass, { color: WARM, width: 5, seed: 3, reveal: seg(0.2, 0.52) });
    pen.stroke(
      [[S.x + 26, S.y + 70], [S.x + 30, S.y + 40], [S.x + 52, S.y + 22]],
      { color: INK, width: 4, alpha: 0.35 * on, seed: 4 },
    );

    // control panel: two knobs (the big one drifts) and a short grille
    const kx = RIGHT - 70;
    const kr = seg(0.48, 0.66);
    pen.stroke(circle(kx, TV.y + 82, 30), { color: WARM, width: 4.5, seed: 5, close: kr >= 1, reveal: kr });
    pen.stroke(circle(kx, TV.y + 160, 21), { color: WARM, width: 4, seed: 6, close: kr >= 1, reveal: seg(0.52, 0.7) });
    const ka = 0.7 + 0.5 * Math.sin(t * 0.43) + 0.25 * Math.sin(t * 1.13);
    pen.stroke([[kx, TV.y + 82], [kx + Math.sin(ka) * 22, TV.y + 82 - Math.cos(ka) * 22]], { color: WARM, width: 4, seed: 7, reveal: seg(0.6, 0.72) });
    pen.stroke([[kx - 8, TV.y + 168], [kx + 8, TV.y + 152]], { color: WARM, width: 3.5, seed: 8, reveal: seg(0.62, 0.74) });
    for (let i = 0; i < 4; i++) {
      const y = TV.y + 215 + i * 19;
      pen.stroke([[kx - 34, y], [kx + 34, y]], { color: WARM, width: 3.5, alpha: 0.8, seed: 9 + i, reveal: seg(0.6 + i * 0.04, 0.72 + i * 0.04) });
    }

    // the spill: the game's ground pours out of the screen corner, over the bezel and down to the floor
    const sp = seg(0.72, 1);
    if (sp > 0) {
      const top: Pt[] = [];
      for (let x = 410; x < RIGHT + 8; x += 8) top.push([x, spillTop(x, t)]);
      top.push([RIGHT + 8, spillTop(RIGHT + 8, t)]);
      const yG = TV.y + TV.h;
      const lower: Pt[] = [[RIGHT + 8, yG + 4], [RIGHT - 90, yG + 4], [RIGHT - 118, yG - 30], [RIGHT - 148, BOT - 50], [470, S.y + S.h + 6]];
      pen.fill([...top, ...lower], GREEN, smooth(0.15, 0.7, sp));
      pen.stroke(top, { color: GREEN_LINE, width: 5, seed: 31, reveal: sp });
      pen.stroke([...lower.slice(1), top[0]!], { color: GREEN_LINE, width: 4, alpha: 0.75, seed: 32, reveal: smooth(0.3, 1, sp) });
    }
  },
};
