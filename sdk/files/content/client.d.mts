import type { Host } from "../../rpc/transport/host.mjs";
import type { FileContentPrepare, FileContentObservation } from "../../rpc/files/content.mjs";
import type { DataObservationSubscription } from "../../rpc/runtime/observation/subscription.mjs";

export interface FileContentCallOptions { signal?: AbortSignal; timeoutMs?: number }
export interface FileContentHandle {
  readonly contentId: string;
  readonly size: number;
  readonly chunkBytes: 49152;
  readonly closed: boolean;
  /** Explicit ranges, never whole-file allocation. */
  read(input: { offset: number; length: number }, options?: FileContentCallOptions): Promise<Uint8Array>;
  observe(options?: FileContentCallOptions): Promise<FileContentObservation>;
  subscribe(receive: (snapshot: FileContentObservation) => void | Promise<void>, options?: { signal?: AbortSignal; intervalMs?: number }): DataObservationSubscription;
  /** Logical retirement; running OS IO retains its native admission until settlement. */
  close(): Promise<{ version: 1; closed: true }>;
}
export declare function createFileContentClient(host: Pick<Host, "call">): Readonly<{
  /** AbortSignal owns the returned resource for its entire lifetime. */
  open(input: FileContentPrepare, options: FileContentCallOptions & { signal: AbortSignal }): Promise<FileContentHandle>;
}>;
