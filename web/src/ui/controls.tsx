// Switch, checkbox, progress and skeleton. Each drawing is a recipe (ink/recipe.tsx).
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Tone } from './Beacon';
import { cx, InkStroke, InkSvg, useBox } from './ink/Ink';
import { defineRecipe, useInk } from './ink/recipe';
import { check, hatch, loopBox, PEN, ring, rule, ruledBox, star4 } from './ink/shapes';
import './ui.css';

/* ───────── switch ───────── */

const switchRecipe = defineRecipe<Record<string, never>>({
  id: 'switch',
  pad: 6,
  draw(ink, { w, h }) {
    const loop = loopBox(0, 0, w, h, h / 2, ink.seed, ink.pen(PEN.rule), 7);
    const gold = loopBox(0, 0, w, h, h / 2, ink.seed, ink.pen({ ...PEN.rule, w: 1.6 }), 7);
    ink.stroke('rest', loop, { tone: 'ink' });
    // on: the track is shaded in gold pencil
    ink.wipe('on', hatch(7, 5, w - 14, h - 10, `${ink.seed}:on`, { gap: 3.2 }), 7, 5, w - 14, h - 10, { tone: 'gold', dur: 220 });
    ink.stroke('hover', gold, { tone: 'gold', draw: true, dur: 240 });
    ink.stroke('focus', gold, { tone: 'gold' });
    ink.stroke('disabled', loop, { tone: 'faint' });
  },
});

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The words beside the switch. Required: a switch with no words says nothing. */
  label: ReactNode;
  disabled?: boolean;
  seed?: string;
  className?: string;
}

/** An on/off switch. Off, the knob is a plain ring; on, it is the chart's gold star. */
export function Switch({ checked, onChange, label, disabled, seed, className }: SwitchProps) {
  const auto = useId();
  const sd = seed ?? auto;
  const { ref, node } = useInk<HTMLSpanElement, Record<string, never>>(switchRecipe, {}, sd);
  const knob = useMemo(() => ({ ring: ring(9, 9, 6, `${sd}:k`, { w: 1.5, wobble: 0.4 }), star: star4(9, 9, 7.6, `${sd}:s`) }), [sd]);
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={cx('ink-host ink-switch', className)} onClick={() => onChange(!checked)}>
      <span ref={ref} className="ink-switch-track">
        {node}
        <span className="ink-switch-knob">
          <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <path className="ink-switch-ring" d={knob.ring.d} fill="currentColor" />
            <path className="ink-switch-star" d={knob.star} fill="currentColor" />
          </svg>
        </span>
      </span>
      <span className="ink-switch-label">{label}</span>
    </button>
  );
}

/* ───────── checkbox ───────── */

const checkRecipe = defineRecipe<Record<string, never>>({
  id: 'checkbox',
  pad: 8,
  draw(ink, { w, h }) {
    const box = ruledBox(0, 0, w, h, ink.seed, ink.pen(PEN.rule), 3);
    const gold = ruledBox(0, 0, w, h, ink.seed, ink.pen({ ...PEN.rule, w: 1.6 }), 3);
    ink.stroke('rest', box, { tone: 'ink' });
    // on: a tick struck through the box, a little larger than it, as a hand ticks a list
    ink.stroke('on', check(w / 2 + 1.5, h / 2 - 1, w * 1.05, `${ink.seed}:tick`, ink.pen(PEN.bold)), { tone: 'gold', draw: true, dur: 220 });
    ink.stroke('hover', gold, { tone: 'gold', draw: true, stagger: 25, dur: 160 });
    ink.stroke('focus', gold, { tone: 'gold' });
    ink.stroke('disabled', box, { tone: 'faint' });
  },
});

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  seed?: string;
  className?: string;
}

/** A tick box. The tick is drawn on when it is checked. */
export function Checkbox({ checked, onChange, label, disabled, seed, className }: CheckboxProps) {
  const { ref, node } = useInk<HTMLSpanElement, Record<string, never>>(checkRecipe, {}, seed);
  return (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} className={cx('ink-host ink-check', className)} onClick={() => onChange(!checked)}>
      <span ref={ref} className="ink-check-box">{node}</span>
      <span className="ink-check-label">{label}</span>
    </button>
  );
}

/* ───────── progress ───────── */

export interface ProgressProps {
  /** 0 to 1 */
  value: number;
  /** Names what is progressing, for screen readers. */
  label: string;
  tone?: Tone;
  seed?: string;
  className?: string;
  style?: CSSProperties;
}

/** How far along something is: pencil hatching filling a ruled bar. */
export function Progress({ value, label, tone = 'gold', seed = 'progress', className, style }: ProgressProps) {
  const [ref, box] = useBox<HTMLSpanElement>();
  const v = Math.min(1, Math.max(0, value));
  const art = useMemo(() => (box.w ? {
    base: rule(-3, box.h, box.w + 3, box.h, seed, PEN.rule),
    ends: [rule(0, -2, 0, box.h + 2, `${seed}:a`, PEN.fine), rule(box.w, -2, box.w, box.h + 2, `${seed}:b`, PEN.fine)],
    fill: hatch(0, 1, box.w, box.h - 2, `${seed}:f`, { gap: 3.3 }),
  } : null), [box, seed]);
  return (
    <span
      ref={ref}
      className={cx('ink-progress', `ink-tone-${tone}`, className)}
      style={{ ...style, '--left': v } as CSSProperties}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      {art && (
        <>
          <span className="ink-progress-fill"><InkSvg box={box} pad={4}><path d={art.fill} fill="currentColor" /></InkSvg></span>
          <InkSvg box={box} pad={4} className="ink-progress-rules">
            <InkStroke s={art.base} />
            {art.ends.map((s, i) => <InkStroke key={i} s={s} />)}
          </InkSvg>
        </>
      )}
    </span>
  );
}

/* ───────── skeleton ───────── */

export interface SkeletonProps {
  width: number | string;
  height: number;
  seed?: string;
  className?: string;
}

/** A place held for content that is still loading: faint pencil shading at the content's own size. */
export function Skeleton({ width, height, seed = 'skeleton', className }: SkeletonProps) {
  const [ref, box] = useBox<HTMLSpanElement>();
  const d = useMemo(() => (box.w ? hatch(0, 0, box.w, box.h, seed, { gap: 5 }) : ''), [box, seed]);
  return (
    <span ref={ref} className={cx('ink-skeleton', className)} style={{ width, height }} aria-hidden="true">
      {d && <InkSvg box={box} pad={2}><path d={d} fill="currentColor" /></InkSvg>}
    </span>
  );
}
