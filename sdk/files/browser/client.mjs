import { createWatcher } from "../../runtime/observation/watch.mjs";
import { actionRequest, observationRequest, readRequest } from "./data/request.mjs";
import { accepted, listing, observation } from "./data/reply.mjs";

/** Live UI state only. Mutations use one exact-revision call and never retry. */
export function createFileBrowserClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const observe = async (input = {}, options) => {
    const request = observationRequest(input);
    return observation(await host.call("fileBrowser.observe", request, options), request);
  };
  const watch = createWatcher(observe);
  return Object.freeze({
    observe,
    async read(input, options) {
      const request = readRequest(input);
      return listing(await host.call("fileBrowser.read", request, options), request);
    },
    async action(input, options) {
      const request = actionRequest(input);
      return accepted(await host.call("fileBrowser.action", request, options));
    },
    subscribe(receive, options) {
      const selector = observationRequest({
        ...(Object.hasOwn(options ?? {}, "offset") ? { offset: options.offset } : {}),
        ...(Object.hasOwn(options ?? {}, "limit") ? { limit: options.limit } : {}),
      });
      return watch(receive, options, selector);
    },
  });
}
