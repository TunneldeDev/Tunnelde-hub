import type { PluginStorageObservationRequest, PluginStorageObservation } from "./observation.mjs";
import type { PluginStorageSnapshot } from "./snapshot.mjs";
import type { DataObservationSubscription } from "../../runtime/observation/subscription.mjs";

/** Experimental latest-state observation of the calling plugin's JSON KV only. */
export interface PluginStorageClient {
  observe(request?: PluginStorageObservationRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<PluginStorageObservation>;
  /** Bind an owner signal. Up to8 subscriptions per client, serial reads/callbacks,
   * interval1-60s, read deadline10s. Cancelled work retains quota until settlement.
   * Errors terminate; identical writes and ABA may coalesce, not a per-write log. */
  subscribe(receive: (snapshot: PluginStorageSnapshot) => void | Promise<void>, options: { signal: AbortSignal; intervalMs?: number }): DataObservationSubscription;
}
