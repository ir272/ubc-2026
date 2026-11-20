// Beat 2a: the blast. When a robot crosses a blast line one column drives into the frame from that
// edge, at the point where it left, angled back along its flight: the scorer's side colour with a
// white core (column.ts). The envelope: it grows in from the edge across 4 frames, holds with a
// slow breath, then thins out to nothing. The final's column is wider and is gone by the time
// LIGHTS OUT has landed, so the word and the dark set are all that is left.
// Clean pass: no bolts, no shards, no lanes or stepped bands. One column, nothing else.

import { PALETTE } from '../style.ts';
import { lin, easeOut, smooth, SCREEN_W, SCREEN_H } from './kit.ts';
import { Column } from './column.ts';

export interface BlastSpec {
  /** screen px (centre origin) where the column enters */
  ox: number;
  oy: number;
  /** unit direction into the screen */
  ux: number;
  uy: number;
  side: 0 | 1;
  final: boolean;
}

export class Blast {
  age = 99;
  private spec: BlastSpec = { ox: 0, oy: 0, ux: 1, uy: 0, side: 0, final: false };
  readonly column: Column;

  constructor(private readonly sideColors: [string, string], renderOrder = 880) {
    this.column = new Column(renderOrder);
  }

  get live(): boolean {
    return this.age < this.end;
  }

  /** seconds the blast lasts */
  get end(): number {
    return this.spec.final ? 0.9 : 0.8;
  }

  /** frame the column starts to thin out */
  get hold(): number {
    return this.spec.final ? 30 : 32;
  }

  start(spec: BlastSpec): void {
    this.spec = { ...spec };
    this.age = 0;
    const u = this.column.u;
    u.cCore.value.copy(lin(PALETTE.white));
    u.cSide.value.copy(lin(this.sideColors[spec.side]));
  }

  update(dt: number): void {
    if (this.age >= this.end) {
      this.column.mesh.visible = false;
      return;
    }
    this.age += dt;
  }

  /** frames since the blast, as a float */
  get f(): number {
    return this.age * 60;
  }

  draw(): void {
    const col = this.column;
    if (this.age >= this.end) {
      col.mesh.visible = false;
      return;
    }
    const sp = this.spec;
    const f = this.f;
    // how far the column reaches across the screen, and how wide it is against the frame
    const span = Math.abs(sp.ux) * SCREEN_W + Math.abs(sp.uy) * SCREEN_H;
    const perp = Math.abs(sp.ux) * SCREEN_H + Math.abs(sp.uy) * SCREEN_W;
    const W = sp.final ? Math.min(560, perp * 0.5) : Math.min(380, perp * 0.34);
    const gone = this.end * 60;
    const reach = easeOut(f / 4);
    // in from a thin spear to full width by frame 6, a slow breath while it holds, then thins out
    const grow = f < 6 ? 0.15 + 0.85 * smooth(f / 6) : 1 + 0.03 * Math.sin((f - 6) * 0.35);
    const out = 1 - smooth((f - this.hold) / (gone - this.hold));
    const u = col.u;
    u.uO.value.set(sp.ox, sp.oy);
    u.uU.value.set(sp.ux, sp.uy);
    u.uStart.value = -160;
    u.uLen.value = Math.max(10, span * 1.15 * reach);
    u.uHalf.value = W * 0.5;
    u.uThin.value = grow * out;
    // the white core narrows first as it thins out
    u.uCore.value = 0.42 * (0.4 + 0.6 * out);
    col.mesh.visible = u.uThin.value > 0.01;
  }

  dispose(): void {
    this.column.dispose();
  }
}
