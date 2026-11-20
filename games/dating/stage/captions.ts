// DOM text over the stage, flat and plain (stage/LOOK.md "Clean look"). The whole list: the round
// name (small, top left), the star's three type cards (top right: a turned card is its label and
// one small glyph; a hidden card is a plain back), the subtitle bar with the speaker's name, name
// tags over the suitors in the wide and row shots only, a card that comes up large for its own
// beat when it turns (a hidden type card at the reveal, the twist), the title call (the round name
// on a plain field, short) and the result band. Panels are flat rectangles with a small radius.
// Sentence case, no all caps, no em dashes. Sized at 1280 and scaled by --s, so it reads at 960x540.
import '@fontsource/dela-gothic-one/400.css';
import '@fontsource/zen-maru-gothic/500.css';
import '@fontsource/zen-maru-gothic/700.css';
import '@fontsource/zen-maru-gothic/900.css';
import type { CardView, SceneId } from '../show/types.ts';
import { BASE_WIDTH, CAPTION, FONTS, PALETTE, TITLE_CALL, TYPE, mix, textOn } from './theme.ts';

export type SayStyle = 'normal' | 'private' | 'replay' | 'caller';

type Kind = 'on' | 'off';

const px = (n: number) => `calc(${n}px * var(--s))`;
const { ink, milk, coral, mint, tungsten, night } = PALETTE;
/** a plain card back: its kind's colour sunk toward ink */
const BACK = { on: mix(mint, ink, 0.6), off: mix(coral, ink, 0.6) };
const R = px(6); // the one small radius every panel shares
const R_BIG = px(10);

/** the title call wipes across: off left, covering, off right */
const WIPE_PRE = 'polygon(-30% 0, -30% 0, -50% 100%, -50% 100%)';
const WIPE_ON = 'polygon(-30% 0, 150% 0, 130% 100%, -50% 100%)';
const WIPE_OUT = 'polygon(150% 0, 150% 0, 130% 100%, 130% 100%)';
/** a title call is short: at most this long on screen (seconds), however long its scene's gap */
const TITLE_MAX = 1.8;

// subtitle bar geometry at 1280
const SUB_W = 1010;
const SUB_H = 140;
// the star's hand: one row, one height, one gap
const HAND_H = 46;
const HAND_GAP = 10;

