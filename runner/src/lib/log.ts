const ts = () => new Date().toISOString().slice(11, 23);
let quiet = process.env.LOG_QUIET === '1';

export const log = {
  setQuiet(q: boolean) {
    quiet = q;
  },
  info: (...a: unknown[]) => {
    if (!quiet) console.log(ts(), ...a);
  },
  warn: (...a: unknown[]) => {
    if (!quiet) console.warn(ts(), 'WARN', ...a);
  },
  error: (...a: unknown[]) => {
    if (!quiet) console.error(ts(), 'ERROR', ...a);
  },
};

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason ?? new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
