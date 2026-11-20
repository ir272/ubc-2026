// Full scripted episodes through the fake Show (show/FORMAT2.md, version 2 of the format).
// Two banks: the tiny v1 fixture (test/fixtures/bank: banks not yet upgraded must still play), and a
// v2 bank built from it at test time (every v2 field, hooks and paired replies). Timing checks run on
// the instant virtual clock (speed Infinity: only sleeps move time, so gaps and window lengths are
// exact under any machine load); the broken-brain test runs at speed 200 to exercise real timers and
// the wait cap.
//   node --test test/episode.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../show/session.ts';
import { placeholderBot } from '../show/roster.ts';
import { recordingHub, gaps, type Recorded } from '../tools/common.ts';
import { isHeldTail, BEAT } from '../show/timing.ts';
import { createScriptedBrain, NO_HIT_MIX, REPEAT_WINDOW } from '../show/brains/scripted.ts';
import { loadDecks } from '../show/paths.ts';
import { MARK_SCORE, standings } from '../show/judge.ts';
import type { Transcript } from '../show/episode.ts';
import type {
  Bot, EvBottom, EvConfession, EvCut, EvLine, EvPick, EvReaction, EvReplay, EvReveal, EvScene, Mark, SpeakReq, TypeDraw,
} from '../show/types.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V1 = path.join(HERE, 'fixtures', 'bank');
const SUITORS = ['dash', 'tilly', 'quill', 'nav', 'brock'];
const roster: Bot[] = [placeholderBot('vesper', 'star', 0), ...SUITORS.map((id, i) => placeholderBot(id, 'suitor', i + 1))];
const decks = loadDecks();

// ------------------------------------------------------------------------------------------
// A v2 bank, built from the v1 fixture: hooks, reads, comebacks, steals, closers, star v2 fields,
// and a warm and a cold reply for every reactable suitor line.
// ------------------------------------------------------------------------------------------

type Ln = { t: string; tags?: string[]; hook?: string };
const hookOf = (t: string) => {
  const w = t.split(/\s+/).filter((x) => x && !/[{}]/.test(x));
  const first = t.split(/\s+/).slice(0, 3).join(' ');
  return w.length >= 3 && !/[{}]/.test(first) ? first : undefined;
};
const withHook = (l: Ln): Ln => {
  const h = hookOf(l.t);
  return h ? { ...l, hook: h } : l;
};

function buildV2(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dating-v2-bank-'));
  fs.mkdirSync(path.join(dir, 'stars'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'suitors'), { recursive: true });
  const read = (p: string) => JSON.parse(fs.readFileSync(path.join(V1, p), 'utf8'));
  const star = read('stars/vesper.json');
  star.intro = [{ t: 'Good evening, night owls. Tonight I like {card}.' }, { t: 'Four callers holding. Tonight I like {card}, callers.' }];
  star.bottom = ['{a}. {b}. One of you goes home, callers.', '{a} and {b}, stay on the line. One of you hangs up.'];
  star.cutFrames = ['{name}, you said {hook}, and the line went dead.', '{name}. {hook}. That was the whole call.'];
  star.cardHint = Object.fromEntries(decks.cards.map((c, i) => [c.id, `{name}, something you did tonight, clue ${i}.`]));
  star.verdict = Object.fromEntries(decks.twists.map((t) => [t.id, `{name} won that one. The rest of you, listen to ${t.id}.`]));
  star.compare = ['{a} went first, {b} went last, and I am awake.'];
  star.holdCard = Object.fromEntries(decks.cards.map((c) => [c.id, `Both of you did one thing all night, card ${c.id}.`]));
  star.pickFrames = ['You said {hook}, and I kept hearing it. {name}.'];
  star.reveal = { on: ['{card}. {name} found it.', ...star.reveal.on], off: ['{card}. {name}, that was you.', ...star.reveal.off], none: star.reveal.none };
  star.oneOnOne = Object.fromEntries(SUITORS.map((s) => [s, [`Prompt one for {rival}: tell me a secret?`, `Prompt two: sing me a jingle, {rival}.`]]));
  star.twistIntro = Object.fromEntries(decks.twists.map((t) => [t.id, `Twist time, callers: ${t.rule}`]));
  fs.writeFileSync(path.join(dir, 'stars', 'vesper.json'), JSON.stringify(star));
  const base = read('suitors/dash.json');
  for (const id of SUITORS) {
    const src = id === 'tilly' ? read('suitors/tilly.json') : base;
    const name = id[0]!.toUpperCase() + id.slice(1);
    const re = (x: unknown): unknown =>
      Array.isArray(x) ? x.map(re) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 't' ? String(v).replace(/\bDash\b/g, name) : re(v)])) : x;
    const b = re(src) as any;
    b.id = id;
    const hooked = (xs: Ln[]) => xs.map(withHook);
    // six openers per suitor, each built a different way (first word, first tag)
    const si = SUITORS.indexOf(id);
    const WORDS = ['Hi', 'Evening', 'Right', 'Listen', 'Okay', 'Well', 'So', 'Look', 'Hey', 'Notice', 'Greetings', 'Behold'];
    b.openers = Array.from({ length: 6 }, (_, i) => withHook({ t: `${WORDS[(si * 2 + i) % WORDS.length]}, ${name} here, opener ${i}, with a line for you.`, tags: [decks.cards[(si * 6 + i) % decks.cards.length]!.id] }));
    for (const q of Object.keys(b.answers)) b.answers[q] = hooked(b.answers[q]);
    for (const t of Object.keys(b.twists)) b.twists[t] = hooked(b.twists[t]);
    b.roast = Object.fromEntries(SUITORS.filter((x) => x !== id).map((x) => [x, withHook({ t: `${name} roasts ${x}: your opener had more words than ideas.`, tags: ['trashtalk'] })]));
    b.wingman = Object.fromEntries(SUITORS.filter((x) => x !== id).map((x) => [x, withHook({ t: `${name} pitches ${x}: kind, punctual, and owns a ladder.`, tags: ['flattery'] })]));
    b.oneOnOne.open.any = hooked(b.oneOnOne.open.any);
    b.oneOnOne.steal = [withHook({ t: `Whatever {rival} said to you, ${name} means it twice.`, tags: ['confidence'] })];
    b.oneOnOne.close = { vesper: [{ warm: { t: `${name}: my secret is warm, prompt one.` }, cold: { t: `${name}: no secret for you, prompt one.` } }, { warm: { t: `${name} sings a warm jingle, prompt two.` }, cold: { t: `${name} hums one cold note, prompt two.` } }] };
    b.confessions.guess = [{ t: `{star} lit up at that. ${name} thinks it is {card}.` }];
    b.confessions.fear = [{ t: `{star} flinched. ${name} will avoid {card} now.` }];
    b.comeback = [{ t: `Two of you, one ${name}. Still winning.` }];
    fs.writeFileSync(path.join(dir, 'suitors', `${id}.json`), JSON.stringify(b));
    // replies: a warm and a cold reply to every opener, answer, twist, roast, wingman, jab and opener of the date
    const lines: Ln[] = [
      ...b.openers, ...Object.values(b.answers).flat(), ...Object.values(b.twists).flat(), ...Object.values(b.roast), ...Object.values(b.wingman),
      ...Object.values(b.jabs).flat(), ...Object.values(b.oneOnOne.open).flat(), ...b.oneOnOne.steal,
    ] as Ln[];
    const replies = Object.fromEntries(lines.map((l) => [l.t, { warm: `Warm, ${name}: ${l.t.split(' ').slice(0, 2).join(' ')}.`, cold: `Cold, ${name}: ${l.t.split(' ').slice(0, 2).join(' ')}.` }]));
    fs.mkdirSync(path.join(dir, 'replies', 'vesper'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'replies', 'vesper', `${id}.json`), JSON.stringify({ star: 'vesper', suitor: id, replies }));
  }
  return dir;
}
const V2 = buildV2();

