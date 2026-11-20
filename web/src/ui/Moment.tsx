// Clayzo "moments": short animated pieces drawn with the kit's own ink hand (authored in prototypes/clayzo).
// The player and each document load only when a moment is first shown, so pages that never show one pay nothing.
import { useEffect, useRef, useState } from 'react';
import { cx } from './ink/Ink';
import betPlaced from './moments/bet-placed.json?url';
import chatSent from './moments/chat-sent.json?url';
import payout from './moments/payout.json?url';
import watchAndBet from './moments/watch-and-bet.json?url';
import watchAndBetPress from './moments/watch-and-bet-press.json?url';
import './ui.css';

/**
 * payout: the medallion is drawn, a gold star lands, small stars fly out (2.6 s, stays).
 * bet-placed: a ring is drawn and a tick is struck through it (1.5 s, stays).
 * chat-sent: a star races along a line and bursts (0.9 s, leaves nothing; 5:1 strip).
 * watch-and-bet: the compass rose is drawn, swings and settles (1.8 s, stays).
 * watch-and-bet-press: the same rose, bold and dark, at button size, for playing inside a primary button (0.7 s).
 */
export type MomentName = 'payout' | 'bet-placed' | 'chat-sent' | 'watch-and-bet' | 'watch-and-bet-press';

const URLS: Record<MomentName, string> = { payout, 'bet-placed': betPlaced, 'chat-sent': chatSent, 'watch-and-bet': watchAndBet, 'watch-and-bet-press': watchAndBetPress };
/** width / height of each piece's canvas */
const ASPECT: Record<MomentName, number> = { payout: 1, 'bet-placed': 1, 'chat-sent': 5, 'watch-and-bet': 1, 'watch-and-bet-press': 1 };
/** pieces that end on an empty frame */
const TRANSIENT: Partial<Record<MomentName, boolean>> = { 'chat-sent': true };

export interface MomentProps {
  name: MomentName;
  /** px wide; the height follows the piece's shape */
  width: number;
  /** Change this to play the piece again from the start (for example a counter you bump on each send). */
  playKey?: string | number;
  /**
   * false: mount it ahead of time, ready but unseen, and play only when `playKey` changes. This is how a moment
   * starts on the same frame as the press that causes it. Default true: play as soon as it appears.
   */
  autoplay?: boolean;
  /** Called each time the piece starts playing (also under reduced motion). The place to start its sound. */
  onStart?: () => void;
  /** Read out by screen readers. Leave empty when words next to it already say the same thing. */
  label?: string;
  className?: string;
}

type Player = { seek(tick: number): Promise<void>; play(): void; pause(): void; dispose(): void };
interface Doc { timing: { durationTicks: number } }

const docs = new Map<MomentName, Promise<Doc>>();
const loadDoc = (name: MomentName) => {
  let p = docs.get(name);
  if (!p) {
    p = fetch(URLS[name]).then((r) => r.json() as Promise<Doc>);
    docs.set(name, p);
  }
  return p;
};

/** Fetches the player and a piece ahead of time, so its first play starts at once. */
export function preloadMoment(name: MomentName) {
  void import('@clayzo/webgl-player');
  void loadDoc(name);
}

export function Moment({ name, width, playKey, autoplay = true, onStart, label, className }: MomentProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<{ p: Player; doc: Doc } | null>(null);
  const [ready, setReady] = useState(false);
  // a piece that leaves nothing behind is taken off the page while it is not playing, so it can never sit over a field
  const [idle, setIdle] = useState(true);
  // with autoplay off, nothing shows until the first play
  const [played, setPlayed] = useState(autoplay);
  const firstKey = useRef(playKey);
  const started = useRef(onStart);
  started.current = onStart;
  const height = Math.round(width / ASPECT[name]);

  useEffect(() => {
    let gone = false;
    const el = canvas.current;
    if (!el) return;
    void Promise.all([import('@clayzo/webgl-player'), loadDoc(name)]).then(async ([lib, doc]) => {
      if (gone) return;
      const p = (await lib.createPlayer({ canvas: el, document: doc as never, loop: false })) as unknown as Player;
      if (gone) return p.dispose();
      player.current = { p, doc };
      setReady(true);
    });
    return () => {
      gone = true;
      player.current?.p.dispose();
      player.current = null;
      setReady(false);
    };
  }, [name]);

  useEffect(() => {
    const cur = player.current;
    const el = canvas.current;
    if (!ready || !cur || !el) return;
    if (!autoplay && playKey === firstKey.current) {
      void cur.p.seek(0); // drawn and waiting on its first frame
      return;
    }
    firstKey.current = undefined;
    setPlayed(true);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches || !!el.closest('[data-motion="reduce"]');
    if (still) {
      // reduced motion: show the settled frame; a piece that leaves nothing shows nothing
      cur.p.pause();
      void cur.p.seek(Math.max(0, cur.doc.timing.durationTicks - 4));
      started.current?.();
      return;
    }
    setIdle(false);
    started.current?.(); // the cue starts with the press, not after the seek
    void cur.p.seek(0).then(() => cur.p.play());
    const done = setTimeout(() => setIdle(true), (cur.doc.timing.durationTicks / 240) * 1000 + 80);
    return () => clearTimeout(done);
    // autoplay is fixed for the life of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playKey]);

  return (
    <canvas
      ref={canvas}
      className={cx('ink-moment', TRANSIENT[name] && 'ink-moment-transient', className)}
      style={{ width, height, visibility: !played || (TRANSIENT[name] && idle) ? 'hidden' : undefined }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
