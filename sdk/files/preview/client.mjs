import { createWatcher } from "../../runtime/observation/watch.mjs";
import { actionRequest, observationRequest, openRequest, providersRequest } from "./data/request.mjs";
import { accepted, observation, providers } from "./data/reply.mjs";

/** Host quick-look state. Actions are exact, one-shot intents and never auto-replay. */
export function createFilePreviewClient(host) {
  if (typeof host?.call !== "function") throw new TypeError("A host call transport is required");
  const observe = async (input = {}, options) => {
    const request = observationRequest(input);
    return observation(await host.call("filePreview.observe", request, options), request);
  };
  const watch = createWatcher(observe);
  return Object.freeze({
    observe,
    async providers(input, options) {
      const request = providersRequest(input);
      return providers(await host.call("filePreview.providers", request, options), request);
    },
    async action(input, options) {
      const request = actionRequest(input);
      return accepted(await host.call("filePreview.action", request, options));
    },
    async open(input, options) {
      const request = openRequest(input);
      return accepted(await host.call("filePreview.open", request, options));
    },
    subscribe(receive, options) { return watch(receive, options); },
  });
}
