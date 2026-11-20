// Writes bots.json from show/personas/*.json. Keeps any real `model` already set in bots.json, else
// takes it from .cache/models.json ({ botId: modelId }). Missing personas get placeholders.
//   node tools/roster.ts

import { BOTS_JSON, readJson, writeJson } from '../show/paths.ts';
import { loadPersonas, loadRoster, MODELS_JSON } from '../show/roster.ts';
import type { Bot } from '../show/types.ts';

const old = new Map((readJson<Bot[]>(BOTS_JSON) ?? []).map((b) => [b.id, b]));
const models = readJson<Record<string, string>>(MODELS_JSON) ?? {};
const personas = new Map(loadPersonas().map((b) => [b.id, b]));
// personas first (fresh text), then any extra bot only bots.json has
const merged = loadRoster({ botsJson: '/nonexistent', castDir: null, modelsJson: null, log: (s) => console.log(s) });
for (const [id, b] of old) if (!merged.some((m) => m.id === id)) merged.push(b);
const out = merged.map((b) => {
  const prev = old.get(b.id)?.model;
  const real = (m?: string) => !!m && m !== 'unassigned';
  const model = real(prev) ? prev! : real(models[b.id]) ? models[b.id]! : b.model;
  return { ...b, model };
});
writeJson(BOTS_JSON, out);
console.log(`wrote bots.json: ${out.length} bots (${personas.size} from personas)`);
for (const b of out) console.log(`  ${b.role.padEnd(6)} ${b.id.padEnd(11)} ${b.name.padEnd(22)} ${b.model}`);
