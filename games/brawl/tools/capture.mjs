#!/usr/bin/env node
// Frame-exact captures of the Ringout harness (or any page), one browser at a time.
//
//   node tools/capture.mjs --scene <name> [--<param> value ...] [--at <tick>|--seek <ms>]
//        [--frames N] [--every K] [--size 1280x720] [--out captures/<dir>] [--clip] [--sheet]
//        [--crop x,y,w,h] [--cols C] [--allow-console-errors] [--standin] [--url <harness url>]
//   node tools/capture.mjs --scene list
//   node tools/capture.mjs --set <file.json>          several captures, one browser session
//   node tools/capture.mjs --page <file|url> [--size WxH] [--full] [--out dir]   screenshot a page
//   node tools/capture.mjs --gpu                       print which flags give hardware WebGL
//
// Unknown --key value flags are scene params (numbers and true/false are converted).
// --at is passed to the scene as param `at` (the fight scene reads it as a sim tick).
// --seek ms advances the virtual clock after load. Stills are --every K rendered frames
// apart; --clip records every frame of N*K frames at 60 fps (45 s and 100 MB at most).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { session, shot, withRetry, assertNoErrors, GAME_DIR, GPU_FLAGS, webglRenderer, openBrowser } from './lib/browser.mjs';
import { acquireLock, releaseLock, touchLock } from './lib/lock.mjs';
import { contactSheet, writePng, FFMPEG } from './lib/img.mjs';

const log = (s) => process.stderr.write(s + '\n');
const rel = (p) => path.relative(process.cwd(), path.resolve(GAME_DIR, p)) || '.';
const CLIP_MAX_FRAMES = 45 * 60;
const CLIP_MAX_BYTES = 100 * 1024 * 1024;

const KNOWN = new Set(['scene', 'seek', 'frames', 'every', 'size', 'out', 'clip', 'sheet', 'no-sheet', 'crop',
  'cols', 'set', 'url', 'standin', 'page', 'full', 'gpu', 'allow-console-errors', 'params', 'label']);
const BOOL = new Set(['clip', 'sheet', 'no-sheet', 'standin', 'full', 'gpu', 'allow-console-errors']);

function coerce(v) {
  if (v === true || v === false || typeof v === 'number') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseArgs(argv) {
  const o = { params: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument "${a}" (flags look like --key value)`);
    let key = a.slice(2);
    let val;
    const eq = key.indexOf('=');
    if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
    else if (BOOL.has(key)) val = true;
    else if (i + 1 < argv.length && !(argv[i + 1].startsWith('--'))) val = argv[++i];
    else val = true;
    if (KNOWN.has(key)) o[key] = val;
    else o.params[key] = coerce(val);
  }
  return o;
}

function parseSize(s = '1280x720') {
  const m = /^(\d+)x(\d+)$/.exec(String(s));
  if (!m) throw new Error(`--size must look like 1280x720, got "${s}"`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

function parseCrop(s) {
  if (!s) return null;
  const v = String(s).split(',').map(Number);
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n)) || v[2] <= 0 || v[3] <= 0) throw new Error(`--crop must be x,y,w,h, got "${s}"`);
  return { x: v[0], y: v[1], w: v[2], h: v[3] };
}

/** Normalise one capture job from CLI flags or a --set entry. */
function job(raw, defaults = {}) {
  const j = { ...defaults, ...raw, params: { ...(defaults.params || {}), ...(raw.params || {}) } };
  for (const [k, v] of Object.entries(raw)) if (!KNOWN.has(k)) j.params[k] = coerce(v);
  if (!j.scene) throw new Error('missing --scene (try --scene list)');
  j.frames = Number(j.frames ?? 1);
  j.every = Number(j.every ?? 1);
  if (!(j.frames >= 1) || !(j.every >= 1)) throw new Error('--frames and --every must be at least 1');
  j.size = parseSize(j.size);
  j.cropBox = parseCrop(j.crop);
  j.seek = j.seek !== undefined && j.seek !== true ? Number(j.seek) : null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  j.out = path.resolve(GAME_DIR, j.out || `captures/${j.scene}-${stamp}`);
  j.wantSheet = !j['no-sheet'] && (j.sheet === true || j.frames > 1);
  if (j.clip && j.frames * j.every > CLIP_MAX_FRAMES) {
    throw new Error(`clip would be ${(j.frames * j.every / 60).toFixed(1)} s; the cap is 45 s (lower --frames or --every)`);
  }
  return j;
}

// ---------- page plumbing ----------
async function timed(promise, ms, what) {
  let t;
  const beat = setInterval(touchLock, 20000); // long loads must not look like a stale lock
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000} s`)), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(t); clearInterval(beat); }
}

