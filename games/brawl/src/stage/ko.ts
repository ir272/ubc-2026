// Ringout: the knockout. The biggest moment on screen, in three beats.
//
// 1. The lethal hit (ko/lethal.ts): a welding arc struck in a dark yard. The set drops to near
//    black, the two robots keep their own colours lit by one white-blue arc at the contact, a
//    handful of long speed lines converge on it, the camera punches in, then it lets go.
// 2. The blast (ko/blast.ts, ko/call.ts): crossing a blast line drives one column in the scorer's
//    side colour with a white core into the frame from that edge, slams the camera, washes the
//    picture white for a frame, then the call: RINGOUT, then the two lives numerals, one read at a
//    time. The match-ending knockout holds longer, puts the yard's lights out and calls LIGHTS OUT.
// 3. The replay (ko/replay.ts): two bars (no word) while a knockout replay plays; the
//    lethal treatment and the blast play again inside it at the replay's speed (no second call).
// Also here: the respawn pad (ko/pad.ts), one plate that lowers a robot back in.
//
// Clean pass (2026-11-19): cut the outlines round the robots, the spark shower, the debris (nuts,
// plates, shards), the zigzag bolts, the stair-stepped column bands, the replay afterimages, the
// pad's cables and hook block, the call's plates and slabs. Do not put them back.
//
// Everything is pooled and built once; nothing allocates per frame.

import * as THREE from 'three';
import type { CameraRig, CreateKoFx, Frame, StageCtx, StageModule } from './api.ts';
import { LAYER } from './api.ts';
import type { FightView } from './api.ts';
import type { Side, SimEvent } from '../sim/types.ts';
import { PALETTE } from './style.ts';
import { TriBatch, lockToCamera, toScreen, screenToWorld, clamp01 } from './ko/kit.ts';
import { Sparks } from './ko/sparks.ts';
import { EmberHulls } from './ko/hulls.ts';
import { LethalFx } from './ko/lethal.ts';
import { Blast } from './ko/blast.ts';
import { Call } from './ko/call.ts';
import { ReplayDress } from './ko/replay.ts';
import { RespawnPad } from './ko/pad.ts';

type KoEv = Extract<SimEvent, { t: 'ko' }>;

