// Drawn faces for the bodies whose own face is too small or too stiff to act (the toaster's toast,
// the knight's visor). The model's own face features (every vertex an expression morph moves) are
// folded away at load, and a flat card on the head bone carries a drawn face instead: one atlas of
// eye states and mouth states, drawn once on a canvas in the show's ink, swapped per frame by the
// puppet like a cel replacement (no tweening between drawings, the way a cartoon swaps a mouth).
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export type EyeState = 'open' | 'blink' | 'happy' | 'angry' | 'sad' | 'bored' | 'wide' | 'glare' | 'relief' | 'squeeze';
export type MouthState = 'none' | 'smile' | 'flat' | 'frown' | 'talk1' | 'talk2' | 'oh' | 'grin' | 'wavy' | 'smirk';
export const EYES: EyeState[] = ['open', 'blink', 'happy', 'angry', 'sad', 'bored', 'wide', 'glare', 'relief', 'squeeze'];
export const MOUTHS: MouthState[] = ['none', 'smile', 'flat', 'frown', 'talk1', 'talk2', 'oh', 'grin', 'wavy', 'smirk'];

/** manifest `face` block */
export interface FaceConfig {
  /** toast: ink features straight on the surface; visor: pale eyes on a dark visor plate */
  kind: 'toast' | 'visor';
  /** card side, as a multiple of the folded features' width */
  scale?: number;
  /** model-unit nudge of the card (x right of the character, y up, z forward) */
  offset?: [number, number, number];
  /** heavy flat brows on the resting face (the grumpy toast) */
  brows?: boolean;
  /** visor plate size inside the card (0..1 of the card) */
  plate?: [number, number];
  /** the resting mouth */
  rest?: MouthState;
  /** morph targets whose vertices are folded away (default: every target moving under 600 vertices) */
  fold?: number[];
  /** morph targets whose vertices place the card (default: the folded ones); the eyes, usually */
  anchor?: number[];
}

const CELL = 256;
const COLS = 8;
const ROWS = 3; // 10 eyes + 10 mouths in 24 cells
const INK = '#1a0f0a';
const VISOR_EYE = '#fff1a6';
const VISOR_PLATE = '#0b0d18';

// ------------------------------------------------------------------------------------------------
// drawing (normalised card coordinates: 0..1, y down)

type Ctx = CanvasRenderingContext2D;

