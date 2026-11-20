import { useEffect, useState } from 'react';
import { ChannelPanels } from '../components/ChannelPanels';
import { ChatInput, ChatList } from '../components/Chat';
import { GameStage } from '../components/GameStage';
import { StreamControls } from '../components/StreamControls';
import { Prediction } from '../components/Prediction';
import { LiveBadge, PhaseTag, Thumb } from '../components/Rail';
import { kindFor } from '../channelInfo';
import { EyeIcon, Link, VolumeIcon } from '../components/bits';
import { effectiveVolume, useAudio } from '../lib/audio';
import { displayTitle, useChannels } from '../lib/channels';
import { channelPath } from '../lib/router';
import { Button } from '../ui';
import { useChannelState, useFeed } from '../lib/feed';
import { useWallet } from '../lib/wallet';

export function ChannelPage({ id }: { id: string }) {
  const { channels } = useChannels();
  if (channels && !channels.some((c) => c.channel === id)) {
    return (
      <div className="notfound">
        <p>That channel isn’t live.</p>
        <Link to="/" className="btn btn-primary">
          See what’s live
        </Link>
      </div>
    );
  }
  return <Channel key={id} id={id} />;
}

/** People watching right now, as the runner counts them. Never padded: 0 until the runner says otherwise. */
export const viewersOf = (s: { viewers: number | null }) => s.viewers ?? 0;

function Channel({ id }: { id: string }) {
  const feed = useFeed(id);
  const s = useChannelState(feed);
  const wallet = useWallet();
  const [cams, setCams] = useState<string[]>([]);
  const [cam, setCam] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const snd = useAudio();
  const [hasVolume, setHasVolume] = useState(false);

  useEffect(() => {
    if (cams.length && (!cam || !cams.includes(cam))) setCam(cams[0]!);
  }, [cams, cam]);

  // game.highlight(): the outcome the viewer is selecting, else the one they bet on most recently.
  let highlight: string | null = picked;
  for (let i = s.windows.length - 1; i >= 0 && highlight == null; i--) {
    const w = s.windows[i]!;
    const t = wallet.ticket(w.windowId);
    if (!t) continue;
    const idx = t.pending ? t.pending.outcome : t.amounts.reduce((b, a, j, arr) => (a > (arr[b] ?? 0) ? j : b), 0);
    highlight = w.outcomes[idx]?.entrantId ?? null;
  }

  // "Bet now": bring the bet panel into view, open if it was folded.
  const betNow = () => {
    setChatOpen(true);
    requestAnimationFrame(() => window.dispatchEvent(new Event('arena:bet-now')));
  };
  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (!shared) return;
    const t = window.setTimeout(() => setShared(false), 1600);
    return () => clearTimeout(t);
  }, [shared]);
  const share = () => {
    navigator.clipboard?.writeText(location.origin + channelPath(id)).then(() => setShared(true), () => {});
  };

  const es = s.match?.entrants ?? [];
  const title = displayTitle(s.title);

  return (
    <div className={`ch ${chatOpen ? '' : 'chat-closed'}`}>
      <section className="ch-main">
        <div className="ch-stream">
          <GameStage feed={feed} highlight={highlight} camera={cam} onCameras={setCams} volume={effectiveVolume(snd)} soundAllowed={snd.unlocked} onVolumeSupport={setHasVolume} />
          {!snd.unlocked && (
            <button type="button" className="unmute" data-testid="unmute">
              <VolumeIcon level={0} /> Click for sound
            </button>
          )}
          {!s.connected && <div className="reconnect">Reconnecting…</div>}
          <StreamControls hasVolume={hasVolume} />
        </div>
        <div className="ch-info">
          <div className="ch-avatar">
            <Thumb channel={id} title={title} />
            <LiveBadge s={s} />
          </div>
          <div className="ch-id">
            <h1 className="ch-title">{title || ' '}</h1>
            <div className="ch-matchup">
              {es.length === 2 && (
                <span>
                  <span className="side-a">{es[0]!.name}</span> <span className="vs">vs</span> <span className="side-b">{es[1]!.name}</span>
                </span>
              )}
              {es.length > 2 && <span>Free For All</span>}
            </div>
            <div className="ch-tags">
              <span className="ch-kind">{kindFor(id)}</span>
              <PhaseTag s={s} />
            </div>
          </div>
          <div className="ch-actions">
            <div className="ch-buttons">
              {cams.length > 1 && (
                <div className="cams" role="group" aria-label="Camera">
                  {cams.map((c) => (
                    <button key={c} type="button" className={cam === c ? 'on' : ''} onClick={() => setCam(c)} data-testid={`cam-${c}`} aria-pressed={cam === c}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
              {!chatOpen && (
                <button type="button" className="btn" onClick={() => setChatOpen(true)}>
                  Show chat
                </button>
              )}
              <Button variant="primary" size="lg" onClick={betNow} data-testid="bet-now" seed="bet-now">
                Bet now
              </Button>
            </div>
            <div className="ch-meta">
              <span className="ch-viewers num">
                <EyeIcon />
                <span className="ch-viewers-n">{viewersOf(s).toLocaleString('en-US')}</span>
                <span className="ch-viewers-w">watching</span>
              </span>
              <button type="button" className={`ch-share ${shared ? 'done' : ''}`} onClick={share} aria-label="Copy the link to this channel" title={shared ? 'Link copied' : 'Share'} data-testid="share">
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {shared ? <path d="M4.5 10.5l3.5 3.5 7.5-8" /> : <path d="M11 4.5l5.5 5-5.5 5v-3.2c-4 0-6.3 1-8 3.7.3-4.3 2.8-7.2 8-7.5z" />}
                </svg>
              </button>
              <span className="ink-sr" role="status">{shared ? 'Link copied' : ''}</span>
            </div>
          </div>
        </div>
        <ChannelPanels s={s} />
      </section>
      <aside className="ch-side">
        <div className="chat-head">
          <button type="button" className="icon-btn" onClick={() => setChatOpen(false)} aria-label="Hide chat" title="Hide chat">
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
              <path d="M7 4l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span>Chat</span>
        </div>
        <Prediction feed={feed} s={s} onPick={setPicked} />
        <ChatList s={s} />
        <ChatInput feed={feed} s={s} />
      </aside>
    </div>
  );
}
