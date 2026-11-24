import type { EditorDocument } from "./contract.mjs";

export interface EditorCommandInput {
  source: string;
  document: Pick<
    EditorDocument,
    "tabId" | "documentId" | "version" | "path" | "name"
  >;
  indent: string;
  _locale: string;
}

export interface EditorCommandResult {
  text: string;
  error?: boolean;
}
