// Top-right of the header: the balance pill with its dropdown, the Wallet button that opens the wallet
// window (WalletModal.tsx), and the profile tile. Everything shown is real: there is one currency (play dollars), one
// silent wallet in this browser, and no sign-in.
import { useEffect, useRef, useState } from 'react';
import { CURRENCY, usd } from '../lib/money';
import { useWallet } from '../lib/wallet';
import { useCountUp } from './bits';
import { Button, Roll } from '../ui';
import { CoinIcon, WalletIcon, WalletModal, type WalletTab } from './WalletModal';

type Menu = 'balance' | 'profile';

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

function Chevron({ up }: { up: boolean }) {
  return (
    <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={up ? 'M3.5 10L8 5.5l4.5 4.5' : 'M3.5 6L8 10.5 12.5 6'} />
    </svg>
  );
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 2);
  return s.toUpperCase();
};
export function HeaderWallet() {
  const w = useWallet();
  const menu = useMenu();
  const [wallet, setWallet] = useState<WalletTab | null>(null);
  const [name, setName] = useState(w.name);
  useEffect(() => setName(w.name), [w.name]);

  const target = w.balance;
  // Money sitting in bets that have not been decided yet.
  let staked = 0;
  for (const t of w.tickets.values()) if (t.payout === undefined) staked += t.amounts.reduce((a, b) => a + b, 0) + (t.pending?.amount ?? 0);
  const money = (n: number) => usd(n, { cents: true });
  const openWallet = () => {
    menu.close();
    setWallet('deposit');
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
      <Button className="hw-wallet" onClick={openWallet} aria-haspopup="dialog" data-testid="wallet-open" seed="hw-wallet">
        <WalletIcon /> <span>Wallet</span>
      </Button>
      <Button className="hw-me" onClick={() => menu.toggle('profile')} aria-expanded={menu.open === 'profile'} aria-haspopup="true" aria-label={`Profile: ${w.name}`} seed="hw-me">
        <span className="hw-initials">{initials(w.name)}</span>
      </Button>

      {menu.open === 'balance' && (
        <div className="bm" role="menu" data-testid="balance-menu">
          <div className="bm-top">
            <span className="bm-cap">In open bets</span>
            <span className="bm-big num">{money(staked)}</span>
          </div>
          <div className="bm-row">
            <CoinIcon size={20} />
            <span className="bm-name">{CURRENCY}</span>
            <span className="bm-val num">{target == null ? '—' : money(target)}</span>
          </div>
          <button type="button" className="bm-foot" role="menuitem" onClick={openWallet}>
            <WalletIcon /> Wallet
          </button>
        </div>
      )}

      <WalletModal tab={wallet} onTab={setWallet} onClose={() => setWallet(null)} />

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
