// The content area under the player: About, Form, Results, Fair play.
import { useEffect, useState } from 'react';
import { aboutFor } from '../channelInfo';
import { getConfig, type ChannelForm, type Config, type Entrant, type EntrantForm, type WindowView } from '../lib/api';
import { FIXTURE } from '../lib/dev';
import { useNow, type ChannelState } from '../lib/feed';
import { matchup, useForm, useHistory, winnerName } from '../lib/history';
import { usd } from '../lib/money';
import { sideClass, timeAgo } from './bits';
import { OnChain } from './OnChain';

const TABS = ['About', 'Form', 'Results', 'Fair play'] as const;
type Tab = (typeof TABS)[number];
const slug = (t: string) => t.toLowerCase().replace(/\s+/g, '-');

/** Under the stream, as on Kick: plain cards on a raised surface. About the show, then what is on chain. */
export function ChannelTabs({ s }: { s: ChannelState }) {
  return (
    <section className="ch-cards">
      <article className="ch-card">
        <h2 className="ch-card-h">About {s.title.replace(/\s*\([^)]*\)\s*$/, '')}</h2>
        <p className="about">{aboutFor(s.channel)}</p>
      </article>
      <article className="ch-card">
        <h2 className="ch-card-h">On chain</h2>
        <OnChain s={s} />
      </article>
    </section>
  );
}

type Row = { e: Entrant; f: EntrantForm | undefined };

/** "12–9", plus draws when history counted any. */
function recordText(f: EntrantForm | undefined): string {
  if (!f || !f.played) return '—';
  const draws = f.source === 'history' ? f.history.draws : 0;
  const losses = Math.max(0, f.played - f.wins - draws);
  return draws ? `${f.wins}–${losses}–${draws}` : `${f.wins}–${losses}`;
}
const winRate = (f: EntrantForm | undefined) => (f && f.played ? `${Math.round((f.wins / f.played) * 100)}%` : '—');

function LastFive({ f }: { f: EntrantForm | undefined }) {
  if (!f?.last5.length) return <span className="muted">—</span>;
  return (
    <>
      {f.last5.map((r, k) => (
        <span key={k} className={r === 'W' ? 'w' : 'l'}>
          {r}
        </span>
      ))}
    </>
  );
}

function Favourite({ form }: { form: ChannelForm }) {
  const { considered, won } = form.favourite;
  if (!considered) return null;
  return (
    <p className="form-fav">
      The crowd favourite won {won} of the last {considered} {considered === 1 ? 'prediction' : 'predictions'}.
    </p>
  );
}

function Form({ s }: { s: ChannelState }) {
  const { data: form, failed } = useForm(s.channel, `${s.match?.matchId ?? ''}:${s.phase}`);
  const all = s.match?.entrants ?? [];
  if (!all.length) return <p className="muted">The next match hasn’t been announced yet.</p>;
  if (!form) return failed ? <p className="muted">Can’t load form right now.</p> : null;
  const rows: Row[] = all.map((e) => ({ e, f: form.entrants.find((x) => x.id === e.id) }));
  if (!rows.some((r) => r.f && r.f.played))
    return (
      <>
        <p className="muted">{form.matches ? 'No one in this match has finished one here yet.' : 'No finished matches yet.'}</p>
        <Favourite form={form} />
      </>
    );
  const rated = all.some((e) => e.stats?.rating != null);
  if (all.length > 2) {
    return (
      <>
        <table className="tbl">
          <thead>
            <tr>
              <th>Contestant</th>
              {rated && <th className="r">Rating</th>}
              <th className="r">Record</th>
              <th className="r">Win rate</th>
              <th className="r">Last 5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, f }) => (
              <tr key={e.id}>
                <td className="strong">{e.name}</td>
                {rated && <td className="r num">{e.stats?.rating ?? '—'}</td>}
                <td className="r num">{recordText(f)}</td>
                <td className="r num muted">{winRate(f)}</td>
                <td className="r">
                  <span className="l5 l5-end">
                    <LastFive f={f} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Favourite form={form} />
      </>
    );
  }
  return (
    <>
      <div className="form">
        {rows.slice(0, 2).map(({ e, f }, i) => (
          <div key={e.id} className="form-col">
            <div className={`form-name ${sideClass(i)}`}>{e.name}</div>
            <dl className="kv">
              {rated && (
                <>
                  <dt>Rating</dt>
                  <dd className="num">{e.stats?.rating ?? '—'}</dd>
                </>
              )}
              <dt>Record</dt>
              <dd className="num">{recordText(f)}</dd>
              <dt>Win rate</dt>
              <dd className="num">{winRate(f)}</dd>
              <dt>Last 5</dt>
              <dd className="l5">
                <LastFive f={f} />
              </dd>
            </dl>
          </div>
        ))}
      </div>
      <Favourite form={form} />
    </>
  );
}

