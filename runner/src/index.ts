import { makeChain } from './chain/index.ts';
import { createApp } from './server.ts';
import { coinflipChannel } from './channels/coinflip.ts';
import { diceDuelChannel } from './channels/diceduel.ts';
import type { ChannelDef } from './types.ts';
import { log } from './lib/log.ts';

// Real games live in games/<id>/ and are loaded only when asked for, by a computed path, so each
// game is type-checked by its own tsconfig and a game that is not wanted is never loaded.
const game = (id: string) => async (): Promise<ChannelDef> => {
  const path = new URL(`../../games/${id}/channel.ts`, import.meta.url).href;
  const mod = (await import(path)) as { default: () => ChannelDef };
  return mod.default();
};

const ALL: Record<string, () => ChannelDef | Promise<ChannelDef>> = {
  coinflip: () => coinflipChannel(),
  'dice-duel': () => diceDuelChannel(),
  tumbletop: game('tumbletop'),
  scrivener: game('scrivener'),
  brawl: game('brawl'),
};

async function main() {
  const port = Number(process.env.PORT ?? 8787);
  const chain = await makeChain();
  const wanted = (process.env.CHANNELS ?? Object.keys(ALL).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const channels = await Promise.all(
    wanted.map((id) => {
      const make = ALL[id];
      if (!make) throw new Error(`unknown channel ${id} (known: ${Object.keys(ALL).join(', ')})`);
      return make();
    }),
  );
  // House bots: BOT_TICK_MS / BOT_BET_CHANCE slow them down (on a public Solana RPC every bet is a
  // transaction and the default pace runs into its rate limits). Unset = the defaults in bots.ts.
  const envNum = (k: string) => (process.env[k] !== undefined && Number.isFinite(Number(process.env[k])) ? Number(process.env[k]) : undefined);
  const botOpts = { tickMs: envNum('BOT_TICK_MS'), betChance: envNum('BOT_BET_CHANCE') };
  const houseBots = process.env.HOUSE_BOTS === '1' ? (botOpts.tickMs === undefined && botOpts.betChance === undefined ? true : botOpts) : false;
  const app = createApp({ chain, channels, houseBots });
  const actual = await app.start(port, process.env.HOST);
  log.info(`arena runner on :${actual} chain=${chain.kind} channels=${wanted.join(',')} debug=http://localhost:${actual}/dev`);

  let stopping = false;
  const stop = async () => {
    if (stopping) process.exit(1);
    stopping = true;
    log.info('stopping (voiding open windows)...');
    await app.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('unhandledRejection', (e) => log.error('unhandledRejection', e));
}

main().catch((e) => {
  log.error(e);
  process.exit(1);
});
