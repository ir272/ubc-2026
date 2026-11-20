// Match flow: Claude and GPT alternate attempts; scoreboard; notes; attract loop.
// Fairness: the challenger who opens a match alternates too (match 1 Claude, match 2 GPT, ...),
// so neither model always gets the extra life when a match ends on an odd attempt.
// Owner: core (flow) / ui reads it. PURE: no DOM.
//
// The match never talks to a brain directly. When it needs one it sets
//   m.pending = { id, kind: 'decide'|'reflect', agent, minMs }
// and a driver (src/ai/brain.js) fills `m.pending.reply`. tickMatch applies it.
//
// Phases: 'fight' -> ('death' -> next attempt) | ('victory' -> new match)

import { AGENT_IDS, MATCH } from '../core/constants.js';
import { hash2 } from '../core/rng.js';
import { createWorld, stepWorld, applyDecision } from './world.js';

const blankScore = () => ({ attempts: 0, deaths: 0, kills: 0, bestBossPct: 1, firstKillAttempt: null, decisions: 0 });

export function createMatch({ seed = 1, decisions = true, fast = false, matchNo = 1, matchesWon = null } = {}) {
  const m = {
    seed, matchNo, decisions, fast,
    t: 0, phase: 'fight', phaseT: 0,
    attempt: 0, current: null,
    score: Object.fromEntries(AGENT_IDS.map((id) => [id, blankScore()])),
    firstKill: null,
    matchesWon: matchesWon || Object.fromEntries(AGENT_IDS.map((id) => [id, 0])),
    notes: Object.fromEntries(AGENT_IDS.map((id) => [id, []])),
    thoughts: Object.fromEntries(AGENT_IDS.map((id) => [id, ''])),
    lastDecision: null,
    pending: null, reqSeq: 0, reflected: false, reflectNote: null,
    history: [],     // one summary per finished attempt
    memory: Object.fromEntries(AGENT_IDS.map((id) => [id, {}])), // agent -> attackId -> last decision vs that pose
    reflections: [], // { attempt, agent, lesson, notes, source }
    llm: { decisions: 0, invalid: 0, reflections: 0, invalidReflections: 0 },
    events: [],      // match-level events, drained by the host
    world: null,
  };
  startAttempt(m);
  return m;
}

function mEmit(m, type, data) { m.events.push({ type, t: m.t, ...data }); }

// Who plays attempt n of match matchNo: the opener alternates per match, then attempts alternate.
export function agentForAttempt(matchNo, attempt) {
  const n = AGENT_IDS.length;
  const opener = (((matchNo || 1) - 1) % n + n) % n;
  return AGENT_IDS[(opener + attempt - 1) % n];
}

export function startAttempt(m) {
  m.attempt += 1;
  const agent = agentForAttempt(m.matchNo, m.attempt);
  m.current = agent;
  m.world = createWorld({ seed: hash2(m.seed, m.attempt), agentId: agent, decisions: m.decisions });
  m.score[agent].attempts += 1;
  m.phase = 'fight';
  m.phaseT = 0;
  m.pending = null;
  m.reflected = false;
  m.reflectNote = null;
  mEmit(m, 'match.attempt', { agent, attempt: m.attempt });
}

