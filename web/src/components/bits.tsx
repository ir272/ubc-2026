import { useEffect, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../lib/router';

export function Link({ to, className, children, title }: { to: string; className?: string; children: ReactNode; title?: string }) {
  return (
    <a
      href={to}
      className={className}
      title={title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 3.5C4.5 3.5 1.9 6.1 1 8c.9 1.9 3.5 4.5 7 4.5s6.1-2.6 7-4.5c-.9-1.9-3.5-4.5-7-4.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.2" y="7.6" width="1.6" height="5" rx="0.8" fill="currentColor" />
      <circle cx="9" cy="5.4" r="1" fill="currentColor" />
    </svg>
  );
}

export function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.5" y="4" width="9.5" height="8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 7l3.5-2v6L11 9z" fill="currentColor" />
    </svg>
  );
}

/** Animates its height to fit its content, so state changes collapse/expand instead of jumping. */
export function AutoHeight({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={`autoh ${className ?? ''}`} style={{ height: h }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

/** Counts from the previous value to `value` whenever it changes. */
export function useCountUp(value: number, ms = 900, from?: number): number {
  const [shown, setShown] = useState(from ?? value);
  const cur = useRef(from ?? value);
  useEffect(() => {
    const a = cur.current, b = value;
    if (a === b) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = a + (b - a) * e;
      setShown(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export const sideClass = (i: number) => `side-${'abcd'[Math.min(i, 3)]}`;

/** A small generated avatar for the guest wallet: a symmetric 5×5 block pattern from the key. */
export function Identicon({ seed, size = 32 }: { seed: string; size?: number }) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const bits: boolean[] = [];
  let x = h;
  for (let i = 0; i < 15; i++) {
    bits.push((x & 1) === 1);
    x = (x >>> 1) | ((x & 1) << 31);
    if (i % 5 === 4) x = Math.imul(x ^ (x >>> 13), 2654435761) >>> 0;
  }
  const hue = h % 360;
  const cells: JSX.Element[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++)
      if (bits[r * 3 + c]) {
        cells.push(<rect key={`${r}-${c}`} x={c + 1} y={r + 1} width="1" height="1" />);
        if (c < 2) cells.push(<rect key={`${r}-${4 - c}`} x={5 - c} y={r + 1} width="1" height="1" />);
      }
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" aria-hidden shapeRendering="crispEdges">
      <rect width="7" height="7" fill={`hsl(${hue} 30% 16%)`} />
      <g fill={`hsl(${hue} 65% 62%)`}>{cells}</g>
    </svg>
  );
}

export function timeAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** speaker icon: crossed out at 0, one wave when quiet, two when loud */
export function VolumeIcon({ level }: { level: number }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5h2.6L9.5 4v12l-3.9-3.5H3z" fill="currentColor" stroke="none" />
      {level <= 0 ? (
        <path d="M12.5 7.5l5 5M17.5 7.5l-5 5" />
      ) : (
        <>
          <path d="M12.3 7.6a3.4 3.4 0 0 1 0 4.8" />
          {level > 0.5 && <path d="M14.6 5.4a6.5 6.5 0 0 1 0 9.2" />}
        </>
      )}
    </svg>
  );
}
