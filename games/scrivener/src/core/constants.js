// Shared constants. Owner: core. Pure (no DOM).

export const W = 1280;
export const H = 720;

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

// Screen y of the arena floor. World y is "height above floor" (0 = standing on floor).
export const GROUND_Y = 600;
export const ARENA = { left: 60, right: 1220 };

export const AGENT_IDS = ['claude', 'gpt'];
export const AGENT_LABEL = { claude: 'CLAUDE', gpt: 'GPT' };
export const DEFAULT_MODELS = {
  claude: 'anthropic/claude-haiku-5.5',
  gpt: 'openai/gpt-6-luna',
};

export const ACTIONS = ['roll_away', 'roll_toward', 'roll_through', 'jump_back', 'attack', 'heavy', 'heal', 'hold'];
export const TIMINGS = ['early', 'on_cue', 'late'];

export const THINK_TIMEOUT_MS = 9000;     // real-time cap on an LLM decision (gpt-6-luna p90 is ~5.4 s)
export const REFLECT_TIMEOUT_MS = 15000;  // real-time cap on an LLM reflection
export const MAX_NOTES = 5;

// Edge-to-edge gaps between the challenger and the boss's body.
export const DISTANCE_BANDS = { close: 170, mid: 420 };

export const MATCH = {
  deathScreenMs: 4200,
  victoryMs: 9000,
  agentDeathHoldMs: 1400,  // world keeps animating this long before the death screen
  bossDeathHoldMs: 2600,
};

export const PIECES = ['art', 'arena', 'tells', 'feedback', 'stagger_death', 'agents', 'sound', 'ui', 'perf'];
