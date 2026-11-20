import { useEffect, useSyncExternalStore } from 'react';
import { api, type Snapshot } from './api';
import { FIXTURE } from './dev';
import { fxChannelList } from '../fixture';

// GET /channels, polled while something on screen needs it.
let list: Snapshot[] | null = null;
let error = false;
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();
let version = 0;

async function poll() {
  if (FIXTURE) {
    list = fxChannelList();
    version++;
    subs.forEach((f) => f());
    return;
  }
  try {
    list = await api.channels();
    error = false;
  } catch {
    error = true;
  }
  version++;
  subs.forEach((f) => f());
}

export function useChannels(): { channels: Snapshot[] | null; error: boolean } {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => version,
  );
  useEffect(() => {
    if (users++ === 0) {
      void poll();
      timer = setInterval(poll, 3000);
    }
    return () => {
      if (--users === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return { channels: list, error };
}

export const displayTitle = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '');
