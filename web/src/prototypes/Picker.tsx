// The prototype picker's behaviour, from the prototype skill's PICKER.md: number keys and the arrow
// keys switch, R replays, the choice lives in ?v=, the highlight slides, the variant swap is instant.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './picker.css';

export function usePicker(count: number) {
  const fromUrl = () => {
    const n = parseInt(new URLSearchParams(location.search).get('v') ?? '', 10);
    return n >= 1 && n <= count ? n - 1 : 0;
  };
  const [current, setCurrent] = useState(fromUrl);
  const [run, setRun] = useState(0); // bumping it re-mounts the variant so entrances replay
  const set = (i: number) => {
    if (i < 0 || i >= count) return;
    setCurrent(i);
    setRun((n) => n + 1);
    const url = new URL(location.href);
    url.searchParams.set('v', String(i + 1));
    history.replaceState(null, '', url);
  };
  const replay = () => setRun((n) => n + 1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= count) set(num - 1);
      else if (e.key === 'ArrowRight') set((current + 1) % count);
      else if (e.key === 'ArrowLeft') set((current - 1 + count) % count);
      else if (e.key === 'r' || e.key === 'R') replay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  return { current, run, set, replay };
}

export function Picker({ names, current, onPick, onReplay }: { names: string[]; current: number; onPick: (i: number) => void; onReplay?: () => void }) {
  const nav = useRef<HTMLElement>(null);
  const hl = useRef<HTMLSpanElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  useLayoutEffect(() => {
    const move = () => {
      const el = items.current[current];
      if (!el || !hl.current) return;
      hl.current.style.width = el.offsetWidth + 'px';
      hl.current.style.transform = `translateX(${el.offsetLeft}px)`;
    };
    move();
    window.addEventListener('resize', move);
    return () => window.removeEventListener('resize', move);
  }, [current, names.length]);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => nav.current?.setAttribute('data-ready', '')));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <nav className="proto-picker" aria-label="Prototype variants" ref={nav}>
      <span className="proto-picker-highlight" aria-hidden="true" ref={hl} />
      {names.map((n, i) => (
        <button
          key={n}
          type="button"
          className="proto-picker-item"
          ref={(el) => {
            items.current[i] = el;
          }}
          {...(i === current ? { 'data-active': '', 'aria-current': 'true' as const } : {})}
          onClick={() => onPick(i)}
        >
          {n}
        </button>
      ))}
      {onReplay && (
        <>
          <span className="proto-picker-divider" aria-hidden="true" />
          <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={onReplay}>
            ↻
          </button>
        </>
      )}
    </nav>
  );
}
