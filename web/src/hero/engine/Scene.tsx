// The canvas that draws the hero. Every part's motion is a pure function of the scene time `t`, so the
// loop only keeps a clock: it runs while the canvas is on screen and the tab is visible, and pauses (the
// clock pauses with it) otherwise. With prefers-reduced-motion it draws one finished still frame.
// URL helpers for whoever is drawing a part:
//   ?t=2500      freeze at 2.5 s      ?only=tv,hills   draw only those parts
//   ?perf=1      time each part (ms per frame, averaged) and write it to the canvas's data-perf attribute
// The scene is already displayed when the page loads: there is no entrance. Parts always get reveal 1.
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
  const backRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const back = backRef.current;
    if (!cv || !back) return;
    const ctx = cv.getContext('2d');
    const bctx = back.getContext('2d');
    if (!ctx || !bctx) return;
    const q = new URLSearchParams(location.search);
    const frozen = q.has('t') ? Number(q.get('t')) / 1000 : null;
    const only = q.get('only')?.split(',') ?? null;
    const noIntro = true; // Ian: the scene is already displayed; no draw-on entrance, no fade-in
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const list = [...parts].filter((p) => !only || only.includes(p.id)).sort((a, b) => a.z - b.z);
    const pen = makePen(ctx);
    // parts with a `still` layer (the paper and the still sky) are painted once into the canvas underneath;
    // the live canvas on top is transparent where nothing is drawn, so the sheet is never redrawn per frame
    const stills = list.filter((p) => p.still);
    const backPen = makePen(bctx);

    let raf = 0;
    let backDone = false;
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
      if (back.width !== pw || back.height !== ph || !backDone) {
        back.width = pw;
        back.height = ph;
        bctx.setTransform(pw / W, 0, 0, pw / W, 0, 0);
        bctx.fillStyle = PAPER;
        bctx.fillRect(0, 0, W, H);
        for (const p of stills) {
          bctx.save();
          p.still!(backPen);
          bctx.restore();
        }
        backDone = true;
      }
      const t = sceneTime();
      ctx.setTransform(pw / W, 0, 0, pw / W, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const p of list) {
        ctx.save();
        p.draw(pen, { t, reveal: 1, alive: true });
        ctx.restore();
      }
    };

    if (q.has('perf')) {
      draw(); // build the caches first
      draw();
      ctx.getImageData(0, 0, 1, 1); // and flush that work, so it is not charged to the first part timed
      const out: string[] = [];
      let sum = 0;
      for (const p of list) {
        const N = 160; // enough frames that the one read-back that ends each part's run is a small share
        const t0 = performance.now();
        for (let i = 0; i < N; i++) {
          ctx.save();
          p.draw(pen, { t: 9 + i * 0.37, reveal: 1, alive: true });
          ctx.restore();
        }
        ctx.getImageData(0, 0, 1, 1); // flush
        const ms = (performance.now() - t0) / N;
        sum += ms;
        out.push(`${p.id}=${ms.toFixed(2)}`);
      }
      back.dataset.perf = cv.dataset.perf = `${out.join(' ')} total=${sum.toFixed(2)}`;
    }

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
  const fill: React.CSSProperties = { position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' };
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, background: PAPER }}>
      <canvas ref={backRef} style={fill} />
      <canvas ref={ref} style={{ ...fill, fontFamily: HAND_FONT }} />
    </div>
  );
}
