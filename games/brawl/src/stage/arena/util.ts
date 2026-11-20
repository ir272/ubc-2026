// Dry Dock 9: shared helpers for the arena parts (geometry merging, baked shading, canvas textures,
// a seeded random so the set is identical on every load).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** the quay level: the yard is far below the deck */
export const GROUND_Y = -14;

/** a small deterministic PRNG (mulberry32) so the set never changes between loads */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Collects geometries for one material and merges them into a single mesh (one draw call). */
export class Batch {
  private parts: THREE.BufferGeometry[] = [];
  constructor(public name = 'batch') {}
  /** add a geometry transformed by the given matrix (the geometry is cloned) */
  add(geo: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    // keep the attribute sets identical so mergeGeometries accepts them
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    g.clearGroups();
    this.parts.push(g);
    return this;
  }
  /** add a box of size (w, h, d) at (x, y, z), optional rotation about z then y */
  box(w: number, h: number, d: number, x: number, y: number, z: number, rz = 0, ry = 0, rx = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YZX')),
      new THREE.Vector3(1, 1, 1),
    );
    this.add(g, m);
    g.dispose();
    return this;
  }
  /** a straight beam (box) between two points with a square-ish section */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, d = w): this {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return this;
    const g = new THREE.BoxGeometry(w, len, d);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.add(g, m);
    g.dispose();
    return this;
  }
  get empty(): boolean {
    return this.parts.length === 0;
  }
  build(): THREE.BufferGeometry {
    const hasColor = this.parts.some((p) => p.getAttribute('color'));
    if (hasColor) for (const p of this.parts) if (!p.getAttribute('color')) shade(p, 1, 1, 1, 1);
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!g) throw new Error(`arena: could not merge ${this.name}`);
    g.computeBoundingSphere();
    return g;
  }
}

/** Bake simple directional shading into vertex colours (for unlit background pieces):
 *  top faces get `top`, faces toward the camera `front`, sideways faces `side`, under faces `under`.
 *  `tint` multiplies everything. */
export function shade(g: THREE.BufferGeometry, top: number, front: number, side: number, under: number, tint = new THREE.Color(1, 1, 1)): THREE.BufferGeometry {
  const n = g.getAttribute('normal');
  const count = g.getAttribute('position').count;
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const nx = n ? n.getX(i) : 0;
    const ny = n ? n.getY(i) : 0;
    const nz = n ? n.getZ(i) : 1;
    let v: number;
    if (ny > 0.6) v = top;
    else if (ny < -0.6) v = under;
    else {
      // blend front and side by how much the face looks at the camera (+z)
      const f = Math.max(0, nz);
      v = side + (front - side) * f;
      // faces that look a little up catch some sky
      if (ny > 0) v += (top - v) * ny;
      if (Math.abs(nx) > 0.5 && nx > 0) v *= 0.92; // the right side a touch darker (key from the left)
    }
    col[i * 3] = v * tint.r;
    col[i * 3 + 1] = v * tint.g;
    col[i * 3 + 2] = v * tint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Same as Batch, but every added piece gets baked shading in a tint colour. */
export class ShadedBatch extends Batch {
  constructor(name: string, public top = 1, public front = 0.7, public side = 0.5, public under = 0.3) {
    super(name);
  }
  tint = new THREE.Color(1, 1, 1);
  override add(geo: THREE.BufferGeometry, m?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
    shade(g, this.top, this.front, this.side, this.under, this.tint);
    super.add(g);
    g.dispose();
    return this;
  }
  /** set the tint for the pieces added next */
  color(c: THREE.ColorRepresentation): this {
    this.tint = new THREE.Color(c);
    return this;
  }
}

/** a canvas texture made in code; `draw` paints it */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, opts: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = opts.aniso ?? 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** set planar UVs on a geometry from world-ish axes: u from `ua`, v from `va`, scaled by 1/size */
export function planarUV(g: THREE.BufferGeometry, ua: 'x' | 'y' | 'z', va: 'x' | 'y' | 'z', su = 1, sv = 1, ou = 0, ov = 0): void {
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  const get = (i: number, a: 'x' | 'y' | 'z') => (a === 'x' ? p.getX(i) : a === 'y' ? p.getY(i) : p.getZ(i));
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = get(i, ua) / su + ou;
    uv[i * 2 + 1] = get(i, va) / sv + ov;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** box-projected UVs (per face by its normal), metres -> uv by 1/scale */
export function boxUV(g: THREE.BufferGeometry, scale = 1): void {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (az >= ax) {
      u = p.getX(i);
      v = p.getY(i);
    } else {
      u = p.getZ(i);
      v = p.getY(i);
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export interface Disposer {
  track<T extends { dispose(): void }>(x: T): T;
  dispose(): void;
}
export function disposer(): Disposer {
  const list: { dispose(): void }[] = [];
  return {
    track<T extends { dispose(): void }>(x: T): T {
      list.push(x);
      return x;
    },
    dispose() {
      for (const d of list) d.dispose();
      list.length = 0;
    },
  };
}

/** smooth 0..1 */
export function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
