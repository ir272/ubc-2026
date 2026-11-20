// The ink stage: one 2D canvas drawn every frame with the pen. Same Stage interface, clock, reducer,
// playback and audio as the three.js stage (src/stage/stage.ts); only the picture is new.
//
// Each frame: clock -> reduce (ShowState at now) -> playback (FightView) -> camera -> both fighters
// posed into Figures -> post zeroed -> prepare() on every module -> draw: set, dim wash, fighters,
// fx, flash wash, hud, screens. A covering screen (post.cover) skips set, fighters, fx and hud.
// Every module call is wrapped: one broken module (mid-edit) logs and the frame goes on.

import { ARENA, FIGHTERS } from '../sim/index.ts';
import type { Action, FighterId, FighterState, MoveId, Side } from '../sim/types.ts';
import { MOVE_IDS } from '../sim/types.ts';
import type { Stage, StageInfo, StageOptions } from '../stage/types.ts';
import type { Frame, PostState, StageCtx } from '../stage/api.ts';
import { initialReduced, reduce, showStateAt } from '../show/reduce.ts';
import { Playback } from '../show/playback.ts';
import { ShowClock, type TimeSource } from '../stage/clock.ts';
import { createAudio } from '../stage/audio.ts';
import { H, UNITS_PER_M, W } from './api.ts';
import type { FightView, InkFrame, InkModule, InkPost, Joints, ShowState } from './api.ts';
import { BG, INK, makeInk } from './pen.ts';
import { pose } from './pose.ts';
import { CAST } from './cast/index.ts';
import { createCamera2D } from './camera.ts';
import { DEFAULT_SET, SETS, setFor } from './sets/index.ts';
import { createFigures, drawFigure, extraFor, makeFigure, standState } from './figures.ts';
import { createFx } from './fx.ts';
import { createHud, SERIF } from './hud.ts';
import { loadInkFont } from './font.ts';
import { createScreens } from './screens.ts';

export interface InkStageOptions extends StageOptions {
  /** the ink treatment: 'line' (default) or 'mass' */
  mode?: 'line' | 'mass';
  /** stage set id (sets/index.ts) when the match context names none; default 'belfry'. A page
   *  query `set=<id>` overrides even the context's stage (captures). */
  set?: string;
}

const SIDE_TINTS: [string, string] = ['coral', 'blue'];
const ARENA_PHASES = new Set(['predictions', 'fight', 'break', 'verdict']);

