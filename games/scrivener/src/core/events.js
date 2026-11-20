// Event plumbing. Owner: core. Pure.
//
// The sim never calls listeners directly: it appends plain event objects to
// `world.events` via emit(). The host (main.js) drains them each tick into a
// bus that fx / audio / hud subscribe to. This keeps the sim deterministic and
// runnable in Node with no listeners at all.
//
// Every event: { type, t (world combat ms), tick, ...payload }

export function emit(world, type, data) {
  const e = { type, t: world.t, tick: world.tick };
  if (data) Object.assign(e, data);
  world.events.push(e);
  return e;
}

export function createBus() {
  const map = new Map();
  const any = new Set();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type).delete(fn);
    },
    onAny(fn) {
      any.add(fn);
      return () => any.delete(fn);
    },
    emit(type, payload = {}) {
      const e = payload.type ? payload : { type, ...payload };
      const set = map.get(type);
      if (set) for (const fn of set) fn(e);
      for (const fn of any) fn(e);
    },
    dispatch(events) {
      for (const e of events) this.emit(e.type, e);
    },
  };
}
