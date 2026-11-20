// The call (phase 'call', about 10 s, full screen).
//
// Beat 1 (0 to 2.3 s): the show's mark. RINGOUT in heavy italics slams in, the match number lands
// under it.
// Beat 2 (hard cut, to the end): the two minds, one band each in its side colour: the bot's name
// huge, the model label under it (nothing when the label is empty).
// A hazard wipe crosses at the end and clears off the select screen.
// Clean-look pass (Nov 19): the roster beat, the small repeated mark over the bands, the "First
// match" labels, the drifting floor band and the stripes in the wipe are gone; nothing here repeats
// what the next screen shows.
// Owner's rule (Nov 19, 15:12): no record sentence, ever (records live on the site). Do not put it
// back.
// Everything is a function of phaseMs, so a late joiner lands on the right frame.

import * as THREE from 'three';
import type { CreateScreen, Frame, StageCtx, StageModule } from '../api.ts';
import { LAYER } from '../api.ts';
import { FONTS, PALETTE, el } from '../style.ts';
import {
  CutWord, FRAME_MS, clamp01, easeInCubic, easeOutCubic, fade, fitSize, flashFrames, inkOutline, plate, put, seg, shake, shown, slamScale, slideIn, text,
} from './showkit.ts';

// timeline (ms of phase)
const MARK_IN = 170; // the mark lands
const T_NUM = 520; // the match number lands
const T_CUT = 2300; // hard cut to the bands
const T_RED = 2380; // red band slams
const T_BLUE = 2560; // blue band slams
const STING_IN = 240; // the wipe covers the frame at the planned end of the phase...
const STING_OUT = 260; // ...and clears off the select screen over its first frames

// the bands
const BAND_H = 262;
const BAND_Y = [90, 368];

const COVER_VS = `
uniform float uZ;
void main() { gl_Position = vec4(position.xy, uZ, 1.0); }
`;
const COVER_FS = `
uniform vec3 uNavy;
void main() {
  gl_FragColor = vec4(uNavy, 1.0);
  #include <colorspace_fragment>
}
`;

interface Band {
  root: HTMLDivElement;
  hit: HTMLDivElement;
  nameBox: HTMLDivElement;
  name: HTMLDivElement;
  infoBox: HTMLDivElement;
  model: HTMLDivElement;
  key: string;
}

