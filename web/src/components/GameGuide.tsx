// A game's guide: a few pictures of the game itself, each with one line under it. Opens over the channel page
// from the "Game guide" panel. The pictures are in web/public/guide/<channel>/ (stills of our own games); the
// lines are short on purpose and are Ian's to word.
import { useEffect, useRef } from 'react';
import './game-guide.css';

interface Picture {
  /** file in web/public/guide/<channel>/ */
  file: string;
  /** the one line under it */
  line: string;
  /** what the picture shows, for screen readers */
  alt: string;
}

const PICTURES: Record<string, Picture[]> = {
  scrivener: [
    { file: '1-build.webp', line: 'Each AI builds a fighter, one pick at a time.', alt: 'An AI choosing a weapon from three cards' },
    { file: '2-matchup.webp', line: 'Both builds are shown before the fight starts.', alt: 'The two fighters with their four cards each' },
    { file: '3-fight.webp', line: 'One go each at the boss. The AI picks every move.', alt: 'A fighter facing the boss with four moves to choose from' },
    { file: '4-verdict.webp', line: 'Kill Inkelton to win. If neither does, the bigger dent wins.', alt: 'The end card showing how much health the boss has left' },
  ],
  brawl: [
    { file: '1-fighters.webp', line: 'Each AI picks one of six monsters, unseen by the other.', alt: 'The six fighters to choose from' },
    { file: '2-stages.webp', line: 'They cross out stages until one is left.', alt: 'Six stages, some crossed out' },
    { file: '3-ready.webp', line: 'The fighters wait while predictions are open.', alt: 'Two fighters standing ready under a predictions clock' },
    { file: '4-fight.webp', line: 'Hits add damage. More damage means you fly further.', alt: 'Two fighters mid-fight with their damage numbers' },
    { file: '5-edge.webp', line: 'Knocked off the edge is a life lost. Two lives each.', alt: 'A fighter being knocked off the edge of the stage' },
    { file: '6-winner.webp', line: 'Last monster standing wins.', alt: 'The winner card' },
  ],
  tumbletop: [
    { file: '1-round-one.webp', line: 'Sixteen start. The top eight go through.', alt: 'Round one, with the standings and the cut line' },
    { file: '2-round-two.webp', line: 'Then the top four.', alt: 'Round two, with the standings and the cut line' },
    { file: '3-winner.webp', line: 'First across the last line wins the show.', alt: 'The winner at the finish line' },
  ],
};

export const hasGuide = (channel: string) => !!PICTURES[channel];

/** Opens over the page; Escape, the cross or a click outside closes it. */
export function GameGuideDialog({ channel, title, open, onClose }: { channel: string; title: string; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pictures = PICTURES[channel];
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  if (!pictures) return null;
  return (
    <dialog
      ref={ref}
      className="gg"
      tabIndex={-1}
      aria-labelledby="gg-title"
      onClose={onClose}
      onPointerDown={(e) => {
        if (e.target === ref.current) onClose(); // the backdrop
      }}
      data-testid="game-guide"
    >
      {open && (
        <div className="gg-body">
          <header className="gg-head">
            <h2 id="gg-title" className="gg-title">How {title} works</h2>
            <button type="button" className="gg-x" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            </button>
          </header>
          <ol className="gg-pics">
            {pictures.map((p, i) => (
              <li key={p.file} className="gg-pic" style={{ animationDelay: `${i * 40}ms` }}>
                <img src={`/guide/${channel}/${p.file}`} alt={p.alt} width={960} height={540} loading="lazy" draggable={false} />
                <p className="gg-line">
                  <span className="gg-n num" aria-hidden>{i + 1}</span>
                  {p.line}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </dialog>
  );
}
