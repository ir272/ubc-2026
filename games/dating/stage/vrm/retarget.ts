// Retargets the Quaternius Universal Animation Library clips (UAL1 and UAL2, Unreal-mannequin
// names, a T-pose rest, a -90 degree X root from a Z-up Blender armature) onto a VRM's normalized
// humanoid bones. Method (as in three-vrm's Mixamo example): for each rotation key,
// q' = parentRestWorld * q * inverse(restWorld) from the source rest pose, which is a rest-relative
// rotation in world axes; the VRM's normalized bones have identity rest frames, so that is their
// local rotation. VRM 0.x models live in a scene rotated 180 degrees, so x and z flip.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export const UAL1 = 'vendor/anim/quaternius-ual1/UAL1_Standard.glb';
export const UAL2 = 'vendor/anim/quaternius-ual2/UAL2_Standard.glb';

/** which file holds which clip (UAL2 names; everything else is UAL1) */
const UAL2_CLIPS = new Set([
  'Chest_Open', 'ClimbUp_1m', 'Consume', 'Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering', 'Hit_Knockback',
  'Idle_FoldArms_Loop', 'Idle_Lantern_Loop', 'Idle_No_Loop', 'Idle_Rail_Call', 'Idle_Rail_Loop', 'Idle_Shield_Break',
  'Idle_Shield_Loop', 'Idle_TalkingPhone_Loop', 'LayToIdle', 'Melee_Hook', 'Melee_Hook_Rec', 'NinjaJump_Idle_Loop',
  'NinjaJump_Land', 'NinjaJump_Start', 'OverhandThrow', 'Shield_Dash', 'Shield_OneShot', 'Slide_Exit', 'Slide_Loop',
  'Slide_Start', 'Sword_Block', 'Sword_Dash', 'Sword_Heavy_Combo', 'Sword_Regular_A', 'Sword_Regular_A_Rec',
  'Sword_Regular_B', 'Sword_Regular_B_Rec', 'Sword_Regular_C', 'Sword_Regular_Combo', 'TreeChopping_Loop',
  'Walk_Carry_Loop', 'Yes', 'Zombie_Idle_Loop', 'Zombie_Scratch', 'Zombie_Walk_Fwd_Loop',
]);

export const SHOW_CLIPS = [
  'Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop',
  'Sitting_Enter', 'Idle_FoldArms_Loop', 'Yes', 'Idle_No_Loop', 'Dance_Loop',
] as const;

/** source bone -> VRM humanoid bone (three-vrm v3 / VRM 1.0 thumb names) */
const BONES: Record<string, VRMHumanBoneName> = (() => {
  const m: Record<string, VRMHumanBoneName> = {
    pelvis: 'hips', spine_01: 'spine', spine_02: 'chest', spine_03: 'upperChest', neck_01: 'neck', Head: 'head',
  };
  for (const [s, side] of [['l', 'left'], ['r', 'right']] as const) {
    const add = (src: string, dst: string) => (m[`${src}_${s}`] = `${side}${dst}` as VRMHumanBoneName);
    add('clavicle', 'Shoulder');
    add('upperarm', 'UpperArm');
    add('lowerarm', 'LowerArm');
    add('hand', 'Hand');
    add('thigh', 'UpperLeg');
    add('calf', 'LowerLeg');
    add('foot', 'Foot');
    add('ball', 'Toes');
    add('thumb_01', 'ThumbMetacarpal');
    add('thumb_02', 'ThumbProximal');
    add('thumb_03', 'ThumbDistal');
    for (const [f, F] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Little']] as const) {
      add(`${f}_01`, `${F}Proximal`);
      add(`${f}_02`, `${F}Intermediate`);
      add(`${f}_03`, `${F}Distal`);
    }
  }
  return m;
})();

/** if a target bone is missing, fold its rotation into this one instead of dropping it */
const FOLD: Partial<Record<VRMHumanBoneName, VRMHumanBoneName>> = { upperChest: 'chest', neck: 'head', leftShoulder: 'leftUpperArm', rightShoulder: 'rightUpperArm' };

type Source = { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; hipsY: number; hipsRest: THREE.Vector3 };

/** parsed source files, shared by every character on the page */
const sources = new Map<string, Promise<Source>>();
/** retargeted clips, per model url + clip name */
const retargeted = new Map<string, THREE.AnimationClip>();

let gltf: GLTFLoader | null = null;

function loadSource(url: string): Promise<Source> {
  let p = sources.get(url);
  if (!p) {
    gltf ??= new GLTFLoader();
    p = gltf.loadAsync(url).then((g) => {
      const scene = g.scene;
      scene.updateMatrixWorld(true);
      // the mannequin mesh is not needed: drop its GPU-side data
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material as THREE.Material;
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      });
      const pelvis = scene.getObjectByName('pelvis')!;
      const hipsRest = pelvis.getWorldPosition(new THREE.Vector3());
      const clips = new Map(g.animations.map((c) => [c.name, c] as const));
      return { scene, clips, hipsY: hipsRest.y, hipsRest };
    });
    sources.set(url, p);
  }
  return p;
}

export function clipFile(name: string) {
  return UAL2_CLIPS.has(name) ? UAL2 : UAL1;
}

/** warm the shared source files (both are ~7 MB) */
export function prefetchClips(assetsBase: string, names: readonly string[] = SHOW_CLIPS) {
  const files = new Set(names.map(clipFile));
  return Promise.all([...files].map((f) => loadSource(assetsBase + f)));
}

