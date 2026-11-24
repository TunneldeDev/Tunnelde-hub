import type { Host } from "../rpc/transport/host.mjs";
import type { PreferencesClient } from "../rpc/settings/preferences/client.mjs";
export function createPreferencesClient(host: Pick<Host, "call">): PreferencesClient;
