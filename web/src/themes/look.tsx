// A "look" restyles the whole site. RULE (Ian, 2026-11-19): every look comes from a real reference
// site, with values measured from that site in a browser. Nothing here is invented. To add a look,
// measure a reference he names and add it to REFERENCES with its source and date.
// The lab page (/lab) shows several looks side by side.
//
//   URL     ?pal=duel&accent=own&rad=ref&fx=none&motion=snappy
//   saved   localStorage 'arena.look' (the lab's "Use for the site" button)
//   lab     ?lab=1 makes a frame take its look only from its URL and from messages the lab posts
//
// To add an option, add an entry to one of the tables below. Nothing else needs to change.
import '@fontsource-variable/shantell-sans';
import type { ThemeDef, Tokens } from './types';
import { base } from './variants';
import { tokensFromRoles, unpackRoles } from '../lib/palette';

const sans = (name: string) => `'${name}', 'Helvetica Neue', Arial, sans-serif`;

export interface Look {
  pal: string;
  accent: string;
  rad: string;
  fx: string;
  motion: string;
  /** pal 'custom': five colours read from a reference picture (ground.text.action.second.third, hex) */
  c?: string;
  /** pal 'custom': the picture they were read from */
  src?: string;
}
export type LookKey = 'pal' | 'accent' | 'rad' | 'fx' | 'motion';

interface Reference {
  label: string;
  /** where the numbers come from */
  note: string;
  meta: string;
  light?: boolean;
  /** the reference's own corner radius in px: [controls, cards] */
  radius: [number, number];
  vars: Partial<Tokens>;
}

const INTER = sans('Inter Variable');

