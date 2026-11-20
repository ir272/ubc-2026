// Dry Dock 9: the fight deck (main platform, ledges, tapering hull underneath) and the three
// grated catwalk plates. Exact ARENA numbers.
//
// The deck top is the lightest large surface on the set: painted ship-deck green lifted toward teal,
// matte, with crisp white lane lines, one centre mark and worn paint in the middle, and the
// hazard-yellow nosing at the ledges. Its light is designed, not computed: a baked map holds the
// pools the lamp banks throw (bright in the middle, falling off toward the ledges) and the soft
// shadows of the catwalks, and only the one shadow light can darken it, so a fighter's crisp
// shadow is the only hard shape on it.

import * as THREE from 'three';
import type { ArenaDef } from '../../sim/types.ts';
import { PALETTE } from '../style.ts';
import { Batch, boxUV, canvasTex, rng, type Disposer } from './util.ts';

export const DECK_Z0 = -4; // back edge of the deck top
export const DECK_Z1 = 3.4; // front edge
const LIP = 0.5; // thickness of the top plate (the front lip the camera sees)
const LEDGE_BAND = 0.55; // hazard-yellow nosing width at each ledge
/** catwalk plates: thin front to back, a little behind the fight plane so a robot passing through is in front */
const PLAT_DEPTH = 0.5;
const PLAT_Z = -0.55;
const PLAT_T = 0.16;

/** the deck paint: green lifted toward teal (light, matte) */
const PAINT = { base: '#8cbfae', alt: '#86baa8', worn: '#a9c9c1', hatch: '#5f8f87', line: '#f4f8f4', edge: '#d6e2e0' };

// ---------------------------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------------------------

