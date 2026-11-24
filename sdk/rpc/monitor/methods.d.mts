export interface MonitorMethodMap {
  "monitor.system": [Record<string, never>, unknown];
  "monitor.stats": [{ sessionId: string }, unknown];
  "monitor.processes": [{ sessionId: string }, unknown];
  "monitor.kill": [{ sessionId: string; pid: number }, null];
}
