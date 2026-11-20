// The game world spilled out of the TV: three simple green hills. One rises behind the set on the left, a
// big one stands just right of it, and in front the spill from the screen pours down to the ground and ends
// where the ridge begins (x ~ 980). Their outlines carry a slow wave that travels outward, so the world
// looks like it is still flowing out of the screen.
import { GREEN, GREEN_LINE, H } from '../engine/layout';
import type { Part, Pt } from '../engine/types';
import { SPILL_X1, clamp01, flow, hermite, smooth, spillTop } from './left/world';

const LEFT: readonly Pt[] = [[-20, 372], [40, 330], [100, 306], [170, 296], [260, 300], [420, 320], [620, 340]];
const BACK: readonly Pt[] = [
  [560, 330], [640, 338], [710, 318], [775, 350], [830, 425], [870, 520], [900, 610], [925, 690],
];

function hill(f: (x: number) => number, x0: number, x1: number): Pt[] {
  const out: Pt[] = [];
  for (let x = x0; x <= x1; x += 10) out.push([x, f(x)]);
  out.push([x1, f(x1)]);
  return out;
}

export const hills: Part = {
  id: 'hills',
  z: 10,
  intro: [0.2, 1.4],
  draw(pen, fr) {
    const { t } = fr;
    const r = fr.alive ? 1 : fr.reveal;
    // the front spill pours out after the TV's own spill (TV entrance ends at 2.0 s), so it uses time directly
    const rs = fr.alive ? 1 : clamp01((t - 1.85) / 0.7);
    const seg = (a: number, b: number) => clamp01((r - a) / (b - a));
    const draw = (top: Pt[], rv: number, seed: number) => {
      if (rv <= 0) return;
      const x0 = top[0]![0], x1 = top[top.length - 1]![0];
      pen.fill([...top, [x1, H + 10], [x0, H + 10]], GREEN, smooth(0.1, 0.7, rv));
      pen.stroke(top, { color: GREEN_LINE, width: 5, seed, reveal: rv });
    };

    draw(hill((x) => hermite(LEFT, x) + flow(x, t * 0.8, 4), -20, 620), seg(0, 0.6), 61);
    draw(
      hill((x) => hermite(BACK, x) + flow(x + 300, t * 0.9, 6 * (1 - smooth(860, 925, x))), 560, 925),
      seg(0.25, 1),
      62,
    );
    draw(hill((x) => spillTop(x, t), 640, SPILL_X1), rs, 63);
  },
};
