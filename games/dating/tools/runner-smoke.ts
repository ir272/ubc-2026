// Platform smoke test: the real runner app (memory chain) with ONLY the dating channel, one full
// episode over its real WebSocket feed. Writes nothing under runner/ (and, here, nothing under .cache:
// memory is read-only and the line LRU stays in memory).
//   node tools/runner-smoke.ts [--port 8797] [--speed 40] [--timeout 120]
// Port 8797, not 8787 (the platform owner's). Exit 0 when every check passes.

import { createHash } from 'node:crypto';
import { args } from './common.ts';

const a = args();
const PORT = Number(a.port) || 8797;
const SPEED = a.speed ?? '40';
const TIMEOUT_S = Number(a.timeout) || 120;
process.env.CHAIN = 'memory';
process.env.DATING_SPEED = SPEED;
process.env.LOG_QUIET ??= '1';

// the runner's own entry (runner/src/index.ts) does exactly this, with every channel in ALL
const { makeChain } = await import('../../../runner/src/chain/index.ts');
const { createApp } = await import('../../../runner/src/server.ts');
const { default: datingChannel } = await import('../channel.ts');
const { draw, affinityFromTopTags } = await import('../show/draw.ts');
const { loadDecks } = await import('../show/paths.ts');

type Msg = { type: string; [k: string]: any };
const checks: [string, boolean, string?][] = [];
const check = (name: string, ok: boolean, detail?: string) => checks.push([name, ok, detail]);

const chain = await makeChain('memory');
const app = createApp({ chain, channels: [datingChannel({ memory: 'readonly', usedPath: null, log: () => {} })] });
const port = await app.start(PORT, '127.0.0.1');
const t0 = Date.now();