// ------------------------------------------------------------------------------------------

async function play(o: { bankDir: string; seed: string }) {
  const session = await createSession({ roster, memory: 'fresh', usedPath: null, bankDir: o.bankDir, seed: o.seed, waitCapMs: Infinity, log: () => {} });
  const { hub, log } = recordingHub({ speed: Infinity, seed: o.seed });
  const tx = await session.runOne(hub.newShow());
  return { tx, log, hub, session };
}

const events = (log: Recorded[]) =>
  log.filter((r) => r.msg.type === 'event').map((r) => r.msg.event as { type: string; at: number; data: any });

function assertEpisode(log: Recorded[], maxGap = 2500) {
  const types = log.map((r) => r.msg.type);
  assert.deepEqual(types.slice(0, 2), ['phase', 'match'], 'like the runner: phase lobby, then match');
  assert.equal(types.at(-1), 'match_end');

  // scene order
  const ev = events(log);
  const scenes = ev.filter((e) => e.type === 'scene').map((e) => (e.data as EvScene).state.scene);
  assert.deepEqual(scenes, ['title', 'walkon', 'round1', 'booth1', 'round2', 'booth2', 'oneonone', 'oneonone', 'pick', 'reveal', 'result']);
  assert.equal(ev[0]!.type, 'cast');
  for (const t of ['enter', 'line', 'reaction', 'confession', 'twist', 'bottom', 'cut', 'hold', 'replay', 'pick', 'reveal', 'result']) {
    assert.ok(ev.some((e) => e.type === t), `has a ${t} event`);
  }

  // three windows, in order, each opened before its scene and locked before the next round
  const idx = (pred: (r: Recorded) => boolean) => log.findIndex(pred);
  const sceneIdx = (s: string) => idx((r) => r.msg.type === 'event' && (r.msg.event as any).type === 'scene' && (r.msg.event as any).data.state.scene === s);
  const opens = log.filter((r) => r.msg.type === 'window_open').map((r) => r.msg);
  assert.equal(opens.length, 3);
  assert.deepEqual(opens.map((w) => (w.outcomes as unknown[]).length), [4, 3, 2]);
  const [A, B, C] = opens.map((w) => w.windowId as string);
  const at = (type: string, id: string) => idx((r) => r.msg.type === type && r.msg.windowId === id);
  assert.ok(at('window_open', A!) < sceneIdx('walkon'));
  assert.ok(at('window_locked', A!) < sceneIdx('round1'));
  assert.ok(sceneIdx('round1') < at('window_open', B!) && at('window_open', B!) < sceneIdx('booth1'));
  assert.ok(at('window_locked', B!) < sceneIdx('round2'));
  assert.ok(at('window_open', C!) < sceneIdx('booth2') && at('window_locked', C!) < sceneIdx('oneonone'));
  // window A: the walk-on (intro, openers, snap reactions, the last word); B and C: confessions only
  for (const [id, allowed] of [[A!, ['scene', 'enter', 'line', 'reaction']], [B!, ['scene', 'confession']], [C!, ['scene', 'confession']]] as const) {
    for (const r of log.slice(at('window_open', id), at('window_locked', id))) {
      if (r.msg.type !== 'event') continue;
      const e = r.msg.event as { type: string; data: any };
      assert.ok((allowed as readonly string[]).includes(e.type), `${e.type} during window ${id}`);
      if (e.type === 'line') assert.ok(['intro', 'opener', 'jab'].includes((e.data as EvLine).kind));
    }
  }
  // the booth never hears from the star
  const starId = (ev[0]!.data as any).meta.star.id;
  for (const e of ev) if (e.type === 'confession') assert.notEqual((e.data as EvConfession).who, starId, 'never the star in a booth');
  // all three settle on the winner
  const pick = ev.find((e) => e.type === 'pick')!.data as EvPick;
  const settled = log.filter((r) => r.msg.type === 'window_settled').map((r) => r.msg);
  assert.deepEqual(settled.map((s) => s.windowId), [A, B, C]);
  for (const s of settled) assert.equal(s.winnerOutcomeId, pick.who);
  assert.match(String(settled[0]!.secret), /^[0-9a-f]{64}$/, 'window A (sealed) reveals its secret');
  assert.equal(settled[1]!.secret, undefined, 'B and C are live windows');
  assert.ok(idx((r) => r.msg.type === 'window_settled') < idx((r) => r.msg.type === 'match_end'));

  // PublicState consistency: replay events and compare with each scene's state
  const alive = new Set<string>((ev[0]!.data as any).meta.suitors.map((s: any) => s.id));
  const marks: Record<string, Mark[]> = {};
  for (const id of alive) marks[id] = [];
  let faceUp = 0;
  let winner: string | null = null;
  for (const e of ev) {
    if (e.type === 'scene') {
      const st = (e.data as EvScene).state;
      assert.deepEqual(new Set(st.alive), alive, `alive at ${st.scene}`);
      assert.deepEqual(st.marks, marks, `marks at ${st.scene}`);
      assert.equal(st.winner, winner);
      if (st.scene === 'title') assert.equal(st.cards.length, 0);
      else {
        assert.equal(st.cards.length, 3);
        assert.equal(st.cards.filter((c) => c.faceUp).length, 1 + faceUp, `face-up cards at ${st.scene}`);
        assert.ok(st.cards[0]!.faceUp && st.cards[0]!.kind === 'on' && st.cards[0]!.label);
        for (const c of st.cards) if (!c.faceUp) assert.equal(c.id, undefined, 'hidden cards carry no id');
      }
      assert.equal(st.window, { walkon: 'A', booth1: 'B', booth2: 'C' }[st.scene as string] ?? null);
      assert.equal(st.twist === null, ['title', 'walkon', 'round1', 'booth1', 'round2'].includes(st.scene));
      if (st.scene === 'oneonone') assert.ok(st.focus && alive.has(st.focus));
    }
    if (e.type === 'reaction') marks[(e.data as EvReaction).to]!.push((e.data as EvReaction).mark);
    if (e.type === 'cut') alive.delete((e.data as EvCut).who);
    if (e.type === 'pick') winner = (e.data as EvPick).who;
    if (e.type === 'reveal') faceUp++;
    if (['line', 'confession', 'bottom', 'cut', 'pick', 'reveal', 'replay'].includes(e.type)) {
      const d = e.data as { text: string; ms: number };
      assert.ok(d.text && d.ms > 0, `${e.type} has text and ms`);
      assert.ok(!/[—–]/.test(d.text), 'no em dashes on air');
    }
    if (e.type === 'reaction') {
      const d = e.data as EvReaction;
      assert.ok(d.ms > 0);
      if (!d.text) assert.equal(d.ms, BEAT.markOnly, 'a mark-only reaction');
    }
  }
  assert.equal(faceUp, 2);
  const reveals = ev.filter((e) => e.type === 'reveal').map((e) => e.data as EvReveal);
  assert.deepEqual(reveals.map((r) => [r.slot, r.card.kind]), [[1, 'on'], [2, 'off']]);
  // slot 1 turns before the name, slot 2 after; the hold sits between the slot-1 replays and the pick
  const order = ev.map((e) => e.type);
  const iRev1 = ev.findIndex((e) => e.type === 'reveal' && e.data.slot === 1);
  const iRev2 = ev.findIndex((e) => e.type === 'reveal' && e.data.slot === 2);
  const iPick = order.indexOf('pick');
  const iHold = order.indexOf('hold');
  assert.ok(iRev1 < iHold && iHold < iPick && iPick < iRev2, 'reveal 1, replays, hold, pick, reveal 2');
  assert.equal(ev.slice(iRev1 + 1, iHold).filter((e) => e.type === 'replay').length, 2, 'both finalists replayed before the name');
  // every cut is staged: the bottom two, silence, then the cut of one of them
  for (const [k, e] of ev.entries()) {
    if (e.type !== 'cut') continue;
    const b = ev.slice(0, k).reverse().find((x) => x.type === 'bottom')!.data as EvBottom;
    assert.ok(b.who.includes((e.data as EvCut).who), 'the cut suitor was in the bottom two');
    assert.equal(b.holdMs, BEAT.bottomHold);
  }

  // timing (the held wide shot that ends each window is a beat, not dead air; the bottom-two silence
  // and the pick hold are inside their events' ms)
  const g = gaps(log, maxGap);
  assert.deepEqual(g.gaps.filter((x) => !isHeldTail(x)), [], `no silence over ${maxGap} ms`);
  assert.ok(g.durationMs > 4.5 * 60_000 && g.durationMs < 6.05 * 60_000, `duration ${g.durationMs}`);
  const ats = ev.map((e) => e.at);
  assert.deepEqual(ats, ats.slice().sort((x, y) => x - y), 'event times increase');
}

