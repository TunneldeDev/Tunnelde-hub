import type { ProfilesObservationRequest, ProfilesObservation } from "./observation.mjs";
import type { ProfilesSnapshot } from "./snapshot.mjs";
import type { DataObservationSubscription } from "../../runtime/observation/subscription.mjs";
import type { ProfilesCatalogue } from "./content/catalogue.mjs";
import type { PreferenceValues } from "../preferences/values.mjs";
import type { ProfileRename, ProfileDelete, ProfileChanged, ProfileActivate, ProfileActivated } from "./mutations/writes.mjs";

/** Experimental public profiles. Native authorization remains authoritative. */
export interface ProfilesClient {
  /** Full public values only; at most four unsettled mutations, including cleanup.
   * Mandatory owner signal and one total deadline (default 90s, max 120s).
   * Stages UTF-8 chunks and consumes a one-shot draft. Never retries an uncertain
   * commit; reconcile catalogue after cancellation/transport loss. Best-effort
   * discard has a separate one-second cleanup budget; lifecycle/TTL is fallback.
   */
  save(request: { readonly id?: string; readonly name: string; readonly revision: string; readonly values: PreferenceValues }, options: { signal: AbortSignal; timeoutMs?: number }): Promise<ProfileChanged>;
  rename(request: ProfileRename, options: { signal: AbortSignal; timeoutMs?: number }): Promise<ProfileChanged>;
  remove(request: ProfileDelete, options: { signal: AbortSignal; timeoutMs?: number }): Promise<ProfileChanged>;
  /** Host-owned native confirmation and both version fences, no automatic retries. */
  activate(request: ProfileActivate, options: { signal: AbortSignal; timeoutMs?: number }): Promise<ProfileActivated>;
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
