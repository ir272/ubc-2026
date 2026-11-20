// The agent mind. Owner: agents.
//
//  - Reflex layer: agentController (src/ai/reflex.js), runs every sim tick.
//  - Decision moments: when the boss starts a tell the match freezes and sets
//    m.pending = { kind: 'decide' }. The driver below asks the agent's brain.
//  - Reflection: after each death, m.pending = { kind: 'reflect' } -> <= 5 notes.
//
// Brains:
//   MockBrain  - seeded, synchronous; uses the look-ahead oracle plus a human-like,
//                shrinking error rate (it "learns" per attack across deaths).
//   LLMBrain   - POST /api/brain (server.mjs proxies to OpenRouter). Async.
//
// Brain interface (duck-typed):
//   kind: 'mock'|'llm', label: string
//   decide(obs, ctx) -> {action,timing,thought}  (mock: sync, llm: Promise)
//   reflect(info, ctx) -> {notes: string[]}       (mock: sync, llm: Promise)
//   thinkMs() (mock only): sim-ms the freeze lasts before a mock answer lands

import { ACTIONS, TIMINGS, THINK_TIMEOUT_MS, REFLECT_TIMEOUT_MS, MAX_NOTES } from '../core/constants.js';
import { makeRng, rand, range, pick, hash2, hashString } from '../core/rng.js';
import { ATTACKS } from '../sim/attacks.js';
import { evaluateOptions } from './oracle.js';
import { agentController } from './reflex.js';
import {
  buildObservation, buildReflection, DECIDE_SYSTEM, REFLECT_SYSTEM, parseDecision, parseNotes, shortPose,
} from './prompts.js';

export { agentController, buildObservation, buildReflection };

const READS = {
  roll_away: 'A wide reach is coming; be outside it.',
  roll_toward: 'It will reach long; get inside it.',
  roll_through: 'A sweep is coming; its back is safe.',
  jump_back: 'Something low is coming along the floor.',
  attack: 'It is busy and open; hit it now.',
  heavy: 'It is open long enough for a heavy blow.',
  heal: 'It is far and slow; time to drink.',
  hold: 'Nothing will reach me here.',
};

const THOUGHTS = {
  roll_away: ['Too close. Out of its reach.', 'Give it room; let it cut air.', 'Back off and watch the blade.'],
  roll_toward: ['Close the gap before it lands.', 'Inside its guard. Go now.', 'Forward, under the arc.'],
  roll_through: ['Through it, not away from it.', 'Slip past its side.', 'Behind it is the only safe place.'],
  jump_back: ['Off the floor. Let it pass under.', 'Feet up, away from the ink.', 'Hop clear of the impact.'],
  attack: ['It is busy writing. Cut the pen.', 'Pressure it. Do not let it finish.', 'Strike while it is open.'],
  heavy: ['One heavy blow, right now.', 'Wind up. Make it count.', 'It is open. Break its stance.'],
  heal: ['Drink while there is time.', 'Heal now, before the next one.', 'Steady. Mend first.'],
  hold: ['Wait. Read it fully.', 'Not yet. Let it commit.', 'Hold still and watch.'],
};

export class MockBrain {
  constructor({ agentId, seed = 1, baseError = 0.5, label = 'mock' } = {}) {
    this.kind = 'mock';
    this.agentId = agentId;
    this.label = label;
    this.baseError = baseError;
    this.rng = makeRng(hash2(seed, hashString(agentId || 'x')));
    this.fam = {};      // familiarity per attack (grows with exposure and deaths)
    this.lessons = {};  // attackId -> { good: 'action timing', bad: 'action timing' }
  }

  thinkMs() { return range(this.rng, 450, 1100); }

  errorRate(attackId) {
    return Math.max(0.06, this.baseError * Math.pow(0.7, this.fam[attackId] || 0));
  }

