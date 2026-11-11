function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
/** A log cursor is a stream position, not a latest-state revision. */
export function createLogWatcher(read, normalize) {
  let count = 0;
  return (receive, { signal, intervalMs = 2000 } = {}, input = {}) => {
    if (typeof receive !== "function")
      throw new TypeError("Observer must be a function");
    if (
      !signal ||
      typeof signal.aborted !== "boolean" ||
      typeof signal.addEventListener !== "function" ||
      typeof signal.removeEventListener !== "function"
    )
      throw new TypeError("Log subscription requires an owner AbortSignal");
    if (
      !Number.isInteger(intervalMs) ||
      intervalMs < 1000 ||
      intervalMs > 60000
    )
      throw new RangeError("Invalid intervalMs");
    const query = normalize(input);
    if (count >= 8 && !signal.aborted)
      throw new Error("Too many log subscriptions");
    let active = !signal.aborted,
      outcome = { reason: signal.aborted ? "aborted" : "stopped" };
    const charged = active;
    if (charged) count++;
    const controller = new AbortController();
    const stop = (reason) => {
      if (!active) return;
      active = false;
      outcome = { reason };
      controller.abort();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => stop("aborted");
    if (active) {
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    }
    const done = Promise.resolve().then(async () => {
      let cursor = query.cursor,
        first = true,
        drained = 0;
      try {
        while (active) {
          const result = await read(
            { ...query, ...(cursor === undefined ? {} : { cursor }) },
            { signal: controller.signal, timeoutMs: 10000 },
          );
          if (!active) break;
          if (result.hasMore && result.cursor === cursor)
            throw new Error("Log cursor did not advance");
          if (first || result.entries.length || result.gap || result.reset)
            await receive(result);
          if (!active) break;
          cursor = result.cursor;
          first = false;
          // Yield between pages; continuous writers cannot starve other work.
          const pause = result.hasMore && ++drained < 32 ? 0 : intervalMs;
          if (pause) drained = 0;
          await wait(pause, controller.signal);
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
    return Object.freeze({
      stop: () => stop("stopped"),
      done,
      get closed() {
        return !active;
      },
    });
  };
}
