import type { Host } from "../rpc/transport/host.mjs";
import type { PluginLoggingClient } from "../rpc/logging/client.mjs";
export function createLoggingClient(
  host: Pick<Host, "call">,
): PluginLoggingClient;
