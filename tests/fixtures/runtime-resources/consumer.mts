import { createRuntimeResourcesClient } from "../../../sdk/runtime/resources/client.mjs";
import type { Host } from "../../../sdk/tunnelde-plugin.mjs";
declare const host: Host;
const resources = createRuntimeResourcesClient(host);
const first = await resources.snapshot();
if (first.nextOffset !== null) await resources.snapshot({offset:first.nextOffset,revision:first.revision});
for (const item of first.items) { const result=await resources.release({handle:item.handle}); const outcome: "released" | "cancellationRequested" = result.outcome; void outcome; }
// @ts-expect-error foreign runtime selection is not supported
await resources.snapshot({pluginId:"foreign"});
// @ts-expect-error the caller cannot supply a domain instance id
await resources.release({id:"task-id"});
// @ts-expect-error the opaque handle must be a string
await resources.release({handle:123});
// @ts-expect-error no generic fallback overload
await resources.stop({});
// @ts-expect-error revision is an opaque token
await resources.snapshot({offset:128,revision:1});
