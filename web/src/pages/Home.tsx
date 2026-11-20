// Home, laid out like a streaming site's browse page: the live channel list on the left (the rail,
// see App.tsx), the hero scene with the headline across the top, the carousel of live games directly
// under it, then a row of live cards.
import type { Snapshot } from '../lib/api';
import { PhaseTag, Thumb, listViewers, matchLine, shortCount } from '../components/Rail';
import { Link } from '../components/bits';
import { Frame, Medallion, Pill } from '../ui';
import { kindFor } from '../channelInfo';
import { displayTitle, useChannels } from '../lib/channels';
import { usdShort } from '../lib/money';
import { channelPath } from '../lib/router';
import { HomeHero } from '../hero/HomeHero';
import { Carousel } from '../components/Carousel';
import { SoonCard, SoonCat } from '../components/ComingSoon';
import { SOON } from '../comingSoon';

const potOf = (c: Pick<Snapshot, 'windows'>) => {
  const w = [...c.windows].reverse().find((x) => x.state === 'open') ?? c.windows[c.windows.length - 1];
  return w?.total ?? 0;
};

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
          <span className="card-viewers num">{shortCount(listViewers(snap))} watching</span>
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
  return (
    <>
      <HomeHero />
      {!channels ? (
        <div className="home-wait">{error ? 'Can’t reach the server. Retrying…' : 'Loading…'}</div>
      ) : (
        <div className="home">
          <Carousel channels={channels} />
          <section>
            <h2 className="home-h">Live now</h2>
            <div className="cards">
              {channels.map((c) => (
                <LiveCard key={c.channel} snap={c} />
              ))}
              {SOON.filter((g) => g.inLiveRow).map((g) => <SoonCard key={g.id} game={g} />)}
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
                    <span className="cat-sub num">{shortCount(listViewers(c))} watching</span>
                    <span className="cat-tags">
                      <span className="cat-tag">{n > 2 ? `${n} contestants` : 'Head to head'}</span>
                      <span className="cat-tag">AI vs AI</span>
                    </span>
                  </Link>
                );
              })}
              {SOON.map((g) => <SoonCat key={g.id} game={g} />)}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
