import { theme } from '../themes';
import { HeaderWallet } from './Balance';
import { Link } from './bits';

const Wordmark = theme.Wordmark;

export function Header() {
  return (
    <header className="hdr">
      <Link to="/" className="hdr-home" title="Ghostbet">
        <Wordmark />
      </Link>
      <div className="hdr-right">
        <HeaderWallet />
      </div>
    </header>
  );
}