function Results({ s }: { s: ChannelState }) {
  const { data: matches, failed } = useHistory(s.channel, 20, `${s.match?.matchId ?? ''}:${s.phase}`);
  useNow(10_000);
  if (!matches) return failed ? <p className="muted">Can’t load results right now.</p> : null;
  if (!matches.length) return <p className="muted">No finished matches yet.</p>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>When</th>
          <th>Match</th>
          <th>Winner</th>
          <th className="r">Pot</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m) => {
          const winner = winnerName(m);
          return (
            <tr key={m.matchId}>
              <td className="muted">{timeAgo(m.endedAt)}</td>
              <td>{matchup(m)}</td>
              {winner ? <td className="strong">{winner}</td> : <td className="muted">Void, bets refunded</td>}
              <td className="r num">{usd(m.pot, { cents: false })}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const short = (x?: string) => (x ? `${x.slice(0, 10)}…${x.slice(-8)}` : '—');

const KIND_TEXT = {
  seeded: 'Seeded: the result comes from a seed fixed only after betting closes.',
  sealed: 'Sealed: something hidden (a role or a hand of cards) was fixed and committed before betting opened.',
  live: 'Live: decided by the models after betting closes, so nothing about it existed while bets were open.',
} as const;

function explain(w: WindowView): string {
  if (w.sealed) return 'Check: sha256("arena-sealed" ‖ secret) is the value the hidden draw came from, and sha256(secret) matches the commitment.';
  return 'Check: sha256(secret) matches the commitment, and seed = sha256(secret ‖ entropy ‖ market).';
}

/** Per window of this match: what kind it is, what was committed, and the reveal after settle. */
function FairPlay({ s }: { s: ChannelState }) {
  const [cfg, setCfg] = useState<Config | null>(FIXTURE ? ({ chain: 'solana', cluster: 'devnet' } as Config) : null);
  useEffect(() => {
    if (!FIXTURE) getConfig().then(setCfg).catch(() => {});
  }, []);
  if (!s.windows.length) return <p className="muted">No prediction open yet in this match.</p>;
  return (
    <div className="fair">
      {s.windows.map((w, k) => {
        const kind = w.sealed ? 'sealed' : w.seeded ? 'seeded' : 'live';
        const link = cfg?.chain === 'solana' ? `https://explorer.solana.com/address/${w.market}?cluster=${cfg.cluster ?? 'devnet'}` : null;
        const done = w.state === 'settled' || w.state === 'void';
        return (
          <section key={w.windowId} className="fair-win">
            <h4 className="fair-h">
              Round {k + 1}: {w.question} <span className="muted">({w.state === 'open' ? 'open' : w.state})</span>
            </h4>
            <p className="about">{KIND_TEXT[kind]}</p>
            <dl className="kv kv-wide">
              {w.commitment && (
                <>
                  <dt>Commitment</dt>
                  <dd>
                    <code>{short(w.commitment)}</code>
                  </dd>
                </>
              )}
              {kind === 'seeded' && (
                <>
                  <dt>Seed</dt>
                  <dd>
                    <code>{w.seed ? short(w.seed) : 'after betting closes'}</code>
                  </dd>
                </>
              )}
              {w.commitment && (
                <>
                  <dt>Secret</dt>
                  <dd>
                    <code>{w.secret ? short(w.secret) : done ? '—' : 'revealed when it settles'}</code>
                  </dd>
                </>
              )}
              <dt>Market</dt>
              <dd>
                <code>{short(w.market)}</code>{' '}
                {link ? (
                  <a className="link" href={link} target="_blank" rel="noreferrer">
                    View on explorer
                  </a>
                ) : (
                  <span className="muted">local test chain</span>
                )}
              </dd>
            </dl>
            {w.secret && w.commitment && <p className="fair-note">{explain(w)}</p>}
          </section>
        );
      })}
    </div>
  );
}
