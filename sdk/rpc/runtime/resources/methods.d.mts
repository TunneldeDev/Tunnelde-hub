import type { RuntimeResourcesQuery, RuntimeResourcesSnapshot } from "./data/snapshot.mjs";
import type { RuntimeResourceRelease, RuntimeResourceReleased } from "./data/release.mjs";
export interface RuntimeResourcesMethodMap {
  "resources.snapshot": [RuntimeResourcesQuery, RuntimeResourcesSnapshot];
  "resources.release": [RuntimeResourceRelease, RuntimeResourceReleased];
}
