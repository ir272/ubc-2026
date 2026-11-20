// The home page carousel: the centre slide is the live game itself, the neighbours are stills.
// It moves fluidly: swipe sideways on a trackpad, drag with the mouse or a finger, or use the arrows
// and the arrow keys. Every slide's place, size and brightness is a smooth function of one number
// (how far the row has been pushed), so nothing jumps while it moves. It does not snap: after a
// push it coasts and stays wherever it comes to rest. Whichever game is nearest the centre plays live.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Snapshot } from '../lib/api';
import { GameStage } from './GameStage';
import { PhaseTag, Thumb, listViewers, matchLine, shortCount } from './Rail';
import { Link } from './bits';
import { WatchAndBet } from './nightline';
import { Medallion, Pill } from '../ui';
import { kindFor } from '../channelInfo';
import { displayTitle } from '../lib/channels';
import { FIXTURE } from '../lib/dev';
import { useChannelState, useFeed } from '../lib/feed';
import { usdShort } from '../lib/money';
import { channelPath } from '../lib/router';
import { FX_FEATURED } from '../fixture';
import { viewersOf } from '../pages/Channel';
import './carousel.css';

const potOf = (c: Pick<Snapshot, 'windows'>) => {
  const w = [...c.windows].reverse().find((x) => x.state === 'open') ?? c.windows[c.windows.length - 1];
  return w?.total ?? 0;
};

type Cur = Snapshot | ReturnType<typeof useChannelState>;

function Info({ snap, cur, viewers }: { snap: Snapshot; cur: Cur; viewers: number }) {
  const title = displayTitle(snap.title);
  const to = channelPath(snap.channel);
  const pot = potOf(cur);
  const line = matchLine(cur);
  return (
    <div className="car-info">
      <Link to={to} className="car-head">
        <Medallion size={56} seed={snap.channel}>
          <Thumb channel={snap.channel} title={title} />
        </Medallion>
        <span className="car-id">
          <span className="car-name">{title}</span>
          <span className="car-kind">{kindFor(snap.channel)}</span>
          <span className="car-viewers num">{shortCount(viewers)} viewers</span>
        </span>
      </Link>
      {line && <div className="car-match">{line}</div>}
      <div className="pills">
        <PhaseTag s={cur} withTime />
        {pot > 0 && <Pill>{`${usdShort(pot)} pot`}</Pill>}
      </div>
      <WatchAndBet to={to} />
    </div>
  );
}

/** The slide in the centre: the live game, muted, with its live numbers. */
function LiveSlide({ snap }: { snap: Snapshot }) {
  const feed = useFeed(snap.channel);
  const s = useChannelState(feed);
  const cur = s.ready ? s : snap;
  const title = displayTitle(snap.title);
  return (
    <>
      <Link to={channelPath(snap.channel)} className="car-media" aria-label={`Watch ${title}`}>
        {FIXTURE ? <Thumb channel={snap.channel} title={title} /> : <GameStage feed={feed} volume={0} soundAllowed={false} />}
      </Link>
      <Info snap={snap} cur={cur} viewers={s.ready ? viewersOf(s) : listViewers(snap)} />
    </>
  );
}

