// Decides when the announcer speaks on a channel page, from what the runner already sends for every game:
// a round's bet opening, locking and paying out, and each game's own moments (a fight starting, a life lost,
// a round beginning). Only things that happen while the viewer is on the page are spoken: what was already
// on screen when they arrived, or what comes back after a reconnect, is not replayed.
import { useEffect, useRef } from 'react';
import type { GameEvent } from '../lib/api';
import type { ChannelState } from '../lib/feed';
import { announcer, type Line } from './announcer';

/** [line, how long after the event arrives to speak it (ms)] for one game event, or null */
type Cue = [Line, number] | null;

const GOOBER_ROUND: Line[] = ['goober-round-one', 'goober-round-two', 'goober-final-round'];
const GOOBER_REMAIN: Array<Line | null> = ['goober-eight-remain', 'goober-four-remain', null];

function cueFor(channel: string, ev: GameEvent): Cue {
  const d = ev.data ?? {};
  if (channel === 'brawl') {
    // fight_start carries the moment the fight begins (after the countdown); the stage draws about 0.4 s behind
    if (ev.type === 'fight_start') return ['brawl-fight', Math.max(0, Number(d.startAt ?? ev.at) - ev.at)];
    if (ev.type === 'life_lost') return ['brawl-knockout', 450];
    if (ev.type === 'sudden_death') return ['brawl-sudden-death', 400];
    if (ev.type === 'match_end') return ['brawl-game-over', 0];
  } else if (channel === 'tumbletop') {
    // 'round' arrives at the lock, with the countdown still to come: the round call follows "Bets are closed!"
    if (ev.type === 'round') {
      const line = GOOBER_ROUND[Number(d.round)];
      return line ? [line, 900] : null;
    }
    if (ev.type === 'recap') {
      const line = GOOBER_REMAIN[Number(d.round)];
      return line ? [line, 2500] : null;
    }
  } else if (channel === 'scrivener') {
    if (ev.type === 'attempt.start') return ['inkelton-fight', 0];
    if (ev.type === 'verdict') return ['inkelton-duel-over', 0];
  }
  return null;
}

const LAST_CALL_MS = 10_000;

export function useAnnouncer(s: ChannelState) {
  const started = useRef(false);
  const winState = useRef(new Map<string, string>());
  const called = useRef(new Set<string>());
  const seenEvents = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const latest = useRef(s);
  latest.current = s;

  const later = (line: Line, ms: number) => {
    if (ms <= 0) return announcer.say(line);
    const t = setTimeout(() => {
      timers.current.delete(t);
      announcer.say(line);
    }, ms);
    timers.current.add(t);
  };

  // leaving the channel: nothing left over speaks on the next page
  useEffect(() => {
    const ts = timers.current;
    return () => {
      ts.forEach(clearTimeout);
      ts.clear();
      announcer.stop();
    };
  }, []);

  // bets opening, locking and paying out, and the games' own moments
  useEffect(() => {
    if (!s.ready) return;
    const matchId = s.match?.matchId ?? '';
    const key = (ev: GameEvent) => `${matchId}|${ev.type}|${ev.at}`;
    if (!started.current) {
      started.current = true;
      for (const w of s.windows) winState.current.set(w.windowId, w.state);
      for (const ev of s.events) seenEvents.current.add(key(ev));
      return;
    }
    for (const w of s.windows) {
      const prev = winState.current.get(w.windowId);
      if (prev === w.state) continue;
      winState.current.set(w.windowId, w.state);
      if (prev === undefined && w.state === 'open') announcer.say('bets-open');
      else if (prev === 'open' && w.state === 'locked') announcer.say('bets-closed');
      else if (prev !== undefined && w.state === 'settled') announcer.say('winner', 4000);
    }
    for (const ev of s.events) {
      const k = key(ev);
      if (seenEvents.current.has(k)) continue;
      seenEvents.current.add(k);
      // a batch that arrives after a reconnect holds old moments: only the newest few seconds are spoken
      const startedAt = s.match?.startedAt;
      if (typeof startedAt === 'number' && Date.now() + s.offset - (startedAt + ev.at) > 4000) continue;
      const cue = cueFor(s.channel, ev);
      if (cue) later(cue[0], cue[1]);
    }
    if (seenEvents.current.size > 4000) seenEvents.current = new Set(s.events.map(key));
  }, [s.ready, s.windows, s.events, s.match, s.channel, s.offset]);

  // "Last call!" ten seconds before a bet closes, for bets that are open long enough to need one
  useEffect(() => {
    const id = setInterval(() => {
      const st = latest.current;
      if (!st.ready) return;
      const now = Date.now() + st.offset;
      for (const w of st.windows) {
        if (w.state !== 'open' || called.current.has(w.windowId)) continue;
        const left = w.closesAt - now;
        const whole = w.closesAt - (w.openedAt ?? now);
        if (left <= LAST_CALL_MS && left > LAST_CALL_MS - 3000 && whole >= 20_000) {
          called.current.add(w.windowId);
          announcer.say('last-call');
        }
      }
    }, 400);
    return () => clearInterval(id);
  }, []);
}
