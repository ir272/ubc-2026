// Prototype page for the hero drawn and animated entirely in JavaScript (/prototypes/hero-js, dev only).
// The scene runs full width at the top; a headline slot sits centred over the empty sky. The slogan is not
// decided yet, so the slot shows two pale placeholder bars.
import { useEffect } from 'react';
import { H, PAPER, SKY, W } from './engine/layout';
import { Scene } from './engine/Scene';
import { PARTS } from './parts';

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
  useEffect(() => {
    document.title = 'Prototype: hero drawn in code';
  }, []);
  return (
    <div style={{ minHeight: '100dvh', background: PAPER }}>
      <section style={{ position: 'relative' }}>
        <Scene parts={PARTS} />
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