  decide(obs, { world }) {
    const attackId = world.thinking ? world.thinking.attackId : world.boss.attackId;
    const opts = evaluateOptions(world, agentController);
    this.fam[attackId] = (this.fam[attackId] || 0) + 0.12;
    const top = opts.filter((o) => o.score >= opts[0].score - 1);
    let choice = top[Math.floor(rand(this.rng) * top.length)];
    let erred = false;
    if (rand(this.rng) < this.errorRate(attackId)) {
      erred = true;
      const r = rand(this.rng);
      if (r < 0.45 && choice.action !== 'hold') {
        choice = { action: choice.action, timing: pick(this.rng, TIMINGS.filter((t) => t !== choice.timing)) };
      } else if (r < 0.8) {
        const evasive = ['roll_away', 'roll_toward', 'roll_through', 'jump_back', 'hold'].filter((x) => x !== choice.action);
        choice = { action: pick(this.rng, evasive), timing: pick(this.rng, TIMINGS) };
      } else {
        choice = { action: pick(this.rng, ACTIONS), timing: pick(this.rng, TIMINGS) };
      }
    }
    return {
      action: choice.action,
      timing: choice.timing,
      thought: pick(this.rng, THOUGHTS[choice.action] || THOUGHTS.hold), // (show) moves outside the old action set
      read: READS[choice.action] || '',
      note: 0,
      valid: true,
      source: erred ? 'mock-slip' : 'mock',
    };
  }

  reflect(info, { world }) {
    const k = world.log.killedBy;
    if (k && k.attackId) this.fam[k.attackId] = (this.fam[k.attackId] || 0) + 1;
    for (const d of world.log.decisions) {
      const L = (this.lessons[d.attackId] ||= { good: null, bad: null, seen: 0 });
      L.seen += 1;
      if (d.damageTaken > 0 || (k && d === world.log.decisions[world.log.decisions.length - 1])) {
        this.fam[d.attackId] = (this.fam[d.attackId] || 0) + 0.4;
        L.bad = `${d.action} ${d.timing}`;
      } else L.good = `${d.action} ${d.timing}`;
    }
    const ranked = Object.entries(this.lessons).sort((x, y) => y[1].seen - x[1].seen);
    const notes = [];
    if (k && k.attackId) notes.push(`Died to ${k.desc || 'it'}. Watch for when it ${shortPose(k.attackId)}.`);
    for (const [id, L] of ranked) {
      if (notes.length >= MAX_NOTES) break;
      if (L.good) notes.push(`When it ${shortPose(id)}: ${L.good.replace('_', ' ')} worked.`);
      else if (L.bad) notes.push(`When it ${shortPose(id)}: ${L.bad.replace('_', ' ')} failed.`);
    }
    return { notes: notes.slice(0, MAX_NOTES), lesson: notes[0] || '', valid: true };
  }
}

