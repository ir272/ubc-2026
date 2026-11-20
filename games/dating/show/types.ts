// Shared contract for the dating show ("Compatibility Mode"). Erasable TypeScript only
// (no enums, no parameter properties): node runs these files directly.
// The show script runs in node (runner or harness). The stage runs in the browser and only
// ever sees feed messages. Everything the two sides share is in this file.

// ------------------------------------------------------------------------------------------
// Roster (bots.json)
// ------------------------------------------------------------------------------------------

export type Role = 'star' | 'suitor';

export interface Bot {
  id: string; // 'dash'
  role: Role;
  name: string; // 'Dash'
  /** Six words at most. Shown under the name tag on walk-on. */
  tagline: string;
  pronouns: 'he' | 'she' | 'they' | 'it';
  /** Any OpenRouter model id. No code path names a model. */
  model: string;
  /** The persona, written to the model in second person: voice, want, flaw, secret, way of flirting. */
  instructions: string;
  /** Hard voice rules the content check enforces softly and prompts repeat (short list). */
  tics?: string[];
  look: { cast: string; accent: string };
  /** Speech blip synthesis: base pitch in Hz, syllables per second, waveform. */
  voice?: { pitch: number; rate: number; wave: 'sine' | 'triangle' | 'square' | 'sawtooth' };
}

// ------------------------------------------------------------------------------------------
// Decks (show/decks.json). Ids are frozen; writers fill text.
// ------------------------------------------------------------------------------------------

export interface TypeCard {
  id: string; // 'puns'
  label: string; // 'Bad puns' (three words at most, reads after "Turn-on:" and "Dealbreaker:")
  /** a noun phrase for the middle of a spoken sentence, e.g. "bad puns", "money talk" (fills {card}) */
  noun?: string;
  /** One sentence for model prompts: what counts as showing this trait in a line. */
  detect: string;
}
export interface TwistCard {
  id: string; // 'roast-left'
  label: string; // 'The Roast'
  rule: string; // ten words at most, printed on the card
  /** How round two runs for this card. */
  format: 'solo' | 'target-left' | 'target-right' | 'caller';
  /** One or two sentences for model prompts: what each suitor must do. */
  brief: string;
  maxWords: number; // per suitor line, 20 unless the card says less
}
export interface Question {
  id: string; // 'q-first-date'
  theme: string; // plain-English theme, for prompts and for writers
}
export interface Decks {
  cards: TypeCard[];
  twists: TwistCard[];
  questions: Question[];
}

/** The star's hidden type for one episode, derived from win.sealed. */
export interface TypeDraw {
  /** slot 0 = the face-up turn-on, slot 1 = hidden turn-on, slot 2 = hidden dealbreaker */
  cards: [TypeCard, TypeCard, TypeCard];
  twist: TwistCard;
}

// ------------------------------------------------------------------------------------------
// Line banks (show/bank/**). The scripted brain plays from these; the model brain uses them
// as voice examples and as fallbacks.
// ------------------------------------------------------------------------------------------

/** One authored line. `tags` = ids of type cards this line plainly shows (0 to 3). */
export interface L {
  t: string;
  tags?: string[];
  /** v2: two to five consecutive words copied exactly from `t`: the phrase the star can quote back (fills {hook}) */
  hook?: string;
}

