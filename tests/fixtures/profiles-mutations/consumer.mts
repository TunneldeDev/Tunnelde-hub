import type { Host, PreferenceValues, ProfileChanged, ProfileActivated, ProfileDraft, ProfileDelete } from "../../../sdk/tunnelde-plugin.mjs";
import type { ProfileChanged as UiChanged, ProfileActivated as UiActivated, ProfileDraft as UiDraft } from "../../../sdk/tunnelde-ui.mjs";
import { createProfilesClient } from "../../../sdk/profiles/client.mjs";

declare const host: Host, values: PreferenceValues, signal: AbortSignal;
const client = createProfilesClient(host);
const catalogue = await client.catalogue({ signal });
const saved: ProfileChanged = await client.save({ name: "Work", revision: catalogue.revision, values }, { signal });
const uiSaved: UiChanged = saved;
const renamed: ProfileChanged = await client.rename({ id: saved.id, name: "Renamed", revision: saved.revision }, { signal });
const preferences = await host.call("preferences.snapshot", {});
const activated: ProfileActivated = await client.activate({ id: saved.id, revision: renamed.revision, preferencesRevision: preferences.revision }, { signal });
const uiActivated: UiActivated = activated;
const draft: ProfileDraft = await host.call("profiles.drafts.prepare", { revision: renamed.revision, totalBytes: 2 });
const uiDraft: UiDraft = draft;
await host.call("profiles.drafts.append", { draftId: draft.draftId, offset: 0, text: "{}" });
await host.call("profiles.drafts.discard", { draftId: draft.draftId });
await client.remove({ id: saved.id, revision: renamed.revision }, { signal });
// @ts-expect-error mutations require an owner lifetime
await client.save({ name: "Work", revision: catalogue.revision, values });
// @ts-expect-error native storage/provider fields are absent from public values
values.uiProviders;
// @ts-expect-error the deletion DTO requires a revision fence
const invalidDelete: ProfileDelete = { id: saved.id };
void invalidDelete;
void [uiSaved, uiActivated, uiDraft];
