// Lead's helper: patch progress.json from JSON on stdin.
// { phase?, next?, log?: string[], pieces?: { key: {status?,note?,name?} }, checkpoint?: { index: bool|string }, addCheckpoint?: string[] }
import fs from 'node:fs';
const f = new URL('../progress.json', import.meta.url);
const p = JSON.parse(fs.readFileSync(f, 'utf8'));
const d = JSON.parse(fs.readFileSync(0, 'utf8'));
const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });
if (d.phase) p.phase = d.phase;
if (d.next) p.next = d.next;
for (const s of d.log || []) p.log.push({ t, text: s });
for (const [k, v] of Object.entries(d.pieces || {})) { const x = p.pieces.find((x) => x.key === k); if (x) Object.assign(x, v); else p.pieces.push({ key: k, ...v }); }
for (const [i, v] of Object.entries(d.checkpoint || {})) { const c = p.checkpoint[Number(i)]; if (!c) continue; if (typeof v === 'string') { c.label = v; c.done = true; } else c.done = v; }
for (const s of d.addCheckpoint || []) p.checkpoint.push({ label: s, done: false });
fs.writeFileSync(f, JSON.stringify(p, null, 1));
