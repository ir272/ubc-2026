// Dry Dock 9 itself: the stepped dock walls (altars) on both sides of the pit the deck hangs in,
// with ladders, bollards and a waterline left by the last flooding, the dock floor with its line of
// keel blocks and the bilge blocks either side, and the caisson gate at the dock head that holds the
// basin back. Everything is unlit with baked shading: the copings catch the floods, the steps fall
// away into the dark of the pit.

import * as THREE from 'three';
import { GROUND_Y, ShadedBatch, rng, smooth01, type Disposer } from './util.ts';

/** the pit: floor level, the half width at the floor, the half width at the coping, its length */
export const DOCK = { floorY: -26, xFloor: 12.5, xTop: 19.5, z0: 46, z1: -92 };
const STEPS = 4;
/** the last flooding left a wet band below this level */
const WATERLINE_Y = -17.2;

export interface Dock {
  group: THREE.Group;
}

export function buildDock(d: Disposer): Dock {
  const group = new THREE.Group();
  group.name = 'dock';
  const r = rng(909);
  const b = new ShadedBatch('dock', 1.0, 0.78, 0.62, 0.4);
  const len = DOCK.z0 - DOCK.z1;
  const zc = (DOCK.z0 + DOCK.z1) / 2;
  const rise = (GROUND_Y - DOCK.floorY) / STEPS;
  const run = (DOCK.xTop - DOCK.xFloor) / STEPS;

  // ---- the floor and its blocks ----
  b.color('#161e26');
  b.box(DOCK.xFloor * 2 + 0.2, 1, len, 0, DOCK.floorY - 0.5, zc);
  // a drain channel either side of the floor
  b.color('#0d1318');
  for (const s of [-1, 1]) b.box(0.8, 0.05, len, s * (DOCK.xFloor - 1.2), DOCK.floorY + 0.02, zc);
  // keel blocks down the centre line, bilge blocks either side: a concrete base and a timber cap
  for (let z = DOCK.z0 - 6; z > DOCK.z1 + 4; z -= 1.8) {
    b.color('#3a4048');
    b.box(1.4, 1.1, 1.0, 0, DOCK.floorY + 0.55, z);
    b.color('#3b3430');
    b.box(1.2, 0.35, 0.9, 0, DOCK.floorY + 1.28, z);
  }
  for (const s of [-1, 1]) {
    for (let z = DOCK.z0 - 10; z > DOCK.z1 + 6; z -= 7.2) {
      b.color('#363c44');
      b.box(1.2, 1.6, 1.2, s * 6.5, DOCK.floorY + 0.8, z);
      b.color('#3b3430');
      b.box(1.0, 0.3, 1.0, s * 6.5, DOCK.floorY + 1.75, z);
    }
  }

  // ---- the altars: stepped walls, a riser facing the pit and a tread on each step ----
  for (const s of [-1, 1]) {
    for (let i = 0; i < STEPS; i++) {
      const xIn = DOCK.xFloor + run * i; // the riser's face
      const yTop = DOCK.floorY + rise * (i + 1);
      const wet = yTop < WATERLINE_Y + rise;
      // the wall block under this step (from the riser face out to the coping line)
      b.color(i === STEPS - 1 ? '#34404c' : '#2a3540');
      const w = DOCK.xTop + 4 - xIn;
      b.box(w, rise, len, s * (xIn + w / 2), yTop - rise / 2, zc);
      // the wet band below the waterline on this riser, and a pale salt line along its top
      if (yTop - rise < WATERLINE_Y) {
        const top = Math.min(yTop, WATERLINE_Y);
        const h = top - (yTop - rise);
        b.color('#1a232c');
        b.box(0.06, h, len, s * (xIn - 0.03), yTop - rise + h / 2, zc);
        if (yTop > WATERLINE_Y) {
          b.color('#55626e');
          b.box(0.07, 0.12, len, s * (xIn - 0.035), WATERLINE_Y, zc);
        }
      }
      void wet;
      // the step's nosing: a steel edge that catches the light
      b.color('#4a5664');
      b.box(0.3, 0.18, len, s * (xIn + 0.15), yTop + 0.02, zc);
    }
    // the coping and the quay edge kerb
    b.color('#56626e');
    b.box(1.2, 0.4, len, s * (DOCK.xTop + 0.6), GROUND_Y + 0.2, zc);
    // bollards along the coping (all steel: the odd yellow cap read as a random accent)
    for (let z = DOCK.z0 - 4; z > DOCK.z1 + 2; z -= 9) {
      b.color('#28303a');
      b.box(0.7, 0.8, 0.7, s * (DOCK.xTop + 1.8), GROUND_Y + 0.8, z);
      b.color('#3a4450');
      b.box(0.9, 0.2, 0.9, s * (DOCK.xTop + 1.8), GROUND_Y + 1.3, z);
    }
    // a railing along the quay edge, posts every 2 m
    b.color('#4a5664');
    b.box(0.06, 0.06, len, s * (DOCK.xTop + 0.2), GROUND_Y + 1.5, zc);
    b.box(0.05, 0.05, len, s * (DOCK.xTop + 0.2), GROUND_Y + 0.95, zc);
    for (let z = DOCK.z0; z > DOCK.z1; z -= 2) b.box(0.07, 1.1, 0.07, s * (DOCK.xTop + 0.2), GROUND_Y + 0.95, z);
    // ladders down the altars every 18 m: two stringers and rungs, one flight per step
    for (let z = DOCK.z0 - 8; z > DOCK.z1 + 4; z -= 18) {
      for (let i = 0; i < STEPS; i++) {
        const x = s * (DOCK.xFloor + run * i - 0.12);
        const y0 = DOCK.floorY + rise * i;
        b.color('#56626e');
        for (const dz of [-0.28, 0.28]) b.box(0.07, rise + 0.9, 0.07, x, y0 + (rise + 0.9) / 2, z + dz);
        b.color('#4a5664');
        for (let y = y0 + 0.3; y < y0 + rise; y += 0.32) b.box(0.05, 0.05, 0.56, x, y, z);
      }
    }
    // service pipes along the second step
    b.color('#2e3a46');
    b.box(0.35, 0.35, len, s * (DOCK.xFloor + run * 1 + 0.4), DOCK.floorY + rise * 2 + 0.3, zc);
  }

  // ---- the caisson gate at the dock head: a steel wall, a walkway and its railing ----
  b.color('#24303c');
  b.box(DOCK.xTop * 2 + 8, GROUND_Y - DOCK.floorY + 1.5, 4, 0, (GROUND_Y + DOCK.floorY + 1.5) / 2, DOCK.z1 - 2);
  b.color('#44505e');
  b.box(DOCK.xTop * 2 + 8, 0.2, 4.2, 0, GROUND_Y + 1.6, DOCK.z1 - 2);
  b.box(DOCK.xTop * 2 + 8, 0.06, 0.06, 0, GROUND_Y + 2.7, DOCK.z1 - 0.1);

  const geo = d.track(b.build());
  // light: the copings and the upper steps catch the floods, the pit falls into the dark; the near
  // end, under the deck lamps, is a touch warmer
  {
    const p = geo.getAttribute('position');
    const c = geo.getAttribute('color');
    for (let i = 0; i < p.count; i++) {
      const up = smooth01((p.getY(i) - DOCK.floorY) / (GROUND_Y + 2 - DOCK.floorY));
      const k = 0.38 + 0.85 * up;
      const near = smooth01((p.getZ(i) + 30) / 40) * up;
      c.setXYZ(i, c.getX(i) * k * (1 + 0.18 * near), c.getY(i) * k * (1 + 0.06 * near), c.getZ(i) * k * (1 - 0.05 * near));
    }
    c.needsUpdate = true;
  }
  group.add(new THREE.Mesh(geo, d.track(new THREE.MeshBasicMaterial({ vertexColors: true }))));
  return { group };
}
