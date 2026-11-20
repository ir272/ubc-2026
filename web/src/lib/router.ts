import { useSyncExternalStore } from 'react';

const subs = new Set<() => void>();
window.addEventListener('popstate', () => subs.forEach((f) => f()));

export function navigate(path: string) {
  if (path === location.pathname) return;
  // Inside a design-lab frame, keep the frame's look and dev switches while moving between pages.
  const keep = new URLSearchParams(location.search).get('lab') === '1' ? location.search : '';
  history.pushState(null, '', path + keep);
  window.scrollTo(0, 0);
  subs.forEach((f) => f());
}

export function usePath(): string {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => location.pathname,
  );
}

export const channelPath = (id: string) => `/c/${encodeURIComponent(id)}`;
