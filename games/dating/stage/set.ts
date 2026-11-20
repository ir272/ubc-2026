// The studio, made in code in the cel look (stage/LOOK.md "Clean look"). Static structure only: the
// lights module owns everything that switches per suitor (the lamp columns and the floor rings)
// and drives the house level of every painted surface built here.
//
// Nothing here is decoration. What stands in the room:
//   background  the curved back wall (a teal lounge behind the star, night blue on the suitors'
//               side) with one window onto a calm night city, and the betting clock
//   midground   a plain stage deck, the star's riser and heart-backed chair, four plain podiums
//   elsewhere   the booth: a small plain room behind the wall for the confessions
import * as THREE from 'three';
import { BOOTH, CLOCK, DECK, SPOTS, STAR, SUITOR_RISER, WALL, WALL_SPLIT, WINDOW } from './layout.ts';
import { PALETTE, SET } from './theme.ts';
import { STUDIO, clamp01, heartShape, type Kit } from './toon.ts';

export interface StudioSet {
  group: THREE.Group;
  /** remaining: 0..1 share of the open window left, or null when no window is open */
  setClock(remaining: number | null): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/** small deterministic PRNG for the city */
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

// the wall's arc, radians either side of its middle: longer on the star's side so the lounge wall
// fills the background of every reaction shot
const SPAN_R = 1.1;
const SPAN_L = 1.5;
const SPAN = (SPAN_R + SPAN_L) / 2;
/** z of the wall surface at world x */
export const wallZ = (x: number, r = WALL.radius) => WALL.center.z - Math.sqrt(r * r - (x - WALL.center.x) ** 2);
/** yaw that turns local +z to face out of the wall at world x (toward the room) */
const wallYaw = (x: number) => Math.atan2(WALL.center.x - x, WALL.center.z - wallZ(x));

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function buildSet(kit: Kit): StudioSet {
  const g = new THREE.Group();
  g.name = 'set';
  const geo = <T extends THREE.BufferGeometry>(x: T) => kit.geo(x);
  const mesh = (gm: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(gm, mat);
    m.position.set(x, y, z);
    return m;
  };
  const tex = (c: HTMLCanvasElement, aniso = 4) => {
    const t = kit.bin.add(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    return t;
  };
  const flatOnFloor = (m: THREE.Mesh, y: number) => {
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const inkFlat = kit.flat(PALETTE.ink);

  // ================================================================ floor: the pit and a plain deck
  g.add(flatOnFloor(mesh(geo(new THREE.PlaneGeometry(80, 80)), kit.house(STUDIO.pit)), 0));
  const deck = mesh(geo(new THREE.CircleGeometry(1, 128)), kit.house(STUDIO.deck), DECK.center.x, 0, DECK.center.z);
  flatOnFloor(deck, 0.004);
  deck.scale.set(DECK.rx, DECK.rz, 1);
  g.add(deck);

  // ================================================================ back wall (one painted cylinder)
  // u runs right to left along the arc: world x -> canvas px through the cylinder's theta.
  const WC = canvas(3584, 960);
  const wallTex = tex(WC, 4);
  {
    const c = WC.getContext('2d')!;
    const px = (x: number) => ((SPAN_R - Math.asin((x - WALL.center.x) / WALL.radius)) / (2 * SPAN)) * WC.width;
    const py = (y: number) => (1 - y / WALL.height) * WC.height;
    const xMin = WALL.center.x - WALL.radius * Math.sin(SPAN_L) - 0.01;
    const xMax = WALL.center.x + WALL.radius * Math.sin(SPAN_R) + 0.01;
    /** fill a world-space rectangle on the wall */
    const rect = (x0: number, x1: number, y0: number, y1: number, color: string) => {
      const a = px(Math.min(x1, xMax)), b = px(Math.max(x0, xMin));
      c.fillStyle = color;
      c.fillRect(Math.min(a, b), py(y1), Math.abs(b - a), py(y0) - py(y1));
    };
    const W = WINDOW;
    rect(xMin, xMax, 0, WALL.height, STUDIO.wall);
    // the lounge: one plain teal behind the star
    rect(xMin, WALL_SPLIT, 0, WALL.height, STUDIO.lounge);
    // skirting and cornice: one dark band each
    rect(xMin, xMax, 0, 0.32, STUDIO.cornice);
    rect(xMin, xMax, 5.4, WALL.height, STUDIO.cornice);
    // the window: an ink frame, two mullions, and a hole the city shows through
    rect(W.x0 - 0.16, W.x1 + 0.16, W.y0 - 0.16, W.y1 + 0.16, PALETTE.ink);
    c.clearRect(Math.min(px(W.x1), px(W.x0)), py(W.y1), Math.abs(px(W.x0) - px(W.x1)), py(W.y0) - py(W.y1));
    const panes = 3;
    for (let i = 1; i < panes; i++) {
      const x = W.x0 + ((W.x1 - W.x0) * i) / panes;
      rect(x - 0.05, x + 0.05, W.y0, W.y1, PALETTE.ink);
    }
  }
  const wall = mesh(
    geo(new THREE.CylinderGeometry(WALL.radius, WALL.radius, WALL.height, 112, 1, true, Math.PI - SPAN_R, SPAN_R + SPAN_L)),
    kit.house('#ffffff', { map: wallTex, side: THREE.BackSide, alphaTest: 0.5 }),
    WALL.center.x,
    WALL.height / 2,
    WALL.center.z,
  );
  g.add(wall);

  // ================================================================ the night city: sky, far and near
  type Layer = { c: HTMLCanvasElement; t: THREE.CanvasTexture; x0: number; x1: number; y0: number; y1: number; ppm: number };
  const layer = (z: number, x0: number, x1: number, y0: number, y1: number, ppm: number, transparent: boolean): Layer => {
    const c = canvas(Math.round((x1 - x0) * ppm), Math.round((y1 - y0) * ppm));
    const t = tex(c, 2);
    const m = mesh(
      geo(new THREE.PlaneGeometry(x1 - x0, y1 - y0)),
      kit.house('#ffffff', transparent ? { map: t, alphaTest: 0.5 } : { map: t }),
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      z,
    );
    g.add(m);
    return { c, t, x0, x1, y0, y1, ppm };
  };
  {
    const sky = layer(-12.4, -22, 30, -4, 15, 2, false);
    const c = sky.c.getContext('2d')!;
    c.fillStyle = STUDIO.skyMid;
    c.fillRect(0, 0, sky.c.width, sky.c.height);
  }
  // a few broad, plain buildings in two planes; a handful of lit windows on the near ones only
  const R = rng(1983);
  const drawCity = (L: Layer, minW: number, maxW: number, minTop: number, maxTop: number, body: string, windows: number) => {
    const c = L.c.getContext('2d')!;
    const px = (x: number) => (x - L.x0) * L.ppm;
    const py = (y: number) => (L.y1 - y) * L.ppm;
    const m = (v: number) => v * L.ppm;
    c.clearRect(0, 0, L.c.width, L.c.height);
    let x = L.x0;
    let prevTop = 0;
    while (x < L.x1) {
      const w = minW + R() * (maxW - minW);
      let top = minTop + R() * (maxTop - minTop);
      if (Math.abs(top - prevTop) < 0.5) top += top > (minTop + maxTop) / 2 ? -0.6 : 0.6;
      prevTop = top;
      c.fillStyle = body;
      c.fillRect(px(x), py(top), m(w), py(L.y0) - py(top));
      for (let k = 0; k < windows; k++) {
        if (R() > 0.45) continue;
        const wx = x + 0.3 + R() * Math.max(0.1, w - 0.75);
        const wy = L.y0 + 1.2 + R() * Math.max(0.1, top - L.y0 - 1.6);
        c.fillStyle = STUDIO.cityWin;
        c.fillRect(px(wx), py(wy + 0.18), m(0.22), m(0.18));
      }
      x += w + 0.5 + R() * 0.9;
    }
    L.t.needsUpdate = true;
  };
  drawCity(layer(-11.0, -16, 24, -1.5, 8, 24, true), 1.8, 3.2, 3.6, 6.0, STUDIO.cityFar, 0);
  drawCity(layer(-8.6, -10, 18, -1.5, 5.4, 48, true), 2.0, 3.4, 1.4, 3.2, STUDIO.cityNear, 2);

  // ================================================================ the clock (betting clock)
  // A studio clock on the lounge wall. Its face is lit while bets are open, the hand ticks round
  // the time left and stops at twelve at the lock (the face goes dark).
  const clock = new THREE.Group();
  clock.position.set(CLOCK.pos.x, CLOCK.pos.y, wallZ(CLOCK.pos.x) + 0.1);
  clock.rotation.y = wallYaw(CLOCK.pos.x);
  g.add(clock);
  const cr = CLOCK.radius;
  const body = mesh(geo(new THREE.CylinderGeometry(cr + 0.06, cr + 0.06, 0.12, 48)), kit.toon(PALETTE.ink), 0, 0, -0.04);
  body.rotation.x = Math.PI / 2;
  clock.add(body);
  clock.add(mesh(geo(new THREE.CircleGeometry(cr - 0.01, 48)), kit.switched(PALETTE.tungsten, STUDIO.clockFaceOff), 0, 0, 0.026));
  {
    const ticks = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.045, 0.12, 0.01)), inkFlat, 4);
    const o = new THREE.Object3D();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      o.position.set(Math.sin(a) * cr * 0.82, Math.cos(a) * cr * 0.82, 0.03);
      o.rotation.set(0, 0, -a);
      o.updateMatrix();
      ticks.setMatrixAt(i, o.matrix);
    }
    clock.add(ticks);
  }
  const handPivot = new THREE.Group();
  handPivot.position.z = 0.04;
  clock.add(handPivot);
  handPivot.add(mesh(geo(new THREE.BoxGeometry(0.055, cr * 0.84, 0.012)), inkFlat, 0, cr * 0.34, 0));
  clock.add(mesh(geo(new THREE.CircleGeometry(0.06, 16)), inkFlat, 0, 0, 0.05));
  let handTarget = 0;

  // ================================================================ the star's riser and chair
  const riser = new THREE.Group();
  riser.position.copy(STAR.riser);
  g.add(riser);
  const rh = STAR.riserHeight, rr = STAR.riserRadius;
  riser.add(mesh(geo(new THREE.CylinderGeometry(rr, rr + 0.03, rh, 64, 1, true)), kit.toon(STUDIO.riserSide), 0, rh / 2, 0));
  riser.add(flatOnFloor(mesh(geo(new THREE.CircleGeometry(rr, 64)), kit.toon(STUDIO.podiumTop)), rh));
  const redge = mesh(geo(new THREE.TorusGeometry(rr, 0.022, 6, 96)), inkFlat, 0, rh, 0);
  redge.rotation.x = Math.PI / 2;
  riser.add(redge);

  const chair = new THREE.Group();
  chair.name = 'chair';
  chair.position.set(STAR.seat.x, STAR.seat.y, STAR.seat.z);
  chair.rotation.y = STAR.yaw;
  g.add(chair);
  const coral = kit.toon(SET.chair);
  const seat = mesh(geo(new THREE.CylinderGeometry(0.58, 0.5, 0.36, 32)), coral, 0, 0.18, -0.05);
  kit.outline(seat, 0.02);
  chair.add(seat);
  {
    const backGeo = new THREE.ExtrudeGeometry(heartShape(1.3, 1.2), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 20 });
    backGeo.center();
    const back = mesh(geo(backGeo), coral, 0, 0.84, -0.58);
    back.rotation.x = -0.14;
    kit.outline(back, 0.022);
    chair.add(back);
  }

  // ================================================================ the suitors' side: four plain podiums
  // Each podium is a dark drum; its front (with the earned marks) is the marks module's, its lamp
  // column and floor ring the lights module's.
  const sr = SUITOR_RISER;
  const podMat = kit.toon(STUDIO.podium);
  const podGeo = geo(new THREE.CylinderGeometry(sr.radius, sr.radius + 0.04, sr.height, 48, 1, true));
  const topMat = kit.toon(STUDIO.podiumTop);
  const topGeo = geo(new THREE.CircleGeometry(sr.radius, 48));
  const lipGeo = geo(new THREE.TorusGeometry(sr.radius, 0.016, 6, 64));
  for (const p of SPOTS) {
    const sp = new THREE.Group();
    sp.position.copy(p);
    g.add(sp);
    sp.add(mesh(podGeo, podMat, 0, sr.height / 2, 0));
    sp.add(flatOnFloor(mesh(topGeo, topMat), sr.height));
    const lip = mesh(lipGeo, inkFlat, 0, sr.height, 0);
    lip.rotation.x = Math.PI / 2;
    sp.add(lip);
  }

  // ================================================================ the booth (a small room behind the wall)
  const booth = new THREE.Group();
  booth.position.copy(BOOTH.center);
  g.add(booth);
  const boothWall = kit.toon(SET.booth, { side: THREE.DoubleSide });
  booth.add(mesh(geo(new THREE.PlaneGeometry(4, 3.2)), boothWall, 0, 1.6, -0.9));
  for (const sx of [-1.6, 1.9]) {
    const sw = mesh(geo(new THREE.PlaneGeometry(3.4, 3.2)), boothWall, sx, 1.6, 0.6);
    sw.rotation.y = Math.PI / 2;
    booth.add(sw);
  }
  const bf = mesh(geo(new THREE.PlaneGeometry(4, 4)), kit.toon(SET.boothFloor), 0, 0.001, 0.6);
  bf.rotation.x = -Math.PI / 2;
  booth.add(bf);
  const ceil = mesh(geo(new THREE.PlaneGeometry(4, 4)), kit.toon(PALETTE.ink, { side: THREE.DoubleSide }), 0, 3.2, 0.6);
  ceil.rotation.x = Math.PI / 2;
  booth.add(ceil);

  return {
    group: g,
    setClock(remaining) {
      handTarget = remaining === null ? 0 : clamp01(remaining) * Math.PI * 2;
    },
    update() {
      // the hand moves in clock ticks, never a smooth sweep
      const handAngle = handTarget === 0 ? 0 : Math.round(handTarget / (Math.PI / 30)) * (Math.PI / 30);
      handPivot.rotation.z = -handAngle;
    },
    dispose() {},
  };
}
