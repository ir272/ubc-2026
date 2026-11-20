// Recipes: a component's whole drawing, described once, as named layers per state.
// A recipe says what is drawn at rest, on hover, when pressed, focused, on, and disabled; ui.css decides
// which layers show from the host element's real state (:hover, :focus-visible, aria-checked, :disabled).
// The idea is Kevin Ngo's (Looseleaf's `defineRecipe` / `useInk`); this is our own, much smaller, engine.

import { createContext, useContext, useId, useMemo, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { InkStroke, InkSvg, useBox, type Box } from './Ink';
import { wipe } from './shapes';
import type { Pen, Stroke } from './stroke';

/** rest: always there. hover / pressed / focus: the host's pointer and keyboard state. on: checked, selected, confirmed. disabled: replaces rest. */
export type Layer = 'rest' | 'hover' | 'pressed' | 'focus' | 'on' | 'disabled';
export type InkTone = 'ink' | 'soft' | 'dim' | 'faint' | 'gold' | 'paper' | 'tone' | 'blue' | 'coral' | 'green' | 'yellow';

export interface PartOpts {
  tone?: InkTone;
  opacity?: number;
  /** Draw the line on (or wipe the fill in) when its layer shows, instead of fading it in. */
  draw?: boolean;
  delay?: number;
  dur?: number;
}
type Part = ({ kind: 'stroke'; s: Stroke } | { kind: 'fill'; d: string }) & PartOpts;

/** The hand in use. 1 is the kit's own; lower is steadier, higher is looser. */
export interface InkHand { wobble: number }
const Hand = createContext<InkHand>({ wobble: 1 });

export function InkProvider({ wobble = 1, children }: { wobble?: number; children: ReactNode }) {
  const v = useMemo(() => ({ wobble }), [wobble]);
  return <Hand.Provider value={v}>{children}</Hand.Provider>;
}

/** What a recipe draws with. */
export class Ink {
  readonly layers = new Map<Layer, Part[]>();
  constructor(readonly seed: string, readonly hand: InkHand) {}

  /** A pen adjusted for the hand in use. Pass every pen through this. */
  pen(p: Pen): Pen {
    return { ...p, wobble: (p.wobble ?? 1) * this.hand.wobble };
  }

  private add(layer: Layer, part: Part) {
    const list = this.layers.get(layer);
    if (list) list.push(part);
    else this.layers.set(layer, [part]);
  }

  /** One stroke or several. `stagger` delays each after the last, so a box draws line by line. */
  stroke(layer: Layer, s: Stroke | Stroke[], o: PartOpts & { stagger?: number } = {}) {
    const { stagger = 0, ...rest } = o;
    (Array.isArray(s) ? s : [s]).forEach((one, i) => {
      if (one.d) this.add(layer, { kind: 'stroke', s: one, ...rest, delay: (rest.delay ?? 0) + i * stagger });
    });
  }

  /** A filled shape. */
  fill(layer: Layer, d: string, o: PartOpts = {}) {
    if (d) this.add(layer, { kind: 'fill', d, ...o });
  }

  /** A filled shape that wipes in from the left when its layer shows. */
  wipe(layer: Layer, d: string, x: number, y: number, w: number, h: number, o: PartOpts = {}) {
    if (d) this.add(layer, { kind: 'stroke', s: wipe(d, x, y, w, h), ...o, draw: true });
  }
}

export interface Recipe<P> {
  id: string;
  /** Room around the host for lines that run past its edge. Default 10. */
  pad?: number;
  draw(ink: Ink, box: Box, params: P): void;
}
export const defineRecipe = <P,>(r: Recipe<P>): Recipe<P> => r;

const ORDER: Layer[] = ['rest', 'disabled', 'on', 'hover', 'pressed', 'focus'];

/**
 * Measures the element `ref` is put on and returns the drawing to render inside it.
 * The element, or an ancestor, needs the class `ink-host`; that is the element whose state the layers follow.
 */
export function useInk<T extends HTMLElement, P>(recipe: Recipe<P>, params: P, seed?: string): { ref: RefObject<T>; box: Box; node: ReactNode } {
  const auto = useId();
  const sd = seed ?? auto;
  const hand = useContext(Hand);
  const [ref, box] = useBox<T>();
  const key = JSON.stringify(params);
  const layers = useMemo(() => {
    if (!box.w || !box.h) return null;
    const ink = new Ink(sd, hand);
    recipe.draw(ink, box, params);
    return ORDER.filter((l) => ink.layers.has(l)).map((l) => [l, ink.layers.get(l)!] as const);
    // params is compared by value through `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe, box, key, sd, hand]);
  const node = layers && (
    <InkSvg box={box} pad={recipe.pad ?? 10} className={layers.some(([l]) => l === 'disabled') ? 'ink-has-disabled' : undefined}>
      {layers.map(([name, parts]) => (
        <g key={name} className={`ink-layer ink-layer-${name}`}>
          {parts.map((p, i) => {
            const tone = `ink-c-${p.tone ?? 'ink'}`;
            const o = p.opacity != null ? ({ '--o': p.opacity } as CSSProperties) : undefined;
            if (p.kind === 'stroke' && p.draw) {
              return <g key={i} className={tone} style={p.opacity != null ? { opacity: p.opacity } : undefined}><InkStroke s={p.s} draw={name === 'rest' ? 'mount' : 'state'} delay={p.delay} dur={p.dur} /></g>;
            }
            return <path key={i} className={`ink-part ${tone}`} style={o} d={p.kind === 'stroke' ? p.s.d : p.d} fill="currentColor" />;
          })}
        </g>
      ))}
    </InkSvg>
  );
  return { ref, box, node };
}
