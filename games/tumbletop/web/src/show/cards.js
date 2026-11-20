// Tumbletop show cards: the DOM graphics over the 3D view in the phases that are not racing
// (idle, the opening call, the line-up, round title, recap, result).
//
// One programme look: a plate at (24, 24) says where we are in the show, a lower third (bottom edge
// at y 664) carries the main call. Both live in the 1280x720 design space (.tt-fit, scaled by --k).
// Straps over the spotlighted Gumbles in the line-up are projected from 3D into real pixels and
// scaled by k themselves, each tied to its Gumble by a stem.
//
// Run of a round: the line-up opens with the round's title call (first 4 s of the lineup phase,
// drawn from the first frame). For the whole open window a full-width paper bar along the bottom of
// the frame reads "Line-up open ... 0:23", counting to the lock (`closeAt`), its clock stepping up
// for the last 5 s; at the lock it reads "Line-up locked", and then the 'locked' phase swells that
// bar into the full-width lock band (y 532 to 720), the loudest card in the show.
//
// Signature: every card's main ink panel carries a flat 4px paper bar along its top edge (.tc-sig);
// a finalist's board column carries a 3px bar in its own first colour. Nothing else decorates.
//
// No CSS transitions or animations: every opacity and offset is a function of the frame's `t`
// (seconds into the phase) or `now` (stage clock), eased with a smoothstep, so the same moment always
// gives the same pixels. The DOM for a phase is built once when the phase or its content changes;
// per frame only changed inline styles and texts are written.
//
// No betting UI here (no odds, amounts or prompts): only the rhythm of the show.
import * as THREE from 'three';
import './cards.css';
import { inkAll, inkFrame, swatchSvg } from './ink.js';

const W0 = 1280, H0 = 720;
const STRAP_LIFT = 1.3;    // metres above the feet: the top of the head
const STRAP_RISE = 44;     // design px between the anchor and the strap's bottom edge
const STRAP_EDGE = 60;     // design px: an anchor closer than this to a side of the frame gets no strap
const STRAP_GAP = 8;       // design px kept clear between two straps (else the one further from centre is dropped)
const STRAP_DWELL = 0.25;  // seconds a Gumble must be in the spotlight before its strap shows
const STRAP_FADE = 0.15;   // seconds: fade in only; a strap leaves instantly
const CLOSE_WARN = 5;      // seconds: the line-up clock row inverts for the last 5 s before the lock
const TITLE_END = 4;       // the title call holds the first 4 s of a line-up
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

// call layout (px in the design space; must match cards.css)
const CALL_GRID_H = 2 * 32 + 8;
const CALL_GAP = 12;

// ------------------------------------------------------------------ copy helpers (pure, exported)

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd". */
export function ordinal(n) {
  const v = Math.abs(Math.trunc(n)) % 100;
  const s = v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] ?? 'th';
  return `${Math.trunc(n)}${s}`;
}

