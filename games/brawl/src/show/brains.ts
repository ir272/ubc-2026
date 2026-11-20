// The minds. Two kinds, one interface:
//   mockBrains(...)              scripted coaches from the sim (COACHES) with realistic think delays
//   createOpenRouterBrains(...)  real models through OpenRouter, any model id from bots.json
//
// This file runs in node and the browser: no node imports here. Node-only pieces (reading .env,
// the cost log file, the real fetch) are in brains.node.ts.
//
// The script owns the content check (content.ts) and the timing rules. Brains only answer.

import type { CoachView, FighterId, Plan, Stance } from '../sim/types.ts';
import { DEFAULT_PLAN, FIGHTER_IDS, STANCES } from '../sim/types.ts';
import { COACHES, sanitizePlan } from '../sim/index.ts';
import type { FighterCard } from './events.ts';

export interface BotConfig {
  id: string;
  name: string;
  model: string;
  instructions: string;
  look?: string;
  voice?: string;
  /** optional short model label for the HUD; derived from `model` when absent */
  label?: string;
}

export interface Brains {
  pickFighter(bot: BotConfig, info: { roster: FighterCard[]; opponent: { name: string; model: string }; memory: string[] }): Promise<FighterId>;
  taunt(bot: BotConfig, info: { mine: FighterId; theirs: FighterId; opponentName: string }): Promise<string>; // 10 words at most
  plan(bot: BotConfig, view: CoachView, prev: Plan): Promise<Plan>; // may be slow; the fight never waits
  corner(bot: BotConfig, info: { view: CoachView; lostLife: boolean; prev: Plan }): Promise<{ plan: Plan; talk: string }>; // talk 12 words at most
  remember(bot: BotConfig, info: { won: boolean; summary: string }): Promise<string>; // one memory line
  /** optional: the script calls this first with [side 0, side 1] so mock coaches know their side */
  startMatch?(bots: [BotConfig, BotConfig]): void;
}

const FIGHTER_NAMES: Record<FighterId, string> = { kiln: 'Kiln', tick: 'Tick', gantry: 'Gantry', vise: 'Vise' };

/** "anthropic/claude-haiku-5.5" -> "Claude Haiku 5.5" (HUD label, no provider) */
export function modelLabel(model: string): string {
  const tail = String(model || '').split('/').pop() || String(model || '');
  const clean = tail.replace(/:.*$/, '').replace(/-\d{4}-?\d{2}-?\d{2}$/, '').replace(/-\d{8}$/, '');
  return clean
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => (/^[a-z]/.test(w) ? w[0]!.toUpperCase() + w.slice(1) : w.toUpperCase() === w ? w : w))
    .join(' ')
    .slice(0, 24);
}

// ------------------------------------------------------------------------------------------------
// Line banks. Plain words: no em dashes, no emoji. {mine} {theirs} {opp} are filled in.
// ------------------------------------------------------------------------------------------------

