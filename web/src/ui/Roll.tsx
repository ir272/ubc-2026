import { useEffect, useState, type CSSProperties } from 'react';
import { cx } from './ink/Ink';
import './ui.css';

export interface RollProps {
  /** The text to show, e.g. "1,240.50" or "0:42". Only the characters that changed move. */
  value: string;
  /** `up`: new characters rise into place (a balance growing). `down`: they drop in (a clock running down). */
  dir?: 'up' | 'down';
  className?: string;
}

/** A value that changes by rolling: last character first, unchanged characters stay still. */
export function Roll({ value, dir = 'up', className }: RollProps) {
  const [cur, setCur] = useState(value);
  const [old, setOld] = useState<string | null>(null);
  const [gen, setGen] = useState(0);
  if (value !== cur) {
    setOld(cur);
    setCur(value);
    setGen((g) => g + 1);
  }
  useEffect(() => {
    if (!gen) return;
    const t = setTimeout(() => setOld(null), 460);
    return () => clearTimeout(t);
  }, [gen]);
  const n = cur.length;
  return (
    <span className={cx('ink-roll ink-num', className)} data-dir={dir}>
      <span className="ink-sr">{cur}</span>
      <span className="ink-roll-row" aria-hidden="true">
        {cur.split('').map((ch, i) => {
          const fromRight = n - 1 - i;
          const was = old != null ? old[old.length - 1 - fromRight] : undefined;
          const changed = old != null && was !== ch;
          return (
            <span key={fromRight} className="ink-roll-slot" style={{ '--ink-d': `${Math.min(fromRight, 5) * 35}ms` } as CSSProperties}>
              <span key={`${gen}:${ch}`} className={changed ? 'ink-roll-in' : undefined}>{ch}</span>
              {changed && was && <span key={`out:${gen}`} className="ink-roll-out">{was}</span>}
            </span>
          );
        })}
      </span>
    </span>
  );
}
