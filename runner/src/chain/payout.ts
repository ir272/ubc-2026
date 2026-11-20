// Parimutuel payout maths, identical to the program's `claim`:
//   Settled and somebody backed the winner: amounts[winner] * total_pool / pools[winner] (floor)
//   Void, or nobody backed the winner:      full refund of everything the position staked
// Rounding dust (at most one base unit per winner) stays in the vault, as onchain.

export function positionTotal(amounts: readonly number[]): number {
  let s = 0;
  for (const a of amounts) s += a;
  return s;
}

export function payoutFor(
  amounts: readonly number[],
  pools: readonly number[],
  state: 'Settled' | 'Void',
  winner: number,
): number {
  if (state === 'Void') return positionTotal(amounts);
  const winPool = pools[winner] ?? 0;
  if (winPool === 0) return positionTotal(amounts);
  const total = positionTotal(pools);
  // BigInt so large pools never lose precision (onchain uses u128 intermediates).
  return Number((BigInt(amounts[winner] ?? 0) * BigInt(total)) / BigInt(winPool));
}
