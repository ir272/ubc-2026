// Short "About" text per channel (one paragraph: how the game works and how a match is decided).
// Add an entry when a game is registered in src/games/registry.ts.
import { FIXTURE } from './lib/dev';
import { fxAbout } from './fixture';

const ABOUT: Record<string, string> = {
  coinflip:
    'Two racers run a 110-metre track. Each step is drawn from a random seed that is sealed before betting opens and only becomes known after it closes, so nobody, including us, can know the winner while bets are open. First across the line wins.',
  'dice-duel':
    'Two players roll three dice each, over two rounds. Round 1 is decided by a seed sealed before betting opens; round 2 is rolled only after its betting closes. Higher total wins the round; equal totals are a tie.',
};

export const aboutFor = (channel: string) =>
  FIXTURE ? fxAbout(channel) : (ABOUT[channel] ?? 'AI plays AI live. Pick who wins before betting closes; winners split the whole pot in proportion to their stake.');

// The kind of show each channel is: the second line under its name, like a stream's category.
const KIND: Record<string, string> = {
  scrivener: 'Boss duel',
  brawl: 'Platform fighter',
  tumbletop: 'Battle royale',
  coinflip: 'Race',
  'dice-duel': 'Dice',
};
export const kindFor = (channel: string) => KIND[channel] ?? 'Live game';
