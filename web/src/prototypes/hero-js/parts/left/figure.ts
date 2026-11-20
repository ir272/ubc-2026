// A little game character drawn in ink: round head, tube body, jointed legs and arms, one accessory.
// Used by the walkers and (small) by the runner on the TV screen. The hips sit at whatever height puts the
// lower foot exactly on the ground, so the bounce of the walk comes out of the leg angles by itself.
import { PAPER } from '../../engine/layout';
import type { Pen, Pt } from '../../engine/types';
import { circle } from './world';

export type Kind = 'cap' | 'pack' | 'scarf';

export interface Pose {
  /** walk cycle phase in radians */
  phase: number;
  /** 0 = standing still, 1 = walking, >1 = running */
  amp: number;
  /** 0..1: the front arm is raised and waving */
  wave?: number;
  /** 0..1: legs tucked as in a jump */
  tuck?: number;
  lean?: number;
}

/** the colour mixed 60% toward the paper: the flat fill inside a body outline */
function tint(c: string): string {
  const a = parseInt(c.slice(1), 16), b = parseInt(PAPER.slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * 0.4 + ((b >> sh) & 255) * 0.6);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const THIGH = 25, SHIN = 24, BODY = 30, UPPER = 19, FORE = 18;

export function drawFigure(
  pen: Pen, fx: number, fy: number, s: number, color: string, kind: Kind, pose: Pose, t: number, alpha = 1, seed = 1,
) {
  if (alpha <= 0.01 || s <= 0) return;
  const P = (x: number, y: number): Pt => [fx + x * s, fy + y * s];
  const { phase: ph, amp } = pose;
  const wave = pose.wave ?? 0, tuck = pose.tuck ?? 0;
  const lean = pose.lean ?? 0.07 * Math.min(amp, 1.4);
  const sw = Math.sin(ph);

  // legs: angles measured from straight down, positive = forward (to the right)
  const leg = (sign: number) => {
    const th = sign * 0.5 * amp * sw + 0.75 * tuck;
    const swing = Math.max(0, sign * Math.cos(ph)); // the leg moving forward bends its knee
    const k = amp * (0.12 + 0.8 * swing) + 1.4 * tuck;
    const knee: Pt = [Math.sin(th) * THIGH, Math.cos(th) * THIGH];
    const a = th - k;
    const foot: Pt = [knee[0] + Math.sin(a) * SHIN, knee[1] + Math.cos(a) * SHIN];
    const toe: Pt = [foot[0] + Math.cos(a) * 8, foot[1] - Math.sin(a) * 8];
    return { knee, foot, toe };
  };
  const front = leg(1), back = leg(-1);
  const ext = Math.max(front.foot[1], back.foot[1], front.toe[1], back.toe[1]);
  const hip: Pt = [0, -ext];
  const sh: Pt = [hip[0] + Math.sin(lean) * BODY, hip[1] - Math.cos(lean) * BODY];
  const head: Pt = [sh[0] + Math.sin(lean) * 20, sh[1] - Math.cos(lean) * 20];

  const arm = (sign: number, waving: number) => {
    let a = -sign * 0.55 * amp * sw;
    let f = a + 0.2 + 0.35 * Math.min(amp, 1.5);
    if (waving > 0) {
      const up = 2.55, fw = up + 0.42 * Math.sin(t * 8.5);
      a += (up - a) * waving;
      f += (fw - f) * waving;
    }
    const el: Pt = [sh[0] + Math.sin(a) * UPPER, sh[1] + Math.cos(a) * UPPER];
    const hand: Pt = [el[0] + Math.sin(f) * FORE, el[1] + Math.cos(f) * FORE];
    return [P(sh[0], sh[1] + 2), P(el[0], el[1]), P(hand[0], hand[1])] as Pt[];
  };
  const limb = (pts: Pt[], a: number, sd: number) => pen.stroke(pts, { color, width: 7.5 * s, alpha: a, seed: seed + sd });
  const legPts = (l: ReturnType<typeof leg>): Pt[] => [
    P(hip[0], hip[1]), P(hip[0] + l.knee[0], hip[1] + l.knee[1]), P(hip[0] + l.foot[0], hip[1] + l.foot[1]),
    P(hip[0] + l.toe[0], hip[1] + l.toe[1]),
  ];

  const dim = alpha * 0.62;
  limb(arm(-1, 0), dim, 1);
  limb(legPts(back), dim, 2);

  if (kind === 'pack') {
    const c: Pt = [(hip[0] + sh[0]) / 2 - 13, (hip[1] + sh[1]) / 2 - 3];
    const box: Pt[] = [
      P(c[0] - 8, c[1] - 13), P(c[0] + 6, c[1] - 14), P(c[0] + 7, c[1] + 12), P(c[0] - 9, c[1] + 12),
    ];
    pen.fill(box, color, alpha * 0.85);
    pen.stroke(box, { color, width: 4 * s, close: true, alpha, seed: seed + 3 });
  }

  // body: an outlined tube
  pen.stroke([P(hip[0], hip[1] + 2), P(sh[0], sh[1])], { color, width: 23 * s, alpha, seed: seed + 4 });
  pen.stroke([P(hip[0], hip[1] + 2), P(sh[0], sh[1])], { color: tint(color), width: 12 * s, alpha, seed: seed + 5 });

  if (kind === 'scarf') {
    const n: Pt = [sh[0] + 1, sh[1] - 2];
    const fl = (k: number) => Math.sin(t * 7.3 + k) * (3 + 2 * Math.min(amp, 1));
    pen.stroke(
      [P(n[0], n[1]), P(n[0] - 12, n[1] + 1 + fl(0)), P(n[0] - 23, n[1] + 4 + fl(1)), P(n[0] - 33, n[1] + 2 + fl(2.1))],
      { color, width: 6 * s, alpha, seed: seed + 6 },
    );
  }

  // head
  const hc = P(head[0], head[1]);
  const hr = 13 * s;
  pen.fill(circle(hc[0], hc[1], hr, 20), PAPER, alpha);
  pen.stroke(circle(hc[0], hc[1], hr, 20), { color, width: 5 * s, alpha, seed: seed + 7, close: true });
  if (kind === 'cap') {
    const crown: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      crown.push([hc[0] + Math.cos(a) * hr * 1.08, hc[1] + Math.sin(a) * hr * 1.08 - 1 * s]);
    }
    pen.fill(crown, color, alpha);
    pen.stroke([[hc[0] + hr * 0.6, hc[1] - 1.5 * s], [hc[0] + hr * 1.9, hc[1] - 0.5 * s]], { color, width: 4.5 * s, alpha, seed: seed + 8 });
  }
  if (kind === 'scarf') {
    // a pointed hood
    const tip = P(head[0] - 9 + Math.sin(t * 2.1) * 1.5, head[1] - 25);
    const hood: Pt[] = [[hc[0] - hr * 1.02, hc[1] - 1 * s], tip, [hc[0] + hr * 0.95, hc[1] - 3 * s]];
    pen.fill([...hood, [hc[0], hc[1] - hr * 0.6]], color, alpha);
  }

  limb(legPts(front), alpha, 9);
  limb(arm(1, wave), alpha, 10);
}
