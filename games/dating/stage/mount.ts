// mount(el, { assetsBase }) -> GameHandle. A 16:9 letterboxed stage inside `el`: one WebGL canvas,
// one DOM overlay for text, one rAF loop. No post-processing, no shadow maps.
import * as THREE from 'three';
import { DirectorCamera } from './camera.ts';
import { Captions } from './captions.ts';
import { Cast } from './cast.ts';
import { Director } from './director.ts';
import { Feed } from './feed.ts';
import { buildLights } from './lights.ts';
import { Marks } from './marks.ts';
import { buildSet } from './set.ts';
import { Sound } from './sound.ts';
import { SET, STAGING, type Staging } from './theme.ts';
import { mountHangout } from './hangout/mount.ts';
import { Kit } from './toon.ts';
import { installVrmPerformers } from './vrm/performer.ts';

export interface StageHandle {
  onFeed(msg: unknown): void;
  destroy(): void;
  cameras: string[];
  setCamera(mode: string, entrantId?: string): void;
  highlight(entrantId: string | null): void;
  /** harness extras */
  setMuted(m: boolean): void;
  stats(): { frameMs: number; drawCalls: number; triangles: number };
}

/**
 * `staging` overrides the one switch in stage/theme.ts (the dev harness: ?staging=hangout). The
 * platform passes nothing and gets STAGING.
 */
export function mount(el: HTMLElement, opts: { assetsBase?: string; staging?: Staging } = {}): StageHandle {
  const staging = opts.staging === 'hangout' || opts.staging === 'studio' ? opts.staging : STAGING;
  if (staging === 'hangout') return mountHangout(el, opts);
  let assetsBase = opts.assetsBase ?? '/assets/';
  if (!assetsBase.endsWith('/')) assetsBase += '/';

  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const box = document.createElement('div');
  box.className = 'cm-stage';
  box.style.cssText = 'position:absolute;overflow:hidden;contain:strict;';
  box.style.background = SET.background;
  el.appendChild(box);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  box.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SET.background);
  const kit = new Kit();
  const set = buildSet(kit);
  scene.add(set.group);
  const lights = buildLights(kit, scene);
  installVrmPerformers();
  const cast = new Cast(kit, scene, assetsBase);
  const marks = new Marks(kit, scene);
  const captions = new Captions(box);
  const sound = new Sound(assetsBase);

  let W = 16, H = 9;
  // the camera needs the director's subjects and the director needs the camera: late-bind
  let director!: Director;
  const cam = new DirectorCamera({
    starId: () => director.subjects.starId(),
    face: (id) => director.subjects.face(id),
    yaw: (id) => director.subjects.yaw(id),
    standing: () => director.subjects.standing(),
    partner: (id) => director.subjects.partner(id),
  });
  director = new Director({ cast, cam, set, lights, marks, captions, sound, size: () => ({ w: W, h: H }) });
  const feed = new Feed(director);
  director.attach(feed);
  // dev tools (tools/capture.mjs, framing checks): the scene graph and the director
  if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
    (window as unknown as { __dbg?: unknown }).__dbg = { THREE, scene, renderer, cam, director, cast };
  }

  const fit = () => {
    const cw = el.clientWidth || 16, ch = el.clientHeight || 9;
    let w = cw, h = Math.round((cw * 9) / 16);
    if (h > ch) {
      h = ch;
      w = Math.round((ch * 16) / 9);
    }
    W = w;
    H = h;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    box.style.left = `${Math.round((cw - w) / 2)}px`;
    box.style.top = `${Math.round((ch - h) / 2)}px`;
    renderer.setSize(w, h, false);
    cam.setAspect(w / h);
    captions.resize(w);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(el);

  const clock = new THREE.Clock();
  let raf = 0;
  let dead = false;
  let frameMs = 16.7;
  const frame = () => {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    const t0 = performance.now();
    const dt = Math.min(0.1, clock.getDelta());
    const t = clock.elapsedTime;
    director.update(dt);
    cast.update(dt, t);
    marks.update(dt);
    set.update(dt, t);
    lights.update(dt, t);
    cam.update(dt);
    lights.setCamera(cam.camera.position);
    captions.update(dt);
    renderer.render(scene, cam.camera);
    director.placeTags(cam.camera);
    frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
  };
  raf = requestAnimationFrame(frame);

  return {
    onFeed(msg) {
      if (dead) return;
      try {
        feed.onFeed(msg);
      } catch (e) {
        console.error('[dating stage] feed message failed', e);
      }
    },
    cameras: ['director'],
    setCamera() {
      /* one director camera */
    },
    highlight(id) {
      director.highlight(id);
    },
    setMuted(m) {
      sound.setMuted(m);
    },
    stats() {
      return { frameMs, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    destroy() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      director.destroy();
      sound.destroy();
      set.dispose();
      marks.dispose();
      cast.dispose();
      captions.destroy();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
      kit.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      box.remove();
    },
  };
}
