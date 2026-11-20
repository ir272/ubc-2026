// The stage: the three.js renderer, the 16:9 letterboxed viewport, the UI overlay, the show clock,
// the feed reducer, the fight playback, the modules and the frame loop.
//
// Each frame: clock -> reduce (ShowState at now) -> playback (FightView) -> fighters posed ->
// every module's update(frame) -> render. Modules never read the feed or the wall clock.
//
// Which modules show in which phase is up to each module (they all get every frame): the call,
// select and versus screens cover the arena with their own DOM; predictions, fight, break and
// verdict show the arena with the two fighters. The stage itself hides the fighters during
// call / select / versus. A screen builder who wants 3D robots on those screens creates its own
// fighter views from fighters/*.ts with the StageCtx it is given.
//
// post.coverSet: a screen that fully covers the arena sets it true in update(). That frame the
// stage hides what the arena, hitfx, ko and hud modules and the two fight robots put in the scene
// (it notes who added each top-level scene object, at creation and after every update) and skips
// the shadow pass, the background and the dim quad. Lights stay on (the call and verdict robots
// use the arena's lights), and everything the screens added still draws, on whatever layer.

import * as THREE from 'three';
import { ARENA, FIGHTERS } from '../sim/index.ts';
import type { FighterId, FighterState, Side, MoveId, Action } from '../sim/types.ts';
import { MOVE_IDS } from '../sim/types.ts';
import type { AudioRig, CameraRig, FightView, FighterView, Frame, PostState, ShowState, StageCtx, StageModule } from './api.ts';
import { LAYER } from './api.ts';
import { initialReduced, reduce, showStateAt, type Reduced } from '../show/reduce.ts';
import { Playback } from '../show/playback.ts';
import { ShowClock, type TimeSource } from './clock.ts';
import { FONTS, PALETTE, SIDE_COLORS, UI_H, UI_W, el } from './style.ts';
import { createArena } from './arena.ts';
import { createCamera } from './camera.ts';
import { createHitFx } from './hitfx.ts';
import { createKoFx } from './ko.ts';
import { createHud } from './hud.ts';
import { createAudio } from './audio.ts';
import { createScreen as createCallScreen } from './screens/call.ts';
import { createScreen as createSelectScreen } from './screens/select.ts';
import { createScreen as createVersusScreen } from './screens/versus.ts';
import { createScreen as createPredictionsScreen } from './screens/predictions.ts';
import { createScreen as createBreakScreen } from './screens/break.ts';
import { createScreen as createVerdictScreen } from './screens/verdict.ts';
import { createFighter as createKiln } from './fighters/kiln.ts';
import { createFighter as createTick } from './fighters/tick.ts';
import { createFighter as createGantry } from './fighters/gantry.ts';
import { createFighter as createVise } from './fighters/vise.ts';

export const FIGHTER_FACTORIES = {
  kiln: createKiln,
  tick: createTick,
  gantry: createGantry,
  vise: createVise,
} as const;

export interface StageOptions {
  assetsBase: string;
  /** capture mode: no animation loop; time comes from `time` and frames run only through frame() */
  capture?: { time: TimeSource };
}

export interface StageInfo {
  phase: string;
  showMs: number;
  phaseMs: number;
  tick: number | null;
  mode: string | null;
  fighters: { fighter: FighterId; action: Action; move: MoveId | null; damage: number; lives: number; x: number; y: number }[];
  fps: number;
  frameMs: number;
  mismatches: number;
  matches: number;
  plans: (string | null)[];
  /** the last 5 sim events handed to the modules, newest last: "tick mode type details" */
  events: string[];
  /** playback is holding on a lethal hit */
  holding: boolean;
  /** the tick of the last knockout (life_lost), if any */
  koTick: number | null;
  /** a module set post.coverSet on the last frame */
  covered: boolean;
}

