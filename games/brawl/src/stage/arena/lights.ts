// Dry Dock 9: the lights and the environment map.
//
// Warm key from the front, a strong cool rim from behind so the robots pop off the dark set, a
// soft fill, a hemisphere for the night sky, and one shadow light almost straight overhead with a
// tight frustum over the deck so the fighters' feet sit in crisp shadows. The environment map is
// a small night yard rendered in code into a PMREM, so painted metal catches floodlights and sky.

import * as THREE from 'three';
import type { Disposer } from './util.ts';

export interface Lights {
  group: THREE.Group;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  rim2: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  top: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  envRT: THREE.WebGLRenderTarget;
}

export function buildLights(renderer: THREE.WebGLRenderer, d: Disposer): Lights {
  const group = new THREE.Group();
  group.name = 'lights';

  const hemi = new THREE.HemisphereLight('#8aa0bc', '#2a3240', 0.6);
  group.add(hemi);

  // warm key, front left, above
  const key = new THREE.DirectionalLight('#ffd9b0', 2.4);
  key.position.set(-9, 9, 18);
  group.add(key, key.target);

  // strong cool rim from behind (right) and a weaker one from behind left
  const rim = new THREE.DirectionalLight('#8ec8ff', 4.2);
  rim.position.set(9, 4.5, -12);
  group.add(rim, rim.target);
  const rim2 = new THREE.DirectionalLight('#6fb4ff', 2.2);
  rim2.position.set(-10, 3, -10);
  group.add(rim2, rim2.target);

  // fill, front right, low and cool-neutral
  const fill = new THREE.DirectionalLight('#b8cce6', 0.55);
  fill.position.set(10, 2, 14);
  group.add(fill, fill.target);

  // the shadow light: near overhead, a touch from the front so shadows tuck in behind the feet
  // high and to the front left, so a fighter's shadow falls crisp and readable, back and to the right
  const top = new THREE.DirectionalLight('#fff0dc', 1.25);
  top.position.set(-6.5, 20, 8.5);
  top.target.position.set(0, 0, 0);
  top.castShadow = true;
  top.shadow.mapSize.set(2048, 1024);
  const sc = top.shadow.camera as THREE.OrthographicCamera;
  sc.left = -12;
  sc.right = 12;
  sc.top = 7;
  sc.bottom = -7;
  sc.near = 6;
  sc.far = 40;
  sc.updateProjectionMatrix();
  top.shadow.bias = -0.0004;
  top.shadow.normalBias = 0.02;
  top.shadow.radius = 2;
  group.add(top, top.target);

  // a warm pool from the crane floods straight above the deck: brightest mid-deck, softer at the ledges
  const pool = new THREE.SpotLight('#ffe2c0', 2.8, 0, 0.34, 0.85, 0);
  pool.position.set(0, 27, 8);
  pool.target.position.set(0, 0, -0.5);
  group.add(pool, pool.target);

  // ---- environment: a tiny night yard, rendered once into a PMREM ----
  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(50, 32, 16);
  const cols: number[] = [];
  const p = skyGeo.getAttribute('position');
  const cTop = new THREE.Color('#0a1626');
  const cHor = new THREE.Color('#2a5a70');
  const cAmb = new THREE.Color('#8a5a28');
  const cLow = new THREE.Color('#0b131c');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    if (y > 0.06) c.copy(cHor).lerp(cTop, Math.min(1, (y - 0.06) / 0.6));
    else if (y > -0.02) c.copy(cAmb).lerp(cHor, (y + 0.02) / 0.08);
    else c.copy(cLow).lerp(cAmb, Math.max(0, 1 + y * 12));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  // floodlight banks (warm) and work light panels (cool) the metal can catch
  const panelGeo = new THREE.PlaneGeometry(1, 1);
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd7a0').multiplyScalar(6), side: THREE.DoubleSide });
  const cool = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe0ff').multiplyScalar(4), side: THREE.DoubleSide });
  const panels: [THREE.Material, number, number, number, number, number][] = [
    [warm, -30, 22, 25, 10, 4],
    [warm, 32, 20, 20, 9, 4],
    [cool, 25, 14, -35, 14, 5],
    [cool, -28, 12, -30, 10, 4],
    [warm, 0, 40, 10, 22, 6],
  ];
  for (const [mat, x, y, z, w, h] of panels) {
    const m = new THREE.Mesh(panelGeo, mat);
    m.position.set(x, y, z);
    m.scale.set(w, h, 1);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = d.track(pmrem.fromScene(envScene, 0.035));
  pmrem.dispose();
  skyGeo.dispose();
  skyMat.dispose();
  panelGeo.dispose();
  warm.dispose();
  cool.dispose();

  group.traverse((o) => o.layers.enableAll());
  return { group, key, rim, rim2, fill, top, hemi, envRT };
}
