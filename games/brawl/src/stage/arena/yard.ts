// Dry Dock 9, middle layer: the quay, the dry dock with a ship in it, the goliath crane straddling
// the dock with its floodlight banks, slow trolley and swaying load, tower cranes on the quays,
// container stacks, floodlight masts beside the stands, tower cranes slewing slowly, welders at
// work on the hull staging, and slow red beacons.
//
// Lighting design: one hue shift. The yard is navy; the light is sodium. The ship lies three-quarter
// on, bow toward the deck, and the floods on the dock side key its port side warm (lit plating
// around 110 luminance) while the bow's far flank and everything unlit stays navy. The lamp banks
// themselves are in frame and blown out, with a soft glare, so the picture has visible sources.
// All pieces are unlit with baked shading; values step down and cool off toward the back.

import * as THREE from 'three';
import { GROUND_Y, ShadedBatch, canvasTex, rng, smooth01, type Disposer } from './util.ts';
import { BASIN, WATER_Y, buildWater } from './water.ts';
import { DOCK } from './dock.ts';
import { buildVessel } from './vessel.ts';

export { GROUND_Y };
const PIT_Y = -34;
const DOCK_HEAD_Z = -80;

// the ship: built in its own frame (stem at the origin, +z forward), then turned and placed
const SHIP_L = 110;
const SHIP_B = 14.5; // half beam
const KEEL_Y = -30;
const MAIN_DECK_Y = 7; // main deck amidships
const BOW_POS = new THREE.Vector3(-33, 0, -134);
const SHIP_YAW = 1.0; // stern swings back and to the left

// the goliath crane
const CR_Z = -112;
const CR_Y = 14.5; // girder underside
const LEG = 33;

// sodium key on the hull, from the left and in front (the floods along the dock side)
const KEY_DIR = new THREE.Vector3(-0.78, 0.32, 0.54).normalize();
const SODIUM = new THREE.Color(1.0, 0.56, 0.17);
const KEY_K = 1.9;
/** where the floods stand along the ship's side (metres aft of the stem) */
const FLOODS = [10, 30, 50, 70, 90];
const NIGHT = new THREE.Color(0.06, 0.095, 0.16);
/** the crane's lamp banks hang in front of the bow: a dimmer, whiter light from above and in front */
const KEY2_DIR = new THREE.Vector3(0.35, 0.6, 0.72).normalize();
const KEY2 = new THREE.Color(0.36, 0.36, 0.36);
const COOLW = new THREE.Color(0.40, 0.45, 0.52);

export interface Yard {
  group: THREE.Group;
  lampMat: THREE.MeshBasicMaterial;
  /** the lamp banks flare with the crowd: 0..1, decays by itself */
  pulse(k: number): void;
  update(t: number, dt: number): void;
}

/** a corrugated steel texture for containers (grey, tinted per instance) */
function corrugated(): THREE.CanvasTexture {
  return canvasTex(128, 64, (g, W, H) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, 0, 3, H);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(x + 4, 0, 1, H);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 0, W, 3);
    g.fillRect(0, H - 3, W, 3);
  }, { repeat: true });
}

/** soft radial glow, for glare around lamp banks, welding arcs and light pools */
function glowTexture(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g, W, H) => {
    const rg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.12, 'rgba(255,255,255,0.55)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.18)');
    rg.addColorStop(0.7, 'rgba(255,255,255,0.04)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  });
}

/** a bank of lamps in a dark bezel: cols x rows */
function bankTexture(cols: number, rows: number): THREE.CanvasTexture {
  return canvasTex(64 * cols, 64 * rows, (g, W, H) => {
    g.fillStyle = '#0b0f14';
    g.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / rows;
    for (let ix = 0; ix < cols; ix++) for (let iy = 0; iy < rows; iy++) {
      const cx = ix * cw + cw / 2, cy = iy * ch + ch / 2;
      g.fillStyle = '#20262e';
      g.fillRect(ix * cw + 3, iy * ch + 3, cw - 6, ch - 6);
      const rg = g.createRadialGradient(cx, cy, 1, cx, cy, cw * 0.46);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.5, '#fff4e0');
      rg.addColorStop(0.85, '#c09060');
      rg.addColorStop(1, '#20262e');
      g.fillStyle = rg;
      g.fillRect(ix * cw + 6, iy * ch + 6, cw - 12, ch - 12);
    }
  });
}

/** hull plating: strakes along the length, butts across, a few rust runs; white, tinted by vertex colour */
function plateTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g, W, H) => {
    const rr = rng(77);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    // soft weathering: large faint blotches, and a few long, faint rust runs from the plate seams
    for (let i = 0; i < 26; i++) {
      const x = rr() * W, y = rr() * H, rad = 20 + rr() * 60;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = rr() < 0.5 ? '255,255,255' : '0,0,0';
      rg.addColorStop(0, `rgba(${c},${0.04 + rr() * 0.05})`);
      rg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = rg;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 8; i++) {
      const x = rr() * W;
      const y = rr() * H * 0.5;
      const gr = g.createLinearGradient(0, y, 0, y + 120);
      gr.addColorStop(0, 'rgba(90,45,20,0.12)');
      gr.addColorStop(1, 'rgba(90,45,20,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, 4 + rr() * 6, 120);
    }
  }, { repeat: true });
}

/** girder side: vertical stiffeners and a handrail line; white, tinted by vertex colour */
function girderTexture(): THREE.CanvasTexture {
  return canvasTex(256, 64, (g, W, H) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 32) {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(x, 0, 4, H);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x + 4, 0, 2, H);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 6, W, 3);
    g.fillRect(0, H - 8, W, 3);
  }, { repeat: true });
}

/** the hull's half beam at a distance aft of the stem (upper hull) */
function halfBeam(along: number): number {
  return SHIP_B * Math.sqrt(THREE.MathUtils.smoothstep(along / SHIP_L, 0, 0.3));
}

/** the ship's frame -> world */
function shipMatrix(): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(SHIP_YAW).setPosition(BOW_POS);
}

/** the lofted hull, in world space, with baked sodium key + navy ambient in vertex colours.
 *  Rows are placed at fixed fractions of the side height so the paint lines (boot top, the band
 *  under the sheer, the bulwark) are crisp quads that follow the sheer like real paint lines. */
