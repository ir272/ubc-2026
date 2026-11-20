// The damage percent: the hero of the HUD. One SVG text (big digits, a smaller percent sign on the
// same baseline) in heavy italics, with exactly one ink outline and one hard offset ink shadow.
// The colour climbs with damage: arc white, amber, ember, signal red.
//
// The hit reaction is one clean beat: the whole number punches up in scale about its fixed edge on
// the baseline (the digits never leave their order or their places) and takes a short heat tint that fades back
// to the rest colour. A lost life: the number drops back in at 0 with a small settle. Nothing
// scatters, smears, ghosts or flies.
// Per frame only the transform and the fill change, and only when they change.

import { FONTS, PALETTE } from '../style.ts';

const NS = 'http://www.w3.org/2000/svg';
const WIDE = 1.08;

type RGB = [number, number, number];

/** damage colour: arc white to 18, amber by 50, ember, signal red by 140, a deeper red by 170+ */
const STOPS: [number, RGB][] = [
  [0, [244, 248, 255]],
  [18, [246, 247, 245]],
  [32, [255, 232, 132]],
  [50, [255, 194, 26]],
  [72, [255, 140, 26]],
  [100, [255, 96, 36]],
  [140, [255, 56, 44]],
  [175, [240, 30, 40]],
  [240, [226, 20, 36]],
];

export function damageRgb(p: number): RGB {
  if (p <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i];
    if (p <= b) {
      const [a, ca] = STOPS[i - 1];
      const t = (p - a) / (b - a);
      const u = t * t * (3 - 2 * t);
      return [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function rgbStr(c: RGB): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: RGB = [255, 255, 255];
const EMBER: RGB = [255, 122, 26];

export interface NumberOpts {
  /** the number's fixed edge (its right edge when align is 'right', its left edge when 'left')
   *  and its baseline, in the parent's coordinates */
  anchorX: number;
  baselineY: number;
  align: 'left' | 'right';
  /** font size of the integer digits, px */
  size: number;
}

/** frames of the punch and of the heat tint */
const PUNCH_F = 12;
const TINT_F = 16;

export class DamageNumber {
  readonly root: SVGGElement;
  private inner: SVGGElement;
  private shadow: SVGTextElement;
  private main: SVGTextElement;
  private digits: [SVGTSpanElement, SVGTSpanElement];
  private pct: [SVGTSpanElement, SVGTSpanElement];
  private o: NumberOpts;
  private value = 0;
  private text = '';
  private popF = 99;
  private popS = 0;
  private resetF = 99;
  private hidden = false;
  private lastFill = '';
  private lastTf = '';

  constructor(parent: SVGElement, o: NumberOpts) {
    this.o = o;
    this.root = document.createElementNS(NS, 'g') as SVGGElement;
    this.inner = document.createElementNS(NS, 'g') as SVGGElement;
    this.root.appendChild(this.inner);
    parent.appendChild(this.root);
    const mk = (fill: string) => {
      const t = document.createElementNS(NS, 'text') as SVGTextElement;
      t.setAttribute('text-anchor', o.align === 'right' ? 'end' : 'start');
      t.setAttribute('font-family', FONTS.display);
      t.setAttribute('font-weight', '900');
      t.setAttribute('fill', fill);
      t.setAttribute('stroke', PALETTE.ink);
      t.setAttribute('stroke-width', String(Math.round(o.size * 0.13)));
      t.setAttribute('stroke-linejoin', 'round');
      t.setAttribute('paint-order', 'stroke');
      const d = document.createElementNS(NS, 'tspan') as SVGTSpanElement;
      d.setAttribute('font-size', String(o.size));
      const p = document.createElementNS(NS, 'tspan') as SVGTSpanElement;
      p.setAttribute('font-size', String(Math.round(o.size * 0.5)));
      p.setAttribute('dx', '3');
      p.textContent = '%';
      t.append(d, p);
      this.inner.appendChild(t);
      return { t, d, p };
    };
    const off = Math.max(3, Math.round(o.size * 0.06));
    const sh = mk(PALETTE.ink);
    sh.t.setAttribute('x', String(off * 0.8));
    sh.t.setAttribute('y', String(off));
    const mn = mk(PALETTE.white);
    this.shadow = sh.t;
    this.main = mn.t;
    this.digits = [sh.d, mn.d];
    this.pct = [sh.p, mn.p];
    this.place();
  }

  private place(): void {
    this.root.setAttribute('transform', `translate(${this.o.anchorX} ${this.o.baselineY}) skewX(-9) scale(${WIDE} 1)`);
  }

  /** move the fixed edge */
  setAnchor(anchorX: number): void {
    if (anchorX === this.o.anchorX) return;
    this.o = { ...this.o, anchorX };
    this.place();
  }

  set(v: number): void {
    this.value = v;
    const n = Math.max(0, Math.min(999, Math.round(v)));
    const txt = String(n);
    if (txt !== this.text) {
      this.text = txt;
      for (const d of this.digits) d.textContent = txt;
    }
  }

  /** a hit landed: strength 0..1 */
  pop(strength: number): void {
    if (this.hidden) return;
    const live = this.popF < PUNCH_F;
    this.popS = Math.min(1, live ? Math.max(strength, this.popS * 0.6 + strength * 0.5) : strength);
    this.popF = 0;
  }

  /** a lost life: drop back in at the current value (0) with a small settle */
  reset(): void {
    this.popF = 99;
    this.resetF = 0;
    this.setHidden(false);
  }

  setHidden(h: boolean): void {
    if (h === this.hidden) return;
    this.hidden = h;
    this.root.setAttribute('display', h ? 'none' : 'inline');
  }

  update(dt: number): void {
    if (this.hidden) return;
    const rest = damageRgb(this.value);
    let sc = 1;
    let fill = rest;
    if (this.popF < TINT_F) {
      const f = this.popF;
      this.popF += dt * 60;
      const s = this.popS;
      // up fast (2 frames), then ease back down
      if (f < PUNCH_F) {
        const env = f < 2 ? 1 : Math.pow(1 - (f - 2) / (PUNCH_F - 2), 2);
        sc = 1 + (0.1 + 0.16 * s) * env;
      }
      const k = f < 3 ? 1 : 1 - (f - 3) / (TINT_F - 3);
      fill = mix(rest, f < 2 ? WHITE : EMBER, Math.max(0, k) * (0.55 + 0.4 * s));
    }
    if (this.resetF < 20) {
      const f = this.resetF;
      this.resetF += dt * 60;
      sc = f < 2 ? 1.2 : f < 8 ? 1.2 - 0.22 * ((f - 2) / 6) : f < 12 ? 0.98 + 0.02 * ((f - 8) / 4) : 1;
    }
    const f = rgbStr(fill);
    if (f !== this.lastFill) {
      this.lastFill = f;
      this.main.setAttribute('fill', f);
    }
    // scale about the fixed edge on the baseline: the number grows up and away from the lives,
    // never down over the name line
    const tr = sc === 1 ? '' : `scale(${sc.toFixed(3)})`;
    if (tr !== this.lastTf) {
      this.lastTf = tr;
      if (tr) this.inner.setAttribute('transform', tr);
      else this.inner.removeAttribute('transform');
    }
    void this.shadow;
    void this.pct;
  }
}