const CSS = `
.cm-ov{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:${FONTS.body};color:${milk};--s:1;-webkit-font-smoothing:antialiased;line-height:1}
.cm-ov *{box-sizing:border-box}
.cm-ov svg{display:block;overflow:visible}

/* ---------------------------------------------------------------- round name */
.cm-round{position:absolute;z-index:4;left:${px(20)};top:${px(20)};display:none;align-items:center;height:${px(HAND_H)};background:${ink};font-family:${FONTS.display};font-size:${px(TYPE.round)};padding:0 ${px(16)} ${px(2)};border-radius:${R};white-space:nowrap;transition:opacity .2s}
.cm-round.on{display:flex}
.cm-ov.won .cm-round{opacity:0}

/* ---------------------------------------------------------------- the star's hand: one row */
.cm-hand{position:absolute;z-index:4;right:${px(20)};top:${px(20)};display:flex;align-items:stretch;gap:${px(HAND_GAP)};height:${px(HAND_H)};transition:opacity .18s}
.cm-ov.won .cm-hand,.cm-ov.bigup .cm-hand{opacity:0}
.cm-hc{position:relative;flex:none;height:100%}

/* a card: face up is its kind's colour with ink text; face down is a plain back */
.cm-k{position:relative;height:100%;display:flex;align-items:center;justify-content:center;gap:${px(7)};text-align:center;color:${ink};background:var(--kc);border-radius:${R};transition:transform .13s cubic-bezier(.55,0,1,.45)}
.cm-k.on{--kc:${mint};--kb:${BACK.on}}
.cm-k.off{--kc:${coral};--kb:${BACK.off}}
.cm-k.bk{background:var(--kb)}
.cm-k.sq{transform:perspective(${px(700)}) rotateY(84deg)}
.cm-k.open{transition:transform .16s cubic-bezier(0,.55,.45,1)}
.cm-k .pip{flex:none;width:${px(15)};height:${px(14)}}
.cm-k .pip path{fill:${ink}}
.cm-k strong{font-size:${px(TYPE.card)};font-weight:900;white-space:nowrap}
.cm-k.bk .pip,.cm-k.bk strong{display:none}
.cm-hc .cm-k.bk{width:${px(34)}}
.cm-hc .cm-k:not(.bk){padding:0 ${px(13)} ${px(2)} ${px(11)}}

/* ---------------------------------------------------------------- a card that comes up large for its beat */
.cm-big{position:absolute;z-index:6;right:${px(20)};top:${px(20)};width:${px(380)};height:${px(190)};transform-origin:top right;transform:scale(.4);opacity:0;visibility:hidden;transition:opacity .12s,transform .24s cubic-bezier(.3,.7,.3,1)}
.cm-big.vis{opacity:1;visibility:visible;transform:none}
.cm-big .cm-k,.cm-twist .cm-k{border-radius:${R_BIG}}
.cm-big .pip{display:none}
.cm-big strong{font-family:${FONTS.display};font-weight:400;font-size:${px(TYPE.bigLabel)};line-height:1.06;white-space:normal;padding:0 ${px(28)};text-wrap:balance}
.cm-big strong.long{font-size:${px(TYPE.bigLabel - 8)}}

.cm-twist{position:absolute;z-index:8;left:50%;bottom:${px(196)};width:${px(600)};height:${px(210)};margin-left:${px(-300)};transform:translateY(${px(24)});opacity:0;visibility:hidden;transition:opacity .14s,transform .26s cubic-bezier(.3,.7,.3,1)}
.cm-twist.vis{opacity:1;visibility:visible;transform:none}
.cm-twist .cm-k{flex-direction:column;gap:0;--kc:${tungsten};--kb:${ink}}
.cm-twist .bw{display:none;font-family:${FONTS.display};font-size:${px(TYPE.twistBack)};line-height:1;color:${tungsten}}
.cm-twist .cm-k.bk .bw{display:block}
.cm-twist .cm-k.bk .l,.cm-twist .cm-k.bk .r{display:none}
.cm-twist .l{font-family:${FONTS.display};font-size:${px(TYPE.twistLabel)};line-height:1;padding:0 ${px(30)};white-space:nowrap}
.cm-twist .r{font-size:${px(TYPE.twistRule)};font-weight:900;margin-top:${px(16)};line-height:1.2;padding:0 ${px(36)}}

/* ---------------------------------------------------------------- title call: the round name on a plain field */
.cm-tc{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;visibility:hidden;clip-path:${WIPE_PRE};transition:clip-path .3s cubic-bezier(.7,0,.25,1);background:var(--bg)}
.cm-tc.vis{visibility:visible}
.cm-tc.in{clip-path:${WIPE_ON}}
.cm-tc.out{clip-path:${WIPE_OUT};transition-duration:.28s;transition-timing-function:cubic-bezier(.6,0,.4,1)}
.cm-tc.snap{transition:none!important}
.cm-tc .tt{font-family:${FONTS.display};color:${milk};line-height:1.05;white-space:nowrap}

/* ---------------------------------------------------------------- subtitle bar */
.cm-sub{position:absolute;z-index:10;left:50%;bottom:${px(28)};width:${px(SUB_W)};height:${px(SUB_H)};margin-left:${px(-SUB_W / 2)};background:${CAPTION.panel};border-radius:${R};opacity:0;transform:translateY(${px(8)});transition:opacity .1s,transform .14s}
.cm-sub.on{opacity:1;transform:none}
.cm-sub.on.held{opacity:0;transition:none}
.cm-sub .p{position:absolute;left:${px(40)};right:${px(40)};top:${px(26)};bottom:${px(12)};display:flex;align-items:center}
.cm-sub .tx{display:block;width:100%;font-size:${px(TYPE.subtitle)};font-weight:700;line-height:${TYPE.subtitleLine};text-align:left;text-wrap:pretty}
.cm-sub .tx.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cm-sub .n{position:absolute;left:${px(28)};top:0;z-index:1;transform:translateY(-50%);font-size:${px(TYPE.nameTab)};font-weight:900;padding:${px(6)} ${px(16)} ${px(8)};border-radius:${R};white-space:nowrap}

/* ---------------------------------------------------------------- name tags */
.cm-tag{position:absolute;left:0;top:0;opacity:0;transition:opacity .2s;will-change:transform}
.cm-tag .n{font-size:${px(TYPE.tag)};font-weight:900;white-space:nowrap;padding:${px(5)} ${px(14)} ${px(7)};border-radius:${R};line-height:1.05}
.cm-tag.dim .n{background:var(--dk)!important;color:var(--dt)!important}

/* ---------------------------------------------------------------- result band */
.cm-res{position:absolute;z-index:20;left:0;right:0;bottom:0;height:${px(190)};background:${ink};display:flex;align-items:center;justify-content:center;gap:${px(24)};white-space:nowrap;transform:translateY(105%);visibility:hidden;transition:transform .38s cubic-bezier(.25,.8,.3,1)}
.cm-res.vis{visibility:visible;transform:none}
.cm-res .by,.cm-res .pk{font-family:${FONTS.display};font-size:${px(TYPE.resultBy)};color:${milk}}
.cm-res .by:empty,.cm-res .pk:empty{display:none}
.cm-res .nm{font-family:${FONTS.display};font-size:${px(TYPE.result)};line-height:1;padding:${px(6)} ${px(28)} ${px(14)};background:var(--ra);color:var(--rt);border-radius:${R_BIG}}
`;