export const createScreen: CreateScreen = (ctx: StageCtx): StageModule => {
  // above the select screen, so the wipe can clear off it
  const layer = el('div', ctx.ui, { position: 'absolute', inset: '0', display: 'none', pointerEvents: 'none', overflow: 'hidden', zIndex: '4' });
  const shakeBox = el('div', layer, { position: 'absolute', inset: '0', willChange: 'transform' });

  // the back: plain navy, drawn in three.js so the set behind is covered
  const uni = { uZ: { value: 0.99 }, uNavy: { value: new THREE.Color(PALETTE.navy) } };
  const coverMat = new THREE.ShaderMaterial({
    vertexShader: COVER_VS, fragmentShader: COVER_FS, uniforms: uni,
    depthTest: true, depthFunc: THREE.LessEqualDepth, depthWrite: false, transparent: true, blending: THREE.NoBlending,
  });
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coverMat);
  cover.frustumCulled = false;
  cover.renderOrder = 100_000;
  cover.layers.set(LAYER.FX);
  cover.visible = false;
  ctx.scene.add(cover);

  // ---- beat 1: the mark, big ----
  const markBox = el('div', shakeBox, { position: 'absolute', left: '0', top: '0', willChange: 'transform, opacity' });
  const mark = new CutWord(markBox, { size: 270, top: PALETTE.hazard, bottom: PALETTE.hazard, skew: -13, drop: 10, gap: 0, rest: 0, letterSpacing: '0.005em' });
  mark.setText('Ringout');
  const numBox = el('div', shakeBox, { position: 'absolute', left: '0', top: '0', display: 'flex', alignItems: 'baseline', gap: '18px', willChange: 'transform, opacity' });
  el('div', numBox, {
    fontFamily: FONTS.display, fontWeight: '800', fontSize: '64px', color: PALETTE.white, transform: 'skewX(-12deg)', textTransform: 'uppercase',
    textShadow: inkOutline(0, 6), letterSpacing: '0.02em',
  }, 'Match');
  const numVal = el('div', numBox, {
    fontFamily: FONTS.display, fontWeight: '900', fontSize: '124px', lineHeight: '0.9', color: PALETTE.hazard, transform: 'skewX(-12deg)', textShadow: inkOutline(0, 8),
  });

  // ---- beat 2: the bands ----
  const bands: Band[] = ([0, 1] as const).map((side) => {
    const left = side === 0;
    const root = el('div', layer, { position: 'absolute', left: '0', top: '0', width: '1280px', height: `${BAND_H}px`, willChange: 'transform' });
    const p = plate(root, { left: left ? -40 : 150, top: 0, width: 1170, height: BAND_H }, ctx.sideColors[side], left ? { right: true } : { left: true }, 9);
    const face = p.face;
    const hit = el('div', face, { position: 'absolute', inset: '0', background: PALETTE.white, opacity: '0' });
    const pad = left ? { left: '100px' } : { right: '100px' };
    const nameBox = el('div', face, { position: 'absolute', top: '16px', ...pad, willChange: 'transform' });
    const name = el('div', nameBox, {
      fontFamily: FONTS.display, fontWeight: '900', fontSize: '178px', lineHeight: '0.92', color: PALETTE.white, textTransform: 'uppercase',
      transform: 'skewX(-12deg)', textShadow: inkOutline(0, 9), whiteSpace: 'nowrap', textAlign: left ? 'left' : 'right',
    });
    const infoBox = el('div', face, {
      position: 'absolute', top: '190px', ...(left ? { left: '92px', flexDirection: 'row' } : { right: '92px', flexDirection: 'row-reverse' }),
      display: 'flex', alignItems: 'center', gap: '20px', willChange: 'transform',
    });
    const model = el('div', infoBox, {
      fontFamily: FONTS.text, fontWeight: '700', fontSize: '30px', lineHeight: '1', color: PALETTE.white, background: PALETTE.ink,
      padding: '9px 26px 11px 18px', clipPath: left ? 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)' : 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)',
      whiteSpace: 'nowrap',
    });
    return { root, hit, nameBox, name, infoBox, model, key: '' };
  });

  // ---- the wipe and the white impact frames ----
  const sting = el('div', layer, {
    position: 'absolute', top: '-100px', left: '0', width: '1760px', height: '920px', background: PALETTE.hazard, willChange: 'transform',
    transform: 'translate3d(-2200px,0,0)',
  });
  const white = el('div', layer, { position: 'absolute', inset: '0', background: PALETTE.white, opacity: '0' });

  function stingX(u: number): number {
    if (u <= 0) return -2200;
    if (u < STING_IN) return -2200 + 2000 * easeInCubic(u / STING_IN);
    return -200 + 1700 * easeOutCubic(clamp01((u - STING_IN) / STING_OUT));
  }

  let markKey = '';
  let markW = 0;
  let markH = 0;
  let numW = 0;

  function layoutText(c: NonNullable<Frame['show']['ctx']>): void {
    const k = `${c.matchNo}`;
    if (k !== markKey) {
      markKey = k;
      text(numVal, String(c.matchNo));
      const m = mark.measure();
      markW = m.w;
      markH = m.h;
      numW = numBox.offsetWidth;
    }
    for (const side of [0, 1] as const) {
      const b = c.bots[side];
      const cn = bands[side];
      const key = `${b.name}|${b.modelLabel}`;
      if (key === cn.key) continue;
      cn.key = key;
      const nm = b.name.toUpperCase();
      const px = fitSize(nm.length, 178, 600, 0.5);
      cn.name.style.fontSize = `${px}px`;
      // no model label: the name sits in the middle of its band, with no hole under it
      cn.nameBox.style.top = b.modelLabel ? '16px' : `${Math.round((BAND_H - px * 0.92) / 2)}px`;
      text(cn.name, nm);
      text(cn.model, b.modelLabel);
      shown(cn.model, !!b.modelLabel);
    }
  }

  return {
    update(frame: Frame) {
      const s = frame.show;
      // the wipe clears off the start of the select screen
      if (s.phase === 'select' && s.phaseMs < STING_OUT) {
        cover.visible = false;
        shown(layer, true);
        shown(shakeBox, false);
        for (const b of bands) shown(b.root, false);
        fade(white, 0);
        put(sting, stingX(STING_IN + s.phaseMs), 0, 1, -18);
        return;
      }
      const on = s.phase === 'call' && !!s.ctx;
      shown(layer, on);
      if (!on) {
        cover.visible = false;
        return;
      }
      const c = s.ctx!;
      layoutText(c);
      const t = s.phaseMs;
      const end = s.phaseDurationMs > 0 ? s.phaseDurationMs : 10_000;
      const tS = end - STING_IN; // the wipe starts
      const covered = t >= tS + STING_IN * 0.8;
      const beat1 = t < T_CUT && !covered;
      const beat2 = !beat1 && !covered;

      // ---- the back ----
      cover.visible = true;
      frame.post.coverSet = true;
      const cam = ctx.camera;
      const d = 8.6;
      uni.uZ.value = (cam.far + cam.near) / (cam.far - cam.near) - (2 * cam.far * cam.near) / ((cam.far - cam.near) * d);

      // ---- beat 1 ----
      shown(shakeBox, beat1);
      if (beat1) {
        const push = 1 + 0.025 * seg(t, MARK_IN, T_CUT);
        put(markBox, 640 - markW / 2, 292 - markH / 2, slamScale(t, MARK_IN, 1.7) * push);
        mark.pose(0, 1);
        const tn = t - T_NUM;
        fade(numBox, tn >= 0 ? 1 : 0);
        put(numBox, 640 - numW / 2 + 10, 452, slamScale(tn, 90, 1.7));
        put(shakeBox, shake(t, MARK_IN, 12, 160) + shake(t, T_NUM + 90, 5, 110), shake(t, MARK_IN + FRAME_MS, 7, 160));
        fade(white, Math.max(flashFrames(t, MARK_IN, 2, 0.9), flashFrames(t, T_NUM + 90, 1, 0.35)));
      } else {
        fade(white, flashFrames(t, T_CUT, 1, 0.6));
      }

      // ---- beat 2: the bands ----
      for (const side of [0, 1] as const) {
        const b = bands[side];
        const vis = beat2 && t >= (side === 0 ? T_RED : T_BLUE);
        shown(b.root, vis);
        if (!vis) continue;
        const dir = side === 0 ? -1 : 1;
        const ts = t - (side === 0 ? T_RED : T_BLUE);
        put(b.root, slideIn(ts, dir * 1400, 120), BAND_Y[side]);
        fade(b.hit, flashFrames(ts, 120, 2, 0.85));
        // a slow drift while it holds, so the frame is never dead
        put(b.nameBox, ts > 400 ? -dir * 18 * seg(t, T_RED + 400, end) : slideIn(ts - 40, dir * 420, 150), 0);
        put(b.infoBox, slideIn(ts - 140, dir * 500, 130), 0);
      }

      // ---- the wipe ----
      put(sting, stingX(t - tS), 0, 1, -18);
    },
    dispose() {
      cover.removeFromParent();
      cover.geometry.dispose();
      coverMat.dispose();
      layer.remove();
    },
  };
};
