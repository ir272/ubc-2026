// "Coming soon" tiles, in the three shapes the site lists games in: a card (Live now), a tall tile (categories)
// and a side panel row. Same markup and classes as their live counterparts, so they sit in the same grids; they
// are not links, and each says "Coming soon".
import { useState } from 'react';
import { soonArt, type SoonGame } from '../comingSoon';
import { Frame, Medallion, Pill } from '../ui';
import './coming-soon.css';

/** The game's card art, or its name on a plain tile until the file exists. `small`: for the round icon. */
function SoonArt({ game, small }: { game: SoonGame; small?: boolean }) {
  const [missing, setMissing] = useState(false);
  if (missing) return small ? <span className="thumb-letter">{game.name.slice(0, 1)}</span> : <span className="soon-ph">{game.name}</span>;
  return <img className={small ? 'thumb-img' : 'soon-art'} src={soonArt(game.id)} alt="" draggable={false} onError={() => setMissing(true)} />;
}

export function SoonCard({ game }: { game: SoonGame }) {
  return (
    <article className="card soon" aria-label={`${game.name}, coming soon`}>
      <Frame draw={false} className="card-frame" seed={`soon-${game.id}`}>
        <div className="card-thumb">
          <SoonArt game={game} />
          <Pill className="live-badge soon-badge">Coming soon</Pill>
        </div>
      </Frame>
      <div className="card-meta">
        <Medallion size={40} seed={`soon-${game.id}`}>
          <SoonArt game={game} small />
        </Medallion>
        <div className="card-text">
          <div className="card-title">{game.name}</div>
          <div className="card-sub">{game.kind}</div>
          <div className="card-sub">Coming soon</div>
        </div>
      </div>
    </article>
  );
}

export function SoonCat({ game }: { game: SoonGame }) {
  return (
    <div className="cat soon" aria-label={`${game.name}, coming soon`}>
      <span className="cat-art">
        <SoonArt game={game} />
      </span>
      <span className="cat-name">{game.kind}</span>
      <span className="cat-sub">Coming soon</span>
    </div>
  );
}

export function SoonRailRow({ game, open }: { game: SoonGame; open: boolean }) {
  return (
    <div className="rail-item soon" title={`${game.name}, coming soon`}>
      <Medallion size={32} seed={`soon-${game.id}`}>
        <SoonArt game={game} small />
      </Medallion>
      {open && (
        <span className="rail-text">
          <span className="rail-name">{game.name}</span>
          <span className="rail-state">{game.kind}</span>
        </span>
      )}
    </div>
  );
}
