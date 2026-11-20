// Small shared tools for the knockout pieces: a seeded random, a screen-space plane locked to the
// camera (authored in 1280x720 px, origin at the centre, y up), and a batch of flat triangles
// rebuilt in place every frame (no allocation after creation).

import * as THREE from 'three';

/** mulberry32: deterministic so captures repeat exactly */
export class Rand {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }
  seed(n: number): void {
    this.s = (n * 2654435761) >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** -1..1 */
  sym(): number {
    return this.next() * 2 - 1;
  }
}

export const SCREEN_W = 1280;
export const SCREEN_H = 720;

const fwd = new THREE.Vector3();
const tmp = new THREE.Vector3();

/** Keep `g` on a plane just in front of the camera, scaled so one local unit is one UI px. */
export function lockToCamera(g: THREE.Object3D, cam: THREE.PerspectiveCamera): void {
  const D = Math.max(cam.near * 1.6, 0.8);
  fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
  g.position.copy(cam.position).addScaledVector(fwd, D);
  g.quaternion.copy(cam.quaternion);
  const h = 2 * D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.max(1e-3, cam.zoom);
  g.scale.setScalar(h / SCREEN_H);
  g.updateMatrixWorld(true);
}

/** world point -> screen px (centre origin, y up). Call cam.updateMatrixWorld() first. */
export function toScreen(cam: THREE.PerspectiveCamera, x: number, y: number, z: number, out: { x: number; y: number }): void {
  tmp.set(x, y, z).project(cam);
  out.x = tmp.x * (SCREEN_W / 2);
  out.y = tmp.y * (SCREEN_H / 2);
}

/** screen px (centre origin) -> world point on the plane z = zPlane */
export function screenToWorld(cam: THREE.PerspectiveCamera, px: number, py: number, zPlane: number, out: THREE.Vector3): THREE.Vector3 {
  tmp.set(px / (SCREEN_W / 2), py / (SCREEN_H / 2), 0.5).unproject(cam);
  tmp.sub(cam.position);
  const k = Math.abs(tmp.z) < 1e-6 ? 0 : (zPlane - cam.position.z) / tmp.z;
  out.copy(cam.position).addScaledVector(tmp, k);
  return out;
}

/** colours as linear THREE.Color (vertex colours are not converted by three) */
export function lin(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

export function mixColor(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** Flat, hard-edged triangles, rebuilt every frame. Draw order = call order. */
export class TriBatch {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly max: number;
  private n = 0;

  /** `onTop`: sort with the transparent objects (drawn after them, by renderOrder) */
  constructor(maxTris: number, layer: number, renderOrder: number, onTop = false) {
    this.max = maxTris;
    this.pos = new Float32Array(maxTris * 9);
    this.col = new Float32Array(maxTris * 9);
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.colAttr = new THREE.BufferAttribute(this.col, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('color', this.colAttr);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      transparent: onTop,
    });
    // one pass in call order: a transparent double-sided material would otherwise draw all its
    // back-wound triangles first, and draw order is the whole point of this batch
    this.mat.forceSinglePass = true;
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.layers.set(layer);
    this.mesh.matrixAutoUpdate = false;
  }

  begin(): void {
    this.n = 0;
  }

  get count(): number {
    return this.n;
  }

  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: THREE.Color): void {
    if (this.n >= this.max) return;
    const o = this.n * 9;
    const p = this.pos;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = 0;
    p[o + 3] = bx; p[o + 4] = by; p[o + 5] = 0;
    p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = 0;
    const q = this.col;
    for (let i = 0; i < 9; i += 3) {
      q[o + i] = c.r;
      q[o + i + 1] = c.g;
      q[o + i + 2] = c.b;
    }
    this.n++;
  }

  /** a, b, c, d in order around the edge */
  quad(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, c: THREE.Color): void {
    this.tri(ax, ay, bx, by, cx, cy, c);
    this.tri(ax, ay, cx, cy, dx, dy, c);
  }

  end(): void {
    this.geo.setDrawRange(0, this.n * 3);
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.posAttr.clearUpdateRanges();
      this.posAttr.addUpdateRange(0, this.n * 9);
      this.posAttr.needsUpdate = true;
      this.colAttr.clearUpdateRanges();
      this.colAttr.addUpdateRange(0, this.n * 9);
      this.colAttr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
export const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
