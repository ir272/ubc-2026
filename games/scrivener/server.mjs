#!/usr/bin/env node
// Static server + OpenRouter brain proxy. No dependencies.
//   npm start  ->  http://localhost:5177/
//
//   GET  /...           static files from this directory (dotfiles never served)
//   POST /api/brain     { model, messages, max_tokens, temperature?, reasoning? }
//                       -> OpenRouter /chat/completions response (+ _proxy info)
//   GET  /api/spend     cumulative LLM spend
//
// The OpenRouter key is read from .env (OPENROUTER_API_KEY) and is never sent to
// the browser and never logged. Spend is tracked from usage.cost in .spend.json;
// once spent >= BRAIN_BUDGET_USD (default 1.00) every brain call gets HTTP 402, and an
// OpenRouter "insufficient credits" (402) is passed through as 402: the game then shows
// "LLM credits exhausted" and both agents continue on mock brains.
//   PORT (default 5177), HOST (default 127.0.0.1) pick where it listens.
// Identical requests are answered from a response cache (.brain-cache.json).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '5177', 10);
const HOST = process.env.HOST || '127.0.0.1';
const SPEND_FILE = path.join(ROOT, '.spend.json');
const CACHE_FILE = path.join(ROOT, '.brain-cache.json');
const ALLOWED_MODELS = new Set(['anthropic/claude-haiku-5.5', 'openai/gpt-6-luna']);
const MAX_TOKENS_CAP = 1200;
const UPSTREAM = 'https://openrouter.ai/api/v1/chat/completions';

function readDotEnv() {
  const out = {};
  try {
    const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch { /* no .env */ }
  return out;
}

const dotenv = readDotEnv();
const API_KEY = process.env.OPENROUTER_API_KEY || dotenv.OPENROUTER_API_KEY || '';
const BUDGET = parseFloat(process.env.BRAIN_BUDGET_USD || dotenv.BRAIN_BUDGET_USD || '1.00');

// ---- spend + cache -----------------------------------------------------------
function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
const spend = loadJson(SPEND_FILE, { spentUsd: 0, calls: 0, cacheHits: 0, refused: 0, byModel: {} });
const cache = new Map(Object.entries(loadJson(CACHE_FILE, {})));

function saveSpend() {
  spend.updatedAt = new Date().toISOString();
  fs.writeFileSync(SPEND_FILE, JSON.stringify(spend, null, 2));
}
let cacheTimer = null;
function saveCacheSoon() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const entries = [...cache.entries()].slice(-2000);
    fs.writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(entries)), () => {});
  }, 500);
}

function spendInfo() {
  return {
    spentUsd: +spend.spentUsd.toFixed(6), budgetUsd: BUDGET, remainingUsd: +Math.max(0, BUDGET - spend.spentUsd).toFixed(6),
    calls: spend.calls, cacheHits: spend.cacheHits, refused: spend.refused, byModel: spend.byModel,
    keyLoaded: !!API_KEY, models: [...ALLOWED_MODELS],
  };
}

// ---- helpers -------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf ? body : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': isBuf || typeof body === 'string' ? headers['content-type'] || 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

// ---- /api/brain -------------------------------------------------------------------
let inflight = 0;

