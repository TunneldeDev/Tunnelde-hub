import type { HostStorageRecoverySnapshot } from "./snapshot.mjs";
export interface HostStorageRecoveryObserveRequest {
  readonly revision?: string;
}
export type HostStorageRecoveryObservation =
  | { readonly version: 1; readonly revision: string; readonly changed: false }
  | {
      readonly version: 1;
      readonly revision: string;
      readonly changed: true;
      readonly snapshot: HostStorageRecoverySnapshot;
    };
