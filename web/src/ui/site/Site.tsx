// The library site (dev-only, at /ui): a top bar, a left nav and one page at a time, in the manner of
// Kevin Ngo's Looseleaf site. Pages are addressed by hash (#/foundations/pens), so the one /ui route serves them all.
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { InkStroke, InkSvg, useBox } from '../ink/Ink';
import { PEN, rule } from '../ink/shapes';
import { uiSound } from '../sound';
import { BetPanelBlock, ChannelsBlock, ChatBlock, COMPONENTS, ComponentDoc } from './components';
import { Accessibility, Colour, GettingStarted, Motion, Overview, Pens, Principles, Recipes, Shapes, Sound, Type } from './foundations';
import { Toaster } from '../overlays';
import { Star } from './parts';
import './site.css';

/** The library's name, chosen by Ian on 2026-11-20. */
const NAME = 'Nightline';

// Ian's shortlist of typefaces (2026-11-20). Nothing is chosen yet; the site can be read in each.
const FONTS: Array<{ name: string; css: string; scale: number }> = [
  { name: 'IM Fell English', css: "'IM Fell English', serif", scale: 1.1 },
  { name: 'Cormorant Garamond', css: "'Cormorant Garamond', serif", scale: 1.2 },
  { name: 'Shantell Sans', css: "'Shantell Sans', sans-serif", scale: 1 },
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=IM+Fell+English:ital@0;1&family=Shantell+Sans:wght@400..700&display=swap';
const FONT_KEY = 'ink.site.font';

interface Entry { path: string; title: string; render: () => ReactNode }
interface Group { name: string; items: Entry[] }

const component = (id: string): Entry => ({ path: `/components/${id}`, title: COMPONENTS[id]!.title, render: () => <ComponentDoc id={id} /> });

const NAV: Group[] = [
  { name: 'Start', items: [
    { path: '/', title: 'Overview', render: () => <Overview name={NAME} /> },
    { path: '/start', title: 'Getting started', render: () => <GettingStarted /> },
  ] },
  { name: 'Foundations', items: [
    { path: '/foundations/principles', title: 'Principles', render: () => <Principles /> },
    { path: '/foundations/colour', title: 'Colour', render: () => <Colour /> },
    { path: '/foundations/type', title: 'Type', render: () => <Type /> },
    { path: '/foundations/pens', title: 'Pens', render: () => <Pens /> },
    { path: '/foundations/shapes', title: 'Shapes', render: () => <Shapes /> },
    { path: '/foundations/recipes', title: 'Recipes', render: () => <Recipes /> },
    { path: '/foundations/motion', title: 'Motion', render: () => <Motion /> },
    { path: '/foundations/sound', title: 'Sound', render: () => <Sound /> },
    { path: '/foundations/accessibility', title: 'Accessibility', render: () => <Accessibility /> },
  ] },
  { name: 'Actions', items: [component('button')] },
  { name: 'Forms', items: [component('text-input'), component('bet-sides'), component('switch'), component('checkbox')] },
  { name: 'Navigation', items: [component('tabs')] },
  { name: 'Layout', items: [component('frame'), component('checker-frame')] },
  { name: 'Display', items: ['pill', 'bot-tag', 'chat-row', 'medallion', 'beacon', 'countdown', 'balance-pill', 'roll', 'progress', 'skeleton'].map(component) },
  { name: 'Overlays', items: ['tooltip', 'menu', 'toast'].map(component) },
  { name: 'Moments', items: [component('moment')] },
  { name: 'Blocks', items: [
    { path: '/blocks/bet-panel', title: 'Bet panel', render: () => <BetPanelBlock /> },
    { path: '/blocks/chat', title: 'Chat', render: () => <ChatBlock /> },
    { path: '/blocks/channels', title: 'Channel list', render: () => <ChannelsBlock /> },
  ] },
];
const PAGES = NAV.flatMap((g) => g.items);

const readHash = () => location.hash.replace(/^#/, '') || '/';
function useHashPath(): string {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener('hashchange', f);
      return () => window.removeEventListener('hashchange', f);
    },
    readHash,
  );
}

const storedFont = () => {
  try {
    const v = localStorage.getItem(FONT_KEY);
    const n = v == null ? 0 : Number(v);
    return n >= 0 && n < FONTS.length ? n : 0;
  } catch {
    return 0;
  }
};

