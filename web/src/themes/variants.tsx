// The six style variants. Each differs only in ground, accent, side pair, typefaces, radius and
// density; components and metrics are shared (see DESIGN_METRICS.md). To add a theme, add an entry
// here (or a new file) and list it in ./index.ts.
import '@fontsource-variable/inter';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/dela-gothic-one';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource-variable/outfit';
import '@fontsource-variable/figtree';
import '@fontsource-variable/geist';
import type { ThemeDef, Tokens } from './types';

const INTER = "'Inter Variable', 'Helvetica Neue', Arial, sans-serif";
const ARCHIVO = "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif";
const DELA = "'Dela Gothic One', 'Inter Variable', sans-serif";
const JBM = "'JetBrains Mono Variable', ui-monospace, Menlo, monospace";
const PLEX = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";
const FIGTREE = "'Figtree Variable', 'Helvetica Neue', Arial, sans-serif";
const GEIST = "'Geist Variable', 'Helvetica Neue', Arial, sans-serif";
const OUTFIT = "'Outfit Variable', 'Helvetica Neue', Arial, sans-serif";

export const base = (o: Partial<Tokens>): Tokens => ({
  '--bg': '#000000',
  '--surface': '#000000',
  '--raised': '#141414',
  '--hover': '#1f1f1f',
  '--line': '#222222',
  '--keyline': '#222222',
  '--text': '#ffffff',
  '--text-2': '#a9adb5',
  '--text-3': '#82868d',
  '--accent': '#ff8a1f',
  '--on-accent': '#140a00',
  '--side-a': '#9ad0ff',
  '--side-b': '#e0578a',
  '--side-c': '#d4d4d4',
  '--on-side-a': '#000000',
  '--on-side-b': '#ffffff',
  '--on-side-c': '#000000',
  '--bad': '#ff6b6b',
  '--live': '#ff4545',
  '--name-0': '#e2a77f',
  '--name-1': '#8fbfe0',
  '--name-2': '#a9d39a',
  '--name-3': '#d0a3e0',
  '--name-4': '#e8c77a',
  '--name-5': '#8fd3c4',
  '--font-ui': INTER,
  '--font-title': INTER,
  '--font-num': INTER,
  '--title-weight': '700',
  '--title-case': 'none',
  '--title-track': '0',
  '--title-stretch': '100%',
  '--title-word': 'normal',
  '--num-weight': '700',
  '--num-stretch': '100%',
  '--label-font': INTER,
  '--label-case': 'none',
  '--label-track': '0',
  '--radius': '6px',
  '--radius-card': '6px',
  '--fs': '14px',
  '--pad': '16px',
  '--btn-h': '32px',
  '--btn-lg': '44px',
  ...o,
});

const text = (style: React.CSSProperties, word = 'ARENA') => () => (
  <span className="wm" style={style}>
    {word}
  </span>
);

export const plain: ThemeDef = {
  name: 'plain',
  metaColor: '#000000',
  vars: base({}),
  Wordmark: text({ fontFamily: INTER, fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }),
};

export const broadcast: ThemeDef = {
  name: 'broadcast',
  metaColor: '#000000',
  vars: base({
    '--raised': '#121212',
    '--line': '#1f1f1f',
    '--keyline': '#1f1f1f',
    '--accent': '#ffb000',
    '--side-a': '#7fe0ff',
    '--side-b': '#d6336c',
    '--font-ui': ARCHIVO,
    '--font-title': ARCHIVO,
    '--font-num': ARCHIVO,
    '--title-weight': '800',
    '--title-case': 'uppercase',
    '--title-track': '0.01em',
    '--title-stretch': '62%',
    '--title-word': '0.16em',
    '--num-weight': '700',
    '--num-stretch': '100%',
    '--label-font': ARCHIVO,
    '--label-case': 'uppercase',
    '--label-track': '0.04em',
    '--radius': '2px',
    '--radius-card': '2px',
    '--btn-lg': '40px',
  }),
  Wordmark: text({ fontFamily: ARCHIVO, fontWeight: 900, fontStretch: '62%', fontSize: 28, letterSpacing: '0.01em' }),
};

export const titleCard: ThemeDef = {
  name: 'title-card',
  metaColor: '#070b14',
  vars: base({
    '--bg': '#070b14',
    '--surface': '#070b14',
    '--raised': '#0f1522',
    '--hover': '#182033',
    '--line': '#1c2333',
    '--text-2': '#aab1c0',
    '--text-3': '#7d8596',
    '--accent': '#ffcc00',
    '--on-accent': '#000000',
    '--side-a': '#8fc4ff',
    '--side-b': '#ff5247',
    '--on-side-a': '#000000',
    '--on-side-b': '#000000',
    '--font-title': DELA,
    '--title-weight': '400',
    '--keyline': 'rgba(255, 255, 255, 0.28)',
    '--radius': '4px',
    '--radius-card': '4px',
  }),
  Wordmark: text({ fontFamily: DELA, fontSize: 21, letterSpacing: '0.02em' }),
};

export const terminal: ThemeDef = {
  name: 'terminal',
  metaColor: '#0a0a0a',
  vars: base({
    '--bg': '#0a0a0a',
    '--surface': '#0a0a0a',
    '--raised': '#121212',
    '--hover': '#1a1a1a',
    '--line': '#242424',
    '--keyline': '#2e2e2e',
    '--text-2': '#a3a3a3',
    '--text-3': '#737373',
    '--accent': '#22d3ee',
    '--on-accent': '#001014',
    '--side-a': '#e6e6e6',
    '--side-b': '#e8590c',
    '--on-side-a': '#000000',
    '--on-side-b': '#000000',
    '--side-c': '#6b6b6b',
    '--on-side-c': '#ffffff',
    '--font-ui': JBM,
    '--font-num': JBM,
    '--num-weight': '600',
    '--label-font': JBM,
    '--label-case': 'uppercase',
    '--label-track': '0.02em',
    '--font-title': JBM,
    '--title-weight': '600',
    '--radius': '0px',
    '--radius-card': '0px',
    '--fs': '13px',
    '--pad': '12px',
    '--btn-h': '30px',
    '--btn-lg': '40px',
  }),
  Wordmark: text({ fontFamily: JBM, fontWeight: 700, fontSize: 17, letterSpacing: '0.04em' }, 'ARENA'),
};

