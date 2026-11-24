import { record } from "../content/validation.mjs";

/** Capacity covers actual transport settlement, including aborted cleanup. */
export function ownedOperations() {
  let pending = 0;
  return async (options, work) => {
    if (!record(options) || Object.keys(options).some(key => key !== "signal" && key !== "timeoutMs") ||
      !options.signal || typeof options.signal.aborted !== "boolean" ||
      typeof options.signal.addEventListener !== "function" || typeof options.signal.removeEventListener !== "function" ||
      options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120_000))
      throw new TypeError("Profile mutations require an owner and bounded deadline");
    const owner = options.signal;
    if (owner.aborted) throw owner.reason ?? new DOMException("Profile operation aborted", "AbortError");
    if (pending >= 4) throw new Error("Too many profile mutation operations");
    pending++;
    const controller = new AbortController(), budget = options.timeoutMs ?? 90_000;
    const deadline = performance.now() + budget;
    const abort = () => controller.abort(owner.reason);
    owner.addEventListener("abort", abort, {once:true});
    const timer = setTimeout(() => controller.abort(new DOMException("Profile operation timed out", "TimeoutError")), budget);
    const check = () => {
      if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException("Profile operation aborted", "AbortError");
      if (performance.now() >= deadline) throw new DOMException("Profile operation timed out", "TimeoutError");
    };
    try {
      check();
      return await work({check, call: async (host, method, params) => {
        check();
        const result = await host.call(method, params, {signal:controller.signal, timeoutMs:Math.max(1,Math.ceil(deadline-performance.now()))});
        check(); return result;
      }});
    } finally {
      clearTimeout(timer); owner.removeEventListener("abort",abort); pending--;
    }
  };
}

/** This is cleanup, not retry. A non-cooperative transport retains its slot. */
export async function discard(host, draftId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Draft cleanup timed out", "TimeoutError")), 1000);
  try { await host.call("profiles.drafts.discard", {draftId}, {signal:controller.signal,timeoutMs:1000}); }
  catch { /* Runtime retirement/TTL also reclaim unclaimed uploads. */ }
  finally { clearTimeout(timer); }
}
