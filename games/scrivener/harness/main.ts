// Harness page: mounts the game exactly as the website would (mount + onFeed) and feeds it
// either from the local fake runner (live) or from a recorded feed, dropped in at any point.
//
//   /                                   live: the fake runner plays channel.ts in a loop
//   /?replay=latest&at=phase:tape+2000  a recorded match, joined 2 s into the tape
//   /?replay=<file.jsonl>&at=event:decide.open:2+800   800 ms after the third decide.open
//   /?replay=latest&at=ms:95000         95 s into the match
//   &bare=1 fills the window with the stage (captures)   &pick=<entrantId> highlights a contender
//   &mute=1 no sound

import { mount } from '../index.ts';
// @ts-ignore plain JS helper
import { parseFeed, snapshotAt, seekIndex } from './feedlog.js';

const q = new URLSearchParams(location.search);
const el = document.getElementById('stage') as HTMLElement;
const dev = document.getElementById('dev') as HTMLElement;
if (q.get('bare') === '1') document.body.classList.add('bare');

const handle = mount(el, { assetsBase: '/', muted: q.get('mute') === '1' }) as ReturnType<typeof mount> & { debug: any };
if (q.get('pick')) handle.highlight(q.get('pick'));
const w = window as any;
w.__stage = handle.debug;
w.__handle = handle;
w.__harness = { ready: false, mode: 'live', ended: false };

function parseAt(s: string | null) {
  if (!s) return { ms: 0 };
  const [head, plus] = s.split('+');
  const parts = head!.split(':');
  const extra = plus ? Number(plus) : 0;
  if (parts[0] === 'phase') return { phase: parts[1], plus: extra };
  if (parts[0] === 'event') return { event: parts[1], nth: Number(parts[2] || 0), plus: extra };
  return { ms: Number(parts[1] ?? parts[0]) + extra };
}

async function replay(name: string) {
  w.__harness.mode = 'replay';
  let file = name;
  if (name === 'latest') {
    const list = await (await fetch('/feeds')).json();
    if (!list.length) { dev.textContent = 'no recorded feeds yet: run `npm run match`'; return; }
    file = list[0].name;
  }
  const msgs = parseFeed(await (await fetch(`/feeds/${file}`)).text());
  const { index, t } = seekIndex(msgs, parseAt(q.get('at')));
  const t0 = performance.now();
  handle.onFeed(snapshotAt(msgs, index, t));
  w.__harness.ready = true;
  let i = index;
  const pump = () => {
    const now = t + (performance.now() - t0);
    while (i < msgs.length && msgs[i].t <= now) handle.onFeed(msgs[i++]);
    if (i >= msgs.length) w.__harness.ended = true;
    else setTimeout(pump, 15);
  };
  pump();
  dev.innerHTML = `replay <b>${file}</b> from ${q.get('at') || 'the start'}`;
}

function live() {
  const es = new EventSource('/feed');
  es.onmessage = (e) => {
    handle.onFeed(JSON.parse(e.data));
    w.__harness.ready = true;
  };
  es.onerror = () => { dev.textContent = 'feed lost, retrying'; };
  setInterval(() => {
    const s = handle.debug.state();
    const fs = handle.debug.feed.s;
    const open = [...fs.windows.values()].filter((x: any) => x.state === 'open').map((x: any) => `${x.question} (${Math.max(0, Math.round((x.closesAt - Date.now() - (fs.offset || 0)) / 1000))}s)`);
    dev.innerHTML = `match <b>${s.matchNo}</b> phase <b>${s.phase}</b> ${Math.round(s.ms / 1000)}s fight <b>${s.fight.mode}</b> stroke ${s.fight.k} debt ${s.fight.debt}ms | open: ${open.join(', ') || 'none'}`;
  }, 500);
}

if (q.get('replay')) replay(q.get('replay')!); else live();
