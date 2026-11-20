// Isolated per-piece workspaces so parallel builders never break each other.
//   node tools/ws.mjs pull <piece>   create/refresh work/<piece>/ from main (3-way merges main's changes into local edits)
//   node tools/ws.mjs push <piece>   3-way merge the workspace's edits back into main (fails on conflict, main untouched for that file)
//   node tools/ws.mjs status <piece> list files changed in the workspace vs its base
// Big/shared folders (refs, assets, progress) and secrets (.env, spend/cache) are symlinked, not copied.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, piece] = process.argv.slice(2);
if (!cmd || !piece) { console.error('usage: node tools/ws.mjs pull|push|status <piece>'); process.exit(2); }
const WS = path.join(MAIN, 'work', piece);
const BASE = path.join(WS, '.base');
const LINKS = ['refs', 'assets', 'progress', '.env', '.spend.json', '.brain-cache.json', 'node_modules'];
const SKIP = new Set(['.git', 'work', ...LINKS]);

function list(root) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.relative(root, path.join(dir, e.name));
      const top = rel.split(path.sep)[0];
      if (SKIP.has(top) || top === '.base' || e.name === '.DS_Store') continue;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.isFile()) out.push(rel);
    }
  })(root);
  return out;
}
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);
const same = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.equals(b));
function write(p, buf) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); }
function rm(p) { if (fs.existsSync(p)) fs.rmSync(p); }

// 3-way merge: returns {buf, conflict}
function merge3(ours, base, theirs, label) {
  const tmp = fs.mkdtempSync(path.join(MAIN, 'work', '.m-'));
  const [o, b, t] = ['ours', 'base', 'theirs'].map((n) => path.join(tmp, n));
  fs.writeFileSync(o, ours ?? ''); fs.writeFileSync(b, base ?? ''); fs.writeFileSync(t, theirs ?? '');
  let conflict = false;
  try { execFileSync('git', ['merge-file', '-L', 'mine', '-L', 'base', '-L', label, o, b, t], { stdio: 'pipe' }); }
  catch (e) { conflict = e.status > 0; if (e.status < 0 || e.status === undefined) throw e; }
  const buf = fs.readFileSync(o);
  fs.rmSync(tmp, { recursive: true });
  return { buf, conflict };
}

function lock(fn) {
  const L = path.join(MAIN, 'work', '.lock');
  fs.mkdirSync(path.join(MAIN, 'work'), { recursive: true });
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(L); break; } catch { if (i > 600) throw new Error('lock timeout'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); }
  }
  try { return fn(); } finally { fs.rmSync(L, { recursive: true, force: true }); }
}

if (cmd === 'status') {
  const files = new Set([...list(WS), ...list(BASE)]);
  for (const f of [...files].sort()) if (!same(read(path.join(WS, f)), read(path.join(BASE, f)))) console.log(f);
  process.exit(0);
}

lock(() => {
  if (cmd === 'pull') {
    const fresh = !fs.existsSync(WS);
    fs.mkdirSync(WS, { recursive: true });
    for (const l of LINKS) {
      const tgt = path.join(MAIN, l), dst = path.join(WS, l);
      if (fs.existsSync(tgt) && !fs.existsSync(dst)) fs.symlinkSync(tgt, dst);
    }
    const files = new Set([...list(MAIN), ...(fresh ? [] : [...list(WS), ...list(BASE)])]);
    const conflicts = [];
    for (const f of files) {
      const m = read(path.join(MAIN, f)), b = read(path.join(BASE, f)), w = read(path.join(WS, f));
      if (same(m, b) && !fresh) continue;              // main unchanged since last pull
      if (same(w, b) || fresh) { m === null ? rm(path.join(WS, f)) : write(path.join(WS, f), m); }
      else if (!same(w, m)) {                           // both changed: merge main into workspace
        const r = merge3(w, b, m, 'main');
        write(path.join(WS, f), r.buf);
        if (r.conflict) conflicts.push(f);
      }
      m === null ? rm(path.join(BASE, f)) : write(path.join(BASE, f), m);
    }
    console.log(`pulled main into ${path.relative(MAIN, WS)}${conflicts.length ? `\nCONFLICTS (resolve markers in workspace): ${conflicts.join(', ')}` : ''}`);
    process.exitCode = conflicts.length ? 1 : 0; return;
  }
  if (cmd === 'push') {
    const files = new Set([...list(WS), ...list(BASE)]);
    const pushed = [], conflicts = [];
    for (const f of files) {
      const w = read(path.join(WS, f)), b = read(path.join(BASE, f)), m = read(path.join(MAIN, f));
      if (same(w, b)) continue;                         // untouched in workspace
      if (w !== null && /^(<{7}|>{7}) /m.test(w.toString('utf8'))) { conflicts.push(f + ' (has conflict markers)'); continue; }
      if (same(m, b) || same(m, w)) { w === null ? rm(path.join(MAIN, f)) : write(path.join(MAIN, f), w); }
      else {
        const r = merge3(m, b, w, piece);
        if (r.conflict) { conflicts.push(f); continue; }
        write(path.join(MAIN, f), r.buf);
        write(path.join(WS, f), r.buf);
      }
      const final = read(path.join(MAIN, f));
      final === null ? rm(path.join(BASE, f)) : write(path.join(BASE, f), final);
      pushed.push(f);
    }
    console.log(`pushed ${pushed.length} file(s): ${pushed.join(', ') || '-'}${conflicts.length ? `\nCONFLICTS (not pushed; run pull, fix, push again): ${conflicts.join(', ')}` : ''}`);
    process.exitCode = conflicts.length ? 1 : 0; return;
  }
});