async function handleBrain(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'bad json' }); }
  const { model, messages } = body || {};
  if (!ALLOWED_MODELS.has(model)) return send(res, 400, { error: `model not allowed: ${model}` });
  if (!Array.isArray(messages) || !messages.length || messages.some((m) => !m || typeof m.content !== 'string' || !['system', 'user', 'assistant'].includes(m.role))) {
    return send(res, 400, { error: 'messages must be [{role, content}]' });
  }
  const maxTokens = Math.max(16, Math.min(MAX_TOKENS_CAP, parseInt(body.max_tokens || 300, 10) || 300));
  const payload = { model, messages, max_tokens: maxTokens, usage: { include: true } };
  if (typeof body.temperature === 'number') payload.temperature = Math.max(0, Math.min(2, body.temperature));
  if (body.reasoning && typeof body.reasoning === 'object') {
    const r = {};
    if (['minimal', 'low', 'medium', 'high'].includes(body.reasoning.effort)) r.effort = body.reasoning.effort;
    if (typeof body.reasoning.exclude === 'boolean') r.exclude = body.reasoning.exclude;
    if (Object.keys(r).length) payload.reasoning = r;
  }

  const key = crypto.createHash('sha256').update(JSON.stringify({ model, messages, max_tokens: maxTokens, t: payload.temperature, r: payload.reasoning })).digest('hex');
  if (cache.has(key)) {
    spend.cacheHits += 1;
    saveSpend();
    const hit = cache.get(key);
    log('brain', model, 'cache-hit');
    return send(res, 200, { ...hit, _proxy: { cached: true, costUsd: 0, ...spendInfo() } });
  }

  // 401: a missing key is permanent (the game stops asking); 5xx would read as transient
  if (!API_KEY) return send(res, 401, { error: 'OPENROUTER_API_KEY missing on server' });
  if (spend.spentUsd >= BUDGET) {
    spend.refused += 1;
    saveSpend();
    log('brain', model, 'REFUSED budget');
    return send(res, 402, { error: `LLM budget spent ($${spend.spentUsd.toFixed(4)} of $${BUDGET.toFixed(2)})`, ...spendInfo() });
  }

  inflight += 1;
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 45000);
  try {
    const up = await fetch(UPSTREAM, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json',
        'http-referer': 'http://localhost:5177',
        'x-title': 'The Scrivener',
      },
      body: JSON.stringify(payload),
    });
    const text = await up.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: { message: text.slice(0, 300) } }; }
    if (!up.ok || data.error) {
      log('brain', model, 'upstream', up.status, `${Date.now() - t0}ms`);
      // OpenRouter can report an error inside a 200 body; keep its code when it is an HTTP
      // status (402 insufficient credits, 429 rate limit) so the game classifies it right
      const code = data.error && Number(data.error.code);
      const status = up.ok ? (code >= 400 && code < 600 ? code : 502) : up.status;
      return send(res, status, { error: (data.error && (data.error.message || data.error)) || `upstream ${up.status}` });
    }
    const cost = Number(data.usage && data.usage.cost) || 0;
    spend.spentUsd += cost;
    spend.calls += 1;
    const bm = (spend.byModel[model] ||= { calls: 0, usd: 0 });
    bm.calls += 1;
    bm.usd = +(bm.usd + cost).toFixed(8);
    saveSpend();
    const keep = { id: data.id, model: data.model, choices: data.choices, usage: data.usage };
    // cached even when the game already gave up on this request (its decision timed out):
    // a late reply is paid for, so the identical request later is answered from here
    cache.set(key, keep);
    saveCacheSoon();
    log('brain', model, `${Date.now() - t0}ms`, `$${cost.toFixed(6)}`, `total $${spend.spentUsd.toFixed(4)}`);
    return send(res, 200, { ...keep, _proxy: { cached: false, costUsd: cost, ...spendInfo() } });
  } catch (err) {
    log('brain', model, 'error', err.name === 'AbortError' ? 'timeout' : err.message);
    return send(res, 504, { error: err.name === 'AbortError' ? 'upstream timeout' : 'upstream unreachable' });
  } finally {
    clearTimeout(timer);
    inflight -= 1;
  }
}

// ---- static -----------------------------------------------------------------------
function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'bad url'); }
  const segs = urlPath.split('/').filter(Boolean);
  if (segs.some((s) => s.startsWith('.') || s === 'node_modules')) return send(res, 404, 'not found');
  let file = path.join(ROOT, ...segs);
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!urlPath.endsWith('/')) { res.writeHead(301, { location: urlPath + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (err2, buf) => {
      if (err2) return send(res, 404, 'not found');
      send(res, 200, buf, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    });
  });
}

async function handler(req, res) {
  try {
    const pathname = new URL(req.url, 'http://x').pathname;
    if (pathname === '/api/brain') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
      return await handleBrain(req, res);
    }
    if (pathname === '/api/spend') return send(res, 200, { ...spendInfo(), inflight });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return serveStatic(req, res);
  } catch (err) {
    log('error', err.message);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
}

// Loopback only (IPv4 + IPv6 so "localhost" works either way): the proxy holds a key.
const server = http.createServer(handler);
server.on('error', (err) => { console.error(`cannot listen on ${HOST}:${PORT}: ${err.message}`); process.exit(1); });
server.listen(PORT, HOST, () => {
  log(`The Scrivener on http://localhost:${PORT}/  (progress: /progress/)  key ${API_KEY ? 'loaded' : 'MISSING'}  budget $${BUDGET}  spent $${spend.spentUsd.toFixed(4)}`);
});
if (HOST === '127.0.0.1') {
  const v6 = http.createServer(handler);
  v6.on('error', () => {}); // no IPv6 loopback: fine
  v6.listen(PORT, '::1');
}
