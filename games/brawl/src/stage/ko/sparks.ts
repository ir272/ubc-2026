// Welding sparks (only the lethal hit's one short burst at the contact): hard-edged streaks in world space that fly along a line, fall under gravity and
// cool from arc white through hazard yellow and ember to a dull red before they go out.
// One pooled InstancedMesh, matrices written straight into the instance buffer.

import * as THREE from 'three';
import { LAYER } from '../api.ts';
import { PALETTE } from '../style.ts';
import type { Rand } from './kit.ts';

const MAX = 64;

export class Sparks {
  readonly mesh: THREE.InstancedMesh;
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly px = new Float32Array(MAX);
  private readonly py = new Float32Array(MAX);
  private readonly pz = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly age = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly w = new Float32Array(MAX);
  private readonly heat = new Float32Array(MAX);
  private n = 0;
  private readonly ramp: THREE.Color[];
  private readonly c = new THREE.Color();

  constructor() {
    // depth-tested: the lit figures of the lethal hold sit in front of the shower, so it pours
    // beside and behind the bodies, never over them
    this.mat = new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: true, depthWrite: false, fog: false, side: THREE.DoubleSide, transparent: true });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color('#ffffff'));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 960;
    this.mesh.layers.set(LAYER.FX);
    // white hot for most of the life, then a quick fall through yellow and ember
    this.ramp = ['#ffffff', '#ffffff', '#ffffff', '#fff6d0', PALETTE.hazard, PALETTE.ember, '#c2381a'].map((h) => new THREE.Color(h));
  }

  /** a spark at (x, y) moving along (dx, dy) at `speed` m/s, spread is the sideways share */
  emit(x: number, y: number, dx: number, dy: number, speed: number, spread: number, life: number, width: number, r: Rand, heat = 1): void {
    if (this.n >= MAX) return;
    const i = this.n++;
    const sx = -dy;
    const sy = dx;
    const side = r.sym() * spread;
    this.px[i] = x + r.sym() * 0.08;
    this.py[i] = y + r.sym() * 0.08;
    this.pz[i] = 0.9 + r.sym() * 0.4;
    this.vx[i] = (dx + sx * side) * speed;
    this.vy[i] = (dy + sy * side) * speed;
    this.age[i] = 0;
    this.life[i] = life;
    this.w[i] = width;
    this.heat[i] = heat;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  get alive(): number {
    return this.n;
  }

  update(dt: number): void {
    const g = 16;
    const drag = Math.exp(-dt * 1.6);
    let j = 0;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const colArr = this.mesh.instanceColor!.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      let vx = this.vx[i] * drag;
      let vy = this.vy[i] * drag - g * dt;
      const x = this.px[i] + vx * dt;
      const y = this.py[i] + vy * dt;
      // compact into slot j
      this.px[j] = x;
      this.py[j] = y;
      this.pz[j] = this.pz[i];
      this.vx[j] = vx;
      this.vy[j] = vy;
      this.age[j] = age;
      this.life[j] = this.life[i];
      this.w[j] = this.w[i];
      this.heat[j] = this.heat[i];
      const sp = Math.sqrt(vx * vx + vy * vy) || 1;
      const t = age / this.life[j];
      // a streak as long as the distance it covers in ~2.5 frames: reads as speed, not confetti
      const len = Math.max(0.06, Math.min(1.6, sp * 0.042)) * (1 - t * 0.4);
      const wd = this.w[j] * (1 - t * 0.6);
      const cs = vx / sp;
      const sn = vy / sp;
      const o = j * 16;
      // column-major 4x4: scale(len, wd) then rotate(angle) then translate
      m[o] = cs * len; m[o + 1] = sn * len; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = -sn * wd; m[o + 5] = cs * wd; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
      m[o + 12] = x - cs * len * 0.5; m[o + 13] = y - sn * len * 0.5; m[o + 14] = this.pz[j]; m[o + 15] = 1;
      // colour: cools with age, hotter sparks stay white longer
      const k = Math.min(this.ramp.length - 1.001, Math.max(0, (t * 1.25 - (this.heat[j] - 1) * 0.3) * (this.ramp.length - 1)));
      const a = Math.floor(k);
      this.c.copy(this.ramp[a]).lerp(this.ramp[a + 1], k - a);
      colArr[j * 3] = this.c.r;
      colArr[j * 3 + 1] = this.c.g;
      colArr[j * 3 + 2] = this.c.b;
      j++;
    }
    this.n = j;
    this.mesh.count = j;
    if (j > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, j * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.clearUpdateRanges();
      this.mesh.instanceColor!.addUpdateRange(0, j * 3);
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
