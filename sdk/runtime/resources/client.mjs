/** Strict facade over the existing authorized transport; never starts a runtime. */
export function createRuntimeResourcesClient(host) {
  return Object.freeze({
    identify: reference => host.call("resources.identify", reference),
    snapshot: (query = {}) => host.call("resources.snapshot", query),
    release: request => host.call("resources.release", request),
  });
}
