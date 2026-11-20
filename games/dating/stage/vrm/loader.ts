// Loads one cast VRM (VRM 0.x, 100Avatars R3) and restyles it into the show's cel look:
// MToon everywhere, hard two-step shading, a thin ink outline, no rim, no matcap gloss.
// The lit-PBR models (Astro Nacho) are converted to MToon so the whole cast shades as one.
// `setLit(false)` is the cut: every surface drops to a dark night-blue tone in one frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MToonMaterial, VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { PALETTE } from '../theme.ts';
import { installFaceCard, type FaceCard, type FaceConfig } from './face.ts';

export interface CharacterStyle {
  /** 0..1, how much the idle moves (breath depth, sway, talk bob) */
  energy: number;
  /** 0..1, a springy idle bounce and hop on beats (the dog) */
  bounce: number;
  /** radians, standing lean: + forward (timid), - back (stately, upright) */
  posture: number;
  /** gesture amplitude on the bones (1 = default) */
  gesture: number;
  /** gesture amplitude on the whole body (lean, hop, squash): this is what reads on box bodies */
  body: number;
  /** share of a look-at that the head takes (the rest goes to the chest); low = stiff, turns as one */
  head: number;
  /** walk style: a clip name, or 'hop' / 'float' for bodies whose walk clip is unusable */
  walk: string;
  /** how they move on top of the walk: bound (the dog), stride (upright, formal), waddle (box
   * bodies rock side to side), scurry (quick little steps), strut (a swagger), walk (plain) */
  gait: 'walk' | 'bound' | 'stride' | 'waddle' | 'scurry' | 'strut';
  /** idle clip, or 'none' for the procedural idle */
  idle: string;
  /** talking idle clip, or 'none' */
  talk: string;
  /** procedural arm hang, radians out from the body (stick arms on wide bodies need more) */
  armRaise: number;
  /** head pitch and roll amplitude (big chibi heads need less) */
  headAmp: number;
  /** how much of the clips' hip and spine sway the body keeps (a rigid pyramid keeps little) */
  hipsAmp: number;
  /** breathing rate multiplier */
  tempo: number;
  /** how far the mouth opens on a syllable (the fish's lips are a metre wide: less) */
  mouth: number;
  /** mood presets the model's own face must not play (the fish's 'relaxed' is its open grin) */
  skipFaces: string[];
  /** resting face under 'neutral' (the face they wear when nothing is happening) */
  rest: 'neutral' | 'happy' | 'angry' | 'sad' | 'relaxed';
  /** weight of the resting face */
  restWeight: number;
}

export const DEFAULT_STYLE: CharacterStyle = {
  energy: 0.6,
  bounce: 0,
  posture: 0,
  gesture: 1,
  body: 1,
  head: 0.6,
  walk: 'Walk_Loop',
  gait: 'walk',
  idle: 'Idle_Loop',
  talk: 'Idle_Talking_Loop',
  armRaise: 0.22,
  headAmp: 1,
  hipsAmp: 1,
  tempo: 1,
  rest: 'neutral',
  restWeight: 0,
  mouth: 1,
  skipFaces: [],
};

/** assets/cast/<id>/manifest.json, the fields this module reads */
export interface VrmManifest {
  id: string;
  model: string;
  format?: string;
  vrmVersion?: string;
  height?: number;
  scale?: number;
  accent?: string;
  /** an allow list of clips (object form) or a plain list (treated the same) */
  clips?: { allow?: string[] } | string[];
  /** metres (model units) from the head bone to the top of the head or hat */
  headTop?: number;
  /** metres (model units) the drawn top (a face card, a toast, a helmet plume) rises over the measured mesh */
  topPad?: number;
  /** hover height in metres (scaled) for floating characters */
  floats?: number;
  /** extra offset (model units) when seated: y lifts the hips onto the cushion, z slides back */
  seatOffset?: { y?: number; z?: number };
  /** override the head bone used for anchors (a humanoid bone name) */
  headBone?: string;
  style?: Partial<CharacterStyle>;
  /** a drawn face card replaces the model's own face features (stage/vrm/face.ts) */
  face?: FaceConfig;
  /** palette size for the cel flattening of the textures; 0 keeps the texture as painted */
  flatten?: number;
  [k: string]: unknown;
}