export interface SuitorBank {
  id: string;
  /** 12 words at most. May use {played} {wins} {losses} in up to two of them. */
  openers: L[];
  /** questionId -> two or more answers, 20 words at most. */
  answers: Record<string, L[]>;
  confessions: {
    /** about the star or their own chances */
    star: L[];
    /** about a rival; text uses {rival} */
    rival: L[];
    /** said after the star cringed at them */
    afterCringe: L[];
    /** said after the star was charmed */
    afterCharm: L[];
    /** final two: about the other finalist, uses {rival} */
    final: L[];
    /** v2: a read of the star after one of her reactions: a guess at what she likes. Uses {card} (a noun phrase) and may use {star}. */
    guess?: L[];
    /** v2: a guess at what the star cannot stand. Uses {card}, may use {star}. */
    fear?: L[];
  };
  /** twistId -> lines for solo/caller twists. */
  twists: Record<string, L[]>;
  /** for 'roast-left': targetSuitorId -> line */
  roast: Record<string, L>;
  /** for 'wingman': targetSuitorId -> line (pitching the rival, sabotaging a little) */
  wingman: Record<string, L>;
  /** ten words at most. An undercut thrown at a rival mid-round. targetId -> line, plus 'any'. */
  jabs: Record<string, L[]>;
  oneOnOne: {
    /** first line alone with the star; starId -> lines, plus 'any' */
    open: Record<string, L[]>;
    /** last line, after the star has answered: warm if she was charmed, cold if not */
    closeWarm: L[];
    closeCold: L[];
    /** v2: the last line of the date, ANSWERING that star's prompt. starId -> one entry per line in that star's oneOnOne[thisSuitor], same order */
    close?: Record<string, { warm: L; cold: L }[]>;
    /** v2: opening line of the SECOND date: undercuts or steals from the finalist who just went. Uses {rival}. */
    steal?: L[];
  };
  /** v2: ten words at most. The frontrunner's comeback after the others pile on. May use {rival}. */
  comeback?: L[];
  /** leaving after a cut */
  exit: L[];
  /** picked */
  win: L[];
  /** lost the final */
  lose: L[];
}

export type Mark = 'charmed' | 'unsure' | 'cringing';

export interface StarBank {
  id: string;
  intro: L[]; // opening the show, 14 words at most
  /** questionId -> the question in this star's voice, 18 words at most */
  questions: Record<string, string>;
  /** reaction to a suitor's line when no card decides it. suitorId -> mark -> lines, 10 words at most */
  react: Record<string, Record<Mark, string[]>>;
  /** reaction when the line shows a card in the star's type. cardId -> { on: liked it, off: hated it } */
  cardReact: Record<string, { on: string; off: string }>;
  /** the one-line reason when cutting. suitorId -> lines, 14 words at most */
  cut: Record<string, string[]>;
  /** twistId -> the star reading the card and setting the task, 18 words at most */
  twistIntro: Record<string, string>;
  /** the ex who calls in on the 'ex-calls' twist */
  ex: { name: string; lines: string[] };
  /** the star's middle line in a one on one. suitorId -> lines, 14 words at most */
  oneOnOne: Record<string, string[]>;
  /** the line before the held pause, 12 words at most */
  hold: string[];
  /** choosing. suitorId -> lines, 16 words at most */
  pick: Record<string, string[]>;
  /** as a hidden card turns over: {card} is replaced by the label. on = turn-on, off = dealbreaker, none = nobody found it */
  reveal: { on: string[]; off: string[]; none: string[] };
  /** signing off, 12 words at most */
  outro: string[];

  // ---- v2 (all optional so older banks still load) ----
  /** the bottom two, named before a cut. Uses {a} and {b}. 12 words at most. */
  bottom?: string[];
  /** the cut reason, quoting what they said. Uses {name} and {hook}. 14 words at most. */
  cutFrames?: string[];
  /** cardId -> a cut reason for when the hidden dealbreaker (or a missing turn-on) decided it: hints at the card without naming it. Uses {name}. 14 words at most. */
  cardHint?: Record<string, string>;
  /** twistId -> after the three turns: names whose turn landed ({name}) and settles the card's own game. 12 words at most. */
  verdict?: Record<string, string>;
  /** one line weighing the two finalists after both dates. Uses {a} (went first) and {b}. 12 words at most. */
  compare?: string[];
  /** cardId -> the hold speech when that card is the hidden turn-on: the quality that won, true of both finalists, no name. 14 words at most. */
  holdCard?: Record<string, string>;
  /** the pick, with the name LAST. Uses {hook} (the winner's best line) and ends with {name}. 16 words at most. */
  pickFrames?: string[];
}

/** v2: show/bank/replies/<starId>/<suitorId>.json. The star's reply to one exact suitor line. */
export interface ReplyBank {
  star: string;
  suitor: string;
  /** key = the suitor line's text exactly as in the suitor bank. warm = said with a charmed mark, cold = with a cringing mark. Ten words at most (six for openers). */
  replies: Record<string, { warm: string; cold: string }>;
}

