import type { Host } from "../rpc/transport/host.mjs";
import type { ConfigurationClient } from "../rpc/configuration/client.mjs";
export function createConfigurationClient(host: Pick<Host, "call">): ConfigurationClient;
