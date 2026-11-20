// Records and three-line memories across episodes, in .cache/memory.json (or in memory only).
// Memories are written by template, e.g. "Ep 12: cut in round one by Vesper. Brock won."

import type { CastIds } from './cast.ts';
import { readJson, writeJson } from './paths.ts';

export interface Rec {
  played: number;
  wins: number;
}

export interface MemoryData {
  episode: number; // last finished episode number
  records: Record<string, Rec>;
  memories: Record<string, string[]>;
  /** lines each bot said recently (newest last), so models avoid repeats */
  recent: Record<string, string[]>;
  lastCast?: CastIds;
  upcoming?: CastIds;
  recentQuestions: string[];
}

export interface EpisodeSummary {
  episode: number;
  star: { id: string; name: string };
  winner: { id: string; name: string };
  loser: { id: string; name: string };
  cuts: { id: string; name: string; round: 1 | 2 }[];
  question?: string;
  /** every aired line by bot id */
  lines: { who: string; text: string }[];
  cast: CastIds;
}

const ROUND_WORD = { 1: 'one', 2: 'two' } as const;

export class MemoryStore {
  readonly path: string | null;
  data: MemoryData;

  constructor(path: string | null = null, seed?: Partial<MemoryData>) {
    this.path = path;
    const loaded = path ? readJson<Partial<MemoryData>>(path) : null;
    const d = { ...(seed ?? {}), ...(loaded ?? {}) };
    this.data = {
      episode: d.episode ?? 0,
      records: d.records ?? {},
      memories: d.memories ?? {},
      recent: d.recent ?? {},
      lastCast: d.lastCast,
      upcoming: d.upcoming,
      recentQuestions: d.recentQuestions ?? [],
    };
  }

  /** An in-memory copy (tools read the real file but never write it). */
  static readOnlyCopy(path: string): MemoryStore {
    const m = new MemoryStore(path);
    return new MemoryStore(null, structuredClone(m.data));
  }

  record(id: string): Rec {
    const r = this.data.records[id];
    return r ? { played: r.played, wins: r.wins } : { played: 0, wins: 0 };
  }
  memory(id: string): string[] {
    return (this.data.memories[id] ?? []).slice(-3);
  }
  recentLines(id: string): string[] {
    return (this.data.recent[id] ?? []).slice(-12);
  }
  nextEpisode(): number {
    return this.data.episode + 1;
  }

  /** Apply one finished episode: records, memories, recent lines, last cast. */
  apply(s: EpisodeSummary) {
    const d = this.data;
    d.episode = Math.max(d.episode, s.episode);
    const bump = (id: string, win: boolean) => {
      const r = this.record(id);
      d.records[id] = { played: r.played + 1, wins: r.wins + (win ? 1 : 0) };
    };
    const remember = (id: string, line: string) => {
      d.memories[id] = [...(d.memories[id] ?? []), line].slice(-3);
    };
    const ep = `Ep ${s.episode}:`;
    bump(s.star.id, false);
    bump(s.winner.id, true);
    bump(s.loser.id, false);
    for (const c of s.cuts) bump(c.id, false);
    for (const c of s.cuts) remember(c.id, `${ep} cut in round ${ROUND_WORD[c.round]} by ${s.star.name}. ${s.winner.name} won.`);
    remember(s.loser.id, `${ep} made the final with ${s.star.name}, lost to ${s.winner.name}.`);
    remember(s.winner.id, `${ep} won ${s.star.name} over, beat ${s.loser.name} in the final.`);
    const first = s.cuts.find((c) => c.round === 1);
    remember(s.star.id, `${ep} picked ${s.winner.name} over ${s.loser.name}.${first ? ` Cut ${first.name} first.` : ''}`);
    for (const l of s.lines) d.recent[l.who] = [...(d.recent[l.who] ?? []), l.text].slice(-12);
    d.lastCast = s.cast;
    if (s.question) d.recentQuestions = [...d.recentQuestions, s.question].slice(-6);
  }

  save() {
    if (!this.path) return;
    try {
      writeJson(this.path, this.data);
    } catch {
      /* a full disk must not stop the show */
    }
  }
}
