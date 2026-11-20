// Stills from the stage in one headless Chromium, then close it.
//   node tools/capture.mjs --url "http://localhost:5203/?demo=1&size=1280" --name r1-1280 --times 4,12,20,43@wide [--size 1280x720] [--full] [--click]
// (t@shot cuts the camera to that shot just before the still, e.g. 43@wide or 60@closeup:tilly)
// Stills land in captures/<name>/NN-<t>s.png. console.txt holds console errors and page errors,
// stats.json the stage's frame time and draw calls at each still.
// Take the shared browser lock first: mkdir .cache/browser.lock (and rmdir it afterwards); this
// script does that itself and waits up to 10 minutes for it.
//
// Storyboard of one whole live episode (one page load, a still every N s, tiled into 5x4 sheets):
//   node tools/capture.mjs --storyboard --url "http://localhost:5203/?size=640" --name integrate-1 [--every 5] [--for 345] [--skip]
// It waits for the next episode to start on the live feed (--skip plays the current one out at
// 400x first), takes `NNN-<t>s.png` at 640x360, writes shots.json (file -> t, scene, last event
// type and line kind, frame time) and tiles the stills with ffmpeg into sheet-NN.png.
// Framing check: every single (close-up, medium, the star's shots) for each cast, measured by
// rendering everyone else (and the props) as a white mask through that shot's camera:
//   node tools/capture.mjs --framing "frost,tilly,dash,nav;quill,vex,pixel,brock" --url "http://localhost:5203/?demo=1&size=1280" --name framing-1 [--join 55]
// framing.json lists each shot's share of the frame taken by anyone else and by props; any shot
// with someone else in it is saved as a still.
// Late joins on the live feed (a fresh page load at each time, stills 1 s and 2 s after it):
//   node tools/capture.mjs --joins 30,75,118,240,312 --url "http://localhost:5203/?size=1280" --name joins-1 [--skip]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const url = args.url ?? 'http://localhost:5203/?demo=1&size=1280';
const name = args.name ?? 'capture';
// a time may name a shot to cut to just before the still (dev pages only): 43@wide, 60@closeup:tilly
const cutAt = {};
const times = String(args.times ?? '3').split(',').map((x) => {
  const [t, shot] = x.split('@');
  if (shot) cutAt[Number(t)] = shot;
  return Number(t);
}).filter((x) => x >= 0).sort((a, b) => a - b);
const [vw, vh] = String(args.size ?? '1280x720').split('x').map(Number);
const out = path.join(root, 'captures', name);
fs.mkdirSync(out, { recursive: true });

const lock = path.join(root, '.cache', 'browser.lock');
async function takeLock() {
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const until = Date.now() + 10 * 60_000;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      return;
    } catch {
      try {
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age > 15 * 60_000) {
          fs.rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > until) throw new Error('browser lock busy for 10 minutes');
      console.log('browser lock held, waiting 20 s');
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
}
const freeLock = () => {
  try {
    fs.rmdirSync(lock);
  } catch {
    /* gone */
  }
};