interface Tag {
  el: HTMLDivElement;
  name: HTMLDivElement;
  accent: string;
  label: string;
  shown: boolean;
  dim: boolean;
  target: { x: number; y: number } | null;
  sm: { x: number; y: number } | null;
}

export class Captions {
  readonly root: HTMLDivElement;
  private round: HTMLDivElement;
  private hand: HTMLDivElement;
  private cardEls: HTMLDivElement[] = [];
  private twistBig: HTMLDivElement;
  private big: HTMLDivElement;
  private tc: HTMLDivElement;
  private res: HTMLDivElement;
  private sub: HTMLDivElement;
  private subName: HTMLDivElement;
  private subText: HTMLSpanElement;
  private tagLayer: HTMLDivElement;
  private tags = new Map<string, Tag>();
  private subLeft = 0;
  private subHold = 0;
  private titleLeft = 0;
  private titleOutLeft = 0;
  private twistLeft = 0;
  private bigLeft = 0;
  private resLeft = 0;
  private timers: number[] = [];
  private layoutQueued = false;
  private lastLayout = 0;
  private star: { name: string; accent: string } | null = null;
  private inferred: { name: string; accent: string } | null = null;
  private starVotes = new Map<string, number>();

  constructor(parent: HTMLElement) {
    const el = <T extends HTMLElement = HTMLDivElement>(cls: string, tag = 'div', html = '') => {
      const e = document.createElement(tag) as T;
      e.className = cls;
      if (html) e.innerHTML = html;
      return e;
    };
    this.root = el('cm-ov');
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);

    // back to front: tags, round name, hand, big card, twist, subtitle, result, title call
    this.tagLayer = el('cm-tags');
    this.root.appendChild(this.tagLayer);

    this.round = el('cm-round');
    this.root.appendChild(this.round);

    this.hand = el('cm-hand');
    for (let i = 0; i < 3; i++) {
      const c = el('cm-hc', 'div', cardInner(i === 2 ? 'off' : 'on'));
      this.hand.appendChild(c);
      this.cardEls.push(c);
    }
    this.hand.style.display = 'none';
    this.root.appendChild(this.hand);

    this.big = el('cm-big', 'div', cardInner('on'));
    this.root.appendChild(this.big);

    this.twistBig = el('cm-twist', 'div', '<div class="cm-k tw bk"><span class="bw">Twist</span><span class="l"></span><span class="r"></span></div>');
    this.root.appendChild(this.twistBig);

    this.sub = el('cm-sub');
    const p = el('p');
    this.subText = el<HTMLSpanElement>('tx', 'span');
    p.append(this.subText);
    this.subName = el('n');
    this.sub.append(p, this.subName);
    this.root.appendChild(this.sub);

    this.res = el('cm-res', 'div', '<span class="by"></span><span class="nm"></span><span class="pk"></span>');
    this.root.appendChild(this.res);

    this.tc = el('cm-tc');
    this.root.appendChild(this.tc);

