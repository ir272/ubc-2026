import { useMemo, type CSSProperties } from 'react';
import { cx } from './ink/Ink';
import { makeRng } from './ink/rng';
import { ring, star4 } from './ink/shapes';
import './ui.css';

export type Tone = 'gold' | 'blue' | 'coral' | 'green' | 'yellow' | 'ink';

export interface BeaconProps {
  /** px */
  size?: number;
  tone?: Tone;
  /** Read out by screen readers, e.g. "Live". Leave empty when the word is already next to it. */
  label?: string;
  /** Beacons with different seeds pulse out of step, so a list of them does not blink in unison. */
  seed?: string;
  className?: string;
}

/** The live mark: the medallion's four-point star, twinkling, with a ring that drifts out and fades. */
export function Beacon({ size = 14, tone = 'gold', label, seed = 'beacon', className }: BeaconProps) {
  const art = useMemo(() => ({
    star: star4(10, 10, 6.4, seed),
    ring: ring(10, 10, 6, seed + ':r', { w: 0.9, wobble: 0.3, dry: 0.4 }),
    delay: -Math.round(makeRng(seed)() * 2400),
  }), [seed]);
  return (
    <span
      className={cx('ink-beacon', `ink-tone-${tone}`, className)}
      style={{ width: size, height: size, '--ink-d': `${art.delay}ms` } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
        <path className="ink-beacon-ring" d={art.ring.d} fill="currentColor" />
        <path className="ink-beacon-star" d={art.star} fill="currentColor" />
      </svg>
    </span>
  );
}
