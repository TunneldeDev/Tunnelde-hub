import type { RuntimeResourcesQuery, RuntimeResourcesSnapshot } from "./data/snapshot.mjs";
import type { RuntimeResourceRelease, RuntimeResourceReleased } from "./data/release.mjs";
import type { RuntimeResourceReference } from "./data/identify.mjs";
import type { RuntimeResource } from "./data/resource.mjs";
export interface RuntimeResourcesMethodMap {
  "resources.identify": [RuntimeResourceReference, RuntimeResource];
  "resources.snapshot": [RuntimeResourcesQuery, RuntimeResourcesSnapshot];
  "resources.release": [RuntimeResourceRelease, RuntimeResourceReleased];
}
