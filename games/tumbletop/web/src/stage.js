// Tumbletop stage: the platform mounts this in a 16:9 element and feeds it every message of the
// channel. It draws the show from the feed alone: the opening call, the line-up while bets are open,
// the title call, each round replayed from its seed in step with the channel's clock, the cut, the
// recap and the result. A viewer can join at any second (a `snapshot` rebuilds everything).
//
//   const stage = createStage(el, { assetsBase, clock?, capture?, dpr? });
//   stage.onFeed(msg)              every feed message, in order
//   stage.setCamera(mode, rid?)    one of stage.cameras; applies while racing
//   stage.highlight(rid | null)    the viewer's pick
//   stage.destroy()
//   stage.debug.frame(dt, render)  tools: one frame on the clock (capture mode has no rAF loop)
//   stage.debug.state()            tools: JSON summary
//
// Time: everything runs on the feed's server timeline. offset = msg.t - clock.now() from the latest
// message; serverNow = clock.now() + offset. A round's sim tick is always
// floor((serverNow - roundStart) * 60 / 1000), capped a while after it finishes.
//
// The world (renderer, scene, attic, course) is built once per mount. The cast (sim, Gumbles,
// recorder, interpolated view, director) is rebuilt whenever the scene's simulation changes.
import * as THREE from 'three';
import './show/theme.css';
import { createSim, ROUNDS, ROSTER, gumble, seedToUint32, TICK_RATE } from '../../sim/index.js';
import { COURSE } from '../../sim/course.js';
import { realClock } from '../../show/clock.js';
import { makeTextures } from './world/textures.js';
import { createEnvironment } from './world/environment.js';
import { createCourseView } from './world/courseView.js';
import { createRosterBoard, slotFeet, BOARD_FRAME } from './world/rosterBoard.js';
import { disposeTree } from './world/dispose.js';
import { createGumbles } from './characters/gumble.js';
import { createCameras } from './camera/cameras.js';
import { createShowDirector } from './camera/showDirector.js';
import { createSightlines } from './camera/sightlines.js';
import { createRecorder, createView } from './replay/replay.js';
import { createRaceHud } from './show/raceHud.js';
import { createShowCards } from './show/cards.js';
import { createSound, createSoundLog } from './show/sound.js';

export const CAMERAS = ['Director', 'Leader', 'Cut line', 'My pick', 'Overview'];

const MS_PER_TICK = 1000 / TICK_RATE;
const HOLD_TICKS = 60 * TICK_RATE;      // a finished round keeps running this long (cut, recap, result)
const SILENT_AFTER = 2 * TICK_RATE;     // further behind than this: catch up without recording
const HUD_EVENT_WINDOW = 6 * TICK_RATE; // during a silent catch-up only recent events reach the HUD
const LOBBY_MAX_CATCHUP = 6;
const SUBJECT_SHOTS = new Set(['follow', 'closeup', 'leader', 'track']);
const CUT_PLATE_MS = 700;               // the crossing plays before the plate says who took the place
const BOARD_T0 = 1.1;                    // the roster shelf: seconds before the first shutter drops
const CUT_LINE_HOLD_MS = 1050;
const CUT_HOLD_MS = 1700;              // the cut: the race shot holds this long past the line first
const CUT_BEAT_MS = 2400;              // the cut: this long on the Gumble who just missed, then the finish line
const INCIDENTS = new Set(['knockback', 'fall', 'tumble', 'pileup', 'photoFinish']);
const SHOW_SHOTS = new Set(['intro', 'gridwalk', 'gridtop', 'start', 'finish', 'finishline', 'orbit', 'zone', 'sideline', 'board']); // no Gumble is faded for these lenses
const NEAR_TAG = 9;                    // metres: a racing Gumble this close to the lens is always named
const TITLE_MS = 4000;                 // a round's title call, when its line-up opens
const ord = (n) => { const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };

const pingPong = (x) => { const f = x - Math.floor(x / 2) * 2; return f <= 1 ? f : 2 - f; };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function createStage(el, opts = {}) {
  const clock = opts.clock || realClock();
  const capture = !!opts.capture;
  let destroyed = false;

  // ------------------------------------------------------------------ DOM + renderer
  const hadPosition = el.style.position;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.classList.add('tt-stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: capture, stencil: false });
  const dprCap = opts.dpr ?? (capture ? 1 : 1.75);
  renderer.setPixelRatio(capture ? dprCap : Math.min(globalThis.devicePixelRatio || 1, dprCap));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block' });
  el.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 2400);
  const textures = makeTextures();
  const env = createEnvironment(scene, renderer, COURSE, textures);
  const courseView = createCourseView(scene, COURSE, textures);
  const board = createRosterBoard(scene);
  const info = courseView.info;
  info.interior = env.interior;
  const cams = createCameras(camera, info);
  const sight = createSightlines();

  // link every shader the attic and the course need now, not the first time each comes into view
  try { env.compile(scene, camera); } catch { /* compiled on first draw instead */ }

  const raceHud = createRaceHud(el);
  const cards = createShowCards(el);
  // live: the synthesised mix. Capture mode is silent, or (opts.soundLog) records every sound call with its time for an offline render
  const sound = capture ? (opts.soundLog ? createSoundLog(() => clock.now() / 1000) : null) : createSound(opts.volume != null ? { volume: opts.volume } : {});

  let W = 1280, H = 720;
  function resize() {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    if (w === W && h === H && canvas.width) return;
    W = w; H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    el.style.setProperty('--k', String(Math.min(w / 1280, h / 720)));
  }
  W = 0; resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!destroyed) resize(); }) : null;
  ro?.observe(el);

  // ------------------------------------------------------------------ the show, from the feed
  let offset = 0;
  const serverNow = () => clock.now() + offset;
  const show = {
    match: null, startedAt: 0, windows: [], mode: 'idle', modeAt: 0,
    roundEv: null, recapEv: null, resultEv: null, phaseFeed: '',
  };
  const idleSince = { t: 0 };

  function resetShow() {
    show.match = null; show.startedAt = 0; show.windows = []; show.mode = 'idle';
    show.roundEv = null; show.recapEv = null; show.resultEv = null;
    cardCache.clear();
  }

  function takeEvent(ev) {
    if (!ev || !ev.type) return false;
    const rec = ev.data ? { ...ev.data, at: ev.at ?? 0 } : null;
    if (!rec) return false;
    if (ev.type === 'round') { show.roundEv = rec; show.mode = 'round'; return true; }
    if (ev.type === 'recap') { show.recapEv = rec; show.mode = 'recap'; return true; }
    if (ev.type === 'result') { show.resultEv = rec; show.mode = 'result'; return true; }
    return false;
  }

  function applySnapshot(s) {
    resetShow();
    show.phaseFeed = s.phase || '';
    if (!s.match) return;
    show.match = s.match;
    show.startedAt = s.match.startedAt ?? 0;
    const joinedAt = s.t ?? serverNow();
    show.windows = (s.windows || []).map((w) => ({ ...w, openedAt: w.openedAt ?? joinedAt - 10000 }));
    show.mode = 'call';
    // the latest phase event of each kind, in feed order
    let last = null;
    for (const ev of s.recentEvents || []) {
      if (ev.type === 'round' || ev.type === 'recap' || ev.type === 'result') { takeEvent(ev); last = ev; }
    }
    const wr = show.windows.length - 1;
    if (!last) show.mode = wr >= 0 ? 'lineup' : 'call';
    else if (last.type === 'result') show.mode = 'result';
    else show.mode = (last.data?.round ?? -1) >= wr ? last.type : 'lineup';
  }

  function onFeed(msg) {
    if (destroyed || !msg || typeof msg !== 'object') return;
    if (typeof msg.t === 'number') offset = msg.t - clock.now();
    switch (msg.type) {
      case 'snapshot': applySnapshot(msg); break;
      case 'match':
        resetShow();
        show.match = { matchId: msg.matchId, title: msg.title, entrants: msg.entrants || [], meta: msg.meta, startedAt: msg.startedAt };
        show.startedAt = msg.startedAt ?? msg.t ?? serverNow();
        show.mode = 'call';
        break;
      case 'window_open':
        if (!show.match) break;
        show.windows.push({ windowId: msg.windowId, outcomes: msg.outcomes || [], closesAt: msg.closesAt, state: 'open', openedAt: msg.t ?? serverNow() });
        show.mode = 'lineup';
        break;
      case 'window_locked': case 'window_settled': case 'window_void': {
        const w = show.windows.find((x) => x.windowId === msg.windowId);
        if (w) w.state = msg.type === 'window_locked' ? 'locked' : msg.type === 'window_settled' ? 'settled' : 'void';
        break;
      }
      case 'event': takeEvent(msg.event); break;
      case 'phase': show.phaseFeed = msg.phase || ''; break;
      default: break; // match_end, chat, bets ...: nothing to draw
    }
  }

  // ------------------------------------------------------------------ the cast
  let cast = null;
  const pendingDispose = [];
  let castBuildMs = [];
  let pickRid = null;           // highlight()
  let viewerMode = 'Director';
  let viewerRid = null;         // setCamera('My pick', rid)

  /** spec: { key, round, entrants, lobby, seed?, gumbles: bool, startWall? } */
  function buildCast(spec) {
    const t0 = performance.now();
    if (cast) retireCast(cast);
    const sim = createSim({ seed: spec.seed ?? 1, round: spec.round, entrants: spec.entrants, lobby: spec.lobby });
    const st = sim.state;
    const N = st.bots.length, M = (st.obstacles || []).length;
    courseView.setRound(sim.course, sim.bots.map((b) => ({ x: b.pos.x, y: b.pos.y, z: b.pos.z })));
    const c = {
      key: spec.key, lobby: !!spec.lobby, round: spec.round, sim, N, M,
      gumbles: spec.gumbles ? createGumbles(scene, st.bots) : null,
      recorder: createRecorder(N, M, 3, TICK_RATE),
      view: createView(N, M),
      director: createShowDirector(),
      lensVis: new Float32Array(N).fill(1),
      slotOf: new Map(sim.bots.map((b) => [b.rid, b.id])),
      startWall: spec.startWall ?? null, finishTick: -1, firstOut: '', firstOutId: -1, acc: 0, alpha: 0, lastPip: 0,
    };
    // (the final runs side-on while the leader is in the block maze)
    c.director.reset({ botCount: N, qualifyCount: st.qualifyCount, finishZ: sim.course.finish.z, sideFrom: COURSE.layout.mazeZ0 - 1, sideTo: COURSE.layout.mazeZ1 + 3, finalSide: opts.finalSide });
    c.recorder.record(st);
    sim.drainEvents();
    // Link every material of the new crowd now, including the ones only drawn later (the lens-fade
    // ghosts, the impact puffs): while the old crowd is still alive this reuses its shader
    // programs at no cost, so no program is ever freed between rounds and recompiled mid-race.
    if (c.gumbles) { try { env.compile(c.gumbles.group, camera); } catch { /* compiled on first draw instead */ } }
    cast = c;
    lastRaceShot = null;
    if (!c.lobby) raceHud.setRound({ round: ROUNDS[spec.round], bots: st.bots, courseLength: sim.course.length });
    applyPick();
    cams.cut();
    castBuildMs.push(performance.now() - t0);
    if (castBuildMs.length > 20) castBuildMs = castBuildMs.slice(-20);
    return c;
  }
  // Old Gumbles leave the scene now and are freed after the next render, so the new crowd's
  // materials compile while the old ones still hold the shared shader programs (no hitch).
  function retireCast(c) {
    if (c.gumbles) { c.gumbles.group.parent?.remove(c.gumbles.group); pendingDispose.push(c.gumbles); }
  }
  function flushDisposals() {
    while (pendingDispose.length) pendingDispose.pop().dispose();
  }

  function applyPick() {
    const slot = cast && pickRid != null ? cast.slotOf.get(pickRid) ?? -1 : -1;
    if (cast) cast.pickSlot = slot;
    cast?.gumbles?.setHighlight(slot);
  }

  function ensureCast(spec) {
    if (cast && cast.key === spec.key) return cast;
    return buildCast(spec);
  }

  /** One sim tick. record: keep it for display; hud: pass its events to the race HUD. */
  function stepCast(c, record, hud) {
    const sim = c.sim;
    sim.step();
    if (record) c.recorder.record(sim.state);
    const evs = sim.drainEvents();
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (ev.type === 'eliminated' && !c.firstOut) { c.firstOut = ev.text || ''; c.firstOutId = ev.botId ?? -1; }
      if (hud && !c.lobby) {
        // the event line only talks about Gumbles a viewer can see named right now, or their pick
        const p = c.pickSlot ?? -1;
        // and only about things that happen to them (the tower already tells places and who is through)
        if (INCIDENTS.has(ev.type) && ev.botId != null && onCam.has(ev.botId)) raceHud.onEvent(ev);
        if (ev.botId === p && p >= 0) c.director.notePick(ev);
        if (sound) {
          if (ev.type === 'qualified') sound.through(ev.left ?? 3);
          else if (ev.type === 'lastSpot') { if (ev.winner) sound.win(); else sound.lastPlace(); }
          else if (ev.type === 'knockback' || ev.type === 'tumble') sound.knock();
          else if (ev.type === 'fall') sound.fall();
          else if (ev.type === 'start') sound.go();
        }
      }
    }
    if (c.finishTick < 0 && sim.state.phase === 'finished') c.finishTick = sim.tick;
  }

  const capTick = (c) => (c.finishTick >= 0 ? c.finishTick + HOLD_TICKS : Infinity);

  /** Run a round's sim to its end without drawing (joining at a recap or the result). */
  function runToFinish(c) {
    let n = 0;
    while (c.finishTick < 0 && n++ < 60 * 400) stepCast(c, false, false);
    for (let i = 0; i < 2; i++) stepCast(c, true, false);
  }

  function advanceCast(c, dt, now) {
    if (c.lobby) {
      c.acc += dt * TICK_RATE;
      let n = 0;
      while (c.acc >= 1 - 1e-6 && n < LOBBY_MAX_CATCHUP) { stepCast(c, true, false); c.acc -= 1; n++; }
      if (n === LOBBY_MAX_CATCHUP && c.acc > 1) c.acc = 0;
      c.alpha = clamp01(c.acc);
      return;
    }
    if (c.startWall == null) { c.alpha = 0; return; }
    const tf = ((now - c.startWall) * TICK_RATE) / 1000;
    let target = Math.max(0, Math.floor(tf));
    if (target - c.sim.tick > SILENT_AFTER) {
      // far behind (joined mid-round, or the tab slept): catch up silently, then resume
      const goal = target;
      while (c.sim.tick < Math.min(goal, capTick(c)) - 2) stepCast(c, false, c.sim.tick >= goal - HUD_EVENT_WINDOW);
      cams.cut();
    }
    while (c.sim.tick < Math.min(target, capTick(c))) stepCast(c, true, true);
    target = Math.min(target, capTick(c));
    c.alpha = c.sim.tick === target && tf < capTick(c) ? clamp01(tf - target) : 0;
  }

  // The roster shelf's plan for one recap, all from the recap event, so a viewer joining mid-way
  // sees it at the same point: who was already out, who goes out now and when each shutter drops.
  function boardPlan(ev, ids) {
    const slot = new Map(ids.map((id, i) => [id, i]));
    const field = new Set(ev.entrants || []);
    const before = ids.map((id) => !field.has(id));                     // out in an earlier round
    const outNow = (ev.eliminated || []).map((id) => slot.get(id)).filter((i) => i != null);
    const order = outNow.slice().reverse();                             // the back of the field first, the one who just missed last
    const gap = order.length ? Math.min(0.45, 3.4 / order.length) : 0;
    const closeAt = new Array(ids.length).fill(Infinity);
    order.forEach((i, k) => { closeAt[i] = BOARD_T0 + k * gap; });
    const revealAt = BOARD_T0 + order.length * gap + 0.45;
    return { ids, before, closeAt, revealAt, remain: (ev.qualified || []).length, shut: -1, names: false };
  }
  // Each frame of the recap: stand the Gumbles in their cubbies, drop the shutters that are due.
  function applyBoard(c, tSec) {
    const b = c.board, v = c.view;
    if (!b.names) { board.setNames(b.ids.map((id) => cardGumble(id, -1).name)); b.names = true; }
    let shut = 0;
    for (let i = 0; i < c.N; i++) {
      const p = slotFeet(i);
      const amt = b.before[i] ? 1 : clamp01((tSec - b.closeAt[i]) / 0.2);
      if (amt > 0 && !b.before[i]) shut++;
      board.setShutter(i, amt, b.before[i]);
      // those who are through hop once the count is in
      const hop = !b.before[i] && b.closeAt[i] === Infinity && tSec > b.revealAt ? Math.abs(Math.sin((tSec - b.revealAt) * 7 + i * 0.9)) * 0.22 * clamp01(1.6 - (tSec - b.revealAt) / 1.4) : 0;
      v.botPos[i * 3] = p.x; v.botPos[i * 3 + 1] = p.y + hop; v.botPos[i * 3 + 2] = p.z;
      v.botYaw[i] = 0; v.botGrounded[i] = 1;
      v.botVel[i * 3] = 0; v.botVel[i * 3 + 1] = 0; v.botVel[i * 3 + 2] = 0;
      v.botHidden[i] = amt >= 0.98 ? 1 : 0;
    }
    board.setPick(c.pickSlot ?? -1);
    // a knock as each shutter lands (not for ones that were already down when this viewer arrived)
    if (b.shut >= 0 && shut > b.shut && sound) sound.knock();
    b.shut = shut;
  }

  // ------------------------------------------------------------------ what the show wants now
  const lineupRound = () => Math.max(0, Math.min(ROUNDS.length - 1, show.windows.length - 1));
  const entrantIds = () => (show.match?.entrants || []).map((e) => (typeof e === 'string' ? e : e.id));

  function startWallOf(ev) { return ev ? show.startedAt + (ev.startAt ?? 0) : null; }

  /** The finished round for a recap or the result: reuse the live cast or rebuild it silently. */
  function finishedCast(round, seed, entrants, at) {
    const key = `race:${round}:${seed}`;
    if (cast && cast.key === key) return cast;
    const re = show.roundEv && show.roundEv.seed === seed ? show.roundEv : null;
    const c = buildCast({ key, round, seed: seedToUint32(seed), entrants, lobby: false, gumbles: true, startWall: startWallOf(re) });
    if (c.startWall == null) {
      runToFinish(c);
      // pretend the round ended a few seconds before this phase began
      const phaseStart = show.startedAt + (at ?? 0);
      c.startWall = Math.min(serverNow(), phaseStart) - (c.finishTick + 4 * TICK_RATE) * MS_PER_TICK;
    }
    return c;
  }

  /** -> { phase, sub } and makes sure the right cast is on stage. */
  function resolve(now) {
    const m = show.mode;
    if (!show.match || m === 'idle') {
      ensureCast({ key: 'idle', round: 0, entrants: ROSTER.slice(0, 16).map((g) => g.id), lobby: true, gumbles: false });
      return 'idle';
    }
    if (m === 'call') {
      const ids = entrantIds();
      ensureCast({ key: `lobby:0:${ids.join(',')}`, round: 0, entrants: ids, lobby: true, gumbles: true });
      return 'call';
    }
    if (m === 'lineup') {
      const r = lineupRound();
      const w = show.windows[show.windows.length - 1];
      const ids = (w?.outcomes || []).map((o) => o.entrantId ?? o.id);
      ensureCast({ key: `lobby:${r}:${ids.join(',')}`, round: r, entrants: ids, lobby: true, gumbles: true });
      // the round's title call comes first, then the line-up
      return w && w.state === 'open' && now - (w.openedAt ?? now) < TITLE_MS ? 'title' : 'lineup';
    }
    if (m === 'round') {
      const ev = show.roundEv;
      const c = ensureCast({ key: `race:${ev.round}:${ev.seed}`, round: ev.round, seed: seedToUint32(ev.seed), entrants: ev.entrants, lobby: false, gumbles: true, startWall: startWallOf(ev) });
      if (c.startWall == null) c.startWall = startWallOf(ev);
      if (now < c.startWall) return 'locked';
      return c.sim.state.phase === 'finished' ? 'cut' : 'race';
    }
    if (m === 'recap') {
      // the roster shelf: every starter in a cubby, the ones knocked out this round shuttered one by one
      const ev = show.recapEv;
      const ids = entrantIds();
      const c = ensureCast({ key: `board:${ev.round}:${ev.seed}`, round: 0, entrants: ids.length ? ids : ev.entrants, lobby: true, gumbles: true });
      if (!c.board) c.board = boardPlan(ev, ids.length ? ids : ev.entrants);
      return 'recap';
    }
    if (m === 'result') {
      const ev = show.resultEv;
      finishedCast(ROUNDS.length - 1, ev.seed, ev.entrants, ev.at);
      return 'result';
    }
    return 'idle';
  }

  // ------------------------------------------------------------------ cards data
  const cardCache = new Map();
  const memo = (key, make) => { let v = cardCache.get(key); if (!v) { v = make(); cardCache.set(key, v); } return v; };
  function recordOf(rid) {
    const e = (show.match?.entrants || []).find((x) => x && x.id === rid);
    const r = e?.record || {};
    return { played: r.played | 0, wins: r.wins | 0 };
  }
  function cardGumble(rid, slot) {
    const g = gumble(rid);
    return { id: slot, rid, name: g.name, colors: g.colors, trait: g.trait, stats: g.stats, record: recordOf(rid) };
  }
  const roundInfo = (r) => ROUNDS[r];
  // "Your pick ..." for the result card: how far the viewer's pick got in this show.
  const pickLine = { text: '', good: false };
  function pickResult(ev) {
    if (pickRid == null || !entrantIds().includes(pickRid)) return null;
    const name = gumble(pickRid).name;
    const k = (ev.order || []).indexOf(pickRid);
    if (k === 0) { pickLine.text = `Your pick ${name} wins`; pickLine.good = true; }
    else if (k > 0) { pickLine.text = `Your pick ${name} finished ${ord(k + 1)}`; pickLine.good = false; }
    else {
      const out = (ev.rounds || []).find((x) => (x.eliminated || []).includes(pickRid));
      const r1out = show.recapEv && show.recapEv.round === 1 && !(show.recapEv.entrants || []).includes(pickRid);
      pickLine.text = `Your pick ${name} went out in ${ROUNDS[out ? out.round : r1out ? 0 : 1].name}`; pickLine.good = false;
    }
    return pickLine;
  }

  function cardsFrame(phase, now) {
    const m = show.match;
    const mk = m?.matchId ?? '';
    switch (phase) {
      case 'idle': return { phase: 'idle', t: (now - idleSince.t) / 1000, data: {} };
      case 'call': {
        const ids = entrantIds();
        const data = memo(`call:${mk}`, () => ({ gumbles: ids.map((id, i) => cardGumble(id, i)), rounds: ROUNDS, lineupAt: (show.startedAt + (m?.meta?.callMs ?? 12000)) / 1000 }));
        return { phase: 'call', t: (now - show.startedAt) / 1000, data };
      }
      case 'locked': {
        // the lock beat: one loud card from the lock until the 3 2 1
        const ev = show.roundEv;
        return { phase: 'locked', t: (now - (show.startedAt + (ev.at ?? 0))) / 1000, data: memo(`locked:${mk}:${ev.round}`, () => ({ round: roundInfo(ev.round), goAt: (show.startedAt + ev.startAt + 3000) / 1000 })) };
      }
      case 'title': case 'lineup': {
        // (the cards draw the round's title call themselves over the first seconds of the line-up)
        // One clock from the line-up to the start gun. Before the lock it is an estimate (the
        // window's close plus the script's lock beat and countdown); after it, the round's own start.
        const ev = null;
        const r = lineupRound();
        const w = show.windows[show.windows.length - 1];
        const ids = ev ? ev.entrants : (w?.outcomes || []).map((o) => o.entrantId ?? o.id);
        const bots = memo(`lineup:${mk}:${r}:${ids.join(',')}`, () => ids.map((id, i) => {
          const g = cardGumble(id, i);
          const prev = show.recapEv && show.recapEv.round === r - 1 ? show.recapEv.qualified || [] : [];
          const k = prev.indexOf(id);
          if (k >= 0) g.last = `${ord(k + 1)} in ${ROUNDS[r - 1].name}`;
          return g;
        }));
        // the plate's clock is the open line-up itself: it counts to the lock
        const data = { round: roundInfo(r), bots, closeAt: (w?.closesAt ?? now) / 1000, locked: w?.state !== 'open', spotlight, board: r === ROUNDS.length - 1, hint: ROUNDS[r].hint };
        return { phase: 'lineup', t: (now - (w?.openedAt ?? now)) / 1000, data };
      }
      case 'recap': {
        const ev = show.recapEv;
        const data = memo(`recap:${mk}:${ev.round}`, () => {
          const n = (ev.eliminated || []).length;
          return {
            round: roundInfo(ev.round),
            remain: (ev.qualified || []).length,
            revealAt: BOARD_T0 + n * (n ? Math.min(0.45, 3.4 / n) : 0) + 0.45,
            next: roundInfo(ev.round + 1) || null,
            nextAt: (show.startedAt + (ev.at ?? 0) + (ev.durationMs ?? 8000)) / 1000,
          };
        });
        return { phase: 'recap', t: (now - (show.startedAt + (ev.at ?? 0))) / 1000, data };
      }
      case 'result': {
        // One winner card, from the instant the final ends: first from the stage's own replay of
        // the final, then the same card with the next show's clock once the result event arrives.
        const ev = show.resultEv;
        const c = cast;
        const data = memo(`result:${mk}`, () => {
          const st = c.sim.state;
          const ids = st.order.map((id) => st.bots[id].rid);
          const win = ids[0];
          const w = cardGumble(win, c.slotOf.get(win) ?? -1);
          w.record = { played: w.record.played + 1, wins: w.record.wins + 1 };
          return { winner: w, order: ids.slice(1).map((id) => cardGumble(id, c.slotOf.get(id) ?? -1)), pick: null, nextAt: null, _order: ids };
        });
        if (!data.pick) { const pr = pickResult({ order: data._order, rounds: ev?.rounds || [] }); data.pick = pr ? { text: pr.text, good: pr.good } : null; }
        if (ev && ev.nextShowMs && data.nextAt == null) data.nextAt = (show.startedAt + (ev.at ?? 0) + ev.nextShowMs) / 1000;
        const fin = c.startWall != null && c.finishTick >= 0 ? c.startWall + c.finishTick * MS_PER_TICK : show.startedAt + (ev?.at ?? 0);
        return { phase: 'result', t: (now - fin) / 1000, data };
      }
      default: return { phase: 'none', t: 0, data: {} };
    }
  }

  // ------------------------------------------------------------------ shots
  // Recap: a slow swing in front of the Gumbles who went through, per round (what stands near each finish differs).
  // Per round: how close the line-up walk can get (what stands in front of each start grid differs),
  // how steeply the lock shot looks down on the grid, and where the finish-line camera sits.
  const GRID_SHOT = [{ depth: 7.0, fov: 38 }, { depth: 4.6, fov: 44 }, { depth: 3.6, fov: 50, dwell: 3, height: 2.5, lookY: 0.35 }]; // the final: aim low so the four stand clear above the finalists board
  const TOP_SHOT = [{ pitch: 0.95 }, { pitch: 1.2 }, { pitch: 1.2 }];
  const FINISH_SHOT = [{ high: true, height: 8.6, back: 6.2, ahead: 3.6, fov: 48 }, { high: true, height: 8.0, back: 6.5, ahead: 4.5, fov: 50 }, { high: true, height: 7.6, back: 7.4, ahead: 6.0, fov: 50 }];
  const RECAP_SHOT = [
    { radius: 6.5, height: 6.5, rate: 0.16, a0: -0.3, sweep: 0.3, lookY: 0.6, fov: 60 }, // over the landing, short of the first metronome
    { radius: 6.0, height: 4.2, rate: 0.16, a0: 0, sweep: 0.35, lookY: 0.8, fov: 50 },   // on the ramp past the maze, above the pencil's arms
  ];
  const shot = { mode: 'intro', botId: -1, t: 0, key: '', focus: new THREE.Vector3(), radius: 14, height: 6, rate: 0.1, a0: 0, sweep: 0, lookY: 0.6, fov: 45 };
  const userShot = { mode: 'follow', botId: 0, key: '' };
  let stagePhase = 'idle';
  let lastRaceShot = null;
  let raceShotUsed = null;

  function topRacing(st) {
    let best = null;
    for (const b of st.bots) if ((b.status === 'racing' || b.status === 'respawning') && (!best || b.place < best.place)) best = b;
    return (best ?? st.bots[st.leaderId ?? 0]).id;
  }

  function setShot(mode, key, extra) {
    shot.mode = mode; shot.key = key; shot.botId = -1; shot.t = 0; shot.sweep = 0; shot.a0 = 0;
    if (extra) Object.assign(shot, extra);
    return shot;
  }

  // How the zone shot's rig stands along the course: steeper among tall things, lifted over what
  // hangs above the track. { steep 0..1, lift metres } for the course position z of its target.
  const LZ = COURSE.layout;
  const zoneOut = { steep: 0, lift: 0 };
  function zoneProfile(z) {
    let steep = 0, lift = 0;
    if (z > LZ.rampZ1 - 4 && z < LZ.rampZ1 + 16) lift = 9;             // the marble chutes at the top of the bookshelf
    if (z >= LZ.plank1Z0 - 2 && z < LZ.landingZ1 - 2) steep = 0.45;     // the rulers: look down past the pencil gantries
    if (z >= LZ.landingZ1 - 2 && z < LZ.bridgeZ1 + 2) { steep = 0.35; lift = 4; } // the bridges: above the metronome pivots
    if (z >= LZ.mazeZ0 + 2 && z < LZ.mazeZ1 + 1) steep = 0.5;           // the block maze: over the walls (a block in the way goes see-through)
    if (z >= LZ.mazeZ1 + 1) steep = 0.5;                                // the final dash, over the pencil
    zoneOut.steep = steep; zoneOut.lift = lift;
    return zoneOut;
  }
  const inMaze = (z) => z > LZ.mazeZ0 && z < LZ.mazeZ1;

  // While racing the show director frames the fight at the cut line (camera/showDirector.js); the
  // viewer's mode can pin it to the leader, the line, their pick or the whole field.
  function raceShot(c, dt) {
    const rid = viewerMode === 'My pick' ? (viewerRid ?? pickRid) : pickRid;
    const slot = rid != null ? c.slotOf.get(rid) ?? -1 : -1;
    return c.director.update(dt, c.view, c.sim.state, viewerMode, slot);
  }

  // Line-up spotlight: the Gumbles nearest the middle of the grid walk's frame.
  const spotlight = [];
  const pv = new THREE.Vector3();
  const spotCand = [];
  function updateSpotlight(c) {
    spotlight.length = 0;
    if (!c || stagePhase !== 'lineup' || !c.lobby) return;
    camera.updateMatrixWorld();
    spotCand.length = 0;
    const v = c.view;
    for (let i = 0; i < c.N; i++) {
      if (v.botHidden[i]) continue;
      pv.set(v.botPos[i * 3], v.botPos[i * 3 + 1] + 0.7, v.botPos[i * 3 + 2]).project(camera);
      if (pv.z > 1 || Math.abs(pv.x) > 0.5 || Math.abs(pv.y) > 0.9) continue;
      spotCand.push(i, Math.abs(pv.x));
    }
    const ids = [];
    for (let k = 0; k < spotCand.length; k += 2) ids.push([spotCand[k], spotCand[k + 1]]);
    ids.sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < Math.min(2, ids.length); k++) spotlight.push(ids[k][0]);
    spotlight.sort((a, b) => a - b);
  }

  // around the Gumbles who went through (they stand just past the finish line)
  function recapShot(c, r) {
    const st = c.sim.state, v = c.view, f = info.finishPos;
    let n = 0, x = 0, y = 0, z = 0;
    for (const b of st.bots) {
      if (b.status !== 'qualified' || v.botHidden[b.id]) continue;
      x += v.botPos[b.id * 3]; y += v.botPos[b.id * 3 + 1]; z += v.botPos[b.id * 3 + 2]; n++;
    }
    if (n) shot.focus.set(x / n, y / n, z / n); else shot.focus.set(f.x, f.y, f.z + 2.5);
    return setShot('orbit', `recap:${r}`, RECAP_SHOT[r] || RECAP_SHOT[0]);
  }

  function chooseShot(phase, c, dt, now) {
    const r = c.round;
    switch (phase) {
      case 'idle': return setShot('intro', 'idle', { t: pingPong((now - idleSince.t) / 1000 / 22) });
      case 'call': {
        // the course from the air while the format is called, then the sixteen themselves on the start grid
        const tc = Math.max(0, now - show.startedAt) / 1000;
        if (tc < 5) return setShot('intro', `call:${show.match?.matchId}`, { t: 0.12 + tc / 18 });
        return setShot('gridtop', `callgrid:${show.match?.matchId}`, { t: clamp01((tc - 5) / 8), pitch: 0.7, pull: 0 });
      }
      case 'title': {
        // the round's stretch from the air, finish back to start, while its name is called
        const w = show.windows[show.windows.length - 1];
        return setShot('intro', `title:${r}:${w?.windowId}`, { t: 0.1 + 0.75 * clamp01((now - (w?.openedAt ?? now)) / TITLE_MS) });
      }
      case 'lineup': {
        const w = show.windows[show.windows.length - 1];
        return setShot('gridwalk', `lineup:${r}:${w?.windowId}`, { t: Math.max(0, now - (w?.openedAt ?? now) - TITLE_MS) / 1000, ...GRID_SHOT[r] });
      }
      case 'locked': {
        // the lock beat: off the faces, out to the whole grid from the front, held into the 3 2 1
        const ev = show.roundEv;
        const t0 = show.startedAt + (ev.at ?? 0);
        // it lands with the band: a fast push in from further out over the first half second
        const k = clamp01((now - t0) / 550), pull = 7 * (1 - k) * (1 - k);
        return setShot('gridtop', `start:${r}:${ev.seed}`, { t: 0.4 * clamp01((now - t0) / Math.max(1, c.startWall - t0)), pull, ...TOP_SHOT[r] });
      }
      case 'race': {
        if (c.sim.state.phase === 'countdown') return setShot('gridtop', `start:${r}:${show.roundEv?.seed}`, { t: 0.4 + 0.6 * clamp01(1 - c.sim.state.countdown / 3), ...TOP_SHOT[r] });
        const rs = raceShot(c, dt);
        // a runaway in the final is called out when the shot goes to the leader: how far clear it is
        const gap = c.director.leadGap;
        if (gap > 0 && !c.director.onChase && now - (c.gapCallAt ?? 0) > 6000 && c.sim.state.phase === 'race') {
          c.gapCallAt = now;
          const lead = c.sim.state.bots[c.sim.state.order[0]];
          raceHud.onEvent({ type: 'gap', tick: c.sim.tick, time: c.sim.state.time, importance: 1, botId: lead.id, text: `${lead.name} leads by ${Math.round(gap)} metres` });
        }
        // a small field leaves the line under the same high shot as the 3 2 1 (the chase camera would start inside the props behind the grid)
        if (rs.story === 'start' && c.N < 12) return setShot('gridtop', `start:${r}:${show.roundEv?.seed}`, { t: 1, ...TOP_SHOT[r] });
        if (rs.mode === 'finishline' && !rs.line) Object.assign(rs, FINISH_SHOT[r]);
        if (rs.mode === 'zone') rs.profile = zoneProfile;
        lastRaceShot = rs;
        return rs;
      }
      case 'cut': {
        // The cut is a moment: first a beat on the Gumble who just missed (in the final, on the
        // winner), then the finish line with the ones who are through.
        const fin = c.startWall + c.finishTick * MS_PER_TICK;
        const st = c.sim.state;
        const final = st.qualifyCount === 1;
        const who = final ? (st.bots.find((b) => b.status === 'qualified')?.id ?? -1) : c.firstOutId;
        // hold the race shot for a second past the line (the crossing, and whoever was chasing, in the same frame)
        // (the line camera holds only until the Gumble that crossed has run up to it)
        if (now - fin < (lastRaceShot?.line ? CUT_LINE_HOLD_MS : CUT_HOLD_MS) && lastRaceShot) return lastRaceShot;
        // (no close-up among the tall blocks, where a lens at head height ends up inside one: the race shot holds a little longer there)
        const blocked = who >= 0 && !final && inMaze(c.view.botPos[who * 3 + 2]);
        if (blocked) {
          // the beat goes to the Gumble who took the last place instead (it is past the line, clear of the blocks)
          const took = st.bots.find((b) => b.finishPlace === st.qualifyCount)?.id ?? -1;
          if (took >= 0 && !c.view.botHidden[took] && now - fin < CUT_HOLD_MS + CUT_BEAT_MS) return setShot('closeup', `cutbeat:${r}:${took}`, { botId: took });
          return recapShot(c, r);
        }
        if (who >= 0 && !c.view.botHidden[who] && (final || now - fin < CUT_HOLD_MS + CUT_BEAT_MS)) return setShot('closeup', `cutbeat:${r}:${who}`, { botId: who });
        return recapShot(c, r);
      }
      case 'recap': {
        if (!c.board) return recapShot(c, r);
        // square on to the shelf, easing in a little over the recap
        const tb = Math.max(0, now - (show.startedAt + (show.recapEv?.at ?? 0))) / 1000;
        const push = clamp01(tb / 8);
        return setShot('board', `board:${show.recapEv?.round}:${show.recapEv?.seed}`, { px: BOARD_FRAME.cx, py: BOARD_FRAME.cy + 0.6, pz: BOARD_FRAME.z + 18.2 - 1.0 * push, lx: BOARD_FRAME.cx, ly: BOARD_FRAME.cy + 0.55, lz: BOARD_FRAME.z, fov: 30 });
      }
      case 'result': {
        const st = c.sim.state;
        let win = -1;
        for (const b of st.bots) if (b.status === 'qualified' && (win < 0 || (b.finishPlace ?? 99) < (st.bots[win].finishPlace ?? 99))) win = b.id;
        if (win < 0) win = st.order[0] ?? 0;
        return setShot('orbit', `result:${show.match?.matchId}`, { botId: win, faceYaw: true, radius: 5.0, height: 1.7, rate: 0.35, a0: 0, sweep: 0.75, lookY: 0.75, fov: 42 });
      }
      default: return setShot('intro', 'none', { t: 0 });
    }
  }

  // ------------------------------------------------------------------ race HUD frame
  // Name tags: only on Gumbles a viewer can actually see (in frame, near enough, nothing solid in
  // the way, not faded for the lens), so a tag never floats over the wrong creature.
  const tagList = [];
  const tagPool = Array.from({ length: 8 }, () => ({ id: -1, kind: 'line', pick: false }));
  const onCam = new Set(); // slot ids named on screen this frame (the event line only talks about these)
  function seen(c, id) {
    const v = c.view;
    if (id < 0 || id >= c.N || v.botHidden[id]) return false;
    if (c.gumbles && c.gumbles.visibility[id] < 0.6) return false;
    const x = v.botPos[id * 3], y = v.botPos[id * 3 + 1] + 1.0, z = v.botPos[id * 3 + 2];
    pv.set(x, y, z).project(camera);
    if (pv.z > 1 || Math.abs(pv.x) > 0.97 || Math.abs(pv.y) > 0.97) return false;
    const cp = camera.position;
    const d2 = (x - cp.x) ** 2 + (y - cp.y) ** 2 + (z - cp.z) ** 2;
    // a tag on a speck in the distance names nothing (the final's side shot stands far back on a long lens)
    const far = raceShotUsed === 'sideline' ? 90 : id === (c.pickSlot ?? -1) ? 30 : 45;
    if (d2 > far * far) return false;
    if (inMaze(z) || raceShotUsed === 'finishline') return true; // the blocks there go see-through for the lens; the line camera has a clear view
    return sight.blocked(cp.x, cp.y, cp.z, x, y, z, v) < 0.5;
  }
  function addTag(c, id, kind) {
    for (let i = 0; i < tagList.length; i++) if (tagList[i].id === id) return;
    if (tagList.length >= tagPool.length || !seen(c, id)) return;
    const t = tagPool[tagList.length];
    t.id = id; t.kind = kind; t.pick = id === (c.pickSlot ?? -1);
    tagList.push(t);
  }
  const lineHid = [];
  function hudFrame(phase, c, now, s) {
    const st = c.sim.state;
    let hp = 'hidden';
    if (phase === 'race') hp = st.phase === 'countdown' ? 'countdown' : st.phase === 'race' ? 'race' : 'hidden';
    else if (phase === 'cut') hp = 'cut';
    tagList.length = 0;
    const pick = c.pickSlot ?? -1;
    if (hp === 'race') {
      const want = c.director.tags(st);
      for (let i = 0; i < want.length; i++) addTag(c, want[i].id, want[i].kind);
      if (pick >= 0 && st.bots[pick].status !== 'eliminated') addTag(c, pick, st.qualifyCount === 1 ? 'plain' : 'line');
      // nobody big in the picture goes unnamed
      const cp = camera.position, v = c.view;
      for (let i = 0; i < c.N && tagList.length < 6; i++) {
        if (st.bots[i].status !== 'racing') continue;
        const dx = v.botPos[i * 3] - cp.x, dy = v.botPos[i * 3 + 1] - cp.y, dz = v.botPos[i * 3 + 2] - cp.z;
        if (dx * dx + dy * dy + dz * dz < NEAR_TAG * NEAR_TAG) addTag(c, i, st.qualifyCount === 1 ? 'plain' : 'line');
      }
    } else if (hp === 'cut' && s.mode === 'closeup' && s.botId >= 0) {
      addTag(c, s.botId, st.bots[s.botId].status === 'qualified' ? 'plain' : 'out');
    }
    onCam.clear();
    for (let i = 0; i < tagList.length; i++) onCam.add(tagList[i].id);
    const cut = null; // no plate at the cut: the tower already says who is through and who is out
    return { phase: hp, state: st, view: c.view, camera, width: W, height: H, pickId: pick, tags: tagList, now: now / 1000, cut };
  }

  // ------------------------------------------------------------------ frame
  const PERF_N = 1200;
  const perfMs = new Float32Array(PERF_N);
  let perfCount = 0, perfIdx = 0, lastPhase = '';

  function frame(dt, render = true) {
    if (destroyed) return;
    const t0 = performance.now();
    const now = serverNow();
    let phase = resolve(now);
    const c = cast;
    advanceCast(c, dt, now);
    // a catch-up (joining mid-round) can carry the sim past the finish within this frame
    if (phase === 'race' && c.sim.state.phase === 'finished') phase = 'cut';
    if (phase !== lastPhase) {
      if (phase === 'idle') idleSince.t = now;
      if (phase === 'race') cams.cut();
      if (sound) { sound.setPhase(phase === 'locked' ? 'title' : phase === 'title' ? 'call' : phase, { round: c.round }); if (phase === 'result') sound.win(); if (phase === 'locked') sound.lock(); }
      lastPhase = phase;
    }
    stagePhase = phase;
    const st = c.sim.state;
    if (sound) {
      // the 3 2 1 pips, and the start clock's ticks over the last five seconds of a line-up
      if (phase === 'race' && st.phase === 'countdown') { const n = Math.ceil(st.countdown); if (n !== c.lastPip && n >= 1) { c.lastPip = n; sound.pip(n); } }
      if (phase === 'lineup') {
        const w = show.windows[show.windows.length - 1];
        const left = w ? Math.ceil((w.closesAt - now) / 1000) : 99;
        if (left !== c.lastPip && left >= 1 && left <= 5 && w.state === 'open') { c.lastPip = left; sound.tick(); }
      }
    }
    c.recorder.sample(st.tick - 1 + c.alpha, c.view);
    board.setVisible(!!c.board && phase === 'recap');
    if (c.board && phase === 'recap') applyBoard(c, Math.max(0, now - (show.startedAt + (show.recapEv?.at ?? 0))) / 1000);

    const s = chooseShot(phase, c, dt, now);
    raceShotUsed = s.mode;
    cams.update(dt, c.view, s);
    env.update(cams.focus, camera);
    courseView.update(c.view);
    courseView.cutaway(camera.position, c.view, dt, !!c.gumbles && (phase === 'race' || phase === 'cut'));
    if (c.gumbles) {
      // the pick's marker stays through every race camera; close-ups name the Gumble with a tag
      c.gumbles.setHighlight(s.mode === 'closeup' || s.mode === 'orbit' ? -1 : (c.pickSlot ?? -1));
      const subject = SUBJECT_SHOTS.has(s.mode) ? (s.botId ?? -1) : -1;
      if (SHOW_SHOTS.has(s.mode)) c.lensVis.fill(1); else cams.clearance(c.view, subject, c.lensVis);
      if (s.mode === 'finishline' && s.line) {
        // those already through stand past the line, between it and this lens: a moment after
        // crossing they step out of the picture
        const cp = camera.position;
        for (let i = 0; i < c.N; i++) {
          const b = st.bots[i];
          if (b.status !== 'qualified' || st.raceTime - (b.finishTime ?? st.raceTime) < 0.9) continue;
          const dx = c.view.botPos[i * 3] - cp.x, dz = c.view.botPos[i * 3 + 2] - cp.z;
          if (dx * dx + dz * dz < 100) { c.lensVis[i] = 0; if (c.gumbles.visibility[i] < 0.05 && !c.view.botHidden[i]) { c.view.botHidden[i] = 1; lineHid.push(i); } } // (hidden outright once faded, so no shadow is left standing there)
        }
        if ((c.pickSlot ?? -1) >= 0 && c.lensVis[c.pickSlot] === 0) c.gumbles.setHighlight(-1);
      }
      courseView.setPostsHide(s.mode === 'finishline' && !!s.line);
      courseView.setBannerVisible(!(s.mode === 'finishline' && (s.high || s.line)) && !(s.mode === 'zone' && s.nearFinish));
      c.gumbles.update(c.view, dt, c.lensVis, cams.didCut);
      while (lineHid.length) c.view.botHidden[lineHid.pop()] = 0;
    }
    camera.updateMatrixWorld();
    updateSpotlight(c);
    if (c.lobby) raceHud.update({ phase: 'hidden' });
    else raceHud.update(hudFrame(phase, c, now, s));
    // (the winner's card waits for the crossing to play)
    const finalCut = phase === 'cut' && st.qualifyCount === 1 && now - (c.startWall + c.finishTick * MS_PER_TICK) >= CUT_PLATE_MS + 200;
    const cf = cardsFrame(finalCut ? 'result' : phase === 'race' || phase === 'cut' ? 'none' : phase, now);
    if (phase === 'title' || (cf.phase === 'lineup' && cf.t < TITLE_MS / 1000)) spotlight.length = 0;
    cf.now = now / 1000; cf.camera = camera; cf.view = c.view; cf.width = W; cf.height = H;
    cards.update(cf);

    if (render) {
      env.render(camera);
      flushDisposals();
    }
    perfMs[perfIdx] = performance.now() - t0; perfIdx = (perfIdx + 1) % PERF_N; perfCount = Math.min(perfCount + 1, PERF_N);
  }

  // ------------------------------------------------------------------ loop
  let raf = 0, rafLast = 0;
  function loop(ts) {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = rafLast ? Math.min(0.1, (ts - rafLast) / 1000) : 1 / 60;
    rafLast = ts;
    frame(dt, true);
  }
  if (!capture) raf = requestAnimationFrame(loop);

  // ------------------------------------------------------------------ public API
  function setCamera(mode, entrantId) {
    if (!CAMERAS.includes(mode)) throw new Error(`unknown camera mode ${mode}`);
    viewerMode = mode;
    viewerRid = entrantId ?? null;
    cams.cut();
  }

  function highlight(entrantId) {
    pickRid = entrantId ?? null;
    applyPick();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    raceHud.destroy();
    cards.destroy();
    sound?.destroy();
    if (cast) retireCast(cast);
    cast = null;
    flushDisposals();
    courseView.dispose();
    board.dispose();
    env.dispose();
    disposeTree(scene);
    for (const t of Object.values(textures)) if (t && t.isTexture) t.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    el.classList.remove('tt-stage');
    el.style.removeProperty('--k');
    el.style.position = hadPosition;
  }

  function pct(p) {
    const a = Array.from(perfMs.subarray(0, perfCount)).sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))] : 0;
  }

  const debug = {
    frame,
    state() {
      const c = cast, st = c?.sim.state;
      return {
        phase: stagePhase, mode: show.mode, feedPhase: show.phaseFeed, matchId: show.match?.matchId ?? null,
        round: c ? c.round : null, castKey: c?.key ?? null, lobby: c?.lobby ?? null,
        tick: st?.tick ?? 0, simPhase: st?.phase ?? null, finishTick: c?.finishTick ?? -1,
        camera: viewerMode, shot: raceShotUsed, pick: pickRid, pickSlot: c?.pickSlot ?? -1,
        field: c ? c.sim.bots.map((b) => b.rid) : [],
        places: st ? st.order.map((id) => st.bots[id].rid) : [],
        through: st ? st.qualifiedCount : 0, qualify: st ? st.qualifyCount : 0,
        // for the dead-air tool: where the lens is, a sum over every Gumble's position, and how much text is up
        cam: [camera.position.x, camera.position.y, camera.position.z, cams.focus.x, cams.focus.y, cams.focus.z].map((v) => Math.round(v * 1000) / 1000),
        motion: c ? Math.round(Array.prototype.reduce.call(c.view.botPos, (a, v) => a + v, 0) * 100) / 100 : 0,
        text: (el.textContent || '').replace(/\d/g, '#'),
        spotlight: spotlight.slice(),
        serverNow: serverNow(),
      };
    },
    perf() {
      let sum = 0;
      for (let i = 0; i < perfCount; i++) sum += perfMs[i];
      const ri = renderer.info;
      let gl = '';
      try { const ctx = renderer.getContext(); const ext = ctx.getExtension('WEBGL_debug_renderer_info'); gl = ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER); } catch { /* ignore */ }
      return {
        frames: perfCount, meanMs: perfCount ? sum / perfCount : 0, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: pct(1),
        castBuildMs: castBuildMs.slice(), drawCalls: ri.render.calls, triangles: ri.render.triangles,
        geometries: ri.memory.geometries, textures: ri.memory.textures, programs: ri.programs?.length ?? 0, glRenderer: gl,
      };
    },
    perfReset() { perfCount = 0; perfIdx = 0; castBuildMs = []; },
    three: { renderer, scene, camera },
    env,
    soundLog: () => (sound && sound.log) || null,
  };

  /** Extra to the contract: 0..1. Sound starts after the first click or key press on the page. */
  const setVolume = (v) => sound?.setVolume(v);
  // the site calls this once the browser allows sound (a click or key anywhere on the page)
  const unlockAudio = () => sound?.unlock?.();

  return { onFeed, cameras: CAMERAS.slice(), setCamera, highlight, setVolume, unlockAudio, destroy, debug };
}
