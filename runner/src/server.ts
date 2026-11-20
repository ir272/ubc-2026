import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { ChainAdapter, ChannelDef } from './types.ts';
import { UNIT, DECIMALS } from './types.ts';
import { Hub } from './hub.ts';
import { MAX_MATCHES } from './history.ts';
import { runChannelLoop, type LoopOpts } from './show.ts';
import { startHouseBots, type BotOpts } from './bots.ts';
import { log } from './lib/log.ts';

export const FAUCET_AMOUNT = 1000 * UNIT;
const CHAT_MAX_LEN = 280;
const NAME_MAX_LEN = 24;
const CHAT_BURST = 5; // messages
const CHAT_REFILL_MS = 2000; // one message back every 2 s
/** Pool refresh: every 2 s on memory; on Solana every 5 s (env POOL_POLL_MS) to spare the RPC quota. */
const POOL_POLL_MS = Number(process.env.POOL_POLL_MS) || 0;

export interface AppOpts {
  chain: ChainAdapter;
  channels: ChannelDef[];
  houseBots?: boolean | BotOpts;
  loop?: LoopOpts;
  /**
   * Where match history is kept (<dir>/<chain kind>-<channel>.json). Default: env HISTORY_DIR, else
   * runner/data/history. `null` keeps history in memory only (tests).
   */
  historyDir?: string | null;
}

export const DEFAULT_HISTORY_DIR = fileURLToPath(new URL('../data/history', import.meta.url));

