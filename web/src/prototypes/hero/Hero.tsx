// The home page hero: one wide drawing, with a few parts of it drawn over the top in code so they
// can move. Back to front: the drawing (the "plate"), the TV's glow, stars, the tree, walkers, the sign.
//
// Motion is all transform and opacity, as Web Animations described in motion.ts. This file owns
// when they run: once after the entrance, never off screen or in a hidden tab, and not at all under
// reduced motion or `?still=1` (both show one fixed frame; `?t=<ms>` shows any other).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { InkStroke, InkSvg, useBox } from '../../ui/ink/Ink';
import { PEN, plate, rule, ruledBox, star4 } from '../../ui/ink/shapes';
import { HERO } from './asset';
import { EASE_OUT, EASE_WIPE, ENTER_MS, STILL_MS, WALKERS, fitStage, heroLoops, startLoops, type Stage } from './motion';
import { Walker, walkerHeight } from './Walker';
import './hero.css';

const pct = (v: number) => `${v * 100}%`;

/** `?t=<ms>` freezes the loops at that time, `?still=1` at the representative frame. */
function urlFreeze(): number | null {
  const q = new URLSearchParams(location.search);
  const t = q.get('t');
  if (t !== null && t !== '' && Number.isFinite(Number(t))) return Math.max(0, Number(t));
  return q.get('still') === '1' ? STILL_MS : null;
}

function useReducedMotion(): boolean {
  const [on, setOn] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return on;
}

/** True while the element is on screen and the tab is in front. */
function useOnScreen(ref: { current: HTMLElement | null }): boolean {
  const [inView, setInView] = useState(true);
  const [shown, setShown] = useState(() => !document.hidden);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => setInView(es[es.length - 1]!.isIntersecting));
    io.observe(el);
    const f = () => setShown(!document.hidden);
    document.addEventListener('visibilitychange', f);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', f);
    };
  }, [ref]);
  return inView && shown;
}

function Star({ i, stageH }: { i: number; stageH: number }) {
  const s = HERO.stars[i]!;
  const r = Math.max(2.5, s.r * stageH);
  const d = useMemo(() => star4(r, r, r, `hero-star-${i}`), [r, i]);
  return (
    <span className="hero-star" data-m={`star-${i}`} style={{ left: pct(s.x), top: pct(s.y), width: 2 * r, height: 2 * r, marginLeft: -r, marginTop: -r }}>
      <InkSvg box={{ w: 2 * r, h: 2 * r }} pad={3}>
        <path d={d} fill="currentColor" />
      </InkSvg>
    </span>
  );
}

/** The signboard: a post planted on the ridge, a board whose size follows its words. */
function Sign({ stageH }: { stageH: number }) {
  const [board, box] = useBox<HTMLDivElement>();
  const post = HERO.signPost * stageH;
  const postW = Math.max(4, stageH * 0.012);
  // the drawing's own line is about this heavy at this size
  const pen = { ...PEN.rule, w: Math.min(2.6, Math.max(1.2, stageH * 0.0042)) };
  const ink = useMemo(() => {
    if (!box.w || !box.h) return null;
    return { fill: plate(0, 0, box.w, box.h, 'hero-sign'), rules: ruledBox(0, 0, box.w, box.h, 'hero-sign', pen, Math.max(3, stageH * 0.009)) };
  }, [box.w, box.h, pen.w, stageH]);
  const legs = useMemo(() => {
    const h = post + 6; // runs up behind the board
    return [
      rule(0, 0, 0.4, h, 'hero-post-l', pen),
      rule(postW, 0, postW - 0.3, h - 1, 'hero-post-r', pen),
      // two blades of grass where it goes into the ground
      rule(-postW * 0.9, h, -postW * 1.5, h - postW * 0.9, 'hero-post-g1', { ...pen, w: pen.w * 0.8 }),
      rule(postW * 1.8, h + 1, postW * 2.5, h - postW * 0.7, 'hero-post-g2', { ...pen, w: pen.w * 0.8 }),
    ];
  }, [post, postW, pen.w]);
  return (
    <div className="hero-sign" data-m="sign" style={{ left: pct(HERO.sign.x), top: pct(HERO.sign.y), fontSize: Math.max(10, HERO.signType * stageH) }}>
      <div className="hero-sign-post" style={{ width: postW, height: post + 6, left: -postW / 2, top: -(post + 6) }}>
        <InkSvg box={{ w: postW, h: post + 6 }} pad={12}>
          {legs.map((s, i) => <InkStroke key={i} s={s} />)}
        </InkSvg>
      </div>
      <div className="hero-sign-board" ref={board} style={{ bottom: post }}>
        {ink && (
          <InkSvg box={box} pad={10}>
            <path className="hero-sign-fill" d={ink.fill} />
            {ink.rules.map((s, i) => <InkStroke key={i} s={s} />)}
          </InkSvg>
        )}
        <span className="hero-sign-word">Welcome</span>
      </div>
    </div>
  );
}

