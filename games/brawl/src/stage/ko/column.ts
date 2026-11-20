// The blast column's body: one screen-space strip with its own shader. A white core inside a body
// of the scorer's side colour, a straight edge that tapers to a point at the far end, one pixel of
// coverage at the edge so it stays crisp at any angle. Nothing else (clean pass: no lanes, streaks,
// torn fringe or stepped bands).

import * as THREE from 'three';
import { LAYER } from '../api.ts';

const SEGS = 24;

const VERT = /* glsl */ `
  attribute vec2 st;
  varying vec2 vST;
  uniform vec2 uO;
  uniform vec2 uU;
  uniform float uStart;
  uniform float uLen;
  uniform float uHalf;
  void main() {
    vST = st;
    vec2 v = vec2(-uU.y, uU.x);
    float u = mix(uStart, uLen, st.x);
    vec2 p = uO + uU * u + v * st.y * uHalf;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vST;
  uniform float uThin;   // 1 full width, falls to 0 as it thins out
  uniform float uCore;   // core width share
  uniform float uHalf;   // half width in px (for the pixel-wide edge)
  uniform vec3 cCore;
  uniform vec3 cSide;
  void main() {
    float s = vST.x;
    float a = abs(vST.y);
    // full width at the edge it came in from, tapering to a point at the far end
    float edge = (1.0 - pow(s, 2.4) * 0.92) * uThin;
    float px = 1.0 / max(uHalf, 1.0);
    float cover = clamp((edge - a) / px + 0.5, 0.0, 1.0);
    if (cover <= 0.0) discard;
    float coreEdge = edge * uCore;
    float k = clamp((a - coreEdge) / px + 0.5, 0.0, 1.0);
    vec3 col = mix(cCore, cSide, k);
    gl_FragColor = vec4(col, cover);
    #include <colorspace_fragment>
  }
`;

export class Column {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly geo: THREE.BufferGeometry;
  readonly u: {
    uO: { value: THREE.Vector2 };
    uU: { value: THREE.Vector2 };
    uStart: { value: number };
    uLen: { value: number };
    uHalf: { value: number };
    uThin: { value: number };
    uCore: { value: number };
    cCore: { value: THREE.Color };
    cSide: { value: THREE.Color };
  };

  constructor(renderOrder: number) {
    const pos = new Float32Array((SEGS + 1) * 2 * 3);
    const st = new Float32Array((SEGS + 1) * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i <= SEGS; i++) {
      const s = i / SEGS;
      st[i * 4] = s;
      st[i * 4 + 1] = -1;
      st[i * 4 + 2] = s;
      st[i * 4 + 3] = 1;
      if (i < SEGS) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('st', new THREE.BufferAttribute(st, 2));
    this.geo.setIndex(idx);
    this.u = {
      uO: { value: new THREE.Vector2() },
      uU: { value: new THREE.Vector2(1, 0) },
      uStart: { value: -150 },
      uLen: { value: 1000 },
      uHalf: { value: 300 },
      uThin: { value: 1 },
      uCore: { value: 0.4 },
      cCore: { value: new THREE.Color('#ffffff') },
      cSide: { value: new THREE.Color('#ffffff') },
    };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.u,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mat.forceSinglePass = true;
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.layers.set(LAYER.FX);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
