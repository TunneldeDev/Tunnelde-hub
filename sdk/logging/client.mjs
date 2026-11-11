import { request, page } from "./validation.mjs";
import { createLogWatcher } from "./watch.mjs";

export function createLoggingClient(host) {
  if (typeof host?.call !== "function")
    throw new TypeError("A host call transport is required");
  const read = async (input = {}, options) => {
    const query = request(input);
    if (options?.signal?.aborted)
      throw options.signal.reason ?? new Error("Aborted");
    const response = await host.call("logs.read", query, options);
    if (options?.signal?.aborted)
      throw options.signal.reason ?? new Error("Aborted");
    return page(response, query);
  };
  return Object.freeze({ read, subscribe: createLogWatcher(read, request) });
}