class Bucket {
  tokens: number;
  last = Date.now();
  size: number;
  refillMs: number;
  constructor(size: number, refillMs: number) {
    this.size = size;
    this.refillMs = refillMs;
    this.tokens = size;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.size, this.tokens + (now - this.last) / this.refillMs);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApp(o: AppOpts) {
  const { chain } = o;
  const historyDir = o.historyDir === undefined ? process.env.HISTORY_DIR || DEFAULT_HISTORY_DIR : o.historyDir;
  const hub = new Hub(chain, { historyDir });
  for (const def of o.channels) {
    hub.addChannel(def);
    hub.history.list(def.id); // load saved history now
  }
  const ac = new AbortController();
  const faucetGranted = new Set<string>();
  const meCache = new Map<string, { at: number; body: Promise<{ balance: number; positions: unknown[] }> }>();
  const ME_CACHE_MS = chain.kind === 'solana' ? 5000 : 0;
  const ipBuckets = new Map<string, Bucket>();
  const devHtml = () => readFileSync(new URL('../public/dev.html', import.meta.url));
  let loops: Promise<void>[] = [];

  /**
   * The visitor's address for rate limits. Behind a proxy (TRUST_PROXY=1, set in the Dockerfile for
   * Railway) every request comes from the proxy, so use the address the proxy reports: X-Real-IP,
   * else the last X-Forwarded-For entry (the one the proxy appended; earlier ones are client-supplied).
   */
  const clientIp = (req: http.IncomingMessage) => {
    if (process.env.TRUST_PROXY === '1') {
      const real = req.headers['x-real-ip'];
      if (typeof real === 'string' && real) return real.trim();
      const fwd = req.headers['x-forwarded-for'];
      const last = (Array.isArray(fwd) ? fwd.join(',') : fwd ?? '').split(',').map((x) => x.trim()).filter(Boolean).pop();
      if (last) return last;
    }
    return req.socket.remoteAddress ?? '';
  };

  const ipLimit = (req: http.IncomingMessage, key: string, size: number, refillMs: number) => {
    const k = `${key}:${clientIp(req)}`;
    let b = ipBuckets.get(k);
    if (!b) ipBuckets.set(k, (b = new Bucket(size, refillMs)));
    if (ipBuckets.size > 10_000) ipBuckets.clear();
    if (!b.take()) throw new HttpError(429, 'slow down');
  };

  async function readJson(req: http.IncomingMessage): Promise<any> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const c of req) {
      size += c.length;
      if (size > 64 * 1024) throw new HttpError(413, 'body too large');
      chunks.push(c);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      throw new HttpError(400, 'invalid JSON');
    }
  }

  const owner = (s: unknown) => {
    try {
      return chain.parseOwner(String(s ?? ''));
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  };

  async function positionsOf(who: string) {
    const recent = [...hub.windows.values()].slice(-40);
    // One batch call where the chain has it (Solana), else one read per window.
    const batch = chain.getPositions ? await chain.getPositions(recent.map((w) => w.market), who).catch(() => null) : null;
    const rows = await Promise.all(
      recent.map(async (w, i) => {
        const p = batch ? batch[i] ?? null : await chain.getPosition(w.market, who).catch(() => null);
        if (!p) return null;
        return {
          channel: w.channel,
          matchId: w.matchId,
          windowId: w.windowId,
          market: w.market,
          question: w.question,
          outcomes: w.outcomes,
          state: w.state,
          amounts: p.amounts.slice(0, w.outcomes.length),
          claimed: p.claimed,
          winnerOutcomeId: w.winnerOutcomeId,
          payout: w.paid ? (w.paid.get(who) ?? 0) : undefined,
        };
      }),
    );
    return rows.filter((r) => r !== null).reverse();
  }

  async function route(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const m = req.method ?? 'GET';
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (m === 'GET' && (p === '/' || p === '/health')) return json(200, { ok: true, chain: chain.kind, channels: hub.channels.size, reclaim: { pending: hub.reclaimer.pending, ...hub.reclaimer.stats }, ...(chain.rpcUsage ? { rpc: chain.rpcUsage() } : {}) });
    if (m === 'GET' && p === '/config')
      return json(200, { ...chain.info(), decimals: DECIMALS, unit: UNIT, faucetAmount: FAUCET_AMOUNT, houseBots: hub.bots.length > 0 });
    if (m === 'GET' && p === '/blockhash') {
      if (!chain.recentBlockhash) throw new HttpError(404, '/blockhash is only available with CHAIN=solana');
      return json(200, { blockhash: await chain.recentBlockhash() });
    }
    if (m === 'GET' && p === '/dev') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(devHtml());
    }
    if (m === 'GET' && p === '/channels') {
      return json(200, [...hub.channels.keys()].map((id) => hub.snapshot(id, { events: false })));
    }
    let mm: RegExpMatchArray | null;
    if (m === 'GET' && (mm = p.match(/^\/channels\/([^/]+)$/))) {
      const s = hub.snapshot(decodeURIComponent(mm[1]!));
      if (!s) throw new HttpError(404, 'unknown channel');
      return json(200, s);
    }
    if (m === 'GET' && (mm = p.match(/^\/channels\/([^/]+)\/(history|form)$/))) {
      const id = decodeURIComponent(mm[1]!);
      const rt = hub.get(id);
      if (!rt) throw new HttpError(404, 'unknown channel');
      if (mm[2] === 'form') return json(200, hub.history.form(id, rt.match));
      const n = Number(url.searchParams.get('limit') ?? 20);
      const limit = Number.isFinite(n) ? Math.min(MAX_MATCHES, Math.max(1, Math.floor(n))) : 20;
      return json(200, { channel: id, chain: chain.kind, matches: hub.history.recent(id, limit) });
    }
    if (m === 'GET' && p === '/ledger') {
      // Recent onchain transactions across windows, newest first. Always empty on the memory chain.
      const channel = url.searchParams.get('channel') ?? undefined;
      if (channel && !hub.get(channel)) throw new HttpError(404, 'unknown channel');
      const n = Number(url.searchParams.get('limit') ?? 50);
      const limit = Number.isFinite(n) ? Math.min(200, Math.max(1, Math.floor(n))) : 50;
      return json(200, { ...chain.info(), txs: hub.ledger({ channel, limit }) });
    }
    if (m === 'GET' && (mm = p.match(/^\/me\/([^/]+)$/))) {
      const who = owner(decodeURIComponent(mm[1]!));
      // Every open tab polls this; a short cache keeps a public RPC under its rate limits.
      const hit = meCache.get(who);
      if (hit && Date.now() - hit.at < ME_CACHE_MS) return json(200, await hit.body);
      const body = Promise.all([chain.getBalance(who), positionsOf(who)]).then(([balance, positions]) => ({ balance, positions }));
      meCache.set(who, { at: Date.now(), body });
      if (meCache.size > 5000) meCache.clear();
      try {
        return json(200, await body);
      } catch (e) {
        meCache.delete(who);
        throw e;
      }
    }
    if (m === 'POST' && p === '/faucet') {
      ipLimit(req, 'faucet', 5, 60_000);
      const who = owner((await readJson(req)).owner);
      if (faucetGranted.has(who)) return json(200, { granted: 0, balance: await chain.getBalance(who), already: true });
      faucetGranted.add(who);
      let sig: string | void;
      try {
        sig = await chain.grant(who, FAUCET_AMOUNT);
      } catch (e) {
        faucetGranted.delete(who);
        throw e;
      }
      meCache.delete(who);
      log.info(`faucet → ${who}`);
      // `signature` only on Solana: the mint transaction that granted the play money
      return json(200, { granted: FAUCET_AMOUNT, balance: await chain.getBalance(who), ...(typeof sig === 'string' ? { signature: sig } : {}) });
    }
    if (m === 'POST' && p === '/relay') {
      ipLimit(req, 'relay', 10, 1000);
      const { tx } = await readJson(req);
      if (typeof tx !== 'string' || !tx) throw new HttpError(400, 'tx (base64) required');
      let signature: string;
      try {
        signature = await chain.relay(tx);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      meCache.clear(); // a bet or transfer just changed someone's balance
      void hub.refreshAllOpen();
      return json(200, { signature });
    }
    if (m === 'POST' && p === '/dev/transfer') {
      if (!chain.transfer) throw new HttpError(404, '/dev/transfer is only available with CHAIN=memory');
      ipLimit(req, 'devtransfer', 10, 1000);
      const b = await readJson(req);
      const from = owner(b.from);
      const to = owner(b.to);
      try {
        await chain.transfer(from, to, Number(b.amount));
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      return json(200, { ok: true, balance: await chain.getBalance(from) });
    }
    if (m === 'POST' && p === '/dev/bet') {
      if (!chain.placeBet) throw new HttpError(404, '/dev/bet is only available with CHAIN=memory');
      ipLimit(req, 'devbet', 20, 200);
      const b = await readJson(req);
      const who = owner(b.owner);
      const w = hub.windows.get(String(b.windowId ?? ''));
      if (!w) throw new HttpError(404, 'unknown windowId');
      const outcome = w.outcomes.findIndex((x) => x.id === b.outcomeId);
      if (outcome < 0) throw new HttpError(400, 'unknown outcomeId');
      const amount = Number(b.amount);
      try {
        await chain.placeBet(who, w.market, outcome, amount);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      await hub.refreshPools(w);
      return json(200, { ok: true, pools: w.pools, total: w.total, balance: await chain.getBalance(who) });
    }
    throw new HttpError(404, 'not found');
  }

  const server = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    route(req, res).catch((e) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) log.error('http', req.method, req.url, e);
      if (!res.headersSent) res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'internal error' : e.message }));
    });
  });

  // ---- WebSocket feed ----
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const channel = url.searchParams.get('channel') ?? '';
    if (url.pathname !== '/ws' || !hub.get(channel)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, channel));
  });

  const botNames = () => new Set(hub.bots.map((b) => b.name.toLowerCase()));
  // eslint-disable-next-line no-control-regex
  const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, '').trim();

  function onConnection(ws: WebSocket, channel: string) {
    const send = (json: string) => {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1 << 20) ws.send(json);
    };
    // Subscribe first so the snapshot's viewer count includes this connection.
    const unsub = hub.subscribe(channel, (_msg, json) => send(json));
    send(JSON.stringify({ type: 'snapshot', t: Date.now(), ...hub.snapshot(channel) }));
    const bucket = new Bucket(CHAT_BURST, CHAT_REFILL_MS);
    let alive = true;
    ws.on('pong', () => (alive = true));
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30_000);
    const err = (message: string) => send(JSON.stringify({ type: 'error', t: Date.now(), message }));
    ws.on('message', (raw) => {
      let m: any;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return err('invalid JSON');
      }
      if (m?.type !== 'chat') return err('unknown message type');
      const text = clean(String(m.text ?? '')).slice(0, CHAT_MAX_LEN);
      const name = clean(String(m.name ?? '')).slice(0, NAME_MAX_LEN) || 'anon';
      if (!text) return;
      if (botNames().has(name.toLowerCase()) || /^housebot/i.test(name)) return err('that name is reserved');
      if (!bucket.take()) return err('chat rate limit: slow down');
      hub.chatMsg(channel, name, text);
    });
    ws.on('close', () => {
      clearInterval(ping);
      unsub();
    });
    ws.on('error', () => {});
  }

  return {
    hub,
    server,
    signal: ac.signal,
    async start(port: number, host?: string): Promise<number> {
      await new Promise<void>((resolve) => server.listen(port, host, resolve));
      const addr = server.address();
      const actual = typeof addr === 'object' && addr ? addr.port : port;
      if (o.houseBots) await startHouseBots(hub, ac.signal, o.houseBots === true ? {} : o.houseBots);
      loops = o.channels.map((def) => runChannelLoop(hub, def, ac.signal, o.loop));
      const poll = setInterval(() => void hub.refreshAllOpen(), POOL_POLL_MS || (chain.kind === 'solana' ? 5000 : 2000));
      // Solana: every SWEEP_MINUTES (default 30, 0 = off) void markets past their settle deadline
      // (left open by a restart or crash) and close every finished one, returning the rent.
      const sweepMin = Number(process.env.SWEEP_MINUTES ?? 30);
      const sweeper = chain as ChainAdapter & { sweep?: (o: { voidStale?: boolean; say?: (s: string) => void }) => Promise<unknown> };
      if (chain.kind === 'solana' && sweepMin > 0 && sweeper.sweep) {
        let sweeping = false;
        const sweep = setInterval(() => {
          if (sweeping) return;
          sweeping = true;
          sweeper
            .sweep!({ voidStale: true, say: (x) => log.info(`sweep: ${x}`) })
            .then((r) => log.info(`sweep done: ${JSON.stringify(r)}`))
            .catch((e) => log.warn(`sweep failed: ${(e as Error).message}`))
            .finally(() => (sweeping = false));
        }, sweepMin * 60_000);
        sweep.unref?.();
        ac.signal.addEventListener('abort', () => clearInterval(sweep), { once: true });
      }
      ac.signal.addEventListener('abort', () => clearInterval(poll), { once: true });
      return actual;
    },
    async stop() {
      ac.abort(new Error('shutting down'));
      hub.reclaimer.stop(); // unfinished cleanup is left for scripts/sweep.ts
      for (const c of wss.clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
      server.closeAllConnections?.();
      await Promise.race([Promise.allSettled(loops), new Promise((r) => setTimeout(r, 5000))]);
    },
  };
}
