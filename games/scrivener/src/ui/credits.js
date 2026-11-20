// Credits: the page's "Credits" link (outside the canvas) opens a sheet listing every
// CC BY attribution, verbatim, plus the CC0 courtesy credits. Owner: ui. Browser-only.
// The data is assets/audio/credits.json, generated from assets/audio/LICENSES.md by
// `node tools/credits.mjs`. Keyboard: C toggles the sheet, Esc closes it.
//
//   loadCredits() -> Promise<credits|null>   (cached; never throws)
//   mountCredits(document)                     wires the link + dialog in index.html
//   rollLines(credits) -> [{head, line}]        short lines for the in-canvas credits roll

const CREDITS_URL = 'assets/audio/credits.json';
let pending = null;

export function loadCredits() {
  if (!pending) {
    pending = fetch(CREDITS_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return pending;
}

// Short attribution lines for the victory card's credits roll (music first).
export function rollLines(c) {
  if (!c || !Array.isArray(c.required)) return [];
  const music = c.required.filter((r) => r.kind === 'music');
  const sound = c.required.filter((r) => r.kind !== 'music');
  const out = [];
  for (const r of music) out.push({ head: 'MUSIC', line: `“${r.title}” by ${r.author} (incompetech.com) · ${r.license}` });
  for (const r of sound) out.push({ head: 'SOUND', line: `“${r.title}” by ${r.author} (freesound.org) · ${r.license}` });
  return out;
}

const el = (doc, tag, props = {}, kids = []) => {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k) e.append(k);
  return e;
};
const link = (doc, href, text) => el(doc, 'a', { href, target: '_blank', rel: 'noopener noreferrer', text });

function render(doc, body, c) {
  const intro = body.querySelector('p');
  body.replaceChildren();
  if (intro) body.append(intro);
  if (!c) {
    body.append(el(doc, 'p', { text: 'The credits could not be loaded. They are in assets/audio/LICENSES.md.' }));
    return;
  }
  const music = c.required.filter((r) => r.kind === 'music');
  const sound = c.required.filter((r) => r.kind !== 'music');
  const section = (title, items, fmt) => {
    if (!items.length) return;
    body.append(el(doc, 'h3', { text: title }));
    const ul = el(doc, 'ul');
    for (const r of items) ul.append(fmt(r));
    body.append(ul);
  };
  const attribution = (r) => {
    // the attribution text exactly as LICENSES.md gives it, with its URLs made links
    const li = el(doc, 'li');
    const parts = r.text.split(/(https?:\/\/[^\s)]+)/);
    for (const p of parts) li.append(/^https?:\/\//.test(p) ? link(doc, p, p) : doc.createTextNode(p));
    return li;
  };
  section('Music', music, attribution);
  section('Sound effects (CC BY)', sound, attribution);
  if (c.courtesy && c.courtesy.length) {
    const det = el(doc, 'details');
    det.append(el(doc, 'summary', { text: `Sound effects (CC0, credit not required): ${c.courtesy.length} recordings` }));
    const ul = el(doc, 'ul', { class: 'cc0' });
    for (const r of c.courtesy) {
      const li = el(doc, 'li');
      li.append(doc.createTextNode(`“${r.title}” by ${r.author}`));
      if (r.url) { li.append(doc.createTextNode(' · ')); li.append(link(doc, r.url, 'source')); }
      ul.append(li);
    }
    det.append(ul);
    for (const n of c.notes || []) det.append(el(doc, 'p', { text: n }));
    body.append(det);
  }
  body.append(el(doc, 'p', { class: 'small', text: 'All audio was edited (trimmed, loudness-normalised). Per-file sources and licenses: assets/audio/LICENSES.md.' }));
}

export function mountCredits(doc = document) {
  const dlg = doc.getElementById('credits');
  const open = doc.getElementById('credits-link');
  if (!dlg || !open) return { open() {}, close() {} };
  const body = dlg.querySelector('.credits-body');
  let filled = false;
  const show = async () => {
    if (!filled) { render(doc, body, await loadCredits()); filled = true; }
    if (!dlg.open) dlg.showModal();
  };
  const hide = () => { if (dlg.open) dlg.close(); };
  open.addEventListener('click', (e) => { e.preventDefault(); show(); });
  dlg.querySelector('.credits-close').addEventListener('click', hide);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) hide(); }); // backdrop
  doc.addEventListener('keydown', (e) => {
    if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) { if (dlg.open) hide(); else show(); }
  });
  return { open: show, close: hide };
}