// ------------------------------------------------------------------------------------------
// Feed events (GameEvent.type and its data). Names are frozen at the 16:00 checkpoint.
// ------------------------------------------------------------------------------------------

export type SceneId =
  | 'title' // show title, before window A opens
  | 'walkon' // window A open
  | 'round1'
  | 'booth1' // window B open: confessions
  | 'round2'
  | 'booth2' // window C open: confessions
  | 'oneonone'
  | 'pick'
  | 'reveal'
  | 'result';

export interface CastMember {
  id: string;
  name: string;
  tagline: string;
  pronouns: string;
  accent: string;
  cast: string; // assets/cast/<cast>/manifest.json
  model: string; // shown nowhere on stage; the platform may show it
  voice?: Bot['voice'];
  record: { played: number; wins: number };
}
export interface SuitorMember extends CastMember {
  spot: number; // 0..3, left to right as the viewer sees the row
}

/** match.meta: always present in a snapshot, so a late joiner can build the cast. */
export interface DatingMeta {
  game: 'dating';
  show: string; // 'Compatibility Mode'
  episode: number;
  star: CastMember;
  suitors: SuitorMember[];
}

export interface CardView {
  slot: 0 | 1 | 2;
  faceUp: boolean;
  /** only when faceUp */
  kind?: 'on' | 'off';
  id?: string;
  label?: string;
}

/** Complete public state. Sent with every `scene` event so a late joiner needs only the last one. */
export interface PublicState {
  scene: SceneId;
  /** on-stage round name, e.g. 'Round One' */
  label: string;
  alive: string[]; // suitor ids still in, in spot order
  cut: { id: string; round: 1 | 2 | 3 }[]; // 3 = lost the final
  marks: Record<string, Mark[]>; // suitorId -> every mark so far, oldest first
  cards: CardView[];
  twist: { id: string; label: string; rule: string } | null; // null until turned
  /** which betting window this scene belongs to, if any */
  window: 'A' | 'B' | 'C' | null;
  /** one on one: the finalist now alone with the star */
  focus: string | null;
  winner: string | null;
}

export type LineKind =
  | 'intro'
  | 'opener'
  | 'question'
  | 'answer'
  | 'twistintro'
  | 'twist'
  | 'jab'
  | 'caller'
  | 'duo' // one on one, either side
  | 'exit'
  | 'verdict' // v2: the star names the best turn of round two
  | 'compare' // v2: the star weighs the two finalists
  | 'bottom' // v2: the star names the bottom two
  | 'hold'
  | 'win'
  | 'lose'
  | 'outro';

export interface EvScene { state: PublicState; ms: number } // ms = length of the title call before lines start
export interface EvCast { meta: DatingMeta }
export interface EvEnter { who: string; spot: number | null; ms: number } // walk-on (star: spot null)
export interface EvLine { who: string; name: string; text: string; ms: number; kind: LineKind; to?: string; audio?: string }
/** text may be empty: the star gives the mark with a look and says nothing (ms is then about 1500) */
export interface EvReaction { who: string; name: string; to: string; mark: Mark; text: string; ms: number }
/** guess (v2): the suitor's read of the star: which trait they think she likes (on) or cannot stand (off) */
export interface EvConfession { who: string; name: string; text: string; ms: number; about?: string; guess?: { id: string; label: string; kind: 'on' | 'off' } }
/** v2: the two lowest are lit up before a cut. text = the star naming both; then holdMs of silence. ms includes the hold. */
export interface EvBottom { who: [string, string]; by: string; name: string; text: string; ms: number; holdMs: number }
/** v2: an earlier line played back (in the reveal, or in the hold speech). slot = the hidden card it is evidence for. */
export interface EvReplay { who: string; name: string; text: string; ms: number; slot?: 1 | 2 }
export interface EvTwist { id: string; label: string; rule: string; ms: number }
export interface EvCut { who: string; by: string; round: 1 | 2; text: string; ms: number } // text = the star's one-line reason
export interface EvHold { finalists: [string, string]; ms: number } // the held pause, nothing is said
export interface EvPick { who: string; loser: string; by: string; text: string; ms: number }
export interface EvReveal {
  slot: 1 | 2;
  card: { id: string; label: string; kind: 'on' | 'off' };
  /** the line that hit or broke the card, replayed; absent when nobody touched it */
  quote?: { who: string; name: string; text: string };
  /** the star's line as it turns */
  text: string;
  ms: number;
  /** v2: suitors who guessed at this card in the booth, and whether they were right */
  guesses?: { who: string; name: string; right: boolean }[];
}
export interface EvResult {
  winner: string;
  star: string;
  order: string[]; // suitor ids, first cut to winner
  records: Record<string, { played: number; wins: number }>;
  next?: { star: string; suitors: string[] }; // names for the next episode's teaser
  ms: number;
}

