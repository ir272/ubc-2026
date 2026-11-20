// Recorded REAL LLM play (browser, live models through server.mjs, mock off) for capture
// scenarios. Generated from a recorded run (seed 43); see replay.js. Each entry is one
// life: the match seed, attempt, the notes the models had written by then, and the exact
// decisions the model returned. Re-played tick for tick, so the capture is that life.
//
// Fidelity under the current sim (checked against every decision's damage taken/dealt in
// progress/pairs/agents-r3-llm.md, the per-attempt log of the same run):
//   m1_5  match 1, attempt 5: all 31 decisions reproduce exactly.
//   m2_1  match 2, attempt 1: all 32 decisions reproduce exactly. Transcribed from that log
//         (the stored lives match it byte for byte: read, thought, action, timing, note).
//   m1_3  match 1, attempt 3: DRIFTED. (tells r9) narrowed the written_name eruption and locks
//         the ink ring when it erupts, so decision 1 (roll_away on_cue vs the writing), hit for
//         55 in the recording, is now clean; from there the life differs (the boss order splits
//         at decision 9) and its lunge dodge (decision 14) never comes. Kept as the record only;
//         no scenario uses it.
import { replayScenario } from './replay.js';
import { createWorld } from '../sim/world.js';
import { tickMatch } from '../sim/match.js';
import { hash2 } from '../core/rng.js';
import { TICK_MS } from '../core/constants.js';
import { agentController } from './reflex.js';

