// Cast lab: every cast VRM in a row on a dark floor, for checking the rig and stills.
// URL params (all optional):
//   only=<id>[,<id>]   just these characters
//   gesture=<name>     every character plays it at 0.5 s (after the held beat)
//   clip=<name>        hold one clip on everyone
//   mood=<name>        neutral | happy | angry | sad | relaxed
//   talk=1             everyone says a line from 0.2 s
//   lit=0 | alt        the cut: everyone dark, or every other one dark
//   sit=1 | 2          sit down at 0.2 s with the enter clip (1) or already seated (2), on a stand-in chair
//   walk=1             walk toward the camera from 0.2 s; walk=side walks left to right
//   look=cam | left | right   look target
//   slump=1            the held slump posture
//   pose=<name>        a held stance (behind | hips | clasp | fold | booth | proud | slouch)
//   idle=<clip>        the standing idle clip
//   t=<s> | peak       render a single still at this simulated time (peak: the gesture's peak)
//   cam=lineup | closeup | wide
//   five=1             a five-character stage (star seated + four suitors) for frame timing
//   live=1             keep animating after t
import * as THREE from 'three';
import { LIGHT, PALETTE } from '../theme.ts';
import { Kit } from '../toon.ts';
import type { VrmManifest } from './loader.ts';
import { GESTURE_DEFS, type GestureName, type MoodName, type PoseName } from './puppet.ts';
import { VrmPerformer } from './performer.ts';
import { prefetchClips } from './retarget.ts';

const ALL = ['brock', 'dash', 'frost', 'maximilian', 'nav', 'pixel', 'prince', 'quill', 'tilly', 'vesper', 'vex'];
const q = new URLSearchParams(location.search);
const seed = Number(q.get('seed') ?? 7);

// deterministic randomness, so stills are reproducible
let s = seed >>> 0;
Math.random = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const five = q.get('five') === '1';
const ids = five ? ['vesper', 'brock', 'frost', 'vex', 'tilly'] : (q.get('only')?.split(',').filter(Boolean) ?? ALL);
const gesture = q.get('gesture') as GestureName | null;
const tParam = q.get('t');
const beat = 0.14;
const gestureAt = 0.5;
const tEnd = tParam === 'peak' && gesture ? gestureAt + beat + GESTURE_DEFS[gesture].peak : tParam ? Number(tParam) : null;
const camMode = q.get('cam') ?? 'lineup';
const live = q.get('live') === '1' || tEnd === null;

const W = window.innerWidth, H = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.night);
const kit = new Kit();

// floor and a back wall, the LOOK palette
const floor = new THREE.Mesh(kit.geo(new THREE.PlaneGeometry(60, 30)), kit.toon(PALETTE.dusk));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const wall = new THREE.Mesh(kit.geo(new THREE.PlaneGeometry(60, 12)), kit.toon(PALETTE.night));
wall.position.set(0, 6, -4);
scene.add(wall);

// lights as the stage has them: house ambient + one warm key
scene.add(new THREE.AmbientLight(LIGHT.ambientColor, LIGHT.houseUp));
const key = new THREE.DirectionalLight(LIGHT.keyColor, LIGHT.key);
key.position.set(-2.5, 7, 8);
scene.add(key);

const spacing = Number(q.get('spacing') ?? 1.2);
const performers: VrmPerformer[] = [];
const tags: HTMLDivElement[] = [];
const homes: THREE.Vector3[] = [];
const poolGeo = kit.geo(new THREE.CircleGeometry(0.62, 40));

type Slot = { id: string; pos: THREE.Vector3; yaw: number; star?: boolean };
const slots: Slot[] = five
  ? [
      { id: 'vesper', pos: new THREE.Vector3(-3.3, 0, -0.6), yaw: 0.95, star: true },
      { id: 'brock', pos: new THREE.Vector3(0.45, 0, -0.15), yaw: -0.42 },
      { id: 'frost', pos: new THREE.Vector3(1.8, 0, -0.55), yaw: -0.34 },
      { id: 'vex', pos: new THREE.Vector3(3.15, 0, -0.75), yaw: -0.28 },
      { id: 'tilly', pos: new THREE.Vector3(4.5, 0, -0.8), yaw: -0.24 },
    ]
  : ids.map((id, i) => ({ id, pos: new THREE.Vector3((i - (ids.length - 1) / 2) * spacing, 0, 0), yaw: Number(q.get('yaw') ?? 0) }));

