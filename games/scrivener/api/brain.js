// Vercel function: POST /api/brain -> OpenRouter, GET /api/spend (rewritten here in
// vercel.json so the spend numbers come from the same instance that does the calls).
import { handleBrain, spendInfo } from '../lib/brain_proxy.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ ...spendInfo(), inflight: 0 });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'bad json' }); }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad json' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '?';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'vercel.app';
  const { status, body: out } = await handleBrain(body, { ip, referer: `https://${host}` });
  return res.status(status).json(out);
}
