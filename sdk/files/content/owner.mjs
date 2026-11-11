import { keys } from "./data/request.mjs";

export function signal(value) {
  if (!value || typeof value.aborted !== "boolean" || typeof value.addEventListener !== "function" || typeof value.removeEventListener !== "function")
    throw new TypeError("File content requires an owner AbortSignal");
  return value;
}
export function operations(host) {
  let pending = 0;
  return async (owner, options = {}, work) => {
    keys(options, ["signal", "timeoutMs"]);
    const signals = [...new Set([signal(owner), ...(options.signal ? [signal(options.signal)] : [])])];
    const timeout = options.timeoutMs ?? 30000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) throw new RangeError("Invalid content timeout");
    if (pending >= 8) throw new Error("Too many file content operations");
    const controller = new AbortController(), deadline = performance.now() + timeout;
    const listeners = signals.map(owner => {
      const abort = () => controller.abort(owner.reason);
      owner.addEventListener("abort", abort, { once: true });
      if (owner.aborted) abort();
      return [owner, abort];
    });
    const timer = setTimeout(() => controller.abort(new DOMException("File content operation timed out", "TimeoutError")), timeout);
    const check = () => {
      if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException("File content operation aborted", "AbortError");
      if (performance.now() >= deadline) throw new DOMException("File content operation timed out", "TimeoutError");
    };
    pending++;
    try {
      check();
      return await work(async (method, params) => {
        check();
        const result = await host.call(method, params, { signal: controller.signal, timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())) });
        check();
        return result;
      }, check);
    } finally {
      pending--; clearTimeout(timer);
      for (const [owner, abort] of listeners) owner.removeEventListener("abort", abort);
    }
  };
}

/** Independent cleanup can overtake open, but never its already returned preparation. */
export async function release(host, contentId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try { return await host.call("files.content.close", { contentId }, { signal: controller.signal, timeoutMs: 1000 }); }
  finally { clearTimeout(timer); }
}
