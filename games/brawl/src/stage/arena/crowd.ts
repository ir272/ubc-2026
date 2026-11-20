// Dry Dock 9: two raked stands on the dock-side quays, angled in toward the deck, and the crowd of
// small spectator robots on them.
//
// The crowd is one mass: cool, desaturated blue-grey robots with small lamp points, lit softly from
// the canopy lamps above (the top rows catch the light, the front rows fall into the dark of the
// dock), never brighter or more saturated than the deck. Aisles with stairs break each stand into
// blocks. Everything that moves is in the vertex shader (one instanced draw, no per-robot CPU work):
// idle bobbing, heads turning, the odd lamp blinking; a ripple of lamp flashes running out along the
// stands on each hit; at a knockout the whole crowd jumps and its lamps flare in the scorer's colour.

import * as THREE from 'three';
import type { SimEvent } from '../../sim/types.ts';
import { GROUND_Y, ShadedBatch, rng, smooth01, type Disposer } from './util.ts';

export interface Crowd {
  group: THREE.Group;
  /** feed the sim events of this frame; t = arena seconds */
  react(events: SimEvent[], t: number): void;
  update(dt: number, t: number): void;
  /** 0..1, how hard the crowd is flaring right now (for other parts that want to follow it) */
  readonly flare: number;
}

const TIERS = 12;
const TIER_RISE = 0.9;
const TIER_DEPTH = 1.3;
/** the inner front corner of each stand (mirrored for the left), and how far it turns in */
const X_IN = 20.5;
const FRONT_Z = -59;
const FRONT_Y = -7.5;
const ANGLE = THREE.MathUtils.degToRad(17);
const STAND_W = 50;
/** aisles (stairs), metres along the stand from its inner end */
const AISLES = [6.5, 16, 25.5, 35, 44.5];
const AISLE_W = 1.3;
const VARIANTS = 8;
const CELL_W = 48;
const CELL_H = 80;
/** card size in metres (a robot about 1.35 m tall, the card a little wider for raised arms) */
const CARD_W = 0.95;
const CARD_H = 1.58;
const HAZE = new THREE.Color('#122636');
const MAX_HITS = 4;

