// Model brains through OpenRouter. Node side only. Any model id works: nothing here names a
// model or a provider. Every call has a timeout and a fallback, a small token cap, a compact
// JSON answer that is repaired or defaulted, a cost entry in .cache/cost.json, and a content
// check on anything that will be shown. When the budget is spent, or the key is refused, the
// brain plays on as a scripted one and says so in `source`.

import fs from 'node:fs';
import path from 'node:path';
import { ATTACKS } from '../sim/attacks.js';
import { createMockBrain } from './mock.js';
import { cleanLine, checkLine, looseJson } from './content.js';

const UPSTREAM = 'https://openrouter.ai/api/v1/chat/completions';
const LIMIT_MS = { pick: 7000, decide: 9500, note: 6000, say: 6500 };
// Room for a reasoning model's hidden tokens: at 220 half of one model's answers were cut off
// mid-JSON (first real trial). The visible answer is still one short line.
const MAX_TOKENS = { pick: 500, decide: 700, note: 600, say: 500 };
const CREDIT_RETRY_MS = 10 * 60 * 1000; // out of credit: ask again in ten minutes, in case it was topped up

// ---- the cost log: one file, shared by every brain in the process ---------------------------
const logs = new Map();
function costLog(file, budgetUsd) {
  if (logs.has(file)) { const l = logs.get(file); l.budgetUsd = budgetUsd; return l; }
  let data = { spentUsd: 0, calls: 0, byModel: {}, log: [] };
  try { data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  const l = {
    budgetUsd,
    get spentUsd() { return data.spentUsd; },
    spent: () => data.spentUsd >= l.budgetUsd,
    add(entry) {
      data.spentUsd = +(data.spentUsd + (entry.usd || 0)).toFixed(6);
      data.calls += 1;
      const m = (data.byModel[entry.model] ||= { calls: 0, usd: 0, promptTokens: 0, completionTokens: 0, failed: 0 });
      m.calls += 1;
      m.usd = +(m.usd + (entry.usd || 0)).toFixed(6);
      m.promptTokens += entry.pt || 0;
      m.completionTokens += entry.ct || 0;
      if (entry.error) m.failed += 1;
      data.log.push(entry);
      if (data.log.length > 600) data.log.splice(0, data.log.length - 600);
      data.budgetUsd = l.budgetUsd;
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1)); } catch { /* a read-only disk must not stop the show */ }
    },
    data: () => data,
  };
  logs.set(file, l);
  return l;
}

// ---- what the model is told ------------------------------------------------------------------
const persona = (bot) => `You are ${bot.name}, a petitioner who has come to a haunted library to kill the Scrivener, a towering ink-drawn scribe that writes the names of the dead. It is writing your name: each exchange is one stroke, and when the name is finished you are gone. ${bot.instructions || ''}
Speak in character, plainly and briefly. Keep it PG-13. Never mention being an AI, a model or a game. No emoji. Reply ONLY with compact JSON, nothing before or after it.`;

// A plain hint for the Archivist, who "has read ahead". Everyone else gets only the pose.
const READ_AHEAD = {
  quill_slash: 'a huge forward chop that reaches far along the floor; then its wings burst the floor behind it',
  ink_lunge: 'a dash that crosses most of the hall with the blade out front',
  ledger_slam: 'the book slammed down in front of it, ripples racing both ways along the floor, a second wave behind it',
  wing_gust: 'a wind that shoves you back, then a wall of torn pages flying at you',
  written_name: 'it writes your name: the ink under your feet erupts unless you strike it while it writes',
  page_storm: 'pages fall like blades everywhere except right beside it',
};

const hpBand = (f) => (f > 0.85 ? 'barely scratched' : f > 0.6 ? 'wounded' : f > 0.35 ? 'badly wounded' : f > 0.15 ? 'reeling' : 'near death');
const distBand = (gap) => (gap <= 170 ? 'close, within reach of its blade' : gap <= 420 ? 'a few strides away' : 'far, across the hall');
const shortPose = (attackId) => {
  const atk = ATTACKS[attackId];
  return atk ? atk.tell.poseDescription.replace(/^It /, '').split(/[;,.]/)[0] : 'moved';
};

function listItems(tables, lo) {
  const parts = [];
  for (const [slot, word] of [['cls', 'class'], ['weapon', 'weapon'], ['spell', 'spell'], ['charm', 'charm']]) if (lo && lo[slot]) parts.push(`${word} ${lo[slot]}`);
  return parts.length ? parts.join(', ') : 'nothing yet';
}

