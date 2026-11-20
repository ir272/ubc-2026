// Prototype page for the home page hero (/prototypes/hero, dev only). Nothing in the product imports
// from here. The real header and rail around a main column: the hero on top, and one row of stand-in
// cards lapping over its bottom edge, to judge the hero in the place it will live.
//
//   ?still=1    freeze on one representative frame (for screenshots)
//   ?t=<ms>     freeze the loops at that time instead
import { useEffect } from 'react';
import { FxDefs } from '../../components/FxDefs';
import { Header } from '../../components/Header';
import { Rail, useRailOpen } from '../../components/Rail';
import { Hero } from './Hero';
import './page.css';

export function HeroPrototype() {
  const railOpen = useRailOpen(true);
  useEffect(() => {
    document.title = 'Prototype: hero';
  }, []);
  return (
    <div className={`ink-ui app app-home ${railOpen ? 'rail-open' : 'rail-closed'} hero-proto`}>
      <FxDefs />
      <Header />
      <div className="app-body">
        <Rail home />
        <main className="app-main">
          <div className="hero-proto-main">
            <Hero>
              {/* the slogan is not decided: placeholder bars, not words */}
              <div className="hero-proto-slogan" aria-hidden="true">
                <span />
                <span />
              </div>
            </Hero>
            <div className="hero-proto-cards">
              {[0, 1, 2, 3].map((i) => <div className="hero-proto-card" key={i} />)}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
