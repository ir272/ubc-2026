// Model brain tests. Every call goes to a stubbed fetch: no real calls, no money.
//   node --test test/model.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Bot, Brain, Ctx, Decks, Mark, ReactReq, RoomLine, SpeakReq, StarBank, TypeDraw } from '../show/types.ts';
import {
  createModelBrain, extractJson, parseLine, parseReact, parseChoose, parseChoice, parseReactChoice, validHits, cleanLine, fitWords,
  readCostFile, gateLine, contentWords, coherentMark, writeMode, nearRepeat,
} from '../show/brains/model.ts';
import type { CheckFn, GateCtx, ModelBrainOptions } from '../show/brains/model.ts';
import { buildSpeak, buildReact, buildChoose, countWords, markMix } from '../show/prompts.ts';

const decks = JSON.parse(fs.readFileSync(new URL('../show/decks.json', import.meta.url), 'utf8')) as Decks;
const card = (id: string) => decks.cards.find((c) => c.id === id)!;

const bot = (id: string, role: Bot['role'], model: string): Bot => ({
  id, role, name: id[0].toUpperCase() + id.slice(1), tagline: `${id} tagline`, pronouns: 'they', model,
  instructions: `You are ${id}.`, look: { cast: id, accent: '#888888' },
});
const star = bot('teststar', 'star', 'prov-a/star-model');
const suitors = [bot('alpha', 'suitor', 'prov-b/m1'), bot('beta', 'suitor', 'prov-c/m2'), bot('gamma', 'suitor', 'prov-d/m3'), bot('delta', 'suitor', 'prov-e/m4')];
const roster = [star, ...suitors];
// confidence = public turn-on, puns = hidden turn-on, sorry = dealbreaker
const type: TypeDraw = { cards: [card('confidence'), card('puns'), card('sorry')], twist: decks.twists[0] };

function ctx(episode = 1): Ctx {
  return {
    episode, star, suitors, alive: suitors.map((s) => s.id), room: [], marks: {}, faceUp: type.cards[0], type,
    question: decks.questions[0], records: {}, memory: [], recent: [],
  };
}

const starBank = {
  id: 'teststar',
  react: {
    any: {
      charmed: ['Fine. That landed.', 'Keep going. Slowly.'],
      unsure: ['Hm. Noted, caller.', 'I have heard worse. Recently.'],
      cringing: ['Absolutely not.', 'Never say that on my air.'],
    },
  },
  cardReact: {
    confidence: { on: 'Sure of yourself. I like sure.', off: 'Sure always calls back crying.' },
    puns: { on: 'Awful. Fondly awful.', off: 'The line crackled there.' },
    sorry: { on: 'An apology. Framed.', off: 'Stop flinching. Nobody hit you.' },
  },
  oneOnOne: { any: ['Off air now. Go on.'] },
} as unknown as StarBank;

/** The scripted brain as the model brain sees it: candidates, a bank, and the old methods. */
function mkFallback(withCandidates = true) {
  const f = {
    kind: 'scripted' as const,
    n: 0,
    speakCalls: 0,
    banks: { star: (_id: string) => starBank },
    async speak(_req: SpeakReq) {
      this.n++;
      const lines = ['bank line one', 'bank line two', 'bank line three'];
      return { text: lines[this.speakCalls++ % 3], source: 'bank' as const, tags: ['puns'] };
    },
    async react(_req: ReactReq) { this.n++; return { mark: 'unsure' as Mark, text: 'bank react', hits: [], source: 'bank' as const }; },
    async choose(r: { among: Bot[] }) { this.n++; return r.among[r.among.length - 1].id; },
  };
  if (withCandidates) {
    (f as any).candidates = (_req: SpeakReq, n: number) =>
      [{ text: 'Variant A. Variant B. You.', tags: ['confidence'] }, { text: 'Shipping it tonight.', tags: [] }, { text: 'Conversion pending.', tags: ['numbers'] }].slice(0, n);
  }
  return f;
}
let fallback = mkFallback();

const passCheck: CheckFn = (text, _k, max) => (countWords(text) > max ? { ok: false, reason: 'too long' } : { ok: true, cleaned: text });

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dating-model-')), 'cost.json');
}

