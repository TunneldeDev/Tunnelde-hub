import type { ForwardInfo, ForwardRule } from "./contract.mjs";

export interface ForwardStartManyRequest {
  sessionId: string;
  items: { id: string; expectedRevision: string }[];
}
export type ForwardStartManyOutcome =
  | { id: string; status: "started" | "notStarted" }
  | { id: string; status: "failed"; error: { code: string; message: string } };

export interface ForwardGroup { id: string; hostId: string; name: string; revision: string }
export type ForwardGroupSave = { hostId: string; name: string } & (
  | { id?: never; expectedRevision?: never }
  | { id: string; expectedRevision: string }
);
export type GroupedForwardRule = ForwardRule & { revision: string; groupId: string | null };
export interface ForwardAutomation { autoStart: boolean; autoRetry: boolean }
export type ConfiguredForwardRule = ForwardRule & { revision: string; groupId?: string | null; automation: ForwardAutomation };
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
  "forwards.groups.list": [{ hostId?: string }, ForwardGroup[]];
  "forwards.groups.save": [ForwardGroupSave, ForwardGroup];
  "forwards.groups.remove": [{ id: string; expectedRevision: string }, null];
  "forwards.move": [{ id: string; expectedRevision: string; groupId?: string | null }, GroupedForwardRule];
  "forwards.startManaged": [{ id: string; expectedRevision: string }, null];
  "forwards.startManyManaged": [Pick<ForwardStartManyRequest, "items">, ForwardStartManyOutcome[]];
  "forwards.startMany": [ForwardStartManyRequest, ForwardStartManyOutcome[]];
  "forwards.list": [Record<string, never>, ForwardInfo[]];
  "forwards.save": [{ rule: ForwardRule }, ForwardRule];
  "forwards.remove": [{ id: string }, null];
  "forwards.start": [{ id: string; sessionId: string }, null];
  "forwards.stop": [{ id: string }, null];
}
