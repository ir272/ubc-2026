// The options sheet. cast.html?group=heavy|fast|reach|grapple|demo|all&mode=line|mass
// Each character file pushes { id, group, name, kind, look, does: [[name, what]], draw(ink, pose) }.
(function () {
  const q = new URLSearchParams(location.search);
  const group = q.get('group') || 'all';
  const mode = q.get('mode') === 'mass' ? 'mass' : 'line';
  const GROUPS = { heavy: 'Heavy hitters', fast: 'Fast and light', reach: 'Long reach and spells', grapple: 'Grabbers', demo: 'Kit test', monsters: 'Classic monsters', all: 'All candidates' };
  const sheet = document.getElementById('sheet');
  const head = document.createElement('header');
  head.innerHTML = `<h1>${GROUPS[group] || group}</h1><span>${mode === 'mass' ? 'Solid ink' : 'Line ink'}. Names are working names.</span>`;
  sheet.appendChild(head);
  const list = window.CAST.filter((c) => group === 'all' ? c.group !== 'demo' : c.group === group);

  function canvas(w, h) {
    const c = document.createElement('canvas');
    const k = 2; // draw at 2x so the pen stays crisp
    c.width = w * k; c.height = h * k; c.style.width = w + 'px'; c.style.height = h + 'px';
    const ctx = c.getContext('2d'); ctx.scale(k, k);
    return { c, ctx };
  }
  function ground(ctx, x0, x1, y, seed) {
    const ink = Ink.makeInk(ctx, 'line');
    ink.line([[x0, y], [x1, y]], { w: 1.4, seed, alpha: 0.5, taper: 0.9 });
  }
  function put(ctx, c, pose, x, y, s, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
    try { c.draw(Ink.makeInk(ctx, mode), pose); } catch (e) { console.error(c.id, pose, e); }
    ctx.restore();
  }
  for (const c of list) {
    const row = document.createElement('div'); row.className = 'row';
    const a = canvas(430, 440); ground(a.ctx, 40, 390, 400, 3); put(a.ctx, c, 'stand', 215, 400, 1.6);
    const b = canvas(760, 440); ground(b.ctx, 30, 730, 400, 5); put(b.ctx, c, 'ability', 250, 400, 1.45);
    const g = canvas(250, 440); ground(g.ctx, 10, 240, 400, 7); put(g.ctx, c, 'stand', 80, 400, 0.5); put(g.ctx, c, 'stand', 180, 400, 0.5, true);
    const t = document.createElement('div'); t.className = 'txt';
    t.innerHTML = `<h2>${c.name}</h2><div class="kind">${c.kind}</div><p>${c.look}</p><dl>${c.does.map(([n, w]) => `<dt>${n}</dt><dd>${w}</dd>`).join('')}</dl>`;
    row.append(a.c, b.c, g.c, t); sheet.appendChild(row);
  }
  document.body.dataset.ready = '1';
})();
