// The prediction, pinned at the top of the chat column. One card, three states, any number of
// outcomes (2 to 16):
//   open    → question + countdown, the outcomes (share, multiple), four amounts, one bet button
//   locked  → same outcomes (yours marked), your bet and what it pays, the split of the pot
//   result  → winner marked, your payout or loss as one large number, what comes next
// Layout by outcome count: 2 = two tiles, 3–4 = a 2×2 grid of the same tiles, 5–16 = compact rows
// sorted by share (your pick pinned first) in a list that scrolls inside the card.
// Earlier windows of the same match stay as one quiet line each under the card.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Entrant, WindowView } from '../lib/api';
import { currentWindow, useNow, type ChannelState, type FeedClient } from '../lib/feed';
import { mult, UNIT, usd } from '../lib/money';
import { useWallet, type Ticket } from '../lib/wallet';
import { AutoHeight, useCountUp } from './bits';
import { BetSides, Button, Moment, Roll, type BetState } from '../ui';
import { sfx, sfxFor } from './nightline';

const AMOUNTS = [10, 25, 50, 100];
const AMT_KEY = 'arena.amount';
const MANY = 5; // from this many outcomes on, rows instead of tiles

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const mainPick = (t: Ticket) => t.amounts.reduce((best, a, i, arr) => (a > (arr[best] ?? 0) ? i : best), 0);
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Two outcomes use the theme's side pair; more use a fixed set of hues (or the game's entrant colour).
const PALETTE = ['--side-a', '--side-b', '--name-2', '--name-4', '--name-1', '--name-0', '--name-3', '--name-5'];
export const paletteVar = (i: number) => `var(${PALETTE[i % PALETTE.length]})`;
function outColor(w: WindowView, i: number, entrants: Entrant[]): string {
  const e = entrants.find((x) => x.id === w.outcomes[i]?.entrantId);
  if (w.outcomes.length > 2 && e?.color) return e.color;
  return `var(${PALETTE[i % PALETTE.length]})`;
}

export function Prediction({
  feed, s, onHide, onPick,
}: { feed: FeedClient; s: ChannelState; onHide?: () => void; onPick?: (entrantId: string | null) => void }) {
  const wallet = useWallet();
  const now = useNow(200);
  const settledAt = useRef(new Map<string, number>());
  const [folded, setFolded] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  // "Bet now" under the stream: open the panel, bring it into view and ring it once.
  useEffect(() => {
    const on = () => {
      setFolded(false);
      const el = card.current?.closest('.pred');
      if (!el) return;
      el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el.classList.remove('pred-nudge');
      void (el as HTMLElement).offsetWidth;
      el.classList.add('pred-nudge');
    };
    window.addEventListener('arena:bet-now', on);
    return () => window.removeEventListener('arena:bet-now', on);
  }, []);

  useEffect(
    () =>
      feed.onMessage((m) => {
        if (m.type === 'window_settled' || m.type === 'window_void') {
          settledAt.current.set(m.windowId, Date.now());
          const list = (m.payouts ?? m.refunds ?? []) as { owner: string; amount: number }[];
          wallet.settle(m.windowId, list.find((p) => p.owner === wallet.owner)?.amount ?? 0);
        }
      }),
    [feed, wallet],
  );

  // A fresh result of yours stays up a few seconds even if the next window already opened.
  let w = currentWindow(s);
  const held = [...s.windows]
    .reverse()
    .find((x) => (x.state === 'settled' || x.state === 'void') && wallet.ticket(x.windowId) && (settledAt.current.get(x.windowId) ?? 0) > now - 5500);
  if (held && w && w.state === 'open' && w.windowId !== held.windowId) w = held;

  const entrants = s.match?.entrants ?? [];
  const multi = s.windows.length > 1;
  // The match goes on after this window (another prediction is coming) unless it has ended.
  const more = s.phase === 'live' || s.phase === 'lobby';
  let body: JSX.Element;
  let kind = 'idle';
  if (!w) body = <div className="pc pc-idle">Next prediction soon</div>;
  else if (w.state === 'open') {
    kind = 'open';
    body = <Open key={w.windowId} feed={feed} w={w} entrants={entrants} serverNow={now + s.offset} ticket={wallet.ticket(w.windowId)} onPick={onPick} />;
  } else if (w.state === 'locked') {
    kind = 'locked';
    body = <Locked w={w} entrants={entrants} ticket={wallet.ticket(w.windowId)} more={multi && more} />;
  } else {
    kind = 'result';
    const fresh = (settledAt.current.get(w.windowId) ?? 0) > now - 9000;
    const next = more ? 'Next prediction soon' : s.nextAt ? `Next match, bets open in ${clock(s.nextAt - now)}` : 'Next match soon';
    body = <Result key={w.windowId} w={w} entrants={entrants} ticket={wallet.ticket(w.windowId)} fresh={fresh} owner={wallet.owner} next={next} />;
  }

  // Earlier windows of this match that the viewer bet on: one quiet line each.
  const earlier = s.windows
    .map((x, k) => ({ x, k, t: wallet.ticket(x.windowId) }))
    .filter(({ x, t }) => x !== w && t && sum(t.amounts) > 0);

  return (
    <AutoHeight className={`pred has-hide ${folded ? 'pred-folded' : ''}`}>
      <>
        <div ref={card} data-testid="prediction" data-kind={kind}>
          {body}
        </div>
        <button type="button" className="icon-btn pred-hide" onClick={() => setFolded((v) => !v)} aria-expanded={!folded} aria-label={folded ? 'Open the bet' : 'Fold the bet'} title={folded ? 'Open the bet' : 'Fold the bet'}>
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
            <path d={folded ? 'M4 7l5 5 5-5' : 'M4 11l5-5 5 5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {earlier.length > 0 && (
          <div className="earlier" data-testid="earlier-bets">
            {earlier.map(({ x, k, t }) => {
              const i = mainPick(t!);
              const stake = sum(t!.amounts);
              const wi = x.outcomes.findIndex((o) => o.id === x.winnerOutcomeId);
              let status = x.state === 'open' ? 'open' : 'locked';
              let cls = '';
              if (x.state === 'void') status = 'refunded';
              else if (x.state === 'settled') {
                const won = wi >= 0 && (t!.amounts[wi] ?? 0) > 0 && (t!.payout ?? 0) > 0;
                status = won ? `won ${usd(t!.payout ?? 0)}` : 'lost';
                cls = won ? 'won' : 'lost';
              }
              return (
                <div key={x.windowId} className={`earlier-line ${cls}`}>
                  <span className="nm">
                    Round {k + 1}: {usd(stake)} on {x.outcomes[i]?.label}
                  </span>
                  <span className="earlier-st">{status}</span>
                </div>
              );
            })}
          </div>
        )}
      </>
    </AutoHeight>
  );
}

