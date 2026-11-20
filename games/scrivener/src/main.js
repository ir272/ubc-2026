// Boot, fixed-timestep 60Hz simulation + rAF render, query params, window.__game.
// Owner: core.
//
// Query params:
//   ?seed=N          deterministic match seed (default: time-based)
//   ?speed=X         sim speed multiplier (e.g. 20 to fast-forward a mock match)
//   ?mock=1          force mock brains for both challengers
//   ?brainA=<model|mock>  Claude slot model (default anthropic/claude-haiku-5.5)
//   ?brainB=<model|mock>  GPT slot model (default openai/gpt-6-luna)
//   ?scenario=<name> jump to a named capture moment and pause (see src/scenarios.js)
//   ?offset=ms       with ?scenario: shift the moment (negative = earlier)
//   ?hud=0           hide the HUD;  ?debug=1 draw hitboxes;  ?mute=1 no audio
//
// window.__game: step(ms), render(), scenario(name, opts), state(), setPaused(bool),
//   setSpeed(x), snapshot(native?) -> PNG dataURL (1280x720, or the backing size), scenarios, ready, perf

import { W, H, TICK_MS, GROUND_Y, DEFAULT_MODELS } from './core/constants.js';
import { createBus } from './core/events.js';
import { createFixedStep } from './core/timestep.js';
import { createMatch, tickMatch, summarizeMatch } from './sim/match.js';
import { summarizeWorld } from './sim/world.js';
import { agentHurtbox, agentAttackBox } from './sim/agent.js';
import { bossHurtbox } from './sim/combat.js';
import { createBrainDriver, createMockBrains, LLMBrain, MockBrain, agentController, CREDITS_NOTICE } from './ai/brain.js';
import { drawArena, drawArenaFront, setArenaScale } from './render/arena.js';
import { drawBoss, drawHazards, drawCurseMark } from './render/boss_draw.js';
import { drawAgent } from './render/agent_draw.js';
import { offscreen, paper } from './render/ink.js';
import { createFx } from './fx/index.js';
import { PAGE_IN_MS } from './fx/freeze_panel.js';
import { createHud } from './ui/hud.js';
import { createAudio } from './audio/audio.js';
import { SCENARIOS, SCENARIO_NAMES } from './scenarios.js';
import { loadCredits, mountCredits, rollLines } from './ui/credits.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && params.get(k) !== '' && !isNaN(+params.get(k)) ? +params.get(k) : d);
const SEED = num('seed', Math.floor(Date.now() % 1e6));
let speed = num('speed', 1);
const FORCE_MOCK = params.get('mock') === '1';
const SCENARIO = params.get('scenario');
const DEBUG = params.get('debug') === '1';
const SHOW_HUD = params.get('hud') !== '0';
const MODELS = { claude: params.get('brainA') || DEFAULT_MODELS.claude, gpt: params.get('brainB') || DEFAULT_MODELS.gpt };

// ---- canvas + letterboxing --------------------------------------------------
// The game draws in a fixed 1280x720 logical space. The backing store is sized to the
// canvas's DISPLAYED size x devicePixelRatio (so a 1080p / 1440p / retina window is
// drawn at its real resolution, not upscaled from 1280x720), and render() maps logical
// px onto it with one ctx scale. Capped at 3840x2160 backing pixels.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const MAX_BACKING_W = 3840;
let SCALE = 1; // backing px per logical px
const frameBuf = offscreen(W, H);
const frameCtx = frameBuf.getContext('2d');
let frameFor = null; // the thinking freeze frameBuf currently holds

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cssW = Math.max(16, Math.floor(W * s));
  const cssH = Math.max(9, Math.floor(H * s));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // 16:9 in whole pixels: backing = 16m x 9m, so one uniform scale fills it exactly
  const m = Math.max(1, Math.min(MAX_BACKING_W / 16, Math.round((cssW * dpr) / 16)));
  const bw = 16 * m, bh = 9 * m;
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  SCALE = bw / W;
  setArenaScale(SCALE);
}
let dprQuery = null;
function watchDpr() {
  // moving the window to a screen with another pixel ratio does not always fire 'resize'
  if (dprQuery) dprQuery.removeEventListener('change', onResize);
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  dprQuery.addEventListener('change', onResize);
}
function onResize() {
  fit();
  watchDpr();
  if (match) render(); // resizing clears the canvas; repaint now (matters while paused)
}
window.addEventListener('resize', onResize);
fit();
watchDpr();