/** playwright's pinned browser if present, else any installed Chromium build in its cache */
function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  try {
    if (fs.existsSync(chromium.executablePath())) return undefined;
  } catch {
    /* fall through */
  }
  const cache = path.join(process.env.HOME ?? '', 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).sort().reverse() : [];
  for (const d of dirs.filter((x) => x.startsWith('chromium-'))) {
    const exe = path.join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
  }
  for (const d of dirs.filter((x) => x.startsWith('chromium_headless_shell-'))) {
    const exe = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const origin = new URL(url).origin;
const getSnap = async () => {
  try {
    return await (await fetch(origin + '/feed/snapshot')).json();
  } catch {
    return null;
  }
};

/** local ms at which the next live episode starts (or the current one, if it is under 4 s old) */
async function nextEpisodeStart() {
  if (url.includes('demo=1')) return Date.now();
  const s0 = await getSnap();
  if (!s0) throw new Error(`no live feed at ${origin}/feed/snapshot`);
  const age = s0.match ? s0.serverNow - s0.match.startedAt : Infinity;
  if (s0.match && age < 4000) return Date.now() - age;
  const first = s0.match?.matchId ?? null;
  if (args.skip && s0.match) {
    console.log(`skipping the rest of ${first} (${Math.round(age / 1000)} s in)`);
    await fetch(origin + '/feed/skip', { method: 'POST' });
  } else console.log(`waiting for the next episode (${first ?? 'none'} is ${Math.round(age / 1000)} s in)`);
  const until = Date.now() + 9 * 60_000;
  while (Date.now() < until) {
    await sleep(200);
    const s = await getSnap();
    if (s?.match && s.match.matchId !== first) return Date.now() - (s.serverNow - s.match.startedAt);
  }
  throw new Error('no new episode within 9 minutes');
}

const feedLast = (page) => page.evaluate(() => {
  const p = window.__feedLast ?? {};
  const st = window.__stage?.stats?.() ?? {};
  return { scene: p.scene, last: p.last, kind: p.kind, at: p.at, frameMs: st.frameMs, drawCalls: st.drawCalls };
});

async function liveRun(page) {
  const sel = '#stage .cm-stage';
  const shots = {};
  if (args.storyboard) {
    const every = Number(args.every ?? 5);
    const total = Number(args.for ?? 345);
    // the page is up and watching before the episode starts, as a viewer would be
    await page.goto(url, { waitUntil: 'load' });
    const t0 = await nextEpisodeStart();
    console.log(`episode started; a still every ${every} s for ${total} s`);
    let n = 0;
    for (let t = every; t <= total; t += every) {
      await sleep(t0 + t * 1000 - Date.now());
      const file = `${String(++n).padStart(3, '0')}-${String(t).padStart(3, '0')}s.png`;
      await page.locator(sel).screenshot({ path: path.join(out, file) });
      const info = await feedLast(page);
      shots[file] = { t, ...info };
      stats.push({ t, file, ...info });
      console.log(`${file}  ${info.scene}  last=${info.last}${info.kind ? ':' + info.kind : ''}  cpu=${(info.frameMs ?? 0).toFixed(2)}ms`);
    }
    fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(shots, null, 2));
    tile();
    return;
  }
  // late joins: a fresh page load at each moment of one live episode
  const joins = String(args.joins).split(',').map(Number).filter((x) => x >= 0).sort((a, b) => a - b);
  const t0 = await nextEpisodeStart();
  let n = 0;
  for (const j of joins) {
    await sleep(t0 + j * 1000 - Date.now());
    const tLoad = Date.now();
    await page.goto(url, { waitUntil: 'load' });
    for (const after of [1, 2]) {
      await sleep(tLoad + after * 1000 - Date.now());
      const file = `${String(++n).padStart(2, '0')}-join${j}s-plus${after}s.png`;
      await page.locator(sel).screenshot({ path: path.join(out, file) });
      const info = await feedLast(page);
      shots[file] = { join: j, after, ...info };
      console.log(`${file}  ${info.scene}  last=${info.last}${info.kind ? ':' + info.kind : ''}`);
    }
  }
  fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(shots, null, 2));
}

