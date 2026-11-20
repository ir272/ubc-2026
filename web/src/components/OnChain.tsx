// "On chain": every step of this match's rounds as the Solana transaction that did it, each linking to
// Solana Explorer. The runner sends these only when it runs on Solana (see devnet-ledger.md in the shared notes);
// in practice mode there are none, and the card says so instead of inventing any.
import { useEffect, useState } from 'react';
import { getConfig, type Config, type WindowTx, type WindowView } from '../lib/api';
import type { ChannelState } from '../lib/feed';
import { usd } from '../lib/money';
import { useWallet } from '../lib/wallet';
import { Pill } from '../ui';
import './on-chain.css';

const q = (cluster?: string) =>
  !cluster || cluster === 'mainnet-beta' ? ''
    : cluster === 'localnet' || cluster === 'localhost' ? `?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:8899')}`
      : cluster.startsWith('http') ? `?cluster=custom&customUrl=${encodeURIComponent(cluster)}`
        : `?cluster=${cluster}`;
const txUrl = (sig: string, cluster?: string) => `https://explorer.solana.com/tx/${sig}${q(cluster)}`;
const addressUrl = (addr: string, cluster?: string) => `https://explorer.solana.com/address/${addr}${q(cluster)}`;
const short = (x: string, a = 4, b = 4) => `${x.slice(0, a)}…${x.slice(-b)}`;
const time = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour12: false });

const STEP: Record<WindowTx['kind'], string> = {
  open: 'Round opened', bet: 'Bet', lock: 'Betting closed', settle: 'Result', void: 'Round called off', payout: 'Paid out',
};
const MAX_BETS = 6;

// Dev only (?ledger=sample): the five real, finalized devnet transactions from the runner's test run on 2026-11-20,
// so the card can be looked at while the runner is in practice mode. Nothing here is made up.
const SAMPLE: WindowTx[] = [
  { kind: 'open', signature: '5hMeDkhwAaiaitiH3YhTePpoZxLDZKnvGLb445vA6BkkNu2b5EhhHkxY6Rizfu81MFLUucxSiDpLSYa8ADF1jx3G', at: 1795161731390 },
  { kind: 'bet', signature: 'kxUAhDEnPofUSZkhharAF1i9MgNx1LArVE1HHwkfqrAmpQVodj5DS9sVSC2ZK6exoqr7oqpnpp7QFonYeTxkEEX', at: 1795161747992, who: 'CuAPB7gWkjBejVvpFstXinCtQsqRKmhUK1T48rCZ1dg8', amount: 17000000, outcomeId: 'tie', bot: true },
  { kind: 'lock', signature: '5ckhZUU1eVdrpBr5SQ74othTULFTTRHYCFeNTBjbTNysUMu5P9WzmE2tCwh3XY4F7eUk1ZFqEBqcLEHYTUVtkMvB', at: 1795161752131 },
  { kind: 'settle', signature: '5Bxm9kcgQoMraf3LTm1eDe8yp63AFncnoYbLoxjMxAw26MCaBL4tKWF8txEms4WgMHsBnxo34VK8cjDo6CSc8hFN', at: 1795161757082, outcomeId: 'shooter' },
  { kind: 'payout', signature: '5XxaUzZbsZo7cdX538m6Dwhv6KY7kfTLWqNDdPDAFrgCrknd2M5VqRBgAneooF3X9KK6Nua3iLkzcyXmPWDRvTym', at: 1795161758052, who: 'CuAPB7gWkjBejVvpFstXinCtQsqRKmhUK1T48rCZ1dg8', amount: 17000000, bot: true },
];
const SAMPLE_ON = import.meta.env.DEV && new URLSearchParams(location.search).get('ledger') === 'sample';
const SAMPLE_CFG = { chain: 'solana', cluster: 'devnet', programId: 'GGQeGU8BTtRDmHPoC25Py185wEuUeDz3phXWG4Gp6z2P' } as Config;
const SAMPLE_MARKET = '2hTyeL14vwmBCf9FgrpE17yM6LAJieYhqfr3mhZQ4qqf';

