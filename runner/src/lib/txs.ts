import type { WindowTx } from '../types.ts';

/** Trims a window's transaction list to `max`: oldest bets are dropped first, then the oldest of anything. */
export function capTxs(txs: WindowTx[], max: number): WindowTx[] {
  const out = [...txs];
  while (out.length > max) {
    const i = out.findIndex((t) => t.kind === 'bet');
    out.splice(i < 0 ? 0 : i, 1);
  }
  return out;
}
