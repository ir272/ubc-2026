// Left rail (Kick/Twitch): live channels (thumbnail, name, state, pot, viewers), then top models and
// what's up next. 256px open, 56px collapsed to icons (kick.com's sizes; CSS in kick-detail.css).
import { useSyncExternalStore } from 'react';
import type { Snapshot } from '../lib/api';
import { displayTitle, useChannels } from '../lib/channels';
import { FIXTURE } from '../lib/dev';
import { useNow, type ChannelState } from '../lib/feed';
import { channelPath, usePath } from '../lib/router';
import { fxImage, fxThumbStyle } from '../fixture';
import { posterFor } from '../posters';
import { kindFor } from '../channelInfo';
import { Link } from './bits';
import { Beacon, Medallion } from '../ui';
import './kick-detail.css';

// Open on the home page (it is the page's channel list), collapsed to avatars beside a stream.
// Once the viewer toggles it, their choice holds on both.
let pref: boolean | null = null;
let lastDefault = false;
const subs = new Set<() => void>();
export const toggleRail = () => {
  pref = !(pref ?? lastDefault);
  subs.forEach((f) => f());
};
export const useRailOpen = (defaultOpen = false) => {
  lastDefault = defaultOpen;
  const p = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => pref,
  );
  return p ?? defaultOpen;
};

/** "12.4K" above a thousand, the plain number below */
export const shortCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n));
/** People watching a channel, as the runner counts them in the channel list. Never padded. */
export const listViewers = (c: Snapshot) => c.viewers ?? 0;
/** "A vs B" for two, "16 contestants" for more */
export const matchLine = (c: Pick<Snapshot, 'match'>) => {
  const es = c.match?.entrants ?? [];
  return es.length === 2 ? `${es[0]!.name} vs ${es[1]!.name}` : es.length > 2 ? `${es.length} contestants` : '';
};

export function thumbFor(channel: string): string | null {
  return FIXTURE ? fxImage(channel) : (posterFor(channel).image ?? null);
}

/** Channel artwork (clean crop), or the title's first letter on a flat tile. */
export function Thumb({ channel, title }: { channel: string; title: string }) {
  const img = thumbFor(channel);
  return img ? <img className="thumb-img" src={img} alt="" draggable={false} style={FIXTURE ? fxThumbStyle(channel) : undefined} /> : <span className="thumb-letter">{title.slice(0, 1)}</span>;
}

type Phaseish = Pick<Snapshot, 'windows' | 'phase'>;

