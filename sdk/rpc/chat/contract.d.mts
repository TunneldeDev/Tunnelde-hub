import type { ToolMode } from "../tools/contract.mjs";

export type ChatProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic"
  | "gemini"
  | "codex"
  | "claude-code"
  | "pi";

export interface ChatProfilePolicy {
  primaryProtocols: ChatProtocol[];
  reviewerProtocols: ChatProtocol[];
  defaultProtocol: ChatProtocol;
}

export interface ChatSession {
  id: string;
  title: string;
  untitled?: boolean;
  updatedAt?: number;
  running?: boolean;
  runId?: string;
}

export interface ChatExecution {
  kind: "local" | "remote";
  sessionId?: string;
  hostId?: string;
  title: string;
  address?: string;
  cwd: string;
  home: string;
  platform: "windows" | "posix";
  executable?: string;
  runtime?: string;
}

export interface PluginChatBlock {
  type: "chat";
  id: string;
  title?: string;
  profilePolicy?: ChatProfilePolicy;
  commands: {
    send: string;
    stop: string;
    configure?: string;
    session?: string;
    approve?: string;
    recover?: string;
    target?: string;
    prepare?: string;
    install?: string;
  };
  sessions?: ChatSession[];
  activeSessionId?: string;
  mode?: ToolMode;
  models?: { id: string; label: string }[];
  modelId?: string;
  messages?: {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    status?: string;
    name?: string;
    activity?: {
      id: string;
      kind: "reasoning" | "tool" | "commentary";
      title: string;
      content: string;
      status?: string;
    }[];
  }[];
  run?: {
    id: string;
    status:
      | "idle"
      | "running"
      | "waiting"
      | "done"
      | "cancelled"
      | "failed"
      | "interrupted";
    seq: number;
  } | null;
  approvals?: {
    id: string;
    tool?: string;
    title?: string;
    detail?: string;
    command?: string;
    risk?: string;
  }[];
  tasks?: {
    id: string;
    /** Captured operation identity; forwarded as taskRunId when inspecting/resuming. */
    runId?: string;
    title?: string;
    status:
      "queued" | "running" | "done" | "failed" | "cancelled" | "interrupted";
    output?: string;
    recoverable?: boolean;
    /** Optional process inspection details, separate from saved agent output. */
    inspection?: string;
  }[];
  configured?: boolean;
  notice?: string;
  config?: Record<string, unknown>;
  execution?: ChatExecution | null;
  readiness?: {
    status: "required" | "checking" | "ready" | "error";
    profileId: string;
    targetKey: string;
    detail?: string;
  };
}
