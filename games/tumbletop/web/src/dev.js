// Dev page: mounts the stage exactly as the platform does (index.ts -> mount) and drives whole
// shows through a local fake Show, in a loop. Everything outside #stage stands in for the site.
//
// URL: ?seed=7 (fixes the show)  &bets=12 (seconds per betting window; 0 = the real 40/30/30)
//      &pick=juniper  &cam=Director|Leader|Cut line|My pick|Overview
//      &capture=1 (virtual time: nothing moves until window.__tt.advance(ms) is called)
//      &at=95 (capture only: fast-forward the show to this second before the first frame)
//      &idle=10 (seconds with no match before the first show)
import { mount } from '../../index.ts';
import { realClock, virtualClock } from '../../show/clock.js';
import { createFakeShow } from '../../show/fakeShow.js';
import { runShow, DEFAULT_TIMINGS } from '../../show/script.js';
import { emptyRecords, pickEntrants, applyShow } from '../../show/records.js';
import { Rng } from '../../sim/rng.js';
import { SIM_HASH } from '../../show/simHash.js';
import { ROSTER } from '../../sim/roster.js';
import { createSim, seedToUint32, COUNTDOWN_TIME, ROUNDS } from '../../sim/index.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);
const CAPTURE = params.get('capture') === '1';
const seed0 = num('seed', (Date.now() % 100000) + 1);
const bets = num('bets', 12);
if (CAPTURE) document.body.classList.add('capture');

const clock = CAPTURE ? virtualClock() : realClock();
const stageEl = document.getElementById('stage');
const SOUNDLOG = params.get('soundlog') === '1'; // capture only: record the sound calls for tools/sound.mjs
const FINAL_SIDE = params.has('finalside') ? (params.get('finalside') === 'all' ? 'all' : params.get('finalside') !== '0') : undefined; // A/B: the final's shot (0 = tracking shot, all = all four side-on to the line)
let handle = mount(stageEl, { assetsBase: '/', clock, capture: CAPTURE, soundLog: SOUNDLOG, finalSide: FINAL_SIDE });
// as the site does: the first click or key anywhere on the page unlocks sound (CONTRACT.md, sound hooks)
let audioOk = false;
const unlock = () => { audioOk = true; handle.unlockAudio?.(); };
document.addEventListener('pointerdown', unlock, { passive: true });
document.addEventListener('keydown', unlock, { passive: true });
let pick = params.get('pick') || null;
let cam = params.get('cam') || 'Director';
if (pick) handle.highlight(pick);
handle.setCamera(cam, pick || undefined);

const timings = { ...DEFAULT_TIMINGS };
if (bets > 0) timings.betMs = [bets * 1000, bets * 1000, bets * 1000];
if (params.has('call')) timings.callMs = num('call', 12) * 1000;

const records = emptyRecords();
// A little history so the line-up has records to show (dev only): 30 shows of plausible results.
{
  const r = new Rng(99);
  for (let i = 0; i < 30; i++) {
    const ids = pickEntrants(records, () => r.next());
    const sh = r.shuffle(ids.slice());
    applyShow(records, { entrants: ids, rounds: [{ qualified: sh.slice(0, 8) }, { qualified: sh.slice(0, 4) }], winnerId: sh[0] });
  }
}

let fake = null, showNo = 0, lastResult = null, showStart = 0;
const feed = (m) => handle.onFeed(m);

async function loop() {
  // ?idle=N: hold N seconds with no match first (the stage's idle state), as the site does before a channel's first show
  if (num('idle', 0) > 0) await clock.sleep(num('idle', 0) * 1000);
  for (;;) {
    const seed = seed0 + showNo;
    const rng = new Rng(seed);
    fake = createFakeShow({ clock, onFeed: feed, seed });
    const entrants = pickEntrants(records, () => rng.next());
    showNo++;
    showStart = clock.now();
    lastResult = await runShow(fake.show, { entrants, records, simHash: SIM_HASH, matchId: `tt-dev-${seed}`, title: 'Goober Guys', timings, intermissionMs: 5000 });
    applyShow(records, lastResult);
    fake.intermission();
    await clock.sleep(5000);
  }
}

