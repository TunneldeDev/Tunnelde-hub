import type { BusBatch } from "../rpc/bus/methods.mjs";
import type { DataObservationSubscription } from "../rpc/runtime/observation/subscription.mjs";
import type { Host } from "../rpc/transport/host.mjs";

/** Shares one receive loop per Host. Manage topic subscriptions via bus.subscribe and bus.unsubscribe.
 * Callbacks must settle before the next batch is read; do not await your own subscription's done from a callback.
 */
export function watchBus(
  host: Pick<Host, "call">,
  receive: (batch: BusBatch) => void | Promise<void>,
  options: { signal: AbortSignal },
): DataObservationSubscription;
