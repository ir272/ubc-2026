// Chat bubbles and nameplates, VRChat style (stage/LOOK.md "The hangout"): what someone says floats
// over their head in a plain dark rounded bubble with a small tail toward them; a small plate with
// just their name floats over every avatar in frame, the speaker's lit. DOM over the canvas,
// re-anchored to each head every frame, sized in screen pixels (scaled with the stage width) so it
// reads at 960x540, and always kept inside the frame without covering the speaker's own face.
//
// Three quiet variants: a confession is private (a dashed edge, a softer ground), a remembered
// line is lighter and italic, a voice on the phone floats over whoever holds it with the caller's
// name. Nothing else is ever printed.
import '@fontsource/zen-maru-gothic/500.css';
import '@fontsource/zen-maru-gothic/700.css';
import * as THREE from 'three';
import { BASE_WIDTH, BUBBLE, FONTS, PALETTE } from '../theme.ts';

export type BubbleStyle = 'say' | 'private' | 'memory' | 'phone';

export interface BubbleHost {
  /** world point just above this cast member's head, or null if they are not in the room */
  anchor(id: string, out: THREE.Vector3): THREE.Vector3 | null;
  /** an emote is popping over them (their plate steps aside) */
  popping(id: string): boolean;
}

const px = (n: number) => `calc(${n}px * var(--s))`;
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const B = BUBBLE;
const TAIL = 8;

const CSS = `
.cm-hg{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:${FONTS.body};--s:1;-webkit-font-smoothing:antialiased;line-height:1}
.cm-hg *{box-sizing:border-box}
.cm-plate{position:absolute;left:0;top:0;padding:${px(3)} ${px(9)} ${px(4)};font-size:${px(B.plate)};font-weight:700;border-radius:${px(7)};background:${rgba(B.plateBg, 0.78)};color:${B.plateFg};border-bottom:${px(2)} solid var(--a);white-space:nowrap;opacity:0;transition:opacity .25s;will-change:transform}
.cm-plate.on{opacity:1}
.cm-plate.lit{background:${B.plateBg};color:${B.fg};box-shadow:inset 0 0 0 ${px(2)} var(--a);border-bottom-color:transparent}
.cm-plate.ghost{background:${rgba(B.memoryBg, 0.9)};color:${B.memoryFg};font-style:italic}
.cm-bub{position:absolute;left:0;top:0;width:max-content;max-width:${px(B.maxChars * 11.6 + 2 * B.pad)};padding:${px(B.pad - 2)} ${px(B.pad + 3)} ${px(B.pad)};border-radius:${px(B.radius)};background:${rgba(B.bg, 0.9)};color:${B.fg};font-size:${px(B.text)};line-height:${B.lineHeight};font-weight:500;text-wrap:balance;opacity:0;transition:opacity .16s;will-change:transform;--tb:${rgba(B.bg, 0.9)}}
.cm-bub.on{opacity:1}
.cm-bub.long{font-size:${px(B.text - 2.5)};max-width:${px(B.maxChars * 12.4 + 2 * B.pad)}}
.cm-bub p{margin:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.cm-bub .who{display:block;font-size:${px(B.plate - 1)};font-weight:700;margin-bottom:${px(3)};color:var(--a)}
.cm-bub i.t{position:absolute;width:0;height:0;border:${px(TAIL)} solid transparent}
.cm-bub.down i.t{top:100%;border-top-color:var(--tb);border-bottom-width:0}
.cm-bub.left i.t{left:100%;border-left-color:var(--tb);border-right-width:0}
.cm-bub.right i.t{right:100%;border-right-color:var(--tb);border-left-width:0}
.cm-bub.memory{background:${rgba(B.memoryBg, 0.94)};color:${B.memoryFg};font-style:italic;--tb:${rgba(B.memoryBg, 0.94)}}
.cm-bub.private{background:${rgba(B.privateBg, 0.86)};border:${px(2)} dashed ${B.privateEdge};color:${PALETTE.milk};--tb:${B.privateEdge}}
`;

interface Bub {
  el: HTMLDivElement;
  text: HTMLParagraphElement;
  tail: HTMLElement;
  who: HTMLSpanElement;
  id: string;
  /** a fixed world point (a line remembered at the door), else the speaker's head */
  at: THREE.Vector3 | null;
  left: number;
  shown: boolean;
  w: number;
  h: number;
  style: BubbleStyle;
  /** the rect last drawn, in stage px */
  rect: { x: number; y: number; w: number; h: number } | null;
  dying: boolean;
}

interface Plate {
  el: HTMLDivElement;
  name: string;
  accent: string;
}

export class Bubbles {
  readonly root: HTMLDivElement;
  private host: BubbleHost;
  private plates = new Map<string, Plate>();
  private ghost: HTMLDivElement;
  private bubs: Bub[] = [];
  private speaker: string | null = null;
  private allowPlates: Set<string> | null = null;
  private W = 1280;
  private H = 720;
  private s = 1;
  private v = new THREE.Vector3();
  private w2 = new THREE.Vector3();
  private right = new THREE.Vector3();