function wornYellow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = PALETTE.hazard;
  g.fillRect(x, y, w, h);
  // a few long brush streaks and scuffs to bare steel
  for (let i = 0; i < (w * h) / 300; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '120,90,20' : '255,240,190'},${0.05 + r() * 0.12})`;
    g.fillRect(x + r() * w, y + r() * h, 2 + r() * 18, 1 + r() * 3);
  }
  for (let i = 0; i < (w * h) / 900; i++) {
    g.fillStyle = `rgba(70,62,52,${0.25 + r() * 0.35})`;
    g.fillRect(x + r() * w, y + r() * h, 1 + r() * 6, 1 + r() * 3);
  }
  g.restore();
}

function deckTopTexture(): THREE.CanvasTexture {
  // 16 m x (Z1 - Z0) m; u = (x + 8) / 16, v = (z - Z0) / depth. flipY: canvas row 0 is the front edge.
  const depth = DECK_Z1 - DECK_Z0;
  return canvasTex(2048, 1024, (g, W, H) => {
    const r = rng(91);
    const px = W / 16;
    const pz = H / depth;
    const colOf = (x: number) => (x + 8) * px;
    const rowOf = (z: number) => (DECK_Z1 - z) * pz; // world z -> canvas row
    // plates, two close tones
    const plateW = 2 * px;
    const nz = 4;
    const plateH = H / nz;
    for (let ix = 0; ix < 8; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        g.fillStyle = (ix + iz) % 2 ? PAINT.base : PAINT.alt;
        g.fillRect(ix * plateW, iz * plateH, plateW, plateH);
        const v = r();
        g.fillStyle = v > 0.5 ? `rgba(235,250,245,${(v - 0.5) * 0.06})` : `rgba(20,50,45,${(0.5 - v) * 0.06})`;
        g.fillRect(ix * plateW, iz * plateH, plateW, plateH);
      }
    }
    // large soft mottling in the paint
    for (let i = 0; i < 160; i++) {
      const x = r() * W, y = r() * H, rad = 30 + r() * 120;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.5 ? '230,245,240' : '30,70,62';
      rg.addColorStop(0, `rgba(${c},${0.025 + r() * 0.035})`);
      rg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = rg;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // worn paint in the middle of the lane, where feet land: lighter, greyer, broken up
    {
      const cx = colOf(0), cy = rowOf(0);
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 6.5 * px);
      rg.addColorStop(0, 'rgba(196,214,208,0.34)');
      rg.addColorStop(0.55, 'rgba(196,214,208,0.16)');
      rg.addColorStop(1, 'rgba(196,214,208,0)');
      g.save();
      g.scale(1, 0.32);
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H / 0.32);
      g.restore();
      for (let i = 0; i < 90; i++) {
        const x = colOf((r() - 0.5) * 11 * (0.4 + 0.6 * r()));
        const y = rowOf((r() - 0.5) * 3.2);
        const rad = 10 + r() * 40;
        const rg2 = g.createRadialGradient(x, y, 0, x, y, rad);
        rg2.addColorStop(0, `rgba(178,196,192,${0.12 + r() * 0.14})`);
        rg2.addColorStop(1, 'rgba(178,196,192,0)');
        g.fillStyle = rg2;
        g.fillRect(x - rad, y - rad * 0.6, rad * 2, rad * 1.2);
      }
    }
    // scuffs along x where feet slide: bare steel grey and darker skid marks
    for (let i = 0; i < 520; i++) {
      const x = colOf((r() - 0.5) * 14 * (0.3 + 0.7 * r()));
      const y = rowOf((r() - 0.5) * 3.4);
      g.fillStyle = r() < 0.55 ? `rgba(150,162,162,${0.08 + r() * 0.12})` : `rgba(40,70,66,${0.06 + r() * 0.08})`;
      g.fillRect(x, y, 10 + r() * 60, 1 + r() * 2.5);
    }
    // darker toward the back edge (grime), clean at the front
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(18,40,38,0.22)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // plate seams: a dark groove with a lit lip on the side toward the key
    const seam = (x0: number, y0: number, x1: number, y1: number) => {
      g.strokeStyle = 'rgba(32,62,58,0.7)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = 'rgba(235,250,246,0.28)';
      g.lineWidth = 1.5;
      g.beginPath();
      const ox = y0 === y1 ? 0 : 2.5;
      const oy = y0 === y1 ? 2.5 : 0;
      g.moveTo(x0 + ox, y0 + oy);
      g.lineTo(x1 + ox, y1 + oy);
      g.stroke();
    };
    for (let ix = 1; ix < 8; ix++) seam(ix * plateW, 0, ix * plateW, H);
    for (let iz = 1; iz < nz; iz++) seam(0, iz * plateH, W, iz * plateH);
    // rivet rows either side of the cross seams
    g.fillStyle = 'rgba(40,74,68,0.5)';
    for (let ix = 1; ix < 8; ix++) for (let y = 12; y < H; y += pz * 0.32) {
      g.fillRect(ix * plateW - 10, y, 4, 4);
      g.fillRect(ix * plateW + 7, y, 4, 4);
    }
    // painted lines: the lane edges, crisp white, lightly worn
    const line = (z: number, wM: number) => {
      const y = rowOf(z);
      g.fillStyle = PAINT.line;
      g.globalAlpha = 0.95;
      g.fillRect(0.85 * px, y - (wM * pz) / 2, W - 1.7 * px, wM * pz);
      g.globalAlpha = 1;
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(150,180,174,${0.3 + r() * 0.4})`;
        g.fillRect(0.85 * px + r() * (W - 1.7 * px), y - (wM * pz) / 2 + r() * wM * pz, 2 + r() * 10, 1 + r() * 3);
      }
    };
    line(1.9, 0.1);
    line(-1.9, 0.1);
    // the centre mark: short bars across the lane (the hatch plates and spawn marks are gone:
    // they read as random rectangles right under the fight)
    {
      const cx = colOf(0);
      g.fillStyle = PAINT.line;
      g.globalAlpha = 0.9;
      const len = 0.5;
      g.fillRect(cx - 0.05 * px, rowOf(1.9), 0.1 * px, len * pz);
      g.fillRect(cx - 0.05 * px, rowOf(-1.9) - len * pz, 0.1 * px, len * pz);
      g.globalAlpha = 1;
    }
    // the front nosing: paint chipped to bare steel along the edge, a crisp light line
    g.fillStyle = PAINT.edge;
    g.globalAlpha = 0.85;
    g.fillRect(0, 0, W, 6);
    g.globalAlpha = 1;
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(200,214,214,${0.15 + r() * 0.3})`;
      g.fillRect(r() * W, 5 + r() * 12, 3 + r() * 16, 1 + r() * 3);
    }
    // hazard-yellow nosing at the two ledges, with a dark steel step line inboard
    const hz = LEDGE_BAND * px;
    wornYellow(g, 0, 0, hz, H, r);
    wornYellow(g, W - hz, 0, hz, H, r);
    g.fillStyle = 'rgba(20,36,34,0.85)';
    g.fillRect(hz, 0, 5, H);
    g.fillRect(W - hz - 5, 0, 5, H);
  });
}

/** Light that lands on the deck top, baked: the lamp banks' pools (bright mid-deck, falling off
 *  toward the ledges and the back), and the soft shadows of the catwalks hung above. 1.0 = full. */
function deckLightTexture(arena: ArenaDef): THREE.CanvasTexture {
  const depth = DECK_Z1 - DECK_Z0;
  return canvasTex(512, 256, (g, W, H) => {
    const px = W / 16;
    const pz = H / depth;
    const colOf = (x: number) => (x + 8) * px;
    const rowOf = (z: number) => (DECK_Z1 - z) * pz;
    // ambient floor: the haze and the far floods
    g.fillStyle = 'rgb(86,86,86)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    // three pools from the lamp banks overhead, overlapping, the middle one strongest
    const pools: [number, number, number, number][] = [[-5.0, -0.8, 3.3, 0.5], [0, -0.6, 3.7, 0.7], [5.0, -0.8, 3.3, 0.5]];
    for (const [x, z, rad, k] of pools) {
      const cx = colOf(x), cy = rowOf(z);
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad * px);
      const v = Math.round(255 * k);
      const st = (f: number) => `rgb(${Math.round(v * f)},${Math.round(v * f)},${Math.round(v * f)})`;
      rg.addColorStop(0, st(1));
      rg.addColorStop(0.5, st(0.78));
      rg.addColorStop(0.78, st(0.3));
      rg.addColorStop(1, st(0));
      g.save();
      g.translate(cx, cy);
      g.scale(1, 0.75);
      g.translate(-cx, -cy);
      g.fillStyle = rg;
      g.fillRect(cx - rad * px, cy - rad * px * 1.4, rad * px * 2, rad * px * 2.8);
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
    // falloff toward the back edge and toward both ledges
    const back = g.createLinearGradient(0, 0, 0, H);
    back.addColorStop(0, 'rgba(0,0,0,0.04)');
    back.addColorStop(0.55, 'rgba(0,0,0,0)');
    back.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = back;
    g.fillRect(0, 0, W, H);
    const side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(0,0,0,0.22)');
    side.addColorStop(0.18, 'rgba(0,0,0,0)');
    side.addColorStop(0.82, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = side;
    g.fillRect(0, 0, W, H);
    // soft shadows of the catwalk plates (the lamps are high and in front: the shadow lands a
    // little behind the plate, wider and softer the higher the plate)
    for (const p of arena.soft) {
      const blur = 0.35 + p.y * 0.12;
      g.save();
      g.filter = `blur(${(blur * px).toFixed(1)}px)`;
      g.fillStyle = 'rgba(0,0,0,0.22)';
      const zc = PLAT_Z - 0.35 - p.y * 0.18;
      g.fillRect(colOf(p.x0 + 0.1), rowOf(zc + PLAT_DEPTH / 2 + 0.1), (p.x1 - p.x0 - 0.2) * px, (PLAT_DEPTH + 0.2) * pz);
      g.restore();
    }
  }, { srgb: false, aniso: 4 });
}

function lipTexture(): THREE.CanvasTexture {
  return canvasTex(2048, 64, (g, W, H) => {
    const r = rng(17);
    const px = W / 16;
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#5c7478');
    gr.addColorStop(0.12, '#475c62');
    gr.addColorStop(1, '#2a383f');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // butt seams every 2 m, a bolt row
    for (let ix = 0; ix <= 8; ix++) {
      g.fillStyle = 'rgba(10,16,20,0.8)';
      g.fillRect(ix * 2 * px - 2, 0, 4, H);
    }
    g.fillStyle = 'rgba(190,214,220,0.35)';
    for (let x = 0.25 * px; x < W; x += 0.5 * px) g.fillRect(x, H * 0.55, 3, 3);
    // grime runs
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(8,14,18,${0.06 + r() * 0.1})`;
      g.fillRect(r() * W, r() * H * 0.5, 1 + r() * 3, 8 + r() * 30);
    }
    // the nosing at the ledges
    const hz = LEDGE_BAND * px;
    wornYellow(g, 0, 0, hz, H, r);
    wornYellow(g, W - hz, 0, hz, H, r);
  });
}

