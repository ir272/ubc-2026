// Text the brains see. Owner: agents. PURE.
// Observations are VISUAL text only: never attack ids/names, never timings in ms.
// Prompts are kept short on purpose (every decision is a paid call).

import { ACTIONS, TIMINGS, DISTANCE_BANDS, ARENA, MAX_NOTES } from '../core/constants.js';
import { ATTACKS } from '../sim/attacks.js';
import { AGENT } from '../sim/agent.js';
import { gapBetween } from '../sim/world.js';

export const DECIDE_SYSTEM = `Side-view duel against a towering ink-drawn creature. Time is frozen as it begins a motion. Read its pose, predict what comes, choose ONE response.
Actions:
roll_away | roll_toward (stop in front of it) | roll_through (pass through it to its far side): you are untouchable only mid-roll.
jump_back: hop back and up; no protection, but low things pass under you.
attack: close in, quick cuts. heavy: close in, one slow strong blow. Both get you hit if it is about to swing.
heal: slow drink, wasted if hit. hold: stand and wait.
Timing is relative to the instant its motion would reach you: early | on_cue | late.
Your numbered notes are rules you wrote after dying: follow the one that matches this pose; drop it if it failed.
Reply ONLY JSON: {"read":"<=10 words: what this pose means","note":<number of note used, 0 if none>,"action":"...","timing":"...","thought":"<=12 words, in character"}`;

export const REFLECT_SYSTEM = `You died in a side-view duel against a towering ink-drawn creature. You will fight it again.
From the death report write up to ${MAX_NOTES} rules for your next life. Each rule is ONE short sentence of at most 18 words: "When it <visible cue>: <action> <timing>, because <short why>." Keep the why to a few words.
Only these actions exist: ${ACTIONS.join(', ')}. Timings: early, on_cue, late.
Keep rules that kept you untouched. CHANGE any rule that got you hit: "too early" -> later timing, "too late" -> earlier, "BEHIND it" -> a move that does not end at its back; if every dodge of a pose failed, try an action or timing you never tried against it. One rule per pose.
Reply ONLY JSON: {"lesson":"<=16 words: what killed you and the fix","notes":["...","..."]}`;

export function distanceBand(gap) {
  if (gap <= DISTANCE_BANDS.close) return 'close, within reach of its blade';
  if (gap <= DISTANCE_BANDS.mid) return 'a few strides away';
  return 'far, across the hall';
}

export function bossHpBand(frac) {
  if (frac > 0.85) return 'barely scratched';
  if (frac > 0.6) return 'wounded';
  if (frac > 0.35) return 'badly wounded, ink seeping from its cuts';
  if (frac > 0.15) return 'reeling, ink pouring from it';
  return 'near death';
}

export function shortPose(attackId) {
  const atk = ATTACKS[attackId];
  if (!atk) return 'moved';
  return atk.tell.poseDescription.replace(/^It /, '').split(/[;,.]/)[0];
}

const ROLL = { roll_away: 1, roll_toward: 1, roll_through: 1 };
const VERB = {
  roll_away: 'rolled away', roll_toward: 'rolled toward it', roll_through: 'rolled through it',
  jump_back: 'jumped back', attack: 'went in with quick cuts', heavy: 'went in with a heavy blow',
  heal: 'drank a flask', hold: 'held still',
};

// What a player would have SEEN about one hit: where in their own move it landed.
function hitWhy(rec, h) {
  const late = h.hitIndex > 0 ? 'a follow-up strike of the same motion' : 'it';
  if (h.kind === 'detonation') {
    return rec.action === 'attack' || rec.action === 'heavy'
      ? 'the ink rose under you before your blade reached it'
      : 'the ink ring slid along under you, then rose on the spot where you stood the moment the pen lifted';
  }
  if (h.beforeFire && rec.action !== 'hold') return `${late} reached you before you moved (too late)`;
  // where the dodge left you mattered, not its timing
  if (h.behind && h.state !== 'hitstun' && !(h.state === 'roll' && h.stateT < AGENT.roll.iFrom)) {
    return ROLL[rec.action]
      ? `${late} caught you BEHIND it, where your roll had carried you (its back was not safe; the timing was not the problem)`
      : `${late} caught you BEHIND it (its back was not safe)`;
  }
  switch (h.state) {
    case 'roll':
      if (h.stateT < AGENT.roll.iFrom) return `${late} caught you as your roll began (a little late)`;
      return `${late} caught you as your roll ended (a little early, or still in its reach)`;
    case 'jump': return `${late} caught you in the air (jumping did not clear it)`;
    case 'light': case 'heavy': return `${late} hit you mid-swing (attacking into its motion)`;
    case 'heal': return `${late} hit you mid-drink`;
    case 'hitstun': return `${late} hit you again while you reeled`;
    default:
      if (rec.firedAt != null && (ROLL[rec.action] || rec.action === 'jump_back')) {
        return `${late} reached you after your ${ROLL[rec.action] ? 'roll' : 'jump'} was over (too early, or still in its reach)`;
      }
      if (rec.action === 'hold') return `${late} hit you while you stood in its path`;
      return `${late} hit you while you stood`;
  }
}

