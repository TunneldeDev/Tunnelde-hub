import { createFilePreviewClient } from "../../../sdk/files/preview/client.mjs";
import type { Host, FilePreviewMetadata, FilePreviewOpenRequest } from "../../../sdk/tunnelde-plugin.mjs";
declare const host: Host;
const client = createFilePreviewClient(host);
const owner = new AbortController();
client.subscribe((preview: FilePreviewMetadata | null) => {
  if (preview) void client.providers({ id: preview.id, revision: preview.revision });
}, { signal: owner.signal }).stop();
const target: FilePreviewOpenRequest = { source: { kind: "remote", sessionId: "peer" }, path: "/a.pdf" };
void client.open(target);
void host.call("filePreview.open", target);
void client.action({ id: "preview", revision: "frame", action: "selectProvider", providerId: "render:pdf" });
// @ts-expect-error Explicit source required; no guessed current endpoint.
void client.open({ path: "/a" });
// @ts-expect-error Remote source requires a session identity.
void client.open({ source: { kind: "remote" }, path: "/a" });
// @ts-expect-error Exact revision is required for mutation.
void client.action({ id: "preview", action: "close" });
// @ts-expect-error No native ticket or arbitrary URL in this contract.
const privatePreview: FilePreviewMetadata = { ticket: "native" };
void privatePreview;
