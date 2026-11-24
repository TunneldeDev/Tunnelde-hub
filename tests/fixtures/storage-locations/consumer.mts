import type { Host } from "../../../sdk/rpc/transport/host.mjs";
import { createHostStorageClient } from "../../../sdk/storage/locations/client.mjs";
import type { HostStorageSnapshot } from "../../../sdk/rpc/storage/locations/snapshot.mjs";
declare const host: Host, owner: AbortController;
const client = createHostStorageClient(host);
const observed = await client.observe();
if (observed.changed) {
  const state: HostStorageSnapshot = observed.snapshot;
  // @ts-expect-error Public metadata never includes private native error strings.
  state.lastError;
  // @ts-expect-error Metadata is immutable.
  state.locations[0].path = "/overwrite";
}
await host.call("storage.locations.schedule", { revision:observed.revision, changes:[{category:"keys",target:"/new/keys",migrate:true}] });
await client.cancel({revision:observed.revision},{signal:owner.signal});
client.subscribe(state=>{ const path:string=state.locations[0].path; void path; },{signal:owner.signal});
// @ts-expect-error Category is a closed public union.
await client.schedule({revision:"r",changes:[{category:"secrets",target:"/path",migrate:false}]});
// @ts-expect-error No content access on this client.
await client.readFile("/secret");
