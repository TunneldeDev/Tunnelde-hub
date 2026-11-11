import { createWatcher } from "../runtime/observation/watch.mjs";
import { observationRequest, rangeRequest, editsRequest } from "./data/request.mjs";
import { observation, range, applied } from "./data/reply.mjs";

/** Explicit transport, live host permissions and exact buffer identity on every operation. */
export function createEditorBufferClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const observe = async (input = {}, options) => {
    const request = observationRequest(input);
    return observation(await host.call("editor.observe", request, options), request);
  };
  const watch = createWatcher(observe);
  return Object.freeze({
    observe,
    async readRange(input, options) {
      const request = rangeRequest(input);
      return range(await host.call("editor.readRange", request, options), request);
    },
    async applyEdits(input, options) {
      const request = editsRequest(input);
      return applied(await host.call("editor.applyEdits", request, options), request);
    },
    subscribe(receive, options) {
      const selector = observationRequest(Object.hasOwn(options ?? {}, "tabId") ? { tabId: options.tabId } : {});
      return watch(receive, options, selector);
    },
  });
}