export function tickMatch(m, dt, controller) {
  m.t += dt;
  m.phaseT += dt;
  const w = m.world;

  if (m.phase === 'fight') {
    if (w.thinking) {
      w.thinking.elapsed += dt;
      if (!m.pending) {
        m.pending = { id: ++m.reqSeq, kind: 'decide', agent: m.current, attackId: w.thinking.attackId, minMs: 0, reply: null };
        mEmit(m, 'think.start', { agent: m.current, attackId: w.thinking.attackId });
      }
      const p = m.pending;
      if (p.kind === 'decide' && p.reply && p.revealAt == null) {
        // when the thought appears on screen; keep it readable before unfreezing
        p.revealAt = p.minMs ? p.minMs * 0.45 : w.thinking.elapsed;
        if (!m.fast) p.minMs = Math.max(p.minMs || 0, p.revealAt + 700);
      }
      if (p.kind === 'decide' && p.reply && w.thinking.elapsed >= (p.minMs || 0)) {
        const rec = applyDecision(w, p.reply, controller);
        rec.read = p.reply.read || '';
        rec.note = p.reply.note || 0;
        rec.notesSeen = m.notes[m.current].length;
        rec.obs = p.obs ? p.obs.text : '';
        if (p.reply.source === 'llm') {
          m.llm.decisions += 1;
          if (!p.reply.valid) { m.llm.invalid += 1; rec.raw = p.reply.raw || ''; }
        }
        m.thoughts[m.current] = p.reply.thought || '';
        m.lastDecision = { agent: m.current, ...p.reply };
        m.score[m.current].decisions += 1;
        m.pending = null;
        mEmit(m, 'think.end', { agent: m.current, action: rec.action, timing: rec.timing, thought: rec.thought });
      }
      return;
    }
    stepWorld(w, dt, controller);
    const sc = m.score[m.current];
    sc.bestBossPct = Math.min(sc.bestBossPct, w.boss.hp / w.boss.maxHp);

    if ((w.outcome === 'agent_dead' || w.outcome === 'written') && w.endT >= (m.fast ? 0 : MATCH.agentDeathHoldMs)) {
      sc.deaths += 1;
      finishAttempt(m, 'death');
      m.phase = 'death';
      m.phaseT = 0;
      mEmit(m, 'match.death', { agent: m.current, attempt: m.attempt, killedBy: w.log.killedBy });
    } else if (w.outcome === 'boss_dead' && w.endT >= (m.fast ? 0 : MATCH.bossDeathHoldMs)) {
      sc.kills += 1;
      if (sc.firstKillAttempt == null) sc.firstKillAttempt = m.attempt;
      if (!m.firstKill) m.firstKill = { agent: m.current, attempt: m.attempt };
      m.matchesWon[m.current] += 1;
      finishAttempt(m, 'kill');
      m.phase = 'victory';
      m.phaseT = 0;
      mEmit(m, 'match.victory', { agent: m.current, attempt: m.attempt });
    }
    return;
  }

  if (m.phase === 'death') {
    stepWorld(w, dt, controller); // keep animating the aftermath
    if (!m.reflected && !m.pending) {
      m.pending = { id: ++m.reqSeq, kind: 'reflect', agent: m.current, minMs: 0, reply: null };
    }
    if (m.pending && m.pending.kind === 'reflect' && m.pending.reply) {
      const r = m.pending.reply;
      const before = m.notes[m.current].slice();
      if (Array.isArray(r.notes)) m.notes[m.current] = r.notes.slice(0, 5);
      // (qa2) a reflection that could not be used is never silent: it is logged on the
      // reflection record and the attempt's history entry, and the death card says so
      const rs = reflectionStatus(r, before, m.notes[m.current]);
      m.reflectNote = rs;
      const last = m.history[m.history.length - 1];
      if (rs && last && last.attempt === m.attempt) last.reflection = rs.status;
      if (r.source === 'llm') {
        m.llm.reflections += 1;
        if (!r.valid) m.llm.invalidReflections += 1;
      }
      m.reflections.push({
        matchNo: m.matchNo, attempt: m.attempt, agent: m.current, lesson: r.lesson || '', notes: m.notes[m.current].slice(),
        source: r.source || null, valid: r.valid !== false, raw: r.valid === false ? r.raw || '' : undefined,
        status: rs ? rs.status : 'ok', statusText: rs ? rs.text : undefined,
        report: m.pending.obs ? m.pending.obs.text.slice(0, 1600) : '',
      });
      if (m.reflections.length > 40) m.reflections.shift();
      m.reflected = true;
      m.pending = null;
      mEmit(m, 'match.reflected', { agent: m.current, attempt: m.attempt, notes: m.notes[m.current], status: rs ? rs.status : 'ok', statusText: rs ? rs.text : null });
    }
    if (m.reflected && m.phaseT >= (m.fast ? 0 : MATCH.deathScreenMs)) startAttempt(m);
    return;
  }

  if (m.phase === 'victory') {
    stepWorld(w, dt, controller);
    if (!m.fast && m.phaseT >= MATCH.victoryMs) resetMatch(m);
  }
}