export const REPLAYS = {
 "m1_5": {
  "source": {
   "seed": "43",
   "models": {
    "claude": "anthropic/claude-haiku-5.5",
    "gpt": "openai/gpt-6-luna"
   }
  },
  "matchSeed": 43,
  "matchNo": 1,
  "attempt": 5,
  "agent": "claude",
  "score": {
   "claude": {
    "attempts": 3,
    "deaths": 2,
    "kills": 0,
    "bestBossPct": 0.25,
    "firstKillAttempt": null,
    "decisions": 28
   },
   "gpt": {
    "attempts": 2,
    "deaths": 2,
    "kills": 0,
    "bestBossPct": 0.6513157894736842,
    "firstKillAttempt": null,
    "decisions": 21
   }
  },
  "notes": {
   "claude": [
    "When it opens the black book against its chest to write: attack early, because roll_away on_cue let the floor ink catch you, while early attacks stayed clean twice.",
    "When it folds in on itself: roll_through early, because that dodge stayed clean four times and should be kept.",
    "When it wraps its wings into a tall black pillar: roll_away on_cue, because that dodge stayed clean twice and avoids the rear-ink strike.",
    "When it folds its wings down its back and twists away: roll_away on_cue, because roll_through on_cue carried you behind it and got you hit."
   ],
   "gpt": [
    "When it wraps its wings shut into a tall narrow black pillar: roll_away on_cue, because rolling through left me behind it and late was too slow.",
    "When it folds its wings shut down its back and twists away: roll_away on_cue, because it left me untouched and I cut it.",
    "When it folds in on itself: roll_through early, because it worked repeatedly while on-cue got me hit.",
    "When it opens the black book against its chest and writes: attack on_cue, because the ink targeted my position despite dodging and distance."
   ]
  },
  "matchesWon": {
   "claude": 0,
   "gpt": 0
  },
  "history": [
   {
    "attempt": 1,
    "agent": "claude",
    "result": "death",
    "seconds": 37.7166666666669,
    "bossHpPct": 0.7723684210526316,
    "decisions": 9,
    "killedBy": "written_name",
    "damageDealt": 173,
    "damageTaken": 174,
    "heals": 1,
    "dodges": 5,
    "notesBefore": [],
    "log": []
   },
   {
    "attempt": 2,
    "agent": "gpt",
    "result": "death",
    "seconds": 54.066666666664524,
    "bossHpPct": 0.6513157894736842,
    "decisions": 14,
    "killedBy": "ledger_slam",
    "damageDealt": 265,
    "damageTaken": 218,
    "heals": 2,
    "dodges": 8,
    "notesBefore": [],
    "log": []
   },
   {
    "attempt": 3,
    "agent": "claude",
    "result": "death",
    "seconds": 73.13333333333173,
    "bossHpPct": 0.25,
    "decisions": 19,
    "killedBy": "written_name",
    "damageDealt": 570,
    "damageTaken": 231,
    "heals": 2,
    "dodges": 18,
    "notesBefore": [],
    "log": []
   },
   {
    "attempt": 4,
    "agent": "gpt",
    "result": "death",
    "seconds": 26.600000000000506,
    "bossHpPct": 0.7868421052631579,
    "decisions": 7,
    "killedBy": "ledger_slam",
    "damageDealt": 162,
    "damageTaken": 107,
    "heals": 0,
    "dodges": 2,
    "notesBefore": [],
    "log": []
   }
  ],
  "decisions": [
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "Last time I rolled and got caught. Close in before the ink lands.",
    "read": "Writing in the black book: it is preparing a strike, not defending.",
    "note": 1
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll away worked. Do the same and keep my distance.",
    "read": "Wings folded, blade cocked high: a big overhead strike is coming.",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Its wings are shut and the blade is cocked.",
    "read": "Wings folded, twisting away; blade cocked high for a heavy diagonal cut",
    "note": 4
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled through and it caught me from behind. Away this time.",
    "read": "Wings wrapped into a pillar, book raised overhead; a heavy strike is",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll on cue kept me clean. Do the same again.",
    "read": "Wings folded, twisting away with blade cocked high: a big diagonal strike",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll held clean. Same coil, same answer.",
    "read": "Coiled twist with blade cocked back; a big strike is coming.",
    "note": 4
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled clear on cue and cut it. Do that again.",
    "read": "Wings wrapped into a pillar, book raised overhead; a heavy downward strike",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time this exact pose showed its back to me. Roll clear, then cut.",
    "read": "Wings folded, twisting away, blade cocked high: a big overhead strike is",
    "note": 4
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "It writes while I stand close. Cut it before the pen finishes.",
    "read": "Writing in the book: it is recording, a slow setup; not an",
    "note": 1
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time this pose gave me a clean roll.",
    "read": "Wings folded, twisting away, blade cocked high. A big overhead strike is",
    "note": 4
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Its wings are shut tight. I'll roll clear on its cue.",
    "read": "Wings wrapped into a pillar, book raised overhead for a crushing strike.",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll held clean. Trust it and keep my distance.",
    "read": "Wings folded, twisting away with blade cocked high; a heavy overhead strike",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled on cue and walked away clean. Do it again.",
    "read": "Wings folded, twisting away: a big blade slash is coming.",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll on cue kept me clean. Same dodge again.",
    "read": "Wings folded, twisting away with blade cocked back; a big strike is",
    "note": 4
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll on cue kept me clean.",
    "read": "Wings sealed into a pillar, book raised overhead; a heavy strike or",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll on cue kept me clean. Roll out again.",
    "read": "Winding up a big overhead blade strike; the book thrust is a",
    "note": 4
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "Its ink is pooling; I'll cut before the pen finishes its line.",
    "read": "Writing in the book: it is recording, then a strike follows.",
    "note": 1
   },
   {
    "attackId": "wing_gust",
    "action": "roll_through",
    "timing": "early",
    "thought": "Last time early roll-through left me untouched. Trust it again.",
    "read": "Winding up a wide wing sweep or inhale attack",
    "note": 2
   },
   {
    "attackId": "page_storm",
    "action": "roll_through",
    "timing": "early",
    "thought": "It folds itself shut. I'll slip through before the wings open.",
    "read": "Wings folding tight around its body as it rises; a coiled, closing-in",
    "note": 2
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll away on cue kept me clean. Do it again.",
    "read": "Wings sealed into a pillar; a book raised overhead means a heavy",
    "note": 3
   },
   {
    "attackId": "wing_gust",
    "action": "roll_away",
    "timing": "early",
    "thought": "Last time I rolled through and the pages still caught me.",
    "read": "Wings flung wide and a deep breath: a wind-borne page wall is",
    "note": 0
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "Its ink is still wet; I close the distance before it finishes.",
    "read": "Writing in the book: it's gathering power, a ranged or delayed strike",
    "note": 1
   },
   {
    "attackId": "page_storm",
    "action": "roll_through",
    "timing": "early",
    "thought": "It curls in on itself. I'll slip through before the pages fall.",
    "read": "Rising and folding inward, pages lifting: a tight, self-enclosing guard",
    "note": 2
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "It's winding up behind its back. Roll clear on the beat.",
    "read": "Wings folded down its back, blade cocked high for a heavy strike.",
    "note": 4
   },
   {
    "attackId": "wing_gust",
    "action": "roll_through",
    "timing": "early",
    "thought": "Last time I rolled away too soon and got caught by the pages.",
    "read": "Folding in then flinging wings wide: a wind burst is coming.",
    "note": 2
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll worked clean. Same dodge again, no greed.",
    "read": "Wings folded, blade cocked high behind it; a big strike is coming.",
    "note": 4
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "Its pen is busy, its guard is open. Strike before the ink sets.",
    "read": "Writing in the book: it is preparing a slow, empowered strike.",
    "note": 1
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll held.",
    "read": "Book raised overhead behind the skull; a heavy overhead strike is coming.",
    "note": 3
   },
   {
    "attackId": "wing_gust",
    "action": "roll_through",
    "timing": "early",
    "thought": "It folded tight before, and rolling through early kept me clean.",
    "read": "Wings flung wide after a deep breath: a wide sweeping attack coming.",
    "note": 2
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Its wings close like a pillar. I'll roll clear of the falling book.",
    "read": "Wings wrapped into a pillar, book raised overhead; a heavy overhead strike",
    "note": 3
   },
   {
    "attackId": "page_storm",
    "action": "roll_through",
    "timing": "early",
    "thought": "Last time I slipped through early and it never touched me. Do it again.",
    "read": "Wings folded tight, rising: it is folding in on itself.",
    "note": 2
   }
  ]
 },
 "m1_3": {
  "source": {
   "seed": "43",
   "models": {
    "claude": "anthropic/claude-haiku-5.5",
    "gpt": "openai/gpt-6-luna"
   }
  },
  "matchSeed": 43,
  "matchNo": 1,
  "attempt": 3,
  "agent": "claude",
  "score": {
   "claude": {
    "attempts": 2,
    "deaths": 1,
    "kills": 0,
    "bestBossPct": 0.7723684210526316,
    "firstKillAttempt": null,
    "decisions": 9
   },
   "gpt": {
    "attempts": 1,
    "deaths": 1,
    "kills": 0,
    "bestBossPct": 0.6513157894736842,
    "firstKillAttempt": null,
    "decisions": 14
   }
  },
  "notes": {
   "claude": [
    "When it opens the black book against its chest to write: roll_away on_cue, because early roll_through let the floor ink rise under you twice.",
    "When it folds in on itself: roll_through early, because that dodge stayed clean three times and should be kept.",
    "When it wraps its wings into a tall black pillar: roll_away on_cue, because that dodge was clean and avoids the rear-ink strike.",
    "When it folds its wings down its back and twists away: roll_away on_cue, because roll_through on_cue carried you behind it and got you hit."
   ],
   "gpt": [
    "When it wraps its wings shut like a tall narrow black pillar: roll_away late, because an on-cue roll ended before its follow-up.",
    "When it folds its wings shut down its back and twists away: roll_away on_cue, because it left me untouched and I cut it.",
    "When it folds in on itself: roll_through early, because it worked repeatedly while on-cue got me hit.",
    "When it opens the black book and writes: hold on_cue, because dodging and distance did not shake off the ink targeting my position."
   ]
  },
  "matchesWon": {
   "claude": 0,
   "gpt": 0
  },
  "history": [
   {
    "attempt": 1,
    "agent": "claude",
    "result": "death",
    "seconds": 37.7166666666669,
    "bossHpPct": 0.7723684210526316,
    "decisions": 9,
    "killedBy": "written_name",
    "damageDealt": 173,
    "damageTaken": 174,
    "heals": 1,
    "dodges": 5,
    "notesBefore": [],
    "log": []
   },
   {
    "attempt": 2,
    "agent": "gpt",
    "result": "death",
    "seconds": 54.066666666664524,
    "bossHpPct": 0.6513157894736842,
    "decisions": 14,
    "killedBy": "ledger_slam",
    "damageDealt": 265,
    "damageTaken": 218,
    "heals": 2,
    "dodges": 8,
    "notesBefore": [],
    "log": []
   }
  ],
  "decisions": [
   {
    "attackId": "written_name",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled through early and died. Note says roll away on cue.",
    "read": "Writing in the book: it's preparing a delayed ink strike.",
    "note": 1
   },
   {
    "attackId": "ink_lunge",
    "action": "roll_through",
    "timing": "early",
    "thought": "It folds low to charge. I'll roll through its line before the blade lands.",
    "read": "Rearing then dropping into a low wedge: a charging thrust aimed at",
    "note": 2
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time rolling through carried me behind it. Roll away instead.",
    "read": "Wings folded, cocked blade overhead: a heavy diagonal slash incoming.",
    "note": 4
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "Last time dodging only let it finish the line. Break the pen first.",
    "read": "Writing its name in ink; the floor strike comes once it finishes.",
    "note": 0
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled past it and paid for it.",
    "read": "Wings sealed into a pillar, book raised overhead. A star flare means",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled away on cue and it stayed open. Do it again.",
    "read": "Wings folded, blade cocked high for a downward strike. Its book is",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled clear and cut it. Same dodge, same wall.",
    "read": "Wings folded, blade cocked high behind; a heavy overhead strike is coming.",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time this dodge was clean. Trust the note and roll on cue.",
    "read": "Wings folded, blade cocked high; a flaring overhead strike is coming.",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "It's winding up high. Roll clear now, like last time.",
    "read": "Wings folded, twisting away: a heavy overhead blade strike is coming.",
    "note": 4
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the rolling away left me untouched. Do it again.",
    "read": "Pillar wings, book raised overhead, star flaring. A heavy overhead strike is",
    "note": 3
   },
   {
    "attackId": "written_name",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rushed in and got nothing. Roll away on cue this time.",
    "read": "Writing in the book: it is about to unleash a ink-based attack.",
    "note": 1
   },
   {
    "attackId": "wing_gust",
    "action": "roll_through",
    "timing": "early",
    "thought": "Last time I slipped through early and it left an opening. Do it again.",
    "read": "Wings snap open after folding in; a wide blast is coming.",
    "note": 2
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time this worked clean. Roll clear and cut back.",
    "read": "Wings folded down, twisting away with blade cocked high. A heavy overhead",
    "note": 4
   },
   {
    "attackId": "ink_lunge",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled through early and paid for it.",
    "read": "Rearing then dropping flat into a low charging thrust at me",
    "note": 0
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "Dodging failed once. I'll break its pen before the name is finished.",
    "read": "It is writing my name; the ink strike is coming.",
    "note": 0
   },
   {
    "attackId": "page_storm",
    "action": "roll_through",
    "timing": "early",
    "thought": "Tight wings mean a coiled strike. Slip through before it uncoils.",
    "read": "Wings wrapped tight while rising; it's compacting to strike.",
    "note": 2
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_through",
    "timing": "on_cue",
    "thought": "Roll-away let its strike catch my ending. Go through it instead.",
    "read": "Wings form a pillar; book raised for a rear-ink strike.",
    "note": 0
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll away on cue kept me untouched. Do it again.",
    "read": "Wings folded, twisting away with blade cocked high: a big winding strike",
    "note": 4
   },
   {
    "attackId": "written_name",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled early and the ink rose beneath me.",
    "read": "Writing in the book: it is about to unleash something from the",
    "note": 1
   }
  ]
 },
 "m2_1": {
  "source": {
   "seed": "43",
   "models": {
    "claude": "anthropic/claude-haiku-5.5",
    "gpt": "openai/gpt-6-luna"
   }
  },
  "matchSeed": 4168085050,
  "matchNo": 2,
  "attempt": 1,
  "agent": "claude",
  "score": {
   "claude": {
    "attempts": 1,
    "deaths": 0,
    "kills": 0,
    "bestBossPct": 1,
    "firstKillAttempt": null,
    "decisions": 0
   },
   "gpt": {
    "attempts": 0,
    "deaths": 0,
    "kills": 0,
    "bestBossPct": 1,
    "firstKillAttempt": null,
    "decisions": 0
   }
  },
  "notes": {
   "claude": [
    "When it opens the black book against its chest to write: attack early, because roll_away on_cue let the floor ink catch you, while early attacks stayed clean twice.",
    "When it folds in on itself: roll_through early, because that dodge stayed clean four times and should be kept.",
    "When it wraps its wings into a tall black pillar: roll_away on_cue, because that dodge stayed clean twice and avoids the rear-ink strike.",
    "When it folds its wings down its back and twists away: roll_away on_cue, because roll_through on_cue carried you behind it and got you hit."
   ],
   "gpt": [
    "When it wraps its wings shut into a tall narrow black pillar: roll_away on_cue, because rolling through left me behind it and late was too slow.",
    "When it folds its wings shut down its back and twists away: roll_away on_cue, because it left me untouched and I cut it.",
    "When it folds in on itself: roll_through early, because it worked repeatedly while on-cue got me hit.",
    "When it opens the black book against its chest and writes: attack on_cue, because the ink targeted my position despite dodging and distance."
   ]
  },
  "matchesWon": {
   "claude": 1,
   "gpt": 0
  },
  "history": [],
  "decisions": [
   {
    "attackId": "wing_gust",
    "action": "roll_through",
    "timing": "early",
    "thought": "It folds tight like before. Roll through early, same as last time.",
    "read": "Folds in, then flings wings wide and inhales: a big burst coming.",
    "note": 2
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll away on cue left me untouched. Do it again.",
    "read": "Wings wrap into a pillar, book raised overhead. A heavy overhead strike",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll held clean.",
    "read": "Wings folded down, twisting away. A high overhead pen-blade strike is coming.",
    "note": 4
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the rolling away kept me clean. I'll trust it again.",
    "read": "Wings shut into a pillar, book raised overhead. A heavy overhead strike",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time that roll kept me clean.",
    "read": "Winding up a big overhead pen-blade strike, twisting away from me",
    "note": 4
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll on cue kept me clean.",
    "read": "Book hurled overhead; the star flare means a coming overhead strike.",
    "note": 3
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll away held. I'll trust that and get clear again.",
    "read": "Wings wrapped into a pillar, book raised overhead; a heavy overhead strike",
    "note": 3
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "The last roll away kept me clean. I'll trust it again.",
    "read": "Wings wrapped into a pillar, book raised overhead; a heavy strike is",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll away worked clean. Do it again, on the beat.",
    "read": "Wings folded down, twisting away; a big overhead pen-blade strike is coming.",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "It's winding up hard. Roll clear on its cue, then strike back.",
    "read": "Wings folded, twisting away; blade cocked back for a big diagonal slash.",
    "note": 4
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time that roll left it open. I'll take the same gap again.",
    "read": "Wings wrapped into a pillar, book raised overhead: a heavy overhead strike",
    "note": 3
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the pillar meant a clean roll. Trust it and get out.",
    "read": "Wings wrap into a pillar; a book-slam is coming, so dodge.",
    "note": 3
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time that roll kept me clean. Trust it and get out of reach.",
    "read": "Coiled wind-up: wings folded, blade cocked high for a heavy downstroke.",
    "note": 4
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "",
    "read": "",
    "note": 0
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll on cue kept me clean. Do it again.",
    "read": "Wings folded, twisting away; blade cocked back for a diagonal strike.",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time that roll kept me clean.",
    "read": "Coiled twist with blade cocked high; a big strike is coming.",
    "note": 4
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled on cue and walked away clean. Do it again.",
    "read": "Wings folded, twisting away, blade cocked high. A big strike is charging.",
    "note": 4
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "Its pen is busy; I'll cut before the ink finishes its line.",
    "read": "Writing in the book: it is recording a strike, a slow scripted",
    "note": 1
   },
   {
    "attackId": "ink_lunge",
    "action": "roll_through",
    "timing": "on_cue",
    "thought": "The wall is at my back, so I go through it, not away.",
    "read": "Full rear, then a low level lunge: blade thrust aimed straight at",
    "note": 0
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time that roll kept me clean. Same dodge, same timing.",
    "read": "Wings folded, twisting away, blade cocked high: a big strike is coming.",
    "note": 4
   },
   {
    "attackId": "page_storm",
    "action": "roll_through",
    "timing": "early",
    "thought": "It folds in on itself. I'll slip through before it uncoils.",
    "read": "Rising with wings folded tight; it's gathering itself to lunge.",
    "note": 2
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "It writes its future in ink; I will strike before the page is finished.",
    "read": "Writing in the book: it is recording its next move, a slow",
    "note": 1
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time I rolled away on cue and stayed untouched. Do it again.",
    "read": "Wings folded, blade cocked high: a big overhead strike is coming.",
    "note": 4
   },
   {
    "attackId": "wing_gust",
    "action": "roll_through",
    "timing": "early",
    "thought": "Last time I rolled through early and stayed untouched. Do it again.",
    "read": "Wings flare wide after a deep breath: a sweeping blast is coming.",
    "note": 2
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll away kept me clean. Same dodge, same timing.",
    "read": "Wings wrapped into a pillar, book raised overhead; a heavy strike is",
    "note": 3
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll held clean.",
    "read": "Pillar of wings, book raised high; a heavy overhead slam is coming.",
    "note": 3
   },
   {
    "attackId": "page_storm",
    "action": "roll_through",
    "timing": "early",
    "thought": "Last time I slipped through its folding early. Do it again, cleanly.",
    "read": "Rising and folding inward; a tight guard before a new strike.",
    "note": 2
   },
   {
    "attackId": "ledger_slam",
    "action": "roll_through",
    "timing": "early",
    "thought": "Wall at my back, so I go through it, not away.",
    "read": "Wings wrap into a pillar, book raised overhead for a crushing blow",
    "note": 0
   },
   {
    "attackId": "written_name",
    "action": "attack",
    "timing": "early",
    "thought": "Its pen is busy; I'll cut before the ink finishes.",
    "read": "Writing in the black book: a slow ink-spell is coming.",
    "note": 1
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time the roll on cue kept me clean. Do it again.",
    "read": "Wings folded, twisting away with blade cocked high; a heavy strike is",
    "note": 4
   },
   {
    "attackId": "page_storm",
    "action": "roll_through",
    "timing": "early",
    "thought": "It folds in tight. I'll slip through before it can unwind.",
    "read": "Rising and folding inward; a tight defensive wrap before a strike.",
    "note": 2
   },
   {
    "attackId": "quill_slash",
    "action": "roll_away",
    "timing": "on_cue",
    "thought": "Last time that twist meant a blade. Roll out before it lands.",
    "read": "Wings folded, twisting away with blade cocked high: a big strike is",
    "note": 4
   }
  ]
 }
};

