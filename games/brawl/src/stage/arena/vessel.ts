// Dry Dock 9, the focal point behind the deck: a fitting-out vessel moored stern-on at the far end of
// the basin, framed by the goliath crane. A dark hull with a white superstructure, a stern A-frame,
// lit bridge windows, and a transom lit from below (no lettering). It sits in
// the haze: lower in contrast than the deck, cooler than the fighters.

import * as THREE from 'three';
import { ShadedBatch, canvasTex, smooth01, type Disposer } from './util.ts';
import { WATER_Y } from './water.ts';

/** where the transom's centre meets the waterline */
export const VESSEL_POS = new THREE.Vector3(2, WATER_Y, -206);
const HALF_B = 13;
const MAIN_DECK = 6.2; // above the waterline, at the stern
const LEN = 92;

export interface Vessel {
  group: THREE.Group;
  /** small lamps the yard draws for it: world position, size, colour */
  lamps: { p: THREE.Vector3; s: number; c: THREE.Color }[];
  /** lights the basin water should reflect */
  waterLights: { p: THREE.Vector3; c: THREE.Color; w: number }[];
  update(t: number): void;
}

/** the transom: dark plating lit from a work lamp below. No yard number: lettering right behind
 *  the fight line read as random text (clean pass, 2026-11-19). */
function transomTexture(): THREE.CanvasTexture {
  return canvasTex(512, 160, (g, W, H) => {
    g.fillStyle = '#1b2633';
    g.fillRect(0, 0, W, H);
    // plate seams
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < W; x += W / 9) g.fillRect(x, 0, 2, H);
    for (const y of [0.32, 0.64]) g.fillRect(0, y * H, W, 2);
    // the pool of the work lamp on the plating, warm, from below
    const rg = g.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, W * 0.48);
    rg.addColorStop(0, 'rgba(255,190,120,0.42)');
    rg.addColorStop(0.5, 'rgba(255,170,100,0.14)');
    rg.addColorStop(1, 'rgba(255,170,100,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    // a red boot stripe along the bottom edge
    g.fillStyle = '#6e2a22';
    g.fillRect(0, H * 0.9, W, H * 0.1);
  });
}