export const mono: ThemeDef = {
  name: 'mono',
  metaColor: '#000000',
  vars: base({
    '--raised': '#111111',
    '--hover': '#1c1c1c',
    '--line': '#262626',
    '--keyline': '#333333',
    '--text-2': '#a3a3a3',
    '--text-3': '#7a7a7a',
    '--accent': '#ffffff',
    '--on-accent': '#000000',
    '--side-a': '#ffffff',
    '--side-b': '#5c5c5c',
    '--side-c': '#a3a3a3',
    '--on-side-a': '#000000',
    '--on-side-b': '#ffffff',
    '--on-side-c': '#000000',
    '--bad': '#ffffff',
    '--font-ui': PLEX,
    '--font-title': PLEX,
    '--font-num': PLEX,
    '--label-font': PLEX,
    '--radius': '9999px',
    '--radius-card': '8px',
  }),
  Wordmark: text({ fontFamily: PLEX, fontWeight: 700, fontSize: 19, letterSpacing: '0.12em' }),
};

export const cobalt: ThemeDef = {
  name: 'cobalt',
  metaColor: '#0b1020',
  vars: base({
    '--bg': '#0b1020',
    '--surface': '#0b1020',
    '--raised': '#151d36',
    '--hover': '#1d2747',
    '--line': '#1f2a48',
    '--keyline': '#26335a',
    '--text-2': '#a9b3cf',
    '--text-3': '#7b86a6',
    '--accent': '#3d6bff',
    '--on-accent': '#ffffff',
    '--side-a': '#8be6cf',
    '--side-b': '#ff7a35',
    '--side-c': '#c9cfdf',
    '--on-side-a': '#06231c',
    '--on-side-b': '#1f0b00',
    '--font-ui': OUTFIT,
    '--font-title': OUTFIT,
    '--font-num': OUTFIT,
    '--label-font': OUTFIT,
    '--num-weight': '600',
    '--radius': '12px',
    '--radius-card': '12px',
    '--fs': '15px',
    '--pad': '20px',
    '--btn-h': '36px',
    '--btn-lg': '48px',
  }),
  Wordmark: text({ fontFamily: OUTFIT, fontWeight: 700, fontSize: 22, letterSpacing: '-0.01em' }, 'arena'),
};

// Deep navy with an indigo-blue action colour and soft 10px corners: taken from the wallet header
// reference Ian supplied on 2026-11-19.
export const midnight: ThemeDef = {
  name: 'midnight',
  metaColor: '#0e1024',
  vars: base({
    '--bg': '#0e1024',
    '--surface': '#12152d',
    '--raised': '#1e2342',
    '--hover': '#2a2f57',
    '--line': '#272c50',
    '--keyline': '#343a66',
    '--text-2': '#9aa2c9',
    '--text-3': '#737ba6',
    '--accent': '#4d5dfb',
    '--on-accent': '#ffffff',
    '--side-a': '#62c8ff',
    '--side-b': '#ff6d8f',
    '--side-c': '#c9cfe6',
    '--on-side-a': '#04202f',
    '--on-side-b': '#2b0412',
    '--font-ui': FIGTREE,
    '--font-title': FIGTREE,
    '--font-num': FIGTREE,
    '--label-font': FIGTREE,
    '--title-weight': '800',
    '--radius': '10px',
    '--radius-card': '10px',
    '--fs': '15px',
    '--pad': '18px',
    '--btn-h': '36px',
    '--btn-lg': '48px',
  }),
  Wordmark: text({ fontFamily: FIGTREE, fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em' }),
};

// Light, like the streaming browse page Ian supplied as the home page reference.
export const daylight: ThemeDef = {
  name: 'daylight',
  metaColor: '#ffffff',
  vars: base({
    '--bg': '#f7f7f8',
    '--surface': '#ffffff',
    '--raised': '#efeff1',
    '--hover': '#e2e2e7',
    '--line': '#dedee3',
    '--keyline': '#cfcfd6',
    '--text': '#0e0e10',
    '--text-2': '#53535f',
    '--text-3': '#7a7a85',
    '--accent': '#1f51ff',
    '--on-accent': '#ffffff',
    '--side-a': '#0b62c4',
    '--side-b': '#c41e5a',
    '--side-c': '#55555f',
    '--on-side-a': '#ffffff',
    '--on-side-b': '#ffffff',
    '--on-side-c': '#ffffff',
    '--bad': '#c62828',
    '--live': '#eb0400',
    '--name-0': '#a4531a',
    '--name-1': '#1c6aa6',
    '--name-2': '#3d7a2a',
    '--name-3': '#8a3fa6',
    '--name-4': '#8a6a00',
    '--name-5': '#127a68',
    '--font-ui': GEIST,
    '--font-title': GEIST,
    '--font-num': GEIST,
    '--label-font': GEIST,
    '--radius': '6px',
    '--radius-card': '6px',
  }),
  Wordmark: text({ fontFamily: GEIST, fontWeight: 800, fontSize: 21, letterSpacing: '-0.03em' }),
};
