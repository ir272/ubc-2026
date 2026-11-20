// Gumbles: gumdrop jelly bodies on stubby legs, with a face that acts (lids, brows-by-lid, mouths
// that change with the action), shouldered nub arms, a sprout, and per-Gumble "species" variety:
// body build (classic, tall drop, mochi, bell, bun), a topper (ears, cat ears, horns, crest,
// floppy ears) and a face set that is a character of its own (gem / googly / button / pill eyes,
// open grin / cat mouth / smirk, fang or buck teeth, brows, blush or freckles), plus a costume
// material (translucent jelly, hard candy, matte rubber, waxy rind, velvet, sugar-coated).
// All 40 bots render through one InstancedMesh per part (a handful of draw calls + shadow passes).
// Animation is procedural and driven only by the sampled sim state (anim, animTime, motion).
// Visual only: never reads or changes the sim beyond the state view it is handed.
import * as THREE from 'three';
import { createMotion } from './motion.js';
import { createFx } from '../fx/puffs.js';
import { createFollowMarker } from '../camera/followMarker.js';
import { disposeTree } from '../world/dispose.js';

export const ANIMS = ['idle', 'run', 'jump', 'fall', 'dive', 'getup', 'stumble', 'tumble', 'grab', 'celebrate', 'sad'];
export const ANIM_INDEX = Object.fromEntries(ANIMS.map((a, i) => [a, i]));
const A = ANIM_INDEX;

const PATTERNS = ['stripes', 'spots', 'split', 'gradient', 'star', 'cap'];
export function patternIndex(name) {
  const i = PATTERNS.indexOf(name);
  if (i >= 0) return i;
  return hashStr(name) % PATTERNS.length;
}
function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function hash01(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }

// ---------------------------------------------------------------- dimensions
const BODY_H = 0.92;   // jelly body height (before the per-species build)
const LEG = 0.16;      // stubby-leg gap between the floor and the body's sole (its rounded bowl dips below)
const PIVOT = 0.55;    // tumble / lean pivot above the floor (big rotations; see the hip pivot below)
// Shoulder: where the arms root on the body (pre-build surface angle from the front, height).
// Low and forward, so arms hang from the front-sides of the gumdrop rather than poking out of
// its widest point like a T-pose.
const SHOULDER_TH = Math.PI / 2 - 0.36, SHOULDER_Y = 0.3;
export const GUMBLE_HEIGHT = LEG + BODY_H + 0.15; // with sprout

// Body builds: width, height, taper (+ = bell: wide base / narrow crown, - = bun: full crown).
// Every one stays a gumdrop (wide round base, domed top); they differ in silhouette.
// hip: how far apart the legs plant (wide-hipped builds stand on a broader base).
const SPECIES = [
  { sw: 1.0, sh: 1.0, taper: 0.12, arm: 1.0, foot: 1.0, hip: 1.0 },        // classic gumdrop
  { sw: 0.98, sh: 1.14, taper: 0.38, arm: 1.06, foot: 0.96, hip: 1.0 },  // tall: a steep gumdrop cone, broad base
  { sw: 1.38, sh: 0.66, taper: -0.05, arm: 0.86, foot: 1.16, hip: 1.36, face: 0.07 }, // mochi: wide and flat, big booties, face up on the dome
  { sw: 1.12, sh: 1.02, taper: 0.52, arm: 0.94, foot: 1.1, hip: 1.26 },   // pear: wide hips, small crown
  { sw: 1.04, sh: 0.88, taper: -0.24, arm: 1.04, foot: 0.98, hip: 1.04, face: 0.03 }, // bun: round full crown
];
// Toppers (besides the sprout): 0 none, 1 round ears, 2 cat ears, 3 horns, 4 back crest, 5 floppy ears.
const TOPPERS = 6;
// Face sets: eye size (x, y), half-spacing angle, eye height, resting lid, resting lid tilt,
// mouth width, run face (0 grin, 1 determined, 2 goofy tongue, 3 panting "o").
// Each face set is a different character, not a recolour: its own eye style (eye: 0 glossy gem
// with a tinted iris glow, 1 white googly eyes with pupils, 2 small plush-toy buttons, 3 tall
// pill eyes), its own resting mouth (rest: 0 open smile, 4 cat "w", 5 closed smirk), a mouth
// accent (acc: 0 none, 1 one fang, 2 buck teeth), brows or not, and cheek marks (blush strength,
// freckles).
const FACESETS = [
  { ex: 1.0, ey: 1.0, ang: 0.33, y: 0.55, lid: -2, tilt: 0, mw: 1.0, run: 0, eye: 0, rest: 0, acc: 0, brow: 0, blush: 1, freck: 0 },        // bright: gem eyes, big grin
  { ex: 0.62, ey: 1.28, ang: 0.27, y: 0.57, lid: -2, tilt: 0, mw: 0.85, run: 1, eye: 3, rest: 5, acc: 0, brow: 1, blush: 0, freck: 0 },     // intense: tall pill eyes, brows, smirk
  { ex: 1.02, ey: 1.0, ang: 0.38, y: 0.55, lid: -2, tilt: 0, mw: 1.1, run: 2, eye: 1, rest: 0, acc: 2, brow: 0, blush: 0.0, freck: 1 },    // goofy: googly eyes, buck teeth, freckles
  { ex: 0.6, ey: 0.6, ang: 0.36, y: 0.54, lid: -0.95, tilt: -0.12, mw: 0.8, run: 4, eye: 2, rest: 4, acc: 0, brow: 0, blush: 1, freck: 0 }, // sweet: small button eyes, cat mouth
  { ex: 0.96, ey: 0.9, ang: 0.34, y: 0.55, lid: -0.8, tilt: 0.3, mw: 0.95, run: 1, eye: 0, rest: 0, acc: 1, brow: 1, blush: 0.0, freck: 0 }, // scrappy: lidded gem eyes, brows, fang
];
const EYE_R = [0.088, 0.122, 0.056];

// ---------------------------------------------------------------- body profile + surface math
const PROFILE = (() => {
  const ctrl = [
    // a true gumdrop: flat sole with a soft rolled edge, near-straight flanks and a broad,
    // full dome (not an egg's narrow point), so every build keeps a round head-like crown
    // The underside is a shallow dome (the legs come out of it), so a Gumble lying on its belly
    // or seen from below shows a rounded bottom, never a flat plate.
    [0.0, -0.05], [0.2, -0.046], [0.36, -0.026], [0.468, 0.02], [0.538, 0.085], [0.566, 0.165], [0.562, 0.25],
    [0.54, 0.35], [0.508, 0.47], [0.468, 0.59], [0.418, 0.7], [0.352, 0.795], [0.264, 0.876], [0.142, 0.943], [0.0, 0.972],
  ].map(([r, y]) => [r, y * BODY_H / 0.97]);
  const curve = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(48);
  pts[0].set(0, -0.05 * BODY_H / 0.97);
  pts[pts.length - 1].set(0, BODY_H);
  return pts;
})();
function profR(y) {
  const p = PROFILE;
  if (y <= p[0].y) return p[0].x;
  for (let k = 1; k < p.length; k++) {
    if (p[k].y >= y) { const a = p[k - 1], b = p[k]; const t = (y - a.y) / Math.max(1e-6, b.y - a.y); return a.x + (b.x - a.x) * t; }
  }
  return 0;
}
// Point + normal on a species' body surface at angle th (0 = front, + = Gumble's left... +x)
// and pre-build height y0. Matches the vertex-shader deform exactly (radial taper + scale).
function surface(sp, th, y0, out) {
  const r0 = profR(y0);
  const dr = (profR(y0 + 0.01) - profR(y0 - 0.01)) / 0.02;
  const k = 1 + sp.taper * (0.45 - y0 / BODY_H), kp = -sp.taper / BODY_H;
  const r = r0 * sp.sw * k;
  // pre-build profile normal (nr, ny) ∝ (1, -dr); deformed: (sh nr, sw (k ny - r0 kp nr))
  let nr = 1, ny = -dr;
  const l = Math.hypot(nr, ny); nr /= l; ny /= l;
  let nr2 = sp.sh * nr, ny2 = sp.sw * (k * ny - r0 * kp * nr);
  const l2 = Math.hypot(nr2, ny2); nr2 /= l2; ny2 /= l2;
  out.px = Math.sin(th) * r; out.py = y0 * sp.sh; out.pz = Math.cos(th) * r;
  out.nx = Math.sin(th) * nr2; out.ny = ny2; out.nz = Math.cos(th) * nr2;
  out.yaw = Math.atan2(out.nx, out.nz); out.pitch = -Math.asin(Math.max(-1, Math.min(1, out.ny)));
  return out;
}

// GLSL: the same per-species build as surface(), on positions and normals (exact Jacobian).
const DEFORM_COMMON = `
  attribute vec4 aShape;
  float gK(float y) { return 1.0 + aShape.z * (0.45 - y * ${(1 / BODY_H).toFixed(6)}); }`;
const DEFORM_NORMAL = `
  {
    float gk = gK(position.y); float gkp = -aShape.z * ${(1 / BODY_H).toFixed(6)};
    objectNormal = normalize(vec3(aShape.y * objectNormal.x,
      aShape.x * (gk * objectNormal.y - gkp * (position.x * objectNormal.x + position.z * objectNormal.z)),
      aShape.y * objectNormal.z));
  }`;
const DEFORM_POS = `
  {
    float gk = gK(position.y);
    transformed = vec3(position.x * aShape.x * gk, position.y * aShape.y, position.z * aShape.x * gk);
  }`;

// Rigid parts rooted on the body (ears, horns, crest, tails): the root follows the build, the
// part keeps its shape (uniform scale by the build's mean size).
const TOPPER_POS = `
  {
    vec3 an = aAnchor.xyz;
    float gk = gK(an.y);
    vec3 anD = vec3(an.x * aShape.x * gk, an.y * aShape.y, an.z * aShape.x * gk);
    float us = pow(aShape.x * aShape.x * aShape.y, 0.3333);
    transformed = anD + (position - an) * us;
  }`;

// ---------------------------------------------------------------- geometry
function bodyGeometry() {
  const g = new THREE.LatheGeometry(PROFILE, 56);
  g.computeVertexNormals();
  return g;
}

function paintGeom(g, c) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function mergeGeoms(list) {
  // Minimal merge for non-indexed/indexed geometries; keeps attributes every input has.
  const geoms = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geoms) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geoms[0].attributes)) {
    if (name === 'uv') continue;
    if (!geoms.every((g) => g.attributes[name])) continue;
    const size = geoms[0].attributes[name].itemSize;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of geoms) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

function eyeGeometry() {
  // Glossy ink-drop eye (unit radii, scaled per face set): near-black plum at the top deepening
  // to a violet glow at the bottom (reads as depth, like a gumdrop gem), a big soft catchlight
  // up and out, and a small sparkle low and in.
  const eye = new THREE.SphereGeometry(1, 24, 16);
  eye.scale(EYE_R[0], EYE_R[1], EYE_R[2]);
  const p = eye.attributes.position;
  const col = new Float32Array(p.count * 3);
  const top = new THREE.Color(0x120a1d), low = new THREE.Color(0x4b3a8c), c = new THREE.Color();
  for (let k = 0; k < p.count; k++) {
    const yn = p.getY(k) / EYE_R[1], zn = p.getZ(k) / EYE_R[2];
    const t = Math.pow(Math.max(0, Math.min(1, (-yn - 0.05) / 0.85)), 1.4) * Math.max(0, zn);
    c.copy(top).lerp(low, t * 0.9);
    col.set([c.r, c.g, c.b], k * 3);
  }
  eye.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const hl = new THREE.SphereGeometry(1, 12, 8);
  hl.scale(0.03, 0.037, 0.009);
  hl.rotateZ(-0.5);
  hl.translate(0.03, 0.034, 0.047);
  const hl2 = new THREE.SphereGeometry(1, 8, 6);
  hl2.scale(0.016, 0.016, 0.008);
  hl2.translate(-0.03, -0.056, 0.047);
  paintGeom(hl, new THREE.Color(0xffffff));
  paintGeom(hl2, new THREE.Color(0xe8ddff));
  return mergeGeoms([eye, hl, hl2]);
}

// Eye shader: one mesh, several eye designs picked per instance (aEye.x style, aEye.y side):
// gem (dark glossy drop whose lower half glows in the Gumble's own iris colour), googly (a white
// eyeball with a big pupil looking a little inward), button (a flat matte-ish plush button) and
// pill (a flatter ink oval). The merged catchlights keep their white vertex colour.
function eyeMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aEye; attribute vec3 aIris; varying vec2 vEye; varying vec3 vIris; varying vec3 vEp;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vEye = aEye; vIris = aIris; vEp = position / vec3(${EYE_R.map((r) => r.toFixed(4)).join(', ')});`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vEye; varying vec3 vIris; varying vec3 vEp;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float hl = step(0.6, min(vColor.r, min(vColor.g, vColor.b)));   // catchlight geometry
          float st = vEye.x;
          vec3 ink = vec3(0.07, 0.04, 0.11);
          float low = clamp((-vEp.y + 0.1) / 1.0, 0.0, 1.0);
          if (st < 0.5) {
            // gem: ink at the top deepening into the Gumble's iris colour at the bottom
            vec3 iris = mix(vIris, vec3(0.3, 0.22, 0.6), 0.35) * 0.75;
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(ink, iris, pow(low, 1.3) * 0.95), (1.0 - hl) * step(0.0, vEp.z));
          } else if (st < 1.5) {
            // googly: white eyeball, a big dark pupil set a little low and toward the nose
            vec2 pc = vec2(-vEye.y * 0.16, -0.06);
            float d = length(vEp.xy - pc);
            float pupil = 1.0 - smoothstep(0.56, 0.6, d);
            float iris = 1.0 - smoothstep(0.66, 0.7, d);
            vec3 white = vec3(0.98, 0.97, 0.95) * mix(1.0, 0.8, smoothstep(0.55, 1.0, length(vEp.xy))) ;
            vec3 c = mix(white, mix(vIris * 0.6, vec3(0.2, 0.12, 0.3), 0.3), iris);
            c = mix(c, ink, pupil);
            diffuseColor.rgb = mix(c, diffuseColor.rgb, hl * pupil);
          } else if (st < 2.5) {
            // button: an even soft-black plush button with a faint rim
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.07, 0.1) * mix(1.0, 1.8, smoothstep(0.75, 1.0, length(vEp.xy))), 1.0 - hl);
          } else {
            // pill: flat ink with a faint cool sheen at the bottom
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(ink, vec3(0.2, 0.22, 0.42), low * 0.5), 1.0 - hl);
          }
        }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        // buttons are a satin plastic, not a wet gem; pill eyes are flat ink with a soft sheen
        // (no glassy white Fresnel crescent that would read as an eye-white)
        material.roughness = mix(material.roughness, 0.42, step(1.5, vEye.x) * step(vEye.x, 2.5));
        material.roughness = mix(material.roughness, 0.32, step(2.5, vEye.x));
        material.specularF90 = mix(material.specularF90, 0.3, step(1.5, vEye.x));
        #ifdef USE_CLEARCOAT
          material.clearcoat *= vEye.x < 0.5 ? 1.0 : vEye.x < 1.5 ? 0.6 : vEye.x < 2.5 ? 0.3 : 0.12;
        #endif`);
  };
  m.customProgramCacheKey = () => 'gumble-eye-v2';
  return m;
}

