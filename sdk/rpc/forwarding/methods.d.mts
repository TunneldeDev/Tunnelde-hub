import type { ForwardInfo, ForwardRule } from "./contract.mjs";

export interface ForwardStartManyRequest {
  sessionId: string;
  items: { id: string; expectedRevision: string }[];
}
export type ForwardStartManyOutcome =
  | { id: string; status: "started" | "notStarted" }
  | { id: string; status: "failed"; error: { code: string; message: string } };

export interface ForwardAutomation { autoStart: boolean; autoRetry: boolean }
export type ConfiguredForwardRule = ForwardRule & { revision: string; automation: ForwardAutomation };
export type ConfiguredForwardInfo = ForwardInfo & ConfiguredForwardRule & {
  runtimeId: string | null;
  automationStatus: {
    phase: "idle" | "paused" | "starting" | "running" | "retrying" | "needsAttention";
    retryAt: number | null;
    error: { code: string; message: string } | null;
  };
};

export interface ForwardingMethodMap {
  "forwards.automation.list": [Record<string, never>, ConfiguredForwardInfo[]];
  "forwards.automation.save": [{ id: string; expectedRevision: string; automation: ForwardAutomation }, ConfiguredForwardRule];
  "forwards.startMany": [ForwardStartManyRequest, ForwardStartManyOutcome[]];
  "forwards.list": [Record<string, never>, ForwardInfo[]];
  "forwards.save": [{ rule: ForwardRule }, ForwardRule];
  "forwards.remove": [{ id: string }, null];
  "forwards.start": [{ id: string; sessionId: string }, null];
  "forwards.stop": [{ id: string }, null];
}