export function Site() {
  const path = useHashPath();
  const [font, setFontState] = useState(storedFont);
  const [calm, setCalm] = useState(false);
  const [compact, setCompact] = useState(false);
  const [sound, setSound] = useState(uiSound.enabled());
  const [run, setRun] = useState(0);
  const setFont = (i: number) => {
    setFontState(i);
    try {
      localStorage.setItem(FONT_KEY, String(i));
    } catch { /* storage blocked */ }
  };

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_CSS;
    document.head.appendChild(link);
    const title = document.title;
    return () => {
      link.remove();
      document.title = title;
    };
  }, []);
  useEffect(() => {
    const sync = () => setSound(uiSound.enabled());
    window.addEventListener('ink-sound', sync);
    return () => window.removeEventListener('ink-sound', sync);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target instanceof Element && e.target.closest('input, textarea')) || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= FONTS.length) setFont(n - 1);
      if (e.key.toLowerCase() === 'r') setRun((x) => x + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const page = PAGES.find((p) => p.path === path) ?? PAGES[0]!;
  useEffect(() => {
    document.title = page.path === '/' ? NAME : `${NAME}: ${page.title}`;
    document.querySelector('.ink-site-main')?.scrollTo(0, 0);
  }, [page]);

  const f = FONTS[font]!;
  return (
    <div
      className="ink-ui ink-site"
      data-motion={calm ? 'reduce' : undefined}
      data-density={compact ? 'compact' : undefined}
      style={{ '--ink-font': f.css, '--ink-font-scale': f.scale } as CSSProperties}
    >
      <a className="ink-site-skip" href="#ink-site-main">Skip to content</a>
      <header className="ink-site-top">
        <a className="ink-site-name" href="#/"><Star size={16} seed="name" /> {NAME}</a>
        <nav className="ink-site-toplinks" aria-label="Sections">
          <a href="#/start">Getting started</a>
          <a href="#/components/button">Components</a>
          <a href="#/components/moment">Moments</a>
          <a href="#/blocks/bet-panel">Blocks</a>
        </nav>
        <div className="ink-site-tools" role="toolbar" aria-label="Site settings">
          <span className="ink-site-fonts" role="radiogroup" aria-label="Typeface">
            {FONTS.map((x, i) => (
              <button key={x.name} type="button" role="radio" aria-checked={i === font} className="ink-site-tool" style={{ fontFamily: x.css }} onClick={() => setFont(i)}>{x.name}</button>
            ))}
          </span>
          <button type="button" className="ink-site-tool" onClick={() => setRun((x) => x + 1)} title="Draw this page again (R)">Replay</button>
          <button type="button" className="ink-site-tool" aria-pressed={compact} onClick={() => setCompact((x) => !x)}>Compact</button>
          <button type="button" className="ink-site-tool" aria-pressed={calm} onClick={() => setCalm((x) => !x)}>Less motion</button>
          <button type="button" className="ink-site-tool" aria-pressed={sound} onClick={() => { uiSound.enable(!sound); setSound(!sound); }}>Sound</button>
        </div>
        <TopRule />
      </header>
      <div className="ink-site-body">
        <nav className="ink-site-nav" aria-label="Pages">
          {NAV.map((g) => (
            <div key={g.name} className="ink-site-group">
              <div className="ink-site-group-name">{g.name}</div>
              {g.items.map((p) => (
                <a key={p.path} href={`#${p.path}`} className="ink-site-link" aria-current={p.path === page.path ? 'page' : undefined}>
                  {p.path === page.path && <Star size={11} seed={p.path} />}
                  {p.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <main className="ink-site-main" id="ink-site-main" tabIndex={-1} key={`${page.path}:${run}`}>
          {page.render()}
        </main>
      </div>
      <Toaster />
    </div>
  );
}

/** The hand-ruled line under the top bar. */
function TopRule() {
  const [ref, box] = useBox<HTMLSpanElement>();
  const s = useMemo(() => (box.w ? rule(0, 0, box.w, 0.6, 'site:top', PEN.rule) : null), [box]);
  return <span ref={ref} className="ink-site-toprule">{s && <InkSvg box={box} pad={4}><InkStroke s={s} /></InkSvg>}</span>;
}
