// Under the stream: one wide About panel (art on the left, the game in a few sentences on the right), then a row of
// two link panels, "View results" and "Fair play". Viewer copy here never names the chain underneath.
import { useEffect, useRef, useState } from 'react';
import { getConfig, type Config } from '../lib/api';
import { displayTitle } from '../lib/channels';
import { FIXTURE } from '../lib/dev';
import type { ChannelState } from '../lib/feed';
import { useHistory } from '../lib/history';
import { Button } from '../ui';
import { thumbFor } from './Rail';
import './channel-panels.css';

/**
 * The game itself, in two or three sentences. Never how betting works.
 * The Inkelton (scrivener) text is Ian's; the other three are drafts for him to rewrite.
 */
const GAME: Record<string, string> = {
  scrivener: 'In a haunted library, a scribe writes the names of the dead. Two AIs take turns trying to kill it before it finishes theirs. Six strokes and they’re gone.',
  tumbletop: 'Sixteen AIs tumble through a toy-box obstacle course. Half are cut after every round. First across the last line wins.',
  brawl: 'Two AIs each pick a fighter and coach it from the corner. The stage floats, and there is no way back up. Knock the other one off.',
  dating: 'One star, four suitors, every one of them an AI. The star cuts a suitor after each round and picks one at the end.',
};

/** Ian's picture for the panel, when it exists: web/public/about/<channel>.webp. Until then, the channel's poster. */
function AboutArt({ channel }: { channel: string }) {
  const [missing, setMissing] = useState(false);
  const fallback = thumbFor(channel);
  const src = missing ? fallback : `/about/${channel}.webp`;
  return (
    <div className="ab-art">
      {src && <img src={src} alt="" draggable={false} onError={() => setMissing(true)} />}
    </div>
  );
}

const explorerQuery = (cluster?: string) =>
  !cluster || cluster === 'mainnet-beta' ? '' : cluster.startsWith('http') ? `?cluster=custom&customUrl=${encodeURIComponent(cluster)}` : `?cluster=${cluster}`;

// Dev only: on the sample dataset the round accounts are made up, so the link goes to the real round from the
// runner's test run on 2026-11-20 instead (see devnet-ledger.md in the shared notes).
const SAMPLE_MARKET = '2hTyeL14vwmBCf9FgrpE17yM6LAJieYhqfr3mhZQ4qqf';

/** Where "View results" goes: the public record of this channel's current round, else its last finished one. */
function useResultsLink(s: ChannelState): string | null {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    if (!FIXTURE) getConfig().then(setCfg).catch(() => {});
  }, []);
  const { data: past } = useHistory(s.channel, 1, `${s.match?.matchId ?? ''}:${s.phase}`);
  if (FIXTURE) return `https://explorer.solana.com/address/${SAMPLE_MARKET}?cluster=devnet`;
  if (cfg?.chain !== 'solana') return null; // practice mode has no public record to open
  const market = s.windows[s.windows.length - 1]?.market ?? past?.[0]?.windows[past[0].windows.length - 1]?.market;
  return market ? `https://explorer.solana.com/address/${market}${explorerQuery(cfg.cluster)}` : null;
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function ReceiptIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M12 4v16M8 20h8M5 7.5l7-2 7 2" />
      <path d="M5 7.5l-2.8 6.2a2.9 2.9 0 0 0 5.6 0zM19 7.5l-2.8 6.2a2.9 2.9 0 0 0 5.6 0z" />
    </svg>
  );
}
function OutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden {...stroke}>
      <path d="M7.5 4.5H4.5v9h9v-3M10.5 3.5h4v4M14.2 3.8 8.5 9.5" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden {...stroke}>
      <path d="M7 4l5 5-5 5" />
    </svg>
  );
}

/** Fair play, in plain words. Opens over the page; Escape, the button or a click outside closes it. */
function FairPlayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="fp"
      aria-labelledby="fp-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // the backdrop
      }}
    >
      <div className="fp-body">
        <h2 id="fp-title" className="fp-h">Fair play</h2>
        <p>No one can know the winner while bets are open. That includes us.</p>
        <p>Anything hidden in a game is sealed before betting opens. Everything else is decided after it closes.</p>
        <p>When a round ends the seal is opened, and every bet and payout stays on a public record we cannot change.</p>
        <div className="fp-foot">
          <Button variant="quiet" onClick={onClose} autoFocus>
            Close
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function ChannelPanels({ s }: { s: ChannelState }) {
  const results = useResultsLink(s);
  const [fair, setFair] = useState(false);
  const title = displayTitle(s.title);
  const text = GAME[s.channel];
  return (
    <section className="ch-panels">
      <article className="ab">
        <AboutArt channel={s.channel} />
        <div className="ab-text">
          <h2 className="ab-h">{title || ' '}</h2>
          {text && <p className="ab-p">{text}</p>}
        </div>
      </article>
      <div className="lp-row">
        {results && (
          <a className="lp" href={results} target="_blank" rel="noreferrer" data-testid="view-results">
            <ReceiptIcon />
            <span className="lp-name">View results</span>
            <span className="lp-go"><OutIcon /></span>
          </a>
        )}
        <button type="button" className="lp" onClick={() => setFair(true)} aria-haspopup="dialog" data-testid="fair-play">
          <ScaleIcon />
          <span className="lp-name">Fair play</span>
          <span className="lp-go"><NextIcon /></span>
        </button>
      </div>
      <FairPlayDialog open={fair} onClose={() => setFair(false)} />
    </section>
  );
}