export interface Stage {
  onFeed(msg: unknown): void;
  setCamera(mode: string, side?: Side): void;
  highlight(entrantId: string | null): void;
  setMuted(muted: boolean): void;
  /** master volume 0 to 1 for everything the game plays (0 = muted). Remembered and applied again
   *  whenever the rig unlocks, so it holds whatever order the site calls things in. */
  setVolume(v: number): void;
  /** the viewer has clicked or pressed a key somewhere on the page: create or resume the audio now */
  unlock(): void;
  /** run one frame: dt seconds of show clock since the last one; render unless told not to */
  frame(dt: number, render?: boolean): void;
  /** draw the current frame again without advancing anything (capture) */
  render(): void;
  info(): StageInfo;
  /** capture: lay one fighter out as a pose sheet (the `moves` scene). null returns to the show.
   *  `part` (1-based) of `parts` splits a long sheet into pages */
  poseSheet(fighter: FighterId | null, move?: string, page?: { part: number; parts: number }): void;
  /** the reduced feed (for the harness) */
  readonly reduced: Reduced;
  destroy(): void;
}

export function createStage(el0: HTMLElement, opts: StageOptions): Stage {
  const capture = !!opts.capture;
  const clock: TimeSource = opts.capture ? opts.capture.time : new ShowClock();
  const showClock = clock instanceof ShowClock ? clock : null;

  // ---- DOM: a wrapper that fills el, a 16:9 box centred in it, the canvas and the UI overlay ----
  const wrap = el('div', el0, { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' });
  const box = el('div', wrap, { position: 'absolute', overflow: 'hidden', background: PALETTE.navy });
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: capture, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block' });
  box.appendChild(canvas);
  const ui = el('div', box, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${UI_W}px`,
    height: `${UI_H}px`,
    transformOrigin: '0 0',
    pointerEvents: 'none',
    overflow: 'hidden',
    fontFamily: FONTS.text,
    color: PALETTE.white,
    userSelect: 'none',
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 700);
  const ctx: StageCtx = {
    scene,
    camera,
    renderer,
    ui,
    assetsBase: opts.assetsBase,
    arena: ARENA,
    fighterDefs: FIGHTERS,
    sideColors: [SIDE_COLORS[0], SIDE_COLORS[1]],
    fighters: [null, null],
  };

  // who put each top-level scene object there (for post.coverSet)
  const owner = new WeakMap<THREE.Object3D, string>();
  function claim(tag: string): void {
    for (const o of scene.children) if (!owner.has(o)) owner.set(o, tag);
  }
  claim('stage');

  // ---- modules (order = update order) ----
  const made = <T,>(tag: string, m: T): T => {
    claim(tag);
    return m;
  };
  const arena = made('arena', createArena(ctx));
  const cam: CameraRig = made('camera', createCamera(ctx));
  const hitfx = made('hitfx', createHitFx(ctx, cam));
  const ko = made('ko', createKoFx(ctx, cam));
  const hud = made('hud', createHud(ctx));
  const screens: StageModule[] = [
    made('screen', createCallScreen(ctx)),
    made('screen', createSelectScreen(ctx)),
    made('screen', createVersusScreen(ctx)),
    made('screen', createPredictionsScreen(ctx)),
    made('screen', createBreakScreen(ctx)),
    made('screen', createVerdictScreen(ctx)),
  ];
  const audio: AudioRig = made('audio', createAudio(ctx));
  const modules: StageModule[] = [arena, cam, hitfx, ko, hud, ...screens, audio];
  const moduleTags: string[] = ['arena', 'camera', 'hitfx', 'ko', 'hud', ...screens.map(() => 'screen'), 'audio'];
  const moduleErrors: number[] = [];
  /** what a covering screen hides */
  const COVER_HIDES = new Set(['arena', 'hitfx', 'ko', 'hud', 'fighters']);
  // Sound. The site owns the volume (setVolume) and tells us when the page has had a gesture
  // (unlock). A click or key on the stage itself also unlocks, as a fallback only: the stage never
  // waits for it and draws no sound button and no hint.
  let volume: number | null = null;
  function applyVolume(): void {
    if (volume === null) return;
    try {
      if (typeof audio.setVolume === 'function') audio.setVolume(volume);
      else audio.setMuted(volume === 0);
    } catch (e) {
      console.warn('[ringout stage] setVolume', e);
    }
  }
  function unlockAudio(): void {
    try {
      audio.unlock();
    } catch (e) {
      console.warn('[ringout stage] unlock', e);
    }
    applyVolume();
  }
  const onGesture = () => unlockAudio();
  el0.addEventListener('pointerdown', onGesture);
  el0.addEventListener('keydown', onGesture);

  // ---- fighters: created when picks are known, recreated when they change ----
  let views: [FighterView, FighterView] | null = null;
  let viewKey = '';
  function ensureViews(picks: [FighterId, FighterId] | undefined): void {
    const key = picks ? picks.join() : '';
    if (key === viewKey) return;
    if (views) for (const v of views) v.dispose();
    views = null;
    ctx.fighters[0] = null;
    ctx.fighters[1] = null;
    viewKey = key;
    if (!picks) return;
    views = ([0, 1] as Side[]).map((side) => {
      const v = FIGHTER_FACTORIES[picks[side]](ctx, { side, sideColor: ctx.sideColors[side], alt: side === 1 && picks[0] === picks[1] });
      scene.add(v.root);
      owner.set(v.root, 'fighters');
      return v;
    }) as [FighterView, FighterView];
    claim('fighters');
    ctx.fighters[0] = views[0];
    ctx.fighters[1] = views[1];
  }

  // ---- feed ----
  const r = initialReduced();
  const playback = new Playback();
  playback.onLog = (line) => console.warn('[ringout playback]', line);

  function onFeed(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as { type?: string; t?: number; serverNow?: number };
    if (showClock) {
      if (m.type === 'snapshot' && typeof m.serverNow === 'number') showClock.sample(m.serverNow);
      else showClock.sample(m.t);
    }
    reduce(r, msg);
    playback.onFeed(msg);
  }

  // ---- size ----
  let W = UI_W;
  let H = UI_H;
  function layout(): void {
    const rw = wrap.clientWidth || el0.clientWidth || UI_W;
    const rh = wrap.clientHeight || el0.clientHeight || UI_H;
    let w = rw;
    let h = Math.round((rw * 9) / 16);
    if (h > rh) {
      h = rh;
      w = Math.round((rh * 16) / 9);
    }
    w = Math.max(16, w);
    h = Math.max(9, h);
    Object.assign(box.style, { width: `${w}px`, height: `${h}px`, left: `${Math.floor((rw - w) / 2)}px`, top: `${Math.floor((rh - h) / 2)}px` });
    ui.style.transform = `scale(${w / UI_W})`;
    if (w !== W || h !== H) {
      W = w;
      H = h;
      renderer.setSize(w, h, false);
      camera.aspect = 16 / 9;
      camera.updateProjectionMatrix();
      for (const m of modules) m.resize?.(w, h);
    }
  }
  W = 0;
  layout();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layout()) : null;
  ro?.observe(wrap);

  // ---- picture passes: SET, dim quad, FIGHTER (depth kept), FX, flash quad ----
  const post: PostState = { dim: 0, dimColor: '#000000', flash: 0, fighterFlash: [0, 0], fighterFlashColor: ['#ffffff', '#ffffff'], coverSet: false };
  function zeroPost(): void {
    post.coverSet = false;
    post.dim = 0;
    post.dimColor = '#000000';
    post.flash = 0;
    post.fighterFlash[0] = 0;
    post.fighterFlash[1] = 0;
    post.fighterFlashColor[0] = '#ffffff';
    post.fighterFlashColor[1] = '#ffffff';
  }
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const dimMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const flashMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const dimQuad = new THREE.Mesh(quadGeo, dimMat);
  const flashQuad = new THREE.Mesh(quadGeo, flashMat);
  quadScene.add(dimQuad, flashQuad);
  // shadows are drawn once per frame with every layer visible (three culls shadow casters by the
  // main camera's layers), into a 1x1 target so nothing else is paid for
  const shadowRT = new THREE.WebGLRenderTarget(1, 1);
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;

  function drawQuad(q: THREE.Mesh): void {
    dimQuad.visible = q === dimQuad;
    flashQuad.visible = q === flashQuad;
    renderer.render(quadScene, quadCam);
  }

  /** hide a subtree except its lights (and the groups that lead to them); remembers what it hid */
  const hidden: THREE.Object3D[] = [];
  const hasLight = (o: THREE.Object3D): boolean => {
    if ((o as THREE.Light).isLight) return true;
    for (const c of o.children) if (hasLight(c)) return true;
    return false;
  };
  function hideKeepLights(o: THREE.Object3D): void {
    if (!o.visible || (o as THREE.Light).isLight) return;
    if (!hasLight(o)) {
      o.visible = false;
      hidden.push(o);
      return;
    }
    for (const c of o.children) hideKeepLights(c);
  }

  function renderPasses(cam: THREE.Camera): void {
    const bg = scene.background;
    const covered = post.coverSet;
    if (covered) {
      for (const o of scene.children) {
        const tag = owner.get(o);
        if (tag && COVER_HIDES.has(tag)) hideKeepLights(o);
      }
    } else {
      // shadow maps, every layer
      cam.layers.enableAll();
      renderer.shadowMap.needsUpdate = true;
      renderer.setRenderTarget(shadowRT);
      renderer.render(scene, cam);
      renderer.setRenderTarget(null);
      renderer.shadowMap.needsUpdate = false;
    }
    renderer.clear(true, true, true);
    // the set (a covered frame: only what the screens put on this layer)
    if (covered) scene.background = null;
    cam.layers.set(LAYER.SET);
    renderer.render(scene, cam);
    scene.background = null; // later passes must not paint the background again
    if (post.dim > 0 && !covered) {
      dimMat.color.set(post.dimColor);
      dimMat.opacity = Math.min(1, post.dim);
      drawQuad(dimQuad);
    }
    cam.layers.set(LAYER.FIGHTER);
    renderer.render(scene, cam);
    cam.layers.set(LAYER.FX);
    renderer.render(scene, cam);
    scene.background = bg;
    if (post.flash > 0) {
      flashMat.opacity = Math.min(1, post.flash);
      drawQuad(flashQuad);
    }
    cam.layers.enableAll();
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
  }

  function applyFighterFlash(): void {
    if (!views) return;
    for (const side of [0, 1] as Side[]) views[side].setFlash(post.fighterFlash[side], post.fighterFlashColor[side]);
  }

  function renderNow(): void {
    if (sheet) {
      renderer.clear(true, true, true);
      sheet.cam.layers.enableAll();
      renderer.render(scene, sheet.cam);
      return;
    }
    applyFighterFlash();
    renderPasses(camera);
  }

  // ---- per-frame state ----
  let lastPhase = '';
  let phaseT0 = 0;
  const lastPlanKey: [string, string] = ['', ''];
  const planChangedAt: [number, number] = [-1, -1];
  let fpsEma = 60;
  let frameMsEma = 0;
  let lastShow: ShowState | null = null;
  let lastFight: FightView | null = null;
  let lastNow = 0;
  /** the last sim events handed to the modules (info) */
  const recentEvents: string[] = [];
  function noteEvents(fight: FightView | null): void {
    if (!fight) return;
    for (const ev of fight.events) {
      const e = ev as unknown as Record<string, unknown>;
      const bits = ['side', 'by', 'to', 'move', 'strength', 'edge', 'livesLeft']
        .filter((k) => e[k] !== undefined && e[k] !== null)
        .map((k) => `${k} ${e[k]}`);
      recentEvents.push(`${ev.tick} ${fight.mode} ${ev.t}${bits.length ? ' ' + bits.join(' ') : ''}`);
    }
    if (recentEvents.length > 5) recentEvents.splice(0, recentEvents.length - 5);
  }
  let sheet: { group: THREE.Group; views: FighterView[]; labels: HTMLElement; cam: THREE.Camera; fog: THREE.Fog | THREE.FogExp2 | null } | null = null;

  function nowMs(): number {
    return r.startedAt == null ? 0 : clock.serverNow() - r.startedAt;
  }

  function poseFighters(show: ShowState, fight: FightView | null, dt: number): void {
    ensureViews(show.ctx?.picks ?? (fight ? fight.state.fighters.map((f) => f.fighter) as [FighterId, FighterId] : undefined));
    if (!views) return;
    const inArena = show.phase === 'predictions' || show.phase === 'fight' || show.phase === 'break' || show.phase === 'verdict';
    for (const side of [0, 1] as Side[]) {
      const v = views[side];
      v.root.visible = inArena && !!fight;
      if (!inArena || !fight) continue;
      const s = fight.state.fighters[side];
      const p = fight.prev.fighters[side];
      const o = fight.state.fighters[side === 0 ? 1 : 0];
      const t = show.phaseMs / 1000;
      v.pose(s, p, fight.alpha, o, dt, side);
      if (show.phase === 'predictions') v.showPose('wait', t);
      else if (show.phase === 'verdict' && fight.mode === 'frozen' && show.result) v.showPose(side === show.result.winner ? 'win' : 'lose', t);
    }
  }

  function frame(dt: number, render = true): void {
    const t0 = performance.now();
    const now = nowMs();
    lastNow = now;
    if (sheet) {
      if (render) renderNow();
      return;
    }
    const show = showStateAt(r, now);
    if (show.phase !== lastPhase) {
      lastPhase = show.phase;
      phaseT0 = now;
    }
    void phaseT0;
    const fight = playback.frame(now, dt, show);
    // plans in force: during the fight they come from the sim state being drawn, so the plate
    // changes on the frame the fighter starts playing the new plan
    if (fight && (show.phase === 'fight' || fight.mode === 'replay')) {
      show.plans = [fight.state.plans[0], fight.state.plans[1]];
      for (const side of [0, 1] as Side[]) {
        const pl = fight.state.plans[side];
        const key = pl ? `${pl.stance}|${pl.read}|${pl.order}|${pl.aggression}|${pl.range}` : '';
        if (key !== lastPlanKey[side]) {
          lastPlanKey[side] = key;
          planChangedAt[side] = now;
        }
      }
      show.planChangedAt = [planChangedAt[0], planChangedAt[1]];
    }
    poseFighters(show, fight, dt);
    zeroPost();
    noteEvents(fight);
    const f: Frame = { dt, now, show, fight, post, width: W, height: H };
    for (let i = 0; i < modules.length; i++) {
      // one broken module (mid-edit) must not stop the others or the frame: log it, go on
      try {
        modules[i]!.update(f);
      } catch (e) {
        const n = (moduleErrors[i] = (moduleErrors[i] ?? 0) + 1);
        if (n <= 3 || n % 600 === 0) console.error(`[ringout stage] ${moduleTags[i]} module update failed (${n}x)`, e);
      }
      // objects a module adds later (lazily) are its own too
      if (scene.children.length) claim(moduleTags[i]!);
    }
    if (render) {
      renderNow();
      // capture: wait for the GPU so frameMs (and the fps reported from it) is the real cost
      if (capture) renderer.getContext().finish();
    }
    lastShow = show;
    lastFight = fight;
    const ms = performance.now() - t0;
    if (render) frameMsEma = frameMsEma ? frameMsEma * 0.9 + ms * 0.1 : ms;
  }

  // ---- loop (live mode) ----
  let raf = 0;
  let last = 0;
  let destroyed = false;
  function loop(ts: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.25, (ts - last) / 1000) : 1 / 60;
    if (last) fpsEma = fpsEma * 0.95 + (1 / Math.max(1e-3, dt)) * 0.05;
    last = ts;
    try {
      frame(dt, true);
    } catch (e) {
      console.error('[ringout stage]', e);
    }
  }
  if (!capture) raf = requestAnimationFrame(loop);

  // ---- pose sheet (capture scene `moves`) ----
  function clearSheet(): void {
    if (!sheet) return;
    for (const v of sheet.views) v.dispose();
    scene.remove(sheet.group);
    sheet.labels.remove();
    scene.fog = sheet.fog;
    sheet = null;
  }

  function poseSheet(fighter: FighterId | null, move?: string, page?: { part: number; parts: number }): void {
    clearSheet();
    if (!fighter) {
      arenaVisible(true);
      return;
    }
    const def = FIGHTERS[fighter];
    const base = (over: Partial<FighterState>): FighterState => ({
      fighter,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      action: 'idle',
      actionFrame: 1,
      move: null,
      charge: 0,
      grounded: true,
      platform: -1,
      ledge: -1,
      damage: 0,
      lives: 2,
      shield: 100,
      hitlag: 0,
      hitstun: 0,
      tumble: false,
      kbx: 0,
      kby: 0,
      invuln: 0,
      armor: false,
      airJumpsLeft: 1,
      fastFall: false,
      ...over,
    });
    const cells: { s: FighterState; label: string }[] = [];
    const moveState = (id: MoveId, f: number): FighterState => {
      const m = def.moves[id];
      const air = m.kind === 'air' || id === 'recover';
      const armor = !!m.armor && f >= m.armor[0] && f <= m.armor[1];
      return base({ action: m.kind === 'throw' ? 'holding' : id === 'grab' ? 'attack' : 'attack', move: id, actionFrame: f, grounded: !air, platform: air ? -2 : -1, armor });
    };
    const ACTIONS: [Action, Partial<FighterState>][] = [
      ['entrance', {}], ['idle', {}], ['walk', { vx: 0.05 }], ['run', { vx: 0.15 }], ['skid', {}], ['turn', {}],
      ['jumpsquat', {}], ['rise', { grounded: false, vy: 0.2 }], ['fall', { grounded: false, vy: -0.2 }], ['land', {}],
      ['shield', { shield: 80 }], ['shieldstun', { shield: 60 }], ['shieldbreak', {}], ['roll', {}], ['spotdodge', {}],
      ['airdodge', { grounded: false }], ['holding', { move: 'grab' }], ['held', {}], ['hitstun', { hitstun: 20 }],
      ['hitstun', { hitstun: 30, tumble: true, grounded: false, actionFrame: 6 }], ['knockdown', {}], ['getup', {}],
      ['ledgehang', { ledge: 0, grounded: false }], ['ledgeclimb', { ledge: 0 }], ['helpless', { grounded: false }],
      ['respawn', { invuln: 60 }], ['win', {}], ['lose', {}],
    ];
    if (move === 'actions') {
      for (const [a, over] of ACTIONS) cells.push({ s: base({ action: a, ...over }), label: a + (over.tumble ? ' tumble' : '') });
    } else if (move && (MOVE_IDS as string[]).includes(move)) {
      const m = def.moves[move as MoveId];
      const total = m.startup + m.active + m.recovery;
      const n = Math.min(24, total);
      for (let i = 0; i < n; i++) {
        const f = 1 + Math.round((i * (total - 1)) / Math.max(1, n - 1));
        const part = f <= m.startup ? 'startup' : f <= m.startup + m.active ? 'active' : 'recovery';
        cells.push({ s: moveState(move as MoveId, f), label: `${m.name} f${f} ${part}` });
      }
    } else {
      for (const id of MOVE_IDS) {
        const m = def.moves[id];
        const total = m.startup + m.active + m.recovery;
        const keys: [number, string][] = [
          [1, 'start'],
          [m.startup + 1, 'active'],
          [m.startup + m.active, 'last active'],
          [total, 'end'],
        ];
        for (const [f, what] of keys) cells.push({ s: moveState(id, Math.max(1, Math.min(total, f))), label: `${id} f${f} ${what}` });
      }
    }
    // pages: `parts` splits a long sheet, `part` (1-based) picks the page
    const parts = Math.max(1, Math.min(cells.length, Math.floor(page?.parts ?? 1)));
    const part = Math.max(1, Math.min(parts, Math.floor(page?.part ?? 1)));
    const per = Math.ceil(cells.length / parts);
    const shown = cells.slice((part - 1) * per, part * per);
    // a cell: head room above the floor line (raised and airborne poses), the label below it
    const Hf = def.height;
    const cellW = Math.max(Hf * 1.9, 3.4);
    const headRoom = Hf * 1.6;
    const labelRoom = Hf * 0.42;
    const cellH = headRoom + labelRoom;
    const pad = Hf * 0.2;
    // the column count that draws the cells biggest in 16:9
    let cols = 1;
    let best = 0;
    for (let c = 1; c <= Math.min(16, shown.length); c++) {
      const r = Math.ceil(shown.length / c);
      const k = Math.min(16 / (c * cellW + 2 * pad), 9 / (r * cellH + 2 * pad));
      if (k > best * 1.0001) {
        best = k;
        cols = c;
      }
    }
    const rows = Math.ceil(shown.length / cols);
    arenaVisible(false);
    const group = new THREE.Group();
    scene.add(group);
    owner.set(group, 'sheet');
    const gw = cols * cellW;
    const gh = rows * cellH;
    // orthographic, fitted to the whole grid: nothing is cut off and the labels land exactly
    const viewW = Math.max(gw + 2 * pad, ((gh + 2 * pad) * 16) / 9);
    const viewH = (viewW * 9) / 16;
    const midX = gw / 2;
    const midY = -gh / 2;
    const sheetCam = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 0.1, 400);
    sheetCam.position.set(midX, midY, 100);
    sheetCam.lookAt(midX, midY, 0);
    sheetCam.updateMatrixWorld();
    sheetCam.layers.enableAll();
    const pxX = (x: number) => ((x - (midX - viewW / 2)) / viewW) * UI_W;
    const pxY = (y: number) => ((midY + viewH / 2 - y) / viewH) * UI_H;
    const cellPx = (cellW / viewW) * UI_W;
    const fontPx = Math.max(9, Math.min(13, Math.round(cellPx / 10)));
    const labels = el('div', ui, { position: 'absolute', inset: '0' });
    const svs: FighterView[] = [];
    const floorOf = (row: number) => -row * cellH - headRoom;
    shown.forEach((c, i) => {
      const cx = (i % cols) * cellW + cellW / 2;
      const floor = floorOf(Math.floor(i / cols));
      const air = !c.s.grounded;
      c.s.x = cx;
      c.s.y = floor + (air ? Hf * 0.3 : 0);
      const other = base({ x: cx + 1.4, y: c.s.y, facing: -1 });
      const v = FIGHTER_FACTORIES[fighter](ctx, { side: 0, sideColor: ctx.sideColors[0], alt: false });
      group.add(v.root);
      v.pose(c.s, c.s, 1, other, 0, 0);
      svs.push(v);
      // the label sits under the floor line, inside its own cell
      el('div', labels, {
        position: 'absolute',
        left: `${pxX(cx - cellW / 2) + 2}px`,
        top: `${pxY(floor - Hf * 0.05)}px`,
        width: `${Math.max(10, cellPx - 4)}px`,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontFamily: FONTS.text,
        fontWeight: '500',
        fontSize: `${fontPx}px`,
        lineHeight: '1.1',
        color: PALETTE.white,
      }, c.label);
    });
    if (parts > 1) {
      el('div', labels, { position: 'absolute', right: '12px', bottom: '8px', fontFamily: FONTS.text, fontSize: '12px', color: PALETTE.white }, `${part} of ${parts}`);
    }
    // a floor line per row
    const lineMat = new THREE.LineBasicMaterial({ color: PALETTE.steelLight });
    for (let row = 0; row < rows; row++) {
      const y = floorOf(row);
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, y, 0), new THREE.Vector3(gw, y, 0)]);
      group.add(new THREE.Line(g, lineMat));
    }
    const lights = new THREE.Group();
    lights.add(new THREE.HemisphereLight('#c8d8ee', '#20262e', 1.2));
    const key = new THREE.DirectionalLight('#ffffff', 2);
    key.position.set(gw / 2 - 10, 10, 30);
    key.target.position.set(gw / 2, -gh / 2, 0);
    lights.add(key, key.target);
    lights.traverse((o) => o.layers.enableAll());
    group.add(lights);
    sheet = { group, views: svs, labels, cam: sheetCam, fog: scene.fog };
    scene.fog = null;
  }

  let arenaHidden: THREE.Object3D[] = [];
  let uiHidden: HTMLElement[] = [];
  function arenaVisible(on: boolean): void {
    if (on) {
      for (const o of arenaHidden) o.visible = true;
      for (const d of uiHidden) d.style.visibility = '';
      arenaHidden = [];
      uiHidden = [];
      return;
    }
    for (const o of scene.children) {
      if (o.visible) {
        o.visible = false;
        arenaHidden.push(o);
      }
    }
    for (const d of Array.from(ui.children) as HTMLElement[]) {
      d.style.visibility = 'hidden';
      uiHidden.push(d);
    }
  }

  function info(): StageInfo {
    const fv = lastFight;
    const pb = playback.info();
    return {
      phase: lastShow?.phase ?? 'idle',
      showMs: Math.round(lastNow),
      phaseMs: Math.round(lastShow?.phaseMs ?? 0),
      tick: fv ? fv.state.tick : null,
      mode: fv ? fv.mode : null,
      fighters: fv
        ? fv.state.fighters.map((f) => ({ fighter: f.fighter, action: f.action, move: f.move, damage: Math.round(f.damage * 10) / 10, lives: f.lives, x: Math.round(f.x * 100) / 100, y: Math.round(f.y * 100) / 100 }))
        : [],
      fps: capture ? Math.round(1000 / Math.max(1, frameMsEma)) : Math.round(fpsEma),
      frameMs: Math.round(frameMsEma * 100) / 100,
      mismatches: playback.mismatches,
      matches: playback.matches,
      plans: lastShow ? lastShow.plans.map((p) => (p ? `${p.stance}: ${p.read}` : null)) : [],
      events: recentEvents.slice(),
      holding: pb.holding,
      koTick: pb.koTick,
      covered: post.coverSet,
    };
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    el0.removeEventListener('pointerdown', onGesture);
    el0.removeEventListener('keydown', onGesture);
    clearSheet();
    if (views) for (const v of views) v.dispose();
    views = null;
    ctx.fighters[0] = null;
    ctx.fighters[1] = null;
    for (const m of modules) {
      try {
        m.dispose();
      } catch (e) {
        console.error('[ringout stage] dispose', e);
      }
    }
    // anything modules left behind
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
        m.dispose();
      }
    });
    scene.clear();
    quadGeo.dispose();
    dimMat.dispose();
    flashMat.dispose();
    shadowRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    wrap.remove();
  }

  return {
    onFeed,
    setCamera(mode, side) {
      cam.setMode(mode, side);
    },
    highlight(entrantId) {
      r.highlightId = entrantId;
    },
    setMuted(m) {
      audio.setMuted(m);
    },
    setVolume(v) {
      const n = Number(v);
      volume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
      applyVolume();
    },
    unlock: unlockAudio,
    frame,
    render: renderNow,
    info,
    poseSheet,
    get reduced() {
      return r;
    },
    destroy,
  };
}
