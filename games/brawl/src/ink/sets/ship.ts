// The Night Ship: the deck of an old sailing ship at sea. Port of lab/stages/ship.js, RE-FITTED to the
// standard layout: the two lower yards are the side ledges (x -5.4..-2.6 and 2.6..5.4 at 2.5, still on
// the masts at x -4 and 4); the upper yards went up to 7.4, shorter and dim (background, not ledges);
// the top ledge (x -1.5..1.5 at 4.8) is the ship's boat, slung on two falls from the stay between
// the masts. The sea runs out to the camera's edges and down past its floor.

import { ARENA } from '../../sim/arena.ts';
import type { StageSet } from '../api.ts';
import { makeSet, rng, type Kit, type Pt } from './kit.ts';

const L = ARENA;
const TOP = 9.8;

function waveRow(P: Kit, y: number, wl: number, amp: number, a: number, ri: number, seed: number, x0: number, x1: number, tintFar: boolean): void {
  const r = rng(seed);
  for (let x = x0 + r() * wl; x < x1; x += wl * (1.6 + r() * 1.2)) {
    const crest = P.S([[x, y], [x + wl * 0.35, y + amp * 0.45], [x + wl * 0.62, y + amp * 0.62], [x + wl * 0.75, y + amp * 0.35], [x + wl * 0.6, y + amp * 0.15]], 6);
    P.line(crest, { w: 0.9 + ri * 0.3, alpha: a, taper: 0.7, tint: tintFar ? 'blue' : null });
    P.line([[x - wl * 0.5, y - 0.02], [x, y]], { w: 0.8 + ri * 0.2, alpha: a * 0.7, taper: 0.9 });
    if (ri >= 2 && r() < 0.6) P.hatch([[x + wl * 0.1, y + 0.02], [x + wl * 0.55, y + amp * 0.5], [x + wl * 0.6, y + 0.02]], { angle: 1.3, gap: 3.5, tint: 'blue', alpha: 0.6 });
  }
}

function far(P: Kit): void {
  const { S, E } = P;
  P.sky(17, [-23, -0.6, 23, 17], 300, [[-10.6, 8.9, 0.34], [-0.4, 9.7, 0.26, 0.65], [8.2, 7.6, 0.24, 0.6], [11.8, 9.6, 0.3], [-12, 3.6, 0.2, 0.5], [-17.2, 10.8, 0.3], [16.6, 12.6, 0.28], [2.6, 14.2, 0.22, 0.6]],
    (x, y) => Math.hypot(x + 9.6, y - 6.2) < 1.6 || (Math.abs(x) < 6.8 && y > 0 && y < 8.4));
  // a thin moon
  const moon = E(-9.6, 6.2, 1.05, 1.05, 0, 36);
  P.fill(moon, 'yellow', 0.14);
  P.line(P.A(-9.6, 6.2, 1.05, -2.4, 2.4, 24), { w: 1.6, tint: 'yellow', taper: 0.7 });
  P.line(S([[-10.2, 7.06], [-9.45, 6.3], [-10.2, 5.34]], 8), { w: 1.2, tint: 'yellow', alpha: 0.7, taper: 0.8 });

  // the sea: horizon, then rows of drawn waves, nearer rows bigger and brighter
  P.line([[-23, -0.65], [23, -0.65]], { w: 1, alpha: 0.35, taper: 0.4 });
  const rows = [[-1.0, 0.45, 0.25, 0.25], [-1.45, 0.65, 0.33, 0.3], [-2.0, 0.9, 0.42, 0.38], [-2.7, 1.25, 0.55, 0.5], [-3.5, 1.7, 0.72, 0.62]];
  rows.forEach(([y, wl, amp, a], ri) => waveRow(P, y, wl, amp, a, ri, 90 + ri, -23.4, 23.4, ri <= 2));
}

