import type { RemotePlatform } from "./platform.mjs";
import type { RunnerPoll, RunnerRecord, RunnerState } from "./runners.mjs";
import type { TaskOutput, TaskSnapshot } from "./tasks.mjs";

export interface ExecutionMethodMap {
  "tasks.start": [
    {
      executable: string;
      args?: string[];
      cwd?: string;
      sessionId?: string;
      platform?: RemotePlatform;
      timeoutMs?: number;
    },
    { taskId: string; status: "running" },
  ];
  "tasks.list": [Record<string, never>, TaskSnapshot[]];
  "tasks.status": [{ taskId: string }, TaskSnapshot];
  "tasks.readOutput": [{ taskId: string; afterSeq?: number }, TaskOutput];
  "tasks.write": [{ taskId: string; data: string }, boolean];
  "tasks.closeInput": [{ taskId: string }, boolean];
  "tasks.cancel": [{ taskId: string }, boolean];
  "runners.deploy": [
    {
      sessionId: string;
      platform: RemotePlatform;
      directory: string;
      runnerPath: string;
      executable: string;
    },
    { deployed: boolean; directory: string },
  ];
  "runners.start": [
    {
      sessionId: string;
      directory: string;
      config: Record<string, unknown>;
      secrets?: Record<string, unknown>;
    },
    { runnerId: string; status: "starting" },
  ];
  "runners.list": [Record<string, never>, RunnerRecord[]];
  "runners.send": [
    { sessionId: string; runnerId: string; message: Record<string, unknown> },
    { accepted: boolean },
  ];
  "runners.poll": [
    { sessionId: string; runnerId: string; afterSeq?: number },
    RunnerPoll,
  ];
  "runners.status": [{ sessionId: string; runnerId: string }, RunnerState];
  "runners.stop": [
    { sessionId: string; runnerId: string },
    { stopRequested: boolean; status: "stopping" },
  ];
}
