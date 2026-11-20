// Tumbletop race display: the DOM layer over the 3D race. Everything on it is about the cut line:
// how many go through, who is on the edge right now, and where the viewer's pick is.
//
// In the 1280x720 design space (.tt-fit, scaled by --k):
//   (24, 24), 252 wide    the tower, top to bottom:
//                           title bar: round name left, race clock m:ss right (clock from Go on)
//                           the count ("5 places left"; before the race "Top 8 of 16 go through")
//                           rows (from 1.5 s into the race):
//                             N <= 8: every Gumble in place order, the line after place Q
//                             N > 8, before anyone finishes: leader, places Q-1 and Q, the line,
//                                     Q+1 and Q+2, the pick, dim dots between non-adjacent places
//                             N > 8, from the first finisher to the end of the round: places 1 to
//                                     Q+2 in 26px rows, plus the pick (after dots) if it is lower
//                           The line: one solid paper bar across the panel, "Top 8 go through"
//                           left, "gap to 8th" right; rows under it show their gap ("0.5 m").
//                           The panel height is fixed while the rows are up; in Round One it
//                           changes once, at the first finisher. The cut lists the same rows.
//                           Place chips mean one thing here and on the tags (see chipCls).
//   top centre, y 56      countdown plate 3, 2, 1 (ink, 112 square), then a paper "Go" plate for the
//                         first 0.9 s of the race
//   bottom centre, y 640  one event line, one event at a time (phase 'race' only)
//   lower left            the cut call plate, left x 24, bottom y 664 (phase 'cut')
// In real pixels (outside the design space, sized from --k):
//   name tags over exactly the Gumbles the stage lists in frame.tags, each with a pointer whose tip
//   sits on the top of its Gumble's head (feet + 1.05 m). A tag that would overlap a stronger one
//   is dropped for that frame, never moved away from its Gumble; the pick's tag never gives way.
//
// Motion: no CSS transitions or animations anywhere. Every offset, scale and opacity is computed
// from frame.now (or sim time) and written inline, so captures in virtual time are deterministic.
// DOM writes happen only when a cached value changes; nothing rebuilds innerHTML per frame. The
// tower's rows and text refresh at 10 Hz of `now` (and at once on phase, pick or round changes),
// always as one consistent snapshot, so a row is never drawn on the wrong side of the line. The
// event line, countdown and tags are placed every frame.
import * as THREE from 'three';
import './raceHud.css';

const ROW_H = 30, ROW_H_CUT = 26, ROW_GAP = 2, DOTS_H = 14, LINE_H = 22;
const FULL_MAX = 8;                        // up to this many starters the tower lists everyone
const ROW_POOL = 12, DOT_POOL = 3;
const ROWS_AFTER = 1.5;                    // rows appear this long into the race
const INNER_W = 232;                       // tower width minus padding
const COUNT_FS = 18, COUNT_FS_MIN = 14;    // the final's pre-race line shrinks to fit one line
const EV_REPLACE = 1.2, EV_MAX = 2.6;      // event line: replaceable after, gone after (seconds)
const EV_IN = 0.18, EV_OUT = 0.2;          // event line fade in / out (inside EV_MAX)
const EV_STALE = 0.8;                      // a waiting event older than this is dropped
const EV_REPEAT = 6;                       // the same text is not shown again within this many seconds
const NUM_SETTLE = 0.16, NUM_FROM = 1.12, GO_S = 0.9, CUT_IN = 0.25;
const TAG_FS = 16, TAG_H_EM = 1.75;        // tag font size (design px) and height in em
const TAG_HEAD = 1.05;                     // metres from the feet to the top of the head
const TAG_POINT = 8;                       // pointer height (design px, times k): its tip is on the head
const EVENT_LINE = false;                   // the event line ("X got smacked by a metronome") is off: it restated the picture
const TAG_YOU_EM = 4.1;                    // extra width of the dim "your pick" in a tag, in em

