import type { RuntimeResourcesQuery, RuntimeResourcesSnapshot } from "./data/snapshot.mjs";
import type { RuntimeResourceRelease, RuntimeResourceReleased } from "./data/release.mjs";
import type { RuntimeResourceReference } from "./data/identify.mjs";
import type { RuntimeResource } from "./data/resource.mjs";
export interface RuntimeResourcesClient {
  identify(reference: RuntimeResourceReference): Promise<RuntimeResource>;
  snapshot(query?: RuntimeResourcesQuery): Promise<RuntimeResourcesSnapshot>;
  release(request: RuntimeResourceRelease): Promise<RuntimeResourceReleased>;
}
