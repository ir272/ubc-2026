// The stage: one canvas that draws the whole show from feed messages alone. Owner: lead.
//
//   const stage = createStage(el, { assetsBase });
//   stage.onFeed(msg)            every feed message, in order (a snapshot first)
//   stage.highlight(entrantId)   the viewer's pick, marked quietly
//   stage.destroy()
//
// Five phases, five grounds: the call (night ledger), the choosing (open book), the tape
// (poster), the fight (the hall), the verdict (oxblood). A viewer who joins at any second
// lands in the right one, as far along as it really is.

import { TICK_MS } from '../core/constants.js';
import { createBus } from '../core/events.js';
import { createFx } from '../fx/index.js';
import { createAudio } from '../audio/audio.js';
import { musicState, musicCall } from '../audio/cues.js';
import { MAX_ATTEMPTS_EACH } from '../show/rules.js';
import { setArenaScale } from '../render/arena.js';
import { createFeed } from './feed.js';
import { createFightView } from './fight.js';
import { drawFightHud } from './fight_hud.js';
import { callScene } from './scenes/call.js';
import { choosingScene } from './scenes/choosing.js';
import { tapeScene } from './scenes/tape.js';
import { verdictScene } from './scenes/verdict.js';
import { W, H, CREAM, RED, nightGround, title, text, ital, titleCall, TITLE_CALL_MS } from './kit.js';
import { nibEmblem } from '../ui/ornament.js';
import { modelLabel } from '../show/bots.js';
import { audioManifest, audioUrl } from './assets.js';

const SCENES = { call: callScene, choosing: choosingScene, tape: tapeScene, verdict: verdictScene };
const MAX_BACKING_W = 2560;

