// Blind audio judge for the sound critic: sends two clips (A, B) to an audio-capable model.
//   node tools/listen.mjs --a <clipA.wav|mp3> --b <clipB.wav|mp3> --question "<what to judge>"
// Uses OPENROUTER_API_KEY from .env (never printed). Adds cost to .spend.json and to the shared
// ledger .cache/cost.json so the budget stays honest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
if (!args.a || !args.b || !args.question) { console.error('usage: --a clip --b clip --question "..."'); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const MODEL = args.model || 'google/gemini-3.8-flash';
const spendPath = path.join(ROOT, '.spend.json');
const spend = fs.existsSync(spendPath) ? JSON.parse(fs.readFileSync(spendPath, 'utf8')) : { spentUsd: 0 };
const BUDGET = parseFloat(process.env.BRAIN_BUDGET_USD || '1.00');
if ((spend.spentUsd || 0) >= BUDGET) { console.error(`budget exhausted ($${spend.spentUsd})`); process.exit(3); }
const clip = (p) => ({ type: 'input_audio', input_audio: { data: fs.readFileSync(p).toString('base64'), format: path.extname(p).slice(1).toLowerCase() } });
const body = {
  model: MODEL,
  usage: { include: true },
  max_tokens: +(args.max || 900),
  messages: [{ role: 'user', content: [
    { type: 'text', text: 'You are a harsh professional game audio director judging two clips blind. Clip A:' }, clip(args.a),
    { type: 'text', text: 'Clip B:' }, clip(args.b),
    { type: 'text', text: `${args.question}\nListen carefully to both. Answer with a first line exactly "WINNER: A" or "WINNER: B", then the single biggest weakness of the loser and of the winner, each in one sentence, naming timestamps.` },
  ] }],
};
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const j = await res.json();
if (!res.ok) { console.error('error', res.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
const cost = j.usage?.cost || 0;
const fresh = fs.existsSync(spendPath) ? JSON.parse(fs.readFileSync(spendPath, 'utf8')) : { spentUsd: 0 };
fresh.spentUsd = (fresh.spentUsd || 0) + cost;
fresh.byModel = fresh.byModel || {};
fresh.byModel[MODEL] = { calls: (fresh.byModel[MODEL]?.calls || 0) + 1, usd: (fresh.byModel[MODEL]?.usd || 0) + cost };
fs.writeFileSync(spendPath, JSON.stringify(fresh, null, 2));
// the shared ledger the show's brains use too (.cache/cost.json): one line per listen
try {
  const costPath = path.join(ROOT, '.cache', 'cost.json');
  const led = fs.existsSync(costPath) ? JSON.parse(fs.readFileSync(costPath, 'utf8')) : { spentUsd: 0, calls: 0, byModel: {}, log: [] };
  led.spentUsd = +((led.spentUsd || 0) + cost).toFixed(6);
  led.calls = (led.calls || 0) + 1;
  led.byModel ||= {};
  const bm = (led.byModel[MODEL] ||= { calls: 0, usd: 0, promptTokens: 0, completionTokens: 0 });
  bm.calls += 1; bm.usd = +(bm.usd + cost).toFixed(6);
  bm.promptTokens += j.usage?.prompt_tokens || 0; bm.completionTokens += j.usage?.completion_tokens || 0;
  (led.log ||= []).push({ t: new Date().toISOString(), bot: 'sound', model: MODEL, kind: 'listen', usd: cost, pt: j.usage?.prompt_tokens || 0, ct: j.usage?.completion_tokens || 0 });
  fs.writeFileSync(costPath, JSON.stringify(led, null, 1));
} catch (err) { console.error('[listen] could not update .cache/cost.json:', err.message); }
console.log(j.choices?.[0]?.message?.content || '(no content)');
console.error(`[listen] ${MODEL} cost $${cost.toFixed(5)}`);