/** Retarget one named clip onto a VRM. Cached per model. Returns null if the clip does not exist. */
export async function loadClip(vrm: VRM, modelKey: string, name: string, assetsBase: string): Promise<THREE.AnimationClip | null> {
  const key = `${modelKey}|${name}`;
  const hit = retargeted.get(key);
  if (hit) return hit;
  const src = await loadSource(assetsBase + clipFile(name));
  const clip = src.clips.get(name);
  if (!clip) return null;
  const out = retarget(clip, src, vrm);
  retargeted.set(key, out);
  return out;
}

const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _v = new THREE.Vector3();

function retarget(clip: THREE.AnimationClip, src: Source, vrm: VRM): THREE.AnimationClip {
  const isV0 = vrm.meta?.metaVersion === '0';
  const humanoid = vrm.humanoid;
  const hips = humanoid.getNormalizedBoneNode('hips')!;
  const vrmRest = hips.position.clone(); // normalized hips sit at their rest position in the scene
  const posScale = vrmRest.y / src.hipsY;
  // rotation keys per target bone (before folding)
  const rot = new Map<VRMHumanBoneName, { times: Float32Array; values: Float32Array }>();
  let pos: { times: Float32Array; values: Float32Array } | null = null;

  for (const track of clip.tracks) {
    const [nodeName, prop] = track.name.split('.') as [string, string];
    const bone = BONES[nodeName];
    if (!bone) continue;
    const node = src.scene.getObjectByName(nodeName);
    if (!node || !node.parent) continue;
    if (prop === 'quaternion') {
      const restInv = node.getWorldQuaternion(new THREE.Quaternion()).invert();
      const parentRest = node.parent.getWorldQuaternion(new THREE.Quaternion());
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 4) {
        _q.fromArray(track.values, i).premultiply(parentRest).multiply(restInv);
        if (isV0) { _q.x = -_q.x; _q.z = -_q.z; }
        _q.toArray(values, i);
      }
      rot.set(bone, { times: track.times as Float32Array, values });
    } else if (prop === 'position' && bone === 'hips') {
      const parentWorld = node.parent.matrixWorld;
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 3) {
        // a rest-relative offset, scaled by leg length, added to this body's own rest hips
        _v.fromArray(track.values, i).applyMatrix4(parentWorld).sub(src.hipsRest).multiplyScalar(posScale);
        if (isV0) { _v.x = -_v.x; _v.z = -_v.z; }
        _v.add(vrmRest).toArray(values, i);
      }
      pos = { times: track.times as Float32Array, values };
    }
  }

  // fold rotations of bones this body lacks into the nearest bone it has
  for (const [from, into] of Object.entries(FOLD) as [VRMHumanBoneName, VRMHumanBoneName][]) {
    if (humanoid.getNormalizedBoneNode(from)) continue;
    const a = rot.get(from);
    const b = rot.get(into);
    rot.delete(from);
    if (!a || !b || a.times.length !== b.times.length) continue;
    const fromIsChild = from === 'upperChest';
    for (let i = 0; i < b.values.length; i += 4) {
      // parent rotation first, then child: q = qParent * qChild
      _q.fromArray(fromIsChild ? b.values : a.values, i);
      _qa.fromArray(fromIsChild ? a.values : b.values, i);
      _q.multiply(_qa).toArray(b.values, i);
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, k] of rot) {
    const node = humanoid.getNormalizedBoneNode(bone);
    if (!node) continue; // missing bone (no fingers, no toes): drop
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, k.times, k.values));
  }
  if (pos) tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, pos.times, pos.values));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Ground speed of an in-place walk clip on this body, in model metres per second: the stance
 * foot (the lower one) slides back at the speed the body should move forward.
 */
export function measureWalkSpeed(vrm: VRM, clip: THREE.AnimationClip): number {
  const humanoid = vrm.humanoid;
  const footL = humanoid.getNormalizedBoneNode('leftFoot');
  const footR = humanoid.getNormalizedBoneNode('rightFoot');
  if (!footL || !footR) return 0.8;
  const mixer = new THREE.AnimationMixer(vrm.scene);
  const action = mixer.clipAction(clip);
  action.play();
  const steps = 60;
  const dt = clip.duration / steps;
  const pl = new THREE.Vector3(), pr = new THREE.Vector3();
  let prevL: THREE.Vector3 | null = null, prevR: THREE.Vector3 | null = null;
  let dist = 0;
  const parent = vrm.scene;
  for (let i = 0; i <= steps; i++) {
    mixer.setTime(i * dt);
    parent.updateMatrixWorld(true);
    footL.getWorldPosition(pl);
    footR.getWorldPosition(pr);
    parent.worldToLocal(pl);
    parent.worldToLocal(pr);
    if (prevL && prevR) {
      // forward is +z in the character's frame; scene-local VRM 0.x faces -z
      const sgn = vrm.meta?.metaVersion === '0' ? -1 : 1;
      const stance = pl.y < pr.y ? [pl, prevL] : [pr, prevR];
      const back = -(stance[0]!.z - stance[1]!.z) * sgn;
      if (back > 0) dist += back;
    }
    prevL = pl.clone();
    prevR = pr.clone();
  }
  action.stop();
  mixer.uncacheRoot(vrm.scene);
  humanoid.resetNormalizedPose();
  return Math.max(0.2, dist / clip.duration);
}
