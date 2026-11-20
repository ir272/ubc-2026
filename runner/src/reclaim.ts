// Rent reclamation queue. Every finished window's market is handed to chain.reclaim() a little
// after it was settled or voided and paid out, so the show has moved on by then. Best-effort: it
// runs one market at a time in the background, never throws into a match, and retries failures
// with a growing pause. Whatever it gives up on (or a crash leaves behind) is for scripts/sweep.ts.
import type { ChainAdapter } from './types.ts';
import { log } from './lib/log.ts';

export interface ReclaimOpts {
  /** wait after a window finishes before closing its accounts (ms). Env RECLAIM_DELAY_MS. */
  delayMs?: number;
  /** first retry pause; doubles per failure, capped at 10 min (ms) */
  retryMs?: number;
  /** attempts before giving up on a market (the sweep script can pick it up later) */
  maxAttempts?: number;
  /** false = do nothing (env RECLAIM=0); a kill switch, and how the cost without cleanup was measured */
  enabled?: boolean;
}

interface Job {
  market: string;
  dueAt: number;
  attempts: number;
}

const MAX_RETRY_MS = 10 * 60_000;

export class Reclaimer {
  private chain: ChainAdapter;
  private jobs: Job[] = [];
  private queued = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stopped = false;
  private delayMs: number;
  private retryMs: number;
  private maxAttempts: number;
  private enabled: boolean;
  /** totals since start, for logs and /health-style inspection */
  readonly stats = { markets: 0, positions: 0, failures: 0, gaveUp: 0 };

  constructor(chain: ChainAdapter, o: ReclaimOpts = {}) {
    if (chain.kind === 'memory') o = { enabled: false, ...o }; // MemoryChain.reclaim is a no-op anyway
    this.chain = chain;
    this.delayMs = o.delayMs ?? Number(process.env.RECLAIM_DELAY_MS ?? 20_000);
    this.retryMs = o.retryMs ?? 30_000;
    this.maxAttempts = o.maxAttempts ?? 8;
    this.enabled = o.enabled ?? process.env.RECLAIM !== '0';
  }

  /** Queue a finished (settled or void) market for closing. Never throws. */
  enqueue(market: string) {
    if (!this.enabled || this.stopped || !market || this.queued.has(market)) return;
    this.queued.add(market);
    this.jobs.push({ market, dueAt: Date.now() + this.delayMs, attempts: 0 });
    this.schedule();
  }

  get pending() {
    return this.jobs.length;
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    if (this.stopped || this.running || this.jobs.length === 0) return;
    const next = Math.min(...this.jobs.map((j) => j.dueAt));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.drain(), Math.max(0, next - Date.now()));
    this.timer.unref?.(); // cleanup must never keep the process alive
  }

  private async drain() {
    this.timer = null;
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      for (;;) {
        if (this.stopped) return;
        const now = Date.now();
        const i = this.jobs.findIndex((j) => j.dueAt <= now);
        if (i < 0) break;
        const job = this.jobs[i]!;
        this.jobs.splice(i, 1);
        await this.runJob(job);
      }
    } finally {
      this.running = false;
      this.schedule();
    }
  }

  private async runJob(job: Job) {
    let again = false;
    try {
      const r = await this.chain.reclaim(job.market);
      this.stats.positions += r.positions;
      if (r.market) this.stats.markets++;
      if (r.positions || r.market)
        log.info(`reclaim ${job.market}: closed ${r.positions} position(s)${r.market ? ' + market' : ''}`);
      again = !r.done;
    } catch (e) {
      this.stats.failures++;
      log.warn(`reclaim ${job.market} failed (attempt ${job.attempts + 1}): ${(e as Error).message}`);
      again = true;
    }
    if (!again) return void this.queued.delete(job.market);
    job.attempts++;
    if (job.attempts >= this.maxAttempts) {
      this.stats.gaveUp++;
      this.queued.delete(job.market);
      log.warn(`reclaim ${job.market}: giving up after ${job.attempts} attempts (run scripts/sweep.ts later)`);
      return;
    }
    job.dueAt = Date.now() + Math.min(MAX_RETRY_MS, this.retryMs * 2 ** (job.attempts - 1));
    this.jobs.push(job);
  }
}
