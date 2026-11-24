import type { Host } from "../../rpc/transport/host.mjs";
import type { FileBrowserClient } from "../../rpc/files/browser/client.mjs";
export function createFileBrowserClient(host: Pick<Host, "call">): FileBrowserClient;