export const READS: Record<Stance, string[]> = {
  rush: [
    'Close the gap and stay on them', 'In their face until they crack', 'Walk them back to the edge',
    'Lean on the shield, it will break', 'Every step forward, none back', 'Run in, grab, do it again',
    'Make them block all day', 'They hate it up close, so go', 'Chase every landing', 'Hit first, ask later',
    'No space, no air, no rest', 'Pin them to the ledge', 'Keep the swings coming',
    'Pressure until the corner runs out', 'Take the centre by force', 'They are slow to start, crowd them',
    'Short hops and strings, right on top', 'Too much respect earlier, not now', 'Beat them to the punch',
    'Run the deck, take the space', 'Push, push, push', 'Their shield is tired, test it',
    'Stop waiting, start hitting', 'Get under them and stay there', 'Drag this into a brawl',
    'Our pace now, not theirs', 'One hit opens the next', 'Smother the shots before they start',
    'Fast in, faster out, then in again', 'Make every second hurt',
  ],
  keepaway: [
    'Hold the line, poke from range', 'Let them walk into the long ones', 'Space it out, chip them down',
    'Back off and make them come', 'Stay at the tip of reach', 'Shots first, questions never',
    'Every approach costs them something', 'Keep the deck between us', 'Retreat, poke, retreat again',
    'No reason to fight up close', 'Patience, the percent will climb', 'They cannot touch what is far away',
    'Wall them out with pokes', 'Back up, then sting the approach', 'Make the gap the whole game',
    'Chip, chip, chip', 'Hold the platform, rain down shots', 'Let them chase and whiff',
    'Long range is our home', 'Take the free damage', 'They have to come through it',
    'Out of reach, still hurting them', 'Every step in gets punished', 'Fade back and fire',
    'Space is the weapon here', 'Make them earn every inch', 'Pick at the edges of their range',
    'No scrambles, clean pokes only', 'Kite them across the deck', 'Run out their patience',
  ],
  bait: [
    'Show an opening, then close it', 'Let them swing at nothing', 'Dance at the edge of range',
    'Make them commit first', 'Wait for the whiff, then punish', 'Look slow, be fast',
    'They bite every time, so bait', 'Stand just out of reach', 'Hover, feint, punish',
    'Give them a target that moves', 'Draw the swing, take the reward', 'Fake the approach, then pull back',
    'Their grab whiffs, our turn', 'Lure them off the centre', 'Every miss gets punished hard',
    'Patience wins this exchange', 'Tempt them in', 'Make them guess wrong',
    'Step in, step out, let them flinch', 'They are hungry, starve them', 'Dash back and catch the lunge',
    'Feed them a fake opening', 'Read the swing, answer it', 'Hang back and watch the habits',
    'Nothing free, make them reach', 'Sit just past their reach', 'Let them overextend',
    'Counterpunch only', 'Bait the jump, punish the landing', 'Calm hands, sharp punish',
  ],
  wall: [
    'Hold the middle, let them come', 'Shield up, punish out of it', 'Own the centre, do not chase',
    'Nothing gets past the middle', 'Block it, then make them pay', 'Plant the feet, guard the deck',
    'Swat them out of the air', 'Let them hit the shield', 'Stay home and stay solid',
    'Anti air everything', 'Centre stage is ours, keep it', 'Do not chase, they come back',
    'Absorb, then answer', 'Shield, wait, counter', 'Rooted in the middle',
    'Every approach meets a wall', 'Let them tire out on the shield', 'Hold ground, punish landings',
    'They must come through us', 'Stand firm, strike back', 'Guard up, eyes open',
    'Stay calm, stay central', 'Patience in the middle', 'Turn their pressure into our punish',
    'Block the rush, break the rhythm', 'Make the centre a fortress', 'No chasing, no gifts',
    'Catch them on the way down', 'Hold position, hit out of shield', 'Brace and answer',
  ],
};

export const ORDER_READS: Record<'kill' | 'special', string[]> = {
  kill: [
    'They are high, go for the kill', 'Time to finish it', 'One clean hit ends this', 'Send them out',
    'Big swing, right now', 'Close the life out', 'They are ripe, take it', 'Look for the launcher',
    'End it on the next opening', 'Hunt the finishing blow', 'Out of the ring, now', 'Heavy hit, no hesitation',
  ],
  special: [
    'Use the signature move now', 'Break out the special', 'Time for the big tool',
    'Special on the next opening', 'Show them the signature', 'Surprise them with the special',
    'Special, then follow up', 'Pull the special out now', 'Signature move, catch them cold', 'Lead with the special',
  ],
};