export const createKoFx: CreateKoFx = (ctx: StageCtx, cam: CameraRig): StageModule => {
  const scene = ctx.scene;

  // screen-space planes locked to the camera: one behind the robots, one over everything
  const behind = new THREE.Group();
  behind.name = 'ko-screen-behind';
  const over = new THREE.Group();
  over.name = 'ko-screen-over';
  // the lethal hold's ground, speed lines and arc: over the hit effects, under the lit figures
  const lines = new TriBatch(64, LAYER.FX, 930, true);
  behind.add(lines.mesh);
  scene.add(behind, over);

  const sparks = new Sparks();
  scene.add(sparks.mesh);
  const hulls = new EmberHulls();
  scene.add(hulls.group);
  const pads = [new RespawnPad(ctx.sideColors[0]), new RespawnPad(ctx.sideColors[1])];
  for (const p of pads) scene.add(p.group);

  // the blast lights the set from the edge it came in at, in the side colour. Built with the module
  // (intensity 0 when idle) so no material ever recompiles for it.
  const blastLight = new THREE.PointLight('#ffffff', 0, 0, 1.1);
  blastLight.layers.enableAll();
  blastLight.name = 'ko-blast-light';
  scene.add(blastLight);
  const lightCol = [new THREE.Color(ctx.sideColors[0]).lerp(new THREE.Color('#ffffff'), 0.25), new THREE.Color(ctx.sideColors[1]).lerp(new THREE.Color('#ffffff'), 0.25)];
  let lightBlast = -1;

  const lethal = new LethalFx(ctx, cam, lines, sparks, hulls);
  const blasts = [new Blast(ctx.sideColors, 880), new Blast(ctx.sideColors, 881)];
  for (const b of blasts) over.add(b.column.mesh);
  let nextBlast = 0;
  const slam = (amount: number, dx: number, dy: number) => cam.shake(amount, dx, dy);
  const call = new Call(ctx.ui, ctx.sideColors);
  const replay = new ReplayDress(ctx.ui);

  const sc = { x: 0, y: 0 };
  const wp = new THREE.Vector3();
  /** knockouts already called, by tick and side, so a replay of one does not call it again */
  const called = new Set<number>();
  let lastMode: FightView['mode'] | null = null;
  // the blast's own picture treatments
  let washAge = 99;
  let washFinal = false;
  let washScale = 1;
  let lightsOut = 0; // seconds left of the final knockout's dark set
  let nowMs = 0;
  let lastBlastAt = -1e9;
  /** a call has been made for the knockout of the current break */
  let breakCalled = false;
  // where each robot was last seen in the live fight (screen px, flight, lives)
  let liveSeen = false;
  const liveSx = [0, 0];
  const liveSy = [0, 0];
  const liveVx = [0, 0];
  const liveVy = [0, 0];
  const liveLives = [0, 0];

  interface BlastAt {
    side: Side;
    by: Side;
    edge: KoEv['edge'];
    /** screen px of the point where the robot left (or was last seen) */
    sx: number;
    sy: number;
    /** flight direction just before the line */
    fx: number;
    fy: number;
    lives: [number, number];
    final: boolean;
    /** the first time viewers see this knockout: the call and the full treatment */
    first: boolean;
  }
  const spec: BlastAt = { side: 0, by: 1, edge: 'left', sx: 0, sy: 0, fx: -1, fy: 0, lives: [0, 0], final: false, first: true };

  function blastAt(p: BlastAt): void {
    let fx = p.fx;
    let fy = p.fy;
    if (Math.hypot(fx, fy) < 1e-4) {
      fx = p.edge === 'left' ? -1 : p.edge === 'right' ? 1 : 0;
      fy = p.edge === 'top' ? 1 : p.edge === 'bottom' ? -1 : 0;
    }
    // edge normal into the frame, and where the column enters
    let nx = 0;
    let ny = 0;
    let ox = 0;
    let oy = 0;
    if (p.edge === 'left') {
      nx = 1;
      ox = -640;
      oy = Math.max(-250, Math.min(250, p.sy));
    } else if (p.edge === 'right') {
      nx = -1;
      ox = 640;
      oy = Math.max(-250, Math.min(250, p.sy));
    } else if (p.edge === 'top') {
      ny = -1;
      oy = 360;
      ox = Math.max(-520, Math.min(520, p.sx));
    } else {
      ny = 1;
      oy = -360;
      ox = Math.max(-520, Math.min(520, p.sx));
    }
    // angle: back along the flight, kept within 38 degrees of the edge normal
    let ux = -fx;
    let uy = -fy;
    const l = Math.hypot(ux, uy) || 1;
    ux /= l;
    uy /= l;
    const dot = ux * nx + uy * ny;
    const maxCos = Math.cos((38 * Math.PI) / 180);
    if (dot < maxCos) {
      // rotate the normal toward the flight line by the max angle, on the flight's side
      const cross = nx * uy - ny * ux;
      const a = ((cross >= 0 ? 1 : -1) * 38 * Math.PI) / 180;
      ux = nx * Math.cos(a) - ny * Math.sin(a);
      uy = nx * Math.sin(a) + ny * Math.cos(a);
    }
    const b = blasts[nextBlast];
    lightBlast = nextBlast;
    nextBlast = (nextBlast + 1) % blasts.length;
    // the light: just inside the frame where the column enters, in front of the deck
    ctx.camera.updateMatrixWorld();
    screenToWorld(ctx.camera, ox + ux * 220, oy + uy * 220, 0, wp);
    blastLight.position.set(wp.x, Math.max(wp.y, 1.5), 4);
    // the column and its light are the scorer's colour
    blastLight.color.copy(lightCol[p.by]);
    b.start({ ox: ox - ux * 30, oy: oy - uy * 30, ux, uy, side: p.by, final: p.final });
    // the slam and the wash
    slam(1, -ux, -uy);
    washAge = 0;
    washFinal = p.final;
    washScale = p.first ? 1 : 0.9;
    lastBlastAt = nowMs;
    if (p.first) {
      call.start({ side: p.side, by: p.by, lives: [p.lives[0], p.lives[1]], final: p.final, from: ux >= 0 ? -1 : 1 });
      if (p.final) lightsOut = 3.4;
    }
  }

  /** the sim's knockout event, live or in a replay */
  function blastFromEvent(ev: KoEv, f: FightView): void {
    const side = ev.side as Side;
    const other = (1 - side) as Side;
    ctx.camera.updateMatrixWorld();
    toScreen(ctx.camera, ev.x, ev.y, 0, sc);
    const pf = f.prev.fighters[side];
    spec.side = side;
    spec.by = ev.by as Side;
    spec.edge = ev.edge;
    spec.sx = sc.x;
    spec.sy = sc.y;
    spec.fx = pf.vx;
    spec.fy = pf.vy;
    spec.lives[side] = Math.max(0, ev.livesLeft);
    spec.lives[other] = f.state.fighters[other].lives;
    spec.final = ev.livesLeft <= 0;
    const key = ev.tick * 2 + side;
    spec.first = !called.has(key) && !breakCalled;
    called.add(key);
    if (spec.first) breakCalled = true;
    blastAt(spec);
  }

  /**
   * The playback cuts to the replay the moment the knockout is announced, before the live picture
   * reaches the blast line. So the blast and the call land on that cut, from where the robot was
   * last seen flying, and the replay plays under them. (If the live picture does reach the line
   * first, the event above has already fired and this does nothing.)
   */
  function blastOnCut(show: Frame['show']): void {
    const ko = show.lastKo;
    if (!ko || !liveSeen || breakCalled || nowMs - lastBlastAt < 2000) return;
    const side = ko.side;
    const other = (1 - side) as Side;
    spec.side = side;
    spec.by = ko.by;
    spec.edge = ko.edge;
    spec.sx = liveSx[side];
    spec.sy = liveSy[side];
    spec.fx = liveVx[side];
    spec.fy = liveVy[side];
    spec.final = ko.final;
    spec.lives[side] = ko.final ? 0 : Math.max(0, liveLives[side] - 1);
    spec.lives[other] = liveLives[other];
    spec.first = true;
    breakCalled = true;
    blastAt(spec);
  }

  function resetAll(): void {
    lethal.cut();
    for (const b of blasts) b.age = 99;
    sparks.clear();
    for (const p of pads) p.reset();
    call.stop();
    washAge = 99;
    lightsOut = 0;
  }

  let lastPhase = '';
  let warmed = false;
  /** the first non-live frame of this break has been looked at */
  let cutChecked = true;
  let lastCallMode: FightView['mode'] | null = null;
  /** compile every knockout shader up front, so the first lethal hit does not stall on it */
  function warm(): void {
    warmed = true;
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const probe = hulls.warmMesh(geo);
    const objs: THREE.Object3D[] = [lines.mesh, sparks.mesh, ...blasts.map((b) => b.column.mesh), ...pads.map((p) => p.group)];
    const vis = objs.map((o) => o.visible);
    for (const o of objs) o.visible = true;
    scene.add(probe);
    const camAll = ctx.camera.clone();
    camAll.layers.enableAll();
    try {
      ctx.renderer.compile(scene, camAll);
    } catch {
      // a failed warm-up only costs a stall later
    }
    scene.remove(probe);
    geo.dispose();
    objs.forEach((o, i) => (o.visible = vis[i]));
  }

  return {
    update(frame: Frame) {
      if (!warmed) warm();
      const phase = frame.show.phase;
      nowMs = frame.now;
      if (phase !== lastPhase) {
        // a new match: forget the old knockouts
        if (phase === 'call' || phase === 'select' || phase === 'idle') called.clear();
        if (phase === 'fight') breakCalled = false;
        if (phase === 'break' && lastPhase === 'fight') cutChecked = false;
        lastPhase = phase;
      }
      // The playback plays the knockout live before it cuts to the replay. If it ever cuts to the
      // replay first (the live picture never reached the line), the blast and call land on that cut.
      if (phase === 'break' && !cutChecked && frame.fight && frame.fight.mode !== 'live') {
        cutChecked = true;
        if (!breakCalled && frame.fight.mode === 'replay') blastOnCut(frame.show);
      }
      const f = frame.fight;
      const inFight = !!f && (phase === 'fight' || phase === 'break' || phase === 'verdict' || phase === 'predictions');
      if (!inFight) {
        if (lastMode !== null) resetAll();
        lastMode = null;
        lines.begin();
        lines.end();
        for (const b of blasts) b.column.mesh.visible = false;
        blastLight.intensity = 0;
        replay.update(frame.dt, false);
        return;
      }
      const fv = f!;
      // a cut between the live fight and a replay ends the hold treatment at once
      if (lastMode !== null && fv.mode !== lastMode) {
        lethal.cut();
        sparks.clear();
      }
      lastMode = fv.mode;
      const replaying = fv.mode === 'replay';
      for (const ev of fv.events) {
        if (ev.t === 'hit' && ev.strength === 'lethal') lethal.start(ev, replaying);
        else if (ev.t === 'ko') blastFromEvent(ev, fv);
      }
      if (fv.mode === 'live' && (phase === 'fight' || phase === 'break')) {
        // remember the live picture: the state, the camera, where the robots are
        ctx.camera.updateMatrixWorld();
        for (let s: Side = 0; s < 2; s = (s + 1) as Side) {
          const st = fv.state.fighters[s];
          if (st.action === 'dead') continue;
          toScreen(ctx.camera, st.x, st.y + 1, 0, sc);
          liveSx[s] = sc.x;
          liveSy[s] = sc.y;
          liveVx[s] = st.vx;
          liveVy[s] = st.vy;
          liveLives[s] = st.lives;
        }
        liveSeen = true;
      }
      // effects run on the replay's clock in a replay, on the show clock otherwise
      const rate = replaying ? Math.max(0.25, fv.speed) : 1;
      const dt = frame.dt * rate;

      lockToCamera(behind, ctx.camera);
      lockToCamera(over, ctx.camera);
      lines.begin();
      lethal.update(frame, rate);
      // the blast and its call run on the show clock even inside a replay: it is the beat viewers wait for
      for (let i = 0; i < blasts.length; i++) {
        const b = blasts[i];
        b.update(frame.dt);
        b.draw();
        // while it holds the set keeps shaking, a kick every few frames
        const bf = b.f;
        if (b.live && bf > 3 && bf < b.hold + 4) {
          const fr = Math.floor(bf);
          if (fr !== Math.floor(bf - frame.dt * 60) && fr % 5 === 0) cam.shake(0.22, 0, 0);
        }
      }
      // the side light: up with the column, held, out as it breaks up
      if (lightBlast >= 0 && blasts[lightBlast].live) {
        const b = blasts[lightBlast];
        const bf = b.f;
        const up = clamp01(bf / 4);
        const down = 1 - clamp01((bf - b.hold) / 12);
        blastLight.intensity = 34 * up * down * (0.9 + 0.1 * Math.sin(bf * 1.7));
      } else blastLight.intensity = 0;
      lines.end();
      sparks.update(dt);

      // the blast's white wash: one bright frame, one half step, then gone (the final holds longer)
      if (washAge < 2) {
        const fr = washAge * 60;
        const w = washFinal ? (fr < 2 ? 0.7 : fr < 3 ? 0.4 : fr < 4 ? 0.2 : 0) : fr < 1 ? 0.55 : fr < 2 ? 0.25 : 0;
        frame.post.flash = Math.max(frame.post.flash, w * washScale);
        washAge += frame.dt;
      }
      // the final knockout puts the yard's lights out behind the call
      if (lightsOut > 0) {
        lightsOut -= frame.dt;
        // the yard drops a little with the blast and goes dark in one step as LIGHTS OUT lands
        const fr = (3.4 - lightsOut) * 60;
        const fw = call.finalWordF;
        const k = Math.max(0.3 * clamp01((fr - 3) / 4), fw >= 4 ? 0.9 : 0) * clamp01(lightsOut / 0.25);
        frame.post.dim = Math.max(frame.post.dim, k);
        frame.post.dimColor = PALETTE.ink;
      }
      // the replay cutting in ends the call on the same hard cut
      if (replaying && lastCallMode !== 'replay') {
        if (call.live) call.stop();
        lightsOut = 0;
      }
      lastCallMode = fv.mode;
      call.update(frame.dt);
      frame.post.flash = Math.max(frame.post.flash, call.landFlash);
      // the verdict is a full cut: no replay bars over it
      replay.update(frame.dt, replaying && !call.live && phase !== 'verdict');
      // the replay grade: the set pulled down toward a cold teal while the bars are up
      const rg = replay.amount;
      if (rg > 0 && frame.post.dim < 0.34 * rg) {
        frame.post.dim = 0.34 * rg;
        frame.post.dimColor = '#08303a';
      }

      const t = frame.now / 1000;
      for (let side: Side = 0; side < 2; side = (side + 1) as Side) pads[side].update(dt, fv.state.fighters[side], fv.prev.fighters[side], fv.alpha, t);
    },
    dispose() {
      for (const b of blasts) b.dispose();
      scene.remove(behind, over, sparks.mesh, hulls.group, blastLight);
      for (const p of pads) {
        scene.remove(p.group);
        p.dispose();
      }
      lines.dispose();
      sparks.dispose();
      hulls.dispose();
      call.dispose();
      replay.dispose();
    },
  };
};
