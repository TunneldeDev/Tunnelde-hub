import type { ProfilesObservationRequest, ProfilesObservation } from "./observation.mjs";
import type { ProfilesCatalogue } from "./content/catalogue.mjs";
import type { ProfileReadRequest, ProfileContentChunk } from "./content/read.mjs";
import type { ProfileDraftPrepare, ProfileDraftAppend, ProfileDraftDiscard, ProfileDraft, ProfileDraftDiscarded } from "./mutations/drafts.mjs";
import type { ProfileSave, ProfileRename, ProfileDelete, ProfileChanged, ProfileActivate, ProfileActivated } from "./mutations/writes.mjs";

export interface ProfilesMethodMap {
  "profiles.drafts.prepare": [ProfileDraftPrepare, ProfileDraft];
  "profiles.drafts.append": [ProfileDraftAppend, ProfileDraft];
  "profiles.drafts.discard": [ProfileDraftDiscard, ProfileDraftDiscarded];
  "profiles.save": [ProfileSave, ProfileChanged];
  "profiles.rename": [ProfileRename, ProfileChanged];
  "profiles.delete": [ProfileDelete, ProfileChanged];
  "profiles.activate": [ProfileActivate, ProfileActivated];
  "profiles.observe": [ProfilesObservationRequest, ProfilesObservation];
  "profiles.catalogue": [Record<string, never>, ProfilesCatalogue];
  "profiles.read": [ProfileReadRequest, ProfileContentChunk];
}
