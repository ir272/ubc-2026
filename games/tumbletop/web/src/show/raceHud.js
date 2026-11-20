// Tumbletop race display: the DOM layer over the 3D race. Everything on it is about the cut line:
// who is through, who is on the edge right now, and where the viewer's pick is. It is drawn in the
// site's look (ink line on dark paper, see theme.css and ink.js).
//
// In the 1280x720 design space (.tt-fit, scaled by --k):
//   the table, (24, 24), 252 wide: a ruled panel with the round name and race clock, then the
//   places in order (the owner's pick of three layouts, 2026-11-20)
//        N <= 8: every Gumble; N > 8 before anyone finishes: leader, places Q-1 and Q, the line,
//        Q+1 and Q+2, the pick; N > 8 from the first finisher: places 1 to Q+2 plus the pick
//      the cut is a gold ruled line after place Q with "Top 8 go through" written on it
//   top centre, y 56      countdown 3, 2, 1 in a ruled box, then a gold "Go" for the first 0.9 s
// In real pixels (outside the design space, sized from --k):
//   name tags over exactly the Gumbles the stage lists in frame.tags, each with a pointer whose tip
//   sits on the top of its Gumble's head (feet + 1.05 m). A tag that would overlap a stronger one
//   is dropped for that frame, never moved away from its Gumble; the pick's tag never gives way.
//
// Colour: a place number is green pencil when it is through or above the line, coral when it is
// below the line or out, plain ink in the final. Gold is the viewer's pick and the cut line.
//
// Motion: no CSS transitions or animations anywhere. Every offset, scale and opacity is computed
// from frame.now (or sim time) and written inline, so captures in virtual time are deterministic.
// DOM writes happen only when a cached value changes; nothing rebuilds innerHTML per frame. The
// rows refresh at 10 Hz of `now` (and at once on phase, pick or order changes), always as
// one consistent snapshot, so a row is never drawn on the wrong side of the line.
import * as THREE from 'three';
import './raceHud.css';
import { inkFrame, inkSvg, inkSet, rule, loopBox, check, plate, swatchSvg, PEN } from './ink.js';

const ROW_GAP = 2, DOTS_H = 12, LINE_H = 24;
const ROW_H = 28, ROW_H_TIGHT = 25, ROW_W = 216;   // row heights and width
const FULL_MAX = 8;                        // up to this many starters the table lists everyone
const ROW_POOL = 12, DOT_POOL = 3;
const ROWS_AFTER = 1.5;                    // rows appear this long into the race
const NUM_SETTLE = 0.16, NUM_FROM = 1.12, GO_S = 0.9;
const TAG_FS = 16, TAG_H_EM = 1.75;        // tag font size (design px) and height in em
const TAG_HEAD = 1.05;                     // metres from the feet to the top of the head
const TAG_POINT = 8;                       // pointer height (design px, times k): its tip is on the head

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const css = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c || '#888888');
const fmtClock = (t) => {
  t = Math.max(0, t || 0);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};

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
const setShow = (n, on) => { if (n._on !== on) { n._on = on; n.style.display = on ? '' : 'none'; } };

