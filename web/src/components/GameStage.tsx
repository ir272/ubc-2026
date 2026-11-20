import { useEffect, useRef, useState } from 'react';
import type { FeedClient } from '../lib/feed';
import { findGame } from '../games/registry';
import type { GameHandle } from '../games/types';
import { STILL_STAGE, posterFor } from '../posters';
import { FIXTURE, STILL } from '../lib/dev';
import { fxCameras, fxImage } from '../fixture';

export { STILL };

export const isPickCamera = (mode: string) => /\b(my|pick)\b/i.test(mode);

/**
 * Mounts the channel's game through the contract's mount(el, opts) → GameHandle and forwards
 * every feed message to onFeed (a snapshot first, rebuilt from current state if the feed was
 * already running when the game loaded).
 */
export function GameStage(p: {
  feed: FeedClient;
  highlight?: string | null;
  camera?: string | null;
  onCameras?: (c: string[]) => void;
  /** 0..1, already 0 when muted */
  volume?: number;
  /** the browser allows sound (the viewer has clicked or pressed a key on the page) */
  soundAllowed?: boolean;
  /** tells the page whether this game takes a volume */
  onVolumeSupport?: (ok: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<GameHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const onCams = useRef(p.onCameras);
  onCams.current = p.onCameras;
  const onVol = useRef(p.onVolumeSupport);
  onVol.current = p.onVolumeSupport;
  const hostRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const feed = p.feed;
    if (STILL) {
      // Design fixtures have no game mounted; they still expose the game's cameras so the control shows.
      onCams.current?.(FIXTURE ? fxCameras(feed.channel) : []);
      return;
    }
    let dead = false;
    let h: GameHandle | null = null;
    let unsub: (() => void) | null = null;
    const { id, entry } = findGame(feed.channel, feed.state.match?.meta);
    setFailed(false);
    entry
      .load()
      .then((mod) => {
        if (dead || !ref.current) return;
        const host = document.createElement('div');
        host.className = 'game-host';
        ref.current.appendChild(host);
        hostRef.current = host;
        h = mod.mount(host, { assetsBase: entry.assetsBase ?? `/games/${id}/` });
        const hostEl = host;
        const destroy = h.destroy.bind(h);
        h.destroy = () => {
          destroy();
          hostEl.remove();
        };
        if (feed.state.ready) h.onFeed(feed.syntheticSnapshot());
        const hh = h;
        unsub = feed.onRaw((m) => hh.onFeed(m));
        setHandle(h);
        onCams.current?.(h.cameras ?? []);
        onVol.current?.(typeof h.setVolume === 'function');
      })
      .catch((e) => {
        console.error('game failed to load', e);
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
      unsub?.();
      try {
        h?.destroy();
      } catch (e) {
        console.error(e);
      }
      setHandle(null);
      hostRef.current = null;
      onCams.current?.([]);
      onVol.current?.(false);
    };
  }, [p.feed]);

  useEffect(() => {
    handle?.highlight?.(p.highlight ?? null);
  }, [handle, p.highlight]);
  // "My pick"-style camera modes follow the viewer's pick, so they get its entrant id.
  useEffect(() => {
    if (!p.camera || !handle?.setCamera) return;
    handle.setCamera(p.camera, isPickCamera(p.camera) ? (p.highlight ?? undefined) : undefined);
  }, [handle, p.camera, p.highlight]);

  useEffect(() => {
    handle?.setVolume?.(p.volume ?? 1);
  }, [handle, p.volume]);
  // Sound starts as soon as the browser allows it. Games built before unlockAudio() existed wait for
  // a pointerdown on their own stage, so they also get one synthetic pointerdown (it carries no
  // meaning to a watch-only stage beyond "a gesture happened").
  useEffect(() => {
    if (!handle || !p.soundAllowed) return;
    if (handle.unlockAudio) handle.unlockAudio();
    else {
      const host = hostRef.current;
      const target = host?.querySelector('canvas') ?? host?.firstElementChild ?? host;
      target?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
    }
    handle.setVolume?.(p.volume ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, p.soundAllowed]);

  return (
    <div className={`stage ${p.className ?? ''}`} ref={ref}>
      {STILL && <img className="stage-still" src={FIXTURE ? fxImage(p.feed.channel) : (posterFor(p.feed.channel).image ?? STILL_STAGE)} alt="" />}
      {failed && <div className="stage-fail">Stream unavailable</div>}
    </div>
  );
}