type Reply = string | { status?: number; body: unknown } | 'hang' | Error;
/** fetch stub: answers from a queue; records request bodies. */
function stubFetch(replies: Reply[], usage = { prompt_tokens: 100, completion_tokens: 10, cost: 0.0001 }) {
  const bodies: any[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const r = replies.length ? replies.shift()! : '{"line":"default"}';
    if (r instanceof Error) throw r;
    if (r === 'hang') {
      return new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    const status = typeof r === 'string' ? 200 : r.status ?? 200;
    const body = typeof r === 'string' ? { choices: [{ message: { content: r }, finish_reason: 'stop' }], usage } : r.body;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, bodies };
}

function mk(replies: Reply[], extra: Partial<ModelBrainOptions> = {}, fb = mkFallback()) {
  const s = stubFetch(replies);
  fallback = fb;
  const costFile = extra.costFile ?? tmpFile();
  const brain = createModelBrain({
    roster, decks, fallback: fb as unknown as Brain, fetch: s.f, apiKey: 'test-key', costFile, modelsInfoFile: '/nonexistent',
    check: passCheck, timeoutMs: 200, deadlineMs: 1000, write: 'hybrid', ...extra,
  });
  return { brain, bodies: s.bodies, costFile };
}

const opener = (c = ctx()): SpeakReq => ({ who: suitors[0], kind: 'opener', maxWords: 12, ctx: c });

// ------------------------------------------------------------------------------------------
// Parsing
// ------------------------------------------------------------------------------------------

test('parseLine: fenced JSON, prose around JSON, bare string, smart quotes, trailing comma', () => {
  assert.equal(parseLine('```json\n{"line": "Hello there."}\n```'), 'Hello there.');
  assert.equal(parseLine('Sure! Here it is: {"line": "Notice: door open."} Hope that helps.'), 'Notice: door open.');
  assert.equal(parseLine('Recalculating. You have arrived.'), 'Recalculating. You have arrived.');
  assert.equal(parseLine('{“line”: “Smart quotes.”,}'), 'Smart quotes.');
  assert.equal(parseLine('<think>plan the joke</think>{"line":"After thinking."}'), 'After thinking.');
  assert.equal(parseLine('{"line": "cut off mid sen'), null, 'truncated JSON is not a line');
  assert.equal(parseLine(''), null);
});

test('extractJson skips braces inside strings and finds the first object', () => {
  assert.deepEqual(extractJson('x {"line": "a {curly} b"} y {"line":"second"}'), { line: 'a {curly} b' });
  assert.equal(extractJson('no json here'), null);
});

test('parseChoice: use or line, in range, per mode', () => {
  assert.deepEqual(parseChoice('{"use": 2}', 3), { use: 2 });
  assert.deepEqual(parseChoice('{"use": "3"}', 3), { use: 3 });
  assert.deepEqual(parseChoice('```json\n{"use": 1}\n```', 3), { use: 1 });
  assert.deepEqual(parseChoice('2', 3), { use: 2 }, 'a bare number is a choice');
  assert.deepEqual(parseChoice('{"line": "A new one."}', 3), { line: 'A new one.' });
  assert.deepEqual(parseChoice('{"use": 1, "line": "both"}', 3), { use: 1 }, 'choosing wins over writing');
  assert.equal(typeof parseChoice('{"use": 4}', 3), 'string', 'out of range');
  assert.equal(typeof parseChoice('{"use": 0}', 3), 'string');
  assert.equal(typeof parseChoice('{"line": "x"}', 3, 'bank'), 'string', 'bank mode never writes');
  assert.deepEqual(parseChoice('{"use": 1}', 3, 'bank'), { use: 1 });
  assert.equal(typeof parseChoice('{"use": 1}', 3, 'free'), 'string', 'free mode always writes');
  assert.deepEqual(parseChoice('{"line": "x"}', 0, 'free'), { line: 'x' });
});

test('parseReactChoice: mark plus use or line, hits validated', () => {
  const cards = type.cards.map((c) => ({ id: c.id, label: c.label }));
  assert.deepEqual(parseReactChoice('{"mark":"charmed","hits":["puns","money"],"use":2}', cards, 4), { mark: 'charmed', hits: ['puns'], use: 2 });
  assert.deepEqual(parseReactChoice('{"mark":"Cringe","line":"No."}', cards, 4), { mark: 'cringing', hits: [], line: 'No.' });
  assert.equal(typeof parseReactChoice('{"mark":"angry","use":1}', cards, 4), 'string');
  assert.equal(typeof parseReactChoice('{"mark":"unsure"}', cards, 4), 'string');
});

test('cleanLine strips labels, stage directions, em dashes, emoji and wrapping quotes', () => {
  assert.equal(cleanLine('Alpha: "I am here — finally 😀"', 'Alpha'), 'I am here, finally');
  assert.equal(cleanLine('*leans in* Notice: door open.'), 'Notice: door open.');
});

test('fitWords keeps whole sentences under the limit, else gives up', () => {
  assert.equal(fitWords('One two. Three four five six seven eight nine ten eleven.', 8), null);
  assert.equal(fitWords('One two three four. Five six seven eight nine ten.', 6), 'One two three four.');
});

test('hits are validated: only the star cards, labels map to ids, no duplicates', () => {
  const cards = type.cards.map((c) => ({ id: c.id, label: c.label }));
  assert.deepEqual(validHits(['confidence', 'bogus', 'Bad puns', 'confidence', 'money'], cards), ['confidence', 'puns']);
  assert.deepEqual(validHits('sorry, nope', cards), ['sorry']);
  assert.deepEqual(parseReact('{"mark":"Cringe","hits":["sorry","drama"],"line":"No."}', cards), { mark: 'cringing', hits: ['sorry'], line: 'No.' });
});

test('parseChoose accepts ids, names, or a bare name; rejects ambiguity', () => {
  assert.equal(parseChoose('{"id":"beta"}', suitors), 'beta');
  assert.equal(parseChoose('I choose delta.', suitors), 'delta');
  assert.equal(parseChoose('alpha or beta', suitors), null);
});

test('writeMode: hybrid by default', () => {
  assert.equal(writeMode(undefined), 'hybrid');
  assert.equal(writeMode('FREE'), 'free');
  assert.equal(writeMode('bank'), 'bank');
  assert.equal(writeMode('nonsense'), 'hybrid');
});

// ------------------------------------------------------------------------------------------
// The gate
// ------------------------------------------------------------------------------------------

const room = (...xs: [string, string][]): RoomLine[] => xs.map(([who, text]) => ({ who, name: who[0].toUpperCase() + who.slice(1), text, kind: 'answer' }));
const g = (o: Partial<GateCtx> = {}): GateCtx => ({ kind: 'answer', maxWords: 20, who: 'alpha', names: roster.flatMap((b) => [b.name, b.id]), room: [], own: [], ...o });

test('gate: content words skip short words, stop words and names', () => {
  assert.deepEqual([...contentWords('Beta, your snorkels are in the request book.', ['Beta'])].sort(), ['book', 'request', 'snorkel']);
});

test('gate: word limit, filler and therapy words', () => {
  assert.match(gateLine('one two three four', g({ maxWords: 3 }))!, /4 words; the limit is 3/);
  assert.match(gateLine('I see charm in her eyes tonight.', g())!, /stock romance/);
  assert.match(gateLine('This is a real journey for us.', g())!, /stock romance or therapy/);
  assert.match(gateLine('Your feelings are valid, Beta.', g())!, /stock romance or therapy/);
  assert.equal(gateLine('I booked us a table at the car wash.', g()), null);
});

test('gate: no meta talk about cards, marks, logs or the room', () => {
  assert.match(gateLine('That hit my turn-on, caller.', g({ kind: 'reaction' }))!, /cards/);
  assert.match(gateLine('She looks unsure about me.', g({ kind: 'confession' }))!, /marks/);
  assert.match(gateLine('My logs show nine hundred burpees.', g())!, /logs/);
  assert.equal(gateLine('My logs show nine hundred burpees.', g({ kind: 'twist', twistId: 'logs' })), null, 'the logs twist may talk about logs');
  assert.match(gateLine('Everyone in the room can see it.', g())!, /the show itself/);
  assert.equal(gateLine('That is the show. Sleep well.', g({ kind: 'outro' })), null);
});

test('gate: anti-echo, at most one content word shared with each of the last two lines by others', () => {
  const r = room(['beta', 'I brought a snorkel and a request book.'], ['gamma', 'Logs and burpees, every morning.']);
  assert.match(gateLine('A snorkel in the request book? Mine is gold.', g({ room: r }))!, /echoed Beta/);
  assert.equal(gateLine('A snorkel? Mine came with a submarine.', g({ room: r })), null, 'one shared word is a callback, not an echo');
  assert.equal(gateLine('A snorkel in the request book? Mine is gold.', g({ room: r, kind: 'jab' })), null, 'jabs may quote');
  const own = room(['alpha', 'snorkel request book snorkel']);
  assert.equal(gateLine('A snorkel in the request book? Mine is gold.', g({ room: own, own: [] })), null, 'own lines are not an echo');
});

test('gate: anti-motif, no content word the speaker already used in two earlier lines', () => {
  const own = ['Welcome to my booth, callers.', 'My booth has one bulb.', 'Nothing else.'];
  assert.match(gateLine('The booth stays open.', g({ own }))!, /"booth" twice/);
  assert.equal(gateLine('The bulb stays on.', g({ own })), null, 'one earlier use is fine');
});

test('gate: cut and pick lines must name what the suitor said', () => {
  const mustName = ['I eat forty eggs a day.'];
  assert.match(gateLine('You are loud. Goodnight.', g({ kind: 'cutline', mustName }))!, /did not name/);
  assert.equal(gateLine('Forty eggs is a cry for help. Goodnight.', g({ kind: 'cutline', mustName })), null);
});

test('mark coherence: dealbreaker forces cringing, a turn-on alone is never cringing', () => {
  assert.equal(coherentMark('charmed', ['sorry'], type), 'cringing');
  assert.equal(coherentMark('charmed', ['puns', 'sorry'], type), 'cringing');
  assert.equal(coherentMark('cringing', ['puns'], type), 'charmed');
  assert.equal(coherentMark('unsure', ['confidence'], type), 'unsure');
  assert.equal(coherentMark('cringing', [], type), 'cringing', 'no hits: the model decides');
  assert.equal(coherentMark('unsure', [], type), 'unsure');
});

// ------------------------------------------------------------------------------------------
// The brain: speak
// ------------------------------------------------------------------------------------------

test('speak: {"use": n} airs that bank line with its tags, as bank', async () => {
  const { brain, bodies } = mk(['{"use": 3}']);
  const r = await brain.speak(opener());
  assert.deepEqual(r, { text: 'Conversion pending.', source: 'bank', tags: ['numbers'] });
  assert.equal(bodies[0].model, 'prov-b/m1');
  assert.ok(bodies[0].max_tokens <= 120);
  assert.match(bodies[0].messages[1].content, /1\. Variant A\. Variant B\. You\.\n2\. Shipping it tonight\.\n3\. Conversion pending\./);
  assert.match(bodies[0].messages[1].content, /Choosing is the normal move/);
  assert.deepEqual(brain.stats().aired, { bank: 1, model: 0, fallback: 0 });
});

test('speak: a written line that passes the gate airs as model, without tags', async () => {
  const { brain } = mk(['{"line": "I ran a test on you. You won."}']);
  const r = await brain.speak(opener());
  assert.deepEqual(r, { text: 'I ran a test on you. You won.', source: 'model' });
  assert.equal(brain.stats().aired.model, 1);
});

test('speak: a written copy of a candidate counts as choosing it', async () => {
  const { brain } = mk(['{"line": "Shipping it tonight!"}']);
  const r = await brain.speak(opener());
  assert.equal(r.source, 'bank');
  assert.equal(r.text, 'Shipping it tonight.');
});

test('speak: a gated line goes back once with the reason, then the best candidate airs as fallback', async () => {
  const c = ctx();
  c.room = room(['beta', 'I brought a snorkel and a request book.']);
  const { brain, bodies } = mk(['{"line": "A snorkel for the request book."}', '{"line": "I see sparkle in your eyes."}'], {}, mkFallback());
  const r = await brain.speak({ ...opener(c) });
  assert.equal(bodies.length, 2);
  assert.match(bodies[1].messages[3].content, /could not air: it echoed Beta's words/);
  assert.deepEqual(r, { text: 'Variant A. Variant B. You.', source: 'fallback', tags: ['confidence'] });
  assert.deepEqual(brain.stats().aired, { bank: 0, model: 0, fallback: 1 });
});

test('speak: a bad choice is repaired', async () => {
  const { brain, bodies } = mk(['{"use": 9}', '{"use": 2}']);
  assert.equal((await brain.speak(opener())).text, 'Shipping it tonight.');
  assert.match(bodies[1].messages[3].content, /use must be a number from 1 to 3/);
});

test('speak: without a candidates method, the fallback is asked n times and deduped', async () => {
  const fb = mkFallback(false);
  const { brain, bodies } = mk(['{"use": 2}'], {}, fb);
  const r = await brain.speak(opener());
  assert.equal(r.text, 'bank line two');
  assert.deepEqual(r.tags, ['puns']);
  assert.match(bodies[0].messages[1].content, /3\. bank line three/);
});

test('speak: a fixed single bank line (the question) airs without a call', async () => {
  const fb = mkFallback();
  (fb as any).candidates = () => [{ text: 'Where are we going? Not dinner.' }];
  const { brain, bodies } = mk(['{"use": 1}'], {}, fb);
  const r = await brain.speak({ who: star, kind: 'question', maxWords: 18, ctx: ctx() });
  assert.equal(r.text, 'Where are we going? Not dinner.');
  assert.equal(bodies.length, 0);
});

test('speak: bank mode refuses a written line, free mode shows no candidates', async () => {
  const b = mk(['{"line": "new"}', '{"line": "still new"}'], { write: 'bank' });
  assert.equal((await b.brain.speak(opener())).source, 'fallback');
  assert.match(b.bodies[0].messages[1].content, /Reply \{"use": n\}/);
  const f = mk(['{"line": "Written live, all of it."}'], { write: 'free' });
  const r = await f.brain.speak(opener());
  assert.deepEqual(r, { text: 'Written live, all of it.', source: 'model' });
  assert.doesNotMatch(f.bodies[0].messages[1].content, /Variant A/);
});

test('speak: a repeat of a recent line is rejected', async () => {
  const c = ctx();
  c.recent = ['Same old line.'];
  const { brain } = mk(['{"line":"Same old line!"}', '{"line":"A brand new line."}']);
  assert.equal((await brain.speak(opener(c))).text, 'A brand new line.');
});

test('timeout goes to the best candidate without a second wait', async () => {
  const { brain, bodies, costFile } = mk(['hang', '{"line":"too late"}']);
  const t0 = Date.now();
  const r = await brain.speak(opener());
  assert.equal(r.text, 'Variant A. Variant B. You.');
  assert.equal(r.source, 'fallback');
  assert.ok(Date.now() - t0 < 900, 'gave up at the timeout');
  assert.equal(bodies.length, 1);
  const f = readCostFile(costFile);
  assert.equal(f.records[0].err, 'timeout');
});

test('network error and HTTP 500 get one retry, then the fallback', async () => {
  const { brain, bodies } = mk([new Error('ECONNRESET'), { status: 500, body: { error: { message: 'upstream' } } }]);
  assert.equal((await brain.speak(opener())).source, 'fallback');
  assert.equal(bodies.length, 2);
});

test('budget: a cost file at the limit means no real calls at all', async () => {
  const costFile = tmpFile();
  fs.writeFileSync(costFile, JSON.stringify({ totalUsd: 1.5, calls: 0, updated: '', records: [] }));
  const { brain, bodies } = mk(['{"use":1}'], { costFile, budgetUsd: 1.5 });
  assert.equal((await brain.speak(opener())).source, 'fallback');
  assert.equal(bodies.length, 0);
});

test('cost file: one record per HTTP call, running total, cumulative across brains', async () => {
  const costFile = tmpFile();
  const a = mk(['{"use":1}', '{"use":2}'], { costFile });
  await a.brain.speak(opener());
  await a.brain.speak({ ...opener(), who: suitors[1] });
  const b = mk(['{"use":1}'], { costFile });
  await b.brain.speak({ ...opener(), who: suitors[2] });
  const f = JSON.parse(fs.readFileSync(costFile, 'utf8'));
  assert.equal(f.records.length, 3);
  assert.equal(f.totalUsd, 0.0003);
  assert.equal(f.records[2].model, 'prov-d/m3');
  assert.equal(b.brain.stats().spentUsd, 0.0001);
  assert.deepEqual(fs.readdirSync(path.dirname(costFile)).filter((x) => x.endsWith('.tmp')), []);
});

// ------------------------------------------------------------------------------------------
// The brain: react
// ------------------------------------------------------------------------------------------

const reactReq = (line: string, tags?: string[], c = ctx()): ReactReq => ({ star, to: suitors[0], line, tags, maxWords: 10, ctx: c });

test('react: a bank line\'s authored tags are its hits; the card line is offered first', async () => {
  const { brain, bodies } = mk(['{"mark":"charmed","use":1}']);
  const r = await brain.react(reactReq('A pun about bread.', ['puns', 'food']));
  assert.deepEqual(r, { mark: 'charmed', text: 'Awful. Fondly awful.', hits: ['puns'], source: 'bank' });
  const u = bodies[0].messages[1].content;
  assert.match(u, /This line shows your turn-on, Bad puns/);
  assert.match(u, /1\. \(charmed\) Awful\. Fondly awful\./);
  assert.match(u, /Your marks tonight: 0 charmed/);
  assert.doesNotMatch(u, /"hits"/, 'no hits asked when they are known');
});

test('react: a dealbreaker hit forces cringing and a matching line', async () => {
  const { brain } = mk(['{"mark":"charmed","use":2}']);
  const r = await brain.react(reactReq('So sorry. Sorry.', ['sorry']));
  assert.equal(r.mark, 'cringing');
  assert.deepEqual(r.hits, ['sorry']);
  assert.equal(r.text, 'Stop flinching. Nobody hit you.', 'the charmed line it chose no longer fits; the card line does');
  assert.ok(brain.stats().coerced >= 1);
});

test('react: a turn-on hit is never cringing', async () => {
  const { brain } = mk(['{"mark":"cringing","use":6}']);
  const r = await brain.react(reactReq('Confident line.', ['confidence']));
  assert.equal(r.mark, 'charmed');
  assert.notEqual(r.text, 'Absolutely not.');
});

test('react: no hits, the mark is the model\'s; a line of another mark is swapped', async () => {
  const { brain } = mk(['{"mark":"cringing","use":1}']);
  const r = await brain.react(reactReq('Plain line.'));
  assert.equal(r.mark, 'cringing');
  assert.deepEqual(r.hits, []);
  assert.ok(['Absolutely not.', 'Never say that on my air.'].includes(r.text), r.text);
});

test('react: a model-written suitor line is judged: hits from the model, card lines conditional', async () => {
  const { brain, bodies } = mk(['{"line": "I made you a playlist of sirens."}', '{"mark":"charmed","hits":["sorry"],"use":3}']);
  const said = await brain.speak(opener());
  assert.equal(said.source, 'model');
  const r = await brain.react(reactReq(said.text));
  assert.equal(r.mark, 'cringing', 'its own dealbreaker hit still forces cringing');
  assert.deepEqual(r.hits, ['sorry']);
  const u = bodies[1].messages[1].content;
  assert.match(u, /"hits": \[\]/);
  assert.match(u, /\(if it shows Bad puns, charmed\)/);
});

test('react: a written reaction must pass the gate', async () => {
  const c = ctx();
  c.room = [{ who: 'teststar', name: 'Teststar', kind: 'reaction', text: 'My booth, my rules.' }, { who: 'teststar', name: 'Teststar', kind: 'reaction', text: 'The booth hums.' }];
  const { brain, bodies } = mk(['{"mark":"unsure","line":"Back to the booth, caller."}', '{"mark":"unsure","line":"Bold. Wrong, but bold."}'], {});
  const r = await brain.react(reactReq('Hello there, I am bold.', [], c));
  assert.match(bodies[1].messages[3].content, /"booth" twice/);
  assert.deepEqual(r, { mark: 'unsure', text: 'Bold. Wrong, but bold.', hits: [], source: 'model' });
});

test('react: the star never repeats a bank reaction in one episode while others fit', async () => {
  const { brain } = mk(['{"mark":"unsure","use":3}', '{"mark":"unsure","use":3}']);
  const a = await brain.react(reactReq('One.'));
  const b = await brain.react(reactReq('Two.'));
  assert.equal(a.mark, 'unsure');
  assert.notEqual(a.text, b.text);
  assert.deepEqual(brain.stats().marks, { charmed: 0, unsure: 2, cringing: 0 });
});

test('react: brevity is measured, not guessed', async () => {
  const c = ctx();
  c.type = { cards: [card('brevity'), card('puns'), card('sorry')], twist: decks.twists[0] };
  const { brain } = mk(['{"mark":"unsure","use":3}', '{"mark":"unsure","use":3}']);
  assert.deepEqual((await brain.react(reactReq('Short and sweet.', [], c))).hits, ['brevity']);
  assert.deepEqual((await brain.react(reactReq('This line is definitely more than eight words long, sadly.', [], c))).hits, []);
});

test('react: no usable answer twice falls back to the scripted judgment', async () => {
  const { brain, bodies } = mk(['I love it.', 'Still no JSON.']);
  const r = await brain.react(reactReq('hello'));
  assert.equal(r.source, 'fallback');
  assert.equal(r.text, 'bank react');
  assert.equal(bodies.length, 2);
});

test('choose: valid id, then invalid id falls back to the scripted choice', async () => {
  const { brain } = mk(['{"id":"beta"}', '{"id":"zeta"}', '{"id":"nobody"}']);
  const among = [suitors[0], suitors[1]];
  assert.equal(await brain.choose({ star, among, purpose: 'cut', ctx: ctx() }), 'beta');
  assert.equal(await brain.choose({ star, among, purpose: 'pick', ctx: ctx() }), 'beta');
  assert.equal(fallback.n, 1);
});

test('circuit breaker: three consecutive failures send that model to the fallback until the next episode', async () => {
  const { brain, bodies } = mk(['hang', 'hang', 'hang', '{"use":2}', '{"use":2}'], { timeoutMs: 30 });
  for (let i = 0; i < 3; i++) await brain.speak(opener(ctx(1)));
  assert.equal(bodies.length, 3);
  assert.equal((await brain.speak(opener(ctx(1)))).source, 'fallback');
  assert.equal(bodies.length, 3, 'no call while the circuit is open');
  assert.equal((await brain.speak({ ...opener(ctx(1)), who: suitors[1] })).source, 'bank');
  assert.equal((await brain.speak(opener(ctx(2)))).source, 'bank');
});

test('a 400 about reasoning is retried without it and remembered for that model', async () => {
  const { brain, bodies } = mk([
    { status: 400, body: { error: { code: 400, message: 'Reasoning is not supported for this model' } } },
    '{"use":1}',
    '{"use":1}',
  ]);
  assert.equal((await brain.speak({ ...opener(), who: suitors[3] })).source, 'bank');
  assert.ok(bodies[0].reasoning);
  assert.equal(bodies[1].reasoning, undefined);
  await brain.speak({ ...opener(), who: suitors[3], kind: 'answer', maxWords: 20 });
  assert.equal(bodies[2].reasoning, undefined);
});

test('never throws: a throwing fallback still yields an answer', async () => {
  const bad: Brain = {
    kind: 'scripted',
    async speak() { throw new Error('x'); },
    async react() { throw new Error('x'); },
    async choose() { throw new Error('x'); },
  };
  const brain = createModelBrain({ roster, decks, fallback: bad, apiKey: '', costFile: tmpFile(), check: passCheck });
  assert.equal(typeof (await brain.speak(opener())).text, 'string');
  assert.equal((await brain.react(reactReq('x'))).mark, 'unsure');
  assert.equal(await brain.choose({ star, among: [suitors[0], suitors[1]], purpose: 'cut', ctx: ctx() }), 'alpha');
});

// ------------------------------------------------------------------------------------------
// Prompts
// ------------------------------------------------------------------------------------------

test('prompts: short; suitors never see hidden cards or confessions', () => {
  const c = ctx();
  c.room = [
    { who: 'beta', name: 'Beta', kind: 'confession', text: 'SECRET PLAN' },
    { who: 'teststar', name: 'Teststar', kind: 'question', text: 'Where to?' },
  ];
  const s = buildSpeak({ who: suitors[0], kind: 'answer', maxWords: 20, ctx: c }, [{ text: 'A' }, { text: 'B' }]);
  const all = s.system + s.user;
  assert.ok(!all.includes('SECRET PLAN'));
  assert.ok(!all.includes(card('puns').label) && !all.includes(card('sorry').label));
  assert.ok(s.user.length < 900, `user turn is ${s.user.length} chars`);
  const r = buildReact({ star, to: suitors[0], line: 'hi', maxWords: 10, ctx: c }, [], { knownHits: null });
  assert.ok(r.user.includes('[puns]') && r.user.includes('[sorry]') && r.user.includes('[confidence]'));
  assert.ok(!(r.system + r.user).includes('SECRET PLAN'));
});

test('prompts: every beat kind builds a task without throwing', () => {
  const c = ctx();
  c.twist = decks.twists[0];
  const kinds = ['opener', 'answer', 'twist', 'jab', 'confession', 'duo', 'exit', 'win', 'lose'] as const;
  for (const kind of kinds) assert.match(buildSpeak({ who: suitors[0], kind, maxWords: 20, ctx: c, target: suitors[1] }, [{ text: 'x' }]).user, /Now: /);
  const starKinds = ['intro', 'question', 'twistintro', 'cutline', 'pickline', 'hold', 'reveal', 'outro'] as const;
  for (const kind of starKinds) assert.match(buildSpeak({ who: star, kind, maxWords: 14, ctx: c, target: suitors[1], hint: { card: { label: 'Bad puns', kind: 'on' } } }, []).user, /Now: /);
  const ex = buildSpeak({ who: star, kind: 'caller', maxWords: 20, ctx: c, hint: { exName: 'Modem' } }, []);
  assert.match(ex.system, /You are Modem, the ex of Teststar/);
  assert.match(buildChoose({ star, among: [suitors[0], suitors[1]], purpose: 'cut', ctx: c }).user, /"alpha"/);
});

test('prompts: the mark mix nudges a star who never charms', () => {
  const c = ctx();
  c.marks = { alpha: ['unsure', 'unsure'], beta: ['cringing', 'unsure'] };
  assert.match(markMix(c), /0 charmed, 3 unsure, 1 cringing.*short on charmed/);
});

test('gate: no re-skinned joke from earlier tonight or from an earlier show', () => {
  const own = ['Sir Quill, I once had a bishop removed for quoting a sonnet.'];
  assert.match(gateLine('Mr Dash, I have had a bishop removed for less.', g({ own }))!, /already made that joke tonight/);
  assert.match(gateLine('Mr Dash, I have had a bishop removed for less.', g({ past: own }))!, /earlier show/);
  assert.equal(gateLine('Mr Dash, the lift is that way.', g({ own, past: own })), null);
});

test('nearRepeat: the same line with a different card label is a repeat', () => {
  assert.equal(nearRepeat('Brings up the past. Right there on the dial, and nobody turned it.', ['Follows the rules. Right there on the dial, and nobody turned it.']), true);
  assert.equal(nearRepeat('Brings up the past. I would have played that one twice.', ['Follows the rules. Right there on the dial, and nobody turned it.']), false);
});

test('speak: hold, reveal and outro only choose, even in hybrid', async () => {
  const { brain, bodies } = mk(['{"line": "Nav, I closed the road once."}', '{"use": 2}']);
  const r = await brain.speak({ who: star, kind: 'hold', maxWords: 12, ctx: ctx() });
  assert.equal(r.source, 'bank');
  assert.match(bodies[0].messages[1].content, /Reply \{"use": n\}\.$/);
  assert.doesNotMatch(bodies[0].messages[1].content, /"line"/);
});

test('speak: candidates that repeat what the speaker said tonight are dropped', async () => {
  const c = ctx();
  c.room = [{ who: 'alpha', name: 'Alpha', kind: 'opener', text: 'Your conversion is pending.' }];
  const { brain, bodies } = mk(['{"use": 2}']);
  const r = await brain.speak({ ...opener(c), kind: 'answer', maxWords: 20 });
  assert.equal(r.text, 'Shipping it tonight.');
  assert.doesNotMatch(bodies[0].messages[1].content, /Conversion pending/);
});

test('gate: assistant talk and narration never air', () => {
  assert.match(gateLine('Let me work through this carefully.', g({ kind: 'lose' }))!, /assistant/);
  assert.match(gateLine('The ex just delivered a parting shot about Teststar.', g({ kind: 'twist' }))!, /narrated/);
  assert.match(gateLine('Teststar asked me to point at who goes home first.', g())!, /narrated/);
  assert.equal(gateLine('Beta said he is royal. Bold.', g({ kind: 'jab' })), null, 'a jab may quote a rival');
});

test('gate: an answer may not restate the question', () => {
  const r: RoomLine[] = [
    { who: 'teststar', name: 'Teststar', kind: 'question', text: 'Who goes home first? Point at them, on camera.' },
    { who: 'beta', name: 'Beta', kind: 'answer', text: 'Gamma, obviously.' },
    { who: 'teststar', name: 'Teststar', kind: 'reaction', text: 'Fine.' },
  ];
  assert.match(gateLine('I would point at the camera, honestly.', g({ room: r }))!, /echoed Teststar/);
});

test('speak: a bank line naming a bot who is not on tonight is skipped; lines from earlier shows are not re-run', async () => {
  const fb = mkFallback();
  (fb as any).candidates = () => [{ text: 'Dash is me with a pitch deck.' }, { text: 'Pick me, obviously.' }, { text: 'I brought snacks.' }];
  const outsider = bot('dash', 'suitor', 'prov-z/m9');
  const { brain, bodies } = mk(['{"use": 1}', '{"use": 1}'], { roster: [...roster, outsider] }, fb);
  assert.equal((await brain.speak({ ...opener(), kind: 'answer', maxWords: 20 })).text, 'Pick me, obviously.');
  assert.doesNotMatch(bodies[0].messages[1].content, /Dash/);
  const again = await brain.speak({ ...opener(ctx(2)), kind: 'answer', maxWords: 20 });
  assert.equal(again.text, 'I brought snacks.', 'the line aired last episode is not offered again while others remain');
});

test('prompts: the mark mix nudges a harsh star too', () => {
  const c = ctx();
  c.marks = { alpha: ['cringing', 'cringing'], beta: ['cringing', 'charmed'] };
  assert.match(markMix(c), /short on unsure.*You have been harsh/);
});

test('speak: after three written lines in an episode a bot only chooses', async () => {
  const lines = ['A fresh plan for walking.', 'Soup, served cold, at noon.', 'Ladders. Tall ones.'];
  const { brain, bodies } = mk([...lines.map((l) => `{"line": "${l}"}`), '{"use": 2}']);
  for (let i = 0; i < 3; i++) {
    const r = await brain.speak({ ...opener(), kind: 'answer', maxWords: 20 });
    assert.equal(r.source, 'model', `${i}: ${r.text} ${JSON.stringify(bodies.map((b) => b.messages.at(-1).content.slice(0, 80)))}`);
  }
  const r = await brain.speak({ ...opener(), kind: 'answer', maxWords: 20 });
  assert.equal(r.source, 'bank');
  assert.doesNotMatch(bodies[3].messages[1].content, /"line"/);
});

test('speak: an exit may not echo the cut line it answers, even before the cut is in the room', async () => {
  const { brain, bodies } = mk(['{"line": "Louder than a plane, apparently."}', '{"line": "Fine. I will run home."}']);
  const r = await brain.speak({ ...opener(), kind: 'exit', maxWords: 16, hint: { reason: 'Alpha, a plane once landed in our car park, and you were louder.' } });
  assert.match(bodies[1].messages[3].content, /echoed Teststar/);
  assert.equal(r.text, 'Fine. I will run home.');
});

test('react: a card line used once tonight is not offered again', async () => {
  const { brain, bodies } = mk(['{"mark":"charmed","use":1}', '{"mark":"charmed","use":1}']);
  const a = await brain.react(reactReq('A pun.', ['puns']));
  assert.equal(a.text, 'Awful. Fondly awful.');
  const b = await brain.react(reactReq('Another pun.', ['puns']));
  assert.notEqual(b.text, a.text);
  assert.doesNotMatch(bodies[1].messages[1].content, /Fondly awful/);
});

// ------------------------------------------------------------------------------------------
// v2 (show/FORMAT2.md)
// ------------------------------------------------------------------------------------------

/** a fallback with the v2 duck-typed methods: paired replies and read candidates */
function mkV2Fallback() {
  const f = mkFallback() as any;
  f.replyPair = (r: ReactReq) => (r.line.startsWith('My pasta') ? { warm: 'Pasta? Warm pasta, caller.', cold: 'Pasta. Cold pasta. Next.' } : null);
  f.used = [] as string[];
  f.markUsed = (t: string) => f.used.push(t);
  const base = f.candidates;
  f.candidates = (req: SpeakReq, n: number) => {
    const card = (req.hint?.card as { noun?: string } | undefined)?.noun;
    if (req.kind === 'confession' && card) return [{ text: `She lit up. I think it is ${card}.` }, { text: `I know her now: ${card}, all night.` }].slice(0, n);
    return base(req, n);
  };
  return f;
}

test('402: one failed call trips the breaker for the whole episode; the scripted brain plays everything, no retries', async () => {
  const logs: string[] = [];
  const { brain, bodies } = mk([{ status: 402, body: { error: { code: 402, message: 'Insufficient credits' } } }, '{"use":1}', '{"use":1}'], { log: (x) => logs.push(x) });
  const a = await brain.speak(opener(ctx(7)));
  assert.equal(bodies.length, 1, 'one call');
  assert.equal(a.text, 'bank line one', 'the scripted line');
  const b = await brain.speak({ ...opener(ctx(7)), who: suitors[2] });
  const r = await brain.react(reactReq('Plain line.', [], ctx(7)));
  const ch = await brain.choose({ star, among: [suitors[0], suitors[1]], purpose: 'cut', ctx: ctx(7) });
  assert.equal(bodies.length, 1, 'no more calls this episode, for any model');
  assert.equal(b.text, 'bank line two');
  assert.equal(r.text, 'bank react');
  assert.equal(ch, 'beta', 'the scripted choice');
  assert.equal(logs.filter((x) => /402/.test(x)).length, 1);
  // the next episode tries once more
  await brain.speak(opener(ctx(8)));
  assert.equal(bodies.length, 2);
});

test('react: the paired replies are the first candidates; the one matching the mark airs', async () => {
  const fb = mkV2Fallback();
  const { brain, bodies } = mk(['{"mark":"charmed","use":2}'], {}, fb);
  const r = await brain.react(reactReq('My pasta is a love letter.'));
  const u = bodies[0].messages[1].content;
  assert.match(u, /1\. \(charmed\) Pasta\? Warm pasta, caller\./);
  assert.match(u, /2\. \(cringing\) Pasta\. Cold pasta\. Next\./);
  assert.equal(r.mark, 'charmed');
  assert.equal(r.text, 'Pasta? Warm pasta, caller.', 'the cold reply cannot air over a charmed mark');
  assert.equal(r.paired, true);
  const u2 = mk(['{"mark":"unsure","use":2}'], {}, mkV2Fallback());
  const r2 = await u2.brain.react(reactReq('My pasta is a love letter.'));
  assert.equal(r2.text, 'Pasta. Cold pasta. Next.');
  assert.equal(r2.paired, true);
});

test('react: the hook rule: a written reaction that does not answer the line gives way to the paired reply', async () => {
  const fb = mkV2Fallback();
  const { brain } = mk(['{"mark":"cringing","line":"Never call this number again, caller."}'], {}, fb);
  const req = { ...reactReq('My pasta is a love letter.'), hook: 'a love letter' };
  const r = await brain.react(req);
  assert.equal(r.text, 'Pasta. Cold pasta. Next.');
  assert.equal(r.source, 'bank');
  // a written line that uses the hook airs
  const ok = mk(['{"mark":"cringing","line":"A love letter? Return to sender."}'], {}, mkV2Fallback());
  assert.equal((await ok.brain.react(req)).text, 'A love letter? Return to sender.');
  // no paired reply: it goes back once with the reason
  const back = mk(['{"mark":"unsure","line":"Never call this number again."}', '{"mark":"unsure","line":"Spaghetti, caller? Bold."}'], {}, mkV2Fallback());
  const r3 = await back.brain.react(reactReq('My spaghetti is a love letter.'));
  assert.match(back.bodies[1].messages[3].content, /did not answer what they said/);
  assert.equal(r3.text, 'Spaghetti, caller? Bold.');
});

test('react: a walk-on snap is judged only against the face-up card', async () => {
  const { brain, bodies } = mk(['{"mark":"charmed","use":1}']);
  const r = await brain.react({ ...reactReq('A sorry pun.', ['puns', 'sorry', 'confidence']), maxWords: 6, hint: { beat: 'snap' } });
  assert.deepEqual(r.hits, ['confidence'], 'the hidden cards do not count in the walk-on');
  assert.equal(r.mark, 'charmed');
  assert.match(bodies[0].messages[1].content, /only against your face-up turn-on, Confidence/);
  assert.doesNotMatch(bodies[0].messages[1].content, /Bad puns|Says sorry/);
});

test('react: in the one on one the star chooses one of her prompts (the closer answers it)', async () => {
  const { brain, bodies } = mk(['{"mark":"charmed","line":"Tell me about your mother."}', '{"mark":"charmed","use":1}']);
  const r = await brain.react({ ...reactReq('Just us now.', [], { ...ctx(), alive: [suitors[0].id, suitors[1].id] }), maxWords: 14, hint: { beat: 'duo' } });
  assert.equal(r.text, 'Off air now. Go on.');
  assert.equal(bodies.length, 2, 'a written prompt is refused once');
});

test('read: the suitor names its own card; the line carries it and the guess is the card id', async () => {
  const { brain, bodies } = mk(['{"use":2,"card":"poetry"}'], {}, mkV2Fallback());
  const r = await brain.speak({ who: suitors[0], kind: 'confession', maxWords: 18, ctx: ctx(), hint: { flavour: 'guess', card: { id: 'puns', label: 'Bad puns', noun: 'bad puns' }, starSaid: 'Fondly awful.' } });
  assert.equal(r.text, 'I know her now: poetry, all night.');
  assert.equal(r.guess, 'poetry');
  assert.match(bodies[0].messages[1].content, /"Fondly awful\."/);
  assert.match(bodies[0].messages[1].content, /poetry \(poetry\)/);
  assert.doesNotMatch(bodies[0].messages[1].content, /confidence \(confidence\)/, 'not the face-up card');
  // a bad card id goes back once, then the scripted read (its card) airs
  const bad = mk(['{"use":1,"card":"zebras"}', '{"use":1,"card":"zebras"}'], {}, mkV2Fallback());
  const r2 = await bad.brain.speak({ who: suitors[0], kind: 'confession', maxWords: 18, ctx: ctx(), hint: { flavour: 'fear', card: { id: 'puns', label: 'Bad puns', noun: 'bad puns' } } });
  assert.equal(r2.guess, undefined);
  assert.equal(bad.bodies.length, 2);
});

test('speak: a written pick line names the winner last', async () => {
  const { brain, bodies } = mk(['{"line":"Beta, you said the bread thing, and it stuck."}', '{"line":"You said the bread thing, and it stuck. Beta."}']);
  const r = await brain.speak({ who: star, kind: 'pickline', maxWords: 16, ctx: { ...ctx(), room: [{ who: 'beta', name: 'Beta', kind: 'answer', text: 'I bake bread when sad.' }] }, target: suitors[1], hint: { line: 'I bake bread when sad.', name: 'Beta' } });
  assert.match(bodies[1].messages[3].content, /say Beta last/);
  assert.equal(r.text, 'You said the bread thing, and it stuck. Beta.');
});
