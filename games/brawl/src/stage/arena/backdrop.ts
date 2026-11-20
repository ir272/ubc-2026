// Dry Dock 9, far layer: the night sky (deep navy to teal with a thin amber band at the horizon),
// the sea, the far harbour shore with its lights, and a pilot boat that crosses slowly.
// Nothing here is lit; colours are chosen so the far layer sits back behind haze.

import * as THREE from 'three';
import { ShadedBatch, rng, type Disposer } from './util.ts';

/** the eye the sky is painted for (near the fight camera) and the horizon elevation, degrees */
export const EYE = new THREE.Vector3(0, 4, 25);
export const HORIZON_DEG = -1.2;
const SKY_R = 640;
const SHORE_Z = -430;

export const SKY = {
  top: '#040a15',
  high: '#081628',
  mid: '#0d2537',
  low: '#173f50',
  amber: '#c4823a',
  sea: '#0a1824',
  seaDeep: '#050b12',
  shore: '#0e2230',
  shoreFar: '#13303f',
};

/** world y of the horizon at a given z (so far pieces can sit on it) */
export function horizonY(z: number): number {
  return EYE.y + Math.tan(THREE.MathUtils.degToRad(HORIZON_DEG)) * (EYE.z - z);
}

export interface Backdrop {
  group: THREE.Group;
  update(t: number): void;
}

