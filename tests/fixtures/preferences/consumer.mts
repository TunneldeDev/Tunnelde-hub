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
