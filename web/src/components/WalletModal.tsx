// The wallet window, laid out after duel.com's: a title row, a two-part switch (Deposit, Withdraw), then that
// part's fields. Deposit shows the viewer's address as a QR code and text, plus the free top-up. Withdraw sends
// Souls to another address. Viewer copy never names the chain underneath.
import { useEffect, useRef, useState } from 'react';
import { CURRENCY, UNIT, usd } from '../lib/money';
import { looksLikeAddress, useWallet } from '../lib/wallet';
import { Button } from '../ui';
import { sfx } from './nightline';
import './wallet.css';

export type WalletTab = 'deposit' | 'withdraw';
const TABS: { id: WalletTab; name: string }[] = [
  { id: 'deposit', name: 'Deposit' },
  { id: 'withdraw', name: 'Withdraw' },
];

const money = (n: number) => usd(n, { cents: true });
const middle = (a: string) => (a.length > 30 ? `${a.slice(0, 14)}…${a.slice(-14)}` : a);

export function CoinIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="var(--accent)" />
      <path d="M7.2 18.6V11.2a4.8 4.8 0 0 1 9.6 0v7.4l-1.6-1.5-1.6 1.5-1.6-1.5-1.6 1.5-1.6-1.5z" fill="var(--on-accent)" />
      <circle cx="10.2" cy="11.4" r="1" fill="var(--accent)" />
      <circle cx="13.8" cy="11.4" r="1" fill="var(--accent)" />
    </svg>
  );
}

/** The Souls mark on its own, in the text colour: stands where a currency sign would. */
export function SoulMark({ size = 16 }: { size?: number }) {
  return (
    <svg className="soul-mark" width={size} height={size} viewBox="4 4 16 16" aria-hidden>
      <path d="M7.2 18.6V11.2a4.8 4.8 0 0 1 9.6 0v7.4l-1.6-1.5-1.6 1.5-1.6-1.5-1.6 1.5-1.6-1.5z" fill="currentColor" />
      <circle cx="10.2" cy="11.4" r="1" fill="var(--bg)" />
      <circle cx="13.8" cy="11.4" r="1" fill="var(--bg)" />
    </svg>
  );
}

export function WalletIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden fill="currentColor">
      <path d="M4 3.500h10.500A1.500 1.500 0 0 1 16 5v1H5a1 1 0 0 0 0 2h11.500A1.500 1.500 0 0 1 18 9.500V15a2 2 0 0 1-2 2H4.500A2.500 2.500 0 0 1 2 14.500v-9a2 2 0 0 1 2-2Zm10.300 7.300a1.300 1.300 0 1 0 0 2.600 1.300 1.300 0 0 0 0-2.600Z" />
    </svg>
  );
}

function CurrencyField({ balance }: { balance: number | null }) {
  return (
    <>
      <div className="wlt-lab">Currency</div>
      <div className="wlt-field">
        <CoinIcon size={20} />
        <span className="wlt-strong">{CURRENCY}</span>
        <span className="wlt-end num">{balance == null ? '—' : money(balance)}</span>
      </div>
    </>
  );
}

function Deposit() {
  const w = useWallet();
  const [copied, setCopied] = useState(false);
  const [free, setFree] = useState<'idle' | 'busy' | 'added' | 'already' | 'failed'>('idle');
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  useEffect(() => {
    if (free === 'idle' || free === 'busy') return;
    const t = window.setTimeout(() => setFree('idle'), 2200);
    return () => clearTimeout(t);
  }, [free]);
  const copy = () => {
    navigator.clipboard?.writeText(w.owner).then(() => setCopied(true), () => {});
  };
  const getFree = async () => {
    setFree('busy');
    const r = await w.topUp();
    setFree(r);
    if (r === 'added') sfx('confirm');
  };
  return (
    <>
      <CurrencyField balance={w.balance} />
      <div className="wlt-lab">Your address</div>
      <div className="wlt-field">
        <span className="wlt-addr num" title={w.owner} data-testid="wallet-address">{middle(w.owner)}</span>
        <button type="button" className={`wlt-icon wlt-end ${copied ? 'done' : ''}`} onClick={copy} aria-label="Copy your address" title={copied ? 'Copied' : 'Copy'}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            {copied ? <path d="M4 9.500l3.200 3.200L14 5.500" /> : <path d="M6.500 6.500v-3h8v8h-3M3.500 6.500h8v8h-8z" />}
          </svg>
        </button>
        <span className="ink-sr" role="status">{copied ? 'Address copied' : ''}</span>
      </div>
      <Button className="wlt-go" variant="primary" size="lg" block disabled={free === 'busy'} confirmed={free === 'added'} onClick={getFree} data-testid="wallet-free" seed="wlt-free">
        {free === 'added' ? 'Added' : free === 'already' ? 'Already claimed' : free === 'failed' ? 'Try again in a moment' : `Get free ${CURRENCY}`}
      </Button>
    </>
  );
}

