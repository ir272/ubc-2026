// Theme registry. Pick one with ?theme=<name> (remembered for the tab). Add a theme by writing one
// more ThemeDef (see ./variants.tsx) and listing it here.
import type { ThemeDef } from './types';
import { broadcast, cobalt, daylight, midnight, mono, plain, terminal, titleCard } from './variants';

export const THEMES: Record<string, ThemeDef> = {
  plain,
  broadcast,
  'title-card': titleCard,
  terminal,
  mono,
  cobalt,
  midnight,
  daylight,
};
export const DEFAULT_THEME = 'midnight';

import { applyLook, currentLook, IS_LAB_FRAME, listenForLab, lookTheme } from './look';

/** An old named theme, only when the URL (or this tab, earlier) asked for one with ?theme=. */
function legacy(): ThemeDef | null {
  if (IS_LAB_FRAME) return null;
  let name = new URLSearchParams(location.search).get('theme');
  try {
    if (name) sessionStorage.setItem('arena.theme', name);
    else name = sessionStorage.getItem('arena.theme');
  } catch {
    /* ignore */
  }
  if (name === 'look') {
    try {
      sessionStorage.removeItem('arena.theme');
    } catch {
      /* ignore */
    }
    return null;
  }
  return (name && THEMES[name]) || null;
}

const old = legacy();
export const theme: ThemeDef = old ?? lookTheme(currentLook());

export function applyTheme() {
  if (!old) {
    applyLook(currentLook());
    listenForLab();
    return;
  }
  const root = document.documentElement;
  for (const [k, v] of Object.entries(old.vars)) root.style.setProperty(k, v);
  root.dataset.theme = old.name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', old.metaColor);
}