export const TAUNTS: string[] = [
  '{opp}, you picked the wrong robot.', '{mine} has been waiting all week for this.',
  'I hope {theirs} came with spare parts.', 'You will be off the deck in a minute.',
  'Tell {theirs} to say goodbye to the deck.', 'I read your last match. I took notes.',
  'Big crowd tonight. Shame you will leave early.', 'Fight me in the middle, if you can.',
  '{theirs}? Bold choice. Wrong, but bold.', 'My plan is simple. Yours is about to fail.',
  'Bring your best. I brought better.', 'Keep your shield up. It will not help.',
  'I hope you practised recovering.', 'This deck is not big enough for both of us.',
  'No hard feelings when you fly.', 'Nice paint job. It will scratch.', 'I already know your first move.',
  'Let us find out who thinks faster.', '{mine} does not lose twice.', 'You blink, you fly.',
  'Hope you like the view from the blast line.', 'I will keep this short.', 'Ready to see your record drop?',
  'The ledge is mine tonight.', '{opp}, I have seen your habits. All of them.', 'One plan. One robot. One result.',
  'Do not worry, the replay will be quick.', 'Last time was a warm up.', 'Every percent counts. You will feel them all.',
  'Good luck. You will need it.', 'Your robot looks nervous.', 'Step into my range. I dare you.',
  'Keep running. The deck ends somewhere.', '{theirs} is fast. {mine} is faster where it counts.',
];

export const CORNER_LINES: Record<'lost' | 'took', string[]> = {
  lost: [
    'Shake it off, we know their pattern now.', 'That was on me. New plan, same fight.',
    'They got one. We get the next two.', 'Stop feeding them the ledge.', 'We were too greedy. Slow it down.',
    'Fine. We go back to basics.', 'They read our recovery. Mix it up.', 'Too many swings in the air. Stay grounded.',
    'Forget that one. Next life, our pace.', 'They want us to chase. We will not.',
    'Reset. Breathe. Take the centre back.', 'We lost the life, not the match.', 'Make them come to us this time.',
    'Shield less, move more.', 'They punished the landing. Land somewhere else.',
    'Different angle now. They will not see it.', 'New life, clean slate, sharper plan.',
    'We gave that away. Take it back.', 'Still two robots standing. Still our fight.', 'Time to stop being polite.',
    'Back to the middle and hold it.', 'They are good at range. Get inside.',
    'Every grab they landed, we answer with distance.', 'We fought their fight. Now we fight ours.',
    'Slow hands lost that one. Faster now.', 'Stay on stage, no more deep chases.',
    'They are tired too. Push the pace.', 'Keep the shield fresh, they love to grab.',
    'The comeback starts with the first clean hit.', 'They are at {oppDmg} percent. Make it count.',
  ],
  took: [
    'Good. Same again, do not change a thing.', 'That is how it is done. Keep the pressure.',
    'They are rattled. Stay on them.', 'One down. Do not get careless.', 'They will panic now. Wait for it.',
    'Clean finish. Now protect the lead.', 'Keep the centre, let them come to us.',
    'They will try something new. Be ready.', 'Lovely read. Same plan, sharper.',
    'Do not celebrate yet. Finish the job.', 'They have to take risks now. Punish them.',
    'Stay calm, the lead is ours.', 'That launcher works. Look for it again.',
    'Do not chase. Let them make mistakes.', 'Same rhythm, same result.', 'Their recovery is weak. Go hunting.',
    'A lead is nice. Two lives is nicer.', 'Keep them off the ledge.', 'They will rush now. Let them.',
    'Smart hands, smart plan. Keep going.', 'We own this deck. Act like it.', 'Bank the lead, take no silly risks.',
    'Watch for the comeback swing. Shield it.', 'That was the plan. More of it.', 'Breathe. Then do it again.',
    'They know we are faster now.', 'No mercy on the respawn.', 'Make them come off the pad scared.',
    'Pressure the landing after the respawn.', 'Great work. Now close it out.',
  ],
};

function fill(line: string, v: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined ? String(v[k]) : ''));
}

/** A shuffle bag per bank so a show does not repeat itself until the bank runs out. */
function bag(rand: () => number) {
  const used = new Map<string[], Set<number>>();
  return (lines: string[]): string => {
    let u = used.get(lines);
    if (!u || u.size >= lines.length) used.set(lines, (u = new Set()));
    let i = Math.floor(rand() * lines.length);
    for (let k = 0; k < lines.length && u.has(i); k++) i = (i + 1) % lines.length;
    u.add(i);
    return lines[i]!;
  };
}