// One-line outcome of a decision, with the visual reason for any hit.
export function describeOutcome(rec) {
  if (!rec) return '';
  const hits = (rec.hits || []).slice();
  if (rec.damageTaken > 0 && !hits.length && rec.prev) hits.push(rec.prev);
  if (!rec.outcome && !hits.length) return 'still unfolding when you fell';
  const parts = [];
  if (rec.damageTaken > 0) {
    const h = hits[0];
    parts.push(`hit for ${rec.damageTaken}${h ? `: ${hitWhy(rec, h)}` : ''}${h && h.desc ? ` (${h.desc})` : ''}`);
    if (/killed/.test(rec.outcome || '')) parts.push('it killed you');
  } else parts.push('untouched');
  if (rec.damageDealt > 0) parts.push(`you cut it for ${rec.damageDealt}`);
  return parts.join('; ');
}

function noteLines(notes) {
  if (!notes || !notes.length) return ['Your notes: none yet.'];
  return ['Your notes:', ...notes.map((n, i) => `${i + 1}. ${n}`)];
}

// recall: the latest earlier decision against this same pose (this life or a past one)
export function buildObservation(w, notes = [], recall = null) {
  const a = w.agent, b = w.boss;
  const atk = ATTACKS[w.thinking ? w.thinking.attackId : b.attackId];
  const gap = gapBetween(w);
  const dir = b.x >= a.x ? 1 : -1;
  const wallBehind = dir > 0 ? a.x - ARENA.left : ARENA.right - a.x;
  const lines = [];
  lines.push(`Its pose: ${atk ? atk.tell.poseDescription : 'It stands still.'}`);
  lines.push(`Distance: ${distanceBand(gap)}. Behind you: ${wallBehind < 200 ? 'a wall, very close' : 'open floor'}.`);
  lines.push(`You: health ${Math.round(a.hp)}/${a.maxHp}, stamina ${Math.round(a.stamina)}/${a.maxStamina}, flasks ${a.flasks}. It looks ${bossHpBand(b.hp / b.maxHp)}${b.phase === 2 ? ', wings torn open, faster now' : ''}.`);
  if (recall) lines.push(`Last time you saw this pose${recall.pastLife ? ' (earlier life)' : ''}: you ${VERB[recall.action]} (${recall.timing}) -> ${describeOutcome(recall)}.`);
  lines.push(...noteLines(notes));
  return { text: lines.join('\n'), attackId: atk ? atk.id : null, gap: Math.round(gap) };
}

// tried: [{attackId, action, timing, hit}] every decision this challenger made this match.
function triedLines(tried) {
  const by = {};
  for (const d of tried) (by[d.attackId] ||= []).push(d);
  const out = [];
  for (const [id, ds] of Object.entries(by)) {
    const hits = ds.filter((d) => d.hit);
    if (!hits.length) continue;
    const tally = (xs) => {
      const c = {};
      for (const d of xs) { const k = `${d.action} ${d.timing}`; c[k] = (c[k] || 0) + 1; }
      return Object.entries(c).map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(', ');
    };
    const clean = ds.filter((d) => !d.hit);
    const used = new Set(ds.map((d) => d.action));
    const combos = new Set(ds.map((d) => `${d.action} ${d.timing}`));
    // (r3) whole actions never tried, then the untried timings of each dodge it did try
    const never = ACTIONS.filter((x) => !used.has(x) && x !== 'heal');
    for (const x of ['roll_away', 'roll_toward', 'roll_through', 'jump_back']) {
      if (!used.has(x)) continue;
      const ts = TIMINGS.filter((t) => !combos.has(`${x} ${t}`));
      if (ts.length) never.push(`${x} ${ts.join('/')}`);
    }
    out.push(`Against "${shortPose(id)}": hit after ${tally(hits)}${clean.length ? `; clean after ${tally(clean)}` : ''}.${never.length ? ` Never tried: ${never.join(', ')}.` : ''}`);
  }
  return out.slice(0, 3);
}

