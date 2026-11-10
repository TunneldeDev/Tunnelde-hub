import type { ForwardInfo, ForwardRule } from "./contract.mjs";

export interface ForwardingMethodMap {
  "forwards.list": [Record<string, never>, ForwardInfo[]];
  "forwards.save": [{ rule: ForwardRule }, ForwardRule];
  "forwards.remove": [{ id: string }, null];
  "forwards.start": [{ id: string; sessionId: string }, null];
  "forwards.stop": [{ id: string }, null];
}