export function buildVessel(d: Disposer): Vessel {
  const group = new THREE.Group();
  group.name = 'vessel';
  const m = new THREE.Matrix4().setPosition(VESSEL_POS);
  const b = new ShadedBatch('vessel', 1.0, 0.82, 0.55, 0.3);
  const box = (c: string, w: number, h: number, dd: number, x: number, y: number, z: number) => {
    b.color(c);
    const g = new THREE.BoxGeometry(w, h, dd);
    b.add(g, new THREE.Matrix4().makeTranslation(x, y, z).premultiply(m));
    g.dispose();
  };
  const beam = (c: string, a: THREE.Vector3, e: THREE.Vector3, w: number) => {
    b.color(c);
    b.beam(a.clone().applyMatrix4(m), e.clone().applyMatrix4(m), w);
  };
  const HULL = '#141c27';
  const WHITE = '#7c8996';
  const GREY = '#5c6874';
  // hull: the stern block (its transom is a textured plane), the long body behind it, a bulwark
  box(HULL, HALF_B * 2, MAIN_DECK + 3, LEN, 0, (MAIN_DECK - 3) / 2, -LEN / 2 - 0.2);
  box('#6e2a22', HALF_B * 2 + 0.1, 0.7, LEN, 0, 0.2, -LEN / 2 - 0.2); // boot stripe at the waterline
  box('#d6dde3', HALF_B * 2 + 0.12, 0.25, LEN, 0, MAIN_DECK - 0.4, -LEN / 2 - 0.2); // sheer line
  box(HULL, 0.4, 1.3, LEN, -HALF_B + 0.2, MAIN_DECK + 0.65, -LEN / 2);
  box(HULL, 0.4, 1.3, LEN, HALF_B - 0.2, MAIN_DECK + 0.65, -LEN / 2);
  box('#2a3440', HALF_B * 2 - 0.8, 0.2, LEN - 2, 0, MAIN_DECK + 0.1, -LEN / 2 - 1);
  // the stern A-frame: two raked legs and a head beam, sheaves, and its hydraulic rams
  const AF = '#6c7782';
  for (const s of [-1, 1]) {
    beam(AF, new THREE.Vector3(s * 8.5, MAIN_DECK, -3.5), new THREE.Vector3(s * 7.5, MAIN_DECK + 13, -1.0), 1.0);
    beam(GREY, new THREE.Vector3(s * 8.5, MAIN_DECK, -9), new THREE.Vector3(s * 8.0, MAIN_DECK + 7, -2.6), 0.4);
  }
  box(AF, 16.5, 1.2, 1.2, 0, MAIN_DECK + 13.4, -1.0);
  box(GREY, 1.4, 1.6, 0.8, 0, MAIN_DECK + 12.2, -0.8);
  // the working deck: a few deck boxes and a reel, a knuckle crane on the starboard side
  box(GREY, 5, 2.4, 4, -6, MAIN_DECK + 1.2, -18);
  box('#3a4652', 3.6, 3.6, 3.6, 5, MAIN_DECK + 1.8, -14);
  box('#3a4652', 2.2, 7, 2.2, 10.5, MAIN_DECK + 3.5, -24);
  beam(AF, new THREE.Vector3(10.5, MAIN_DECK + 7, -24), new THREE.Vector3(3, MAIN_DECK + 12, -16), 0.8);
  // the superstructure forward: three white decks stepping back, the bridge on top with its wings
  const SZ = -34;
  box(WHITE, 22, 4, 16, 0, MAIN_DECK + 2, SZ - 8);
  box(WHITE, 20, 3.4, 15, 0, MAIN_DECK + 5.7, SZ - 1 - 7.5);
  box(WHITE, 18, 3.4, 14, 0, MAIN_DECK + 9.1, SZ - 2 - 7);
  box(WHITE, 26, 3.2, 8, 0, MAIN_DECK + 12.4, SZ - 1.5 - 4);
  box('#2a3440', 26.4, 0.3, 8.4, 0, MAIN_DECK + 14.15, SZ - 1.5 - 4);
  // window bands across each deck front (the lamps sit on them), white rails along the deck edges
  const BAND = '#26303c';
  box(BAND, 20, 1.1, 0.3, 0, MAIN_DECK + 2.2, SZ + 0.05);
  box(BAND, 18, 1.1, 0.3, 0, MAIN_DECK + 5.7, SZ - 0.95);
  box(BAND, 16, 1.1, 0.3, 0, MAIN_DECK + 9.2, SZ - 1.95);
  box('#1c2430', 25, 1.5, 0.3, 0, MAIN_DECK + 12.6, SZ - 1.45);
  const RAIL = '#aeb8c2';
  box(RAIL, 22, 0.12, 0.12, 0, MAIN_DECK + 4.6, SZ + 0.1);
  box(RAIL, 20, 0.12, 0.12, 0, MAIN_DECK + 8.0, SZ - 0.9);
  box(RAIL, 18, 0.12, 0.12, 0, MAIN_DECK + 11.4, SZ - 1.9);
  box(RAIL, HALF_B * 2 - 0.6, 0.1, 0.1, 0, MAIN_DECK + 1.5, -0.6);
  for (let x = -HALF_B + 1; x <= HALF_B - 1; x += 2) box(RAIL, 0.08, 1.2, 0.08, x, MAIN_DECK + 0.9, -0.6);
  // funnel and mast
  box('#22303e', 4.5, 7, 5, 0, MAIN_DECK + 17, SZ - 16);
  box(WHITE, 4.6, 0.8, 5.1, 0, MAIN_DECK + 19.4, SZ - 16);
  box(GREY, 0.5, 9, 0.5, 0, MAIN_DECK + 18.5, SZ - 8);
  box(GREY, 4.5, 0.25, 0.25, 0, MAIN_DECK + 21, SZ - 8);
  box(GREY, 0.8, 0.8, 0.8, 0, MAIN_DECK + 17.6, SZ - 7.7);
  // mooring: a fender and two lines down to the basin wall bollards either quarter
  for (const s of [-1, 1]) beam('#2c343c', new THREE.Vector3(s * (HALF_B - 1), MAIN_DECK + 0.8, -2), new THREE.Vector3(s * (HALF_B + 7), 1.4, 6), 0.12);

  const geo = d.track(b.build());
  // light: the deck floods pool on the aft deck and the house front (warm, falling off up and back);
  // the hull stays dark; everything lifts a little into the basin haze toward the waterline
  {
    const p = geo.getAttribute('position');
    const c = geo.getAttribute('color');
    const n = geo.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) - VESSEL_POS.y;
      const z = p.getZ(i) - VESSEL_POS.z;
      const front = Math.max(0, n.getZ(i));
      const pool = Math.exp(-((y - MAIN_DECK - 3) ** 2) / 60) * (0.5 + 0.5 * smooth01((z + 50) / 30));
      const k = 0.78 + 0.5 * pool * front;
      const warm = 0.12 * pool;
      c.setXYZ(i, c.getX(i) * k * (1 + warm), c.getY(i) * k * (1 + warm * 0.5), c.getZ(i) * k * (1 - warm * 0.3));
    }
    c.needsUpdate = true;
  }
  group.add(new THREE.Mesh(geo, d.track(new THREE.MeshBasicMaterial({ vertexColors: true }))));

  // the transom
  {
    const g = new THREE.PlaneGeometry(HALF_B * 2, MAIN_DECK + 3);
    const mesh = new THREE.Mesh(d.track(g), d.track(new THREE.MeshBasicMaterial({ map: d.track(transomTexture()), color: new THREE.Color(0.95, 0.95, 0.95) })));
    mesh.position.set(VESSEL_POS.x, VESSEL_POS.y + (MAIN_DECK - 3) / 2, VESSEL_POS.z + 0.05);
    group.add(mesh);
  }

  // the deck floods' pool on the working deck: a soft warm patch laid on the deck
  {
    const tex = d.track(canvasTex(64, 64, (g, W, H) => {
      const rg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.5, 'rgba(255,255,255,0.4)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    }));
    const pool = new THREE.Mesh(d.track(new THREE.PlaneGeometry(24, 30)), d.track(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffb877').multiplyScalar(0.32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(VESSEL_POS.x, VESSEL_POS.y + MAIN_DECK + 0.3, VESSEL_POS.z - 17);
    pool.renderOrder = 4;
    group.add(pool);
  }
  // lamps: bridge windows (a lit band), deck floods on the house front, mast lights (the transom
  // work lamp went with the yard number: alone, it was a stray bright dot behind the fight)
  const lamps: Vessel['lamps'] = [];
  const warm = new THREE.Color('#ffc98e');
  const cool = new THREE.Color('#dfe9ff');
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  for (let k = 0; k < 9; k++) lamps.push({ p: P(-9.6 + k * 2.4, MAIN_DECK + 12.6, SZ - 1.25), s: 1.5, c: warm.clone().multiplyScalar(0.75) });
  for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
    if ((row * 7 + k * 3) % 5 === 0) continue;
    lamps.push({ p: P(-7.5 + k * 3, MAIN_DECK + 2.2 + row * 3.5, SZ + 0.25 - row * 1.0), s: 0.9, c: (k + row) % 3 ? warm.clone().multiplyScalar(0.6) : cool.clone().multiplyScalar(0.55) });
  }
  lamps.push({ p: P(0, MAIN_DECK + 22.6, SZ - 8), s: 0.7, c: cool.clone().multiplyScalar(1.2) });
  for (const s of [-1, 1]) lamps.push({ p: P(s * 7.5, MAIN_DECK + 14.4, -0.4), s: 0.8, c: warm.clone().multiplyScalar(1.1) });
  // two deck floods on the house front, aimed down at the working deck
  for (const s of [-1, 1]) lamps.push({ p: P(s * 6, MAIN_DECK + 11.7, SZ + 0.6), s: 0.9, c: warm.clone().multiplyScalar(1.6) });
  const waterLights: Vessel['waterLights'] = [
    { p: P(0, MAIN_DECK + 12.6, SZ - 1.3), c: new THREE.Color('#ffc98e').multiplyScalar(0.1), w: 3.5 },
  ];
  return { group, lamps, waterLights, update() {} };
}