export function buildReflection(w, notes = [], tried = []) {
  const k = w.log.killedBy;
  const lines = [];
  if (k) lines.push(`Killed by ${k.desc || 'a blow you did not see'}, right after it ${shortPose(k.attackId)}.`);
  else lines.push('You fell.');
  lines.push(`You lasted ${Math.round(w.t / 1000)}s; it was ${bossHpBand(w.boss.hp / w.boss.maxHp)}. Heals used: ${w.log.heals}.`);
  const all = w.log.decisions;
  const last = all.slice(-6).map((d) => (k && d === all[all.length - 1] && d.prev && !(d.hits && d.hits.length)
    ? { ...d, prev: { ...d.prev, desc: k.desc || '', kind: k.kind || '', hitIndex: k.hitIndex || 0 } } : d));
  if (last.length) {
    lines.push('Your last decisions:');
    last.forEach((d, i) => {
      lines.push(`${i + 1}. It ${shortPose(d.attackId)}; you ${VERB[d.action]} (${d.timing}) -> ${describeOutcome(d)}.`);
    });
  }
  const tl = triedLines(tried);
  if (tl.length) lines.push('This fight so far:', ...tl);
  lines.push(...noteLines(notes));
  return { text: lines.join('\n') };
}

function extractJson(text) {
  if (!text) return null;
  const s = String(text).replace(/```(?:json)?/g, '');
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { /* fall through */ }
  // common slips: trailing comma or a dangling quote before the closing brace
  try { return JSON.parse(m[0].replace(/,\s*"?\s*([}\]])/g, '$1')); } catch { return null; }
}

// (r3) a reply that lost its closing brace ('..."thought":"..."; ') or was cut off mid-list
function repairJson(text) {
  const s = String(text || '').replace(/```(?:json)?/g, '');
  const i = s.indexOf('{');
  if (i < 0) return null;
  const body = s.slice(i).replace(/[;,\s]+$/, '');
  for (const tail of ['}', '"}', ']}', '"]}']) {
    try { return JSON.parse(body + tail); } catch { /* next */ }
  }
  return null;
}

