import { theme } from '../themes';
import { HeaderWallet } from './Balance';
import { Link } from './bits';
import { toggleNav, useNavOpen } from './Rail';

const Wordmark = theme.Wordmark;

export function Header() {
  return (
    <header className="hdr">
      <MenuButton />
      <Link to="/" className="hdr-home" title="Ghostbet">
        <Wordmark />
      </Link>
      <div className="hdr-right">
        <HeaderWallet />
      </div>
    </header>
  );
}

/** Phones only (hidden by CSS on wider screens): opens the channel list over the page. */
function MenuButton() {
  const open = useNavOpen();
  return (
    <button type="button" className="hdr-menu" onClick={toggleNav} aria-expanded={open} aria-label={open ? 'Close the menu' : 'Open the menu'}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {open ? <path d="M5 5l12 12M17 5L5 17" /> : <path d="M3 6h16M3 11h16M3 16h16" />}
      </svg>
    </button>
  );
}
