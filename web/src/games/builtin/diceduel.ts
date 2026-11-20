// Built-in placeholder renderer for the runner's `dice-duel` channel: two players, three dice each,
// two rounds. Flat drawing only.
import type { GameHandle } from '../types';
import { clamp, easeOut, easeOutBounce, hash01, roundRect, stage, theme, type Stage, type Theme } from './kit';

interface RoundResult { round: number; rolls: Record<string, number[]>; totals: Record<string, number>; winner: string }
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export function mount(el: HTMLElement): GameHandle {
  let th: Theme = theme();
  let entrants: { id: string; name: string }[] = [];
  let round = 1;
  let state: 'idle' | 'lobby' | 'tumble' | 'landed' = 'idle';
  let tumbleAt = 0;
  let landAt = -1e9;
  let current: RoundResult | null = null;
  const results: RoundResult[] = [];
  let highlightId: string | null = null;

  const reset = (es: { id: string; name: string }[]) => {
    entrants = es.slice(0, 2);
    round = 1;
    state = 'lobby';
    current = null;
    results.length = 0;
  };
  function apply(ev: { type: string; data?: any }, live: boolean) {
    const d = ev.data ?? {};
    if (ev.type === 'round_start') {
      round = d.round ?? round;
      state = 'tumble';
      tumbleAt = performance.now();
      current = null;
    } else if (ev.type === 'roll') {
      const r: RoundResult = { round: d.round, rolls: d.rolls ?? {}, totals: d.totals ?? {}, winner: d.winner };
      round = r.round;
      current = r;
      if (!results.some((x) => x.round === r.round)) results.push(r);
      state = 'landed';
      landAt = live ? performance.now() : -1e9;
    }
  }
  function onFeed(raw: unknown) {
    const m = raw as any;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'snapshot') {
      th = theme();
      if (m.match?.entrants) reset(m.match.entrants);
      else state = 'idle';
      for (const ev of m.recentEvents ?? []) apply(ev, false);
    } else if (m.type === 'match') reset(m.entrants ?? []);
    else if (m.type === 'event') apply(m.event, true);
    else if (m.type === 'window_open' && results.length >= 1) round = results.length + 1;
  }

  function die(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, v: number | null, dim: boolean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = dim ? th.text3 : th.text;
    roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.16);
    ctx.fill();
    if (v) {
      ctx.fillStyle = th.bg;
      for (const [px, py] of PIPS[v] ?? []) {
        ctx.beginPath();
        ctx.arc(px * s * 0.25, py * s * 0.25, s * 0.085, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function frame(s: Stage, now: number) {
    const { ctx, w, h } = s;
    const u = Math.min(w, h * 1.78) / 1000;
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = th.line;
    ctx.fillRect(w / 2, h * 0.12, 1, h * 0.76);
    const landedK = clamp((now - landAt) / 750, 0, 1);
    const done = state === 'landed' && landedK >= 1;
    const D = Math.max(28, 70 * u);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(Math.max(11, 13 * u))}px ${th.ui}`;
    ctx.fillStyle = th.text2;
    ctx.fillText(`Round ${round} of 2`, w / 2, h * 0.07);
    entrants.forEach((e, i) => {
      const cx = w * (i ? 0.75 : 0.25);
      const lose = done && current && current.winner !== 'tie' && current.winner !== e.id;
      const win = done && current?.winner === e.id;
      ctx.font = `700 ${Math.round(Math.max(15, 28 * u))}px ${th.ui}`;
      ctx.fillStyle = lose ? th.text3 : th.sides[i]!;
      ctx.fillText(e.name, cx, h * 0.2);
      const total = current?.totals?.[e.id];
      ctx.font = `${th.numWeight} ${Math.round(Math.max(28, 72 * u))}px ${th.num}`;
      ctx.fillStyle = win ? th.accent : lose ? th.text3 : state === 'landed' ? th.text : th.line;
      const shown = state === 'landed' && total != null ? String(Math.round(total * easeOut(clamp((now - landAt - 500) / 600, 0, 1)))) : '–';
      ctx.fillText(shown, cx, h * 0.36);
      if (highlightId === e.id) {
        ctx.fillStyle = th.text;
        ctx.fillRect(cx - 60 * u, h * 0.86, 120 * u, 2);
      }
      for (let k = 0; k < 3; k++) {
        const seed = i * 3 + k;
        const hx = cx + (k - 1) * D * 1.5;
        const hy = h * 0.66;
        let y = hy, rot = 0, v: number | null = current?.rolls?.[e.id]?.[k] ?? null;
        if (state === 'tumble') {
          const tt = (now - tumbleAt) / 1000;
          y = hy - Math.abs(Math.sin(tt * 7 + seed * 1.3)) * D * 0.6;
          rot = tt * (4 + hash01(seed) * 3) * (seed % 2 ? 1 : -1);
          v = 1 + Math.floor(hash01(seed + Math.floor(now / 90)) * 6);
        } else if (state === 'landed' && v) {
          const k2 = clamp((now - landAt - k * 90) / 650, 0, 1);
          y = hy - (1 - easeOutBounce(k2)) * D * 1.6;
        }
        die(ctx, hx, y, D, rot, v, !!lose);
      }
    });
    if (done && current?.winner === 'tie') {
      ctx.font = `700 ${Math.round(Math.max(14, 22 * u))}px ${th.ui}`;
      ctx.fillStyle = th.text;
      ctx.fillText('Tie', w / 2, h * 0.36);
    }
  }

  const s = stage(el, frame);
  return {
    onFeed,
    highlight(id) {
      highlightId = id;
    },
    destroy: () => s.destroy(),
  };
}