// Measured with getComputedStyle on the live sites on 2026-11-19, unless a line says otherwise.
export const REFERENCES: Record<string, Reference> = {
  duel: {
    label: 'Duel',
    note: 'duel.com, measured: grounds #0c102b / #121731 / #181e3c / #1f2546, action #4558ff, muted text #767faa, 8 px corners, 48 px header controls, 16 px bold labels. Its font, TT Interphases Pro, is a paid font, so Inter stands in.',
    meta: '#121731',
    radius: [8, 8],
    vars: {
      '--bg': '#0c102b', '--surface': '#121731', '--raised': '#181e3c', '--hover': '#1f2546', '--line': '#181e3c', '--keyline': '#1f2546',
      '--text': '#ffffff', '--text-2': '#767faa', '--text-3': '#767faa', '--accent': '#4558ff', '--on-accent': '#ffffff',
      '--fs': '15px', '--pad': '16px', '--btn-h': '40px', '--btn-lg': '48px', '--title-weight': '700', '--num-weight': '700',
    },
  },
  'twitch-dark': {
    label: 'Twitch dark',
    note: 'twitch.tv dark theme, from Twitch\'s own colour tokens: #0e0e10 / #18181b / #1f1f23 / #26262c, text #efeff1 and #adadb8, action #9147ff, live #eb0400, 4 and 6 px corners, 30 px controls, 13 px Inter.',
    meta: '#18181b',
    radius: [4, 6],
    vars: {
      '--bg': '#0e0e10', '--surface': '#18181b', '--raised': '#2f2f35', '--hover': '#3d3d44', '--line': '#2f2f35', '--keyline': '#3d3d44',
      '--text': '#efeff1', '--text-2': '#adadb8', '--text-3': '#adadb8', '--accent': '#9147ff', '--on-accent': '#ffffff', '--live': '#eb0400',
      '--fs': '13px', '--pad': '10px', '--btn-h': '30px', '--btn-lg': '40px', '--title-weight': '600', '--num-weight': '600',
    },
  },
  'twitch-light': {
    label: 'Twitch light',
    note: 'twitch.tv light theme, measured: #f7f7f8 / #ffffff / #efeff1, text #0e0e10 and #3b3b44, action #9147ff, live #e91916, 4 and 6 px corners, 32 px controls, 14 px Inter.',
    meta: '#ffffff',
    light: true,
    radius: [4, 6],
    vars: {
      '--bg': '#f7f7f8', '--surface': '#ffffff', '--raised': '#e6e6ea', '--hover': '#d9d9df', '--line': '#e2e2e6', '--keyline': '#d3d3d9',
      '--text': '#0e0e10', '--text-2': '#3b3b44', '--text-3': '#53535f', '--accent': '#9147ff', '--on-accent': '#ffffff', '--live': '#e91916', '--bad': '#c62828',
      '--side-a': '#0b62c4', '--side-b': '#c41e5a', '--side-c': '#55555f', '--on-side-a': '#ffffff', '--on-side-b': '#ffffff', '--on-side-c': '#ffffff',
      '--name-0': '#a4531a', '--name-1': '#1c6aa6', '--name-2': '#3d7a2a', '--name-3': '#8a3fa6', '--name-4': '#8a6a00', '--name-5': '#127a68',
      '--fs': '14px', '--pad': '10px', '--btn-h': '32px', '--btn-lg': '40px', '--title-weight': '600', '--num-weight': '600',
    },
  },
  kick: {
    label: 'Kick',
    note: 'kick.com, partly measured: page #090b0f, controls #3a3d43 and #454950, text #ffffff and #a9adb5, 8 and 6 px corners, 32 px controls, 14 px semibold Inter. The action green #53fc18 is Kick\'s brand colour; its panel and divider colours were not read.',
    meta: '#090b0f',
    radius: [8, 6],
    vars: {
      '--bg': '#090b0f', '--surface': '#090b0f', '--raised': '#3a3d43', '--hover': '#454950', '--line': '#3a3d43', '--keyline': '#454950',
      '--text': '#ffffff', '--text-2': '#a9adb5', '--text-3': '#a9adb5', '--accent': '#53fc18', '--on-accent': '#000000',
      '--fs': '14px', '--pad': '12px', '--btn-h': '32px', '--btn-lg': '40px', '--title-weight': '700', '--num-weight': '600',
    },
  },
};
// Nightline, the site's own look (Ian, 2026-11-20): white ink on black paper. Every colour is measured from his
// reference picture, refs/candidates/ian-map-reference.webp (see web/src/ui/README.md); the greys are that ink
// mixed into that paper, not new colours. The typeface is his pick, Shantell Sans. Square corners: lines are ruled.
const SHANTELL = sans('Shantell Sans Variable');
REFERENCES.nightline = {
  label: 'Nightline',
  note: 'Our own look, measured from Ian\'s chart reference: paper #141318, ink #e6e4de, gold #c5a559, pencils blue #6687ac, coral #b58970, green #69927d, yellow #afa569. Greys are ink mixed into paper. Shantell Sans.',
  meta: '#141318',
  radius: [0, 0],
  vars: {
    '--bg': '#141318', '--surface': '#141318', '--raised': '#252428', '--hover': '#313034', '--line': '#3e3d41', '--keyline': '#535253',
    '--text': '#e6e4de', '--text-2': '#92908f', '--text-3': '#92908f', '--accent': '#c5a559', '--on-accent': '#141318',
    '--side-a': '#6687ac', '--side-b': '#b58970', '--side-c': '#69927d', '--on-side-a': '#141318', '--on-side-b': '#141318', '--on-side-c': '#141318',
    '--bad': '#b58970', '--live': '#c5a559',
    '--name-0': '#6687ac', '--name-1': '#b58970', '--name-2': '#69927d', '--name-3': '#afa569', '--name-4': '#c5a559', '--name-5': '#d7d5cf',
    '--font-ui': SHANTELL, '--label-font': SHANTELL, '--font-num': SHANTELL, '--font-title': SHANTELL,
    '--fs': '15px', '--pad': '16px', '--btn-h': '40px', '--btn-lg': '48px', '--title-weight': '600', '--num-weight': '600',
  },
};
REFERENCES.custom = {
  label: 'From a picture',
  note: 'Colours read from the reference picture you chose: its most common colour is the ground, its strongest contrast is the text, its most vivid colour is the action colour. Corners and sizes follow Duel.',
  meta: '#000000',
  radius: [8, 8],
  vars: { '--fs': '15px', '--pad': '16px', '--btn-h': '40px', '--btn-lg': '48px', '--title-weight': '700', '--num-weight': '700' },
};
/** kept under the old name for callers */
export const PALETTES = REFERENCES;

/** The action colour: the reference's own, or one of the other references' (all measured). */
export const ACCENTS: Record<string, { label: string; color?: string; on?: string }> = {
  own: { label: "The reference's own" },
  duel: { label: 'Duel blue #4558ff', color: '#4558ff', on: '#ffffff' },
  twitch: { label: 'Twitch purple #9147ff', color: '#9147ff', on: '#ffffff' },
  kick: { label: 'Kick green #53fc18', color: '#53fc18', on: '#000000' },
};
export const RADII: Record<string, { label: string }> = {
  ref: { label: "The reference's own" },
  '4': { label: '4 px (Twitch)' },
  '6': { label: '6 px' },
  '8': { label: '8 px (Duel, Kick)' },
};
// "Dither" is here because Ian asked to try it; it only touches still pictures.
export const FX: Record<string, { label: string }> = {
  none: { label: 'None' },
  dither: { label: 'Dither on pictures' },
};
export const MOTION: Record<string, { label: string }> = {
  off: { label: 'None' },
  snappy: { label: 'Snappy' },
  bouncy: { label: 'Bouncy' },
};

