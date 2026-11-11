import type { EditorBufferMetadata } from "./data/identity.mjs";
import type { EditorBufferObservationRequest, EditorBufferObservation } from "./data/observation.mjs";
import type { EditorBufferRangeRequest, EditorBufferRange } from "./data/range.mjs";
import type { EditorBufferEditsRequest, EditorBufferEditsResult } from "./data/edits.mjs";
import type { DataObservationSubscription } from "../runtime/observation/subscription.mjs";

/** Experimental loaded-buffer facade. Does not open, save or format files implicitly. */
export interface EditorBufferClient {
  observe(request?: EditorBufferObservationRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<EditorBufferObservation>;
  readRange(request: EditorBufferRangeRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<EditorBufferRange>;
  applyEdits(request: EditorBufferEditsRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<EditorBufferEditsResult>;
  subscribe(receive: (metadata: EditorBufferMetadata | null) => void | Promise<void>, options: {
    signal: AbortSignal; intervalMs?: number; tabId?: string;
  }): DataObservationSubscription;
}