  constructor(parent: HTMLElement, host: BubbleHost) {
    this.host = host;
    this.root = document.createElement('div');
    // cm-ov: the emote pops read this layer to keep out of the bubbles
    this.root.className = 'cm-ov cm-hg';
    const st = document.createElement('style');
    st.textContent = CSS;
    this.root.appendChild(st);
    this.ghost = document.createElement('div');
    this.ghost.className = 'cm-plate ghost';
    this.root.appendChild(this.ghost);
    parent.appendChild(this.root);
  }

  resize(w: number, h: number) {
    this.W = w;
    this.H = h;
    this.s = w / BASE_WIDTH;
    this.root.style.setProperty('--s', String(this.s));
    for (const b of this.bubs) this.measure(b);
  }

  setCast(members: { id: string; name: string; accent: string }[]) {
    for (const p of this.plates.values()) p.el.remove();
    this.plates.clear();
    for (const m of members) {
      const el = document.createElement('div');
      el.className = 'cm-plate';
      el.textContent = m.name;
      el.style.setProperty('--a', m.accent);
      this.root.insertBefore(el, this.ghost);
      this.plates.set(m.id, { el, name: m.name, accent: m.accent });
    }
    this.clearSay();
  }

  /** which plates may show (null: everyone in frame) */
  setPlates(ids: Set<string> | null) {
    this.allowPlates = ids;
  }

  /**
   * Someone says something for ms. `at` pins it to a world point instead of the speaker's head (a
   * remembered line of someone who has left, at the door). `name` and `accent` label a bubble whose
   * speaker has no plate there (the door, the phone).
   */
  say(o: { id: string; text: string; ms: number; style?: BubbleStyle; at?: THREE.Vector3 | null; name?: string; accent?: string }) {
    const style = o.style ?? 'say';
    // one voice at a time: whatever was up goes
    for (const b of this.bubs) this.kill(b);
    const el = document.createElement('div');
    el.className = `cm-bub ${style === 'say' ? '' : style}`.trim();
    const who = document.createElement('span');
    who.className = 'who';
    const text = document.createElement('p');
    const tail = document.createElement('i');
    tail.className = 't';
    el.append(who, text, tail);
    const label = style === 'phone' ? o.name : '';
    who.textContent = label ?? '';
    who.style.display = label ? '' : 'none';
    if (o.accent) el.style.setProperty('--a', o.accent);
    const clean = o.text.replace(/\s+/g, ' ').replace(/—/g, ', ').trim();
    text.textContent = clean;
    if (clean.length > 100) el.classList.add('long');
    this.root.appendChild(el);
    const b: Bub = { el, text, tail, who, id: o.id, at: o.at ? o.at.clone() : null, left: o.ms / 1000 + 0.45, shown: false, w: 0, h: 0, style, rect: null, dying: false };
    this.measure(b);
    this.bubs.push(b);
    this.speaker = o.at ? null : o.id;
    if (o.at && o.name) {
      this.ghost.textContent = o.name;
      this.ghost.style.setProperty('--a', o.accent ?? PALETTE.milk);
    }
  }

  clearSay() {
    for (const b of this.bubs) this.kill(b);
    this.speaker = null;
  }

  /** the speaker whose plate is lit (a line without a bubble: a silent look) */
  setSpeaker(id: string | null) {
    this.speaker = id;
  }

  /** the live bubble's speaker, if any */
  current(): string | null {
    const b = this.bubs.find((x) => !x.dying);
    return b ? b.id : null;
  }

  /** is the live bubble pinned to a point (the door) rather than a head */
  pinned(): THREE.Vector3 | null {
    const b = this.bubs.find((x) => !x.dying);
    return b?.at ?? null;
  }

  /**
   * Room the camera must leave above this head for the bubble and plate, as a share of the frame
   * height (0..1).
   */
  headroom(id: string): number {
    const b = this.bubs.find((x) => !x.dying && x.id === id && !x.at);
    const plate = (B.plate + 12) * this.s;
    const bub = b ? b.h + TAIL * this.s + 8 * this.s : 0;
    return (plate + bub + 12 * this.s + B.margin * this.s) / this.H;
  }

  private measure(b: Bub) {
    b.w = b.el.offsetWidth;
    b.h = b.el.offsetHeight;
  }

  private kill(b: Bub) {
    if (b.dying) return;
    b.dying = true;
    b.el.classList.remove('on');
    const el = b.el;
    setTimeout(() => el.remove(), 220);
  }