    parent.appendChild(this.root);
  }

  resize(w: number) {
    this.root.style.setProperty('--s', String(w / BASE_WIDTH));
  }

  /** the star's name and colour, for the result band (inferred from who speaks most otherwise) */
  setStar(name: string | null, accent?: string) {
    this.star = name ? { name: clean(name), accent: accent ?? coral } : null;
  }

  // ------------------------------------------------------------------ subtitle
  say(o: { name: string; accent: string; text: string; ms: number; style?: SayStyle }) {
    const style = o.style ?? 'normal';
    const name = clean(o.name);
    if (style === 'normal') this.voteStar(name, o.accent);
    this.sub.className = 'cm-sub on';
    this.subName.textContent = style === 'replay' ? `${name}, earlier` : name;
    this.subName.style.background = o.accent;
    this.subName.style.color = textOn(o.accent);
    this.subText.textContent = clean(o.text);
    this.fitSub();
    this.subLeft = o.ms / 1000 + 0.35;
    if (this.subHold > 0) this.sub.classList.add('held');
    if (style === 'replay' && this.bigLeft > 0) this.bigLeft = Math.max(this.bigLeft, this.subLeft);
  }

  clearSay() {
    this.sub.classList.remove('on');
    this.subLeft = 0;
  }

  /** two lines at most: step the size down for a long line, and clamp as a last resort */
  private fitSub() {
    const t = this.subText;
    t.classList.remove('clamp');
    const s = this.scale();
    for (let f = TYPE.subtitle; f >= TYPE.subtitleMin; f -= 2) {
      t.style.fontSize = px(f);
      const lines = t.getBoundingClientRect().height / (f * s * TYPE.subtitleLine);
      if (lines <= 2.2 || s === 0) return;
    }
    t.classList.add('clamp');
  }

  private voteStar(name: string, accent: string) {
    if (!name || [...this.tags.values()].some((t) => t.label === name)) return;
    const n = (this.starVotes.get(name) ?? 0) + 1;
    this.starVotes.set(name, n);
    const best = [...this.starVotes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[0] === name && !this.star) this.inferred = { name, accent };
  }

  private starInfo() {
    return this.star ?? this.inferred;
  }

  // ------------------------------------------------------------------ title call
  /**
   * The title call that opens a scene: its name on a plain field, briefly. "<name> is picked" is
   * drawn as the result band.
   */
  title(text: string, sub: string, ms: number, scene?: SceneId) {
    const t = clean(text);
    const won = /^(.+) is picked$/.exec(t);
    if (won && (!scene || scene === 'result')) {
      this.result({ name: won[1]!, ms });
      return;
    }
    if (scene === 'title' && !this.star) {
      const st = /starring (.+)$/i.exec(clean(sub));
      if (st) this.inferred = { name: st[1]!.trim(), accent: this.inferred?.accent ?? coral };
    }
    this.tc.style.setProperty('--bg', TITLE_CALL.field);
    this.tc.innerHTML = `<span class="tt" data-fit="${TYPE.titleCall},1100">${esc(t)}</span>`;
    // restart from off-left, then wipe in
    this.tc.className = 'cm-tc vis snap';
    this.fitTitle();
    void this.tc.offsetWidth;
    this.tc.classList.remove('snap');
    requestAnimationFrame(() => this.tc.classList.add('in'));
    if (document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => this.fitTitle());
    this.titleLeft = Math.min(TITLE_MAX, Math.max(0.6, ms / 1000 - 0.3));
    this.titleOutLeft = 0;
  }

  /** the title is set as large as it can be, then shrunk to the width it may take */
  private fitTitle() {
    const s = this.scale();
    this.tc.querySelectorAll<HTMLElement>('[data-fit]').forEach((e) => {
      const [base, max] = e.dataset.fit!.split(',').map(Number) as [number, number];
      e.style.fontSize = px(base);
      const w = e.offsetWidth / (s || 1);
      if (w > max) e.style.fontSize = px(Math.floor((base * max) / w));
    });
  }

  clearTitle() {
    this.tc.className = 'cm-tc';
    this.titleLeft = 0;
    this.titleOutLeft = 0;
    this.hideResult();
  }

  /** the result band: "<star> picks <winner>" on one line */
  result(o: { name: string; accent?: string; next?: string; ms: number; by?: string }) {
    const accent = o.accent ?? this.accentByName(o.name) ?? coral;
    this.res.style.setProperty('--ra', accent);
    this.res.style.setProperty('--rt', textOn(accent));
    const by = o.by ? clean(o.by) : this.starInfo()?.name;
    (this.res.querySelector('.by') as HTMLElement).textContent = by ? `${by} picks` : '';
    (this.res.querySelector('.nm') as HTMLElement).textContent = clean(o.name);
    (this.res.querySelector('.pk') as HTMLElement).textContent = by ? '' : 'is picked';
    this.res.classList.remove('vis');
    void this.res.offsetWidth;
    this.res.classList.add('vis');
    this.root.classList.add('won');
    this.resLeft = o.ms / 1000;
  }

  private hideResult() {
    this.res.classList.remove('vis');
    this.root.classList.remove('won');
    this.resLeft = 0;
  }

  setRound(label: string) {
    const t = clean(label);
    this.round.textContent = t;
    this.round.classList.toggle('on', !!t);
  }

  // ------------------------------------------------------------------ cards
  setCards(cards: CardView[] | null, flipSlot: number | null = null) {
    if (!cards || !cards.length) {
      this.hand.style.display = 'none';
      this.hideBig();
      return;
    }
    this.hand.style.display = '';
    for (const c of cards) {
      const el = this.cardEls[c.slot];
      if (!el) continue;
      const animate = flipSlot === c.slot && c.faceUp;
      if (!animate) {
        fillCard(el, c);
        continue;
      }
      if (c.slot > 0) {
        // a hidden card turning over: it comes up large while the hand steps aside, and the hand's
        // card is already turned when the hand comes back
        fillCard(el, c);
        this.showBig(c);
      } else flip(el, () => fillCard(el, c), (f) => this.later(140, f));
    }
  }

  private showBig(c: CardView) {
    fillCard(this.big, { ...c, faceUp: false });
    this.big.classList.remove('vis');
    void this.big.offsetWidth;
    this.big.classList.add('vis');
    this.root.classList.add('bigup');
    // the line that names the card waits until the card has turned, so it never spoils it
    this.subHold = 0.85;
    if (this.sub.classList.contains('on')) this.sub.classList.add('held');
    this.later(420, () => flip(this.big, () => fillCard(this.big, c), (f) => this.later(140, f)));
    this.bigLeft = 4.4;
  }

  private hideBig() {
    this.big.classList.remove('vis');
    this.root.classList.remove('bigup');
    this.bigLeft = 0;
  }

  /**
   * The twist card: it lands face down ("Twist"), turns over while it is read, and leaves when its
   * beat is over. Nothing about the twist stays on screen after that. ms = 0 (state only) shows nothing.
   */
  twist(t: { label: string; rule: string } | null, ms = 0) {
    const k = this.twistBig.querySelector('.cm-k') as HTMLDivElement;
    if (!t || ms <= 0) {
      if (!t) {
        this.twistBig.classList.remove('vis');
        this.twistLeft = 0;
      }
      return;
    }
    (this.twistBig.querySelector('.l') as HTMLElement).textContent = clean(t.label);
    (this.twistBig.querySelector('.r') as HTMLElement).textContent = clean(t.rule);
    k.classList.add('bk');
    this.twistBig.classList.remove('vis');
    void this.twistBig.offsetWidth;
    this.twistBig.classList.add('vis');
    this.later(Math.min(1000, ms * 0.3), () => flip(this.twistBig, () => k.classList.remove('bk'), (f) => this.later(140, f)));
    this.twistLeft = ms / 1000;
  }

  // ------------------------------------------------------------------ name tags
  setTag(id: string, o: { name: string; tagline?: string; accent: string } | null) {
    let t = this.tags.get(id);
    if (!o) {
      t?.el.remove();
      this.tags.delete(id);
      return;
    }
    if (!t) {
      const el = document.createElement('div');
      el.className = 'cm-tag';
      const name = document.createElement('div');
      name.className = 'n';
      el.append(name);
      this.tagLayer.appendChild(el);
      t = { el, name, accent: o.accent, label: o.name, shown: false, dim: false, target: null, sm: null };
      this.tags.set(id, t);
    }
    t.accent = o.accent;
    t.label = clean(o.name);
    t.name.textContent = t.label;
    t.name.style.background = o.accent;
    t.name.style.color = textOn(o.accent);
    // the cut: the tag goes to its own colour with the light out
    t.el.style.setProperty('--dk', mix(o.accent, night, 0.74));
    t.el.style.setProperty('--dt', mix(o.accent, night, 0.35));
  }

  clearTags() {
    for (const id of [...this.tags.keys()]) this.setTag(id, null);
  }

  /** place a tag at stage pixel coords (the top of the head), or hide it; laid out once per frame */
  placeTag(id: string, x: number | null, y = 0, dim = false) {
    const t = this.tags.get(id);
    if (!t) return;
    if (x === null) {
      t.target = null;
      if (t.shown) {
        // a cut is a cut: the tag leaves with the shot, no fade over the next one
        t.el.style.transition = 'none';
        t.el.style.opacity = '0';
        t.shown = false;
        t.sm = null;
      }
      return;
    }
    if (t.dim !== dim) {
      t.dim = dim;
      t.el.classList.toggle('dim', dim);
    }
    t.target = { x, y };
    if (!this.layoutQueued) {
      this.layoutQueued = true;
      queueMicrotask(() => this.layoutTags());
    }
  }

  /**
   * All visible tags together: smoothed (a head's small bob never makes a tag jitter), snapped to
   * one row when they are close in height, and pushed apart so no two overlap.
   */
  private layoutTags() {
    this.layoutQueued = false;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastLayout) / 1000));
    this.lastLayout = now;
    const W = this.root.clientWidth;
    const s = this.scale();
    const items = [...this.tags.values()].filter((t) => t.target);
    if (!items.length || W <= 0) return;
    for (const t of items) {
      const g = t.target!;
      if (!t.shown || !t.sm || Math.abs(g.x - t.sm.x) > 90 * s || Math.abs(g.y - t.sm.y) > 90 * s) t.sm = { ...g };
      else {
        t.sm.x += (g.x - t.sm.x) * (1 - Math.exp(-dt * 9));
        const dy = g.y - t.sm.y;
        if (Math.abs(dy) > 5 * s) t.sm.y += dy * (1 - Math.exp(-dt * 2.5));
      }
    }
    items.sort((a, b) => a.sm!.x - b.sm!.x);
    // one row: tags within 70 px of each other in height sit on the highest of them
    const byY = [...items].sort((a, b) => a.sm!.y - b.sm!.y);
    const row = new Map<Tag, number>();
    for (const t of byY) {
      const lead = byY.find((o) => row.has(o) && Math.abs(o.sm!.y - t.sm!.y) < 70 * s);
      row.set(t, lead ? row.get(lead)! : t.sm!.y);
    }
    const ws = items.map((t) => t.el.offsetWidth);
    const hs = items.map((t) => t.el.offsetHeight);
    const xs = items.map((t) => t.sm!.x);
    const pad = 12 * s;
    const gap = 8 * s;
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < items.length - 1; i++) {
        if (Math.abs(row.get(items[i]!)! - row.get(items[i + 1]!)!) > 70 * s) continue;
        const ov = xs[i]! + ws[i]! / 2 + gap - (xs[i + 1]! - ws[i + 1]! / 2);
        if (ov > 0) {
          xs[i]! -= ov / 2;
          xs[i + 1]! += ov / 2;
        }
      }
      for (let i = 0; i < items.length; i++) xs[i] = Math.min(Math.max(xs[i]!, ws[i]! / 2 + pad), W - ws[i]! / 2 - pad);
    }
    const tallest = new Map<number, number>();
    items.forEach((t, i) => tallest.set(row.get(t)!, Math.max(tallest.get(row.get(t)!) ?? 0, hs[i]!)));
    // a row never runs under the round name or the star's hand
    const box = this.root.getBoundingClientRect();
    const keepOut = [this.hand, this.round]
      .filter((e) => e.offsetParent && getComputedStyle(e).opacity !== '0')
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x0: r.left - box.left, x1: r.right - box.left, y1: r.bottom - box.top };
      });
    const rowTop = new Map<number, number>();
    items.forEach((t, i) => {
      const ry = row.get(t)!;
      let top = Math.max(ry - tallest.get(ry)!, pad);
      for (const k of keepOut) if (xs[i]! + ws[i]! / 2 > k.x0 && xs[i]! - ws[i]! / 2 < k.x1) top = Math.max(top, k.y1 + 10 * s);
      rowTop.set(ry, Math.max(rowTop.get(ry) ?? 0, top));
    });
    items.forEach((t, i) => {
      const ry = row.get(t)!;
      const top = rowTop.get(ry)!;
      const y = top + hs[i]!;
      t.el.style.transform = `translate(${xs[i]!.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) translateY(${px(-10)})`;
      if (!t.shown) {
        t.el.style.transition = '';
        t.el.style.opacity = '1';
        t.shown = true;
      }
    });
  }

  private accentByName(name: string) {
    for (const t of this.tags.values()) if (t.label === name) return t.accent;
    return null;
  }

  private scale() {
    return (this.root.clientWidth || BASE_WIDTH) / BASE_WIDTH;
  }

  private later(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== id);
      fn();
    }, ms);
    this.timers.push(id);
  }

  update(dt: number) {
    if (this.subHold > 0 && (this.subHold -= dt) <= 0) this.sub.classList.remove('held');
    if (this.subLeft > 0 && (this.subLeft -= dt) <= 0) this.sub.classList.remove('on');
    if (this.titleLeft > 0 && (this.titleLeft -= dt) <= 0) {
      this.tc.classList.add('out');
      this.titleOutLeft = 0.35;
    }
    if (this.titleOutLeft > 0 && (this.titleOutLeft -= dt) <= 0) this.tc.className = 'cm-tc';
    if (this.twistLeft > 0 && (this.twistLeft -= dt) <= 0) this.twistBig.classList.remove('vis');
    if (this.bigLeft > 0 && (this.bigLeft -= dt) <= 0) this.hideBig();
    if (this.resLeft > 0 && (this.resLeft -= dt) <= 0) this.hideResult();
  }

  destroy() {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
    this.root.remove();
  }
}