function pageUrl(base, scene, params) {
  const u = new URL(base);
  u.searchParams.set('capture', '1');
  if (scene && scene !== 'list') u.searchParams.set('scene', scene);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, String(v));
  return u.toString();
}

/** Navigate, wait for window.__ringout to be ready, list scenes. */
async function openHarness(b, base, scene, params, allowConsole) {
  b.takeErrors();
  await b.page.goto(pageUrl(base, scene, params), { waitUntil: 'load', timeout: 60000 });
  // Wait for the hooks, but give up early once errors have arrived and nothing follows.
  const t0 = Date.now();
  let firstErr = 0;
  for (;;) {
    if (await b.page.evaluate(() => !!window.__ringout).catch(() => false)) break;
    if (b.errors.length && !firstErr) firstErr = Date.now();
    if ((firstErr && Date.now() - firstErr > 3000) || Date.now() - t0 > 30000) {
      await assertNoErrors(b, 'the harness page did not load', { allowConsole });
      throw new Error('window.__ringout never appeared (is this a capture=1 harness page?)');
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const ready = await timed(b.page.evaluate(async () => {
    const r = window.__ringout;
    let ok = typeof r.ready === 'function' ? await r.ready() : await r.ready;
    for (let i = 0; !ok && i < 600; i++) { await new Promise((res) => setTimeout(res, 50)); ok = typeof r.ready === 'function' ? await r.ready() : await r.ready; }
    return !!ok;
  }), 60000, 'waiting for __ringout.ready');
  await assertNoErrors(b, 'errors while loading the harness', { allowConsole });
  if (!ready) throw new Error('__ringout.ready stayed false for 30 s');
  return b.page.evaluate(async () => {
    const s = window.__ringout.scenes;
    const v = typeof s === 'function' ? await s() : s;
    return Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v) : []);
  });
}

async function hook(b, name, arg, ms, allowConsole) {
  const v = await timed(b.page.evaluate(async ([n, a]) => {
    const r = await window.__ringout[n](...a);
    return r === undefined ? null : JSON.parse(JSON.stringify(r));
  }, [name, arg]), ms, `__ringout.${name}`);
  await assertNoErrors(b, `errors during __ringout.${name}(${arg.map((x) => JSON.stringify(x)).join(', ')})`, { allowConsole });
  touchLock();
  return v;
}