const chairMat = kit.toon(PALETTE.coral);
async function build() {
  await prefetchClips('/assets/');
  const manifests = await Promise.all(slots.map((sl) => fetch(`/assets/cast/${sl.id}/manifest.json`).then((r) => r.json() as Promise<VrmManifest>)));
  slots.forEach((sl, i) => {
    const m = manifests[i]!;
    const p = new VrmPerformer({ id: sl.id, accent: m.accent }, m, { assetsBase: '/assets/', star: !!sl.star });
    performers.push(p);
    homes.push(sl.pos.clone());
    scene.add(p.root);
    const pool = new THREE.Mesh(poolGeo, kit.glass(PALETTE.tungsten, 0.2));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(sl.pos.x, 0.005, sl.pos.z);
    scene.add(pool);
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = sl.id;
    tag.style.setProperty('--accent', m.accent ?? PALETTE.milk);
    document.body.appendChild(tag);
    tags.push(tag);
    if (q.get('sit') || sl.star) {
      // the stage's lounge chair (stage/set.ts): a cushion drum and a curved back
      const chair = new THREE.Group();
      chair.position.copy(sl.pos);
      chair.rotation.y = sl.yaw;
      const seat = new THREE.Mesh(kit.geo(new THREE.CylinderGeometry(0.58, 0.5, 0.36, 32)), chairMat);
      seat.position.set(0, 0.18, -0.05);
      kit.outline(seat, 0.02);
      const back = new THREE.Mesh(kit.geo(new THREE.CylinderGeometry(0.64, 0.6, 0.78, 32, 1, true, Math.PI / 2 + 0.15, Math.PI - 0.3)), kit.toon(PALETTE.coral, { side: THREE.DoubleSide }));
      back.position.set(0, 0.62, -0.05);
      chair.add(seat, back);
      scene.add(chair);
    }
  });
  await Promise.all(performers.map((p) => p.ready));
  const mood = q.get('mood') as MoodName | null;
  performers.forEach((p, i) => {
    const sl = slots[i]!;
    p.place(sl.pos, sl.yaw, { visible: true, sit: q.get('sit') === '2' || !!sl.star });
    if (mood) p.mood(mood);
    if (q.get('clip')) p.forceClip(q.get('clip'));
    const lit = q.get('lit');
    if (lit === '0' || (lit === 'alt' && i % 2 === 1)) p.setLit(false);
    if (q.get('slump') === '1') p.setPosture('slump');
    if (q.get('pose')) p.setPose(q.get('pose') as PoseName);
    if (q.get('idle')) p.setIdleClip(q.get('idle'));
  });
}

const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 100);
function frameCamera() {
  if (camMode === 'closeup' && performers[0]) {
    const p = performers[0];
    const face = p.faceAnchor(new THREE.Vector3());
    const top = p.headAnchor(new THREE.Vector3());
    const span = Math.min(1.35, Math.max(0.85, top.y * 0.62));
    camera.fov = 30;
    const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const look = new THREE.Vector3(face.x, top.y - span * 0.4, face.z);
    camera.position.set(look.x + dist * 0.15, look.y + 0.1, look.z + dist);
    camera.lookAt(look);
  } else if (camMode === 'side' || camMode === 'three') {
    // a three-quarter (or side) view of the row, to judge depth: sitting, leaning, walking
    const width = Math.max(2.0, slots.length * spacing + 0.1);
    camera.fov = 26;
    const ang = camMode === 'side' ? 1.25 : 0.6;
    const dist = Math.max(4.5, width * 0.9);
    camera.position.set(Math.sin(ang) * dist, 1.3, Math.cos(ang) * dist);
    camera.lookAt(0, 0.8, 0);
  } else if (five || camMode === 'wide') {
    camera.fov = 34;
    camera.position.set(0.6, 2.35, 8.8);
    camera.lookAt(0.6, 1.15, -1.2);
  } else {
    // the Animal Crossing group shot: level, the row filling ~90% of the width
    const width = Math.max(2.0, slots.length * spacing + 0.1);
    camera.fov = 24;
    const aspect = W / H;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const dist = Math.max(width / (2 * Math.tan(vfov / 2) * aspect), 2.5 / (2 * Math.tan(vfov / 2)));
    camera.position.set(0, 1.0 + dist * 0.07, dist);
    camera.lookAt(0, 0.88, 0);
  }
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}