// ---- proxy errors ----------------------------------------------------------------
// Fatal (stop calling the proxy): 401 / 403 (key or access refused) and 402 / "budget" /
// "insufficient credits" (the proxy's spend cap, or OpenRouter out of credit).
// Everything else (429, 5xx, network errors, a body that is not JSON) is transient: the
// call is retried once after a short backoff, and if that fails too the agent plays THAT
// decision on instinct (mock) and asks the model again next time.
const CREDIT_RE = /budget|insufficient[_ ]credit|out of credit|credits? (?:exhausted|spent)/i;
export const isCredits = (err) => !!err && (err.status === 402 || CREDIT_RE.test(String(err.message || '')));
export const isFatal = (err) => !!err && (err.status === 401 || err.status === 403 || isCredits(err));
export const CREDITS_NOTICE = 'LLM credits exhausted — agents continue on instinct (mock)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class LLMBrain {
  constructor({ agentId, model, endpoint = '/api/brain', fetchImpl, retryMs = 600 } = {}) {
    this.kind = 'llm';
    this.agentId = agentId;
    this.model = model;
    this.label = model;
    this.endpoint = endpoint;
    this.retryMs = retryMs;
    this.fetch = fetchImpl || ((...args) => fetch(...args));
    // Every answer is kept, keyed by the exact request. A reply that lands after its decision
    // timed out is not thrown away: the same request later is answered from here at once
    // (the proxy's .brain-cache.json keeps it too, so it is never paid for twice).
    this.answers = new Map();
  }

  async once(body) {
    let res;
    try {
      res = await this.fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    } catch (e) {
      const err = new Error(`network: ${e && e.message ? e.message : e}`);
      err.transient = true;
      throw err;
    }
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j && j.error ? String(j.error.message || j.error) : ''; } catch { /* not json */ }
      const err = new Error(`brain http ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
      err.status = res.status;
      throw err;
    }
    let j;
    try { j = await res.json(); } catch {
      const err = new Error('brain reply was not JSON');
      err.transient = true;
      throw err;
    }
    const msg = j && j.choices && j.choices[0] && j.choices[0].message;
    return (msg && msg.content) || '';
  }

  async call(system, user, maxTokens, extra = {}) {
    const body = JSON.stringify({
      model: this.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      temperature: 0.4,
      ...extra,
    });
    if (this.answers.has(body)) { this.cacheHits = (this.cacheHits || 0) + 1; return this.answers.get(body); }
    this.calls = (this.calls || 0) + 1;
    let text;
    try {
      text = await this.once(body);
    } catch (err) {
      if (isFatal(err)) throw err;
      this.retries = (this.retries || 0) + 1;
      await sleep(this.retryMs);
      text = await this.once(body); // a second failure goes to the driver (mock for this decision)
    }
    this.answers.set(body, text);
    if (this.answers.size > 300) this.answers.delete(this.answers.keys().next().value);
    return text;
  }

  async decide(obs) {
    // minimal reasoning keeps the freeze short (decisions time out after THINK_TIMEOUT_MS)
    const text = await this.call(DECIDE_SYSTEM, obs.text, 900, { reasoning: { effort: 'minimal', exclude: true } });
    return { ...parseDecision(text), source: 'llm', raw: String(text).slice(0, 400) };
  }

  async reflect(info, ctx = {}) {
    // (r3) 1200 tokens let low-effort reasoning eat the budget and cut replies off mid-rule
    const text = await this.call(REFLECT_SYSTEM, info.text, 3000, { reasoning: { effort: 'low', exclude: true } });
    return { ...parseNotes(text, ctx.notes || []), source: 'llm', raw: String(text).slice(0, 900) };
  }
}

// The latest earlier decision against the same pose: this life first, then past lives.
export function recallFor(m, agent, attackId) {
  if (!attackId) return null;
  const ds = m.world.log.decisions;
  for (let i = ds.length - 1; i >= 0; i--) {
    if (ds[i].attackId === attackId && ds[i].outcome) return ds[i];
  }
  const mem = m.memory && m.memory[agent];
  return (mem && mem[attackId]) || null;
}

// Every decision this challenger made this match (past lives + this one), for the reflection.
export function triedFor(m, agent) {
  const out = [];
  for (const h of m.history) {
    if (h.agent !== agent || !h.log) continue;
    for (const d of h.log) out.push({ attackId: d.attackId, action: d.action, timing: d.timing, hit: d.taken > 0 || /killed/.test(d.outcome || '') });
  }
  if (m.world.agent.id === agent && !m.history.some((h) => h.attempt === m.attempt)) {
    for (const d of m.world.log.decisions) out.push({ attackId: d.attackId, action: d.action, timing: d.timing, hit: d.damageTaken > 0 || /killed/.test(d.outcome || '') });
  }
  return out;
}

// Fulfils match requests. Call service(match) after every match tick.
//   instant: mock answers land with no freeze delay (headless sims)
//   now: real-time clock (ms) for LLM timeouts
//   onNotice(msg, { kind }): kind 'credits' (credits/budget gone: every agent is on mock now),
//     'fatal' (this agent's proxy access refused), 'transient' (one move played on instinct)
// Circuit breaker: after BREAKER_FAILS transient failures in a row an agent plays on instinct
// for BREAKER_MS of real time, then asks the model again (a dead proxy must not add a retry
// to every freeze; a short outage must not cost the LLM for the whole session).
const BREAKER_FAILS = 3, BREAKER_MS = 30000;
const MOCK_DECIDE_AT_MS = 120;

export function createBrainDriver({ brains, instant = false, now = () => Date.now(), seed = 1, onNotice = () => {} } = {}) {
  const fallbacks = {};
  const fallbackFor = (agent) => (fallbacks[agent] ||= new MockBrain({ agentId: agent, seed: hash2(seed, 31337), label: 'mock (fallback)' }));
  const health = {}; // agent -> { fails, openUntil }
  let creditsGone = false;
  const driver = {
    brains,
    label(agent) { return brains[agent] ? brains[agent].label : '?'; },
    kind(agent) { return brains[agent] ? brains[agent].kind : '?'; },

    service(m) {
      const p = m.pending;
      if (!p || p.reply) return;
      const agent = p.agent;
      const w = m.world;
      const brain = brains[agent];
      const notes = m.notes[agent];

      const observe = () => buildObservation(w, notes, recallFor(m, agent, p.attackId));
      if (brain.kind === 'mock') {
        if (p.kind === 'decide') {
          // (qa2) the mock "thinks" 450-1100 ms anyway; its look-ahead (~5-8 ms of oracle sims)
          // used to land on the freeze's first frame, on top of the page being built. Answer a
          // little later instead: the world is frozen and the reveal is at minMs * 0.45 (>= 200
          // ms), so the decision and its timing are unchanged.
          if (!instant && brain instanceof MockBrain && w.thinking && w.thinking.elapsed < MOCK_DECIDE_AT_MS) return;
          p.obs = observe();
          p.reply = brain.decide(p.obs, { world: w });
          p.minMs = instant ? 0 : brain.thinkMs();
        } else {
          p.obs = buildReflection(w, notes, triedFor(m, agent));
          p.reply = brain.reflect(p.obs, { world: w, notes });
        }
        return;
      }

      const h = (health[agent] ||= { fails: 0, openUntil: 0 });
      const instinct = (why) => {
        // this one decision on instinct (mock); the LLM brain stays in its slot
        const fb = fallbackFor(agent);
        m.llm.fallbacks = (m.llm.fallbacks || 0) + 1;
        if (p.kind === 'decide') {
          const r = w.thinking ? fb.decide(p.obs, { world: w }) : { action: 'hold', timing: 'on_cue', thought: '' };
          return { ...r, source: `fallback:${why}` };
        }
        return { notes, lesson: '', source: `fallback:${why}` };
      };

      if (p.sentAt == null) {
        p.sentAt = now();
        p.obs = p.kind === 'decide' ? observe() : buildReflection(w, notes, triedFor(m, agent));
        if (h.openUntil > p.sentAt) { p.reply = instinct('breaker'); return; }
        const job = p.kind === 'decide' ? brain.decide(p.obs, { world: w }) : brain.reflect(p.obs, { world: w, notes });
        job.then((r) => {
          h.fails = 0;
          if (m.pending === p && !p.reply) p.reply = r;
          else if (p.timedOut) m.llm.late = (m.llm.late || 0) + 1; // kept in the brain's answer cache
        }).catch((err) => {
          if (isCredits(err)) {
            // credits are per account, not per agent: every LLM slot goes to instinct
            for (const id of Object.keys(brains)) if (brains[id] && brains[id].kind === 'llm') brains[id] = fallbackFor(id);
            if (!creditsGone) { creditsGone = true; onNotice(CREDITS_NOTICE, { kind: 'credits', error: err.message }); }
          } else if (isFatal(err)) {
            brains[agent] = fallbackFor(agent);
            onNotice(`${agent}: LLM refused (${err.message}); mock brain from now on`, { kind: 'fatal' });
          } else {
            h.fails += 1;
            if (h.fails >= BREAKER_FAILS) {
              h.openUntil = now() + BREAKER_MS;
              h.fails = 0;
              onNotice(`${agent}: LLM failing (${err.message}); on instinct for ${BREAKER_MS / 1000}s`, { kind: 'transient' });
            } else onNotice(`${agent}: LLM hiccup (${err.message}); this move on instinct`, { kind: 'transient' });
          }
          if (m.pending === p && !p.reply) p.reply = instinct(isFatal(err) ? 'fatal' : 'transient');
        });
        return;
      }

      const limit = p.kind === 'decide' ? THINK_TIMEOUT_MS : REFLECT_TIMEOUT_MS;
      if (now() - p.sentAt > limit) {
        p.timedOut = true; // a reply that still arrives is cached by the brain, not dropped
        p.reply = p.kind === 'decide'
          ? { action: 'hold', timing: 'on_cue', thought: 'Too slow. Frozen in doubt.', source: 'timeout' }
          : { notes, lesson: '', source: 'timeout' };
      }
    },
  };
  return driver;
}

export function createMockBrains(seed = 1) {
  return {
    claude: new MockBrain({ agentId: 'claude', seed, baseError: 0.6 }),
    gpt: new MockBrain({ agentId: 'gpt', seed, baseError: 0.6 }),
  };
}