// Alternate mouths (aVar per vertex, picked per instance by aMv; the others collapse):
// 0 cat "w" (two little ink bumps), 1 closed smirk (a single ink curve, one end tucked up).
function mouthAltGeometry() {
  const parts = [];
  const add = (g, variant) => {
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aVar', new THREE.BufferAttribute(new Float32Array(n).fill(variant), 1));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  for (const side of [-1, 1]) {
    const a = new THREE.TorusGeometry(0.034, 0.012, 8, 16, Math.PI);
    a.rotateZ(Math.PI); a.scale(1, 0.95, 0.7); a.translate(side * 0.034, 0.0, 0.004);
    paintGeom(a, new THREE.Color(0x2a0d1e));
    add(a, 0);
  }
  { // a tiny pink tongue tip peeking under the cat mouth
    const t = new THREE.SphereGeometry(1, 12, 8); t.scale(0.022, 0.016, 0.01); t.translate(0, -0.03, 0.003);
    paintGeom(t, new THREE.Color(0xff7d98)); add(t, 0);
  }
  {
    const a = new THREE.TorusGeometry(0.075, 0.013, 8, 22, Math.PI * 0.82);
    a.rotateZ(Math.PI + 0.12); a.scale(1, 0.62, 0.7); a.translate(0, 0.022, 0.004);
    paintGeom(a, new THREE.Color(0x2a0d1e)); add(a, 1);
    const dimple = new THREE.SphereGeometry(1, 10, 6); dimple.scale(0.014, 0.014, 0.008); dimple.translate(0.07, 0.028, 0.004);
    paintGeom(dimple, new THREE.Color(0x2a0d1e)); add(dimple, 1);
  }
  const g = mergeGeoms(parts);
  g.scale(1.3, 1.3, 1.2);
  g.computeBoundingSphere();
  return g;
}

// Mouth accents worn with the open smile (aVar 0 one fang at the corner, 1 two buck teeth).
function mouthAccentGeometry() {
  const parts = [];
  const add = (g, variant) => {
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aVar', new THREE.BufferAttribute(new Float32Array(n).fill(variant), 1));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const f = new THREE.ConeGeometry(0.017, 0.04, 10, 2); f.rotateZ(Math.PI); f.translate(0.045, -0.018, 0.016);
  paintGeom(f, new THREE.Color(0xfffaf2)); add(f, 0);
  for (const side of [-1, 1]) {
    const t = new THREE.BoxGeometry(0.03, 0.034, 0.012, 2, 2, 1);
    const p = t.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) p.setX(k, p.getX(k) * 0.85);
    t.translate(side * 0.0165, -0.018, 0.016);
    paintGeom(t, new THREE.Color(0xfffaf2)); add(t, 1);
  }
  const g = mergeGeoms(parts);
  g.scale(1.4, 1.4, 1.2);
  g.computeBoundingSphere();
  return g;
}

function variantMaterial(key, attr, opts) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, ...opts });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aVar; attribute float ${attr};`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed *= step(abs(aVar - ${attr}), 0.5);`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// Brow: a soft rounded dash (unit length along x), tilted with the lid tilt.
function browGeometry() {
  const g = new THREE.CapsuleGeometry(0.5, 1.4, 6, 12);
  g.rotateZ(Math.PI / 2);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { const x = p.getX(k); p.setY(k, p.getY(k) - 0.35 * x * x * 0.25); }
  g.scale(0.042, 0.022, 0.016);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function lidGeometry() {
  // Upper eyelid: a unit dome with a nearly flat underside, so its edge reads as a crisp lid
  // line across the eye. It hinges about x; tilting it about z makes angry / worried brows.
  const g = new THREE.SphereGeometry(1, 22, 12);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) p.setY(k, p.getY(k) * 0.06);
  g.computeVertexNormals();
  return g;
}

function mouthSmileGeometry() {
  // Open "D" smile with depth: a dark berry hollow (flat top, round bottom), a pink tongue
  // and a thin row of top teeth. Flipped upside down it is a sad open frown.
  const m = new THREE.SphereGeometry(1, 20, 12);
  const p = m.attributes.position;
  for (let k = 0; k < p.count; k++) if (p.getY(k) > 0) p.setY(k, p.getY(k) * 0.08);
  m.computeVertexNormals();
  m.scale(0.075, 0.055, 0.018);
  const t = new THREE.SphereGeometry(1, 12, 8);
  t.scale(0.048, 0.026, 0.012);
  t.translate(0, -0.036, 0.011);
  const teeth = new THREE.SphereGeometry(1, 12, 6);
  teeth.scale(0.05, 0.011, 0.01);
  teeth.translate(0, -0.006, 0.012);
  paintGeom(m, new THREE.Color(0x3a0b1f));
  paintGeom(t, new THREE.Color(0xff6f8e));
  paintGeom(teeth, new THREE.Color(0xfff6ee));
  const g = mergeGeoms([m, t, teeth]);
  g.scale(1.4, 1.4, 1.2);
  return g;
}

function mouthOpenGeometry() {
  // Round shout (surprise / panic / "hup!"): a deep oval with a tongue, scaled per expression.
  const m = new THREE.SphereGeometry(1, 16, 10);
  m.scale(0.07, 0.06, 0.02);
  const t = new THREE.SphereGeometry(1, 12, 8);
  t.scale(0.045, 0.026, 0.012);
  t.translate(0, -0.03, 0.014);
  paintGeom(m, new THREE.Color(0x3b0d1f));
  paintGeom(t, new THREE.Color(0xff6f8e));
  const g = mergeGeoms([m, t]);
  g.scale(1.25, 1.25, 1.2);
  return g;
}

function mouthGritGeometry() {
  // Effort grimace: clenched teeth in a dark rim, a line between the rows.
  const rim = new THREE.SphereGeometry(1, 18, 8);
  rim.scale(0.082, 0.036, 0.014);
  const teeth = new THREE.SphereGeometry(1, 18, 8);
  teeth.scale(0.07, 0.025, 0.012);
  teeth.translate(0, 0, 0.005);
  const line = new THREE.BoxGeometry(0.12, 0.006, 0.006);
  line.translate(0, 0, 0.016);
  const gap = new THREE.BoxGeometry(0.006, 0.04, 0.006);
  gap.translate(0, 0, 0.016);
  paintGeom(rim, new THREE.Color(0x3a0b1f));
  paintGeom(teeth, new THREE.Color(0xfff8f0));
  paintGeom(line, new THREE.Color(0x6a3346));
  paintGeom(gap, new THREE.Color(0xc9b8b4));
  const g = mergeGeoms([rim, teeth, line, gap]);
  g.scale(1.25, 1.3, 1.2);
  return g;
}

function tongueGeometry() {
  // Goofy "blep": a tongue poking out under the smile.
  const t = new THREE.SphereGeometry(1, 14, 10);
  t.scale(0.036, 0.048, 0.02);
  const p = t.attributes.position;
  for (let k = 0; k < p.count; k++) if (p.getY(k) > 0) p.setY(k, p.getY(k) * 0.3);
  t.computeVertexNormals();
  t.translate(0, -0.03, 0.006);
  const groove = new THREE.BoxGeometry(0.004, 0.04, 0.004);
  groove.translate(0, -0.035, 0.026);
  paintGeom(t, new THREE.Color(0xff6f8e));
  paintGeom(groove, new THREE.Color(0xd94a6a));
  const g = mergeGeoms([t, groove]);
  g.scale(1.3, 1.3, 1.2);
  return g;
}

function sproutGeometry() {
  // A plump seedling: curved stem and two cupped round leaves (one larger), not a palm frond.
  const stem = new THREE.CylinderGeometry(0.026, 0.036, 0.15, 8);
  stem.translate(0, 0.075, 0);
  stem.rotateZ(0.12);
  const leaf = () => {
    const l = new THREE.SphereGeometry(1, 14, 8);
    l.scale(1, 0.26, 0.68);
    const p = l.attributes.position;
    for (let k = 0; k < p.count; k++) { // cup the leaf: tips curl up
      const x = p.getX(k), z = p.getZ(k);
      p.setY(k, p.getY(k) + 0.28 * x * x + 0.1 * z * z);
    }
    l.computeVertexNormals();
    return l;
  };
  const leafL = leaf();
  leafL.scale(0.1, 0.1, 0.1);
  leafL.translate(-0.09, 0.0, 0);
  leafL.rotateZ(0.4);
  leafL.translate(-0.02, 0.16, 0);
  const leafR = leaf();
  leafR.scale(0.075, 0.075, 0.075);
  leafR.translate(0.07, 0.0, 0);
  leafR.rotateZ(-0.5);
  leafR.translate(0.025, 0.15, 0.01);
  paintGeom(stem, new THREE.Color(0x4f9a2c));
  paintGeom(leafL, new THREE.Color(0x86da45));
  paintGeom(leafR, new THREE.Color(0x6fcb3a));
  return mergeGeoms([stem, leafL, leafR]);
}

// A tube along a curve with radius rFn(t) (t 0..1), smooth radial normals, open ends.
function smooth01(t) { return t * t * (3 - 2 * t); }
function radTube(curve, seg, radial, rFn) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, n = g.attributes.normal, c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, c);
    const r = rFn(t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + n.getX(k) * r, c.y + n.getY(k) * r, c.z + n.getZ(k) * r);
    }
  }
  g.deleteAttribute('uv');
  return g;
}

function armGeometry() {
  // A real little arm, built for the RIGHT side (+x out, +z forward, +y up) from the shoulder
  // pivot (inside the body): a rounded shoulder bulge where it roots, an upper arm that leaves
  // the body heading out and down, a forearm that bends forward, and a chunky mitten hand with a
  // thumb on its forward edge (palm down / in), so even a straight-out pose holds a gesture and
  // the outline breaks the body's oval with a clear hand shape. The left arm is the same mesh
  // mirrored front-to-back in the arm shader (the rig turns the left arm half round, so its local
  // -z must face forward); the arm material is double-sided to keep the mirrored faces.
  const build = () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.03, 0.01, -0.01), new THREE.Vector3(0.07, 0.0, 0.0), new THREE.Vector3(0.15, -0.035, 0.02),
      new THREE.Vector3(0.215, -0.085, 0.055), new THREE.Vector3(0.255, -0.13, 0.095),
    ]);
    const arm = radTube(curve, 16, 14, (t) => {
      // a fat root that melts into the body (0.135), a plump upper arm (0.094), a forearm that
      // tapers to a soft wrist (0.066) before the mitten swells out again
      const sh = 0.135 - 0.04 * smooth01(Math.min(1, t / 0.45));
      return t < 0.45 ? sh : 0.095 - 0.029 * ((t - 0.45) / 0.55) ** 1.2;
    });
    const shoulder = new THREE.SphereGeometry(1, 16, 10);
    shoulder.scale(0.15, 0.15, 0.145); shoulder.translate(-0.025, 0.005, -0.005);
    shoulder.deleteAttribute('uv');
    // mitten: a soft flattened paddle continuing the forearm, slightly cupped
    const end = curve.getPointAt(1), dir = curve.getTangentAt(1);
    const mitt = new THREE.SphereGeometry(1, 16, 10);
    {
      const mp = mitt.attributes.position;
      for (let k = 0; k < mp.count; k++) {
        const x = mp.getX(k), y = mp.getY(k);
        // fuller at the finger end, a little cupped underneath
        const f = 0.86 + 0.14 * (x + 1) * 0.5;
        mp.setY(k, (y < 0 ? y * 0.82 : y) * f + 0.12 * x * x * (y < 0 ? 1 : 0.4));
        mp.setZ(k, mp.getZ(k) * f);
      }
      mitt.computeVertexNormals();
    }
    mitt.scale(0.104, 0.074, 0.098);
    mitt.deleteAttribute('uv');
    // thumb: a stubby capsule on the forward edge, angled up and out
    const thumb = new THREE.SphereGeometry(1, 10, 7);
    thumb.scale(0.04, 0.056, 0.04); thumb.rotateX(0.6); thumb.rotateZ(-0.35);
    thumb.translate(-0.02, 0.03, 0.086);
    thumb.deleteAttribute('uv');
    const hand = mergeGeoms([mitt, thumb]);
    // orient the hand along the forearm's end direction, sitting just past the wrist
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    hand.applyQuaternion(q);
    hand.translate(end.x + dir.x * 0.065, end.y + dir.y * 0.065, end.z + dir.z * 0.065);
    // mitten hand marker for the material (a softer, paler vinyl than the arm)
    const parts = [shoulder, arm, hand];
    const out = mergeGeoms(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    const n = out.attributes.position.count;
    const hm = new Float32Array(n);
    const handFrom = shoulder.toNonIndexed().attributes.position.count + arm.toNonIndexed().attributes.position.count;
    hm.fill(1, handFrom);
    out.setAttribute('aHand', new THREE.BufferAttribute(hm, 1));
    return out;
  };
  const g = build();
  g.computeBoundingSphere();
  return g;
}

function legGeometry() {
  // Stubby leg: hip at the origin (flared, so it grows out of the body), ankle at y = -1
  // (scaled to the hip-ankle distance per frame).
  const g = new THREE.CylinderGeometry(0.19, 0.14, 1, 20, 6, true);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { // pinch the middle a touch: a soft knee-less jelly leg
    const y = p.getY(k), f = 1 - 0.06 * Math.sin((y + 0.5) * Math.PI);
    p.setX(k, p.getX(k) * f); p.setZ(k, p.getZ(k) * f);
  }
  g.translate(0, -0.5, 0);
  g.computeVertexNormals();
  return g;
}

function footGeometry() {
  // Bootie: a rounded rubbery foot with the toe pointing forward, a flat sole and a lip
  // around it (the foot shader paints the sole band).
  // Big enough to read at chase-cam distance: the feet are what plant a Gumble on the floor.
  const g = new THREE.SphereGeometry(1, 28, 16);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k), z = p.getZ(k);
    if (y < 0) p.setY(k, y * 0.4);
    p.setY(k, p.getY(k) + 0.14 * Math.max(0, z) * Math.max(0, z)); // toe springs up a touch
    if (z > 0) { const f = 1 + 0.16 * z; p.setX(k, p.getX(k) * f); } // wider, rounder toe
  }
  g.computeVertexNormals();
  g.scale(0.176, 0.12, 0.226);
  g.translate(0, 0.048, 0.14);
  return g;
}

function flipWinding(g) {
  const idx = g.index;
  if (idx) { for (let k = 0; k < idx.count; k += 3) { const t = idx.getX(k + 1); idx.setX(k + 1, idx.getX(k + 2)); idx.setX(k + 2, t); } }
  return g; // (normals were already mirrored by the scale)
}

// A tube along a curve whose radius eases from r0 to r1, with smooth radial normals and a
// rounded end cap, for tails that must stay smooth up close.
function taperTube(curve, seg, radial, r0, r1) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position, n = g.attributes.normal, c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * (t * t * (3 - 2 * t));
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const nx = n.getX(k), ny = n.getY(k), nz = n.getZ(k);
      p.setXYZ(k, c.x + nx * r, c.y + ny * r, c.z + nz * r);
    }
  }
  const tip = new THREE.SphereGeometry(r1, radial, 10);
  curve.getPointAt(1, c);
  tip.translate(c.x, c.y, c.z);
  g.deleteAttribute('uv'); tip.deleteAttribute('uv');
  return mergeGeoms([g, tip]);
}