function Layers({ stage }: { stage: Stage }) {
  const tv = HERO.tvScreen;
  const tree = HERO.tree;
  const [px, py] = HERO.treeTrunkBase;
  return (
    <div className="hero-stage" aria-hidden="true" style={{ left: stage.x, top: stage.y, width: stage.w, height: stage.h }}>
      <div className="hero-halo" data-m="halo" style={{ left: pct(tv.x - tv.w * 0.3), top: pct(tv.y - tv.h * 0.3), width: pct(tv.w * 1.6), height: pct(tv.h * 1.6) }} />
      <div className="hero-screen" data-m="screen" style={{ left: pct(tv.x), top: pct(tv.y), width: pct(tv.w), height: pct(tv.h) }} />
      {HERO.stars.map((_, i) => <Star key={i} i={i} stageH={stage.h} />)}
      <img
        className="hero-tree"
        data-m="tree"
        src={tree.src}
        alt=""
        draggable={false}
        decoding="async"
        style={{ left: pct(tree.x), top: pct(tree.y), width: pct(tree.w), height: pct(tree.h), transformOrigin: `${pct((px - tree.x) / tree.w)} ${pct((py - tree.y) / tree.h)}` }}
      />
      {WALKERS.map(({ kind }) => (
        <div className="hero-walker" data-m={`walk-${kind}`} key={kind}>
          <div className="hero-walker-part" data-m={`bob-${kind}`}>
            <div className="hero-walker-part" data-m={`rock-${kind}`}>
              <Walker kind={kind} height={walkerHeight(kind, stage.h)} />
            </div>
          </div>
        </div>
      ))}
      <Sign stageH={stage.h} />
    </div>
  );
}

type Phase = 'wait' | 'enter' | 'run';

export function Hero({ children }: { children?: ReactNode }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const stage = useMemo(() => (box.w && box.h ? fitStage(box.w, box.h) : null), [box.w, box.h]);
  const ready = stage !== null;

  const [fromUrl] = useState(urlFreeze);
  const reduced = useReducedMotion();
  const frozenAt = fromUrl ?? (reduced ? STILL_MS : null);
  const onScreen = useOnScreen(ref);

  // wait: hidden until its pictures are in. enter: the wipe. run: the loops.
  const [entered, setEntered] = useState<Phase>(() => (frozenAt === null ? 'wait' : 'run'));
  const phase: Phase = frozenAt === null ? entered : 'run';

  useEffect(() => {
    if (!ready || phase !== 'wait') return;
    let live = true;
    const go = () => live && setEntered('enter');
    const imgs = Array.from(ref.current!.querySelectorAll('img'));
    const loaded = imgs.map((im) => (im.complete ? null : new Promise<void>((done) => {
      im.addEventListener('load', () => done(), { once: true });
      im.addEventListener('error', () => done(), { once: true });
    })));
    void Promise.all(loaded).then(go);
    const cap = window.setTimeout(go, 2500); // never keep the hero dark for a slow picture
    return () => {
      live = false;
      clearTimeout(cap);
    };
  }, [ready, phase, ref]);

  // The entrance: the page colour slides off to the right, uncovering the drawing once.
  useLayoutEffect(() => {
    if (phase !== 'enter') return;
    const root = ref.current!;
    let live = true;
    const wipe = root.querySelector('.hero-wipe')!.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: ENTER_MS, easing: EASE_WIPE, fill: 'forwards' });
    const head = root.querySelector('.hero-headline')?.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 420, delay: ENTER_MS - 420, easing: EASE_OUT, fill: 'both' },
    );
    wipe.finished.then(() => live && setEntered('run'), () => {});
    return () => {
      live = false;
      wipe.cancel();
      head?.cancel();
    };
  }, [phase, ref]);

  // The loops. They are rebuilt when the size changes (the walkers' path is in px) and keep their place in time.
  const loops = useRef<Animation[]>([]);
  const clock = useRef(0);
  const playing = phase === 'run' && frozenAt === null && onScreen;
  const playingNow = useRef(playing);
  playingNow.current = playing;

  useLayoutEffect(() => {
    if (!stage) return;
    const made = startLoops(ref.current!, heroLoops(stage));
    const t = frozenAt ?? clock.current;
    for (const a of made) {
      a.currentTime = t;
      if (!playingNow.current) a.pause();
    }
    loops.current = made;
    return () => {
      const at = made[0]?.currentTime;
      if (typeof at === 'number') clock.current = at;
      for (const a of made) a.cancel();
      loops.current = [];
    };
  }, [stage?.w, stage?.h, frozenAt, ref]);

  useEffect(() => {
    for (const a of loops.current) {
      if (playing) a.play();
      else a.pause();
    }
  }, [playing]);

  // the headline sits in the empty sky, wherever that is in the hero at this width
  let sky: CSSProperties | undefined;
  if (stage) {
    const left = Math.max(16, stage.x + HERO.sky.x * stage.w);
    const right = Math.min(box.w - 16, stage.x + (HERO.sky.x + HERO.sky.w) * stage.w);
    sky = { left, width: Math.max(0, right - left), top: stage.y + HERO.sky.y * stage.h, height: HERO.sky.h * stage.h };
  }

  return (
    <div ref={ref} className="hero" data-phase={phase} style={{ '--hero-ground': HERO.ground, '--hero-ink': HERO.ink } as CSSProperties}>
      <div className="hero-art">
        <img
          className="hero-base"
          src={HERO.src1x}
          srcSet={`${HERO.src1x} ${HERO.width / 2}w, ${HERO.src} ${HERO.width}w`}
          sizes="max(100vw, 952px)"
          width={HERO.width}
          height={HERO.height}
          alt={HERO.alt}
          draggable={false}
          style={stage ? { objectPosition: `${pct(stage.px)} ${pct(stage.py)}` } : undefined}
        />
        {stage && <Layers stage={stage} />}
        {phase !== 'run' && <div className="hero-wipe" />}
      </div>
      {children != null && sky && <div className="hero-headline" style={sky}>{children}</div>}
    </div>
  );
}
