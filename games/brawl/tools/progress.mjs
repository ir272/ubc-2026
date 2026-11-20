#!/usr/bin/env node
// Renders progress.html from progress.json (the lead edits the JSON; nobody edits the HTML).
//
//   node tools/progress.mjs              render once
//   node tools/progress.mjs --watch      re-render whenever progress.json changes
//   node tools/progress.mjs --in other.json --out other.html
//
// Edits for agents (safe with concurrent writers: a short mkdir lock at
// /tmp/ringout-progress.lock around read-modify-write, atomic temp + rename, then a re-render):
//   node tools/progress.mjs status  --piece <id> --status <queued|building|in review|beaten|won>
//   node tools/progress.mjs round   --piece <id> --builder "<one line>" --pick <ours|theirs> --gap "<one line>"
//                                   [--score N] --ours <path.png> --ref <path.png>
//   node tools/progress.mjs check   --name "<name>" --target "<target>" --value "<value>" --ok <true|false>
//   node tools/progress.mjs log     --text "<line>"
//   node tools/progress.mjs summary --text "<headline>"
//
// One static file that works from file://: fonts embedded as base64, image paths relative
// to games/brawl, a meta refresh every 30 s, countdowns computed in the page from the clock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const IN = path.resolve(GAME_DIR, opt('--in', 'progress.json'));
const OUT = path.resolve(GAME_DIR, opt('--out', 'progress.html'));
const OUT_DIR = path.dirname(OUT);

