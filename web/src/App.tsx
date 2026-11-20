import { useEffect } from 'react';
import { Header } from './components/Header';
import { Rail, closeNav, useNavOpen, useRailOpen } from './components/Rail';
import { ChannelPage } from './pages/Channel';
import { Home } from './pages/Home';
import { Lab } from './pages/Lab';
import { HomeTopPrototype } from './prototypes/home-top';
import { UiDemo } from './ui/Demo';
import { FxDefs } from './components/FxDefs';
import './components/nightline';
import { usePath } from './lib/router';
import { wallet } from './lib/wallet';

export function App() {
  const path = usePath();
  useEffect(() => wallet.start(), []);
  const m = path.match(/^\/c\/([^/]+)/);
  const railOpen = useRailOpen(true);
  const navOpen = useNavOpen();
  useEffect(closeNav, [path]); // the phone menu closes when a channel is picked
  if (path === '/lab' && import.meta.env.DEV) return <Lab />;
  if (path === '/prototypes/home-top' && import.meta.env.DEV) return <HomeTopPrototype />;
  if (path === '/ui' && import.meta.env.DEV) return <UiDemo />;
  return (
    <div className={`ink-ui app ${m ? 'app-channel' : 'app-home'} ${railOpen ? 'rail-open' : 'rail-closed'}${navOpen ? ' nav-open' : ''}`}>
      <FxDefs />
      <Header />
      <div className="app-body">
        <Rail home={!m} />
        <div className="nav-backdrop" onClick={closeNav} aria-hidden />
        <main className="app-main">{m ? <ChannelPage id={decodeURIComponent(m[1]!)} /> : <Home />}</main>
      </div>
    </div>
  );
}