export type DatingEventType =
  | 'cast' | 'scene' | 'enter' | 'line' | 'reaction' | 'confession' | 'twist' | 'bottom' | 'cut' | 'hold' | 'replay' | 'pick' | 'reveal' | 'result';

// ------------------------------------------------------------------------------------------
// Brains. One interface, two implementations: scripted (bank) and model (OpenRouter).
// ------------------------------------------------------------------------------------------

/** One public thing that happened in the room. Confessions are never in a suitor's or star's view. */
export interface RoomLine {
  who: string; // bot id, or 'ex'
  name: string;
  text: string;
  kind: LineKind | 'reaction' | 'cut' | 'confession';
  to?: string;
  mark?: Mark;
}

export interface Ctx {
  episode: number;
  star: Bot;
  suitors: Bot[]; // all four, spot order
  alive: string[];
  /** public transcript so far, oldest first (no confessions) */
  room: RoomLine[];
  marks: Record<string, Mark[]>;
  faceUp: TypeCard; // the turn-on everyone can see
  /** only passed when the speaker is the star */
  type?: TypeDraw;
  twist?: TwistCard; // once turned
  question?: Question;
  records: Record<string, { played: number; wins: number }>;
  /** up to three memory lines for the speaker */
  memory: string[];
  /** lines this speaker has said in recent episodes (do not repeat) */
  recent: string[];
}

export interface SpeakReq {
  who: Bot;
  kind: LineKind | 'confession' | 'cutline' | 'pickline' | 'reveal';
  maxWords: number;
  ctx: Ctx;
  /** the person spoken to or about */
  target?: Bot;
  /** kind-specific extras: confession flavour, the star's last mark, the reveal verdict, the cut reason facts */
  hint?: Record<string, unknown>;
}
export interface Spoken {
  text: string;
  source: 'model' | 'bank' | 'fallback';
  /** scripted brain: the authored tags of the line it chose */
  tags?: string[];
  /** v2 (added by the show builder): the chosen bank line's `hook`, for {hook} in cut and pick frames */
  hook?: string;
  /** v2 (added by the show builder): booth read: the card id the line's {card} names */
  guess?: string;
}
export interface ReactReq {
  star: Bot;
  to: Bot;
  line: string;
  /** authored tags if the line came from the bank */
  tags?: string[];
  maxWords: number;
  ctx: Ctx; // ctx.type is set
  /** v2 (added by the show builder): the line's `hook` (two to five words from it) when it came from the bank */
  hook?: string;
  /** v2 (added by the show builder): beat: 'snap' (walk-on, judged only against the face-up card), 'round', 'duo' */
  hint?: Record<string, unknown>;
}
export interface Reacted {
  mark: Mark;
  text: string;
  /** which of the star's three cards this line showed (card ids), empty if none */
  hits: string[];
  source: 'model' | 'bank' | 'fallback';
  /** v2 (added by the show builder): the text is the paired reply to this exact line (show/bank/replies) */
  paired?: boolean;
}

export interface Brain {
  readonly kind: 'scripted' | 'model';
  speak(req: SpeakReq): Promise<Spoken>;
  react(req: ReactReq): Promise<Reacted>;
  /** Break a tie between suitors with equal standing. Returns one id from `among`. */
  choose(req: { star: Bot; among: Bot[]; purpose: 'cut' | 'pick'; ctx: Ctx }): Promise<string>;
}
