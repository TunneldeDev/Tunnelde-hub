import type { Host } from "../../rpc/transport/host.mjs";
import type { FilePreviewClient } from "../../rpc/files/preview/client.mjs";
export function createFilePreviewClient(host: Pick<Host, "call">): FilePreviewClient;
