const LIMIT = 8;

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Each client owns its quota; cancelled work remains charged until it settles. */
export function createWatcher(observe) {
  let count = 0;
  return (receive, { signal, intervalMs = 2000 } = {}) => {
    if (typeof receive !== "function") throw new TypeError("Preference observer must be a function");
    if (!signal || typeof signal.aborted !== "boolean" ||
        typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")
      throw new TypeError("Preference observation requires an owner AbortSignal");
    if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60000)
      throw new RangeError("intervalMs must be an integer between 1000 and 60000");
    if (count >= LIMIT && !signal.aborted) throw new Error("Too many preference subscriptions");
    const controller = new AbortController();
    let active = !signal.aborted;
    let outcome = { reason: signal.aborted ? "aborted" : "stopped" };
    const charged = active;
    if (charged) count++;
    const stop = (reason = "stopped") => {
      if (!active) return;
      active = false;
      outcome = { reason };
      controller.abort();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => stop("aborted");
    if (active) signal.addEventListener("abort", abort, { once: true });
    // Defer first delivery until callers have the subscription handle.
    const done = Promise.resolve().then(async () => {
      let revision;
      try {
        while (active) {
          const result = await observe(revision === undefined ? {} : { revision }, {
            signal: controller.signal, timeoutMs: 10000,
          });
          if (!active) break;
          revision = result.revision;
          if (result.changed) await receive(result.snapshot);
          if (active) await delay(intervalMs, controller.signal);
        }
      } catch (error) {
        if (active) outcome = { reason: "failed", error };
      } finally {
        active = false;
        controller.abort();
        signal.removeEventListener("abort", abort);
        if (charged) count--;
      }
      return Object.freeze(outcome);
    });
    return Object.freeze({ stop: () => stop(), done, get closed() { return !active; } });
  };
}
