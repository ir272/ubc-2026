// SolanaChain: the ChainAdapter on top of @arena/sdk (program/sdk) and program/DEPLOYED.json.
// Loaded only when CHAIN=solana (dynamic import from chain/index.ts), so the memory runner never
// needs @solana/web3.js or the SDK.
//
// Env:
//   ADMIN_KEYPAIR   path to the admin keypair JSON (solana-keygen format). Default ../program/.keys/admin.json
//   DEPLOYED_PATH   path to DEPLOYED.json. Default ../program/DEPLOYED.json, else the SDK's bundled DEPLOYED
//   SOLANA_RPC      RPC URL. Default: the public endpoint for DEPLOYED.json's cluster
//   BOT_KEYS        where house-bot keypairs are kept. Default .keys/house-bots.json (gitignored)
//   RPC_SOCKETS     how many kept-alive connections all RPC requests share. Default 6
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type * as Web3 from '@solana/web3.js';
import type { ChainAdapter, ChainTx } from '../types.ts';
import { log } from '../lib/log.ts';

const SDK_MODULE = '@arena/sdk'; // non-literal import keeps TS from resolving it at typecheck time
const DEFAULT_SLOT_MS = 400;
const DEADLINE_SLOTS = 9000; // ~1 h after close, anyone may void
const CLAIMS_PER_TX = 4;
const MAX_RELAY_IXS = 4;
/** close_position instructions per transaction (~46 bytes each; the market close rides in the last one). */
const CLOSES_PER_TX = 12;
const OWNERS_CACHE = 2000; // markets whose position owners we remember from claimAll
const CLOSED_CACHE = 20_000; // closed positions remembered so GET /me still lists recent bets

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
let TOKEN_PROGRAM: Web3.PublicKey;
let ATA_PROGRAM: Web3.PublicKey;

const runnerDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const num = (x: bigint | number | undefined) => Number(x ?? 0);

/** Load web3.js from the SDK's own node_modules, so PublicKey/Transaction are the same copy the SDK uses. */
async function loadWeb3(): Promise<typeof Web3> {
  try {
    const sdkEntry = fileURLToPath(import.meta.resolve(SDK_MODULE));
    const p = createRequire(sdkEntry).resolve('@solana/web3.js');
    return (await import(pathToFileURL(p).href)) as typeof Web3;
  } catch {
    return (await import('@solana/web3.js')) as typeof Web3;
  }
}