function Withdraw() {
  const w = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (state !== 'sent') return;
    const t = window.setTimeout(() => setState('idle'), 2200);
    return () => clearTimeout(t);
  }, [state]);

  const base = Math.round((Number(amount.replace(/[$,\s]/g, '')) || 0) * UNIT);
  const balance = w.balance ?? 0;
  const ready = looksLikeAddress(to) && to.trim() !== w.owner && base > 0 && base <= balance && state === 'idle';
  const hint = to.trim() && !looksLikeAddress(to) ? 'That address doesn’t look right' : to.trim() === w.owner ? 'That’s your own address' : base > balance ? 'Not enough balance' : null;

  const send = async () => {
    if (!ready) return;
    setState('busy');
    setErr(null);
    const failed = await w.send(to, base);
    if (failed) {
      setErr(failed);
      setState('idle');
      return;
    }
    sfx('confirm');
    setTo('');
    setAmount('');
    setState('sent');
  };

  return (
    <form
      className="wlt-form"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <CurrencyField balance={w.balance} />
      <label className="wlt-lab" htmlFor="wlt-to">Send to</label>
      <div className="wlt-field wlt-input">
        <input id="wlt-to" className="num" value={to} onChange={(e) => { setTo(e.target.value); setErr(null); }} placeholder="Address" autoComplete="off" spellCheck={false} data-testid="wallet-to" />
      </div>
      <label className="wlt-lab" htmlFor="wlt-amount">Amount</label>
      <div className="wlt-field wlt-input">
        <SoulMark size={18} />
        <input id="wlt-amount" className="num" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setErr(null); }} placeholder="0.00" inputMode="decimal" autoComplete="off" data-testid="wallet-amount" />
        <button type="button" className="wlt-max wlt-end" onClick={() => setAmount((balance / UNIT).toFixed(2))} disabled={!balance}>
          Max
        </button>
      </div>
      <div className="wlt-err" role="alert">{err ?? hint ?? ''}</div>
      <Button className="wlt-go" type="submit" variant="primary" size="lg" block disabled={!ready && state !== 'sent'} confirmed={state === 'sent'} data-testid="wallet-send" seed="wlt-send">
        {state === 'sent' ? 'Sent' : state === 'busy' ? 'Sending' : base > 0 && base <= balance ? `Withdraw ${money(base)}` : 'Withdraw'}
      </Button>
    </form>
  );
}

/** Opens over the page; Escape, the cross or a click outside closes it. */
export function WalletModal({ tab, onTab, onClose }: { tab: WalletTab | null; onTab: (t: WalletTab) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = tab != null;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.focus(); // the window itself, so no control starts out ringed
    }
    if (!open && d.open) d.close();
  }, [open]);
  const [shown, setShown] = useState<WalletTab>(tab ?? 'deposit');
  useEffect(() => {
    if (tab) setShown(tab);
  }, [tab]);
  const at = TABS.findIndex((t) => t.id === shown);
  return (
    <dialog
      ref={ref}
      className="wlt"
      tabIndex={-1}
      aria-labelledby="wlt-title"
      onClose={onClose}
      onPointerDown={(e) => {
        if (e.target === ref.current) onClose(); // the backdrop
      }}
      data-testid="wallet-modal"
    >
      {open && (
        <div className="wlt-body">
          <div className="wlt-head">
            <WalletIcon size={24} />
            <h2 id="wlt-title" className="wlt-h">Wallet</h2>
            <button type="button" className="wlt-icon wlt-x" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            </button>
          </div>
          <div className="wlt-tabs" role="tablist" aria-label="Wallet">
            <span className="wlt-tab-pill" style={{ transform: `translateX(${at * 100}%)` }} aria-hidden />
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`wlt-tab-${t.id}`} aria-selected={shown === t.id} aria-controls="wlt-panel" className="wlt-tab" onClick={() => onTab(t.id)} data-testid={`wallet-tab-${t.id}`}>
                {t.name}
              </button>
            ))}
          </div>
          <div id="wlt-panel" role="tabpanel" aria-labelledby={`wlt-tab-${shown}`} className="wlt-panel" key={shown}>
            {shown === 'deposit' ? <Deposit /> : <Withdraw />}
          </div>
        </div>
      )}
    </dialog>
  );
}
