// Environment: the giant sunlit attic around the course, and how the whole frame is lit and
// finished.
//   - light: warm sun with a shadow map that follows the action (its footprint widens for wide
//     shots), a sky/floor hemisphere fill, and an image-based fill (PMREM of a small gradient
//     "attic" scene) so every standard material gets soft sky-coloured shadow sides and glossy
//     highlights that agree with each other.
//   - air: a custom fog (patched into three's fog chunks) that combines aerial-perspective
//     distance haze with sunlit dust pooling near the attic floor, glowing warmer toward the big
//     round gable windows at both ends of the course.
//   - set dressing: a painted-sky ceiling with cream rafters, pale floorboards with braided rugs,
//     giant toys on the floor, bunting draped from the tie beams, toy hot-air balloons hanging on
//     strings, skylights with light shafts and floating dust, and the course's decor anchors.
//     Everything static is merged into a handful of draw calls.
//   - post: HDR scene target, two-level bloom, gentle grade + vignette, neutral tone mapping.
//     the stage (stage.js) calls env.render(camera) instead of renderer.render.
// Purely visual: reads course data, never touches the sim. No time-dependent state, so captures
// stay pixel-deterministic.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- geometry helpers
function strip(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'color'].includes(k)) out.deleteAttribute(k);
  return out;
}
function paint(g, color) {
  const c = new THREE.Color(color);
  const out = strip(g);
  const n = out.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
// Per-triangle colour from a function of the triangle centroid (local space): gores, bands.
function paintBy(g, fn) {
  const out = strip(g);
  const p = out.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    c.set(fn(x, y, z));
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
// Soft-edged box: every prop reads as moulded plastic / painted wood, not a raw cube.
const box = (w, h, d, c, x = 0, y = 0, z = 0) => {
  const r = Math.min(0.45, 0.14 * Math.min(w, h, d));
  const g = r > 0.02 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z); return paint(g, c);
};
const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 16) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); return paint(g, c); };
const ball = (r, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 20, 14); g.scale(sx, sy, sz); g.translate(x, y, z); return paint(g, c); };
const torus = (R, r, c, x = 0, y = 0, z = 0) => { const g = new THREE.TorusGeometry(R, r, 10, 36); g.rotateX(Math.PI / 2); g.translate(x, y, z); return paint(g, c); };
const goresOf = (cols) => (x, y, z) => {
  const a = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
  return cols[Math.floor(a * cols.length * 2) % cols.length];
};

// Translate parts so their combined lowest point is at y=0 and centred on (x, z): props rest on
// whatever they stand on instead of hovering.
const _bb = new THREE.Box3(), _bb2 = new THREE.Box3();
function restOn(parts, x = 0, z = 0) {
  _bb.makeEmpty();
  for (const g of parts) { g.computeBoundingBox(); _bb.union(g.boundingBox); }
  const dx = x - (_bb.min.x + _bb.max.x) / 2, dz = z - (_bb.min.z + _bb.max.z) / 2;
  for (const g of parts) g.translate(dx, -_bb.min.y, dz);
  return parts;
}
const place = (parts, x, y, z, rotY = 0) => {
  restOn(parts, 0, 0);
  for (const g of parts) { g.rotateY(rotY); g.translate(x, y, z); }
  return parts;
};