// The recording predates the per-match opener alternation (match.js agentForAttempt: match 2
// now opens with GPT). Match 2 was opened by Claude, so this puts the recorded challenger back
// in the slot (same world seed, hash2(matchSeed, attempt)) and then runs the life as setupReplay
// does. A no-op for match 1 lives.
function replayAsRecorded(r, moment) {
  const lead = moment.lead || 2400;
  const sc = replayScenario(r, { ...moment, t: 0, lead: 0 }); // its setup only rebuilds the match
  return {
    ...sc,
    setup(m, ctx) {
      let brain = null;
      sc.setup(m, { setBrain: (id, b) => { if (id === r.agent) brain = b; if (ctx && ctx.setBrain) ctx.setBrain(id, b); } });
      if (m.current !== r.agent) {
        m.current = r.agent;
        m.world = createWorld({ seed: hash2(m.seed, m.attempt), agentId: r.agent, decisions: m.decisions });
      }
      const untilT = Math.max(0, moment.t - lead);
      let guard = 0;
      while ((m.world.t < untilT || m.world.thinking || m.pending) && guard++ < 60 * 60 * 10) {
        tickMatch(m, TICK_MS, agentController);
        const p = m.pending;
        if (p && !p.reply) p.reply = p.kind === 'decide' ? brain.decide(null, { world: m.world }) : brain.reflect(null, { notes: m.notes[m.current] });
        if (m.phase !== 'fight') break;
      }
      m.world.events.length = 0;
      m.events.length = 0;
    },
  };
}