/** Every RPC request sent since start (GET /health shows it), and RPC_STATS=1 logs them every 30 s. */
export const rpcUsage = { since: Date.now(), total: 0, byMethod: {} as Record<string, number> };
const recent = new Map<string, number>();
export function countRpc(body: unknown) {
  if (typeof body !== 'string') return;
  try {
    const b = JSON.parse(body);
    for (const r of Array.isArray(b) ? b : [b]) {
      const m = String(r?.method ?? '?');
      rpcUsage.total++;
      rpcUsage.byMethod[m] = (rpcUsage.byMethod[m] ?? 0) + 1;
      recent.set(m, (recent.get(m) ?? 0) + 1);
    }
  } catch {
    /* not JSON-RPC */
  }
}
if (process.env.RPC_STATS === '1') {
  setInterval(() => {
    if (!recent.size) return;
    log.info(`rpc/30s ${[...recent].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    recent.clear();
  }, 30_000).unref();
}

/**
 * A fetch for web3.js that sends every RPC request over a few kept-alive connections.
 * Node's own fetch opens a new connection for each concurrent request, and the public RPC
 * endpoints refuse an IP that opens more than 40 connections in 10 s ("Connection rate limits
 * exceeded"), which a runner with several channels hits within seconds.
 */
function pooledFetch(maxSockets: number) {
  const opts = { keepAlive: true, maxSockets, keepAliveMsecs: 10_000 };
  const httpsAgent = new https.Agent(opts);
  const httpAgent = new http.Agent(opts);
  const once = (url: URL, init: { method?: string; headers?: Record<string, string>; body?: string }, retried: boolean): Promise<Response> =>
    new Promise((resolve, reject) => {
      const secure = url.protocol === 'https:';
      const req = (secure ? https : http).request(
        url,
        { method: init.method ?? 'GET', headers: init.headers, agent: secure ? httpsAgent : httpAgent },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('error', reject);
          res.on('end', () =>
            resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500, statusText: res.statusMessage ?? '' })),
          );
        },
      );
      req.setTimeout(30_000, () => req.destroy(new Error('RPC request timed out')));
      req.on('error', (e) => {
        // a kept-alive connection the server closed while idle: the request never left, send it once more
        if (!retried && req.reusedSocket) resolve(once(url, init, true));
        else reject(e);
      });
      if (init.body) req.write(init.body);
      req.end();
    });
  return (input: unknown, init: unknown = {}) => {
    const i = init as Parameters<typeof once>[1];
    countRpc(i.body);
    return once(new URL(String(input)), i, false);
  };
}

export class SolanaChain implements ChainAdapter {
  readonly kind = 'solana' as const;
  private web3: typeof Web3;
  private sdk: any;
  private client: any;
  private connection: Web3.Connection;
  private admin: Web3.Keypair;
  private deployed: { cluster?: string; programId: string; mint: string; config?: string };
  private botKeys = new Map<string, Web3.Keypair>();
  private botKeyPath: string;
  private slotMs = DEFAULT_SLOT_MS;
  private slotMsAt = 0;
  /** market -> owners of its positions, seen by claimAll (saves a getProgramAccounts in reclaim) */
  private owners = new Map<string, string[]>();
  /** `${market}:${owner}` -> the position as it was when reclaim closed it */
  private closed = new Map<string, { amounts: number[]; claimed: boolean }>();
  /** Set by the Hub: every confirmed transaction of a market is reported here (see types.ts ChainTx). */
  onTx?: (tx: ChainTx) => void;
  private betDisc?: Uint8Array;

  private constructor(a: {
    web3: typeof Web3;
    sdk: any;
    client: any;
    connection: Web3.Connection;
    admin: Web3.Keypair;
    deployed: SolanaChain['deployed'];
    botKeyPath: string;
  }) {
    this.web3 = a.web3;
    this.sdk = a.sdk;
    this.client = a.client;
    this.connection = a.connection;
    this.admin = a.admin;
    this.deployed = a.deployed;
    this.botKeyPath = a.botKeyPath;
  }

  static async fromEnv(): Promise<SolanaChain> {
    let sdk: any;
    try {
      sdk = await import(SDK_MODULE);
    } catch (e) {
      throw new Error(`CHAIN=solana needs @arena/sdk built at program/sdk (dist/): ${(e as Error).message}`);
    }
    if (typeof sdk.createClient !== 'function') throw new Error('@arena/sdk does not export createClient');
    const web3 = await loadWeb3();
    TOKEN_PROGRAM = new web3.PublicKey(TOKEN_PROGRAM_ID);
    ATA_PROGRAM = new web3.PublicKey(ATA_PROGRAM_ID);

    const deployedPath = resolve(process.env.DEPLOYED_PATH ?? resolve(runnerDir, '../program/DEPLOYED.json'));
    const deployed = existsSync(deployedPath) ? JSON.parse(readFileSync(deployedPath, 'utf8')) : sdk.DEPLOYED;
    if (!deployed?.programId) throw new Error(`no DEPLOYED.json at ${deployedPath} (and the SDK has none bundled)`);
    const kpPath = resolve(process.env.ADMIN_KEYPAIR ?? resolve(runnerDir, '../program/.keys/admin.json'));
    if (!existsSync(kpPath)) throw new Error(`admin keypair not found (set ADMIN_KEYPAIR); looked at ${kpPath}`);
    const admin = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(kpPath, 'utf8'))));
    const cluster: string = deployed.cluster ?? 'devnet';
    const rpc =
      process.env.SOLANA_RPC ??
      (cluster.startsWith('http') ? cluster : cluster === 'localnet' ? 'http://127.0.0.1:8899' : web3.clusterApiUrl(cluster as Web3.Cluster));
    const sockets = Math.max(1, Number(process.env.RPC_SOCKETS) || 6);
    const connection = new web3.Connection(rpc, { commitment: 'confirmed', fetch: pooledFetch(sockets) as never });
    const client = sdk.createClient({ connection, programId: deployed.programId, admin: admin.publicKey });
    // One quiet, permanent subscription keeps web3.js's WebSocket open. Without it the socket is
    // closed whenever nothing is being confirmed and reopened for the next transaction, and those
    // reconnects count against the same connection limit.
    try {
      connection.onAccountChange(client.configPda(), () => {}, 'confirmed');
    } catch (e) {
      log.warn(`solana: could not hold the WebSocket open: ${(e as Error).message}`);
    }
    const cfg = await client.fetchConfig().catch(() => null);
    if (!cfg) log.warn('solana: Config account not found (program not initialized on this cluster?)');
    else if (cfg.admin.toBase58() !== admin.publicKey.toBase58()) log.warn('solana: ADMIN_KEYPAIR is not the program admin');
    log.info(`solana chain: cluster=${cluster} program=${deployed.programId} feePayer=${admin.publicKey.toBase58()}`);
    return new SolanaChain({
      web3,
      sdk,
      client,
      connection,
      admin,
      deployed: { ...deployed, mint: deployed.mint ?? client.mintPda().toBase58() },
      botKeyPath: resolve(process.env.BOT_KEYS ?? resolve(runnerDir, '.keys/house-bots.json')),
    });
  }

  info() {
    return {
      chain: 'solana',
      cluster: this.deployed.cluster,
      programId: this.deployed.programId,
      mint: this.deployed.mint,
      config: this.deployed.config,
      feePayer: this.admin.publicKey.toBase58(),
    };
  }

  parseOwner(owner: string): string {
    try {
      return new this.web3.PublicKey(owner).toBase58();
    } catch {
      throw new Error('owner must be a base58 public key');
    }
  }

  /** Earliest time the next transaction may be sent: TX_PER_SEC (default 1, Helius free tier's cap). */
  private nextSendAt = 0;
  private readonly sendGapMs = 1000 / Math.max(0.1, Number(process.env.TX_PER_SEC) || 1);
  private async sendTurn() {
    const now = Date.now();
    const at = Math.max(now, this.nextSendAt);
    this.nextSendAt = at + this.sendGapMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }

  rpcUsage() {
    return { since: rpcUsage.since, total: rpcUsage.total, byMethod: { ...rpcUsage.byMethod } };
  }

  private async send(ixs: Web3.TransactionInstruction[], extraSigners: Web3.Keypair[] = []): Promise<string> {
    await this.sendTurn();
    const tx = new this.web3.Transaction().add(...ixs);
    tx.feePayer = this.admin.publicKey;
    return this.web3.sendAndConfirmTransaction(this.connection, tx, [this.admin, ...extraSigners], {
      commitment: 'confirmed',
    });
  }

  /** Never lets a listener error reach the chain call that reported the transaction. */
  private report(tx: ChainTx) {
    try {
      this.onTx?.(tx);
    } catch (e) {
      log.warn(`onTx listener threw: ${(e as Error).message}`);
    }
  }

  /**
   * Sends, and if sending fails (e.g. the confirmation timed out but the tx landed), asks `done()`
   * whether the effect is already onchain before giving up, so retries are idempotent.
   * Resolves to the signature, or undefined when the effect landed but its signature is not known.
   */
  private async sendOnce(
    ixs: Web3.TransactionInstruction[],
    done: () => Promise<boolean>,
    signers: Web3.Keypair[] = [],
  ): Promise<string | undefined> {
    try {
      return await this.send(ixs, signers);
    } catch (e) {
      if (await done().catch(() => false)) {
        // a confirmation timeout carries the signature of the transaction that did land
        const sig = (e as { signature?: unknown }).signature;
        return typeof sig === 'string' && sig ? sig : undefined;
      }
      throw e;
    }
  }

  /** Measured ms per slot (refreshed every minute), so close_slot lands near the wall-clock close. */
  private async msPerSlot(): Promise<number> {
    if (Date.now() - this.slotMsAt > 60_000) {
      this.slotMsAt = Date.now();
      try {
        const s = (await this.connection.getRecentPerformanceSamples(5)).filter((x) => x.numSlots > 0);
        if (s.length) {
          const ms = (s.reduce((a, x) => a + x.samplePeriodSecs, 0) * 1000) / s.reduce((a, x) => a + x.numSlots, 0);
          if (ms > 100 && ms < 2000) this.slotMs = ms;
        }
      } catch {
        /* keep the previous estimate */
      }
    }
    return this.slotMs;
  }

  private async market(market: string) {
    const m = await this.client.fetchMarket(market);
    if (!m) throw new Error(`market ${market} not found`);
    return m;
  }

  // ---- ChainAdapter ----

  async createMarket(a: {
    id: bigint;
    channel: string;
    outcomeCount: number;
    closeInMs: number;
    commitment?: Uint8Array;
    simHash?: Uint8Array;
  }) {
    const [slot, slotMs] = await Promise.all([this.connection.getSlot('confirmed'), this.msPerSlot()]);
    const closeSlot = BigInt(slot + Math.ceil(a.closeInMs / slotMs));
    const ix = this.client.createMarketIx({
      id: a.id,
      channel: a.channel,
      outcomeCount: a.outcomeCount,
      closeSlot,
      settleDeadlineSlot: closeSlot + BigInt(DEADLINE_SLOTS),
      commitment: a.commitment,
      simHash: a.simHash,
    });
    const market = this.client.marketPda(a.id).toBase58();
    const sig = await this.sendOnce([ix], async () => !!(await this.client.fetchMarket(market)));
    if (sig) this.report({ kind: 'open', signature: sig, market });
    return { market, closesAt: Date.now() + a.closeInMs };
  }

  async lock(market: string) {
    const locked = async () => (await this.market(market)).state !== 'Open';
    let m = await this.market(market);
    if (m.state === 'Open') {
      // Wait for the close slot by polling getSlot (cheap, its own rate-limit bucket) instead of
      // re-sending lock and re-reading the market every 500 ms, which floods getAccountInfo on
      // public RPCs while the slot clock trails wall-clock time.
      for (let i = 0; i < 60; i++) {
        const slot = BigInt(await this.connection.getSlot('confirmed'));
        if (slot > m.closeSlot) break;
        const wait = Number(m.closeSlot - slot + 1n) * (await this.msPerSlot());
        await new Promise((r) => setTimeout(r, Math.min(Math.max(wait, 400), 5000)));
      }
      const sig = await this.sendOnce([this.client.lockIx(market)], locked);
      if (sig) this.report({ kind: 'lock', signature: sig, market });
      m = await this.market(market);
    }
    if (m.state !== 'Locked') throw new Error(`lock: market is ${m.state}`);
    return { entropy: Uint8Array.from(m.entropy) };
  }

  async settle(market: string, a: { secret?: Uint8Array; winner: number }) {
    const sig = await this.sendOnce([this.client.settleIx(market, { secret: a.secret, winner: a.winner })], async () => {
      const m = await this.market(market);
      return m.state === 'Settled' && m.winner === a.winner;
    });
    if (sig) this.report({ kind: 'settle', signature: sig, market, outcome: a.winner });
  }

  async void(market: string) {
    const sig = await this.sendOnce([this.client.voidIx(market)], async () => (await this.market(market)).state === 'Void');
    if (sig) this.report({ kind: 'void', signature: sig, market });
  }

  async claimAll(market: string) {
    const m = await this.market(market);
    if (m.state !== 'Settled' && m.state !== 'Void') throw new Error(`market not finished (${m.state})`);
    const all = (await this.client.fetchPositions(market)) as any[];
    remember(this.owners, market, all.map((p) => p.owner.toBase58()), OWNERS_CACHE);
    const todo = all.filter((p) => !p.claimed);
    const out: { owner: string; amount: number }[] = [];
    for (let i = 0; i < todo.length; i += CLAIMS_PER_TX) {
      const batch = todo.slice(i, i + CLAIMS_PER_TX);
      let sig: string;
      try {
        sig = await this.send(batch.map((p) => this.client.claimIx(market, p.owner)));
      } catch (e) {
        log.error(`claim batch for ${market} failed: ${(e as Error).message}`);
        continue;
      }
      for (const p of batch) {
        const amount = num(this.sdk.expectedPayout(m, p));
        if (amount <= 0) continue;
        out.push({ owner: p.owner.toBase58(), amount });
        this.report({ kind: 'payout', signature: sig, market, who: p.owner.toBase58(), amount });
      }
    }
    return out;
  }

  async grant(owner: string, amount: number) {
    return this.send(this.client.grantIxs({ owner, amount: BigInt(amount) }));
  }

  /**
   * Adds the fee-payer signature to a client-built place_bet transaction and submits it.
   * The SDK's checkRelayTx refuses anything but place_bet / lock / claim of our program, a fee payer
   * other than ours, and any use of the fee payer except as place_bet's rent payer — so the admin
   * signature can never authorise create/settle/void or another program. No ATA instructions are
   * needed: the faucet creates the bettor's PLAY account.
   */
  async relay(txBase64: string): Promise<string> {
    let tx: Web3.Transaction;
    try {
      tx = this.client.checkRelayTx(txBase64, this.admin.publicKey);
    } catch (e) {
      // Not a bet: maybe a play-dollar transfer to another address (the wallet's Withdraw).
      const transfer = await this.checkTransferTx(txBase64).catch((err: Error) => {
        if (err.message.startsWith('relay:')) throw err; // a transfer, refused for a reason worth showing
        return null;
      });
      if (!transfer) throw new Error((e as Error).message.startsWith('relay:') ? (e as Error).message : 'could not decode transaction');
      tx = transfer;
    }
    if (tx.instructions.length > MAX_RELAY_IXS) throw new Error('relay: too many instructions');
    tx.partialSign(this.admin);
    const raw = tx.serialize(); // verifies every required signature is present
    await this.sendTurn();
    const sig = await this.connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed' });
    const res = await this.connection.confirmTransaction(sig, 'confirmed');
    // Only a transaction that succeeded is reported as a bet (a failed one still has a signature).
    if (!res.value.err) this.reportRelayedBets(tx, sig);
    return sig;
  }

  /**
   * A viewer sending play dollars to another address, for the fee payer to co-sign. Accepted only as
   *   [optional] ATA CreateIdempotent(payer = fee payer, ata = recipient's PLAY account, mint = PLAY)
   *   SPL Token TransferChecked(source = sender's PLAY account, mint = PLAY, destination, owner = sender, decimals 6)
   * The fee payer may appear only as the rent payer of the create, never in the transfer, so its
   * signature cannot move anyone's tokens. Returns null for anything else.
   */
  private async checkTransferTx(txBase64: string): Promise<Web3.Transaction | null> {
    const W = this.web3;
    const tx = W.Transaction.from(Buffer.from(txBase64, 'base64'));
    const fp = this.admin.publicKey;
    if (!tx.feePayer || !tx.feePayer.equals(fp)) return null;
    const ixs = tx.instructions;
    if (ixs.length < 1 || ixs.length > 2) return null;
    const mint = new W.PublicKey(this.deployed.mint);
    const xfer = ixs[ixs.length - 1]!;
    const d = xfer.data;
    if (!xfer.programId.equals(TOKEN_PROGRAM) || d.length !== 10 || d[0] !== 12 || d[9] !== 6 || xfer.keys.length !== 4) return null;
    const [src, m, dst, owner] = xfer.keys.map((k) => k.pubkey) as [Web3.PublicKey, Web3.PublicKey, Web3.PublicKey, Web3.PublicKey];
    if (!m.equals(mint) || xfer.keys.some((k) => k.pubkey.equals(fp))) return null;
    if (!src.equals(this.client.playAta(owner)) || src.equals(dst) || d.readBigUInt64LE(1) === 0n) return null;
    if (ixs.length === 2) {
      const c = ixs[0]!;
      if (!c.programId.equals(ATA_PROGRAM) || c.data.length !== 1 || c.data[0] !== 1 || c.keys.length !== 6) return null;
      const [payer, ata, recipient, cm, sys, tok] = c.keys.map((k) => k.pubkey) as Web3.PublicKey[];
      if (!payer!.equals(fp) || !ata!.equals(dst) || !cm!.equals(mint) || !ata!.equals(this.client.playAta(recipient!))) return null;
      if (!sys!.equals(W.SystemProgram.programId) || !tok!.equals(TOKEN_PROGRAM) || recipient!.equals(fp)) return null;
    } else {
      // no create: the destination must already be a PLAY token account
      const info = await this.connection.getAccountInfo(dst);
      if (!info || !info.owner.equals(TOKEN_PROGRAM) || info.data.length < 32 || !new W.PublicKey(info.data.subarray(0, 32)).equals(mint)) {
        throw new Error('relay: that address has no play dollars account yet');
      }
    }
    return tx;
  }

  /** The place_bet instructions of a relayed transaction, read back from its own bytes. */
  private reportRelayedBets(tx: Web3.Transaction, signature: string) {
    try {
      // discriminator taken from the SDK's own builder, so it can never drift from the program's
      this.betDisc ??= Uint8Array.from(
        this.client.placeBetIx({ market: this.admin.publicKey, owner: this.admin.publicKey, outcome: 0, amount: 0n }).data.subarray(0, 8),
      );
      const disc = this.betDisc;
      for (const ix of tx.instructions) {
        const d = ix.data;
        // place_bet: 8-byte discriminator, u8 outcome, u64 LE amount; accounts [owner, payer, config, market, ...]
        if (d.length < 17 || !disc.every((x, i) => d[i] === x) || ix.keys.length < 4) continue;
        this.report({
          kind: 'bet',
          signature,
          market: ix.keys[3]!.pubkey.toBase58(),
          who: ix.keys[0]!.pubkey.toBase58(),
          outcome: d[8]!,
          amount: num(d.readBigUInt64LE(9)),
        });
      }
    } catch (e) {
      log.warn(`could not read relayed bet ${signature}: ${(e as Error).message}`);
    }
  }

  async getMarket(market: string) {
    const m = await this.market(market);
    return { pools: (m.pools as bigint[]).map(num), state: m.state as string };
  }

  /** Many markets in one getMultipleAccountsInfo call (100 per call); null where an account is missing. */
  async getMarkets(markets: string[]) {
    const keys = markets.map((m) => new this.web3.PublicKey(m));
    const infos = await this.multi(keys);
    return infos.map((info, i) => {
      if (!info) return null;
      const m = this.sdk.decodeMarket(keys[i], info.data);
      return { pools: (m.pools as bigint[]).map(num), state: m.state as string };
    });
  }

  /** One owner's positions on many markets in one call; closed positions come from the reclaim cache. */
  async getPositions(markets: string[], owner: string) {
    const pdas = markets.map((m) => this.client.positionPda(m, owner) as Web3.PublicKey);
    const infos = await this.multi(pdas);
    return infos.map((info, i) => {
      if (!info) return this.closed.get(`${markets[i]}:${owner}`) ?? null;
      const p = this.sdk.decodePosition(pdas[i], info.data);
      return { amounts: (p.amounts as bigint[]).map(num), claimed: !!p.claimed };
    });
  }

  private async multi(keys: Web3.PublicKey[]) {
    const out: (Web3.AccountInfo<Buffer> | null)[] = [];
    for (let i = 0; i < keys.length; i += 100) out.push(...(await this.connection.getMultipleAccountsInfo(keys.slice(i, i + 100))));
    return out;
  }

  async getBalance(owner: string) {
    return num(await this.client.fetchPlayBalance(owner));
  }

  async getPosition(market: string, owner: string) {
    const p = await this.client.fetchPosition(market, owner);
    if (!p) return this.closed.get(`${market}:${owner}`) ?? null; // closed by reclaim: last known state
    return { amounts: (p.amounts as bigint[]).map(num), claimed: !!p.claimed };
  }

  // ---- rent reclamation ----

  /** Existing positions of a finished market: from the owners claimAll saw if that matches the count, else a scan. */
  private async positionsOf(market: string, count: number): Promise<any[]> {
    const known = this.owners.get(market);
    if (known && known.length >= count) {
      const pdas = known.map((o) => this.client.positionPda(market, o));
      const infos = await this.connection.getMultipleAccountsInfo(pdas);
      const found = infos.flatMap((info, i) => (info ? [this.sdk.decodePosition(pdas[i], info.data)] : []));
      if (found.length === count) return found;
    }
    return this.client.fetchPositions(market);
  }

  async reclaim(market: string) {
    const nothing = { positions: 0, market: false, done: true };
    const info = await this.connection.getAccountInfo(new this.web3.PublicKey(market));
    if (!info) {
      this.owners.delete(market);
      return nothing; // already closed
    }
    // Markets created before the `positions` counter existed cannot be closed by the program.
    if (info.data.length < this.sdk.MARKET_SIZE) return nothing;
    const m = this.sdk.decodeMarket(market, info.data);
    if (m.state !== 'Settled' && m.state !== 'Void') throw new Error(`market is ${m.state}, not finished`);

    const positions = m.positions > 0 ? await this.positionsOf(market, m.positions) : [];
    let firstError: Error | null = null;

    // Anyone claimAll missed (a failed batch) is paid first: a position must be claimed to close.
    const unclaimed = positions.filter((p) => !p.claimed);
    for (let i = 0; i < unclaimed.length; i += CLAIMS_PER_TX) {
      const batch = unclaimed.slice(i, i + CLAIMS_PER_TX);
      try {
        const sig = await this.send(batch.map((p) => this.client.claimIx(market, p.owner)));
        for (const p of batch) {
          p.claimed = true;
          const amount = num(this.sdk.expectedPayout(m, p));
          if (amount > 0) this.report({ kind: 'payout', signature: sig, market, who: p.owner.toBase58(), amount });
        }
      } catch (e) {
        firstError ??= e as Error;
      }
    }

    const claimed = positions.filter((p) => p.claimed);
    // The market may close in the same transaction as its last positions, once none will be left.
    const closeMarket = claimed.length === positions.length && positions.length === m.positions;
    let closedPositions = 0;
    let closedMarket = false;
    const batches: any[][] = [];
    for (let i = 0; i < claimed.length; i += CLOSES_PER_TX) batches.push(claimed.slice(i, i + CLOSES_PER_TX));
    if (batches.length === 0 && closeMarket) batches.push([]);
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]!;
      const withMarket = closeMarket && !firstError && b === batches.length - 1;
      const ixs = batch.map((p) => this.client.closePositionIx(market, p.owner));
      if (withMarket) ixs.push(this.client.closeMarketIx(market));
      for (const p of batch)
        remember(this.closed, `${market}:${p.owner.toBase58()}`, { amounts: (p.amounts as bigint[]).map(num), claimed: true }, CLOSED_CACHE);
      try {
        await this.send(ixs);
        closedPositions += batch.length;
        closedMarket ||= withMarket;
      } catch (e) {
        firstError ??= e as Error;
      }
    }
    if (closedMarket) this.owners.delete(market);
    if (firstError && closedPositions === 0 && !closedMarket) throw firstError;
    return { positions: closedPositions, market: closedMarket, done: closedMarket };
  }

  /**
   * For scripts/sweep.ts (after a crash): voids markets past their settle deadline (if asked), then
   * reclaims every Settled/Void market of the program. Sequential, one market at a time.
   */
  async sweep(o: { voidStale?: boolean; dryRun?: boolean; say?: (s: string) => void } = {}) {
    const say = o.say ?? ((x: string) => log.info(x));
    const slot = BigInt(await this.connection.getSlot('confirmed'));
    const markets = (await this.client.fetchMarkets()) as any[];
    const legacy = await this.connection.getProgramAccounts(new this.web3.PublicKey(this.deployed.programId), {
      filters: [{ dataSize: this.sdk.LEGACY_MARKET_SIZE }],
      dataSlice: { offset: 0, length: 0 },
    });
    const by = (st: string) => markets.filter((m) => m.state === st).length;
    say(`markets: ${markets.length} (Open ${by('Open')}, Locked ${by('Locked')}, Settled ${by('Settled')}, Void ${by('Void')}); old-layout markets that cannot be closed: ${legacy.length}`);
    const stale = markets.filter((m) => (m.state === 'Open' || m.state === 'Locked') && m.settleDeadlineSlot < slot);
    const finished = markets.filter((m) => m.state === 'Settled' || m.state === 'Void');
    say(`finished: ${finished.length}; past their settle deadline (stale): ${stale.length}${o.voidStale ? ' (will void)' : ' (pass --void-stale to void them)'}`);
    const out = { voided: 0, markets: 0, positions: 0, failed: 0 };
    if (o.dryRun) return out;
    if (o.voidStale) {
      for (const m of stale) {
        try {
          await this.void(m.address.toBase58());
          out.voided++;
          finished.push(m);
        } catch (e) {
          out.failed++;
          say(`void ${m.address.toBase58()} failed: ${(e as Error).message}`);
        }
      }
    }
    for (const m of finished) {
      const market = m.address.toBase58();
      try {
        const r = await this.reclaim(market);
        out.positions += r.positions;
        if (r.market) out.markets++;
        else if (!r.done) out.failed++;
      } catch (e) {
        out.failed++;
        say(`reclaim ${market} failed: ${(e as Error).message}`);
      }
    }
    return out;
  }

  async adminLamports() {
    return this.connection.getBalance(this.admin.publicKey, 'confirmed');
  }

  // ---- house bots: keypairs persisted in a gitignored file, never logged ----

  async botAccount(name: string) {
    let stored: Record<string, number[]> = {};
    if (existsSync(this.botKeyPath)) stored = JSON.parse(readFileSync(this.botKeyPath, 'utf8'));
    let kp: Web3.Keypair;
    if (stored[name]) kp = this.web3.Keypair.fromSecretKey(Uint8Array.from(stored[name]!));
    else {
      kp = this.web3.Keypair.generate();
      stored[name] = Array.from(kp.secretKey);
      mkdirSync(dirname(this.botKeyPath), { recursive: true });
      writeFileSync(this.botKeyPath, JSON.stringify(stored), { mode: 0o600 });
    }
    const owner = kp.publicKey.toBase58();
    this.botKeys.set(owner, kp);
    return owner;
  }

  async botBet(owner: string, market: string, outcome: number, amount: number) {
    const kp = this.botKeys.get(owner);
    if (!kp) throw new Error('unknown bot');
    const ix = this.client.placeBetIx({ market, owner: kp.publicKey, outcome, amount: BigInt(amount), payer: this.admin.publicKey });
    const sig = await this.send([ix], [kp]);
    this.report({ kind: 'bet', signature: sig, market, who: owner, outcome, amount });
  }
}

/** Map.set with a size cap (drops the oldest entries). */
function remember<V>(map: Map<string, V>, key: string, value: V, max: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value!);
}
