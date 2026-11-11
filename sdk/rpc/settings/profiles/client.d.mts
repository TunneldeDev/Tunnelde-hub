import type { ProfilesObservationRequest, ProfilesObservation } from "./observation.mjs";
import type { ProfilesSnapshot } from "./snapshot.mjs";
import type { DataObservationSubscription } from "../../runtime/observation/subscription.mjs";
import type { ProfilesCatalogue } from "./content/catalogue.mjs";
import type { PreferenceValues } from "../preferences/values.mjs";

/** Experimental profile reads; no write or activation authority. */
export interface ProfilesClient {
  catalogue(options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ProfilesCatalogue>;
  /** Assemble public values from a fixed catalogue revision. The owner signal is
   * mandatory; one total deadline (default 30s, maximum 120s) spans every page.
   * At most four unsettled content operations per client. Conflicts fail without
   * automatically retrying another version. Never reads private native fields.
   */
  read(request: { readonly id: string; readonly revision: string }, options: { signal: AbortSignal; timeoutMs?: number }): Promise<PreferenceValues>;
  observe(request?: ProfilesObservationRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ProfilesObservation>;
  /** Latest-state polling, up to eight per client. Interval starts after read/callback
   * settlement; cancelled unsettled work retains its quota. Errors stop with failed.
   * Bind an owner signal. Does not start a runtime or promise per-commit delivery.
   */
  subscribe(receive: (snapshot: ProfilesSnapshot) => void | Promise<void>, options: { signal: AbortSignal; intervalMs?: number }): DataObservationSubscription;
}
