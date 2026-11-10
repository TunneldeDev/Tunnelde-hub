import type { RemotePlatform } from "./platform.mjs";

export interface RunnerDeployment {
  hostId: string;
  directory: string;
  platform: RemotePlatform;
  executable: string;
  runner: string;
  entry: string;
}

export interface RunnerRecord {
  runnerId: string;
  deployment: RunnerDeployment;
  stopPending: boolean;
}

export interface RunnerState {
  status:
    "starting" | "running" | "stopping" | "stopped" | "failed" | "unresponsive";
  error?: string | null;
}

export interface RunnerApproval {
  type: "approval";
  approvalId: string;
  method: string;
  params: Record<string, unknown>;
}

export interface RunnerPoll {
  runnerId: string;
  events: { seq: number; message: unknown }[];
  nextSeq: number;
  truncated: boolean;
  state: RunnerState;
  pendingApprovals: RunnerApproval[];
}