function shares(w: WindowView) {
  return w.outcomes.map((_, i) => {
    const p = w.pools[i] ?? 0;
    return { share: w.total ? p / w.total : 0, mult: p && w.total > p ? w.total / p : null };
  });
}

interface OutProps {
  w: WindowView;
  entrants: Entrant[];
  /** selected (open) or backed (locked/result) outcome index */
  on: number | null;
  winner?: number;
  onSelect?: (i: number) => void;
  /** open: pick a side. placing: the bet is being sent. locked: betting is closed. */
  state: BetState;
  /** the viewer's own stake, shown on its row */
  staked?: { i: number; text: string } | null;
}

/** The outcomes as Nightline bet sides: rows for any count, tighter and scrolling from five up. */
function Outcomes(p: OutProps) {
  const n = p.w.outcomes.length;
  const sh = shares(p.w);
  const done = p.winner != null && p.winner >= 0;
  let order = p.w.outcomes.map((_, i) => i);
  if (n >= MANY) {
    // Sorted by share; the winner, then your pick, pinned first.
    const byShare = [...order].sort((x, y) => sh[y]!.share - sh[x]!.share || x - y);
    const pin = [done ? p.winner! : null, p.on].filter((x): x is number => x != null && x >= 0);
    order = [...new Set([...pin, ...byShare])];
  }
  const id = (i: number | null | undefined) => (i != null && i >= 0 ? (p.w.outcomes[i]?.id ?? null) : null);
  return (
    <BetSides
      label={p.w.question}
      seed={p.w.windowId}
      line
      dense={n >= MANY}
      sides={order.map((i) => ({
        id: p.w.outcomes[i]!.id,
        label: p.w.outcomes[i]!.label,
        share: sh[i]!.share,
        multiple: sh[i]!.mult,
        color: outColor(p.w, i, p.entrants),
        testId: `choice-${p.w.outcomes[i]!.id}`,
      }))}
      value={id(p.on)}
      onChange={p.onSelect ? (sid) => p.onSelect!(p.w.outcomes.findIndex((o) => o.id === sid)) : undefined}
      state={p.state}
      staked={p.staked ? { id: p.w.outcomes[p.staked.i]!.id, text: p.staked.text } : null}
      winner={done ? id(p.winner) : null}
    />
  );
}