  /** project a world point to stage px; null when behind the camera */
  private screen(p: THREE.Vector3, camera: THREE.Camera, out: { x: number; y: number }) {
    this.v.copy(p).project(camera);
    if (this.v.z > 1 || this.v.z < -1) return null;
    out.x = ((this.v.x + 1) / 2) * this.W;
    out.y = ((1 - this.v.y) / 2) * this.H;
    return out;
  }

  update(dt: number, camera: THREE.Camera) {
    const W = this.W, H = this.H, s = this.s;
    const M = B.margin * s;
    camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const sp = { x: 0, y: 0 };
    const side = { x: 0, y: 0 };

    // ---- the bubble
    this.bubs = this.bubs.filter((b) => b.el.isConnected);
    let bubRect: { x: number; y: number; w: number; h: number } | null = null;
    let anchored: string | null = null;
    for (const b of this.bubs) {
      if (b.dying) continue;
      b.left -= dt;
      if (b.left <= 0) {
        this.kill(b);
        continue;
      }
      const a = b.at ?? this.host.anchor(b.id, this.w2);
      const p = a ? this.screen(a, camera, sp) : null;
      // only while the speaker (or the door) is in the frame: never someone else's face under it
      const inFrame = !!p && p.x > 4 && p.x < W - 4 && p.y > -0.15 * H && p.y < H * 0.97;
      if (!inFrame || !a) {
        b.el.classList.remove('on');
        b.shown = false;
        continue;
      }
      if (!b.w) this.measure(b);
      // half a head across, on screen
      this.w2.copy(a).addScaledVector(this.right, 0.2);
      const q = this.screen(this.w2, camera, side);
      const half = q ? Math.max(14 * s, Math.abs(q.x - p.x)) : 30 * s;
      const plateH = (B.plate + 9) * s;
      const gap = 6 * s;
      const tail = TAIL * s;
      let x = p.x - b.w / 2;
      let y = p.y - plateH - gap - tail - b.h;
      let dir: 'down' | 'left' | 'right' = 'down';
      x = Math.max(M, Math.min(W - M - b.w, x));
      if (y < M) {
        // no room above the head: beside it, never over the face
        y = Math.max(M, Math.min(H - M - b.h, p.y - b.h * 0.35));
        const rightX = p.x + half + tail + 4 * s;
        const leftX = p.x - half - tail - 4 * s - b.w;
        if (rightX + b.w <= W - M) {
          x = rightX;
          dir = 'right';
        } else if (leftX >= M) {
          x = leftX;
          dir = 'left';
        } else {
          x = Math.max(M, Math.min(W - M - b.w, x));
          y = M;
        }
      }
      b.el.classList.remove('down', 'left', 'right');
      b.el.classList.add(dir);
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      // the tail points at the head
      if (dir === 'down') {
        const tx = Math.max(b.w * 0.12, Math.min(b.w * 0.88, p.x - x)) - tail;
        b.tail.style.left = `${Math.round(tx)}px`;
        b.tail.style.top = '';
      } else {
        const ty = Math.max(10 * s, Math.min(b.h - 2 * tail - 10 * s, p.y - y - tail));
        b.tail.style.top = `${Math.round(ty)}px`;
        b.tail.style.left = '';
      }
      if (!b.shown) {
        b.shown = true;
        b.el.classList.add('on');
      }
      b.rect = { x, y, w: b.w, h: b.h };
      bubRect = b.rect;
      if (!b.at) anchored = b.id;
      else {
        // the door's ghost plate
        this.ghost.style.transform = `translate(${Math.round(p.x - this.ghost.offsetWidth / 2)}px, ${Math.round(Math.min(y + b.h + tail + 2 * s, H - M - plateH))}px)`;
      }
    }
    const door = this.bubs.some((b) => !b.dying && b.at && b.shown);
    this.ghost.classList.toggle('on', door);

    // ---- the plates
    for (const [id, pl] of this.plates) {
      const a = this.host.anchor(id, this.w2);
      const allowed = !this.allowPlates || this.allowPlates.has(id);
      const p = a && allowed && !this.host.popping(id) ? this.screen(a, camera, sp) : null;
      const w = pl.el.offsetWidth || 60 * s;
      const h = pl.el.offsetHeight || 22 * s;
      if (!p || p.x < 0 || p.x > W || p.y < h + 2 || p.y > H) {
        pl.el.classList.remove('on');
        continue;
      }
      const x = Math.max(4, Math.min(W - 4 - w, p.x - w / 2));
      const y = p.y - h - 2 * s;
      // a plate under someone else's bubble steps aside
      const hit = bubRect && anchored !== id && x < bubRect.x + bubRect.w && x + w > bubRect.x && y < bubRect.y + bubRect.h + TAIL * s && y + h > bubRect.y;
      if (hit) {
        pl.el.classList.remove('on');
        continue;
      }
      pl.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      pl.el.classList.add('on');
      pl.el.classList.toggle('lit', id === (anchored ?? this.speaker));
    }
  }

  destroy() {
    this.root.remove();
  }
}
