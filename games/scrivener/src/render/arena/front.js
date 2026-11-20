// Static front layer, drawn over the fighters: the nearest pillars, the proscenium spandrel with a
// hanging chain-lamp, and heaps of fallen ledgers in the bottom corners. Owner: arena.
// All of it is the heaviest value in the frame: solid black slabs with form carved in white.
// Nothing here may cover the stage between ARENA.left and ARENA.right above the floor line,
// except the high spandrel corner.

import { W, H, GROUND_Y } from '../../core/constants.js';
import { hashNoise } from '../../core/rng.js';
import { offscreen } from '../ink.js';
import { INK, PAPER, fillPoly, rule, strokePts, hatchLines, clipPoly } from './lib.js';

const h = hashNoise;
export const LAMP = { x: 1196, y: 214 };

function pillar(g, x0, x1, litRight) {
  fillPoly(g, [[x0, -10], [x1, -10], [x1, H + 10], [x0, H + 10]], INK);
  // fluting carved in white, thinning toward the shadow side
  const n = 4;
  for (let i = 1; i < n; i++) {
    const fx = x0 + ((x1 - x0) * i) / n;
    const lit = litRight ? i / n : 1 - i / n;
    rule(g, fx, 20 + h(3000, i) * 40, fx, GROUND_Y - 30, 0.5 + lit * 1.1, { color: PAPER, alpha: 0.35 + lit * 0.45, end: 0.1 });
  }
  // rim light on the edge facing the stage
  const ex = litRight ? x1 - 1.5 : x0 + 1.5;
  rule(g, ex, -10, ex, GROUND_Y - 20, 1.6, { color: PAPER, alpha: 0.9, end: 0.4, bias: 0.4 });
  // base mouldings below the floor line
  const bx0 = litRight ? x0 : x0 - 24, bx1 = litRight ? x1 + 24 : x1;
  fillPoly(g, [[bx0, GROUND_Y - 6], [bx1, GROUND_Y - 6], [bx1, H + 10], [bx0, H + 10]], INK);
  for (const [y, w] of [[GROUND_Y - 2, 1.2], [GROUND_Y + 10, 0.8], [GROUND_Y + 30, 1.4], [GROUND_Y + 36, 0.6]]) {
    rule(g, bx0 + 2, y, bx1 - 2, y, w, { color: PAPER, alpha: 0.7, end: 0.3 });
  }
  // chips knocked out of the stone
  for (let i = 0; i < 5; i++) {
    const cy = 60 + h(3010 + x0, i) * (GROUND_Y - 120);
    const cx = litRight ? x1 - 1 : x0 + 1;
    const d = litRight ? -1 : 1;
    fillPoly(g, [[cx, cy], [cx + d * (3 + h(3011, i) * 4), cy + 3], [cx, cy + 7 + h(3012, i) * 6]], PAPER, 0.9);
  }
}

function spandrel(g) {
  // proscenium arch springing from the right pillar, black, with carved mouldings
  const curve = (off) => {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30, u = 1 - t;
      const x = u * u * (1244 - off * 0.2) + 2 * u * t * (1244 - off) + t * t * (930 - off * 0.6);
      const y = u * u * 250 + 2 * u * t * (40 + off) + t * t * (-12 + off * 0.2);
      pts.push([x, y]);
    }
    return pts;
  };
  const edge = curve(0);
  fillPoly(g, [...edge, [W + 10, -10], [W + 10, 250]], INK);
  // carved mouldings parallel to the intrados
  strokePts(g, curve(-7).filter(([x]) => x < 1244), 1.4, PAPER, 0.85);
  strokePts(g, curve(-12).filter(([x]) => x < 1244), 0.6, PAPER, 0.6);
  strokePts(g, curve(-24).filter(([x]) => x < 1244), 0.9, PAPER, 0.45);
  // voussoir joints carved as short white rules
  for (let i = 2; i < 29; i += 3) {
    const [ax, ay] = edge[i];
    const [bx, by] = edge[i + 1];
    const nx = -(by - ay), ny = bx - ax;
    const l = Math.hypot(nx, ny) || 1;
    rule(g, ax - (nx / l) * 26, ay - (ny / l) * 26, ax - (nx / l) * 46, ay - (ny / l) * 46, 0.8, { color: PAPER, alpha: 0.5, end: 0.2 });
  }
  // the intrados edge catches a hairline of light
  strokePts(g, edge, 1, PAPER, 0.9);
}

