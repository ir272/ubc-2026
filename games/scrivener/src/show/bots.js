// Bot configs. Any OpenRouter model id may enter: nothing here names a model or a provider.
// A bot is { id, name, model, instructions, look: { accent }, voice? }.

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const FALLBACK_ACCENTS = ['#c4612f', '#2f8a78', '#3f6c9c', '#a8842a', '#7a5a8c', '#6b7f3a'];

export function normaliseBots(list) {
  if (!Array.isArray(list)) throw new Error('bots.json must be an array of bot configs');
  const seen = new Set();
  const out = [];
  list.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const id = String(raw.id || '').toLowerCase();
    if (!ID_RE.test(id) || seen.has(id)) throw new Error(`bots.json: bad or duplicate id at index ${i}`);
    seen.add(id);
    const look = raw.look && typeof raw.look === 'object' ? raw.look : {};
    out.push({
      id,
      name: String(raw.name || id).slice(0, 14),
      model: String(raw.model || 'mock'),
      instructions: String(raw.instructions || '').slice(0, 400),
      look: { ...look, accent: /^#[0-9a-f]{6}$/i.test(look.accent || '') ? look.accent : FALLBACK_ACCENTS[i % FALLBACK_ACCENTS.length] },
      voice: raw.voice || null,
    });
  });
  if (out.length < 2) throw new Error('bots.json needs at least two bots');
  return out;
}

// Every pairing in turn, so the channel cycles the whole field; the opener alternates.
export function pairings(bots) {
  const pairs = [];
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) pairs.push([bots[i], bots[j]]);
  return pairs;
}

export function pairFor(bots, matchNo) {
  const pairs = pairings(bots);
  const [a, b] = pairs[(matchNo - 1) % pairs.length];
  const round = Math.floor((matchNo - 1) / pairs.length);
  return round % 2 === 0 ? [a, b] : [b, a];
}

// The short model name a viewer sees: the part after the provider.
export function modelLabel(model) {
  const s = String(model || '');
  return s.includes('/') ? s.slice(s.indexOf('/') + 1) : s;
}
