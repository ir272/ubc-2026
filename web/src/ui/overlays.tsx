// Tooltip, menu and toast: the parts that appear over the page.
import {
  cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type KeyboardEvent, type ReactElement, type ReactNode,
} from 'react';
import { cx } from './ink/Ink';
import { defineRecipe, useInk } from './ink/recipe';
import { hatch, PEN, rule, ruledBox, star4 } from './ink/shapes';
import './ui.css';

/* ───────── shared: a small ruled panel on paper ───────── */

const panelRecipe = defineRecipe<{ gold?: boolean }>({
  id: 'panel',
  pad: 10,
  draw(ink, { w, h }, { gold }) {
    ink.stroke('rest', ruledBox(0, 0, w, h, ink.seed, ink.pen(PEN.rule), 5), { tone: gold ? 'gold' : 'soft' });
  },
});

/* ───────── tooltip ───────── */

let lastTipClosed = 0; // lets the next tooltip skip its delay, so a toolbar feels quick

export interface TooltipProps {
  /** The short text. One line. */
  text: string;
  side?: 'top' | 'bottom';
  /** The control the tooltip describes: one element that can take focus. */
  children: ReactElement;
}

/** A short label that appears on hover or keyboard focus. The second tooltip in a row opens at once. */
export function Tooltip({ text, side = 'top', children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const timer = useRef<number>();
  const show = (now: boolean) => {
    clearTimeout(timer.current);
    const quick = now || performance.now() - lastTipClosed < 400;
    setInstant(quick);
    if (quick) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), 500);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen((was) => {
      if (was) lastTipClosed = performance.now();
      return false;
    });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span
      className="ink-tip-wrap"
      onPointerEnter={(e) => e.pointerType === 'mouse' && show(false)}
      onPointerLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
      onKeyDown={(e) => e.key === 'Escape' && hide()}
    >
      {cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open && <TipBubble id={id} text={text} side={side} instant={instant} />}
    </span>
  );
}

function TipBubble({ id, text, side, instant }: { id: string; text: string; side: 'top' | 'bottom'; instant: boolean }) {
  const { ref, node } = useInk<HTMLSpanElement, { gold?: boolean }>(panelRecipe, {}, `tip:${text}`);
  return (
    <span ref={ref} id={id} role="tooltip" className={cx('ink-tip', `ink-tip-${side}`, instant && 'ink-tip-instant')}>
      {node}
      {text}
    </span>
  );
}

/* ───────── menu ───────── */

const itemRecipe = defineRecipe<Record<string, never>>({
  id: 'menu-item',
  pad: 4,
  draw(ink, { w, h }) {
    const wash = hatch(2, 3, w - 4, h - 6, `${ink.seed}:h`, { gap: 4.5 });
    ink.wipe('hover', wash, 2, 3, w - 4, h - 6, { tone: 'ink', opacity: 0.3, dur: 180 });
    ink.fill('focus', wash, { tone: 'ink', opacity: 0.3 });
    ink.stroke('focus', rule(0, 3, 0, h - 3, `${ink.seed}:f`, ink.pen(PEN.bold)), { tone: 'gold' });
  },
});

