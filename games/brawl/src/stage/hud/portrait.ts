// HUD portrait: a cut-out bust of the actual robot, rendered once from its own 3D model (the same
// fighters/*.ts the stage draws) into a small sRGB render target, read back, and turned into a
// sticker on a 2D canvas: a hard ink outline and a hard offset shadow. So the plate always shows
// the fighter as it looks on the deck, livery and side colour included, and follows the fighter
// builders' changes with no extra work. Falls back to the flat head mark if anything fails.

import * as THREE from 'three';
import type { FighterView, StageCtx } from '../api.ts';
import type { FighterId, Side } from '../../sim/types.ts';
import { createFighter as createKiln } from '../fighters/kiln.ts';
import { createFighter as createTick } from '../fighters/tick.ts';
import { createFighter as createGantry } from '../fighters/gantry.ts';
import { createFighter as createVise } from '../fighters/vise.ts';

const FACTORY = { kiln: createKiln, tick: createTick, gantry: createGantry, vise: createVise } as const;
const INK = '#05090f';

/** render target size (square); the canvas is drawn at the same resolution, shown at half */
const RT = 288;

function srgbToLin(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

function grade(c: number, lum: number): number {
  const sat = lum + (c - lum) * 1.18;
  return Math.max(0, Math.min(255, Math.round((sat - 128) * 1.14 + 124)));
}

/**
 * Draw the bust of `id` into `out` (resized to RT x RT). Returns false if it could not render.
 * `sideColor` tints the robot's side-colour parts and the rim light behind it.
 */
export function renderPortrait(ctx: StageCtx, id: FighterId, side: Side, alt: boolean, out: HTMLCanvasElement): boolean {
  const r = ctx.renderer;
  const sideColor = ctx.sideColors[side];
  let view: FighterView | null = null;
  const scene = new THREE.Scene();
  const rt = new THREE.WebGLRenderTarget(RT, RT, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevRT = r.getRenderTarget();
  const prevClear = new THREE.Color();
  r.getClearColor(prevClear);
  const prevAlpha = r.getClearAlpha();
  try {
    const make = FACTORY[id];
    if (!make) return false;
    // side 0 faces right in the signature pose, so every portrait looks toward its number
    view = make(ctx, { side: 0, sideColor, alt });
    scene.add(view.root);
    view.showPose('select', 0);
    view.root.updateMatrixWorld(true);

    // light: a soft fill, a warm key from the camera side, a cool rim and a side-colour kicker behind
    const hemi = new THREE.HemisphereLight('#fff3e2', '#1c2230', 0.6);
    const key = new THREE.DirectionalLight('#ffffff', 3.6);
    key.position.set(5, 5, 6);
    const rim = new THREE.DirectionalLight('#a9ccff', 4.2);
    rim.position.set(-4, 3, -4);
    const kick = new THREE.DirectionalLight(sideColor, 3.4);
    kick.position.set(5, 1, -3);
    for (const l of [hemi, key, rim, kick]) {
      l.layers.enableAll();
      scene.add(l);
    }

    // frame the bust from the robot's visible bounds: the top 64% of it, a little air above
    const box = new THREE.Box3();
    const mb = new THREE.Box3();
    view.root.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      mb.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      box.union(mb);
    });
    if (box.isEmpty()) return false;
    const H = box.max.y - box.min.y;
    // the head and what rides on it (crest, antennae): every robot is framed head and shoulders,
    // the head about half the frame, so a squat robot and a tall one sit alike on the chip
    const hb = new THREE.Box3();
    const headJ = view.root.getObjectByName('head');
    headJ?.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      mb.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
      hb.union(mb);
    });
    let span = H * 0.66;
    let top = box.max.y + H * 0.05;
    let cx = (box.min.x + box.max.x) / 2;
    if (!hb.isEmpty()) {
      const hh = hb.max.y - hb.min.y;
      const hw = Math.max(hb.max.x - hb.min.x, hb.max.z - hb.min.z);
      // (shoulders or a crest that ride higher than the head stay in the frame too)
      const over = Math.max(0, box.max.y - hb.min.y);
      span = Math.max(H * 0.34, Math.min(H * 0.8, Math.max(hh * 2.0, hw * 2.1, over * 1.55)));
      top = Math.max(hb.max.y, box.max.y) + span * 0.05;
      cx = (hb.min.x + hb.max.x) / 2 + span * 0.04;
    }
    const target = new THREE.Vector3(cx, top - span / 2, (box.min.z + box.max.z) / 2);
    const fov = 22;
    const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 50);
    const dist = (span / 2) / Math.tan(((fov / 2) * Math.PI) / 180);
    const dir = new THREE.Vector3(0.55, 0.12, 1).normalize();
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    cam.layers.enableAll();
    cam.updateMatrixWorld(true);

    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, cam);
    const px = new Uint8Array(RT * RT * 4);
    r.readRenderTargetPixels(rt, 0, 0, RT, RT, px);

    // to straight alpha, rows top-down
    const img = new ImageData(RT, RT);
    const d = img.data;
    for (let y = 0; y < RT; y++) {
      const src = (RT - 1 - y) * RT * 4;
      const dst = y * RT * 4;
      for (let x = 0; x < RT * 4; x += 4) {
        const a = px[src + x + 3];
        if (a === 0) continue;
        let cr = px[src + x];
        let cg = px[src + x + 1];
        let cb = px[src + x + 2];
        if (a < 255) {
          const k = 255 / a;
          cr = linToSrgb(srgbToLin(cr) * k);
          cg = linToSrgb(srgbToLin(cg) * k);
          cb = linToSrgb(srgbToLin(cb) * k);
        }
        // a touch of contrast and colour so the small cut-out holds up against the stage render
        const lum = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
        d[dst + x] = grade(cr, lum);
        d[dst + x + 1] = grade(cg, lum);
        d[dst + x + 2] = grade(cb, lum);
        d[dst + x + 3] = a;
      }
    }
    // anything at all?
    let any = 0;
    for (let i = 3; i < d.length; i += 64) any += d[i];
    if (any < 255 * 20) return false;

    // sticker: silhouette in ink, grown for the outline, plus a hard offset shadow
    const raw = document.createElement('canvas');
    raw.width = RT;
    raw.height = RT;
    raw.getContext('2d')!.putImageData(img, 0, 0);
    const sil = document.createElement('canvas');
    sil.width = RT;
    sil.height = RT;
    const sc = sil.getContext('2d')!;
    sc.drawImage(raw, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = INK;
    sc.fillRect(0, 0, RT, RT);

    out.width = RT;
    out.height = RT;
    const o = out.getContext('2d')!;
    o.clearRect(0, 0, RT, RT);
    // the hard offset shadow (drawn grown, like the outline)
    const grow = 5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      o.drawImage(sil, 9 + Math.cos(a) * grow, 9 + Math.sin(a) * grow);
    }
    // ink outline
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      o.drawImage(sil, Math.cos(a) * grow, Math.sin(a) * grow);
    }
    o.drawImage(raw, 0, 0);
    return true;
  } catch (e) {
    console.warn('hud portrait failed', e);
    return false;
  } finally {
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    if (view) {
      scene.remove(view.root);
      try {
        view.dispose();
      } catch {
        /* the view cleans its own shared caches; nothing else to do */
      }
    }
    rt.dispose();
  }
}

export const PORTRAIT_RT = RT;
