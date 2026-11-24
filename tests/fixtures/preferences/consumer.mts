import type { Host, PreferenceSnapshot, PreferenceSchema, PreferenceUpdate } from "../../../sdk/tunnelde-plugin.mjs";

declare const host: Host;
const snapshot: PreferenceSnapshot = await host.call("preferences.snapshot", {});
const schema: PreferenceSchema = await host.call("preferences.schema", {});
const updated: PreferenceSnapshot = await host.call("preferences.update", {
  revision: snapshot.revision,
  changes: {
    appearance: { theme: "dark", colors: {} },
    terminal: { lineHeight: 1.2 },
    workspace: { hostList: { ...snapshot.values.workspace.hostList, widths: {} } },
  },
});
const version: 1 = schema.version;
void updated; void version;

// @ts-expect-error Provider selection is host controlled.
const privateField: PreferenceUpdate = { revision: snapshot.revision, changes: { uiProviders: {} } };
// @ts-expect-error Theme is a defined enum.
const invalidTheme: PreferenceUpdate = { revision: snapshot.revision, changes: { appearance: { theme: "night" } } };
// @ts-expect-error Nested object fields replace, rather than merge.
const incompleteReplacement: PreferenceUpdate = { revision: snapshot.revision, changes: { workspace: { hostList: { widths: {} } } } };
// @ts-expect-error Every update is revision bound.
const missingRevision: PreferenceUpdate = { changes: {} };
// @ts-expect-error Network profiles never expose proxy passwords.
snapshot.values.network.profiles[0].password;
void privateField; void invalidTheme; void incompleteReplacement; void missingRevision;

import { createPreferencesClient } from "../../../sdk/preferences/client.mjs";
const preferences = createPreferencesClient(host);
const observation = await preferences.observe({ revision: snapshot.revision });
if (observation.changed) {
  const revision: string = observation.snapshot.revision;
  void revision;
} else {
  // @ts-expect-error Unchanged reads do not carry a snapshot.
  observation.snapshot.values;
}
const owner = new AbortController();
const subscription = preferences.subscribe(async value => { void value.values.appearance.theme; }, { signal: owner.signal });
subscription.stop();
const completed = await subscription.done;
if (completed.reason === "failed") { const failure: unknown = completed.error; void failure; }
// @ts-expect-error A subscription must be bound to its owner lifetime.
preferences.subscribe(() => {});
// @ts-expect-error Strict facade has no arbitrary method fallback.
await preferences.call("settings.get", {});
// @ts-expect-error Observation revision is a string.
await preferences.observe({ revision: 1 });


import type { FrontendPreferences, PreferenceUpdate as UiPreferenceUpdate } from "../../../sdk/tunnelde-ui.mjs";
import type { FrontendPreferences as DomainPreferences } from "../../../sdk/ui/preferences/provider.mjs";
import type { PreferenceUpdate as RpcPreferenceUpdate } from "../../../sdk/rpc/settings/preferences/update.mjs";
declare const page: FrontendPreferences;
const domain: DomainPreferences = page;
const uiRequest: UiPreferenceUpdate = { revision: "read-first", changes: { appearance: { theme: "dark" } } };
const rpcRequest: RpcPreferenceUpdate = uiRequest;
await domain.update(rpcRequest);
// @ts-expect-error A page update cannot modify the reserved UI provider selection.
await domain.update({ revision: "r", changes: { uiProviders: {} } });
// @ts-expect-error Persistent revision is mandatory even when the page has a revision.
await domain.update({ changes: { appearance: { theme: "dark" } } });
