// The silent wallet. An ed25519 keypair is made on first visit and kept in localStorage; the server
// grants the starting balance. Nothing ever asks the viewer to sign or approve anything.
import { ed25519 } from '@noble/curves/ed25519';
import { useSyncExternalStore } from 'react';
import { api, getConfig, type WindowView } from './api';
import { b58, hex, unhex } from './b58';
import { randomName } from './names';
import { FIXTURE, PHASE } from './dev';
import { fxMyTickets } from '../fixture';

const KEY = 'arena.wallet.v1';

export interface Ticket {
  windowId: string;
  /** confirmed stake per outcome index, base units */
  amounts: number[];
  pending: { outcome: number; amount: number } | null;
  error: string | null;
  /** set when the window settled or voided */
  payout?: number;
  /** Solana only: explorer link to the viewer's latest bet transaction on this window */
  tx?: string;
}

interface Stored {
  seed: string;
  owner: string;
  name: string;
}

function load(): { s: Stored; fresh: boolean } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Stored | null;
    if (s?.seed && s.owner) return { s, fresh: false };
  } catch {
    /* ignore */
  }
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const owner = b58(ed25519.getPublicKey(seed));
  const s = { seed: hex(seed), owner, name: randomName() };
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the key lives for this tab only */
  }
  return { s, fresh: true };
}

function friendly(e: unknown): string {
  const m = String((e as Error)?.message ?? e).toLowerCase();
  if (/clos|lock|not open|state/.test(m)) return 'Bets just closed';
  if (/insufficient|balance|funds/.test(m)) return 'Not enough balance';
  if (/fetch|network|failed to/.test(m)) return 'Lost connection';
  return 'Didn’t go through';
}

class Wallet {
  readonly owner: string;
  readonly seed: Uint8Array;
  name: string;
  serverBalance: number | null = null;
  tickets = new Map<string, Ticket>();
  granted = 0; // set when the faucet just granted
  private version = 0;
  private listeners = new Set<() => void>();
  private started = false;

  constructor() {
    const { s, fresh } = load();
    this.owner = s.owner;
    this.seed = unhex(s.seed);
    this.name = s.name;
    this.fresh = fresh;
  }
  private fresh: boolean;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** What the header shows: server balance minus bets still in flight. */
  get balance(): number | null {
    if (this.serverBalance == null) return null;
    let p = 0;
    for (const t of this.tickets.values()) if (t.pending) p += t.pending.amount;
    return this.serverBalance - p;
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (FIXTURE) {
      let bal = 1000 * 1_000_000;
      for (const t of fxMyTickets()) {
        bal += (t.payout ?? 0) - t.amounts.reduce((a, b) => a + b, 0);
        this.tickets.set(t.windowId, { windowId: t.windowId, amounts: t.amounts, pending: null, error: null, payout: t.payout });
      }
      this.serverBalance = bal;
      this.emit();
      return;
    }
    void this.boot();
    setInterval(() => void this.refresh(), 5000);
  }

