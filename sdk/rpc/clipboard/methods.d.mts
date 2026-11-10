export interface ClipboardMethodMap {
  "clipboard.readText": [Record<string, never>, string];
  "clipboard.writeText": [{ text: string }, null];
}