export function buildBackdrop(d: Disposer): Backdrop {
  const group = new THREE.Group();
  group.name = 'backdrop';
  const col = (h: string) => new THREE.Color(h);

  // ---- sky and sea: one dome, painted by elevation from EYE ----
  const skyMat = d.track(new THREE.ShaderMaterial({
    uniforms: {
      uEye: { value: EYE.clone() },
      uHor: { value: HORIZON_DEG },
      uTime: { value: 0 },
      cTop: { value: col(SKY.top) },
      cHigh: { value: col(SKY.high) },
      cMid: { value: col(SKY.mid) },
      cLow: { value: col(SKY.low) },
      cAmber: { value: col(SKY.amber) },
      cSea: { value: col(SKY.sea) },
      cSeaDeep: { value: col(SKY.seaDeep) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uEye; uniform float uHor; uniform float uTime;
      uniform vec3 cTop, cHigh, cMid, cLow, cAmber, cSea, cSeaDeep;
      varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec3 d = normalize(vW - uEye);
        float e = degrees(asin(clamp(d.y, -1.0, 1.0))) - uHor; // elevation above the horizon
        float az = atan(d.x, -d.z);
        vec3 c;
        if (e >= 0.0) {
          c = mix(cLow, cMid, smoothstep(0.0, 6.0, e));
          c = mix(c, cHigh, smoothstep(5.0, 16.0, e));
          c = mix(c, cTop, smoothstep(14.0, 34.0, e));
          // a faint, very large cloud deck catching the yard's glow
          float cl = noise(vec2(az * 9.0 + uTime * 0.004, e * 0.32)) * noise(vec2(az * 23.0 - uTime * 0.006, e * 0.7 + 3.0));
          c += cLow * 0.22 * smoothstep(0.15, 0.6, cl) * smoothstep(3.0, 9.0, e) * (1.0 - smoothstep(16.0, 28.0, e));
          // thin amber band at the horizon, with a wider low glow above it
          float band = exp(-pow(e / 0.45, 2.0));
          float glow = exp(-e / 2.6);
          c = mix(c, cAmber, band * 0.85);
          c += cAmber * glow * 0.10;
        } else {
          // the sea: dark, a little lighter right under the horizon, with slow horizontal glints
          float s = -e;
          c = mix(cSea, cSeaDeep, smoothstep(0.0, 8.0, s));
          float near = exp(-s / 0.35);
          c = mix(c, cAmber * 0.55, near * 0.55);
          float glint = noise(vec2(az * 260.0, s * 22.0 - uTime * 0.25)) * noise(vec2(az * 90.0 + uTime * 0.03, s * 9.0));
          c += cAmber * 0.18 * smoothstep(0.55, 0.9, glint) * exp(-s / 2.5);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }));
  const skyGeo = d.track(new THREE.SphereGeometry(SKY_R, 48, 32));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.copy(EYE);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  // ---- the far shore: low hills and a harbour of sheds, stacks and quay cranes, all in haze ----
  const r = rng(7);
  const shore = new ShadedBatch('shore', 1.08, 1, 0.92, 0.9);
  const hy = horizonY(SHORE_Z);
  // hills: a band of irregular wide boxes behind the harbour, lighter (further)
  shore.color(SKY.shoreFar);
  for (let x = -640; x < 640; x += 26 + r() * 30) {
    const h = 2 + r() * 4 + (Math.abs(x) > 200 ? 4 + r() * 8 : 0);
    shore.box(40 + r() * 50, h * 2, 10, x, hy - h * 0.3 + h, SHORE_Z - 60);
  }
  // harbour: sheds and blocks right on the horizon
  shore.color(SKY.shore);
  for (let x = -560; x < 560; x += 6 + r() * 16) {
    if (Math.abs(x) < 20 && r() < 0.7) continue;
    const h = 1.5 + r() * 4.5 + (r() < 0.1 ? 4 + r() * 7 : 0);
    const w = 6 + r() * 16;
    shore.box(w, h * 2, 8, x, hy + h * 0.6, SHORE_Z);
  }
  // quay cranes on the far shore: legs, a boom and a raised jib, as thin silhouettes
  for (const x of [-300, -262, -226, 196, 238, 330]) {
    const s = 1.5 + r() * 0.5;
    const base = hy + 0.2;
    shore.box(0.8 * s, 16 * s, 0.8, x - 4 * s, base + 8 * s, SHORE_Z + 6);
    shore.box(0.8 * s, 16 * s, 0.8, x + 4 * s, base + 8 * s, SHORE_Z + 6);
    shore.box(26 * s, 1.0 * s, 0.8, x + 4 * s, base + 15 * s, SHORE_Z + 6);
    shore.box(0.6 * s, 7 * s, 0.6, x, base + 19 * s, SHORE_Z + 6);
    shore.beam(new THREE.Vector3(x, base + 22 * s, SHORE_Z + 6), new THREE.Vector3(x + 16 * s, base + 15.5 * s, SHORE_Z + 6), 0.35 * s);
  }
  const shoreMat = d.track(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  const shoreGeo = d.track(shore.build());
  {
    // aerial perspective: the shore is lifted toward the lit haze at its foot and sinks into the
    // sky at the top; the hills behind are paler than the harbour in front
    const p = shoreGeo.getAttribute('position');
    const cc = shoreGeo.getAttribute('color');
    const glow = new THREE.Color('#2c5266');
    for (let i = 0; i < p.count; i++) {
      const up = Math.min(1, Math.max(0, (p.getY(i) - hy) / 22));
      const k = 1.25 - 0.45 * up;
      const g = (1 - up) * 0.35;
      cc.setXYZ(i, cc.getX(i) * k + glow.r * g, cc.getY(i) * k + glow.g * g, cc.getZ(i) * k + glow.b * g);
    }
    cc.needsUpdate = true;
  }
  const shoreMesh = new THREE.Mesh(shoreGeo, shoreMat);
  shoreMesh.renderOrder = -9;
  group.add(shoreMesh);

  // ---- harbour lights and their streaks on the water ----
  const lampGeo = d.track(new THREE.PlaneGeometry(1, 1));
  const lampMat = d.track(new THREE.MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const N = 260;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, N);
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  const sodium = new THREE.Color('#ffae55');
  const white = new THREE.Color('#d8e6ff');
  const red = new THREE.Color('#ff4a3a');
  let n = 0;
  const lampAt = (x: number, y: number, z: number, sx: number, sy: number, cc: THREE.Color, k: number) => {
    if (n >= N) return;
    m4.makeScale(sx, sy, 1).setPosition(x, y, z);
    lamps.setMatrixAt(n, m4);
    lamps.setColorAt(n, c.copy(cc).multiplyScalar(k));
    n++;
  };
  for (let i = 0; i < 190; i++) {
    let x = (r() * 2 - 1) * 560;
    if (Math.abs(x) < 60) x += Math.sign(x || 1) * 60;
    const cc = r() < 0.72 ? sodium : r() < 0.85 ? white : red;
    const y = hy + 0.4 + r() * (r() < 0.2 ? 9 : 3);
    const s = 0.45 + r() * 0.5;
    const k = 0.25 + r() * 0.35;
    lampAt(x, y, SHORE_Z + 8, s, s, cc, k);
    // its reflection: a soft vertical streak just under the horizon
    if (r() < 0.3) lampAt(x, hy - 1.6 - r() * 0.8, SHORE_Z + 12, s * 0.35, 1.6 + r() * 1.6, cc, k * 0.1);
  }
  // working lights strung along the far quay cranes' booms and legs
  for (const x of [-300, -262, -226, 196, 238, 330]) {
    for (let k = 0; k < 6; k++) lampAt(x - 2 + k * 4.4, hy + 15.6, SHORE_Z + 7, 0.5, 0.4, sodium, 0.55);
    lampAt(x, hy + 22.5, SHORE_Z + 7, 0.7, 0.7, red, 0.7);
  }
  // the pilot boat: a mast light, side lights and a short deck row; moved in update()
  const boatStart = n;
  const boatLights: [number, number, THREE.Color, number, number][] = [
    [-0.6, 2.6, white, 0.5, 0.8],
    [-2.4, 1.0, sodium, 0.45, 0.55],
    [-1.2, 1.0, sodium, 0.45, 0.55],
    [0.4, 1.0, sodium, 0.45, 0.55],
    [2.6, 1.2, red, 0.5, 0.7],
    [-0.6, -1.2, sodium, 0.3, 2.5],
  ];
  for (const [bx, by, cc, s, k] of boatLights) lampAt(bx, by, 0, s, by < 0 ? 4 : s, cc, by < 0 ? 0.12 : k);
  const boatEnd = n;
  lamps.count = n;
  lamps.instanceMatrix.needsUpdate = true;
  if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  lamps.renderOrder = -8;
  lamps.frustumCulled = false;
  group.add(lamps);

  // the boat's hull silhouette
  const boatGeo = d.track(new THREE.BoxGeometry(7, 0.9, 2));
  const boatMat = d.track(new THREE.MeshBasicMaterial({ color: '#0b1923', fog: false }));
  const boat = new THREE.Mesh(boatGeo, boatMat);
  const cabin = new THREE.Mesh(boatGeo, boatMat);
  cabin.scale.set(0.3, 1.4, 0.8);
  cabin.position.set(-0.6, 1.0, 0);
  boat.add(cabin);
  boat.renderOrder = -8;
  group.add(boat);
  const BOAT_Z = -320;
  const boatY = horizonY(BOAT_Z) - 1.2;
  const base = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const boatLocal: THREE.Matrix4[] = [];
  for (let i = boatStart; i < boatEnd; i++) {
    const mm = new THREE.Matrix4();
    lamps.getMatrixAt(i, mm);
    boatLocal.push(mm);
  }

  return {
    group,
    update(t: number) {
      skyMat.uniforms.uTime.value = t;
      // the boat crosses right to left in about two and a half minutes, then comes round again
      const span = 560;
      const x = 260 - (((t * 3.2) + 180) % span);
      boat.position.set(x, boatY + 0.45, BOAT_Z);
      for (let i = boatStart; i < boatEnd; i++) {
        base.copy(boatLocal[i - boatStart]);
        base.decompose(tmpPos, tmpQ, tmpS);
        tmpPos.x += x;
        tmpPos.y += boatY;
        tmpPos.z += BOAT_Z + 2;
        m4.compose(tmpPos, tmpQ, tmpS);
        lamps.setMatrixAt(i, m4);
      }
      lamps.instanceMatrix.needsUpdate = true;
    },
  };
}