  private async boot() {
    for (let i = 0; ; i++) {
      try {
        if (this.fresh) await this.faucet();
        const me = await this.refresh();
        // The memory runner forgets everything on restart: re-grant if this key is unknown to it.
        if (me && me.balance === 0 && me.positions.length === 0) await this.faucet();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, Math.min(8000, 800 * 2 ** i)));
      }
    }
  }

  /** "Get free Souls" in the wallet window: the one-time grant, asked for again by hand. */
  async topUp(): Promise<'added' | 'already' | 'failed'> {
    if (FIXTURE) {
      await new Promise((r) => setTimeout(r, 400));
      return 'already';
    }
    try {
      const r = await api.faucet(this.owner);
      this.serverBalance = r.balance;
      if (r.granted) this.granted = r.granted;
      this.emit();
      return r.granted ? 'added' : 'already';
    } catch {
      return 'failed';
    }
  }

  private async faucet() {
    const r = await api.faucet(this.owner);
    if (r.granted) this.granted = r.granted;
    this.serverBalance = r.balance;
    this.fresh = false;
    this.emit();
  }

  private refreshing = false;
  async refresh() {
    // One lookup at a time: on a slow runner these would otherwise pile up and starve the rest of the page.
    if (this.refreshing) return null;
    this.refreshing = true;
    try {
      const me = await api.me(this.owner);
      this.serverBalance = me.balance;
      for (const p of me.positions) {
        const t = this.tickets.get(p.windowId) ?? { windowId: p.windowId, amounts: [], pending: null, error: null };
        if (!t.pending) t.amounts = p.amounts.slice();
        if (p.payout !== undefined) t.payout = p.payout;
        this.tickets.set(p.windowId, t);
      }
      this.emit();
      return me;
    } catch {
      return null;
    } finally {
      this.refreshing = false;
    }
  }

  ticket(windowId: string | undefined): Ticket | null {
    if (!windowId) return null;
    const t = this.tickets.get(windowId);
    if (!t) return null;
    if (!t.pending && !t.error && !t.amounts.some((a) => a > 0)) return null;
    return t;
  }

  /** Called from window_settled / window_void with this owner's payout (0 if none). */
  settle(windowId: string, payout: number) {
    const t = this.tickets.get(windowId);
    if (t) t.payout = payout;
    this.emit();
    void this.refresh();
  }

  setName(n: string) {
    this.name = n.slice(0, 24) || this.name;
    try {
      localStorage.setItem(KEY, JSON.stringify({ seed: hex(this.seed), owner: this.owner, name: this.name }));
    } catch {
      /* ignore */
    }
    this.emit();
  }

  /**
   * Sends Souls to another address. Resolves to null when it went through, else a short reason to show.
   * Solana: a transfer signed with the silent key, fees paid by the runner (POST /relay). Practice: POST /dev/transfer.
   */
  async send(to: string, amount: number): Promise<string | null> {
    to = to.trim();
    if (!looksLikeAddress(to)) return 'That address doesn’t look right';
    if (to === this.owner) return 'That’s your own address';
    if (!(amount > 0)) return 'Enter an amount';
    if (amount > (this.balance ?? 0)) return 'Not enough balance';
    try {
      if (FIXTURE) {
        await new Promise((r) => setTimeout(r, 500));
        this.serverBalance = (this.serverBalance ?? 0) - amount;
      } else {
        const cfg = await getConfig();
        if (cfg.chain === 'solana') {
          const { sendPlaySolana } = await import('./solanaSend');
          await sendPlaySolana({ seed: this.seed, owner: this.owner, to, amount, cfg });
          this.serverBalance = (this.serverBalance ?? 0) - amount;
        } else {
          this.serverBalance = (await api.devTransfer({ from: this.owner, to, amount })).balance;
        }
      }
      this.emit();
      if (!FIXTURE) void this.refresh();
      return null;
    } catch (e) {
      return friendly(e);
    }
  }

  async placeBet(w: WindowView, outcome: number, amount: number): Promise<boolean> {
    const t = this.tickets.get(w.windowId) ?? { windowId: w.windowId, amounts: [], pending: null, error: null };
    if (t.pending) return false;
    t.pending = { outcome, amount };
    t.error = null;
    this.tickets.set(w.windowId, t);
    this.emit();
    try {
      let newBalance: number | null = null;
      if (FIXTURE) {
        await new Promise((r) => setTimeout(r, 300));
      } else if ((await getConfig()).chain === 'solana') {
        const cfg = await getConfig();
        const { placeBetSolana } = await import('./solanaBet');
        const sig = await placeBetSolana({ seed: this.seed, owner: this.owner, market: w.market, outcome, amount, cfg });
        if (sig) t.tx = `https://explorer.solana.com/tx/${sig}?cluster=${cfg.cluster ?? 'devnet'}`;
      } else {
        const r = await api.devBet({ owner: this.owner, windowId: w.windowId, outcomeId: w.outcomes[outcome]!.id, amount });
        newBalance = r.balance;
      }
      const a = t.amounts.slice();
      while (a.length < w.outcomes.length) a.push(0);
      a[outcome] = (a[outcome] ?? 0) + amount;
      t.amounts = a;
      t.pending = null;
      this.serverBalance = newBalance ?? (this.serverBalance ?? 0) - amount;
      this.emit();
      return true;
    } catch (e) {
      t.pending = null;
      t.error = friendly(e);
      this.emit();
      setTimeout(() => {
        if (t.error) {
          t.error = null;
          this.emit();
        }
      }, 3500);
      return false;
    }
  }
}

export const wallet = new Wallet();

/** A wallet address as the viewer would paste it: 32 bytes in base58. */
export const looksLikeAddress = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a.trim());

export function useWallet(): Wallet {
  useSyncExternalStore(wallet.subscribe, wallet.getVersion);
  return wallet;
}
