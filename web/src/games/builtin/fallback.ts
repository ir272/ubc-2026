// Used when a channel has no registered game: entrant names on a flat stage so the page still works.
import type { GameHandle } from '../types';
import { stage, theme, type Stage } from './kit';

export function mount(el: HTMLElement): GameHandle {
  const th = theme();
  let names: string[] = [];
  const frame = (s: Stage) => {
    const { ctx, w, h } = s;
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, w, h);
    const n = Math.max(1, names.length);
    ctx.font = `700 ${Math.round(Math.max(16, w / 30))}px ${th.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    names.forEach((name, i) => {
      ctx.fillStyle = th.sides[i % 3]!;
      ctx.fillText(name, (w * (i + 0.5)) / n, h / 2);
    });
  };
  const s = stage(el, frame);
  return {
    onFeed(raw) {
      const m = raw as any;
      if (m?.type === 'snapshot' || m?.type === 'match') names = (m.match?.entrants ?? m.entrants ?? []).map((e: any) => e.name);
    },
    destroy: () => s.destroy(),
  };
}