/** m:ss, rounded up so it reads 0:00 exactly at the moment; never negative. */
function clock(sec) {
  const s = Number.isFinite(sec) ? Math.max(0, Math.ceil(sec - 1e-6)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const secsLeft = (at, now) => (Number.isFinite(at) ? Math.max(0, at - now) : 0);

// ------------------------------------------------------------------ small utilities

const smooth = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : String(c ?? '#ccc'));
const CHIP = { '': [14, 18], 'tc-c-md': [16, 22], 'tc-c-lg': [20, 26], 'tc-c-xl': [34, 44] };
const chip = (colors, cls = '') => {
  const a = css(colors?.[0]), b = css(colors?.[1] ?? colors?.[0]);
  const [w, h] = CHIP[cls] ?? CHIP[''];
  return swatchSvg(esc(a), esc(b), w, h, `chip${a}${b}`);
};
const setText = (node, cache, k, txt) => { if (cache[k] !== txt) { cache[k] = txt; node.textContent = txt; } };

// Keyframe tracks: [{ t, o, x, y }] per element, eased between keys, held before the first and
// after the last. Built once per phase; sampled per frame without allocating.
const key = (t, o, y = 0, x = 0) => ({ t, o, x, y });
const enter = (t0, dur = 0.3, dy = 12, dx = 0) => [key(t0, 0, dy, dx), key(t0 + dur, 1, 0, 0)];
const S = { o: 0, x: 0, y: 0 };
function sampleKeys(keys, t) {
  let i = 0;
  while (i < keys.length - 1 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const f = b === a || b.t <= a.t ? (t >= b.t ? 1 : 0) : t <= a.t ? 0 : smooth((t - a.t) / (b.t - a.t));
  S.o = a.o + (b.o - a.o) * f; S.x = a.x + (b.x - a.x) * f; S.y = a.y + (b.y - a.y) * f;
  return S;
}

// ------------------------------------------------------------------ the module

/**
 * @param {HTMLElement} root the stage container (class "tt-stage", CSS var --k = design-space scale)
 * @returns {{ el: HTMLElement, update(frame: object): void, destroy(): void }}
 */
export function createShowCards(root) {
  const el = document.createElement('div');
  el.className = 'tt-layer tc';
  el.innerHTML = '<div class="tt-fit tc-fit"></div><div class="tc-straps"></div>';
  const fit = el.firstChild, strapLayer = el.lastChild;
  root.appendChild(el);

  const V = new THREE.Vector3();
  let shown = false; el.style.display = 'none';
  let cur = null;            // the built card: { phase, refs, tracks, end, settled, live?, ... }
  let sizeW = -1, sizeH = -1, k = 1;

  function setShown(on) {
    if (on === shown) return;
    shown = on;
    el.style.display = on ? '' : 'none';
  }

  function readScale(w, h) {
    let v = NaN;
    try { v = parseFloat(getComputedStyle(root).getPropertyValue('--k')); } catch { /* not in a document */ }
    k = Number.isFinite(v) && v > 0 ? v : Math.min(w / W0, h / H0) || 1;
  }

  // What makes a phase's content new. Live fields (clocks, locked, spotlight) are read per frame.
  function refsOf(phase, d) {
    switch (phase) {
      case 'call': return [d.gumbles, d.rounds, d.lineupAt != null];
      case 'lineup': return [d.round, d.bots, !!d.board, d.hint ?? null];
      case 'title': return [d.round];
      case 'locked': return [d.round];
      case 'recap': return [d.round, d.remain, d.next];
      case 'result': return [d.winner, d.order, d.pick]; // nextAt arriving later adds the plate in place
      default: return [];
    }
  }
  const sameRefs = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // ---------------------------------------------------------------- builders
  // Each returns the card state; `q` finds an element inside the freshly built HTML.
  const q = (s) => fit.querySelector(s);
  const track = (node, keys) => ({ el: node, keys, o: '', tf: '' });

  // the corner plate is a clock and its two words; with no clock there is no plate (the page names the show)
  const showPlate = (clockRow) => (clockRow ? '<div class="tc-plate tc-plate-clock" data-ink="box" data-seed="tt-plate"><div class="tc-clock"><span class="k"></span><span class="v"></span></div></div>' : '<div class="tc-plate" style="display:none"></div>');
  const titleHTML = (round, cls = '') => `
    <div class="tc-l3 tc-title${cls}" data-ink="box" data-seed="tt-title">
      <div class="a">${esc(round.name)}</div>
    </div>`;

  // a "Tumbletop" plate whose clock row counts to `at`: "{label} 0:12", then `done` at zero
  function plateClock(c, label, done) {
    c.ck = q('.tc-plate .tc-clock .k'); c.cv = q('.tc-plate .tc-clock .v'); c.txt = {};
    return (at, now) => {
      const s = secsLeft(at, now);
      setText(c.ck, c.txt, 'k', s > 0 ? label : done);
      setText(c.cv, c.txt, 'v', s > 0 ? clock(s) : '');
    };
  }

  function buildIdle() {
    fit.innerHTML = `${showPlate(false)}<div class="tc-l3 tc-soon" data-ink="box" data-seed="tt-soon"><span>Next show soon</span></div>`;
    return { tracks: [track(q('.tc-plate'), enter(0)), track(q('.tc-l3'), enter(0.1))] };
  }

  // The call: who is racing, and a clock to the first line-up. Nothing else.
  function buildCall(d) {
    const gumbles = d.gumbles ?? [];
    const timed = d.lineupAt != null;
    const plates = gumbles.map((g) => `<div class="tc-gp" data-ink="plate" data-seed="gp${esc(g.name)}">${chip(g.colors)}<span>${esc(g.name)}</span></div>`).join('');
    fit.innerHTML = `${showPlate(timed)}
      <div class="tc-l3 tc-call">
        <div class="tc-grid">${plates}</div>
      </div>`;
    const tracks = [track(q('.tc-plate'), enter(0))];
    const cells = fit.querySelectorAll('.tc-gp');
    const n = cells.length;
    for (let i = 0; i < n; i++) tracks.push(track(cells[i], enter(0.4 + (n > 1 ? (i / (n - 1)) * 0.95 : 0), 0.25, 10)));
    const c = { tracks };
    if (timed) {
      const tick = plateClock(c, 'Bets open in', 'Bets opening');
      c.live = (dd, now) => tick(dd.lineupAt, now);
    }
    return c;
  }

  function buildLineup(d) {
    const round = d.round ?? {};
    const bots = d.bots ?? [];
    const board = false; // (no stat board: the stage shows names, the site's Form tab has the rest)
    fit.innerHTML = `
      <div class="tc-plate" data-ink="box" data-seed="tt-plate">
        <div class="tc-name">${esc(round.name)}</div>
      </div>
      ${titleHTML(round)}
      <div class="tc-open" data-ink="band" data-seed="tt-open"><span class="l"></span><span class="v"></span></div>`;
    const byId = [];
    for (const b of bots) if (b && b.id != null) byId[b.id] = b;
    const tracks = [
      // the title call opens the line-up, drawn from the first frame, and leaves at 4 s;
      // the plate (which repeats it) only comes in as it goes
      track(q('.tc-title'), [key(0, 1, 16), key(0.15, 1, 0), key(TITLE_END - 0.3, 1, 0), key(TITLE_END, 0, 0)]),
      track(q('.tc-plate'), enter(TITLE_END - 0.15, 0.3)),
    ];
    if (board) tracks.push(track(q('.tc-board'), enter(TITLE_END, 0.3, 12)));
    const c = {
      tracks,
      plate: q('.tc-plate'), bar: q('.tc-open'), boardEl: board ? q('.tc-board') : null,
      txt: {}, mode: -1, plateW: 0, plateH: 0, boardH: 0,
      board, byId, straps: [], strapById: [], first: true, cand: [], shown: [],
    };
    c.ck = c.bar.querySelector('.l'); c.cv = c.bar.querySelector('.v');
    // the open bar: one clock for the whole window, counting to the lock; bigger for the last 5 s
    c.live = (dd, now) => {
      const left = secsLeft(dd.closeAt, now);
      const mode = dd.locked ? 2 : left <= CLOSE_WARN ? 1 : 0;
      if (mode !== c.mode) {
        c.mode = mode;
        c.bar.className = mode === 1 ? 'tc-open warn' : mode === 2 ? 'tc-open done' : 'tc-open';
        setText(c.ck, c.txt, 'k', mode === 2 ? 'Bets closed' : 'Bets close in');
      }
      setText(c.cv, c.txt, 'v', mode === 2 ? '' : clock(left));
    };
    return c;
  }

  // the lock beat: a hard cut to a full-width paper band; only the text moves, 24px left to rest
  function buildLocked(d) {
    const round = d.round ?? {};
    fit.innerHTML = `
      <div class="tc-lock" data-ink="band" data-seed="tt-open">
        <div class="l">Bets closed</div>
        <div class="r"><div class="a">${esc(round.name)}</div></div>
      </div>`;
    const slide = () => [key(0, 1, 0, 24), key(0.18, 1, 0, 0)];
    return { tracks: [track(q('.tc-lock .l'), slide()), track(q('.tc-lock .r'), slide())] };
  }

  function buildTitle(d) {
    fit.innerHTML = titleHTML(d.round ?? {});
    return { tracks: [track(q('.tc-title'), [key(0, 1, 16), key(0.15, 1, 0)])] };
  }

  // The recap: the roster shelf is the picture; the card is the count ("8 remain") once the last
  // shutter is down, and a clock to the next round.
  function buildRecap(d) {
    const n = d.remain ?? 0;
    fit.innerHTML = `
      <div class="tc-remain" data-ink="box" data-seed="tt-remain"><span>${esc(n)} remain</span></div>
      ${d.next ? '<div class="tc-plate tc-plate-clock" data-ink="box" data-seed="tt-plate"><div class="tc-clock"><span class="k"></span><span class="v"></span></div></div>' : ''}`;
    const at = Number.isFinite(d.revealAt) ? d.revealAt : 4;
    const tracks = [track(q('.tc-remain'), [key(at, 0, -14), key(at + 0.22, 1, 0)])];
    const c = { tracks };
    if (d.next) {
      tracks.push(track(q('.tc-plate'), enter(0)));
      const tick = plateClock(c, `${d.next.name ?? 'Next round'} in`, `${d.next.name ?? 'Next round'} next`);
      c.live = (dd, now) => tick(dd.nextAt, now);
    }
    return c;
  }

  function buildResult(d) {
    const w = d.winner ?? {};
    const order = d.order ?? [];
    fit.innerHTML = `${showPlate(true)}
      <div class="tc-l3 tc-win">
        <div class="main" data-ink="gold" data-seed="tt-win">
          <div class="hl">${chip(w.colors, 'tc-c-xl')}<span>${esc(w.name)} wins</span></div>
        </div>
      </div>`;
    const tracks = [track(q('.tc-win .main'), enter(0, 0.4, 16))];
    // The "Next show in" plate is built now but drawn only once `nextAt` is known, which may come a
    // few seconds into the phase; the winner card is untouched when it does. It enters at 6 s, or
    // when nextAt arrives if that is later; a viewer joining with nextAt already set sees it settled.
    const c = { tracks, plateEl: q('.tc-plate'), plateAt: null, po: '', ptf: '', fresh: true };
    const tick = plateClock(c, 'Next show in', 'Next show starting');
    c.live = (dd, now, t) => {
      const known = dd.nextAt != null;
      if (known && c.plateAt == null) c.plateAt = c.fresh ? 6.0 : Math.max(6.0, t);
      c.fresh = false;
      let o = 0, y = 12;
      if (known) {
        tick(dd.nextAt, now);
        const f = smooth((t - c.plateAt) / 0.3);
        o = f; y = 12 * (1 - f);
      }
      const os = o >= 0.999 ? '1' : o <= 0.001 ? '0' : o.toFixed(3);
      const tf = y < 0.05 ? 'none' : `translate(0px, ${y.toFixed(1)}px)`;
      if (os !== c.po) { c.plateEl.style.opacity = os; c.po = os; }
      if (tf !== c.ptf) { c.plateEl.style.transform = tf; c.ptf = tf; }
    };
    return c;
  }

  const BUILD = { idle: buildIdle, call: buildCall, lineup: buildLineup, locked: buildLocked, title: buildTitle, recap: buildRecap, result: buildResult };

  function build(phase, data, refs) {
    strapLayer.textContent = '';
    const c = BUILD[phase](data);
    c.phase = phase; c.refs = refs;
    c.end = 0;
    for (const tr of c.tracks) c.end = Math.max(c.end, tr.keys[tr.keys.length - 1].t);
    c.settled = false;
    cur = c;
  }

  function clear() {
    if (!cur) return;
    fit.textContent = '';
    strapLayer.textContent = '';
    cur = null;
  }

  // ---------------------------------------------------------------- per-frame writers
  function applyTracks(c, t) {
    if (c.settled && t > c.end) return;
    for (const tr of c.tracks) {
      const s = sampleKeys(tr.keys, t);
      const o = s.o >= 0.999 ? '1' : s.o <= 0.001 ? '0' : s.o.toFixed(3);
      const tf = Math.abs(s.x) < 0.05 && Math.abs(s.y) < 0.05 ? 'none' : `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      if (o !== tr.o) { tr.el.style.opacity = o; tr.o = o; }
      if (tf !== tr.tf) { tr.el.style.transform = tf; tr.tf = tf; }
    }
    c.settled = t > c.end;
  }

  // ---------------------------------------------------------------- straps
  function makeStrap(c, g) {
    const node = document.createElement('div');
    node.className = 'tc-strap';
    const lines = ''; // the name, nothing under it
    node.innerHTML = `<div class="body" data-ink="box" data-seed="strap${esc(g.name)}"><div class="l1">${chip(g.colors, 'tc-c-md')}<span>${esc(g.name)}</span></div>${lines}</div><i class="stem"></i>`;
    strapLayer.appendChild(node);
    const s = { id: g.id, el: node, body: node.firstChild, stem: node.lastChild, w: 0, h: 0, on: false, since: 0,
      a: 0, d: 0, l: 0, t: 0, r: 0, b: 0, ax: 0, ay: 0, o: '', tf: '', sh: '' };
    c.straps.push(s);
    c.strapById[g.id] = s;
    return s;
  }

  const hideStrap = (s) => { if (s.o !== '0') { s.el.style.opacity = '0'; s.o = '0'; } };
  const hits = (l, t, r, b, L, T, R, B) => l < R && r > L && t < B && b > T;
  // a strap's panel or its stem (with the dot) touching a rect
  const strapHits = (s, L, T, R, B) => hits(s.l, s.t, s.r, s.b, L, T, R, B) || hits(s.ax - 5 * k, s.b, s.ax + 5 * k, s.ay + 5 * k, L, T, R, B);
  const strapsClash = (a, b, g) => strapHits(a, b.l - g, b.t - g, b.r + g, b.b + g) || strapHits(b, a.l - g, a.t - g, a.r + g, a.b + g);

  // Straps, calm: one per spotlighted Gumble, always straight above it with a short stem to the dot on
  // its head. Fully shown or not at all: it fades in over 0.15 s once its Gumble has been in the
  // spotlight for 0.25 s, and goes the instant it leaves. When two would touch, only the one nearer
  // the centre of the frame is drawn that frame.
  function updateStraps(c, d, t, now, camera, view, W, H) {
    const spot = Array.isArray(d.spotlight) ? d.spotlight : [];

    for (let i = 0; i < spot.length; i++) {
      const id = spot[i];
      const g = c.byId[id];
      if (!g) continue;
      const s = c.strapById[id] ?? makeStrap(c, g);
      if (!s.on) { s.on = true; s.since = c.first ? -Infinity : now; } // a viewer joining mid-spotlight sees it settled
    }
    for (const s of c.straps) if (s.on && !spot.includes(s.id)) s.on = false;
    c.first = false;

    const shown = c.shown; shown.length = 0;
    const cand = c.cand; cand.length = 0;
    if (camera && view?.botPos && t >= TITLE_END) {
      // the plate and the board, in real pixels: a strap that would touch either is not drawn
      const ox = (W - W0 * k) / 2, oy = (H - H0 * k) / 2;
      if (!c.plateW) { c.plateW = c.plate.offsetWidth; c.plateH = c.plate.offsetHeight; }
      const pL = ox + 24 * k, pT = oy + 24 * k, pR = pL + c.plateW * k, pB = pT + c.plateH * k;
      let bT = Infinity;
      const bL = ox + 24 * k, bR = ox + 1256 * k, bB = oy + 648 * k;
      if (c.boardEl) { if (!c.boardH) c.boardH = c.boardEl.offsetHeight; bT = bB - c.boardH * k; }
      const oT = oy + 664 * k, oB = oy + 720 * k; // the open bar, full width
      const titleGone = now - (t - TITLE_END); // the `now` at which the title left

      for (const s of c.straps) {
        if (!s.on) continue;
        const a = smooth((now - Math.max(s.since + STRAP_DWELL, titleGone)) / STRAP_FADE);
        if (a <= 0.001) continue;
        const id = s.id;
        if (view.botHidden?.[id]) continue;
        V.set(view.botPos[id * 3], view.botPos[id * 3 + 1] + STRAP_LIFT, view.botPos[id * 3 + 2]).project(camera);
        if (V.z > 1 || V.z < -1) continue;                                   // behind the camera
        const ax = (V.x * 0.5 + 0.5) * W, ay = (-V.y * 0.5 + 0.5) * H;
        // the head must be in frame, and not hard against a side
        if (ax < STRAP_EDGE * k || ax > W - STRAP_EDGE * k || ay < 0 || ay > H) continue;
        if (!s.w) { s.w = s.body.offsetWidth; s.h = s.body.offsetHeight; inkFrame(s.body); }
        const sw = s.w * k, sh = s.h * k;
        s.ax = ax; s.ay = ay;
        s.l = ax - sw / 2; s.r = ax + sw / 2; s.b = ay - STRAP_RISE * k; s.t = s.b - sh;
        if (strapHits(s, pL, pT, pR, pB) || (bT < Infinity && strapHits(s, bL, bT, bR, bB)) || strapHits(s, -1e4, oT, 1e4, oB)) continue;
        s.a = a;
        s.d = (ax - W / 2) ** 2 + (ay - H / 2) ** 2;
        cand.push(s);
      }
      // nearest the centre first; any later one that would touch an accepted one is dropped
      cand.sort((x, y) => x.d - y.d);
      const g = STRAP_GAP * k;
      for (const s of cand) {
        let ok = true;
        for (const p of shown) if (strapsClash(s, p, g)) { ok = false; break; }
        if (ok) shown.push(s);
      }
    }

    for (const s of c.straps) {
      if (!shown.includes(s)) { hideStrap(s); continue; }
      const o = s.a >= 0.999 ? '1' : s.a.toFixed(3);
      const tf = `translate(${s.l.toFixed(1)}px, ${s.t.toFixed(1)}px) scale(${k.toFixed(4)})`;
      const stemH = `${Math.max(0, (s.ay - s.b) / k).toFixed(1)}px`;
      if (o !== s.o) { s.el.style.opacity = o; s.o = o; }
      if (tf !== s.tf) { s.el.style.transform = tf; s.tf = tf; }
      if (stemH !== s.sh) { s.stem.style.height = stemH; s.sh = stemH; }
    }
  }

  // ---------------------------------------------------------------- update
  function update(frame) {
    const phase = frame?.phase;
    if (!phase || !BUILD[phase]) { clear(); setShown(false); return; }
    const data = frame.data ?? {};
    const t = Math.max(0, frame.t ?? 0);
    const now = frame.now ?? 0;

    const refs = refsOf(phase, data);
    if (!cur || cur.phase !== phase || !sameRefs(cur.refs, refs)) build(phase, data, refs);
    setShown(true);

    const W = frame.width || root.clientWidth || W0, H = frame.height || root.clientHeight || H0;
    if (W !== sizeW || H !== sizeH || (phase === 'lineup' && cur.first)) { sizeW = W; sizeH = H; readScale(W, H); }

    applyTracks(cur, t);
    if (cur.live) cur.live(data, now, t);
    const ik = Math.floor(now * 4);
    if (cur.inkAt !== ik) { cur.inkAt = ik; inkAll(fit); }
    if (phase === 'lineup') updateStraps(cur, data, t, now, frame.camera, frame.view, W, H);
  }

  function destroy() {
    clear();
    el.remove();
  }

  return { el, update, destroy };
}
