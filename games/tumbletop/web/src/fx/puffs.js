// Impact feedback for Gumbles: soft white puff clouds (landings, bounces, skids, footsteps,
// get-ups), a white starburst of streaks on hits, and little dizzy stars circling a knocked-over
// Gumble, plus a flat floor shockwave on hard impacts. Four instanced draw calls in all, fixed pools, no per-frame allocations.
// Visual only: never reads or changes the sim. Its own tiny LCG keeps captures repeatable.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const PUFFS = 320;
const WAVES = 24;
const STREAKS = 72;
const STARS_PER = 3;

export function createFx(parent, botCount) {
  const group = new THREE.Group();
  group.name = 'gumble-fx';
  parent.add(group);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // ------------------------------------------------------------ puffs
  // A puff is a lumpy cumulus clump (five merged lobes, flat-ish bottom), not one ball: a single
  // white ellipsoid reads as an egg or a pebble on the floor. Each instance gets its own spin so
  // no two clumps look alike, and the edges go soft (fresnel alpha) so it reads as vapour.
  const LOBES = [[0, 0.05, 0, 1], [0.62, -0.08, 0.12, 0.72], [-0.58, -0.1, -0.05, 0.76], [0.1, -0.06, 0.6, 0.66], [-0.12, 0.18, -0.52, 0.62]];
  const lobeGeos = LOBES.map(([x, y, z, r]) => { const g = new THREE.IcosahedronGeometry(r, 2); g.translate(x, y, z); return g; });
  const puffGeo = mergeGeometries(lobeGeos, false);
  puffGeo.scale(0.78, 0.7, 0.78);
  for (const g of lobeGeos) g.dispose();
  // lit white with a lilac shadow side; alpha per instance so a puff swells and dissolves
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9d98c2, transparent: true, depthWrite: false });
  puffMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha; varying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float fres = abs(dot(normalize(normal), normalize(vViewPosition)));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), 0.25 * (1.0 - fres));
        gl_FragColor.a *= vAlpha * smoothstep(0.02, 0.5, fres);`);
  };
  puffMat.customProgramCacheKey = () => 'gumble-puff-cloud';
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, PUFFS);
  const pAlpha = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1);
  pAlpha.setUsage(THREE.DynamicDrawUsage);
  puffGeo.setAttribute('aAlpha', pAlpha);
  puffs.renderOrder = 2;
  const pP = new Float32Array(PUFFS * 3), pV = new Float32Array(PUFFS * 3);
  const pAge = new Float32Array(PUFFS).fill(1), pLife = new Float32Array(PUFFS).fill(1), pSize = new Float32Array(PUFFS);
  const pSpin = new Float32Array(PUFFS);
  const pAlive = new Uint8Array(PUFFS);
  let pNext = 0;

  // ------------------------------------------------------------ floor shockwaves
  // A flat white ring that snaps outward along the floor on a hard landing, a splat or a hit:
  // the clearest "that hurt" read when the Gumble is only ~40 px tall in the follow camera.
  const waveGeo = new THREE.RingGeometry(0.78, 1, 40, 1);
  waveGeo.rotateX(-Math.PI / 2);
  const waveMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  waveMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha; varying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vAlpha;');
  };
  waveMat.customProgramCacheKey = () => 'gumble-wave';
  const waves = new THREE.InstancedMesh(waveGeo, waveMat, WAVES);
  const wAlpha = new THREE.InstancedBufferAttribute(new Float32Array(WAVES), 1);
  wAlpha.setUsage(THREE.DynamicDrawUsage);
  waveGeo.setAttribute('aAlpha', wAlpha);
  waves.renderOrder = 1;
  const wP = new Float32Array(WAVES * 3), wAge = new Float32Array(WAVES).fill(1), wLife = new Float32Array(WAVES).fill(1), wSize = new Float32Array(WAVES);
  const wAlive = new Uint8Array(WAVES);
  let wNext = 0;

  // ------------------------------------------------------------ hit streaks
  const streakGeo = new THREE.OctahedronGeometry(1, 0);
  streakGeo.scale(0.05, 0.05, 0.5);
  streakGeo.translate(0, 0, 0.5);
  const streaks = new THREE.InstancedMesh(streakGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), STREAKS);
  const sP = new Float32Array(STREAKS * 3), sD = new Float32Array(STREAKS * 3);
  const sAge = new Float32Array(STREAKS).fill(1), sLife = new Float32Array(STREAKS).fill(1), sSize = new Float32Array(STREAKS);
  const sAlive = new Uint8Array(STREAKS);
  let sNext = 0;

  // ------------------------------------------------------------ dizzy stars
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 === 0 ? 1 : 0.45;
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 1 });
  starGeo.translate(0, 0, -0.17);
  starGeo.scale(0.19, 0.19, 0.19);
  // two stars crossed at right angles: reads as a star from any camera, never as an edge-on bar
  const starGeo2 = starGeo.clone();
  starGeo2.rotateY(Math.PI / 2);
  const starCross = mergeGeometries([starGeo, starGeo2], false);
  const stars = new THREE.InstancedMesh(starCross, new THREE.MeshBasicMaterial({ color: 0xffe04a }), botCount * STARS_PER);
  const starOn = new Uint8Array(botCount);

  for (const m of [puffs, waves, streaks, stars]) {
    m.frustumCulled = false;
    m.castShadow = false; m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let k = 0; k < PUFFS; k++) puffs.setMatrixAt(k, zero);
  for (let k = 0; k < WAVES; k++) waves.setMatrixAt(k, zero);
  for (let k = 0; k < STREAKS; k++) streaks.setMatrixAt(k, zero);
  for (let k = 0; k < botCount * STARS_PER; k++) stars.setMatrixAt(k, zero);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), e = new THREE.Euler();

  /** One puff cloud at (x,y,z) of radius `size`, drifting with (vx,vy,vz), living `life` s. */
  function puff(x, y, z, size, vx = 0, vy = 0.5, vz = 0, life = 0.5) {
    const k = pNext; pNext = (pNext + 1) % PUFFS;
    pP[k * 3] = x; pP[k * 3 + 1] = y; pP[k * 3 + 2] = z;
    pV[k * 3] = vx; pV[k * 3 + 1] = vy; pV[k * 3 + 2] = vz;
    pAge[k] = 0; pLife[k] = life * (0.85 + 0.3 * rnd()); pSize[k] = size; pAlive[k] = 1;
    pSpin[k] = rnd() * Math.PI * 2;
  }

  /** A flat shockwave ring on the floor at (x,y,z), growing to radius `size` over `life` s. */
  function wave(x, y, z, size, life = 0.3) {
    const k = wNext; wNext = (wNext + 1) % WAVES;
    wP[k * 3] = x; wP[k * 3 + 1] = y + 0.03; wP[k * 3 + 2] = z;
    wAge[k] = 0; wLife[k] = life; wSize[k] = size; wAlive[k] = 1;
  }

  /** A cloud of puffs kicked out along the floor (landings, bounces, get-ups). */
  function ring(x, y, z, size, count, carry = 0) {
    const a0 = rnd() * Math.PI * 2;
    const n = Math.min(count, 7);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
      const c = Math.cos(a), sn = Math.sin(a);
      const r = 0.32 + 0.12 * rnd();
      const out = 2.2 + 2.2 * size;
      puff(x + c * r, y + 0.08 + 0.05 * rnd(), z + sn * r, size * (0.34 + 0.16 * rnd()),
        c * out, 0.4 + 0.8 * rnd(), sn * out, 0.42 + 0.2 * size);
    }
    // a fat central cloud so the ring reads as one clump, not a donut
    puff(x, y + 0.14, z, size * 0.42, 0, 1.0, 0, 0.3 + 0.1 * size);
    if (size >= 0.4) wave(x, y, z, 0.7 + 1.3 * size, 0.24 + 0.1 * size);
  }

  /** White starburst on a hit, centred on (x,y,z). */
  function burst(x, y, z, size) {
    const n = size < 0.9 ? 5 : 9; // crowd hits get a small burst, the watched Gumble the full one
    const a0 = rnd() * Math.PI * 2;
    for (let j = 0; j < n; j++) {
      const k = sNext; sNext = (sNext + 1) % STREAKS;
      const a = a0 + (j / n) * Math.PI * 2;
      const up = (rnd() - 0.3) * 1.2;
      dir.set(Math.cos(a), up, Math.sin(a)).normalize();
      sP[k * 3] = x; sP[k * 3 + 1] = y; sP[k * 3 + 2] = z;
      sD[k * 3] = dir.x; sD[k * 3 + 1] = dir.y; sD[k * 3 + 2] = dir.z;
      sAge[k] = 0; sLife[k] = 0.24 + 0.06 * rnd(); sSize[k] = size * (0.8 + 0.5 * rnd()); sAlive[k] = 1;
    }
    // one small cloud at the contact point: the streaks and the squashed body carry the hit
    puff(x, y, z, 0.2 * size, 0, 0.8, 0, 0.3);
  }

  /** Dizzy stars for bot i this frame (amt 0 hides them). */
  function dizzy(i, x, y, z, amt, clock) {
    if (amt <= 0.02) {
      if (starOn[i]) { starOn[i] = 0; for (let k = 0; k < STARS_PER; k++) stars.setMatrixAt(i * STARS_PER + k, zero); }
      return;
    }
    starOn[i] = 1;
    // big, fast and bright enough to read on a ~40 px Gumble: they pop in oversized and settle
    const sc = Math.min(1.3, amt * 1.8);
    for (let k = 0; k < STARS_PER; k++) {
      const a = clock * 6.5 + (k / STARS_PER) * Math.PI * 2 + i;
      const r = 0.55 * Math.min(1, sc);
      v.set(x + Math.cos(a) * r, y + Math.sin(a * 2 + k) * 0.05, z + Math.sin(a) * r);
      e.set(0, Math.sin(a) * 0.55, clock * 3 + k * 2.1);
      q.setFromEuler(e);
      const ss = sc * (0.9 + 0.2 * Math.sin(clock * 11 + k * 2));
      s.set(ss, ss, ss);
      m4.compose(v, q, s);
      stars.setMatrixAt(i * STARS_PER + k, m4);
    }
  }

  function update(dt) {
    const h = Math.max(0, Math.min(dt, 0.05));
    for (let k = 0; k < PUFFS; k++) {
      if (!pAlive[k]) continue;
      pAge[k] += h;
      const t = pAge[k] / pLife[k];
      if (t >= 1) { pAlive[k] = 0; puffs.setMatrixAt(k, zero); pAlpha.array[k] = 0; continue; }
      const drag = Math.exp(-5.5 * h);
      pV[k * 3] *= drag; pV[k * 3 + 2] *= drag; pV[k * 3 + 1] = pV[k * 3 + 1] * drag + 0.4 * h;
      pP[k * 3] += pV[k * 3] * h; pP[k * 3 + 1] += pV[k * 3 + 1] * h; pP[k * 3 + 2] += pV[k * 3 + 2] * h;
      // pop in fast, keep swelling, dissolve away
      // pop in fast, keep billowing out, then thin away (shrinks a little as it goes)
      const grow = t < 0.14 ? 1 - (1 - t / 0.14) * (1 - t / 0.14) : 1;
      const fade = t > 0.45 ? 1 - (t - 0.45) / 0.55 : 1;
      const r = pSize[k] * grow * (0.8 + 0.7 * Math.min(t, 0.7)) * (0.75 + 0.25 * fade);
      pAlpha.array[k] = fade * fade * (3 - 2 * fade);
      v.set(pP[k * 3], pP[k * 3 + 1], pP[k * 3 + 2]);
      s.set(r * 1.15, r * 0.95, r * 1.15);
      e.set(0, pSpin[k] + t * 0.8, 0);
      q.setFromEuler(e);
      m4.compose(v, q, s);
      puffs.setMatrixAt(k, m4);
    }
    for (let k = 0; k < WAVES; k++) {
      if (!wAlive[k]) continue;
      wAge[k] += h;
      const t = wAge[k] / wLife[k];
      if (t >= 1) { wAlive[k] = 0; waves.setMatrixAt(k, zero); wAlpha.array[k] = 0; continue; }
      const o = 1 - (1 - t) * (1 - t) * (1 - t); // fast snap out, easing to a stop
      const r = wSize[k] * (0.25 + 0.75 * o);
      wAlpha.array[k] = 0.85 * (1 - t) * (1 - t);
      v.set(wP[k * 3], wP[k * 3 + 1], wP[k * 3 + 2]);
      q.identity();
      s.set(r, 1, r);
      m4.compose(v, q, s);
      waves.setMatrixAt(k, m4);
    }
    for (let k = 0; k < STREAKS; k++) {
      if (!sAlive[k]) continue;
      sAge[k] += h;
      const t = sAge[k] / sLife[k];
      if (t >= 1) { sAlive[k] = 0; streaks.setMatrixAt(k, zero); continue; }
      dir.set(sD[k * 3], sD[k * 3 + 1], sD[k * 3 + 2]);
      const start = 0.25 + 1.1 * Math.sqrt(t) * sSize[k];
      v.set(sP[k * 3] + dir.x * start, sP[k * 3 + 1] + dir.y * start, sP[k * 3 + 2] + dir.z * start);
      q.setFromUnitVectors(zAxis, dir);
      const len = sSize[k] * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8) * 1.5;
      const w = sSize[k] * (1 - t * 0.6) * 0.85;
      s.set(w, w, Math.max(0.001, len));
      m4.compose(v, q, s);
      streaks.setMatrixAt(k, m4);
    }
    puffs.instanceMatrix.needsUpdate = true;
    pAlpha.needsUpdate = true;
    waves.instanceMatrix.needsUpdate = true;
    wAlpha.needsUpdate = true;
    streaks.instanceMatrix.needsUpdate = true;
    stars.instanceMatrix.needsUpdate = true;
  }

  return { group, puff, ring, wave, burst, dizzy, update, drawCalls: 4 };
}
