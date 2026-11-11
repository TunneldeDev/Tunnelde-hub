import type { ProfilesObservationRequest, ProfilesObservation } from "./observation.mjs";

export interface ProfilesMethodMap {
  "profiles.observe": [ProfilesObservationRequest, ProfilesObservation];
}
