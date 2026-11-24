import { createWatcher } from "../../runtime/observation/watch.mjs";
import { preparation, range, CHUNK_BYTES } from "./data/request.mjs";
import { prepared, observation, bytes, closed } from "./data/reply.mjs";
import { operations, release, signal } from "./owner.mjs";

/** Own every handle; no Node runtime, global preview IDs or implicit SSH target. */
export function createFileContentClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const run = operations(host);
  let handles = 0;
  return Object.freeze({
    async open(input, options = {}) {
      const request = preparation(input), owner = signal(options.signal);
      if (handles >= 8) throw new Error("Too many file content handles");
      handles++;
      let contentId, closePromise, locallyClosed = false, charged = true;
      const uncharge = () => { if (charged) { charged = false; handles--; } };
      const close = () => {
        if (closePromise) return closePromise;
        locallyClosed = true;
        owner.removeEventListener("abort", abort);
        closePromise = contentId ? release(host, contentId).then(closed).finally(uncharge) : Promise.resolve().then(uncharge);
        return closePromise;
      };
      const abort = () => { void close().catch(() => {}); };
      try {
        return await run(owner, options, async (call, check) => {
          const reservation = prepared(await call("files.content.prepare", request));
          contentId = reservation.contentId;
          check();
          // Install before issuing open; this close can overtake its dispatch.
          owner.addEventListener("abort", abort, { once: true });
          if (owner.aborted) { abort(); check(); }
          const opened = observation(await call("files.content.open", { contentId }), contentId, true);
          check();
          if (locallyClosed) throw new Error("File content closed during open");
          const observe = async (callOptions) => {
            if (locallyClosed) return Object.freeze({ version: 1, contentId, state: "closed", size: null, chunkBytes: CHUNK_BYTES, leaseMs: 0 });
            const value = await run(owner, callOptions, async call => observation(await call("files.content.observe", { contentId }), contentId));
            if (value.state === "closed") { locallyClosed = true; owner.removeEventListener("abort", abort); uncharge(); }
            return value;
          };
          const watch = createWatcher(async (input, callOptions) => {
            const value = await observe(callOptions), revision = value.state + ":" + value.size;
            return { changed: input.revision !== revision, revision, snapshot: value };
          });
          return Object.freeze({
            contentId, size: opened.size, chunkBytes: CHUNK_BYTES,
            get closed() { return locallyClosed; },
            close, observe,
            subscribe(receive, options) { return watch(receive, { signal: owner, ...options }); },
            async read(input, callOptions) {
              const request = range(input, opened.size);
              if (locallyClosed) throw new Error("File content is closed");
              return run(owner, callOptions, async call => {
                const value = await call("files.content.read", { contentId, ...request });
                if (locallyClosed) throw new Error("File content closed during read");
                return bytes(value, contentId, request, opened.size);
              });
            },
          });
        });
      } catch (error) {
        // Unknown prepare replies own no native file/channel and expire. Once
        // known, cleanup is independent of the aborted operation's signal.
        try { await close(); } catch { /* Host expiry/runtime retirement also reclaim it. */ }
        throw error;
      }
    },
  });
}