/** 5x4 contact sheets of the storyboard stills (ffmpeg tile; drawtext is not available) */
function tile() {
  const files = fs.readdirSync(out).filter((f) => /^\d{3}-\d+s\.png$/.test(f)).sort();
  const per = 20;
  for (let i = 0; i * per < files.length; i++) {
    const part = files.slice(i * per, (i + 1) * per);
    const list = path.join(out, `.sheet-${i + 1}.txt`);
    fs.writeFileSync(list, part.map((f) => `file '${path.join(out, f)}'\nduration 1`).join('\n') + '\n');
    const sheet = path.join(out, `sheet-${String(i + 1).padStart(2, '0')}.png`);
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=640:360,tile=5x4:padding=6:color=0xffffff`, '-frames:v', '1', '-fps_mode', 'passthrough', sheet]);
      console.log(`sheet ${path.relative(root, sheet)}: ${part[0]} .. ${part[part.length - 1]}`);
    } catch (e) {
      console.log(`ffmpeg failed for sheet ${i + 1}: ${e.message}`);
    } finally {
      fs.rmSync(list, { force: true });
    }
  }
}

/** in the page: cut to `shot`, render masks, return the share of the frame each other thing covers */
function measureShot(shot) {
  const D = window.__dbg;
  const { THREE, scene, renderer, cam, cast } = D;
  cam.cut(shot);
  if (shot.at) cam.shotT = shot.at;
  cam.update(0);
  cam.camera.updateMatrixWorld(true);
  const gl = renderer.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const buf = new Uint8Array(W * H * 4);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const saved = new Map();
  const vis = (o, v) => {
    if (!saved.has(o)) saved.set(o, o.visible);
    o.visible = v;
  };
  const bg = scene.background;
  scene.background = new THREE.Color(0x000000);
  scene.overrideMaterial = white;
  const count = (show) => {
    for (const c of scene.children) vis(c, false);
    for (const o of show) {
      vis(o, true);
      for (let p = o.parent; p && p !== scene; p = p.parent) vis(p, true);
      // the parents' other children stay hidden
      for (let p = o; p.parent && p.parent !== scene; p = p.parent) for (const sib of p.parent.children) if (sib !== p && !show.includes(sib)) vis(sib, false);
    }
    renderer.render(scene, cam.camera);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let n = 0;
    for (let i = 0; i < buf.length; i += 16) if (buf[i] > 128) n++;
    return n / (W * H / 4);
  };
  const subj = shot.name.startsWith('star') || shot.name === 'pickPush' || shot.name === 'cards' ? cast.meta?.star.id : shot.id;
  const out = { shot: shot.name + (shot.id ? ':' + shot.id : '') + (shot.cheat ? ':c' + shot.cheat : '') + (shot.at ? ':t' + shot.at : ''), others: {}, props: {} };
  for (const slot of cast.slots()) {
    if (slot.id === subj || !slot.visible) continue;
    const r = count([slot.root]);
    if (r > 0) out.others[slot.id] = +(r * 100).toFixed(2);
  }
  const setG = scene.getObjectByName('set'), lightsG = scene.getObjectByName('lights');
  const chair = setG?.getObjectByName('chair');
  if (chair && subj !== cast.meta?.star.id) {
    const r = count([chair]);
    if (r > 0) out.props.chair = +(r * 100).toFixed(2);
  }
  const mySpot = cast.meta?.suitors.find((m) => m.id === subj)?.spot;
  for (let i = 0; i < 4; i++) {
    const bar = lightsG?.getObjectByName('lamp-' + i);
    if (!bar || i === mySpot) continue;
    const r = count([bar]);
    if (r > 0) out.props['lamp' + i] = +(r * 100).toFixed(2);
  }
  for (const [o, v] of saved) o.visible = v;
  scene.overrideMaterial = null;
  scene.background = bg;
  white.dispose();
  out.score = cam.debug?.score;
  out.why = (cam.debug?.why ?? []).join(' ');
  return out;
}

async function framingRun(page) {
  const casts = String(args.framing).split(';').filter(Boolean);
  const join = Number(args.join ?? 55);
  const results = [];
  let n = 0;
  for (const c of casts) {
    const u = `${url}${url.includes('?') ? '&' : '?'}cast=${c}&join=${join}`;
    await page.goto(u, { waitUntil: 'load' });
    // every model in (not the stand-ins)
    await page.waitForFunction(() => {
      const d = window.__dbg;
      return d && d.cast.slots().length >= 5 && d.cast.slots().every((s) => s.loaded);
    }, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const ids = await page.evaluate(() => window.__dbg.cast.bySpot().filter((m) => window.__dbg.cast.get(m.id)?.visible).map((m) => m.id));
    const shots = [];
    for (const id of ids) for (const name of ['closeup', 'medium']) for (const cheat of [undefined, 0.3]) shots.push({ name, id, ...(cheat ? { cheat } : {}) });
    shots.push({ name: 'starReaction' }, { name: 'starMedium' }, { name: 'cards', variant: 0 }, { name: 'cards', variant: 1 }, { name: 'pickPush', ms: 4000 }, { name: 'pickPush', ms: 4000, at: 4 });
    for (const shot of shots) {
      const r = await page.evaluate(measureShot, shot);
      r.cast = c;
      const bad = Object.keys(r.others).length > 0;
      const cluttered = Object.keys(r.props).length > 0;
      if (bad || cluttered) {
        // the still, as it looks
        await page.evaluate((s) => {
          window.__dbg.cam.cut(s);
          if (s.at) window.__dbg.cam.shotT = s.at;
        }, shot);
        await page.waitForTimeout(60);
        const file = `${String(++n).padStart(3, '0')}-${c.replaceAll(',', '-')}-${r.shot.replaceAll(':', '-')}.png`;
        await page.locator('#stage .cm-stage').screenshot({ path: path.join(out, file) });
        r.file = file;
      }
      results.push(r);
      console.log(`${c.padEnd(28)} ${r.shot.padEnd(26)} others ${JSON.stringify(r.others)} props ${JSON.stringify(r.props)}  score ${r.score}`);
    }
  }
  fs.writeFileSync(path.join(out, 'framing.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => Object.keys(r.others).length);
  console.log(`framing: ${results.length} shots, ${bad.length} with someone else in frame, ${results.filter((r) => Object.keys(r.props).length).length} with a prop`);
}

await takeLock();
let browser;
const log = [];
const stats = [];
try {
  browser = await chromium.launch({ headless: true, executablePath: findChromium(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: vw + 40, height: vh + 80 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  if (args.framing) {
    await framingRun(page);
  } else if (args.storyboard || args.joins) {
    await liveRun(page);
  } else {
  // --plan "48@3,10.8;85@1.5,5.5": several late joins (demo ?join=) in one browser
  const plan = args.plan
    ? String(args.plan).split(';').map((seg) => {
        const [j, ts] = seg.split('@');
        return { url: `${url}${url.includes('?') ? '&' : '?'}join=${j}`, times: ts.split(',').map(Number), tag: `j${j}` };
      })
    : [{ url, times, tag: '' }];
  let n = 0;
  for (const step of plan) {
    const t0 = Date.now();
    await page.goto(step.url, { waitUntil: 'load' });
    // --click: a user gesture, so the stage's sound starts (checks it runs without errors)
    if (args.click) await page.mouse.click(5, 5);
    if (n === 0) {
      const gl = await page.evaluate(() => {
        const c = document.createElement('canvas').getContext('webgl2');
        const ext = c?.getExtension('WEBGL_debug_renderer_info');
        return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      log.push(`[info] renderer: ${gl}`);
    }
    for (const t of step.times) {
      const wait = t * 1000 - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      if (cutAt[t]) {
        const [name, id] = cutAt[t].split(':');
        await page.evaluate((s) => window.__dbg?.cam.cut(s), { name, ...(id ? { id } : {}) });
        await page.waitForTimeout(80);
      }
      const file = path.join(out, `${String(++n).padStart(2, '0')}${step.tag ? '-' + step.tag : ''}-${t}s.png`);
      const el = args.full ? page : page.locator('#stage .cm-stage');
      await el.screenshot({ path: file });
      const s = await page.evaluate(
        () =>
          new Promise((res) => {
            const ts = [];
            const f = (x) => {
              ts.push(x);
              if (ts.length < 61) requestAnimationFrame(f);
              else {
                const d = ts.slice(1).map((v, k) => v - ts[k]);
                const st = window.__stage?.stats?.() ?? {};
                res({ avgFrame: d.reduce((a, b) => a + b, 0) / d.length, maxFrame: Math.max(...d), ...st, scene: document.getElementById('scene')?.textContent, shot: window.__cam?.shot, cam: window.__cam?.debug, camLog: (window.__cam?.log ?? []).slice(-4) });
              }
            };
            requestAnimationFrame(f);
          }),
      );
      stats.push({ t, file: path.basename(file), ...s });
      console.log(`${path.basename(file)}  scene=${s.scene}  frame=${s.avgFrame.toFixed(1)}ms (max ${s.maxFrame.toFixed(1)})  cpu=${(s.frameMs ?? 0).toFixed(2)}ms  draws=${s.drawCalls}`);
    }
  }
  }
} finally {
  await browser?.close();
  freeLock();
  fs.writeFileSync(path.join(out, 'console.txt'), log.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify(stats, null, 2));
}
console.log(`console: ${log.filter((l) => !l.startsWith('[info]')).length} warnings/errors (captures/${name}/console.txt)`);
