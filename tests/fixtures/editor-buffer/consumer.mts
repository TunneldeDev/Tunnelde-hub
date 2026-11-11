import { createEditorBufferClient } from "../../../sdk/editor/client.mjs";
import type { Host, EditorBufferIdentity, EditorBufferMetadata, DataObservationResult } from "../../../sdk/tunnelde-plugin.mjs";
import type { EditorBufferRange } from "../../../sdk/tunnelde-ui.mjs";

declare const host: Host;
const buffers = createEditorBufferClient(host), owner = new AbortController();
const subscription = buffers.subscribe(async (metadata: EditorBufferMetadata | null) => {
  if (!metadata) return;
  const identity: EditorBufferIdentity = metadata;
  const range: EditorBufferRange = await buffers.readRange({ ...identity, offset: 0 }, { signal: owner.signal });
  await buffers.applyEdits({ ...identity, edits: [{ start: 0, end: range.text.length, text: "replacement" }] });
  // @ts-expect-error Public metadata is immutable.
  metadata.version++;
}, { signal: owner.signal, tabId: "tab", intervalMs: 1000 });
const done: Promise<DataObservationResult> = subscription.done;
void done;
void buffers.observe({ revision: "opaque" });
// @ts-expect-error All writes require a content version.
void buffers.applyEdits({ tabId: "tab", documentId: "doc", edits: [] });
// @ts-expect-error No implicit unowned subscription.
buffers.subscribe(() => {});
// @ts-expect-error Offsets are numbers, not codepoint/string indices.
void buffers.readRange({ tabId: "tab", documentId: "doc", version: 0, offset: "0" });