export function channelState(c: Phaseish, now: number): { text: string; open: boolean; pool: number; tag: 'open' | 'live' | 'final' | 'next' } {
  const w = [...c.windows].reverse().find((x) => x.state === 'open');
  const last = w ?? c.windows[c.windows.length - 1];
  const pool = last?.total ?? 0;
  if (w) {
    const secs = Math.max(0, Math.ceil((w.closesAt - now) / 1000));
    return { text: `Bets open ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, open: true, pool, tag: 'open' };
  }
  if (c.phase === 'live' || last?.state === 'locked') return { text: 'Live', open: false, pool, tag: 'live' };
  if (c.phase === 'result' || last?.state === 'settled') return { text: 'Final', open: false, pool, tag: 'final' };
  return { text: 'Up next', open: false, pool, tag: 'next' };
}

/** BETS OPEN / LIVE / FINAL / UP NEXT, following the channel's phase. LIVE is red text + dot. */
export function PhaseTag({ s, withTime }: { s: ChannelState | Phaseish; withTime?: boolean }) {
  const now = useNow(500);
  const off = 'offset' in s ? (s as ChannelState).offset : 0;
  const st = channelState(s, now + off);
  const label = st.tag === 'open' ? (withTime ? st.text : 'Bets open') : st.tag === 'live' ? 'Live' : st.tag === 'final' ? 'Final' : 'Up next';
  return <span className={`tag tag-${st.tag}`}>{label}</span>;
}

/** The LIVE badge under the channel icon (kick.com), shown whenever the channel is not between shows. */
export function LiveBadge({ s }: { s: ChannelState | Phaseish }) {
  const now = useNow(1000);
  const off = 'offset' in s ? (s as ChannelState).offset : 0;
  return channelState(s, now + off).tag === 'next' ? null : <span className="ch-live">Live</span>;
}

function RailRow({ c, open, on }: { c: Snapshot; open: boolean; on: boolean }) {
  const now = useNow(1000);
  const st = channelState(c, now);
  const title = displayTitle(c.title);
  const live = st.tag !== 'next';
  return (
    <Link to={channelPath(c.channel)} className={`rail-item ${on ? 'on' : ''}`} title={title}>
      <Medallion size={32} seed={c.channel} live={!open && live}>
        <Thumb channel={c.channel} title={title} />
      </Medallion>
      {open && (
        <span className="rail-text">
          <span className="rail-name">{title}</span>
          <span className="rail-state">{kindFor(c.channel)}</span>
        </span>
      )}
      {open && live && (
        <span className="rail-viewers num">
          <Beacon size={8} seed={c.channel} label="Live" />
          {shortCount(listViewers(c))}
        </span>
      )}
    </Link>
  );
}

/**
 * The side panel, laid out like kick.com's: sections of channel rows (icon, name, kind of show, viewers).
 * On a channel page: games like this one, then recommended. On the home page: live channels, then recommended.
 */
export function Rail({ home }: { home?: boolean }) {
  const isOpen = useRailOpen(true);
  const { channels } = useChannels();
  const path = usePath();
  const all = channels ?? [];
  const here = all.find((c) => channelPath(c.channel) === path);
  const byViewers = [...all].sort((a, b) => listViewers(b) - listViewers(a));
  const sections: { name: string; list: Snapshot[] }[] = home || !here
    ? [{ name: 'Live channels', list: all }, { name: 'Recommended', list: byViewers }]
    : [{ name: 'Similar games', list: all.filter((c) => c !== here) }, { name: 'Recommended', list: byViewers }];
  const toggle = (
    <button type="button" className="rail-toggle" onClick={toggleRail} aria-label={isOpen ? 'Collapse the side panel' : 'Expand the side panel'}>
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {isOpen ? <path d="M11 5l-5 5 5 5M6 10h9M17 4v12" /> : <path d="M9 5l5 5-5 5M14 10H5M3 4v12" />}
      </svg>
    </button>
  );
  // As on kick.com: a fixed navigation list, one rule under it, then the channel sections scroll on their own.
  return (
    <nav className={`rail ${isOpen ? 'open' : 'closed'}`} aria-label="Channels">
      <div className="rail-top">
        <ul className="rail-nav">
          {!isOpen && <li>{toggle}</li>}
          <li>
            <Link to="/" className={`rail-nav-item ${path === '/' ? 'on' : ''}`} title="Home">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7.2 8 2l6 5.2V14H10V10H6v4H2Z" />
              </svg>
              {isOpen && <span>Home</span>}
            </Link>
          </li>
        </ul>
        {isOpen && toggle}
      </div>
      <div className="rail-rule" aria-hidden />
      <div className="rail-scroll">
        {sections.map((sec) => (
          <section key={sec.name} className="rail-sec">
            {isOpen ? (
              <h2 className="rail-sec-h">{sec.name}</h2>
            ) : (
              <span className="rail-sec-h rail-sec-ico" title={sec.name} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
                  <path d="M5 5a4.2 4.2 0 0 0 0 6M11 5a4.2 4.2 0 0 1 0 6M2.9 2.9a7.2 7.2 0 0 0 0 10.2M13.1 2.9a7.2 7.2 0 0 1 0 10.2" />
                </svg>
              </span>
            )}
            {sec.list.map((c) => <RailRow key={c.channel} c={c} open={isOpen} on={channelPath(c.channel) === path} />)}
          </section>
        ))}
      </div>
    </nav>
  );
}