function hullGeometry(): THREE.BufferGeometry {
  const NS = 64;
  // row levels (0 keel .. 1 sheer) and the paint of the row above each level
  const ROWS = [0, 0.15, 0.3, 0.4, 0.486, 0.504, 0.56, 0.62, 0.68, 0.74, 0.8, 0.845, 0.9, 0.94, 0.968, 1];
  // a dark hull: near-black blue topsides, a red-oxide boot stripe at the waterline, a white sheer
  // line; the bottom below the boot stripe is a darker oxide that stays low under the floods
  const bottom = new THREE.Color('#25202a');
  const boot = new THREE.Color('#4e2622');
  const tops = new THREE.Color('#1c2635');
  const sheerLine = new THREE.Color('#a9b4be');
  const bulwark = new THREE.Color('#202b3a');
  const deckPaint = new THREE.Color('#2e3842');
  const rowPaint = (yn: number) => (yn < 0.4 ? bottom : yn < 0.486 ? boot : yn >= 0.94 && yn < 0.968 ? sheerLine : yn >= 0.968 ? bulwark : tops);
  const pos: number[] = [];
  const paint: THREE.Color[] = [];
  const sheer = (s: number) => MAIN_DECK_Y + 6.5 * Math.pow(Math.max(0, 1 - s * 5.5), 2) + 1.5 * smooth01((s - 0.86) / 0.14);
  const stemZ = (yn: number) => 10 * Math.pow(yn, 1.5);
  const point = (s: number, yn: number, side: number): THREE.Vector3 => {
    const top = sheer(s);
    const y = KEEL_Y + (top - KEEL_Y) * yn;
    const bowShape = Math.pow(yn, 0.7); // narrow at the forefoot, flared at the top
    const midShape = 1 - Math.pow(1 - yn, 8); // boxy with a round bilge
    const fy = THREE.MathUtils.lerp(bowShape, midShape, THREE.MathUtils.smoothstep(s, 0.0, 0.3));
    const fx = Math.sqrt(THREE.MathUtils.smoothstep(s, 0, 0.3)) * (1 - 0.18 * THREE.MathUtils.smoothstep(s, 0.85, 1));
    const z = stemZ(yn) * (1 - s) - SHIP_L * s;
    return new THREE.Vector3(side * SHIP_B * fx * fy, y, z);
  };
  // dense at the bow, then even along the side so the light pools resolve
  const sv = (i: number) => { const u = i / NS; return u < 0.1 ? 0.04 * Math.pow(u / 0.1, 1.5) : 0.04 + (u - 0.1) / 0.9 * 0.96; };
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, col: THREE.Color) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    paint.push(col, col, col);
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < ROWS.length - 1; j++) {
        const y0 = ROWS[j], y1 = ROWS[j + 1];
        const a = point(sv(i), y0, side);
        const b = point(sv(i + 1), y0, side);
        const c = point(sv(i + 1), y1, side);
        const dd = point(sv(i), y1, side);
        const col = rowPaint(y0);
        if (side > 0) {
          tri(a, b, c, col);
          tri(a, c, dd, col);
        } else {
          tri(a, c, b, col);
          tri(a, dd, c, col);
        }
      }
    }
  }
  // the main deck between the sheer lines
  for (let i = 0; i < NS; i++) {
    const a = point(sv(i), 1, -1), b = point(sv(i), 1, 1);
    const c = point(sv(i + 1), 1, 1), dd = point(sv(i + 1), 1, -1);
    tri(a, b, c, deckPaint);
    tri(a, c, dd, deckPaint);
  }
  // the transom
  for (let j = 0; j < ROWS.length - 1; j++) {
    const a = point(1, ROWS[j], -1), b = point(1, ROWS[j], 1);
    const c = point(1, ROWS[j + 1], 1), dd = point(1, ROWS[j + 1], -1);
    const col = rowPaint(ROWS[j]);
    tri(a, c, b, col);
    tri(a, dd, c, col);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // plating UVs in the ship's frame, then place the ship
  const p = g.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push(p.getZ(i) / 16, p.getY(i) / 3.4);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const localZ: number[] = [];
  for (let i = 0; i < p.count; i++) localZ.push(p.getZ(i));
  g.applyMatrix4(shipMatrix());
  g.computeVertexNormals();
  const n = g.getAttribute('normal');
  const col: number[] = [];
  const nv = new THREE.Vector3();
  const cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    nv.set(n.getX(i), n.getY(i), n.getZ(i));
    const base = paint[i];
    const lam = Math.max(0, nv.dot(KEY_DIR));
    // the floods stand on the quay: strongest low on the hull and toward the bow, falling off up and aft
    const along = -localZ[i];
    // floods on the quay along the dock side throw scalloped pools up the plating: narrow and hot
    // at the bottom, wider and dimmer as they climb; the further aft, the further they fall off
    const h = Math.max(0, y - GROUND_Y);
    const sig = 3.2 + 0.42 * h;
    let pools = 0;
    for (const a of FLOODS) pools += Math.exp(-((along - a) ** 2) / (2 * sig * sig));
    pools *= 1 / (1 + h * 0.07);
    const aftFall = 1 - 0.55 * smooth01((along - 20) / 100);
    const k = lam * (0.3 + 1.05 * Math.min(1.3, pools)) * aftFall * KEY_K * (y < GROUND_Y ? 0.4 : 1);
    // the crane lamps above catch the bow's upper flare and the sheer: a cool-white wash from above
    const k2 = Math.max(0, nv.dot(KEY2_DIR)) * (0.5 + 0.5 * smooth01((y + 10) / 25)) * 1.9;
    cc.setRGB(NIGHT.r + SODIUM.r * k + KEY2.r * k2, NIGHT.g + SODIUM.g * k + KEY2.g * k2, NIGHT.b + SODIUM.b * k + KEY2.b * k2).multiply(base);
    if (nv.y < -0.3) cc.multiplyScalar(0.55);
    col.push(cc.r, cc.g, cc.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** multiply baked colours by a vertical gradient (light from below: the lamps under a girder) */
function gradeY(g: THREE.BufferGeometry, y0: number, y1: number, k0: number, k1: number): void {
  const p = g.getAttribute('position');
  const c = g.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    const f = smooth01((p.getY(i) - y0) / (y1 - y0));
    const k = k0 + (k1 - k0) * f;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
}

export function buildYard(d: Disposer): Yard {
  const group = new THREE.Group();
  group.name = 'yard';
  const r = rng(1234);
  const fogMat = (opts: THREE.MeshBasicMaterialParameters = {}) => d.track(new THREE.MeshBasicMaterial({ vertexColors: true, ...opts }));
  const ship = shipMatrix();
  const shipPt = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(ship);

  // ---------------------------------------------------------------- ground, quays and the dock
  const ground = new ShadedBatch('ground', 1, 0.75, 0.6, 0.4);
  ground.color('#1b2834');
  const quayW = 260;
  // the near quay (under the deck and the stands), the ship's quay on the left, the container quay
  // on the right, and the basin between them
  // the near quays either side of Dry Dock 9 (the dock pit itself is dock.ts), up to the basin
  {
    const nearZ0 = BASIN.z0, nearZ1 = 60;
    const xIn = DOCK.xTop + 4;
    ground.box(quayW - xIn, 6, nearZ1 - nearZ0, -(quayW + xIn) / 2, GROUND_Y - 3, (nearZ0 + nearZ1) / 2);
    ground.box(quayW - xIn, 6, nearZ1 - nearZ0, (quayW + xIn) / 2, GROUND_Y - 3, (nearZ0 + nearZ1) / 2);
    // quay furniture beside the dock: lamp posts' bases, a few stacks of blocks and cable drums
    ground.color('#26313d');
    for (const sx of [-1, 1]) {
      for (const z of [-20, -36]) ground.box(2.4, 1.6, 1.6, sx * (xIn + 3.5), GROUND_Y + 0.8, z);
      ground.box(1.2, 2.4, 1.2, sx * (xIn + 6), GROUND_Y + 1.2, -28);
    }
    ground.color('#1b2834');
  }
  ground.box(quayW + BASIN.x0, 6, 260, (-quayW + BASIN.x0) / 2, GROUND_Y - 3, BASIN.z0 - 130);
  ground.box(quayW - BASIN.x1, 6, 260, (quayW + BASIN.x1) / 2, GROUND_Y - 3, BASIN.z0 - 130);
  // basin walls down to the water, and a coping with bollards along the edges
  ground.color('#121c26');
  ground.box(BASIN.x1 - BASIN.x0, 6, 0.5, (BASIN.x0 + BASIN.x1) / 2, GROUND_Y - 3, BASIN.z0 - 0.25);
  ground.box(0.5, 6, 260, BASIN.x0 + 0.25, GROUND_Y - 3, BASIN.z0 - 130);
  ground.box(0.5, 6, 260, BASIN.x1 - 0.25, GROUND_Y - 3, BASIN.z0 - 130);
  ground.color('#3a4654');
  ground.box(BASIN.x1 - BASIN.x0 + 1.2, 0.35, 0.9, (BASIN.x0 + BASIN.x1) / 2, GROUND_Y + 0.17, BASIN.z0 + 0.2);
  for (let x = BASIN.x0 + 3; x < BASIN.x1 - 1; x += 8) ground.box(0.6, 0.8, 0.6, x, GROUND_Y + 0.4, BASIN.z0 + 1.2);
  // the dock edge along the ship's lit side: a coping, a handrail, and the flood units that light the hull
  ground.color('#2e3a46');
  const edgeA = new THREE.Vector3(-SHIP_B - 9, GROUND_Y + 0.4, 6).applyMatrix4(ship);
  const edgeB = new THREE.Vector3(-SHIP_B - 9, GROUND_Y + 0.4, -SHIP_L).applyMatrix4(ship);
  ground.beam(edgeA, edgeB, 0.8, 1.2);
  ground.beam(edgeA.clone().setY(GROUND_Y + 1.5), edgeB.clone().setY(GROUND_Y + 1.5), 0.12);
  const floodHeads: THREE.Vector3[] = [];
  ground.color('#3a4654');
  for (const a of FLOODS) {
    const base = new THREE.Vector3(-SHIP_B - 8, GROUND_Y, -a).applyMatrix4(ship);
    ground.box(0.35, 3.2, 0.35, base.x, GROUND_Y + 1.6, base.z);
    const head = base.clone().setY(GROUND_Y + 3.4);
    ground.box(1.6, 0.9, 0.8, head.x, head.y, head.z, 0, SHIP_YAW);
    floodHeads.push(head);
  }
  group.add(new THREE.Mesh(d.track(ground.build()), fogMat()));

  // ---------------------------------------------------------------- the ship
  const plate = d.track(plateTexture());
  group.add(new THREE.Mesh(d.track(hullGeometry()), fogMat({ map: plate })));

  // fittings, built in the ship's frame and baked with the same key (lit on their port faces)
  const fit = new ShadedBatch('fittings', 1.0, 0.8, 0.55, 0.35);
  const fitBox = (c: string, w: number, h: number, dd: number, x: number, y: number, z: number) => {
    fit.color(c);
    const g = new THREE.BoxGeometry(w, h, dd);
    fit.add(g, new THREE.Matrix4().makeTranslation(x, y, z).premultiply(ship));
    g.dispose();
  };
  const fitBeam = (c: string, a: THREE.Vector3, b: THREE.Vector3, w: number) => {
    fit.color(c);
    fit.beam(a.clone().applyMatrix4(ship), b.clone().applyMatrix4(ship), w);
  };
  const forecastle = MAIN_DECK_Y + 6.5;
  // foremast with a crosstree, a samson post pair, hatch coamings, deck cranes
  fitBox('#5d6670', 1.1, 13, 1.1, 0, forecastle + 6.5, -14);
  fitBox('#5d6670', 6, 0.5, 0.5, 0, forecastle + 10.5, -14);
  for (let k = 0; k < 4; k++) fitBox('#3f4955', 19, 1.8, 13, 0, MAIN_DECK_Y + 0.9, -34 - k * 18);
  for (const z of [-43, -79]) {
    fitBox('#c08a2a', 2, 11, 2, 7, MAIN_DECK_Y + 5.5, z);
    fitBeam('#c08a2a', new THREE.Vector3(7, MAIN_DECK_Y + 10, z), new THREE.Vector3(-7, MAIN_DECK_Y + 15, z + 7), 0.9);
  }
  // the bridge house forward (a working ship: bridge up front, long open deck aft), and its funnel
  const aft = -32;
  fitBox('#b4bec8', 22, 11, 12, 0, MAIN_DECK_Y + 5.5, aft);
  fitBox('#b4bec8', 18, 3.4, 10, 0, MAIN_DECK_Y + 12.7, aft - 0.5);
  fitBox('#b4bec8', 27, 0.8, 4, 0, MAIN_DECK_Y + 14.0, aft + 3);
  fitBox('#5d6670', 0.8, 9, 0.8, 0, MAIN_DECK_Y + 19, aft - 2);
  fitBox('#5d6670', 5, 0.4, 0.4, 0, MAIN_DECK_Y + 21, aft - 2);
  fitBox('#1d4f66', 5.5, 8, 5.5, 0, MAIN_DECK_Y + 15, aft - 12);
  fitBox('#8a3226', 5.6, 1.4, 5.6, 0, MAIN_DECK_Y + 18.4, aft - 12);
  // anchors in their pockets on the bow flare, port and starboard
  for (const side of [-1, 1]) {
    const pz = 2.6;
    const px = side * (SHIP_B * 0.42);
    fitBox('#151b21', 2.8, 2.6, 2.2, px, forecastle - 4.5, pz);
    fitBox('#2a3038', 0.5, 2.4, 0.5, px + side * 0.6, forecastle - 4.8, pz + 0.7);
    fitBox('#2a3038', 2.2, 0.5, 0.5, px + side * 0.6, forecastle - 6.0, pz + 0.7);
  }
  // the staging along the lit side: scaffold towers with planks, built off the port side
  const stagings: THREE.Vector3[] = [];
  for (const sz of [-14, -30, -46, -62]) {
    const sx = -halfBeam(-sz) - 2.4;
    for (const dz of [-2.5, 2.5]) {
      fitBox('#5b6570', 0.22, MAIN_DECK_Y - GROUND_Y, 0.22, sx, (MAIN_DECK_Y + GROUND_Y) / 2, sz + dz);
      fitBox('#5b6570', 0.22, MAIN_DECK_Y - GROUND_Y, 0.22, sx - 1.8, (MAIN_DECK_Y + GROUND_Y) / 2, sz + dz);
    }
    for (let y = GROUND_Y + 3.2; y < MAIN_DECK_Y; y += 3.2) {
      fitBox('#4e5864', 2.2, 0.18, 5.6, sx - 0.9, y, sz);
      fitBox('#5b6570', 0.08, 0.08, 5.6, sx - 1.95, y + 1.0, sz);
    }
    for (let y = GROUND_Y; y < MAIN_DECK_Y - 3; y += 3.2) {
      fitBeam('#5b6570', new THREE.Vector3(sx - 1.8, y, sz - 2.5), new THREE.Vector3(sx - 1.8, y + 3.2, sz + 2.5), 0.1);
    }
    stagings.push(new THREE.Vector3(sx - 0.9, 0, sz));
  }
  // bake the key into the fittings too: port faces warm, the rest navy
  const fitGeo = d.track(fit.build());
  {
    const nn = fitGeo.getAttribute('normal');
    const cc = fitGeo.getAttribute('color');
    const pp = fitGeo.getAttribute('position');
    const nv = new THREE.Vector3();
    for (let i = 0; i < cc.count; i++) {
      nv.set(nn.getX(i), nn.getY(i), nn.getZ(i));
      // the house is white paint kept cool: only a little sodium reaches it, the crane lamps'
      // whiter light does the work; staging and fittings low on the hull take the warm pools
      const yy = pp.getY(i);
      const low = 1 - smooth01((yy - 2) / 10);
      const lam = Math.max(0, nv.dot(KEY_DIR)) * (1.1 - 0.4 * smooth01((yy + 12) / 40));
      const k = lam * (0.35 + 1.2 * low);
      const k2 = Math.max(0, nv.dot(KEY2_DIR)) * 1.0;
      const base = 1 / 0.8; // undo the batch's front factor roughly
      cc.setXYZ(i, cc.getX(i) * base * (NIGHT.r * 1.6 + SODIUM.r * k + COOLW.r * k2), cc.getY(i) * base * (NIGHT.g * 1.6 + SODIUM.g * k + COOLW.g * k2), cc.getZ(i) * base * (NIGHT.b * 1.6 + SODIUM.b * k + COOLW.b * k2));
    }
    cc.needsUpdate = true;
  }
  group.add(new THREE.Mesh(fitGeo, fogMat()));

  // ---------------------------------------------------------------- the goliath crane
  // legs: lattice A-frames; the girders carry a stiffener texture and are lit from the lamps below
  const steel = new ShadedBatch('steel', 1.0, 0.72, 0.5, 0.36);
  steel.color('#4f5a66');
  for (const sx of [-1, 1]) {
    const lx = sx * LEG;
    for (const dz of [-1, 1]) {
      // one inclined lattice leg: four chords and zigzag bracing
      const foot = new THREE.Vector3(lx, GROUND_Y, CR_Z + dz * 14);
      const head = new THREE.Vector3(lx, CR_Y, CR_Z + dz * 3.2);
      const w0 = 1.6, w1 = 1.0;
      const corners = (p: THREE.Vector3, w: number) => [
        new THREE.Vector3(p.x - w, p.y, p.z - w), new THREE.Vector3(p.x + w, p.y, p.z - w),
        new THREE.Vector3(p.x + w, p.y, p.z + w), new THREE.Vector3(p.x - w, p.y, p.z + w),
      ];
      const cf = corners(foot, w0), ch = corners(head, w1);
      for (let k = 0; k < 4; k++) steel.beam(cf[k], ch[k], 0.45);
      const NSEG = 9;
      for (let s = 0; s < NSEG; s++) {
        const f0 = s / NSEG, f1 = (s + 1) / NSEG;
        for (let k = 0; k < 4; k++) {
          const a = cf[k].clone().lerp(ch[k], f0);
          const b = cf[(k + 1) % 4].clone().lerp(ch[(k + 1) % 4], f1);
          const b2 = cf[(k + 1) % 4].clone().lerp(ch[(k + 1) % 4], f0);
          steel.beam(a, b, 0.16);
          if (s % 3 === 0) steel.beam(a, b2, 0.18);
        }
      }
    }
    steel.box(3.4, 2.2, 34, lx, GROUND_Y + 1.1, CR_Z); // sill beam on the rail bogies
    steel.box(2.6, 1.0, 2.6, lx, GROUND_Y + 2.7, CR_Z - 14);
    steel.box(2.6, 1.0, 2.6, lx, GROUND_Y + 2.7, CR_Z + 14);
    steel.box(4.4, 2.4, 9, lx, CR_Y - 1.0, CR_Z); // leg head
  }
  steel.color('#3a434e');
  steel.box(6, 5, 6, -LEG + 6, CR_Y + 7.8, CR_Z); // machinery house
  // tower cranes on the quays: a lattice mast and a raised jib
  const TC: { x: number; z: number; h: number; jib: number; dir: number }[] = [
    { x: -36, z: -205, h: 22, jib: 28, dir: 1 },
    { x: 54, z: -172, h: 26, jib: 30, dir: -1 },
  ];
  steel.color('#34404c');
  const jibs: { head: THREE.Mesh; tc: (typeof TC)[number]; tip: THREE.Vector3 }[] = [];
  for (const tc of TC) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) steel.box(0.4, tc.h - GROUND_Y, 0.4, tc.x + dx * 1.2, (tc.h + GROUND_Y) / 2, tc.z + dz * 1.2);
    for (let y = GROUND_Y + 3; y < tc.h; y += 3) {
      steel.box(2.6, 0.2, 0.2, tc.x, y, tc.z + 1.2);
      steel.beam(new THREE.Vector3(tc.x - 1.2, y, tc.z + 1.2), new THREE.Vector3(tc.x + 1.2, y + 3, tc.z + 1.2), 0.14);
    }
    // the slewing head: cab, jib, counter-jib and weight, the A-frame and tie, the hoist rope
    const jb = new ShadedBatch('jib', 1.0, 0.72, 0.5, 0.36);
    jb.color('#34404c');
    jb.box(4, 3, 4, 0, tc.h + 1.5, 0);
    const tip = new THREE.Vector3(tc.dir * tc.jib * 0.9, tc.h + 2 + tc.jib * 0.42, 0);
    jb.beam(new THREE.Vector3(0, tc.h + 2, 0), tip, 1.1, 1.1);
    jb.beam(new THREE.Vector3(-tc.dir * 9, tc.h + 2.5, 0), new THREE.Vector3(0, tc.h + 2.5, 0), 1.2, 1.2);
    jb.box(3, 3, 3, -tc.dir * 9, tc.h + 1, 0);
    jb.beam(new THREE.Vector3(0, tc.h + 9, 0), tip, 0.15);
    jb.box(0.4, 9, 0.4, 0, tc.h + 6.5, 0);
    jb.box(0.08, 22, 0.08, tip.x, tip.y - 11, 0);
    const head = new THREE.Mesh(d.track(jb.build()), fogMat());
    head.position.set(tc.x, 0, tc.z);
    group.add(head);
    jibs.push({ head, tc, tip: new THREE.Vector3(tip.x, tip.y + 0.8, 0.8) });
  }
  // floodlight masts: two beside the stands (aimed at the deck) and two far back over the yards
  const MASTS: { x: number; z: number; h: number; aim: THREE.Vector3; cols: number; rows: number; size: number }[] = [
    { x: -27, z: -54, h: 11, aim: new THREE.Vector3(-4, 0, 0), cols: 4, rows: 3, size: 0.72 },
    { x: 27, z: -54, h: 11, aim: new THREE.Vector3(4, 0, 0), cols: 4, rows: 3, size: 0.72 },
    { x: -78, z: -76, h: 24, aim: new THREE.Vector3(-20, GROUND_Y, -100), cols: 3, rows: 2, size: 0.9 },
    { x: 84, z: -84, h: 26, aim: new THREE.Vector3(24, GROUND_Y, -110), cols: 3, rows: 2, size: 0.9 },
  ];
  // the masts are plain tapered steel columns (a lattice here was the busiest shape in the frame)
  // with a ladder cage and a head frame
  for (const t of MASTS) {
    const segs = 6;
    for (let k = 0; k < segs; k++) {
      const y0 = GROUND_Y + ((t.h - GROUND_Y) * k) / segs;
      const y1 = GROUND_Y + ((t.h - GROUND_Y) * (k + 1)) / segs;
      const w = 1.2 - 0.55 * ((k + 0.5) / segs);
      steel.color(k % 2 ? '#34414f' : '#384654');
      steel.box(w, y1 - y0, w, t.x, (y0 + y1) / 2, t.z);
    }
    steel.color('#2c3744');
    steel.box(0.06, t.h - GROUND_Y, 0.06, t.x - 0.35, (t.h + GROUND_Y) / 2, t.z + 0.75);
    steel.box(0.06, t.h - GROUND_Y, 0.06, t.x + 0.35, (t.h + GROUND_Y) / 2, t.z + 0.75);
    // the head frame and a catwalk
    steel.color('#3a4858');
    steel.box(7 * t.size, 0.3, 1.6, t.x, t.h + 0.1, t.z + 0.4);
    steel.box(0.5, 1.2, 0.5, t.x, t.h - 0.5, t.z);
  }
  const steelGeo = d.track(steel.build());
  // light from below on the leg heads and masts
  group.add(new THREE.Mesh(steelGeo, fogMat()));

  // the twin box girders, lit from the lamp banks hung under them (bright at the bottom edge)
  const girder = new ShadedBatch('girder', 0.9, 1.0, 0.6, 1.4);
  girder.color('#3e4853');
  girder.box(LEG * 2 + 12, 4.6, 2.8, 0, CR_Y + 2.3, CR_Z + 2.9);
  girder.box(LEG * 2 + 12, 4.6, 2.8, 0, CR_Y + 2.3, CR_Z - 2.9);
  girder.color('#343d47');
  girder.box(LEG * 2 + 12, 0.5, 8.6, 0, CR_Y + 4.85, CR_Z);
  // the walkway rail along the top, and a white band
  girder.color('#6c7782');
  girder.box(LEG * 2 + 12, 0.08, 0.08, 0, CR_Y + 6.2, CR_Z + 4.1);
  for (let x = -LEG - 5; x <= LEG + 5; x += 2.5) girder.box(0.08, 1.1, 0.08, x, CR_Y + 5.65, CR_Z + 4.1);
  const girderGeo = d.track(girder.build());
  gradeY(girderGeo, CR_Y, CR_Y + 5, 1.35, 0.7);
  {
    const p = girderGeo.getAttribute('position');
    const nn = girderGeo.getAttribute('normal');
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const az = Math.abs(nn.getZ(i));
      uv[i * 2] = (az > 0.5 ? p.getX(i) : p.getZ(i)) / 4;
      uv[i * 2 + 1] = (p.getY(i) - CR_Y) / 5;
    }
    girderGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  group.add(new THREE.Mesh(girderGeo, fogMat({ map: d.track(girderTexture()) })));
  // (the DRY DOCK 9 lettering that was painted here is gone: in the fight framings it sat cut off
  // at the top edge beside the clock, and read as random text; clean pass 2026-11-19)

  // trolley + hook + load (moved in update)
  const trolleyB = new ShadedBatch('trolley', 1.0, 0.85, 0.6, 1.2);
  trolleyB.color('#56606c');
  trolleyB.box(7, 3, 9.5, 0, CR_Y + 6.6, 0);
  trolleyB.color('#353b43');
  trolleyB.box(5, 1.2, 7.5, 0, CR_Y + 8.6, 0);
  const trolley = new THREE.Mesh(d.track(trolleyB.build()), fogMat());
  trolley.position.set(0, 0, CR_Z);
  group.add(trolley);
  const hookB = new ShadedBatch('hook', 1.0, 0.85, 0.6, 0.4);
  const HOOK_L = 4;
  hookB.color('#22282f');
  hookB.box(0.25, HOOK_L, 0.25, -0.8, -HOOK_L / 2, 0);
  hookB.box(0.25, HOOK_L, 0.25, 0.8, -HOOK_L / 2, 0);
  hookB.color('#8c7a3a');
  hookB.box(2.4, 2.2, 1.4, 0, -HOOK_L - 1, 0);
  // the load: a ship's anchor, a stockless one, slung by its shackle; a shape that reads at any size
  const SH_TOP = -HOOK_L - 2.2;
  hookB.color('#22282f');
  hookB.box(0.18, 1.0, 0.18, 0, SH_TOP - 0.5, 0);
  hookB.color('#3e4650');
  {
    const ring = new THREE.TorusGeometry(0.55, 0.16, 6, 14);
    hookB.add(ring, new THREE.Matrix4().makeTranslation(0, SH_TOP - 1.4, 0));
    ring.dispose();
  }
  hookB.box(0.75, 6.2, 0.6, 0, SH_TOP - 5.0, 0); // shank
  hookB.box(2.2, 1.0, 1.0, 0, SH_TOP - 8.3, 0); // crown
  for (const sx of [-1, 1]) {
    // the flukes: an arm out and up from the crown, a broad palm at its tip
    hookB.beam(new THREE.Vector3(sx * 0.8, SH_TOP - 8.4, 0), new THREE.Vector3(sx * 2.6, SH_TOP - 6.2, 0), 0.7, 0.7);
    hookB.box(1.1, 2.0, 0.5, sx * 2.8, SH_TOP - 5.9, 0, sx * -0.55);
  }
  const hook = new THREE.Mesh(d.track(hookB.build()), fogMat());
  const hookPivot = new THREE.Group();
  hookPivot.position.set(0, CR_Y + 5, 0);
  hookPivot.add(hook);
  trolley.add(hookPivot);

  // ---------------------------------------------------------------- containers (instanced)
  const contGeo = new THREE.BoxGeometry(12.2, 2.6, 2.44).toNonIndexed();
  contGeo.computeVertexNormals();
  {
    const n = contGeo.getAttribute('normal');
    const cols = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) {
      const k = n.getY(i) > 0.5 ? 1.0 : n.getZ(i) > 0.5 ? 0.78 : n.getY(i) < -0.5 ? 0.3 : 0.55;
      cols.set([k, k, k], i * 3);
    }
    contGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const uv = contGeo.getAttribute('uv');
    const p = contGeo.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 1.2, p.getY(i) / 2.6);
  }
  d.track(contGeo);
  const contMat = d.track(new THREE.MeshBasicMaterial({ vertexColors: true, map: d.track(corrugated()) }));
  const palette = ['#6a3a2e', '#2c4c56', '#303f52', '#5c5a52', '#7a6430', '#34413a', '#563034', '#385566'].map((h) => new THREE.Color(h));
  const slots: { x: number; z: number; ry: number; h: number }[] = [];
  const block = (x0: number, x1: number, z0: number, z1: number, ry: number, hMax: number, hMin = 1) => {
    const along = ry === 0;
    const sx = along ? 12.6 : 2.6;
    const sz = along ? 2.6 : 12.6;
    for (let x = x0; x < x1; x += sx) for (let z = z0; z > z1; z -= sz) {
      if (r() < 0.1) continue;
      slots.push({ x, z, ry, h: hMin + Math.floor(r() * (hMax - hMin + 1)) });
    }
  };
  block(-150, -64, -34, -50, 0, 2);
  block(66, 150, -34, -50, 0, 2);
  block(-120, -84, -96, -110, Math.PI / 2, 4);
  block(36, 112, -92, -104, Math.PI / 2, 4);
  block(-150, -90, -116, -160, 0, 3);
  block(48, 130, -116, -160, 0, 3);
  let total = 0;
  for (const s of slots) total += s.h;
  const cont = new THREE.InstancedMesh(contGeo, contMat, total);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const warmTint = new THREE.Color(1.6, 1.05, 0.62);
  let i = 0;
  for (const s of slots) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry);
    for (let k = 0; k < s.h; k++) {
      m4.compose(new THREE.Vector3(s.x + (r() - 0.5) * 0.2, GROUND_Y + 1.3 + k * 2.6, s.z + (r() - 0.5) * 0.4), q, new THREE.Vector3(1, 1, 1));
      cont.setMatrixAt(i, m4);
      // the stacks nearest a mast catch its light
      let lit = 0;
      for (const mt of MASTS) lit = Math.max(lit, Math.exp(-((s.x - mt.x) ** 2 + (s.z - mt.z) ** 2) / (2 * 26 * 26)));
      const c = palette[Math.floor(r() * palette.length)].clone().multiplyScalar(0.8);
      c.lerp(c.clone().multiply(warmTint), lit);
      cont.setColorAt(i, c);
      i++;
    }
  }
  cont.instanceMatrix.needsUpdate = true;
  group.add(cont);

  // ---------------------------------------------------------------- small lamps (instanced cards)
  const lampGeo = d.track(new THREE.PlaneGeometry(1, 1));
  const lampMat = d.track(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const lampList: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const warm = new THREE.Color('#ffc27a');
  const white = new THREE.Color('#e6efff');
  const lamp = (p: THREE.Vector3, sx: number, sy: number, cc: THREE.Color, k: number) => {
    const mm = new THREE.Matrix4().makeScale(sx, sy, 1).setPosition(p);
    lampList.push({ m: mm, c: cc.clone().multiplyScalar(k) });
  };
  // the ship: a row of bulwark lights on the forecastle and along the side, the mast head, aft windows
  for (let z = -6; z > -SHIP_L + 30; z -= 7) {
    const s = -z / SHIP_L;
    const top = MAIN_DECK_Y + 6.5 * Math.pow(Math.max(0, 1 - s * 5.5), 2);
    lamp(shipPt(-SHIP_B * Math.sqrt(THREE.MathUtils.smoothstep(s, 0, 0.3)) - 0.3, top + 0.5, z), 0.6, 0.4, warm, 1.3);
  }
  lamp(shipPt(0, forecastle + 13.3, -13.3), 0.6, 0.6, white, 1.6);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) {
    if (r() < 0.4) continue;
    // windows on the port face of the bridge house
    lamp(shipPt(-11.1, MAIN_DECK_Y + 2.2 + row * 3.0, aft - 4 + k * 2.6), 1.0, 0.8, r() < 0.8 ? warm : white, 0.8 + r() * 0.4);
  }
  // the bridge windows: a lit band across the front of the wheelhouse
  for (let k = 0; k < 7; k++) lamp(shipPt(-7.5 + k * 2.5, MAIN_DECK_Y + 12.8, aft + 4.6), 1.6, 1.0, white, 0.75);
  // portholes on the house front, three decks of them, most of them lit
  for (let row = 0; row < 3; row++) for (let k = 0; k < 8; k++) {
    if (r() < 0.3) continue;
    lamp(shipPt(-8.4 + k * 2.4, MAIN_DECK_Y + 2.4 + row * 3.1, aft + 6.1), 0.9, 0.7, r() < 0.75 ? warm : white, 0.7 + r() * 0.4);
  }
  // work lamps on each staging tower, facing the hull
  for (const s of stagings) for (let y = GROUND_Y + 4; y < MAIN_DECK_Y; y += 6.4) lamp(shipPt(s.x - 0.9, y, s.z + 2.6), 0.55, 0.4, warm, 1.8);
  // quay lights along the dock head, the tower crane cabs
  for (const tc of TC) lamp(new THREE.Vector3(tc.x + tc.dir * 2.1, tc.h + 1.6, tc.z + 2.1), 1.0, 0.8, warm, 1.1);
  // the vessel moored stern-on across the basin: its lamps join the yard's
  const vessel = buildVessel(d);
  group.add(vessel.group);
  for (const l of vessel.lamps) lamp(l.p, l.s, l.s * 0.75, l.c, 1);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampList.length + 6);
  lampList.forEach((l, k) => {
    lamps.setMatrixAt(k, l.m);
    lamps.setColorAt(k, l.c);
  });
  const beaconIdx = lampList.length;
  const beaconPos = [
    new THREE.Vector3(-LEG - 5, CR_Y + 5.4, CR_Z + 4.5),
    new THREE.Vector3(LEG + 5, CR_Y + 5.4, CR_Z + 4.5),
    new THREE.Vector3(TC[0].x + TC[0].dir * TC[0].jib * 0.9, TC[0].h + 2.8 + TC[0].jib * 0.42, TC[0].z + 0.8),
    new THREE.Vector3(TC[1].x + TC[1].dir * TC[1].jib * 0.9, TC[1].h + 2.8 + TC[1].jib * 0.42, TC[1].z + 0.8),
    new THREE.Vector3(MASTS[2].x, MASTS[2].h + 4.2, MASTS[2].z),
    new THREE.Vector3(MASTS[3].x, MASTS[3].h + 4.2, MASTS[3].z),
  ];
  const beaconCol = new THREE.Color('#ff3a2a');
  beaconPos.forEach((p, k) => {
    lamps.setMatrixAt(beaconIdx + k, new THREE.Matrix4().makeScale(0.9, 0.9, 1).setPosition(p));
    lamps.setColorAt(beaconIdx + k, beaconCol);
  });
  lamps.instanceMatrix.needsUpdate = true;
  group.add(lamps);

  // ---------------------------------------------------------------- the lamp banks (blown out) and their housings
  const banks: { pos: THREE.Vector3; aim: THREE.Vector3; w: number; h: number; mat: number }[] = [];
  for (const x of [-27, -16.5, -6, 6, 16.5, 27]) banks.push({ pos: new THREE.Vector3(x, CR_Y - 1.2, CR_Z + 4.6), aim: new THREE.Vector3(x * 0.35 + Math.sin(x * 1.7) * 3, PIT_Y, CR_Z + 40), w: 3.6, h: 1.6, mat: 0 });
  for (const t of MASTS) banks.push({ pos: new THREE.Vector3(t.x, t.h + 2.1 * t.size, t.z + 1.2), aim: t.aim, w: 6 * t.size, h: 3.4 * t.size, mat: 1 });
  const housing = new ShadedBatch('housing', 1.0, 0.7, 0.5, 0.3);
  housing.color('#1e252d');
  const faceMats = [
    d.track(new THREE.MeshBasicMaterial({ map: d.track(bankTexture(4, 2)), color: new THREE.Color(3.2, 2.8, 2.3) })),
    d.track(new THREE.MeshBasicMaterial({ map: d.track(bankTexture(4, 3)), color: new THREE.Color(3.2, 2.8, 2.3) })),
  ];
  const faceGeos = [d.track(new THREE.PlaneGeometry(1, 1)), d.track(new THREE.PlaneGeometry(1, 1))];
  const faceLists: THREE.Matrix4[][] = [[], []];
  for (const b of banks) {
    const fwd = new THREE.Vector3().subVectors(b.aim, b.pos).normalize();
    // the faces look at the aim point but always lean toward the camera so they read as lamps
    const look = fwd.clone().lerp(new THREE.Vector3(0, 0, 1), 0.55).normalize();
    const back = new THREE.Matrix4().lookAt(new THREE.Vector3(), look.clone().negate(), new THREE.Vector3(0, 1, 0));
    const hb = new THREE.BoxGeometry(b.w + 0.4, b.h + 0.4, 0.8);
    housing.add(hb, back.clone().setPosition(b.pos.clone().addScaledVector(look, -0.45)));
    hb.dispose();
    const fm = back.clone().scale(new THREE.Vector3(b.w, b.h, 1)).setPosition(b.pos.clone().addScaledVector(look, 0.02));
    faceLists[b.mat].push(fm);
  }
  group.add(new THREE.Mesh(d.track(housing.build()), fogMat()));
  faceLists.forEach((list, k) => {
    const im = new THREE.InstancedMesh(faceGeos[k], faceMats[k], list.length);
    list.forEach((mm, j) => im.setMatrixAt(j, mm));
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  });

  // ---------------------------------------------------------------- glows: glare, light pools, welding arcs
  const glowTex = d.track(glowTexture());
  const glowMat = d.track(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const glowList: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const glow = (p: THREE.Vector3, sx: number, sy: number, c: string | THREE.Color, k: number, flat = false) => {
    const mm = new THREE.Matrix4();
    if (flat) mm.makeRotationX(-Math.PI / 2);
    mm.scale(new THREE.Vector3(sx, sy, 1)).setPosition(p);
    glowList.push({ m: mm, c: new THREE.Color(c).multiplyScalar(k) });
  };
  for (const b of banks) {
    // glare in three layers: a tight hot core, a halo, a wide faint veil
    glow(b.pos.clone().add(new THREE.Vector3(0, 0, 0.7)), b.w * 1.25, b.h * 1.5, '#fff6ea', 0.55);
    glow(b.pos.clone().add(new THREE.Vector3(0, 0, 0.6)), b.w * 2.3, b.h * 3.0, '#ffd9a8', b.mat ? 0.42 : 0.38);
    glow(b.pos.clone().add(new THREE.Vector3(0, 0, 0.5)), b.w * 5.0, b.h * 6.5, '#ffcf96', 0.12);
  }
  // light pools on the quay and dock head under the floods
  glow(new THREE.Vector3(0, GROUND_Y + 0.05, DOCK_HEAD_Z + 6), 60, 16, '#c98a4a', 0.28, true);
  for (const s of stagings) glow(shipPt(s.x - 3, GROUND_Y + 0.05, s.z), 14, 14, '#c98a4a', 0.3, true);
  // the flood units along the dock edge: a hot face and a small glare each
  for (const h of floodHeads) {
    glow(h.clone().add(new THREE.Vector3(0.6, 0.2, 0.6)), 7, 4, '#ffcf96', 0.5);
    glow(h.clone().add(new THREE.Vector3(0.6, 0.2, 0.7)), 1.6, 0.8, '#fff4e4', 1.6);
  }
  // work lights pooling warm on the bow's lit flank, high enough to show over the left stand
  for (const [a, y, k] of [[4, 12.5, 0.26], [9, 9.5, 0.2], [15, 11, 0.16]] as const) {
    glow(shipPt(-halfBeam(a) - 0.6, y, -a), 10, 7, '#ffa860', k);
    glow(shipPt(-halfBeam(a) - 1.4, y - 2.6, -a + 0.5), 0.9, 0.6, '#fff0dc', 1.2);
  }
  // welding arcs on two staging towers: a bright core and a cold wash on the plating (flickered in update)
  const weldIdx = glowList.length;
  // high on the bow's lit flank, where they show over the left stand
  const welds = [shipPt(-halfBeam(5) - 1.2, 11.5, -5), shipPt(-halfBeam(11) - 1.2, 8.5, -11)];
  for (const w of welds) {
    glow(w, 9, 9, '#8fbfff', 0);
    glow(w, 1.4, 1.4, '#eef6ff', 0);
  }
  const bankGlows = banks.length * 3; // the first glows are the banks' glare, which flares with the crowd
  const glows = new THREE.InstancedMesh(d.track(new THREE.PlaneGeometry(1, 1)), glowMat, glowList.length);
  glowList.forEach((gl, k) => {
    glows.setMatrixAt(k, gl.m);
    glows.setColorAt(k, gl.c);
  });
  glows.instanceMatrix.needsUpdate = true;
  glows.renderOrder = 6;
  glows.frustumCulled = false;
  group.add(glows);

  // ---------------------------------------------------------------- beams in the haze
  const beamMat = (strength: number, color: string) => d.track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vAlong; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        vAlong = uv.y; // 1 at the lamp, 0 at the far end
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV; varying float vAlong; varying vec3 vW;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float n000 = hash(i), n100 = hash(i + vec3(1,0,0)), n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
        float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1)), n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
        return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
      }
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        // soft at the edges, hot near the lamp, falling away down its length and fading out
        float core = pow(facing, 2.4);
        float len = exp(-(1.0 - vAlong) * 2.4) * smoothstep(0.0, 0.45, vAlong);
        vec3 q = vW * 0.09 + vec3(uTime * 0.35, -uTime * 0.1, uTime * 0.2);
        float haze = 0.35 + 0.65 * (0.6 * noise(q) + 0.4 * noise(q * 2.3 + 7.0));
        float near = smoothstep(12.0, 45.0, distance(cameraPosition, vW));
        float a = uStrength * core * len * haze * near;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  }));
  const floodBeam = beamMat(0.12, '#ffd7a8');
  const beamMeshes: { mesh: THREE.Mesh; q0: THREE.Quaternion; k: number }[] = [];
  const driftQ = new THREE.Quaternion();
  const driftE = new THREE.Euler();
  const beamMats = [floodBeam];
  const cone = (r0: number, r1: number, len: number) => {
    const g = new THREE.CylinderGeometry(r0, r1, len, 24, 1, true);
    g.translate(0, -len / 2, 0);
    return d.track(g);
  };
  // the crane banks pour light down into the dock
  for (const b of banks) {
    if (b.mat !== 0) continue;
    const len = b.pos.distanceTo(b.aim) * 0.85;
    const mesh = new THREE.Mesh(cone(1.2, 10, len), floodBeam);
    mesh.position.copy(b.pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3().subVectors(b.aim, b.pos).normalize());
    beamMeshes.push({ mesh, q0: mesh.quaternion.clone(), k: beamMeshes.length });
    mesh.renderOrder = 5;
    group.add(mesh);
  }
  // ---------------------------------------------------------------- the basin
  const water = buildWater(d);
  group.add(water.group);
  for (const b of banks) if (b.mat === 0 && b.pos.x > BASIN.x0 - 14 && b.pos.x < BASIN.x1 + 14) water.addLight(b.pos, new THREE.Color('#ffc890').multiplyScalar(0.22), 1.4);
  for (const h of floodHeads) water.addLight(h, new THREE.Color('#ffb070').multiplyScalar(0.18), 1.2);
  for (const wl of vessel.waterLights) water.addLight(wl.p, wl.c, wl.w);
  // (the work boat that crossed the basin is gone: a small moving box with lamps right behind the
  // fight line; clean pass 2026-11-19)

  // ---------------------------------------------------------------- haze: layers of lit air
  const hazeMat = (color: string, strength: number, power: number) => d.track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uPow: { value: power } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uStrength; uniform float uPow;
      varying vec2 vUv; varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        float v = pow(1.0 - vUv.y, uPow);
        float side = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float n = 0.6 + 0.4 * noise(vec2(vW.x * 0.03 + uTime * 0.12, vW.y * 0.05 - uTime * 0.04));
        float a = uStrength * v * side * n;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  }));
  const hazeMats: THREE.ShaderMaterial[] = [];
  const haze = (x: number, y0: number, y1: number, z: number, w: number, color: string, strength: number, power = 1.6) => {
    const m = hazeMat(color, strength, power);
    hazeMats.push(m);
    const mesh = new THREE.Mesh(d.track(new THREE.PlaneGeometry(w, y1 - y0)), m);
    mesh.position.set(x, (y0 + y1) / 2, z);
    mesh.renderOrder = 4;
    group.add(mesh);
  };
  // in front of the stands (sits them back), over the dock head (sodium), and far back (teal)
  haze(0, GROUND_Y - 2, 6, -50, 220, '#2f5870', 0.1);
  haze(-40, GROUND_Y - 2, 12, -110, 70, '#c0844a', 0.16, 2.0);
  haze(-80, GROUND_Y - 2, 8, -112, 90, '#b07a48', 0.14, 2.2);
  haze(84, GROUND_Y - 2, 8, -118, 90, '#b07a48', 0.14, 2.2);
  haze(0, GROUND_Y - 6, 40, -300, 900, '#3a6a80', 0.22, 1.1);

  // ---------------------------------------------------------------- motion
  let trolleyX = 0;
  const tmpCol = new THREE.Color();
  const weldCol = [new THREE.Color('#8fbfff'), new THREE.Color('#eef6ff')];
  const yAxis = new THREE.Vector3(0, 1, 0);
  let pulseV = 0;
  let pulseShown = 0;
  const tmpV = new THREE.Vector3();
  const tmpO = new THREE.Vector3();
  return {
    group,
    lampMat,
    pulse(k: number) {
      pulseV = Math.max(pulseV, k);
    },
    update(t: number, dt: number) {
      // the lamp banks flare on big moments and settle back
      if (pulseV > 0 || pulseShown > 0) {
        pulseV = Math.max(0, pulseV - dt * 1.6);
        const f = 1 + 1.1 * pulseV;
        for (let k = 0; k < bankGlows; k++) glows.setColorAt(k, tmpCol.copy(glowList[k].c).multiplyScalar(f));
        floodBeam.uniforms.uStrength.value = 0.12 * (1 + 0.8 * pulseV);
        pulseShown = pulseV;
      }
      // the trolley creeps along the girder, pausing at each end; the load swings a little
      const cycle = 46;
      const ph = ((t + 14) % cycle) / cycle;
      const ease = (u: number) => THREE.MathUtils.smoothstep(u, 0, 1);
      // it works over the basin and the container quay, clear of the ship
      const A0 = 25, A1 = 11;
      let x: number;
      if (ph < 0.42) x = THREE.MathUtils.lerp(A0, A1, ease(ph / 0.42));
      else if (ph < 0.5) x = A1;
      else if (ph < 0.92) x = THREE.MathUtils.lerp(A1, A0, ease((ph - 0.5) / 0.42));
      else x = A0;
      const vx = x - trolleyX;
      trolleyX = x;
      trolley.position.x = x;
      hookPivot.rotation.z = Math.sin(t * 0.7) * 0.02 - THREE.MathUtils.clamp(vx, -0.2, 0.2) * 0.6;
      hookPivot.rotation.x = Math.sin(t * 0.43 + 1) * 0.012;
      for (let k = 0; k < beaconPos.length; k++) {
        const on = ((t + k * 0.37) % 2.4) < 0.9 ? 1.8 : 0.1;
        lamps.setColorAt(beaconIdx + k, tmpCol.copy(beaconCol).multiplyScalar(on));
      }
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
      // welders: bursts of a few seconds with gaps, a fast irregular flicker inside a burst
      for (let k = 0; k < welds.length; k++) {
        const cyc = (t + k * 3.7) % (7 + k * 2.3);
        const burst = cyc < 3.6 + k ? 1 : 0;
        const fl = 0.55 + 0.45 * Math.abs(Math.sin(t * 37.0 + k * 11.0) * Math.sin(t * 23.0 + k * 5.0));
        const v = burst * fl;
        glows.setColorAt(weldIdx + k * 2, tmpCol.copy(weldCol[0]).multiplyScalar(v * 0.8));
        glows.setColorAt(weldIdx + k * 2 + 1, tmpCol.copy(weldCol[1]).multiplyScalar(v * 2.2));
      }
      if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
      // the tower cranes slew their jibs slowly back and forth; the tip beacons ride along
      jibs.forEach((j, k) => {
        const a = Math.sin(t * (0.045 + k * 0.012) + k * 2.0) * 0.55;
        j.head.rotation.y = a;
        tmpV.copy(j.tip).applyAxisAngle(yAxis, a).add(tmpO.set(j.tc.x, 0, j.tc.z));
        beaconPos[2 + k].copy(tmpV);
        lamps.setMatrixAt(beaconIdx + 2 + k, m4.makeScale(0.9, 0.9, 1).setPosition(tmpV));
      });
      lamps.instanceMatrix.needsUpdate = true;
      for (const m of beamMats) m.uniforms.uTime.value = t;
      // the beams drift a little, each on its own slow swing, as if the lamps hang loose in the wind
      for (const bm of beamMeshes) {
        driftE.set(Math.sin(t * 0.17 + bm.k * 1.9) * 0.035, 0, Math.sin(t * 0.13 + bm.k * 2.7) * 0.05);
        bm.mesh.quaternion.copy(bm.q0).multiply(driftQ.setFromEuler(driftE));
      }
      for (const m of hazeMats) m.uniforms.uTime.value = t;
      water.update(t);
    },
  };
}