// Why a reflection's notes were not (fully) taken, or null when they were.
//   unreadable: the reply had no usable notes; the previous notes stand
//   cut:        the reply was cut off; its complete notes were kept, then the old ones
//   plain:      the reply was not JSON; its lines that read as rules were taken as notes
//   no_reply:   the reflection timed out or failed; the previous notes stand
export function reflectionStatus(r, before, after) {
  const src = String(r.source || '');
  const same = before.length === after.length && before.every((n, i) => n === after[i]);
  if (src === 'timeout') return { status: 'no_reply', text: 'notes unchanged: reflection timed out' };
  if (src.startsWith('fallback')) return { status: 'no_reply', text: 'notes unchanged: no reflection (LLM unavailable)' };
  if (src !== 'llm' || r.valid !== false) return null;
  if (r.salvaged) return { status: 'cut', text: `reflection cut off: kept ${after.length} complete note${after.length === 1 ? '' : 's'}` };
  // (qa3) 'plain' only when the reply's lines were recognisable rules; anything else (an error
  // page, an apology, gibberish) left the previous notes standing
  if (r.plain && !same && after.length) return { status: 'plain', text: 'reflection was not JSON: notes read line by line' };
  return { status: 'unreadable', text: 'notes unchanged: reflection unreadable' };
}

const OBS_KEEP = 360;
function finishAttempt(m, result) {
  const w = m.world;
  const mem = m.memory[m.current];
  for (const d of w.log.decisions) {
    mem[d.attackId] = {
      attackId: d.attackId, action: d.action, timing: d.timing, outcome: d.outcome || 'it killed you',
      damageTaken: d.damageTaken, damageDealt: d.damageDealt, firedAt: d.firedAt == null ? null : d.firedAt,
      hits: d.hits ? d.hits.slice(0, 2) : [], prev: d.prev || null, pastLife: true,
    };
  }
  m.history.push({
    attempt: m.attempt, agent: m.current, result,
    seconds: (w.outcomeT ?? w.t) / 1000, // the fight, not the death/victory hold after it
    bossHpPct: w.boss.hp / w.boss.maxHp,
    decisions: w.log.decisions.length,
    killedBy: w.log.killedBy ? w.log.killedBy.attackId : null,
    damageDealt: w.log.damageDealt, damageTaken: w.log.damageTaken,
    heals: w.log.heals, dodges: w.log.dodges,
    notesBefore: m.notes[m.current].slice(),
    log: w.log.decisions.map((d) => ({
      attackId: d.attackId, action: d.action, timing: d.timing, read: d.read || '', note: d.note || 0,
      thought: d.thought, source: d.source, taken: d.damageTaken, dealt: d.damageDealt,
      outcome: d.outcome || 'it killed you', obs: (d.obs || '').slice(0, OBS_KEEP), raw: d.raw,
    })),
  });
}

export function resetMatch(m) {
  const fresh = createMatch({
    seed: hash2(m.seed, 9001 + m.matchNo), decisions: m.decisions, fast: m.fast,
    matchNo: m.matchNo + 1, matchesWon: m.matchesWon,
  });
  const events = m.events;
  fresh.llm = m.llm; // LLM parse stats are per session, not per match
  // (agents r2) a challenger keeps what it learned: its notes and its memory of each pose
  // carry into the next match, so a model that died once fights the next match better.
  fresh.notes = m.notes;
  fresh.memory = m.memory;
  fresh.reflections = m.reflections;
  Object.assign(m, fresh);
  m.events = events.concat(fresh.events);
  mEmit(m, 'match.reset', { matchNo: m.matchNo });
}

export function summarizeMatch(m) {
  return {
    matchNo: m.matchNo, matchSeed: m.seed, attempt: m.attempt, current: m.current, phase: m.phase,
    phaseT: Math.round(m.phaseT),
    score: m.score, firstKill: m.firstKill, matchesWon: m.matchesWon,
    notes: m.notes, thoughts: m.thoughts, lastDecision: m.lastDecision,
    pending: m.pending ? { kind: m.pending.kind, agent: m.pending.agent, hasReply: !!m.pending.reply } : null,
    history: m.history.slice(-10),
    reflections: m.reflections.slice(-10),
    reflectNote: m.reflectNote || null,
    llm: m.llm,
  };
}