export function createStage(el, opts = {}) {
  // ---- dom ------------------------------------------------------------------------------
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:100%;height:100%;background:#070606;overflow:hidden;display:flex;align-items:center;justify-content:center;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;background:#0b0a09;';
  canvas.setAttribute('aria-label', 'Inkelton: two models take turns at an ink-drawn boss');
  wrap.appendChild(canvas);
  el.appendChild(wrap);
  const ctx = canvas.getContext('2d');
  let SCALE = 1;

  function fit() {
    const cw = wrap.clientWidth || el.clientWidth || W, chh = wrap.clientHeight || el.clientHeight || H;
    const s = Math.min(cw / W, chh / H) || 1;
    const cssW = Math.max(16, Math.floor(W * s)), cssH = Math.max(9, Math.floor(H * s));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const m = Math.max(1, Math.min(MAX_BACKING_W / 16, Math.round((cssW * dpr) / 16)));
    const bw = 16 * m, bh = 9 * m;
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    SCALE = bw / W;
    setArenaScale(SCALE);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { fit(); draw(); }) : null;
  if (ro) ro.observe(wrap);
  fit();

  // ---- systems ----------------------------------------------------------------------------
  const bus = createBus();
  const fx = createFx(bus);
  const audio = createAudio({
    base: `${opts.assetsBase || ''}assets/audio/`, manifest: audioManifest, resolve: audioUrl, muted: !!opts.muted,
  });
  audio.attach(bus);
  audio.init();
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  const feed = createFeed();
  const s = feed.s;
  let highlight = null;
  let renderT = 0;
  let raf = 0, last = 0, dead = false;

  const cue = (name, data = {}) => bus.dispatch([{ type: `show.${name}`, t: renderT, tick: 0, ...data }]);
  const scene = () => audio.setScene(s.show.phase || 'call');
  const botOf = (id) => {
    const b = s.bots[id] || { id, name: String(id || '?'), model: '', look: {} };
    return {
      id, name: b.name, model: b.model, modelLabel: modelLabel(b.model), scripted: b.brain === 'mock',
      accent: (b.look && b.look.accent) || '#c4612f', record: b.record || { played: 0, wins: 0 }, byClass: b.byClass || {}, h2h: b.h2h || { played: 0, wins: 0 }, vsBoss: b.vsBoss || { tries: 0, kills: 0, avg: 0 }, last: b.last || null,
    };
  };
  const fight = createFightView({ bus, fx, accentOf: (id) => botOf(id).accent, onCue: cue });

  // The fight's score follows the show (sound, round 10): every bus event goes through the music
  // director in cues.js (the try number, the stroke of the name, the kill, the fall) and what it
  // returns moves audio.setIntensity. Pure and deterministic: tools/audio_match.mjs replays it.
  const music = musicState();
  bus.onAny((e) => {
    if (e.type === 'match.attempt') { music.total = Math.max(2, s.show.order.length || 2) * MAX_ATTEMPTS_EACH; music.strokes = s.show.strokes || 6; }
    const c = musicCall(e, music);
    if (c) audio.setIntensity(c.level, c);
  });

  const serverNow = () => Date.now() + (s.offset || 0);
  const matchMs = () => (s.match ? serverNow() - s.match.startedAt : 0);
  const sinceMs = (at) => (at == null ? 0 : matchMs() - at);

  function windowsByKind() {
    let who = null, attempt = null;
    for (let i = s.winOrder.length - 1; i >= 0 && !(who && attempt); i--) {
      const w = s.windows.get(s.winOrder[i]);
      if (!w) continue;
      if (w.outcomes && w.outcomes.length === 2) { if (!who) who = w; } else if (!attempt) attempt = w;
    }
    return { who, attempt };
  }

  // The attempt a replay needs: its record (seed, slots) and the build it was fought with.
  function replaySource(index) {
    const rec = s.show.attempts.find((a) => a.index === index);
    if (!rec) return null;
    return { rec, loadout: s.show.loadouts[rec.entrantId], temper: s.show.temper };
  }

  // ---- the feed ---------------------------------------------------------------------------
  function resumeFight() {
    const sh = s.show;
    fight.reset();
    if (sh.phase !== 'fight' || !sh.current) return;
    const cur = sh.current;
    if (cur.startAt != null && cur.seed != null) {
      fight.resume({ ...cur, at: cur.startAt }, sh.decisions[cur.index] || [], sinceMs);
      // a late joiner hears the score as far along as the try is
      const k = fight.info().strokeK;
      const c = k ? musicCall({ type: 'name.stroke', k }, music) : null;
      if (c) audio.setIntensity(c.level, c);
    } else fight.standby({ index: cur.index, entrantId: cur.entrantId, n: cur.n }, sh.loadouts[cur.entrantId], sh.temper);
  }

  function onFeed(msg) {
    const news = feed.apply(msg);
    for (const n of news) {
      if (n.kind === 'snapshot') { resumeFight(); scene(); continue; }
      if (n.kind === 'match') { fight.reset(); continue; }
      if (n.kind === 'window') {
        // which prediction: 'who' wins the match (two outcomes) or how far this 'try' gets
        const w = s.windows.get(n.windowId);
        cue(`window.${n.what}`, { kind: w && w.outcomes && w.outcomes.length === 2 ? 'who' : 'try' });
        continue;
      }
      if (n.kind !== 'event' || n.catchup) continue;
      const d = n.data;
      switch (n.type) {
        case 'phase': cue('phase', { kind: d.phase }); scene(); break;
        case 'temper': cue('temper'); break;
        case 'offer': cue('offer'); break;
        case 'pick': cue('pick'); break;
        case 'attempt.ready': fight.standby({ index: d.index, entrantId: d.entrantId, n: d.n }, s.show.loadouts[d.entrantId], s.show.temper); cue('ready'); break;
        case 'attempt.start': fight.begin({ ...d, at: n.at }); cue('bell'); break;
        case 'decide.made': fight.onMade(d); break;
        case 'attempt.end': fight.onEnd(d); cue('attempt.end', { kind: d.result }); break;
        case 'note': cue('note'); break;
        case 'verdict': cue('verdict'); break;
        case 'line': cue('line'); break;
      }
    }
  }

  // ---- drawing ----------------------------------------------------------------------------
  function standbyCard() {
    nightGround(ctx);
    ctx.save();
    nibEmblem(ctx, W / 2, 250, 0.6, { color: RED, bg: '#0b0a09' });
    ctx.restore();
    title(ctx, 'INKELTON', W / 2, 420, 54, { color: CREAM, spacing: 20 });
    text(ctx, 'Next match soon', W / 2, 474, ital(28), { color: '#9c9483', align: 'center' });
  }

  function env() {
    const sh = s.show;
    const now = serverNow();
    const ms = matchMs();
    const { who, attempt } = windowsByKind();
    return {
      s, sh, ms, age: ms - sh.phaseAt, t: renderT, serverNow: now, highlight, bot: botOf,
      whoWindow: who, attemptWindow: attempt, lastAttemptWindow: attempt, fight: {
        drawReplay: (c, box, index, age) => fight.drawReplay(c, box, index, age, replaySource),
      },
    };
  }

  function draw() {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const e = env();
    const phase = e.sh.phase;
    if (!s.match || !phase) { standbyCard(); return; }
    if (phase === 'fight') {
      fight.draw(ctx, { highlight });
      drawFightHud(ctx, e, fight.info());
    } else {
      const scene = SCENES[phase];
      if (scene) scene.draw(ctx, e); else standbyCard();
    }
    if (e.age >= 0 && e.age < TITLE_CALL_MS) titleCall(ctx, phase, e.age, { dark: phase === 'call' });
  }

  function frame(now) {
    if (dead) return;
    const dt = Math.min(250, now - last);
    last = now;
    renderT += dt;
    fight.update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame((t) => { last = t; frame(t); });

  return {
    onFeed,
    highlight(id) { highlight = id || null; },
    // the site owns the sound control: master volume 0 to 1, and the go-ahead once the page has had a gesture
    setVolume(v) { audio.setVolume(v); },
    unlockAudio() { audio.unlock(); },
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      audio.setMuted(true);
      wrap.remove();
    },
    // for the harness and the capture tools
    debug: {
      state: () => ({ phase: s.show.phase, ms: Math.round(matchMs()), age: Math.round(matchMs() - s.show.phaseAt), fight: { mode: fight.info().mode, k: fight.info().strokeK, debt: Math.round(fight.info().debt) }, music: audio.intensity, attempts: s.show.attempts.length, matchNo: s.show.matchNo, runnerPhase: s.runnerPhase }),
      feed, fight, audio, canvas,
      setMuted: (v) => audio.setMuted(v),
    },
  };
}