export interface VrmActor {
  manifest: VrmManifest;
  vrm: VRM;
  /** feet at y = 0, scaled; put this inside the performer's own pivots */
  object: THREE.Object3D;
  /** manifest scale applied to the model */
  scale: number;
  /** model-unit height from the ground to the hips at rest */
  hipsHeight: number;
  /** model-unit distance from the head bone to the head top */
  headTop: number;
  /** model-unit height of the full rest bounds */
  height: number;
  style: CharacterStyle;
  /** clips this body may play (null: every clip) */
  allow: Set<string> | null;
  /** the drawn face, when the manifest asks for one */
  face: FaceCard | null;
  setLit(on: boolean): void;
  /** the accent rim colour (defaults to the manifest accent) */
  setRim(color: THREE.ColorRepresentation): void;
  dispose(): void;
}

type Surface = {
  mat: MToonMaterial;
  color: THREE.Color;
  shade: THREE.Color;
  emissive: THREE.Color;
};

const INK = new THREE.Color(PALETTE.ink);
/**
 * The cut: lit colour times this. Dark enough to read as "the light went out" next to a lit
 * neighbour, light enough that the slumped silhouette still reads against the night set (Take Me
 * Out's off podium sits at about a quarter of its lit brightness, shifted to the wash colour).
 */
const DARK = new THREE.Color(0.3, 0.32, 0.52);
/** outline width as a fraction of screen height (screen-space, so it stays thin at any distance) */
const OUTLINE = 0.0048;

/**
 * Cast cel lighting. The cast does not take the studio's lights: house lights go up and down with
 * the betting windows and the set is meant to sit dark, but the characters must always be the
 * brightest, most saturated thing in frame. So every cast surface gets its own drawn light: one flat
 * key fixed to the camera (upper left of the lens, so every shot is lit the same way), a hard two-step
 * shadow in a cool tint, a saturation push, and a hard band of the character's accent on the
 * silhouette edge away from the key (their lamp behind them, as a rim). Shared by every cast material.
 */
export const CAST_LIGHT = {
  /** view-space direction toward the key (x right, y up, z toward the camera) */
  key: { value: new THREE.Vector3(-0.42, 0.5, 0.76).normalize() },
  /** N.L where the shadow step sits (lower = more of the body lit) */
  step: { value: -0.12 },
  /** the second step: the texture times this (cool, never grey) */
  shade: { value: new THREE.Color(0.64, 0.6, 0.9) },
  /** overall brightness of the lit side (1 = the texture as authored) */
  exposure: { value: 1.22 },
  /** saturation push on the final colour (1 = none) */
  saturation: { value: 1.3 },
  /** rim band width (in 1 - N.V) and how much of the far side it covers */
  rimWidth: { value: 0.3 },
  rimSide: { value: 0.32 },
  /**
   * the darkest a painted colour may be (linear luma) before the key lifts it: maroon gloves and
   * navy legs come up to a readable mid-tone of their own hue; true ink (near black) stays ink
   */
  floor: { value: 0.1 },
};

const CAST_FRAG = /* glsl */ `
  vec3 col;
  {
    vec3 cn = normalize( normal );
    float ndl = dot( cn, castKey );
    float litMask = smoothstep( castStep - 0.025, castStep + 0.025, ndl );
    vec3 base = material.diffuseColor;
    float lb = dot( base, vec3( 0.2126, 0.7152, 0.0722 ) );
    float lift = clamp( castFloor / max( lb, 0.004 ), 1.0, 3.2 );
    base *= mix( 1.0, lift, smoothstep( 0.0012, 0.006, lb ) );
    col = mix( base * castShade, base, litMask ) * castExposure * castLevel;
    float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
    col = max( mix( vec3( luma ), col, castSaturation ), 0.0 );
    vec3 cv = normalize( vViewPosition );
    float edge = 1.0 - max( dot( cv, cn ), 0.0 );
    float band = smoothstep( 1.0 - castRimWidth - 0.02, 1.0 - castRimWidth + 0.02, edge ) * ( 1.0 - smoothstep( castRimSide - 0.05, castRimSide + 0.05, ndl ) );
    col = mix( col, castRim, band * castRimAmount );
  }
`;