/** Safe lines for the content check's last resort (and for fallbacks). */
export function safeLine(kind: 'read' | 'taunt' | 'corner' | 'memory', rand: () => number, o: { stance?: Stance; lost?: boolean; mine?: FighterId; theirs?: FighterId; opp?: string; oppDmg?: number } = {}): string {
  const pick = (a: string[]) => a[Math.floor(rand() * a.length)]!;
  const v = { mine: FIGHTER_NAMES[o.mine ?? 'kiln'], theirs: FIGHTER_NAMES[o.theirs ?? 'tick'], opp: o.opp ?? 'friend', oppDmg: Math.round(o.oppDmg ?? 0) };
  if (kind === 'read') return pick(READS[o.stance ?? 'bait']);
  if (kind === 'taunt') return fill(pick(TAUNTS.filter((t) => !t.includes('{opp}') || o.opp)), v);
  if (kind === 'corner') return fill(pick(CORNER_LINES[o.lost ? 'lost' : 'took'].filter((t) => !t.includes('{oppDmg}'))), v);
  return 'Played hard. Learn and go again.';
}

// ------------------------------------------------------------------------------------------------
// Mock brains
// ------------------------------------------------------------------------------------------------

const PICK_HINTS: [RegExp, FighterId][] = [
  [/\b(fast|speed|quick|rush|swarm|pressure)/i, 'tick'],
  [/\b(reach|range|distance|space|zon|keep ?away|patient)/i, 'gantry'],
  [/\b(grab|grapple|clamp|throw|wrestl|hold)/i, 'vise'],
  [/\b(power|heavy|hit hard|big hits|armou?r|brute|kill early)/i, 'kiln'],
];