/** Every window stays open at least its target and ends on a held wide shot of BEAT.windowTail. */
function assertWindows(tx: Transcript, log: Recorded[]) {
  assert.deepEqual(tx.windows.map((w) => w.targetMs), [45000, 22000, 20000]);
  for (const w of tx.windows) {
    assert.ok(w.lockAt - w.openAt >= w.targetMs, `window ${w.tag} open ${w.lockAt - w.openAt} ms >= ${w.targetMs}`);
    assert.ok(w.durationMs >= w.targetMs);
  }
  const g = gaps(log, 0).gaps.filter((x) => x.to === 'window_locked');
  assert.equal(g.length, 3);
  for (const x of g) assert.ok(x.ms >= BEAT.windowTail - 50 && x.ms <= BEAT.windowTail + 1000, `held tail ${x.ms} ms`);
}

/** FORMAT2 "Rules that now hold everywhere", checked on one transcript. */
function assertRules(tx: Transcript, log: Recorded[]) {
  const draw = { cards: tx.draw.cards.map((c) => ({ id: c.id, label: c.label, detect: '' })), twist: decks.twists[0]! } as unknown as TypeDraw;
  const ev = events(log);
  // not every line gets a spoken reaction: two or three per round, the rest the mark alone
  for (const round of [1, 2] as const) {
    const re = tx.lines.filter((l) => l.event === 'reaction' && l.scene === `round${round}`);
    const spoken = re.filter((l) => l.spoken);
    assert.ok(spoken.length >= 2 && spoken.length <= 3, `round ${round}: ${spoken.length} spoken reactions`);
    for (const l of re.filter((x) => !x.spoken)) assert.equal(l.text, '');
    // the spoken ones are the best and the worst turn by mark
    const rank = (m: Mark) => MARK_SCORE[m];
    const marks = re.map((l) => rank(l.mark!));
    assert.ok(spoken.some((l) => rank(l.mark!) === Math.max(...marks)) && spoken.some((l) => rank(l.mark!) === Math.min(...marks)));
  }
  // the cut follows the screen
  for (const c of tx.cuts) {
    const alive = Object.keys(c.roundMarks);
    const rm = c.roundMarks;
    const min = Math.min(...alive.map((id) => rm[id]!));
    assert.equal(rm[c.id], min, `round ${c.round}: ${c.name} had the (joint) lowest mark`);
    const charmed = (id: string) => tx.scored.some((s) => s.who === id && s.round === c.round && s.mark === 'charmed');
    if (charmed(c.id)) assert.ok(alive.every((id) => charmed(id)), 'a charmed suitor is never cut while another was not');
    const tied = alive.filter((id) => rm[id] === rm[c.id]);
    const st = c.standing;
    for (const id of tied) assert.ok(st[c.id]! <= st[id]!, 'among equal marks, the lowest total standing goes');
    assert.ok(c.bottom.includes(c.id));
    // a hidden card that broke the tie gives the cardHint reason
    const cut = tx.lines.find((l) => l.event === 'cut' && l.to === c.id)!;
    if (c.hintCard && tx.lines.length && /clue \d+/.test(cut.text)) assert.match(cut.text, new RegExp(`clue ${decks.cards.findIndex((x) => x.id === c.hintCard)}\\b`));
  }
  // the pick follows the dates
  const oo = tx.pick.oneOnOne;
  assert.ok(oo[tx.pick.winner]! >= oo[tx.pick.loser]!, 'the winner did at least as well in the one on one');
  if (oo[tx.pick.winner] === oo[tx.pick.loser]) {
    const st = standings([tx.pick.winner, tx.pick.loser], tx.scored, draw);
    assert.ok(st[tx.pick.winner]! >= st[tx.pick.loser]!, 'equal dates: the higher standing wins');
  }
  // the leader on standing goes first in the one on one
  const before = tx.standings.find((s) => s.after === 'round2')!.standing;
  assert.ok(before[tx.pick.first]! >= before[tx.pick.last]!);
  void ev;
}

