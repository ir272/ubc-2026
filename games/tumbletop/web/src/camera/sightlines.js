// Sight lines for shot planning: a cheap analytic model of everything solid on and around the
// course (floors and the book stacks under them, rails, alphabet blocks, spinning-top bodies,
// metronome gantries and swinging weights, the finish arch, the big decor toys), built once from
// sim/course.js data. Cameras and the director ask it "can a lens at A see B?" a few dozen times a
// second while planning shots; nothing here touches the GPU or allocates per call.
import { COURSE } from '../../../sim/course.js';

// Rough half-extents (x/z) and height of the decor stand-ins, per unit scale.
const DECOR = {
  boardGameBox: [4.1, 2.1], diceStack: [1.3, 5.6], teddyBear: [2.6, 5.7], spinningTopPile: [3.6, 2.4],
  bookStack: [3.6, 5.3], marbleJar: [2.3, 5.6], pencilCup: [1.5, 7.2], deskLamp: [4.6, 5.6],
  crayonBox: [2.1, 4.6], metronomeCase: [1.8, 5.1], toyTrain: [2.6, 4.4], blockTower: [1.4, 9.6],
  globe: [2.4, 6.6], trophyShelf: [8.2, 3.2],
};

export function createSightlines(course = COURSE) {
  const floorY = course.floorY ?? (course.killY ?? -10) - 4;
  // floors: [x, halfWidth, z0, z1, y0, y1]; solid from the top down to the attic floor (the
  // renderer stacks books under every floor, so there is no seeing "under" the course)
  const slabs = [];
  for (const s of course.surfaces || []) slabs.push([s.x ?? 0, s.width / 2, s.z0, s.z1, s.y0, s.y1 ?? s.y0]);
  // boxes: [minX, minY, minZ, maxX, maxY, maxZ]
  const boxes = [];
  const addBox = (x0, y0, z0, x1, y1, z1) => boxes.push([x0, y0, z0, x1, y1, z1]);
  for (const w of course.walls || []) addBox(w.min.x, w.min.y, w.min.z, w.max.x, w.max.y, w.max.z);
  const pendulums = []; // [obstacle index, pivot x, y, z, length, radius]
  const marbles = []; // [obstacle index, radius, roll speed (m/s, toward -z)]
  const gantries = new Set();
  (course.obstacles || []).forEach((o, j) => {
    if ((o.type === 'block' || o.type === 'slider') && o.size) {
      const cy = o.pos?.y ?? o.y ?? 0, cx = o.pos?.x ?? o.x, cz = o.pos?.z ?? o.z;
      const lo = o.type === 'slider' ? cy : cy - o.size.y / 2;
      const px = o.size.x / 2 + (o.type === 'slider' ? (o.travel ?? 0) : 0), pz = o.size.z / 2;
      addBox(cx - px, lo, cz - pz, cx + px, lo + o.size.y, cz + pz);
    } else if (o.type === 'spinner' && o.style !== 'pencil') {
      const r = Math.max(1.7, (o.postRadius ?? 0.8) * 1.9), b = o.y ?? 0; // the lathe body bulges well past the post
      addBox(o.x - r, b, o.z - r, o.x + r, b + (o.height ?? 2.4), o.z + r);
    } else if (o.type === 'seesaw') {
      const hw = o.width / 2;
      addBox(o.x - hw, o.y - 0.3, o.z0, o.x + hw, o.y + 0.3, o.z1);
    } else if (o.type === 'marble') {
      marbles.push([j, (o.r ?? 0.6) * 1.15 + 0.15, o.speed ?? 6]);
    } else if (o.type === 'pendulum' && o.pivot) {
      pendulums.push([j, o.pivot.x, o.pivot.y, o.pivot.z, o.length, (o.bobRadius ?? 1) * 1.25]);
      if (!gantries.has(o.pivot.z)) {
        gantries.add(o.pivot.z);
        const p = o.pivot;
        addBox(-14, p.y, p.z - 0.4, 14, p.y + 0.75, p.z + 0.4);
        for (const sx of [-14, 14]) addBox(sx - 0.45, floorY, p.z - 0.45, sx + 0.45, p.y + 0.75, p.z + 0.45);
      }
    }
  });
  const f = course.finish;
  if (f) {
    const fw = f.width ?? 24, fh = f.archHeight ?? 6, fy = f.y ?? 0, fx = f.x ?? 0;
    for (const sx of [-1, 1]) {
      const px = fx + sx * (fw / 2 - 0.2);
      addBox(px - 0.75, fy, f.z - 0.75, px + 0.75, fy + fh + 1.8, f.z + 0.75);
    }
    addBox(fx - fw / 2, fy + fh - 0.8, f.z - 0.2, fx + fw / 2, fy + fh + 0.8, f.z + 0.2);
  }
  for (const d of course.decor || []) {
    const e = DECOR[d.kind];
    if (!e) continue;
    const sc = d.scale ?? 1, r = e[0] * sc;
    addBox(d.pos.x - r, floorY, d.pos.z - r, d.pos.x + r, d.pos.y + e[1] * sc, d.pos.z + r);
  }
  const B = new Float32Array(boxes.length * 6);
  boxes.forEach((b, i) => B.set(b, i * 6));
  const nB = boxes.length;
  const cand = new Int16Array(nB); // boxes overlapping the current ray's z range
  const bob = new Float32Array(pendulums.length * 4); // live bob centres + radius
  // live marbles: centre, radius, and how far (m, -z) they roll in the next ~0.7 s (a swept capsule)
  const mrb = new Float32Array(marbles.length * 5);
  let nMrb = 0;
  let bobTick = -1;

  /** Highest floor top under (x, z), or -Infinity over the void. */
  function topAt(x, z) {
    let top = -Infinity;
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      if (z < s[2] || z > s[3] || Math.abs(x - s[0]) > s[1]) continue;
      const y = s[4] + ((s[5] - s[4]) * (z - s[2])) / Math.max(1e-6, s[3] - s[2]);
      if (y > top) top = y;
    }
    return top;
  }

  function updateBobs(view) {
    if (!view || !view.obsQuat || view.tick === bobTick) return;
    bobTick = view.tick;
    for (let k = 0; k < pendulums.length; k++) {
      const p = pendulums[k], j = p[0];
      const qx = view.obsQuat[j * 4], qy = view.obsQuat[j * 4 + 1], qz = view.obsQuat[j * 4 + 2], qw = view.obsQuat[j * 4 + 3];
      // rotate (0, -L, 0) by q
      const L = -p[4];
      const tx = 2 * (-qz * L), tz = 2 * (qx * L); // t = 2 * cross(q.xyz, v), v = (0, L, 0)
      const ty = 0;
      const rx = qw * tx + (qy * tz - qz * ty), ry = L + qw * ty + (qz * tx - qx * tz), rz = qw * tz + (qx * ty - qy * tx);
      bob[k * 4] = p[1] + rx; bob[k * 4 + 1] = p[2] + ry; bob[k * 4 + 2] = p[3] + rz; bob[k * 4 + 3] = p[5];
    }
    nMrb = 0;
    for (let k = 0; k < marbles.length; k++) {
      const m = marbles[k], j = m[0];
      if (view.obsActive && !view.obsActive[j]) continue;
      const o = nMrb++ * 5;
      mrb[o] = view.obsPos[j * 3]; mrb[o + 1] = view.obsPos[j * 3 + 1]; mrb[o + 2] = view.obsPos[j * 3 + 2];
      mrb[o + 3] = m[1]; mrb[o + 4] = m[2] * 0.7;
    }
  }

  function solidIn(x, y, z, nc) {
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      if (z < s[2] || z > s[3] || Math.abs(x - s[0]) > s[1] || y < floorY) continue;
      const top = s[4] + ((s[5] - s[4]) * (z - s[2])) / Math.max(1e-6, s[3] - s[2]);
      if (y < top) return true;
    }
    for (let c = 0; c < nc; c++) {
      const o = cand[c] * 6;
      if (x > B[o] && x < B[o + 3] && y > B[o + 1] && y < B[o + 4] && z > B[o + 2] && z < B[o + 5]) return true;
    }
    if (bobTick >= 0) {
      for (let k = 0; k < pendulums.length; k++) {
        const dx = x - bob[k * 4], dy = y - bob[k * 4 + 1], dz = z - bob[k * 4 + 2], r = bob[k * 4 + 3];
        if (dx * dx + dy * dy + dz * dz < r * r) return true;
      }
      for (let k = 0; k < nMrb; k++) {
        // distance to the segment the marble rolls along next (down the ramp: -z, ~1:7.3 drop)
        const o = k * 5, r = mrb[o + 3], sw = mrb[o + 4];
        const px = x - mrb[o], py = y - mrb[o + 1], pz = z - mrb[o + 2];
        if (px * px > r * r || pz > r || pz < -sw - r) continue;
        const ey = -0.136 * sw, ez = -sw;
        let t = (py * ey + pz * ez) / (ey * ey + ez * ez);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qy = py - ey * t, qz = pz - ez * t;
        if (px * px + qy * qy + qz * qz < r * r) return true;
      }
    }
    return false;
  }

  function gather(z0, z1) {
    let nc = 0;
    for (let i = 0; i < nB; i++) if (B[i * 6 + 5] >= z0 && B[i * 6 + 2] <= z1) cand[nc++] = i;
    return nc;
  }

  /** Is the point inside anything solid (with a margin)? */
  function solidAt(x, y, z, view, margin = 0.6) {
    updateBobs(view);
    const nc = gather(z - margin - 1, z + margin + 1);
    if (solidIn(x, y, z, nc)) return true;
    // a lens needs a little air around it: probe a small cross
    return solidIn(x + margin, y, z, nc) || solidIn(x - margin, y, z, nc) || solidIn(x, y - margin, z, nc)
      || solidIn(x, y, z + margin, nc) || solidIn(x, y, z - margin, nc);
  }

  /**
   * Fraction (0..1) of the segment A->B that runs through solid stuff, sampled every ~0.35 m,
   * ignoring the last `skipEnd` metres (the target's own footing). 0 = clear line of sight.
   */
  function blocked(ax, ay, az, bx, by, bz, view, skipEnd = 0.7) {
    updateBobs(view);
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.5) return 0;
    const nc = gather(Math.min(az, bz) - 0.5, Math.max(az, bz) + 0.5);
    const n = Math.max(2, Math.ceil(len / 0.35));
    const tEnd = Math.max(0, 1 - skipEnd / len);
    let hit = 0, tot = 0;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (t > tEnd) break;
      tot++;
      if (solidIn(ax + dx * t, ay + dy * t, az + dz * t, nc)) hit++;
    }
    return tot ? hit / tot : 0;
  }

  return { topAt, solidAt, blocked, floorY };
}
