import type { PreferenceSnapshot } from "./snapshot.mjs";
import type { PreferenceSchema } from "./schema.mjs";
import type { PreferenceUpdate } from "./update.mjs";
import type { PreferenceObservation, PreferenceObservationRequest } from "./observation.mjs";

export type PreferenceObservationResult =
  | { readonly reason: "stopped" | "aborted" }
  | { readonly reason: "failed"; readonly error: unknown };

export interface PreferenceSubscription {
  /** Suppress future callbacks and abort a pending read. Idempotent. */
  stop(): void;
  readonly closed: boolean;
  /** Resolves after pending transport/callback settlement; never rejects. */
  readonly done: Promise<PreferenceObservationResult>;
}

export interface PreferencesClient {
  schema(): Promise<PreferenceSchema>;
  read(): Promise<PreferenceSnapshot>;
  update(request: PreferenceUpdate): Promise<PreferenceSnapshot>;
  observe(request?: PreferenceObservationRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<PreferenceObservation>;
  /** Experimental latest-state polling, at most 8 per client. First emits a snapshot.
   * Commits can coalesce. The 1000-60000ms interval (default 2000) starts after
   * each read and async callback settle. No mutation retries or UI window required.
   * Errors stop and resolve done with reason failed. Always bind an owner signal.
   */
  subscribe(receive: (snapshot: PreferenceSnapshot) => void | Promise<void>, options: { signal: AbortSignal; intervalMs?: number }): PreferenceSubscription;
}
