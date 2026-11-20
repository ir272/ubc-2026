// The dev page: mounts the stage and pipes the feed into handle.onFeed. Outside the stage a slim
// debug strip (connection, scene, elapsed, frame time, skip, reload, mute).
//   ?size=960 | ?size=1280   force the stage to 960x540 or 1280x720
//   ?demo=1                  play the built-in scripted episode instead of /feed
//   ?join=<s>                with demo: join late, from a snapshot taken s seconds in
//   ?loop=1                  with demo: loop forever
//   ?star=maximilian         with demo: another star (vesper, maximilian, pixel)
//   ?staging=hangout         draw the hangout room (or ?staging=studio); default: STAGING in stage/theme.ts
import { mount } from '../index.ts';
import { playDemo, setDemoCast } from './demo.ts';

const q = new URLSearchParams(location.search);
const size = Number(q.get('size')) || 0;
const demo = q.get('demo') === '1';
const stagingQ = q.get('staging');
const staging = stagingQ === 'hangout' || stagingQ === 'studio' ? stagingQ : undefined;
//   ?cast=frost,tilly,dash,nav  with demo: other avatars on spots 0..3 (framing checks)
if (q.get('cast')) setDemoCast(q.get('cast')!.split(','));

document.body.style.cssText =
  'margin:0;background:#000;color:#cfd3e0;font:13px/1.3 "Zen Maru Gothic",system-ui,sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;';

const stageEl = document.createElement('div');
stageEl.id = 'stage';
if (size) {
  stageEl.style.cssText = `width:${size}px;height:${Math.round((size * 9) / 16)}px;flex:none;`;
} else {
  stageEl.style.cssText = 'width:100vw;height:calc(100vh - 40px);flex:none;';
}
document.body.appendChild(stageEl);

const strip = document.createElement('div');
strip.style.cssText = 'height:32px;margin-top:6px;display:flex;gap:14px;align-items:center;font-size:12px;opacity:.85;flex:none;';
strip.innerHTML = `
  <span id="conn">connecting</span>
  <span>scene <b id="scene">none</b></span>
  <span>elapsed <b id="elapsed">0:00</b></span>
  <span id="fps"></span>
  <button id="skip">Skip episode</button>
  <button id="reload">Reload feed</button>
  <button id="mute">Mute</button>`;
document.body.appendChild(strip);
for (const b of strip.querySelectorAll('button')) (b as HTMLButtonElement).style.cssText = 'background:#1c2a52;color:#fff4e0;border:1px solid #2c3d6e;border-radius:6px;padding:3px 10px;font:inherit;cursor:pointer;';
const $ = (id: string) => document.getElementById(id)!;

let handle = mount(stageEl, { assetsBase: '/assets/', staging });
(window as unknown as { __stage: typeof handle }).__stage = handle;
let muted = false;
let startedAt = 0;
let offset = 0;
let es: EventSource | null = null;
let stopDemo: (() => void) | null = null;

/** for tools/capture.mjs: the scene on screen and the last feed event (type, kind) */
const probe = { scene: 'none', last: 'none', kind: '', at: 0 };
(window as unknown as { __feedLast: typeof probe }).__feedLast = probe;

function track(m: { type?: string; t?: number; [k: string]: unknown }) {
  if (typeof m.t === 'number') offset = m.t - Date.now();
  if (m.type === 'event') {
    const e = m.event as { type?: string; at?: number; data?: { kind?: string; state?: { scene?: string } } } | undefined;
    probe.last = String(e?.type ?? 'event');
    probe.kind = String(e?.data?.kind ?? '');
    probe.at = Number(e?.at ?? 0);
    if (e?.type === 'scene' && e.data?.state?.scene) probe.scene = e.data.state.scene;
  } else if (m.type === 'snapshot') {
    const evs = (m.recentEvents as { type: string; at?: number; data?: { kind?: string; state?: { scene?: string } } }[]) ?? [];
    const lastScene = [...evs].reverse().find((e) => e.type === 'scene');
    probe.scene = lastScene?.data?.state?.scene ?? 'none';
    const last = evs[evs.length - 1];
    probe.last = last ? `snapshot:${last.type}` : 'snapshot';
    probe.kind = String(last?.data?.kind ?? '');
    probe.at = Number(last?.at ?? 0);
  } else if (m.type) probe.last = m.type;
  if (m.type === 'snapshot') {
    const match = m.match as { startedAt?: number } | null;
    startedAt = match?.startedAt ?? 0;
    if (typeof m.serverNow === 'number') offset = m.serverNow - Date.now();
    const evs = (m.recentEvents as { type: string; data?: { state?: { scene?: string } } }[]) ?? [];
    const last = [...evs].reverse().find((e) => e.type === 'scene');
    $('scene').textContent = last?.data?.state?.scene ?? 'none';
  } else if (m.type === 'match') {
    startedAt = (m.startedAt as number) ?? m.t ?? Date.now();
    $('scene').textContent = 'title';
  } else if (m.type === 'event') {
    const e = m.event as { type: string; data?: { state?: { scene?: string } } };
    if (e?.type === 'scene' && e.data?.state?.scene) $('scene').textContent = e.data.state.scene;
  }
}

function feed(m: unknown) {
  track(m as { type?: string });
  handle.onFeed(m);
}

function connect() {
  if (demo) {
    $('conn').textContent = 'demo';
    stopDemo = playDemo(feed, { joinMs: (Number(q.get('join')) || 0) * 1000, loop: q.get('loop') === '1', star: q.get('star') ?? undefined });
    return;
  }
  es = new EventSource('/feed');
  $('conn').textContent = 'connecting';
  es.onopen = () => ($('conn').textContent = 'live');
  es.onerror = () => ($('conn').textContent = 'reconnecting');
  es.onmessage = (e) => {
    try {
      feed(JSON.parse(e.data));
    } catch (err) {
      console.error('bad feed message', err);
    }
  };
}
connect();

$('skip').onclick = () => {
  if (demo) return;
  void fetch('/feed/skip', { method: 'POST' });
};
$('reload').onclick = () => {
  // prove late join: a fresh stage, a fresh connection, a snapshot first
  es?.close();
  stopDemo?.();
  handle.destroy();
  handle = mount(stageEl, { assetsBase: '/assets/', staging });
  (window as unknown as { __stage: typeof handle }).__stage = handle;
  handle.setMuted(muted);
  if (demo) {
    const elapsed = startedAt ? Date.now() + offset - startedAt : 0;
    stopDemo = playDemo(feed, { joinMs: elapsed, star: q.get('star') ?? undefined });
  } else connect();
};
$('mute').onclick = () => {
  muted = !muted;
  handle.setMuted(muted);
  $('mute').textContent = muted ? 'Unmute' : 'Mute';
};

setInterval(() => {
  if (startedAt) {
    const s = Math.max(0, Math.floor((Date.now() + offset - startedAt) / 1000));
    $('elapsed').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  const st = handle.stats();
  $('fps').textContent = `${st.frameMs.toFixed(1)} ms cpu, ${st.drawCalls} draws`;
}, 500);
