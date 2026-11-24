export interface RuntimeResourcesDiscovery {
  identify?: "resources.identify";
  snapshot: "resources.snapshot";
  release: "resources.release";
  stability: "experimental";
  ownership: "current-runtime";
  kinds: ("connection" | "forward" | "mount" | "task" | "transfer")[];
  states: ("owned" | "releaseRequested" | "cleanupRequired")[];
  pageSize: number;
  pageBytes: number;
  observationLimit: number;
  operationLimitPerPlugin: number;
  operationLimitTotal: number;
  observationTimeoutMs: number;
  paging: "revision-bound";
  cancellation: "cooperative-settlement";
  persistence: false;
}
