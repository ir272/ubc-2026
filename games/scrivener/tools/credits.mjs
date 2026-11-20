#!/usr/bin/env node
// Generate assets/audio/credits.json from assets/audio/LICENSES.md (the license ledger is
// the single source of truth; re-run this whenever it changes).
//   node tools/credits.mjs [--check]     --check: exit 1 if credits.json is stale
//
// credits.json:
//   required[]  every CC BY attribution, verbatim from the LICENSES.md attribution block,
//               plus parsed { title, author, url, license, licenseUrl, kind: music|sound }
//   courtesy[]  CC0 items (no credit required; listed as a courtesy), de-duplicated by source
//   files{}     shipped file name -> { title, author, license } for every file in the ledger

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets', 'audio', 'LICENSES.md');
const OUT = path.join(ROOT, 'assets', 'audio', 'credits.json');

export function parseLicenses(md) {
  const required = [];
  const notes = [];
  const block = md.match(/## Attribution block[^\n]*\n+```\n([\s\S]*?)\n```/);
  if (!block) throw new Error('LICENSES.md: no attribution block');
  for (const raw of block[1].split('\n')) {
    const line = raw.replace(/^\s*-\s*/, '').trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^"(.+?)" by (.+?) \((https?:\/\/[^)]+)\), licensed under (CC BY [\d.]+) \((https?:\/\/[^)]+)\)/))) {
      required.push({ kind: 'sound', title: m[1], author: m[2], url: m[3], license: m[4], licenseUrl: m[5], text: line });
    } else if ((m = line.match(/^"(.+?)" (Kevin MacLeod) \((incompetech\.com)\) Licensed under Creative Commons: By Attribution ([\d.]+) License (https?:\/\/\S+)/))) {
      required.push({ kind: 'music', title: m[1], author: m[2], url: `https://${m[3]}`, license: `CC BY ${m[4]}`, licenseUrl: m[5], text: line });
    } else {
      notes.push(line); // e.g. the Kenney CC0 courtesy line
    }
  }

  // per-file details
  const files = {};
  const courtesy = [];
  const seen = new Set();
  const re = /\*\*([^*]+?)\*\*\s*\n((?:- [^\n]*\n?)+)/g;
  let m;
  while ((m = re.exec(md))) {
    const names = m[1].split('/').map((s) => s.trim()).filter(Boolean);
    const field = (k) => { const f = m[2].match(new RegExp(`^- ${k}: (.*?)\\s*$`, 'm')); return f ? f[1].trim() : ''; };
    const lic = field('License');
    const lm = lic.match(/^\[(.+?)\]\((.+?)\)$/);
    const license = lm ? lm[1] : lic;
    const licenseUrl = lm ? lm[2] : '';
    const entry = { title: field('Title'), author: field('Author'), source: field('Source'), license, licenseUrl };
    for (const n of names) files[n] = { title: entry.title, author: entry.author, license };
    if (/CC0|Public Domain/i.test(license)) {
      const key = entry.source || `${entry.title}|${entry.author}`;
      if (!seen.has(key)) { seen.add(key); courtesy.push({ title: entry.title, author: entry.author, url: entry.source }); }
    }
  }
  return { source: 'assets/audio/LICENSES.md', required, courtesy, notes, files };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const data = parseLicenses(fs.readFileSync(SRC, 'utf8'));
  const text = `${JSON.stringify(data, null, 1)}\n`;
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== text) { console.error('credits.json is stale: run node tools/credits.mjs'); process.exit(1); }
    console.log('credits.json up to date');
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`wrote ${path.relative(ROOT, OUT)}: ${data.required.length} CC BY attributions, ${data.courtesy.length} CC0 courtesy credits, ${Object.keys(data.files).length} files`);
  }
}
