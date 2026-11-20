#!/usr/bin/env node
// Writes progress.html from progress.json (status, the order of work, checks, critic rounds, stills).
//   node tools/progress.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const p = JSON.parse(readFileSync(new URL('progress.json', root), 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const state = { done: 'Done', doing: 'In progress', todo: 'Not started', fail: 'Failing', pass: 'Pass' };

const steps = p.steps.map((s) => `<tr class="${s.state}"><td>${esc(s.name)}</td><td class="st">${state[s.state] || s.state}</td><td>${esc(s.note || '')}</td></tr>`).join('');
const checks = p.checks.map((c) => `<tr class="${c.state}"><td>${esc(c.name)}</td><td class="st">${state[c.state] || c.state}</td><td>${esc(c.value || '')}</td><td>${esc(c.bar || '')}</td></tr>`).join('');
const rounds = p.rounds.map((r) => `<section class="round"><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p>${r.critic ? `<p class="critic"><b>Critics:</b> ${esc(r.critic)}</p>` : ''}${
  (r.stills || []).filter((f) => existsSync(new URL(f, root))).map((f) => `<a href="${esc(f)}"><img src="${esc(f)}" alt="" loading="lazy"></a>`).join('')}</section>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tumbletop progress</title>
<style>
  :root { color-scheme: light dark; --bg: #fbfaf7; --ink: #1b1916; --dim: #6b655c; --rule: #dedad2; --ok: #177a45; --bad: #b3261e; --now: #8a5a00; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151311; --ink: #ece8e0; --dim: #9a9388; --rule: #322e29; --ok: #4fce8a; --bad: #ff6b5e; --now: #e6b04a; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 32px 16px 80px; }
  h1 { font-size: 28px; margin: 0 0 4px; } h2 { font-size: 19px; margin: 36px 0 10px; } h3 { font-size: 16px; margin: 0 0 4px; }
  .when { color: var(--dim); } .now { font-size: 18px; margin: 14px 0 0; }
  table { border-collapse: collapse; width: 100%; } td, th { text-align: left; padding: 7px 10px 7px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { color: var(--dim); font-weight: 500; font-size: 14px; }
  td.st { white-space: nowrap; font-weight: 600; } tr.done td.st, tr.pass td.st { color: var(--ok); } tr.fail td.st { color: var(--bad); } tr.doing td.st { color: var(--now); } tr.todo td.st { color: var(--dim); font-weight: 400; }
  .round { border-top: 1px solid var(--rule); padding: 14px 0; } .round p { margin: 4px 0; } .critic { color: var(--dim); }
  .round img { width: 100%; height: auto; margin-top: 10px; border-radius: 4px; display: block; }
  .scroll { overflow-x: auto; }
</style></head><body><main>
<h1>Tumbletop: three-round show</h1>
<div class="when">Updated ${esc(p.updated)}. Checkpoint 16:00 CST, final stop 21:00 CST.</div>
<p class="now">${esc(p.now)}</p>
<h2>Order of work</h2><div class="scroll"><table><tr><th>Step</th><th>State</th><th>Note</th></tr>${steps}</table></div>
<h2>Checks</h2><div class="scroll"><table><tr><th>Check</th><th>State</th><th>Measured</th><th>Bar</th></tr>${checks}</table></div>
<h2>Rounds</h2>${rounds}
</main></body></html>
`;
writeFileSync(new URL('progress.html', root), html);
console.log('progress.html written');
