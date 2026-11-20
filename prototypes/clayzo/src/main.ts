// Plays the Clayzo moments with the WebGL player. `?sheet=<id>` shows ten still frames of one piece, which is
// how the motion was checked without Clayzo's own render-frame command (that one needs a Clayzo sign-in).
import { createPlayer } from '@clayzo/webgl-player';

type Doc = Parameters<typeof createPlayer>[0]['document'];
const PIECES = ['payout', 'bet-placed', 'chat-sent', 'watch-and-bet'] as const;
const app = document.getElementById('app')!;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const load = async (id: string) => (await (await fetch(`/animations/${id}.json`)).json()) as Doc;

async function gallery() {
  const grid = document.createElement('div');
  grid.className = 'grid';
  app.append(grid);
  for (const id of PIECES) {
    const doc = await load(id);
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 300 / doc.canvas.width);
    canvas.style.width = `${doc.canvas.width * scale}px`;
    canvas.style.height = `${doc.canvas.height * scale}px`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', doc.design?.accessibilityLabel ?? doc.name);
    const again = document.createElement('button');
    again.textContent = doc.name;
    fig.append(canvas, again);
    grid.append(fig);
    const player = await createPlayer({ canvas, document: doc, loop: false, pauseWhenOffscreen: false });
    const run = async () => {
      if (reduce) return player.seek(doc.timing.durationTicks - 4); // reduced motion: the settled frame only
      await player.seek(0);
      player.play();
    };
    again.addEventListener('click', run);
    canvas.addEventListener('click', run);
    void run();
  }
}

async function sheet(id: string) {
  const doc = await load(id);
  const wrap = document.createElement('div');
  wrap.className = 'sheet';
  app.append(wrap);
  const total = doc.timing.durationTicks / 240;
  const n = 10;
  for (let i = 0; i < n; i++) {
    // denser at the start, where the action is
    const s = total * Math.pow((i + 0.5) / n, 1.5);
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.style.width = '220px';
    canvas.style.height = `${(220 * doc.canvas.height) / doc.canvas.width}px`;
    const cap = document.createElement('figcaption');
    cap.textContent = `${s.toFixed(2)} s`;
    fig.append(canvas, cap);
    wrap.append(fig);
    const player = await createPlayer({ canvas, document: doc, loop: false, pauseWhenOffscreen: false, releaseWhenOffscreen: false });
    await player.seek(Math.round(s * 60) * 4);
  }
  document.title = 'sheet ready';
}

const q = new URLSearchParams(location.search).get('sheet');
void (q ? sheet(q) : gallery());
