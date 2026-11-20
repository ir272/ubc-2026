// The hangout room, made in code in the cel look: a small clean room at night. A couch for the
// star, a rug, one large window onto a calm night city, one door, soft warm light. Nothing else
// (stage/LOOK.md "The hangout").
//
// Light is the only betting signal: while a window is open the room is warmer and brighter; at
// the lock it drops one step; the held pause before the pick drops it once more.
import * as THREE from 'three';
import { HANGOUT, PALETTE } from '../theme.ts';
import { damp, type Kit } from '../toon.ts';
import { COUCH, DOOR, RING, ROOM, WINDOW } from './blocking.ts';

export type HouseLevel = 'up' | 'down' | 'hold';

export interface Room {
  group: THREE.Group;
  setHouse(level: HouseLevel, instant?: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

/** painted surfaces: 1 = house up */
const PAINT = { up: 1, down: 0.74, hold: 0.52 } as const;
/** the toon-lit things (cast, couch): ambient and key */
const AMB = { up: 1.25, down: 0.95, hold: 0.62 } as const;
const KEY = { up: 2.0, down: 1.65, hold: 1.25 } as const;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildRoom(kit: Kit, scene: THREE.Scene): Room {
  const g = new THREE.Group();
  g.name = 'set';
  const geo = <T extends THREE.BufferGeometry>(x: T) => kit.geo(x);
  const mesh = (gm: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(gm, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0, H = ROOM.h;
  const cx = (ROOM.x0 + ROOM.x1) / 2, cz = (ROOM.z0 + ROOM.z1) / 2;

  // ---------------------------------------------------------------- floor and rug
  const floor = mesh(geo(new THREE.PlaneGeometry(W + 0.2, D + 0.2)), kit.house(HANGOUT.floor), cx, 0, cz);
  floor.rotation.x = -Math.PI / 2;
  // a few long board seams, drawn flat
  {
    const seams = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(0.018, D)), kit.house(HANGOUT.floorSeam), 14);
    const o = new THREE.Object3D();
    for (let i = 0; i < 14; i++) {
      o.position.set(ROOM.x0 + 0.35 + i * (W / 14), 0.002, cz);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      seams.setMatrixAt(i, o.matrix);
    }
    g.add(seams);
  }
  // a plain oval rug in front of the couch (where the group stands)
  const rugEdge = mesh(geo(new THREE.CircleGeometry(1, 72)), kit.house(HANGOUT.rugEdge), RING.c.x, 0.004, RING.c.z - 0.15);
  rugEdge.rotation.x = -Math.PI / 2;
  rugEdge.scale.set(2.05, 1.32, 1);
  const rug = mesh(geo(new THREE.CircleGeometry(1, 72)), kit.house(HANGOUT.rug), RING.c.x, 0.006, RING.c.z - 0.15);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.94, 1.21, 1);

  // ---------------------------------------------------------------- walls (the back wall has the window and the door cut out)
  const wallMat = kit.house(HANGOUT.wall, { side: THREE.DoubleSide });
  const sideMat = kit.house(HANGOUT.wallSide, { side: THREE.DoubleSide });
  const lowMat = kit.house(HANGOUT.wallLow, { side: THREE.DoubleSide });
  {
    const s = new THREE.Shape();
    s.moveTo(ROOM.x0, 0);
    s.lineTo(ROOM.x1, 0);
    s.lineTo(ROOM.x1, H);
    s.lineTo(ROOM.x0, H);
    s.closePath();
    const win = new THREE.Path();
    win.moveTo(WINDOW.x0, WINDOW.y0);
    win.lineTo(WINDOW.x0, WINDOW.y1);
    win.lineTo(WINDOW.x1, WINDOW.y1);
    win.lineTo(WINDOW.x1, WINDOW.y0);
    win.closePath();
    const door = new THREE.Path();
    door.moveTo(DOOR.x - DOOR.w / 2, 0.001);
    door.lineTo(DOOR.x - DOOR.w / 2, DOOR.h);
    door.lineTo(DOOR.x + DOOR.w / 2, DOOR.h);
    door.lineTo(DOOR.x + DOOR.w / 2, 0.001);
    door.closePath();
    s.holes.push(win, door);
    mesh(geo(new THREE.ShapeGeometry(s)), wallMat, 0, 0, ROOM.z0);
  }
  const side = (x: number, rot: number) => {
    const m = mesh(geo(new THREE.PlaneGeometry(D, H)), sideMat, x, H / 2, cz);
    m.rotation.y = rot;
  };
  side(ROOM.x0, Math.PI / 2);
  side(ROOM.x1, -Math.PI / 2);
  const front = mesh(geo(new THREE.PlaneGeometry(W, H)), wallMat, cx, H / 2, ROOM.z1);
  front.rotation.y = Math.PI;
  const ceil = mesh(geo(new THREE.PlaneGeometry(W + 0.2, D + 0.2)), kit.house(HANGOUT.ceiling, { side: THREE.DoubleSide }), cx, H, cz);
  ceil.rotation.x = Math.PI / 2;
  // a plain dark skirting band all round
  const skirt = (len: number, x: number, z: number, rot: number) => {
    const m = mesh(geo(new THREE.PlaneGeometry(len, 0.14)), lowMat, x, 0.07, z);
    m.rotation.y = rot;
  };
  skirt(DOOR.x - DOOR.w / 2 - ROOM.x0, (ROOM.x0 + DOOR.x - DOOR.w / 2) / 2, ROOM.z0 + 0.004, 0);
  skirt(ROOM.x1 - DOOR.x - DOOR.w / 2, (ROOM.x1 + DOOR.x + DOOR.w / 2) / 2, ROOM.z0 + 0.004, 0);
  skirt(D, ROOM.x0 + 0.004, cz, Math.PI / 2);
  skirt(D, ROOM.x1 - 0.004, cz, -Math.PI / 2);

  // ---------------------------------------------------------------- the window: a frame, two mullions, the city behind
  const ink = kit.toon(HANGOUT.doorFrame);
  const bar = (w: number, h: number, x: number, y: number, z: number, d = 0.12) => {
    const m = mesh(geo(new THREE.BoxGeometry(w, h, d)), ink, x, y, z);
    return m;
  };
  {
    const t = 0.1;
    const z = ROOM.z0;
    bar(WINDOW.x1 - WINDOW.x0 + 2 * t, t, (WINDOW.x0 + WINDOW.x1) / 2, WINDOW.y1 + t / 2, z);
    bar(WINDOW.x1 - WINDOW.x0 + 2 * t, t * 1.4, (WINDOW.x0 + WINDOW.x1) / 2, WINDOW.y0 - t * 0.7, z + 0.04, 0.26);
    bar(t, WINDOW.y1 - WINDOW.y0, WINDOW.x0 - t / 2, (WINDOW.y0 + WINDOW.y1) / 2, z);
    bar(t, WINDOW.y1 - WINDOW.y0, WINDOW.x1 + t / 2, (WINDOW.y0 + WINDOW.y1) / 2, z);
    for (const k of [1, 2]) bar(0.06, WINDOW.y1 - WINDOW.y0, WINDOW.x0 + ((WINDOW.x1 - WINDOW.x0) * k) / 3, (WINDOW.y0 + WINDOW.y1) / 2, z);
  }
  // the night city: a flat sky and two planes of broad plain buildings, a few lit windows
  const canvasTex = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const t = kit.bin.add(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 2;
    return { c, t };
  };
  {
    const sky = mesh(geo(new THREE.PlaneGeometry(40, 20)), kit.house(HANGOUT.sky), -1, 4, ROOM.z0 - 9);
    void sky;
    const R = rng(2026);
    const layer = (z: number, x0: number, x1: number, y0: number, y1: number, ppm: number, minW: number, maxW: number, minTop: number, maxTop: number, body: string, lit: boolean) => {
      const { c, t } = canvasTex(Math.round((x1 - x0) * ppm), Math.round((y1 - y0) * ppm));
      const ctx = c.getContext('2d')!;
      const px = (x: number) => (x - x0) * ppm, py = (y: number) => (y1 - y) * ppm;
      let x = x0;
      let prev = 0;
      while (x < x1) {
        const w = minW + R() * (maxW - minW);
        let top = minTop + R() * (maxTop - minTop);
        if (Math.abs(top - prev) < 0.6) top += top > (minTop + maxTop) / 2 ? -0.7 : 0.7;
        prev = top;
        ctx.fillStyle = body;
        ctx.fillRect(px(x), py(top), w * ppm, py(y0) - py(top));
        if (lit)
          for (let k = 0; k < 3; k++) {
            if (R() > 0.5) continue;
            const wx = x + 0.35 + R() * Math.max(0.1, w - 0.8);
            const wy = y0 + 2.2 + R() * Math.max(0.1, top - y0 - 2.8);
            ctx.fillStyle = HANGOUT.cityWin;
            ctx.fillRect(px(wx), py(wy + 0.25), 0.3 * ppm, 0.25 * ppm);
          }
        x += w + 0.6 + R() * 1.1;
      }
      t.needsUpdate = true;
      mesh(geo(new THREE.PlaneGeometry(x1 - x0, y1 - y0)), kit.house('#ffffff', { map: t, alphaTest: 0.5 }), (x0 + x1) / 2, (y0 + y1) / 2, z);
    };
    layer(ROOM.z0 - 7.5, -16, 12, -2, 9, 16, 2.4, 4.0, 4.5, 7.5, HANGOUT.cityFar, false);
    layer(ROOM.z0 - 4.5, -11, 8, -2, 6, 28, 2.2, 3.6, 1.8, 4.4, HANGOUT.cityNear, true);
  }

  // ---------------------------------------------------------------- the door: an open doorway onto a dark hall
  {
    const t = 0.1;
    const z = ROOM.z0;
    bar(DOOR.w + 2 * t, t, DOOR.x, DOOR.h + t / 2, z, 0.16);
    bar(t, DOOR.h, DOOR.x - DOOR.w / 2 - t / 2, DOOR.h / 2, z, 0.16);
    bar(t, DOOR.h, DOOR.x + DOOR.w / 2 + t / 2, DOOR.h / 2, z, 0.16);
    // the door leaf stands open into the hall
    const leaf = mesh(geo(new THREE.BoxGeometry(DOOR.w * 0.96, DOOR.h - 0.04, 0.05)), kit.toon(HANGOUT.door), 0, 0, 0);
    leaf.position.set(DOOR.x + DOOR.w / 2 - 0.03, DOOR.h / 2, z - DOOR.w * 0.48);
    leaf.rotation.y = Math.PI / 2 - 0.25;
    leaf.position.x -= Math.cos(0.25) * 0.02;
    // the hall: a dark box beyond
    const hall = kit.flat(HANGOUT.hall, { side: THREE.BackSide });
    const box = mesh(geo(new THREE.BoxGeometry(DOOR.w + 1.6, DOOR.h + 0.4, 2.6)), hall, DOOR.x, (DOOR.h + 0.4) / 2 - 0.01, z - 1.32);
    void box;
  }

  // ---------------------------------------------------------------- the couch: plain, chunky, coral
  {
    const couch = new THREE.Group();
    couch.name = 'couch';
    couch.position.set(COUCH.x, 0, COUCH.zFront - COUCH.depth / 2);
    g.add(couch);
    const body = kit.toon(HANGOUT.couch);
    const shade = kit.toon(HANGOUT.couchShade);
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, r = 0.08) => {
      const m = new THREE.Mesh(geo(roundBox(w, h, d, r)), mat);
      m.position.set(x, y, z);
      kit.outline(m, 0.018);
      couch.add(m);
      return m;
    };
    const armW = 0.26;
    const inner = COUCH.w - 2 * armW;
    // base, two seat cushions, the back, two arms, four stubby legs
    part(COUCH.w, 0.2, COUCH.depth, 0, 0.16, 0, shade, 0.05);
    for (const sx of [-1, 1]) part(inner / 2 - 0.02, 0.12, COUCH.depth - 0.24, (sx * inner) / 4, COUCH.seat - 0.06, 0.1, body, 0.05);
    part(COUCH.w, COUCH.back - 0.24, 0.26, 0, 0.24 + (COUCH.back - 0.24) / 2, -COUCH.depth / 2 + 0.13, body, 0.09);
    for (const sx of [-1, 1]) part(armW, COUCH.arm - 0.06, COUCH.depth, sx * (COUCH.w / 2 - armW / 2), 0.06 + (COUCH.arm - 0.06) / 2, 0, body, 0.08);
    const legGeo = geo(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 10));
    const legMat = kit.toon(HANGOUT.couchLeg);
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
      const l = new THREE.Mesh(legGeo, legMat);
      l.position.set(lx * (COUCH.w / 2 - 0.12), 0.04, lz * (COUCH.depth / 2 - 0.12));
      couch.add(l);
    }
  }

  scene.add(g);

  // ---------------------------------------------------------------- light: soft and warm, one key
  const amb = new THREE.AmbientLight(HANGOUT.cool, AMB.down);
  scene.add(amb);
  const key = new THREE.DirectionalLight(HANGOUT.key, KEY.down);
  key.position.set(1.8, 6.5, 6.5);
  key.target.position.set(0.4, 0.6, -1.2);
  scene.add(key, key.target);
  const warm = new THREE.Color(HANGOUT.warm), cool = new THREE.Color(HANGOUT.cool);
  let level: HouseLevel = 'down';
  let paint: number = PAINT.down, ambK: number = AMB.down, keyK: number = KEY.down, warmth = 0;

  return {
    group: g,
    setHouse(l, instant) {
      level = l;
      if (instant) {
        paint = PAINT[l];
        ambK = AMB[l];
        keyK = KEY[l];
        warmth = l === 'up' ? 1 : 0;
      }
    },
    update(dt) {
      // a dimmer, not a switch: about half a second
      paint = damp(paint, PAINT[level], 5, dt);
      ambK = damp(ambK, AMB[level], 5, dt);
      keyK = damp(keyK, KEY[level], 5, dt);
      warmth = damp(warmth, level === 'up' ? 1 : 0, 4, dt);
      amb.intensity = ambK;
      amb.color.copy(cool).lerp(warm, warmth);
      key.intensity = keyK;
      kit.applyHouse(paint * (1 + 0.06 * warmth), level === 'up');
    },
    dispose() {
      g.removeFromParent();
      amb.removeFromParent();
      key.removeFromParent();
      key.target.removeFromParent();
      void PALETTE;
    },
  };
}

/** a box with rounded vertical edges (an extruded rounded rectangle), centred */
function roundBox(w: number, h: number, d: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  r = Math.min(r, w / 2 - 0.001, d / 2 - 0.001);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const gm = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 4 });
  gm.rotateX(-Math.PI / 2);
  gm.translate(0, -h / 2, 0);
  gm.computeVertexNormals();
  return gm;
}
