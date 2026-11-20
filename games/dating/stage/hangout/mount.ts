// The hangout staging's mount: the same handle, feed and cast as the studio, drawn as a room
// (stage/LOOK.md "The hangout"). One WebGL canvas, one DOM overlay (bubbles and nameplates), one
// rAF loop, no post-processing, no shadow maps. Chosen by STAGING in stage/theme.ts.
import * as THREE from 'three';
import { Cast } from '../cast.ts';
import { Feed } from '../feed.ts';
import { Marks } from '../marks.ts';
import type { StageHandle } from '../mount.ts';
import { Sound } from '../sound.ts';
import { HANGOUT } from '../theme.ts';
import { Kit } from '../toon.ts';
import { installVrmPerformers } from '../vrm/performer.ts';
import { Bubbles } from './bubbles.ts';
import { HangoutCamera } from './camera.ts';
import { HangoutDirector, STATIONS } from './director.ts';
import { buildRoom } from './room.ts';

export function mountHangout(el: HTMLElement, opts: { assetsBase?: string } = {}): StageHandle {
  let assetsBase = opts.assetsBase ?? '/assets/';
  if (!assetsBase.endsWith('/')) assetsBase += '/';

  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const box = document.createElement('div');
  box.className = 'cm-stage';
  box.style.cssText = 'position:absolute;overflow:hidden;contain:strict;';
  box.style.background = HANGOUT.background;
  el.appendChild(box);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  box.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HANGOUT.background);
  const kit = new Kit();
  const room = buildRoom(kit, scene);
  installVrmPerformers();
  const cast = new Cast(kit, scene, assetsBase);
  const marks = new Marks(kit, scene, { tally: false });
  const sound = new Sound(assetsBase);

  // the camera and the bubbles ask the director about the room: late-bind
  let director!: HangoutDirector;
  const anchor = (id: string, out: THREE.Vector3, kind: 'head' | 'face' | 'feet') => {
    const p = cast.slot(id);
    if (!p || !p.visible) return null;
    if (kind === 'head') return p.headAnchor(out);
    if (kind === 'face') return p.faceAnchor(out);
    return out.copy(p.pos).setY(0);
  };
  const bubbles = new Bubbles(box, {
    anchor: (id, out) => anchor(id, out, 'head'),
    popping: (id) => marks.isPopping(id),
  });
  const cam = new HangoutCamera(
    {
      face: (id, out) => anchor(id, out, 'face'),
      head: (id, out) => anchor(id, out, 'head'),
      feet: (id, out) => anchor(id, out, 'feet'),
      headroom: (id) => bubbles.headroom(id),
    },
    STATIONS.front!,
  );
  director = new HangoutDirector({ cast, cam, room, marks, bubbles, sound, kit, scene });
  const feed = new Feed(director);
  director.attach(feed);
  if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
    (window as unknown as { __dbg?: unknown }).__dbg = { THREE, scene, renderer, cam, director, cast, staging: 'hangout' };
  }

  let W = 16, H = 9;
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
    bubbles.resize(w, h);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(el);
  void W;
  void H;

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
    room.update(dt);
    cam.update(dt);
    director.overlay(dt);
    renderer.render(scene, cam.camera);
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
      /* one camera: the person filming */
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
      room.dispose();
      marks.dispose();
      cast.dispose();
      bubbles.destroy();
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