// complete "..." strings inside a (possibly truncated) "notes":[ ... list
function salvageNotes(text) {
  const s = String(text || '');
  const k = s.indexOf('"notes"');
  if (k < 0) return [];
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"\s*[,\]]/g;
  re.lastIndex = s.indexOf('[', k) + 1;
  if (re.lastIndex <= 0) return [];
  let mm;
  while ((mm = re.exec(s))) out.push(mm[1].replace(/\\"/g, '"'));
  return out;
}
const poseKey = (n) => String(n).split(':')[0].toLowerCase().replace(/[^a-z ]/g, '').trim();

export function clampWords(s, n) {
  return String(s || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ');
}

// (qa) Clamp to at most n words WITHOUT cutting mid-sentence: keep whole sentences that fit;
// failing that, end at the last clause break (; , — –), then before the last clause-opening
// conjunction (because, so, while, ...), that leaves a usable rule, and close it with a full
// stop; only a single run-on clause is cut at a word and given an ellipsis.
// A rule's "When it <cue>:" colon is never a cut point (it would leave a cue with no answer).
export function clampClause(s, n) {
  const words = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= n) return words.join(' ');
  const cut = words.slice(0, n).join(' ');
  const minWords = Math.min(n, Math.max(4, Math.ceil(n * 0.3)));
  const wordsTo = (i) => cut.slice(0, i).split(' ').filter(Boolean).length;
  let best = -1;
  const sentence = /[.!?](?=\s|$)/g;
  for (let m; (m = sentence.exec(cut));) if (wordsTo(m.index + 1) >= minWords) best = m.index + 1;
  if (best > 0) return cut.slice(0, best).trim();
  const clause = /\s*(?:[;,]|\s[—–-]\s)/g;
  for (let m; (m = clause.exec(cut));) if (m.index > 0 && wordsTo(m.index) >= minWords) best = m.index;
  if (best > 0) return `${cut.slice(0, best).replace(/[\s,;:—–-]+$/, '')}.`;
  // no punctuation: end before the last conjunction that opens a new clause
  const conj = /\s(?:because|since|so|while|then|but|and|until|as)\s/gi;
  for (let m; (m = conj.exec(cut));) if (wordsTo(m.index) >= minWords) best = m.index;
  if (best > 0) return `${cut.slice(0, best).replace(/[\s,;:—–-]+$/, '')}.`;
  return `${cut.replace(/[\s,;:—–-]+$/, '')}…`;
}

// (r3) a thought cut at the word limit ends at its last full sentence, or trails off with an ellipsis
export function tidyThought(s, n = 14) {
  const words = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= n && !/[,;:]$/.test(words[words.length - 1] || '')) return words.join(' ');
  const cut = words.slice(0, n).join(' ');
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (end > 0 && cut.slice(0, end + 1).split(' ').length >= 5) return cut.slice(0, end + 1);
  return cut.replace(/[,;:\s]+$/, '') + '…';
}

export function parseDecision(text) {
  const j = extractJson(text) || repairJson(text);
  let action = j && j.action, timing = j && j.timing;
  const valid = !!j && ACTIONS.includes(action) && TIMINGS.includes(timing);
  if (!ACTIONS.includes(action)) action = ACTIONS.find((x) => String(text || '').includes(x)) || 'hold';
  if (!TIMINGS.includes(timing)) timing = TIMINGS.find((x) => String(text || '').includes(x)) || 'on_cue';
  const note = j && Number.isFinite(+j.note) ? Math.max(0, Math.min(MAX_NOTES, Math.round(+j.note))) : 0;
  return {
    action, timing,
    thought: tidyThought((j && j.thought) || '', 14),
    read: clampClause((j && j.read) || '', 12),
    note, valid,
  };
}

// (qa3) Plain-text reflection: keep only lines that are recognisably rules, i.e. that name a
// visible cue of the creature AND an action from the action vocabulary. A whole reply that is an
// HTML / gateway error page is rejected outright; apologies, refusals and gibberish yield nothing.
const ACTION_RE = new RegExp(`\\b(?:${ACTIONS.map((a) => a.replace(/_/g, '[_ -]')).join('|')})\\b`, 'i');
const CUE_RE = /\b(?:when|if|after|once|while|as soon as|whenever|the moment)\s+(?:it|its|the|they)\b|\b(?:book|wings?|pen|blade|quill|nib|ink|ring|pages?|arms?|skull|eyes?|pillar|feathers?|crouch\w*|rears?|slam\w*|slash\w*|lunge\w*|gust|storm|flares?|star of light)\b/i;
const ERROR_PAGE_RE = /<\s*(?:!doctype|html|head|body|title|center|h\d|hr|pre|div|span|p|br|script|style)\b|<\/[a-z]+\s*>|\b(?:bad gateway|gateway time-?out|service (?:temporarily )?unavailable|internal server error|too many requests|cloudflare|nginx|rate limit(?:ed)?)\b|^\s*(?:error|http\/\d)/i;
const NOT_A_RULE_RE = /^(?:i'?m sorry|i am sorry|sorry|i apologi[sz]e|apologies|unfortunately|as an ai|i can(?:'|no)?t|i cannot|i am unable|i'm unable|i won'?t|here (?:are|is)|sure\b|okay\b|ok\b|note:)|[<>]|https?:\/\//i;
export function readPlainNotes(text) {
  const s = String(text || '');
  if (!s.trim() || ERROR_PAGE_RE.test(s)) return [];
  return s.split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|note\s*\d+\s*[:.)-])?\s*/i, '').replace(/^["']|["'],?$/g, '').trim())
    .filter((l) => {
      if (!l || /^[{}[\]]/.test(l) || NOT_A_RULE_RE.test(l)) return false;
      const words = l.split(/\s+/).length;
      if (words < 4 || words > 60) return false;
      // mostly letters: gibberish and dumps of symbols / hex fail
      if ((l.match(/[a-z]/gi) || []).length < l.replace(/\s/g, '').length * 0.7) return false;
      return ACTION_RE.test(l) && CUE_RE.test(l);
    });
}

export function parseNotes(text, previous = []) {
  // Only a complete JSON reply is trusted whole. A cut-off reply never goes through repairJson for
  // notes (that would keep a half-written rule): salvageNotes keeps only fully closed strings.
  const j = extractJson(text);
  let notes = j && Array.isArray(j.notes) ? j.notes : null;
  let salvaged = false;
  if (!notes) {
    // cut off mid-reply: keep every complete rule it did write, then the old rules for other poses
    notes = salvageNotes(text);
    salvaged = notes.length > 0;
    if (salvaged) {
      const have = new Set(notes.map(poseKey));
      notes = notes.concat(previous.filter((n) => !have.has(poseKey(n))));
    }
  }
  let plain = false;
  if (!notes.length && !/^\s*\{/.test(String(text || ''))) {
    // (qa3) not JSON: only lines that read as rules (a visible cue + an action) are taken;
    // an error page, an apology or gibberish leaves the previous notes standing
    notes = readPlainNotes(text);
    plain = notes.length > 0;
  }
  notes = notes.map((n) => clampClause(n, 30)).filter(Boolean).slice(0, MAX_NOTES);
  let lesson = (j && j.lesson) || '';
  if (!lesson) { const lm = String(text || '').match(/"lesson"\s*:\s*"((?:[^"\\]|\\.)*)"/); if (lm) lesson = lm[1]; }
  return { notes: notes.length ? notes : previous, lesson: clampClause(lesson, 24), valid: !!(j && Array.isArray(j.notes)), salvaged, plain };
}