function drawEyes(c: Ctx, st: EyeState, cfg: FaceConfig) {
  const S = CELL;
  const visor = cfg.kind === 'visor';
  const col = visor ? VISOR_EYE : INK;
  const ex = visor ? 0.22 : 0.27; // eye offset from centre
  const ey = visor ? 0.5 : 0.4;
  const r = visor ? 0.085 : 0.075; // eye radius
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (visor) {
    const [pw, ph] = cfg.plate ?? [0.84, 0.46];
    c.fillStyle = VISOR_PLATE;
    roundRect(c, (0.5 - pw / 2) * S, (ey - ph / 2) * S, pw * S, ph * S, ph * S * 0.42);
    c.fill();
  }
  for (const side of [-1, 1] as const) {
    const x = (0.5 + side * ex) * S;
    const y = ey * S;
    const R = r * S;
    c.fillStyle = col;
    c.strokeStyle = col;
    c.lineWidth = S * (visor ? 0.06 : 0.05);
    // the inner end of the eye is toward the centre: side * -1
    const inner = -side;
    switch (st) {
      case 'open':
        disc(c, x, y, R);
        break;
      case 'squeeze': // > <, screwed shut
        c.beginPath();
        c.moveTo(x - inner * R * 1.1, y - R * 0.95);
        c.lineTo(x + inner * R * 0.9, y);
        c.lineTo(x - inner * R * 1.1, y + R * 0.95);
        c.stroke();
        break;
      case 'blink':
        line(c, x - R * 1.15, y + R * 0.2, x + R * 1.15, y + R * 0.2);
        break;
      case 'happy': // ^ ^
        c.beginPath();
        c.moveTo(x - R * 1.2, y + R * 0.6);
        c.quadraticCurveTo(x, y - R * 1.5, x + R * 1.2, y + R * 0.6);
        c.stroke();
        break;
      case 'relief': // closed, curved down, calm
        c.beginPath();
        c.moveTo(x - R * 1.2, y - R * 0.1);
        c.quadraticCurveTo(x, y + R * 1.2, x + R * 1.2, y - R * 0.1);
        c.stroke();
        break;
      case 'angry':
        if (visor) {
          // a disc with its inner top corner cut off at a steep slant
          clipDisc(c, x, y, R * 1.15, [x + inner * R * 1.4, y - R * 0.9], [x - inner * R * 1.4, y - R * 0.05]);
        } else disc(c, x, y, R * 0.9);
        break;
      case 'glare':
        if (visor) {
          clipDisc(c, x, y + R * 0.15, R * 1.2, [x + inner * R * 1.5, y - R * 0.2], [x - inner * R * 1.5, y + R * 0.05], true);
        } else {
          // narrow slits
          c.lineWidth = S * 0.06;
          line(c, x - R * 1.1, y + R * 0.1 - inner * R * 0.25, x + R * 1.1, y + R * 0.1 + inner * R * 0.25);
        }
        break;
      case 'sad':
        if (visor) clipDisc(c, x, y, R * 1.05, [x - inner * R * 1.4, y - R * 0.9], [x + inner * R * 1.4, y - R * 0.05]);
        else disc(c, x, y + R * 0.2, R * 0.8);
        break;
      case 'bored':
        // half shut: the lower half of the eye under a straight heavy lid
        c.save();
        c.beginPath();
        c.rect(x - R * 2, y - R * 0.05, R * 4, R * 3);
        c.clip();
        disc(c, x, y, R * (visor ? 1.15 : 1.05));
        c.restore();
        c.lineWidth = S * (visor ? 0.05 : 0.045);
        line(c, x - R * 1.35, y - R * 0.05, x + R * 1.35, y - R * 0.05);
        break;
      case 'wide':
        if (visor) disc(c, x, y, R * 1.45);
        else {
          c.fillStyle = '#fffdf4';
          disc(c, x, y, R * 1.6);
          c.lineWidth = S * 0.035;
          c.beginPath();
          c.arc(x, y, R * 1.6, 0, Math.PI * 2);
          c.stroke();
          c.fillStyle = col;
          disc(c, x, y + R * 0.1, R * 0.7);
        }
        break;
    }
    // brows (the toast only; the visor carries them in the cut of the eye)
    if (!visor) {
      const bw = R * 1.6;
      const by = y - R * 2.1;
      c.lineWidth = S * (cfg.brows ? 0.065 : 0.045);
      let tilt = 0; // + = inner end down (cross)
      let lift = 0;
      let show = !!cfg.brows;
      if (st === 'angry' || st === 'glare' || st === 'squeeze') { tilt = 0.95; show = true; }
      else if (st === 'sad') { tilt = -0.8; show = true; lift = -0.2; }
      else if (st === 'wide') { lift = -0.9; show = true; tilt = -0.15; }
      else if (st === 'happy') { lift = -0.5; }
      else if (st === 'bored') { tilt = 0; lift = 0.5; }
      else if (st === 'relief') { lift = -0.3; tilt = -0.3; }
      else if (cfg.brows) tilt = 0.35; // the resting grump
      if (show) {
        const ix = x + inner * bw * 0.55;
        const ox = x - inner * bw * 0.55;
        line(c, ox, by + R * lift - tilt * R * 0.5, ix, by + R * lift + tilt * R * 0.5);
      }
    }
  }
}

