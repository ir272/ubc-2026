// React glue for the ink engine: measure the host, lay an svg over it, draw strokes,
// and draw a stroke on by sliding a mask along its centre line.

import {
  createContext, useContext, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type ReactNode, type RefObject,
} from 'react';
import type { Stroke } from './stroke';

export interface Box { w: number; h: number }

/** Size of an element in layout px. Transforms (the press scale) do not change it. */
export function useBox<T extends HTMLElement>(): [RefObject<T>, Box] {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

const View = createContext({ x: 0, y: 0, w: 0, h: 0 });

/** An svg laid over its (position: relative) host, with `pad` px of room for lines that run past the edge. */
export function InkSvg({ box, pad = 10, className, children }: { box: Box; pad?: number; className?: string; children: ReactNode }) {
  if (!box.w || !box.h) return null;
  const v = { x: -pad, y: -pad, w: box.w + 2 * pad, h: box.h + 2 * pad };
  return (
    <svg
      className={`ink-svg${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      focusable="false"
      width={v.w}
      height={v.h}
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      style={{ left: -pad, top: -pad }}
    >
      <View.Provider value={v}>{children}</View.Provider>
    </svg>
  );
}

export interface InkStrokeProps {
  s: Stroke;
  /**
   * `mount`: draws itself on when it appears.
   * `state`: stays hidden until CSS reveals it (hover, selected, focus); see `.ink-reveal` in ui.css.
   */
  draw?: 'mount' | 'state';
  delay?: number;
  dur?: number;
  className?: string;
}

export const drawMs = (s: Stroke) => Math.round(Math.min(520, Math.max(180, s.len * 1.3)));

export function InkStroke({ s, draw, delay = 0, dur, className }: InkStrokeProps) {
  const id = `ink${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const v = useContext(View);
  if (!s.d) return null;
  if (!draw) return <path className={className} d={s.d} fill="currentColor" />;
  const style = { '--ink-d': `${delay}ms`, '--ink-t': `${dur ?? drawMs(s)}ms` } as CSSProperties;
  return (
    <g className={`${draw === 'mount' ? 'ink-draw' : 'ink-reveal'}${className ? ` ${className}` : ''}`} style={style}>
      <mask id={id} maskUnits="userSpaceOnUse" x={v.x} y={v.y} width={v.w} height={v.h}>
        <path className="ink-guide" d={s.guide} pathLength={1} fill="none" stroke="#fff" strokeWidth={s.w * 3 + 3} />
      </mask>
      <path d={s.d} fill="currentColor" mask={`url(#${id})`} />
    </g>
  );
}

export const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' ');