function topperGeometry() {
  // Every topper variant in one geometry (pre-build body space); aVar picks the variant per
  // instance (others collapse to a point in the vertex shader), aMix picks colour A or B.
  const sp0 = { sw: 1, sh: 1, taper: 0 };
  const S = {};
  const parts = [];
  // aAnchor (xyz) is the point on the body the part roots at (pre-build); the shader moves that
  // point with the species build but keeps the part itself rigid (uniformly scaled), so ears and
  // horns keep their shape on a wide-flat or a tall body. aAnchor.w carries the colour mix.
  let anchor = [0, 0, 0];
  const add = (g, variant, mix) => {
    const n = g.attributes.position.count;
    g.setAttribute('aVar', new THREE.BufferAttribute(new Float32Array(n).fill(variant), 1));
    const an = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) an.set([anchor[0], anchor[1], anchor[2], mix], k * 4);
    g.setAttribute('aAnchor', new THREE.BufferAttribute(an, 4));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const onSurf = (g, th, y0, out, lift = 0) => {
    surface(sp0, th, y0, S);
    anchor = [S.px, S.py, S.pz];
    g.translate(S.px + S.nx * out, S.py + S.ny * out + lift, S.pz + S.nz * out);
  };
  for (const side of [-1, 1]) {
    // 1: round bear ears, outer A, inner disc B
    {
      const e = new THREE.SphereGeometry(1, 24, 16); e.scale(0.18, 0.175, 0.08);
      const inner = new THREE.SphereGeometry(1, 18, 12); inner.scale(0.105, 0.1, 0.024); inner.translate(0, 0, 0.07);
      for (const [g, mix] of [[e, 0], [inner, 1]]) {
        g.rotateZ(-side * 0.55); onSurf(g, side * 1.1, 0.78, 0.04); add(g, 1, mix);
      }
    }
    // 2: soft cat ears (rounded cones), A with a B inner
    {
      const e = new THREE.ConeGeometry(0.15, 0.34, 24, 6); e.scale(1, 1, 0.55);
      const p = e.attributes.position;
      for (let k = 0; k < p.count; k++) { const y = p.getY(k); if (y > 0.06) { const f = 1 - (y - 0.06) * 1.2; p.setX(k, p.getX(k) * f); p.setZ(k, p.getZ(k) * f); } }
      e.computeVertexNormals();
      const inner = new THREE.ConeGeometry(0.084, 0.21, 18, 4); inner.scale(1, 1, 0.3); inner.translate(0, -0.03, 0.046);
      for (const [g, mix] of [[e, 0], [inner, 1]]) {
        g.translate(0, 0.08, 0); g.rotateZ(-side * 0.42); onSurf(g, side * 0.95, 0.76, -0.02); add(g, 2, mix);
      }
    }
    // 3: little horns, colour B, curling out and up
    {
      const h = new THREE.ConeGeometry(0.08, 0.28, 18, 8);
      const p = h.attributes.position;
      for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 0.1; p.setX(k, p.getX(k) + side * 0.25 * y * y); }
      h.computeVertexNormals();
      h.translate(0, 0.08, 0); h.rotateZ(-side * 0.3); h.rotateX(0.15);
      onSurf(h, side * 0.62, 0.8, -0.01); add(h, 3, 1);
    }
    // 5: floppy ears hanging down the sides, A
    {
      const e = new THREE.SphereGeometry(1, 24, 16); e.scale(0.088, 0.24, 0.13);
      e.translate(0, -0.14, 0); e.rotateZ(side * 0.5);
      onSurf(e, side * 1.25, 0.82, 0.03); add(e, 5, 0);
    }
  }
  // 4: back crest, three gumdrop bumps down the back, colour B
  for (let k = 0; k < 3; k++) {
    const s = 0.1 - k * 0.022;
    const b = new THREE.SphereGeometry(1, 14, 10); b.scale(s * 0.6, s * 1.15, s);
    const p = b.attributes.position;
    for (let j = 0; j < p.count; j++) if (p.getY(j) < 0) p.setY(j, p.getY(j) * 0.5);
    b.computeVertexNormals();
    const y0 = 0.84 - k * 0.15;
    surface(sp0, Math.PI, y0, S);
    b.rotateX(-Math.asin(Math.max(-1, Math.min(1, S.nz))) * 0.8);
    onSurf(b, Math.PI, y0, 0.02); add(b, 4, 1);
  }
  // Tails (variant 10 + tail index, chosen independently of the topper) so the back of every
  // Gumble has a design and an outline of its own. All smooth, finely subdivided meshes with
  // analytic normals (no faceting): 10 cotton pom, 11 piggy curl, 12 jelly drop, 13 upturned
  // swoosh with a bobble. Built with "out of the back" = -z, then sat on the spine.
  {
    const ROOT_Y = 0.24;
    // 10: a cotton pom: a cluster of soft puffs round a core, so its outline is fluffy
    {
      const puffs = [];
      const core = new THREE.SphereGeometry(0.1, 20, 14); puffs.push(core);
      for (let k = 0; k < 7; k++) {
        const a = k * 2.399 + 0.3, zz = 1 - (k + 0.5) / 7 * 1.4;
        const rr = Math.sqrt(Math.max(0, 1 - zz * zz));
        const b = new THREE.SphereGeometry(0.058 + 0.012 * ((k * 5) % 3), 14, 10);
        b.translate(Math.cos(a) * rr * 0.085, Math.sin(a) * rr * 0.085, -zz * 0.06);
        puffs.push(b);
      }
      const pom = mergeGeoms(puffs);
      pom.scale(1.15, 1.1, 1.0); pom.translate(0, 0.01, -0.08);
      onSurf(pom, Math.PI, ROOT_Y, 0.0); add(pom, 10, 2);
    }

    const curlPts = [new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(0, -0.01, -0.02)];
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2.5, r = 0.085 * (1 - 0.27 * a / Math.PI);
      curlPts.push(new THREE.Vector3(0.012 * a, 0.075 - r * Math.cos(a), -0.1 - r * Math.sin(a)));
    }
    const curl = taperTube(new THREE.CatmullRomCurve3(curlPts), 48, 12, 0.048, 0.017);
    onSurf(curl, Math.PI, ROOT_Y - 0.02, 0.0); add(curl, 11, 1);

    // 12: a little fluke (a two-lobed fin tail): a stem out of the back that flares into two
    // rounded lobes, a wide V from behind and a clear tail from the side
    const stem = taperTube(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(0, -0.005, -0.06), new THREE.Vector3(0, 0.03, -0.15),
    ]), 16, 12, 0.06, 0.04);
    onSurf(stem, Math.PI, ROOT_Y - 0.02, 0.0); add(stem, 12, 0);
    for (const side of [-1, 1]) {
      const lobe = new THREE.SphereGeometry(1, 20, 12);
      const lp = lobe.attributes.position;
      for (let k = 0; k < lp.count; k++) { // fatter at the tip, pinched at the stem
        const x = lp.getX(k); const f = 0.7 + 0.3 * (x + 1) * 0.5;
        lp.setY(k, lp.getY(k) * f); lp.setZ(k, lp.getZ(k) * f);
      }
      lobe.computeVertexNormals();
      lobe.scale(0.1, 0.05, 0.036);
      lobe.translate(0.09, 0, 0);
      lobe.rotateZ(0.55); lobe.rotateY(-0.25);
      if (side < 0) { lobe.scale(-1, 1, 1); flipWinding(lobe); }
      lobe.translate(0, 0.04, -0.17);
      onSurf(lobe, Math.PI, ROOT_Y - 0.02, 0.0); add(lobe, 12, 1);
    }

    const sw = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.02, 0.05), new THREE.Vector3(0, 0.0, -0.06), new THREE.Vector3(0, 0.06, -0.15),
      new THREE.Vector3(0, 0.16, -0.19), new THREE.Vector3(0, 0.24, -0.16),
    ]);
    const tail = taperTube(sw, 36, 14, 0.07, 0.03);
    const bob = new THREE.SphereGeometry(1, 16, 12); bob.scale(0.06, 0.06, 0.06); bob.translate(0, 0.25, -0.155);
    onSurf(tail, Math.PI, ROOT_Y - 0.04, 0.0); add(tail, 13, 0);
    onSurf(bob, Math.PI, ROOT_Y - 0.04, 0.0); add(bob, 13, 2);
  }
  const g = mergeGeoms(parts);
  g.computeBoundingSphere();
  return g;
}

// Sprout variants (aVar per vertex, picked per instance by aSpr): 0 two-leaf seedling,
// 1 single big leaf, 2 little flower, 3 curly tendril with a bud.
function sproutVariants() {
  const parts = [];
  const add = (g, variant) => {
    const n = g.attributes.position.count;
    g.setAttribute('aVar', new THREE.BufferAttribute(new Float32Array(n).fill(variant), 1));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  add(sproutGeometry(), 0);
  const leaf = (sc) => {
    const l = new THREE.SphereGeometry(1, 16, 8);
    l.scale(1, 0.24, 0.62);
    const p = l.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), z = p.getZ(k); p.setY(k, p.getY(k) + 0.3 * x * x + 0.12 * z * z); }
    l.computeVertexNormals(); l.scale(sc, sc, sc);
    return l;
  };
  {
    const stem = new THREE.CylinderGeometry(0.024, 0.036, 0.11, 8); stem.translate(0, 0.055, 0);
    const l = leaf(0.15); l.translate(0.13, 0, 0); l.rotateZ(0.75); l.translate(0.0, 0.1, 0);
    paintGeom(stem, new THREE.Color(0x4f9a2c)); paintGeom(l, new THREE.Color(0x7fd640));
    add(mergeGeoms([stem, l]), 1);
  }
  {
    const stem = new THREE.CylinderGeometry(0.02, 0.032, 0.14, 8); stem.translate(0, 0.07, 0); stem.rotateZ(-0.1);
    const list = [stem];
    paintGeom(stem, new THREE.Color(0x4f9a2c));
    for (let k = 0; k < 5; k++) {
      const pt = new THREE.SphereGeometry(1, 10, 6); pt.scale(0.055, 0.02, 0.034); pt.translate(0.05, 0, 0);
      pt.rotateZ(0.35); pt.rotateY(k * Math.PI * 2 / 5); pt.translate(-0.012, 0.15, 0);
      paintGeom(pt, new THREE.Color(0xfff3f8)); list.push(pt);
    }
    const c = new THREE.SphereGeometry(1, 10, 8); c.scale(0.034, 0.026, 0.034); c.translate(-0.012, 0.162, 0);
    paintGeom(c, new THREE.Color(0xffc93a)); list.push(c);
    add(mergeGeoms(list), 2);
  }
  {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.01, 0.07, 0), new THREE.Vector3(0.06, 0.13, 0),
      new THREE.Vector3(0.1, 0.1, 0), new THREE.Vector3(0.08, 0.065, 0), new THREE.Vector3(0.05, 0.085, 0),
    ]);
    const t = new THREE.TubeGeometry(curve, 24, 0.018, 7, false);
    paintGeom(t, new THREE.Color(0x58a832));
    const l = leaf(0.07); l.rotateZ(0.5); l.translate(-0.06, 0.08, 0);
    paintGeom(l, new THREE.Color(0x86da45));
    const bud = new THREE.SphereGeometry(1, 10, 8); bud.scale(0.032, 0.038, 0.032); bud.translate(0.05, 0.09, 0);
    paintGeom(bud, new THREE.Color(0x9be05a));
    add(mergeGeoms([t, l, bud]), 3);
  }
  const g = mergeGeoms(parts);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- lens-clearance fade
