export const UNIT = 1_000_000;
/** What the site calls its money. A placeholder until the platform has a name: change it here only. */
export const CURRENCY = 'Play dollars';

/** Base units → "$1,240". Play money is shown in whole dollars; pass cents: true to show cents. */
export function usd(base: number, opts: { cents?: boolean; sign?: boolean } = {}): string {
  const dollars = base / UNIT;
  const cents = opts.cents ?? false;
  const s = Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const sign = dollars < 0 ? '-' : opts.sign ? '+' : '';
  return `${sign}$${s}`;
}

/** Compact, for pools: $1.2k */
export function usdShort(base: number): string {
  const d = base / UNIT;
  if (d >= 10_000) return `$${(d / 1000).toFixed(0)}k`;
  if (d >= 1000) return `$${(d / 1000).toFixed(1)}k`;
  return `$${Math.round(d).toLocaleString('en-US')}`;
}

export const mult = (x: number | null) =>
  x == null || !isFinite(x) ? '—' : `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}x`;
