import { request, observation, changed } from "./validation.mjs";
import { createWatcher } from "../../runtime/observation/watch.mjs";

/** Deferred host recovery, independent of plugin KV and location scheduling. */
export function createHostStorageRecoveryClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const observe = async (value = {}, options) => {
    const input = request(value, "observe");
    return observation(await host.call("storage.recovery.observe", input, options), input.revision);
  };
  return Object.freeze({ observe, subscribe: createWatcher(observe),
    request: async (value, options) => {
      const input = request(value, "request");
      return changed(await host.call("storage.recovery.request", input, { timeoutMs: 70000, ...options }), input);
    } });
}
