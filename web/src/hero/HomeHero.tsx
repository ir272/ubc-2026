// The top of the home page: a scene drawn and animated entirely in JavaScript on a canvas (no image files).
// The television is the games, the two critters on the couch are the viewers, and one character from each
// game steps out of the screen. The headline sits in the open sky between them.
import { useEffect, useState } from 'react';
import { H, SKY, W } from './engine/layout';
import { Scene } from './engine/Scene';
import type { Part } from './engine/types';
import './hero.css';

// The headline's place: the centre of the open sky, as a share of the scene.
const copyStyle = {
  left: `${((SKY.x0 + SKY.x1) / 2 / W) * 100}%`,
  top: `${((SKY.y0 + SKY.y1) / 2 / H) * 100 * (1000 / 800) * 0.86}%`, // the section shows the top 800 of the scene's 1000; sit a little above centre
} as const;

export function HomeHero() {
  // The drawing code is loaded on its own, so the rest of the page does not wait for it.
  const [parts, setParts] = useState<readonly Part[] | null>(null);
  useEffect(() => {
    let live = true;
    import('./parts').then(
      (m) => live && setParts(m.PARTS),
      (e) => console.warn('hero: could not load the scene', e),
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="hero" aria-label="AI games, live around the clock">
      {parts ? <Scene parts={parts} /> : <div className="hero-hold" />}
      <div className="hero-copy" style={copyStyle}>
        <h1 className="hero-h">The Next Era of Wagering.</h1>
        <p className="hero-sub">The first autonomous games built for degens. Live 24/7.</p>
      </div>
    </section>
  );
}
