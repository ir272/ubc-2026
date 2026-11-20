#!/usr/bin/env node
// Does the stage actually make sound in a browser? Loads the harness live (not capture), clicks
// once (the gesture browsers need), lets a match run, and reports: which sound files were
// fetched, the AudioContext state, how many sources were started, and console warnings.
//   node tools/soundcheck.mjs [seconds=14] [url]     url: the real site, e.g. http://localhost:5190/c/brawl
//   (with a url the tool starts no server; the site and the runner must already be up)
import { session, ORIGIN } from './lib/browser.mjs';
const secs = Number(process.argv[2] ?? 14);
const site = process.argv[3] || '';
const target = site || ORIGIN + '/harness/index.html';
await session({ width: 1280, height: 720, needServer: !site, url: site ? undefined : target }, async ({ b }) => {
  const logs = [];
  b.page.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'info' && m.type() !== 'debug') logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  b.page.on('pageerror', (e) => logs.push('pageerror: ' + String(e).slice(0, 200)));
  b.page.on('websocket', (ws) => { logs.push('ws open: ' + ws.url()); ws.on('close', () => logs.push('ws closed: ' + ws.url())); ws.on('socketerror', (e) => logs.push('ws error: ' + e)); });
  // responses seen by the browser (the page's own resource timing buffer fills up on the site)
  const audio = { ok: 0, html: 0, other: 0, bytes: 0, first: '' };
  b.page.on('response', (r) => {
    const u = r.url();
    if (!/\.(mp3|ogg)(\?|$)/.test(u) || /[?&]import/.test(u)) return;
    const ct = r.headers()['content-type'] || '';
    if (/audio/.test(ct)) { audio.ok++; audio.bytes += Number(r.headers()['content-length'] || 0); }
    else if (/html/.test(ct)) { audio.html++; if (!audio.first) audio.first = u; }
    else audio.other++;
  });
  await b.page.addInitScript(() => {
    const w = window; w.__snd = { ctxs: [], starts: 0 };
    const AC = w.AudioContext || w.webkitAudioContext;
    w.AudioContext = class extends AC { constructor(...a) { super(...a); w.__snd.ctxs.push(this); } };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { w.__snd.starts++; return start.apply(this, a); };
  });
  await b.page.goto(target, { waitUntil: 'load', timeout: 60000 });
  await b.page.waitForTimeout(1500);
  await b.page.mouse.click(640, 360);
  await b.page.waitForTimeout(secs * 1000);
  const r = await b.page.evaluate(() => ({
    ctx: window.__snd.ctxs.map((c) => ({ state: c.state, t: Math.round(c.currentTime * 10) / 10 })),
    starts: window.__snd.starts,
    mp3: performance.getEntriesByType('resource').filter((e) => /\.(mp3|ogg)/.test(e.name)).map((e) => `${e.name.split('/').pop().split('?')[0]} ${e.responseStatus ?? ''} ${Math.round(e.transferSize / 1024)}k`),
    big: performance.getEntriesByType('resource').filter((e) => /\.(mp3|ogg)/.test(e.name) && e.transferSize > 20000).length,
    kinds: performance.getEntriesByType('resource').filter((e) => /\.(mp3|ogg)/.test(e.name)).reduce((m, e) => { const k = e.initiatorType + (e.name.includes('?') ? '?q' : ''); m[k] = (m[k] || 0) + 1; return m; }, {}),
    rig: window.__bloodMoonAudio ? window.__bloodMoonAudio() : 'no rig hook',
    fonts: [...document.fonts].filter((f) => /Shantell/.test(f.family)).map((f) => f.status),
  }));
  console.log(JSON.stringify({ ...r, mp3: r.mp3.length + ' files: ' + r.mp3.slice(0, 8).join(', ') }, null, 1));
  await b.page.screenshot({ path: 'captures/lead/site/soundcheck.png' }).catch(() => {});
  console.log('audio responses: ' + JSON.stringify(audio));
  console.log(logs.slice(0, 12).join('\n') || 'no console warnings');
});