// ------------------------------------------------------------------------------------------

test('full scripted episode on the v1 fixture bank (banks not yet upgraded still play)', async () => {
  const { tx, log, hub } = await play({ bankDir: V1, seed: 'episode-test' });
  assertEpisode(log);
  assertWindows(tx, log);
  assertRules(tx, log);
  assert.ok(tx.lines.some((l) => l.source === 'bank'), 'fixture lines aired');
  assert.equal(tx.cuts.length, 2);
  // a late joiner's snapshot
  const snap = hub.snapshot() as any;
  assert.equal(snap.type, 'snapshot');
  assert.equal(snap.phase, 'result');
  assert.equal(snap.windows.length, 3);
  assert.ok(snap.windows.every((w: any) => w.state === 'settled'));
  assert.equal(snap.match.meta.game, 'dating');
  assert.ok(snap.recentEvents.length > 40);
});

test('v1 compatibility: a v1 line exists, so no neutral filler airs for a banked bot', async () => {
  for (const seed of ['v1-a', 'v1-b', 'v1-c', 'v1-d']) {
    const { tx } = await play({ bankDir: V1, seed });
    const banked = new Set(['vesper', 'dash', 'tilly']);
    // beats with no v1 field (bottom, verdict, compare) and fixture gaps (twist intros) may be neutral
    const v2only = new Set(['bottom', 'verdict', 'compare', 'twistintro', 'question']);
    for (const l of tx.lines) {
      if (l.event === 'replay' || !banked.has(l.who) || v2only.has(l.kind)) continue;
      // the fixture has no roast or wingman lines: those twists have no v1 line either
      if (l.kind === 'twist' && tx.draw.twist.format.startsWith('target')) continue;
      assert.notEqual(l.source, 'fallback', `${seed}: ${l.who} ${l.event}/${l.kind} fell back: "${l.text}"`);
    }
  }
});