/** the ledge end faces: yellow at the top (the nosing), dark steel below */
function endTexture(): THREE.CanvasTexture {
  return canvasTex(256, 64, (g, W, H) => {
    const r = rng(5);
    g.fillStyle = '#2a383f';
    g.fillRect(0, 0, W, H);
    wornYellow(g, 0, 0, W, H, r);
  });
}

/** the hull under the deck: dark painted steel with strakes, ribs and a lamp line */
function hullTexture(): THREE.CanvasTexture {
  // u = x / 16 + 0.5 (wraps), v = -y / 5.4
  return canvasTex(1024, 256, (g, W, H) => {
    const r = rng(23);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#56677a');
    gr.addColorStop(0.5, '#425264');
    gr.addColorStop(1, '#2e3a48');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    const px = W / 16;
    const py = H / 5.4;
    // strake seams (horizontal) and ribs (vertical) with a lit edge
    for (const y of [0.9, 2.0, 3.1, 4.2]) {
      g.fillStyle = 'rgba(8,12,16,0.45)';
      g.fillRect(0, y * py, W, 2);
      g.fillStyle = 'rgba(150,175,200,0.2)';
      g.fillRect(0, y * py + 2, W, 1);
    }
    for (let x = 0; x < 16; x += 1.6) {
      g.fillStyle = 'rgba(10,14,18,0.35)';
      g.fillRect(x * px - 3, 0, 6, H);
      g.fillStyle = 'rgba(160,185,210,0.22)';
      g.fillRect(x * px - 3, 0, 2, H);
    }
    // a cool lamp line under the lip
    g.fillStyle = '#8fc4f0';
    g.fillRect(0, 0.62 * py, W, 3);
    // drips and rust runs
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${r() < 0.4 ? '110,50,30' : '5,8,12'},${0.08 + r() * 0.12})`;
      g.fillRect(r() * W, r() * H * 0.7, 1 + r() * 3, 10 + r() * 50);
    }
  }, { repeat: true });
}

function gratingTexture(): THREE.CanvasTexture {
  // alpha: bars white (solid), holes black. Bars run along x, cross bars every so often.
  return canvasTex(256, 64, (g, W, H) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    const bars = 8;
    for (let i = 0; i <= bars; i++) g.fillRect(0, Math.round((i * H) / bars) - 2, W, 4);
    for (let x = 0; x <= W; x += 32) g.fillRect(x - 2, 0, 4, H);
  }, { repeat: true, srgb: false, aniso: 4 });
}

// ---------------------------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------------------------

/** The top plate: a profile in (z, y), extruded along x, bevelled at the two ledge ends.
 *  Faces are sorted into material groups by their normal: 0 top, 1 lip and under, 2 ledge ends, 3 front chamfer. */
function slabGeometry(x0: number, x1: number): THREE.BufferGeometry {
  const c = 0.08;
  const pts: [number, number][] = [
    [-DECK_Z0, 0],
    [-(DECK_Z1 - c), 0],
    [-DECK_Z1, -c],
    [-DECK_Z1, -LIP],
    [-DECK_Z0, -LIP],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = pts.length - 1; i >= 1; i--) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const bevel = 0.07;
  const len = x1 - x0;
  const ex = new THREE.ExtrudeGeometry(shape, {
    depth: len - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelOffset: -bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 1,
  });
  ex.rotateY(Math.PI / 2);
  ex.computeBoundingBox();
  const bb = ex.boundingBox!;
  ex.translate(x0 - bb.min.x, -bb.max.y, 0);
  const g = ex.toNonIndexed();
  ex.dispose();
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const tri = pos.count / 3;
  const classes: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < tri; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    cc.fromBufferAttribute(pos, t * 3 + 2);
    n.subVectors(cc, b).cross(a.clone().sub(b)).normalize();
    let k: number;
    if (Math.abs(n.x) > 0.45) k = 2;
    else if (n.y > 0.9) k = 0;
    else if (n.y > 0.3 && n.z > 0.3) k = 3;
    else k = 1;
    classes.push(k);
  }
  const order = [...Array(tri).keys()].sort((p, q) => classes[p] - classes[q]);
  const P = new Float32Array(pos.count * 3);
  const N = new Float32Array(pos.count * 3);
  const U = new Float32Array(pos.count * 2);
  const nrm = g.getAttribute('normal');
  let w = 0;
  const groups: [number, number, number][] = [];
  let cur = -1, start = 0;
  for (const t of order) {
    const k = classes[t];
    if (k !== cur) {
      if (cur >= 0) groups.push([start, w * 3 - start, cur]);
      cur = k;
      start = w * 3;
    }
    for (let v = 0; v < 3; v++) {
      const i = t * 3 + v;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      P.set([x, y, z], (w * 3 + v) * 3);
      N.set([nrm.getX(i), nrm.getY(i), nrm.getZ(i)], (w * 3 + v) * 3);
      let u = 0, vv = 0;
      if (k === 0 || k === 3) {
        u = (x - x0) / len;
        vv = (z - DECK_Z0) / (DECK_Z1 - DECK_Z0);
      } else if (k === 1) {
        u = (x - x0) / len;
        vv = 1 + y / LIP;
      } else {
        u = (z - DECK_Z0) / (DECK_Z1 - DECK_Z0);
        vv = 1 + y / LIP;
      }
      U.set([u, vv], (w * 3 + v) * 2);
    }
    w++;
  }
  groups.push([start, w * 3 - start, cur]);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  for (const [s, cnt, m] of groups) out.addGroup(s, cnt, m);
  g.dispose();
  return out;
}

/** The hull under the deck: a lofted, faceted frustum through a few rectangular rings, closed at the keel. */
function hullGeometry(): THREE.BufferGeometry {
  // rings: y, half width in x, z back, z front
  const rings: [number, number, number, number][] = [
    [-LIP + 0.02, 7.55, DECK_Z0 + 0.45, DECK_Z1 - 0.55],
    [-1.35, 7.0, DECK_Z0 + 0.7, DECK_Z1 - 0.95],
    [-3.3, 4.6, DECK_Z0 + 1.45, DECK_Z1 - 1.75],
    [-5.0, 2.1, DECK_Z0 + 2.3, DECK_Z1 - 2.5],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const corner = (r: [number, number, number, number], k: number): THREE.Vector3 => {
    const [y, hx, zb, zf] = r;
    // corners in order around: front-left, front-right, back-right, back-left
    const xs = [-hx, hx, hx, -hx];
    const zs = [zf, zf, zb, zb];
    return new THREE.Vector3(xs[k], y, zs[k]);
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, dd: THREE.Vector3, side: number) => {
    for (const p of [a, b, c, a, c, dd]) {
      pos.push(p.x, p.y, p.z);
      // front/back faces: u along x; ends: u along z
      const u = side % 2 === 0 ? p.x / 16 + 0.5 : p.z / 16 + 0.5;
      uv.push(u, 1 + p.y / 5.4);
    }
  };
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const a = corner(rings[i], k), b = corner(rings[i], k2);
      const c = corner(rings[i + 1], k2), dd = corner(rings[i + 1], k);
      // winding: outward normals (front face k=0 goes left to right, top to bottom)
      quad(a, dd, c, b, k);
    }
  }
  // the keel bottom
  const last = rings[rings.length - 1];
  quad(corner(last, 0), corner(last, 3), corner(last, 2), corner(last, 1), 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export interface DeckParts {
  group: THREE.Group;
  /** emissive strips (for the KO flare) */
  strips: THREE.MeshBasicMaterial;
  /** 0..1 extra light on the deck top (a knockout flare), and its colour */
  setFlare(k: number, color: THREE.Color): void;
}

/** The deck top's material: Lambert, but lit only by the baked light map, with the one shadow
 *  light's shadow map cutting into it. Rims and key never touch it, so it holds one designed value. */
function deckTopMaterial(map: THREE.Texture, bake: THREE.Texture): { mat: THREE.MeshLambertMaterial; flare: { value: THREE.Color } } {
  const mat = new THREE.MeshLambertMaterial({ map });
  const flare = { value: new THREE.Color(0, 0, 0) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBake = { value: bake };
    sh.uniforms.uFlare = flare;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uBake;\nuniform vec3 uFlare;')
      .replace('#include <aomap_fragment>', /* glsl */ `#include <aomap_fragment>
        float dShadow = 1.0;
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
          dShadow = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
        #endif
        vec3 bakeL = texture2D( uBake, vMapUv ).rgb;
        // the lamps are warm-white, the haze cool: the pools warm the paint a touch
        vec3 lampC = mix( vec3( 0.86, 0.95, 1.0 ), vec3( 1.04, 1.0, 0.93 ), smoothstep( 0.55, 0.95, bakeL.r ) );
        reflectedLight.directDiffuse = vec3( 0.0 );
        reflectedLight.indirectDiffuse = diffuseColor.rgb * ( bakeL.r * 1.1 * lampC * mix( 0.42, 1.0, dShadow ) + uFlare );`);
  };
  mat.customProgramCacheKey = () => 'ringout-deck-top';
  return { mat, flare };
}

export function buildDeck(arena: ArenaDef, d: Disposer): DeckParts {
  const group = new THREE.Group();
  group.name = 'deck';
  const m = arena.main;

  // ---- materials ----
  const topTex = d.track(deckTopTexture());
  const bakeTex = d.track(deckLightTexture(arena));
  const lipTex = d.track(lipTexture());
  const endTex = d.track(endTexture());
  const hullTex = d.track(hullTexture());
  const grateTex = d.track(gratingTexture());
  // matte deck paint, lit by its designed light only
  const top = deckTopMaterial(topTex, bakeTex);
  const topMat = d.track(top.mat);
  const lipMat = d.track(new THREE.MeshStandardMaterial({ map: lipTex, roughness: 0.55, metalness: 0.2 }));
  const endMat = d.track(new THREE.MeshStandardMaterial({ map: endTex, roughness: 0.5, metalness: 0.15 }));
  const noseMat = d.track(new THREE.MeshStandardMaterial({ color: '#c8d6d8', roughness: 0.35, metalness: 0.5 }));
  const hullMat = d.track(new THREE.MeshStandardMaterial({ map: hullTex, roughness: 0.55, metalness: 0.3, envMapIntensity: 1.0, flatShading: true, emissive: '#0d1824', emissiveIntensity: 1 }));
  const ironMat = d.track(new THREE.MeshStandardMaterial({ color: '#4a5666', roughness: 0.5, metalness: 0.45 }));
  const railMat = d.track(new THREE.MeshStandardMaterial({ color: '#4c5c6c', roughness: 0.45, metalness: 0.5 }));
  const capMat = d.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#eef4fa').multiplyScalar(1.05) }));
  const grateMat = d.track(new THREE.MeshStandardMaterial({ color: '#8a98a6', roughness: 0.5, metalness: 0.55, alphaMap: grateTex, alphaTest: 0.5, side: THREE.DoubleSide }));
  const strips = d.track(new THREE.MeshBasicMaterial({ color: '#cfe6ff' }));

  // ---- the top plate ----
  const slab = new THREE.Mesh(d.track(slabGeometry(m.x0, m.x1)), [topMat, lipMat, endMat, noseMat]);
  slab.receiveShadow = true;
  group.add(slab);

  // ---- the hull underneath ----
  const hull = new THREE.Mesh(d.track(hullGeometry()), hullMat);
  group.add(hull);

  const stripB = new Batch('strips');
  const iron = new Batch('iron');
  // the soffit lamp line right under the lip, set back, so the deck edge has a crisp cool underline
  stripB.box(m.x1 - m.x0 - 1.0, 0.04, 0.04, 0, -LIP - 0.04, DECK_Z1 - 0.6);
  // the keel: a spine, a lamp housing, and the lamp face
  iron.box(4.6, 0.35, 0.5, 0, -5.15, (DECK_Z0 + 2.3 + DECK_Z1 - 2.5) / 2);
  iron.box(1.2, 0.3, 1.0, 0, -5.4, (DECK_Z0 + 2.3 + DECK_Z1 - 2.5) / 2 + 0.2);
  stripB.box(0.9, 0.03, 0.7, 0, -5.56, (DECK_Z0 + 2.3 + DECK_Z1 - 2.5) / 2 + 0.2);
  // strakes along the hull's front at each break, catching the key as thin highlight lines
  iron.box(14.0, 0.14, 0.16, 0, -1.35, DECK_Z1 - 0.95 + 0.04);
  iron.box(9.2, 0.14, 0.16, 0, -3.3, DECK_Z1 - 1.75 + 0.04);
  // a row of cool deck-edge lamps on the upper hull band (the two lamp housings on the lower band
  // are gone: big lit rectangles in the bottom middle of the wide read as random boxes)
  const dimB = new Batch('hull lamps');
  for (let k = 0; k < 9; k++) {
    const x = -6.4 + k * 1.6;
    dimB.box(0.34, 0.07, 0.05, x, -0.92, DECK_Z1 - 0.75 + 0.06, 0, 0, -0.42);
  }
  // brackets under the lip at the ledge ends (they read the overhang)
  for (const sx of [-1, 1]) {
    for (const z of [DECK_Z1 - 0.9, DECK_Z0 + 0.8]) {
      const top = new THREE.Vector3(sx * 7.6, -LIP, z);
      const bot = new THREE.Vector3(sx * 6.95, -1.4, z);
      iron.beam(top, bot, 0.18, 0.22);
    }
  }

  // (the lifting lugs and yellow shackles at the back corners are gone: with no slings on them they
  // were stray yellow marks at fight height beside the ledges; clean pass 2026-11-19)

  // ---- catwalk plates: thin front to back, set a little behind the fight plane. No hoist wires,
  // slings or hook blocks (clean pass, 2026-11-19): they ran up through the air the robots jump
  // through, between the plates. No yellow end caps either: hazard yellow belongs to the deck's
  // ledges only. ----
  const rails = new Batch('rails');
  const caps = new Batch('caps');
  const grate = new Batch('grate');
  arena.soft.forEach((p) => {
    const w = p.x1 - p.x0;
    const cx = (p.x0 + p.x1) / 2;
    const zf = PLAT_Z + PLAT_DEPTH / 2;
    const zb = PLAT_Z - PLAT_DEPTH / 2;
    // front and back rails (their tops ARE the platform line), end rails
    rails.box(w, PLAT_T - 0.035, 0.07, cx, p.y - 0.035 - (PLAT_T - 0.035) / 2, zf - 0.035);
    rails.box(w, PLAT_T - 0.035, 0.07, cx, p.y - 0.035 - (PLAT_T - 0.035) / 2, zb + 0.035);
    rails.box(0.08, PLAT_T, PLAT_DEPTH, p.x0 + 0.04, p.y - PLAT_T / 2, PLAT_Z);
    rails.box(0.08, PLAT_T, PLAT_DEPTH, p.x1 - 0.04, p.y - PLAT_T / 2, PLAT_Z);
    // the walking line: a bright capped edge along the top of the front rail, a dimmer one at the back
    caps.box(w, 0.04, 0.09, cx, p.y - 0.02, zf - 0.04);
    rails.box(w - 0.1, 0.035, 0.09, cx, p.y - 0.0175, zb + 0.04);
    // the grating itself
    const gp = new THREE.PlaneGeometry(w - 0.1, PLAT_DEPTH - 0.1);
    gp.rotateX(-Math.PI / 2);
    gp.translate(cx, p.y - 0.03, PLAT_Z);
    const uv = gp.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 1.0), uv.getY(k) * (PLAT_DEPTH / 1.0) * 4);
    grate.add(gp);
    gp.dispose();
    // under-frame: a channel under the front rail and short cross members
    iron.box(w - 0.12, 0.1, 0.08, cx, p.y - PLAT_T - 0.05, zf - 0.06);
    for (let k = 0; k <= 3; k++) iron.box(0.06, 0.08, PLAT_DEPTH - 0.08, p.x0 + 0.2 + (k / 3) * (w - 0.4), p.y - PLAT_T - 0.04, PLAT_Z);
    // a thin lit line under the front rail so the surface line stays crisp against the dark
    stripB.box(w - 0.1, 0.025, 0.02, cx, p.y - PLAT_T - 0.01, zf - 0.01);
  });

  const add = (b: Batch, mat: THREE.Material, cast = false, recv = false) => {
    const geo = d.track(b.build());
    if (b === rails || b === iron) boxUV(geo, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = recv;
    mesh.name = b.name;
    group.add(mesh);
    return mesh;
  };
  add(iron, ironMat, false, false);
  add(rails, railMat, false, true);
  add(caps, capMat, false, false);
  add(grate, grateMat, false, true);
  add(stripB, strips);
  add(dimB, d.track(new THREE.MeshBasicMaterial({ color: '#3f6283' })));

  // the keel lamp throws a soft cool shaft down into the haze under the deck
  {
    const grad = d.track(canvasTex(8, 128, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }, { srgb: false }));
    const len = 9;
    const cone = new THREE.CylinderGeometry(0.45, 3.2, len, 20, 1, true);
    cone.translate(0, -len / 2 - 5.55, (DECK_Z0 + 2.3 + DECK_Z1 - 2.5) / 2 + 0.2);
    const shaft = new THREE.Mesh(d.track(cone), d.track(new THREE.MeshBasicMaterial({
      map: grad, color: new THREE.Color('#7fb4e6').multiplyScalar(0.22), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    })));
    shaft.renderOrder = 5;
    group.add(shaft);
  }

  return {
    group,
    strips,
    setFlare(k: number, color: THREE.Color) {
      top.flare.value.copy(color).multiplyScalar(k);
    },
  };
}
