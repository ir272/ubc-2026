#!/usr/bin/env node
// Offline checks of the brain driver's failure handling (no network, no LLM spend):
// LLMBrain gets a stubbed fetch that answers each request from a script.
//   node tools/brain_test.mjs
// Covers: retry-once on 5xx / network / bad JSON, mock for that one decision when the retry
// fails too, 401/403 fatal for that agent, 402 / "insufficient credits" switches every LLM
// slot to mock with the credits notice, the circuit breaker, the 9 s decision timeout and a
// late reply landing in the answer cache, and how a reflection reply is read (JSON, cut off,
// error page, gibberish, apology, plain-text rules).

import { TICK_MS, THINK_TIMEOUT_MS } from '../src/core/constants.js';
import { createMatch, tickMatch, reflectionStatus } from '../src/sim/match.js';
import { parseNotes } from '../src/ai/prompts.js';
import { createBrainDriver, LLMBrain, agentController, CREDITS_NOTICE, isFatal, isCredits } from '../src/ai/brain.js';

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`); if (!ok) failures++; };

const reply = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
const httpErr = (status, error) => ({ ok: false, status, json: async () => ({ error }) });
const badJson = () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
const DECISION = JSON.stringify({ read: 'a wide sweep', note: 0, action: 'roll_away', timing: 'on_cue', thought: 'Out of its reach.' });

// script: array of steps; each step is a response factory, 'throw' (network error) or
// { delayMs, then } (resolves after a fake-clock delay)
function stubFetch(script, clock) {
  const calls = [];
  const f = async (url, init) => {
    calls.push(JSON.parse(init.body).model);
    const step = script.length ? script.shift() : () => reply(DECISION);
    if (step === 'throw') throw new TypeError('Failed to fetch');
    if (step && step.delayMs) {
      const due = clock.t + step.delayMs;
      await new Promise((res) => { const iv = setInterval(() => { if (clock.t >= due) { clearInterval(iv); res(); } }, 1); });
      return step.then();
    }
    return step();
  };
  f.calls = calls;
  return f;
}

async function scenario(name, { claude = [], gpt = [], timeLimitMs = 60000, until }) {
  const clock = { t: 0 };
  const fC = stubFetch(claude, clock), fG = stubFetch(gpt, clock);
  const brains = {
    claude: new LLMBrain({ agentId: 'claude', model: 'anthropic/claude-haiku-5.5', fetchImpl: fC, retryMs: 5 }),
    gpt: new LLMBrain({ agentId: 'gpt', model: 'openai/gpt-6-luna', fetchImpl: fG, retryMs: 5 }),
  };
  const notices = [];
  const m = createMatch({ seed: 3, decisions: true, fast: true });
  const driver = createBrainDriver({ brains, now: () => clock.t, seed: 3, onNotice: (msg, o = {}) => notices.push({ msg, kind: o.kind }) });
  const replies = [];
  let lastPending = null;
  for (let i = 0; i < 400000 && clock.t < timeLimitMs; i++) {
    tickMatch(m, TICK_MS, agentController);
    driver.service(m);
    m.world.events.length = 0; m.events.length = 0;
    if (m.pending && m.pending !== lastPending) lastPending = m.pending;
    if (lastPending && lastPending.reply && !lastPending.logged) { lastPending.logged = true; replies.push({ kind: lastPending.kind, agent: lastPending.agent, source: lastPending.reply.source, action: lastPending.reply.action }); }
    clock.t += TICK_MS; // the fake real-time clock runs with the sim
    if ((m.pending && !m.pending.reply) || i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); // let replies land
    if (until && until({ m, replies, notices, brains, driver })) break;
  }
  return { m, replies, notices, brains, driver, fC, fG, clock };
}

check('classify: 401/402/403 fatal, 429/500/network transient', isFatal({ status: 401 }) && isFatal({ status: 402 }) && isFatal({ status: 403 })
  && !isFatal({ status: 429 }) && !isFatal({ status: 500 }) && !isFatal({ status: 400 }) && !isFatal(new Error('network: Failed to fetch')));
check('classify: budget / insufficient credits messages are credits', isCredits(new Error('brain http 402: LLM budget spent ($1.00 of $1.00)'))
  && isCredits({ status: 502, message: 'brain http 502: Insufficient credits. Add more using https://openrouter.ai/settings/credits' }));

{ // 500 then success: retried once, the LLM answer is used
  const r = await scenario('retry', { claude: [() => httpErr(500, 'upstream'), () => reply(DECISION)], until: ({ replies }) => replies.some((x) => x.kind === 'decide') });
  const d = r.replies.find((x) => x.kind === 'decide');
  check('500 then 200: retried once, LLM answer used', d && d.source === 'llm' && r.fC.calls.length === 2 && r.brains.claude.kind === 'llm', JSON.stringify(d));
}
{ // 503 twice: mock for this decision only; the next decision asks the LLM again
  const r = await scenario('fallback', { claude: [() => httpErr(503, 'busy'), () => httpErr(503, 'busy')], until: ({ replies }) => replies.filter((x) => x.kind === 'decide').length >= 2 });
  const ds = r.replies.filter((x) => x.kind === 'decide');
  check('503 x2: that decision on instinct (mock)', ds[0] && ds[0].source === 'fallback:transient', JSON.stringify(ds[0]));
  check('503 x2: LLM kept, next decision is the LLM again', r.brains.claude.kind === 'llm' && ds[1] && ds[1].source === 'llm', JSON.stringify(ds[1]));
  check('503 x2: transient notice, no credits banner', r.notices.some((n) => n.kind === 'transient') && !r.notices.some((n) => n.kind === 'credits'));
}
{ // network error + bad JSON are transient too
  const r = await scenario('net', { claude: ['throw', badJson], until: ({ replies }) => replies.some((x) => x.kind === 'decide') });
  const d = r.replies.find((x) => x.kind === 'decide');
  check('network error then bad JSON: instinct for one decision, LLM kept', d && d.source === 'fallback:transient' && r.brains.claude.kind === 'llm', JSON.stringify(d));
}
{ // 402 from OpenRouter (insufficient credits): every LLM slot -> mock, banner, match runs on
  const r = await scenario('credits', { claude: [() => httpErr(402, 'Insufficient credits. Add more using https://openrouter.ai/settings/credits')], timeLimitMs: 900000, until: ({ m }) => m.history.length >= 2 });
  check('402: credits notice once', r.notices.filter((n) => n.kind === 'credits').length === 1 && r.notices[0].msg === CREDITS_NOTICE, JSON.stringify(r.notices));
  check('402: both slots on mock, no retry of a 402', r.brains.claude.kind === 'mock' && r.brains.gpt.kind === 'mock' && r.fC.calls.length === 1 && r.fG.calls.length === 0);
  check('402: the match keeps running', r.m.history.length >= 2, `attempts finished: ${r.m.history.length}`);
}
{ // proxy budget refusal (402 from server.mjs)
  const r = await scenario('budget', { claude: [() => httpErr(402, 'LLM budget spent ($1.0001 of $1.00)')], until: ({ notices }) => notices.length > 0 });
  check('402 proxy budget: credits notice', r.notices[0] && r.notices[0].kind === 'credits');
}
{ // 401: fatal for that agent only
  const r = await scenario('auth', { claude: [() => httpErr(401, 'No auth credentials found')], until: ({ replies }) => replies.some((x) => x.kind === 'decide') });
  check('401: that agent on mock, the other still LLM', r.brains.claude.kind === 'mock' && r.brains.gpt.kind === 'llm' && r.notices[0] && r.notices[0].kind === 'fatal');
}
{ // breaker: three failed decisions in a row -> instinct without calling for a while
  const fail = () => httpErr(500, 'down');
  const r = await scenario('breaker', { claude: Array(40).fill(fail), until: ({ replies }) => replies.filter((x) => x.kind === 'decide' && x.agent === 'claude').length >= 5 });
  const ds = r.replies.filter((x) => x.kind === 'decide' && x.agent === 'claude');
  check('breaker: opens after 3 failed decisions', ds.slice(3, 5).every((x) => x.source === 'fallback:breaker') && r.fC.calls.length === 6, `${ds.map((x) => x.source).join(',')} calls=${r.fC.calls.length}`);
}
{ // 9 s timeout; the late reply is kept in the brain's answer cache
  const late = { delayMs: THINK_TIMEOUT_MS + 2500, then: () => reply(DECISION) };
  const r = await scenario('timeout', { claude: [late], until: ({ m }) => (m.llm.late || 0) >= 1 });
  const d = r.replies.find((x) => x.kind === 'decide');
  check(`timeout at ${THINK_TIMEOUT_MS / 1000}s -> hold`, THINK_TIMEOUT_MS === 9000 && d && d.source === 'timeout' && d.action === 'hold', JSON.stringify(d));
  check('late reply counted and cached, not dropped', r.m.llm.late === 1 && r.brains.claude.answers.size === 1);
}

{ // (qa3) reflection replies: only real rules replace the notes; garbage keeps the old ones
  const OLD = ['When it cocks the pen high: roll_away late, because the slash comes late.', 'When it slams the book: jump_back on_cue, because the ring rises.'];
  const read = (text) => {
    const r = { ...parseNotes(text, OLD), source: 'llm' };
    if (Array.isArray(r.notes)) r.notes = r.notes.slice(0, 5);
    return { r, st: reflectionStatus(r, OLD, r.notes) };
  };
  const same = (n) => n.length === OLD.length && n.every((x, i) => x === OLD[i]);
  { const { r, st } = read(JSON.stringify({ lesson: 'Rolled too early into the slash.', notes: ['When it crouches low: roll_through late, because the blade sweeps wide.'] }));
    check('reflect: valid JSON replaces the notes, no status', r.valid && r.notes.length === 1 && /roll_through/.test(r.notes[0]) && st === null, JSON.stringify(st)); }
  { const { r, st } = read('{"lesson":"too early","notes":["When it rears up: roll_toward on_cue, because the book lands behind.","When it raises the bo');
    check('reflect: truncated JSON keeps the complete note + old ones for other poses', r.salvaged && r.notes.length === 3 && /roll_toward/.test(r.notes[0]) && st && st.status === 'cut', `${JSON.stringify(r.notes)} ${st && st.status}`); }
  { const html = '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>cloudflare</center>\r\n</body>\r\n</html>';
    const { r, st } = read(html);
    check('reflect: HTML 502 page keeps the old notes, unreadable', same(r.notes) && st && st.status === 'unreadable' && st.text === 'notes unchanged: reflection unreadable', `${JSON.stringify(r.notes)} ${st && st.status}`); }
  { const { r, st } = read('xq7 vvlorp ~~ 0x3fe9 ##@@ blarg\nzzkt mmm qqq frab nosh\n;;;; ____ 4411');
    check('reflect: gibberish keeps the old notes, unreadable', same(r.notes) && st && st.status === 'unreadable', `${JSON.stringify(r.notes)} ${st && st.status}`); }
  { const { r, st } = read("I'm sorry, but I can't help with that request.\nI apologize for any confusion; please try again later.");
    check('reflect: an apology keeps the old notes, unreadable', same(r.notes) && st && st.status === 'unreadable', `${JSON.stringify(r.notes)} ${st && st.status}`); }
  { const { r, st } = read('Here are my notes for the next life:\n1. When it cocks the pen-blade high over its shoulder: roll_through late, because the slash sweeps the near side.\n2. When it slaps the book flat on the floor: jump_back on_cue, because the ink rises under you.\nGood luck!');
    check('reflect: real plain-text rules are read line by line, status plain', r.plain && r.notes.length === 2 && /roll_through/.test(r.notes[0]) && /jump_back/.test(r.notes[1]) && st && st.status === 'plain', `${JSON.stringify(r.notes)} ${st && st.status}`); }
  { const { r, st } = read('{"lesson": "the slam got me"}');
    check('reflect: JSON with no notes keeps the old notes, unreadable', same(r.notes) && st && st.status === 'unreadable', `${st && st.status}`); }
}

console.log(failures ? `${failures} FAILED` : 'all brain checks passed');
process.exit(failures ? 1 : 0);
