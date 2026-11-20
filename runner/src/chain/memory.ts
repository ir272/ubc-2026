import type { ChainAdapter } from '../types.ts';
import { b58decode, isPubkey, random32, randomPubkey, sha256 } from '../lib/bytes.ts';
import { payoutFor } from './payout.ts';

type MState = 'Open' | 'Locked' | 'Settled' | 'Void';

interface MMarket {
  id: bigint;
  channel: string;
  outcomeCount: number;
  pools: number[];
  state: MState;
  closesAt: number;
  commitment: Uint8Array;
  simHash: Uint8Array;
  entropy?: Uint8Array;
  secret?: Uint8Array;
  winner?: number;
  positions: Map<string, { amounts: number[]; claimed: boolean }>;
}

const ZERO32 = new Uint8Array(32);
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * In-memory stand-in for the onchain program. Same rules as CONTRACT.md section 1:
 * bets fail at or after close, lock only after close, settle checks the commitment,
 * claim pays parimutuel (see payout.ts), once per position.
 */
export class MemoryChain implements ChainAdapter {
  readonly kind = 'memory' as const;
  private balances = new Map<string, number>();
  private markets = new Map<string, MMarket>();
  /** The vault: every pool lives here, so total supply is conserved. */
  vault = 0;
  /** Override for tests. */
  now: () => number = () => Date.now();

  info() {
    return { chain: 'memory' };
  }

  parseOwner(owner: string): string {
    if (!isPubkey(owner)) throw new Error('owner must be a base58 public key');
    return owner;
  }

  private m(market: string): MMarket {
    const m = this.markets.get(market);
    if (!m) throw new Error('unknown market');
    return m;
  }

  async createMarket(a: {
    id: bigint;
    channel: string;
    outcomeCount: number;
    closeInMs: number;
    commitment?: Uint8Array;
    simHash?: Uint8Array;
  }) {
    if (a.outcomeCount < 2 || a.outcomeCount > 16) throw new Error('outcomeCount must be 2..16');
    const market = randomPubkey();
    const closesAt = this.now() + Math.max(0, a.closeInMs);
    this.markets.set(market, {
      id: a.id,
      channel: a.channel,
      outcomeCount: a.outcomeCount,
      pools: new Array(a.outcomeCount).fill(0),
      state: 'Open',
      closesAt,
      commitment: a.commitment ?? ZERO32,
      simHash: a.simHash ?? ZERO32,
      positions: new Map(),
    });
    return { market, closesAt };
  }

  async placeBet(owner: string, market: string, outcome: number, amount: number) {
    const m = this.m(market);
    if (m.state !== 'Open' || this.now() >= m.closesAt) throw new Error('betting is closed');
    if (!Number.isInteger(outcome) || outcome < 0 || outcome >= m.outcomeCount) throw new Error('bad outcome');
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('amount must be a positive integer (base units)');
    const bal = this.balances.get(owner) ?? 0;
    if (bal < amount) throw new Error('insufficient balance');
    this.balances.set(owner, bal - amount);
    this.vault += amount;
    m.pools[outcome]! += amount;
    let p = m.positions.get(owner);
    if (!p) m.positions.set(owner, (p = { amounts: new Array(m.outcomeCount).fill(0), claimed: false }));
    p.amounts[outcome]! += amount;
  }

  async transfer(from: string, to: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('amount must be a positive integer (base units)');
    if (from === to) throw new Error('cannot send to yourself');
    const bal = this.balances.get(from) ?? 0;
    if (bal < amount) throw new Error('insufficient balance');
    this.balances.set(from, bal - amount);
    this.balances.set(to, (this.balances.get(to) ?? 0) + amount);
  }

  async lock(market: string) {
    const m = this.m(market);
    if (m.state !== 'Open') throw new Error(`cannot lock: market is ${m.state}`);
    if (this.now() < m.closesAt) throw new Error('cannot lock before close');
    // Stands in for the SlotHashes entry: nobody chooses it.
    m.entropy = random32();
    m.state = 'Locked';
    return { entropy: m.entropy };
  }

  async settle(market: string, a: { secret?: Uint8Array; winner: number }) {
    const m = this.m(market);
    if (m.state !== 'Locked') throw new Error(`cannot settle: market is ${m.state}`);
    if (!Number.isInteger(a.winner) || a.winner < 0 || a.winner >= m.outcomeCount) throw new Error('bad winner');
    if (!eq(m.commitment, ZERO32)) {
      if (!a.secret || !eq(sha256(a.secret), m.commitment)) throw new Error('secret does not match commitment');
    }
    m.secret = a.secret;
    m.winner = a.winner;
    m.state = 'Settled';
  }

  async void(market: string) {
    const m = this.m(market);
    if (m.state === 'Settled' || m.state === 'Void') throw new Error(`cannot void: market is ${m.state}`);
    m.state = 'Void';
  }

  async claimAll(market: string) {
    const m = this.m(market);
    if (m.state !== 'Settled' && m.state !== 'Void') throw new Error('market not finished');
    const out: { owner: string; amount: number }[] = [];
    for (const [owner, p] of m.positions) {
      if (p.claimed) continue;
      p.claimed = true;
      const amount = payoutFor(p.amounts, m.pools, m.state, m.winner ?? 0);
      if (amount > 0) {
        this.vault -= amount;
        this.balances.set(owner, (this.balances.get(owner) ?? 0) + amount);
        out.push({ owner, amount });
      }
    }
    return out;
  }

  async grant(owner: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('bad amount');
    this.balances.set(owner, (this.balances.get(owner) ?? 0) + amount);
  }

  async relay(_txBase64: string): Promise<string> {
    throw new Error('relay is not available with CHAIN=memory; use POST /dev/bet');
  }

  async getMarket(market: string) {
    const m = this.m(market);
    return { pools: [...m.pools], state: m.state };
  }

  async getBalance(owner: string) {
    return this.balances.get(owner) ?? 0;
  }

  async getPosition(market: string, owner: string) {
    const p = this.markets.get(market)?.positions.get(owner);
    return p ? { amounts: [...p.amounts], claimed: p.claimed } : null;
  }

  async botAccount(_name: string) {
    return randomPubkey();
  }

  async botBet(owner: string, market: string, outcome: number, amount: number) {
    return this.placeBet(owner, market, outcome, amount);
  }

  /** Nothing to reclaim in memory: no rent. Markets stay so /me keeps working. */
  async reclaim(_market: string) {
    return { positions: 0, market: false, done: true };
  }

  /** Test helper: the revealed values of a market. */
  inspect(market: string) {
    const m = this.m(market);
    return { ...m, marketBytes: b58decode(market) };
  }
}
