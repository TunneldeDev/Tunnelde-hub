import { observation, validRevision } from "./observation.mjs";
import { createWatcher } from "../runtime/observation/watch.mjs";

/** Plugin-owned JSON data only. Runtime authorization remains with the host. */
export function createStorageClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const observe = async (request = {}, options) => {
    if (!request || typeof request !== "object" || Array.isArray(request) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(request)) ||
        Reflect.ownKeys(request).some(key => key !== "revision") ||
        Object.hasOwn(request, "revision") &&
          (!("value" in Object.getOwnPropertyDescriptor(request, "revision")) || !validRevision(request.revision)))
      throw new TypeError("Invalid plugin storage observation request");
    const revision = Object.hasOwn(request, "revision") ? request.revision : undefined;
    return observation(await host.call("storage.observe", revision === undefined ? {} : { revision }, options), revision);
  };
  return Object.freeze({ observe, subscribe: createWatcher(observe) });
}
