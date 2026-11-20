// Three game characters climb out of the TV screen one after another: each steps out of the screen corner as a
// small sprite, grows to full size while walking down the spill, walks the ridge to the couch, stops and waves,
// then hops and fades away. Each loops every 24 s, a third of a loop apart, so one is always on the ridge.
// The walk cycle is cadence-locked to the speed (no foot sliding) and the hips ride on the lower foot.
import { BLUE, INK, INTRO_END, ORANGE, WALK } from '../engine/layout';
import type { Part } from '../engine/types';
import { drawFigure, type Kind } from './left/figure';
import { smooth, walkY } from './left/world';

interface Walker { color: string; kind: Kind; v: number; stride: number; seed: number }
const CAST: readonly Walker[] = [
  { color: INK, kind: 'cap', v: 100, stride: 80, seed: 100 },
  { color: ORANGE, kind: 'pack', v: 94, stride: 74, seed: 200 },
  { color: BLUE, kind: 'scarf', v: 106, stride: 86, seed: 300 },
];

const LOOP = 24; // seconds per walker loop
const EMERGE = 1.7; // seconds spent growing from sprite to full size
const S0 = 0.34; // size when it first steps out of the screen
const X0 = 452; // first step: the screen's bottom-right corner
const WAVE = 2.0;
const HOP = 0.9;

export const walkers: Part = {
  id: 'walkers',
  z: 30,
  intro: [3.0, 3.4],
  draw(pen, f) {
    if (!f.alive) return;
    const { t } = f;
    CAST.forEach((w, i) => {
      const local = t - INTRO_END - (i * LOOP) / 3;
      if (local < 0) return;
      const tau = local % LOOP;
      const cad = (w.v / w.stride) * Math.PI * 2; // walk phase, radians per second
      const xE = X0 + w.v * EMERGE * (S0 + (1 - S0) * 0.5);
      const tWalk = EMERGE + (WALK.to - xE) / w.v;

      let x: number, s = 1, alpha = 1, amp = 1, wave = 0, tuck = 0, lift = 0;
      const phase = cad * Math.min(tau, tWalk + 0.3);
      if (tau < EMERGE) {
        const u = tau / EMERGE;
        x = X0 + w.v * EMERGE * (S0 * u + (1 - S0) * (u * u * u - (u * u * u * u) / 2));
        s = S0 + (1 - S0) * u * u * (3 - 2 * u);
        alpha = smooth(0, 0.3, tau);
      } else if (tau < tWalk) {
        x = xE + w.v * (tau - EMERGE);
      } else {
        // slow to a stop over 0.3 s, then wave, then one hop forward while fading
        const k = tau - tWalk;
        const st = Math.min(k, 0.3);
        x = WALK.to + w.v * (st - (st * st) / 0.6);
        amp = 1 - smooth(0, 0.3, k);
        wave = smooth(0.25, 0.6, k) * (1 - smooth(WAVE - 0.35, WAVE, k));
        const h = (k - WAVE) / HOP;
        if (h > 0) {
          if (h >= 1) return;
          x += 60 * h;
          lift = 48 * Math.sin(Math.PI * h);
          tuck = 0.5 * Math.sin(Math.PI * h);
          alpha = 1 - smooth(0.25, 1, h);
        }
      }
      const fy = walkY(x, t) + 1 - lift;
      drawFigure(pen, x, fy, s, w.color, w.kind, { phase: phase + i * 1.3, amp, wave, tuck }, t, alpha, w.seed);
    });
  },
};
