import type { Host } from "../../rpc/transport/host.mjs";
import type { HostStorageObservation, HostStorageObserveRequest } from "../../rpc/storage/locations/observation.mjs";
import type { HostStorageSnapshot } from "../../rpc/storage/locations/snapshot.mjs";
import type { HostStorageChangeResult, HostStorageScheduleRequest, HostStorageCancelRequest } from "../../rpc/storage/locations/mutation.mjs";
import type { DataObservationSubscription } from "../../rpc/runtime/observation/subscription.mjs";
interface Options { signal?: AbortSignal; timeoutMs?: number; }
export interface HostStorageClient {
  observe(request?: HostStorageObserveRequest, options?: Options): Promise<HostStorageObservation>;
  /** Owner signal required; serial polling, 1-60s, quota8, no per-commit event log. */
  subscribe(receive: (snapshot: HostStorageSnapshot) => void | Promise<void>, options: { signal: AbortSignal; intervalMs?: number }): DataObservationSubscription;
  /** Default timeout70s allows55s native consent. No automatic restart. */
  schedule(request: HostStorageScheduleRequest, options?: Options): Promise<HostStorageChangeResult>;
  cancel(request: HostStorageCancelRequest, options?: Options): Promise<HostStorageChangeResult>;
}
export function createHostStorageClient(host: Pick<Host, "call">): HostStorageClient;
