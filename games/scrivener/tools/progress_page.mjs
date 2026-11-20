#!/usr/bin/env node
// Writes progress.html from progress.json (inlined, so the page works from disk).
//   node tools/progress_page.mjs
// progress.json: { updated, status, checkpoint: [{ item, done }], checks: [{ name, target, value, pass }],
//                  rounds: [{ n, time, title, built, critic, gap, verdict, stills: [path] }], next: [..] }

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './_lib.mjs';

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rounds = [...(data.rounds || [])].reverse();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="45">
<title>The Scrivener: progress</title>
<style>
  :root { --paper: #e7e0cc; --ink: #0d0c0b; --soft: #4a443b; --rule: #b9ae93; --red: #8e1b12; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.5 "Iowan Old Style", Palatino, Georgia, serif; }
  main { max-width: 1060px; margin: 0 auto; padding: 44px 28px 80px; }
  h1 { font: 44px/1.05 "Big Caslon", "Iowan Old Style", Palatino, serif; letter-spacing: 0.14em; margin: 0 0 6px; }
  .status { font-style: italic; color: var(--soft); margin: 0 0 30px; }
  h2 { font: 21px "Big Caslon", "Iowan Old Style", Palatino, serif; letter-spacing: 0.12em; margin: 44px 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--ink); }
  ul.plain { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 40px; }
  ul.plain li { padding: 3px 0 3px 26px; position: relative; break-inside: avoid; }
  ul.plain li::before { content: ''; position: absolute; left: 2px; top: 9px; width: 12px; height: 12px; border: 1.5px solid var(--ink); }
  ul.plain li.done::before { background: var(--ink); }
  table { border-collapse: collapse; width: 100%; font-size: 16px; }
  td, th { text-align: left; padding: 6px 12px 6px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { font-weight: normal; font-style: italic; color: var(--soft); }
  td.pass { color: var(--ink); font-weight: bold; }
  td.fail { color: var(--red); font-weight: bold; }
  td.open { color: var(--soft); font-style: italic; }
  .round { display: grid; grid-template-columns: 92px 1fr; gap: 0 22px; padding: 18px 0; border-bottom: 1px solid var(--rule); }
  .round .n { font: 40px/1 Baskerville, "Iowan Old Style", serif; }
  .round .time { font-style: italic; color: var(--soft); font-size: 15px; }
  .round h3 { margin: 0 0 4px; font: bold 20px "Iowan Old Style", Palatino, serif; }
  .round p { margin: 4px 0; }
  .round .gap { border-left: 4px solid var(--red); padding-left: 12px; margin: 10px 0; }
  .round .lab { font-style: italic; color: var(--soft); }
  .stills { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-top: 12px; }
  .stills a { display: block; border: 1.5px solid var(--ink); background: #000; }
  .stills img { display: block; width: 100%; height: auto; }
  ol { padding-left: 22px; margin: 0; }
  @media (max-width: 640px) { ul.plain { columns: 1; } .round { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <h1>THE SCRIVENER</h1>
  <p class="status">${esc(data.status)} Updated ${esc(data.updated)}.</p>

  <h2>CHECKPOINT</h2>
  <ul class="plain">
    ${(data.checkpoint || []).map((c) => `<li class="${c.done ? 'done' : ''}">${esc(c.item)}</li>`).join('\n    ')}
  </ul>

  <h2>THE BAR</h2>
  <table>
    <tr><th>check</th><th>target</th><th>now</th><th></th></tr>
    ${(data.checks || []).map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.target)}</td><td>${esc(c.value)}</td><td class="${c.pass === true ? 'pass' : c.pass === false ? 'fail' : 'open'}">${c.pass === true ? 'met' : c.pass === false ? 'not met' : 'not measured'}</td></tr>`).join('\n    ')}
  </table>

  <h2>ROUNDS</h2>
  ${rounds.map((r) => `<section class="round">
    <div><div class="n">${esc(r.n)}</div><div class="time">${esc(r.time)}</div></div>
    <div>
      <h3>${esc(r.title)}</h3>
      <p>${esc(r.built)}</p>
      ${r.critic ? `<p><span class="lab">Critic:</span> ${esc(r.critic)}</p>` : ''}
      ${r.gap ? `<p class="gap"><span class="lab">Biggest gap:</span> ${esc(r.gap)}</p>` : ''}
      ${(r.stills || []).length ? `<div class="stills">${r.stills.map((s) => `<a href="${esc(s)}"><img src="${esc(s)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
    </div>
  </section>`).join('\n  ')}

  <h2>NEXT</h2>
  <ol>${(data.next || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'progress.html'), html);
console.log('progress.html written,', rounds.length, 'rounds');
