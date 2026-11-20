// The Ghostbet announcer: one recorded voice for every game. The clips in ./lines are spoken lines made once
// (two takes of each, so a line does not sound identical every round). Nothing is generated while the site runs.
// One line plays at a time; a line that would have to wait too long behind another is dropped, because a late
// "Bets are closed!" is worse than none. It follows the stream player's volume and mute, and stays silent until
// the browser allows sound (the viewer's first click).
import { audio, effectiveVolume } from '../lib/audio';

export type Line =
  | 'bets-open' | 'last-call' | 'bets-closed' | 'winner'
  | 'brawl-fight' | 'brawl-knockout' | 'brawl-sudden-death' | 'brawl-game-over'
  | 'goober-round-one' | 'goober-round-two' | 'goober-final-round' | 'goober-eight-remain' | 'goober-four-remain'
  | 'inkelton-fight' | 'inkelton-duel-over';

const urls = import.meta.glob('./lines/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const takes = new Map<string, string[]>();
for (const [path, url] of Object.entries(urls)) {
  const m = /\/([a-z-]+)-\d+\.mp3$/.exec(path);
  if (!m) continue;
  takes.set(m[1]!, [...(takes.get(m[1]!) ?? []), url]);
}

/** How loud the announcer is against the stream volume. Not yet set by ear. */
const GAIN = 0.8;
/** A line waits at most this long behind another one before it is dropped. */
const MAX_WAIT_MS = 2600;

/** ?announcer=log prints each line as it is asked for, sound or no sound: for checking the timing silently */
const LOG = typeof location !== 'undefined' && /[?&]announcer=log/.test(location.search);

interface Queued { line: Line; at: number; maxWait: number }
const queue: Queued[] = [];
let playing: HTMLAudioElement | null = null;
const lastTake = new Map<string, number>();
const lastAsked = new Map<string, number>();
/** The same line is not spoken twice within this long. */
const REPEAT_GAP_MS = 6000;

function pick(line: Line): string | null {
  const list = takes.get(line);
  if (!list?.length) return null;
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastTake.get(line)) i = (i + 1) % list.length;
  lastTake.set(line, i);
  return list[i]!;
}

function next() {
  playing = null;
  for (;;) {
    const q = queue.shift();
    if (!q) return;
    if (Date.now() - q.at > q.maxWait) continue;
    const st = audio.get();
    const vol = effectiveVolume(st);
    const url = pick(q.line);
    if (!url || !st.unlocked || vol <= 0) continue;
    const el = new Audio(url);
    el.volume = Math.min(1, vol * GAIN);
    playing = el;
    const done = () => {
      if (playing === el) next();
    };
    el.addEventListener('ended', done);
    el.addEventListener('error', done);
    el.play().catch(done);
    return;
  }
}

export const announcer = {
  /** Speak a line now, or right after the line that is playing. */
  say(line: Line, maxWait = MAX_WAIT_MS) {
    // two bets paying out together (a match with a second bet inside it) is one "winner", not two
    const now = Date.now();
    if (now - (lastAsked.get(line) ?? 0) < REPEAT_GAP_MS) return;
    lastAsked.set(line, now);
    if (LOG) console.info('[announcer]', line, new Date().toISOString().slice(11, 23));
    queue.push({ line, at: Date.now(), maxWait });
    if (!playing) next();
  },
  /** Stop and forget everything (leaving a channel). */
  stop() {
    queue.length = 0;
    if (playing) {
      playing.pause();
      playing = null;
    }
  },
};

// follow the volume slider and the mute button while a line is playing
if (typeof window !== 'undefined') {
  let last = effectiveVolume(audio.get());
  setInterval(() => {
    const v = effectiveVolume(audio.get());
    if (v === last) return;
    last = v;
    if (playing) playing.volume = Math.min(1, v * GAIN);
  }, 250);
}
