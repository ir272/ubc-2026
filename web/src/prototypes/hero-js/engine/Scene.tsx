// The canvas that draws the hero. Every part's motion is a pure function of the scene time `t`, so the
// loop only keeps a clock: it runs while the canvas is on screen and the tab is visible, and pauses (the
// clock pauses with it) otherwise. With prefers-reduced-motion it draws one finished still frame.
// URL helpers for whoever is drawing a part:
//   ?t=2500      freeze at 2.5 s      ?only=tv,hills   draw only those parts      ?intro=1   play the old draw-on entrance (off by default)
import { useEffect, useRef } from 'react';
import { H, INTRO_END, PAPER, W } from './layout';
import { makePen } from './pen';
import type { Part } from './types';

/** the scene time shown as the still frame for reduced motion: well after the entrance, a calm moment */
const STILL_T = INTRO_END + 4.2;

/** a hand-lettered face for pen.text (system fonts only, no downloads) */
const HAND_FONT = '"Bradley Hand", "Segoe Print", "Comic Neue", "Marker Felt", cursive';

export function Scene({ parts }: { parts: readonly Part[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const q = new URLSearchParams(location.search);
    const frozen = q.has('t') ? Number(q.get('t')) / 1000 : null;
    const only = q.get('only')?.split(',') ?? null;
    const noIntro = !q.has('intro'); // Ian: the scene is already displayed; no draw-on entrance (add ?intro=1 to see it)
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const list = [...parts].filter((p) => !only || only.includes(p.id)).sort((a, b) => a.z - b.z);
    const pen = makePen(ctx);

    let raf = 0;
    let onScreen = true;
    let clock = 0; // seconds of scene time accumulated while running
    let last = -1; // performance.now() of the previous running frame, -1 when paused

    const sceneTime = () => {
      if (frozen != null) return frozen + (noIntro ? INTRO_END + 1 : 0);
      if (motionQuery.matches) return STILL_T;
      return clock + (noIntro ? INTRO_END + 1 : 0);
    };

    const draw = () => {
      const cw = cv.clientWidth;
      if (cw <= 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(cw * dpr);
      const ph = Math.round((cw * dpr * H) / W);
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
      }
      const t = sceneTime();
      ctx.setTransform(pw / W, 0, 0, pw / W, 0, 0);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      for (const p of list) {
        const [a, b] = p.intro;
        const reveal = Math.max(0, Math.min(1, (t - a) / Math.max(0.001, b - a)));
        ctx.save();
        p.draw(pen, { t, reveal, alive: t >= INTRO_END });
        ctx.restore();
      }
    };

    const animates = () => frozen == null && !motionQuery.matches && onScreen && document.visibilityState === 'visible';

    const tick = (now: number) => {
      raf = 0;
      if (!animates()) {
        last = -1;
        return;
      }
      if (last >= 0) clock += Math.min(0.1, (now - last) / 1000); // a long stall never skips the scene ahead
      last = now;
      draw();
      raf = requestAnimationFrame(tick);
    };

    // start or stop the loop after anything that can change whether we animate; always repaint once
    const update = () => {
      if (animates()) {
        if (!raf) {
          last = -1;
          raf = requestAnimationFrame(tick);
        }
      } else {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        last = -1;
        draw();
      }
    };

    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      update();
    });
    io.observe(cv);
    const ro = new ResizeObserver(() => {
      if (!raf) draw(); // a running loop picks the new size up on its next frame
    });
    ro.observe(cv);
    document.addEventListener('visibilitychange', update);
    motionQuery.addEventListener('change', update);
    draw();
    update();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', update);
      motionQuery.removeEventListener('change', update);
    };
  }, [parts]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ display: 'block', width: '100%', aspectRatio: `${W} / ${H}`, fontFamily: HAND_FONT }}
    />
  );
}
