// Shared scaffolding for the kit's Clayzo moments: time base, the measured palette, eases, and a small scene builder.
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  ANIMATION_DOCUMENT_VERSION, assertValidAnimationDocument, base, constant, fill, hex, keyed, marker,
  stroke, trim, validateAnimationDocument, withComputedRevision,
  type Animatable, type BaseOptions, type Color, type Ease, type Marker, type PathContour, type SceneNode,
} from '@clayzo/animation/authoring';

/** Seconds to ticks: 240 ticks per second, snapped to 60 fps frames. */
export const t = (sec: number) => Math.round(sec * 60) * 4;

// Measured from refs/candidates/ian-map-reference.webp. Nothing invented.
export const PAPER = hex('#141318');
export const INK = hex('#e6e4de');
export const GOLD = hex('#c5a559');
export const GREEN = hex('#69927d');
export const BLUE = hex('#6687ac');
export const CORAL = hex('#b58970');

export const OUT = { x1: 0.2, y1: 0.45, x2: 0.45, y2: 1 };
export const POP = { x1: 0.1, y1: 0.9, x2: 0.3, y2: 1 };
export const SNAP = { x1: 0.45, y1: 0, x2: 0.55, y2: 1 };
export const PEN = { x1: 0.65, y1: 0, x2: 0.35, y2: 1 };
export const v3 = (x: number, y = x) => ({ x, y, z: 1 });
export const rot = (z: number) => ({ x: 0, y: 0, z });
export const at = (x: number, y: number) => ({ x, y, z: 0 });

export { constant, fill, keyed, stroke, trim };
export type { Animatable, Ease, PathContour };

export class Scene {
  readonly nodes: Record<string, SceneNode> = {};
  readonly order: string[] = [];
  readonly markers: Marker[] = [];
  readonly duration: number;
  constructor(readonly id: string, readonly name: string, readonly w: number, readonly h: number, seconds: number, readonly label: string) {
    this.duration = t(seconds);
  }
  get cx() { return this.w / 2; }
  get cy() { return this.h / 2; }

  add(n: SceneNode) { this.nodes[n.id] = n; this.order.push(n.id); }
  mark(id: string, sec: number) { this.markers.push(marker(id, t(sec))); }

  private opts(o: Partial<BaseOptions> & { from?: number }): BaseOptions {
    const { from, ...rest } = o;
    const pos = 'position' in rest && rest.position ? {} : { x: (rest as { x?: number }).x ?? this.cx, y: (rest as { y?: number }).y ?? this.cy };
    return { outTick: this.duration, inTick: from != null ? t(from) : 0, ...rest, ...pos } as BaseOptions;
  }

  /** Strokes that draw themselves on from `from` over `dur` seconds. All contours of the node draw together. */
  drawn(id: string, contours: PathContour[], color: Color, width: number, from: number, dur: number, o: Partial<BaseOptions> & { ease?: Ease } = {}) {
    const { ease, ...rest } = o;
    this.add({
      ...base(id, this.opts({ ...rest, from })),
      type: 'path',
      path: constant({ contours }),
      style: { stroke: stroke(color, width, { cap: 'round', join: 'round' }) },
      operators: [trim(`${id}.trim`, { end: keyed(`${id}.end`, [[t(from), 0, ease ?? PEN], [t(from + dur), 1]]) })],
    } as SceneNode);
  }

  /** Filled shapes. */
  filled(id: string, contours: PathContour[], color: Color, o: Partial<BaseOptions> & { from?: number } = {}) {
    this.add({ ...base(id, this.opts(o)), type: 'path', path: constant({ contours }), style: { fill: fill(color) } } as SceneNode);
  }

  /** A ground, for exports. The kit's copies have none, so they sit on the page's own paper. */
  ground() {
    this.add({ ...base('paper', { outTick: this.duration, x: this.cx, y: this.cy }), type: 'rect', size: constant({ width: this.w, height: this.h }), cornerRadius: constant(0), style: { fill: fill(PAPER) } } as SceneNode);
  }

  build(tokens: Record<string, string | number | boolean> = {}) {
    const document = withComputedRevision({
      version: ANIMATION_DOCUMENT_VERSION, id: this.id, name: this.name,
      // alpha 0: the kit's copies sit on whatever is behind them (the page's paper, or the stream)
      canvas: { width: this.w, height: this.h, pixelAspectRatio: 1, backgroundColor: { ...PAPER, a: 0 } },
      timing: { ticksPerSecond: 240, frameRate: { numerator: 60, denominator: 1 }, durationTicks: this.duration, displayStartTick: 0 },
      assets: {}, rootCompositionId: 'main', components: {},
      compositions: { main: { id: 'main', name: 'Main', width: this.w, height: this.h, durationTicks: this.duration, nodes: this.nodes, rootNodeIds: this.order } },
      markers: this.markers,
      design: { tokens: { looping: false, ...tokens }, accessibilityLabel: this.label },
      capabilities: { required: [], optional: [], unsupportedPolicy: 'warn' },
    });
    assertValidAnimationDocument(document);
    return { document, warnings: validateAnimationDocument(document).diagnostics };
  }
}

/** Writes the document to animations/ here and to the kit (web/src/ui/moments/). */
export function write(scene: Scene, tokens: Record<string, string | number | boolean> = {}) {
  const { document, warnings } = scene.build(tokens);
  const json = JSON.stringify(document);
  for (const dir of ['../animations/', '../../../web/src/ui/moments/']) {
    mkdirSync(new URL(dir, import.meta.url), { recursive: true });
    writeFileSync(new URL(`${dir}${scene.id}.json`, import.meta.url), json);
  }
  console.log(`${scene.id}: ${order(scene)} nodes, ${(json.length / 1024).toFixed(0)} KB, revision ${document.revision.slice(7, 19)}, ${warnings.length} warnings${warnings.length ? ' ' + JSON.stringify(warnings).slice(0, 400) : ''}`);
}
const order = (s: Scene) => s.order.length;
