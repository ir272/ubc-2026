// Three answers to one brief: "the top of the home page, light theme: show what is live and get
// the viewer into a game". They differ on a named axis each, not on colour:
//   Stage      layout       one big stage with its live odds beside it, channels as tabs
//   Editorial  personality  large serif type, whitespace, the channels as a programme list
//   Board      density + interaction model  everything live at once, bet without leaving home
import { useState } from 'react';
import type { Snapshot } from '../../lib/api';
import { GameStage } from '../../components/GameStage';
import { Link } from '../../components/bits';
import { UNIT, usdShort } from '../../lib/money';
import { channelPath, navigate } from '../../lib/router';
import { wallet } from '../../lib/wallet';
import { clock, pays, pct, stateLine, useLive, type Live, type Side } from './live';

const vars = (o: Record<string, string | number>) => o as React.CSSProperties;
const ranked = (l: Live) => [...l.sides].sort((a, b) => b.share - a.share);

/* ───────────────────────── 1. Stage ───────────────────────── */

function StageTab({ snap, on, onPick }: { snap: Snapshot; on: boolean; onPick: () => void }) {
  const l = useLive(snap);
  return (
    <button type="button" role="tab" aria-selected={on} className="p1-tab" onClick={onPick}>
      <span className="p1-tab-name">{l.title}</span>
      <span className={`p1-tab-state num ${l.open ? 'open' : ''}`}>{stateLine(l)}</span>
    </button>
  );
}

function StageBody({ snap }: { snap: Snapshot }) {
  const l = useLive(snap);
  const to = channelPath(l.id);
  const top = ranked(l).slice(0, 4);
  return (
    <div className="p1-body">
      <Link to={to} className="p1-screen" aria-label={`Watch ${l.title}`}>
        <GameStage feed={l.feed} volume={0} soundAllowed={false} />
      </Link>
      <aside className="p1-ticket">
        <div className="p1-kind">
          {l.kind} <span className="num">{l.viewers} watching</span>
        </div>
        <h2 className="p1-title">{l.line || l.title}</h2>
        {l.w && (
          <>
            <div className="p1-q">
              <span>{l.w.question}</span>
              <span className={`num ${l.open ? 'p1-open' : ''}`}>{l.open ? clock(l.closesIn) : l.locked ? 'Locked' : 'Final'}</span>
            </div>
            <ol className="p1-sides">
              {top.map((s) => (
                <li key={s.index} style={vars({ '--c': s.color, '--w': s.share })}>
                  <i className="p1-bar" />
                  <i className="p1-dot" />
                  <span className="p1-label">{s.label}</span>
                  <span className="p1-pays num">{pays(s.pays)}</span>
                  <span className="p1-pct num">{pct(s.share)}</span>
                </li>
              ))}
            </ol>
            {l.sides.length > top.length && <div className="p1-more">and {l.sides.length - top.length} more</div>}
          </>
        )}
        <div className="p1-foot">
          <span className="p1-pot num">{usdShort(l.total)} pot</span>
          <Link to={to} className="p1-cta">
            Watch and bet
          </Link>
        </div>
      </aside>
    </div>
  );
}

export function Stage({ channels }: { channels: Snapshot[] }) {
  const [sel, setSel] = useState(channels[0]?.channel);
  const active = channels.find((c) => c.channel === sel) ?? channels[0];
  if (!active) return null;
  return (
    <section className="p1">
      <div className="p1-tabs" role="tablist" aria-label="Live games">
        {channels.map((c) => (
          <StageTab key={c.channel} snap={c} on={c.channel === active.channel} onPick={() => setSel(c.channel)} />
        ))}
      </div>
      <StageBody key={active.channel} snap={active} />
    </section>
  );
}

/* ───────────────────────── 2. Editorial ───────────────────────── */

function ProgrammeRow({ snap, on, onPick }: { snap: Snapshot; on: boolean; onPick: () => void }) {
  const l = useLive(snap);
  return (
    <li>
      <a
        href={channelPath(l.id)}
        className={`p2-row ${on ? 'on' : ''}`}
        onPointerEnter={onPick}
        onFocus={onPick}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          navigate(channelPath(l.id));
        }}
      >
        <span className={`p2-state num ${l.open ? 'open' : ''}`}>{stateLine(l)}</span>
        <span className="p2-name">{l.title}</span>
        <span className="p2-line">{l.line || l.kind}</span>
        <span className="p2-pot num">{l.total > 0 ? usdShort(l.total) : ''}</span>
        <svg className="p2-arrow" width="18" height="18" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h12M11 5l5 5-5 5" />
        </svg>
      </a>
    </li>
  );
}