function startClip(file, crop, size) {
  const p = spawn(FFMPEG, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '60', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg clip encode failed: ${err.trim()}`)))));
  return {
    async write(buf) { if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r)); },
    async end() { p.stdin.end(); await done; },
    kill() { try { p.kill('SIGKILL'); } catch { /* gone */ } },
  };
}

async function shrinkClip(file) {
  const tmp = file.replace(/\.mp4$/, '.small.mp4');
  for (const crf of [26, 32]) {
    await new Promise((res, rej) => {
      const p = spawn(FFMPEG, ['-v', 'error', '-y', '-i', file, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp]);
      p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg re-encode failed'))));
    });
    if (fs.statSync(tmp).size <= CLIP_MAX_BYTES) { fs.renameSync(tmp, file); return crf; }
  }
  fs.rmSync(tmp, { force: true });
  fs.rmSync(file, { force: true });
  throw new Error('clip is over 100 MB even at crf 32; capture a shorter clip');
}

// ---------- one capture ----------
async function runCapture(ctx, j) {
  const { b, baseUrl } = ctx;
  const allowConsole = !!j['allow-console-errors'];
  const t0 = Date.now();
  if (b.page.viewportSize()?.width !== j.size.w || b.page.viewportSize()?.height !== j.size.h) await b.setSize(j.size.w, j.size.h);
  const url = j.url || baseUrl;

  if (j.scene === 'list') {
    const scenes = await withRetry(() => openHarness(b, url, 'list', {}, allowConsole));
    process.stdout.write(scenes.join('\n') + '\n');
    return { scene: 'list', scenes };
  }

  // Load with retries: a load error usually means someone is mid-edit.
  let scenes;
  await withRetry(async () => {
    scenes = await openHarness(b, url, j.scene, j.params, allowConsole);
    if (scenes.length && !scenes.includes(j.scene)) {
      const e = new Error(`unknown scene "${j.scene}"; the harness has: ${scenes.join(', ')}`);
      e.noRetry = true;
      throw e;
    }
    await hook(b, 'load', [j.scene, j.params], 600000, allowConsole);
  }, { what: `loading scene ${j.scene}`, firstWaitMs: ctx.server?.startedByUs ? 4000 : undefined });

  if (j.seek) await hook(b, 'seek', [j.seek], 600000, allowConsole);
  // Warm-up without moving the virtual clock: let textures, env maps and fonts that load
  // asynchronously land, then let two real frames go by before the first still.
  await b.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await b.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

  fs.mkdirSync(j.out, { recursive: true });
  for (const f of fs.readdirSync(j.out)) if (/^f-\d+\.png$/.test(f)) fs.rmSync(path.join(j.out, f));
  const frames = [];
  const clipFile = j.clip ? path.join(j.out, 'clip.mp4') : null;
  const clip = clipFile ? startClip(clipFile) : null;
  const tLoad = Date.now();
  try {
    const total = j.clip ? j.frames * j.every : (j.frames - 1) * j.every + 1;
    let stepped = 0;
    for (let i = 0; i < total; i++) {
      const isStill = i % j.every === 0 && frames.length < j.frames;
      if (clip) await clip.write(await shot(b, { format: 'jpeg', quality: 92, crop: j.cropBox }));
      if (isStill) {
        const png = await shot(b, { format: 'png', crop: j.cropBox });
        const file = path.join(j.out, `f-${String(frames.length + 1).padStart(4, '0')}.png`);
        fs.writeFileSync(file, png);
        const info = await hook(b, 'info', [], 30000, allowConsole);
        frames.push({ file: path.basename(file), index: frames.length + 1, frame: stepped, info });
      }
      if (i < total - 1) {
        const n = j.clip ? 1 : j.every;
        await hook(b, 'step', [n], 120000, allowConsole);
        stepped += n;
        if (!j.clip) i += j.every - 1;
      }
    }
    if (clip) await clip.end();
  } catch (e) {
    clip?.kill();
    throw e;
  }
  const tFrames = Date.now();
  let clipNote = null;
  if (clipFile) {
    const size = fs.statSync(clipFile).size;
    if (size > CLIP_MAX_BYTES) clipNote = `re-encoded at crf ${await shrinkClip(clipFile)} to stay under 100 MB`;
  }
  let sheetFile = null;
  if (j.wantSheet) {
    sheetFile = path.join(j.out, 'sheet.png');
    const cols = j.cols ? Number(j.cols) : undefined;
    writePng(contactSheet(frames.map((f) => ({ file: path.join(j.out, f.file), label: String(f.index) })), { cols }), sheetFile);
  }
  const manifest = {
    scene: j.scene,
    params: j.params,
    seek: j.seek,
    frames: j.frames,
    every: j.every,
    size: `${j.size.w}x${j.size.h}`,
    crop: j.cropBox,
    url: pageUrl(url, j.scene, j.params).replace(GAME_DIR, '.'),
    capturedAt: new Date().toISOString(),
    webgl: b.gpu.renderer,
    hardwareWebgl: b.gpu.hardware,
    timing: { loadMs: tLoad - t0, framesMs: tFrames - tLoad, totalMs: Date.now() - t0 },
    stills: frames,
    sheet: sheetFile ? 'sheet.png' : null,
    clip: clipFile ? { file: 'clip.mp4', fps: 60, frames: j.frames * j.every, bytes: fs.statSync(clipFile).size, note: clipNote } : null,
  };
  fs.writeFileSync(path.join(j.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log(`${j.scene}: ${frames.length} stills${clipFile ? ` + ${j.frames * j.every}-frame clip` : ''} in ${((Date.now() - t0) / 1000).toFixed(1)} s (load ${((tLoad - t0) / 1000).toFixed(1)} s, frames ${((tFrames - tLoad) / 1000).toFixed(1)} s)`);
  return { out: j.out, frames: frames.map((f) => path.join(j.out, f.file)), sheet: sheetFile, clip: clipFile, manifest: path.join(j.out, 'manifest.json') };
}

// ---------- page screenshot mode ----------
async function runPage(b, o) {
  const target = /^[a-z]+:\/\//.test(o.page) ? o.page : pathToFileURL(path.resolve(process.cwd(), o.page)).toString();
  const size = parseSize(o.size);
  await b.setSize(size.w, size.h);
  b.takeErrors();
  await b.page.goto(target, { waitUntil: 'load', timeout: 60000 });
  await b.page.evaluate(() => document.fonts?.ready);
  await assertNoErrors(b, `errors loading ${o.page}`, { allowConsole: !!o['allow-console-errors'] });
  const out = path.resolve(GAME_DIR, o.out || 'captures/page');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${path.basename(o.page).replace(/\.[a-z]+$/i, '') || 'page'}.png`);
  await b.page.screenshot({ path: file, fullPage: !!o.full });
  touchLock();
  return { out, frames: [file] };
}

