import type { Host } from "../rpc/transport/host.mjs";
import type { PluginStorageClient } from "../rpc/storage/pluginData/client.mjs";
export function createStorageClient(host: Pick<Host, "call">): PluginStorageClient;