function chainLamp(g) {
  const { x, y } = LAMP;
  const top = 92;
  // chain: individual links, each with a carved highlight
  for (let yy = top, i = 0; yy < y - 26; yy += 7, i++) {
    g.save();
    g.translate(x, yy);
    g.lineWidth = 2;
    g.strokeStyle = INK;
    g.beginPath();
    if (i % 2) g.ellipse(0, 0, 1.6, 4.6, 0, 0, Math.PI * 2);
    else g.ellipse(0, 0, 3.6, 4.6, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = PAPER;
    g.globalAlpha = 0.85;
    g.fillRect(i % 2 ? -0.4 : -2.6, -2.2, 0.9, 1.8);
    g.restore();
  }
  // lamp: a caged inkwell lantern
  g.save();
  g.translate(x, y);
  g.fillStyle = INK;
  // cap
  g.beginPath(); g.moveTo(-6, -28); g.lineTo(6, -28); g.lineTo(18, -14); g.lineTo(-18, -14); g.closePath(); g.fill();
  rule(g, -18, -14, 18, -14, 3, { end: 0.8 });
  // bars of the cage
  for (const bx of [-15, -7, 7, 15]) rule(g, bx, -14, bx * 0.8, 22, 2.2, { end: 0.7 });
  // base bowl
  g.beginPath(); g.moveTo(-17, 20); g.lineTo(17, 20); g.quadraticCurveTo(14, 36, 0, 40); g.quadraticCurveTo(-14, 36, -17, 20); g.closePath(); g.fill();
  rule(g, 0, 40, 0, 52, 2, { end: 0.1 });
  // carved highlights on the cap and bowl
  g.fillStyle = PAPER;
  g.globalAlpha = 0.8;
  g.fillRect(-12, -17, 7, 1);
  g.beginPath(); g.ellipse(-8, 27, 5, 1.2, 0.3, 0, Math.PI * 2); g.fill();
  g.restore();
}

function rubble(g) {
  // bottom-left: a toppled heap of ledgers, black, with page blocks carved in white
  const slabs = [
    // [cx, cy, w, h, rot]
    [40, 700, 170, 40, -0.05], [120, 676, 150, 30, 0.12], [30, 662, 120, 26, -0.18], [176, 704, 120, 34, 0.2],
    [92, 648, 96, 20, 0.32], [10, 640, 70, 18, -0.4],
  ];
  const right = [
    [1160, 700, 190, 44, 0.06], [1236, 668, 130, 30, -0.15], [1120, 670, 110, 24, 0.22], [1270, 640, 90, 22, 0.45],
  ];
  for (const [i, [cx, cy, w, ht, rot]] of [...slabs, ...right].entries()) {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    fillPoly(g, [[-w / 2, -ht / 2], [w / 2, -ht / 2], [w / 2, ht / 2], [-w / 2, ht / 2]], INK);
    // page block: ruled leaves carved in white on a black block
    const inset = 8;
    if (h(3100, i) < 0.55) {
      g.save(); clipPoly(g, [[-w / 2 + inset, -ht / 2 + 5], [w / 2 - 3, -ht / 2 + 5], [w / 2 - 3, ht / 2 - 5], [-w / 2 + inset, ht / 2 - 5]]);
      hatchLines(g, { x: -w / 2, y: -ht / 2, w, h: ht }, { angle: 0, gap: 3.2, width: 0.7, seed: 3110 + i, color: PAPER, alpha: 0.75, broken: 0.5 });
      g.restore();
      rule(g, -w / 2 + inset - 2, -ht / 2 + 4, -w / 2 + inset - 2, ht / 2 - 4, 1, { color: PAPER, alpha: 0.6, end: 0.4 });
    } else {
      // cover facing up: a carved title rule and corner guards
      rule(g, -w * 0.3, 0, w * 0.3, 0, 1.2, { color: PAPER, alpha: 0.7, end: 0.2 });
      for (const sx of [-1, 1]) fillPoly(g, [[sx * w / 2, -ht / 2], [sx * (w / 2 - 9), -ht / 2], [sx * w / 2, -ht / 2 + 9]], PAPER, 0.6);
    }
    // top edge catches light
    rule(g, -w / 2, -ht / 2 + 0.6, w / 2, -ht / 2 + 0.6, 1.2, { color: PAPER, alpha: 0.85, end: 0.3 });
    g.restore();
  }
  // a spilled inkwell on the right heap and its run of ink toward the stage
  g.save();
  g.translate(1112, 650);
  g.rotate(-1.2);
  fillPoly(g, [[-10, -12], [10, -12], [14, 12], [-14, 12]], INK);
  fillPoly(g, [[-5, -18], [5, -18], [5, -12], [-5, -12]], INK);
  rule(g, -8, -9, -11, 9, 1.1, { color: PAPER, alpha: 0.8, end: 0.3 });
  g.restore();
}

export function buildFront(scale = 1) {
  const c = offscreen(Math.round(W * scale), Math.round(H * scale));
  const g = c.getContext('2d');
  g.scale(scale, scale);
  spandrel(g);
  pillar(g, 0, 36, true);
  pillar(g, 1244, W + 4, false);
  chainLamp(g);
  rubble(g);
  return c;
}