export function createInkStage(el0: HTMLElement, opts: InkStageOptions): Stage {
  const capture = !!opts.capture;
  const clock: TimeSource = opts.capture ? opts.capture.time : new ShowClock();
  const showClock = clock instanceof ShowClock ? clock : null;
  // the owner leans to solid ink: figures are solid cream, the world stays line, so fighters stand out
  const mode = opts.mode === 'line' ? 'line' : 'mass';

  // ---- DOM: a wrapper that fills el, a 16:9 box centred in it, the canvas ----
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' });
  el0.appendChild(wrap);
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'absolute', overflow: 'hidden', background: BG });
  wrap.appendChild(box);
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block' });
  box.appendChild(canvas);
  const g = canvas.getContext('2d', { alpha: false })!;
  loadInkFont(opts.assetsBase);

  // ---- modules ----
  const cam = createCamera2D();
  // the set: the page query `set` (an override for captures), else the match context's stage, else
  // the option, else the default; switched (old one disposed) when the context's stage changes
  let setOverride: string | null = null;
  try {
    setOverride = new URLSearchParams(globalThis.location?.search ?? '').get('set');
  } catch {
    setOverride = null;
  }
  const pickSet = (ctxStage?: string | null): string =>
    [setOverride, ctxStage, opts.set].find((id): id is string => !!id && !!SETS[id]) ?? DEFAULT_SET;
  let set = setFor(pickSet(null));
  const figures = createFigures();
  const fx = createFx(cam);
  const hud = createHud();
  const screens = createScreens();
  const modules: InkModule[] = [set, figures, fx, hud, screens];
  const tags = ['set', 'figures', 'fx', 'hud', 'screens'];
  const errors: Record<string, number> = {};
  function guard(tag: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      const n = (errors[tag] = (errors[tag] ?? 0) + 1);
      if (n <= 3 || n % 600 === 0) console.error(`[ringout ink] ${tag} failed (${n}x)`, e);
    }
  }

  // ---- audio: the three.js stage's rig, handed the few fields it reads ----
  const audio = createAudio({ assetsBase: opts.assetsBase, fighterDefs: FIGHTERS } as unknown as StageCtx);
  const oldPost: PostState = { dim: 0, dimColor: '#000000', flash: 0, fighterFlash: [0, 0], fighterFlashColor: ['#ffffff', '#ffffff'], coverSet: false };
  let volume: number | null = null;
  function applyVolume(): void {
    if (volume === null) return;
    try {
      audio.setVolume(volume);
    } catch (e) {
      console.warn('[ringout ink] setVolume', e);
    }
  }
  function unlockAudio(): void {
    try {
      audio.unlock();
    } catch (e) {
      console.warn('[ringout ink] unlock', e);
    }
    applyVolume();
  }
  const onGesture = () => unlockAudio();
  el0.addEventListener('pointerdown', onGesture);
  el0.addEventListener('keydown', onGesture);

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

  // ---- size: the box in CSS px, the canvas at box * min(2, dpr) ----
  let boxW = 0;
  let boxH = 0;
  function layout(): void {
    const rw = wrap.clientWidth || el0.clientWidth || W;
    const rh = wrap.clientHeight || el0.clientHeight || H;
    let w = rw;
    let h = Math.round((rw * 9) / 16);
    if (h > rh) {
      h = rh;
      w = Math.round((rh * 16) / 9);
    }
    w = Math.max(16, w);
    h = Math.max(9, h);
    Object.assign(box.style, { width: `${w}px`, height: `${h}px`, left: `${Math.floor((rw - w) / 2)}px`, top: `${Math.floor((rh - h) / 2)}px` });
    if (w !== boxW || h !== boxH) {
      boxW = w;
      boxH = h;
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
  }
  layout();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layout()) : null;
  ro?.observe(wrap);

  // ---- per-frame state ----
  const post: InkPost = { dim: 0, flash: 0, fighterFlash: [0, 0], cover: false };
  const lastJoints: [Joints | null, Joints | null] = [null, null];
  const lastPlanKey: [string, string] = ['', ''];
  const planChangedAt: [number, number] = [-1, -1];
  let fpsEma = 60;
  let frameMsEma = 0;
  let lastShow: ShowState | null = null;
  let lastFight: FightView | null = null;
  let lastNow = 0;
  let lastFrame: InkFrame | null = null;
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

  function nowMs(): number {
    return r.startedAt == null ? 0 : clock.serverNow() - r.startedAt;
  }

  function poseFigures(f: InkFrame): void {
    const fight = f.fight;
    f.figures[0] = null;
    f.figures[1] = null;
    if (!fight || !ARENA_PHASES.has(f.show.phase)) return;
    const t = f.now / 1000;
    for (const side of [0, 1] as Side[]) {
      const s = fight.state.fighters[side];
      const p = fight.prev.fighters[side];
      const o = fight.state.fighters[side === 0 ? 1 : 0];
      const ch = CAST[s.fighter];
      const def = FIGHTERS[s.fighter];
      if (!ch || !def) continue;
      let J: Joints | null = null;
      guard('pose', () => {
        J = pose(s, p, fight.alpha, o, def, ch, t, f.dt);
      });
      J = J ?? lastJoints[side];
      if (!J) continue;
      lastJoints[side] = J;
      // the feet between the two ticks (not across a teleport: respawn, a lost life)
      const jump = p.action === 'dead' || Math.hypot(s.x - p.x, s.y - p.y) > 3;
      const a = jump ? 1 : fight.alpha;
      const wx = p.x + (s.x - p.x) * a;
      const wy = p.y + (s.y - p.y) * a;
      f.figures[side] = makeFigure(side, s, J, f.view.x(wx), f.view.y(wy), f.view.scale / UNITS_PER_M);
    }
  }

  function draw(f: InkFrame): void {
    const k = canvas.width / W;
    const gg = g as CanvasRenderingContext2D & { reset?: () => void };
    if (gg.reset) gg.reset();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = BG;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    const step = (tag: string, m: InkModule) => {
      g.save();
      guard(tag, () => m.draw(f));
      g.restore();
    };
    if (!post.cover) {
      step('set', set);
      if (post.dim > 0) {
        g.fillStyle = BG;
        g.globalAlpha = Math.min(1, post.dim);
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
      }
      step('figures', figures);
      step('fx', fx);
    }
    if (post.flash > 0) {
      g.fillStyle = INK;
      g.globalAlpha = Math.min(1, post.flash);
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (!post.cover) step('hud', hud);
    step('screens', screens);
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
    const fight = playback.frame(now, dt, show);
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
    noteEvents(fight);
    post.dim = 0;
    post.flash = 0;
    post.fighterFlash[0] = 0;
    post.fighterFlash[1] = 0;
    post.cover = false;
    const f: InkFrame = {
      dt, now, show, fight, g, view: cam.view, post, figures: [null, null], arena: ARENA, fighterDefs: FIGHTERS, cast: CAST, mode,
      sideTints: SIDE_TINTS, assetsBase: opts.assetsBase,
    };
    const wantSet = pickSet(show.ctx?.stage);
    if (wantSet !== set.id) {
      guard('set', () => set.dispose?.());
      set = modules[0] = setFor(wantSet);
    }
    guard('camera', () => cam.update(f));
    poseFigures(f);
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i]!;
      if (m.prepare) guard(tags[i]!, () => m.prepare!(f));
    }
    // sound: the old rig on a frame of the old shape
    const af: Frame = { dt, now, show, fight, post: oldPost, width: boxW, height: boxH };
    guard('audio', () => audio.update(af));
    lastFrame = f;
    if (render) draw(f);
    lastShow = show;
    lastFight = fight;
    const ms = performance.now() - t0;
    if (render) frameMsEma = frameMsEma ? frameMsEma * 0.9 + ms * 0.1 : ms;
  }

  function renderNow(): void {
    if (sheet) {
      drawSheet();
      return;
    }
    if (lastFrame) draw(lastFrame);
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
      console.error('[ringout ink]', e);
    }
  }
  if (!capture) raf = requestAnimationFrame(loop);

  // ---- pose sheet (capture scene `moves`): a grid of one character's poses, plain labels ----
  interface Cell { s: FighterState; J: Joints | null; label: string }
  let sheet: { fighter: FighterId; cells: Cell[]; cols: number; rows: number; part: number; parts: number } | null = null;

  function poseSheet(fighter: FighterId | null, move?: string, page?: { part: number; parts: number }): void {
    sheet = null;
    if (!fighter) return;
    const def = FIGHTERS[fighter];
    const ch = CAST[fighter];
    if (!def || !ch) return;
    const base = (over: Partial<FighterState>) => standState(fighter, { lives: 2, ...over });
    const cells: { s: FighterState; label: string }[] = [];
    const moveState = (id: MoveId, fr: number): FighterState => {
      const m = def.moves[id];
      const air = m.kind === 'air' || id === 'recover';
      const armor = !!m.armor && fr >= m.armor[0] && fr <= m.armor[1];
      return base({ action: m.kind === 'throw' ? 'holding' : 'attack', move: id, actionFrame: fr, grounded: !air, platform: air ? -2 : -1, armor });
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
        const fr = 1 + Math.round((i * (total - 1)) / Math.max(1, n - 1));
        const part = fr <= m.startup ? 'startup' : fr <= m.startup + m.active ? 'active' : 'recovery';
        cells.push({ s: moveState(move as MoveId, fr), label: `${move} f${fr} ${part}` });
      }
    } else {
      for (const [a, over] of ACTIONS) cells.push({ s: base({ action: a, ...over }), label: a + (over.tumble ? ' tumble' : '') });
      for (const id of MOVE_IDS) {
        const m = def.moves[id];
        const total = m.startup + m.active + m.recovery;
        const keys: [number, string][] = [[1, 'start'], [m.startup + 1, 'active'], [m.startup + m.active, 'last active'], [total, 'end']];
        for (const [fr, what] of keys) cells.push({ s: moveState(id, Math.max(1, Math.min(total, fr))), label: `${id} f${fr} ${what}` });
      }
    }
    const parts = Math.max(1, Math.min(cells.length, Math.floor(page?.parts ?? 1)));
    const part = Math.max(1, Math.min(parts, Math.floor(page?.part ?? 1)));
    const per = Math.ceil(cells.length / parts);
    const shown = cells.slice((part - 1) * per, part * per);
    const other = base({ x: 1.4, facing: -1 });
    const posed: Cell[] = shown.map((c) => {
      let J: Joints | null = null;
      guard('pose', () => {
        J = pose(c.s, c.s, 1, other, def, ch, 0, 0);
      });
      return { s: c.s, J, label: c.label };
    });
    // the column count that draws the cells biggest in 16:9
    const { cellW, cellH } = cellSize(def.height);
    let cols = 1;
    let best = 0;
    for (let c = 1; c <= Math.min(16, posed.length); c++) {
      const rr = Math.ceil(posed.length / c);
      const kk = Math.min(W / (c * cellW), H / (rr * cellH));
      if (kk > best * 1.0001) {
        best = kk;
        cols = c;
      }
    }
    sheet = { fighter, cells: posed, cols, rows: Math.ceil(posed.length / cols), part, parts };
  }

  function cellSize(heightM: number): { cellW: number; cellH: number; head: number } {
    const hu = heightM * UNITS_PER_M;
    const head = hu * 1.6;
    return { cellW: Math.max(hu * 1.9, 340), cellH: head + hu * 0.42, head };
  }

  function drawSheet(): void {
    if (!sheet) return;
    const k = canvas.width / W;
    const gg = g as CanvasRenderingContext2D & { reset?: () => void };
    if (gg.reset) gg.reset();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    const def = FIGHTERS[sheet.fighter];
    const ch = CAST[sheet.fighter];
    const { cellW, cellH, head } = cellSize(def.height);
    const pad = 12;
    const s = Math.min((W - 2 * pad) / (sheet.cols * cellW), (H - 2 * pad) / (sheet.rows * cellH));
    const ox = (W - sheet.cols * cellW * s) / 2;
    const oy = (H - sheet.rows * cellH * s) / 2;
    const font = Math.max(9, Math.min(13, Math.round((cellW * s) / 10)));
    sheet.cells.forEach((c, i) => {
      const col = i % sheet!.cols;
      const row = Math.floor(i / sheet!.cols);
      const cx = ox + (col + 0.5) * cellW * s;
      const floor = oy + (row * cellH + head) * s;
      const ink = makeInk(g, 'line');
      ink.line([[cx - cellW * s * 0.42, floor], [cx + cellW * s * 0.42, floor]], { w: 1.2, seed: 5 + i, taper: 0.6, alpha: 0.45 });
      const lift = c.s.grounded ? 0 : def.height * UNITS_PER_M * 0.3 * s;
      if (c.J) guard('sheet', () => drawFigure(g, ch, c.J!, extraFor(c.s, def, 0, SIDE_TINTS[0]), cx, floor - lift, s, 1, mode));
      g.save();
      g.font = `400 ${font}px ${SERIF}`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = INK;
      g.globalAlpha = 0.8;
      g.fillText(c.label, cx, floor + 4, cellW * s - 6);
      g.restore();
    });
    if (sheet.parts > 1) {
      g.font = `400 12px ${SERIF}`;
      g.textAlign = 'right';
      g.fillStyle = INK;
      g.fillText(`${sheet.part} of ${sheet.parts}`, W - 12, H - 10);
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
        ? fv.state.fighters.map((x) => ({ fighter: x.fighter, action: x.action, move: x.move, damage: Math.round(x.damage * 10) / 10, lives: x.lives, x: Math.round(x.x * 100) / 100, y: Math.round(x.y * 100) / 100 }))
        : [],
      fps: capture ? Math.round(1000 / Math.max(1, frameMsEma)) : Math.round(fpsEma),
      frameMs: Math.round(frameMsEma * 100) / 100,
      mismatches: playback.mismatches,
      matches: playback.matches,
      plans: lastShow ? lastShow.plans.map((p) => (p ? `${p.stance}: ${p.read}` : null)) : [],
      events: recentEvents.slice(),
      holding: pb.holding,
      koTick: pb.koTick,
      covered: post.cover,
    };
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    el0.removeEventListener('pointerdown', onGesture);
    el0.removeEventListener('keydown', onGesture);
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i]!;
      if (m.dispose) guard(tags[i]!, () => m.dispose!());
    }
    guard('audio', () => audio.dispose());
    canvas.width = 0;
    canvas.height = 0;
    wrap.remove();
  }

  return {
    onFeed,
    setCamera(m, side) {
      cam.setMode(m, side);
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

