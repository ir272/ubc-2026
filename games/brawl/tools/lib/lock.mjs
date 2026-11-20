// Cross-process browser lock for games/brawl: one headless browser at a time.
// mkdir is atomic, so the directory itself is the lock. owner.json inside holds
// pid, start time and the last progress beat.
//
// Stale rules: a lock whose last beat is older than 5 min and whose pid is dead,
// or any lock whose last beat is older than 12 min. Holders call touch() as they
// make progress, so a long --set run keeps its lock while a hung one loses it.
import fs from 'node:fs';
import path from 'node:path';

export const LOCK_DIR = '/tmp/ringout-browser.lock';
const OWNER = path.join(LOCK_DIR, 'owner.json');
const WAIT_MAX_MS = 15 * 60 * 1000;
const STALE_DEAD_MS = 5 * 60 * 1000;
const STALE_ANY_MS = 12 * 60 * 1000;

let held = false;
const cleanups = new Set();

/** Register a synchronous cleanup that runs on release, SIGINT, SIGTERM and exit. */
export function onCleanup(fn) {
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}

function runCleanups() {
  for (const fn of [...cleanups]) {
    try { fn(); } catch { /* keep going */ }
    cleanups.delete(fn);
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function readOwner() {
  try { return JSON.parse(fs.readFileSync(OWNER, 'utf8')); } catch { return null; }
}

function lockAgeMs(owner) {
  let t = owner?.beat ?? owner?.start;
  if (!t) {
    try { t = fs.statSync(LOCK_DIR).mtimeMs; } catch { return 0; }
  }
  return Date.now() - t;
}

function writeOwner(extra = {}) {
  const prev = readOwner() || {};
  const now = Date.now();
  const o = { pid: process.pid, start: prev.pid === process.pid ? prev.start : now, beat: now,
    cmd: process.argv.slice(1).join(' ').slice(0, 300), ...extra };
  fs.writeFileSync(OWNER + '.tmp', JSON.stringify(o));
  fs.renameSync(OWNER + '.tmp', OWNER);
}

function removeLockSync() {
  if (!held) return;
  const o = readOwner();
  if (!o || o.pid === process.pid) fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  held = false;
}

let signalsInstalled = false;
function installSignals() {
  if (signalsInstalled) return;
  signalsInstalled = true;
  const onSig = (sig, code) => () => {
    process.stderr.write(`\n${sig}: closing browser and releasing lock\n`);
    runCleanups();
    removeLockSync();
    process.exit(code);
  };
  process.on('SIGINT', onSig('SIGINT', 130));
  process.on('SIGTERM', onSig('SIGTERM', 143));
  process.on('exit', () => { runCleanups(); removeLockSync(); });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for and take the lock. Throws after 15 minutes. */
export async function acquireLock({ log = (s) => process.stderr.write(s + '\n') } = {}) {
  installSignals();
  const t0 = Date.now();
  let delay = 250;
  let lastMsg = -Infinity;
  for (;;) {
    try {
      fs.mkdirSync(LOCK_DIR);
      held = true;
      writeOwner();
      const waited = Date.now() - t0;
      if (waited > 1000) log(`browser lock taken after ${(waited / 1000).toFixed(0)} s`);
      return { waitedMs: waited };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const owner = readOwner();
    const age = lockAgeMs(owner);
    const alive = pidAlive(owner?.pid);
    if ((age > STALE_DEAD_MS && !alive) || age > STALE_ANY_MS) {
      log(`removing stale browser lock (pid ${owner?.pid ?? '?'}, ${alive ? 'alive' : 'dead'}, last beat ${(age / 1000).toFixed(0)} s ago)`);
      fs.rmSync(LOCK_DIR, { recursive: true, force: true });
      continue;
    }
    const waited = Date.now() - t0;
    if (waited > WAIT_MAX_MS) {
      throw new Error(`gave up waiting for the browser lock after 15 min (held by pid ${owner?.pid ?? '?'}: ${owner?.cmd ?? 'unknown'})`);
    }
    if (waited - lastMsg >= 30000) {
      lastMsg = waited;
      log(`waiting for browser lock (held by pid ${owner?.pid ?? '?'}${alive ? '' : ', dead'}: ${(owner?.cmd ?? '').slice(0, 120)})`);
    }
    await sleep(delay);
    delay = Math.min(5000, Math.round(delay * 1.6));
  }
}

/** Mark progress so the lock is not treated as stale. Cheap; call it often. */
let lastTouch = 0;
export function touchLock() {
  if (!held) return;
  const now = Date.now();
  if (now - lastTouch < 5000) return;
  lastTouch = now;
  try { writeOwner(); } catch { /* lock dir gone: stolen as stale */ }
}

export function releaseLock() {
  runCleanups();
  removeLockSync();
}

/** Run fn while holding the lock; always release. */
export async function withLock(fn, opts) {
  await acquireLock(opts);
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}
