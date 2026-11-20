// Cel-look material kit and a disposal bin. Every stage module builds its materials through one
// Kit (one per mounted stage) so the look stays one look: a stepped toon ramp, flat unlit colour
// for anything that emits light, inverted-hull outlines in ink.
import * as THREE from 'three';
import { PALETTE, mix } from './theme.ts';

/**
 * Studio colours for the set and its light. All mixed from the palette in theme.ts, so there is
 * still only one source of hues. Values are chosen for the house-down look (most of the show):
 * background 20 to 45 luma, the stage deck a step above, pools and lamps on top, the cast brightest.
 */
export const STUDIO = {
  // floor and deck (house up: deck about 30 luma, the suitors' walk a step above)
  pit: mix(PALETTE.ink, PALETTE.night, 0.35),
  deck: mix(PALETTE.night, PALETTE.dusk, 0.5),
  deckAlt: mix(PALETTE.night, PALETTE.dusk, 0.32),
  deckLine: mix(PALETTE.night, PALETTE.ink, 0.5),
  deckRing: mix(PALETTE.dusk, PALETTE.milk, 0.08),
  deckEdge: PALETTE.coral,
  walk: mix(PALETTE.dusk, PALETTE.teal, 0.2),
  // the back wall (about 30 luma at house up): night blue behind the suitors, a teal lounge for the star
  wall: mix(PALETTE.night, PALETTE.dusk, 0.3),
  wallSeam: mix(PALETTE.night, PALETTE.ink, 0.6),
  wallPanel: mix(PALETTE.night, PALETTE.dusk, 0.5),
  cornice: mix(PALETTE.ink, PALETTE.night, 0.4),
  lounge: mix(PALETTE.teal, PALETTE.night, 0.55),
  loungeSlat: mix(PALETTE.teal, PALETTE.ink, 0.66),
  loungeHigh: mix(PALETTE.teal, PALETTE.night, 0.7),
  // the night city through the window: sky darkest, buildings a step lighter, so they read as shapes
  skyTop: mix(PALETTE.ink, PALETTE.night, 0.3),
  skyMid: mix(PALETTE.ink, PALETTE.night, 0.75),
  skyLow: PALETTE.night,
  cityFar: mix(PALETTE.night, PALETTE.dusk, 0.55),
  cityFarSide: mix(PALETTE.night, PALETTE.dusk, 0.2),
  cityNear: mix(PALETTE.night, PALETTE.teal, 0.42),
  cityNearSide: mix(PALETTE.ink, PALETTE.teal, 0.3),
  cityWin: mix(PALETTE.tungsten, PALETTE.dusk, 0.38),
  cityWinBright: mix(PALETTE.tungsten, PALETTE.dusk, 0.12),
  cityWinCool: mix(PALETTE.mint, PALETTE.dusk, 0.5),
  glass: PALETTE.milk,
  // props
  riserSide: mix(PALETTE.teal, PALETTE.ink, 0.25),
  rugField: mix(PALETTE.teal, PALETTE.ink, 0.45),
  rugDot: mix(PALETTE.teal, PALETTE.mint, 0.35),
  leaf: mix(PALETTE.teal, PALETTE.mint, 0.3),
  pot: mix(PALETTE.coral, PALETTE.ink, 0.35),
  wood: mix(PALETTE.coral, PALETTE.ink, 0.62),
  podium: mix(PALETTE.dusk, PALETTE.ink, 0.25),
  podiumTop: mix(PALETTE.dusk, PALETTE.ink, 0.5),
  lampBox: mix(PALETTE.night, PALETTE.ink, 0.2),
  foreground: mix(PALETTE.ink, PALETTE.night, 0.12),
  foregroundRim: mix(PALETTE.teal, PALETTE.mint, 0.25),
  tally: PALETTE.coral,
  // light
  starPool: mix(PALETTE.tungsten, PALETTE.milk, 0.22),
  pick: PALETTE.milk,
  pickBeam: mix(PALETTE.milk, PALETTE.tungsten, 0.15),
  bulbOn: PALETTE.tungsten,
  bulbOff: mix(PALETTE.tungsten, PALETTE.ink, 0.78),
  clockFaceOff: mix(PALETTE.tungsten, PALETTE.ink, 0.8),
  signOn: PALETTE.coral,
  signOff: mix(PALETTE.coral, PALETTE.ink, 0.55),
  signBox: mix(PALETTE.ink, PALETTE.night, 0.4),
  signUnder: mix(PALETTE.night, PALETTE.dusk, 0.7),
} as const;

const lumaOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
/** the accent mixed from ink until it reaches a given luma, so every accent sits at the same value */
const accentAtLuma = (accent: string, target: number) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (lumaOf(mix(PALETTE.ink, accent, m)) < target) lo = m;
    else hi = m;
  }
  return mix(PALETTE.ink, accent, lo);
};

/** a lit podium top: the accent pushed toward milk, the brightest thing under a suitor */
export const litTop = (accent: string) => mix(accent, PALETTE.milk, 0.5);
/**
 * A lamp that is off: the accent sunk to one fixed value (about 40 luma) whatever its hue, never
 * black (Take Me Out's red off podium). Every off lamp reads as the same "off", none as half lit.
 */
export const darkAccent = (accent: string) => accentAtLuma(accent, 40);
/** a lamp box face that is on: the accent, held at or under a mid value so the cast in front stays brighter */
export const lampFace = (accent: string) => (lumaOf(accent) > 118 ? accentAtLuma(accent, 118) : accent);
/** a lit pool on the floor round a podium: the accent pushed hard toward milk at a mid value */
export const poolTint = (accent: string) => accentAtLuma(mix(accent, PALETTE.milk, 0.55), 96);

/** Collects GPU resources so destroy() can free them all. */
export class Bin {
  private items = new Set<{ dispose(): void }>();
  add<T extends { dispose(): void }>(x: T): T {
    this.items.add(x);
    return x;
  }
  /** remember every geometry and material under an object */
  track<T extends THREE.Object3D>(o: T): T {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry) this.items.add(m.geometry);
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => this.items.add(x));
      else if (mat) this.items.add(mat);
    });
    return o;
  }
  dispose() {
    for (const x of this.items) {
      try {
        x.dispose();
      } catch {
        /* already gone */
      }
    }
    this.items.clear();
  }
}

export class Kit {
  readonly bin = new Bin();
  readonly ramp: THREE.DataTexture;
  readonly outlineMat: THREE.MeshBasicMaterial;