/** A neighbour: a still of the game. Its info panel is there too, so it can slide open as it arrives. */
function StillSlide({ snap }: { snap: Snapshot }) {
  const title = displayTitle(snap.title);
  return (
    <>
      <span className="car-media">
        <Thumb channel={snap.channel} title={title} />
      </span>
      <Info snap={snap} cur={snap} viewers={listViewers(snap)} />
    </>
  );
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** value at |d| along a few stops one slide apart, straight lines between */
const along = (d: number, stops: number[]) => {
  const a = Math.min(Math.abs(d), stops.length - 1);
  const i = Math.min(Math.floor(a), stops.length - 2);
  return stops[i]! + (stops[i + 1]! - stops[i]!) * (a - i);
};
const easeOut = (t: number) => 1 - (1 - t) ** 3;

let rememberedId: string | null = null;

export function Carousel({ channels }: { channels: Snapshot[] }) {
  const n = channels.length;
  const [activeId, setActiveId] = useState<string | null>(() => (FIXTURE ? FX_FEATURED : (rememberedId ?? channels[0]?.channel ?? null)));
  const found = channels.findIndex((c) => c.channel === activeId);
  const active = found >= 0 ? found : 0;

  const car = useRef<HTMLElement>(null);
  const slides = useRef<(HTMLDivElement | null)[]>([]);
  // pos is where the row is: 0 means slide 0 is centred, 1.5 means halfway between slides 1 and 2. It is
  // not kept to whole numbers and not wrapped, so the row can rest anywhere and go round and round.
  const st = useRef({ pos: active, active, step: 300, raf: 0, dragging: false, moved: false, x0: 0, p0: 0, last: [] as { t: number; x: number }[] });

  useEffect(() => {
    rememberedId = channels[active]?.channel ?? null;
  }, [channels, active]);

  /** Put every slide where pos says it belongs. */
  const lay = () => {
    const el = car.current;
    if (!el || !n) return;
    const track = el.firstElementChild as HTMLElement;
    const stacked = getComputedStyle(track).position === 'static'; // phones: one slide, no row
    const h = el.clientHeight;
    const iw = parseFloat(getComputedStyle(el).getPropertyValue('--iw')) || 270;
    const mw = (h * 16) / 9;
    const cw = mw + iw;
    const x1 = cw / 2 - mw * 0.4 + 150;
    const x2 = cw / 2 - mw * 0.32 + 270;
    const s = st.current;
    s.step = x1;
    const reach = n >= 5 ? 2.5 : 1.5; // how far out a slide is still drawn before it wraps round the back
    slides.current.forEach((node, i) => {
      if (!node) return;
      if (stacked) {
        node.removeAttribute('style');
        return;
      }
      let d = (((i - s.pos) % n) + n) % n;
      if (d > n / 2) d -= n;
      const a = Math.abs(d);
      const open = clamp(1 - a * 1.5, 0, 1); // how far the info panel is open
      const x = Math.sign(d) * along(d, [0, x1, x2, x2 + mw * 0.5]);
      node.style.width = `${mw + iw * open}px`;
      node.style.transform = `translateX(calc(-50% + ${x.toFixed(1)}px)) scale(${along(d, [1, 0.8, 0.64, 0.5]).toFixed(4)})`;
      node.style.zIndex = String(20 - Math.round(a * 4));
      node.style.opacity = clamp((reach - a) / 0.35, 0, 1).toFixed(3);
      node.style.setProperty('--lit', (1 - 0.55 * clamp(a, 0, 1)).toFixed(3));
      node.style.visibility = a >= reach ? 'hidden' : 'visible';
    });
  };

  /** Move the row, and make whichever game is now nearest the centre the live one. */
  const moveTo = (pos: number) => {
    const s = st.current;
    s.pos = pos;
    const idx = (((Math.round(pos) % n) + n) % n) | 0;
    if (idx !== s.active) {
      s.active = idx;
      setActiveId(channels[idx]!.channel);
    }
    lay();
  };

  useLayoutEffect(lay);
  useEffect(() => {
    const ro = new ResizeObserver(lay);
    if (car.current) ro.observe(car.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The arrows, the arrow keys and a click on a neighbour: glide exactly onto a game. */
  const glideBy = (by: number) => {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    const from = s.pos;
    const to = Math.round(from) + by;
    if (calm()) return moveTo(to);
    const t0 = performance.now();
    const dur = 300 + 140 * Math.min(1, Math.abs(to - from));
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      moveTo(from + (to - from) * easeOut(k));
      if (k < 1) s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  };

  /** After a drag is let go: keep moving at the speed it had, slow down, and stop wherever that is. */
  const coast = (v: number) => {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    if (calm() || Math.abs(v) < 0.0002) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      moveTo(s.pos + v * dt);
      v *= Math.exp(-dt / 320);
      if (Math.abs(v) > 0.00006) s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  };

  // Sideways swipes on a trackpad (and shift + wheel) push the row. The trackpad supplies its own coasting.
  useEffect(() => {
    const el = car.current;
    if (!el || n < 2) return;
    const onWheel = (e: WheelEvent) => {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (Math.abs(dx) <= Math.abs(e.shiftKey ? 0 : e.deltaY)) return; // a vertical scroll is the page's
      e.preventDefault();
      cancelAnimationFrame(st.current.raf);
      moveTo(st.current.pos + dx / st.current.step);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, channels]);

  if (!n) return null;

  const down = (e: React.PointerEvent) => {
    if (n < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const s = st.current;
    cancelAnimationFrame(s.raf);
    s.dragging = true;
    s.moved = false;
    s.x0 = e.clientX;
    s.p0 = s.pos;
    s.last = [{ t: performance.now(), x: e.clientX }];
  };
  const move = (e: React.PointerEvent) => {
    const s = st.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.x0;
    if (!s.moved) {
      if (Math.abs(dx) < 6) return;
      s.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      car.current?.classList.add('dragging');
    }
    s.last.push({ t: performance.now(), x: e.clientX });
    if (s.last.length > 5) s.last.shift();
    moveTo(s.p0 - dx / s.step);
  };
  const up = () => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    car.current?.classList.remove('dragging');
    if (!s.moved) return;
    const a = s.last[0]!;
    const b = s.last[s.last.length - 1]!;
    const idle = performance.now() - b.t > 80; // held still before letting go: no throw
    const v = !idle && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0; // px per ms
    coast(-v / s.step);
  };
  // A drag must not also count as a click on the game it started on.
  const swallow = (e: React.MouseEvent) => {
    if (st.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      st.current.moved = false;
    }
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') glideBy(1);
    else if (e.key === 'ArrowLeft') glideBy(-1);
  };

  return (
    <section ref={car} className="car fluid" aria-roledescription="carousel" aria-label="Live games" onKeyDown={key}>
      <div className="car-track" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={swallow}>
        {channels.map((c, i) => {
          const on = i === active;
          let d = (((i - active) % n) + n) % n;
          if (d > n / 2) d -= n;
          return (
            <div
              key={c.channel}
              ref={(node) => {
                slides.current[i] = node;
              }}
              className={`car-slide ${on ? 'on' : 'off'}`}
              aria-hidden={on ? undefined : true}
              onClick={on ? undefined : () => glideBy(d)}
            >
              {on ? <LiveSlide snap={c} /> : <StillSlide snap={c} />}
            </div>
          );
        })}
      </div>
      {n > 1 && (
        <>
          <button type="button" className="car-arrow prev" onClick={() => glideBy(-1)} aria-label="Previous game">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.5 4.5L7 10l5.5 5.5" />
            </svg>
          </button>
          <button type="button" className="car-arrow next" onClick={() => glideBy(1)} aria-label="Next game">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.5 4.5L13 10l-5.5 5.5" />
            </svg>
          </button>
        </>
      )}
    </section>
  );
}