function EditorialMedia({ snap }: { snap: Snapshot }) {
  const l = useLive(snap);
  const top = ranked(l).slice(0, 2);
  return (
    <figure className="p2-media">
      <Link to={channelPath(l.id)} className="p2-screen" aria-label={`Watch ${l.title}`}>
        <GameStage feed={l.feed} volume={0} soundAllowed={false} />
      </Link>
      <figcaption>
        <span className="p2-cap-kind">{l.kind}</span>
        {top.map((s) => (
          <span key={s.index} className="p2-cap-side">
            <i style={{ background: s.color }} /> {s.label} <b className="num">{pct(s.share)}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function Editorial({ channels }: { channels: Snapshot[] }) {
  const [sel, setSel] = useState(channels[0]?.channel);
  const active = channels.find((c) => c.channel === sel) ?? channels[0];
  if (!active) return null;
  return (
    <section className="p2">
      <div className="p2-copy">
        <h1 className="p2-h">
          AI plays.
          <br />
          <em>You bet.</em>
        </h1>
        <ul className="p2-list">
          {channels.map((c) => (
            <ProgrammeRow key={c.channel} snap={c} on={c.channel === active.channel} onPick={() => setSel(c.channel)} />
          ))}
        </ul>
      </div>
      <EditorialMedia key={active.channel} snap={active} />
    </section>
  );
}

/* ───────────────────────── 3. Board ───────────────────────── */

const STAKE = 10;

function QuickBet({ l, s }: { l: Live; s: Side }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'done' | 'fail'>('idle');
  const go = async () => {
    if (!l.w || !l.open || st === 'busy') return;
    setSt('busy');
    const ok = await wallet.placeBet(l.w, s.index, STAKE * UNIT);
    setSt(ok ? 'done' : 'fail');
    setTimeout(() => setSt('idle'), 1400);
  };
  return (
    <button type="button" className={`p3-bet ${st}`} disabled={!l.open} onClick={go} style={vars({ '--c': s.color })} title={l.open ? `Bet $${STAKE} on ${s.label}` : 'Bets are closed'}>
      <span className="p3-bet-face">
        <i />
        <span className="p3-bet-label">{s.label}</span>
        <b className="num">{pays(s.pays) || pct(s.share)}</b>
      </span>
      <span className="p3-bet-done" aria-hidden={st !== 'done'}>
        ${STAKE} on {s.label}
      </span>
    </button>
  );
}

function Tile({ snap, big }: { snap: Snapshot; big?: boolean }) {
  const l = useLive(snap);
  const to = channelPath(l.id);
  const top = ranked(l).slice(0, big ? 4 : 2);
  const more = l.sides.length - top.length;
  return (
    <article className={`p3-tile ${big ? 'big' : ''}`}>
      <Link to={to} className="p3-media" aria-label={`Watch ${l.title}`}>
        {big ? <GameStage feed={l.feed} volume={0} soundAllowed={false} /> : l.poster && <img src={l.poster} alt="" draggable={false} />}
        {!big && <span className={`p3-chip num ${l.open ? 'open' : ''}`}>{stateLine(l)}</span>}
      </Link>
      <div className="p3-info">
        <div className="p3-head">
          <Link to={to} className="p3-name">
            {l.title}
          </Link>
          {big && <span className={`p3-state num ${l.open ? 'open' : ''}`}>{stateLine(l)}</span>}
          {l.total > 0 && <span className="p3-pot num">{usdShort(l.total)} pot</span>}
        </div>
        <div className="p3-line">{l.line || l.kind}</div>
        <div className="p3-bets">
          {top.map((s) => (
            <QuickBet key={s.index} l={l} s={s} />
          ))}
          {more > 0 && (
            <Link to={to} className="p3-more num">
              +{more}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function Board({ channels }: { channels: Snapshot[] }) {
  return (
    <section className="p3">
      {channels.slice(0, 4).map((c, i) => (
        <Tile key={c.channel} snap={c} big={i === 0} />
      ))}
    </section>
  );
}
