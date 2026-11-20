// Prototype surface for the top of the home page (/prototypes/home-top, dev only). Nothing in the
// product imports from here. It follows the "prototype" skill in .claude/skills: three variants on
// different axes, each fully working on live data, shown one at a time at full size inside the real
// page chrome, behind the fixed picker (keys 1 to 3, arrows, R to replay).
import { useEffect } from 'react';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import { FxDefs } from '../../components/FxDefs';
import { Header } from '../../components/Header';
import { PhaseTag, Rail, Thumb, listViewers, matchLine, shortCount } from '../../components/Rail';
import { Link } from '../../components/bits';
import { kindFor } from '../../channelInfo';
import type { Snapshot } from '../../lib/api';
import { displayTitle, useChannels } from '../../lib/channels';
import { channelPath } from '../../lib/router';
import { applyLook } from '../../themes/look';
import { Picker, usePicker } from '../Picker';
import { Board, Editorial, Stage } from './variants';
import './proto.css';

const VARIANTS = [
  { name: 'Stage', V: Stage, below: true },
  { name: 'Editorial', V: Editorial, below: true },
  { name: 'Board', V: Board, below: false },
];

/** The rest of the home page under the piece being judged, so each variant is seen in context. */
function Below({ channels }: { channels: Snapshot[] }) {
  return (
    <section className="proto-below">
      <h2>Live now</h2>
      <div className="cards">
        {channels.map((c) => {
          const title = displayTitle(c.title);
          const to = channelPath(c.channel);
          return (
            <article className="card" key={c.channel}>
              <Link to={to} className="card-thumb">
                <Thumb channel={c.channel} title={title} />
                <span className="live-badge">Live</span>
                <span className="card-viewers num">{shortCount(listViewers(c))} viewers</span>
              </Link>
              <div className="card-meta">
                <span className="avatar-md">
                  <Thumb channel={c.channel} title={title} />
                </span>
                <div className="card-text">
                  <Link to={to} className="card-title">
                    {matchLine(c) || title}
                  </Link>
                  <div className="card-sub">{title}</div>
                  <div className="card-sub">{kindFor(c.channel)}</div>
                  <div className="pills">
                    <PhaseTag s={c} withTime />
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function HomeTopPrototype() {
  const { channels } = useChannels();
  const p = usePicker(VARIANTS.length);
  useEffect(() => {
    document.title = 'Prototype: home top';
    // the light direction Ian chose, on Twitch's measured light neutrals with Duel's measured blue
    applyLook({ pal: 'twitch-light', accent: 'duel', rad: 'ref', fx: 'none', motion: 'snappy' });
  }, []);
  const cur = VARIANTS[p.current]!;
  return (
    <div className="app app-home rail-open">
      <FxDefs />
      <Header />
      <div className="app-body">
        <Rail home />
        <main className="app-main">
          <div className="proto-main">
            {channels ? (
              <>
                <cur.V key={p.run} channels={channels} />
                {cur.below && <Below channels={channels} />}
              </>
            ) : (
              <div className="home-wait">Loading…</div>
            )}
          </div>
        </main>
      </div>
      <Picker names={VARIANTS.map((v) => v.name)} current={p.current} onPick={p.set} />
    </div>
  );
}
