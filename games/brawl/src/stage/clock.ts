// The show clock.
//
// Live: estimates the server's clock from the `t` (and the snapshot's `serverNow`) on feed messages.
// A message is stamped when the server sends it, so `t - localNow` at arrival is the offset minus
// the network delay; the largest recent sample is the best estimate. The estimate only ever moves
// forward smoothly, so the show never jumps backwards.
//
// Capture: a VirtualClock that advances only when asked. It also serves as the fake Show's clock
// (now + sleep), so the match script, the feed and the stage all run on the same virtual time.
//
// No DOM here: the VirtualClock is used by node tests too.

export interface TimeSource {
  /** server time estimate, epoch ms */
  serverNow(): number;
}

export class ShowClock implements TimeSource {
  private offset = 0; // server - local
  private has = false;
  private local: () => number;

  constructor(local: () => number = defaultLocal) {
    this.local = local;
  }

  /** feed a server timestamp seen just now */
  sample(serverT: number | undefined): void {
    if (typeof serverT !== 'number' || !isFinite(serverT)) return;
    const s = serverT - this.local();
    if (!this.has) {
      this.offset = s;
      this.has = true;
      return;
    }
    if (s > this.offset) {
      // a faster message: move up, but smoothly if it is a big step (avoid visible jumps)
      const d = s - this.offset;
      this.offset += d > 250 ? d * 0.25 : d;
    } else if (s < this.offset - 2000) {
      // the server clock went back a lot (restart, clock fix): accept it
      this.offset = s;
    } else {
      // drift down very slowly so a single early outlier does not stick forever
      this.offset -= Math.min(0.5, this.offset - s);
    }
  }

  serverNow(): number {
    return this.local() + this.offset;
  }
}

function defaultLocal(): number {
  const p = (globalThis as { performance?: { now(): number; timeOrigin?: number } }).performance;
  if (p && typeof p.timeOrigin === 'number') return p.timeOrigin + p.now();
  return Date.now();
}

interface Timer {
  at: number;
  seq: number;
  resolve: () => void;
}

/** a macrotask boundary: lets every pending promise continuation run */
export function macrotask(): Promise<void> {
  const si = (globalThis as { setImmediate?: (f: () => void) => unknown }).setImmediate;
  if (si) return new Promise((r) => si(r));
  const MC = (globalThis as { MessageChannel?: typeof MessageChannel }).MessageChannel;
  if (MC && typeof window !== 'undefined') {
    return new Promise((r) => {
      const ch = new MC();
      ch.port1.onmessage = () => {
        ch.port1.close();
        r();
      };
      ch.port2.postMessage(0);
    });
  }
  return new Promise((r) => setTimeout(r, 0));
}

/** Virtual time. Nothing moves unless advance() is called. now() is epoch-like ms. */
export class VirtualClock implements TimeSource {
  private t: number;
  private timers: Timer[] = [];
  private seq = 0;

  constructor(start = 1_800_000_000_000) {
    this.t = start;
  }

  now = (): number => this.t;
  serverNow(): number {
    return this.t;
  }

  sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => {
      const at = this.t + Math.max(0, ms || 0);
      this.timers.push({ at, seq: this.seq++, resolve });
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    });
  };

  /** ms until the next timer, or Infinity */
  nextIn(): number {
    return this.timers.length ? this.timers[0].at - this.t : Infinity;
  }

  pending(): number {
    return this.timers.length;
  }

  /** advance to `this.now() + ms`, firing every timer in order and letting its continuations run */
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    // settle anything that was scheduled at the current time first
    await macrotask();
    let guard = 0;
    while (this.timers.length && this.timers[0].at <= target) {
      const tm = this.timers.shift()!;
      if (tm.at > this.t) this.t = tm.at;
      tm.resolve();
      await macrotask();
      if (++guard > 100000) throw new Error('VirtualClock: runaway timers');
    }
    this.t = target;
    await macrotask();
  }
}