test('a full v2 episode through the fake Show: every v2 beat', async () => {
  const { tx, log } = await play({ bankDir: V2, seed: 'v2-full' });
  assertEpisode(log);
  assertWindows(tx, log);
  assertRules(tx, log);
  const ev = events(log);
  const up = tx.draw.cards[0]!;
  const noun = decks.cards.find((c) => c.id === up.id)!.noun ?? up.label.toLowerCase();
  // the intro names the face-up card in the star's words
  const intro = ev.find((e) => e.type === 'line' && e.data.kind === 'intro')!.data as EvLine;
  assert.ok(intro.text.includes(noun), `intro names ${noun}: ${intro.text}`);
  // four snap reactions in the walk-on, all spoken, all paired replies (six words at most)
  const snaps = tx.lines.filter((l) => l.event === 'reaction' && l.scene === 'walkon');
  assert.equal(snaps.length, 4);
  for (const s of snaps) {
    assert.ok(s.spoken && s.paired, `snap is a paired reply: ${s.text}`);
    assert.ok(s.words <= 6);
    assert.ok(!s.hits?.length || (s.hits.length === 1 && s.hits[0] === up.id), 'a snap is judged only against the face-up card');
  }
  // every spoken round reaction is the paired reply to the exact line (or a card line when the reply is missing)
  const spoken = tx.lines.filter((l) => l.event === 'reaction' && (l.scene === 'round1' || l.scene === 'round2') && l.spoken);
  assert.ok(spoken.length >= 4);
  for (const s of spoken) assert.ok(s.paired && /^(Warm|Cold), /.test(s.text), `paired: ${s.text}`);
  // warm with a charmed mark, cold otherwise
  for (const s of [...snaps, ...spoken]) assert.equal(s.text.startsWith('Warm'), s.mark === 'charmed', `${s.mark}: ${s.text}`);
  // round one: the fourth suitor replies to the leader
  const answers = tx.lines.filter((l) => l.scene === 'round1' && l.kind === 'answer');
  assert.equal(answers.length, 4);
  assert.ok(answers[3]!.to && answers[3]!.to !== tx.star.id, 'the fourth answer is said to a rival');
  // the bottom two are named, the cut reason quotes the suitor (or hints at the card)
  const bottoms = ev.filter((e) => e.type === 'bottom').map((e) => e.data as EvBottom);
  assert.equal(bottoms.length, 2);
  for (const b of bottoms) assert.ok(b.text.includes(tx.suitors.find((s) => s.id === b.who[0])!.name.split(' ')[0]!));
  for (const c of tx.cuts) {
    const cut = tx.lines.find((l) => l.event === 'cut' && l.to === c.id)!;
    if (c.hintCard) assert.match(cut.text, /clue \d+/);
    else if (c.hook) assert.ok(cut.text.includes(c.hook), `cut reason quotes "${c.hook}": ${cut.text}`);
  }
  // booth one: a read that names a card; booth two: no mirrored pair
  const conf = tx.lines.filter((l) => l.event === 'confession');
  const first = conf.find((l) => l.scene === 'booth1')!;
  assert.ok(first.guess, 'booth one opens with a read');
  const ec = ev.find((e) => e.type === 'confession')!.data as EvConfession;
  assert.deepEqual(ec.guess?.id, first.guess!.id);
  const b2 = conf.filter((l) => l.scene === 'booth2');
  assert.notEqual(b2[0]!.text.split(' ')[0], b2[1]!.text.split(' ')[0], 'booth two: not the same construction twice');
  // round two: the verdict names the frontrunner, the other two jab them, they come back
  const verdict = tx.lines.find((l) => l.kind === 'verdict')!;
  const front = verdict.to!;
  const jabs = tx.lines.filter((l) => l.scene === 'round2' && l.kind === 'jab');
  assert.equal(jabs.length, 3);
  assert.ok(jabs[0]!.to === front && jabs[1]!.to === front && jabs[2]!.who === front, 'two jabs at the frontrunner, one comeback');
  // the one on one: the second date opens with a steal; closers answer the prompt
  const duo = tx.lines.filter((l) => l.scene === 'oneonone' && l.event === 'line');
  assert.ok(duo.some((l) => /means it twice/.test(l.text)), 'the second date opens with a steal');
  const prompts = tx.lines.filter((l) => l.scene === 'oneonone' && l.event === 'reaction');
  for (const p of prompts) {
    const n = /Prompt one/.test(p.text) ? 'prompt one' : 'prompt two';
    const close = duo.filter((l) => l.who === p.to).at(-1)!;
    assert.ok(close.text.includes(n), `the closer answers ${n}: ${close.text}`);
    assert.equal(/warm|jingle, prompt two/.test(close.text) && !/cold/.test(close.text), p.mark !== 'cringing');
  }
  assert.ok(tx.lines.some((l) => l.kind === 'compare'));
  // the pick: holdCard, slot 1 on its label, the name last, the replays are the finalists'
  const pick = ev.find((e) => e.type === 'pick')!.data as EvPick;
  const winnerName = tx.suitors.find((s) => s.id === pick.who)!.name;
  assert.ok(pick.text.trim().replace(/[.!?]+$/, '').endsWith(winnerName), `name last: ${pick.text}`);
  const r1 = ev.find((e) => e.type === 'reveal' && e.data.slot === 1)!.data as EvReveal;
  assert.equal(r1.text, `${tx.draw.cards[1]!.label}.`);
  const replays = ev.filter((e) => e.type === 'replay').map((e) => e.data as EvReplay);
  assert.deepEqual(new Set(replays.slice(0, 2).map((r) => r.who)), new Set([tx.pick.winner, tx.pick.loser]));
  // the reveal lists the booth reads
  const g = tx.guesses;
  assert.ok(g.length >= 1);
  const all = ev.filter((e) => e.type === 'reveal').flatMap((e) => (e.data as EvReveal).guesses ?? []);
  assert.equal(all.length, g.length, 'every read is settled at a reveal');
});

