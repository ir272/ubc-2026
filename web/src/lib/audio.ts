// Site-wide sound state for the stream player: one volume, one mute switch, and whether the browser
// lets the page play sound yet. Browsers keep a page silent until the viewer's first click or key
// press anywhere on it; after that, sound may start on its own (also on the next channel they open).
import { useSyncExternalStore } from 'react';

const KEY = 'arena.audio.v1';
export interface AudioState {
  volume: number; // 0..1
  muted: boolean;
  /** the viewer has clicked or pressed a key on this page, so the browser allows sound */
  unlocked: boolean;
}

function load(): AudioState {
  let volume = 0.6;
  let muted = false;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AudioState> | null;
    if (raw && typeof raw.volume === 'number') volume = Math.min(1, Math.max(0, raw.volume));
    if (raw && typeof raw.muted === 'boolean') muted = raw.muted;
  } catch {
    /* private window or blocked storage: defaults */
  }
  const ua = (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return { volume, muted, unlocked: !!ua?.hasBeenActive };
}

let state: AudioState = typeof window === 'undefined' ? { volume: 0.6, muted: false, unlocked: false } : load();
const subs = new Set<() => void>();
const set = (next: Partial<AudioState>) => {
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify({ volume: state.volume, muted: state.muted }));
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
};

if (typeof window !== 'undefined' && !state.unlocked) {
  const onGesture = () => {
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    set({ unlocked: true });
  };
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
}

export const audio = {
  get: () => state,
  setVolume: (v: number) => set({ volume: Math.min(1, Math.max(0, v)), muted: v <= 0 ? true : false }),
  toggleMute: () => set(state.muted && state.volume <= 0 ? { muted: false, volume: 0.6 } : { muted: !state.muted }),
};

export function useAudio(): AudioState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => state,
  );
}

/** what a game should be told: 0 while muted */
export const effectiveVolume = (s: AudioState) => (s.muted ? 0 : s.volume);
