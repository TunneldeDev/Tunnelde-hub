import type { Host } from "../rpc/transport/host.mjs";
import type { ProfilesClient } from "../rpc/settings/profiles/client.mjs";
export function createProfilesClient(host: Pick<Host, "call">): ProfilesClient;
