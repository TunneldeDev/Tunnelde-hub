import type { ProfilesObservationRequest, ProfilesObservation } from "./observation.mjs";
import type { ProfilesCatalogue } from "./content/catalogue.mjs";
import type { ProfileReadRequest, ProfileContentChunk } from "./content/read.mjs";

export interface ProfilesMethodMap {
  "profiles.observe": [ProfilesObservationRequest, ProfilesObservation];
  "profiles.catalogue": [Record<string, never>, ProfilesCatalogue];
  "profiles.read": [ProfileReadRequest, ProfileContentChunk];
}