// ---------- fonts ----------
const FONT_DIR = path.join(GAME_DIR, 'node_modules/@fontsource');
const FONTS = [
  ['Big Shoulders Display', 'big-shoulders-display', 700, 'normal'],
  ['Big Shoulders Display', 'big-shoulders-display', 800, 'normal'],
  ['Big Shoulders Display', 'big-shoulders-display', 900, 'normal'],
  ['Barlow Semi Condensed', 'barlow-semi-condensed', 400, 'normal'],
  ['Barlow Semi Condensed', 'barlow-semi-condensed', 400, 'italic'],
  ['Barlow Semi Condensed', 'barlow-semi-condensed', 500, 'normal'],
  ['Barlow Semi Condensed', 'barlow-semi-condensed', 600, 'normal'],
  ['Barlow Semi Condensed', 'barlow-semi-condensed', 700, 'normal'],
];
let fontCss = null;
function fontFaces() {
  if (fontCss) return fontCss;
  fontCss = FONTS.map(([family, pkg, weight, style]) => {
    const f = path.join(FONT_DIR, pkg, 'files', `${pkg}-latin-${weight}-${style}.woff2`);
    if (!fs.existsSync(f)) { process.stderr.write(`warning: font missing ${f}\n`); return ''; }
    const b64 = fs.readFileSync(f).toString('base64');
    return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
  return fontCss;
}

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = {
  queued: 'Queued', building: 'Building', 'in review': 'In review', beaten: 'Beaten', won: 'Won',
};
const CLOCK_RE = /^\d{1,2}:\d{2}$/;

/** Local HH:MM for an ISO time; plain "14:05" strings pass through. */
function hhmm(at) {
  if (!at) return '';
  if (CLOCK_RE.test(String(at))) return String(at);
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return esc(at);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Image src relative to the output file, with an mtime query so re-captures show. */
function img(p) {
  if (!p) return null;
  const abs = path.resolve(GAME_DIR, p);
  if (!fs.existsSync(abs)) return { src: null, missing: p };
  const rel = path.relative(OUT_DIR, abs).split(path.sep).map(encodeURIComponent).join('/');
  return { src: `${rel}?v=${Math.round(fs.statSync(abs).mtimeMs)}` };
}

function figure(p, caption) {
  const i = img(p);
  if (!i) return `<figure class="shot"><div class="noimg">No image yet</div><figcaption>${esc(caption)}</figcaption></figure>`;
  if (!i.src) return `<figure class="shot"><div class="noimg">Missing: ${esc(i.missing)}</div><figcaption>${esc(caption)}</figcaption></figure>`;
  return `<figure class="shot"><a href="${i.src}"><img src="${i.src}" alt="${esc(caption)}" loading="lazy"></a><figcaption>${esc(caption)}</figcaption></figure>`;
}

function pick(c) {
  if (!c?.pick) return '';
  return c.pick === 'ours'
    ? '<span class="pick ours">Critic picked ours</span>'
    : '<span class="pick theirs">Critic picked the reference</span>';
}

function score(c) {
  return typeof c?.score === 'number' ? `<span class="score">${esc(c.score)}</span>` : '';
}

// ---------- sections ----------
function header(d) {
  const counts = {};
  for (const p of d.pieces || []) counts[p.status] = (counts[p.status] || 0) + 1;
  const total = (d.pieces || []).length;
  const order = ['won', 'beaten', 'in review', 'building', 'queued'];
  const tally = order.filter((s) => counts[s]).map((s) =>
    `<div class="tally t-${s.replace(' ', '-')}"><b>${counts[s]}</b><span>${esc(STATUS[s].toLowerCase())}</span></div>`).join('');
  const dl = (key, label) => {
    const at = d.deadline?.[key];
    return `<div class="deadline" data-at="${esc(at || '')}">
      <div class="dl-head"><span class="dl-name">${label}</span><span class="dl-time">${hhmm(at)}</span></div>
      <div class="dl-left"><span class="count">&nbsp;</span></div>
    </div>`;
  };
  return `<header class="top">
    <div class="masthead">
      <h1>${esc(d.title || 'Ringout')}</h1>
      <p class="summary">${esc(d.summary || '')}</p>
      <p class="updated" data-at="${esc(d.updated || '')}">Updated ${hhmm(d.updated)}<span class="ago"></span></p>
    </div>
    <div class="deadlines">${dl('checkpoint', 'Checkpoint')}${dl('finalStop', 'Final stop')}</div>
    <div class="tallies"><div class="tally t-total"><b>${total}</b><span>pieces</span></div>${tally}</div>
  </header>`;
}

function checks(d) {
  const rows = (d.checks || []).map((c) => {
    const state = c.ok === true ? 'pass' : c.ok === false ? 'fail' : 'none';
    const word = { pass: 'Pass', fail: 'Fail', none: 'Not run' }[state];
    const value = c.value === null || c.value === undefined || c.value === '' ? '<span class="dim">no number yet</span>' : esc(c.value);
    return `<tr class="${state}"><td class="c-ok"><i class="mark"></i>${word}</td><td class="c-name">${esc(c.name)}</td><td class="c-target num">${esc(c.target)}</td><td class="c-value num">${value}</td></tr>`;
  }).join('');
  const passed = (d.checks || []).filter((c) => c.ok === true).length;
  return `<section class="checks">
    <h2>Checks <span class="h-num">${passed} of ${(d.checks || []).length}</span></h2>
    <table><thead><tr><th>Result</th><th>Check</th><th>Target</th><th>Now</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

function piece(p) {
  const rounds = [...(p.rounds || [])].sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  const last = rounds.at(-1);
  const status = `<span class="status s-${esc(String(p.status || 'queued').replace(' ', '-'))}">${esc(STATUS[p.status] || p.status || 'Queued')}</span>`;
  if (!last) {
    return `<section class="piece empty" id="p-${esc(p.id)}">
      <h3>${esc(p.name)}</h3>${status}<span class="norounds">No rounds yet</span>
    </section>`;
  }
  const earlier = rounds.slice(0, -1).reverse();
  const older = earlier.length ? `<details class="earlier" data-key="${esc(p.id)}">
      <summary>Earlier rounds <span class="num">${earlier.length}</span></summary>
      ${earlier.map((r) => `<div class="round">
        <div class="r-meta"><b class="r-n">${esc(r.n)}</b><span class="r-at">${hhmm(r.at)}</span></div>
        <div class="r-text">
          <p class="r-verdict">${pick(r.critic)}${score(r.critic)}</p>
          ${r.critic?.gap ? `<p class="gap">“${esc(r.critic.gap)}”</p>` : ''}
          ${r.builder ? `<p class="builder">${esc(r.builder)}</p>` : ''}
        </div>
        ${figure(r.ours, `Ours, round ${r.n}`)}
        ${figure(r.ref, 'Reference')}
      </div>`).join('')}
    </details>` : '';
  return `<section class="piece" id="p-${esc(p.id)}">
    <div class="pmeta">
      <div class="ptop"><h3>${esc(p.name)}</h3>${status}</div>
      <div class="nums">
        <div class="bignum"><b>${rounds.length}</b><span>${rounds.length === 1 ? 'round' : 'rounds'}</span></div>
        ${typeof last.critic?.score === 'number' ? `<div class="bignum"><b>${esc(last.critic.score)}</b><span>last score</span></div>` : ''}
        <div class="bignum at"><b>${hhmm(last.at)}</b><span>last round</span></div>
      </div>
      <p class="verdict">${pick(last.critic)}</p>
      ${last.critic?.gap ? `<p class="gap big">“${esc(last.critic.gap)}”</p>` : ''}
      ${last.builder ? `<p class="builder"><span>Round ${esc(last.n)}:</span> ${esc(last.builder)}</p>` : ''}
    </div>
    ${figure(last.ours, `Ours, round ${last.n}`)}
    ${figure(last.ref, 'Reference')}
    ${older}
  </section>`;
}

function logSection(d) {
  const items = [...(d.log || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!items.length) return '';
  return `<section class="log"><h2>Log</h2><ol>${items.map((l) => `<li><span class="l-at num">${hhmm(l.at)}</span><span class="l-text">${esc(l.text)}</span></li>`).join('')}</ol></section>`;
}

// ---------- page ----------
const CSS = `
:root{--navy:#0b1522;--plate:#111e2d;--plate2:#16273a;--steel:#2a3644;--line:#22303f;--ink:#f4f8ff;--dim:#8d9db0;--faint:#5d6d80;--hazard:#ffc21a;--shadow:#050b12}
*{box-sizing:border-box}
html{background:var(--navy)}
body{margin:0;background:var(--navy);color:var(--ink);font:400 17px/1.45 'Barlow Semi Condensed',system-ui,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.wrap{max-width:1480px;margin:0 auto;padding:36px 40px 80px}
h1,h2,h3,.bignum b,.count,.tally b,.h-num,.r-n{font-family:'Big Shoulders Display',Impact,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.005em}
.num{font-variant-numeric:tabular-nums}
.dim{color:var(--faint)}
a{color:inherit}

.top{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:20px 28px;margin-bottom:44px}
.masthead{grid-row:span 2;background:var(--plate);padding:26px 32px 24px;box-shadow:8px 8px 0 var(--shadow);clip-path:polygon(0 0,100% 0,calc(100% - 28px) 100%,0 100%)}
h1{font-weight:900;font-size:128px;line-height:.82;margin:0 0 18px;text-transform:uppercase}
.summary{font-size:23px;line-height:1.3;font-weight:500;max-width:34em;margin:0 0 14px}
.updated{color:var(--dim);margin:0;font-size:16px}
.updated .ago::before{content:''}
.deadlines{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.deadline{background:var(--plate);padding:16px 20px 12px;box-shadow:6px 6px 0 var(--shadow)}
.dl-head{display:flex;justify-content:space-between;align-items:baseline;font-weight:600;font-size:19px}
.dl-time{color:var(--dim);font-weight:500}
.count{display:block;font-weight:900;font-size:76px;line-height:.95;margin-top:6px}
.deadline.next .count{color:var(--hazard)}
.deadline.passed .count{color:var(--faint);font-size:44px;line-height:1.6}
.dl-left{min-height:84px}
.tallies{display:flex;gap:0;align-self:end}
.tally{background:var(--plate);padding:10px 18px 8px;min-width:96px;border-right:2px solid var(--navy)}
.tally b{display:block;font-weight:800;font-size:46px;line-height:1}
.tally span{color:var(--dim);font-size:15px;font-weight:500}
.tally.t-total{background:var(--steel)}
.tally.t-won b{color:var(--hazard)}

h2{font-weight:800;font-size:44px;line-height:1;margin:0 0 14px;text-transform:uppercase;display:flex;align-items:baseline;gap:16px}
.h-num{font-weight:700;font-size:30px;color:var(--dim);text-transform:none}
.checks{margin-bottom:48px}
table{width:100%;border-collapse:collapse;background:var(--plate);box-shadow:6px 6px 0 var(--shadow)}
th{text-align:left;font-weight:600;color:var(--dim);font-size:15px;padding:12px 18px 8px;border-bottom:2px solid var(--steel)}
td{padding:10px 18px;border-bottom:1px solid var(--line);vertical-align:baseline}
tr:last-child td{border-bottom:0}
.c-ok{width:130px;font-weight:600;white-space:nowrap}
.mark{display:inline-block;width:13px;height:13px;margin-right:10px;vertical-align:-1px;background:var(--steel)}
tr.pass .mark{background:var(--hazard)}
tr.fail .mark{background:transparent;box-shadow:inset 0 0 0 2px var(--ink)}
tr.fail .c-ok{color:var(--ink)}
tr.none .c-ok{color:var(--faint)}
.c-name{font-weight:500;font-size:18px}
.c-target{color:var(--dim);width:220px}
.c-value{width:220px;font-weight:600}

.pieces h2{margin-bottom:16px}
.piece{display:grid;grid-template-columns:minmax(300px,.9fr) minmax(0,1fr) minmax(0,1fr);gap:18px 20px;background:var(--plate);padding:20px 22px 22px;margin-bottom:14px;box-shadow:6px 6px 0 var(--shadow)}
.piece.empty{display:flex;align-items:center;gap:18px;padding:12px 22px;margin-bottom:6px;box-shadow:none;background:transparent;border-bottom:1px solid var(--line)}
.piece.empty h3{font-size:30px;margin:0;min-width:330px}
.norounds{color:var(--faint);font-size:16px}
h3{font-weight:800;font-size:40px;line-height:.95;margin:0;text-transform:uppercase}
.ptop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.status{display:inline-block;flex:none;font-weight:700;font-size:15px;padding:4px 16px 4px 10px;background:var(--steel);color:var(--ink);clip-path:polygon(0 0,100% 0,calc(100% - 9px) 100%,0 100%)}
.s-queued{background:transparent;color:var(--faint);box-shadow:inset 0 0 0 1px var(--steel);clip-path:none;padding-right:10px}
.s-building{background:var(--steel)}
.s-in-review{background:var(--ink);color:var(--navy)}
.s-beaten{background:var(--steel);color:var(--hazard)}
.s-won{background:var(--hazard);color:var(--navy)}
.nums{display:flex;gap:26px;margin-bottom:14px}
.bignum b{display:block;font-weight:900;font-size:58px;line-height:.9}
.bignum.at b{font-weight:700;color:var(--dim)}
.bignum span{color:var(--dim);font-size:14px;font-weight:500}
.verdict{margin:0 0 6px}
.pick{font-weight:700;font-size:17px}
.pick.ours{color:var(--hazard)}
.pick.theirs{color:var(--ink)}
.score{font-family:'Big Shoulders Display',sans-serif;font-weight:800;font-size:22px;margin-left:12px;color:var(--dim)}
.gap{margin:0 0 12px;font-style:italic;color:var(--ink)}
.gap.big{font-size:22px;line-height:1.28;font-weight:400}
.builder{margin:0;color:var(--dim);font-size:16px}
.builder span{color:var(--ink);font-weight:600}
.shot{margin:0;min-width:0}
.shot img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#000}
.noimg{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--navy);color:var(--faint);font-size:16px;box-shadow:inset 0 0 0 1px var(--line);padding:12px;text-align:center;word-break:break-all}
figcaption{margin-top:7px;font-size:15px;color:var(--dim);font-weight:500}
.earlier{grid-column:1/-1;border-top:2px solid var(--line);padding-top:10px}
.earlier summary{cursor:pointer;font-weight:600;color:var(--dim);list-style:none;display:inline-flex;gap:10px;align-items:baseline}
.earlier summary::-webkit-details-marker{display:none}
.earlier summary::before{content:'';width:0;height:0;border-left:7px solid var(--dim);border-top:5px solid transparent;border-bottom:5px solid transparent;align-self:center}
.earlier[open] summary::before{transform:rotate(90deg)}
.earlier summary .num{color:var(--ink)}
.round{display:grid;grid-template-columns:70px minmax(0,1fr) minmax(0,.62fr) minmax(0,.62fr);gap:16px;padding:14px 0;border-bottom:1px solid var(--line)}
.round:last-child{border-bottom:0}
.r-n{display:block;font-weight:900;font-size:40px;line-height:.9}
.r-at{color:var(--dim);font-size:14px}
.r-verdict{margin:0 0 4px}
.round .gap{font-size:17px}

.log{margin-top:48px}
.log ol{list-style:none;margin:0;padding:0;background:var(--plate);box-shadow:6px 6px 0 var(--shadow)}
.log li{display:grid;grid-template-columns:90px 1fr;gap:16px;padding:9px 18px;border-bottom:1px solid var(--line)}
.log li:last-child{border-bottom:0}
.l-at{color:var(--dim);font-weight:600}

@media (max-width:1100px){
  .top{grid-template-columns:1fr}
  .masthead{grid-row:auto}
  h1{font-size:96px}
  .piece{grid-template-columns:1fr 1fr}
  .pmeta{grid-column:1/-1}
  .round{grid-template-columns:60px 1fr}
  .round .shot{grid-column:span 1}
}
@media (max-width:640px){
  .wrap{padding:20px 16px 60px}
  h1{font-size:72px}
  .deadlines{grid-template-columns:1fr}
  .count{font-size:60px}
  .piece{grid-template-columns:1fr}
  .piece.empty{flex-wrap:wrap}
  .piece.empty h3{min-width:0}
  .c-target,.c-value{width:auto}
  .tallies{flex-wrap:wrap}
}
`;

const JS = `
(function(){
  function pad(n){return String(n).padStart(2,'0')}
  function left(ms){var s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h+':'+pad(m)+':'+pad(s%60)}
  var dls=[].slice.call(document.querySelectorAll('.deadline'));
  var up=document.querySelector('.updated');
  function tick(){
    var now=Date.now(),nextSet=false;
    dls.forEach(function(el){
      var t=Date.parse(el.dataset.at),c=el.querySelector('.count');
      if(isNaN(t)){c.textContent='no time set';return}
      var d=t-now;
      el.classList.toggle('passed',d<=0);
      el.classList.remove('next');
      if(d>0&&!nextSet){el.classList.add('next');nextSet=true}
      c.textContent=d>0?left(d):'Passed';
    });
    if(up){var u=Date.parse(up.dataset.at),a=up.querySelector('.ago');
      if(!isNaN(u)&&a){var m=Math.round((now-u)/60000);a.textContent=m<1?', just now':', '+m+' min ago'}}
  }
  tick();setInterval(tick,1000);
  // Keep open sections and the scroll position across the 30 s reload.
  try{
    var open=JSON.parse(sessionStorage.getItem('ringout-open')||'[]');
    document.querySelectorAll('details[data-key]').forEach(function(d){
      if(open.indexOf(d.dataset.key)>=0)d.open=true;
      d.addEventListener('toggle',function(){
        var keys=[].slice.call(document.querySelectorAll('details[data-key]')).filter(function(x){return x.open}).map(function(x){return x.dataset.key});
        try{sessionStorage.setItem('ringout-open',JSON.stringify(keys))}catch(e){}
      });
    });
    var y=Number(sessionStorage.getItem('ringout-y')||0);if(y)window.scrollTo(0,y);
    window.addEventListener('scroll',function(){try{sessionStorage.setItem('ringout-y',String(window.scrollY))}catch(e){}},{passive:true});
  }catch(e){}
  document.querySelectorAll('.shot img').forEach(function(img){
    img.addEventListener('error',function(){var d=document.createElement('div');d.className='noimg';d.textContent='Image missing';img.parentNode.replaceWith(d)});
  });
})();
`;

function render() {
  const d = JSON.parse(fs.readFileSync(IN, 'utf8'));
  if (!Array.isArray(d.pieces)) throw new Error('progress.json: pieces must be an array');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>${esc(d.title || 'Ringout')} progress</title>
<style>
${fontFaces()}
${CSS}
</style>
</head>
<body>
<main class="wrap">
${header(d)}
${checks(d)}
<section class="pieces"><h2>Pieces</h2>
${d.pieces.map(piece).join('\n')}
</section>
${logSection(d)}
</main>
<script>${JS}</script>
</body>
</html>
`;
  const tmp = `${OUT}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, html);
  fs.renameSync(tmp, OUT);
  return { bytes: html.length, pieces: d.pieces.length };
}

function renderLogged() {
  try {
    const r = render();
    process.stdout.write(`${path.relative(process.cwd(), OUT)}  ${r.pieces} pieces, ${(r.bytes / 1024).toFixed(0)} KB  ${new Date().toLocaleTimeString('en-GB')}\n`);
    return true;
  } catch (e) {
    process.stderr.write(`progress: ${e.message} (kept the previous ${path.basename(OUT)})\n`);
    return false;
  }
}

// ---------- edits ----------
const LOCK = '/tmp/ringout-progress.lock';
const STATUSES = ['queued', 'building', 'in review', 'beaten', 'won'];

/** Local time with its UTC offset, e.g. 2026-11-19T14:05:09-06:00 (CST on this machine). */
function nowLocal() {
  const d = new Date();
  const p = (n) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `${off >= 0 ? '+' : '-'}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}

function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? '' : v;
}
function need(name) {
  const v = flag(name);
  if (v === undefined || v === '') throw new Error(`--${name} is required`);
  return v;
}
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

async function withProgressLock(fn) {
  const t0 = Date.now();
  for (;;) {
    try { fs.mkdirSync(LOCK); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = 0;
      try { age = Date.now() - fs.statSync(LOCK).mtimeMs; } catch { continue; }
      if (age > 30000) { fs.rmSync(LOCK, { recursive: true, force: true }); continue; } // a writer died mid-edit
      if (Date.now() - t0 > 20000) throw new Error(`progress lock busy for 20 s (${LOCK})`);
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  let held = true;
  const release = () => { if (!held) return; held = false; try { fs.rmdirSync(LOCK); } catch { /* gone */ } };
  process.once('exit', release);
  try { return await fn(); } finally { release(); process.removeListener('exit', release); }
}

/** Repo-relative image path (relative to games/brawl), warning when the file is missing. */
function imagePath(p) {
  const abs = path.resolve(process.cwd(), p);
  const rel = path.relative(GAME_DIR, abs).split(path.sep).join('/');
  if (!fs.existsSync(abs)) process.stderr.write(`warning: ${rel} does not exist (yet)\n`);
  if (rel.startsWith('..')) process.stderr.write(`warning: ${p} is outside games/brawl; the page may not show it\n`);
  return rel;
}

function findPiece(d, id) {
  const p = (d.pieces || []).find((x) => x.id === id);
  if (!p) throw new Error(`no piece "${id}"; pieces: ${(d.pieces || []).map((x) => x.id).join(', ')}`);
  return p;
}

const EDITS = {
  status(d) {
    const p = findPiece(d, need('piece'));
    const st = need('status');
    if (!STATUSES.includes(st)) throw new Error(`--status must be one of: ${STATUSES.join(', ')}`);
    p.status = st;
    return `${p.name}: ${st}`;
  },
  round(d) {
    const p = findPiece(d, need('piece'));
    const pick = need('pick');
    if (!['ours', 'theirs'].includes(pick)) throw new Error('--pick must be ours or theirs');
    const critic = { pick, gap: oneLine(need('gap')) };
    const sc = flag('score');
    if (sc !== undefined && sc !== '') {
      if (!Number.isFinite(Number(sc))) throw new Error('--score must be a number');
      critic.score = Number(sc);
    }
    p.rounds = p.rounds || [];
    const n = p.rounds.reduce((m, r) => Math.max(m, Number(r.n) || 0), 0) + 1;
    const at = nowLocal();
    p.rounds.push({ n, at, builder: oneLine(need('builder')), critic, ours: imagePath(need('ours')), ref: imagePath(need('ref')) });
    d.log = d.log || [];
    d.log.push({ at, text: `${p.name} round ${n}: critic picked ${pick === 'ours' ? 'ours' : 'the reference'}${critic.score !== undefined ? `, score ${critic.score}` : ''}.` });
    return `${p.name}: round ${n}`;
  },
  check(d) {
    const name = oneLine(need('name'));
    const okRaw = need('ok');
    if (!['true', 'false'].includes(okRaw)) throw new Error('--ok must be true or false');
    d.checks = d.checks || [];
    let c = d.checks.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!c) { c = { name }; d.checks.push(c); }
    const target = flag('target');
    if (target) c.target = oneLine(target);
    else if (c.target === undefined) throw new Error('--target is required for a new check');
    c.value = oneLine(need('value'));
    c.ok = okRaw === 'true';
    return `check ${c.name}: ${c.value} (${c.ok ? 'pass' : 'fail'})`;
  },
  log(d) {
    d.log = d.log || [];
    const text = oneLine(need('text'));
    d.log.push({ at: nowLocal(), text });
    return `log: ${text}`;
  },
  summary(d) {
    d.summary = oneLine(need('text'));
    return `summary: ${d.summary}`;
  },
};

async function edit(cmd) {
  const msg = await withProgressLock(() => {
    const d = JSON.parse(fs.readFileSync(IN, 'utf8'));
    const m = EDITS[cmd](d);
    d.updated = nowLocal();
    const tmp = `${IN}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2) + '\n');
    fs.renameSync(tmp, IN);
    return m;
  });
  process.stdout.write(msg + '\n');
  // Render outside the JSON lock; render() itself writes progress.html via temp + rename.
  if (!renderLogged()) process.exit(1);
}

const bare = args.filter((a, i) => !['--in', '--out'].includes(a) && !['--in', '--out'].includes(args[i - 1]));
const cmd = bare[0] && !bare[0].startsWith('--') ? bare[0] : null;
if (cmd) {
  if (!EDITS[cmd]) {
    process.stderr.write(`unknown command "${cmd}"; commands: ${Object.keys(EDITS).join(', ')}\n`);
    process.exit(2);
  }
  edit(cmd).catch((e) => { process.stderr.write(`progress ${cmd}: ${e.message}\n`); process.exit(1); });
} else if (args.includes('--watch')) {
  renderLogged();
  let timer = null;
  let lastMtime = 0;
  const check = () => {
    let m = 0;
    try { m = fs.statSync(IN).mtimeMs; } catch { return; }
    if (m !== lastMtime) { lastMtime = m; renderLogged(); }
  };
  try { lastMtime = fs.statSync(IN).mtimeMs; } catch { /* not there yet */ }
  // Watch the directory: editors often replace the file rather than write into it.
  fs.watch(path.dirname(IN), (ev, name) => {
    if (name && name !== path.basename(IN)) return;
    clearTimeout(timer);
    timer = setTimeout(check, 150);
  });
  setInterval(check, 5000);
  process.stdout.write(`watching ${path.relative(process.cwd(), IN)} (ctrl-c to stop)\n`);
} else if (!renderLogged()) {
  process.exit(1);
}
