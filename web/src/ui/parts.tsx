// The smaller parts of the kit: pill, BOT tag, chat row, tabs, text input, countdown, balance pill, medallion.
import {
  useEffect, useId, useMemo, useRef, useState,
  type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode,
} from 'react';
import { Beacon, type Tone } from './Beacon';
import { cx, InkStroke, InkSvg, useBox } from './ink/Ink';
import { hatch, loopBox, PEN, radialTicks, ring, rule, ruledBox, star4 } from './ink/shapes';
import { Roll } from './Roll';
import './ui.css';

/* ───────── pill ───────── */

export interface PillProps {
  tone?: Tone;
  /** Adds the live beacon in front of the words. */
  live?: boolean;
  seed?: string;
  children: ReactNode;
  className?: string;
}

/** A small label inside a hand-drawn loop: a category, a viewer count, "Live". */
export function Pill({ tone = 'ink', live, seed, children, className }: PillProps) {
  const auto = useId();
  const sd = seed ?? auto;
  const [ref, box] = useBox<HTMLSpanElement>();
  const loop = useMemo(() => (box.w ? loopBox(0, 0, box.w, box.h, box.h / 2, sd, PEN.fine) : null), [box, sd]);
  return (
    <span ref={ref} className={cx('ink-pill', `ink-tone-${tone}`, className)}>
      {loop && <InkSvg box={box} pad={4}><InkStroke className="ink-pill-loop" s={loop} /></InkSvg>}
      {live && <Beacon size={12} seed={sd} />}
      {children}
    </span>
  );
}

/** The BOT tag for chat names: three letters in a small ruled box. */
export function BotTag({ seed = 'bot' }: { seed?: string }) {
  const [ref, box] = useBox<HTMLSpanElement>();
  const rules = useMemo(() => (box.w ? ruledBox(0, 0, box.w, box.h, seed, PEN.fine, 2) : []), [box, seed]);
  return (
    <span ref={ref} className="ink-bot">
      <InkSvg box={box} pad={4}>{rules.map((s, i) => <InkStroke key={i} s={s} />)}</InkSvg>
      BOT
    </span>
  );
}

/* ───────── chat row ───────── */

export interface ChatRowProps {
  name: string;
  /** pencil colour of the name */
  tone?: Tone;
  bot?: boolean;
  /** A message that just arrived rises into place once. */
  fresh?: boolean;
  children: ReactNode;
}

export function ChatRow({ name, tone = 'ink', bot, fresh, children }: ChatRowProps) {
  return (
    <div className={cx('ink-msg', fresh && 'ink-msg-fresh')}>
      {bot && <BotTag seed={name} />}
      <span className={cx('ink-msg-name', `ink-tone-${tone}`)}>{name}</span>
      <span className="ink-msg-text">{children}</span>
    </div>
  );
}

/* ───────── tabs ───────── */

export interface TabsProps {
  tabs: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  /** names the tab list for screen readers */
  label: string;
  /** Shared with TabPanel so tabs and panels point at each other. */
  idBase: string;
  seed?: string;
}

/** A tab list. The selected tab's underline is drawn on; arrow keys, Home and End move between tabs. */
export function Tabs({ tabs, value, onChange, label, idBase, seed }: TabsProps) {
  const list = useRef<HTMLDivElement>(null);
  const [byKey, setByKey] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((t) => t.id === value);
    const to = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (to == null) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length]!;
    setByKey(true);
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${idBase}-tab-${next.id}`)}`)?.focus();
  };
  return (
    <div ref={list} className={cx('ink-tabs', byKey && 'ink-instant')} role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <Tab key={t.id} id={`${idBase}-tab-${t.id}`} panel={`${idBase}-panel-${t.id}`} on={t.id === value} seed={`${seed ?? idBase}:${t.id}`}
          onPick={() => { setByKey(false); onChange(t.id); }}>
          {t.label}
        </Tab>
      ))}
    </div>
  );
}

function Tab({ id, panel, on, seed, onPick, children }: { id: string; panel: string; on: boolean; seed: string; onPick: () => void; children: ReactNode }) {
  const [ref, box] = useBox<HTMLButtonElement>();
  const line = useMemo(() => (box.w ? rule(-3, box.h - 2, box.w + 3, box.h - 2.6, seed, { ...PEN.bold, w: 1.7 }) : null), [box, seed]);
  return (
    <button ref={ref} id={id} type="button" role="tab" aria-selected={on} aria-controls={panel} tabIndex={on ? 0 : -1} className={cx('ink-tab', on && 'ink-on')} onClick={onPick}>
      {line && (
        <InkSvg box={box} pad={6}>
          <InkStroke className="ink-tab-hover" s={line} />
          <InkStroke className="ink-tab-line" s={line} draw="state" dur={240} />
        </InkSvg>
      )}
      {children}
    </button>
  );
}