/** Per-actor uniforms: the accent rim and the lit level (the cut drops both in one frame). */
type ActorLight = { castRim: { value: THREE.Color }; castRimAmount: { value: number }; castLevel: { value: number } };

function patchCel(m: MToonMaterial, own: ActorLight) {
  if (m.userData.castCel) return;
  m.userData.castCel = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev.call(m, shader, r);
    Object.assign(shader.uniforms, {
      castKey: CAST_LIGHT.key,
      castStep: CAST_LIGHT.step,
      castShade: CAST_LIGHT.shade,
      castExposure: CAST_LIGHT.exposure,
      castSaturation: CAST_LIGHT.saturation,
      castRimWidth: CAST_LIGHT.rimWidth,
      castRimSide: CAST_LIGHT.rimSide,
      castFloor: CAST_LIGHT.floor,
      ...own,
    });
    if (m.isOutline) {
      // the hull grows along smoothed normals, so hard-edged boxes and thin limbs keep an unbroken line
      shader.vertexShader = 'attribute vec3 outlineNormal;\n' + shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = vec3( outlineNormal );\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif',
      );
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void postCorrection() {',
        'uniform vec3 castKey; uniform float castStep; uniform vec3 castShade; uniform float castExposure; uniform float castSaturation; uniform float castRimWidth; uniform float castRimSide; uniform float castFloor; uniform vec3 castRim; uniform float castRimAmount; uniform float castLevel;\nvoid postCorrection() {',
      )
      .replace('vec3 col = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;', CAST_FRAG);
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + (m.isOutline ? ',castcel-ol' : ',castcel');
}

let loaderSingleton: GLTFLoader | null = null;
function loader() {
  if (!loaderSingleton) {
    loaderSingleton = new GLTFLoader();
    loaderSingleton.register((parser) => new VRMLoaderPlugin(parser));
  }
  return loaderSingleton;
}

function srgb(c: THREE.Color) {
  return c.clone();
}

/** Make a plain (lit PBR / basic) material into MToon so it shades like the rest of the cast. */
function toMToon(src: THREE.Material): MToonMaterial {
  const s = src as THREE.MeshStandardMaterial;
  const m = new MToonMaterial();
  m.name = `${src.name || 'mat'} (mtoon)`;
  if (s.map) m.map = s.map;
  if (s.color) m.color.copy(s.color);
  m.transparent = src.transparent;
  m.alphaTest = src.alphaTest;
  m.side = src.side;
  m.depthWrite = src.depthWrite;
  m.opacity = src.opacity;
  if (s.emissiveMap) m.emissiveMap = s.emissiveMap;
  if (s.emissive) m.emissive.copy(s.emissive);
  // PBR textures for these models are authored brighter than MToon's base: pull the metal-ish
  // look out by leaving normal maps off; flat colour is the point.
  return m;
}

function styleMToon(m: MToonMaterial) {
  if (m.map) m.shadeMultiplyTexture = m.map;
  m.shadingToonyFactor = 0.97;
  m.shadingShiftFactor = -0.08;
  m.giEqualizationFactor = 0.92;
  m.parametricRimColorFactor.setRGB(0, 0, 0);
  m.rimLightingMixFactor = 0;
  m.matcapFactor.setRGB(0, 0, 0);
  m.matcapTexture = null;
  m.normalMap = null;
  m.needsUpdate = true;
}

function styleOutline(m: MToonMaterial) {
  m.outlineWidthMode = 'screenCoordinates';
  m.outlineWidthFactor = OUTLINE;
  m.outlineColorFactor.copy(INK);
  m.outlineLightingMixFactor = 0;
  m.outlineWidthMultiplyTexture = null;
  m.needsUpdate = true;
}

