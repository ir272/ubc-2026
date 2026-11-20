// Everything that switches: the suitor lamps (a plain lamp column and one ring of light on the
// floor: the accent when on, one sunk dark value when off; the cut flips them in one frame), the
// house lights (every painted surface of the set dims as one at the lock; the clock face goes
// dark), the viewer's own pick (that podium's ring turns milk), and the pick: one milk spotlight,
// everything else down.
//
// Light is drawn, never simulated. The only cone in the show is the pick's spotlight.
import * as THREE from 'three';
import { LAMP_BOX, LAMP_OFFSET, SPOTS, SUITOR_RISER, BOOTH, lampYaw } from './layout.ts';
import { LIGHT, PALETTE } from './theme.ts';
import { STUDIO, damp, darkAccent, lampFace, type Kit } from './toon.ts';

export type House = 'up' | 'down' | 'hold';

export interface Lights {
  group: THREE.Group;
  /** instant: a lamp is either on (accent) or off (dark) */
  setLamp(spot: number, on: boolean, accent?: string): void;
  setHouse(level: House, instant?: boolean): void;
  /** the pick's spotlight on a floor position, or null */
  setPick(pos: THREE.Vector3 | null): void;
  /** the viewer's own pick, by spot (null = none): that podium's ring turns milk */
  setHighlight(spot: number | null): void;
  /** where the camera is: the pick's cone is only drawn from far enough away to read as a beam */
  setCamera(pos: THREE.Vector3): void;
  update(dt: number, t: number): void;
}

/**
 * How bright the painted set is, per house state (1 = house up). These multiply linear colour, so
 * 0.55 reads as about 0.76 of the house-up value on screen: a clear drop, never a blackout.
 */
const ROOM = { up: 1, down: 0.55, hold: 0.4, pick: 0.32 } as const;
/** the toon-lit things (cast, props) dim less than the paint, so the cast always stays on top */
const AMBIENT = { up: LIGHT.houseUp, down: LIGHT.houseDown, hold: LIGHT.houseHold, pick: LIGHT.houseHold } as const;
/** the pick's cone starts above the top of every frame */
const PICK_TOP = 6;