  constructor() {
    // Three steps: shadow, mid, lit. Nearest filtering keeps the steps hard.
    const steps = [80, 170, 255];
    const data = new Uint8Array(steps.length * 4);
    steps.forEach((s, i) => data.set([s, s, s, 255], i * 4));
    this.ramp = this.bin.add(new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat));
    this.ramp.minFilter = THREE.NearestFilter;
    this.ramp.magFilter = THREE.NearestFilter;
    this.ramp.generateMipmaps = false;
    this.ramp.needsUpdate = true;
    this.outlineMat = this.bin.add(new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide }));
  }

  toon(color: string, opts: THREE.MeshToonMaterialParameters = {}) {
    return this.bin.add(new THREE.MeshToonMaterial({ color, gradientMap: this.ramp, ...opts }));
  }

  /** Unlit flat colour: lamps that are on, signs, foreground silhouettes. */
  flat(color: string, opts: THREE.MeshBasicMaterialParameters = {}) {
    return this.bin.add(new THREE.MeshBasicMaterial({ color, ...opts }));
  }

  /**
   * House-lit flat colour: painted set surfaces (wall, deck, city frame). The lights module scales
   * every one of them with the house level, so the room dims as a whole at the lock.
   */
  readonly houseMats: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  /** Things that switch with the house: marquee bulbs, the sign face, the clock face. */
  readonly houseSwitch: { mat: THREE.MeshBasicMaterial; on: THREE.Color; off: THREE.Color }[] = [];

  house(color: string, opts: THREE.MeshBasicMaterialParameters = {}) {
    const mat = this.flat(color, opts);
    this.houseMats.push({ mat, base: mat.color.clone() });
    return mat;
  }

  switched(on: string, off: string, opts: THREE.MeshBasicMaterialParameters = {}) {
    const mat = this.flat(off, opts);
    this.houseSwitch.push({ mat, on: new THREE.Color(on), off: new THREE.Color(off) });
    return mat;
  }

  private houseHooks: ((k: number, up: boolean) => void)[] = [];
  /** run something whenever the house level is applied (show or hide a drawn wash, say) */
  onHouse(fn: (k: number, up: boolean) => void) {
    this.houseHooks.push(fn);
  }

  /** k: 1 = house up, lower = dimmer. up: the switched things are lit. */
  applyHouse(k: number, up: boolean) {
    for (const h of this.houseMats) h.mat.color.copy(h.base).multiplyScalar(k);
    for (const s of this.houseSwitch) s.mat.color.copy(up ? s.on : s.off);
    for (const f of this.houseHooks) f(k, up);
  }

  /**
   * A drawn light shaft: only the far half of the cone is drawn (back faces), added on top of what
   * is behind it. It reads as a lighter hard-edged shape behind the subject and never veils a face.
   * Used for one thing only: the pick's spotlight.
   */
  shaft(color: string, strength: number) {
    const c = new THREE.Color(color).multiplyScalar(strength);
    return this.bin.add(
      new THREE.MeshBasicMaterial({
        color: c,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
  }

  /** A hard-edged translucent shape (light pool or beam). Never writes depth, so it never z-fights. */
  glass(color: string, opacity: number) {
    return this.bin.add(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
  }

  geo<T extends THREE.BufferGeometry>(g: T): T {
    return this.bin.add(g);
  }

  /**
   * Inverted-hull outline: a slightly fatter back-face copy in ink, as a child of the mesh so it
   * follows every move. `width` is in metres.
   */
  outline(mesh: THREE.Mesh, width = 0.022) {
    mesh.geometry.computeBoundingSphere();
    const r = mesh.geometry.boundingSphere?.radius || 0.5;
    const hull = new THREE.Mesh(mesh.geometry, this.outlineMat);
    hull.scale.setScalar(1 + width / r);
    hull.name = 'outline';
    mesh.add(hull);
    return hull;
  }

  private hulls = new Map<number, THREE.MeshBasicMaterial>();
  /**
   * Inverted hull pushed out along the normals: for merged or off-centre geometry (leaves, shelves)
   * where the scale hull above would slide off the shape.
   */
  hull(mesh: THREE.Mesh, width = 0.018) {
    let mat = this.hulls.get(width);
    if (!mat) {
      mat = this.bin.add(new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide }));
      mat.onBeforeCompile = (s) => {
        s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${width.toFixed(4)};`);
      };
      mat.customProgramCacheKey = () => `hull-${width}`;
      this.hulls.set(width, mat);
    }
    const hull = new THREE.Mesh(mesh.geometry, mat);
    hull.name = 'outline';
    mesh.add(hull);
    return hull;
  }

  dispose() {
    this.bin.dispose();
  }
}

/**
 * A chubby heart, centred on its box: lobes up (+y), point down. w and h are the full size. `path`
 * draws the same outline into a 2D context (canvas paths, Shape) for painted hearts.
 */
export function heartPath(
  p: { moveTo(x: number, y: number): unknown; bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): unknown },
  cx: number,
  cy: number,
  w: number,
  h: number,
  yUp = 1,
) {
  const X = (x: number) => cx + x * w;
  const Y = (y: number) => cy + y * h * yUp;
  p.moveTo(X(0), Y(0.22));
  p.bezierCurveTo(X(-0.04), Y(0.47), X(-0.5), Y(0.56), X(-0.5), Y(0.14));
  p.bezierCurveTo(X(-0.5), Y(-0.12), X(-0.16), Y(-0.28), X(0), Y(-0.5));
  p.bezierCurveTo(X(0.16), Y(-0.28), X(0.5), Y(-0.12), X(0.5), Y(0.14));
  p.bezierCurveTo(X(0.5), Y(0.56), X(0.04), Y(0.47), X(0), Y(0.22));
}
export function heartShape(w: number, h: number) {
  const s = new THREE.Shape();
  heartPath(s, 0, 0, w, h);
  return s;
}

export const easeInOut =(t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** frame-rate independent exponential approach of a toward b */
export const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);
