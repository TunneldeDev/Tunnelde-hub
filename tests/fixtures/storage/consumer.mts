import type { Host, PluginStorageJson, PluginStorageObservation } from "../../../sdk/tunnelde-plugin.mjs";
import { createStorageClient } from "../../../sdk/storage/client.mjs";
import type { PluginStorageSnapshot as UiSnapshot } from "../../../sdk/tunnelde-ui.mjs";
declare const host: Host;
const client = createStorageClient(host);
const observation: PluginStorageObservation = await host.call("storage.observe", {});
if (observation.changed) {
  const snapshot: UiSnapshot = observation.snapshot;
  const json: PluginStorageJson | undefined = snapshot.values.draft;
  void json;
  // @ts-expect-error Snapshots are immutable.
  snapshot.values.draft = null;
  // @ts-expect-error Storage locations are not plugin KV data.
  snapshot.locations;
} else {
  // @ts-expect-error Idle reads omit snapshots.
  observation.snapshot;
}
// @ts-expect-error Lifecycle owner is mandatory.
client.subscribe(() => {});
// @ts-expect-error No arbitrary host path authority.
client.observe({ path: "/" });
// @ts-expect-error No cross-plugin selector.
client.observe({ id: "other" });
const subscription = client.subscribe(async snapshot => { void snapshot.revision; }, { signal: new AbortController().signal });
subscription.stop();
void await subscription.done;