test('the rules hold over many v2 episodes (cut, pick, voices, lineup)', async () => {
  const session = await createSession({ roster, memory: 'fresh', usedPath: null, bankDir: V2, seed: 'rules', waitCapMs: Infinity, log: () => {} });
  let hint = 0;
  let lastWon = 0;
  for (let i = 0; i < 30; i++) {
    const { hub, log } = recordingHub({ speed: Infinity, seed: `rules-${i}` });
    const tx = await session.runOne(hub.newShow());
    assertRules(tx, log);
    if (tx.cuts.some((c) => c.hintCard)) hint++;
    if (tx.pick.winner === tx.pick.last) lastWon++;
    // the opener lineup: no two openers start the same way
    const openers = tx.lines.filter((l) => l.kind === 'opener').map((l) => l.text.split(/\W+/)[0]!.toLowerCase());
    assert.equal(new Set(openers).size, 4, `no two openers built the same way: ${openers.join(', ')}`);
  }
  assert.ok(lastWon > 3 && lastWon < 27, `the last speaker in the one on one is not a tell (${lastWon}/30)`);
  void hint;
});

test('charmed is rare: a turn-on hit is charmed, otherwise about one time in ten', async () => {
  const brain = createScriptedBrain({ decks, bankDir: V2, rng: Math.random });
  const [star, dash] = [roster[0]!, roster[1]!];
  const type = { cards: [decks.cards[0]!, decks.cards[1]!, decks.cards[2]!], twist: decks.twists[0]! } as TypeDraw;
  const ctx = { episode: 1, star, suitors: roster.slice(1, 5), alive: roster.slice(1, 5).map((b) => b.id), room: [], marks: {}, faceUp: type.cards[0], type, records: {}, memory: [], recent: [] };
  const count: Record<string, number> = { charmed: 0, unsure: 0, cringing: 0 };
  for (let i = 0; i < 3000; i++) count[(await brain.react({ star, to: dash, line: 'x', maxWords: 10, ctx, hint: { beat: 'round' } })).mark]!++;
  const share = count.charmed! / 3000;
  const want = NO_HIT_MIX.find(([m]) => m === 'charmed')![1] / NO_HIT_MIX.reduce((a, [, w]) => a + w, 0);
  assert.ok(Math.abs(share - want) < 0.03, `charmed without a hit ${share}`);
  for (const tags of [[type.cards[0].id], [type.cards[1].id]]) assert.equal((await brain.react({ star, to: dash, line: 'x', tags, maxWords: 10, ctx })).mark, 'charmed');
  assert.equal((await brain.react({ star, to: dash, line: 'x', tags: [type.cards[2].id], maxWords: 10, ctx })).mark, 'cringing');
  // a snap is judged only against the face-up card: the dealbreaker does not count in the walk-on
  const snap = await brain.react({ star, to: dash, line: 'x', tags: [type.cards[2].id, type.cards[1].id], maxWords: 6, ctx, hint: { beat: 'snap' } });
  assert.deepEqual(snap.hits, []);
});

