import type { ProfilesObservationRequest, ProfilesObservation } from "./observation.mjs";
import type { ProfilesSnapshot } from "./snapshot.mjs";
import type { DataObservationSubscription } from "../../runtime/observation/subscription.mjs";

/** Experimental metadata reads, never settings contents or profile activation. */
export interface ProfilesClient {
  observe(request?: ProfilesObservationRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ProfilesObservation>;
  /** Latest-state polling, up to eight per client. Interval starts after read/callback
   * settlement; cancelled unsettled work retains its quota. Errors stop with failed.
   * Bind an owner signal. Does not start a runtime or promise per-commit delivery.
   */
  subscribe(receive: (snapshot: ProfilesSnapshot) => void | Promise<void>, options: { signal: AbortSignal; intervalMs?: number }): DataObservationSubscription;
}
