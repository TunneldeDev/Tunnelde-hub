import type { PluginLogReadRequest } from "./data/query.mjs";
import type { PluginLogPage } from "./data/page.mjs";
import type { DataObservationSubscription } from "../runtime/observation/subscription.mjs";

export interface PluginLoggingClient {
  read(
    request?: PluginLogReadRequest,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<PluginLogPage>;
  /** Serial page draining with callback backpressure, maximum8 subscriptions per client.
   * Requires owner signal, interval1..60s, per-read deadline10s; termination on error.
   * Cancellation suppresses late delivery but retains quota until settlement.
   * Bounded current-file/retained operations stream, not durable audit delivery. */
  subscribe(
    receive: (page: PluginLogPage) => void | Promise<void>,
    options: { signal: AbortSignal; intervalMs?: number },
    request?: PluginLogReadRequest,
  ): DataObservationSubscription;
}