test('no line is repeated within ten episodes while the pool allows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dating-pool-'));
  fs.mkdirSync(path.join(dir, 'suitors'), { recursive: true });
  const openers = Array.from({ length: REPEAT_WINDOW + 2 }, (_, i) => ({ t: `Opener number ${i} from the pool.`, tags: i < 3 ? ['confidence'] : [] }));
  fs.writeFileSync(path.join(dir, 'suitors', 'dash.json'), JSON.stringify({ id: 'dash', openers }));
  const brain = createScriptedBrain({ decks, bankDir: dir });
  const [star, dash] = [roster[0]!, roster[1]!];
  const said: string[] = [];
  for (let ep = 1; ep <= 24; ep++) {
    const ctx = { episode: ep, star, suitors: roster.slice(1, 5), alive: [], room: [], marks: {}, faceUp: decks.cards[0]!, records: { dash: { played: 3, wins: 1 } }, memory: [], recent: [] } as any;
    said.push((await brain.speak({ who: dash, kind: 'opener', maxWords: 12, ctx })).text);
  }
  for (let i = 0; i < said.length; i++) for (let j = i + 1; j < Math.min(said.length, i + REPEAT_WINDOW); j++) assert.notEqual(said[i], said[j], `episodes ${i + 1} and ${j + 1}`);
});

test('survives missing banks (neutral fallback lines only)', async () => {
  const { tx, log } = await play({ bankDir: path.join(HERE, 'fixtures', 'empty'), seed: 'no-banks' });
  assertEpisode(log);
  assert.ok(tx.lines.filter((l) => l.event !== 'replay' && l.text).every((l) => l.source === 'fallback'));
});

test('same seed, same episode', async () => {
  const a = await play({ bankDir: V2, seed: 'repeat' });
  const b = await play({ bankDir: V2, seed: 'repeat' });
  assert.deepEqual(a.tx.lines.map((l) => l.text), b.tx.lines.map((l) => l.text));
  assert.equal(a.tx.pick.winner, b.tx.pick.winner);
});

test('a brain that throws or hangs never stops the show', async () => {
  const session = await createSession({ roster, memory: 'fresh', usedPath: null, bankDir: V1, seed: 'broken', log: () => {}, callTimeoutMs: 50 });
  let n = 0;
  session.brains.brain = {
    kind: 'model',
    speak: async () => {
      if (++n % 2) throw new Error('boom');
      return new Promise(() => {}); // hangs
    },
    react: async () => ({ mark: 'nope' as Mark, text: '', hits: [], source: 'model' }),
    choose: async () => 'not-a-suitor',
  };
  const { hub, log } = recordingHub({ speed: 200, seed: 'broken' });
  const tx = await session.runOne(hub.newShow());
  // a late line may hold the stage for the 6 s wait cap (SPEC), never longer
  assertEpisode(log, 6600);
  assert.ok(tx.rejected.length > 10);
});

test('windows hold their full length: short confessions bring the third beat', async () => {
  const session = await createSession({ roster, memory: 'fresh', usedPath: null, bankDir: V2, seed: 'short', waitCapMs: Infinity, log: () => {} });
  const inner = session.brains.brain;
  session.brains.brain = {
    kind: inner.kind,
    // eight words: two of these leave both booths short of their targets
    speak: async (r: SpeakReq) => (r.kind === 'confession' ? { text: 'I think it went fine. I hope so.', source: 'bank', tags: [] } : inner.speak(r)),
    react: (r) => inner.react(r),
    choose: (r) => inner.choose(r),
  };
  const { hub, log } = recordingHub({ speed: Infinity, seed: 'short' });
  const tx = await session.runOne(hub.newShow());
  assertEpisode(log);
  assertWindows(tx, log);
  assert.deepEqual(tx.windows.slice(1).map((w) => w.beats), [3, 3], 'a third confession in each booth');
  const conf = events(log).filter((e) => e.type === 'confession').map((e) => e.data as EvConfession);
  assert.equal(conf.length, 6);
  assert.equal(new Set(conf.slice(0, 3).map((c) => c.who)).size, 3, 'booth one: all three suitors left');
  assert.ok(conf.every((c) => c.who !== tx.star.id), 'never the star');
});

