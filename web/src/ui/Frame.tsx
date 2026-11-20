import { useId, useMemo, type HTMLAttributes, type ReactNode } from 'react';
import { cx, InkStroke, InkSvg, useBox } from './ink/Ink';
import { checkerBand, ruledBox } from './ink/shapes';
import './ui.css';

export interface FrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Draw the four rules on when the frame appears. Default true. */
  draw?: boolean;
  seed?: string;
  children?: ReactNode;
}

/** A card: four ruled lines that run past the corners and cross. */
export function Frame({ draw = true, seed, className, children, ...rest }: FrameProps) {
  const auto = useId();
  const [ref, box] = useBox<HTMLDivElement>();
  const rules = useMemo(() => (box.w ? ruledBox(0, 0, box.w, box.h, seed ?? auto, undefined, 7) : []), [box, seed, auto]);
  return (
    <div ref={ref} className={cx('ink-frame', className)} {...rest}>
      <InkSvg box={box} pad={14}>
        <g className="ink-frame-rules">
          {rules.map((s, i) => <InkStroke key={i} s={s} draw={draw ? 'mount' : undefined} delay={i * 90} />)}
        </g>
      </InkSvg>
      {children}
    </div>
  );
}

export interface CheckerFrameProps extends HTMLAttributes<HTMLDivElement> {
  draw?: boolean;
  /** band thickness in px */
  band?: number;
  seed?: string;
  children?: ReactNode;
}

/** The chart's checkered border, with its runs of gold. For the one frame on a page that should feel like the chart's edge. */
export function CheckerFrame({ draw = true, band = 8, seed, className, children, ...rest }: CheckerFrameProps) {
  const auto = useId();
  const [ref, box] = useBox<HTMLDivElement>();
  const art = useMemo(() => (box.w ? checkerBand(box.w, box.h, band, seed ?? auto) : null), [box, band, seed, auto]);
  const mode = draw ? 'mount' : undefined;
  return (
    <div ref={ref} className={cx('ink-checker', className)} {...rest}>
      {art && (
        <InkSvg box={box} pad={12}>
          <g className="ink-frame-rules">
            {art.outer.map((s, i) => <InkStroke key={`o${i}`} s={s} draw={mode} delay={i * 90} />)}
            {art.inner.map((s, i) => <InkStroke key={`i${i}`} s={s} draw={mode} delay={120 + i * 90} />)}
            <InkStroke s={art.ink} draw={mode} delay={260} dur={900} />
          </g>
          <InkStroke className="ink-checker-gold" s={art.gold} draw={mode} delay={260} dur={900} />
        </InkSvg>
      )}
      {children}
    </div>
  );
}