// ---- systems ------------------------------------------------------------------
const bus = createBus();
const fx = createFx(bus);
let hud = createHud();
const audio = createAudio({ muted: params.get('mute') === '1' });
audio.attach(bus);
audio.init();
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// every finished attempt across matches (the match itself resets after a kill)
const lifetime = [];
bus.on('match.death', (e) => lifetime.push({ matchNo: match.matchNo, attempt: e.attempt, agent: e.agent, result: 'death', killedBy: e.killedBy && e.killedBy.attackId }));
bus.on('match.victory', (e) => lifetime.push({ matchNo: match.matchNo, attempt: e.attempt, agent: e.agent, result: 'kill' }));
// (qa2) a reflection that could not be used (unreadable, cut off, timed out) is logged, not dropped
bus.on('match.reflected', (e) => {
  if (!e.statusText) return;
  const rec = lifetime.findLast((x) => x.agent === e.agent && x.attempt === e.attempt && x.result === 'death');
  if (rec) rec.reflection = e.status;
  console.info('[match]', `match ${match.matchNo} attempt ${e.attempt} ${e.agent}: ${e.statusText}`);
});

// credits: the page link + sheet, and short lines for the victory card's credits roll
mountCredits(document);
let creditLines = [];
loadCredits().then((c) => { creditLines = rollLines(c); });

const notices = [];
let banner = null; // a standing HUD notice (LLM credits gone); the match keeps running on mock
const notice = (msg, { kind } = {}) => {
  if (kind === 'credits') banner = msg;
  if (notices[notices.length - 1] !== msg) { notices.push(msg); if (notices.length > 4) notices.shift(); }
  console.info('[brain]', msg);
};

let match;
let driver;
let renderT = 0;      // render clock in sim ms (deterministic)
let paused = false;
let view = { actors: true, hud: SHOW_HUD, intro: true };

function makeBrains(useMock) {
  if (useMock) return createMockBrains(SEED);
  const mk = (id) => (MODELS[id] === 'mock'
    ? new MockBrain({ agentId: id, seed: SEED })
    : new LLMBrain({ agentId: id, model: MODELS[id] }));
  return { claude: mk('claude'), gpt: mk('gpt') };
}

function newMatch(seed, brains, decisions = true) {
  match = createMatch({ seed, decisions });
  driver = createBrainDriver({ brains, instant: false, now: () => performance.now(), seed, onNotice: notice });
  fx.reset();
  hud = createHud();
}

function drain() {
  const w = match.world;
  if (w.events.length) { bus.dispatch(w.events); w.events.length = 0; }
  if (match.events.length) { bus.dispatch(match.events); match.events.length = 0; }
}

function simTick(dt) {
  tickMatch(match, dt, agentController);
  driver.service(match);
  drain();
  fx.tick(dt);
  hud.tick(dt, match);
  renderT += dt;
}
const stepper = createFixedStep(simTick, TICK_MS);

// ---- render ---------------------------------------------------------------------
function drawDebug(c, w) {
  const box = (r, color) => {
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.strokeRect(r.x0, GROUND_Y - r.y1, r.x1 - r.x0, r.y1 - r.y0);
  };
  box(bossHurtbox(w.boss), '#06c');
  box(agentHurtbox(w.agent), w.agent.iframes ? '#0c0' : '#06c');
  const ab = agentAttackBox(w.agent);
  if (ab) box(ab, '#f80');
  for (const h of w.hazards) if (h.damage > 0) box(h, h.age < h.delay ? '#c6c' : '#e00');
  c.fillStyle = '#e00';
  c.font = '12px monospace';
  c.fillText(`boss ${w.boss.state} ${w.boss.attackId || ''} t=${Math.round(w.boss.stateT)} poise=${Math.round(w.boss.poise)}  agent ${w.agent.state} plan=${w.agent.plan ? w.agent.plan.action + '/' + w.agent.plan.timing : '-'}`, 20, 700);
}

