export interface TransferEvent {
  id: string;
  /** Optional attribution; never an authorization to resume an expired runtime. */
  pluginId?: string;
  direction: "transfer";
  name: string;
  transferred: number;
  total: number;
  status: "running" | "done" | "failed" | "cancelled" | "cleanupPending";
  phase?: "queued" | "preparing" | "verifying" | "cleaning";
  error: string | null;
}