// Per-instance visibility (attribute aVis, 0..1), so a Gumble that sits right in front of the
// lens or between the camera and the watched bot can be faded out. No screen-door dither: the
// opaque mesh draws only fully visible instances, and a "ghost" twin of each mesh (sharing its
// geometry and instance buffers, drawn in the transparent pass, and only while something is
// fading) draws the fading instances with smooth alpha. Chained onto any material's
// onBeforeCompile; ghost = true makes the transparent twin.
function withFade(m, key, ghost = false) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    if (prev) prev.call(m, shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aVis; varying float vVis;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vVis = aVis;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vVis;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float vvis = clamp((vVis - 0.04) / 0.92, 0.0, 1.0);
        ${ghost ? 'if (vvis >= 0.999 || vvis <= 0.0) discard;' : 'if (vvis < 0.999) discard;'}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        ${ghost ? 'gl_FragColor.a *= vvis * vvis * vvis;' : ''}`);
  };
  m.customProgramCacheKey = () => key + (ghost ? '-ghost' : '');
  if (ghost) { m.transparent = true; m.depthWrite = true; }
  return m;
}

// ---------------------------------------------------------------- jelly lighting
// Costume material classes, picked per Gumble so the cast is not one inflated toy repainted:
// 0 translucent satin jelly (light glows through it), 1 glossy hard candy (one tight, bright
// highlight), 2 matte soft-touch rubber (no gloss at all), 3 waxy fruit rind (fine pores, low
// sheen), 4 velvet flock fuzz, 5 sugar-coated gumdrop (matte crust of white sugar grains that
// glitter). gumbleMatP(c) -> roughness, clearcoat, clearcoat roughness, gloss (the strength of
// the soft window glint); gumbleFuzz(c) -> 0..1; gumbleSSS(c) -> how much light the costume
// lets through (0 opaque .. 1 jelly).
const MAT_GLSL = `
  vec4 gumbleMatP(float c) {
    if (c < 0.5) return vec4(0.46, 0.3, 0.34, 0.75);
    if (c < 1.5) return vec4(0.2, 1.0, 0.05, 1.3);
    if (c < 2.5) return vec4(0.84, 0.0, 0.5, 0.0);
    if (c < 3.5) return vec4(0.58, 0.12, 0.45, 0.35);
    if (c < 4.5) return vec4(0.95, 0.0, 0.6, 0.0);
    return vec4(0.9, 0.0, 0.6, 0.0);
  }
  float gumbleFuzz(float c) { return step(3.5, c) * step(c, 4.5); }
  float gumbleSSS(float c) { return c < 0.5 ? 1.0 : c < 1.5 ? 0.7 : c < 2.5 ? 0.0 : c < 3.5 ? 0.35 : c < 4.5 ? 0.0 : 0.2; }`;

// Soft vinyl-jelly look shared by every jelly part. Runs after three's light loop and adds:
// sun wrapped past the terminator (no hard black edge), a cool lilac fill on the shadow side
// (shadows go violet, never mud, but clearly darker than the lit side so overlapping bodies
// separate), ambient occlusion (jAO, set by the caller), light scattered through the jelly when
// back-lit, a cool sky rim that outlines every silhouette with a pale edge, and velvet edge
// glow for fuzzy costumes. Expects vec3 jAlb (albedo), float jAO, float jGloss (window glint
// strength) and float jFuzz (0..1) to be defined.
const JELLY_LIGHT = `
  {
    vec3 jN = normal; vec3 jV = normalize(vViewPosition);
    #if NUM_DIR_LIGHTS > 0
      vec3 jL = directionalLights[0].direction; vec3 jLc = directionalLights[0].color;
    #else
      vec3 jL = vec3(0.0, 1.0, 0.0); vec3 jLc = vec3(1.0);
    #endif
    float ndl = dot(jN, jL);
    // light wraps a little past the terminator in translucent costumes only (opaque rubber and
    // velvet keep a firmer core shadow)
    float wrap = clamp((ndl + 0.5) / 1.5, 0.0, 1.0) - clamp(ndl, 0.0, 1.0);
    reflectedLight.directDiffuse += jAlb * jLc * wrap * (0.03 + 0.09 * jSSS);
    float shadeSide = 1.0 - smoothstep(-0.35, 0.45, ndl);
    // the side away from the sun steps down in value (a readable core shadow), then takes a
    // saturated violet-sky fill so it never goes grey or black
    reflectedLight.indirectDiffuse *= mix(1.0, 0.56, shadeSide);
    reflectedLight.indirectDiffuse += jAlb * vec3(0.46, 0.44, 1.0) * shadeSide * 0.2;
    reflectedLight.indirectDiffuse *= jAO;
    reflectedLight.directDiffuse *= mix(0.62, 1.0, jAO);
    // sky dome above, floor below: surfaces turning down lose ambient, so even a front-lit pale
    // costume keeps a rounded value fall-off under its dome and toward its base
    float jSky = clamp(dot(jN, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0))) * 0.5 + 0.5, 0.0, 1.0);
    reflectedLight.indirectDiffuse *= mix(0.66, 1.06, jSky);
    // gummy depth: toward the silhouette the jelly gets thicker, so deeper and more saturated
    float jEdge = pow(1.0 - clamp(dot(jN, jV), 0.0, 1.0), 1.6);
    vec3 jSatK = mix(vec3(1.0), jAlb / max(max(jAlb.r, jAlb.g), max(jAlb.b, 1e-3)) * 0.8, jEdge * 0.6 * (1.0 - jFuzz));
    reflectedLight.directDiffuse *= jSatK;
    reflectedLight.indirectDiffuse *= jSatK;
    vec3 jDeep = jAlb * (0.5 + 0.9 * jAlb);
    vec3 jH = normalize(jL + jN * 0.5);
    float sss = pow(clamp(dot(jV, -jH), 0.0, 1.0), 2.5);
    reflectedLight.indirectDiffuse += jDeep * jLc * (0.03 + 0.18 * sss) * jAO * jSSS;
    // subsurface glow at the terminator: in jelly, light that enters the lit side bleeds a
    // band of deep, saturated colour into the shadow edge (opaque costumes stay crisp)
    float jTerm = exp(-pow((ndl + 0.08) / 0.24, 2.0));
    reflectedLight.indirectDiffuse += jDeep * jLc * jTerm * 0.16 * jSSS * jAO;
    // soft "window" glint from a virtual light above and behind the viewer: a dim gloss, tight
    // on hard candy, broad and faint on satin, absent on matte rubber, velvet and sugar
    vec3 jK = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0) * 0.9 + jV);
    float gTight = clamp(jGloss - 0.8, 0.0, 1.0);
    float glint = smoothstep(mix(0.9, 0.965, gTight), mix(0.985, 0.995, gTight), dot(jN, normalize(jK + jV)));
    reflectedLight.indirectSpecular += vec3(1.0, 0.97, 0.95) * glint * 0.13 * jGloss * jAO;
    // camera-side fill (a soft bounce card by the lens): faces and fronts turned toward the
    // viewer stay readable even when the sun is behind the Gumble
    float jFace = clamp(dot(jN, jV), 0.0, 1.0);
    reflectedLight.indirectDiffuse += jAlb * vec3(1.0, 0.96, 0.98) * jFace * jFace * 0.09 * jAO;
    // cool sky rim: a pale blue edge on every silhouette, strongest on edges turned up and away
    // from the sun, so two same-coloured bodies that overlap still read as two shapes
    float jRim = pow(1.0 - jFace, 2.5);
    float jUp = clamp(dot(jN, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0))) * 0.5 + 0.5, 0.0, 1.0);
    float jAway = 1.0 - 0.55 * clamp(ndl, 0.0, 1.0);
    reflectedLight.indirectSpecular += vec3(0.7, 0.83, 1.0) * jRim * (0.16 + 0.42 * jUp) * jAway * mix(0.6, 1.0, jAO);
    // velvet: fuzz catches light at grazing angles (a soft pale halo tinted by the costume) and
    // drinks it face-on
    reflectedLight.indirectDiffuse += (jAlb * 0.7 + 0.3) * pow(1.0 - jFace, 2.0) * 0.75 * jFuzz * mix(0.5, 1.0, jAO);
    reflectedLight.directDiffuse *= 1.0 - 0.22 * jFuzz * jFace * jFace;
  }`;

// Jelly part material (arms, legs, feet, lids). `ao` is a GLSL expression of the part's local
// position `vPl` giving its ambient occlusion (roots tucked into the body go darker).
// ext (optional): { vcommon, vbegin, fcommon, mat } extra GLSL. `mat` is a GLSL expression for
// the costume material class (see MAT_GLSL), applied in place of the part's own roughness/coat.
function partMaterial(key, ao = '1.0', opts = {}, albedo = '', ext = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3, ...opts,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPl; ${ext.vcommon ?? ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${ext.vnormal ?? ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPl = position; ${ext.vbegin ?? ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPl; ${MAT_GLSL} ${ext.fcommon ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${albedo}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        float jGloss = 1.0, jFuzz = 0.0, jSSS = ${ext.sss ?? '0.5'};
        ${ext.mat ? `{
          float mc = ${ext.mat};
          vec4 mp = gumbleMatP(mc);
          material.roughness = mix(mp.x, 0.82, ${ext.matte ?? '0.0'});
          #ifdef USE_CLEARCOAT
            material.clearcoat = mp.y * (1.0 - ${ext.matte ?? '0.0'}); material.clearcoatRoughness = max(mp.z, 0.0525);
          #endif
          jGloss = mp.w; jFuzz = gumbleFuzz(mc); jSSS = gumbleSSS(mc);
          #ifdef USE_SHEEN
            material.sheenColor = mix(material.sheenColor, mix(vec3(1.0), diffuseColor.rgb, 0.35), jFuzz);
            material.sheenRoughness = mix(material.sheenRoughness, 0.3, jFuzz);
          #endif
        }` : ''}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        vec3 jAlb = diffuseColor.rgb; float jAO = ${ao};
        ${JELLY_LIGHT}`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// ---------------------------------------------------------------- body material
function bodyMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 0.32, clearcoatRoughness: 0.34,
    sheen: 0.45, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff4fb),
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${DEFORM_COMMON}
        attribute vec3 aColA; attribute vec3 aColB; attribute vec4 aPat; attribute vec4 aFace;
        varying vec3 vColA; varying vec3 vColB; varying vec4 vPat; varying vec3 vLocal; varying vec4 vFace; varying float vMat;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${DEFORM_NORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${DEFORM_POS}
        vColA = aColA; vColB = aColB; vPat = aPat; vLocal = position; vFace = aFace; vMat = aShape.w;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vColA; varying vec3 vColB; varying vec4 vPat; varying vec3 vLocal; varying vec4 vFace; varying float vMat;
        ${MAT_GLSL}
        float starSdf(vec2 p, float r, float rf) {
          const vec2 k1 = vec2(0.809016994, -0.587785252);
          const vec2 k2 = vec2(-k1.x, k1.y);
          p.x = abs(p.x);
          p -= 2.0 * max(dot(k1, p), 0.0) * k1;
          p -= 2.0 * max(dot(k2, p), 0.0) * k2;
          p.x = abs(p.x);
          p.y -= r;
          vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
          float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
          return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
        }
        float gumbleHash1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
        // distance-to-feature helpers on the body surface (angle, height) -> arc-length units
        float faceZone(vec3 p) {
          float th = atan(p.x, p.z);
          vec2 d = vec2(th / (vFace.x + 0.42), (p.y - vFace.y + 0.08) / 0.3);
          return (1.0 - smoothstep(0.8, 1.0, length(d))) * step(0.0, p.z);
        }
        float gPatM = 0.0; // pattern mask of this fragment (0 = colour A, 1 = colour B)
        float gPatH = 0.0; // the same, softened: the height of the raised pattern
        float gBelly = 0.0; // tummy patch mask
        float gRing = 0.0;  // contact shading round the foot of raised pattern shapes
        vec3 gumblePattern() {
          float pat = vPat.x; vec3 p = vLocal; float m = 0.0;
          float th = atan(p.x, p.z), rl = length(p.xz);
          float back = abs(th) / 3.14159265; // 0 = front centre, 1 = spine
          // belly: a soft paler tummy oval on the front, under the mouth (a form landmark that
          // tells front from back at a glance)
          vec2 bq = vec2(th * max(rl, 0.05) / 0.3, (p.y - 0.19) / 0.155);
          gBelly = (1.0 - smoothstep(0.82, 1.0, length(bq))) * step(0.0, p.z);
          if (pat < 0.5) {            // tiger stripes: from the spine round the flanks, tapering
            // to points before the face and tummy, sweeping down toward the front like chevrons
            float freq = 21.0 + 9.0 * vPat.z;
            float v = p.y + 0.15 * (1.0 - back) * (1.0 - back) + 0.02 * sin(th * 5.0 + vPat.z * 9.0);
            float sw = sin(v * freq - 1.2 - vPat.z * 4.0);
            float taper = smoothstep(0.2, 0.66, back);
            float thr = mix(1.08, -0.12, taper) + 0.5 * (1.0 - smoothstep(0.07, 0.2, p.y)) + 0.6 * smoothstep(0.84, 0.95, p.y);
            float sv = sw - thr;
            m = smoothstep(-0.08, 0.08, sv);
            gPatH = smoothstep(-0.45, 0.45, sv);
          } else if (pat < 1.5) {     // spots: clustered, in many sizes, like a ladybird / leopard
            // scatter: a dozen anchor spots (a few big ones, more medium), each with two or three
            // little satellites hugging it, so the pattern groups instead of reading as an even
            // polka-dot decal. Centres live on a sphere round the body's middle, so spots wrap the
            // form and foreshorten toward its edges like painted-on raised drops would.
            vec3 d = normalize(p - vec3(0.0, 0.42, 0.0));
            float best = 0.0, soft = 0.0, ring = 0.0;
            for (int k = 0; k < 12; k++) {
              float fk = float(k);
              float z = 1.0 - (fk + 0.5) * (2.0 / 12.0);
              float rr = sqrt(max(0.0, 1.0 - z * z));
              float ph = fk * 2.39996 + vPat.z * 6.2831;
              vec3 c = normalize(vec3(rr * cos(ph), z * 0.92, rr * sin(ph)) + (vec3(gumbleHash1(fk * 1.7 + vPat.z * 9.0), gumbleHash1(fk * 2.3 + 4.0), gumbleHash1(fk * 3.1 + vPat.z * 3.0)) - 0.5) * 0.35);
              vec3 cp = vec3(0.0, 0.42, 0.0) + c * 0.5;
              if (faceZone(cp) > 0.4) continue;
              if (cp.z > 0.0 && abs(atan(cp.x, cp.z)) < 0.8 && cp.y < 0.38) continue;
              float rnd = gumbleHash1(fk + vPat.z * 17.0);
              float big = step(0.62, rnd);
              float size = mix(0.15, 0.24, rnd) + big * 0.12;
              size *= mix(0.6, 1.0, 1.0 - abs(c.y) * 0.7);
              // the anchor, slightly egg-shaped along a per-spot direction
              vec3 tn = normalize(cross(c, vec3(0.3, 1.0, 0.2)));
              float el = 1.0 + 0.22 * (gumbleHash1(fk * 5.3 + vPat.z) - 0.5) * 2.0;
              vec3 dd = d - c;
              float a = 0.5 * (dot(dd, dd) + (el * el - 1.0) * pow(dot(dd, tn), 2.0));
              float r2 = size * size * 0.5;
              float u = a / r2;
              best = max(best, 1.0 - smoothstep(0.86, 1.0, u));
              soft = max(soft, smoothstep(0.0, 0.55, 1.0 - u) * (0.6 + size * 1.6));
              ring = max(ring, exp(-pow((u - 1.15) / 0.22, 2.0)));
              // satellites: little drops tucked against the anchor's rim
              for (int j = 0; j < 3; j++) {
                float fj = float(j);
                float sr = gumbleHash1(fk * 7.1 + fj * 3.3 + vPat.z * 5.0);
                if (sr < 0.25) continue;
                float ang = fj * 2.2 + sr * 2.0 + fk;
                vec3 bt = cross(c, tn);
                float ss = size * mix(0.24, 0.42, sr);
                vec3 sc = normalize(c + (tn * cos(ang) + bt * sin(ang)) * (size + ss * 1.25) * 0.98);
                vec3 sp = vec3(0.0, 0.42, 0.0) + sc * 0.5;
                if (faceZone(sp) > 0.4) continue;
                float a2 = 1.0 - dot(d, sc);
                float r22 = ss * ss * 0.5;
                float u2 = a2 / r22;
                best = max(best, 1.0 - smoothstep(0.8, 1.0, u2));
                soft = max(soft, smoothstep(0.0, 0.55, 1.0 - u2) * (0.6 + ss * 1.6));
                ring = max(ring, exp(-pow((u2 - 1.18) / 0.26, 2.0)) * 0.8);
              }
            }
            m = best; gPatH = soft; gRing = ring * (1.0 - best);
          } else if (pat < 2.5) {     // split: a two-tone swirl that wraps the form
            // The boundary spirals round the body (beside the face at eye height, sweeping
            // diagonally across the belly below it and up the back), so the face sits on one
            // clean colour and the split reads as a wrapped candy twist, not a decal seam. The
            // edge is a soft gradient with a faint crease, like poured two-colour jelly.
            float sg = vPat.z > 0.5 ? 1.0 : -1.0;
            float thb = 0.85 + 3.0 * (p.y - 0.55) + 0.05 * sin(p.y * 11.0 + vPat.z * 5.0);
            float sv = sin(th * sg - thb) * max(rl, 0.06);
            m = smoothstep(-0.035, 0.035, sv); gPatH = smoothstep(-0.07, 0.07, sv);
            gRing = exp(-pow(sv / 0.012, 2.0)) * 0.6;
            gBelly = 0.0;
          } else if (pat < 3.5) {     // dip-dyed: a clean two-tone break with a sprinkle fringe
            // The lower body is dipped in colour B: a crisp, gently wavy edge (no blend band
            // through muddy in-between hues), and above it a fringe of B dots on a 3D lattice
            // that shrink as they rise, so the change of colour is designed, not smeared. The
            // face stays on one clean colour.
            float edge = 0.33 + 0.05 * smoothstep(0.3, 0.9, back) + 0.018 * sin(th * 4.0 + vPat.z * 6.0) + 0.01 * sin(th * 9.0 + 1.3);
            float sv = edge - p.y;
            float dip = smoothstep(-0.006, 0.006, sv);
            vec3 lp = p * 17.0 + vec3(vPat.z * 3.0, 0.0, 0.0);
            vec3 lf = fract(lp) - 0.5;
            float ld = length(lf) / 17.0;
            float dr = 0.027 * smoothstep(-0.2, -0.015, sv) * (1.0 - faceZone(p));
            float dots = (1.0 - smoothstep(dr * 0.8, dr, ld)) * step(sv, 0.0);
            m = max(dip, dots);
            gPatH = max(smoothstep(-0.03, 0.02, sv) * 0.7, (1.0 - smoothstep(0.0, max(dr, 1e-4), ld)) * step(sv, 0.0) * 0.6);
            gRing = exp(-pow(sv / 0.02 + 1.0, 2.0)) * (1.0 - m);
            gBelly = 0.0;
            // back design: three candy buttons down the spine, in the opposite tone
            float bt = 0.0, bh = 0.0;
            for (int k = 0; k < 3; k++) {
              float fk = float(k);
              vec2 bq = vec2((3.14159265 - abs(th)) * max(rl, 0.05), p.y - (0.24 + fk * 0.17));
              float br = 0.068 - fk * 0.012;
              float dd = length(bq) / br;
              bt = max(bt, 1.0 - smoothstep(0.86, 1.0, dd));
              bh = max(bh, 1.0 - smoothstep(0.3, 1.05, dd));
            }
            m = mix(m, 1.0 - m, bt);
            gPatH = max(gPatH, bh);
          } else if (pat < 4.5) {     // star on the back + small star on the belly + tinted base
            float d = starSdf(vec2(-p.x, p.y - 0.5) / 0.2, 1.0, 0.45);
            m = (1.0 - smoothstep(-0.04, 0.04, d)) * step(p.z, 0.0);
            float d2 = starSdf(vec2(p.x - 0.0, p.y - 0.24) / 0.085, 1.0, 0.45);
            m = max(m, (1.0 - smoothstep(-0.06, 0.06, d2)) * step(0.0, p.z));
            // a scatter of little stars over the flanks, so the sides are never blank
            for (int k = 0; k < 6; k++) {
              float fk = float(k);
              float sa = (1.25 + floor(fk * 0.5) * 0.62 + vPat.z * 0.3) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0);
              float sy = 0.26 + 0.4 * gumbleHash1(fk * 3.7 + vPat.z * 5.0);
              float da = mod(th - sa + 3.14159265, 6.2831853) - 3.14159265;
              vec2 sq = vec2(-da * max(0.05, rl), p.y - sy);
              float ds = starSdf(sq / (0.055 + 0.025 * gumbleHash1(fk + 11.0)), 1.0, 0.45);
              float near = step(abs(da), 0.7);
              m = max(m, (1.0 - smoothstep(-0.07, 0.07, ds)) * near);
              gPatH = max(gPatH, (1.0 - smoothstep(-0.3, 0.2, ds)) * near);
            }
            gPatH = max((1.0 - smoothstep(-0.25, 0.12, d)) * step(p.z, 0.0), (1.0 - smoothstep(-0.3, 0.2, d2)) * step(0.0, p.z));
            gBelly = 0.0;
          } else {                    // frosted cap with icing drips down the flanks and back
            float u = th * ${(7 / (2 * Math.PI)).toFixed(6)} + vPat.z * 7.0;
            float cell = floor(u), f = fract(u) - 0.5;
            float len = (0.05 + 0.15 * gumbleHash1(cell + vPat.z * 13.0)) * smoothstep(0.42, 1.0, abs(th));
            float drip = len * sqrt(max(0.0, 1.0 - f * f / 0.09));
            float sv = p.y - 0.6 - 0.02 * sin(th * 7.0) + drip;
            m = smoothstep(-0.012, 0.012, sv); gPatH = smoothstep(-0.05, 0.05, sv);
          }
          gBelly *= 1.0 - m;
          gPatM = m;
          vec3 gc = mix(vColA, vColB, m);
          gc = mix(gc, mix(gc, vec3(1.0, 0.95, 0.88), 0.46), gBelly);
          float gl = dot(gc, vec3(0.3, 0.55, 0.15));
          gc = max(vec3(0.0), mix(vec3(gl), gc, 1.0 + 0.35 * gBelly)); // a pastel tummy, never grey
          gc *= 1.0 - 0.16 * gRing;
          return max(vec3(0.0), mix(vec3(gl), gc, 1.0 + 0.8 * m * (1.0 - m)));
        }
        float gumbleHash(vec3 c) { return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec3 gcol = gumblePattern();
        float faceAO = 1.0;
        {
          float th = atan(vLocal.x, vLocal.z);
          float rl = length(vLocal.xz);
          // eye sockets: a soft dark ring hugging each eye so it sits IN the jelly, not on it
          vec2 de = vec2((abs(th) - vFace.x) * rl / vFace.z, (vLocal.y - vFace.y) / vFace.w);
          float le = length(de);
          faceAO *= 1.0 - 0.3 * exp(-pow((le - 1.04) / 0.2, 2.0)) * step(0.0, vLocal.z);
          // shoulders: occlusion where the arms root into the body
          vec2 ds = vec2((abs(th) - ${SHOULDER_TH.toFixed(4)}) * rl / 0.14, (vLocal.y - ${SHOULDER_Y.toFixed(4)}) / 0.14);
          faceAO *= 1.0 - 0.32 * exp(-dot(ds, ds) * 1.2);
          // rosy cheeks: below and outside the eyes, a clear pink (never muddy on greens/blues)
          vec2 cq = vec2((abs(th) - vFace.x * 1.62) * rl / 0.075, (vLocal.y - vFace.y + vFace.w * 1.15) / 0.048);
          float frk = step(1.5, vPat.w);
          float blush = (1.0 - smoothstep(0.55, 1.0, length(cq))) * smoothstep(0.1, 0.25, vLocal.z) * (vPat.w - 2.0 * frk);
          gcol = mix(gcol, vec3(1.0, 0.42, 0.56), blush * 0.62);
          // freckles: a little triangle of three dots on each cheek, a darker tone of the skin
          if (frk > 0.5) {
            vec2 fq = vec2((abs(th) - vFace.x * 1.55) * rl, vLocal.y - vFace.y + vFace.w * 1.2);
            float fd = min(min(length(fq - vec2(-0.022, 0.008)), length(fq - vec2(0.02, 0.01))), length(fq - vec2(0.0, -0.016)));
            float fr = (1.0 - smoothstep(0.0075, 0.0105, fd)) * step(0.0, vLocal.z);
            gcol = mix(gcol, gcol * vec3(0.55, 0.38, 0.36), fr * 0.85);
          }
        }
        {
          // sugar-coated costume: a pale frosted crust of fine sugar grains over the colour
          // (grains fade to an even frost where they would be smaller than a pixel)
          float sug = step(4.5, vMat) * (1.0 - vPat.y);
          if (sug > 0.5) {
            float px = length(fwidth(vLocal));
            vec3 sc = floor(vLocal * 140.0);
            float gh = gumbleHash(sc);
            float grain = step(0.74, gh) * (1.0 - smoothstep(0.005, 0.011, px));
            vec3 frost = gcol * 0.86 + vec3(0.1, 0.09, 0.1);
            gcol = mix(gcol, frost, 0.45 * (1.0 - gPatM * 0.6));
            gcol = mix(gcol, vec3(1.0, 0.98, 0.95), grain * 0.55 * (1.0 - gPatM * 0.5));
          }
        }
        vec4 diffuseColor = vec4( diffuse * gcol, opacity );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float gPx = length(fwidth(vLocal));
        float gBumpFade = 1.0 - smoothstep(0.008, 0.02, gPx);
        {
          // Surface relief, as a bump on the jelly: the pattern's colour-B shapes are raised
          // like piped icing (stripes, spots, stars, the cap's frosting edge), and a soft
          // moulding seam runs down the back. Faded out where it would only shimmer.
          float th = atan(vLocal.x, vLocal.z);
          float rl = length(vLocal.xz);
          float relief = vPat.x > 0.5 && vPat.x < 1.5 ? 0.02 : 0.013;
          float dSeam = (3.14159265 - abs(th)) * rl;
          float seam = exp(-pow(dSeam / 0.014, 2.0)) * smoothstep(0.08, 0.2, vLocal.y) * (1.0 - smoothstep(0.7, 0.86, vLocal.y));
          float H = gPatH * relief + seam * 0.006;
          // waxy rind: a fine field of shallow pores, like citrus peel
          float rind = step(2.5, vMat) * step(vMat, 3.5);
          vec3 pq = vLocal * 150.0;
          float pore = sin(pq.x + 1.7 * sin(pq.y * 0.37)) * sin(pq.y * 1.07 + 1.3 * sin(pq.z * 0.41)) * sin(pq.z * 0.97 + 1.1 * sin(pq.x * 0.33));
          H -= rind * smoothstep(0.3, 0.9, pore) * 0.0016 * (1.0 - gPatM);
          vec3 sp = -vViewPosition;
          vec3 sx = dFdx(sp), sy = dFdy(sp);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
          normal = normalize(mix(normal, normalize(abs(det) * normal - grad), gBumpFade));
        }`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
        #ifdef USE_CLEARCOAT
          clearcoatNormal = normal;
        #endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        // costume material class (satin / candy / matte vinyl / waxy rind / velvet fuzz)
        vec4 gMP = gumbleMatP(vMat);
        float jGloss = gMP.w, jFuzz = gumbleFuzz(vMat), jSSS = gumbleSSS(vMat);
        material.roughness = gMP.x;
        #ifdef USE_CLEARCOAT
          material.clearcoat = gMP.y; material.clearcoatRoughness = max(gMP.z, 0.0525);
        #endif
        #ifdef USE_SHEEN
          material.sheenColor = mix(material.sheenColor * (1.0 - step(0.5, vMat) * step(vMat, 1.5)) * (1.0 - 0.6 * step(4.5, vMat)), mix(vec3(1.0), diffuseColor.rgb, 0.35), jFuzz);
          material.sheenRoughness = mix(material.sheenRoughness, 0.3, jFuzz);
        #endif
        // the raised pattern is a glossier candy shell piped over the costume (on velvet, it is
        // a smooth satin appliqué instead)
        float gShell = gPatM * (vPat.x < 2.5 || vPat.x > 3.5 ? 1.0 : 0.6);
        material.roughness = mix(material.roughness, mix(0.3, 0.45, jFuzz), gShell * 0.8);
        #ifdef USE_CLEARCOAT
          material.clearcoat = mix(material.clearcoat, 0.75, gShell * (1.0 - jFuzz * 0.6));
          material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.2, gShell);
        #endif
        jGloss = mix(jGloss, 1.2, gShell * 0.7);
        jFuzz *= 1.0 - gShell;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // Faint inner glow of the jelly (keeps colour alive in shadow); eliminated -> grey.
          totalEmissiveRadiance += gcol * gcol * 0.05;
          totalEmissiveRadiance *= (1.0 - vPat.y * 0.8);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))) * 0.7, vPat.y);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        vec3 jAlb = diffuseColor.rgb;
        // AO: the underside over the legs tucks dark, lighter as it rises; plus face/shoulder AO.
        float jAO = mix(0.45, 1.0, smoothstep(0.0, 0.22, vLocal.y)) * faceAO;
        ${JELLY_LIGHT}
        {
          // Sugar frosting: sparse crystal glints over the top half, faded out where a crystal
          // is smaller than a pixel so far-away Gumbles stay clean.
          vec3 cell = floor(vLocal * 64.0);
          float h = gumbleHash(cell);
          vec3 rn = vec3(gumbleHash(cell + 3.1), gumbleHash(cell + 7.7), gumbleHash(cell + 1.3)) - 0.5;
          vec3 gn = normalize(normal + rn * 1.6);
          #if NUM_DIR_LIGHTS > 0
            vec3 sL = directionalLights[0].direction; vec3 sC = directionalLights[0].color;
          #else
            vec3 sL = vec3(0.0, 1.0, 0.0); vec3 sC = vec3(1.0);
          #endif
          float g = pow(clamp(dot(reflect(-normalize(vViewPosition), gn), sL), 0.0, 1.0), 60.0)
            * smoothstep(0.1, 0.5, dot(normal, sL));
          float px = length(fwidth(vLocal));
          float aa = 1.0 - smoothstep(0.006, 0.014, px);
          float top = smoothstep(0.3, 0.7, vLocal.y);
          float sugar = step(4.5, vMat);
          reflectedLight.directSpecular += sC * g * step(mix(0.9, 0.72, sugar), h) * aa * mix(top, 1.0, sugar) * mix(0.22, 0.6, sugar) * (1.0 - vPat.y);
        }`);
  };
  m.customProgramCacheKey = () => 'gumble-body-v7';
  return m;
}

// Shadow-pass material that applies the same per-species build (and topper variant collapse).
function deformDepthMaterial(topper = false) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${DEFORM_COMMON}
        ${topper ? 'attribute float aVar; attribute vec3 aTop; attribute vec4 aAnchor;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${topper ? TOPPER_POS : DEFORM_POS}
        ${topper ? 'transformed *= min(1.0, step(abs(aVar - aTop.x), 0.5) + step(abs(aVar - 10.0 - aTop.z), 0.5));' : ''}`);
  };
  m.customProgramCacheKey = () => 'gumble-depth-' + (topper ? 't2' : 'b');
  return m;
}

// Shadow-pass material for the sprout: only the instance's own variant casts.
function sproutDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aVar; attribute float aSpr;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed *= step(abs(aVar - aSpr), 0.5);`);
  };
  m.customProgramCacheKey = () => 'gumble-depth-s';
  return m;
}

function sproutMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aVar; attribute float aSpr;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed *= step(abs(aVar - aSpr), 0.5);`);
  };
  m.customProgramCacheKey = () => 'gumble-sprout';
  return m;
}

function topperMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3,
    sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x000000),
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${DEFORM_COMMON}
        attribute float aVar; attribute vec4 aAnchor; attribute vec3 aTop; attribute vec3 aColA; attribute vec3 aColB;
        attribute vec3 aTailB; attribute vec3 aTailC;
        varying vec3 vTc; varying float vFluff; varying float vMat;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${TOPPER_POS}
        float aMix = aAnchor.w;
        transformed *= min(1.0, step(abs(aVar - aTop.x), 0.5) + step(abs(aVar - 10.0 - aTop.z), 0.5));
        // tails: the base takes the body colour where it roots, the accent is whichever of the
        // Gumble's tones stands out most against its back (so a tail never vanishes into it)
        vTc = aVar > 9.5 ? (aMix > 0.5 ? aTailC : aTailB) : mix(aColA, aColB, aMix);
        vTc *= mix(1.0, 0.35, aTop.y);
        vFluff = step(abs(aVar - 10.0), 0.5); vMat = aShape.w;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTc; varying float vFluff; varying float vMat;
        ${MAT_GLSL}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vTc, opacity );')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        // ears, horns and tails share the costume's material class
        vec4 gMP = gumbleMatP(vMat);
        float jGloss = gMP.w, jFuzz = gumbleFuzz(vMat), jSSS = gumbleSSS(vMat);
        material.roughness = gMP.x;
        #ifdef USE_CLEARCOAT
          material.clearcoat = gMP.y; material.clearcoatRoughness = max(gMP.z, 0.0525);
        #endif
        // the cotton pom is soft fluff, not candy: matte, no coat, a velvety sheen
        material.roughness = mix(material.roughness, 0.9, vFluff);
        jFuzz = max(jFuzz, vFluff * 0.7); jGloss *= 1.0 - vFluff;
        #ifdef USE_CLEARCOAT
          material.clearcoat *= 1.0 - vFluff;
        #endif
        #ifdef USE_SHEEN
          material.sheenColor = mix(material.sheenColor, mix(vec3(1.0), diffuseColor.rgb, 0.35), max(vFluff * 0.6, jFuzz));
        #endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        vec3 jAlb = diffuseColor.rgb; float jAO = 1.0;
        ${JELLY_LIGHT}`);
  };
  m.customProgramCacheKey = () => 'gumble-topper-v4';
  return m;
}

// CPU mirror of the body pattern at a body-local point (for lid colours): 0 = colour A, 1 = B.
function sstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function patternMix(pat, x, y, z, rz = 0) {
  switch (pat) {
    case 0: {
      const th = Math.atan2(x, z), back = Math.abs(th) / Math.PI;
      const v = y + 0.15 * (1 - back) * (1 - back) + 0.02 * Math.sin(th * 5 + rz * 9);
      const sw = Math.sin(v * (21 + 9 * rz) - 1.2 - rz * 4);
      const tp = sstep(0.2, 0.66, back);
      const thr = 1.08 + (-0.12 - 1.08) * tp + 0.5 * (1 - sstep(0.07, 0.2, y)) + 0.6 * sstep(0.84, 0.95, y);
      return sw - thr > 0 ? 1 : 0;
    }
    case 2: {
      const sg = rz > 0.5 ? 1 : -1, th = Math.atan2(x, z);
      const thb = 0.85 + 3 * (y - 0.55) + 0.05 * Math.sin(y * 11 + rz * 5);
      return Math.sin(th * sg - thb) > 0 ? 1 : 0;
    }
    case 3: { const back = Math.abs(Math.atan2(x, z)) / Math.PI; return y < 0.33 + 0.05 * sstep(0.3, 0.9, back) ? 1 : 0; }
    case 5: {
      const th = Math.atan2(x, z), u = th * 7 / (2 * Math.PI) + rz * 7, cell = Math.floor(u), f = u - cell - 0.5;
      const hh = Math.sin((cell + rz * 13) * 91.3458) * 47453.5453;
      const len = (0.05 + 0.15 * (hh - Math.floor(hh))) * sstep(0.42, 1, Math.abs(th));
      return y - 0.6 - 0.02 * Math.sin(th * 7) + len * Math.sqrt(Math.max(0, 1 - f * f / 0.09)) > 0 ? 1 : 0;
    }
    default: return 0;
  }
}

