import { catalogue, chunk, record, validId, contentRevision, MAX_CHUNK_BYTES } from "./validation.mjs";
import { profileValues } from "./values.mjs";

/** Sequential bounded assembly; no half-body delivery or cross-version retries. */
export function createContentClient(host) {
  let pending = 0;
  const read = async (input, options) => {
    if (!record(input) || Object.keys(input).some(key => key !== "id" && key !== "revision") ||
        !validId(input.id) || !contentRevision(input.revision) || !record(options) ||
        Object.keys(options).some(key => key !== "signal" && key !== "timeoutMs") ||
        !(options.signal instanceof AbortSignal) ||
        options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120_000))
      throw new TypeError("Invalid profile content request or owner");
    const { id, revision } = input;
    const owner = options.signal;
    owner.throwIfAborted();
    if (pending >= 4) throw new Error("Too many profile content operations");
    pending++;
    const controller = new AbortController(), budget = options.timeoutMs ?? 30_000;
    const deadline = performance.now() + budget;
    const abort = () => controller.abort(owner.reason);
    owner.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("Profile read timed out", "TimeoutError")), budget);
    const check = () => { controller.signal.throwIfAborted(); if (performance.now() >= deadline) throw new DOMException("Profile read timed out", "TimeoutError"); };
    try {
      const parts = [];
      let offset = 0, total;
      // Limit total calls as well as total bytes, even with a hostile transport
      // that returns only one byte per page and ignores cancellation/deadlines.
      for (let pages = 0; pages < 4096; pages++) {
        check();
        const request = { id, revision, offset, limit: MAX_CHUNK_BYTES };
        const raw = await host.call("profiles.read", request, {
          signal: controller.signal, timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
        });
        check();
        const result = chunk(raw, request, total);
        total = result.totalBytes;
        parts.push(result.text);
        if (result.nextOffset === null) {
          const values = profileValues(parts.join(""));
          check();
          return values;
        }
        offset = result.nextOffset;
      }
      throw new Error("Profile content page limit exceeded");
    } finally {
      clearTimeout(timer); owner.removeEventListener("abort", abort); pending--;
    }
  };
  return { catalogue: async options => catalogue(await host.call("profiles.catalogue", {}, options)), read };
}