// Deterministic visual-only PRNG.
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- canvas textures
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
function blobTexture() {
  return canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.55, 'rgba(0,0,0,0.6)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, false);
}
function glowTexture() {
  return canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    r.addColorStop(0.6, 'rgba(255,255,255,0.1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  }, false);
}
// Pale bleached floorboards running along the course: long boards, faint seams, low noise.
function floorTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = prng(11);
    const boards = 8, bw = w / boards;
    for (let i = 0; i < boards; i++) {
      const t = (r() - 0.5) * 10;
      g.fillStyle = `rgb(${236 + t},${200 + t},${152 + t})`;
      g.fillRect(i * bw, 0, bw, h);
      // a few long soft grain streaks
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(190,140,90,${0.03 + r() * 0.04})`;
        g.fillRect(i * bw + r() * bw, 0, 1 + r() * 2, h);
      }
      g.fillStyle = 'rgba(150,100,60,0.28)'; g.fillRect(i * bw, 0, 2, h);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(i * bw + 2, 0, 1, h);
      const j = r() * h; // butt joint
      g.fillStyle = 'rgba(150,100,60,0.22)'; g.fillRect(i * bw, j, bw, 2);
    }
  });
}
// The attic ceiling: boards painted as a sky by whoever owns this attic. Deeper blue toward the
// ridge, pale at the eaves, with big soft painted clouds. v=0 at the eave, v=1 at the ridge.
function ceilingTexture() {
  return canvasTex(1024, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#3fa4e6'); grd.addColorStop(0.5, '#7cc4ef'); grd.addColorStop(1, '#c9e8f6');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const r = prng(5);
    const puff = (cx, cy, s) => {
      for (let k = 0; k < 7; k++) {
        const px = cx + (k - 3) * s * 0.55 + (r() - 0.5) * s * 0.3, py = cy + (r() - 0.6) * s * 0.35 - Math.cos((k - 3) / 3) * s * 0.25;
        const rr = s * (0.42 + r() * 0.3);
        for (const dx of [-w, 0, w]) {
          const rg = g.createRadialGradient(px + dx, py, 0, px + dx, py, rr);
          rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.7, 'rgba(255,255,255,0.75)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = rg; g.beginPath(); g.arc(px + dx, py, rr, 0, Math.PI * 2); g.fill();
        }
      }
    };
    for (let i = 0; i < 9; i++) puff((i + 0.2 + r() * 0.6) * w / 9, 50 + ((i * 0.37) % 1) * 400, 40 + r() * 40);
    // board seams parallel to the ridge
    for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(40,80,120,0.10)'; g.fillRect(0, y, w, 1); }
  });
}
// Gable plaster: warm cream with faint vertical boards.
function gableTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#fbefe0'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(170,120,80,0.10)'; g.fillRect(x, 0, 1, h); }
  });
}

// ---------------------------------------------------------------- props
// A stack of giant hardback books from the attic floor up to height h (base y=0), footprint w x d.
const BOOK_COLS = ['#ff6f91', '#4ea8ff', '#ffc24b', '#3fd0b6', '#9a7bff', '#ff9a52', '#5fe08f', '#f25f5c'];
function bookStackTo(h, w, d, seed) {
  const parts = [];
  const n = Math.max(2, Math.round(h / 2.4));
  const th = h / n;
  for (let k = 0; k < n; k++) {
    const rr = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
    const f = rr - Math.floor(rr);
    const bw = w * (1.02 + 0.1 * f), bd = d * (1.04 + 0.08 * (1 - f));
    const y = k * th, cover = Math.min(0.28, th * 0.12);
    const col = BOOK_COLS[(seed * 3 + k) % BOOK_COLS.length];
    const book = [
      box(bw, cover, bd, col, 0, y + cover / 2, 0),
      box(bw, cover, bd, col, 0, y + th - cover / 2, 0),
      box(cover * 1.6, th, bd, col, -bw / 2 + cover * 0.8, y + th / 2, 0),
      box(bw - cover * 2.2, th - cover * 2, bd - cover * 1.2, '#fbf3e2', cover * 0.4, y + th / 2, 0),
    ];
    const rot = (f - 0.5) * 0.16 + (k % 2 ? Math.PI : 0);
    for (const g of book) { g.rotateY(rot); parts.push(g); }
  }
  return parts;
}

// Stand-in props for the course's decor anchors (unit scale, base at y=0).
const PROPS = {
  boardGameBox: () => [box(8, 1.6, 6, '#4b8dff', 0, 0.8), box(8.2, 0.5, 6.2, '#ffcf48', 0, 1.75), box(3, 0.06, 2, '#ffffff', 0, 2.03)],
  diceStack: () => [box(2, 2, 2, '#ffffff', 0, 1), box(2, 2, 2, '#ff6688', 0.3, 3, 0.2), box(1.6, 1.6, 1.6, '#ffffff', -0.2, 4.8, -0.1)],
  teddyBear: () => [ball(1.8, '#d79a62', 0, 1.8, 0, 1, 1.1, 0.9), ball(1.25, '#d79a62', 0, 4.2), ball(0.45, '#b77a48', -1, 5.2), ball(0.45, '#b77a48', 1, 5.2),
    ball(0.55, '#f2d2ab', 0, 3.9, 1.05, 1, 0.8, 0.6), ball(0.6, '#d79a62', -1.8, 2.2, 0.4), ball(0.6, '#d79a62', 1.8, 2.2, 0.4), ball(0.7, '#d79a62', -0.9, 0.5, 1), ball(0.7, '#d79a62', 0.9, 0.5, 1),
    ball(0.16, '#2a2233', -0.42, 4.45, 1.1), ball(0.16, '#2a2233', 0.42, 4.45, 1.1), ball(0.2, '#5a3a2a', 0, 4.05, 1.55)],
  spinningTopPile: () => {
    const top = (r, h, c, cHandle) => [cyl(r, 0.2, h, c, 0, 0, 0, 20), cyl(r * 1.02, r * 1.02, h * 0.18, '#ffffff', 0, h * 0.42, 0, 20), cyl(0.18, 0.18, h * 0.5, cHandle, 0, h * 0.75, 0, 8)];
    const tipped = (parts, tilt, yaw, x, z) => {
      for (const g of parts) { g.rotateZ(tilt); g.rotateY(yaw); }
      return restOn(parts, x, z);
    };
    const stand = restOn(top(1.6, 1.6, '#8c6cff', '#ffcf48'), 0, 0);
    const green = tipped(top(1.3, 1.3, '#4fe09a', '#ff9a52'), -0.86, 0.35, 2.15, 0.7);
    const red = tipped(top(1.1, 1.1, '#ff6688', '#4fc8ff'), 0.86, -0.5, -1.95, -0.75);
    return [...stand, ...green, ...red];
  },
  marbleJar: () => [cyl(2.2, 2.2, 5, '#cdeeff', 0, 2.5, 0, 24), cyl(2.3, 2.3, 0.6, '#ff9a52', 0, 5.3, 0, 24), ball(0.6, '#ff6688', 0.8, 0.8, 0.9), ball(0.6, '#4fc8ff', -0.9, 0.8, 0.5), ball(0.6, '#ffcf48', 0.1, 1.9, -0.6)],
  bookStack: () => [box(7, 1.4, 5, '#ff6f91', 0, 0.7), box(6.6, 1.2, 4.6, '#4ea8ff', 0.3, 2.0, 0.1), box(6.8, 1.6, 4.8, '#ffc24b', -0.2, 3.4), box(6.2, 1.1, 4.4, '#3fd0b6', 0.1, 4.75)],
  pencilCup: () => [cyl(1.4, 1.2, 3.2, '#ff9a52', 0, 1.6, 0, 20), cyl(0.18, 0.18, 6, '#ffcf48', 0.4, 4, 0.2, 6), cyl(0.18, 0.18, 6.4, '#4b8dff', -0.5, 4.2, -0.2, 6), cyl(0.18, 0.18, 5.6, '#4fe09a', 0.1, 3.8, -0.6, 6)],
  deskLamp: () => [cyl(1.6, 1.8, 0.4, '#3a4256', 0, 0.2), box(0.35, 5, 0.35, '#3a4256', 0, 2.7), box(0.35, 0.35, 4, '#3a4256', 0, 5.2, 1.8), cyl(0.4, 1.6, 1.6, '#ff6688', 0, 4.6, 3.8, 20)],
  crayonBox: () => [box(4, 3.4, 1.4, '#ffcf48', 0, 1.7), box(4.02, 1, 1.44, '#4fe09a', 0, 2.2), cyl(0.3, 0.3, 1.2, '#ff6688', -1.2, 4, 0, 8), cyl(0.3, 0.3, 1.2, '#4b8dff', -0.4, 4, 0, 8), cyl(0.3, 0.3, 1.2, '#8c6cff', 0.4, 4, 0, 8), cyl(0.3, 0.3, 1.2, '#ff9a52', 1.2, 4, 0, 8)],
  metronomeCase: () => [cyl(0.4, 1.8, 5, '#9a6be0', 0, 2.5, 0, 4), box(0.15, 4, 0.15, '#eeeeee', 0, 3, 0.9)],
  toyTrain: () => [box(5, 2, 2.4, '#ff6688', 0, 1.5), box(2, 2.2, 2.4, '#4b8dff', -1.6, 3.3), cyl(0.5, 0.5, 1.2, '#3a4256', 1.6, 3.1), ...[-1.8, 0, 1.8].flatMap((x) => { const g = new THREE.CylinderGeometry(0.6, 0.6, 2.6, 16); g.rotateX(Math.PI / 2); g.translate(x, 0.6, 0); return [paint(g, '#ffcf48')]; })],
  blockTower: () => [box(2.4, 2.4, 2.4, '#4fc8ff', 0, 1.2), box(2.4, 2.4, 2.4, '#ffcf48', 0.2, 3.6), box(2.4, 2.4, 2.4, '#ff6688', -0.1, 6), box(2.4, 2.4, 2.4, '#4fe09a', 0.1, 8.4)],
  globe: () => [cyl(1.2, 1.4, 0.4, '#9a6a3b', 0, 0.2), box(0.25, 2.2, 0.25, '#9a6a3b', 0, 1.3), ball(2.2, '#4fc8ff', 0, 4.4), ball(1.2, '#4fe09a', 1.1, 5.1, 1.2, 1, 0.7, 0.5)],
  trophyShelf: () => [box(16, 0.6, 3, '#c07a44', 0, 0.3), cyl(1.2, 0.6, 2.4, '#ffd23f', -4, 1.8), cyl(1.0, 0.5, 2, '#dde2ea', 0, 1.6), cyl(0.9, 0.5, 1.8, '#e0a565', 4, 1.5)],
  atticWindow: () => [],
  roofBeam: () => [],
};

// Block letters as bars [cx, cy, w, h] in a unit face (-0.5..0.5).
const LETTERS = {
  T: [[0, 0.4, 1, 0.2], [0, -0.1, 0.22, 0.8]],
  E: [[-0.39, 0, 0.22, 1], [0.1, 0.4, 0.8, 0.2], [0.05, 0, 0.7, 0.2], [0.1, -0.4, 0.8, 0.2]],
  H: [[-0.39, 0, 0.22, 1], [0.39, 0, 0.22, 1], [0, 0, 0.6, 0.2]],
};

// ---- giant floor toys (unit: metres, base at y=0)
const FLOOR_TOYS = {
  ringStacker: (s) => {
    const cols = ['#ff6688', '#ff9a52', '#ffcf48', '#5fe08f', '#4fc8ff', '#9a7bff'];
    const parts = [cyl(9 * s, 10 * s, 3 * s, '#fff2dc', 0, 1.5 * s, 0, 32), cyl(1.6 * s, 2.2 * s, 30 * s, '#fff2dc', 0, 16 * s, 0, 16), ball(3 * s, '#ff6688', 0, 32 * s, 0)];
    let y = 3 * s;
    for (let i = 0; i < cols.length; i++) {
      const R = (7.5 - i * 0.9) * s, r = (2.3 - i * 0.12) * s;
      parts.push(torus(R, r, cols[i], 0, y + r, 0));
      y += r * 2;
    }
    return parts;
  },
  beachBall: (s) => { const g = new THREE.SphereGeometry(14 * s, 36, 24); g.translate(0, 14 * s, 0); return [paintBy(g, goresOf(['#ffffff', '#ff6f91', '#ffffff', '#ffcf48', '#ffffff', '#4fc8ff']))]; },
  letterBlocks: (s) => {
    // painted wooden alphabet blocks: coloured frame, cream face panel, raised letter on each side
    const block = (c, letterCol, ch, x, y, z, ry) => {
      const S = 16 * s, P = S * 0.74, t = 0.5 * s;
      const parts = [box(S, S, S, c, 0, S / 2, 0)];
      for (let k = 0; k < 4; k++) {
        const face = [box(P, P, t, '#fff6e6', 0, S / 2, S / 2)];
        for (const [bx, by, bw, bh] of LETTERS[ch]) face.push(box(bw * P * 0.8, bh * P * 0.8, t * 1.8, letterCol, bx * P * 0.8, S / 2 + by * P * 0.8, S / 2 + t * 0.5));
        for (const g of face) { g.rotateY(k * Math.PI / 2); parts.push(g); }
      }
      parts.push(box(P, t, P, '#fff6e6', 0, S, 0));
      for (const g of parts) { g.rotateY(ry); g.translate(x, y, z); }
      return parts;
    };
    return [...block('#4fc8ff', '#ff6688', 'T', 0, 0, 0, 0.2), ...block('#ff6688', '#4b8dff', 'E', 17 * s, 0, 4 * s, -0.3), ...block('#ffcf48', '#5fe08f', 'H', 8 * s, 16 * s, 2 * s, 0.6)];
  },
  drum: (s) => {
    const g = new THREE.CylinderGeometry(13 * s, 13 * s, 16 * s, 40, 1, true); g.translate(0, 9 * s, 0);
    const body = paintBy(g, (x, y, z) => { const a = Math.atan2(z, x); const zz = (y - 9 * s) / (8 * s); return (Math.abs(zz) < (Math.cos(a * 8) * 0.5)) ? '#ffffff' : '#ff6688'; });
    return [body, cyl(13.6 * s, 13.6 * s, 2 * s, '#ffcf48', 0, 1 * s, 0, 40), cyl(13.6 * s, 13.6 * s, 2 * s, '#ffcf48', 0, 17 * s, 0, 40), cyl(13 * s, 13 * s, 0.4 * s, '#fff6e6', 0, 17.9 * s, 0, 40)];
  },
  crayons: (s) => {
    const crayon = (c, ang, dx, dz) => {
      const L = 40 * s, R = 2.4 * s;
      const parts = [cyl(R, R, L, c, 0, 0, 0, 12), cyl(R * 1.04, R * 1.04, L * 0.5, '#fff6e6', 0, 0, 0, 12), cyl(R * 1.05, R * 1.05, L * 0.42, c, 0, 0, 0, 12), cyl(0.5 * s, R, 6 * s, c, 0, L / 2 + 3 * s, 0, 12)];
      for (const g of parts) { g.rotateZ(Math.PI / 2); g.rotateY(ang); g.translate(dx, R, dz); }
      return parts;
    };
    return [...crayon('#4b8dff', 0.15, 0, 0), ...crayon('#ff6688', -0.1, 2 * s, 6 * s), ...crayon('#5fe08f', 0.4, -4 * s, -6 * s)];
  },
  bigTop: (s) => [cyl(14 * s, 0.6 * s, 13 * s, '#9a7bff', 0, 6.5 * s, 0, 32), cyl(14.3 * s, 14.3 * s, 2.6 * s, '#ffcf48', 0, 11 * s, 0, 32), cyl(13 * s, 13 * s, 1.2 * s, '#fff6e6', 0, 12.8 * s, 0, 32), cyl(1.4 * s, 1.4 * s, 10 * s, '#ff6688', 0, 18 * s, 0, 12)],
  lyingBooks: (s) => [box(46 * s, 9 * s, 30 * s, '#4ea8ff', 0, 4.5 * s, 0), box(44 * s, 7 * s, 28 * s, '#ffc24b', 2 * s, 12.5 * s, 1 * s), box(42 * s, 8 * s, 29 * s, '#ff6f91', -1 * s, 20 * s, 0)],
};

// Toy hot-air balloon (envelope with gores, basket, ropes), hanging from a string. Origin at the
// top of the envelope.
function balloonToy(R, cols, ropeLen) {
  const g = new THREE.SphereGeometry(R, 24, 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { // teardrop: narrow the lower half
    const y = p.getY(i) / R;
    if (y < 0) { const k = 1 + y * 0.45; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, p.getY(i) * 1.15); }
  }
  g.computeVertexNormals();
  g.translate(0, -R, 0);
  const parts = [paintBy(g, goresOf(cols))];
  const by = -R * 2.15 - R * 0.7;
  parts.push(cyl(R * 0.3, R * 0.24, R * 0.35, cols[1], 0, -R * 2.15 - R * 0.05, 0, 12));
  parts.push(box(R * 0.42, R * 0.32, R * 0.42, '#c98a4e', 0, by, 0));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const rope = new THREE.CylinderGeometry(0.06, 0.06, R * 0.6, 4);
    rope.translate(sx * R * 0.17, by + R * 0.42, sz * R * 0.17);
    parts.push(paint(rope, '#7a5a3a'));
  }
  const s = new THREE.CylinderGeometry(0.07, 0.07, ropeLen, 4); s.translate(0, ropeLen / 2, 0);
  parts.push(paint(s, '#f4ecdf'));
  return parts;
}

// ---------------------------------------------------------------- fog (aerial perspective + floor haze)
function lin(hex) { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; }
function installFog(floorY) {
  const C = THREE.ShaderChunk;
  if (C.__ttFog) return;
  C.__ttFog = true;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogWorld;\n#endif\n';
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogWorld = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;\n#endif\n';
  C.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld;\n#ifdef FOG_EXP2\n uniform float fogDensity;\n#else\n uniform float fogNear; uniform float fogFar;\n#endif\n#endif\n';
  C.fog_fragment = `#ifdef USE_FOG
  {
    vec3 fRay = vFogWorld - cameraPosition;
    float fLen = max(length(fRay), 1e-3);
    vec3 fDir = fRay / fLen;
    #ifdef FOG_EXP2
      float dOD = fogDensity * fogDensity * fLen * fLen;
    #else
      float dOD = pow(max(fLen - fogNear, 0.0) / max(fogFar - fogNear, 1.0), 1.6);
    #endif
    // dusty air pooling toward the attic floor: density a*exp(-b*(y - y0)), integrated along the ray
    const float HB = 0.12;
    float hc = 0.010 * exp(-HB * (cameraPosition.y - (${floorY.toFixed(2)})));
    float dy = fRay.y * HB;
    float hOD = hc * fLen * (abs(dy) > 1e-3 ? (1.0 - exp(-dy)) / dy : 1.0);
    hOD = min(hOD, 4.0);
    float fogFactor = min(1.0 - exp(-(dOD + hOD)), 0.985);
    float hw = hOD / (dOD + hOD + 1e-4);
    vec3 fc = mix(fogColor, ${lin('#f7d3d6')}, hw * 0.8);
    // light from the round gable windows scatters in the haze along the course axis
    float glow = pow(abs(fDir.z), 10.0) * smoothstep(-0.35, 0.25, fDir.y);
    fc = mix(fc, ${lin('#fff6e8')} * 1.25, glow * 0.65);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fc, fogFactor);
  }
#endif
`;
}

// ---------------------------------------------------------------- post-processing
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function createPost(renderer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(geo);
  quad.frustumCulled = false;
  const pScene = new THREE.Scene(); pScene.add(quad);
  const pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const rtScene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const q1 = new THREE.WebGLRenderTarget(4, 4, rtOpts), q2 = new THREE.WebGLRenderTarget(4, 4, rtOpts);
  const e1 = new THREE.WebGLRenderTarget(4, 4, rtOpts), e2 = new THREE.WebGLRenderTarget(4, 4, rtOpts);
  const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const bright = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    vec3 tap(vec2 o){ vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; float l = max(c.r, max(c.g, c.b)); return c * smoothstep(1.2, 2.4, l); }
    void main(){ vec3 c = tap(vec2(-1.0,-1.0)) + tap(vec2(1.0,-1.0)) + tap(vec2(-1.0,1.0)) + tap(vec2(1.0,1.0)); gl_FragColor = vec4(c * 0.25, 1.0); }`,
  { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const down = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tSrc, vUv + vec2(-1.0,-1.0)*uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0,-1.0)*uTexel).rgb
      + texture2D(tSrc, vUv + vec2(-1.0,1.0)*uTexel).rgb + texture2D(tSrc, vUv + vec2(1.0,1.0)*uTexel).rgb; gl_FragColor = vec4(c * 0.25, 1.0); }`,
  { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const blur = mk(`uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
      c += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
      c += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(c, 1.0); }`,
  { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const comp = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    uniforms: { tScene: { value: rtScene.texture }, tB1: { value: q1.texture }, tB2: { value: e1.texture }, uAspect: { value: 16 / 9 } },
    fragmentShader: `uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2; uniform float uAspect; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tScene, vUv).rgb;
        vec3 b = texture2D(tB1, vUv).rgb * 0.55 + texture2D(tB2, vUv).rgb * 0.75;
        c += b * 0.35;
        // grade: a touch more saturation, warm lift in the darks
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, 1.18);
        c = 0.2 * pow(max(c, 0.0) / 0.2, vec3(1.08));
        c += vec3(0.012, 0.006, 0.0) * (1.0 - smoothstep(0.0, 0.25, l));
        // soft vignette
        vec2 d = vUv - 0.5; d.x *= uAspect;
        c *= mix(0.84, 1.0, smoothstep(0.95, 0.4, length(d)));
        gl_FragColor = vec4(max(c, 0.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  let W = 0, H = 0;
  const size = new THREE.Vector2();
  function resize(w, h) {
    W = w; H = h;
    // GPU guard for Retina-sized canvases: the HDR scene target is capped at ~2.1 MP (the
    // composite upsamples it); below that it renders at full resolution.
    const k = Math.min(1, Math.sqrt(2.1e6 / (w * h)));
    rtScene.setSize(Math.round(w * k), Math.round(h * k));
    const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
    const ew = Math.max(1, Math.round(w / 12)), eh = Math.max(1, Math.round(h / 12));
    q1.setSize(qw, qh); q2.setSize(qw, qh); e1.setSize(ew, eh); e2.setSize(ew, eh);
    comp.uniforms.uAspect.value = w / h;
  }
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(pScene, pCam); }
  function render(scene, camera) {
    renderer.getDrawingBufferSize(size);
    if (size.x !== W || size.y !== H) resize(size.x, size.y);
    const info = renderer.info;
    info.autoReset = false; info.reset(); // count the whole frame: scene + post passes
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    bright.uniforms.tSrc.value = rtScene.texture; bright.uniforms.uTexel.value.set(1 / rtScene.width, 1 / rtScene.height);
    pass(bright, q1);
    blur.uniforms.tSrc.value = q1.texture; blur.uniforms.uDir.value.set(1 / q1.width, 0); pass(blur, q2);
    blur.uniforms.tSrc.value = q2.texture; blur.uniforms.uDir.value.set(0, 1 / q1.height); pass(blur, q1);
    down.uniforms.tSrc.value = q1.texture; down.uniforms.uTexel.value.set(1 / q1.width, 1 / q1.height); pass(down, e1);
    blur.uniforms.tSrc.value = e1.texture; blur.uniforms.uDir.value.set(1 / e1.width, 0); pass(blur, e2);
    blur.uniforms.tSrc.value = e2.texture; blur.uniforms.uDir.value.set(0, 1 / e1.height); pass(blur, e1);
    pass(comp, null);
  }
  /** Link the programs `object`'s materials will need when drawn into the HDR scene target (the
   *  key differs from drawing to the screen: no tone mapping, linear output). */
  function compile(object, scene, camera) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rtScene);
    try { renderer.compile(object, camera, scene); } finally { renderer.setRenderTarget(prev); }
  }
  function dispose() {
    for (const rt of [rtScene, q1, q2, e1, e2]) rt.dispose();
    for (const m of [bright, down, blur, comp]) m.dispose();
    geo.dispose();
  }
  return { render, compile, dispose };
}

