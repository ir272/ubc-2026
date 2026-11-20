#!/usr/bin/env node
// The sound of a show, as a file and as numbers. Plays a whole show on the virtual clock while the
// stage records every sound call, renders the same mix offline (the live voices and levels), and
// writes docs/sound/show.wav plus, with ffmpeg: integrated loudness and true peak (EBU R128), a
// spectrogram of the whole show, and one per phase.
//   node tools/sound.mjs [--seed 21]
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT, parseArgs, resolveServer, launchBrowser, openStage } from './lib/browser.mjs';

const a = parseArgs(process.argv.slice(2));
const out = resolve(ROOT, 'docs/sound');
mkdirSync(out, { recursive: true });
const FF = process.env.FFMPEG || 'ffmpeg';
const server = await resolveServer({ port: Number(a.port ?? 5201) });
let browser = null;
try {
  const b = await launchBrowser({ width: 640, height: 360 });
  browser = b.browser;
  await openStage(b.page, server.url, { capture: 1, seed: Number(a.seed ?? 21), bets: 0, soundlog: 1 });
  // one whole show, sampling the phase as it goes
  const marks = await b.page.evaluate(async () => {
    const out = []; let last = '';
    for (let i = 0; i < 4000; i++) {
      await window.__tt.advance(200, { render: false });
      const s = window.__tt.state();
      const key = `${s.phase}:${s.round}`;
      if (key !== last) { last = key; out.push({ t: s.showTime, phase: s.phase, round: s.round }); }
      const res = out.find((m) => m.phase === 'result');
      if (res && s.showTime > res.t + 13) { out.push({ t: s.showTime, phase: 'end', round: s.round }); break; }
    }
    return out;
  });
  const end = marks[marks.length - 1].t;
  const wav = await b.page.evaluate(([x, y]) => window.__tt.renderAudio(x, y), [0, end]);
  writeFileSync(resolve(out, 'show.wav'), Buffer.from(wav, 'base64'));
  writeFileSync(resolve(out, 'phases.json'), JSON.stringify(marks, null, 1));
  const loud = (file, ss, t) => {
    const r = spawnSync(FF, ['-hide_banner', '-nostats', ...(ss != null ? ['-ss', String(ss), '-t', String(t)] : []), '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
    const txt = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
    const I = /I:\s+(-?[\d.]+) LUFS/.exec(txt)?.[1], LRA = /LRA:\s+(-?[\d.]+) LU/.exec(txt)?.[1], P = /Peak:\s+(-?[\d.]+) dBFS/.exec(txt)?.[1];
    return { lufs: Number(I), lra: Number(LRA), peak: Number(P) };
  };
  const f = resolve(out, 'show.wav');
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', f, '-lavfi', 'showspectrumpic=s=1600x480:legend=1:scale=log:fscale=log', resolve(out, 'spectrogram.png')]);
  const whole = loud(f);
  console.log(`show.wav  ${end.toFixed(0)} s   integrated ${whole.lufs} LUFS   range ${whole.lra} LU   true peak ${whole.peak} dBFS`);
  const rows = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const m = marks[i], dur = marks[i + 1].t - m.t;
    if (dur < 2.5) continue;
    const l = loud(f, m.t, dur);
    rows.push({ phase: m.phase, round: m.round, from: Math.round(m.t), seconds: Math.round(dur), ...l });
    console.log(`  ${String(Math.round(m.t)).padStart(4)} s  ${m.phase.padEnd(7)} r${m.round + 1}  ${String(Math.round(dur)).padStart(3)} s   ${l.lufs} LUFS   peak ${l.peak} dBFS`);
  }
  writeFileSync(resolve(out, 'loudness.json'), JSON.stringify({ whole, phases: rows }, null, 1));
  // a closer look: the lock, the 3 2 1 and the first 20 s of round one
  const lock = marks.find((m) => m.phase === 'locked');
  if (lock) execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', String(lock.t - 6), '-t', '34', '-i', f, '-lavfi', 'showspectrumpic=s=1600x480:legend=1:scale=log:fscale=log', resolve(out, 'spectrogram-lock-to-race.png')]);
} finally {
  await browser?.close();
  await server.close?.();
}
