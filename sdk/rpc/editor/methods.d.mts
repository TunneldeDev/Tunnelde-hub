import type { EditorDocument, EditorWriteResult } from "./contract.mjs";

export interface EditorMethodMap {
  "editor.active": [Record<string, never>, EditorDocument | null];
  "editor.replace": [
    { tabId: string; documentId: string; version: number; text: string },
    EditorWriteResult,
  ];
}
