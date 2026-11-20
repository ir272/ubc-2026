// The verdict (phase 'verdict', about 20 s, and it holds through the intermission).
//
// 0 ms, hard cut: a white frame, then the winner. The set is gone behind one calm shape: a dark
// field in the winner's side colour, cut on the show's slope, behind the robot. The winner stands
// huge right of centre: the real robot, locked to the camera, in its win pose. On the left, in
// reading order: the bot's name, WINS under it, the model label small.
// 1.5 s, the payout beat, drawn without money: the robot stops dead (a held frame), then a hit
// (white frames, a jolt) and PAID slams across the top on the hazard band that opened predictions.
// After that the next match counts down under the name, as a clock only.
// Clean-look pass (Nov 19): the ray burst, the results cut, the stats strip, the lower third with
// the fighter line and the lives, the slash through the letters and the plates under the name
// are gone; nothing is drawn over the robot.
// Owner's rule (Nov 19, 15:12): no "Next match in" sentence (the clock alone), nothing when the
// model label is empty. PAID stays as the one word: without it the payout beat is a freeze and a
// flash that says nothing, and the show must make it obvious that bets are paid.

import * as THREE from 'three';
import type { CreateScreen, Frame, StageCtx, StageModule } from '../api.ts';
import { LAYER } from '../api.ts';
import type { FighterId, Side } from '../../sim/types.ts';
import { FONTS, PALETTE, clockText, el } from '../style.ts';
import { CamSpace, CutWord, FRAME_MS, HeroRobot, easeOutCubic, fade, flashFrames, inkOutline, plate, put, seg, shake, shown, slamScale, slideIn, text } from './showkit.ts';

const NAME_IN = FRAME_MS; // the name arrives one frame after the cut
const WINS_IN = 220;
const FREEZE = 1500; // the payout beat: everything holds
const HIT = 1950; // and the hit
const PAID_OUT = 3400; // the word leaves
const NEXT_IN = 3600; // the next match's clock
const KO_CALL_MS = 2500; // how long the knockout module's final call holds
const DEPTH = 7; // the hero robot's distance in front of the camera (m)

// layout: the hero's box (its win pose, arms and all); the type on the left
const HERO_X = 860;
const HERO_TOP = 168;
const HERO_BOT = 708;
const TYPE_X = 64;
/** the side-colour field's left edge at the top and the bottom of the frame (UI px) */
const FIELD_TOP = 640;
const FIELD_BOT = 470;

