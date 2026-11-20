// Bridges our own ink engine (web/src/ui/ink) to Clayzo path data, so Clayzo animations are drawn
// with the same seeded hand as the UI kit.
import type { PathContour, PathVertex } from '@clayzo/animation/authoring';
import { check, ring, star4 } from '../../../web/src/ui/ink/shapes';
import { stroke as inkStroke, type Pen, type Pt } from '../../../web/src/ui/ink/stroke';

const r2 = (n: number) => Math.round(n * 100) / 100;
const v = (x: number, y: number): PathVertex => ({ point: { x: r2(x), y: r2(y) }, inTangent: { x: 0, y: 0 }, outTangent: { x: 0, y: 0 } });

/** The wobbled centre line of an ink stroke as an open polyline contour (ready for `trim`). Every second point is enough. */
function fromGuide(guide: string): PathContour {
  const n = (guide.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
  const keep = pts.length > 12 ? pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1) : pts;
  return { closed: false, vertices: keep.map(([x, y]) => v(x, y)) };
}

/** A hand-drawn ring around (0, 0), ends overlapping. */
export const inkRing = (r: number, seed: string, pen: Pen = { w: 1.3, wobble: 0.6 }): PathContour => fromGuide(ring(0, 0, r, seed, pen).guide);

/** A hand-drawn line between two points. */
export const inkLine = (a: Pt, b: Pt, seed: string, pen: Pen = { w: 1, wobble: 0.3 }): PathContour => fromGuide(inkStroke([a, b], pen, seed).guide);

/** The kit's tick as one stroke, centred on (0, 0). */
export const inkCheck = (size: number, seed: string): PathContour => fromGuide(check(0, 0, size, seed, { w: 2, wobble: 0.4 }).guide);

/** The chart's four-point star around (0, 0) as a closed cubic contour. */
export function inkStar(r: number, seed: string): PathContour {
  // star4 emits "M p0 Q c1 p1 Q c2 p2 Q c3 p3 Q c4 p0 Z"
  const n = (star4(0, 0, r, seed).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pt = (i: number) => ({ x: n[i * 2]!, y: n[i * 2 + 1]! });
  const tips = [pt(0), pt(2), pt(4), pt(6)];
  const ctrl = [pt(1), pt(3), pt(5), pt(7)];
  const vertices: PathVertex[] = tips.map((p, i) => {
    const cOut = ctrl[i]!; // control of the curve leaving this tip
    const cIn = ctrl[(i + 3) % 4]!; // control of the curve arriving at it
    return {
      point: p,
      outTangent: { x: r2((2 / 3) * (cOut.x - p.x)), y: r2((2 / 3) * (cOut.y - p.y)) },
      inTangent: { x: r2((2 / 3) * (cIn.x - p.x)), y: r2((2 / 3) * (cIn.y - p.y)) },
    };
  });
  return { closed: true, vertices };
}

/** A spike of a compass rose: a thin triangle from the centre out to `length`, pointing at `deg` (0 = up, clockwise). */
export function spike(deg: number, length: number, half: number, inner = 0): PathContour {
  const a = ((deg - 90) * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = -uy;
  const py = ux;
  return {
    closed: true,
    vertices: [v(ux * length, uy * length), v(ux * inner + px * half, uy * inner + py * half), v(ux * inner - px * half, uy * inner - py * half)],
  };
}
