// Top-right of the header: the balance pill with its dropdown, the Wallet button with the wallet
// panel, and the profile tile. Everything shown is real: there is one currency (play dollars), one
// silent wallet in this browser, and no sign-in.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getConfig, type Config } from '../lib/api';
import { usd } from '../lib/money';
import { useWallet } from '../lib/wallet';
import { useCountUp } from './bits';
import { Button, Roll } from '../ui';

type Menu = 'balance' | 'wallet' | 'profile';

/** One open menu at a time; closes on a click outside, on Escape, and when another opens. */
function useMenu() {
  const [open, setOpen] = useState<Menu | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, ref, toggle: (m: Menu) => setOpen((o) => (o === m ? null : m)), show: (m: Menu) => setOpen(m), close: () => setOpen(null) };
}

function CoinIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="var(--accent)" />
      <path d="M12 5.6v12.8M15.3 8.9c-.5-1.1-1.7-1.7-3.3-1.7-1.9 0-3.2.9-3.2 2.4 0 3.3 6.7 1.5 6.7 4.9 0 1.500-1.400 2.400-3.400 2.400-1.800 0-3.100-.700-3.600-2" fill="none" stroke="var(--on-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={up ? 'M3.5 10L8 5.5l4.5 4.5' : 'M3.5 6L8 10.5 12.5 6'} />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="currentColor">
      <path d="M4 3.5h10.5A1.5 1.5 0 0 1 16 5v1H5a1 1 0 0 0 0 2h11.5A1.5 1.5 0 0 1 18 9.5V15a2 2 0 0 1-2 2H4.5A2.5 2.5 0 0 1 2 14.5v-9a2 2 0 0 1 2-2Zm10.3 7.3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" />
    </svg>
  );
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 2);
  return s.toUpperCase();
};
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

function Row({ icon, label, sub, value }: { icon?: ReactNode; label: string; sub?: string; value: string }) {
  return (
    <div className="menu-row">
      {icon}
      <span className="menu-label">
        {label} {sub && <span className="menu-sub">{sub}</span>}
      </span>
      <span className="menu-val num">{value}</span>
    </div>
  );
}

export function HeaderWallet() {
  const w = useWallet();
  const menu = useMenu();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(w.name);
  useEffect(() => {
    getConfig().then(setCfg, () => {});
  }, []);
  useEffect(() => setName(w.name), [w.name]);

  const target = w.balance;
  // Money sitting in bets that have not been decided yet.
  let staked = 0;
  for (const t of w.tickets.values()) if (t.payout === undefined) staked += t.amounts.reduce((a, b) => a + b, 0) + (t.pending?.amount ?? 0);
  const money = (n: number) => usd(n, { cents: true });
  const solana = cfg?.chain === 'solana';
  const explorer = solana ? `https://explorer.solana.com/address/${w.owner}?cluster=${cfg?.cluster ?? 'devnet'}` : null;
  const copy = () => {
    void navigator.clipboard?.writeText(w.owner).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const saveName = () => {
    const n = name.trim();
    if (n && n !== w.name) w.setName(n);
    else setName(w.name);
  };

  return (
    <div className="hw" ref={menu.ref}>
      <Button className="hw-bal" onClick={() => menu.toggle('balance')} aria-expanded={menu.open === 'balance'} aria-haspopup="true" data-testid="balance" data-value={target ?? ''} seed="hw-bal">
        <CoinIcon />
        {target == null ? <span className="num">—</span> : <Roll value={money(target)} />}
        <Chevron up={menu.open === 'balance'} />
      </Button>
      <Button className="hw-wallet" onClick={() => menu.toggle('wallet')} aria-expanded={menu.open === 'wallet'} aria-haspopup="true" seed="hw-wallet">
        <WalletIcon /> <span>Wallet</span>
      </Button>
      <Button className="hw-me" onClick={() => menu.toggle('profile')} aria-expanded={menu.open === 'profile'} aria-haspopup="true" aria-label={`Profile: ${w.name}`} seed="hw-me">
        <span className="hw-initials">{initials(w.name)}</span>
      </Button>

      {menu.open === 'balance' && (
        <div className="menu" role="menu">
          <div className="menu-top">
            <span className="menu-cap">In open bets</span>
            <span className="menu-big num">{money(staked)}</span>
          </div>
          <Row icon={<CoinIcon size={28} />} label="Play dollars" sub="PLAY" value={target == null ? '—' : money(target)} />
          <button type="button" className="menu-foot" onClick={() => menu.show('wallet')}>
            <WalletIcon /> Wallet details
          </button>
        </div>
      )}

      {menu.open === 'wallet' && (
        <div className="menu" role="dialog" aria-label="Wallet">
          <div className="menu-top">
            <span className="menu-cap">Your wallet</span>
            <span className="menu-addr num" title={w.owner}>
              {short(w.owner)}
            </span>
          </div>
          <Row label="Balance" value={target == null ? '—' : money(target)} />
          <Row label="In open bets" value={money(staked)} />
          <p className="menu-note">Play money only. This wallet lives in your browser, with no sign-in, and fees are paid for you.</p>
          <div className="menu-actions">
            <button type="button" className="btn" onClick={copy}>
              {copied ? 'Copied' : 'Copy address'}
            </button>
            {explorer && (
              <a className="btn" href={explorer} target="_blank" rel="noreferrer">
                View activity
              </a>
            )}
          </div>
        </div>
      )}

      {menu.open === 'profile' && (
        <div className="menu" role="dialog" aria-label="Profile">
          <div className="menu-top">
            <span className="menu-cap">Name in chat</span>
          </div>
          <form
            className="menu-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
              menu.close();
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-label="Name in chat" />
            <button type="submit" className="btn">
              Save
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
