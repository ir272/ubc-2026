// Prototype page for the hero drawn and animated entirely in JavaScript (/prototypes/hero-js, dev only).
// The scene runs full width at the top; a headline slot sits centred over the empty sky. The slogan is not
// decided yet, so the slot shows two pale placeholder bars.
import { useEffect, useState } from 'react';
import { H, PAPER, SKY, W } from './engine/layout';
import { Scene } from './engine/Scene';
import type { Part } from './engine/types';
import { WORLD_PARTS } from './parts/world/registry';

const cx = ((SKY.x0 + SKY.x1) / 2 / W) * 100; // headline centre, % of the scene width
const cy = ((SKY.y0 + SKY.y1) / 2 / H) * 100; // and of its height
const slotW = ((SKY.x1 - SKY.x0) / W) * 100 * 0.62;

const bar = (w: string, h: string): React.CSSProperties => ({
  width: w,
  height: h,
  borderRadius: 999,
  background: 'rgba(242, 239, 230, 0.1)',
});

export function HeroJsPrototype() {
  // The whole cast is loaded together and shown at once (no part pops in later). If one part's module is
  // broken mid-edit, the world parts (paper, sky, land, sign) are shown instead of a blank page.
  const [parts, setParts] = useState<readonly Part[] | null>(null);
  useEffect(() => {
    document.title = 'Prototype: hero drawn in code';
    let live = true;
    import('./parts').then(
      (m) => live && setParts(m.PARTS),
      (e) => {
        console.warn('hero-js: a part failed to load, showing the world only', e);
        if (live) setParts(WORLD_PARTS);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <div style={{ minHeight: '100dvh', background: PAPER }}>
      <section style={{ position: 'relative' }}>
        {parts ? <Scene parts={parts} /> : <div style={{ width: '100%', aspectRatio: `${W} / ${H}` }} />}
        <div
          aria-label="Headline placeholder"
          style={{
            position: 'absolute',
            left: `${cx}%`,
            top: `${cy}%`,
            width: `${slotW}%`,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(8px, 1.1vw, 18px)',
            pointerEvents: 'none',
          }}
        >
          <div style={bar('100%', 'clamp(14px, 2.4vw, 40px)')} />
          <div style={bar('64%', 'clamp(14px, 2.4vw, 40px)')} />
        </div>
      </section>
    </div>
  );
}