function client(onMsg: (m: Msg) => void): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?channel=dating`);
  ws.addEventListener('message', (e) => onMsg(JSON.parse(String(e.data))));
  return new Promise((res, rej) => {
    ws.addEventListener('open', () => res(ws), { once: true });
    ws.addEventListener('error', () => rej(new Error('websocket error')), { once: true });
  });
}

// The runner starts the channel loop as soon as it listens, so the episode already running when we
// connect is skipped: every check below is about the next episode, from its `match` message on.
const all: Msg[] = [];
const msgs: Msg[] = [];
let late: Msg | null = null;
let lateScenesSeen: number[] = [];
let lateWs: WebSocket | null = null;
let lateAsked = false;
let finish!: () => void;
const done = new Promise<void>((r) => (finish = r));
let matchId: string | null = null;

const ws1 = await client((m) => {
  all.push(m);
  if (m.type === 'match' && !matchId) matchId = m.matchId;
  if (!matchId) return;
  msgs.push(m);
  // a late joiner arrives once the second window (booth one) is open
  if (m.type === 'window_open' && msgs.filter((x) => x.type === 'window_open').length === 2 && !lateAsked) {
    lateAsked = true;
    setTimeout(() => {
      const before = msgs.filter((x) => x.type === 'event' && x.event?.type === 'scene').map((x) => x.event.at as number);
      lateScenesSeen = before;
      void client((s) => {
        if (s.type === 'snapshot' && !late) late = s;
      }).then((w) => (lateWs = w));
    }, 150);
  }
  if (m.type === 'match_end' && matchId) finish();
});

const timer = setTimeout(() => finish(), TIMEOUT_S * 1000);
await done;
clearTimeout(timer);
const seconds = ((Date.now() - t0) / 1000).toFixed(1);

// ---- checks -------------------------------------------------------------------------------------
const first = all[0];
check('first message is a snapshot of channel dating', first?.type === 'snapshot' && first.channel === 'dating');
const match = msgs[0];
check('match: four entrants, meta.game === "dating"', !!match && match.entrants?.length === 4 && match.meta?.game === 'dating', match ? `${match.entrants?.length} entrants, meta.game ${match.meta?.game}` : 'no match');
const mine = (type: string) => msgs.filter((m) => m.type === type);
const opens = mine('window_open');
const locks = mine('window_locked');
const settles = mine('window_settled');
check('three windows opened, 4/3/2 outcomes', opens.length === 3 && opens.map((w) => w.outcomes.length).join() === '4,3,2', opens.map((w) => w.outcomes.length).join('/'));
const ids = opens.map((w) => w.windowId);
check('all three locked', ids.every((id) => locks.some((l) => l.windowId === id)));
const pick = msgs.find((m) => m.type === 'event' && m.event?.type === 'pick')?.event?.data;
check('all three settled on the same winner, the one picked', settles.length === 3 && settles.every((s) => s.winnerOutcomeId === pick?.who), `${settles.map((s) => s.winnerOutcomeId).join(', ')}; picked ${pick?.who}`);
const A = opens[0];
check('window A carries a sealed commitment', !!A && A.sealed === true && /^[0-9a-f]{64}$/.test(A.commitment ?? ''));
const sA = settles.find((s) => s.windowId === A?.windowId);
const secret = sA?.secret as string | undefined;
check('window A reveals a secret matching its commitment', !!secret && createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex') === A?.commitment);
// recompute the type cards from public data only: the revealed secret and the published top tags
const end = mine('match_end')[0];
const events = msgs.filter((m) => m.type === 'event').map((m) => m.event);
const faceUp = events.find((e) => e.type === 'scene' && e.data.state.cards?.[0]?.id)?.data.state.cards[0].id;
const revealed = events.filter((e) => e.type === 'reveal').map((e) => e.data.card.id);
if (secret && end?.result?.topTags) {
  const sealed = createHash('sha256').update(Buffer.concat([Buffer.from('arena-sealed'), Buffer.from(secret, 'hex')])).digest('hex');
  const d = draw(sealed, loadDecks(), affinityFromTopTags(end.result.topTags));
  const got = [faceUp, ...revealed].join(' / ');
  const want = d.cards.map((c) => c.id).join(' / ');
  const twist = events.find((e) => e.type === 'twist')?.data.id;
  check('anyone can recompute the cards and twist from the secret and the top tags', got === want && twist === d.twist.id, `aired ${got}, ${twist}; recomputed ${want}, ${d.twist.id}`);
} else check('anyone can recompute the cards and twist from the secret and the top tags', false, 'no secret or no topTags in match_end');
const lateEvents: any[] = (late as Msg | null)?.recentEvents ?? [];
const lateScenes = lateEvents.filter((e) => e.type === 'scene').map((e) => e.at as number);
check(
  'a late joiner gets a snapshot whose recentEvents hold the latest scene',
  !!late && lateScenes.length > 0 && Math.max(...lateScenes) >= Math.max(...lateScenesSeen) && (late as Msg).match?.meta?.game === 'dating',
  late ? `late snapshot: ${lateEvents.length} events, last scene ${lateEvents.filter((e) => e.type === 'scene').at(-1)?.data?.state?.scene}` : 'no late snapshot',
);
{
  // v2 (show/FORMAT2.md): the staged cuts, the hidden turn-on before the name, the replays
  const types = events.map((e) => e.type);
  const iPick = types.indexOf('pick');
  const r1 = events.findIndex((e) => e.type === 'reveal' && e.data.slot === 1);
  const r2 = events.findIndex((e) => e.type === 'reveal' && e.data.slot === 2);
  const bottoms = events.filter((e) => e.type === 'bottom').length;
  const replays = events.filter((e) => e.type === 'replay').length;
  const markOnly = events.filter((e) => e.type === 'reaction' && !e.data.text).length;
  check('v2 beats: two bottom-two events, slot 1 turns before the pick and slot 2 after, replays, mark-only reactions', bottoms === 2 && r1 >= 0 && r1 < iPick && iPick < r2 && replays >= 2 && markOnly >= 1, `${bottoms} bottom, reveal 1 at ${r1}, pick at ${iPick}, reveal 2 at ${r2}, ${replays} replays, ${markOnly} mark-only reactions`);
}
check('match_end arrived', !!end);

ws1.close();
(lateWs as WebSocket | null)?.close();
await app.stop();

let failed = 0;
console.log(`runner smoke: dating channel on the real runner (CHAIN=memory, DATING_SPEED=${SPEED}, port ${port}), checked episode over ${seconds} s after start (real)`);
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
console.log(failed ? `${failed} of ${checks.length} checks failed` : `all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
