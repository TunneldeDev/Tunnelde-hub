import type { PreferenceSchema } from "./schema.mjs";
import type { PreferenceSnapshot } from "./snapshot.mjs";
import type { PreferenceUpdate } from "./update.mjs";

export interface PreferencesMethodMap {
  "preferences.schema": [Record<string, never>, PreferenceSchema];
  "preferences.snapshot": [Record<string, never>, PreferenceSnapshot];
  "preferences.update": [PreferenceUpdate, PreferenceSnapshot];
}