// ------------------------------------------------------------------ cards

const HEART = 'M20 36C7 27 2.5 19 3.2 12C4 5 10.5 1.6 15.8 3.8C18 4.8 19.2 6.6 20.2 8.8C21.4 6.4 23 4.6 25.4 3.7C30.8 1.8 37 5.4 37.2 12.2C37.4 19.4 32.6 27 20 36Z';
const BROKEN =
  'M18.6 35C6.6 26.6 2.4 18.8 3.2 12C4 5 10.5 1.6 15.8 3.8C17.8 4.7 19 6.3 19.9 8.4L16.6 14.8L20.6 20.2L16.4 26.6Z' +
  'M23.2 8.6C24.4 6.2 26 4.5 28.2 3.7C33.6 1.8 39.6 5.4 39.8 12.2C40 19 35.6 26.4 24 35.4L21.4 26.6L25.6 20.2L21.6 14.8Z';

/** a card's inside: one small glyph (heart: likes; broken heart: dealbreaker) and its label */
function cardInner(kind: Kind) {
  return `<div class="cm-k ${kind} bk"><svg class="pip" viewBox="0 0 42 40"><path d="${kind === 'off' ? BROKEN : HEART}"/></svg><strong></strong></div>`;
}

/** slot 0 is the face-up turn-on, slot 1 the hidden turn-on, slot 2 the hidden dealbreaker */
function kindOf(c: CardView): Kind {
  return c.kind === 'off' || (!c.kind && c.slot === 2) ? 'off' : 'on';
}

function fillCard(el: HTMLElement, c: CardView) {
  const k = el.querySelector('.cm-k') as HTMLDivElement;
  const kind = kindOf(c);
  k.className = `cm-k ${kind}${c.faceUp ? '' : ' bk'}`;
  k.querySelector('svg path')?.setAttribute('d', kind === 'off' ? BROKEN : HEART);
  const label = k.querySelector('strong') as HTMLElement;
  label.textContent = c.faceUp ? clean(c.label ?? '') : '';
  label.classList.toggle('long', label.textContent.length > 13);
}

/** a card turn: it turns edge-on, the face is swapped while it is edge-on, and it opens out again */
function flip(el: HTMLElement, swap: () => void, after: (f: () => void) => void) {
  const k = el.querySelector('.cm-k') as HTMLDivElement;
  k.classList.remove('open');
  k.classList.add('sq');
  after(() => {
    swap();
    k.classList.add('sq', 'open');
    void k.offsetWidth;
    k.classList.remove('sq');
  });
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

/** On-screen text never carries an em dash. */
function clean(s: string) {
  return String(s ?? '').replace(/\s*—\s*/g, ', ').replace(/–/g, '-');
}
