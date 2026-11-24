import type { SshConnectRequest, SshSession } from "./contract.mjs";

export interface ConnectionsMethodMap {
  "sessions.list": [Record<string, never>, SshSession[]];
  "sessions.connect": [{ request: SshConnectRequest }, SshSession];
  "sessions.disconnect": [{ sessionId: string }, null];
  "sessions.requestHandoff": [{ sessionId: string }, boolean];
  "sessions.exec": [
    { sessionId: string; command: string; timeoutMs?: number },
    {
      stdout: string;
      stderr: string;
      exitCode: number | null;
      signal: string | null;
    },
  ];
}
