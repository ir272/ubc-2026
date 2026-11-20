// One clock for the stage and for the harness's fake show.
//   realClock()     wall time and real timers (the live site and `npm run dev`)
//   virtualClock()  time only moves when advance(ms) is called (captures and headless runs), so
//                   the same show and the same arguments always give the same frames
// now() is in milliseconds on the "server" timeline the feed uses (msg.t, closesAt, startedAt).

export function realClock() {
  return {
    virtual: false,
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, Math.max(0, ms)),
    clearTimeout: (h) => clearTimeout(h),
    sleep: (ms) => new Promise((res) => setTimeout(res, Math.max(0, ms))),
  };
}

export function virtualClock(start = 1_700_000_000_000) {
  let t = start, seq = 0;
  const timers = new Map();
  const clock = {
    virtual: true,
    now: () => t,
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: t + Math.max(0, ms), fn, id }); return id; },
    clearTimeout(id) { timers.delete(id); },
    sleep: (ms) => new Promise((res) => clock.setTimeout(res, ms)),
    /** Run every timer due within the next `ms`, in order, then land on t + ms. Async: promise
     *  continuations scheduled by a timer run before the next timer. */
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const x of timers.values()) if (x.at <= end && (!next || x.at < next.at || (x.at === next.at && x.id < next.id))) next = x;
        if (!next) break;
        timers.delete(next.id);
        t = Math.max(t, next.at);
        next.fn();
        // let awaiting code (the show script) run and schedule its next timer
        for (let i = 0; i < 8; i++) await Promise.resolve();
      }
      t = end;
    },
    pending: () => timers.size,
  };
  return clock;
}
