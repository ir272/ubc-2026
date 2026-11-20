// Dry Dock 9: the fitting-out basin in the middle of the yard, between the ship's dock (left) and the
// container quay (right). Dark water that carries long, shimmering reflections of the floods above
// it and of a work boat that idles across. It is the slow, quiet life behind the fight line: big,
// low-contrast, never brighter than the deck.

import * as THREE from 'three';
import type { Disposer } from './util.ts';

export const WATER_Y = -15.2;
export const BASIN = { x0: -24, x1: 28, z0: -96, z1: -262 };
const MAXL = 14;

export interface Water {
  group: THREE.Group;
  /** a light the water reflects: world position, colour (linear, pre-multiplied by strength), streak width */
  addLight(p: THREE.Vector3, color: THREE.Color, width: number): number;
  setLight(i: number, p: THREE.Vector3, color: THREE.Color): void;
  update(t: number): void;
}

export function buildWater(d: Disposer): Water {
  const group = new THREE.Group();
  group.name = 'water';
  const lights: THREE.Vector4[] = [];
  const cols: THREE.Vector3[] = [];
  for (let i = 0; i < MAXL; i++) {
    lights.push(new THREE.Vector4(0, 0, 0, 1));
    cols.push(new THREE.Vector3(0, 0, 0));
  }
  let n = 0;
  const mat = d.track(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uL: { value: lights },
      uC: { value: cols },
      uN: { value: 0 },
      uDeep: { value: new THREE.Color('#03070c') },
      uFar: { value: new THREE.Color('#0a1824') },
      uAmber: { value: new THREE.Color('#5a3818') },
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      #define MAXL ${MAXL}
      uniform float uTime; uniform vec4 uL[MAXL]; uniform vec3 uC[MAXL]; uniform int uN;
      uniform vec3 uDeep, uFar, uAmber;
      varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec3 C = cameraPosition;
        float dist = length(vW.xz - C.xz);
        // base: darker near, lifting to the lit haze toward the far end; the amber sky in the far water
        float far = smoothstep(110.0, 290.0, dist);
        vec3 col = mix(uDeep, uFar, far);
        col += uAmber * pow(far, 4.0) * 0.5;
        // wind ripples: long horizontal bands that crawl toward the camera
        float rip = noise(vec2(vW.x * 0.22 + uTime * 0.05, vW.z * 1.4 + uTime * 0.9));
        rip = 0.6 * rip + 0.4 * noise(vec2(vW.x * 0.6 - uTime * 0.07, vW.z * 3.1 + uTime * 1.6));
        col *= 0.85 + 0.3 * rip;
        // reflections: a streak under each light, from where its mirror image meets the water,
        // stretched toward and away from the camera, broken up by the ripples
        float hC = C.y - ${WATER_Y.toFixed(2)};
        for (int i = 0; i < MAXL; i++) {
          if (i >= uN) break;
          vec4 L = uL[i];
          float hL = L.y - ${WATER_Y.toFixed(2)};
          vec2 Lp = L.xz;
          vec2 dir = normalize(C.xz - Lp);
          vec2 m = Lp + (C.xz - Lp) * (hL / (hL + hC));
          vec2 rel = vW.xz - m;
          float along = dot(rel, dir);
          float across = abs(rel.x * dir.y - rel.y * dir.x);
          float w = L.w * (1.0 + 0.012 * length(vW.xz - C.xz));
          float lat = exp(-across * across / (w * w));
          float len = exp(-abs(along) / (along > 0.0 ? 14.0 : 34.0));
          // calm, broad ripples in the streak (the sharp squared glitter read as noise right
          // behind the fight line)
          float shimmer = smoothstep(0.25, 0.9, noise(vec2(vW.x * 0.35 + float(i) * 3.1, vW.z * 0.9 + uTime * 0.6)));
          col += uC[i] * lat * len * (0.3 + 0.9 * shimmer);
        }
        // fade out at the far end so the painted sea beyond the camera's reach takes over
        gl_FragColor = vec4(col, 1.0 - smoothstep(255.0, 292.0, dist));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
    transparent: true,
    depthWrite: false,
  }));
  const geo = d.track(new THREE.PlaneGeometry(BASIN.x1 - BASIN.x0, BASIN.z0 - BASIN.z1, 1, 1));
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((BASIN.x0 + BASIN.x1) / 2, WATER_Y, (BASIN.z0 + BASIN.z1) / 2);
  mesh.renderOrder = -5;
  group.add(mesh);

  return {
    group,
    addLight(p, color, width) {
      if (n >= MAXL) return -1;
      lights[n].set(p.x, p.y, p.z, width);
      cols[n].set(color.r, color.g, color.b);
      n++;
      mat.uniforms.uN.value = n;
      return n - 1;
    },
    setLight(i, p, color) {
      if (i < 0) return;
      lights[i].set(p.x, p.y, p.z, lights[i].w);
      cols[i].set(color.r, color.g, color.b);
    },
    update(t) {
      mat.uniforms.uTime.value = t;
    },
  };
}
