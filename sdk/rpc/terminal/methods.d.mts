export interface TerminalMethodMap {
  "terminal.write": [{ sessionId: string; data: string }, null];
  "terminal.resize": [{ sessionId: string; cols: number; rows: number }, null];
}
