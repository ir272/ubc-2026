import { useId, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { Tone } from './Beacon';
import { cx, InkStroke, InkSvg, useBox } from './ink/Ink';
import { check, hatch, PEN, rule, ruledBox, star4 } from './ink/shapes';
import './ui.css';

export interface BetSide {
  id: string;
  label: string;
  /** share of the pot, 0..1 */
  share: number;
  /** what one unit pays, e.g. 2.4; leave out when nothing can be won yet */
  multiple?: number | null;
  tone?: Tone;
  /** Any CSS colour for the hatching, instead of a pencil (an entrant's own colour). */
  color?: string;
  testId?: string;
}

/**
 * open: pick a side. placing: the pick is boxed and the rows are locked while the bet is sent.
 * placed: locked, with a tick beside the pick. locked: betting is closed. won / lost: the result of the pick.
 */
export type BetState = 'open' | 'placing' | 'placed' | 'locked' | 'won' | 'lost';

export interface BetSidesProps {
  sides: BetSide[];
  /** id of the picked side */
  value: string | null;
  onChange?: (id: string) => void;
  state?: BetState;
  /** shown beside the pick once placed, e.g. "25" */
  stake?: string;
  /** A stake the viewer already holds: a tick and the amount on that row, in any state (betting may still be open). */
  staked?: { id: string; text: string } | null;
  /** The side that won. Its row gets the gold box, a star and "Won"; the others fade. */
  winner?: string | null;
  /** Tighter rows, for five outcomes or more. */
  dense?: boolean;
  /** Each side on one line: name, bar, share, multiple. For narrow columns. */
  line?: boolean;
  /** names the group for screen readers, e.g. the question */
  label: string;
  seed?: string;
}

const TONES: Tone[] = ['blue', 'coral', 'green', 'yellow'];

/** The sides of a bet as a radio group: name, pencil-hatched share bar, share and multiple. */
export function BetSides({ sides, value, onChange, state = 'open', stake, staked, winner, dense, line, label, seed }: BetSidesProps) {
  const auto = useId();
  const sd = seed ?? auto;
  const group = useRef<HTMLDivElement>(null);
  const locked = state !== 'open' || !onChange;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step || locked) return;
    e.preventDefault();
    const at = Math.max(0, sides.findIndex((s) => s.id === value));
    const next = sides[(at + step + sides.length) % sides.length]!;
    onChange?.(next.id);
    group.current?.querySelector<HTMLButtonElement>(`[data-side="${CSS.escape(next.id)}"]`)?.focus();
  };
  return (
    <div ref={group} className={cx('ink-sides', dense && 'ink-sides-dense', line && 'ink-sides-line')} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {sides.map((s, i) => {
        const picked = value === s.id;
        const done = picked && (state === 'placed' || state === 'won' || state === 'lost');
        const won = winner != null ? winner === s.id : picked && state === 'won';
        const faded = winner != null ? winner !== s.id : (state === 'lost' && picked) || (state !== 'open' && value != null && !picked);
        return (
          <Row
            key={s.id}
            side={s}
            tone={s.tone ?? TONES[i % TONES.length]!}
            boxed={picked || won}
            checked={picked}
            tabbable={value ? picked : i === 0}
            locked={locked}
            faded={faded}
            won={won}
            result={winner != null}
            tick={staked ? (staked.id === s.id ? staked.text : null) : done ? (stake ?? '') : null}
            seed={`${sd}:${s.id}`}
            onPick={() => !locked && onChange?.(s.id)}
          />
        );
      })}
    </div>
  );
}

function Row({ side, tone, boxed, checked, tabbable, locked, faded, won, result, tick, seed, onPick }: {
  side: BetSide; tone: Tone; boxed: boolean; checked: boolean; tabbable: boolean; locked: boolean; faded: boolean; won: boolean; result: boolean;
  tick: string | null; seed: string; onPick: () => void;
}) {
  const [ref, box] = useBox<HTMLButtonElement>();
  const art = useMemo(() => (box.w ? {
    rest: ruledBox(0, 0, box.w, box.h, seed, PEN.fine, 4),
    box: ruledBox(0, 0, box.w, box.h, seed, { ...PEN.rule, w: 1.5 }, 5),
  } : null), [box, seed]);
  const pct = Math.round(side.share * 100);
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={locked || undefined}
      tabIndex={tabbable ? 0 : -1}
      data-side={side.id}
      data-testid={side.testId}
      className={cx('ink-side', `ink-tone-${tone}`, boxed && 'ink-on', faded && 'ink-side-lost', locked && 'ink-side-locked')}
      style={side.color ? ({ '--tone': side.color } as CSSProperties) : undefined}
      onClick={onPick}
    >
      {art && (
        <InkSvg box={box}>
          <g className="ink-side-rest">{art.rest.map((s, i) => <InkStroke key={i} s={s} />)}</g>
          <g className="ink-side-box">{art.box.map((s, i) => <InkStroke key={i} s={s} draw="state" delay={i * 40} dur={220} />)}</g>
        </InkSvg>
      )}
      <span className="ink-side-label">
        <span>{side.label}</span>
        {tick != null && <Tick seed={seed} />}
        {tick && <span className="ink-side-stake ink-num">{tick}</span>}
      </span>
      {result
        ? <span className="ink-side-mult">{won ? 'Won' : ''}</span>
        : <span className="ink-side-mult ink-num">{side.multiple != null ? `${side.multiple.toFixed(2)}×` : ''}</span>}
      <ShareBar share={side.share} seed={seed} />
      <span className="ink-side-share ink-num">{pct}%</span>
      {won && <Star seed={seed} />}
    </button>
  );
}

function ShareBar({ share, seed }: { share: number; seed: string }) {
  const [ref, box] = useBox<HTMLSpanElement>();
  const art = useMemo(() => (box.w ? {
    base: rule(0, box.h, box.w, box.h, seed + ':base', PEN.fine),
    fill: hatch(0, 0, box.w, box.h - 1, seed + ':fill', { gap: 3.3 }),
  } : null), [box, seed]);
  return (
    <span ref={ref} className="ink-side-bar" style={{ '--share': Math.min(1, Math.max(0, share)) } as CSSProperties}>
      {art && (
        <>
          <InkSvg box={box} pad={4} className="ink-side-base"><InkStroke s={art.base} /></InkSvg>
          <span className="ink-side-fill">
            <InkSvg box={box} pad={4}><path d={art.fill} fill="currentColor" /></InkSvg>
          </span>
        </>
      )}
    </span>
  );
}

function Tick({ seed }: { seed: string }) {
  const s = useMemo(() => check(8, 8, 12, seed + ':tick'), [seed]);
  return (
    <span className="ink-side-mark">
      <InkSvg box={{ w: 16, h: 16 }} pad={3}><InkStroke s={s} draw="mount" dur={260} delay={80} /></InkSvg>
    </span>
  );
}

function Star({ seed }: { seed: string }) {
  const d = useMemo(() => star4(11, 11, 8, seed + ':star'), [seed]);
  return (
    <svg className="ink-side-star" viewBox="0 0 22 22" aria-hidden="true" focusable="false"><path d={d} fill="currentColor" /></svg>
  );
}
