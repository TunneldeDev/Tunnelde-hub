export type ToolMode = "ask" | "approve" | "full" | "readOnly";

export interface ToolScope {
  sessionIds?: string[];
  hostIds?: string[];
  localRoots?: string[];
  remoteRoots?: { sessionId: string; path: string }[];
}

export interface ToolInvocation {
  method: string;
  params: Record<string, unknown>;
  mode: ToolMode;
  scope: ToolScope;
  /** Only a trusted plugin's independent reviewer may supply this decision. */
  review?: { approved: boolean; reason: string };
  clientId?: string;
  requestId?: string;
}
