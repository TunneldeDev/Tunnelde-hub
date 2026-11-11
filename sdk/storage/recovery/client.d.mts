import type { Host } from "../../rpc/transport/host.mjs";
import type { HostStorageRecoveryObservation, HostStorageRecoveryObserveRequest } from "../../rpc/storage/recovery/observation.mjs";
import type { HostStorageRecoverySnapshot } from "../../rpc/storage/recovery/snapshot.mjs";
import type { HostStorageRecoveryRequest, HostStorageRecoveryResult } from "../../rpc/storage/recovery/request.mjs";
import type { DataObservationSubscription } from "../../rpc/runtime/observation/subscription.mjs";
interface Options { signal?: AbortSignal; timeoutMs?: number; }
export interface HostStorageRecoveryClient {
  observe(request?: HostStorageRecoveryObserveRequest, options?: Options): Promise<HostStorageRecoveryObservation>;
  /** Owner required; latest-state polling, never deletion authority. */
  subscribe(receive: (snapshot: HostStorageRecoverySnapshot) => void | Promise<void>, options: { signal: AbortSignal; intervalMs?: number }): DataObservationSubscription;
  /** Native consent, default70s, no automatic restart or blind retries. */
  request(request: HostStorageRecoveryRequest, options?: Options): Promise<HostStorageRecoveryResult>;
}
export function createHostStorageRecoveryClient(host: Pick<Host, "call">): HostStorageRecoveryClient;
