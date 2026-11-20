// Tufts of grass along the ridge. Each tuft is a few curved blades that bend with the shared wind, so gusts
// visibly run across the ridge from left to right; each blade also flutters a little on its own period.
// During the intro the tufts sprout from left to right.
import { COUCH, GREEN_LINE, SIGN, TREE, groundY, wind } from '../engine/layout';
import type { Part, Pt } from '../engine/types';

interface Blade {
  dx: number; // offset of the blade's root from the tuft centre
  h: number; // height
  lean: number; // resting lean of the tip (scene units, + is right)
  flex: number; // how much the wind moves it
  fw: number; // flutter rate (rad/s)
  fp: number; // flutter phase
}
interface Tuft {
  x: number;
  blades: Blade[];
}

function rnd(n: number): number {
  const s = Math.sin(n * 91.345 + 47.853) * 23421.631;
  return s - Math.floor(s);
}

const KEEP_OUT: readonly (readonly [number, number])[] = [
  [COUCH.x - 30, COUCH.x + COUCH.w + 30],
  [SIGN.x - 45, SIGN.x + 45],
  [TREE.x - 55, TREE.x + 55],
];

const TUFTS: Tuft[] = (() => {
  const out: Tuft[] = [];
  let x = 960;
  let i = 0;
  while (x < 2985) {
    if (!KEEP_OUT.some(([a, b]) => x > a && x < b)) {
      const count = 3 + Math.floor(rnd(i * 3.1) * 2.2); // 3 or 4 blades
      const big = 0.8 + rnd(i * 5.7) * 0.55;
      const blades: Blade[] = [];
      for (let k = 0; k < count; k++) {
        const side = count === 1 ? 0 : k / (count - 1) - 0.5; // -0.5 .. 0.5
        const r = rnd(i * 17.3 + k * 2.9);
        blades.push({
          dx: side * 22 + (r - 0.5) * 5,
          h: big * (36 + (1 - Math.abs(side) * 1.4) * 30 + r * 12),
          lean: side * 26 + (r - 0.5) * 8,
          flex: 0.8 + r * 0.5,
          fw: 2.1 + rnd(i * 7.7 + k) * 1.9,
          fp: rnd(i * 2.3 + k * 5.1) * 6.283,
        });
      }
      out.push({ x, blades });
    }
    x += 70 + rnd(i * 1.37) * 85;
    i++;
  }
  return out;
})();

const easeOutBack = (u: number) => {
  const c = 1.9;
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
};

export const grass: Part = {
  id: 'grass',
  z: 14,
  intro: [2.0, 3.0],
  draw(pen, f) {
    const t = f.t;
    for (const tuft of TUFTS) {
      // sprout from left to right through the intro window
      const g = f.reveal >= 1 ? 1 : Math.max(0, Math.min(1, (f.reveal - ((tuft.x - 960) / 2040) * 0.6) / 0.4));
      if (g <= 0) continue;
      const grow = easeOutBack(g);
      const w = wind(t, tuft.x);
      for (const b of tuft.blades) {
        const rx = tuft.x + b.dx;
        const ry = groundY(rx) + 3;
        const h = b.h * grow;
        const flutter = Math.sin(t * b.fw + b.fp) * 3.5 + Math.sin(t * b.fw * 1.7 + b.fp * 2) * 1.5;
        const bend = b.lean + (w * 30 + flutter) * b.flex; // tip offset sideways
        // the tip dips a little as it bends, so the blade keeps roughly its length
        const tipY = ry - h * (1 - Math.min(0.35, (bend / Math.max(h, 1)) ** 2 * 0.35));
        const pts: Pt[] = [
          [rx, ry],
          [rx + bend * 0.18, ry - h * 0.45],
          [rx + bend * 0.55, ry - h * 0.8],
          [rx + bend, tipY],
        ];
        // a tapered blade: wide at the root, a point at the tip, so it reads as a leaf and not a hair
        const c = pen.curve(pts, 5);
        const n = c.length;
        const left: Pt[] = [];
        const right: Pt[] = [];
        for (let k = 0; k < n; k++) {
          const a = c[Math.max(0, k - 1)]!, z = c[Math.min(n - 1, k + 1)]!;
          const tx = z[0] - a[0], ty = z[1] - a[1];
          const tl = Math.hypot(tx, ty) || 1;
          const hw = 3.6 * (1 - k / (n - 1)) ** 0.8 + 0.4;
          left.push([c[k]![0] - (ty / tl) * hw, c[k]![1] + (tx / tl) * hw]);
          right.push([c[k]![0] + (ty / tl) * hw, c[k]![1] - (tx / tl) * hw]);
        }
        pen.fill([...left, ...right.reverse()], GREEN_LINE);
      }
    }
  },
};
