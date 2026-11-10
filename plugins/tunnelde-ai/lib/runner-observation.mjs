import { delay } from "./tools.mjs";

const READ_METHODS = new Set(["runners.status", "runners.poll"]);
const MAX_ATTEMPTS = 8;
const BUDGET_MS = 30000;

/** Retry only an explicit busy read; mutations and ambiguous failures are never replayed. */
export function createRunnerObserver(host, { now = () => performance.now(), wait = delay } = {}) {
  return async (method, params, signal) => {
    if (!READ_METHODS.has(method)) throw new Error("Only runner observations may be retried");
    signal?.throwIfAborted();
    const snapshot = structuredClone(params);
    const deadline = now() + BUDGET_MS;
    let lastBusy;
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      const remaining = deadline - now();
      if (remaining <= 0) throw lastBusy ?? new Error("Runner observation timed out");
      try {
        const result = await host.call(method, structuredClone(snapshot), {
          signal,
          timeoutMs: Math.max(1, Math.floor(remaining)),
        });
        signal?.throwIfAborted();
        return result;
      } catch (error) {
        signal?.throwIfAborted();
        const backoff = Math.min(100 * 2 ** attempt, 1600);
        if (error?.message !== "plugin.runners.busy" ||
            attempt + 1 >= MAX_ATTEMPTS || deadline - now() <= backoff) throw error;
        lastBusy = error;
        await wait(backoff, signal);
      }
    }
  };
}
