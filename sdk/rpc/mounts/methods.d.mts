import type { Listing } from "../files/contract.mjs";
import type { MountDependencies, MountInfo } from "./contract.mjs";

export interface MountsMethodMap {
  "mounts.dependencies": [Record<string, never>, MountDependencies];
  "mounts.list": [Record<string, never>, MountInfo[]];
  "mounts.mount": [
    {
      sessionId: string;
      remotePath: string;
      mountPoint: string;
      readOnly?: boolean;
    },
    MountInfo,
  ];
  "mounts.unmount": [{ id: string; force?: boolean }, null];
  "mounts.browse": [{ sessionId: string; path?: string }, Listing];
  "mounts.open": [{ id: string }, null];
  "mounts.documentation": [Record<string, never>, null];
}
