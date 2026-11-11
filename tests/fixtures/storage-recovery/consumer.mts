import type { Host } from "../../../sdk/rpc/transport/host.mjs";
import { createHostStorageRecoveryClient } from "../../../sdk/storage/recovery/client.mjs";
declare const host: Host, owner: AbortController;
const client = createHostStorageRecoveryClient(host);
const observed = await client.observe();
if (observed.changed) {
  const direction: "apply" | "cancel" | undefined = observed.snapshot.pending?.action;
  void direction;
  // @ts-expect-error No private error strings.
  observed.snapshot.lastError;
  // @ts-expect-error Readonly metadata.
  observed.snapshot.recordedCopies[0].path = "/forged";
}
await client.request({revision:observed.revision,action:"retry"},{signal:owner.signal});
await host.call("storage.recovery.request",{revision:observed.revision,action:"cancel"});
client.subscribe(snapshot=>{const error:boolean=snapshot.hasError;void error;},{signal:owner.signal});
// @ts-expect-error A cancelling plan cannot be forced back to apply.
await client.request({revision:"r",action:"apply"});
// @ts-expect-error Metadata confers no deletion capability.
client.delete("/recorded-copy");
