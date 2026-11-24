import type { Host } from "../../rpc/transport/host.mjs";
import type { RuntimeResourcesClient } from "../../rpc/runtime/resources/client.mjs";
export function createRuntimeResourcesClient(host: Pick<Host, "call">): RuntimeResourcesClient;
