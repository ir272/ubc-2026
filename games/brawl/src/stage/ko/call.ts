// Beat 2c: the call, one read at a time. The blast lands first. Then both sides' lives slam in as
// big bare numerals in their side colours, wide left and right in the upper middle, and the loser's
// numeral ticks down with a jolt. The numerals cut out and the word RINGOUT slams in across the
// middle third in the scorer's side colour, oversize to size in 5 frames. It holds, then wipes out
// on a hard cut. The final knockout: the numerals, then LIGHTS OUT as one slam, bigger, arc white
// over a hard offset in the scorer's colour, while the yard goes dark (ko.ts); it holds until the
// replay cuts in.
// Clean pass: no ink plate behind the word, no slab, no letter-by-letter, nothing else on screen.
// The text keeps an ink edge and offset so it reads over the white column and the dark set alike.
// DOM in the stage's 1280x720 UI layer; no per-frame layout reads, only transforms.

import { FONTS, PALETTE, el } from '../style.ts';
import { clamp01, easeOut } from './kit.ts';

export interface CallSpec {
  side: 0 | 1; // who lost the life
  by: 0 | 1;
  lives: [number, number]; // after the knockout
  final: boolean;
  /** the direction the blast came in from, for the wipe: -1 from the left, 1 from the right */
  from: -1 | 1;
}

/** frames after the blast: the numerals arrive, the loser's count ticks, they leave, the word lands */
const LIVES_AT = 4;
const TICK_AT = 12;
const LIVES_OUT = 30;
const WORD_AT = 31;

interface Text {
  wrap: HTMLElement;
  edge: HTMLElement;
  fill: HTMLElement;
}

export class Call {
  private readonly root: HTMLElement;
  private readonly nums: Text[] = [];
  private readonly word: Text;
  private readonly big: Text;
  private spec: CallSpec | null = null;
  private age = 99;
  private shownLives: [number, number] = [0, 0];

  constructor(ui: HTMLElement, private readonly sideColors: [string, string]) {
    this.root = el('div', ui, { position: 'absolute', left: '0', top: '0', width: '1280px', height: '720px', pointerEvents: 'none', display: 'none' });
    const text = (box: Partial<CSSStyleDeclaration>, font: Partial<CSSStyleDeclaration>, stroke: number, label = ''): Text => {
      const wrap = el('div', this.root, { position: 'absolute', ...box });
      const base: Partial<CSSStyleDeclaration> = { position: 'absolute', left: '0', top: '0', textAlign: 'center', fontFamily: FONTS.display, fontWeight: '900', whiteSpace: 'nowrap', ...font };
      const edge = el('div', wrap, { ...base, color: PALETTE.ink, webkitTextStroke: `${stroke}px ${PALETTE.ink}` }, label);
      const fill = el('div', wrap, { ...base }, label);
      return { wrap, edge, fill };
    };
    // the lives: bare numerals wide left and right, upper middle
    for (let s = 0; s < 2; s++) {
      const n = text(
        { top: '150px', left: s === 0 ? '70px' : '990px', width: '220px', height: '200px', transformOrigin: '50% 60%' },
        { width: '220px', fontSize: '210px', lineHeight: '200px', transform: 'skewX(-9deg)' },
        14,
      );
      n.fill.style.color = sideColors[s];
      this.nums.push(n);
    }
    this.word = text(
      { left: '0', top: '330px', width: '1280px', height: '170px', transformOrigin: '50% 50%' },
      { width: '1280px', fontSize: '172px', lineHeight: '170px', letterSpacing: '2px', transform: 'skewX(-10deg)' },
      12,
      'RINGOUT',
    );
    this.big = text(
      { left: '0', top: '230px', width: '1280px', height: '290px', transformOrigin: '50% 50%' },
      { width: '1280px', fontSize: '284px', lineHeight: '290px', transform: 'skewX(-10deg)' },
      14,
      'LIGHTS OUT',
    );
    this.big.fill.style.color = PALETTE.white;
  }

  get holdS(): number {
    return this.spec?.final ? 3.3 : 1.45;
  }

  get live(): boolean {
    return this.age < this.holdS + 0.1;
  }