function drawWorld(c) {
  const w = match.world;
  const cm = c.getTransform();
  const sh = fx.shakeOffset(Math.hypot(cm.a, cm.b) || 1);
  // (perf r1) an inverted impact beat / death card paints over the whole frame: drawing the
  // world under it was ~8 ms of wasted raster on every hit frame
  const covered = !w.thinking && fx.covers();
  c.save();
  c.translate(sh.x, sh.y);
  if (!covered) {
    drawArena(c, w, renderT);
    fx.drawBehind(c, w, renderT);
    if (view.actors) {
      drawBoss(c, w, renderT);
      drawHazards(c, w, renderT);
      drawAgent(c, w, renderT);
      drawCurseMark(c, w, renderT);
    }
    fx.drawFront(c, w, renderT);
    drawArenaFront(c, w, renderT);
    if (DEBUG) drawDebug(c, w);
  }
  c.restore();
  if (fx.drawPost) fx.drawPost(c, w, renderT); // screen-space impact frames / cards (feedback)
}

// (qa2) The first thinking freeze of a session paid one-off costs on top of building its page
// (a ~60 ms frame): the panel bitmaps and their first raster, the Scrivener's contour masks
// at the panels' zoom, the lettering's glyphs. One throwaway freeze page is drawn at boot,
// before the first frame is shown, so the real freezes only do their per-freeze work.
// Render-only: the sim never sees the stand-in `thinking`; render() repaints the canvas next.
function warmFreeze() {
  const w = match.world;
  if (w.thinking) return;
  const b = w.boss;
  w.thinking = { attackId: b.attackId, pose: 'warm-up', startT: w.t, elapsed: 1e4 };
  try { render(); render(); } finally { w.thinking = null; frameFor = null; } // 2nd: the panels
  // the same for the first hit's impact beat
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  fx.warm(ctx, w, renderT);
}

function labels() {
  return { claude: driver.label('claude'), gpt: driver.label('gpt') };
}

function render() {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const w = match.world;
  if (w.thinking) {
    // render the world into a buffer, then re-cut it into manga panels.
    // (perf r1) time is stopped for the whole freeze, so the world frame is rendered once
    // per freeze; once the paper page is opaque the frame itself is not drawn underneath.
    let fresh = false;
    if (frameFor !== w.thinking) {
      frameCtx.setTransform(1, 0, 0, 1, 0, 0);
      frameCtx.clearRect(0, 0, W, H);
      drawWorld(frameCtx);
      frameFor = w.thinking;
      fresh = true;
    }
    if (w.thinking.elapsed < PAGE_IN_MS) ctx.drawImage(frameBuf, 0, 0, W, H);
    // fresh: the world frame was rendered this frame, so the panels wait for the next one
    fx.drawOverlay(ctx, match, frameBuf, { brainLabel: driver.label(match.current), fresh }, renderT);
  } else {
    drawWorld(ctx);
  }
  if (view.hud) hud.draw(ctx, match, { labels: labels(), notices: banner ? notices.filter((n) => n !== banner) : notices, banner, credits: creditLines, intro: view.intro }, renderT);
}

// ---- main loop ---------------------------------------------------------------
const perf = { frames: [], work: [], max: 4000 };
let last = performance.now();
function frame(now) {
  const dtReal = Math.min(250, now - last);
  last = now;
  performance.mark('frame-start');
  const t0 = performance.now();
  if (!paused) stepper.advance(dtReal * speed, 2400);
  render();
  const work = performance.now() - t0;
  performance.mark('frame-end');
  performance.measure('frame', 'frame-start', 'frame-end');
  perf.frames.push(now);
  perf.work.push(work);
  if (perf.frames.length > perf.max) { perf.frames.shift(); perf.work.shift(); }
  if (performance.getEntriesByName('frame').length > 6000) performance.clearMeasures('frame');
  requestAnimationFrame(frame);
}

