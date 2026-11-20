// The house roster: 24 Gumbles with permanent names, looks and stats. All original.
//
// Stats run 2..9. They are permanent, they never depend on a seed, and each one changes something
// a viewer can see:
//   speed   flat-out pace and how quickly it gets back up to it
//   grip    footing: stays on tilting rulers, is thrown less far by a hit, shrugs off barges
//   bounce  bounce back: time spent on the floor after a hit and waiting to drop back in after a fall
//   nerve   takes the bold line and leaves less margin at a hazard (quicker, and hit more often)
// `trait` is the one word shown to viewers: the Gumble's best stat.

export const STAT_KEYS = ['speed', 'grip', 'bounce', 'nerve'];
export const TRAIT_WORD = { speed: 'Quick', grip: 'Sure-footed', bounce: 'Bouncy', nerve: 'Fearless' };

const R = (id, name, a, b, pattern, speed, grip, bounce, nerve) => ({ id, name, colors: [a, b], pattern, stats: { speed, grip, bounce, nerve } });

const LIST = [
  R('juniper', 'Juniper', '#3a86ff', '#ffd23f', 'stripes', 9, 4, 4, 5),
  R('noodle', 'Noodle', '#ffd23f', '#ff4f6d', 'spots', 8, 3, 6, 5),
  R('fizz', 'Fizz', '#00b4d8', '#f4f1de', 'star', 8, 4, 3, 7),
  R('kiwi', 'Kiwi', '#7ed957', '#5a3e9b', 'split', 8, 5, 5, 4),
  R('pickle', 'Pickle', '#1b998b', '#ffd23f', 'spots', 7, 4, 4, 7),
  R('sprocket', 'Sprocket', '#fb5607', '#f4f1de', 'stripes', 7, 5, 3, 7),
  R('pippin', 'Pippin', '#ff4f6d', '#f4f1de', 'gradient', 7, 6, 5, 4),
  R('ziggy', 'Ziggy', '#8f5cff', '#ffd23f', 'star', 7, 3, 4, 8),
  R('marzipan', 'Marzipan', '#ffb4a2', '#ef476f', 'gradient', 6, 5, 4, 7),
  R('clementine', 'Clementine', '#ff8a3d', '#7ed957', 'split', 6, 7, 5, 4),
  R('wobble', 'Wobble', '#ff6ad5', '#3a86ff', 'spots', 6, 2, 8, 6),
  R('sherbet', 'Sherbet', '#06d6a0', '#ff6ad5', 'gradient', 6, 4, 6, 6),
  R('pemberton', 'Pemberton', '#5a3e9b', '#ff8a3d', 'stripes', 5, 8, 5, 4),
  R('truffle', 'Truffle', '#ef476f', '#2ec4b6', 'split', 5, 6, 6, 5),
  R('crumpet', 'Crumpet', '#f4f1de', '#fb5607', 'spots', 5, 7, 4, 6),
  R('gherkin', 'Gherkin', '#7ed957', '#ff4f6d', 'star', 5, 4, 5, 8),
  R('biscuit', 'Biscuit', '#ff8a3d', '#5a3e9b', 'spots', 4, 6, 8, 4),
  R('bramble', 'Bramble', '#2ec4b6', '#f4f1de', 'stripes', 4, 9, 5, 4),
  R('taffy', 'Taffy', '#ff6ad5', '#f4f1de', 'stripes', 4, 5, 7, 6),
  R('boop', 'Boop', '#3a86ff', '#ff6ad5', 'gradient', 4, 6, 6, 6),
  R('mochi', 'Mochi', '#f4f1de', '#8f5cff', 'gradient', 4, 5, 9, 4),
  R('waffles', 'Waffles', '#ffd23f', '#1b998b', 'split', 3, 7, 7, 5),
  R('dumpling', 'Dumpling', '#00b4d8', '#fb5607', 'split', 3, 8, 7, 4),
  R('turnip', 'Turnip', '#8f5cff', '#06d6a0', 'spots', 2, 8, 8, 4),
];

function traitOf(stats) {
  let best = STAT_KEYS[0];
  for (const k of STAT_KEYS) if (stats[k] > stats[best]) best = k;
  return best;
}

export const ROSTER = LIST.map((g, num) => {
  const top = traitOf(g.stats);
  return { ...g, num, topStat: top, trait: TRAIT_WORD[top] };
});

const BY_ID = new Map(ROSTER.map((g) => [g.id, g]));

/** Roster entry for an id (or for an Entrant-like object with an id). Throws on an unknown id. */
export function gumble(idOrEntrant) {
  const id = typeof idOrEntrant === 'string' ? idOrEntrant : idOrEntrant?.id;
  const g = BY_ID.get(id);
  if (!g) throw new Error(`unknown Gumble "${id}"`);
  return g;
}

/** Stat as 0..1 (2 maps to 0, 9 to 1). */
export function stat01(v) { return Math.min(1, Math.max(0, (v - 2) / 7)); }