/** paint the atlas: R = body shade, G = lamp mask, B = unused, A = coverage */
function atlas(): THREE.DataTexture {
  const W = CELL_W * VARIANTS;
  const H = CELL_H * 2;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c.getContext('2d')!;
  };
  const body = mk();
  const lamp = mk();
  // shades: soft light from above, low contrast
  const L = '#ffffff', M = '#c8c8c8', D = '#949494', K = '#6a6a6a';
  const rect = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  /** a shaded box: lit top, a soft dark right edge */
  const box = (x: number, y: number, w: number, h: number) => {
    rect(body, M, x, y, w, h);
    rect(body, L, x, y, w, Math.max(2, h * 0.3));
    rect(body, D, x + w - Math.max(2, w * 0.2), y + h * 0.3, Math.max(2, w * 0.2), h * 0.7);
  };
  const circle = (g: CanvasRenderingContext2D, c: string, x: number, y: number, r: number) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  for (let pose = 0; pose < 2; pose++) {
    for (let v = 0; v < VARIANTS; v++) {
      const ox = v * CELL_W;
      const oy = pose * CELL_H;
      const cx = ox + CELL_W / 2;
      const up = pose === 1;
      const P = [
        { tw: 18, th: 18, hw: 16, hh: 13, leg: 12, arm: 5 }, // boxy
        { tw: 20, th: 17, hw: 18, hh: 14, leg: 11, arm: 5 }, // dome head
        { tw: 13, th: 22, hw: 11, hh: 10, leg: 15, arm: 4 }, // tall, antenna
        { tw: 26, th: 16, hw: 14, hh: 11, leg: 10, arm: 6 }, // wide shoulders
        { tw: 17, th: 17, hw: 24, hh: 14, leg: 12, arm: 5 }, // screen head
        { tw: 18, th: 24, hw: 0, hh: 0, leg: 9, arm: 5 }, // can body
        { tw: 14, th: 12, hw: 20, hh: 18, leg: 9, arm: 4 }, // small body, big round head
        { tw: 22, th: 19, hw: 15, hh: 12, leg: 12, arm: 6 }, // hunched, a crest
      ][v];
      const footY = oy + CELL_H - 2;
      const legTop = footY - P.leg;
      const torsoTop = legTop - P.th;
      const headTop = torsoTop - P.hh - 1;
      box(cx - P.tw * 0.32 - 2, legTop, 5, P.leg);
      box(cx + P.tw * 0.32 - 3, legTop, 5, P.leg);
      if (!up) {
        box(cx - P.tw / 2 - P.arm, torsoTop + 2, P.arm, P.th + 2);
        box(cx + P.tw / 2, torsoTop + 2, P.arm, P.th + 2);
      } else {
        for (const s of [-1, 1]) {
          body.save();
          body.translate(cx + s * (P.tw / 2 + P.arm / 2), torsoTop + 3);
          body.rotate(s * 2.6);
          rect(body, M, -P.arm / 2, 0, P.arm, P.th + 4);
          rect(body, L, -P.arm / 2, P.th, P.arm, 4);
          body.restore();
        }
      }
      if (v === 5) box(cx - P.tw / 2, torsoTop - 6, P.tw, P.th + 6);
      else box(cx - P.tw / 2, torsoTop, P.tw, P.th);
      // heads, each with one small lamp point (an eye, an antenna tip, a screen dot)
      switch (v) {
        case 1:
          circle(body, M, cx, torsoTop - 1, P.hw / 2);
          circle(body, L, cx - 2, torsoTop - 5, P.hw / 3.2);
          circle(lamp, '#fff', cx + 2, torsoTop - 3, 2.6);
          break;
        case 2:
          box(cx - P.hw / 2, headTop, P.hw, P.hh);
          rect(body, D, cx - 1, headTop - 8, 2, 8);
          circle(lamp, '#fff', cx, headTop - 9, 2.6);
          break;
        case 4:
          box(cx - P.hw / 2, headTop, P.hw, P.hh);
          circle(lamp, '#fff', cx + 3, headTop + P.hh / 2, 2.8);
          break;
        case 5:
          circle(lamp, '#fff', cx, torsoTop + 1, 2.6);
          break;
        case 6:
          circle(body, M, cx, torsoTop - P.hh / 2, P.hw / 2);
          circle(body, L, cx - 3, torsoTop - P.hh / 2 - 4, P.hw / 4);
          circle(lamp, '#fff', cx + 2, torsoTop - P.hh / 2 + 1, 3);
          break;
        case 7:
          box(cx - P.hw / 2, headTop + 3, P.hw, P.hh);
          rect(body, D, cx - 2, headTop - 2, 4, 6);
          circle(lamp, '#fff', cx + 2, headTop + 9, 2.4);
          break;
        default:
          box(cx - P.hw / 2, headTop, P.hw, P.hh);
          circle(lamp, '#fff', cx + 2, headTop + 6, 2.5);
          if (v === 3) {
            rect(body, D, cx - P.tw / 2 - 2, torsoTop - 2, 7, 5);
            rect(body, D, cx + P.tw / 2 - 5, torsoTop - 2, 7, 5);
          }
      }
      rect(body, K, cx - P.tw / 2, legTop - 1, P.tw, 1);
    }
  }
  const b = body.getImageData(0, 0, W, H).data;
  const l = lamp.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4;
      const di = ((H - 1 - y) * W + x) * 4;
      out[di] = b[si + 3] > 0 ? b[si] : 200;
      out[di + 1] = l[si + 3];
      out[di + 2] = 0;
      out[di + 3] = Math.max(b[si + 3], l[si + 3]);
    }
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** a stand's frame: origin at its inner front corner, +x along the front edge (left stand: x <= 0) */
function standMatrix(side: -1 | 1): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(side < 0 ? ANGLE : -ANGLE).setPosition(side * X_IN, FRONT_Y, FRONT_Z);
}

