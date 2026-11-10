import type { ToolInvocation } from "./contract.mjs";

export interface ToolsMethodMap {
  "tools.invoke": [ToolInvocation, unknown];
  "tools.cancel": [{ requestId: string }, { cancelled: number }];
  "tools.revokeClient": [{ clientId: string }, { cancelled: number }];
}