export interface MenuItem {
  id: string;
  label: string;
  /** Shown at the right in a quieter voice, such as an amount. */
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface MenuProps {
  /** Names the menu for screen readers, such as "Wallet". */
  label: string;
  /** The control that opens it: one button. */
  trigger: ReactElement;
  items: MenuItem[];
  /** Which edge of the trigger the menu lines up with. */
  align?: 'start' | 'end';
  seed?: string;
}

/** A list of actions that opens from a button. Arrow keys move, Enter chooses, Escape closes. */
export function Menu({ label, trigger, items, align = 'start', seed }: MenuProps) {
  const id = useId();
  const sd = seed ?? id;
  const wrap = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [byKey, setByKey] = useState(false);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) wrap.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  // opened from the keyboard, focus goes to the first item; opened by pointer, to the menu itself
  useLayoutEffect(() => {
    if (!open) return;
    const menu = wrap.current?.querySelector<HTMLElement>('[role="menu"]');
    (byKey ? menu?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)') : menu)?.focus();
  }, [open, byKey]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
    const at = els.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => els[(i + els.length) % els.length]?.focus();
    if (e.key === 'ArrowDown') { e.preventDefault(); go(at + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(at < 0 ? els.length - 1 : at - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(els.length - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') setOpen(false);
    else if (e.key.length === 1) {
      const hit = els.find((el) => el.textContent?.trim().toLowerCase().startsWith(e.key.toLowerCase()));
      hit?.focus();
    }
  };

  return (
    <span ref={wrap} className="ink-menu-wrap">
      {cloneElement(trigger, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
        onClick: (e: { detail: number }) => { setByKey(e.detail === 0); setOpen((v) => !v); },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setByKey(true); setOpen(true); }
        },
      })}
      {open && (
        <MenuPanel id={id} label={label} align={align} instant={byKey} seed={sd} onKeyDown={onMenuKey}>
          {items.map((it) => (
            <Item key={it.id} item={it} seed={`${sd}:${it.id}`} onChoose={() => { close(true); it.onSelect(); }} />
          ))}
        </MenuPanel>
      )}
    </span>
  );
}

function MenuPanel({ id, label, align, instant, seed, onKeyDown, children }: { id: string; label: string; align: 'start' | 'end'; instant: boolean; seed: string; onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void; children: ReactNode }) {
  const { ref, node } = useInk<HTMLDivElement, { gold?: boolean }>(panelRecipe, {}, seed);
  return (
    <div ref={ref} id={id} role="menu" aria-label={label} tabIndex={-1} className={cx('ink-menu', `ink-menu-${align}`, instant && 'ink-menu-instant')} onKeyDown={onKeyDown}>
      {node}
      {children}
    </div>
  );
}

function Item({ item, seed, onChoose }: { item: MenuItem; seed: string; onChoose: () => void }) {
  const { ref, node } = useInk<HTMLButtonElement, Record<string, never>>(itemRecipe, {}, seed);
  return (
    <button ref={ref} type="button" role="menuitem" tabIndex={-1} disabled={item.disabled} className="ink-host ink-menu-item" onClick={onChoose}>
      {node}
      <span>{item.label}</span>
      {item.hint && <span className="ink-menu-hint ink-num">{item.hint}</span>}
    </button>
  );
}

/* ───────── toast ───────── */

export interface ToastOptions {
  /** A second, quieter line. */
  detail?: string;
  /** gold marks good news (a win) with the chart's star; coral marks a problem. */
  tone?: 'ink' | 'gold' | 'coral';
  /** ms before it leaves. Default 4500. */
  duration?: number;
}
interface ToastItem extends ToastOptions { id: number; message: string; leaving?: boolean }

let toasts: ToastItem[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const drop = (id: number) => {
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 220);
};

/** Shows a short notice. Needs one `<Toaster />` somewhere on the page. */
export function toast(message: string, options: ToastOptions = {}): number {
  const id = nextId++;
  toasts = [...toasts, { id, message, ...options }].slice(-4);
  emit();
  return id;
}

/** Where toasts appear: the bottom right corner. Put one on the page. */
export function Toaster() {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => toasts);
  return (
    <div className="ink-toaster" role="region" aria-label="Notices">
      {list.map((t) => <ToastCard key={t.id} t={t} />)}
    </div>
  );
}

function ToastCard({ t }: { t: ToastItem }) {
  const { ref, node } = useInk<HTMLDivElement, { gold?: boolean }>(panelRecipe, { gold: t.tone === 'gold' }, `toast:${t.id}`);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || t.leaving) return;
    const timer = setTimeout(() => drop(t.id), t.duration ?? 4500);
    return () => clearTimeout(timer);
  }, [held, t.id, t.duration, t.leaving]);
  const star = t.tone === 'gold' ? star4(9, 9, 7.6, `toast:${t.id}`) : null;
  return (
    <div
      ref={ref}
      className={cx('ink-toast', t.tone && `ink-toast-${t.tone}`, t.leaving && 'ink-toast-leaving')}
      role={t.tone === 'coral' ? 'alert' : 'status'}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      {node}
      {star && <svg className="ink-toast-star" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d={star} fill="currentColor" /></svg>}
      <div className="ink-toast-text">
        <div className="ink-toast-msg">{t.message}</div>
        {t.detail && <div className="ink-toast-detail">{t.detail}</div>}
      </div>
      <button type="button" className="ink-toast-close" aria-label="Dismiss" onClick={() => drop(t.id)}>
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" /></svg>
      </button>
    </div>
  );
}
