// Mock brains: scripted minds with believable delays. All visual work runs on these.
// Pure apart from the delay hints they return (`thinkMs`), which the script waits out.

import { makeRng, rand, range, pick, hash2, hashString } from '../core/rng.js';
import { mockPick } from '../sim/loadout.js';
import { mockDecide, mockThought, mockLearn } from '../sim/mock.js';

// Why a mock picked a plate: one or two lines per item, plus lines that answer the temper.
const WHY = {
  duelist: ['Past it, then cut. That is the whole plan.', 'I trust my feet more than any shield.'],
  warden: ['Let it hit the shield. I will still be standing.', 'Six strokes is a long time to stand firm.'],
  thief: ['It cannot kill what it cannot catch.', 'Small, quick, gone before the blade lands.'],
  hexer: ['Mark it once and every cut counts double.', 'More spells. The book hates spells.'],
  archivist: ['I have read this ledger. I know each stroke.', 'Knowing the attack is half the dodge.'],
  penitent: ['I will bleed for it, and it will bleed more.', 'Hit me. I hit harder hurt.'],
  sabre: ['Three quick cuts fit in any opening.', 'Fast enough to punish every miss.'],
  maul: ['One blow that breaks its stance.', 'Slow, but it only has to land twice.'],
  knives: ['Four cuts before it finishes blinking.', 'Short reach, but nothing is quicker.'],
  pole: ['I can hit it from where it cannot hit me.', 'Reach is safety.'],
  censer: ['Set it burning and let the fire work.', 'The burn keeps cutting while I dodge.'],
  quill: ['Its own pen cuts deepest while it writes.', 'Catch it mid-stroke and it folds.'],
  candle: ['Fire from across the hall. No risk.', 'A bolt I can throw while backing off.'],
  blot: ['One blow simply will not happen.', 'A free mistake is worth a lot here.'],
  margin: ['Behind it in a blink, blade already moving.', 'Its back is the softest page.'],
  knot: ['Tie it mid-swing and take the whole window.', 'One knot at the right time wins this.'],
  mend: ['The only healing in this hall is mine.', 'I will need the blood back.'],
  echo: ['My best strike, twice.', 'Double the one blow that matters.'],
  seal: ['It gets to kill me once for free.', 'One death I am allowed to ignore.'],
  bookmark: ['More blood to spend.', 'Simple. I last longer.'],
  ribbon: ['Cleaner dodges, every single time.', 'I plan to dodge a lot.'],
  ember: ['Every cut leaves fire behind.', 'Burn stacks while I move.'],
  nib: ['I am strongest right before the end.', 'Hurt me and regret it.'],
  sandglass: ['A seventh stroke is a seventh chance.', 'More time is more damage.'],
  lens: ['A longer opening after every swing.', 'It stays open. I stay greedy.'],
};
const VS_TEMPER = {
  tinder: { candle: 'It is dry as tinder. Fire.', censer: 'Dry paper, burning censer. Easy.', ember: 'Tinder temper. Everything should burn.' },
  ironbound: { maul: 'Iron-bound. Small cuts are wasted; bring the maul.', penitent: 'Only heavy blows bite tonight.', hexer: 'Spells still bite through iron.' },
  slow: { duelist: 'It turns slowly. I will live behind it.', thief: 'Slow to turn means my back-stab lands.', margin: 'Slow to turn. Blink behind and feast.' },
  enraged: { warden: 'It hits harder tonight. So I bring a wall.', bookmark: 'Enraged. I want the extra blood.', seal: 'Enraged hits kill. The seal says no once.' },
  restless: { warden: 'Pages everywhere. A shield stops paper.', archivist: 'Restless pages. I will jump what I cannot block.', thief: 'Lots to leap tonight.' },
  counting: { knives: 'It writes names. Knives break the pen fastest.', quill: 'It will be writing all night. Perfect.', sabre: 'Quick cuts stop the writing.' },
};

const NOTE_BY_RESULT = {
  death: [
    'Do not stand in front of the long blade.', 'The slow windup is the trap. Move on the flash.',
    'Strike only after it buries the pen.', 'When the ink ring follows me, hit it or run.',
    'Greed killed me. One cut fewer next time.',
  ],
  written: [
    'Too careful. The name finished before the kill.', 'Spend the spell early, not on the last stroke.',
    'Every stroke needs a cut. Dodging alone loses.',
  ],
};
const SAY = {
  win: ['Deeper than you. That is all it takes.', 'Told you. Read the pose, then cut.', 'It wrote slower than I struck.', 'A good page to end on.'],
  loss: ['It finished my name. I will remember the stroke.', 'Next time I pick for the temper, not for pride.', 'Close. The book blinked first, just not enough.', 'I know what killed me. That is something.'],
};

export function createMockBrain(bot, { seed = 1 } = {}) {
  const rng = makeRng(hash2(seed, hashString(bot.id)));
  // Each scripted bot has a base error rate of its own and a form that swings from match to
  // match, like the mixed field the balance tool measures (tools/balance.mjs --field).
  const base = 0.38 + 0.26 * ((hashString(`form:${bot.id}`) % 1000) / 1000);
  const mind = { fam: {}, skill: base };
  return {
    kind: 'mock',
    label: 'mock',
    async pick({ slot, options, temper, mine }) {
      if (slot === 'cls') {
        // a new match: tonight's form, and nothing learned yet about this boss's mood
        mind.skill = Math.max(0.1, Math.min(0.95, base + range(rng, -0.33, 0.33)));
        mind.fam = {};
      }
      const ids = options.map((o) => o.id);
      const choice = mockPick(slot, ids, { temper: temper.id, mine, rng });
      const vs = VS_TEMPER[temper.id] && VS_TEMPER[temper.id][choice];
      const reason = vs && rand(rng) < 0.8 ? vs : pick(rng, WHY[choice] || ['This one feels right.']);
      return { choice, reason, source: 'mock', thinkMs: range(rng, 1800, 3400) };
    },
    async decide({ world, moves }) {
      const d = mockDecide(world, rng, mind);
      const move = moves[d.slot] || moves[0];
      return { slot: d.slot, line: mockThought(move, rng), source: d.slip ? 'mock-slip' : 'mock', thinkMs: range(rng, 1600, 2600) };
    },
    async note({ world, record }) {
      // what hurt is remembered for the next try
      if (world && world.log) mockLearn(mind.fam, { decisions: world.log.decisions.map((d) => ({ attackId: d.attackId, hurt: (d.damageTaken || 0) > 0 })), killedBy: record.killedBy });
      const pool = NOTE_BY_RESULT[record.result] || NOTE_BY_RESULT.death;
      return { text: pick(rng, pool), source: 'mock' };
    },
    async say({ kind }) {
      return { text: pick(rng, SAY[kind] || SAY.loss), source: 'mock' };
    },
  };
}