// ---------- gpu probe ----------
async function runGpuProbe() {
  await acquireLock();
  try {
    const sets = [['(none)', []], ['--use-angle=metal', ['--use-angle=metal']], ['all four', GPU_FLAGS]];
    for (const [name, flags] of sets) {
      const t = Date.now();
      const b = await openBrowser({ width: 640, height: 360, flags });
      const g = await webglRenderer(b.page);
      await b.close();
      process.stdout.write(`${name.padEnd(20)} ${g.hardware ? 'hardware' : 'SOFTWARE'}  ${g.renderer}  (${Date.now() - t} ms)\n`);
    }
  } finally { releaseLock(); }
}

// ---------- main ----------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.gpu) return runGpuProbe();

  if (o.page) {
    const needServer = /localhost:5202/.test(String(o.page));
    const size = parseSize(o.size);
    let r;
    await session({ width: size.w, height: size.h, needServer, url: needServer ? o.page : undefined }, async ({ b }) => { r = await runPage(b, o); });
    process.stdout.write(r.frames.join('\n') + '\n');
    return;
  }

  let jobs;
  let defaults = {};
  if (o.set) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), o.set), 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.captures;
    if (!Array.isArray(list) || !list.length) throw new Error(`${o.set}: expected an array of captures or { captures: [...] }`);
    if (!Array.isArray(raw)) { const { captures, ...rest } = raw; defaults = rest; }
    // CLI flags (other than --set) act as defaults for every entry.
    const cli = { ...o }; delete cli.set;
    defaults = { ...defaults, ...cli, params: { ...(defaults.params || {}), ...o.params } };
    jobs = list.map((e) => job(e, defaults));
  } else {
    jobs = [job({ ...o, params: o.params })];
  }
  const standin = jobs.some((j) => j.standin);
  const url = jobs.find((j) => j.url)?.url || (standin ? pathToFileURL(path.join(GAME_DIR, 'tools/lib/standin/index.html')).toString() : undefined);
  const first = jobs[0].size;
  const results = [];
  const failures = [];
  const t0 = Date.now();
  await session({ width: first.w, height: first.h, needServer: !standin && !(url && url.startsWith('file:')), url }, async (ctx) => {
    for (const j of jobs) {
      try {
        results.push(await runCapture(ctx, j));
      } catch (e) {
        failures.push({ scene: j.scene, out: j.out, error: e.message });
        log(`FAILED ${j.scene} -> ${rel(j.out)}:\n${e.message}`);
        if (jobs.length === 1) throw e;
      }
    }
  });
  for (const r of results) {
    if (r.scene === 'list') continue;
    process.stdout.write(`${rel(r.out)}/\n`);
    if (r.sheet) process.stdout.write(`  sheet    ${rel(r.sheet)}\n`);
    if (r.clip) process.stdout.write(`  clip     ${rel(r.clip)}\n`);
    process.stdout.write(`  stills   ${r.frames.length === 1 ? rel(r.frames[0]) : `${rel(r.frames[0])} .. ${path.basename(r.frames.at(-1))}`}\n`);
    process.stdout.write(`  manifest ${rel(r.manifest)}\n`);
  }
  if (jobs.length > 1) log(`${results.length} of ${jobs.length} captures done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (failures.length) {
    throw new Error(`${failures.length} capture(s) failed:\n${failures.map((f) => `  ${f.scene} -> ${rel(f.out)}: ${f.error.split('\n')[0]}`).join('\n')}`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  process.stderr.write(`\ncapture failed: ${e.message}\n`);
  releaseLock();
  process.exit(1);
});