// Strips are 8 frames at 12 fps (583 ms); capture.mjs starts them 333 ms before the moment
// (untilEvent + plusMs). The decision freeze (~0.7 s, world stopped) sits between the tell's
// onset and the roll, so a strip cannot hold both: these start on the committed pose just
// before the roll.
export const REPLAY_SCENARIOS = {
  // m1_5 decision 8: blade sweep, roll_away on_cue (note 4). Frames 0-2 the blade cocked and
  // the challenger standing, 3 the roll starts as the blade comes, 4 the blade passes over the
  // roll (dodge), 5-7 rolling clear while the blade sticks in the floor.
  agents_learned_sweep_dodge: replayScenario(REPLAYS.m1_5, {"type":"dodge","attackId":"quill_slash","t":25350,"plusMs":0}),
  agents_learned_sweep_punish: replayScenario(REPLAYS.m1_5, {"type":"hit","target":"boss","bossState":"recovery","t":26417}),
  agents_learned_write_punish: replayScenario(REPLAYS.m1_5, {"type":"hit","target":"boss","bossState":"recovery","t":73650}),
  // m2_1 decision 19: the lunge, roll_through on_cue ("The wall is at my back, so I go through
  // it, not away."), untouched, then an 11-damage cut in the recovery. The only clean ink_lunge
  // dodge in the logged lives that still reproduces (m1_3 decision 14 drifted, see above).
  // Frames 0-1 standing before the coiled boss, 2 the roll starts, 3 the dash meets the roll
  // (dodge), 4-7 the boss carries on across the hall and lands past the challenger.
  agents_learned_lunge_dodge: replayAsRecorded(REPLAYS.m2_1, {"type":"dodge","attackId":"ink_lunge","t":64617,"plusMs":83}),
};
