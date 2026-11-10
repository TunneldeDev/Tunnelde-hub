import type { RuntimeResourcesQuery, RuntimeResourcesSnapshot } from "./data/snapshot.mjs";
import type { RuntimeResourceRelease, RuntimeResourceReleased } from "./data/release.mjs";
export interface RuntimeResourcesClient {
  snapshot(query?: RuntimeResourcesQuery): Promise<RuntimeResourcesSnapshot>;
  release(request: RuntimeResourceRelease): Promise<RuntimeResourceReleased>;
}