export function createLlmBrain(bot, env = {}) {
  const log = costLog(env.costFile || path.join(process.cwd(), '.cache', 'cost.json'), env.budgetUsd ?? 1.5);
  const mock = createMockBrain(bot, { seed: env.seed || 1 });
  const recall = new Map(); // attackId -> what was tried last and how it went
  let dead = null;          // why the model is no longer asked (budget, refused key)
  let noReasoning = false;
  let fails = 0, quietUntil = 0, creditOut = false;

  async function call(kind, user, { temperature = 0.7 } = {}) {
    if (dead) throw new Error(dead);
    if (log.spent()) { dead = 'budget spent'; throw new Error(dead); }
    if (Date.now() < quietUntil) throw new Error('circuit open');
    const body = {
      model: bot.model,
      messages: [{ role: 'system', content: persona(bot) }, { role: 'user', content: user }],
      max_tokens: MAX_TOKENS[kind], temperature, usage: { include: true },
    };
    if (!noReasoning) body.reasoning = { effort: 'minimal', exclude: true };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LIMIT_MS[kind]);
    const t0 = Date.now();
    const entry = { t: new Date().toISOString(), bot: bot.id, model: bot.model, kind, usd: 0, pt: 0, ct: 0, ms: 0 };
    try {
      const res = await fetch(UPSTREAM, {
        method: 'POST', signal: ac.signal,
        headers: { authorization: `Bearer ${env.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { error: { message: raw.slice(0, 200) } }; }
      if (!res.ok || data.error) {
        const status = res.ok ? Number(data.error && data.error.code) || 502 : res.status;
        if (status === 400 && !noReasoning && /reasoning|effort/i.test(String(data.error && data.error.message))) { noReasoning = true; }
        if (status === 401 || status === 403) dead = 'key refused';
        if (status === 402) { quietUntil = Date.now() + CREDIT_RETRY_MS; creditOut = true; }
        const err = new Error(`upstream ${status}`);
        err.status = status;
        throw err;
      }
      const usage = data.usage || {};
      entry.usd = Number(usage.cost) || 0;
      entry.pt = usage.prompt_tokens || 0;
      entry.ct = usage.completion_tokens || 0;
      fails = 0; creditOut = false;
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      return (msg && msg.content) || '';
    } catch (err) {
      entry.error = err.name === 'AbortError' ? 'timeout' : String(err.message || err).slice(0, 80);
      if (err.status !== 402 && ++fails >= 3) { quietUntil = Date.now() + 30000; fails = 0; }
      throw err;
    } finally {
      clearTimeout(timer);
      entry.ms = Date.now() - t0;
      log.add(entry);
    }
  }

  // A line for the stage: cleaned, checked, regenerated once on failure, then a safe one.
  async function line(kind, user, key, maxWords, safe) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let j;
      try { j = looseJson(await call(kind, attempt ? `${user}\nKeep it clean and in character.` : user)); } catch { break; }
      const text = cleanLine(j && j[key], maxWords);
      if (checkLine(text).ok) return { text, json: j, source: 'llm' };
    }
    return { text: safe, json: null, source: 'fallback' };
  }

  return {
    kind: 'llm',
    label: bot.model,
    get status() { return { dead, creditOut, spentUsd: log.spentUsd, budgetUsd: log.budgetUsd }; },

    async pick(q) {
      const { slot, options, temper, mine, theirs, form } = q;
      const word = { cls: 'class', weapon: 'weapon', spell: 'spell', charm: 'charm' }[slot];
      const memory = (form && form.memory && form.memory.length) ? `\nYour notes from earlier fights:\n${form.memory.map((m) => `- ${m}`).join('\n')}` : '';
      const rec = form && form.record && form.record.played ? `\nYour record: ${form.record.wins} wins of ${form.record.played}.` : '';
      const user = `The Scrivener's temper tonight: ${temper.name}. ${temper.effect}
You are building your fighter before the bell. So far you carry: ${listItems(null, mine)}.
Your rival carries: ${listItems(null, theirs)}.${rec}${memory}
Choose your ${word} from these three:
${options.map((o, i) => `${i + 1}. ${o.name}: ${o.effect}`).join('\n')}
Reply JSON: {"pick": <1, 2 or 3>, "why": "<one short sentence, at most 10 words, in character>"}`;
      try {
        const j = looseJson(await call('pick', user));
        const n = Math.round(Number(j && j.pick));
        if (!(n >= 1 && n <= options.length)) throw new Error('bad pick');
        let reason = cleanLine(j.why, 12);
        if (!checkLine(reason).ok) reason = 'This one. I have my reasons.';
        return { choice: options[n - 1].id, reason, source: 'llm' };
      } catch {
        const r = await mock.pick(q);
        return { ...r, source: 'fallback', thinkMs: 0 };
      }
    },

    async decide(q) {
      const { world: w, moves, notes } = q;
      const th = w.thinking || {};
      const atk = ATTACKS[th.attackId];
      const a = w.agent, b = w.boss;
      const gap = Math.max(0, Math.abs(a.x - b.x) - 83);
      const seen = recall.get(th.attackId);
      const hint = a.cls === 'archivist' && READ_AHEAD[th.attackId] ? `\nYou have read ahead: this is ${READ_AHEAD[th.attackId]}.` : '';
      const user = `Stroke ${th.k} of ${th.strokes}. Your health: ${Math.round(a.hp)} of ${a.maxHp}. The Scrivener is ${hpBand(b.hp / b.maxHp)}. It stands ${distBand(gap)}.
Time has slowed as it begins a motion. What you see:
${atk ? atk.tell.poseDescription : 'It shifts its weight.'}${hint}${seen ? `\nLast time it did this you chose ${seen.move} and ${seen.outcome}.` : ''}${notes && notes.length ? `\nYour notes to yourself:\n${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}` : ''}
Your four moves:
${moves.map((m, i) => `${i + 1}. ${m.name}${m.kind === 'spell' ? ` (${m.available ? `${m.charges} left` : 'spent, cannot be used'})` : ''}: ${m.effect}`).join('\n')}
Reply JSON: {"move": <1-4>, "say": "<one short sentence, at most 10 words, in character, about this choice>"}`;
      try {
        const j = looseJson(await call('decide', user, { temperature: 0.5 }));
        const n = Math.round(Number(j && j.move));
        if (!(n >= 1 && n <= 4)) throw new Error('bad move');
        let say = cleanLine(j.say, 12);
        if (!checkLine(say).ok) say = '';
        return { slot: n - 1, line: say, source: 'llm' };
      } catch {
        const r = await mock.decide(q);
        return { ...r, source: 'fallback', thinkMs: 0 };
      }
    },

    async note(q) {
      const { world: w, record } = q;
      const ds = w.log.decisions || [];
      for (const d of ds) {
        recall.set(d.attackId, { move: d.name || `move ${Number(d.slot) + 1}`, outcome: d.outcome || 'it ended you' });
      }
      const how = record.result === 'death' ? `You died on stroke ${record.strokes}` : 'The name was finished before you could kill it';
      const user = `${how}, with ${Math.round(record.score * 100)}% of its ink spilled.
What happened, stroke by stroke:
${ds.map((d, i) => `${i + 1}. It ${shortPose(d.attackId)}. You chose ${d.name || `move ${Number(d.slot) + 1}`}: ${d.outcome || 'it ended you'}.`).join('\n')}
Write ONE note to yourself for your next try: a concrete rule in one sentence of at most 16 words ("When it ..., ...").
Reply JSON: {"note": "..."}`;
      const safe = (await mock.note(q)).text;
      const r = await line('note', user, 'note', 18, safe);
      return { text: r.text, source: r.source };
    },

    async say(q) {
      const { kind, summary } = q;
      const mine = summary.attempts.filter((x) => x.entrantId === bot.id).map((x) => (x.result === 'kill' ? 'a kill' : `${Math.round(x.score * 100)}%`)).join(', ');
      const theirs = summary.attempts.filter((x) => x.entrantId !== bot.id).map((x) => (x.result === 'kill' ? 'a kill' : `${Math.round(x.score * 100)}%`)).join(', ');
      const rival = kind === 'win' ? summary.loser : summary.winner;
      const user = `The match is over. You ${kind === 'win' ? 'beat' : 'lost to'} ${rival}. Your tries: ${mine || 'none'}. Theirs: ${theirs || 'none'}. The Scrivener was ${summary.temper} tonight.
One sentence for the crowd, at most 14 words, in character.
Reply JSON: {"say": "..."}`;
      const safe = (await mock.say(q)).text;
      const r = await line('say', user, 'say', 16, safe);
      return { text: r.text, source: r.source };
    },
  };
}
