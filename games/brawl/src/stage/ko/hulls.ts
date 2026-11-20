// The robots during the lethal hold, lit by the arc. Two figures, each with its own light and its
// own shadow side: every rigid part of each fighter gets a copy drawn with a shader that takes the
// contact point as its only light (a hard white-blue welding arc just in front of the two bodies).
// The faces turned to the arc blow out toward white, the rest keep the robot's own paint, the far
// side falls to near black, emissive eyes and vents still burn.
//
// Hot effect parts on the robot (Kiln's furnace cone, jets) are drawn too, as solid arc-hot shapes:
// they are the strike itself, and without them a chest blast reads as arms flung away from the
// victim. No outline: an inverted-hull edge around each robot read as a sticker (clean pass).
//
// The copies are pulled toward the camera by scaling about the eye (which leaves the picture
// unchanged) by a different amount per robot, so each figure sits wholly in front of the set, the
// hit effects and the original robots, and the attacker wholly in front of the victim: a clean
// separating edge where they cross. While held, the two are pushed apart along the hit line
// (attacker back, victim forward, up to half a body each) so dark space shows between them, the
// victim creeps along the launch line with a hard shake and the attacker leans through the strike.
// Built once per fighter mesh; nothing allocates per frame.

import * as THREE from 'three';
import { LAYER } from '../api.ts';
import type { FighterView } from '../api.ts';
import { PALETTE } from '../style.ts';
import type { Rand } from './kit.ts';
import { toScreen } from './kit.ts';

interface Part {
  src: THREE.Mesh;
  side: 0 | 1;
  copy: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  /** a hot effect part (a furnace cone, a muzzle flash), not body */
  fx: boolean;
}

