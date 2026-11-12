import type { FilePreviewMetadata, FilePreviewObservation, FilePreviewObservationRequest, FilePreviewProviderPage, FilePreviewProvidersRequest } from "./data.mjs";
import type { FilePreviewAction, FilePreviewActionResult, FilePreviewOpenRequest } from "./actions.mjs";
import type { DataObservationSubscription } from "../../runtime/observation/subscription.mjs";

export interface FilePreviewClient {
  observe(request?: FilePreviewObservationRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FilePreviewObservation>;
  providers(request: FilePreviewProvidersRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FilePreviewProviderPage>;
  action(request: FilePreviewAction, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FilePreviewActionResult>;
  /** Requires filePreview.write and fs.read (local) or sftp.read (remote). Accepted is not decode success. */
  open(request: FilePreviewOpenRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FilePreviewActionResult>;
  /** Owned/coalesced observation of current host quick-look; null means closed. No replay log. */
  subscribe(receive: (preview: FilePreviewMetadata | null) => void | Promise<void>, options: {
    signal: AbortSignal; intervalMs?: number;
  }): DataObservationSubscription;
}
