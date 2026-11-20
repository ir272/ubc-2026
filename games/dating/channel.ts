// Compatibility Mode: the dating show channel. Default export () => ChannelDef, like
// runner/src/channels/coinflip.ts. One run() = one episode; the runner loops it forever.
//
// Env (read from the process, else from games/dating/.env, never printed):
//   DATING_BRAINS      scripted | model     (default scripted)
//   DATING_BUDGET_USD  real-model budget    (default 1.50)
//   DATING_SPEED       time scale for tests (default 1; 2 = twice as fast)

import fs from 'node:fs';
import path from 'node:path';
import type { ChannelDef, Show, Win } from '../../runner/src/types.ts';
import { ROOT } from './show/paths.ts';
import { createSession, type Session } from './show/session.ts';
import { SHOW_TITLE } from './show/episode.ts';

/** Loads games/dating/.env into process.env without overriding what is already set. */
export function loadEnv(file = path.join(ROOT, '.env')) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2]!;
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (process.env[m[1]!] === undefined && v !== '') process.env[m[1]!] = v;
  }
}

/** Wraps a Show so sleeps and window durations run `speed` times faster; `at` stays in speed-1 ms. */
export function scaledShow(show: Show, speed: number): Show {
  if (!(speed > 0) || speed === 1) return show;
  return {
    announce: (m) => show.announce(m),
    openWindow: (w) => show.openWindow({ ...w, durationMs: Math.max(1000, Math.round(w.durationMs / speed)) }),
    lock: (w: Win) => show.lock(w),
    emit: (e) => show.emit({ ...e, at: Math.round(show.elapsed() * speed) }),
    settle: (w, id) => show.settle(w, id),
    voidWindow: (w) => show.voidWindow(w),
    sleep: (ms) => show.sleep(Math.max(0, Math.round(ms / speed))),
    end: (r) => show.end(r),
    elapsed: () => Math.round(show.elapsed() * speed),
    get signal() {
      return show.signal;
    },
  };
}

export interface DatingChannelOpts {
  brains?: 'scripted' | 'model';
  budgetUsd?: number;
  speed?: number;
  /** default 'persist' (.cache/memory.json) */
  memory?: 'persist' | 'readonly' | 'fresh';
  /** bank-line LRU file; null keeps it in memory (default .cache/used.json) */
  usedPath?: string | null;
  log?: (s: string) => void;
}

export default function datingChannel(o: DatingChannelOpts = {}): ChannelDef {
  loadEnv();
  const env = process.env;
  const brains = o.brains ?? (env.DATING_BRAINS === 'model' ? 'model' : 'scripted');
  const budgetUsd = o.budgetUsd ?? (Number(env.DATING_BUDGET_USD) > 0 ? Number(env.DATING_BUDGET_USD) : 1.5);
  const speed = o.speed ?? (Number(env.DATING_SPEED) > 0 ? Number(env.DATING_SPEED) : 1);
  const log = o.log ?? ((s: string) => console.log(`[dating] ${s}`));
  let session: Promise<Session> | null = null;

  return {
    id: 'dating',
    title: SHOW_TITLE,
    intermissionMs: Math.round(6000 / speed),
    async run(show: Show) {
      session ??= createSession({ brains, budgetUsd, memory: o.memory ?? 'persist', ...(o.usedPath !== undefined ? { usedPath: o.usedPath } : {}), log }).catch((e) => {
        session = null;
        throw e;
      });
      const s = await session;
      const tx = await s.runOne(scaledShow(show, speed));
      const name = (id: string) => tx.suitors.find((x) => x.id === id)?.name ?? id;
      log(`episode ${tx.episode}: ${tx.star.name} picked ${name(tx.pick.winner)} over ${name(tx.pick.loser)} (${Math.round(tx.durationMs / 1000)} s, ${tx.late} late lines, ${tx.rejected.length} rejected)`);
    },
  };
}
