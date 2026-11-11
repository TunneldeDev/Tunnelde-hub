import type { PreferenceSchema } from "./schema.mjs";
import type { PreferenceSnapshot } from "./snapshot.mjs";
import type { PreferenceUpdate } from "./update.mjs";
import type { PreferenceObservation, PreferenceObservationRequest } from "./observation.mjs";

export interface PreferencesMethodMap {
  "preferences.schema": [Record<string, never>, PreferenceSchema];
  "preferences.snapshot": [Record<string, never>, PreferenceSnapshot];
  "preferences.observe": [PreferenceObservationRequest, PreferenceObservation];
  "preferences.update": [PreferenceUpdate, PreferenceSnapshot];
}