// ------------------------------------------------------------------ platform stand-ins (dev only)
const bar = document.getElementById('bar');
const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => fn(b); bar.appendChild(b); return b; };
const camBtns = handle.cameras.map((m) => btn(m, () => setCam(m)));
function setCam(m) { cam = m; handle.setCamera(m, pick || undefined); camBtns.forEach((b, i) => b.classList.toggle('on', handle.cameras[i] === m)); }
const sel = document.createElement('select');
sel.innerHTML = '<option value="">no pick</option>' + ROSTER.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
sel.value = pick || '';
sel.onchange = () => { pick = sel.value || null; handle.highlight(pick); if (cam === 'My pick') handle.setCamera(cam, pick || undefined); };
bar.appendChild(sel);
btn('Rejoin (remount from a snapshot)', () => rejoin());
const status = document.createElement('span'); status.id = 'status'; bar.appendChild(status);
setCam(cam);

/** What a viewer who opens the page mid-show gets: a fresh stage and one snapshot. */
function rejoin() {
  handle.destroy();
  handle = mount(stageEl, { assetsBase: '/', clock, capture: CAPTURE });
  if (audioOk) handle.unlockAudio?.();
  if (pick) handle.highlight(pick);
  handle.setCamera(cam, pick || undefined);
  if (fake) handle.onFeed(fake.snapshot());
}

if (!CAPTURE) setInterval(() => { status.textContent = `seed ${seed0 + showNo - 1}  show ${showNo}  t ${((clock.now() - showStart) / 1000).toFixed(0)} s`; }, 500);

// ------------------------------------------------------------------ tools API
const FRAME = 1000 / 60;
window.__tt = {
  ready: false,
  seed: seed0,
  clock,
  /** Capture mode: move the show and the stage forward together. render=false skips drawing (fast-forward). */
  async advance(ms, { render = true } = {}) {
    const n = Math.max(1, Math.round(ms / FRAME));
    for (let i = 0; i < n; i++) {
      await clock.advance(FRAME);
      handle.debug.frame(1 / 60, render && i === n - 1 ? true : render === 'all');
    }
    return this.state();
  },
  showTime: () => (clock.now() - showStart) / 1000,
  state: () => ({ showTime: (clock.now() - showStart) / 1000, showNo, lastResult, ...handle.debug.state() }),
  setCamera: (m, id) => { cam = m; if (id) pick = id; handle.setCamera(m, id || pick || undefined); },
  highlight: (id) => { pick = id; handle.highlight(id); },
  rejoin,
  /** tools/sound.mjs: render the recorded sound calls (seconds a..b of the clock) to 16-bit stereo WAV, base64. */
  async renderAudio(a, b) {
    const { renderSoundLog } = await import('./show/sound.js');
    const log = handle.debug.soundLog() || [];
    const base = showStart / 1000;
    const { sampleRate, samples, right } = await renderSoundLog(log, { from: base + a, to: base + b });
    const pcm = new Int16Array(samples.length * 2); // interleaved left, right
    const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    for (let i = 0; i < samples.length; i++) { pcm[i * 2] = q(samples[i]); pcm[i * 2 + 1] = q((right ?? samples)[i]); }
    const head = new DataView(new ArrayBuffer(44));
    const wr = (o, str) => { for (let i = 0; i < str.length; i++) head.setUint8(o + i, str.charCodeAt(i)); };
    wr(0, 'RIFF'); head.setUint32(4, 36 + pcm.byteLength, true); wr(8, 'WAVE'); wr(12, 'fmt '); head.setUint32(16, 16, true); head.setUint16(20, 1, true);
    head.setUint16(22, 2, true); head.setUint32(24, sampleRate, true); head.setUint32(28, sampleRate * 4, true); head.setUint16(32, 4, true); head.setUint16(34, 16, true);
    wr(36, 'data'); head.setUint32(40, pcm.byteLength, true);
    const bytes = new Uint8Array(44 + pcm.byteLength);
    bytes.set(new Uint8Array(head.buffer), 0); bytes.set(new Uint8Array(pcm.buffer), 44);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  },
  snapshot: () => fake?.snapshot(),
  /** tools/crosscheck.mjs: one round stepped in this page exactly as node's simulate() steps it. */
  simCheck(seedHex, entrants, round) {
    const sim = createSim({ seed: seedToUint32(seedHex), round, entrants });
    const maxTicks = 60 * (COUNTDOWN_TIME + (ROUNDS[round].timeLimit ?? 90) + 5);
    while (sim.state.phase !== 'finished' && sim.tick < maxTicks) { sim.step(); sim.drainEvents(); }
    return { ticks: sim.tick, hash: sim.hash(), order: sim.order.map((b) => `${b.rid}:${b.status}`) };
  },
  handle: () => handle,
};

loop();
if (CAPTURE) {
  const at = num('at', 0);
  // fast-forward without drawing, then draw one frame
  if (at > 0) await window.__tt.advance(at * 1000, { render: false });
  handle.debug.frame(0, true);
}
window.__tt.ready = true;
