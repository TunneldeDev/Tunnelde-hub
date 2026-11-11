import { observation, validRevision } from "./observation.mjs";
import { createWatcher } from "../runtime/observation/watch.mjs";
import { createContentClient } from "./content/client.mjs";

/** Profile reads. Authorization remains the host's responsibility. */
export function createProfilesClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const observe = async (request = {}, options) => {
    if (!request || typeof request !== "object" || Array.isArray(request) ||
        Object.keys(request).some(key => key !== "revision") ||
        Object.hasOwn(request, "revision") && !validRevision(request.revision))
      throw new TypeError("Invalid profile observation request");
    const revision = Object.hasOwn(request, "revision") ? request.revision : undefined;
    return observation(await host.call("profiles.observe", revision === undefined ? {} : { revision }, options), revision);
  };
  return Object.freeze({ observe, subscribe: createWatcher(observe), ...createContentClient(host) });
}