export function OnChain({ s }: { s: ChannelState }) {
  const wallet = useWallet();
  const [cfg, setCfg] = useState<Config | null>(SAMPLE_ON ? SAMPLE_CFG : null);
  useEffect(() => {
    if (!SAMPLE_ON) getConfig().then(setCfg).catch(() => {});
  }, []);

  if (!cfg) return <p className="oc-note">Checking the network.</p>;
  if (cfg.chain !== 'solana') {
    return <p className="oc-note">Practice mode: bets are held by the match runner and are not on Solana right now.</p>;
  }

  const who = (owner?: string) => {
    if (!owner) return '';
    if (owner === wallet.owner) return 'You';
    return s.bots.find((b) => b.owner === owner)?.name ?? short(owner);
  };
  const label = (w: WindowView, id?: string) => w.outcomes.find((o) => o.id === id)?.label ?? '';
  const detail = (w: WindowView, t: WindowTx): string => {
    switch (t.kind) {
      case 'open': return w.commitment ? `Outcome sealed before any bet, commitment ${short(w.commitment, 6, 6)}` : 'Betting opened';
      case 'bet': return `${who(t.who)} put ${usd(t.amount ?? 0)}${label(w, t.outcomeId) ? ` on ${label(w, t.outcomeId)}` : ''}`;
      case 'lock': return 'No more bets; the pot is fixed';
      case 'settle': return `${label(w, t.outcomeId) ? `${label(w, t.outcomeId)} won` : 'Winner set'}${w.secret ? ', secret revealed' : ''}`;
      case 'void': return 'Every bet is refunded';
      case 'payout': return `${usd(t.amount ?? 0)} to ${who(t.who)}`;
    }
  };

  const windows = [...s.windows].reverse().map((w) => (SAMPLE_ON ? { ...w, market: SAMPLE_MARKET, txs: SAMPLE } : w));
  return (
    <div className="oc">
      <div className="oc-top">
        <Pill tone="gold" seed="oc-net">{`Solana ${cfg.cluster ?? 'devnet'}`}</Pill>
        {cfg.programId && <a className="oc-link" href={addressUrl(cfg.programId, cfg.cluster)} target="_blank" rel="noreferrer">Program {short(cfg.programId)}</a>}
      </div>
      {!windows.length && <p className="oc-note">The next round’s transactions will appear here as they happen.</p>}
      {windows.map((w) => {
        const txs = w.txs ?? [];
        const bets = txs.filter((t) => t.kind === 'bet');
        const hidden = Math.max(0, bets.length - MAX_BETS);
        const drop = new Set(bets.slice(0, hidden));
        const rows = txs.filter((t) => !drop.has(t));
        return (
          <section key={w.windowId} className="oc-round">
            <div className="oc-round-h">
              <h3>{w.question}</h3>
              <a className="oc-link" href={addressUrl(w.market, cfg.cluster)} target="_blank" rel="noreferrer">Round account {short(w.market)}</a>
            </div>
            {rows.length ? (
              <table className="oc-table">
                <thead>
                  <tr><th>Step</th><th>What happened</th><th>Time</th><th>Transaction</th></tr>
                </thead>
                <tbody>
                  {rows.map((t, i) => (
                    <tr key={`${t.signature}:${i}`} className={`oc-${t.kind}`}>
                      <td className="oc-step">{STEP[t.kind]}</td>
                      <td>{detail(w, t)}</td>
                      <td className="num oc-dim">{time(t.at)}</td>
                      <td><a className="oc-link num" href={txUrl(t.signature, cfg.cluster)} target="_blank" rel="noreferrer" aria-label={`View the ${STEP[t.kind].toLowerCase()} transaction on Solana Explorer`}>{short(t.signature, 6, 4)}</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="oc-note">Waiting for this round’s first transaction.</p>
            )}
            {hidden > 0 && <p className="oc-note">{hidden} earlier {hidden === 1 ? 'bet is' : 'bets are'} on the round account.</p>}
          </section>
        );
      })}
    </div>
  );
}
