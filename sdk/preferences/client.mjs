import { observation, validRevision } from "./observation.mjs";
import { createWatcher } from "./watch.mjs";

/** Transport-independent facade. Host authorization still owns every operation. */
export function createPreferencesClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const observe = async (request = {}, options) => {
    if (!request || typeof request !== "object" || Array.isArray(request) ||
        Object.keys(request).some(key => key !== "revision") ||
        Object.hasOwn(request, "revision") && !validRevision(request.revision))
      throw new TypeError("Invalid preference observation request");
    const revision = Object.hasOwn(request, "revision") ? request.revision : undefined;
    const result = await host.call("preferences.observe", revision === undefined ? {} : { revision }, options);
    return observation(result, revision);
  };
  return Object.freeze({
    schema: () => host.call("preferences.schema", {}),
    read: () => host.call("preferences.snapshot", {}),
    update: request => host.call("preferences.update", request),
    observe,
    subscribe: createWatcher(observe),
  });
}
