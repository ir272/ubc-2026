// Ringout: palette, fonts and shared UI constants (ARCH.md "Direction").
// Every stage module takes its colours and type from here so the show reads as one broadcast.
//
// Fonts come from @fontsource. Importing this file pulls the CSS in (Vite bundles the woff2 files),
// which works both in the harness and when the site builds the game through the `@games` alias.

import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-display/900';
import '@fontsource/barlow-semi-condensed/500';
import '@fontsource/barlow-semi-condensed/600';
import '@fontsource/barlow-semi-condensed/700';

export const PALETTE = {
  navy: '#0b1522', // night navy: the sky, plates, the page behind the stage
  steel: '#2a3644', // deck steel
  steelLight: '#3c4b5c',
  hazard: '#ffc21a', // hazard yellow: ledges, calls, the clock when it runs low
  red: '#ff3b30', // signal red: side 0
  cobalt: '#2f6bff', // cobalt: side 1
  white: '#f4f8ff', // arc white: text, the welding flash
  ember: '#ff7a1a', // ember orange: heat, damage climbing
  ink: '#05090f', // hard offset shadows
  muted: '#8a9bb0', // secondary text on navy
} as const;

/** side colours: [red side 0, blue side 1] */
export const SIDE_COLORS: [string, string] = [PALETTE.red, PALETTE.cobalt];

export const FONTS = {
  /** heavy display: calls, numbers, names */
  display: "'Big Shoulders Display', 'Arial Narrow', sans-serif",
  /** small text: labels, reads, records */
  text: "'Barlow Semi Condensed', 'Arial Narrow', sans-serif",
} as const;

/** the UI is laid out for this size and scaled to fit the stage */
export const UI_W = 1280;
export const UI_H = 720;

/** hard offset shadow used on plates and big type */
export const HARD_SHADOW = `4px 4px 0 ${PALETTE.ink}`;

/** clip-path for a plate cut at an angle on the right (or left) edge */
export function cutPlate(cut = 18, side: 'right' | 'left' | 'both' = 'right'): string {
  if (side === 'left') return `polygon(${cut}px 0, 100% 0, 100% 100%, 0 100%)`;
  if (side === 'both') return `polygon(${cut}px 0, 100% 0, calc(100% - ${cut}px) 100%, 0 100%)`;
  return `polygon(0 0, 100% 0, calc(100% - ${cut}px) 100%, 0 100%)`;
}

/** damage percent colour: white, then amber, then red as it climbs */
export function damageColor(pct: number): string {
  if (pct < 60) return PALETTE.white;
  if (pct < 110) return PALETTE.hazard;
  if (pct < 150) return PALETTE.ember;
  return PALETTE.red;
}

export const STANCE_WORDS: Record<string, string> = {
  rush: 'Rush',
  keepaway: 'Keep away',
  bait: 'Bait',
  wall: 'Wall',
};

/** a small helper for UI modules: make an absolutely positioned element inside a parent */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  parent: HTMLElement | null,
  style: Partial<CSSStyleDeclaration> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** seconds as m:ss */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