function drawMouth(c: Ctx, st: MouthState) {
  const S = CELL;
  const x = 0.5 * S;
  const y = 0.66 * S;
  const w = 0.16 * S;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.lineWidth = S * 0.045;
  const tongue = '#e2564a';
  switch (st) {
    case 'none':
      return;
    case 'smile':
      c.beginPath();
      c.moveTo(x - w, y - w * 0.15);
      c.quadraticCurveTo(x, y + w * 0.9, x + w, y - w * 0.15);
      c.stroke();
      return;
    case 'flat':
      line(c, x - w * 0.75, y + w * 0.1, x + w * 0.75, y + w * 0.1);
      return;
    case 'frown':
      c.beginPath();
      c.moveTo(x - w * 0.85, y + w * 0.45);
      c.quadraticCurveTo(x, y - w * 0.45, x + w * 0.85, y + w * 0.45);
      c.stroke();
      return;
    case 'smirk':
      c.beginPath();
      c.moveTo(x - w * 0.8, y + w * 0.15);
      c.quadraticCurveTo(x + w * 0.2, y + w * 0.35, x + w * 0.9, y - w * 0.35);
      c.stroke();
      return;
    case 'wavy':
      c.beginPath();
      c.moveTo(x - w, y);
      for (let i = 1; i <= 4; i++) c.lineTo(x - w + (i * w) / 2, y + (i % 2 ? -1 : 1) * w * 0.2);
      c.stroke();
      return;
    case 'oh':
      c.beginPath();
      c.ellipse(x, y + w * 0.1, w * 0.36, w * 0.46, 0, 0, Math.PI * 2);
      c.fill();
      return;
    case 'talk1':
      c.beginPath();
      c.ellipse(x, y + w * 0.05, w * 0.55, w * 0.32, 0, 0, Math.PI * 2);
      c.fill();
      return;
    case 'talk2':
    case 'grin': {
      // a D: flat top, round bottom, a tongue
      const ww = st === 'grin' ? w * 1.15 : w * 0.85;
      const hh = st === 'grin' ? w * 0.95 : w * 1.05;
      c.beginPath();
      c.moveTo(x - ww, y - hh * 0.3);
      c.lineTo(x + ww, y - hh * 0.3);
      c.quadraticCurveTo(x + ww, y + hh * 0.95, x, y + hh * 0.95);
      c.quadraticCurveTo(x - ww, y + hh * 0.95, x - ww, y - hh * 0.3);
      c.closePath();
      c.fill();
      c.save();
      c.clip();
      c.fillStyle = tongue;
      c.beginPath();
      c.ellipse(x, y + hh * 0.85, ww * 0.6, hh * 0.42, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      return;
    }
  }
}

function disc(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
function line(c: Ctx, x0: number, y0: number, x1: number, y1: number) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}
function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
/** a disc with everything above the line a-b cut away (`thin`: also cut below, a slit) */
function clipDisc(c: Ctx, x: number, y: number, r: number, a: [number, number], b: [number, number], thin = false) {
  c.save();
  // the half plane below the line a-b (y grows down)
  const big = 4000;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const n = Math.hypot(dx, dy) || 1;
  const ux = (dx / n) * big;
  const uy = (dy / n) * big;
  c.beginPath();
  c.moveTo(a[0] - ux, a[1] - uy);
  c.lineTo(a[0] + ux, a[1] + uy);
  c.lineTo(a[0] + ux, a[1] + uy + big);
  c.lineTo(a[0] - ux, a[1] - uy + big);
  c.closePath();
  c.clip();
  if (thin) {
    // and above a parallel line a little lower: a slanted slit
    const k = r * 0.75;
    c.beginPath();
    c.moveTo(a[0] - ux, a[1] - uy + k);
    c.lineTo(a[0] + ux, a[1] + uy + k);
    c.lineTo(a[0] + ux, a[1] + uy - big);
    c.lineTo(a[0] - ux, a[1] - uy - big);
    c.closePath();
    c.clip();
  }
  disc(c, x, y, r);
  c.restore();
}

// ------------------------------------------------------------------------------------------------

const atlases = new Map<string, THREE.CanvasTexture>();
function atlasFor(cfg: FaceConfig) {
  const key = `${cfg.kind}:${cfg.brows ? 1 : 0}:${(cfg.plate ?? []).join()}`;
  let t = atlases.get(key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = CELL * COLS;
  cv.height = CELL * ROWS;
  const c = cv.getContext('2d')!;
  const cells: ((c: Ctx) => void)[] = [...EYES.map((e) => (c: Ctx) => drawEyes(c, e, cfg)), ...MOUTHS.map((m) => (c: Ctx) => drawMouth(c, m))];
  cells.forEach((draw, i) => {
    c.save();
    c.translate((i % COLS) * CELL, Math.floor(i / COLS) * CELL);
    c.beginPath();
    c.rect(0, 0, CELL, CELL);
    c.clip();
    draw(c);
    c.restore();
  });
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  atlases.set(key, t);
  return t;
}

const cellUv = (i: number) => new THREE.Vector2(i % COLS, ROWS - 1 - Math.floor(i / COLS));

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D atlas;
  uniform vec2 eyeCell;
  uniform vec2 mouthCell;
  uniform vec2 grid;
  uniform float level;
  uniform vec3 dark;
  varying vec2 vUv;
  void main() {
    vec2 uv = clamp(vUv, 0.004, 0.996);
    vec4 m = texture2D(atlas, (mouthCell + uv) / grid);
    vec4 e = texture2D(atlas, (eyeCell + uv) / grid);
    vec4 c = m;
    c.rgb = mix(m.rgb, e.rgb, e.a);
    c.a = max(m.a, e.a);
    if (c.a < 0.5) discard;
    gl_FragColor = vec4(c.rgb * mix(dark, vec3(1.0), level), 1.0);
    #include <colorspace_fragment>
  }
`;

export class FaceCard {
  readonly mesh: THREE.Mesh;
  readonly cfg: FaceConfig;
  private mat: THREE.ShaderMaterial;
  private eye = -1;
  private mouth = -1;

  constructor(cfg: FaceConfig, size: number) {
    this.cfg = cfg;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        atlas: { value: atlasFor(cfg) },
        eyeCell: { value: cellUv(0) },
        mouthCell: { value: cellUv(EYES.length) },
        grid: { value: new THREE.Vector2(COLS, ROWS) },
        level: { value: 1 },
        dark: { value: new THREE.Color(0.3, 0.32, 0.52) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.mat);
    this.mesh.name = 'face-card';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.set('open', cfg.rest ?? 'flat');
  }

  set(eye: EyeState, mouth: MouthState) {
    const e = EYES.indexOf(eye);
    const m = EYES.length + MOUTHS.indexOf(this.cfg.kind === 'visor' ? 'none' : mouth);
    if (e !== this.eye) {
      this.eye = e;
      (this.mat.uniforms.eyeCell!.value as THREE.Vector2).copy(cellUv(e));
    }
    if (m !== this.mouth) {
      this.mouth = m;
      (this.mat.uniforms.mouthCell!.value as THREE.Vector2).copy(cellUv(m));
    }
  }

  setLit(on: boolean) {
    this.mat.uniforms.level!.value = on ? 1 : 0;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/**
 * Fold away the model's own face features (every vertex any morph target moves, with its morph
 * deltas zeroed) and put a drawn face card where they were, on the head bone. Call in the rest pose,
 * after the scene's world matrices are current. Returns null when the model has no morphs.
 */
/** vertices of `list` in connected pieces (shared triangles) whose bounds are under `max` across */
function smallPieces(g: THREE.BufferGeometry, list: number[], max: number): number[] {
  const index = g.index;
  const pos = g.attributes.position!;
  if (!index) return [];
  const inSet = new Uint8Array(pos.count);
  for (const i of list) inSet[i] = 1;
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; }
    return x;
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    if (!inSet[a] || !inSet[b] || !inSet[c]) continue;
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  const boxes = new Map<number, THREE.Box3>();
  const v = new THREE.Vector3();
  for (const i of list) {
    const r = find(i);
    let bx = boxes.get(r);
    if (!bx) boxes.set(r, (bx = new THREE.Box3()));
    bx.expandByPoint(v.fromBufferAttribute(pos, i));
  }
  const out: number[] = [];
  const size = new THREE.Vector3();
  for (const i of list) {
    const bx = boxes.get(find(i))!;
    if (bx.getSize(size).length() < max) out.push(i);
  }
  return out;
}

export function installFaceCard(vrm: VRM, cfg: FaceConfig, headBone: string): FaceCard | null {
  const fold = new THREE.Box3();
  const anchor = new THREE.Box3();
  const p = new THREE.Vector3();
  const moved: { mesh: THREE.SkinnedMesh; idx: number[] }[] = [];
  // which bone carries the features (the toast rides a spring bone of its own, not the head)
  const boneW = new Map<THREE.Object3D, number>();
  vrm.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh || !m.geometry) return;
    const morphs = m.geometry.morphAttributes.position;
    if (!morphs || !morphs.length) return;
    const pos = m.geometry.attributes.position!;
    const hit = new Uint8Array(pos.count);
    morphs.forEach((ma, ti) => {
      const list: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(ma.getX(i)) + Math.abs(ma.getY(i)) + Math.abs(ma.getZ(i)) > 1e-5) list.push(i);
      }
      const folds = cfg.fold ? cfg.fold.includes(ti) : list.length < 600;
      // a big morph (a whole slice of toast popping up) still carries small drawn features of its
      // own (the grumpy brows and eyes on the back slice): fold its small connected pieces only
      if (!folds) for (const i of smallPieces(m.geometry, list, 0.16)) hit[i] = 1;
      const anchors = cfg.anchor ? cfg.anchor.includes(ti) : folds;
      for (const i of list) {
        if (folds) hit[i] = 1;
        if (anchors) {
          const si = m.geometry.attributes.skinIndex;
          const sw = m.geometry.attributes.skinWeight;
          if (m.isSkinnedMesh && si && sw && m.skeleton) {
            for (let c = 0; c < 4; c++) {
              const b = m.skeleton.bones[si.getComponent(i, c)];
              const wv = sw.getComponent(i, c);
              if (b && wv > 0) boneW.set(b, (boneW.get(b) ?? 0) + wv);
            }
          }
          p.fromBufferAttribute(pos, i);
          if (m.isSkinnedMesh) m.applyBoneTransform(i, p);
          anchor.expandByPoint(p.applyMatrix4(m.matrixWorld));
        }
      }
    });
    const idx: number[] = [];
    for (let i = 0; i < pos.count; i++) if (hit[i]) idx.push(i);
    if (!idx.length) return;
    for (const i of idx) {
      p.fromBufferAttribute(pos, i);
      if (m.isSkinnedMesh) m.applyBoneTransform(i, p);
      fold.expandByPoint(p.applyMatrix4(m.matrixWorld));
    }
    moved.push({ mesh: m, idx });
  });
  if (!moved.length || anchor.isEmpty()) return null;

  // fold: every moved vertex to one point at the middle of its own feature cloud, deltas zeroed
  for (const { mesh, idx } of moved) {
    const g = mesh.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    for (const i of idx) c.add(p.fromBufferAttribute(pos, i));
    c.divideScalar(idx.length);
    for (const i of idx) pos.setXYZ(i, c.x, c.y, c.z);
    pos.needsUpdate = true;
    for (const key of Object.keys(g.morphAttributes)) {
      for (const ma of g.morphAttributes[key]!) {
        for (const i of idx) ma.setXYZ(i, 0, 0, 0);
        ma.needsUpdate = true;
      }
    }
  }

  // the card: as wide as the anchor features times `scale`, its drawn eye line on theirs
  const size = anchor.getSize(new THREE.Vector3());
  const center = anchor.getCenter(new THREE.Vector3());
  const side = Math.max(size.x, 0.02) * (cfg.scale ?? 1.4);
  const eyeLine = cfg.kind === 'visor' ? 0.5 : 0.4;
  const card = new FaceCard(cfg, side);
  let carrier: THREE.Object3D | null = null;
  let best = 0;
  for (const [b, wv] of boneW) if (wv > best) { best = wv; carrier = b; }
  const head = carrier ?? vrm.humanoid.getRawBoneNode(headBone as 'head') ?? vrm.humanoid.getRawBoneNode('head');
  if (!head) return null;
  const off = cfg.offset ?? [0, 0, 0];
  const world = new THREE.Matrix4().compose(
    new THREE.Vector3(center.x + off[0], center.y - (0.5 - eyeLine) * side + off[1], anchor.max.z + 0.004 + off[2]),
    new THREE.Quaternion(),
    new THREE.Vector3(1, 1, 1),
  );
  head.updateWorldMatrix(true, false);
  const local = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(world);
  local.decompose(card.mesh.position, card.mesh.quaternion, card.mesh.scale);
  head.add(card.mesh);
  return card;
}