// Near-white costume colours keep a little headroom below white (in linear light), so a cream
// Gumble still shows its form, gloss and rim in full sun instead of clipping to a flat cut-out.
function paleRoom(c) {
  const l = 0.3 * c.r + 0.55 * c.g + 0.15 * c.b;
  if (l > 0.62) { const k = (0.62 + (l - 0.62) * 0.45) / l; c.multiplyScalar(k); }
  return c;
}

// Very bright, very saturated costume colours (lime, mint, lemon, bubblegum) are eased a little
// toward their own grey and down in value, so under full sun they keep a shadow side and a
// highlight that is not clipped: a form, not a flat glowing sticker. Hue is untouched.
function tame(c) {
  const l = 0.3 * c.r + 0.55 * c.g + 0.15 * c.b;
  const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const k = sstep(0.25, 0.5, l) * sstep(0.35, 0.7, chroma);
  if (k > 0) { c.lerp(tmpGrey.setRGB(l, l, l), 0.16 * k).multiplyScalar(1 - 0.1 * k); }
  return c;
}
const tmpGrey = new THREE.Color();

// ---------------------------------------------------------------- the crowd
export function createGumbles(scene, bots) {
  const N = bots.length;
  const group = new THREE.Group();
  group.name = 'gumbles';
  scene.add(group);

  // ------------------------------------------------------------ per-bot identity (visual only)
  const colA = new Float32Array(N * 3), colB = new Float32Array(N * 3), pat = new Float32Array(N * 4);
  const shape = new Float32Array(N * 4), faceAttr = new Float32Array(N * 4), top = new Float32Array(N * 3);
  const sprV = new Float32Array(N), armS = new Float32Array(N), footS = new Float32Array(N), hipS = new Float32Array(N);
  const faceSet = new Uint8Array(N), topper = new Uint8Array(N), speciesOf = new Uint8Array(N);
  const matC = new Float32Array(N); // costume material class (see MAT_GLSL)
  // per-bot rig (body space, after the build): right eye pos/yaw/pitch, mouth, shoulder, crown
  const eyeP = new Float32Array(N * 5), mouthP = new Float32Array(N * 4), shP = new Float32Array(N * 3);
  const crownY = new Float32Array(N), bodyW = new Float32Array(N), eyeSc = new Float32Array(N * 2);
  const lidC = new Float32Array(N * 6);
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
  const S = {};
  for (let i = 0; i < N; i++) {
    const b = bots[i];
    tmpC.set(b.colors?.[0] ?? '#ff6fa8'); tame(paleRoom(tmpC)); colA.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    tmpC.set(b.colors?.[1] ?? b.colors?.[0] ?? '#ffd23f'); tame(paleRoom(tmpC)); colB.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    const pi = patternIndex(b.pattern ?? 'stripes');
    // Identity (build, face, topper, material, pattern phase) is keyed on the permanent roster
    // number, not the start slot, so a Gumble looks the same in every round of a show.
    const u = b.num ?? i;
    const h = (hashStr(b.name ?? String(u)) ^ Math.imul(u + 1, 2654435761)) >>> 0;
    // spread the builds and face sets evenly over the field, toppers by hash
    const spc = (u + (h % 5)) % SPECIES.length;
    const fs = (Math.floor(u / 5) + (h >>> 3) % 5 + u * 2) % FACESETS.length;
    // toppers: nearly everyone gets ears, horns or a crest (a bare dome only now and then), so
    // heads have distinct outlines in a crowd
    const tp = ((h >>> 20) % 9 === 0) ? 0 : 1 + (h >>> 7) % (TOPPERS - 1);
    // material class: spread evenly over the field (with a per-name shuffle), so neighbours differ
    matC[i] = (u * 5 + (h >>> 25)) % 6;
    speciesOf[i] = spc; faceSet[i] = fs; topper[i] = tp;
    const sp = SPECIES[spc], F0 = FACESETS[fs];
    shape.set([sp.sw, sp.sh, sp.taper, matC[i]], i * 4);
    // w: cheek marks = blush strength (fraction) + 2 if freckled
    pat.set([pi, 0, hash01(u, 9.1), F0.blush * (0.75 + 0.25 * hash01(u, 4.4)) * 0.99 + (F0.freck ? 2 : 0)], i * 4);
    // rig
    const fy = F0.y + (sp.face ?? 0); // eye height, raised on the flat builds
    surface(sp, F0.ang, fy, S);
    eyeP.set([S.px, S.py, S.pz, S.yaw, S.pitch], i * 5);
    eyeSc[i * 2] = F0.ex; eyeSc[i * 2 + 1] = F0.ey;
    faceAttr.set([F0.ang, fy, EYE_R[0] * F0.ex * 1.0 / sp.sw, EYE_R[1] * F0.ey / sp.sh], i * 4);
    const my = fy - EYE_R[1] * F0.ey / sp.sh - 0.025;
    surface(sp, 0, my, S);
    mouthP.set([S.py, S.pz, S.pitch, F0.mw], i * 4);
    surface(sp, SHOULDER_TH, SHOULDER_Y, S);
    shP.set([S.px - S.nx * 0.06, S.py - S.ny * 0.06, S.pz - S.nz * 0.06], i * 3);
    crownY[i] = BODY_H * sp.sh - 0.02;
    bodyW[i] = sp.sw * (1 + sp.taper * 0.3);
    top[i * 3] = tp; top[i * 3 + 2] = (h >>> 13) % 4;
    sprV[i] = ((h >>> 17) + u) % 4;
    armS[i] = sp.arm; footS[i] = sp.foot; hipS[i] = sp.hip;
    // lid colours: the body pattern just above each eye
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      const x = Math.sin(side * F0.ang) * profR(fy + 0.07), z = Math.cos(F0.ang) * profR(fy + 0.07);
      const m = patternMix(pi, x, fy + 0.07, z, pat[i * 4 + 2]);
      tmpC.setRGB(colA[i * 3], colA[i * 3 + 1], colA[i * 3 + 2]);
      tmpC2.setRGB(colB[i * 3], colB[i * 3 + 1], colB[i * 3 + 2]);
      tmpC.lerp(tmpC2, m);
      lidC.set([tmpC.r, tmpC.g, tmpC.b], i * 6 + s * 3);
    }
  }

  // ------------------------------------------------------------ meshes
  const bodyGeo = bodyGeometry();
  const body = new THREE.InstancedMesh(bodyGeo, bodyMaterial(), N);
  bodyGeo.setAttribute('aColA', new THREE.InstancedBufferAttribute(colA, 3));
  bodyGeo.setAttribute('aColB', new THREE.InstancedBufferAttribute(colB, 3));
  bodyGeo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
  bodyGeo.setAttribute('aFace', new THREE.InstancedBufferAttribute(faceAttr, 4));
  const patAttr = new THREE.InstancedBufferAttribute(pat, 4);
  patAttr.setUsage(THREE.DynamicDrawUsage);
  bodyGeo.setAttribute('aPat', patAttr);
  body.customDepthMaterial = deformDepthMaterial(false);

  const eyeGeo = eyeGeometry();
  const eyes = new THREE.InstancedMesh(eyeGeo, eyeMaterial(), N * 2);
  {
    // eye style + side, and an iris colour: the Gumble's more saturated tone, so gem eyes glow
    // in a colour of their own and googly eyes get a ring
    const ea = new Float32Array(N * 4), ir = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const st = FACESETS[faceSet[i]].eye;
      ea.set([st, -1, st, 1], i * 4);
      tmpC.setRGB(colA[i * 3], colA[i * 3 + 1], colA[i * 3 + 2]);
      tmpC2.setRGB(colB[i * 3], colB[i * 3 + 1], colB[i * 3 + 2]);
      const sat = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
      const c = sat(tmpC2) > sat(tmpC) * 0.8 ? tmpC2 : tmpC;
      ir.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    }
    eyeGeo.setAttribute('aEye', new THREE.InstancedBufferAttribute(ea, 2));
    eyeGeo.setAttribute('aIris', new THREE.InstancedBufferAttribute(ir, 3));
  }
  // alternate resting mouths (cat "w", smirk), accents worn with the open smile (fang, buck
  // teeth) and brows, for the face sets that have them
  const altGeo = mouthAltGeometry(), accGeo = mouthAccentGeometry();
  {
    const mv = new Float32Array(N), ac = new Float32Array(N);
    for (let i = 0; i < N; i++) { const fs = FACESETS[faceSet[i]]; mv[i] = fs.rest === 5 ? 1 : 0; ac[i] = Math.max(0, fs.acc - 1); }
    altGeo.setAttribute('aMv', new THREE.InstancedBufferAttribute(mv, 1));
    accGeo.setAttribute('aAc', new THREE.InstancedBufferAttribute(ac, 1));
  }
  const mouthAlt = new THREE.InstancedMesh(altGeo, variantMaterial('gumble-mouth-alt', 'aMv', { roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25 }), N);
  const accent = new THREE.InstancedMesh(accGeo, variantMaterial('gumble-mouth-acc', 'aAc', { roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 }), N);
  const brows = new THREE.InstancedMesh(browGeometry(), partMaterial('gumble-brow', '1.0', { roughness: 0.6, clearcoat: 0.1 }), N * 2);
  const lids = new THREE.InstancedMesh(lidGeometry(), partMaterial('gumble-lid', 'mix(0.7, 1.0, smoothstep(-0.2, 0.6, vPl.y))'), N * 2);
  const mouth = new THREE.InstancedMesh(mouthSmileGeometry(),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }), N);
  const mouthO = new THREE.InstancedMesh(mouthOpenGeometry(),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }), N);
  const grit = new THREE.InstancedMesh(mouthGritGeometry(),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }), N);
  const tongue = new THREE.InstancedMesh(tongueGeometry(),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }), N);
  // closed "happy / squeezed" eyes: a soft ink arc, shown instead of the open eyes
  const eyeArcGeo = new THREE.TorusGeometry(0.062, 0.019, 8, 18, Math.PI);
  eyeArcGeo.scale(1, 1, 0.6);
  const eyeArcs = new THREE.InstancedMesh(eyeArcGeo, new THREE.MeshStandardMaterial({ color: 0x1a0f22, roughness: 0.3 }), N * 2);
  const sprGeo = sproutVariants();
  sprGeo.setAttribute('aSpr', new THREE.InstancedBufferAttribute(sprV, 1));
  const sprout = new THREE.InstancedMesh(sprGeo, sproutMaterial(), N);
  sprout.customDepthMaterial = sproutDepthMaterial();
  const topGeo = topperGeometry();
  const toppers = new THREE.InstancedMesh(topGeo, topperMaterial(), N);
  // toppers: colour A = the body colour at the crown, B = the other one (accent)
  const tA = new Float32Array(N * 3), tB = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const pi = pat[i * 4];
    const crownB = patternMix(pi, 0, 0.8, 0.0, pat[i * 4 + 2]) > 0.5 && pi !== 0;
    const a = crownB ? colB : colA, bb = crownB ? colA : colB;
    tA.set([a[i * 3], a[i * 3 + 1], a[i * 3 + 2]], i * 3);
    tB.set([bb[i * 3], bb[i * 3 + 1], bb[i * 3 + 2]], i * 3);
  }
  const tailB = new Float32Array(N * 3), tailC = new Float32Array(N * 3);
  {
    const back = new THREE.Color(), cand = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
    const lum = (c) => 0.3 * c.r + 0.55 * c.g + 0.15 * c.b;
    for (let i = 0; i < N; i++) {
      const pi = pat[i * 4];
      tmpC.setRGB(colA[i * 3], colA[i * 3 + 1], colA[i * 3 + 2]);
      tmpC2.setRGB(colB[i * 3], colB[i * 3 + 1], colB[i * 3 + 2]);
      const m = patternMix(pi, 0, 0.3, -0.5, pat[i * 4 + 2]);
      back.copy(tmpC).lerp(tmpC2, m);
      tailB.set([back.r, back.g, back.b], i * 3);
      cand[0].copy(tmpC2); cand[1].copy(tmpC);
      cand[2].copy(tmpC).lerp(new THREE.Color(1, 0.96, 0.9), 0.74);
      cand[3].copy(tmpC).multiplyScalar(0.55);
      let best = cand[0], bd = -1;
      for (let k = 0; k < cand.length; k++) {
        const c = cand[k];
        const d = Math.hypot(c.r - back.r, c.g - back.g, c.b - back.b) + 1.4 * Math.abs(lum(c) - lum(back)) + (k === 0 ? 0.12 : 0);
        if (d > bd) { bd = d; best = c; }
      }
      tailC.set([best.r, best.g, best.b], i * 3);
    }
  }
  topGeo.setAttribute('aTailB', new THREE.InstancedBufferAttribute(tailB, 3));
  topGeo.setAttribute('aTailC', new THREE.InstancedBufferAttribute(tailC, 3));
  topGeo.setAttribute('aColA', new THREE.InstancedBufferAttribute(tA, 3));
  topGeo.setAttribute('aColB', new THREE.InstancedBufferAttribute(tB, 3));
  topGeo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 4));
  const topAttr = new THREE.InstancedBufferAttribute(top, 3);
  topAttr.setUsage(THREE.DynamicDrawUsage);
  topGeo.setAttribute('aTop', topAttr);
  toppers.customDepthMaterial = deformDepthMaterial(true);

  // Material separation: the body is satin jelly; arms share its sheen at the root but the
  // mitten hands go a softer, more matte vinyl; legs are satin; the booties are matte rubber
  // with a darker sole band and a pale piped welt above it.
  // Arms: one mesh; aArm.x = 1 mirrors it front-to-back for the left arm (the mirrored triangles
  // wind the other way, so the material is double-sided and the mirrored normal is pre-flipped
  // to come out right after three's back-face flip). aArm.y = the costume's material class; the
  // mitten hands are a touch paler and more matte than the arm.
  const armGeo = armGeometry();
  const armAttr = new Float32Array(N * 4);
  const arms = new THREE.InstancedMesh(armGeo, partMaterial('gumble-arm-v4',
    'mix(0.5, 1.0, smoothstep(0.0, 0.14, vPl.x)) * mix(1.0, 0.8, vHandIn)',
    { roughness: 0.6, clearcoat: 0.22, clearcoatRoughness: 0.5, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffeef6) },
    'diffuseColor.rgb *= mix(1.0, 1.07, vHand);',
    {
      vcommon: 'attribute vec2 aArm; attribute float aHand; varying float vHand; varying float vMat; varying float vHandIn;',
      vnormal: 'if (aArm.x > 0.5) objectNormal = vec3(-objectNormal.x, -objectNormal.y, objectNormal.z);',
      vbegin: 'if (aArm.x > 0.5) transformed.z = -transformed.z; vHand = aHand; vMat = aArm.y; vHandIn = aHand * smoothstep(0.1, -0.7, abs(objectNormal.y) * sign(objectNormal.y) * (aArm.x > 0.5 ? -1.0 : 1.0));',
      fcommon: 'varying float vHand; varying float vMat; varying float vHandIn;',
      mat: 'vMat', matte: 'vHand * 0.4',
    }), N * 2);
  arms.material.side = THREE.DoubleSide;
  arms.customDepthMaterial = (() => {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec2 aArm;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          if (aArm.x > 0.5) transformed.z = -transformed.z;`);
    };
    m.side = THREE.DoubleSide;
    m.customProgramCacheKey = () => 'gumble-depth-arm2';
    return m;
  })();
  for (let i = 0; i < N; i++) {
    armAttr.set([1, matC[i]], i * 4);     // instance i*2: left arm (mirrored variant)
    armAttr.set([0, matC[i]], i * 4 + 2); // instance i*2+1: right arm
  }
  armGeo.setAttribute('aArm', new THREE.InstancedBufferAttribute(armAttr, 2));
  const legs = new THREE.InstancedMesh(legGeometry(), partMaterial('gumble-leg-v2',
    'mix(0.42, 1.0, smoothstep(-0.05, -0.7, vPl.y))',
    { roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 }), N * 2);
  const feet = new THREE.InstancedMesh(footGeometry(), partMaterial('gumble-foot-v2',
    'mix(0.6, 1.0, smoothstep(0.004, 0.05, vPl.y))',
    { roughness: 0.78, clearcoat: 0.0, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) },
    `{
      float sole = 1.0 - smoothstep(0.026, 0.032, vPl.y);
      float welt = smoothstep(0.031, 0.036, vPl.y) * (1.0 - smoothstep(0.042, 0.049, vPl.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.38, 0.55), sole);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.94), welt * 0.85);
    }`), N * 2);
  for (let i = 0; i < N; i++) {
    // arms take the body colour where they root (split / striped bodies differ per side)
    const pi = pat[i * 4];
    for (let k = 0; k < 2; k++) {
      const mm = patternMix(pi, k ? 0.5 : -0.5, 0.36, 0.0, pat[i * 4 + 2]);
      tmpC.setRGB(colA[i * 3], colA[i * 3 + 1], colA[i * 3 + 2]);
      tmpC2.setRGB(colB[i * 3], colB[i * 3 + 1], colB[i * 3 + 2]);
      arms.setColorAt(i * 2 + k, tmpC.lerp(tmpC2, mm));
    }
    tmpC.setRGB(colA[i * 3], colA[i * 3 + 1], colA[i * 3 + 2]);
    for (let s = 0; s < 2; s++) { tmpC2.setRGB(lidC[i * 6 + s * 3], lidC[i * 6 + s * 3 + 1], lidC[i * 6 + s * 3 + 2]); lids.setColorAt(i * 2 + s, tmpC2); }
    // legs a touch deeper, feet the accent colour deepened: reads as little booties. A very
    // pale body gets legs leaning to the accent, so they never read as bare white posts.
    {
      const la = 0.3 * tmpC.r + 0.55 * tmpC.g + 0.15 * tmpC.b;
      if (la > 0.72) { tmpC2.setRGB(colB[i * 3], colB[i * 3 + 1], colB[i * 3 + 2]); tmpC.lerp(tmpC2, 0.45); }
    }
    tmpC.multiplyScalar(0.8);
    legs.setColorAt(i * 2, tmpC); legs.setColorAt(i * 2 + 1, tmpC);
    tmpC.setRGB(colB[i * 3], colB[i * 3 + 1], colB[i * 3 + 2]).multiplyScalar(0.82);
    feet.setColorAt(i * 2, tmpC); feet.setColorAt(i * 2 + 1, tmpC);
  }
  // Contact shadow: one draw call for the crowd. It sits under the body's own centre (so it
  // follows a dive or a lean, never left behind at the root), stretches along the body when it
  // lies down, and is a tight dark contact core inside a small soft halo: dark and crisp when
  // the body is on the floor, smaller and lighter as it rises.
  const bodyK = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  bodyK.setUsage(THREE.DynamicDrawUsage);
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  blobGeo.setAttribute('aK', bodyK);
  const blob = new THREE.InstancedMesh(blobGeo, new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0x1c0f2e) } },
    vertexShader: `attribute float aVis; attribute float aK; varying vec2 vUv; varying float vA; varying float vK;
      void main() {
        vUv = uv; vK = aK; vA = aVis;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 uCol; varying vec2 vUv; varying float vA; varying float vK;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float c = clamp(vK, 0.0, 1.0);
        float halo = (1.0 - smoothstep(0.4, 1.0, d)) * mix(0.18, 0.3, c);
        float core = (1.0 - smoothstep(mix(0.15, 0.36, c), mix(0.5, 0.7, c), d)) * 0.8 * c;
        float a = (halo + core) * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uCol, a);
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }), N);
  blob.renderOrder = -1;
  // Foot contact shadows: a small, darker, crisp oval under each bootie that tightens as the
  // foot plants and fades as it lifts, so the feet read as standing ON the floor.
  const footK = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 1);
  footK.setUsage(THREE.DynamicDrawUsage);
  const fbGeo = new THREE.PlaneGeometry(1, 1);
  fbGeo.rotateX(-Math.PI / 2);
  fbGeo.setAttribute('aK', footK);
  const footBlob = new THREE.InstancedMesh(fbGeo, new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0x1a0c2a) } },
    vertexShader: `attribute float aVis; attribute float aK; varying vec2 vUv; varying float vA;
      void main() {
        vUv = uv; vA = aVis * aK;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 uCol; varying vec2 vUv; varying float vA;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.35, 0.95, d)) * 0.6 + (1.0 - smoothstep(0.0, 0.5, d)) * 0.32;
        a *= vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uCol, a);
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
  }), N * 2);
  footBlob.renderOrder = -1;
  const groundY = new Float32Array(N).fill(-1e9);
  // brows: a deep, slightly cool shade of the skin above the eye
  for (let i = 0; i < N; i++) {
    for (let s2 = 0; s2 < 2; s2++) {
      tmpC.setRGB(lidC[i * 6 + s2 * 3], lidC[i * 6 + s2 * 3 + 1], lidC[i * 6 + s2 * 3 + 2]);
      tmpC.multiplyScalar(0.32).lerp(tmpC2.setRGB(0.08, 0.04, 0.1), 0.45);
      brows.setColorAt(i * 2 + s2, tmpC);
    }
  }
  const all = [body, eyes, lids, eyeArcs, mouth, mouthO, grit, tongue, mouthAlt, accent, brows, sprout, toppers, arms, legs, feet];
  const TWO = new Set([eyes, lids, eyeArcs, brows, arms, legs, feet]);
  // visibility per instance: one instance per bot, or two (eyes, lids, arcs, arms, legs, feet)
  const vis = new Float32Array(N).fill(1); // smoothed, what is drawn
  const visN = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(1), 1);
  const vis2N = new THREE.InstancedBufferAttribute(new Float32Array(N * 2).fill(1), 1);
  visN.setUsage(THREE.DynamicDrawUsage); vis2N.setUsage(THREE.DynamicDrawUsage);
  // ghost twins for the smooth fade (see withFade); shown only while some bot is fading
  const ghosts = [];
  for (const m of all) {
    m.geometry.setAttribute('aVis', TWO.has(m) ? vis2N : visN);
    const base = m.material.onBeforeCompile, baseKey = m.material.customProgramCacheKey();
    const key = (m === body ? 'gumble-body-v7' : 'gumble-part-' + all.indexOf(m)) + '|' + baseKey.length;
    const gm = m.material.clone();
    gm.onBeforeCompile = base;
    withFade(gm, key, true);
    withFade(m.material, key);
    const g = new THREE.InstancedMesh(m.geometry, gm, m.count);
    g.instanceMatrix = m.instanceMatrix;
    if (m.instanceColor) g.instanceColor = m.instanceColor;
    g.frustumCulled = false; g.visible = false;
    g.renderOrder = m === body ? 1 : 2;
    ghosts.push(g);
  }
  blob.geometry.setAttribute('aVis', visN);
  footBlob.geometry.setAttribute('aVis', vis2N);
  for (const m of [...all, blob, footBlob]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  for (const g of ghosts) group.add(g);
  all.push(blob, footBlob);
  TWO.add(footBlob);
  for (const m of [body, feet, legs, arms, sprout, toppers]) { m.castShadow = true; }
  for (const m of [body, feet, legs, arms, toppers, lids]) { m.receiveShadow = true; }

  // Followed-bot marker (owned by the follow camera): a bobbing pip above the head.
  const marker = createFollowMarker();
  group.add(marker);

  // ------------------------------------------------------------ per-bot visual state (no allocations later)
  const blinkSeed = new Float32Array(N);
  for (let i = 0; i < N; i++) blinkSeed[i] = (i * 0.6180339) % 1;
  // Motion feel (poses, squash/stretch, tumbles, get-ups) and impact effects live in their own
  // modules: characters/motion.js and fx/puffs.js.
  const fx = createFx(group, N);
  const motion = createMotion(N, fx);
  const P = motion.P;

  const mRoot = new THREE.Matrix4(), mBody = new THREE.Matrix4(), mTmp = new THREE.Matrix4(), mPart = new THREE.Matrix4();
  const mEye = new THREE.Matrix4(), mFeat = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), s = new THREE.Vector3();
  const qPart = new THREE.Quaternion(), ePart = new THREE.Euler(), eFeat = new THREE.Euler(0, 0, 0, 'YXZ');
  const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const vArm = new THREE.Vector3(), vHip = new THREE.Vector3(), vAnk = new THREE.Vector3(), vDir = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  const hasBrow = new Uint8Array(N);
  for (let i = 0; i < N; i++) hasBrow[i] = FACESETS[faceSet[i]].brow;
  const lidHas = (l) => l > -1.25;
  let highlightId = -1;
  let ghostsOn = false;
  let clock = 0;

  // ------------------------------------------------------------ expressions
  // Face output per bot per frame. lid: hinge angle (-1.3 open ... 0 half ... 1.57 shut, < -1.25
  // hidden), lidTilt: + angry (inner corners down), - worried. mouth: 0 smile, 1 "o", 2 grit,
  // 3 frown. arc: 0 open eyes, 1 happy ^ ^, 2 squeezed > <.
  // mouth 4 = the face set's own alternate mouth (cat "w" or smirk); acc = show its accent
  // (fang / buck teeth) with the open smile; browY = brow raise (+ surprised, - scowl).
  const F = { eyeS: 1, eyeY: 1, roll: 0, lidL: -2, lidR: -2, tilt: 0, mouth: 0, mx: 1, my: 1, tongue: 0, arc: 0, arcY: 1, acc: 0, browY: 0 };
  function face(i, anim, at, vy, grounded) {
    const fs = FACESETS[faceSet[i]];
    F.eyeS = 1; F.eyeY = 1; F.roll = 0; F.lidL = F.lidR = fs.lid; F.tilt = fs.tilt;
    F.mouth = fs.rest === 0 ? 0 : 4; F.mx = fs.mw; F.my = 1; F.tongue = 0; F.arc = 0; F.arcY = 1;
    F.acc = fs.acc; F.browY = 0;
    const pulse = Math.abs(Math.sin(clock * 9 + i));
    switch (anim) {
      case A.idle:
        if (fs.run === 2) F.tongue = 1;
        F.mx *= 0.8; F.my = 0.75;
        if (P.mouthOpen > 0.5) { F.mouth = 1; F.mx = 0.9; F.my = 1.1; }
        break;
      case A.run:
        if (grounded && vy > 1.2) { // climbing: effort
          F.lidL = F.lidR = Math.max(fs.lid, -0.55); F.tilt = 0.42; F.mouth = 2; F.mx = 0.9;
          break;
        }
        switch (fs.run) {
          case 0: F.mx *= 1.2; F.my = 1.1; break;                                   // big grin
          case 1: F.lidL = F.lidR = Math.max(fs.lid, -0.5); F.tilt = 0.36; F.browY = -0.2; // determined
            if (fs.rest === 5) { F.mouth = 4; F.mx = 1; F.my = 1; } else { F.mouth = 0; F.mx *= 0.75; F.my = 0.55; }
            break;
          case 2: F.eyeS = 1.08; F.tongue = 1; F.mx *= 1.05; F.my = 1.05; break;    // goofy blep
          case 4: F.mouth = 4; F.mx = 1; F.my = 1; break;                           // sweet: keeps the cat mouth
          default: F.mouth = 1; F.mx = 0.62; F.my = 0.55 + 0.3 * pulse; break;       // panting
        }
        break;
      case A.celebrate: // happy squint, big cheer
        F.arc = 1; F.arcY = 1.1; F.mouth = 0; F.mx = 1.35; F.my = 1.35 + 0.15 * Math.sin(at * 13);
        if (fs.run === 2) F.tongue = 1;
        break;
      case A.fall: // panic: lids gone, wide eyes, round shout
        F.browY = 0.5; F.lidL = F.lidR = -2; F.tilt = -0.3; F.eyeS = 1.16; F.eyeY = 1.12; F.mouth = 1; F.mx = 0.8; F.my = 1.25 + 0.12 * Math.sin(at * 17); break;
      case A.tumble: // squeezed shut, "oof"
        F.arc = 2; F.arcY = 0.8; F.mouth = 1; F.mx = 0.85; F.my = 0.75; break;
      case A.stumble: // startled: wide eyes, little "o"
        F.browY = 0.4; F.lidL = F.lidR = -2; F.eyeS = 1.14; F.eyeY = 1.12; F.mouth = 1; F.mx = 0.6; F.my = 0.85; break;
      case A.dive: case A.grab: // effort: hard brows, clenched teeth
        F.lidL = F.lidR = Math.max(fs.lid, -0.45); F.tilt = 0.48; F.mouth = 2; F.mx = 1; break;
      case A.jump:
        if (vy > 0) { F.lidL = F.lidR = Math.max(fs.lid, -0.7); F.tilt = 0.3; F.mouth = 1; F.mx = 0.8; F.my = 0.75; }
        else { F.lidL = F.lidR = -2; F.eyeS = 1.08; F.eyeY = 1.08; F.mouth = 1; F.mx = 0.55; F.my = 0.7; }
        break;
      case A.getup: // dazed: one lid droops, wobbly little frown
        F.lidL = 0.1; F.lidR = -0.6; F.tilt = -0.2; F.mouth = 3; F.mx = 0.6; F.my = 0.6; break;
      case A.sad:
        F.lidL = F.lidR = -0.2; F.tilt = -0.45; F.eyeY = 0.9; F.mouth = 3; F.mx = 0.8; F.my = 0.75; break;
      default: break;
    }
    if (P.sad && anim !== A.sad) { F.mouth = 3; F.tilt = -0.4; }
    // quick blink (~0.12 s) every 4-6 s, staggered per Gumble: the lids come down
    const bt = (clock + blinkSeed[i] * 4.3) % (4.2 + blinkSeed[i] * 1.8);
    if (bt < 0.12 && F.arc === 0) { const k = Math.sin((bt / 0.12) * Math.PI); F.lidL = Math.max(F.lidL, -1.3 + 2.9 * k); F.lidR = Math.max(F.lidR, -1.3 + 2.9 * k); }
  }

  // Arm about its shoulder (side -1 left, +1 right); the geometry points +x, so the left arm is
  // turned half round instead of mirrored (keeps the winding).
  function armPart(i, idx, side, up, swing, fwd) {
    ePart.set(swing, -side * fwd, side * up, 'XYZ');
    qPart.setFromEuler(ePart);
    if (side < 0) qPart.multiply(qFlip);
    v.set(side * shP[i * 3], shP[i * 3 + 1], shP[i * 3 + 2]); s.setScalar(armS[i]);
    mPart.compose(v, qPart, s);
    mTmp.multiplyMatrices(mBody, mPart);
    arms.setMatrixAt(idx, mTmp);
  }

  function setPart(mesh, idx, parent, px, py, pz, rx, ry, rz, sx, sy, sz) {
    ePart.set(rx, ry, rz, 'XYZ');
    qPart.setFromEuler(ePart);
    v.set(px, py, pz); s.set(sx, sy, sz);
    mPart.compose(v, qPart, s);
    mTmp.multiplyMatrices(parent, mPart);
    mesh.setMatrixAt(idx, mTmp);
  }

  // Frame on the body surface: parent * T(p) * R(yaw, pitch, roll) -> out
  function surfFrame(out, px, py, pz, pitch, yaw, roll) {
    eFeat.set(pitch, yaw, roll, 'YXZ');
    out.makeRotationFromEuler(eFeat);
    out.setPosition(px, py, pz);
    out.multiplyMatrices(mBody, out);
  }
  // child = frame * S(sx, sy, sz) * Rz(rz) * Rx(rx) (lids hinge inside the eye's ellipsoid)
  function child(mesh, idx, frame, ox, oy, oz, sx, sy, sz, rz, rx) {
    ePart.set(rx, 0, rz, 'ZYX');
    qPart.setFromEuler(ePart);
    v.set(0, 0, 0); s.set(1, 1, 1);
    mPart.compose(v, qPart, s);
    mFeat.makeScale(sx, sy, sz);
    mFeat.setPosition(ox, oy, oz);
    mFeat.multiply(mPart);
    mTmp.multiplyMatrices(frame, mFeat);
    mesh.setMatrixAt(idx, mTmp);
  }

  function leg(idx, side, footParent, fy, fz, spread, fs, hip) {
    vHip.set(side * 0.17 * hip, 0.14, 0.02).applyMatrix4(mBody);
    vAnk.set(side * spread, 0.02 + fy + 0.085 * fs, 0.05 + fz + 0.075 * fs).applyMatrix4(footParent);
    vDir.subVectors(vAnk, vHip);
    const len = Math.max(0.02, vDir.length());
    vDir.multiplyScalar(1 / len);
    qPart.setFromUnitVectors(DOWN, vDir);
    s.set(1, len, 1);
    mTmp.compose(vHip, qPart, s);
    legs.setMatrixAt(idx, mTmp);
  }

  // Shadow under the foot whose world matrix setPart just left in mTmp.
  function footShadow(idx, i, onRoot) {
    v.set(0, 0.02, 0.13).applyMatrix4(mTmp);
    const h = v.y - groundY[i];
    if (!onRoot || groundY[i] < -1e8 || h > 0.45 || h < -0.25) {
      footBlob.setMatrixAt(idx, zeroM); footK.array[idx] = 0; return;
    }
    const k = Math.max(0, Math.min(1, 1 - Math.max(0, h) * 3.2));
    const fs = footS[i] * (0.8 + 0.2 * k);
    mPart.makeRotationY(Math.atan2(mTmp.elements[8], mTmp.elements[10]));
    vDir.set(0.38 * fs, 1, 0.5 * fs);
    mPart.scale(vDir);
    mPart.setPosition(v.x, groundY[i] + 0.016, v.z);
    footBlob.setMatrixAt(idx, mPart);
    footK.array[idx] = k;
  }

  function hideBot(i) {
    for (const m of all) {
      if (TWO.has(m)) { m.setMatrixAt(i * 2, zeroM); m.setMatrixAt(i * 2 + 1, zeroM); }
      else m.setMatrixAt(i, zeroM);
    }
  }

  /**
   * view: { botPos Float32Array(3N), botYaw, botAnim Uint8Array, botAnimTime, botVel (3N), botGrounded, botStatus }
   */
  function update(view, dt, visTarget = null, snapVis = false) {
    clock += dt;
    let patDirty = false;
    // ease visibility toward the target (fast fade, ~0.08 s), snap on hard camera cuts
    const kv = snapVis ? 1 : 1 - Math.exp(-dt * 40);
    let visDirty = false;
    for (let i = 0; i < N; i++) {
      const t = visTarget ? visTarget[i] : 1;
      let nv = vis[i] + (t - vis[i]) * kv;
      if (Math.abs(nv - t) < 0.01) nv = t;
      if (nv !== vis[i]) {
        vis[i] = nv; visDirty = true;
        visN.array[i] = nv; vis2N.array[i * 2] = nv; vis2N.array[i * 2 + 1] = nv;
      }
    }
    if (visDirty) {
      visN.needsUpdate = true; vis2N.needsUpdate = true;
      let fading = false;
      for (let i = 0; i < N; i++) { const vv = (vis[i] - 0.04) / 0.92; if (vv > 0 && vv < 0.999) { fading = true; break; } }
      if (fading !== ghostsOn) { ghostsOn = fading; for (const g of ghosts) g.visible = fading; }
    }
    for (let i = 0; i < N; i++) {
      let x = view.botPos[i * 3], y = view.botPos[i * 3 + 1], z = view.botPos[i * 3 + 2];
      if (view.botHidden[i] === 1) {
        hideBot(i);
        groundY[i] = -1e9;
        fx.dizzy(i, 0, 0, 0, 0, clock);
        continue;
      }
      const vx = view.botVel[i * 3], vy = view.botVel[i * 3 + 1], vz = view.botVel[i * 3 + 2];
      const anim = view.botAnim[i], grounded = view.botGrounded[i] === 1;
      motion.pose(i, anim, view.botAnimTime[i], vx, vy, vz, view.botYaw[i], grounded, x, y, z, dt, clock, i === highlightId);
      x += P.ox; y += P.oy; z += P.oz; // hit-stop: held at the hit point for a beat

      const grey = 0; // a Gumble that is out keeps its colours (the show names it and shows it sad; grey made it unrecognisable)
      if (pat[i * 4 + 1] !== grey) { pat[i * 4 + 1] = grey; top[i * 3 + 1] = grey; patDirty = true; }

      e.set(0, view.botYaw[i] + P.yawOff, 0, 'YXZ');
      q.setFromEuler(e);
      v.set(x, y, z); s.set(1, 1, 1);
      mRoot.compose(v, q, s);
      // Body: lift, rotate about the pivot, sit on the legs, squash & stretch (volume preserving).
      const sy = P.sy, sxz = 1 / Math.sqrt(sy);
      e.set(P.pitch, 0, P.roll, 'YXZ');
      q.setFromEuler(e);
      // world-space squash (about the floor) and stretch along the flight path, from motion.js
      // Rig pivot: small leans and waddles hinge low, at the hips, so the base stays planted
      // over the feet and the dome leans into the run (not a wedge tipping off one stick leg);
      // big rotations (dives, tumbles, lying down) keep the high pivot.
      const tip = Math.max(Math.abs(P.pitch), Math.abs(P.roll));
      const tk = Math.min(1, Math.max(0, (tip - 0.6) / 0.7));
      const pv = LEG + 0.16 + (PIVOT - LEG - 0.16) * tk * tk * (3 - 2 * tk);
      mTmp.makeTranslation(0, (P.lift + pv) * P.wsq, 0);
      mBody.multiplyMatrices(mRoot, mTmp);
      motion.deform(mTmp.elements, view.botYaw[i] + P.yawOff);
      mBody.multiply(mTmp);
      mTmp.makeRotationFromQuaternion(q);
      mBody.multiply(mTmp);
      mTmp.makeTranslation(0, LEG - pv, 0);
      mBody.multiply(mTmp);
      mTmp.makeScale(sxz, sy, sxz);
      mBody.multiply(mTmp);
      body.setMatrixAt(i, mBody);
      toppers.setMatrixAt(i, mBody);

      // ---- face: eyes (or arcs), lids, mouth, tongue
      face(i, anim, view.botAnimTime[i], vy, grounded);
      const ex = eyeP[i * 5], ey = eyeP[i * 5 + 1], ez = eyeP[i * 5 + 2], eyaw = eyeP[i * 5 + 3], epitch = eyeP[i * 5 + 4];
      const esx = EYE_R[0] / 0.088 * eyeSc[i * 2] * F.eyeS, esy = eyeSc[i * 2 + 1] * F.eyeS * F.eyeY;
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1, idx = i * 2 + k;
        surfFrame(mEye, side * ex, ey, ez, epitch, side * eyaw, -side * F.roll);
        if (F.arc) {
          eyes.setMatrixAt(idx, zeroM); lids.setMatrixAt(idx, zeroM);
          const tilt = F.arc === 2 ? side * Math.PI / 2 : 0;
          child(eyeArcs, idx, mEye, 0, -0.01, 0.012, esx, F.arcY * esy * 0.85, 1, tilt, 0);
        } else {
          eyeArcs.setMatrixAt(idx, zeroM);
          child(eyes, idx, mEye, 0, 0, 0, esx, esy, 1, 0, 0);
          const lid = k ? F.lidR : F.lidL;
          if (lid < -1.25) lids.setMatrixAt(idx, zeroM);
          else child(lids, idx, mEye, 0, 0, 0, EYE_R[0] * esx * 1.13, EYE_R[1] * esy * 1.1, EYE_R[2] * 1.22, side * F.tilt, lid);
        }
        // brows ride above the eye (or the closed arc), tilting with the lids: in for a scowl,
        // up and out when startled
        if (hasBrow[i]) {
          const by = EYE_R[1] * esy * (1.32 + F.browY * 0.35) + 0.018 + (lidHas(k ? F.lidR : F.lidL) ? 0.006 : 0);
          child(brows, idx, mEye, -side * 0.006, by, 0.004, 1, 1, 1, side * (F.tilt * 0.9 - F.browY * 0.25), 0);
        } else brows.setMatrixAt(idx, zeroM);
      }
      const mY = mouthP[i * 4], mZ = mouthP[i * 4 + 1], mPitch = mouthP[i * 4 + 2];
      surfFrame(mEye, 0, mY, mZ, mPitch, 0, 0);
      mouth.setMatrixAt(i, zeroM); mouthO.setMatrixAt(i, zeroM); grit.setMatrixAt(i, zeroM); mouthAlt.setMatrixAt(i, zeroM);
      if (F.mouth === 1) child(mouthO, i, mEye, 0, -0.035, 0.002, F.mx, F.my, 1, 0, 0);
      else if (F.mouth === 2) child(grit, i, mEye, 0, 0, 0.002, F.mx, 1, 1, 0, 0);
      else if (F.mouth === 4) child(mouthAlt, i, mEye, 0, -0.01, 0.002, F.mx, F.my, 1, 0, 0);
      else child(mouth, i, mEye, 0, F.mouth === 3 ? -0.03 : 0, 0.003, F.mx, F.my, 1, F.mouth === 3 ? Math.PI : 0, 0);
      if (F.acc && F.mouth === 0) child(accent, i, mEye, 0, 0, 0.003, F.mx, Math.min(1.15, F.my), 1, 0, 0);
      else accent.setMatrixAt(i, zeroM);
      if (F.tongue && F.mouth === 0) child(tongue, i, mEye, 0.018, -0.035 * F.my, 0.008, 1, 1, 1, 0.15, -0.35);
      else tongue.setMatrixAt(i, zeroM);

      setPart(sprout, i, mBody, 0, crownY[i], 0, P.sproutX, 0, P.sproutZ, 1, 1, 1);
      // Nub arms pivot at the shoulder: elevation (z), reach forward (y), swing fore/aft (x).
      armPart(i, i * 2, -1, P.armUpL, P.armSwingL, P.armFwdL);
      armPart(i, i * 2 + 1, 1, P.armUpR, P.armSwingR, P.armFwdR);
      // Feet hang off the root (not squashed); they ride the body in tumbles, dives and get-ups.
      // Legs join the hips (in the body) to the feet, so the stride and the hop show.
      const fp = P.feetOnBody ? mBody : mRoot;
      if (grounded || groundY[i] < -1e8) groundY[i] = y;
      const fs = footS[i], hip = hipS[i], spread = P.footSpread * hip;
      // Rig: on the root the feet stand on the floor; parented to the body (dives, tumbles,
      // get-ups) they hang off the sole, kicking away from it as the pose lifts them, so the
      // legs and booties still read instead of sinking into the jelly.
      const onB = fp === mBody;
      const fLy = onB ? -LEG - 0.05 - P.footLy * 0.7 : P.footLy, fRy = onB ? -LEG - 0.05 - P.footRy * 0.7 : P.footRy;
      // booties toe out a touch (a planted, pigeon-free stance)
      setPart(feet, i * 2, fp, -spread, 0.02 + fLy, 0.05 + P.footLz, onB ? 0.25 : -P.footLy * 2, -0.12, 0, fs, fs, fs);
      footShadow(i * 2, i, fp === mRoot);
      setPart(feet, i * 2 + 1, fp, spread, 0.02 + fRy, 0.05 + P.footRz, onB ? 0.25 : -P.footRy * 2, 0.12, 0, fs, fs, fs);
      footShadow(i * 2 + 1, i, fp === mRoot);
      leg(i * 2, -1, fp, fLy, P.footLz, spread, fs, hip);
      leg(i * 2 + 1, 1, fp, fRy, P.footRz, spread, fs, hip);

      // Contact shadow on the floor at the last grounded height, under the body's centre.
      if (grounded || groundY[i] < -1e8) groundY[i] = y;
      const hAbove = y - groundY[i] + P.lift;
      if (hAbove < -0.35) {
        blob.setMatrixAt(i, zeroM); bodyK.array[i] = 0;
      } else {
        const bh = BODY_H * shape[i * 4 + 1];
        v.set(0, bh * 0.45, 0).applyMatrix4(mBody);
        const me = mBody.elements;
        const ul = Math.hypot(me[4], me[5], me[6]) || 1;
        const ux = me[4] / ul, uy = me[5] / ul, uz = me[6] / ul;
        const hl = Math.min(1, Math.hypot(ux, uz)); // 0 upright .. 1 lying flat
        const rb = 0.5 * bodyW[i] * sxz;
        // how far the lowest point of the body is off the floor
        const ext = Math.abs(uy) * bh * 0.45 + hl * rb;
        const gap = Math.max(0, v.y - groundY[i] - ext);
        const k = Math.max(0, Math.min(1, 1 - gap * 1.5));
        const air = Math.max(0.3, Math.min(1, 1 - Math.max(0, hAbove) * 0.3));
        const wide = 2 * rb * 1.12 * air, long = (2 * rb + hl * bh * 0.85) * 1.12 * air;
        const ang = hl > 0.05 ? Math.atan2(ux, uz) : view.botYaw[i] + P.yawOff;
        mPart.makeRotationY(ang);
        vDir.set(wide, 1, long);
        mPart.scale(vDir);
        mPart.setPosition(v.x, groundY[i] + 0.012, v.z);
        blob.setMatrixAt(i, mPart);
        bodyK.array[i] = Math.max(0.25, k) * (0.55 + 0.45 * air);
      }

      fx.dizzy(i, x, y + P.lift + GUMBLE_HEIGHT, z, P.dizzy * vis[i], clock);

      if (i === highlightId) {
        marker.visible = true;
        marker.position.set(x, y + P.lift + crownY[i] + LEG + 0.32 + Math.sin(clock * 4) * 0.06, z);
      }
    }
    if (highlightId < 0 || view.botHidden[highlightId] === 1) marker.visible = false;
    for (const m of all) m.instanceMatrix.needsUpdate = true;
    footK.needsUpdate = true; bodyK.needsUpdate = true;
    if (patDirty) { patAttr.needsUpdate = true; topAttr.needsUpdate = true; }
    fx.update(dt);
  }

  return {
    group,
    update,
    /** Remove from the scene and free every geometry, material and texture this crowd owns. */
    dispose() {
      group.parent?.remove(group);
      disposeTree(group);
    },
    setHighlight(id) { highlightId = id ?? -1; if (highlightId < 0) marker.visible = false; },
    /** drawn visibility per bot (0 = faded out for the lens), for labels */
    visibility: vis,
    get drawCalls() { return all.length + 1 + fx.drawCalls + (ghostsOn ? ghosts.length : 0); },
  };
}