export function TabPanel({ idBase, id, active, children }: { idBase: string; id: string; active: boolean; children: ReactNode }) {
  return (
    <div id={`${idBase}-panel-${id}`} role="tabpanel" aria-labelledby={`${idBase}-tab-${id}`} hidden={!active} className="ink-tabpanel" tabIndex={0}>
      {active && children}
    </div>
  );
}

/* ───────── text input ───────── */

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Always given; shown above the field unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  /** e.g. a currency mark */
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Shown under the field in coral, and announced. */
  error?: string;
  seed?: string;
}

/** A field written on a ruled line. Focus draws the line over in gold. */
export function TextInput({ label, hideLabel, prefix, suffix, error, seed, className, id, ...rest }: TextInputProps) {
  const auto = useId();
  const fid = id ?? auto;
  const [ref, box] = useBox<HTMLSpanElement>();
  const line = useMemo(() => (box.w ? rule(-4, box.h, box.w + 4, box.h - 0.6, seed ?? fid, PEN.rule) : null), [box, seed, fid]);
  const bold = useMemo(() => (box.w ? rule(-4, box.h, box.w + 4, box.h - 0.6, seed ?? fid, { ...PEN.bold, w: 1.7 }) : null), [box, seed, fid]);
  return (
    <span className={cx('ink-field', error && 'ink-field-bad', className)}>
      <label htmlFor={fid} className={hideLabel ? 'ink-sr' : 'ink-field-label'}>{label}</label>
      <span ref={ref} className="ink-field-box">
        {line && bold && (
          <InkSvg box={box} pad={6}>
            <InkStroke className="ink-field-line" s={line} />
            <InkStroke className="ink-field-focus" s={bold} draw="state" dur={260} />
          </InkSvg>
        )}
        {prefix != null && <span className="ink-field-affix">{prefix}</span>}
        <input id={fid} className="ink-input" aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-err` : undefined} {...rest} />
        {suffix != null && <span className="ink-field-affix">{suffix}</span>}
      </span>
      {error && <span id={`${fid}-err`} className="ink-field-err" role="alert">{error}</span>}
    </span>
  );
}

/* ───────── countdown ───────── */

export interface CountdownProps {
  /** seconds left; the parent owns the clock */
  seconds: number;
  /** length of the whole window in seconds, for the bar */
  total: number;
  /** read before the time by screen readers, e.g. "Betting closes in" */
  label: string;
  seed?: string;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Time left as a rolling clock over the chart's scale bar. The last ten seconds turn coral. */
export function Countdown({ seconds, total, label, seed = 'countdown' }: CountdownProps) {
  const s = Math.max(0, Math.ceil(seconds));
  const [ref, box] = useBox<HTMLSpanElement>();
  const art = useMemo(() => {
    if (!box.w) return null;
    const { w, h } = box;
    const n = Math.max(2, Math.min(12, Math.round(total / 10)));
    const ticks = Array.from({ length: n + 1 }, (_, i) => {
      const x = (w * i) / n;
      const tall = i === 0 || i === n;
      return rule(x, tall ? -2 : h * 0.45, x, h + 2, `${seed}:t${i}`, PEN.fine);
    });
    return { base: rule(-3, h, w + 3, h, seed, PEN.rule), ticks, fill: hatch(0, 1, w, h - 2, seed + ':f', { gap: 3.2 }) };
  }, [box, total, seed]);
  const left = total > 0 ? Math.min(1, s / total) : 0;
  return (
    <span className={cx('ink-count', s <= 10 && 'ink-count-late')} role="timer" aria-label={`${label} ${clock(s)}`}>
      <Roll value={clock(s)} dir="down" className="ink-count-time" />
      <span ref={ref} className="ink-count-bar" style={{ '--left': left } as CSSProperties}>
        {art && (
          <>
            <span className="ink-count-fill"><InkSvg box={box} pad={4}><path d={art.fill} fill="currentColor" /></InkSvg></span>
            <InkSvg box={box} pad={4} className="ink-count-rules">
              <InkStroke s={art.base} />
              {art.ticks.map((t, i) => <InkStroke key={i} s={t} />)}
            </InkSvg>
          </>
        )}
      </span>
    </span>
  );
}

/* ───────── balance pill ───────── */

export interface BalancePillProps {
  /** The balance as a number. When it goes up, the payout arrives: the gain floats in, the digits roll, the loop is redrawn in gold. */
  value: number;
  format?: (n: number) => string;
  /** read before the amount by screen readers */
  label?: string;
  seed?: string;
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BalancePill({ value, format = money, label = 'Balance', seed = 'balance' }: BalancePillProps) {
  const [ref, box] = useBox<HTMLSpanElement>();
  const prev = useRef(value);
  const [gain, setGain] = useState<{ key: number; delta: number } | null>(null);
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (d <= 0) return;
    setGain((g) => ({ key: (g?.key ?? 0) + 1, delta: d }));
    const t = setTimeout(() => setGain(null), 1900);
    return () => clearTimeout(t);
  }, [value]);
  const art = useMemo(() => (box.w ? {
    loop: loopBox(0, 0, box.w, box.h, box.h / 2, seed, PEN.rule),
    gold: loopBox(0, 0, box.w, box.h, box.h / 2, seed, { ...PEN.bold, w: 1.8 }),
  } : null), [box, seed]);
  const star = useMemo(() => star4(8, 8, 6, seed + ':s'), [seed]);
  return (
    <span ref={ref} className={cx('ink-balance', gain && 'ink-balance-gain')} role="status" aria-label={`${label} ${format(value)}`}>
      {art && (
        <InkSvg box={box} pad={6}>
          <InkStroke className="ink-balance-loop" s={art.loop} />
          {gain && <InkStroke key={`gold:${gain.key}`} className="ink-balance-gold" s={art.gold} draw="mount" dur={420} />}
        </InkSvg>
      )}
      <svg key={`star:${gain?.key ?? 0}`} className="ink-balance-star" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d={star} fill="currentColor" /></svg>
      <Roll value={format(value)} />
      {gain && <span key={`plus:${gain.key}`} className="ink-balance-plus ink-num" aria-hidden="true">+{format(gain.delta)}</span>}
    </span>
  );
}

/* ───────── medallion ───────── */

export interface MedallionProps {
  /** px across */
  size?: number;
  src?: string;
  /** names the channel; empty when the name is printed next to it */
  alt?: string;
  /** Shows the live beacon on the rim. */
  live?: boolean;
  /** Draw the rings on when it appears (for the one large icon on a page; leave off in lists). */
  draw?: boolean;
  seed?: string;
  /** Shown when there is no image, e.g. an initial. */
  children?: ReactNode;
  className?: string;
}

/** The round frame for channel icons, after the chart's moon medallion: ink rings, a rope band, a gold inner ring. */
export function Medallion({ size = 56, src, alt = '', live, draw, seed = 'medallion', children, className }: MedallionProps) {
  const big = size >= 44;
  const art = useMemo(() => {
    const c = size / 2;
    const r = c - 1;
    return big
      ? { rings: [ring(c, c, r, seed + ':a', PEN.rule), ring(c, c, r - 6.5, seed + ':b', PEN.fine)], rope: radialTicks(c, c, r - 5.4, r - 1.2, seed + ':rope'), gold: ring(c, c, r - 9, seed + ':g', PEN.rule) }
      : { rings: [ring(c, c, r, seed + ':a', PEN.rule)], rope: '', gold: ring(c, c, r - 2.8, seed + ':g', PEN.fine) };
  }, [size, seed, big]);
  const inset = big ? 12 : 5;
  const mode = draw ? 'mount' : undefined;
  return (
    <span className={cx('ink-medal', className)} style={{ width: size, height: size }}>
      <span className="ink-medal-face" style={{ inset }}>
        {src ? <img src={src} alt={alt} draggable={false} /> : children}
      </span>
      <InkSvg box={{ w: size, h: size }} pad={4}>
        {art.rings.map((s, i) => <InkStroke key={i} s={s} draw={mode} delay={i * 140} dur={520} />)}
        {art.rope && <path className="ink-medal-rope" d={art.rope} fill="currentColor" />}
        <InkStroke className="ink-medal-gold" s={art.gold} draw={mode} delay={280} dur={480} />
      </InkSvg>
      {live && <Beacon className="ink-medal-live" size={big ? 16 : 12} seed={seed} label="Live" />}
    </span>
  );
}