export function buildCrowd(d: Disposer, fog: { color: THREE.Color; near: number; far: number }): Crowd {
  const group = new THREE.Group();
  group.name = 'crowd';
  const r = rng(4242);
  const topY = (TIERS - 1) * TIER_RISE; // local, relative to FRONT_Y
  const backZ = -(TIERS - 1) * TIER_DEPTH;
  const inAisle = (a: number) => AISLES.some((x) => Math.abs(a - x) < AISLE_W / 2 + 0.15);

  // ---------------------------------------------------------------- the stands (static, merged)
  const stand = new ShadedBatch('stands', 1.0, 0.62, 0.5, 0.3);
  const lampStrip = new ShadedBatch('canopy lamps', 1, 1, 1, 1);
  lampStrip.color('#ffe2bc');
  const add = (b: ShadedBatch, m: THREE.Matrix4, w: number, h: number, dd: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, dd);
    b.add(g, new THREE.Matrix4().makeTranslation(x, y, z).premultiply(m));
    g.dispose();
  };
  const addBeam = (b: ShadedBatch, m: THREE.Matrix4, a: THREE.Vector3, c: THREE.Vector3, w: number) => b.beam(a.clone().applyMatrix4(m), c.clone().applyMatrix4(m), w);
  for (const side of [-1, 1] as const) {
    const m = standMatrix(side);
    const s = side; // local x of a point `a` metres along the stand is s * a
    const cx = (s * STAND_W) / 2;
    for (let k = 0; k < TIERS; k++) {
      const y = k * TIER_RISE;
      const z = -k * TIER_DEPTH;
      stand.color('#303e4d');
      add(stand, m, STAND_W, 0.16, TIER_DEPTH, cx, y - 0.08, z); // tread
      stand.color('#2a3746');
      add(stand, m, STAND_W, TIER_RISE, 0.1, cx, y - TIER_RISE / 2 - 0.16, z + TIER_DEPTH / 2); // riser
      // aisle stairs: two steps per tier, a touch lighter, so the aisles read as breaks
      stand.color('#3a4757');
      for (const a of AISLES) {
        add(stand, m, AISLE_W, 0.12, TIER_DEPTH / 2, s * a, y - TIER_RISE / 2 + 0.02, z + TIER_DEPTH / 4);
      }
    }
    // aisle handrails, rising with the rake
    stand.color('#4a5868');
    for (const a of AISLES) {
      for (const dx of [-AISLE_W / 2, AISLE_W / 2]) {
        addBeam(stand, m, new THREE.Vector3(s * a + dx, 1.0, 0.4), new THREE.Vector3(s * a + dx, topY + 1.0, backZ + 0.4), 0.05);
      }
    }
    // the front parapet: a solid panel with a rail, the end wall at the inner end, the back wall
    stand.color('#2c3846');
    add(stand, m, STAND_W, 1.6, 0.25, cx, -0.4, 0.8);
    stand.color('#4a5868');
    add(stand, m, STAND_W, 0.07, 0.1, cx, 0.45, 0.85);
    stand.color('#222c38');
    {
      // the inner end wall: a stepped profile following the tiers, down to the quay
      for (let k = 0; k < TIERS; k++) {
        const y = k * TIER_RISE;
        const h = y - (GROUND_Y - FRONT_Y) + 0.3;
        add(stand, m, 0.35, h, TIER_DEPTH, -s * 0.2, y + 0.3 - h / 2, -k * TIER_DEPTH);
      }
      add(stand, m, STAND_W, topY + 5.4 - (GROUND_Y - FRONT_Y), 0.3, cx, (topY + 5.4 + (GROUND_Y - FRONT_Y)) / 2, backZ - 0.8);
    }
    // the front skirt down to the quay: a dark panel with a few vents, and scaffold bracing behind it
    stand.color('#202a36');
    add(stand, m, STAND_W, FRONT_Y - GROUND_Y - 0.9, 0.2, cx, (GROUND_Y - FRONT_Y + -1.2) / 2, 0.9);
    stand.color('#2a3542');
    for (let a = 4; a < STAND_W; a += 8) add(stand, m, 2.2, 0.5, 0.06, s * a, -2.6, 1.02);
    // the concourse under the stand: a row of small work lamps along the skirt and a lit band
    // at quay level, so the stand stands on something
    for (let a = 2; a < STAND_W; a += 4) add(lampStrip, m, 0.7, 0.16, 0.1, s * a, -1.7, 1.06);
    stand.color('#33404f');
    add(stand, m, STAND_W, 0.3, 0.1, cx, GROUND_Y - FRONT_Y + 2.6, 1.05);
    // the roof: a canopy over the back half on posts, a deep fascia carrying the lamp strip
    stand.color('#2a3542');
    const roofY = topY + 4.6;
    const roofD = TIERS * TIER_DEPTH * 0.6;
    add(stand, m, STAND_W + 1, 0.3, roofD, cx, roofY, backZ + roofD / 2 - 1.2);
    add(stand, m, STAND_W + 1, 0.9, 0.3, cx, roofY - 0.45, backZ + roofD - 1.2);
    for (let a = 0; a <= STAND_W + 0.1; a += 10) add(stand, m, 0.3, roofY + 0.2, 0.3, s * a, roofY / 2, backZ - 0.6);
    for (let a = 1.5; a < STAND_W - 1; a += 2.5) add(lampStrip, m, 1.6, 0.14, 0.14, s * a, roofY - 0.95, backZ + roofD - 1.05);
  }
  const standGeo = d.track(stand.build());
  // light from the canopy lamps: the upper tiers and the roof's underside catch it, the lower
  // tiers fall into the dark of the dock; everything lifts a little toward the haze with distance
  {
    const p = standGeo.getAttribute('position');
    const c = standGeo.getAttribute('color');
    const base = FRONT_Y;
    for (let i = 0; i < p.count; i++) {
      const up = smooth01((p.getY(i) - (base - 1)) / (topY + 2));
      const k = 0.6 + 0.8 * up;
      c.setXYZ(i, c.getX(i) * k * 1.02, c.getY(i) * k, c.getZ(i) * k * 0.98);
    }
    c.needsUpdate = true;
  }
  group.add(new THREE.Mesh(standGeo, d.track(new THREE.MeshBasicMaterial({ vertexColors: true }))));
  {
    const lampMat = d.track(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.62, 0.57, 0.5) }));
    group.add(new THREE.Mesh(d.track(lampStrip.build()), lampMat));
  }

  // ---------------------------------------------------------------- seat the crowd
  const base: number[] = []; // x, y, z, scale
  const look: number[] = []; // variant, tint, lamp kind, seed
  const misc: number[] = []; // row 0..1, bob amplitude, bob rate, flip seed
  const v = new THREE.Vector3();
  for (const side of [-1, 1] as const) {
    const m = standMatrix(side);
    for (let k = 0; k < TIERS; k++) {
      for (let a = 0.6; a < STAND_W - 0.4; a += 0.5 + r() * 0.16) {
        if (inAisle(a)) continue;
        if (r() < 0.06) continue;
        v.set(side * a + (r() - 0.5) * 0.12, k * TIER_RISE, -k * TIER_DEPTH + 0.2 + (r() - 0.5) * 0.25).applyMatrix4(m);
        base.push(v.x, v.y, v.z, 0.95 + r() * 0.35);
        // lamp kind: 0 cool white, 1 warm, 2 pale cyan
        const lk = r() < 0.7 ? 0 : r() < 0.6 ? 1 : 2;
        look.push(Math.floor(r() * VARIANTS), Math.floor(r() * 6), lk, r() * 100);
        misc.push(k / (TIERS - 1), r() < 0.3 ? 0.06 + r() * 0.08 : 0, 1.2 + r() * 1.6, r() * 100);
      }
    }
  }
  const N = base.length / 4;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0, 0.5, 0);
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(new Float32Array(base), 4));
  geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(new Float32Array(look), 4));
  geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(new Float32Array(misc), 4));
  geo.instanceCount = N;
  d.track(geo);
  d.track(quad);

  // one cool, desaturated mass: blue-greys a step apart in value
  const tints = ['#5e6b7a', '#53606f', '#677483', '#59646f', '#4d5a69', '#626c78'].map((h) => new THREE.Color(h));
  const lampCols = [new THREE.Color('#cfe0ff'), new THREE.Color('#ffcf9a'), new THREE.Color('#a8e4ec')];
  const hits: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_HITS; i++) hits.push(new THREE.Vector4(0, -100, 0, 0));
  let hitSlot = 0;
  const atlasTex = d.track(atlas());
  const mat = d.track(new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTex },
      uTime: { value: 0 },
      uTints: { value: tints },
      uLamps: { value: lampCols },
      uHits: { value: hits },
      uKo: { value: new THREE.Vector4(-100, 0, 0, 0) },
      uKoColor: { value: new THREE.Color('#ffffff') },
      uFog: { value: fog.color.clone() },
      uHaze: { value: HAZE.clone() },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
    },
    vertexShader: /* glsl */ `
      #define MAX_HITS ${MAX_HITS}
      attribute vec4 aBase; attribute vec4 aLook; attribute vec4 aMisc;
      uniform float uTime; uniform vec4 uHits[MAX_HITS]; uniform vec4 uKo;
      varying vec2 vUv; varying vec4 vLook; varying float vFlash; varying float vKo; varying float vLight; varying float vFogD; varying float vLampI;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float s = aBase.w;
        float seed = aLook.w;
        float row = aMisc.x;
        // ---- idle: a share of the crowd bobs; now and then one turns its head (the card flips);
        // the odd lamp blinks off
        float bob = aMisc.y * max(0.0, sin(uTime * aMisc.z + seed)) * 1.6;
        float slot = floor(uTime / 1.7 + aMisc.w);
        float flip = step(0.8, hash(slot * 3.7 + seed));
        float bslot = floor(uTime * 2.2 + seed * 7.0);
        float blink = step(0.985, hash(bslot * 1.3 + seed * 0.37));
        // ---- hits: a ripple of lamp flashes runs out along the stands from the deck
        float flash = 0.0;
        float hop = 0.0;
        for (int i = 0; i < MAX_HITS; i++) {
          vec4 h = uHits[i];
          float age = uTime - h.y;
          if (age < 0.0 || age > 2.6) continue;
          float d = abs(aBase.x - h.x) - 12.0;
          float front = age * 38.0;
          float w = exp(-pow((d - front) / (2.2 + age * 2.0), 2.0));
          float k = h.z * w * exp(-age * 0.8);
          flash += k;
          hop += k * (0.12 + 0.2 * h.z) * (0.6 + 0.8 * hash(seed * 4.1));
        }
        // ---- the knockout: everyone jumps (three hops, each lower), arms up for two seconds
        float kAge = uTime - uKo.x;
        float jump = 0.0;
        float arms = 0.0;
        float ko = 0.0;
        if (kAge >= 0.0 && kAge < 3.6) {
          float a = kAge - hash(seed * 1.91) * 0.25;
          if (a > 0.0) {
            float n = floor(a / 0.42);
            float u = fract(a / 0.42);
            if (n < 4.0) jump = (0.6 - 0.13 * n) * (0.75 + 0.5 * hash(seed + n)) * 4.0 * u * (1.0 - u);
            arms = step(a, 2.6);
          }
          ko = smoothstep(0.0, 0.08, kAge) * (1.0 - smoothstep(1.5, 2.6, kAge));
        }
        float armsUp = max(arms, step(0.55, flash) * step(0.5, hash(seed * 2.3)));
        vec3 p = aBase.xyz + vec3(position.x * ${CARD_W.toFixed(2)} * s, position.y * ${CARD_H.toFixed(2)} * s + bob + hop + jump, 0.0);
        float u0 = mix(uv.x, 1.0 - uv.x, flip);
        vUv = vec2((aLook.x + u0) / ${VARIANTS.toFixed(1)}, (uv.y + 1.0 - armsUp) * 0.5);
        vLook = aLook;
        vFlash = clamp(flash, 0.0, 1.0);
        vKo = ko;
        vLampI = 1.0 - blink;
        // soft light from above: the top rows near the canopy lamps, the front rows in the dark
        vLight = 0.45 + 0.85 * row * row;
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        vFogD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas; uniform vec3 uTints[6]; uniform vec3 uLamps[3]; uniform vec3 uKoColor;
      uniform vec3 uFog; uniform vec3 uHaze; uniform float uFogNear; uniform float uFogFar;
      varying vec2 vUv; varying vec4 vLook; varying float vFlash; varying float vKo; varying float vLight; varying float vFogD; varying float vLampI;
      void main() {
        vec4 a = texture2D(uAtlas, vUv);
        if (a.a < 0.5) discard;
        int ti = int(vLook.y + 0.5);
        int li = int(vLook.z + 0.5);
        vec3 tint = uTints[0];
        for (int i = 1; i < 6; i++) if (i == ti) tint = uTints[i];
        vec3 lampC = uLamps[0];
        for (int i = 1; i < 3; i++) if (i == li) lampC = uLamps[i];
        // body: low-contrast shading, lit cool-neutral from above
        float shade = mix(0.74, a.r, 0.55);
        vec3 col = tint * shade * vLight * vec3(0.78, 0.83, 0.92);
        // lamps: small points, dim at rest; a hit's ripple lifts them warm-white; a knockout
        // floods them in the scorer's colour
        float li0 = (0.6 + 2.6 * vFlash) * vLampI;
        col *= 1.0 + 0.8 * vFlash;
        vec3 lamp = mix(lampC, vec3(1.0, 0.93, 0.8), vFlash) * li0;
        lamp = mix(lamp, uKoColor * 2.2, vKo);
        col = mix(col, lamp, a.g);
        // sit back in the haze of the dock
        float fogF = smoothstep(uFogNear, uFogFar, vFogD);
        col = mix(col, uFog, fogF * 0.85);
        col = mix(col, uHaze * 1.6, 0.2);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  group.add(mesh);

  let flare = 0;
  let koT = -100;
  const sideCol = [new THREE.Color('#ff4a3e'), new THREE.Color('#4a82ff')];
  const crowd: Crowd = {
    group,
    get flare() {
      return flare;
    },
    react(events: SimEvent[], t: number) {
      for (const e of events) {
        if (e.t === 'hit') {
          const k = e.strength === 'light' ? 0.0 : e.strength === 'medium' ? 0.45 : e.strength === 'heavy' ? 0.85 : 1.0;
          if (k <= 0) continue;
          hits[hitSlot].set(e.x, t, k, 0);
          hitSlot = (hitSlot + 1) % MAX_HITS;
        } else if (e.t === 'ko') {
          koT = t;
          mat.uniforms.uKo.value.set(t, e.by, 0, 0);
          mat.uniforms.uKoColor.value.copy(sideCol[e.by]);
        } else if (e.t === 'shield_break' || e.t === 'sudden_death') {
          hits[hitSlot].set(0, t, 0.6, 0);
          hitSlot = (hitSlot + 1) % MAX_HITS;
        }
      }
    },
    update(_dt: number, t: number) {
      mat.uniforms.uTime.value = t;
      const age = t - koT;
      flare = age >= 0 && age < 2.6 ? 1 - smooth01((age - 1.5) / 1.1) : 0;
    },
  };
  return crowd;
}