function near(P: Kit): void {
  const { S, E } = P;

  // the hull
  const hull = S([[-8.15, 0], [8.0, 0], [8.6, 0.3], [8.2, -0.9], [7.3, -2.2], [5.6, -3.0], [0, -3.2], [-6.2, -3.0], [-7.6, -2.3], [-7.95, -1.0]], 6, true);
  P.mask(hull);
  P.hatch(S([[-7.6, -2.0], [-6.2, -2.75], [0, -2.95], [5.6, -2.75], [7.2, -2.0], [5.6, -2.5], [0, -2.6], [-6.0, -2.45]], 5, true), { angle: 1.2, gap: 4, alpha: 0.45 });
  for (const [y, a] of [[-0.45, 0.45], [-1.6, 0.45], [-2.1, 0.4], [-2.55, 0.35]]) {
    const k = -y / 3.2;
    P.line(S([[-7.95 + k * 0.45, y], [0, y - k * 0.15], [8.0 - k * 1.6, y + 0.05]], 8), { w: 0.9, alpha: a, taper: 0.4 });
  }
  // the wale and the gun ports
  P.form(S([[-7.95, -1.0], [0, -1.12], [8.2, -0.9], [8.15, -1.22], [0, -1.42], [-7.9, -1.3]], 6, true), { w: 1.8 });
  for (let x = -6.4; x < 6.6; x += 1.6) {
    const port: Pt[] = [[x - 0.28, -0.62], [x + 0.28, -0.62], [x + 0.28, -0.98], [x - 0.28, -0.98]];
    P.form(port, { w: 1.4 });
    P.hatch(port, { angle: 0.2, gap: 3, alpha: 0.7 });
  }
  P.line(hull, { w: 2.6, closed: true });
  // stern post and the rudder
  P.line([[-7.95, -1.0], [-8.3, -1.4], [-7.9, -2.4]], { w: 1.6, alpha: 0.85 });
  // waves in front of the waterline, hiding everything under them down past the camera's floor
  const rw = rng(99);
  for (let x = -8.6; x < 9; x += 1.0 + rw() * 0.5) {
    const y = -2.95 + rw() * 0.2, wl = 1.1 + rw() * 0.4;
    const crest = S([[x, y], [x + wl * 0.35, y + 0.35], [x + wl * 0.62, y + 0.48], [x + wl * 0.78, y + 0.26], [x + wl * 0.6, y + 0.1]], 6);
    P.mask(crest.concat([[x + wl * 0.8, -10], [x - 0.2, -10]]));
    P.line(crest, { w: 1.6, alpha: 0.85, taper: 0.6 });
    P.line([[x - wl * 0.5, y - 0.03], [x, y]], { w: 1.3, alpha: 0.6, taper: 0.9 });
  }
  // the near sea below, bigger rows still, quieter than the ship
  P.tone(0.8);
  const fore = [[-4.4, 2.2, 0.9, 0.6], [-5.5, 2.8, 1.1, 0.58], [-6.9, 3.4, 1.3, 0.55], [-8.5, 4.0, 1.5, 0.5]];
  fore.forEach(([y, wl, amp, a], i) => waveRow(P, y, wl, amp, a, 3 + i, 120 + i, -20.5, 20.5, false));
  P.tone(1);

  // the bowsprit and the stern lantern, outside the deck
  P.line([[7.6, 0.2], [12.2, 2.6]], { w: 2.4, taper: 0.4 });
  P.line([[8.4, 0.25], [8.9, -0.9]], { w: 1.2, alpha: 0.7 });
  P.line([[-8.15, 0.2], [-8.9, 1.25]], { w: 1.6, taper: 0.2 });
  P.tone(1.3);
  P.form([[-9.15, 1.25], [-8.65, 1.25], [-8.6, 0.6], [-9.2, 0.6]], { w: 1.5, tint: 'gold', wash: 0.35 });
  P.line([[-9.15, 1.25], [-8.9, 1.5], [-8.65, 1.25]], { w: 1.3, tint: 'gold' });
  P.tone(1);

  // far-side rail along the deck, dim
  P.tone(0.8);
  P.line([[-7.9, 0.75], [7.6, 0.75]], { w: 1, alpha: 0.4, taper: 0.1 });
  for (let x = -7.6; x < 7.6; x += 0.8) P.line([[x, 0.05], [x, 0.75]], { w: 0.8, alpha: 0.32, taper: 0.1 });

  // rigging: shrouds with ratlines, stays, all thin and quiet
  for (const mx of [-4, 4]) {
    for (const bx of [mx - 2.2, mx + 2.2]) {
      const a = 0.55;
      const b2 = bx + Math.sign(mx - bx) * 0.5;
      P.line([[mx, TOP - 0.4], [bx, 0.05]], { w: 1, alpha: a, taper: 0.1 });
      P.line([[mx, TOP - 0.4], [b2, 0.05]], { w: 1, alpha: a, taper: 0.1 });
      for (let y = 0.6; y < 8.4; y += 0.6) {
        const t = y / (TOP - 0.4);
        P.line([[bx + (mx - bx) * t, y], [b2 + (mx - b2) * t, y]], { w: 0.7, alpha: 0.28, taper: 0.2 });
      }
    }
  }
  const stay = S([[-4, TOP - 0.2], [0, TOP - 1.0], [4, TOP - 0.2]], 8);
  P.line(stay, { w: 1, alpha: 0.5, taper: 0.1 });
  P.line([[4, TOP - 0.5], [12.2, 2.6]], { w: 1, alpha: 0.55, taper: 0.1 });
  P.line([[4, 6.8], [11.0, 2.0]], { w: 0.9, alpha: 0.4, taper: 0.1 });
  P.line([[-4, TOP - 0.5], [-8.4, 0.3]], { w: 0.9, alpha: 0.45, taper: 0.1 });
  P.tone(1);

  // masts
  for (const mx of [-4, 4]) {
    P.form([[mx - 0.17, 0], [mx + 0.17, 0], [mx + 0.12, TOP], [mx - 0.12, TOP]], { w: 2 });
    P.form([[mx - 0.2, TOP], [mx + 0.2, TOP], [mx + 0.2, TOP + 0.25], [mx - 0.2, TOP + 0.25]], { w: 1.4 });
    P.line([[mx - 0.17, 3.6], [mx + 0.17, 3.6]], { w: 1, alpha: 0.6 });
    P.line([[mx - 0.17, 6.4], [mx + 0.17, 6.4]], { w: 1, alpha: 0.6 });
    // pennant
    const pa = S([[mx, TOP + 0.25], [mx - 0.9, TOP + 0.15], [mx - 1.9, TOP + 0.3], [mx - 2.6, TOP + 0.12]], 6);
    const pb = S([[mx - 2.6, TOP + 0.12], [mx - 1.8, TOP - 0.05], [mx - 0.9, TOP - 0.05], [mx, TOP - 0.05]], 6);
    P.tone(1.2, 1.05);
    P.form(pa.concat(pb), { w: 1.2, tint: 'red', wash: 0.3 });
    P.tone(1);
  }

  // yards with furled sails under them
  function yard(s: { x0: number; x1: number; y: number }, ledge: boolean): void {
    const mid = (s.x0 + s.x1) / 2, th = 0.22;
    const shape: Pt[] = [[s.x0, s.y], [s.x1, s.y], [s.x1 + 0.12, s.y - th * 0.4], [s.x1, s.y - th * 0.7], [mid, s.y - th], [s.x0, s.y - th * 0.7], [s.x0 - 0.12, s.y - th * 0.4]];
    // the furled sail: a lumpy roll hanging under the yard, tied with gaskets
    const r = rng(Math.round(s.x0 * 10 + s.y * 7) + 200);
    const roll: Pt[] = [[s.x0 + 0.15, s.y - th * 0.6]];
    for (let x = s.x0 + 0.25; x < s.x1 - 0.2; x += 0.42) roll.push([x + 0.21, s.y - th - 0.32 - r() * 0.16]);
    roll.push([s.x1 - 0.15, s.y - th * 0.6]);
    const rollShape = S(roll, 5).concat([[s.x1 - 0.15, s.y - 0.05], [s.x0 + 0.15, s.y - 0.05]]);
    P.form(rollShape, { w: 1.6 });
    P.hatch(rollShape, { angle: 1.4, gap: 4.5, alpha: 0.35 });
    for (let x = s.x0 + 0.65; x < s.x1 - 0.3; x += 0.85) P.line([[x, s.y - 0.12], [x + 0.08, s.y - th - 0.38]], { w: 1, alpha: 0.7, taper: 0.2 });
    if (ledge) P.tone(1.4, 1.12);
    P.form(shape, { w: 2 });
    if (ledge) P.tone(1);
    // lifts from the mast to the yard ends
    P.line([[mid, s.y + 1.5], [s.x0 + 0.05, s.y]], { w: 0.8, alpha: 0.45, taper: 0.1 });
    P.line([[mid, s.y + 1.5], [s.x1 - 0.05, s.y]], { w: 0.8, alpha: 0.45, taper: 0.1 });
  }
  // upper yards: high, short and dim, so they read as rigging and not as ledges
  P.tone(0.65, 0.92);
  yard({ x0: -5.0, x1: -3.0, y: 7.4 }, false);
  yard({ x0: 3.0, x1: 5.0, y: 7.4 }, false);
  P.tone(1);
  yard(L.soft[0], true);
  yard(L.soft[1], true);

  // the ship's boat, slung on two falls from the stay: its gunwale is the top ledge
  const B = L.soft[2];
  const stayY = (x: number): number => {
    let best = stay[0];
    for (const q of stay) if (Math.abs(q[0] - x) < Math.abs(best[0] - x)) best = q;
    return best[1];
  };
  for (const sx of [-1, 1]) {
    const bx = sx * (B.x1 - 0.15), tx = sx * (B.x1 + 0.1);
    P.line([[bx, B.y], [tx, stayY(tx)]], { w: 0.9, alpha: 0.6, taper: 0.1 });
    P.form(E(sx * (B.x1 - 0.02), B.y + 2.9, 0.08, 0.15, 0, 10), { w: 1 });
  }
  const boat: Pt[] = [[B.x0 - 0.1, B.y], [B.x1 + 0.1, B.y], ...S([[B.x1 + 0.1, B.y], [B.x1 - 0.1, B.y - 0.4], [0.9, B.y - 0.64], [0, B.y - 0.72], [-0.95, B.y - 0.66], [B.x0 + 0.05, B.y - 0.36], [B.x0 - 0.1, B.y]], 6)];
  P.tone(1.4, 1.12);
  P.form(boat, { w: 2 });
  P.tone(1);
  P.line(S([[B.x0 + 0.05, B.y - 0.14], [0, B.y - 0.18], [B.x1 - 0.05, B.y - 0.14]], 6), { w: 0.9, alpha: 0.6, taper: 0.3 });
  P.line(S([[B.x0 + 0.2, B.y - 0.38], [0, B.y - 0.46], [B.x1 - 0.2, B.y - 0.4]], 6), { w: 0.8, alpha: 0.45, taper: 0.4 });
  P.hatch(S([[B.x0 + 0.2, B.y - 0.42], [0, B.y - 0.5], [B.x1 - 0.2, B.y - 0.44], [0.9, B.y - 0.64], [0, B.y - 0.72], [-0.95, B.y - 0.66]], 5, true), { angle: 1.3, gap: 4, alpha: 0.4 });

  P.walk(L.main.x0, L.main.x1, L.main.y, { w: 5.2 });
  for (const s of L.soft) P.walk(s.x0, s.x1, s.y);
}

export function createShipSet(): StageSet {
  return makeSet({ id: 'ship', name: 'The Night Ship', far, near, parallax: 0.1 });
}
