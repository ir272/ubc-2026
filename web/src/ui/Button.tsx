import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from './ink/Ink';
import { defineRecipe, useInk } from './ink/recipe';
import { hatch, PEN, plate, ruledBox } from './ink/shapes';
import './ui.css';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** `primary`: an ink plate inside crossing rules, for the one main action. `quiet`: rules only. */
  variant?: 'primary' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /**
   * The action went through: the plate is washed over in gold and the button stops taking presses.
   * Change the label at the same time ("Place bet" to "Bet placed"); it stays the same button.
   */
  confirmed?: boolean;
  /** One of several choices that is the current one (an amount, a take): its rules are gold. */
  selected?: boolean;
  /** Keeps the drawing identical between renders; defaults to a per-instance id. */
  seed?: string;
  /** Changing the label keeps the same button and crossfades the words. */
  children: ReactNode;
}

/** The button's drawing, state by state. */
export const buttonRecipe = defineRecipe<{ primary: boolean; selected?: boolean }>({
  id: 'button',
  draw(ink, { w, h }, { primary, selected }) {
    const m = 3; // the plate sits inside the rules
    const rules = ruledBox(0, 0, w, h, ink.seed, ink.pen(PEN.rule), 4);
    const gold = ruledBox(0, 0, w, h, ink.seed, ink.pen({ ...PEN.rule, w: 1.6 }), 4);
    const face = plate(m, m, w - 2 * m, h - 2 * m, `${ink.seed}:p`);

    if (primary) ink.fill('rest', face, { tone: 'ink' });
    ink.stroke('rest', selected ? gold : rules, { tone: selected ? 'gold' : 'ink' });

    // hover: the rules are drawn over in gold; a quiet button also takes a wash of hatching
    if (!primary) ink.wipe('hover', hatch(3, 3, w - 6, h - 6, `${ink.seed}:h`, { gap: 4.5 }), 3, 3, w - 6, h - 6, { tone: 'ink', opacity: 0.34, dur: 240 });
    ink.stroke('hover', gold, { tone: 'gold', draw: true, stagger: 30, dur: 200 });

    if (!primary) ink.fill('pressed', hatch(3, 3, w - 6, h - 6, `${ink.seed}:h2`, { gap: 4.5, angle: 58 }), { tone: 'ink', opacity: 0.3 });
    ink.stroke('focus', gold, { tone: 'gold' });

    // on: the action went through
    ink.wipe('on', face, m, m, w - 2 * m, h - 2 * m, { tone: 'gold', dur: 360 });

    ink.stroke('disabled', rules, { tone: 'faint' });
  },
});

export function Button({ variant = 'quiet', size = 'md', block, confirmed, selected, seed, className, children, type = 'button', onClick, ...rest }: ButtonProps) {
  const primary = variant === 'primary';
  const { ref, node } = useInk<HTMLButtonElement, { primary: boolean; selected?: boolean }>(buttonRecipe, { primary, selected: !!selected }, seed);
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ink-host ink-btn', primary ? 'ink-btn-primary' : 'ink-btn-quiet', size !== 'md' && `ink-btn-${size}`, block && 'ink-btn-block', confirmed && 'ink-on ink-still ink-btn-done', className)}
      aria-disabled={confirmed || undefined}
      aria-pressed={selected == null ? undefined : selected}
      onClick={confirmed ? undefined : onClick}
      {...rest}
    >
      {node}
      <Label>{children}</Label>
    </button>
  );
}

/** Keeps the outgoing words mounted for one crossfade, so the label changes on the same button. */
function Label({ children }: { children: ReactNode }) {
  const text = typeof children === 'string' ? children : null;
  const [cur, setCur] = useState(text);
  const [old, setOld] = useState<string | null>(null);
  if (text !== cur) {
    setOld(cur);
    setCur(text);
  }
  useEffect(() => {
    if (old == null) return;
    const t = setTimeout(() => setOld(null), 200);
    return () => clearTimeout(t);
  }, [old, cur]);
  return (
    <span className="ink-btn-label">
      <span key={cur ?? 'node'} className={old != null ? 'ink-label-in' : undefined}>{children}</span>
      {old != null && <span key={`out:${old}`} className="ink-label-out" aria-hidden="true">{old}</span>}
    </span>
  );
}