// ---------------------------------------------------------------- image-based fill
function createEnvMap(renderer) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#8ccaf2') }, mid: { value: new THREE.Color('#fdebd9') }, low: { value: new THREE.Color('#f0d3ae') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.05, 0.7, h)) : mix(mid, low, smoothstep(0.0, 0.35, -h));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  s.add(dome);
  // bright windows for glossy highlights: the two gable ends and a skylight toward the sun
  const win = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.8, 4.4) });
  for (const z of [-1, 1]) { const m = new THREE.Mesh(new THREE.CircleGeometry(10, 24), win); m.position.set(0, 8, z * 46); m.lookAt(0, 0, 0); s.add(m); }
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(16, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 6.8, 6.2) }));
  sky.position.set(26, 38, -18); sky.lookAt(0, 0, 0); s.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt.texture;
}

// ---------------------------------------------------------------- environment
export function createEnvironment(scene, renderer, course, T) {
  const startZ = course.startZ ?? 0, finishZ = course.finish?.z ?? 330;
  const midZ = (startZ + finishZ) / 2;
  const floorY = course.floorY ?? (course.killY ?? -10) - 4;

  installFog(floorY);
  scene.fog = new THREE.Fog(0xfcdcc8, 70, 520);
  scene.background = new THREE.Color(0xfcdcc8);
  scene.environment = createEnvMap(renderer);
  scene.environmentIntensity = 0.42;

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xc9e2ff, 0xf6d2ae, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1de, 3.0);
  const sunDir = new THREE.Vector3(0.55, 1.0, -0.42).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S0 = 24;
  Object.assign(sun.shadow.camera, { left: -S0, right: S0, top: S0, bottom: -S0, near: 1, far: 240 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffd9ec, 0.4); // soft pink back fill (no shadows)
  fill.position.set(-30, 18, 60);
  scene.add(fill);

  // ---- attic shell: floor, painted-sky ceiling, cream rafters, gable walls with round windows
  const shell = [];
  const ridgeY = 110, eaveX = 150, z0 = startZ - 220, z1 = finishZ + 220, L = z1 - z0;
  const ang = Math.atan2(ridgeY - floorY, eaveX);
  const run = Math.hypot(eaveX, ridgeY - floorY);
  const roofYAt = (x) => floorY + (ridgeY - floorY) * (1 - Math.min(1, Math.abs(x) / eaveX));

  const floorTex = floorTexture(); floorTex.repeat.set(40, 90);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 900), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.72, color: 0xffffff }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, floorY, midZ);
  floor.receiveShadow = true;
  scene.add(floor);

  // ceiling planes with UVs: u along z, v from eave (0) to ridge (1)
  const ceilTex = ceilingTexture(); ceilTex.repeat.set(L / 150, 1); ceilTex.wrapT = THREE.ClampToEdgeWrapping;
  const roofParts = [];
  for (const sx of [-1, 1]) {
    const roof = new THREE.BufferGeometry();
    const P = [0, ridgeY, z0, 0, ridgeY, z1, sx * eaveX, floorY, z1, sx * eaveX, floorY, z0];
    roof.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    roof.setAttribute('uv', new THREE.Float32BufferAttribute(sx > 0 ? [0, 1, 1, 1, 1, 0, 0, 0] : [1, 1, 0, 1, 0, 0, 1, 0], 2));
    roof.setIndex(sx > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    roof.computeVertexNormals();
    roofParts.push(roof);
  }
  const ceiling = new THREE.Mesh(mergeGeometries(roofParts, false), new THREE.MeshBasicMaterial({ map: ceilTex, color: new THREE.Color(0.92, 0.92, 0.92), side: THREE.DoubleSide }));
  scene.add(ceiling);
  for (const sx of [-1, 1]) {
    for (let z = z0 + 18; z < z1; z += 27) {
      const r = new THREE.BoxGeometry(run, 2.6, 2.6);
      r.rotateZ(sx > 0 ? -ang : ang);
      r.translate(sx * eaveX / 2, (ridgeY + floorY) / 2 - 1.8, z);
      shell.push(paint(r, '#fff3e3'));
    }
    // a low knee wall where the roof meets the floor
    shell.push(box(6, 9, L, '#ffe2c8', sx * (eaveX - 12), floorY + 4.5, (z0 + z1) / 2));
  }
  const ridge = new THREE.BoxGeometry(5, 5, L); ridge.translate(0, ridgeY - 3, (z0 + z1) / 2); shell.push(paint(ridge, '#ffeedd'));
  // tie beams across the attic, each carrying a garland of bunting
  const tieY = 62, tieHalfX = eaveX * (1 - (tieY - floorY) / (ridgeY - floorY)) + 2, tieT = 2.6;
  const tieZs = [];
  for (let z = z0 + 45; z < z1 - 20; z += 54) { tieZs.push(z); shell.push(box(tieHalfX * 2, tieT, tieT, '#fff3e3', 0, tieY, z)); }

  // gable walls with a big round window at each end of the course
  const gTex = gableTexture(); gTex.repeat.set(0.05, 0.05);
  const winR = 30, winY = floorY + 58;
  const gableGeo = [];
  for (const z of [z0, z1]) {
    const shape = new THREE.Shape([new THREE.Vector2(-eaveX, floorY), new THREE.Vector2(eaveX, floorY), new THREE.Vector2(0, ridgeY)]);
    const hole = new THREE.Path(); hole.absarc(0, winY, winR, 0, Math.PI * 2, true); shape.holes.push(hole);
    const gw = new THREE.ShapeGeometry(shape, 48); gw.translate(0, 0, z);
    gableGeo.push(gw);
    const fz = z + (z === z0 ? 1.2 : -1.2);
    const frame = new THREE.TorusGeometry(winR + 0.8, 2.2, 10, 64); frame.translate(0, winY, fz); shell.push(paint(frame, '#ffffff'));
    const inner = new THREE.TorusGeometry(winR * 0.42, 1.0, 8, 48); inner.translate(0, winY, fz); shell.push(paint(inner, '#ffffff'));
    for (let k = 0; k < 4; k++) {
      const bar = new THREE.BoxGeometry(1.6, winR * 2, 1.6); bar.rotateZ(k * Math.PI / 4); bar.translate(0, winY, fz); shell.push(paint(bar, '#ffffff'));
    }
  }
  const gable = new THREE.Mesh(mergeGeometries(gableGeo, false), new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.9, side: THREE.DoubleSide }));
  scene.add(gable);
  const paneGeo = [];
  for (const z of [z0, z1]) { const pg = new THREE.CircleGeometry(winR + 0.5, 64); pg.translate(0, winY, z + (z === z0 ? -0.5 : 0.5)); paneGeo.push(strip(pg)); }

  // Interior clearance for cameras: highest y a lens may sit at (x, z) and still be inside the attic,
  // under the roof planes and below the tie beams (and their bunting), with a margin.
  const CAM_MARGIN = 5;
  const beamCeil = tieY - tieT / 2 - CAM_MARGIN;
  const ceilingY = (x, z) => {
    let c = roofYAt(x) - CAM_MARGIN;
    if (Math.abs(x) < tieHalfX + CAM_MARGIN && beamCeil < c) c = beamCeil;
    return c;
  };
  const interior = { ceilingY, minX: -eaveX + 20, maxX: eaveX - 20, minZ: z0 + 10, maxZ: z1 - 10, floorY };

  // ---- floor: braided rugs under the course (big soft colour shapes far below the playfield)
  const RUG_T = 0.12;
  const rugCols = [['#8d7cf2', '#8d7cf2', '#ff8f7a', '#8d7cf2', '#ffd36b'], ['#3fc6b8', '#3fc6b8', '#ffd36b', '#3fc6b8', '#ff8fb1'], ['#ff8f7a', '#ff8f7a', '#fff1dc', '#ff8f7a', '#8d7cf2']];
  const rugs = [[6, startZ + 25, 46, 1.35, 0], [-8, startZ + 140, 42, 1.5, 1], [10, startZ + 255, 44, 1.4, 2], [-4, finishZ + 70, 40, 1.3, 0]];
  const rugGeo = [];
  for (const [x, z, R, ez, ci] of rugs) {
    const cols = rugCols[ci];
    const rings = 10;
    for (let i = 0; i < rings; i++) {
      const g = new THREE.RingGeometry(i === 0 ? 0 : R * i / rings, R * (i + 1) / rings, 72, 1);
      g.rotateX(-Math.PI / 2); g.scale(1, 1, ez); g.translate(x, floorY + RUG_T, z);
      rugGeo.push(paint(g, i < 5 ? cols[0] : cols[(i - 4) % cols.length]));
    }
    const edge = new THREE.TorusGeometry(R, 0.5, 6, 72); edge.rotateX(Math.PI / 2); edge.scale(1, 1, ez); edge.translate(x, floorY + 0.1, z); rugGeo.push(paint(edge, cols[0]));
  }
  const rugMesh = new THREE.Mesh(mergeGeometries(rugGeo, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  rugMesh.receiveShadow = true;
  scene.add(rugMesh);

  // ---- giant toys on the attic floor, kept clear of the course corridor
  const far = [], near = []; // far: floor toys (no shadow casting); near: decor by the course
  const floorToys = [
    ['ringStacker', -72, startZ + 10, 1.1, 0],
    ['beachBall', 78, startZ + 55, 1.0, 0.4],
    ['letterBlocks', -92, midZ - 40, 1.0, 0.3],
    ['drum', 88, midZ + 20, 1.0, 0],
    ['bigTop', 96, midZ - 80, 1.0, 0],
    ['crayons', -70, finishZ - 30, 1.0, 0.25],
    ['lyingBooks', -100, midZ + 110, 1.0, 0.1],
    ['ringStacker', 76, finishZ + 40, 0.9, 0],
    ['beachBall', -64, finishZ + 110, 0.9, 0],
    ['letterBlocks', 60, startZ - 120, 0.9, -0.4],
    ['beachBall', -30, startZ - 110, 1.1, 0],
    ['drum', -88, startZ - 60, 0.9, 0],
  ];
  const blobs = []; // [x, y, z, radiusX, radiusZ]
  for (const [kind, x, z, s, ry] of floorToys) {
    const parts = place(FLOOR_TOYS[kind](s), x, floorY + RUG_T, z, ry);
    _bb2.makeEmpty();
    for (const g of parts) { g.computeBoundingBox(); _bb2.union(g.boundingBox); far.push(g); }
    blobs.push([(_bb2.min.x + _bb2.max.x) / 2, floorY + RUG_T, (_bb2.min.z + _bb2.max.z) / 2, (_bb2.max.x - _bb2.min.x) * 0.62, (_bb2.max.z - _bb2.min.z) * 0.62]);
  }

  // ---- course decor anchors. Every prop rests on something: a course surface right under it,
  // the attic floor, or (when its anchor is in mid-air) a stack of giant books from the floor.
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const windows = [];
  const surfaceTopAt = (x, z, y) => {
    for (const sf of course.surfaces || []) {
      if (z < sf.z0 || z > sf.z1 || Math.abs(x - (sf.x ?? 0)) > (sf.width ?? 0) / 2) continue;
      const top = sf.kind === 'ramp' ? sf.y0 + (sf.y1 - sf.y0) * (z - sf.z0) / (sf.z1 - sf.z0) : sf.y1;
      if (Math.abs(top - y) < 0.35) return top;
    }
    return null;
  };
  let stackSeed = 0;
  for (const d of course.decor || []) {
    if (d.kind === 'atticWindow') { windows.push(d); continue; }
    const make = PROPS[d.kind];
    if (!make) continue;
    const parts = make();
    if (!parts.length) continue;
    restOn(parts, 0, 0);
    q.setFromAxisAngle(v.set(0, 1, 0), d.rotY ?? 0);
    m4.compose(v.set(d.pos.x, 0, d.pos.z), q, s.setScalar(d.scale ?? 1));
    _bb2.makeEmpty();
    for (const g of parts) { g.applyMatrix4(m4); g.computeBoundingBox(); _bb2.union(g.boundingBox); }
    const fw = _bb2.max.x - _bb2.min.x, fd = _bb2.max.z - _bb2.min.z;
    const cx = (_bb2.min.x + _bb2.max.x) / 2, cz = (_bb2.min.z + _bb2.max.z) / 2;
    let baseY = d.pos.y;
    const onSurface = surfaceTopAt(cx, cz, baseY);
    if (onSurface != null) baseY = onSurface;
    else if (baseY - floorY > 0.3) {
      const sw = fw + 1.6, sd = fd + 1.6, h = baseY - floorY - RUG_T;
      const stack = bookStackTo(h, sw, sd, stackSeed++);
      for (const g of stack) { g.translate(cx, floorY + RUG_T, cz); near.push(g); }
      blobs.push([cx, floorY + RUG_T, cz, sw * 0.85, sd * 0.85]);
    } else baseY = floorY + RUG_T;
    for (const g of parts) { g.translate(0, baseY, 0); near.push(g); }
    blobs.push([cx, baseY, cz, fw * 0.62, fd * 0.62]);
  }
  if (blobs.length) {
    const bg = [];
    for (const [x, y, z, rx, rz] of blobs) {
      const g = new THREE.PlaneGeometry(rx * 2, rz * 2); g.rotateX(-Math.PI / 2); g.translate(x, y + 0.03, z); bg.push(g);
    }
    const blobMesh = new THREE.Mesh(mergeGeometries(bg, false), new THREE.MeshBasicMaterial({
      color: 0x5a3a52, alphaMap: blobTexture(), transparent: true, opacity: 0.38, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    blobMesh.renderOrder = 1;
    scene.add(blobMesh);
  }

  // ---- hanging dressing: bunting on every tie beam, toy hot-air balloons on strings
  const hang = [];
  const PENN = ['#ff6f91', '#ffcf48', '#4fc8ff', '#5fe08f', '#9a7bff', '#ff9a52'];
  let pc = 0;
  for (const z of tieZs) {
    const hooks = 14, span = (tieHalfX * 2 - 8) / hooks, x0 = -tieHalfX + 4, top = tieY - tieT / 2;
    for (let h = 0; h < hooks; h++) {
      const xa = x0 + h * span, sag = 2.6;
      const cord = [];
      const n = Math.max(4, Math.round(span / 1.7));
      for (let k = 0; k <= n; k++) { const t = k / n; cord.push(new THREE.Vector3(xa + span * t, top - sag * 4 * t * (1 - t), z)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cord), n * 2, 0.08, 3, false);
      hang.push(paint(tube, '#fff6ea'));
      for (let k = 0; k < n; k++) {
        const a = cord[k], b = cord[k + 1];
        const tri = new THREE.BufferGeometry();
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        tri.setAttribute('position', new THREE.Float32BufferAttribute([a.x + 0.1, a.y, z, b.x - 0.1, b.y, z, mx, my - 2.0, z + 0.01], 3));
        tri.computeVertexNormals();
        hang.push(paint(tri, PENN[pc++ % PENN.length]));
      }
    }
  }
  const balloons = [
    [-52, 34, startZ + 30, 4.2, ['#ff6f91', '#fff6ea'], 0.3],
    [58, 38, startZ + 95, 4.8, ['#4fc8ff', '#ffcf48'], 1.1],
    [-60, 30, startZ + 170, 5.0, ['#5fe08f', '#fff6ea'], 0.2],
    [54, 33, startZ + 235, 4.4, ['#9a7bff', '#ffcf48'], 0.8],
    [-50, 37, finishZ - 20, 4.6, ['#ff9a52', '#fff6ea'], 0.5],
    [50, 30, finishZ + 50, 4.0, ['#ff6f91', '#4fc8ff'], 0.1],
  ];
  for (const [x, y, z, R, cols, ry] of balloons) {
    const rope = roofYAt(x) - y - 1;
    const parts = balloonToy(R, cols, rope);
    for (const g of parts) { g.rotateY(ry); g.translate(x, y, z); hang.push(g); }
  }

  // ---- skylights in the sunny roof plane: bright panes, light shafts, floating dust
  const shaftGeo = [], frameGeo = [];
  const upV = new THREE.Vector3(0, 1, 0), qs = new THREE.Quaternion().setFromUnitVectors(upV, sunDir);
  const sky = [];
  for (const w of windows) sky.push([w.pos.z, w.scale ?? 4]);
  if (!sky.length) sky.push([midZ, 4]);
  for (const z of [startZ + 20, midZ + 35, finishZ + 60]) if (sky.every(([sz]) => Math.abs(sz - z) > 40)) sky.push([z, 3.4]);
  const dustPos = [];
  const rnd = prng(29);
  for (const [wz, sc] of sky) {
    const side = 1, wy = 46 + sc * 2;
    const wx = side * (eaveX * (ridgeY - wy) / (ridgeY - floorY) - 0.6);
    const pane = new THREE.PlaneGeometry(7 * sc, 9 * sc);
    pane.rotateX(-Math.PI / 2); pane.rotateZ(-ang); pane.translate(wx, wy - 0.4, wz);
    paneGeo.push(strip(pane));
    for (const [bw, bd] of [[7 * sc, 0.9], [0.9, 9 * sc]]) {
      const bar = new THREE.BoxGeometry(bw, 0.6, bd); bar.rotateZ(-ang); bar.translate(wx, wy - 0.9, wz); frameGeo.push(paint(bar, '#ffffff'));
    }
    const fr = new THREE.BoxGeometry(7 * sc + 1.6, 0.8, 9 * sc + 1.6); fr.rotateZ(-ang); fr.translate(wx, wy - 0.2, wz); frameGeo.push(paint(fr, '#ffffff'));
    // light shaft along the sun direction, brightest at the window, fading toward the floor
    const len = 170;
    const shaft = new THREE.CylinderGeometry(3.2 * sc, 4.4 * sc, len, 4, 6, true);
    shaft.rotateY(Math.PI / 4);
    const sp = paintBy(shaft, (x, y) => { const t = (y / len) + 0.5; const k = Math.pow(t, 1.6); return new THREE.Color(k, k * 0.94, k * 0.8); });
    sp.applyQuaternion(qs);
    sp.translate(wx - sunDir.x * len / 2, wy - sunDir.y * len / 2, wz - sunDir.z * len / 2);
    shaftGeo.push(sp);
    for (let k = 0; k < 140; k++) {
      const t = 0.15 + rnd() * 0.8, rr = (3.2 + 1.2 * t) * sc * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
      v.set(Math.cos(a) * rr, (0.5 - t) * len, Math.sin(a) * rr).applyQuaternion(qs);
      dustPos.push(wx - sunDir.x * len / 2 + v.x, wy - sunDir.y * len / 2 + v.y, wz - sunDir.z * len / 2 + v.z);
    }
  }
  shell.push(...frameGeo);

  // ---- merge static dressing into a few draw calls
  const shellMesh = new THREE.Mesh(mergeGeometries(shell, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  const farMesh = new THREE.Mesh(mergeGeometries(far, false), propMat);
  const nearMesh = new THREE.Mesh(mergeGeometries(near, false), propMat);
  nearMesh.receiveShadow = true; nearMesh.castShadow = true;
  const hangMesh = new THREE.Mesh(mergeGeometries(hang, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
  scene.add(shellMesh, farMesh, nearMesh, hangMesh);

  const panes = new THREE.Mesh(mergeGeometries(paneGeo, false), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.3), fog: false, side: THREE.DoubleSide }));
  scene.add(panes);
  const glowTex = glowTexture();
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(0.9, 0.82, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (const z of [z0, z1]) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(winR * 5, winR * 5), glowMat);
    gl.position.set(0, winY, z + (z === z0 ? 3 : -3));
    gl.renderOrder = 4;
    scene.add(gl);
  }
  const shafts = new THREE.Mesh(mergeGeometries(shaftGeo, false), new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  shafts.renderOrder = 5;
  scene.add(shafts);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    map: glowTex, color: new THREE.Color(1.6, 1.45, 1.2), size: 0.55, sizeAttenuation: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: true,
  }));
  dust.renderOrder = 6;
  scene.add(dust);

  // ---- shadow follow: keep the frustum centred on the action, snapped to texels; it widens for
  // wide shots so the whole visible pack keeps its contact shadows.
  let S = S0, texel = (2 * S) / sun.shadow.mapSize.x;
  const lightRot = new THREE.Matrix4().lookAt(sunDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  const lightRotInv = lightRot.clone().invert();
  const f = new THREE.Vector3();
  function update(focus, camera) {
    if (camera) {
      const d = camera.position.distanceTo(focus);
      const want = Math.min(64, Math.max(S0, Math.ceil(d * 0.8 / 8) * 8));
      if (want !== S) {
        S = want; texel = (2 * S) / sun.shadow.mapSize.x;
        Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
        sun.shadow.camera.updateProjectionMatrix();
        sun.shadow.normalBias = 0.035 * S / S0;
      }
    }
    f.copy(focus).applyMatrix4(lightRotInv);
    f.x = Math.round(f.x / texel) * texel; f.y = Math.round(f.y / texel) * texel;
    f.applyMatrix4(lightRot);
    sun.target.position.copy(f);
    sun.position.copy(f).addScaledVector(sunDir, 120);
    sun.target.updateMatrixWorld();
  }
  update(new THREE.Vector3(0, 0, startZ + 10));

  const post = createPost(renderer);
  const render = (camera) => post.render(scene, camera);
  const compile = (object, camera) => post.compile(object, scene, camera);
  const envMap = scene.environment;

  /** Free the post-processing targets, the image-based light and the shadow map. The meshes this
   *  added to the scene are freed by whoever disposes the scene (see world/dispose.js). */
  function dispose() {
    post.dispose();
    envMap?.dispose();
    if (scene.environment === envMap) scene.environment = null;
    sun.shadow.map?.dispose();
  }

  return { update, render, compile, dispose, sun, hemi, interior, drawCalls: 12 };
}