export function buildLights(kit: Kit, scene: THREE.Scene): Lights {
  const g = new THREE.Group();
  g.name = 'lights';

  const ambient = new THREE.AmbientLight(LIGHT.ambientColor, LIGHT.houseDown);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(LIGHT.keyColor, LIGHT.key);
  key.position.set(-2.5, 7, 8);
  key.target.position.set(0.8, 0.8, -1);
  scene.add(key, key.target);
  const boothLight = new THREE.PointLight(PALETTE.tungsten, LIGHT.booth, 4.5, 1.6);
  boothLight.position.copy(BOOTH.bulb).add(new THREE.Vector3(0.3, -0.25, 0.9));
  scene.add(boothLight);

  // ---------------------------------------------------------------- suitor lamps
  const ringGeo = kit.geo(new THREE.RingGeometry(SUITOR_RISER.radius + 0.08, SUITOR_RISER.radius + 0.17, 64));
  const barGeo = kit.geo(new THREE.BoxGeometry(LAMP_BOX.w, LAMP_BOX.h, LAMP_BOX.d));

  type Lamp = { on: boolean; accent: THREE.Color; dark: THREE.Color; face: THREE.Color; ring: THREE.Mesh; bar: THREE.Mesh };
  const fallback = PALETTE.tungsten;
  const col = (m: THREE.Mesh) => (m.material as THREE.MeshBasicMaterial).color;
  const lamps: Lamp[] = SPOTS.map((p, i) => {
    const ring = new THREE.Mesh(ringGeo, kit.flat(darkAccent(fallback)));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.018, p.z);
    g.add(ring);
    const bar = new THREE.Mesh(barGeo, kit.flat(darkAccent(fallback)));
    bar.position.set(p.x, LAMP_BOX.h / 2, p.z + LAMP_OFFSET);
    bar.rotation.y = lampYaw(i);
    kit.outline(bar, 0.02);
    bar.name = `lamp-${i}`;
    g.add(bar);
    return { on: false, accent: new THREE.Color(fallback), dark: new THREE.Color(darkAccent(fallback)), face: new THREE.Color(lampFace(fallback)), ring, bar };
  });

  // ---------------------------------------------------------------- the pick spotlight
  const pickPool = new THREE.Mesh(kit.geo(new THREE.CircleGeometry(1.02, 64)), kit.flat(STUDIO.pick));
  pickPool.rotation.x = -Math.PI / 2;
  g.add(pickPool);
  // one hard-edged cone from above the frame: the pool's width at the floor
  const coneGeo = kit.geo(new THREE.CylinderGeometry(0.2, 1.02, PICK_TOP, 48, 1, true));
  const pickShaft = new THREE.Mesh(coneGeo, kit.shaft(STUDIO.pickBeam, 0.3));
  pickShaft.renderOrder = 2;
  g.add(pickShaft);
  pickPool.visible = pickShaft.visible = false;
  const milk = new THREE.Color(STUDIO.pick);
  let pickSpot = -1;
  let picking = false;
  let mine = -1;

  scene.add(g);
  let house: House = 'down';
  let houseLevel: number = LIGHT.houseDown;
  let room: number = ROOM.down;

  const paint = (i: number) => {
    const l = lamps[i];
    if (!l) return;
    const spot = picking && pickSpot === i;
    // in the pick, only the picked spot keeps a light: every other lamp shows the one "off" state
    const on = (l.on && !picking) || spot;
    col(l.bar).copy(on ? l.face : l.dark);
    col(l.ring).copy(mine === i ? milk : on ? l.accent : l.dark);
  };

  return {
    group: g,
    setLamp(spot, on, accent) {
      const l = lamps[spot];
      if (!l) return;
      if (accent) {
        l.accent.set(accent);
        l.dark.set(darkAccent(accent));
        l.face.set(lampFace(accent));
      }
      l.on = on;
      paint(spot);
    },
    setHouse(level, instant) {
      house = level;
      if (instant) {
        houseLevel = picking ? AMBIENT.pick : AMBIENT[level];
        room = picking ? ROOM.pick : ROOM[level];
      }
    },
    setPick(pos) {
      picking = !!pos;
      pickSpot = -1;
      pickPool.visible = pickShaft.visible = !!pos;
      if (pos) {
        SPOTS.forEach((s, i) => {
          if (Math.hypot(s.x - pos.x, s.z - pos.z) < 0.4) pickSpot = i;
        });
        const x = pickSpot >= 0 ? SPOTS[pickSpot]!.x : pos.x;
        const z = pickSpot >= 0 ? SPOTS[pickSpot]!.z : pos.z;
        pickPool.position.set(x, 0.015, z);
        pickShaft.position.set(x, PICK_TOP / 2, z);
      }
      lamps.forEach((_, i) => paint(i));
    },
    setHighlight(spot) {
      mine = spot !== null && SPOTS[spot] ? spot : -1;
      lamps.forEach((_, i) => paint(i));
    },
    setCamera(pos) {
      // up close the cone fills the whole background with a flat wash: it is a beam only from afar
      const d = Math.hypot(pos.x - pickPool.position.x, pos.z - pickPool.position.z);
      pickShaft.visible = picking && d > 4;
    },
    update(dt) {
      const state = picking ? 'pick' : house;
      // house lights come up and drop fast, like a switched bank, not a slow fade
      houseLevel = damp(houseLevel, AMBIENT[state], 9, dt);
      room = damp(room, ROOM[state], 9, dt);
      ambient.intensity = houseLevel;
      key.intensity = LIGHT.key * (0.75 + 0.25 * (houseLevel / LIGHT.houseUp));
      kit.applyHouse(room, house === 'up' && !picking);
    },
  };
}