// ---- scenarios ----------------------------------------------------------------
function runScenario(name, { offsetMs = 0 } = {}) {
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`unknown scenario "${name}". Known: ${SCENARIO_NAMES.join(', ')}`);
  const reset = () => {
    newMatch(7, createMockBrains(7), !!sc.decisions);
    renderT = 0;
    stepper.reset();
    view = { actors: sc.actors !== false, hud: SHOW_HUD && sc.hud !== false, intro: false };
    sc.setup(match, { setBrain: (id, brain) => { driver.brains[id] = brain; } });
  };
  const stepMs = (ms) => { const n = Math.round(ms / TICK_MS); for (let i = 0; i < n; i++) simTick(TICK_MS); };
  reset();
  let elapsed = 0;
  if (sc.untilEvent) {
    let hit = false;
    const off = bus.onAny((e) => { if (sc.untilEvent(e)) hit = true; });
    while (!hit && elapsed < 20000) { simTick(TICK_MS); elapsed += TICK_MS; }
    off();
    if (!hit) console.error(`scenario ${name}: moment never happened`);
    stepMs(sc.plusMs || 0);
    elapsed += Math.round((sc.plusMs || 0) / TICK_MS) * TICK_MS;
  } else {
    stepMs(sc.afterMs || 0);
    elapsed = Math.round((sc.afterMs || 0) / TICK_MS) * TICK_MS;
  }
  if (offsetMs < 0) {
    reset();
    stepMs(Math.max(0, elapsed + offsetMs));
  } else if (offsetMs > 0) stepMs(offsetMs);
  paused = true;
  render();
  return { name, momentMs: Math.round(elapsed) };
}

// ---- boot ------------------------------------------------------------------------
async function proxyUsable() {
  try {
    const r = await fetch('/api/spend', { cache: 'no-store' });
    if (!r.ok) return { ok: false, why: `proxy http ${r.status}` };
    const j = await r.json();
    if (j.spentUsd >= j.budgetUsd) return { ok: false, why: 'LLM budget spent', credits: true };
    if (!j.keyLoaded) return { ok: false, why: 'no API key on server' };
    return { ok: true };
  } catch {
    return { ok: false, why: 'proxy unreachable' };
  }
}

async function boot() {
  let useMock = FORCE_MOCK || !!SCENARIO;
  if (!useMock && (MODELS.claude !== 'mock' || MODELS.gpt !== 'mock')) {
    const p = await proxyUsable();
    if (!p.ok) {
      useMock = true;
      if (p.credits) notice(CREDITS_NOTICE, { kind: 'credits' });
      else notice(`using mock brains: ${p.why}`);
    }
  }
  newMatch(SEED, makeBrains(useMock));
  // (perf r1) build the freeze page's paper sheet now: built lazily, the grain pass made the
  // first thinking freeze of a session a ~20 ms frame
  paper(W, H, { seed: 31 });
  warmFreeze();
  window.__game = {
    ready: false,
    step(ms) { stepper.advance(ms); render(); return this.state(); },
    render() { render(); },
    scenario(name, opts = {}) { return runScenario(name, opts); },
    state() {
      return {
        seed: SEED, speed, paused, renderT: Math.round(renderT),
        brains: labels(), kinds: { claude: driver.kind('claude'), gpt: driver.kind('gpt') },
        ...summarizeMatch(match), world: summarizeWorld(match.world), notices: [...notices], banner,
        lifetime: lifetime.slice(-200),
      };
    },
    setPaused(v) { paused = !!v; },
    setSpeed(v) { speed = +v || 1; },
    snapshot(native = false) {
      // native: the real backing store (e.g. 2560x1440 on a 2x display), not downscaled
      const c = native ? offscreen(canvas.width, canvas.height) : offscreen(W, H);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
    scenarios: SCENARIO_NAMES,
    perf,
    audio,
    get match() { return match; },
  };
  if (SCENARIO) runScenario(SCENARIO, { offsetMs: num('offset', 0) });
  render();
  window.__game.ready = true;
  requestAnimationFrame((t) => { last = t; frame(t); });
}

boot().catch((e) => { console.error(e); });