function Head({ w, right, clockS }: { w: WindowView; right?: string; clockS?: { left: number; total: number } }) {
  return (
    <div className="pc-top">
      <div className="pc-q">{w.question}</div>
      {clockS ? (
        <div className={`pc-clock ${clockS.left <= 10 ? 'late' : ''}`} role="timer" aria-label={`Betting closes in ${clock(clockS.left * 1000)}`}>
          <Roll value={clock(clockS.left * 1000)} dir="down" />
        </div>
      ) : (
        <div className="pc-clock">{right}</div>
      )}
    </div>
  );
}

const sizeClass = (w: WindowView) => (w.outcomes.length <= 2 ? 'n2' : w.outcomes.length < MANY ? 'n4' : 'nmany');

function Open(p: {
  feed: FeedClient; w: WindowView; entrants: Entrant[]; serverNow: number; ticket: Ticket | null;
  onPick?: (entrantId: string | null) => void;
}) {
  const { feed, w, serverNow, ticket } = p;
  const wallet = useWallet();
  const [sel, setSel] = useState<number | null>(null);
  const [amt, setAmt] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(AMT_KEY)) || 25;
    } catch {
      return 25;
    }
  });
  const [err, setErr] = useState<string | null>(null);
  const msLeft = Math.max(0, w.closesAt - serverNow);
  const total = Math.max(1, w.closesAt - (w.openedAt ?? serverNow));
  const bal = wallet.balance ?? 0;
  const a = amt * UNIT;
  const closed = msLeft <= 0;

  useEffect(() => {
    if (sel == null && ticket && sum(ticket.amounts) > 0) setSel(mainPick(ticket));
  }, [ticket, sel]);
  // Tell the game which entrant the viewer is looking at (null when cleared or when this card goes).
  const onPick = useRef(p.onPick);
  onPick.current = p.onPick;
  useEffect(() => {
    onPick.current?.(sel != null ? (w.outcomes[sel]?.entrantId ?? null) : null);
  }, [sel, w]);
  useEffect(() => () => onPick.current?.(null), []);

  // If nobody has backed any other outcome yet there is nothing to win from it: no payout is promised.
  const est = sel != null && w.total - (w.pools[sel] ?? 0) > 0 ? (a * (w.total + a)) / ((w.pools[sel] ?? 0) + a) : null;
  const pending = !!ticket?.pending;
  const canBet = sel != null && !closed && a <= bal && !pending;
  const [justPlaced, setJustPlaced] = useState(0);
  const place = async () => {
    if (sel == null || !canBet) return;
    setErr(null);
    sfx('place');
    const ok = await wallet.placeBet(w, sel, a);
    if (!ok) setErr(wallet.tickets.get(w.windowId)?.error ?? 'Didn’t go through');
    else {
      feed.addBet({ who: 'You', amount: a, outcome: sel, label: w.outcomes[sel]!.label, t: Date.now(), mine: true });
      setJustPlaced((x) => x + 1);
    }
  };
  const staked = ticket ? sum(ticket.amounts) : 0;
  const pick = ticket && staked > 0 ? mainPick(ticket) : null;
  const n = w.outcomes.length;
  const secs = Math.ceil(msLeft / 1000);
  // the last ten seconds tick, but never from a background tab
  useEffect(() => {
    if (secs > 0 && secs <= 10 && document.hasFocus()) sfx('tick');
  }, [secs]);

  return (
    <div className={`pc pc-open ${sizeClass(w)}`}>
      <Head w={w} clockS={{ left: msLeft / 1000, total: total / 1000 }} />
      <Outcomes
        w={w}
        entrants={p.entrants}
        on={sel}
        onSelect={(i) => {
          setSel(i);
          sfx('pick');
        }}
        state={closed ? 'locked' : pending ? 'placing' : 'open'}
        staked={pick != null ? { i: pick, text: usd(ticket!.amounts[pick] ?? 0) } : null}
      />
      <div className="pc-foot">
        <div className="grid4">
          {AMOUNTS.map((d) => (
            <Button
              key={d}
              size="sm"
              selected={amt === d}
              disabled={d * UNIT > bal}
              onClick={() => {
                setAmt(d);
                try {
                  localStorage.setItem(AMT_KEY, String(d));
                } catch {
                  /* ignore */
                }
              }}
            >
              {`$${d}`}
            </Button>
          ))}
        </div>
        <Button variant="primary" block disabled={!canBet} onClick={place} data-testid="bet">
          {pending
            ? 'Placing'
            : sel == null
              ? n > 2
                ? 'Pick one'
                : 'Pick a side'
              : `${staked ? 'Add' : 'Bet'} $${amt}${est != null ? ` to win ${usd(est, { cents: false })}` : ''}`}
        </Button>
        {(err || pick != null) && (
          <div className={`pc-note pc-placed ${err ? 'bad' : ''}`} data-testid="ticket" data-look={err ? 'failed' : 'placed'}>
            {!err && justPlaced > 0 && <Moment name="bet-placed" width={44} playKey={justPlaced} onStart={() => sfxFor('bet-placed')} />}
            <span>
              {err ?? `Your bet: ${usd(ticket!.amounts[pick!] ?? 0)} on ${w.outcomes[pick!]?.label}`}
              {!err && <TxLink t={ticket} />}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Locked({ w, entrants, ticket, more }: { w: WindowView; entrants: Entrant[]; ticket: Ticket | null; more: boolean }) {
  const pick = ticket && sum(ticket.amounts) > 0 ? mainPick(ticket) : null;
  const stake = ticket && pick != null ? (ticket.amounts[pick] ?? 0) : 0;
  const wins = pick != null && w.pools[pick] ? (stake * w.total) / w.pools[pick]! : 0;
  return (
    <div className={`pc pc-locked ${sizeClass(w)}`}>
      <Head w={w} right="Locked" />
      <Outcomes w={w} entrants={entrants} on={pick} state="locked" staked={pick != null && stake > 0 ? { i: pick, text: usd(stake) } : null} />
      <div className="pc-foot">
        {stake > 0 && pick != null ? (
          <div className="lk-line" data-testid="ticket" data-look="placed">
            <span className="lk-label">Your bet</span>
            <span className="lk-val">
              <b className="num">{usd(stake)}</b> on {w.outcomes[pick]?.label}
            </span>
            <span className="lk-wins num">pays {usd(wins, { cents: false })}</span>
            <TxLink t={ticket} />
          </div>
        ) : (
          <div className="lk-line">
            <span className="lk-label">Bets are locked</span>
            <span className="lk-wins num">{usd(w.total)} pot</span>
          </div>
        )}
        <div className="pc-note">{more ? 'Next prediction soon' : 'Result when the round ends.'}</div>
      </div>
    </div>
  );
}

function Result(p: { w: WindowView; entrants: Entrant[]; ticket: Ticket | null; fresh: boolean; owner: string; next: string }) {
  const { w, ticket } = p;
  const wi = w.outcomes.findIndex((o) => o.id === w.winnerOutcomeId);
  const stake = ticket ? sum(ticket.amounts) : 0;
  const payout = ticket?.payout ?? w.payouts?.find((x) => x.owner === p.owner)?.amount ?? 0;
  const won = !!ticket && wi >= 0 && (ticket.amounts[wi] ?? 0) > 0 && payout > 0;
  const shown = useCountUp(won ? payout : 0, 1200, won && p.fresh ? 0 : payout);
  let label = 'Pot';
  let big = usd(w.total, { cents: false });
  let cls = '';
  if (w.state === 'void') {
    label = 'Round called off';
    big = stake ? `${usd(stake)} → ${usd(payout)}` : '—';
  } else if (won) {
    label = 'Your payout';
    big = `${usd(ticket!.amounts[wi] ?? stake)} → ${usd(Math.round(shown))}`;
    cls = 'win';
  } else if (stake > 0) {
    label = payout > 0 ? 'Refunded' : 'Your bet lost';
    big = payout > 0 ? `${usd(stake)} → ${usd(payout)}` : `${usd(stake)} → $0`;
    cls = 'loss';
  }
  return (
    <div className={`pc pc-res ${sizeClass(w)}`} data-testid={won ? 'result-win' : stake > 0 ? 'result-loss' : 'result'}>
      <Head w={w} right="Final" />
      <Outcomes
        w={w}
        entrants={p.entrants}
        on={ticket && stake > 0 ? mainPick(ticket) : null}
        winner={wi}
        state="locked"
        staked={ticket && stake > 0 ? { i: mainPick(ticket), text: usd(ticket.amounts[mainPick(ticket)] ?? 0) } : null}
      />
      <div className="pc-foot">
        <div className="res-row">
          <div>
            <div className="res-label">{label}</div>
            <div className={`res-big num ${cls}`}>{big}</div>
          </div>
          {won && p.fresh && <Moment name="payout" width={96} label="You won" onStart={() => sfxFor('payout')} />}
        </div>
        <div className="pc-note">
          {p.next}
          <TxLink t={ticket} />
        </div>
      </div>
    </div>
  );
}

/** On Solana, the viewer's own bet as a link to its transaction on the explorer. */
function TxLink({ t }: { t: Ticket | null }) {
  if (!t?.tx) return null;
  return (
    <a className="tx-link" href={t.tx} target="_blank" rel="noreferrer" data-testid="bet-tx">
      View receipt
    </a>
  );
}
