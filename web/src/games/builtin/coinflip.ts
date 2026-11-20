// Built-in placeholder renderer for the runner's `coinflip` channel: a flat two-lane race seen from
// the side. Implements the GameHandle seam exactly like a real game would.
import type { GameHandle } from '../types';
import { clamp, easeOut, lerp, stage, theme, type Stage, type Theme } from './kit';

interface Racer { id: string; name: string; from: number; to: number; t0: number; stumbleAt: number }
const DUR = 200; // ms between position updates

export function mount(el: HTMLElement): GameHandle {
  let th: Theme = theme();
  let racers: Racer[] = [];
  let length = 110;
  let mode: 'idle' | 'lobby' | 'race' | 'done' = 'idle';
  let winnerId: string | null = null;
  let highlightId: string | null = null;
  let camera = 'follow';
  let camC = 55, camSpan = 126;

  const pos = (r: Racer, now: number) => lerp(r.from, r.to, easeOut((now - r.t0) / DUR));
  const setEntrants = (es: { id: string; name: string }[]) => {
    racers = es.slice(0, 2).map((e) => ({ id: e.id, name: e.name, from: 0, to: 0, t0: 0, stumbleAt: -1e9 }));
  };

  function applyEvent(ev: { type: string; data?: any }, live: boolean) {
    const now = performance.now();
    const d = ev.data ?? {};
    if (ev.type === 'start') {
      if (d.length) length = d.length;
      for (const r of racers) r.from = r.to = d.positions?.[r.id] ?? 0;
      mode = 'race';
      winnerId = null;
    } else if (ev.type === 'pos' || ev.type === 'finish') {
      if (ev.type === 'finish') {
        winnerId = d.winnerId ?? null;
        mode = 'done';
      } else if (mode !== 'done') mode = 'race';
      for (const r of racers) {
        const p = d.positions?.[r.id];
        if (typeof p !== 'number') continue;
        r.from = live ? pos(r, now) : p;
        r.to = p;
        r.t0 = now;
      }
    } else if (ev.type === 'stumble' && live) {
      const r = racers.find((x) => x.id === d.entrantId);
      if (r) r.stumbleAt = now;
    }
  }

  function onFeed(raw: unknown) {
    const m = raw as any;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'snapshot') {
      th = theme();
      winnerId = null;
      if (m.match?.entrants) setEntrants(m.match.entrants);
      length = m.match?.meta?.trackLength ?? 110;
      mode = m.match && m.phase !== 'intermission' ? 'lobby' : 'idle';
      for (const ev of m.recentEvents ?? []) applyEvent(ev, false);
    } else if (m.type === 'match') {
      setEntrants(m.entrants ?? []);
      length = m.meta?.trackLength ?? 110;
      mode = 'lobby';
      winnerId = null;
    } else if (m.type === 'event') applyEvent(m.event, true);
  }

  function frame(s: Stage, now: number, dt: number) {
    const { ctx, w, h } = s;
    const u = Math.min(w, h * 1.78) / 1000;
    const ps = racers.map((r) => pos(r, now));
    const lead = ps.length ? Math.max(...ps) : 0;
    const wide = length + 16;
    let tc = length / 2, ts = wide;
    if (camera === 'follow') {
      if (mode === 'race') (tc = clamp(lead + 2, 15, length - 6)), (ts = 40);
      else if (mode === 'done') (tc = length - 8), (ts = 46);
      else (tc = 9), (ts = 40);
    }
    camC = lerp(camC, tc, 1 - Math.exp(-dt * 3));
    camSpan = lerp(camSpan, ts, 1 - Math.exp(-dt * 2.5));
    const zoom = Math.sqrt(wide / camSpan);
    const X = (p: number) => w / 2 + ((p - camC) / camSpan) * w * 0.94;

    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, w, h);
    const laneH = h * 0.22;
    const lanes = [h * 0.36, h * 0.62];
    for (const [i, y] of lanes.entries()) {
      ctx.fillStyle = th.raised;
      ctx.fillRect(0, y, w, laneH);
      ctx.fillStyle = th.sides[i]!;
      ctx.fillRect(0, y + laneH - 2, w, 2);
    }
    // distance marks
    ctx.font = `${th.numWeight} ${Math.round(Math.max(10, 12 * u))}px ${th.num}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let p = 10; p < length; p += 10) {
      const x = X(p);
      ctx.fillStyle = th.line;
      ctx.fillRect(x, lanes[0]!, 1, lanes[1]! + laneH - lanes[0]!);
      ctx.fillStyle = th.text3;
      ctx.fillText(String(p), x, lanes[1]! + laneH + 8 * u);
    }
    // start and finish
    ctx.fillStyle = th.text2;
    ctx.fillRect(X(0) - 1, lanes[0]!, 2, lanes[1]! + laneH - lanes[0]!);
    const sq = Math.max(6, 8 * u * zoom);
    for (let y = lanes[0]!, k = 0; y < lanes[1]! + laneH; y += sq, k++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (k + j) % 2 ? th.text : th.bg;
        ctx.fillRect(X(length) + j * sq, y, sq, Math.min(sq, lanes[1]! + laneH - y));
      }
    }
    // racers
    racers.forEach((r, i) => {
      const since = now - r.stumbleAt;
      const jx = since < 400 ? Math.sin(since / 20) * 4 * u * (1 - since / 400) : 0;
      const x = X(ps[i]!) + jx;
      const y = lanes[i]! + laneH / 2;
      const R = Math.min(laneH * 0.32, 15 * u * zoom);
      const lost = mode === 'done' && winnerId && winnerId !== r.id;
      ctx.fillStyle = lost ? th.text3 : th.sides[i]!;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
      if (highlightId === r.id || winnerId === r.id) {
        ctx.strokeStyle = winnerId === r.id ? th.accent : th.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, R + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.font = `700 ${Math.round(Math.max(11, 13 * u))}px ${th.ui}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = lost ? th.text3 : th.text;
      ctx.fillText(r.name, x, y - R - 8);
    });
    // progress rail
    if (racers.length && mode !== 'idle') {
      const mw = Math.min(w * 0.4, 420 * u), mx = (w - mw) / 2, my = h * 0.16;
      ctx.fillStyle = th.line;
      ctx.fillRect(mx, my - 1, mw, 2);
      racers.forEach((r, i) => {
        ctx.fillStyle = th.sides[i]!;
        ctx.beginPath();
        ctx.arc(mx + (clamp(ps[i]!, 0, length) / length) * mw, my, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  const s = stage(el, frame);
  return {
    onFeed,
    cameras: ['follow', 'wide'],
    setCamera(m: string) {
      camera = m === 'wide' ? 'wide' : 'follow';
    },
    highlight(id) {
      highlightId = id;
    },
    destroy: () => s.destroy(),
  };
}
