// House bettors (HOUSE_BOTS=1): a few clearly labelled bot accounts that place small random bets
// while windows are open, so pools and odds move when few humans are around.
// They appear in snapshot.bots, their payouts carry `bot: true`, and their chat lines carry `bot: true`.
import type { Hub } from './hub.ts';
import { UNIT } from './types.ts';
import { log } from './lib/log.ts';

const NAMES = ['HouseBot Ada', 'HouseBot Bo', 'HouseBot Cy', 'HouseBot Dee'];
const TOP_UP_BELOW = 100 * UNIT;
const TOP_UP = 1000 * UNIT;

export interface BotOpts {
  count?: number;
  tickMs?: number;
  /** Chance per bot per tick of betting on each open window. */
  betChance?: number;
  chatChance?: number;
}

export async function startHouseBots(hub: Hub, signal: AbortSignal, o: BotOpts = {}) {
  const count = Math.min(o.count ?? 4, NAMES.length);
  const tickMs = o.tickMs ?? 1500;
  const betChance = o.betChance ?? 0.2;
  const chatChance = o.chatChance ?? 0.25;
  const bots: { owner: string; name: string }[] = [];
  for (const name of NAMES.slice(0, count)) {
    const owner = await hub.chain.botAccount(name);
    bots.push({ owner, name });
    hub.bots.push({ owner, name });
    hub.botOwners.add(owner);
  }
  log.info(`house bots on: ${bots.map((b) => b.name).join(', ')}`);

  const busy = new Set<string>();
  const tick = async () => {
    for (const w of hub.openWindows()) {
      if (w.closesAt - Date.now() < 1500) continue;
      for (const bot of bots) {
        if (busy.has(bot.owner) || Math.random() > betChance) continue;
        busy.add(bot.owner);
        try {
          const bal = await hub.chain.getBalance(bot.owner);
          if (bal < TOP_UP_BELOW) await hub.chain.grant(bot.owner, TOP_UP);
          // Lean towards the smaller pool so the odds stay interesting.
          const n = w.outcomes.length;
          let outcome = Math.floor(Math.random() * n);
          if (Math.random() < 0.5) outcome = w.pools.indexOf(Math.min(...w.pools));
          const amount = (1 + Math.floor(Math.random() * 25)) * UNIT;
          await hub.chain.botBet(bot.owner, w.market, outcome, amount);
          await hub.refreshPools(w);
          if (Math.random() < chatChance) {
            hub.chatMsg(w.channel, bot.name, `${amount / UNIT} on ${w.outcomes[outcome]!.label}`, true);
          }
        } catch (e) {
          log.warn(`${bot.name} bet failed: ${(e as Error).message}`);
        } finally {
          busy.delete(bot.owner);
        }
      }
    }
  };
  const timer = setInterval(() => void tick(), tickMs);
  signal.addEventListener('abort', () => clearInterval(timer), { once: true });
  return bots;
}