export function createRaceHud(root) {
  const layer = el('div', 'tt-layer rh', root);
  const tagLayer = el('div', 'rh-tags', layer);   // real pixels, under the design space
  const fit = el('div', 'tt-fit', layer);

  // ---------------------------------------------------------------- the standings
  const tower = el('div', 'rh-tower', fit);
  tower.dataset.seed = 'tt-standings';
  tower.dataset.ink = 'box';
  const head = el('div', 'rh-head', tower);
  const roundEl = el('span', 'rh-round', head);
  const clockEl = el('span', 'rh-clock', head, '');

  const list = el('div', 'rh-list', tower);
  const pickEl = el('div', 'rh-pick', list);
  const pickSvg = inkSvg(pickEl);
  setShow(pickEl, false);
  const rows = [];
  for (let i = 0; i < ROW_POOL; i++) {
    const r = el('div', 'rh-row', list);
    const sq = el('span', 'rh-sq', r);
    const chip = el('span', 'rh-chip', r);
    const nm = el('span', 'rh-name', r);
    const tick = el('span', 'rh-tick', r);
    tick.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" style="overflow:visible"><path d="${check(7, 7, 12, 'tick' + i)}" fill="var(--ink-green)"/></svg>`;
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
  const lineSvg = inkSvg(line);
  inkSet(lineSvg, [{ d: rule(-2, 21, ROW_W + 2, 21, 'tt-cut', PEN.bold), fill: 'var(--ink-gold)' }]);
  const lineLbl = el('span', 'rh-line-label', line);
  setShow(line, false);

  // ---------------------------------------------------------------- countdown numeral
  const numWrap = el('div', 'rh-num-wrap', fit);
  const numEl = el('div', 'rh-num', numWrap);
  numEl.dataset.ink = 'box';
  const numTxt = el('span', '', numEl);
  setShow(numEl, false);

  // ---------------------------------------------------------------- state
  let N = 0, Q = 1;
  let names = [], cols = [], swatches = [];
  let tags = [];                    // one per slot id: { el, sq, wEm }
  let kindOf = new Uint8Array(0);   // per frame: 0 untagged, 1 plain, 2 line, 4 out
  let pickTag = new Uint8Array(0);  // per frame: 1 if the stage marked this tag as the pick
  let drawn = new Uint8Array(0);
  let cand = new Int16Array(0);
  let boxes = new Float32Array(0);  // placed tag boxes x0, y0, x1, y1
  const marks = new Uint8Array(64); // places to show (index = place)
  const shown = new Int16Array(ROW_POOL);
  let visible = true, lastPhase = '', listKey = -1, force = true;
  let pickId = -1;
  let clockFrozen = null;
  let towerBox = { x: 24, y: 24, w: 244, h: 0 }, towerDirty = true;
  let kStr = null, k = 1;
  let numLabel = '', numT0 = 0;
  let pickKey = '';
  const v3 = new THREE.Vector3();

  function setRound({ round, bots }) {
    N = bots.length;
    Q = Math.max(1, round?.qualify ?? 1);
    names = bots.map((b, i) => b.name ?? `Gumble ${i + 1}`);
    cols = bots.map((b) => [css(b.colors?.[0]), css(b.colors?.[1] ?? b.colors?.[0])]);
    swatches = cols.map((c, i) => swatchSvg(c[0], c[1], 14, 18, `sw${i}`));
    setText(roundEl, round?.name ?? '');
    const note = Q > 1 && Q < N ? `Top ${Q} go through` : '';
    setText(lineLbl, note);

    // name tags: a hand-cut paper plate inside a loop (gold for the pick), place number and name
    tagLayer.textContent = '';
    const digits = N >= 10 ? 2 : 1;
    tags = names.map((name, i) => {
      const t = el('div', 'rh-tag', tagLayer);
      const wEm = 0.6 + digits * 0.6 + 0.4 + name.length * 0.56 + 0.6;
      const W = wEm * TAG_FS, H = TAG_H_EM * TAG_FS;
      t.style.width = `${wEm.toFixed(3)}em`;
      t.innerHTML = `<svg viewBox="0 0 ${W.toFixed(1)} ${H}" preserveAspectRatio="none" aria-hidden="true">`
        + `<path d="${plate(0, 0, W, H, 'tag' + i)}" fill="var(--ink-paper)"/>`
        + `<path class="lp-ink" d="${loopBox(0, 0, W, H, 9, 'tag' + i, PEN.rule)}" fill="var(--ink)"/>`
        + `<path class="lp-gold" d="${loopBox(0, 0, W, H, 9, 'tag' + i, PEN.bold)}" fill="var(--ink-gold)"/></svg>`;
      const sq = el('span', 'rh-tag-sq', t);
      el('span', 'rh-tag-name', t, name);
      setShow(t, false);
      return { el: t, sq, wEm };
    });
    kindOf = new Uint8Array(N);
    pickTag = new Uint8Array(N);
    drawn = new Uint8Array(N);
    cand = new Int16Array(N);
    boxes = new Float32Array(N * 4);

    for (const r of rows) { r.id = -1; setShow(r.r, false); }
    numLabel = ''; setShow(numEl, false);
    clockFrozen = null;
    listKey = -1; force = true; towerDirty = true;
  }

  // One meaning for place numbers everywhere (rows and tags): green = through or above the line,
  // coral = below the line or out, plain ink in the final.
  function sqCls(b, p) {
    const s = b?.status;
    if (Q === 1) return ' sq-plain';
    if (s === 'qualified') return '';
    if (s === 'eliminated') return ' sq-out';
    return p <= Q ? '' : ' sq-out';
  }

  function drawPick(w, h) {
    const key = `${w}x${h}`;
    if (key === pickKey) return;
    pickKey = key;
    pickEl.style.width = `${w}px`; pickEl.style.height = `${h}px`; // (a zero-size svg draws nothing)
    inkSet(pickSvg, [{ d: loopBox(-5, 1, w + 8, h - 2, 9, 'tt-pick', PEN.bold), fill: 'var(--ink-gold)' }]);
  }

  // ---------------------------------------------------------------- the standings
  let orderKey = 0;
  function refresh(st, phase) {
    const cutPhase = phase === 'cut';
    const finished = st.phase === 'finished' || cutPhase;
    const pre = !finished && (phase === 'countdown' || st.phase !== 'race' || (st.raceTime ?? 0) < ROWS_AFTER);
    const full = N <= FULL_MAX;
    // Round One opens up from the first finisher to the end of the round (cut included)
    const open = !full && (st.qualifiedCount > 0 || finished);
    const hasLine = Q > 1 && Q < N;

    // which places
    const order = st.order;
    const NN = Math.min(N, order.length, marks.length - 2);
    marks.fill(0);
    if (pre) { /* no rows yet */ }
    else if (full) for (let p = 1; p <= NN; p++) marks[p] = 1;
    else if (open) for (let p = 1; p <= Math.min(NN, Q + 2); p++) marks[p] = 1;
    else {
      marks[1] = 1;
      for (let p = Q - 1; p <= Q + 2; p++) if (p >= 1 && p <= NN) marks[p] = 1;
    }
    if (!pre && pickId >= 0 && pickId < N) { const pp = st.bots[pickId]?.place ?? 0; if (pp >= 1 && pp <= NN) marks[pp] = 1; }
    let nShow = 0;
    for (let p = 1; p <= NN && nShow < ROW_POOL; p++) if (marks[p]) shown[nShow++] = p;

    // layout, in place order: rows, dots between non-adjacent places, the line after place Q
    const tight = open;
    const rh = tight ? ROW_H_TIGHT : ROW_H;
    let pos = 0, prev = 0, nDots = 0, linePos = -1, pickPos = -1;
    for (let i = 0; i < nShow; i++) {
      const p = shown[i];
      if (prev && p > prev + 1 && nDots < DOT_POOL) {
        const d = dots[nDots++];
        setShow(d, true);
        setTf(d, `translate3d(0,${pos}px,0)`);
        pos += DOTS_H + ROW_GAP;
      }
      setTf(rows[i].r, `translate3d(0,${pos}px,0)`);
      if (order[p - 1] === pickId) pickPos = pos;
      pos += rh + ROW_GAP;
      if (hasLine && p === Q) { linePos = pos; pos += LINE_H + ROW_GAP; }
      prev = p;
    }
    for (let i = nDots; i < DOT_POOL; i++) setShow(dots[i], false);
    setShow(line, linePos >= 0);
    if (linePos >= 0) setTf(line, `translate3d(0,${linePos}px,0)`);
    setCls(list, tight ? 'rh-list is-tight' : 'rh-list');
    setShow(pickEl, pickPos >= 0);
    if (pickPos >= 0) { drawPick(ROW_W, rh); setTf(pickEl, `translate3d(0,${pickPos}px,0)`); }

    const listH = `${Math.max(0, pos - ROW_GAP)}px`;
    if (list._h !== listH) { list._h = listH; list.style.height = listH; towerDirty = true; }
    setShow(list, nShow > 0);

    for (let i = 0; i < ROW_POOL; i++) {
      const r = rows[i];
      if (i >= nShow) { setShow(r.r, false); continue; }
      const p = shown[i], id = order[p - 1], b = st.bots[id];
      if (r.id !== id) { r.id = id; setText(r.nm, names[id] ?? ''); r.chip.innerHTML = swatches[id] ?? ''; }
      const isPick = id === pickId;
      const status = b?.status ?? 'racing';
      const racing = status === 'racing' || status === 'respawning'; // a respawning Gumble reads like a racing one
      let out = false, txt = '';
      let sq = sqCls(b, p);
      // A row says a place and a name. The only words beside it: "your pick" and "out".
      if (Q === 1) { if (isPick) txt = 'your pick'; }
      else if (cutPhase) {
        if (p <= Q) sq = '';
        else { out = true; sq = ' sq-out'; txt = 'out'; }
        if (isPick) txt = 'your pick';
      } else {
        out = status === 'eliminated' || (racing && p > Q);
        if (isPick) txt = 'your pick';
        else if (status === 'eliminated') txt = 'out';
      }
      const through = Q > 1 && (status === 'qualified' || (cutPhase && p <= Q));
      setCls(r.r, 'rh-row' + (out ? ' is-out' : '') + (isPick ? ' is-pick' : '') + (through && !isPick ? ' is-in' : ''));
      setCls(r.sq, 'rh-sq' + sq);
      setText(r.sq, String(p));
      setText(r.st, txt);
      setShow(r.r, true);
    }
  }

  function updateTower(st, phase, now) {
    // the clock runs from Go; when the round is over the word takes its place
    let t = st.raceTime;
    if (st.phase === 'finished') { if (clockFrozen == null) clockFrozen = t; t = clockFrozen; }
    else clockFrozen = null;
    const over = st.phase === 'finished' || phase === 'cut';
    const txt = over ? 'over' : st.phase === 'race' ? fmtClock(t) : '';
    if (clockEl._t !== txt) { setText(clockEl, txt); towerDirty = true; }

    // rows refresh at 10 Hz, but at once when the order changes, so the standings never show a
    // different place from the tag over the same Gumble
    let ok = st.qualifiedCount | 0;
    for (let i = 0; i < st.order.length; i++) ok = (Math.imul(ok, 31) + st.order[i]) | 0;
    const key = Math.floor(now * 10);
    if (force || key !== listKey || ok !== orderKey) { listKey = key; orderKey = ok; force = false; refresh(st, phase); }

    if (towerDirty) {
      towerDirty = false;
      inkFrame(tower);
      towerBox = { x: tower.offsetLeft, y: tower.offsetTop, w: tower.offsetWidth, h: tower.offsetHeight };
    }
  }

  // ---------------------------------------------------------------- countdown numeral
  function updateCountdown(st, phase, now) {
    let label = '';
    if (phase === 'countdown' && st.phase === 'countdown') {
      label = String(Math.min(3, Math.max(1, Math.ceil((st.countdown ?? 0) - 1e-6))));
    } else if (phase === 'race' && st.phase === 'race' && st.raceTime < GO_S) label = 'Go'; // gone at 0.9 s, no fade
    const fresh = label !== numLabel || now < numT0;
    if (fresh) {
      numLabel = label; numT0 = now;
      setText(numTxt, label);
      setCls(numEl, label === 'Go' ? 'rh-num is-go' : 'rh-num');
      numEl.dataset.ink = label === 'Go' ? 'gold' : 'box';
      numEl.dataset.seed = 'num' + label;
    }
    if (!label) { setShow(numEl, false); return; }
    setShow(numEl, true);
    if (fresh) inkFrame(numEl);
    const s = NUM_FROM - (NUM_FROM - 1) * easeOut((now - numT0) / NUM_SETTLE);
    setTf(numEl, `scale(${s.toFixed(3)})`);
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

    // the standings in real pixels (the design space is centred in the stage)
    const ox = (w - 1280 * k) / 2, oy = (h - 720 * k) / 2;
    const tx0 = ox + towerBox.x * k - pad, ty0 = oy + towerBox.y * k - pad;
    const tx1 = ox + (towerBox.x + towerBox.w) * k + pad, ty1 = oy + (towerBox.y + towerBox.h) * k + pad;

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
      // anchor: the top of the head; the pointer's tip sits on it, the plate just above the pointer
      // (in the close-up at the cut the lens is at face height: the tag goes above the tallest head, not across the face)
      v3.set(view.botPos[id * 3], view.botPos[id * 3 + 1] + (fr.phase === 'cut' ? TAG_HEAD + 0.95 : TAG_HEAD), view.botPos[id * 3 + 2]).applyMatrix4(cam.matrixWorldInverse);
      if (v3.z > -cam.near) continue; // behind the camera
      v3.applyMatrix4(cam.projectionMatrix);
      const px = (v3.x * 0.5 + 0.5) * w, ay = (-v3.y * 0.5 + 0.5) * h;
      const py = ay - TAG_POINT * k; // bottom edge of the plate
      const tg = tags[id], isPick = pickTag[id] === 1;
      const tw = tg.wEm * fs;
      const x0 = px - tw / 2, x1 = px + tw / 2, y0 = py - th, y1 = ay;
      if (x0 < 0 || x1 > w || y0 < 0 || y1 > h) continue;               // off screen
      if (x1 > tx0 && x0 < tx1 && y1 > ty0 && y0 < ty1) continue;       // on the standings
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
      setCls(tg.sq, 'rh-tag-sq' + (kindOf[id] === 4 ? ' sq-out' : sqCls(b, p)));
      setCls(tg.el, 'rh-tag' + (isPick ? ' is-pick' : ''));
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
    const pk = fr.pickId ?? -1;
    if (pk !== pickId) { pickId = pk; force = true; }
    if (phase !== lastPhase) { force = true; towerDirty = true; }
    lastPhase = phase;

    updateTower(st, phase, now);
    updateCountdown(st, phase, now);
    updateTags(fr, st);
  }

  function setVisible(v) {
    visible = !!v;
    if (!visible) setShow(layer, false);
  }

  function destroy() {
    layer.remove();
    tags = []; N = 0;
  }

  // (onEvent is kept for the stage's call; the event line was removed: it restated the picture)
  return { el: layer, setRound, update, onEvent() {}, setVisible, destroy };
}
