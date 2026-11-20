// Regenerates progress.html from progress.json (kept by the lead), critics/*.json (written by
// critics) and .cache/cost.json. Run: node tools/progress.mjs   (or --watch to redo every 45 s)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); } catch { return d; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function build() {
  const p = read('progress.json', { pieces: [], checkpoint: [], log: [] });
  const cost = read('.cache/cost.json', null);
  const spent = cost ? Number(cost.totalUsd ?? cost.total ?? cost.spentUsd ?? 0) : 0;

  // critics/<key>-r<N>.json  ->  latest round per key
  const crit = {};
  try {
    for (const f of fs.readdirSync(path.join(root, 'critics'))) {
      const m = /^(.+)-r(\d+)\.json$/.exec(f);
      if (!m) continue;
      const v = read(path.join('critics', f), null);
      if (!v) continue;
      const k = m[1], r = Number(m[2]);
      (crit[k] ||= []).push({ r, v });
    }
  } catch {}
  for (const k of Object.keys(crit)) crit[k].sort((a, b) => a.r - b.r);

  const groups = {};
  for (const piece of p.pieces) (groups[piece.group] ||= []).push(piece);

  const row = (piece) => {
    const rounds = crit[piece.key] || [];
    const last = rounds[rounds.length - 1];
    let status = piece.status || 'waiting';
    if (last) status = last.v.winner === 'ours' ? 'won' : 'looping';
    if (piece.status === 'building' && !last) status = 'building';
    const trail = rounds.map((x) => `<i class="${x.v.winner === 'ours' ? 'w' : 'l'}" title="round ${x.r}"></i>`).join('');
    const gap = last && last.v.winner !== 'ours' ? last.v.biggestGap : piece.note || '';
    const extra = last && typeof last.v.genericPercent === 'number' ? `${Math.round(last.v.genericPercent)}% generic` : '';
    return `<tr class="s-${status}"><td class="n">${esc(piece.name)}</td><td class="st">${status}</td><td class="tr">${trail}${rounds.length ? `<span>round ${last.r}</span>` : ''}</td><td class="g">${esc(gap)}${extra ? ` <em>${extra}</em>` : ''}</td></tr>`;
  };

  const all = p.pieces.map((x) => {
    const r = crit[x.key] || [];
    const l = r[r.length - 1];
    return l ? (l.v.winner === 'ours' ? 'won' : 'looping') : x.status || 'waiting';
  });
  const won = all.filter((s) => s === 'won').length;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="30">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Compatibility Mode: build progress</title>
<style>
:root{--bg:#0f1830;--panel:#16213f;--line:#263460;--text:#fff4e0;--dim:#9aa6c8;--coral:#ff5d4a;--mint:#7be0c3;--tung:#ffb347}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 "Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:30px;margin:0 0 2px;letter-spacing:-.01em}h2{font-size:17px;margin:34px 0 8px}
.sub{color:var(--dim);margin:0 0 20px}
.top{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0 6px}
.top div{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:10px 14px;min-width:150px}
.top b{display:block;font-size:22px}.top span{color:var(--dim);font-size:13px}
ul.cp{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:6px}
ul.cp li{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 12px}
ul.cp li.d{border-color:var(--mint)}ul.cp li.d::before{content:"done  ";color:var(--mint)}ul.cp li:not(.d)::before{content:"to do  ";color:var(--tung)}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:6px}
td{padding:7px 12px;border-top:1px solid var(--line);vertical-align:top}tr:first-child td{border-top:0}
td.n{white-space:nowrap;font-weight:600}td.st{white-space:nowrap;color:var(--dim)}td.tr{white-space:nowrap}td.tr span{color:var(--dim);font-size:13px;margin-left:6px}
td.g{color:var(--dim)}td.g em{font-style:normal;color:var(--tung);white-space:nowrap}
tr.s-won td.st{color:var(--mint)}tr.s-looping td.st{color:var(--tung)}tr.s-building td.st{color:var(--text)}
i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:3px;background:var(--coral)}i.w{background:var(--mint)}
ol.log{padding-left:0;list-style:none;margin:0}ol.log li{padding:6px 0;border-top:1px solid var(--line)}ol.log time{color:var(--dim);margin-right:10px;font-variant-numeric:tabular-nums}
</style></head><body><main>
<h1>Compatibility Mode</h1>
<p class="sub">The dating show channel. Build progress, regenerated ${esc(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' }))} CST. This page reloads itself.</p>
<div class="top">
<div><b>${won} of ${p.pieces.length}</b><span>pieces where the critic picked ours</span></div>
<div><b>$${spent.toFixed(3)}</b><span>real-model spend of $1.50</span></div>
<div><b>${esc(p.phase || '')}</b><span>current phase</span></div>
<div><b>${esc(p.next || '')}</b><span>next milestone</span></div>
</div>
<h2>16:00 checkpoint</h2><ul class="cp">${(p.checkpoint || []).map((c) => `<li class="${c.done ? 'd' : ''}">${esc(c.label)}</li>`).join('')}</ul>
${Object.entries(groups).map(([g, list]) => `<h2>${esc(g)}</h2><div class="tw"><table>${list.map(row).join('')}</table></div>`).join('')}
<h2>Log</h2><ol class="log">${(p.log || []).slice().reverse().map((l) => `<li><time>${esc(l.t)}</time>${esc(l.text)}</li>`).join('')}</ol>
</main></body></html>`;
  fs.writeFileSync(path.join(root, 'progress.html'), html);
}

build();
if (process.argv.includes('--watch')) setInterval(() => { try { build(); } catch (e) { console.error(e.message); } }, 45000);
