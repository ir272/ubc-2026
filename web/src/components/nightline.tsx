// Glue between the site and Nightline (web/src/ui): UI sounds that follow the site's own sound switch,
// the moments fetched ahead of time, and the "Watch and bet" button with its compass.
import { useEffect, useRef, useState } from 'react';
import { audio, effectiveVolume } from '../lib/audio';
import { navigate } from '../lib/router';
import { Button, Moment, preloadMoment, uiSound, type MomentName, type UiSound } from '../ui';

/** A UI cue, unless the viewer has muted the site. */
export function sfx(name: UiSound) {
  const a = audio.get();
  if (a.muted) return;
  uiSound.setVolume(effectiveVolume(a));
  uiSound.play(name);
}

/** The cue that belongs to a moment, on its beat. Pass as the moment's onStart. */
export function sfxFor(moment: MomentName) {
  const a = audio.get();
  if (a.muted) return;
  uiSound.setVolume(effectiveVolume(a));
  uiSound.playFor(moment);
}

// Fetch the player and every piece while the page is idle, so no moment ever waits on the network.
if (typeof window !== 'undefined') {
  const warm = () => (['watch-and-bet-press', 'chat-sent', 'bet-placed', 'payout'] as MomentName[]).forEach(preloadMoment);
  if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 1500 });
  else setTimeout(warm, 300);
}

const SETTLED_MS = 560; // the button-sized rose is still by then (prototypes/clayzo/author/watch-and-bet-press.ts)

/**
 * The home page's main button. Pressing it plays the compass inside the button, on the button's own plate,
 * starting on the press; the page changes when the rose has settled.
 */
export function WatchAndBet({ to }: { to: string }) {
  const [n, setN] = useState(0);
  const timer = useRef<number>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const go = () => {
    if (n) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return navigate(to);
    setN(1);
    timer.current = window.setTimeout(() => navigate(to), SETTLED_MS);
  };
  return (
    <span className={`cta-wrap car-cta ${n ? 'going' : ''}`}>
      <Button variant="primary" size="lg" block onClick={go}>
        Watch and bet
      </Button>
      <Moment className="cta-compass" name="watch-and-bet-press" width={40} autoplay={false} playKey={n} onStart={() => sfxFor('watch-and-bet-press')} />
    </span>
  );
}
