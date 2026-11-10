/** Stable editor v1 DTO. UTF-8 content is bounded to 128 KiB; excludes internal state. */
export interface EditorDocument {
  tabId: string;
  documentId: string;
  version: number;
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

/** Stable result of one undoable buffer replacement; no automatic disk save. */
export interface EditorWriteResult {
  tabId: string;
  documentId: string;
  version: number;
  dirty: boolean;
}
