// What every variant needs to know about one channel, live from the runner.
import type { Snapshot, WindowView } from '../../lib/api';
import { kindFor } from '../../channelInfo';
import { listViewers, matchLine } from '../../components/Rail';
import { displayTitle } from '../../lib/channels';
import { useChannelState, useFeed, useNow } from '../../lib/feed';
import { posterFor } from '../../posters';

const FALLBACK = ['#4558ff', '#ff5a36', '#00a37a', '#b8860b', '#8a4bd6', '#0e7fbf'];

export interface Side {
  index: number;
  label: string;
  color: string;
  /** share of the pot, 0..1 */
  share: number;
  /** what one dollar returns if this side wins (0 when nothing is on it yet) */
  pays: number;
}

export function useLive(snap: Snapshot) {
  const feed = useFeed(snap.channel);
  const s = useChannelState(feed);
  const now = useNow(250);
  const cur = s.ready ? s : snap;
  const w: WindowView | null = [...cur.windows].reverse().find((x) => x.state === 'open') ?? cur.windows[cur.windows.length - 1] ?? null;
  const open = w?.state === 'open';
  const total = w?.total ?? 0;
  const entrants = cur.match?.entrants ?? [];
  const sides: Side[] = (w?.outcomes ?? []).map((o, i) => {
    const pool = w!.pools[i] ?? 0;
    return {
      index: i,
      label: o.label,
      color: entrants.find((e) => e.id === o.entrantId)?.color ?? FALLBACK[i % FALLBACK.length]!,
      share: total ? pool / total : 0,
      pays: pool ? total / pool : 0,
    };
  });
  const closesIn = open ? Math.max(0, w!.closesAt - (now + (s.ready ? s.offset : 0))) : 0;
  return {
    id: snap.channel,
    feed,
    w,
    open,
    locked: w?.state === 'locked',
    total,
    sides,
    closesIn,
    title: displayTitle(snap.title),
    kind: kindFor(snap.channel),
    line: matchLine(cur),
    viewers: listViewers(snap),
    poster: posterFor(snap.channel).image ?? null,
    phase: cur.phase,
  };
}
export type Live = ReturnType<typeof useLive>;

export const clock = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const pays = (v: number) => (v ? `${v >= 10 ? Math.round(v) : v.toFixed(1)}x` : '');
/** "Bets open 0:12", "Live", "Final" */
export const stateLine = (l: Live) => (l.open ? `Bets open ${clock(l.closesIn)}` : l.locked || l.phase === 'live' ? 'Live' : l.phase === 'result' ? 'Final' : 'Up next');