/** averaged normals per position (split normals crack an inverted hull at every hard edge) */
function smoothOutlineNormals(g: THREE.BufferGeometry) {
  if (g.attributes.outlineNormal) return;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  if (!pos) return;
  if (!nor) g.computeVertexNormals();
  const n = g.attributes.normal!;
  const groups = new Map<string, number>();
  const id = new Int32Array(pos.count);
  const acc: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 2e3)},${Math.round(pos.getY(i) * 2e3)},${Math.round(pos.getZ(i) * 2e3)}`;
    let gi = groups.get(k);
    if (gi === undefined) {
      gi = groups.size;
      groups.set(k, gi);
      acc.push(0, 0, 0);
    }
    id[i] = gi;
    acc[gi * 3] += n.getX(i);
    acc[gi * 3 + 1] += n.getY(i);
    acc[gi * 3 + 2] += n.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const gi = id[i]!;
    const x = acc[gi * 3]!, y = acc[gi * 3 + 1]!, z = acc[gi * 3 + 2]!;
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l;
    out[i * 3 + 1] = y / l;
    out[i * 3 + 2] = z / l;
  }
  g.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
}

/**
 * Cel flattening: the painted textures of this asset pack carry airbrushed gradients, baked chrome
 * reflections and brushed-metal grain, which read as four different asset packs side by side. Each
 * texture is reduced to a small palette (k-means on a downscaled copy), then cleaned with a majority
 * filter, so every gradient becomes two or three flat fills with hard edges, like a painted cel.
 */
function flattenImage(img: CanvasImageSource & { width: number; height: number }, k: number): HTMLCanvasElement {
  const W = Math.min(1024, img.width);
  const H = Math.min(1024, img.height);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, W, H);
  const im = c.getImageData(0, 0, W, H);
  const d = im.data;
  const N = W * H;
  // training sample
  const step = Math.max(1, Math.floor(N / 40000));
  const sample: number[] = [];
  for (let i = 0; i < N; i += step) if (d[i * 4 + 3]! > 127) sample.push(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);
  const S = sample.length / 3;
  if (S < k) return cv;
  const dist = (r: number, g: number, b: number, cr: number, cg: number, cb: number) => {
    const rm = (r + cr) * 0.5;
    const dr = r - cr, dg = g - cg, db = b - cb;
    return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
  };
  // k-means++ (deterministic: farthest-point after the mean)
  const cen = new Float64Array(k * 3);
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < S; i++) { mr += sample[i * 3]!; mg += sample[i * 3 + 1]!; mb += sample[i * 3 + 2]!; }
  cen[0] = mr / S; cen[1] = mg / S; cen[2] = mb / S;
  const best = new Float64Array(S).fill(Infinity);
  for (let j = 1; j < k; j++) {
    let far = 0, farD = -1;
    for (let i = 0; i < S; i++) {
      const dd = dist(sample[i * 3]!, sample[i * 3 + 1]!, sample[i * 3 + 2]!, cen[(j - 1) * 3]!, cen[(j - 1) * 3 + 1]!, cen[(j - 1) * 3 + 2]!);
      if (dd < best[i]!) best[i] = dd;
      if (best[i]! > farD) { farD = best[i]!; far = i; }
    }
    cen[j * 3] = sample[far * 3]!; cen[j * 3 + 1] = sample[far * 3 + 1]!; cen[j * 3 + 2] = sample[far * 3 + 2]!;
  }
  const nearest = (r: number, g: number, b: number) => {
    let bi = 0, bd = Infinity;
    for (let j = 0; j < k; j++) {
      const dd = dist(r, g, b, cen[j * 3]!, cen[j * 3 + 1]!, cen[j * 3 + 2]!);
      if (dd < bd) { bd = dd; bi = j; }
    }
    return bi;
  };
  const sum = new Float64Array(k * 4);
  for (let it = 0; it < 8; it++) {
    sum.fill(0);
    for (let i = 0; i < S; i++) {
      const r = sample[i * 3]!, g = sample[i * 3 + 1]!, b = sample[i * 3 + 2]!;
      const j = nearest(r, g, b);
      sum[j * 4] += r; sum[j * 4 + 1] += g; sum[j * 4 + 2] += b; sum[j * 4 + 3]++;
    }
    for (let j = 0; j < k; j++) if (sum[j * 4 + 3]! > 0) {
      cen[j * 3] = sum[j * 4]! / sum[j * 4 + 3]!;
      cen[j * 3 + 1] = sum[j * 4 + 1]! / sum[j * 4 + 3]!;
      cen[j * 3 + 2] = sum[j * 4 + 2]! / sum[j * 4 + 3]!;
    }
  }
  // label every pixel
  let lab = new Uint8Array(N);
  for (let i = 0; i < N; i++) lab[i] = nearest(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);
  // one fill per painted region: clusters of the same hue that differ mostly in lightness are one
  // airbrushed gradient (or a baked highlight), so they merge into a single flat colour; the cel's
  // own two-step shading then comes from the light, with a clean edge
  {
    const w = new Float64Array(k);
    for (let i = 0; i < N; i++) w[lab[i]!]++;
    const toLab = (r: number, g: number, b: number) => {
      const f = (u: number) => { u /= 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
      const R = f(r), G = f(g), B = f(b);
      const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505;
      const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089;
      const h = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))] as const;
    };
    const root = Array.from({ length: k }, (_, j) => j);
    const find = (j: number): number => (root[j] === j ? j : (root[j] = find(root[j]!)));
    for (;;) {
      let bi = -1, bj = -1, bd = MERGE;
      for (let a = 0; a < k; a++) {
        if (find(a) !== a || !w[a]) continue;
        const A = toLab(cen[a * 3]!, cen[a * 3 + 1]!, cen[a * 3 + 2]!);
        for (let b = a + 1; b < k; b++) {
          if (find(b) !== b || !w[b]) continue;
          const B = toLab(cen[b * 3]!, cen[b * 3 + 1]!, cen[b * 3 + 2]!);
          // never merge into or out of ink (near black stays its own fill)
          if (Math.min(A[0], B[0]) < 14 && Math.abs(A[0] - B[0]) > 6) continue;
          const dd = Math.hypot((A[0] - B[0]) * 0.55, A[1] - B[1], A[2] - B[2]);
          if (dd < bd) { bd = dd; bi = a; bj = b; }
        }
      }
      if (bi < 0) break;
      // the merged fill is the weighted mean
      const wa = w[bi]!, wb = w[bj]!;
      for (let c = 0; c < 3; c++) cen[bi * 3 + c] = (cen[bi * 3 + c]! * wa + cen[bj * 3 + c]! * wb) / (wa + wb);
      w[bi] = wa + wb;
      w[bj] = 0;
      root[bj] = bi;
    }
    for (let i = 0; i < N; i++) lab[i] = find(lab[i]!);
  }
  // two passes of a 3x3 majority filter (grain and stray specks go)
  const cnt = new Uint16Array(k);
  // (then a wider pass that rounds off the ragged contour a gradient leaves behind)
  for (const [rad, need] of [[1, 5], [1, 5], [2, 13], [1, 5]] as const) {
    const out = new Uint8Array(lab);
    for (let y = rad; y < H - rad; y++) {
      for (let x = rad; x < W - rad; x++) {
        cnt.fill(0);
        let bj = lab[y * W + x]!, bc = 0;
        for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
          const j = lab[(y + oy) * W + x + ox]!;
          const v = ++cnt[j]!;
          if (v > bc) { bc = v; bj = j; }
        }
        if (bc >= need) out[y * W + x] = bj;
      }
    }
    lab = out;
  }
  for (let i = 0; i < N; i++) {
    const j = lab[i]!;
    d[i * 4] = cen[j * 3]!;
    d[i * 4 + 1] = cen[j * 3 + 1]!;
    d[i * 4 + 2] = cen[j * 3 + 2]!;
  }
  c.putImageData(im, 0, 0);
  return cv;
}

/** Lab distance (lightness at half weight) under which two palette fills are one region */
const MERGE = 19;
const flatCache = new Map<string, THREE.Texture>();
function flattenTexture(t: THREE.Texture, k: number, key: string): THREE.Texture {
  const ck = `${key}:${k}`;
  const hit = flatCache.get(ck);
  if (hit) return hit;
  const img = t.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return t;
  let out: THREE.Texture = t;
  try {
    const cv = flattenImage(img, k);
    const ct = new THREE.CanvasTexture(cv);
    ct.flipY = t.flipY;
    ct.colorSpace = t.colorSpace;
    ct.wrapS = t.wrapS;
    ct.wrapT = t.wrapT;
    ct.magFilter = t.magFilter;
    ct.minFilter = t.minFilter;
    ct.anisotropy = Math.max(4, t.anisotropy);
    ct.offset.copy(t.offset);
    ct.repeat.copy(t.repeat);
    ct.rotation = t.rotation;
    ct.channel = t.channel;
    ct.name = `${t.name || 'map'} (flat)`;
    out = ct;
  } catch (e) {
    console.warn('[cast] texture flatten failed', e);
  }
  flatCache.set(ck, out);
  return out;
}

/** Restyle every mesh and give each a matching outline pass; returns the surfaces for setLit. */
function restyle(scene: THREE.Object3D, own: ActorLight, flatten: number, key: string): { surfaces: Surface[]; materials: Set<THREE.Material> } {
  const surfaces: Surface[] = [];
  const materials = new Set<THREE.Material>();
  const converted = new Map<THREE.Material, MToonMaterial>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false; // skinned bounds do not follow the pose
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // surface materials (the plugin may already have appended an outline copy)
    let surface = list.find((x) => !(x as MToonMaterial).isOutline) as THREE.Material;
    let outline = list.find((x) => (x as MToonMaterial).isOutline) as MToonMaterial | undefined;
    if (!(surface as MToonMaterial).isMToonMaterial) {
      let c = converted.get(surface);
      if (!c) {
        c = toMToon(surface);
        converted.set(surface, c);
        materials.add(surface); // dispose the original too
      }
      surface = c;
    }
    const mt = surface as MToonMaterial;
    if (flatten > 0 && mt.map && !mt.map.name.endsWith('(flat)')) mt.map = flattenTexture(mt.map, flatten, `${key}:${mt.map.uuid}`);
    styleMToon(mt);
    smoothOutlineNormals(mesh.geometry);
    if (!outline) {
      outline = mt.clone();
      outline.name = `${mt.name} (outline)`;
      outline.isOutline = true;
      outline.side = THREE.BackSide;
      const geo = mesh.geometry;
      geo.clearGroups();
      const count = geo.index ? geo.index.count : geo.attributes.position!.count;
      geo.addGroup(0, count, 0);
      geo.addGroup(0, count, 1);
    } else {
      styleMToon(outline);
    }
    // the outline needs the surface's (non-outline) settings too, for alpha cutouts
    outline.map = mt.map;
    outline.transparent = mt.transparent;
    outline.alphaTest = mt.alphaTest;
    styleOutline(outline);
    // translucent parts (visor glass, bubble helmet) get no outline: it would draw a dark disc
    if (mt.transparent && mt.opacity < 0.999) outline.visible = false;
    if (mt.transparent && !mt.alphaTest) outline.visible = false;
    mt.outlineWidthMode = 'none';
    patchCel(mt, own);
    patchCel(outline, own);
    mesh.material = [mt, outline];
    for (const m of [mt, outline]) {
      if (materials.has(m)) continue;
      materials.add(m);
      surfaces.push({ mat: m, color: srgb(m.color), shade: srgb(m.shadeColorFactor), emissive: srgb(m.emissive) });
    }
  });
  return { surfaces, materials };
}

/** Allow list from the manifest (object or array form). Empty or missing = every clip. */
export function clipAllow(m: VrmManifest): Set<string> | null {
  const c = m.clips;
  const list = Array.isArray(c) ? c : c?.allow;
  return list && list.length ? new Set(list) : null;
}

export async function loadVrm(manifest: VrmManifest, assetsBase: string): Promise<VrmActor> {
  const url = assetsBase + manifest.model;
  const gltf = await loader().loadAsync(url);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`not a VRM: ${url}`);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // faces +z, left on +x
  // the normalized rig only drives the raw bones when autoUpdate is on (default)
  vrm.humanoid.autoUpdateHumanBones = true;

  const accent = new THREE.Color(manifest.accent ?? PALETTE.tungsten);
  const own: ActorLight = {
    castRim: { value: accent.clone() },
    castRimAmount: { value: 0.9 },
    castLevel: { value: 1 },
  };
  const { surfaces, materials } = restyle(vrm.scene, own, manifest.flatten ?? 12, manifest.id);

  // rest bounds (T-pose) for grounding and the head top
  vrm.scene.updateMatrixWorld(true);
  // skinned positions, not the bind-space geometry bounds (those can sit far from the pose)
  const box = new THREE.Box3();
  const pv = new THREE.Vector3();
  vrm.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh || !m.geometry) return;
    const pos = m.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      pv.fromBufferAttribute(pos, i);
      if (m.isSkinnedMesh) m.applyBoneTransform(i, pv);
      box.expandByPoint(pv.applyMatrix4(m.matrixWorld));
    }
  });
  const headName = (manifest.headBone as 'head' | undefined) ?? 'head';
  const head = vrm.humanoid.getNormalizedBoneNode(headName) ?? vrm.humanoid.getNormalizedBoneNode('head')!;
  const headPos = head.getWorldPosition(new THREE.Vector3());
  const hips = vrm.humanoid.getNormalizedBoneNode('hips')!;
  const hipsPos = hips.getWorldPosition(new THREE.Vector3());
  const ground = box.min.y;
  const headTop = manifest.headTop ?? Math.max(0.12, box.max.y - headPos.y);

  // the drawn face (the toaster's toast, the knight's visor): folds the model's own features away
  const face = manifest.face ? installFaceCard(vrm, manifest.face, headName) : null;

  const scale = manifest.scale ?? 1;
  const object = new THREE.Group();
  object.name = `vrm:${manifest.id}`;
  object.scale.setScalar(scale);
  vrm.scene.position.y = -ground;
  object.add(vrm.scene);

  const style: CharacterStyle = { ...DEFAULT_STYLE, ...(manifest.style ?? {}) };

  let lit = true;
  const setLit = (on: boolean) => {
    if (on === lit) return;
    lit = on;
    // the cut: the rim (their lamp) goes out with the lamp, a cool dim one stays so the shape reads
    own.castRim.value.copy(on ? accent : new THREE.Color(PALETTE.dusk).lerp(accent, 0.25));
    own.castRimAmount.value = on ? 0.9 : 0.55;
    face?.setLit(on);
    for (const s of surfaces) {
      if (s.mat.isOutline) continue;
      if (on) {
        s.mat.color.copy(s.color);
        s.mat.shadeColorFactor.copy(s.shade);
        s.mat.emissive.copy(s.emissive);
      } else {
        s.mat.color.copy(s.color).multiply(DARK);
        s.mat.shadeColorFactor.copy(s.shade).multiply(DARK);
        s.mat.emissive.setRGB(0, 0, 0);
      }
    }
  };

  const dispose = () => {
    face?.dispose();
    object.removeFromParent();
    const textures = new Set<THREE.Texture>();
    vrm.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const m of materials) {
      for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) textures.add(v as THREE.Texture);
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) for (const k of Object.keys(u)) { const val = u[k]!.value; if (val && (val as THREE.Texture).isTexture) textures.add(val); }
      m.dispose();
    }
    for (const t of textures) t.dispose();
    VRMUtils.deepDispose(vrm.scene);
  };

  return {
    manifest,
    vrm,
    object,
    scale,
    hipsHeight: hipsPos.y - ground,
    headTop,
    height: box.max.y - ground + (manifest.topPad ?? 0),
    style,
    face,
    allow: clipAllow(manifest),
    setLit,
    setRim(color: THREE.ColorRepresentation) {
      accent.set(color);
      if (lit) own.castRim.value.copy(accent);
    },
    dispose,
  };
}