export function mockBrains(o: { rand: () => number; sleep: (ms: number) => Promise<void>; coaches?: [string, string] }): Brains {
  const { rand, sleep } = o;
  const coachIds: [string, string] = o.coaches ?? ['adaptive', 'adaptive'];
  const between = (a: number, b: number) => a + rand() * (b - a);
  const draw = bag(rand);
  // side per bot id (from startMatch, else first-seen order) and per-bot coach memory per fight
  let sides = new Map<string, 0 | 1>();
  const mem = new Map<string, Record<string, unknown>>();
  const lastTick = new Map<string, number>();
  const sideOf = (bot: BotConfig): 0 | 1 => {
    let s = sides.get(bot.id);
    if (s === undefined) {
      if (sides.size >= 2) sides = new Map();
      s = sides.size as 0 | 1;
      sides.set(bot.id, s);
    }
    return s;
  };
  const coachFor = (bot: BotConfig) => {
    const id = coachIds[sideOf(bot)] ?? 'adaptive';
    const c = COACHES[id] ?? COACHES.adaptive;
    if (!c) throw new Error(`unknown mock coach ${id}`);
    return c;
  };
  const memFor = (bot: BotConfig, tick: number) => {
    // a new fight (tick went backwards) starts a fresh coach memory
    if ((lastTick.get(bot.id) ?? -1) > tick || !mem.has(bot.id)) mem.set(bot.id, {});
    lastTick.set(bot.id, tick);
    return mem.get(bot.id)!;
  };
  // a coach's own read airs once per bot per match; repeats come from the bank so shows vary.
  // The two sides never say the same read at once: bank reads come from disjoint halves of each
  // bank (even lines side 0, odd lines side 1), and any read equal to the other side's current
  // one is drawn again.
  const aired = new Map<string, Set<string>>();
  const currentRead: [string, string] = ['', ''];
  const halves = new Map<string[], [string[], string[]]>();
  const halfOf = (lines: string[], side: 0 | 1): string[] => {
    let h = halves.get(lines);
    if (!h) halves.set(lines, (h = [lines.filter((_, i) => i % 2 === 0), lines.filter((_, i) => i % 2 === 1)]));
    return h[side].length ? h[side] : lines;
  };
  const withRead = (p: Plan, view: CoachView, bot: BotConfig): Plan => {
    const side = sideOf(bot);
    const theirs = currentRead[side === 0 ? 1 : 0].toLowerCase();
    let seen = aired.get(bot.id);
    if (!seen || view.tick < (lastTick.get(bot.id) ?? 0)) aired.set(bot.id, (seen = new Set()));
    const own = (p.read ?? '').trim();
    if (own && !seen.has(own.toLowerCase()) && own.toLowerCase() !== theirs) {
      seen.add(own.toLowerCase());
      currentRead[side] = own;
      return p;
    }
    const bank = halfOf(p.order === 'kill' || p.order === 'special' ? ORDER_READS[p.order] : (READS[p.stance] ?? READS.bait), side);
    let read = draw(bank);
    for (let i = 0; i < 4 && read.toLowerCase() === theirs; i++) read = draw(bank);
    currentRead[side] = read;
    return { ...p, read };
  };

  return {
    startMatch(bots) {
      sides = new Map([[bots[0].id, 0], [bots[1].id, 1]]);
      currentRead[0] = '';
      currentRead[1] = '';
      for (const b of bots) {
        mem.delete(b.id);
        lastTick.delete(b.id);
        aired.delete(b.id);
      }
    },
    async pickFighter(bot, info) {
      sideOf(bot);
      await sleep(between(2000, 6000));
      const ids = info.roster.map((r) => r.id).filter((id) => FIGHTER_IDS.includes(id));
      const pool = ids.length ? ids : FIGHTER_IDS;
      const weights = pool.map((id) => {
        let w = 1;
        for (const [re, f] of PICK_HINTS) if (f === id && re.test(bot.instructions)) w += 1.5;
        // a bot that lost with a fighter last time leans away from it a little
        const last = info.memory[info.memory.length - 1] ?? '';
        if (/^lost/i.test(last) && last.toLowerCase().includes(`as ${FIGHTER_NAMES[id].toLowerCase()}`)) w *= 0.6;
        return w;
      });
      let r = rand() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pool.length; i++) {
        r -= weights[i]!;
        if (r <= 0) return pool[i]!;
      }
      return pool[pool.length - 1]!;
    },
    async taunt(bot, info) {
      sideOf(bot);
      await sleep(between(800, 3000));
      return fill(draw(TAUNTS), { mine: FIGHTER_NAMES[info.mine], theirs: FIGHTER_NAMES[info.theirs], opp: info.opponentName });
    },
    async plan(bot, view, prev) {
      const coach = coachFor(bot);
      const m = memFor(bot, view.tick);
      await sleep(between(600, 2400));
      const p = sanitizePlan(coach.decide(view, m, rand), prev);
      return withRead(p, view, bot);
    },
    async corner(bot, info) {
      const coach = coachFor(bot);
      const m = memFor(bot, info.view.tick);
      await sleep(between(2000, 5000));
      const p = withRead(sanitizePlan(coach.decide(info.view, m, rand), info.prev), info.view, bot);
      const lines = CORNER_LINES[info.lostLife ? 'lost' : 'took'];
      const talk = fill(draw(lines), { oppDmg: Math.round(info.view.opp.damage) });
      return { plan: p, talk };
    },
    async remember(_bot, info) {
      await sleep(between(400, 1500));
      return info.summary;
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Real brains: OpenRouter chat completions
// ------------------------------------------------------------------------------------------------

export interface CostEntry {
  at: string;
  kind: string;
  bot: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface CostLedger {
  total(): number;
  add(e: CostEntry): void;
}

export function memoryLedger(): CostLedger & { entries: CostEntry[] } {
  const entries: CostEntry[] = [];
  return { entries, total: () => entries.reduce((a, e) => a + e.costUsd, 0), add: (e) => void entries.push(e) };
}

export const SYSTEM_PROMPT = [
  'You coach a robot in Ringout, a side-on platform fighter. Damage is a percent: the higher it is, the further hits launch you. Knocked past the arena edge, you lose a life. Your robot plays every frame itself; you set its game plan about every 3 seconds, and a plan takes effect a moment after you answer, so think ahead.',
  'Stances: rush (close in, strings of strikes and grabs, pressure shields), keepaway (hold space, poke at range, shoot), bait (hover outside range, make them swing, punish whiffs), wall (hold the middle, shield, punish out of shield, do not chase).',
  'Counters: bait beats rush and grab-heavy play. Rush beats keepaway. Keepaway beats wall and bait. Wall beats strike-heavy rush but loses to grabs.',
  'Dials: aggression 0 to 1. range close, mid or far. grabMix 0 (strikes) to 1 (grabs). edge deep (chase off stage, beats low recovery, punished by high), ledge, or stage. recover high, low or mix. order none, special (signature move now) or kill (right when their damage is high, reckless early). High aggression is a mistake at high own damage.',
  'Fighters: kiln heavy hitter, slow, kills early. tick fast and light, dies early. gantry long reach and a projectile, slow up close. vise grappler, best grabs and a kill throw.',
  'Answer with one compact JSON object only. Lines are plain words, no emoji, no dashes, PG.',
].join('\n');

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function compactPlan(p: Plan) {
  return { stance: p.stance, aggression: r2(p.aggression), range: p.range, grabMix: r2(p.grabMix), edge: p.edge, recover: p.recover, order: p.order, read: p.read };
}

/** The view as sent to a model: short keys, rounded numbers, zero habits dropped. */
export function compactView(v: CoachView) {
  const f = (x: CoachView['me']) => ({ fighter: x.fighter, damage: Math.round(x.damage), lives: x.lives, where: x.where, air: x.airborne || undefined });
  const habits: Record<string, number> = {};
  for (const [k, n] of Object.entries(v.oppHabits ?? {})) if (n) habits[k] = n;
  const s = v.since;
  return {
    secondsLeft: Math.round(v.secondsLeft),
    suddenDeath: v.sudden || undefined,
    me: f(v.me),
    opp: f(v.opp),
    gap: r2(v.gap),
    centre: v.centre,
    oppHabits: habits,
    oppLooksLike: v.oppLooksLike,
    sinceMyPlan: s
      ? { stance: s.plan?.stance, seconds: Math.round(s.ticks / 60), dealt: Math.round(s.dealt), taken: Math.round(s.taken), myHits: s.myHits, oppHits: s.oppHits, myGrabs: s.myGrabs, oppGrabs: s.oppGrabs, myWhiffs: s.myWhiffs, shieldedByOpp: s.shieldedByOpp }
      : undefined,
  };
}

const PLAN_FORMAT = { stance: 'rush|keepaway|bait|wall', aggression: 0.5, range: 'close|mid|far', grabMix: 0.3, edge: 'deep|ledge|stage', recover: 'high|low|mix', order: 'none|special|kill', read: 'what you see, 8 words max' };

/** Pulls one JSON object out of a model's text and repairs the usual damage. null if hopeless. */
export function parseJsonLoose(text: unknown): Record<string, unknown> | null {
  if (text && typeof text === 'object') return text as Record<string, unknown>;
  if (typeof text !== 'string') return null;
  let s = text.replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{');
  if (a < 0) return null;
  const b = s.lastIndexOf('}');
  s = b > a ? s.slice(a, b + 1) : s.slice(a) + '}';
  const tries = [
    s,
    s.replace(/,\s*([}\]])/g, '$1'),
    s
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":')
      .replace(/'([^'"]*)'/g, '"$1"'),
  ];
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* next */
    }
  }
  return null;
}

export interface OpenRouterOpts {
  apiKey: string;
  /** fetch to use (tests pass a stub); defaults to globalThis.fetch */
  fetch?: typeof fetch;
  ledger: CostLedger;
  /** refuse real calls once ledger.total() reaches this; default 1.50 */
  budgetUsd?: number;
  /** used when the budget is spent (realistic delays) */
  mock: Brains;
  /** used instantly when a call fails or times out (no extra delay) */
  rand: () => number;
  timeoutsMs?: Partial<{ plan: number; corner: number; pick: number; taunt: number; remember: number }>;
  endpoint?: string;
  /** called once when the budget runs out */
  onBudgetSpent?: (spent: number) => void;
  /** called once when OpenRouter refuses the key (401, 402 no credits, 403): mock brains from then on */
  onRefused?: (error: string) => void;
}

/** Real minds through OpenRouter. Every call has a timeout and a fallback; nothing here throws. */
export function createOpenRouterBrains(o: OpenRouterOpts): Brains & { spent(): number; calls(): number; live(): boolean } {
  const doFetch = o.fetch ?? globalThis.fetch.bind(globalThis);
  const budget = o.budgetUsd ?? 1.5;
  const endpoint = o.endpoint ?? 'https://openrouter.ai/api/v1/chat/completions';
  const T = { plan: 6000, corner: 9000, pick: 12000, taunt: 12000, remember: 12000, ...o.timeoutsMs };
  const instant = mockBrains({ rand: o.rand, sleep: async () => {} });
  let calls = 0;
  let warned = false;
  /** models that rejected the reasoning switch (asked without it from then on) */
  const noSwitch = new Set<string>();
  // a key that is refused (no key, no credits, forbidden) will not start working mid-show: after
  // the first such answer every call goes to the mock brains, and live() turns false so the
  // channel stops naming the models
  let dead = false;

  const overBudget = () => {
    if (dead) return true;
    const spent = o.ledger.total();
    if (spent >= budget) {
      if (!warned) {
        warned = true;
        o.onBudgetSpent?.(spent);
      }
      return true;
    }
    return false;
  };

  async function call(kind: string, bot: BotConfig, user: unknown, maxTokens: number, timeoutMs: number): Promise<Record<string, unknown> | null> {
    const t0 = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const entry: CostEntry = { at: new Date().toISOString(), kind, bot: bot.id, model: bot.model, promptTokens: 0, completionTokens: 0, costUsd: 0, ms: 0, ok: false };
    calls++;
    try {
      // Thinking models spend the whole small token limit on hidden reasoning and return nothing
      // (seen 2026-11-19 on four of six cheap models). A coach has to answer in about a second, so
      // reasoning is switched off; a model that rejects the switch is asked again without it.
      const post = (withSwitch: boolean) => doFetch(endpoint, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          authorization: `Bearer ${o.apiKey}`,
          'content-type': 'application/json',
          'http-referer': 'https://localhost/ringout',
          'x-title': 'Ringout',
        },
        body: JSON.stringify({
          model: bot.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(user) },
          ],
          max_tokens: maxTokens,
          temperature: 0.8,
          usage: { include: true },
          ...(withSwitch ? { reasoning: { enabled: false } } : {}),
        }),
      });
      let res = await post(!noSwitch.has(bot.model));
      if (res.status === 400 && !noSwitch.has(bot.model)) {
        noSwitch.add(bot.model);
        res = await post(false);
      }
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: { message: 'non-JSON response' } };
      }
      const u = data?.usage ?? {};
      entry.promptTokens = Number(u.prompt_tokens) || 0;
      entry.completionTokens = Number(u.completion_tokens) || 0;
      // OpenRouter reports cost when usage.include is set; if not, assume a pricey $3 per million tokens
      entry.costUsd = Number.isFinite(Number(u.cost)) && u.cost !== undefined ? Number(u.cost) : (entry.promptTokens + entry.completionTokens) * 3e-6;
      if (!res.ok || data?.error) {
        entry.error = `status ${res.status}${data?.error?.message ? ': ' + String(data.error.message).slice(0, 120) : ''}`;
        if ((res.status === 401 || res.status === 402 || res.status === 403) && !dead) {
          dead = true;
          o.onRefused?.(entry.error);
        }
        return null;
      }
      const content = data?.choices?.[0]?.message?.content;
      const parsed = parseJsonLoose(content);
      entry.ok = !!parsed;
      if (!parsed) entry.error = 'unparseable answer';
      return parsed;
    } catch (e) {
      entry.error = (e as Error)?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : String((e as Error)?.message ?? e).slice(0, 120);
      return null;
    } finally {
      clearTimeout(timer);
      entry.ms = Date.now() - t0;
      try {
        o.ledger.add(entry);
      } catch {
        /* a broken ledger must not stall a show */
      }
    }
  }

  const you = (bot: BotConfig) => bot.instructions;

  return {
    spent: () => o.ledger.total(),
    live: () => !dead && o.ledger.total() < budget,
    calls: () => calls,
    startMatch(bots) {
      o.mock.startMatch?.(bots);
      instant.startMatch?.(bots);
    },
    async pickFighter(bot, info) {
      if (overBudget()) return o.mock.pickFighter(bot, info);
      const ans = await call(
        'pick',
        bot,
        {
          you: you(bot),
          task: 'Pick your robot. The opponent picks at the same time without seeing yours.',
          roster: info.roster.map((r) => ({ id: r.id, role: r.role, blurb: r.blurb, stats: r.stats })),
          opponent: info.opponent,
          memory: info.memory.slice(-3),
          answer: { pick: info.roster.map((r) => r.id).join('|') },
        },
        40,
        T.pick,
      );
      const pick = String(ans?.pick ?? ans?.fighter ?? '').toLowerCase().trim() as FighterId;
      if (FIGHTER_IDS.includes(pick)) return pick;
      return instant.pickFighter(bot, info);
    },
    async taunt(bot, info) {
      if (overBudget()) return o.mock.taunt(bot, info);
      const ans = await call(
        'taunt',
        bot,
        {
          you: you(bot),
          task: 'One playful trash talk line to your opponent before the fight. 10 words max. PG.',
          mine: FIGHTER_NAMES[info.mine],
          theirs: FIGHTER_NAMES[info.theirs],
          opponent: info.opponentName,
          answer: { taunt: '...' },
        },
        48,
        T.taunt,
      );
      const t = ans?.taunt ?? ans?.line ?? ans?.text;
      if (typeof t === 'string' && t.trim()) return t;
      return instant.taunt(bot, info);
    },
    async plan(bot, view, prev) {
      if (overBudget()) return o.mock.plan(bot, view, prev);
      const ans = await call(
        'plan',
        bot,
        { you: you(bot), task: 'Game plan for the next 3 seconds.', view: compactView(view), current: compactPlan(prev), answer: PLAN_FORMAT },
        120,
        T.plan,
      );
      if (!ans) return prev; // late or broken: the old plan stays
      const raw = (ans.plan && typeof ans.plan === 'object' ? ans.plan : ans) as Record<string, unknown>;
      return sanitizePlan(raw, prev);
    },
    async corner(bot, info) {
      if (overBudget()) return o.mock.corner(bot, info);
      const ans = await call(
        'corner',
        bot,
        {
          you: you(bot),
          task: info.lostLife
            ? 'You just lost a life. Rethink the whole approach for the next life.'
            : 'You just took a life. Decide how to close out the match.',
          view: compactView(info.view),
          current: compactPlan(info.prev),
          answer: { ...PLAN_FORMAT, talk: 'one line to your robot in the corner, 12 words max' },
        },
        170,
        T.corner,
      );
      if (!ans) {
        const lines = CORNER_LINES[info.lostLife ? 'lost' : 'took'];
        return { plan: info.prev, talk: lines[Math.floor(o.rand() * lines.length)]!.replace('{oppDmg}', String(Math.round(info.view.opp.damage))) };
      }
      const raw = (ans.plan && typeof ans.plan === 'object' ? ans.plan : ans) as Record<string, unknown>;
      const plan = sanitizePlan(raw, info.prev);
      const talk = typeof ans.talk === 'string' ? ans.talk : typeof ans.line === 'string' ? ans.line : '';
      return { plan, talk: talk || safeLine('corner', o.rand, { lost: info.lostLife }) };
    },
    async remember(bot, info) {
      if (overBudget()) return o.mock.remember(bot, info);
      const ans = await call(
        'remember',
        bot,
        { you: you(bot), task: 'Write one memory line (20 words max) that will help you in later matches.', won: info.won, summary: info.summary, answer: { memory: '...' } },
        60,
        T.remember,
      );
      const m = ans?.memory ?? ans?.line;
      return typeof m === 'string' && m.trim() ? m : info.summary;
    },
  };
}

export { DEFAULT_PLAN, STANCES };
