import type { EditorDocument, EditorWriteResult } from "./contract.mjs";
import type { EditorBufferObservationRequest, EditorBufferObservation } from "./data/observation.mjs";
import type { EditorBufferRangeRequest, EditorBufferRange } from "./data/range.mjs";
import type { EditorBufferEditsRequest, EditorBufferEditsResult } from "./data/edits.mjs";

export interface EditorMethodMap {
  "editor.observe": [EditorBufferObservationRequest, EditorBufferObservation];
  "editor.readRange": [EditorBufferRangeRequest, EditorBufferRange];
  "editor.applyEdits": [EditorBufferEditsRequest, EditorBufferEditsResult];
  "editor.active": [Record<string, never>, EditorDocument | null];
  "editor.replace": [
    { tabId: string; documentId: string; version: number; text: string },
    EditorWriteResult,
  ];
}
