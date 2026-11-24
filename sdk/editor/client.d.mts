import type { Host } from "../rpc/transport/host.mjs";
import type { EditorBufferClient } from "../rpc/editor/client.mjs";
export function createEditorBufferClient(host: Pick<Host, "call">): EditorBufferClient;
