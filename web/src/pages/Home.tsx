// Home, laid out like a streaming site's browse page: the live channel list on the left (the rail,
// see App.tsx), a carousel whose centre slide is the live game itself, then a row of live cards.
import { useEffect, useState } from 'react';
import type { Snapshot } from '../lib/api';
import { GameStage } from '../components/GameStage';
import { PhaseTag, Thumb, listViewers, matchLine, shortCount } from '../components/Rail';
import { Link } from '../components/bits';
import { WatchAndBet } from '../components/nightline';
import { Frame, Medallion, Pill } from '../ui';
import { kindFor } from '../channelInfo';
import { displayTitle, useChannels } from '../lib/channels';
import { FIXTURE } from '../lib/dev';
import { useChannelState, useFeed } from '../lib/feed';
import { usdShort } from '../lib/money';
import { channelPath } from '../lib/router';
import { FX_FEATURED } from '../fixture';
import { viewersOf } from './Channel';

const potOf = (c: Pick<Snapshot, 'windows'>) => {
  const w = [...c.windows].reverse().find((x) => x.state === 'open') ?? c.windows[c.windows.length - 1];
  return w?.total ?? 0;
};

/** The centre slide: the live game, muted, and what it takes to decide to watch. */
function Featured({ snap }: { snap: Snapshot }) {
  const feed = useFeed(snap.channel);
  const s = useChannelState(feed);
  const cur = s.ready ? s : snap;
  const title = displayTitle(snap.title);
  const to = channelPath(snap.channel);
  const pot = potOf(cur);
  return (
    <>
      <Link to={to} className="car-media" aria-label={`Watch ${title}`}>
        {FIXTURE ? <Thumb channel={snap.channel} title={title} /> : <GameStage feed={feed} volume={0} soundAllowed={false} />}
      </Link>
      <div className="car-info">
        <Link to={to} className="car-head">
          <Medallion size={56} seed={snap.channel}>
            <Thumb channel={snap.channel} title={title} />
          </Medallion>
          <span className="car-id">
            <span className="car-name">{title}</span>
            <span className="car-kind">{kindFor(snap.channel)}</span>
            <span className="car-viewers num">{shortCount(s.ready ? viewersOf(s) : listViewers(snap))} viewers</span>
          </span>
        </Link>
        {matchLine(cur) && <div className="car-match">{matchLine(cur)}</div>}
        <div className="pills">
          <PhaseTag s={cur} withTime />
          {pot > 0 && <Pill>{`${usdShort(pot)} pot`}</Pill>}
        </div>
        <WatchAndBet to={to} />
      </div>
    </>
  );
}

/** Where slide i sits relative to the active one: 0 centre, ±1 beside it, ±2 behind those, null hidden. */
function slot(i: number, active: number, n: number): number | null {
  const d = (((i - active) % n) + n) % n;
  if (d === 0) return 0;
  if (d === 1) return 1;
  if (d === n - 1) return -1;
  if (d === 2 && n >= 4) return 2;
  if (d === n - 2 && n >= 5) return -2;
  return null;
}

let rememberedId: string | null = null;

function Carousel({ channels }: { channels: Snapshot[] }) {
  const [activeId, setActiveId] = useState<string | null>(() => (FIXTURE ? FX_FEATURED : (rememberedId ?? channels[0]?.channel ?? null)));
  const n = channels.length;
  const found = channels.findIndex((c) => c.channel === activeId);
  const active = found >= 0 ? found : 0;
  useEffect(() => {
    rememberedId = channels[active]?.channel ?? null;
  }, [channels, active]);
  const go = (step: number) => setActiveId(channels[(active + step + n) % n]!.channel);
  if (!n) return null;
  return (
    <section className="car" aria-roledescription="carousel" aria-label="Live games">
      <div className="car-track">
        {channels.map((c, i) => {
          const at = slot(i, active, n);
          if (at === null) return null;
          const title = displayTitle(c.title);
          return at === 0 ? (
            <div key={c.channel} className="car-slide at0">
              <Featured snap={c} />
            </div>
          ) : (
            <button key={c.channel} type="button" className={`car-slide side at${at < 0 ? 'm' : 'p'}${Math.abs(at)}`} onClick={() => setActiveId(c.channel)} aria-label={`Show ${title}`} tabIndex={Math.abs(at) === 1 ? 0 : -1}>
              <Thumb channel={c.channel} title={title} />
            </button>
          );
        })}
      </div>
      {n > 1 && (
        <>
          <button type="button" className="car-arrow prev" onClick={() => go(-1)} aria-label="Previous game">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.5 4.5L7 10l5.5 5.5" />
            </svg>
          </button>
          <button type="button" className="car-arrow next" onClick={() => go(1)} aria-label="Next game">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.5 4.5L13 10l-5.5 5.5" />
            </svg>
          </button>
        </>
      )}
    </section>
  );
}

function LiveCard({ snap }: { snap: Snapshot }) {
  const title = displayTitle(snap.title);
  const to = channelPath(snap.channel);
  const pot = potOf(snap);
  return (
    <article className="card">
      <Frame draw={false} className="card-frame" seed={snap.channel}>
        <Link to={to} className="card-thumb" aria-label={`Watch ${title}`}>
          <Thumb channel={snap.channel} title={title} />
          <Pill live className="live-badge">Live</Pill>
          <span className="card-viewers num">{shortCount(listViewers(snap))} viewers</span>
        </Link>
      </Frame>
      <div className="card-meta">
        <Medallion size={40} seed={snap.channel}>
          <Thumb channel={snap.channel} title={title} />
        </Medallion>
        <div className="card-text">
          <Link to={to} className="card-title">
            {matchLine(snap) || title}
          </Link>
          <div className="card-sub">{title}</div>
          <div className="card-sub">{kindFor(snap.channel)}</div>
          <div className="pills">
            <PhaseTag s={snap} withTime />
            {pot > 0 && <Pill>{`${usdShort(pot)} pot`}</Pill>}
          </div>
        </div>
      </div>
    </article>
  );
}

export function Home() {
  const { channels, error } = useChannels();
  if (!channels) {
    return <div className="home-wait">{error ? 'Can’t reach the server. Retrying…' : 'Loading…'}</div>;
  }
  return (
    <div className="home">
      <Carousel channels={channels} />
      <section>
        <h2 className="home-h">Live now</h2>
        <div className="cards">
          {channels.map((c) => (
            <LiveCard key={c.channel} snap={c} />
          ))}
        </div>
      </section>
      <section>
        <h2 className="home-h"><span className="home-h-accent">Categories</span> we think you’ll like</h2>
        <div className="cats">
          {channels.map((c) => {
            const n = c.match?.entrants.length ?? 0;
            return (
              <Link key={c.channel} to={channelPath(c.channel)} className="cat">
                <span className="cat-art">
                  <Thumb channel={c.channel} title={displayTitle(c.title)} />
                </span>
                <span className="cat-name">{kindFor(c.channel)}</span>
                <span className="cat-sub num">{shortCount(listViewers(c))} viewers</span>
                <span className="cat-tags">
                  <span className="cat-tag">{n > 2 ? `${n} contestants` : 'Head to head'}</span>
                  <span className="cat-tag">AI vs AI</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
