import type { JSX } from 'react';

/**
 * A theme is one file: its fonts (imported for side effect), its CSS variables and its wordmark.
 * Components only use the variables listed in `Tokens`; nothing else hard-codes colour or type.
 */
export interface Tokens {
  // ground
  '--bg': string; // page
  '--surface': string; // top bar, chat column
  '--raised': string; // buttons, inputs, cards
  '--hover': string;
  '--line': string; // 1px hairlines
  '--keyline': string; // border on cards/buttons (often same as --line)
  // text
  '--text': string;
  '--text-2': string;
  '--text-3': string;
  // the one accent
  '--accent': string;
  '--on-accent': string;
  // outcome sides (differ in lightness and hue)
  '--side-a': string;
  '--side-b': string;
  '--side-c': string;
  '--on-side-a': string;
  '--on-side-b': string;
  '--on-side-c': string;
  '--bad': string;
  '--live': string; // LIVE text/dot (not the accent)
  '--name-0': string; // chat name hues
  '--name-1': string;
  '--name-2': string;
  '--name-3': string;
  '--name-4': string;
  '--name-5': string;
  // type
  '--font-ui': string;
  '--font-title': string;
  '--font-num': string;
  '--title-weight': string;
  '--title-case': string;
  '--title-track': string;
  '--title-stretch': string;
  '--title-word': string;
  '--num-weight': string;
  '--num-stretch': string;
  '--label-font': string;
  '--label-case': string;
  '--label-track': string;
  // shape + density
  '--radius': string; // buttons, inputs
  '--radius-card': string; // cards, images
  '--fs': string; // base text size
  '--pad': string; // column padding
  '--btn-h': string; // secondary control height
  '--btn-lg': string; // primary button height
}

export interface ThemeDef {
  name: string;
  vars: Tokens;
  metaColor: string;
  Wordmark: () => JSX.Element;
}