const FIELD_VS = `
uniform float uZ;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, uZ, 1.0); }
`;
const FIELD_FS = `
uniform vec3 uNavy;
uniform vec3 uField;
uniform vec2 uEdge;
varying vec2 vUv;
void main() {
  float edge = mix(uEdge.y, uEdge.x, vUv.y);
  vec3 c = vUv.x > edge ? uField : uNavy;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export const createScreen: CreateScreen = (ctx: StageCtx): StageModule => {
  // above the knockout module's replay dressing: the verdict is a full cut
  const layer = el('div', ctx.ui, { position: 'absolute', inset: '0', display: 'none', pointerEvents: 'none', overflow: 'hidden', zIndex: '5' });

  // ---- the field: drawn last in the FX pass at a depth just behind the hero robot, so it covers the
  // set, the fight robots and any effects still flying, but not the hero (which is nearer) ----
  const uni = {
    uZ: { value: 0.99 },
    uNavy: { value: new THREE.Color(PALETTE.navy) },
    uField: { value: new THREE.Color(PALETTE.red) },
    uEdge: { value: new THREE.Vector2(FIELD_TOP / 1280, FIELD_BOT / 1280) },
  };
  const fieldMat = new THREE.ShaderMaterial({
    vertexShader: FIELD_VS, fragmentShader: FIELD_FS, uniforms: uni,
    depthTest: true, depthFunc: THREE.LessEqualDepth, depthWrite: false, transparent: true, blending: THREE.NoBlending,
  });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fieldMat);
  field.frustumCulled = false;
  field.renderOrder = 100_000;
  field.layers.set(LAYER.FX);
  field.visible = false;
  ctx.scene.add(field);
  let fieldSide = -1;

  // ---- the hero robot ----
  const space = new CamSpace(ctx, DEPTH);
  let hero: HeroRobot | null = null;
  let heroKey = '';

  // ---- the call: NAME, then WINS, then the model label ----
  const callBox = el('div', layer, { position: 'absolute', left: '0', top: '0', width: '1280px', height: '720px', willChange: 'transform' });
  const nameBox = el('div', callBox, { position: 'absolute', left: '0', top: '0', willChange: 'transform', transformOrigin: '0 100%' });
  const name = new CutWord(nameBox, { size: 170, top: PALETTE.white, bottom: PALETTE.white, skew: -13, outline: 6, drop: 10, gap: 0, rest: 0, letterSpacing: '0.005em' });
  const winsBox = el('div', callBox, { position: 'absolute', left: '0', top: '0', willChange: 'transform', transformOrigin: '0 0' });
  const wins = new CutWord(winsBox, { size: 120, top: PALETTE.hazard, bottom: PALETTE.hazard, skew: -13, outline: 6, drop: 8, gap: 0, rest: 0, letterSpacing: '0.03em' });
  wins.setText('Wins');
  const model = el('div', callBox, {
    position: 'absolute', left: `${TYPE_X + 6}px`, top: '0', fontFamily: FONTS.text, fontWeight: '700', fontSize: '28px', lineHeight: '32px',
    color: PALETTE.white, textShadow: `2px 2px 0 ${PALETTE.ink}`, whiteSpace: 'nowrap', willChange: 'transform',
  });
  let nameKey = '';
  let nameM = { w: 0, h: 0 };
  let nameK = 1;
  let winsM = { w: 0, h: 0 };

  // ---- the payout beat: one word on the band that opened predictions ----
  const paidRoot = el('div', layer, { position: 'absolute', left: '0', top: '0', width: '1280px', height: '720px', willChange: 'transform' });
  const paidBand = plate(paidRoot, { left: -60, top: 34, width: 1400, height: 118 }, PALETTE.hazard, { left: true, right: true }, 9);
  const paidBox = el('div', paidRoot, { position: 'absolute', left: '0', top: '0', willChange: 'transform' });
  const paid = new CutWord(paidBox, { size: 118, top: PALETTE.navy, bottom: PALETTE.navy, skew: -13, gap: 0, rest: 0, letterSpacing: '0.04em' });
  paid.setText('Paid');
  let paidM = { w: 0, h: 0 };

  // ---- the next match: its clock, nothing else ----
  const nextRow = el('div', layer, {
    position: 'absolute', left: `${TYPE_X + 6}px`, top: '0', willChange: 'transform',
  });
  const nextT = el('div', nextRow, {
    fontFamily: FONTS.display, fontWeight: '900', fontSize: '56px', lineHeight: '1', color: PALETTE.hazard, transform: 'skewX(-12deg)',
    fontVariantNumeric: 'tabular-nums', textShadow: inkOutline(0, 4),
  });

  let lastFinalKo = -1e9;

  function ensureHero(fid: FighterId, w: Side, alt: boolean): void {
    const k = `${fid}|${w}|${alt}`;
    if (k === heroKey && hero) return;
    hero?.dispose();
    heroKey = k;
    try {
      hero = new HeroRobot(ctx, space.px, fid, w, alt, LAYER.FX);
    } catch {
      hero = null;
    }
  }

  function hide(): void {
    field.visible = false;
    space.root.visible = false;
  }

  return {
    update(frame: Frame) {
      const s = frame.show;
      const f = frame.fight;
      // remember when the match-ending knockout was last seen live (its own call plays then)
      if (f && f.mode !== 'replay') for (const ev of f.events) if (ev.t === 'ko' && ev.livesLeft <= 0) lastFinalKo = frame.now;
      const on = s.phase === 'verdict' && !!s.ctx && !!s.result;
      shown(layer, on);
      if (!on) {
        hide();
        return;
      }
      const c = s.ctx!;
      const r = s.result!;
      const w = r.winner as Side;
      // if the final knockout's own call is still playing as the verdict opens (the playback catches
      // up to the last tick here), let it finish, then start the winner call
      const vStart = frame.now - s.phaseMs;
      const koRel = lastFinalKo - vStart;
      const wait = koRel > -KO_CALL_MS && koRel < 1500 ? Math.max(0, koRel + KO_CALL_MS) : 0;
      const t = s.phaseMs - wait;
      const col = ctx.sideColors[w];

      const fid = (c.picks?.[w] ?? f?.state.fighters[w].fighter) as FighterId | undefined;
      const nk = `${c.bots[w].name}|${w}|${fid}`;
      if (nk !== nameKey) {
        nameKey = nk;
        name.setText(c.bots[w].name);
        nameM = name.measure();
        nameK = Math.min(1, 560 / nameM.w);
        winsM = wins.measure();
        paidM = paid.measure();
        text(model, c.bots[w].modelLabel);
        shown(model, !!c.bots[w].modelLabel);
      }

      const on3d = t >= 0;
      field.visible = on3d;
      space.root.visible = on3d;
      if (on3d) {
        // the field covers the whole frame: the set behind it need not draw (and nothing of it can
        // poke through in front of the field)
        frame.post.coverSet = true;
        if (fieldSide !== w) {
          fieldSide = w;
          uni.uField.value.set(col).multiplyScalar(0.62);
        }
        if (fid) ensureHero(fid, w, w === 1 && c.picks?.[0] === c.picks?.[1]);
        space.sync();
        // NDC depth of a point just behind the hero
        const cam = ctx.camera;
        const d = DEPTH + 1.6;
        uni.uZ.value = (cam.far + cam.near) / (cam.far - cam.near) - (2 * cam.far * cam.near) / ((cam.far - cam.near) * d);
        if (hero) {
          // the pose holds still through the payout beat
          const pt = (t < FREEZE ? t : t < HIT ? FREEZE : FREEZE + (t - HIT)) / 1000;
          hero.face(-1);
          hero.view.showPose('win', pt);
          const k = (1 + 0.035 * easeOutCubic(seg(t, 0, FREEZE))) * slamScale(t, 60, 1.1);
          hero.fit('win', 1.2, HERO_X + shake(t, HIT, 14, 220), HERO_BOT - (HERO_BOT - HERO_TOP) * k, HERO_BOT, 0.5);
        }
      }
      frame.post.flash = Math.max(frame.post.flash, flashFrames(t, 0, 2, 1), flashFrames(t, HIT, 2, 0.9));
      shown(callBox, t >= NAME_IN);

      // ---- the call: NAME, WINS under it, the model label ----
      put(callBox, shake(t, HIT, 16, 220), shake(t, HIT + FRAME_MS, 8, 200));
      const nameH = nameM.h * nameK;
      const nameTop = 190;
      put(nameBox, TYPE_X + shake(t, NAME_IN + 70, 10, 150), nameTop, slamScale(t - NAME_IN, 70, 1.6) * nameK);
      name.pose(0, 1);
      const winsTop = nameTop + nameH - 8;
      put(winsBox, TYPE_X + 10 + shake(t, WINS_IN + 60, 7, 130), winsTop, slamScale(t - WINS_IN, 60, 1.8));
      wins.pose(0, t >= WINS_IN ? 1 : 0);
      const modelTop = winsTop + winsM.h + 6;
      const hasModel = !!c.bots[w].modelLabel;
      put(model, slideIn(t - WINS_IN - 120, -300, 120), modelTop);
      fade(model, t >= WINS_IN + 120 ? 1 : 0);

      // ---- the payout beat ----
      const pt = t - HIT;
      const paidOn = pt >= 0 && t < PAID_OUT;
      shown(paidRoot, paidOn);
      if (paidOn) {
        const out = seg(t, PAID_OUT - 4 * FRAME_MS, PAID_OUT);
        put(paidBand.root, slideIn(pt, -1500, 70) + out * 1500, shake(pt, 70, 6, 140));
        put(paidBox, 640 - paidM.w / 2 + shake(pt, 100, 8, 150), 93 - paidM.h / 2, slamScale(pt - 30, 70, 1.8));
        paid.pose(0, 1 - out);
      }

      // ---- the next match ----
      const na = t - NEXT_IN;
      shown(nextRow, na >= 0);
      if (na >= 0) {
        put(nextRow, slideIn(na, -400, 110), hasModel ? modelTop + 60 : modelTop + 10);
        text(nextT, clockText(Math.max(0, r.nextInMs - s.phaseMs)));
      }
    },
    dispose() {
      hero?.dispose();
      space.dispose();
      field.removeFromParent();
      field.geometry.dispose();
      fieldMat.dispose();
      layer.remove();
    },
  };
};