  start(spec: CallSpec): void {
    this.spec = spec;
    this.age = 0;
    const scorer = this.sideColors[spec.by];
    this.word.fill.style.color = scorer;
    this.word.edge.style.textShadow = `9px 9px 0 ${PALETTE.ink}`;
    this.big.edge.style.textShadow = `14px 14px 0 ${scorer}`;
    for (const n of this.nums) n.edge.style.textShadow = `9px 9px 0 ${PALETTE.ink}`;
    this.word.wrap.style.display = spec.final ? 'none' : 'block';
    this.big.wrap.style.display = spec.final ? 'block' : 'none';
    // the loser's numeral starts on the old count and ticks down
    this.shownLives = [spec.lives[0], spec.lives[1]];
    this.shownLives[spec.side] = spec.lives[spec.side] + 1;
    for (let s = 0; s < 2; s++) this.setNum(s, this.shownLives[s]);
    this.root.style.display = 'block';
    this.root.style.clipPath = 'none';
  }

  private setNum(s: number, n: number): void {
    this.nums[s].edge.textContent = String(n);
    this.nums[s].fill.textContent = String(n);
  }

  stop(): void {
    this.age = 99;
    this.spec = null;
    this.root.style.display = 'none';
  }

  update(dt: number): void {
    const sp = this.spec;
    if (!sp) return;
    this.age += dt;
    const f = this.age * 60;
    const end = this.holdS * 60;
    if (f >= end + 5) {
      this.stop();
      return;
    }
    // read 1: the numerals slam in from their sides, the loser's ticks down, then they cut out
    const numsOn = f >= LIVES_AT && f < LIVES_OUT;
    for (let s = 0; s < 2; s++) {
      const n = this.nums[s];
      n.wrap.style.visibility = numsOn ? 'visible' : 'hidden';
      if (!numsOn) continue;
      const pk = easeOut((f - LIVES_AT) / 4);
      const dx = (1 - pk) * (s === 0 ? -460 : 460);
      n.wrap.style.transform = `translateX(${dx.toFixed(1)}px) scale(${(1 + (1 - pk) * 0.3).toFixed(3)})`;
    }
    if (f >= TICK_AT && this.shownLives[sp.side] !== sp.lives[sp.side]) {
      this.shownLives[sp.side] = sp.lives[sp.side];
      this.setNum(sp.side, sp.lives[sp.side]);
    }
    const jolt = f >= TICK_AT && f < TICK_AT + 9 ? (TICK_AT + 9 - f) / 9 : 0;
    const ln = this.nums[sp.side];
    ln.fill.style.color = jolt > 0.6 ? PALETTE.white : this.sideColors[sp.side];
    ln.fill.style.transform = ln.edge.style.transform = `skewX(-9deg) scale(${(1 + jolt * 0.35).toFixed(3)}) translateY(${(-jolt * 14).toFixed(1)}px)`;

    // read 2: the word, one slam from oversize, a short shake as it lands, a slow creep while it holds
    const w = sp.final ? this.big : this.word;
    const fw = f - WORD_AT;
    w.wrap.style.visibility = fw < 0 ? 'hidden' : 'visible';
    if (fw >= 0) {
      const k = easeOut(fw / 5);
      const scale = (sp.final ? 1.6 : 1.45) - (sp.final ? 0.6 : 0.45) * k + Math.max(0, fw - 8) * (sp.final ? 0.0004 : 0.0006);
      const sh = fw > 5 && fw < 14 ? Math.sin(fw * 2.9) * (14 - fw) * (sp.final ? 1.2 : 0.9) : 0;
      w.wrap.style.transform = `translate(${sh.toFixed(1)}px, ${(sh * 0.35).toFixed(1)}px) scale(${scale.toFixed(4)})`;
      // the word lands white for two frames, then takes its colour
      w.fill.style.color = fw >= 5 && fw < 7 ? '#ffffff' : sp.final ? PALETTE.white : this.sideColors[sp.by];
    }
    // out: a hard diagonal wipe over 4 frames toward the far side
    if (f >= end) {
      const k = clamp01((f - end) / 4) * 100;
      this.root.style.clipPath =
        sp.from < 0
          ? `polygon(${k}% 0, 100% 0, 100% 100%, ${Math.max(0, k - 12)}% 100%)`
          : `polygon(0 0, ${100 - k}% 0, ${Math.min(100, 112 - k)}% 100%, 0 100%)`;
    }
  }

  /** frames since the final's word started to land (negative before), for the dark set in ko.ts */
  get finalWordF(): number {
    const sp = this.spec;
    if (!sp || !sp.final) return -1;
    return this.age * 60 - WORD_AT;
  }

  /** the white wash the final call wants as its word lands (0 otherwise) */
  get landFlash(): number {
    const fw = this.finalWordF;
    return fw >= 5 && fw < 6 ? 0.3 : 0;
  }

  dispose(): void {
    this.root.remove();
  }
}
