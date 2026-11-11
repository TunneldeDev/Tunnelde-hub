export type DataObservationResult =
  | { readonly reason: "stopped" | "aborted" }
  | { readonly reason: "failed"; readonly error: unknown };

export interface DataObservationSubscription {
  /** Suppress future callbacks and abort pending reads. Idempotent. */
  stop(): void;
  readonly closed: boolean;
  /** Resolves after pending transport/callback settlement; never rejects. */
  readonly done: Promise<DataObservationResult>;
}