const line = q.get('line') ?? 'Dearest beloved, kindly reply. This is not a scam, only a modest fee.';
let simT = 0;
const events: { at: number; fn: () => void; done?: boolean }[] = [];
function schedule() {
  const lookMode = q.get('look');
  const lookTarget = (i: number) => {
    if (lookMode === 'cam') return camera.position.clone();
    if (lookMode === 'left') return homes[i]!.clone().add(new THREE.Vector3(-3, 1.2, 1));
    if (lookMode === 'right') return homes[i]!.clone().add(new THREE.Vector3(3, 1.2, 1));
    if (!five && !lookMode && camMode !== 'closeup') return camera.position.clone();
    if (five && i > 0) return performers[0]!.faceAnchor(new THREE.Vector3());
    if (five && i === 0) return performers[1]!.faceAnchor(new THREE.Vector3());
    return null;
  };
  events.push({ at: 0.05, fn: () => performers.forEach((p, i) => p.lookAt(lookTarget(i))) });
  if (gesture) events.push({ at: gestureAt, fn: () => performers.forEach((p) => p.gesture(gesture, beat)) });
  if (q.get('talk') === '1' || five) events.push({ at: 0.2, fn: () => performers.forEach((p, i) => (!five || i === 1) && p.speak(4200, line)) });
  if (q.get('sit') === '1') events.push({ at: 0.2, fn: () => performers.forEach((p, i) => p.sit(homes[i], slots[i]!.yaw)) });
  const walk = q.get('walk');
  if (walk) {
    events.push({
      at: 0.2,
      fn: () =>
        performers.forEach((p, i) => {
          const to = homes[i]!;
          const from = walk === 'side' ? to.clone().add(new THREE.Vector3(-2.6, 0, 0)) : to.clone().add(new THREE.Vector3(0, 0, -3.2));
          p.enter(from, to, 0, Number(q.get('walkms') ?? 2600));
        }),
    });
  }
  if (five) {
    // the suitors trade looks and gestures, like a round
    events.push({ at: 2.2, fn: () => performers[0]!.gesture('lean') });
    events.push({ at: 3.0, fn: () => performers[2]!.gesture('shrug') });
    events.push({ at: 3.6, fn: () => performers[3]!.gesture('nod') });
  }
}

function step(dt: number) {
  simT += dt;
  for (const e of events) if (!e.done && simT >= e.at) { e.done = true; e.fn(); }
  for (const p of performers) p.update(dt, simT);
}

const v = new THREE.Vector3();
function placeTags() {
  performers.forEach((p, i) => {
    p.headAnchor(v);
    v.project(camera);
    const tag = tags[i]!;
    tag.style.display = p.visible && v.z < 1 ? '' : 'none';
    tag.style.left = `${((v.x + 1) / 2) * W}px`;
    tag.style.top = `${((1 - v.y) / 2) * H - 2}px`;
  });
}

const hud = document.getElementById('hud')!;
async function main() {
  await build();
  schedule();
  frameCamera();
  const fixed = 1 / 60;
  if (tEnd !== null) {
    while (simT < tEnd - 1e-6) step(Math.min(fixed, tEnd - simT));
  } else step(fixed);
  if (camMode === 'closeup') frameCamera();
  renderer.render(scene, camera);
  placeTags();
  (window as unknown as { __lab: unknown }).__lab = { performers, THREE };
  (window as unknown as { __castReady: boolean }).__castReady = true;
  if (!live) return;
  let last = performance.now();
  const times: number[] = [];
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t0 = performance.now();
    step(dt);
    const t1 = performance.now();
    renderer.render(scene, camera);
    renderer.getContext().finish?.();
    const t2 = performance.now();
    placeTags();
    times.push(t2 - t0);
    if (times.length >= 120) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const upd = t1 - t0;
      (window as unknown as { __perf: unknown }).__perf = { avgFrameMs: avg, lastUpdateMs: upd, n: performers.length };
      hud.textContent = `${performers.length} on stage, frame ${avg.toFixed(2)} ms (update ${upd.toFixed(2)} ms)`;
      times.length = 0;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((e) => {
  hud.textContent = String(e?.stack ?? e);
  console.error(e);
  (window as unknown as { __castError: string }).__castError = String(e?.stack ?? e);
});

(window as unknown as { __cast: unknown }).__cast = { performers, scene, camera, renderer };
