// OpenRouter brain proxy for the Vercel deployment (api/brain.js, api/spend.js).
// server.mjs does the same job for local dev; this is the serverless version.
//
// Serverless instances are short-lived and their disk is read-only, so spend, the
// response cache and the per-IP rate limit live in memory per instance. That makes
// BRAIN_BUDGET_USD a per-instance soft cap. The HARD cap must be set on the key itself
// (OpenRouter -> Keys -> credit limit). With no OPENROUTER_API_KEY set, /api/spend says
// keyLoaded:false and the game plays on mock brains: the safe default for a public URL.

import crypto from 'node:crypto';
import { DECIDE_SYSTEM, REFLECT_SYSTEM } from '../src/ai/prompts.js';

export const ALLOWED_MODELS = new Set(['anthropic/claude-haiku-5.5', 'openai/gpt-6-luna']);
// Only game-shaped requests are relayed (so a public key is not a free general LLM):
// exactly [the game's own system prompt, one user turn], with that prompt's token cap.
const SYSTEMS = new Map([[DECIDE_SYSTEM, { maxTokens: 900, efforts: ['minimal', 'low'] }], [REFLECT_SYSTEM, { maxTokens: 3000, efforts: ['minimal', 'low'] }]]);
const MAX_USER_CHARS = 12000;
const UPSTREAM = 'https://openrouter.ai/api/v1/chat/completions';
const RATE_PER_MIN = parseInt(process.env.BRAIN_RATE_PER_MIN || '40', 10);

const API_KEY = () => process.env.OPENROUTER_API_KEY || '';
const BUDGET = () => parseFloat(process.env.BRAIN_BUDGET_USD || '1.00');

const spend = { spentUsd: 0, calls: 0, cacheHits: 0, refused: 0, byModel: {} };
const cache = new Map();
const hits = new Map(); // ip -> [timestamps in the last minute]

export function spendInfo() {
  const budget = BUDGET();
  return {
    spentUsd: +spend.spentUsd.toFixed(6), budgetUsd: budget, remainingUsd: +Math.max(0, budget - spend.spentUsd).toFixed(6),
    calls: spend.calls, cacheHits: spend.cacheHits, refused: spend.refused, byModel: spend.byModel,
    keyLoaded: !!API_KEY(), models: [...ALLOWED_MODELS], scope: 'instance',
  };
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_PER_MIN;
}

// -> { status, body }
export async function handleBrain(body, { ip = '?', referer = 'https://vercel.app' } = {}) {
  const { model, messages } = body || {};
  if (!ALLOWED_MODELS.has(model)) return { status: 400, body: { error: 'model not allowed' } };
  const ok = Array.isArray(messages) && messages.length === 2
    && messages[0] && messages[0].role === 'system' && SYSTEMS.has(messages[0].content)
    && messages[1] && messages[1].role === 'user' && typeof messages[1].content === 'string'
    && messages[1].content.length > 0 && messages[1].content.length <= MAX_USER_CHARS;
  if (!ok) return { status: 400, body: { error: 'not a game request' } };
  const rule = SYSTEMS.get(messages[0].content);
  const maxTokens = Math.max(16, Math.min(rule.maxTokens, parseInt(body.max_tokens || 300, 10) || 300));
  const payload = { model, messages: messages.map((m) => ({ role: m.role, content: m.content })), max_tokens: maxTokens, usage: { include: true } };
  if (typeof body.temperature === 'number') payload.temperature = Math.max(0, Math.min(2, body.temperature));
  if (body.reasoning && typeof body.reasoning === 'object') {
    const r = {};
    if (rule.efforts.includes(body.reasoning.effort)) r.effort = body.reasoning.effort;
    if (typeof body.reasoning.exclude === 'boolean') r.exclude = body.reasoning.exclude;
    if (Object.keys(r).length) payload.reasoning = r;
  }

  const key = crypto.createHash('sha256').update(JSON.stringify({ model, messages: payload.messages, max_tokens: maxTokens, t: payload.temperature, r: payload.reasoning })).digest('hex');
  if (cache.has(key)) {
    spend.cacheHits += 1;
    return { status: 200, body: { ...cache.get(key), _proxy: { cached: true, costUsd: 0, ...spendInfo() } } };
  }

  // 401: a missing key is permanent (the game stops asking and plays on mock brains)
  const apiKey = API_KEY();
  if (!apiKey) return { status: 401, body: { error: 'OPENROUTER_API_KEY missing on server' } };
  if (spend.spentUsd >= BUDGET()) {
    spend.refused += 1;
    return { status: 402, body: { error: `LLM budget spent ($${spend.spentUsd.toFixed(4)} of $${BUDGET().toFixed(2)})`, ...spendInfo() } };
  }
  // 429 is transient for the game: it retries once, then plays that decision on instinct
  if (rateLimited(ip)) return { status: 429, body: { error: 'rate limited' } };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 45000);
  try {
    const up = await fetch(UPSTREAM, {
      method: 'POST',
      signal: ac.signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'http-referer': referer, 'x-title': 'The Scrivener' },
      body: JSON.stringify(payload),
    });
    const text = await up.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 300) } }; }
    if (!up.ok || data.error) {
      const code = data.error && Number(data.error.code);
      const status = up.ok ? (code >= 400 && code < 600 ? code : 502) : up.status;
      // details go to the function log only; callers get the status (the game classifies on it)
      console.error('brain upstream', status, String((data.error && data.error.message) || '').slice(0, 200));
      return { status, body: { error: `upstream ${status}` } };
    }
    const cost = Number(data.usage && data.usage.cost) || 0;
    spend.spentUsd += cost;
    spend.calls += 1;
    const bm = (spend.byModel[model] ||= { calls: 0, usd: 0 });
    bm.calls += 1;
    bm.usd = +(bm.usd + cost).toFixed(8);
    const keep = { id: data.id, model: data.model, choices: data.choices, usage: data.usage };
    cache.set(key, keep);
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    return { status: 200, body: { ...keep, _proxy: { cached: false, costUsd: cost, ...spendInfo() } } };
  } catch (err) {
    return { status: 504, body: { error: err.name === 'AbortError' ? 'upstream timeout' : 'upstream unreachable' } };
  } finally {
    clearTimeout(timer);
  }
}
