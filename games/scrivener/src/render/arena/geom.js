// Arena geometry: a one-point-perspective nave of ledger shelves. Owner: arena.
// The hall is a box seen from its open front. Front-plane coords are screen px at depth z = 0;
// a point at depth z projects with scale s = 1 / (1 + z) toward the vanishing point VP.

export const VP = { x: 640, y: 282 };
export const HALL = {
  L: -60,       // left wall, front-plane x
  R: 1340,      // right wall
  FLOOR: 600,   // floor, front-plane y (= GROUND_Y: the fighters' stage line)
  CEIL: -150,   // wall tops (vault springing line)
  VAULT: 300,   // vault rise above CEIL
  ZFAR: 1 / 0.24 - 1,   // depth of the far wall (s = 0.24)
  BAY: 0.42,    // depth of one shelf bay
};

export const sOf = (z) => 1 / (1 + z);

// project a front-plane point (x, y) at depth z
export function P(x, y, z) {
  const s = 1 / (1 + z);
  return [VP.x + (x - VP.x) * s, VP.y + (y - VP.y) * s];
}

// screen x on the floor plane -> front-plane x at depth z (inverse of P on x)
export function frontX(sx, z) {
  return VP.x + (sx - VP.x) * (1 + z);
}

// depth z of a floor point at screen y
export function floorZ(sy) {
  return (HALL.FLOOR - VP.y) / (sy - VP.y) - 1;
}

// pointed-arch profile in front-plane coords: points from (x0,y) over the apex to (x1,y).
// k: how far inside the span each arc centre sits (0 = round, 1 = equilateral lancet).
export function archPts(x0, x1, y, rise, n = 14, k = 0.6) {
  const hw = (x1 - x0) / 2, cx = (x0 + x1) / 2;
  const r = hw * (1 + k);
  const ox = x0 + r;
  const aEnd = Math.acos(-k / (1 + k));
  const sy = rise / (r * Math.sin(aEnd));
  const left = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI - aEnd) * (i / n);
    left.push([ox + Math.cos(a) * r, y - Math.sin(a) * r * sy]);
  }
  const pts = left.slice();
  for (let i = n - 1; i >= 0; i--) pts.push([2 * cx - left[i][0], left[i][1]]);
  return pts;
}

// convex hull (monotone chain)
export function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
