// The respawn pad: one plain steel plate with a side-colour face, lowered fast from above with the
// robot standing on it (action 'respawn'), hauled back up out of the frame when the robot steps
// off. One per side, built once. Clean pass: no cables, hook block, lugs or hazard stripes.

import * as THREE from 'three';
import { LAYER } from '../api.ts';
import type { FighterState } from '../../sim/types.ts';

const HAUL_S = 0.9;
const RISE_IN = 4.5; // metres the pad drops in from above in its first frames

export class RespawnPad {
  readonly group = new THREE.Group();
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly geo = new THREE.BoxGeometry(1.9, 0.16, 1.0);
  private state: 'off' | 'on' | 'haul' = 'off';
  private haulT = 0;
  private x = 0;
  private y = 0;

  constructor(sideColor: string) {
    this.group.name = 'ko-respawn-pad';
    const c = new THREE.Color('#3a4656').lerp(new THREE.Color(sideColor), 0.35);
    this.mat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.5, emissive: new THREE.Color(sideColor), emissiveIntensity: 0.25 });
    const plate = new THREE.Mesh(this.geo, this.mat);
    plate.position.y = -0.08;
    plate.castShadow = true;
    this.group.add(plate);
    this.group.traverse((o) => o.layers.set(LAYER.SET));
    this.group.visible = false;
  }

  reset(): void {
    this.state = 'off';
    this.group.visible = false;
  }

  update(dt: number, s: FighterState | null, prev: FighterState | null, alpha: number, _t: number): void {
    if (s && s.action === 'respawn') {
      this.x = prev && prev.action === 'respawn' ? prev.x + (s.x - prev.x) * alpha : s.x;
      this.y = prev && prev.action === 'respawn' ? prev.y + (s.y - prev.y) * alpha : s.y;
      this.state = 'on';
      // the pad arrives from higher than the sim's start point, fast, so it reads as lowered in
      const drop = Math.max(0, 1 - (s.actionFrame + alpha) / 12);
      this.place(this.x, this.y + RISE_IN * drop * drop);
      return;
    }
    if (this.state === 'on') {
      this.state = 'haul';
      this.haulT = 0;
    }
    if (this.state === 'haul') {
      this.haulT += dt;
      const k = this.haulT / HAUL_S;
      if (k >= 1) {
        this.reset();
        return;
      }
      this.place(this.x, this.y + 14 * k * k);
      return;
    }
    this.group.visible = false;
  }

  private place(x: number, y: number): void {
    this.group.visible = true;
    this.group.position.set(x, y, 0);
  }

  dispose(): void {
    this.mat.dispose();
    this.geo.dispose();
  }
}
