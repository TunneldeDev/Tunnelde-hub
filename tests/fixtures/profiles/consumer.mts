import type { Host, ProfileMetadata, ProfilesObservation } from "../../../sdk/tunnelde-plugin.mjs";
import { createProfilesClient } from "../../../sdk/profiles/client.mjs";
import type { ProfilesSnapshot as UiSnapshot } from "../../../sdk/tunnelde-ui.mjs";
declare const host: Host;
const client = createProfilesClient(host);
const catalogue = await client.catalogue();
const contents = await client.read({ id: "work", revision: catalogue.revision }, { signal: new AbortController().signal });
const theme: "system" | "dark" | "light" = contents.appearance.theme;
void theme;
// @ts-expect-error Native private provider selections are absent.
contents.uiProviders;
// @ts-expect-error Content operations require an owner signal.
client.read({ id: "work", revision: catalogue.revision });
const observation: ProfilesObservation = await host.call("profiles.observe", {});
if (observation.changed) {
  const snapshot: UiSnapshot = observation.snapshot;
  const item: ProfileMetadata | undefined = snapshot.items[0];
  void item;
  // @ts-expect-error Metadata never includes portable settings.
  snapshot.items[0].settings;
  // @ts-expect-error Snapshot arrays are immutable.
  snapshot.items.push({ id: "id", name: "name", updatedAt: 0 });
} else {
  // @ts-expect-error Idle reads contain no snapshot.
  observation.snapshot;
}
// @ts-expect-error Lifecycle owner is mandatory.
client.subscribe(() => {});
// @ts-expect-error There is no dynamic method fallback.
client.call("settings.get", {});
// @ts-expect-error A metadata client cannot activate profiles.
client.activate("id");
const subscription = client.subscribe(async snapshot => { void snapshot.revision; }, { signal: new AbortController().signal });
subscription.stop();
void await subscription.done;
