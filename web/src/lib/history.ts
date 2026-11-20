// Match history and form from the runner (GET /channels/:id/history and /form), polled while on
// screen and re-read when `refresh` changes (pass something that changes when a match finishes).
// Under ?fixture= the sample data in src/fixture.ts is used instead.
import { useEffect, useState } from 'react';
import { api, type ChannelForm, type HistoryMatch } from './api';
import { FIXTURE } from './dev';
import { fxForm, fxHistory } from '../fixture';

const POLL_MS = 15_000;
const cache = new Map<string, unknown>();

function usePolled<T>(key: string, load: () => Promise<T>, refresh = ''): { data: T | null; failed: boolean } {
  const [data, setData] = useState<T | null>(() => (cache.get(key) as T | undefined) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setData((cache.get(key) as T | undefined) ?? null);
    const run = () =>
      load().then(
        (d) => {
          cache.set(key, d);
          if (!live) return;
          setData(d);
          setFailed(false);
        },
        () => live && setFailed(true),
      );
    void run();
    const t = setInterval(run, POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [key, refresh]); // `load` is derived from `key`
  return { data, failed };
}

/** Finished matches on one channel, newest first. */
export function useHistory(channel: string, limit = 20, refresh = '') {
  return usePolled<HistoryMatch[]>(
    `h:${channel}:${limit}`,
    () => (FIXTURE ? Promise.resolve(fxHistory(channel).slice(0, limit)) : api.history(channel, limit).then((r) => r.matches)),
    refresh,
  );
}

/** Per-entrant record and last five on one channel. */
export function useForm(channel: string, refresh = '') {
  return usePolled<ChannelForm>(`f:${channel}`, () => (FIXTURE ? Promise.resolve(fxForm(channel)) : api.form(channel)), refresh);
}

/** Several channels at once (home page). A channel that fails to load is left out. */
export function useHistories(channels: string[], limit: number) {
  const ids = channels.join(',');
  return usePolled<Record<string, HistoryMatch[]>>(`hs:${ids}:${limit}`, async () => {
    const rows = await Promise.allSettled(channels.map((c) => (FIXTURE ? Promise.resolve(fxHistory(c)) : api.history(c, limit).then((r) => r.matches))));
    const out: Record<string, HistoryMatch[]> = {};
    rows.forEach((r, i) => {
      if (r.status === 'fulfilled') out[channels[i]!] = r.value.slice(0, limit);
    });
    return out;
  });
}

export function useForms(channels: string[]) {
  const ids = channels.join(',');
  return usePolled<ChannelForm[]>(`fs:${ids}`, async () => {
    const rows = await Promise.allSettled(channels.map((c) => (FIXTURE ? Promise.resolve(fxForm(c)) : api.form(c))));
    return rows.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  });
}

/** "Red vs Blue" for two entrants, else the match title. */
export function matchup(m: HistoryMatch): string {
  return m.entrants.length === 2 ? `${m.entrants[0]!.name} vs ${m.entrants[1]!.name}` : m.title || `${m.entrants.length} contestants`;
}

/** Who won, as shown in a results row: an entrant's name, the deciding outcome's label (a tie), or null when void. */
export function winnerName(m: HistoryMatch): string | null {
  if (m.void) return null;
  if (m.winnerId) return m.entrants.find((e) => e.id === m.winnerId)?.name ?? m.winnerLabel ?? m.winnerId;
  return m.winnerLabel ?? 'Tie';
}
