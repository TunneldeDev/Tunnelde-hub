import { request, observation, changed } from "./validation.mjs";
import { createWatcher } from "../../runtime/observation/watch.mjs";

/** Global metadata only; separate permissions and native consent for mutations. */
export function createHostStorageClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const observe = async (value = {}, options) => {
    const input = request(value, "observe");
    return observation(await host.call("storage.locations.observe", input, options), input.revision);
  };
  const mutate = async (value, kind, options) => {
    const input = request(value, kind);
    return changed(await host.call(`storage.locations.${kind}`, input, { timeoutMs: 70000, ...options }), kind);
  };
  return Object.freeze({ observe, subscribe: createWatcher(observe),
    schedule: (value, options) => mutate(value, "schedule", options),
    cancel: (value, options) => mutate(value, "cancel", options) });
}