// the compact window (N > 8) always reserves: leader, dots, 4 block rows, line, dots, pick row
const COMPACT_H = 6 * (ROW_H + ROW_GAP) + 2 * (DOTS_H + ROW_GAP) + (LINE_H + ROW_GAP) - ROW_GAP;
// once Round One opens up it always reserves: Q+2 rows, line, dots, pick row (26px rows)
const openH = (Q) => (Q + 3) * (ROW_H_CUT + ROW_GAP) + (LINE_H + ROW_GAP) + (DOTS_H + ROW_GAP) - ROW_GAP;

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const css = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c || '#888888');
const ord = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const fmtClock = (t) => {
  t = Math.max(0, t || 0);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
// a gap under the bar's "gap to 8th" (or to the leader in the final)
const fmtGap = (d) => {
  d = Math.max(0, d);
  if (d < 0.05) return 'level';
  return (d < 9.95 ? d.toFixed(1) : d.toFixed(0)) + ' m';
};
// no dashes as punctuation, at most 20 words on a line
const clean = (s) => {
  const w = String(s ?? '').replace(/\s*[—–]\s*/g, ', ').trim().split(/\s+/);
  return w.length > 20 ? w.slice(0, 20).join(' ') : w.join(' ');
};
// the tower already counts places: drop a trailing ". 5 places left" from event text
const dropCount = (s) => s.replace(/[.,!]?\s*\d+\s+places?\s+left[.!]?\s*$/i, '');

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// cached writers: touch the DOM only when the value changes
const setText = (n, s) => { if (n._t !== s) { n._t = s; n.textContent = s; } };
const setCls = (n, s) => { if (n._c !== s) { n._c = s; n.className = s; } };
const setTf = (n, s) => { if (n._tf !== s) { n._tf = s; n.style.transform = s; } };
const setOp = (n, s) => { if (n._op !== s) { n._op = s; n.style.opacity = s; } };
const setShow = (n, on) => { if (n._on !== on) { n._on = on; n.style.display = on ? '' : 'none'; } };
const setChip = (n, c) => {
  if (n._a !== c[0]) { n._a = c[0]; n.style.setProperty('--a', c[0]); }
  if (n._b !== c[1]) { n._b = c[1]; n.style.setProperty('--b', c[1]); }
};

export function createRaceHud(root) {
  const layer = el('div', 'tt-layer rh', root);
  const tagLayer = el('div', 'rh-tags', layer);   // real pixels, under the design space
  const fit = el('div', 'tt-fit', layer);

  // ---------------------------------------------------------------- tower
  const tower = el('div', 'rh-tower', fit);
  const head = el('div', 'rh-head', tower);
  const roundEl = el('span', 'rh-round', head);
  const clockEl = el('span', 'rh-clock', head, '0:00');
  const body = el('div', 'rh-body', tower);
  const count = el('div', 'rh-count', body);
  const countN = el('span', 'rh-count-n', count);
  const countW = el('span', 'rh-count-w', count);

  const list = el('div', 'rh-list', body);
  const rows = [];
  for (let i = 0; i < ROW_POOL; i++) {
    const r = el('div', 'rh-row', list);
    const sq = el('span', 'rh-sq', r);
    const chip = el('span', 'tt-chip', r);
    const nm = el('span', 'rh-name', r);
    const st = el('span', 'rh-status', r);
    setShow(r, false);
    rows.push({ r, sq, chip, nm, st, id: -1 });
  }
  const dots = [];
  for (let i = 0; i < DOT_POOL; i++) {
    const d = el('div', 'rh-dots', list);
    el('i', '', d); el('i', '', d); el('i', '', d);
    setShow(d, false);
    dots.push(d);
  }
  const line = el('div', 'rh-line', list);
  const lineLbl = el('span', 'rh-line-label', line);
  const lineHead = el('span', 'rh-line-head', line);
  setShow(line, false);

  // ---------------------------------------------------------------- event line
  const evWrap = el('div', 'rh-event-wrap', fit);
  const evEl = el('div', 'rh-event', evWrap);
  const evChip = el('span', 'tt-chip', evEl);
  const evTxt = el('span', 'rh-event-text', evEl);
  setShow(evEl, false);

  // ---------------------------------------------------------------- countdown numeral
  const numWrap = el('div', 'rh-num-wrap', fit);
  const numEl = el('div', 'rh-num', numWrap);
  setShow(numEl, false);

  // ---------------------------------------------------------------- cut call (lower left)
  const cutEl = el('div', 'rh-cut', fit);
  const cutH = el('div', 'rh-cut-h', cutEl);
  const cutS = el('div', 'rh-cut-s', cutEl);
  const cutP = el('div', 'rh-cut-p', cutEl);
  const cutPSq = el('i', 'rh-cut-p-sq', cutP);
  const cutPTxt = el('span', '', cutP);
  setShow(cutEl, false);

  // ---------------------------------------------------------------- state
  let N = 0, Q = 1, L = 1;
  let names = [], cols = [];
  let tags = [];                    // one per slot id: { el, sq, you, wEm }
  let kindOf = new Uint8Array(0);   // per frame: 0 untagged, 1 plain, 2 line, 4 out
  let pickTag = new Uint8Array(0);  // per frame: 1 if the stage marked this tag as the pick
  let drawn = new Uint8Array(0);
  let cand = new Int16Array(0);
  let boxes = new Float32Array(0);  // placed tag boxes x0, y0, x1, y1
  const marks = new Uint8Array(64); // places to show in the tower (index = place)
  const shown = new Int16Array(ROW_POOL);
  let visible = true, lastPhase = '', listKey = -1, force = true;
  let pickId = -1, lastNow = 0;
  let clockFrozen = null;
  let towerH = 0, towerDirty = true, countFit = false;
  let kStr = null, k = 1;
  let cur = null, pending = null;   // event line: showing, waiting
  let recent = [];                  // texts shown lately: { text, t }
  let numLabel = '', numT0 = 0;
  let cutKey = '', cutT0 = 0;
  const v3 = new THREE.Vector3();

  function setRound({ round, bots, courseLength }) {
    N = bots.length;
    Q = Math.max(1, round?.qualify ?? 1);
    L = courseLength || 1;
    names = bots.map((b, i) => b.name ?? `Gumble ${i + 1}`);
    cols = bots.map((b) => [css(b.colors?.[0]), css(b.colors?.[1] ?? b.colors?.[0])]);
    setText(roundEl, round?.name ?? '');
    setText(lineLbl, `Top ${Q} go through`);
    setText(lineHead, '');

    tagLayer.textContent = '';
    tags = names.map((name) => {
      const t = el('div', 'rh-tag', tagLayer);
      const sq = el('span', 'rh-tag-sq', t);
      el('span', 'rh-tag-name', t, name);
      const you = el('span', 'rh-tag-you', t, 'your pick');
      setShow(t, false); setShow(you, false);
      // width estimate in em (no layout reads): padding + place chip + gap + name
      return { el: t, sq, you, wEm: 0.2 + 1.35 + 0.35 + name.length * 0.5 + 0.5 };
    });
    kindOf = new Uint8Array(N);
    pickTag = new Uint8Array(N);
    drawn = new Uint8Array(N);
    cand = new Int16Array(N);
    boxes = new Float32Array(N * 4);

    for (const r of rows) { r.id = -1; setShow(r.r, false); }
    cur = null; pending = null; recent = []; setShow(evEl, false);
    numLabel = ''; setShow(numEl, false);
    cutKey = ''; setShow(cutEl, false);
    clockFrozen = null;
    listKey = -1; force = true; towerDirty = true;
  }

  // One meaning for place chips everywhere (tower squares and tags): gold = place 1 while racing,
  // green = through or above the line, red = below the line or out, neutral only in the final
  // for places 2 to 4.
  function chipCls(b, p) {
    const s = b?.status;
    if (s === 'qualified') return ' sq-in';
    if (s === 'eliminated') return Q === 1 ? '' : ' sq-out';
    if (p === 1) return ' sq-lead';
    if (Q === 1) return '';
    return p <= Q ? ' sq-in' : ' sq-out';
  }

  // ---------------------------------------------------------------- tower
  let orderKey = 0;
  function refreshTower(st, phase) {
    const cutPhase = phase === 'cut';
    const finished = st.phase === 'finished' || cutPhase;
    const pre = !finished && (phase === 'countdown' || st.phase !== 'race' || (st.raceTime ?? 0) < ROWS_AFTER);
    const full = N <= FULL_MAX;
    // Round One opens up from the first finisher to the end of the round (cut included)
    const open = !full && (st.qualifiedCount > 0 || finished);
    const hasLine = Q > 1 && Q < N;

    // the count. The final has none once racing (is-blank removes it).
    let cls = 'rh-count', n = '', words;
    // (the final has no count: the bar under first place says "One winner". Before the gun the
    // bar already says how many go through, so nothing is repeated here)
    if (Q === 1 || pre) { cls += Q === 1 ? ' is-final is-blank' : ' is-blank'; words = ''; }
    else if (finished || st.qualifiedCount >= Q) { cls += ' is-over'; words = 'Round over'; }
    // (no "8 places left" while racing: six of fifteen first-time viewers could not tell what it counted)
    else { cls += ' is-blank'; words = ''; }
    if (count._c !== cls || countW._t !== words) {
      towerDirty = true;
      countFit = cls.includes('is-final');
      if (!countFit && countW._fs) { countW._fs = 0; countW.style.fontSize = ''; }
    }
    setCls(count, cls); setText(countN, n); setText(countW, words);

    // the clock appears at Go
    setShow(clockEl, st.phase === 'race'); // (the clock goes when the race is over)

    // which places
    const order = st.order;
    const NN = Math.min(N, order.length, marks.length - 2);
    marks.fill(0);
    if (pre) { /* no rows yet */ }
    else if (full) for (let p = 1; p <= NN; p++) marks[p] = 1;
    else {
      if (open) for (let p = 1; p <= Math.min(NN, Q + 2); p++) marks[p] = 1;
      else {
        marks[1] = 1;
        for (let p = Q - 1; p <= Q + 2; p++) if (p >= 1 && p <= NN) marks[p] = 1;
      }
      if (pickId >= 0 && pickId < N) { const pp = st.bots[pickId]?.place ?? 0; if (pp >= 1 && pp <= NN) marks[pp] = 1; }
    }
    let nShow = 0;
    for (let p = 1; p <= NN && nShow < ROW_POOL; p++) if (marks[p]) shown[nShow++] = p;

    // layout, in place order: rows, dots between non-adjacent places, the line after place Q
    const rh = open ? ROW_H_CUT : ROW_H;
    let y = 0, prev = 0, nDots = 0, lineY = -1;
    for (let i = 0; i < nShow; i++) {
      const p = shown[i];
      if (prev && p > prev + 1 && nDots < DOT_POOL) {
        const d = dots[nDots++];
        setShow(d, true);
        setTf(d, `translate3d(0,${y}px,0)`);
        y += DOTS_H + ROW_GAP;
      }
      setTf(rows[i].r, `translate3d(0,${y}px,0)`);
      y += rh + ROW_GAP;
      if (hasLine && p === Q) { lineY = y; y += LINE_H + ROW_GAP; }
      prev = p;
    }
    for (let i = nDots; i < DOT_POOL; i++) setShow(dots[i], false);
    setShow(line, lineY >= 0);
    if (lineY >= 0) setTf(line, `translate3d(0,${lineY}px,0)`);
    setCls(list, rh === ROW_H_CUT ? 'rh-list is-tight' : 'rh-list');

    // one panel height for the whole race: reserve the most the layout can need
    let reserve;
    if (pre) reserve = 0; // before the rows arrive (the countdown and the first second) the panel is just the header
    else reserve = 0; // the panel is exactly as tall as its rows
    const listH = `${Math.max(0, reserve, y - ROW_GAP)}px`;
    if (list._h !== listH) { list._h = listH; list.style.height = listH; towerDirty = true; }

    // what the gaps are measured against: the Gumble holding place Q, or the leader in the final
    const ref = st.bots[Q > 1 && Q <= NN ? order[Q - 1] : order[0]];
    const refDist = !ref ? 0 : ref.status === 'qualified' ? L : ref.distance;
    const racingNow = st.phase === 'race';

    for (let i = 0; i < ROW_POOL; i++) {
      const r = rows[i];
      if (i >= nShow) { setShow(r.r, false); continue; }
      const p = shown[i], id = order[p - 1], b = st.bots[id];
      if (r.id !== id) { r.id = id; setText(r.nm, names[id] ?? ''); setChip(r.chip, cols[id] ?? ['#888888', '#888888']); }
      const isPick = id === pickId;
      const status = b?.status ?? 'racing';
      // a respawning Gumble reads exactly like a racing one (never "fell")
      const racing = status === 'racing' || status === 'respawning';
      let red = false, txt = '';
      let sq = chipCls(b, p);
      // A row says a place and a name. The only words beside it: "your pick", and "out" (the
      // coloured place chip already says who is through). No gaps: they were statistics.
      if (Q === 1) {
        if (isPick) txt = 'your pick';
      } else if (cutPhase) {
        if (p <= Q) sq = ' sq-in';
        else { red = true; sq = ' sq-out'; txt = 'out'; }
        if (isPick) txt = 'your pick';
      } else {
        red = status === 'eliminated' || (racing && p > Q);
        if (isPick) txt = 'your pick';
        else if (status === 'eliminated') txt = 'out';
      }
      setCls(r.r, 'rh-row' + (red ? ' is-out' : '') + (isPick ? ' is-pick' : ''));
      setCls(r.sq, 'rh-sq' + sq);
      setText(r.sq, String(p));
      setText(r.st, txt);
      setShow(r.r, true);
    }
  }

  // the final's pre-race line must sit on one line: step the size down until it fits (layout
  // reads only right after the text changes)
  function fitCount() {
    countFit = false;
    let fs = COUNT_FS;
    countW.style.fontSize = `${fs}px`; countW._fs = fs;
    while (countW.offsetWidth > INNER_W && fs > COUNT_FS_MIN) {
      fs--;
      countW.style.fontSize = `${fs}px`; countW._fs = fs;
    }
    towerDirty = true;
  }

  function updateTower(st, phase, now) {
    let t = st.raceTime;
    if (st.phase === 'finished') { if (clockFrozen == null) clockFrozen = t; t = clockFrozen; }
    else clockFrozen = null;
    setText(clockEl, fmtClock(t));

    // text refreshes at 10 Hz (so the metres do not flicker), but at once when the order changes,
    // so the tower never shows a different place from the tag over the same Gumble
    let ok = st.qualifiedCount | 0;
    for (let i = 0; i < st.order.length; i++) ok = (Math.imul(ok, 31) + st.order[i]) | 0;
    const key = Math.floor(now * 10);
    if (force || key !== listKey || ok !== orderKey) { listKey = key; orderKey = ok; force = false; refreshTower(st, phase); }
    if (countFit) fitCount();
  }

  // ---------------------------------------------------------------- event line
  // The stage decides which events reach this; here only repeats and the trailing count go.
  function onEvent(ev) {
    if (!EVENT_LINE || !ev || !ev.text) return;
    const text = clean(dropCount(clean(ev.text)));
    if (!text) return;
    if ((cur && cur.text === text) || (pending && pending.text === text)) return;
    for (const r of recent) if (r.text === text && lastNow - r.t < EV_REPEAT && lastNow >= r.t) return;
    const chipId = ev.botId != null && ev.botId >= 0 && ev.botId < N ? ev.botId : -1;
    pending = { text, chipId, at: -1 }; // the newest waiting event wins
  }

  function updateEvent(phase, now) {
    if (phase !== 'race') { cur = null; pending = null; setShow(evEl, false); return; }
    if (pending) {
      if (pending.at < 0) pending.at = now;
      if (now - pending.at > EV_STALE || now < pending.at) pending = null;
    }
    if (pending) {
      const age = cur ? now - cur.t0 : Infinity;
      if (!cur || age >= EV_REPLACE || age < 0) {
        cur = { text: pending.text, chipId: pending.chipId, t0: now };
        pending = null;
        recent = recent.filter((r) => now - r.t < EV_REPEAT && now >= r.t);
        recent.push({ text: cur.text, t: now });
        setText(evTxt, cur.text);
        setShow(evChip, cur.chipId >= 0);
        if (cur.chipId >= 0) setChip(evChip, cols[cur.chipId]);
      }
    }
    if (cur && (now - cur.t0 >= EV_MAX || now < cur.t0)) cur = null;
    if (!cur) { setShow(evEl, false); return; }
    setShow(evEl, true);
    const age = now - cur.t0;
    const a = easeOut(age / EV_IN);
    const op = Math.min(a, clamp01((EV_MAX - age) / EV_OUT));
    setOp(evEl, op.toFixed(3));
    setTf(evEl, `translate3d(0,${((1 - a) * 10).toFixed(1)}px,0)`);
  }

  // ---------------------------------------------------------------- countdown numeral
  function updateCountdown(st, phase, now) {
    let label = '';
    if (phase === 'countdown' && st.phase === 'countdown') {
      label = String(Math.min(3, Math.max(1, Math.ceil((st.countdown ?? 0) - 1e-6))));
    } else if (phase === 'race' && st.phase === 'race' && st.raceTime < GO_S) label = 'Go'; // gone at 0.9 s, no fade
    if (label !== numLabel || now < numT0) {
      numLabel = label; numT0 = now;
      setText(numEl, label);
      setCls(numEl, label === 'Go' ? 'rh-num is-go' : 'rh-num');
    }
    if (!label) { setShow(numEl, false); return; }
    setShow(numEl, true);
    const s = NUM_FROM - (NUM_FROM - 1) * easeOut((now - numT0) / NUM_SETTLE);
    setTf(numEl, `scale(${s.toFixed(3)})`);
  }

  // ---------------------------------------------------------------- cut call
  function updateCut(fr, phase, now) {
    const c = phase === 'cut' ? fr.cut : null;
    const pk = c?.pick;
    const key = c ? `${c.headline ?? ''}|${c.sub ?? ''}|${pk ? `${pk.good ? 1 : 0}${pk.text}` : ''}` : '';
    if (key !== cutKey || now < cutT0) {
      cutKey = key; cutT0 = now;
      if (c) {
        setText(cutH, clean(c.headline));
        setText(cutS, c.sub ? clean(c.sub) : ''); setShow(cutS, !!c.sub);
        setShow(cutP, !!pk?.text);
        if (pk?.text) { setText(cutPTxt, clean(pk.text)); setCls(cutPSq, 'rh-cut-p-sq' + (pk.good ? ' is-in' : ' is-out')); }
      }
    }
    if (!c) { setShow(cutEl, false); return; }
    setShow(cutEl, true);
    const a = easeOut((now - cutT0) / CUT_IN);
    setOp(cutEl, a.toFixed(3));
    setTf(cutEl, `translate3d(0,${((1 - a) * 14).toFixed(1)}px,0)`);
  }

  // ---------------------------------------------------------------- name tags
  function updateTags(fr, st) {
    const w = fr.width || root.clientWidth, h = fr.height || root.clientHeight;
    const cam = fr.camera, view = fr.view;
    const ks = root.style.getPropertyValue('--k');
    if (ks !== kStr || !(k > 0)) {
      kStr = ks;
      k = parseFloat(ks) || Math.min(w / 1280, h / 720) || 1;
      tagLayer.style.fontSize = `${(TAG_FS * k).toFixed(2)}px`;
    }
    if (!kStr) { // no --k on the stage: follow the stage size
      const k2 = Math.min(w / 1280, h / 720) || 1;
      if (Math.abs(k2 - k) > 1e-4) { k = k2; tagLayer.style.fontSize = `${(TAG_FS * k).toFixed(2)}px`; }
    }
    const fs = TAG_FS * k, th = TAG_H_EM * fs, pad = 4 * k;

    // the tower in real pixels (the design space is centred in the stage)
    if (towerDirty) { towerH = tower.offsetHeight; towerDirty = false; }
    const ox = (w - 1280 * k) / 2, oy = (h - 720 * k) / 2;
    const tx0 = ox + 24 * k - pad, ty0 = oy + 24 * k - pad, tx1 = ox + (24 + 252) * k + pad, ty1 = oy + (24 + towerH) * k + pad;

    // exactly the Gumbles the stage lists, in priority order: the pick, then better places
    kindOf.fill(0); pickTag.fill(0); drawn.fill(0);
    if (fr.tags) for (const t of fr.tags) {
      if (!t || !(t.id >= 0 && t.id < N)) continue;
      kindOf[t.id] = t.kind === 'line' ? 2 : t.kind === 'out' ? 4 : 1;
      if (t.pick) pickTag[t.id] = 1;
    }
    let nc = 0;
    for (let i = 0; i < N; i++) if (kindOf[i]) cand[nc++] = i;
    const prio = (id) => (pickTag[id] ? -1 : st.bots[id]?.place ?? 99);
    for (let i = 1; i < nc; i++) {
      const id = cand[i], pv = prio(id);
      let j = i - 1;
      while (j >= 0 && prio(cand[j]) > pv) { cand[j + 1] = cand[j]; j--; }
      cand[j + 1] = id;
    }

    let placed = 0;
    for (let c = 0; c < nc; c++) {
      const id = cand[c];
      if (!view || !cam || view.botHidden[id]) continue;
      // anchor: the top of the head; the pointer's tip sits on it, the panel just above the pointer
      // (in the close-up at the cut the lens is at face height: the tag goes above the tallest head, not across the face)
      v3.set(view.botPos[id * 3], view.botPos[id * 3 + 1] + (fr.phase === 'cut' ? TAG_HEAD + 0.95 : TAG_HEAD), view.botPos[id * 3 + 2]).applyMatrix4(cam.matrixWorldInverse);
      if (v3.z > -cam.near) continue; // behind the camera
      v3.applyMatrix4(cam.projectionMatrix);
      const px = (v3.x * 0.5 + 0.5) * w, ay = (-v3.y * 0.5 + 0.5) * h;
      const py = ay - TAG_POINT * k; // bottom edge of the panel
      const tg = tags[id], isPick = pickTag[id] === 1;
      const tw = (tg.wEm + (isPick ? TAG_YOU_EM : 0)) * fs;
      const x0 = px - tw / 2, x1 = px + tw / 2, y0 = py - th, y1 = ay;
      if (x0 < 0 || x1 > w || y0 < 0 || y1 > h) continue;               // off screen
      if (x1 > tx0 && x0 < tx1 && y1 > ty0 && y0 < ty1) continue;       // on the tower
      let hit = false;
      for (let j = 0; j < placed; j++) {
        const o = j * 4;
        if (x1 > boxes[o] && x0 < boxes[o + 2] && y1 > boxes[o + 1] && y0 < boxes[o + 3]) { hit = true; break; }
      }
      // overlaps a stronger tag: dropped this frame, never moved off its Gumble. The pick is placed
      // first, so it never gives way; the others give way to it.
      if (hit && !isPick) continue;
      const o = placed++ * 4;
      boxes[o] = x0; boxes[o + 1] = y0; boxes[o + 2] = x1; boxes[o + 3] = y1;

      const b = st.bots[id], p = b?.place ?? 0;
      setText(tg.sq, String(p));
      setCls(tg.sq, 'rh-tag-sq' + (kindOf[id] === 4 ? ' sq-out' : chipCls(b, p)));
      setCls(tg.el, 'rh-tag' + (isPick ? ' is-pick' : ''));
      setShow(tg.you, isPick);
      setTf(tg.el, `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-50%,-100%)`);
      setShow(tg.el, true);
      drawn[id] = 1;
    }
    for (let i = 0; i < N; i++) if (!drawn[i]) setShow(tags[i].el, false);
  }

  // ---------------------------------------------------------------- frame
  function update(fr) {
    const phase = fr?.phase ?? 'hidden';
    const on = visible && phase !== 'hidden' && !!fr.state && N > 0;
    setShow(layer, on);
    if (!on) { lastPhase = phase; return; }
    const st = fr.state, now = fr.now ?? 0;
    lastNow = now;
    const pk = fr.pickId ?? -1;
    if (pk !== pickId) { pickId = pk; force = true; }
    if (phase !== lastPhase) force = true;
    lastPhase = phase;

    updateTower(st, phase, now);
    updateEvent(phase, now);
    updateCountdown(st, phase, now);
    updateCut(fr, phase, now);
    updateTags(fr, st);
  }

  function setVisible(v) {
    visible = !!v;
    if (!visible) setShow(layer, false);
  }

  function destroy() {
    layer.remove();
    tags = []; recent = []; cur = null; pending = null; N = 0;
  }

  return { el: layer, setRound, update, onEvent, setVisible, destroy };
}