const VERT = /* glsl */ `
  uniform mat4 uEye;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * (uEye * wp);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uEmis;
  uniform vec3 uLight;
  uniform float uI;
  uniform float uFall;
  uniform vec3 uArc;
  uniform vec3 uShade;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 L = uLight - vW;
    float d = length(L);
    L /= max(d, 1e-3);
    float ndl = dot(N, L);
    float att = uI / (1.0 + d * d * uFall);
    float k = max(ndl, 0.0) * att;
    // hard tones: blown out, lit paint, the turn, the shadow side
    vec3 c;
    if (k > 1.05) c = uArc;
    else if (k > 0.62) c = mix(uBase * 1.5 + 0.06, uArc, 0.55);
    else if (k > 0.3) c = uBase * 1.15 + 0.015;
    else if (k > 0.1) c = uBase * 0.42;
    else c = uBase * 0.08 + uShade;
    c = max(c, uEmis);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

const tmpM = new THREE.Matrix4();
const growM = new THREE.Matrix4();
const box = new THREE.Box3();

export class EmberHulls {
  readonly group = new THREE.Group();
  private readonly parts: Part[] = [];
  private readonly bySrc = new Map<THREE.Mesh, Part>();
  private readonly seen = new Set<THREE.Mesh>();
  /** per side: eye scale, so each figure sits in its own depth slab in front of everything */
  private readonly eye: { value: THREE.Matrix4 }[] = [{ value: new THREE.Matrix4() }, { value: new THREE.Matrix4() }];
  private readonly hot = new THREE.Color(PALETTE.white).lerp(new THREE.Color(PALETTE.hazard), 0.18);
  private readonly shared = {
    uLight: { value: new THREE.Vector3() },
    uI: { value: 1.6 },
    uFall: { value: 0.55 },
    uArc: { value: new THREE.Color('#f2f7ff') },
    uShade: { value: new THREE.Color('#010205') },
  };
  /** per side: the hold's world transform (shift, lean) applied over the robot's own pose */
  private readonly hold: THREE.Matrix4[] = [new THREE.Matrix4(), new THREE.Matrix4()];
  private readonly boxes = [new THREE.Box3(), new THREE.Box3()];
  private readonly centre = [new THREE.Vector3(), new THREE.Vector3()];
  private shown = false;
  // the current hold
  private att: 0 | 1 = 0;
  private vic: 0 | 1 = 1;
  private dx = 1;
  private dy = 0;
  private shiftA = 0;
  private shiftV = 0;
  private hx = 0;
  private hy = 0;
  private readonly q = new THREE.Quaternion();
  private readonly ax = new THREE.Vector3(0, 0, 1);
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly zoomM = new THREE.Matrix4();
  private readonly scr = { x: 0, y: 0 };
  private readonly scrL = { x: 0, y: 0 };

  constructor() {
    this.group.name = 'ko-arc-figures';
  }

  private makeMat(side: 0 | 1, base: THREE.Color, emis: THREE.Color): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uEye: this.eye[side],
        uBase: { value: base },
        uEmis: { value: emis },
        uLight: this.shared.uLight,
        uI: this.shared.uI,
        uFall: this.shared.uFall,
        uArc: this.shared.uArc,
        uShade: this.shared.uShade,
      },
      transparent: true,
      depthWrite: true,
      depthTest: true,
    });
  }

  /** a throwaway mesh with both materials, so the shaders compile before they are needed */
  warmMesh(geo: THREE.BufferGeometry): THREE.Mesh {
    const c = new THREE.Mesh(geo, this.makeMat(0, new THREE.Color(1, 1, 1), new THREE.Color(0, 0, 0)));
    c.layers.set(LAYER.FX);
    return c;
  }

  /** find each fighter's rigid opaque meshes and make figures for new ones */
  scan(fighters: readonly (FighterView | null)[]): void {
    this.seen.clear();
    for (let s = 0; s < 2; s++) {
      const fv = fighters[s];
      if (!fv) continue;
      const side = s as 0 | 1;
      fv.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
        const g = m.geometry as THREE.BufferGeometry;
        if (!g || !g.attributes.position || !g.attributes.normal) return;
        const mat = m.material as THREE.Material;
        if (!mat || Array.isArray(mat) || !mat.visible) return;
        // the robot's hot effects (a furnace cone, jets, a muzzle flash: shader or additive
        // materials) are drawn solid and hot; other see-through parts (shadow, ground marker,
        // shield, swipes) are left out
        const fx = mat.transparent && ((mat as THREE.ShaderMaterial).isShaderMaterial || mat.blending === THREE.AdditiveBlending);
        if (mat.transparent && !fx) return;
        this.seen.add(m);
        const old = this.bySrc.get(m);
        if (old && old.side === side) return;
        if (old) this.drop(old);
        if (!g.boundingBox) g.computeBoundingBox();
        // the part's own paint and glow
        const sm = mat as THREE.MeshStandardMaterial;
        const base = fx ? this.hot.clone() : sm.color ? sm.color.clone() : new THREE.Color('#8a96a6');
        const emis = new THREE.Color(0, 0, 0);
        if (fx) emis.copy(this.hot);
        else if (sm.emissive && (sm.emissiveIntensity ?? 0) > 0.6) emis.copy(sm.emissive).multiplyScalar(Math.min(1.4, sm.emissiveIntensity));
        const cm = this.makeMat(side, base, emis);
        cm.side = fx ? THREE.DoubleSide : THREE.FrontSide;
        const copy = new THREE.Mesh(g, cm);
        copy.matrixAutoUpdate = false;
        copy.matrixWorldAutoUpdate = false;
        copy.frustumCulled = false;
        copy.layers.set(LAYER.FX);
        copy.visible = false;
        this.group.add(copy);
        const p: Part = { src: m, side, copy, mat: cm, fx };
        this.parts.push(p);
        this.bySrc.set(m, p);
      });
    }
    for (let i = this.parts.length - 1; i >= 0; i--) if (!this.seen.has(this.parts[i].src)) this.drop(this.parts[i]);
  }

  private drop(p: Part): void {
    this.group.remove(p.copy);
    p.mat.dispose();
    this.bySrc.delete(p.src);
    const i = this.parts.indexOf(p);
    if (i >= 0) this.parts.splice(i, 1);
  }

  private visibleSrc(src: THREE.Object3D): boolean {
    if (!src.parent) return false;
    for (let o: THREE.Object3D | null = src; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  /**
   * A new hold: the arc at (hx, hy), the hit line (dx, dy), who struck whom. Measures both robots
   * along the hit line and works out how far to push them apart so dark space shows between them.
   */
  begin(hx: number, hy: number, dx: number, dy: number, attacker: 0 | 1, victim: 0 | 1): void {
    this.hx = hx;
    this.hy = hy;
    this.att = attacker;
    this.vic = victim;
    // push mostly sideways: a robot driven into the deck reads as a clip, not a recoil
    let px = dx;
    let py = dy * 0.45;
    const l = Math.hypot(px, py);
    if (l < 1e-3) {
      px = attacker === 0 ? 1 : -1;
      py = 0;
    } else {
      px /= l;
      py /= l;
    }
    this.dx = px;
    this.dy = py;
    for (let s = 0; s < 2; s++) this.boxes[s].makeEmpty();
    for (const p of this.parts) {
      if (p.fx || !this.visibleSrc(p.src)) continue;
      p.src.updateWorldMatrix(true, false);
      box.copy(p.src.geometry.boundingBox!).applyMatrix4(p.src.matrixWorld);
      this.boxes[p.side].union(box);
    }
    const A = this.boxes[attacker];
    const V = this.boxes[victim];
    if (A.isEmpty() || V.isEmpty()) {
      this.shiftA = this.shiftV = 0;
      return;
    }
    A.getCenter(this.centre[attacker]);
    V.getCenter(this.centre[victim]);
    // each box as an interval along the push line
    const ext = (b: THREE.Box3) => ((b.max.x - b.min.x) / 2) * Math.abs(px) + ((b.max.y - b.min.y) / 2) * Math.abs(py);
    const ca = this.centre[attacker].x * px + this.centre[attacker].y * py;
    const cv = this.centre[victim].x * px + this.centre[victim].y * py;
    const ea = ext(A);
    const ev = ext(V);
    const gap = cv - ev - (ca + ea);
    const want = 0.55;
    const need = Math.max(0, want - gap);
    const wA = (A.max.x - A.min.x) * Math.abs(px) + (A.max.y - A.min.y) * Math.abs(py);
    const wV = (V.max.x - V.min.x) * Math.abs(px) + (V.max.y - V.min.y) * Math.abs(py);
    this.shiftV = Math.min(need * 0.62, wV * 0.5);
    this.shiftA = Math.min(need - this.shiftV, wA * 0.5);
    // what is still short goes to the victim, a little past its half body
    const left = need - this.shiftV - this.shiftA;
    if (left > 0) this.shiftV = Math.min(this.shiftV + left, wV * 0.7);
  }

  /**
   * Draw the figures this frame. `t` seconds into the hold, `k` 0..1 how far the push apart has
   * gone, `lightZ` how far in front of the bodies the arc burns, `r` for the shake.
   */
  show(camera: THREE.PerspectiveCamera, t: number, k: number, r: Rand, zoomWant = 1): void {
    this.shown = true;
    // the arc sits between the two bodies, in front of them
    const midX = this.hx + this.dx * (this.shiftV - this.shiftA) * 0.5 * k;
    const midY = this.hy + this.dy * (this.shiftV - this.shiftA) * 0.5 * k;
    this.shared.uLight.value.set(midX, midY, 0.8);
    // the figures' own push-in about the arc (the set is hidden behind them, so only they grow),
    // held back so neither body leaves the frame
    const zoom = Math.max(1, Math.min(zoomWant, this.fitZoom(camera, midX, midY, k, t)));
    this.zoomM.makeTranslation(midX, midY, 0).multiply(tmpM.makeScale(zoom, zoom, zoom)).multiply(growM.makeTranslation(-midX, -midY, 0));
    this.shared.uFall.value = 0.95 / (zoom * zoom);
    this.shared.uI.value = 2.1 + 0.2 * Math.sin(t * 71) + 0.14 * Math.sin(t * 157);
    // per side: the hold transform. victim: pushed along the line, creeping on, shaking hard,
    // turning away; attacker: back off the line a little, leaning on through the strike
    const sgn = this.dx >= 0 ? 1 : -1;
    for (let s = 0; s < 2; s++) {
      const victim = s === this.vic;
      const c = this.centre[s];
      let ox: number;
      let oy: number;
      let ang: number;
      if (victim) {
        const creep = this.shiftV * k + t * 0.55;
        const shake = 0.07 * (1 - Math.min(1, t * 1.2));
        ox = this.dx * creep + r.sym() * shake;
        oy = this.dy * creep + r.sym() * shake;
        ang = -sgn * (0.06 + t * 0.32);
      } else {
        const follow = t * 0.22;
        ox = -this.dx * this.shiftA * k + this.dx * follow;
        oy = -this.dy * this.shiftA * k + this.dy * follow * 0.5;
        ang = -sgn * Math.min(0.14, t * 0.3);
      }
      // T(c + o) R T(-c)
      this.q.setFromAxisAngle(this.ax, ang);
      this.pos.set(c.x + ox, c.y + oy, c.z);
      this.hold[s].compose(this.pos, this.q, this.one);
      tmpM.makeTranslation(-c.x, -c.y, -c.z);
      this.hold[s].multiply(tmpM);
      this.hold[s].premultiply(this.zoomM);
    }
    // eye scale: the attacker nearest the camera, the victim just behind it, both ahead of the set
    const e = camera.position;
    for (let s = 0; s < 2; s++) {
      const sc = s === this.att ? 0.5 : 0.62;
      this.eye[s].value.makeTranslation(e.x, e.y, e.z).multiply(tmpM.makeScale(sc, sc, sc)).multiply(growM.makeTranslation(-e.x, -e.y, -e.z));
    }
    for (const p of this.parts) {
      const vis = this.visibleSrc(p.src);
      p.copy.visible = vis;
      if (!vis) continue;
      p.src.updateWorldMatrix(true, false);
      p.copy.matrixWorld.multiplyMatrices(this.hold[p.side], p.src.matrixWorld);
      // render order: victim first, attacker last
      p.copy.renderOrder = p.side === this.att ? 955 : 951;
    }
  }

  /** the largest push-in about (lx, ly) that keeps both pushed-apart bodies inside the frame */
  private fitZoom(camera: THREE.PerspectiveCamera, lx: number, ly: number, k: number, t: number): number {
    toScreen(camera, lx, ly, 0, this.scrL);
    let z = 3;
    for (let s = 0; s < 2; s++) {
      const b = this.boxes[s];
      if (b.isEmpty()) continue;
      const sh = s === this.vic ? this.shiftV * k + 0.45 + 0 * t : -this.shiftA * k;
      const ox = this.dx * sh;
      const oy = this.dy * sh;
      for (let i = 0; i < 4; i++) {
        const x = (i & 1 ? b.max.x : b.min.x) + ox;
        const y = (i & 2 ? b.max.y : b.min.y) + oy;
        toScreen(camera, x, y, (b.min.z + b.max.z) / 2, this.scr);
        const dx = this.scr.x - this.scrL.x;
        const dy = this.scr.y - this.scrL.y;
        // room from the arc to the frame edge (px, centre origin), keeping off the HUD at the bottom
        const roomX = dx > 0 ? 590 - this.scrL.x : 590 + this.scrL.x;
        const roomY = dy > 0 ? 300 - this.scrL.y : 220 + this.scrL.y;
        if (Math.abs(dx) > 1) z = Math.min(z, roomX / Math.abs(dx));
        if (Math.abs(dy) > 1) z = Math.min(z, roomY / Math.abs(dy));
      }
    }
    return z;
  }

  /** world point where the arc burns this frame (between the pushed-apart bodies) */
  get light(): THREE.Vector3 {
    return this.shared.uLight.value;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    for (const p of this.parts) p.copy.visible = false;
  }

  dispose(): void {
    for (const p of this.parts) p.mat.dispose();
    this.parts.length = 0;
    this.bySrc.clear();
  }
}