test('marks cohere with hits whatever the brain says', async () => {
  const session = await createSession({ roster, memory: 'fresh', usedPath: null, bankDir: V1, seed: 'coherence', waitCapMs: Infinity, log: () => {} });
  const inner = session.brains.brain;
  let n = 0;
  session.brains.brain = {
    kind: 'model',
    speak: (r) => inner.speak(r),
    // a careless brain: cringes at turn-ons, swoons at the dealbreaker
    react: async (r) => {
      const t = r.ctx.type!;
      const k = n++ % 3;
      const hits = k === 0 ? [t.cards[1].id] : k === 1 ? [t.cards[2].id] : [t.cards[0].id];
      const mark: Mark = k === 1 ? 'charmed' : 'cringing';
      return { mark, hits, text: 'Well, well, well.', source: 'model' };
    },
    choose: (r) => inner.choose(r),
  };
  const { hub, log } = recordingHub({ speed: Infinity, seed: 'coherence' });
  const tx = await session.runOne(hub.newShow());
  assertEpisode(log);
  const db = tx.draw.cards[2]!.id;
  const reactions = tx.lines.filter((l) => l.event === 'reaction');
  assert.equal(reactions.length, 13, '4 snaps, 4 + 3 round turns, 2 one-on-one prompts');
  for (const r of reactions) {
    if (r.hits!.includes(db)) assert.equal(r.mark, 'cringing');
    else if (r.hits!.length) assert.notEqual(r.mark, 'cringing', 'a turn-on hit never cringes');
  }
  for (const sc of tx.scored) if (sc.hits.length) assert.equal(sc.mark, sc.hits.includes(db) ? 'cringing' : 'unsure', 'scoring uses the fixed mark');
  // snaps only ever count the face-up card
  for (const sc of tx.scored.filter((s) => s.round === 0)) assert.ok(sc.hits.every((h) => h === tx.draw.cards[0]!.id));
  const aired = events(log).filter((e) => e.type === 'reaction').map((e) => (e.data as EvReaction).mark);
  assert.deepEqual(aired, reactions.map((r) => r.mark), 'the stage gets the fixed mark');
  // a charmed reaction forced to cringe does not air its warm text
  for (const r of reactions.filter((x) => x.markWas === 'charmed')) assert.notEqual(r.text, 'Well, well, well.');
});

test('scripted brain exposes bank candidates and paired replies for the hybrid brain', async () => {
  const brain = createScriptedBrain({ decks, bankDir: V2 });
  const [star, dash, tilly] = [roster[0]!, roster[1]!, roster[2]!];
  const ctx = {
    episode: 1, star, suitors: roster.slice(1, 5), alive: roster.slice(1, 5).map((b) => b.id), room: [], marks: {},
    faceUp: decks.cards.find((c) => c.id === 'plans')!, question: decks.questions[0], records: {}, memory: [], recent: [],
  };
  const req: SpeakReq = { who: dash, kind: 'answer', maxWords: 20, ctx };
  const c = brain.candidates(req, 5);
  assert.ok(c.length >= 2);
  assert.ok(c[0]!.tags?.includes('plans'), 'the face-up card first');
  assert.ok(c.every((x) => !x.hook || x.text.includes(x.hook)), 'hooks come with the line');
  assert.deepEqual(brain.candidates(req, 5), c, 'candidates do not mark anything used');
  brain.markUsed(c[0]!.text);
  const after = brain.candidates(req, 5);
  assert.equal(after.length, c.length);
  const draw = { cards: [decks.cards[0]!, decks.cards[1]!, decks.cards[2]!] as const, twist: decks.twists[0]! };
  const rctx = { ...ctx, type: { cards: [...draw.cards], twist: draw.twist } as any };
  const rreq = { star, to: dash, line: c[0]!.text, maxWords: 10, ctx: rctx };
  const pair = brain.replyPair(rreq);
  assert.ok(pair && pair.warm.startsWith('Warm') && pair.cold.startsWith('Cold'), 'the paired reply to that exact line');
  assert.equal(brain.reactCandidates(rreq, 'charmed', [], 3)[0], pair!.warm, 'the paired reply is the first candidate');
  assert.equal(brain.reactCandidates(rreq, 'cringing', [], 3)[0], pair!.cold);
  const t2 = { star, to: tilly, line: 'not a bank line', maxWords: 10, ctx: rctx };
  assert.equal(brain.replyPair(t2), null);
  const rc = brain.reactCandidates(t2, 'charmed', [], 3);
  assert.ok(rc.length >= 1 && rc.every((t) => typeof t === 'string'), 'falls back to the star bank');
});

test('an unpaid account (HTTP 402): one call, then the scripted brain plays the episode, no time lost on air', async () => {
  const { createModelBrain } = await import('../show/brains/model.ts');
  const session = await createSession({ roster: roster.map((b) => ({ ...b, model: 'prov/some-model' })), memory: 'fresh', usedPath: null, bankDir: V2, seed: 'unpaid', log: () => {} });
  let calls = 0;
  const fetch402 = (async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: 402, message: 'Insufficient credits' } }), { status: 402, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const costFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dating-402-')), 'cost.json');
  session.brains.brain = createModelBrain({ roster: session.roster(), decks, fallback: session.brains.fallback, fetch: fetch402, apiKey: 'test-key', costFile, modelsInfoFile: '/nonexistent', log: () => {} });
  const { hub, log } = recordingHub({ speed: 200, seed: 'unpaid' });
  const tx = await session.runOne(hub.newShow());
  assertEpisode(log);
  assert.equal(calls, 1, 'one HTTP call for the whole episode');
  assert.equal(tx.late, 0, 'nothing waited on the wait cap');
  // the scripted brain's lines and judgments, not neutral filler
  const filler = tx.lines.filter((l) => l.event !== 'replay' && l.source === 'fallback' && !['bottom', 'verdict', 'compare'].includes(l.kind) && l.kind !== 'question' && l.kind !== 'twistintro');
  assert.ok(filler.length <= 2, `no neutral filler: ${filler.map((l) => `${l.kind}: ${l.text}`).join(' | ')}`);
});