export const OPTIONS: Record<LookKey, { label: string; items: Record<string, { label: string }> }> = {
  pal: { label: 'Reference', items: REFERENCES },
  accent: { label: 'Action colour', items: ACCENTS },
  rad: { label: 'Corners', items: RADII },
  fx: { label: 'Texture', items: FX },
  motion: { label: 'Motion', items: MOTION },
};
export const LOOK_KEYS = Object.keys(OPTIONS) as LookKey[];

export const DEFAULT_LOOK: Look = { pal: 'nightline', accent: 'own', rad: 'ref', fx: 'none', motion: 'snappy' };

/** One starting point per reference. */
export const PRESETS: { name: string; look: Look }[] = Object.keys(REFERENCES).filter((id) => id !== 'custom').map((id) => ({ name: REFERENCES[id]!.label, look: { ...DEFAULT_LOOK, pal: id } }));

export const cleanLook = (l: Partial<Look> | null | undefined): Look => {
  const out: Look = { ...DEFAULT_LOOK };
  for (const k of LOOK_KEYS) {
    const v = l?.[k];
    if (typeof v === 'string' && v in OPTIONS[k].items) out[k] = v;
  }
  if (out.pal === 'custom') {
    if (unpackRoles(l?.c)) {
      out.c = l!.c!.toLowerCase();
      if (typeof l?.src === 'string' && /^(https:\/\/|blob:|data:image\/)/.test(l.src)) out.src = l.src;
    } else out.pal = DEFAULT_LOOK.pal;
  }
  return out;
};
export const lookQuery = (l: Look) =>
  LOOK_KEYS.map((k) => `${k}=${encodeURIComponent(l[k])}`).join('&') + (l.pal === 'custom' && l.c ? `&c=${l.c}` : '');
export const sameLook = (a: Look, b: Look) => LOOK_KEYS.every((k) => a[k] === b[k]) && (a.c ?? '') === (b.c ?? '');

const SAVED = 'arena.look';
export const savedLook = (): Look | null => {
  try {
    const raw = localStorage.getItem(SAVED);
    return raw ? cleanLook(JSON.parse(raw) as Partial<Look>) : null;
  } catch {
    return null;
  }
};
export const saveLook = (l: Look | null) => {
  try {
    if (l) localStorage.setItem(SAVED, JSON.stringify(l));
    else localStorage.removeItem(SAVED);
  } catch {
    /* ignore */
  }
};

export const IS_LAB_FRAME = typeof location !== 'undefined' && new URLSearchParams(location.search).get('lab') === '1';

/** The look for this page: from the URL if it names one, else the saved pick, else the default. */
export function currentLook(): Look {
  const q = new URLSearchParams(location.search);
  const fromUrl: Partial<Look> = {};
  let any = false;
  for (const k of LOOK_KEYS) {
    const v = q.get(k);
    if (v) {
      fromUrl[k] = v;
      any = true;
    }
  }
  if (q.get('c')) fromUrl.c = q.get('c')!;
  if (any) return cleanLook({ ...(IS_LAB_FRAME ? {} : (savedLook() ?? {})), ...fromUrl });
  return (IS_LAB_FRAME ? null : savedLook()) ?? DEFAULT_LOOK;
}

function Wordmark() {
  return <span className="wm wm-look">ARENA</span>;
}

export function lookTheme(l: Look): ThemeDef {
  const ref = REFERENCES[l.pal]!;
  const acc = ACCENTS[l.accent]!;
  const roles = l.pal === 'custom' ? unpackRoles(l.c) : null;
  const read = roles ? tokensFromRoles(roles) : null;
  const [rc, rk] = l.rad === 'ref' ? ref.radius : [Number(l.rad), Number(l.rad)];
  return {
    name: `look-${l.pal}`,
    metaColor: read?.meta ?? ref.meta,
    Wordmark,
    vars: base({
      '--font-ui': INTER,
      '--label-font': INTER,
      '--font-num': INTER,
      '--font-title': INTER,
      ...ref.vars,
      ...(read?.vars ?? {}),
      ...(acc.color ? { '--accent': acc.color, '--on-accent': acc.on! } : {}),
      '--radius': `${rc}px`,
      '--radius-card': `${rk}px`,
    }),
  };
}

export function applyLook(l: Look) {
  const t = lookTheme(l);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.dataset.theme = t.name;
  root.dataset.fx = l.fx;
  root.dataset.motion = l.motion;
  const roles = l.pal === 'custom' ? unpackRoles(l.c) : null;
  root.dataset.light = (roles ? tokensFromRoles(roles).light : REFERENCES[l.pal]!.light) ? '1' : '0';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.metaColor);
  window.dispatchEvent(new Event('arena-look'));
  return t;
}

/** A lab frame restyles itself when the lab posts a new look, with no reload. */
export function listenForLab() {
  if (!IS_LAB_FRAME) return;
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data as { type?: string; look?: Partial<Look> } | null;
    if (d?.type === 'arena-look') applyLook(cleanLook(d.look));
  });
}
