// Shared helpers for the tools: argument parsing, a fake hub that records the feed, gap analysis.

import { hexOf } from '../show/draw.ts';
import { FakeHub, type FeedMsg } from '../harness/fakeShow.ts';
import type { Transcript } from '../show/episode.ts';

export function args(argv = process.argv.slice(2)): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2);
    if (v !== undefined) out[k!] = v;
    else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) out[k!] = argv[++i]!;
    else out[k!] = 'true';
  }
  return out;
}

export interface Recorded {
  msg: FeedMsg;
  vt: number;
}

/** A hub whose sealed secrets come from `seed` (if given) and that records every message. */
export function recordingHub(o: { speed: number; seed?: string }) {
  const hub = new FakeHub({
    speed: o.speed,
    secretFor: o.seed ? (n) => new Uint8Array(Buffer.from(hexOf(`${o.seed}:window:${n}`), 'hex')) : undefined,
  });
  const log: Recorded[] = [];
  hub.subscribe((msg, _json, vt) => log.push({ msg, vt }));
  return { hub, log };
}

export interface Gap {
  from: string;
  to: string;
  at: number;
  ms: number;
}

/**
 * Silence between feed items in speed-1 ms: from the end of everything aired so far (event at +
 * its ms) to the next message. Window messages count as zero-length items. The hold covers itself.
 */
export function gaps(log: Recorded[], over = 2500): { gaps: Gap[]; durationMs: number } {
  let start = -1;
  let endAt = 0;
  let last = '';
  const out: Gap[] = [];
  let finish = 0;
  for (const { msg, vt } of log) {
    if (msg.type === 'match') {
      start = vt;
      endAt = 0;
      last = 'match';
      continue;
    }
    if (start < 0) continue;
    if (msg.type === 'phase') continue;
    let at = vt - start;
    let ms = 0;
    let name = msg.type;
    if (msg.type === 'event') {
      const ev = msg.event as { type: string; at: number; data?: { ms?: number } };
      at = ev.at;
      ms = ev.data?.ms ?? 0;
      name = ev.type;
    }
    const silence = at - endAt;
    if (silence > over) out.push({ from: last, to: name, at: endAt, ms: Math.round(silence) });
    endAt = Math.max(endAt, at + ms);
    last = name;
    if (msg.type === 'match_end') {
      finish = at;
      break;
    }
  }
  return { gaps: out, durationMs: Math.round(finish) };
}

export const fmtMs = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function sources(tx: Transcript): Record<string, number> {
  const c: Record<string, number> = { model: 0, bank: 0, fallback: 0 };
  for (const l of tx.lines) c[l.source] = (c[l.source] ?? 0) + 1;
  return c;
}

export function wordViolations(tx: Transcript): number {
  return tx.rejected.filter((r) => r.reason.startsWith('words')).length + tx.lines.filter((l) => l.words > l.maxWords).length;
}

export const nameOf = (tx: Transcript, id: string) =>
  id === tx.star.id ? tx.star.name : (tx.suitors.find((s) => s.id === id)?.name ?? id);
