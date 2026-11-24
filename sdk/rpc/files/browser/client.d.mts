import type { FileBrowserCatalogue, FileBrowserObservation, FileBrowserObservationRequest, FileBrowserPage, FileBrowserReadRequest } from "./data.mjs";
import type { FileBrowserAction, FileBrowserActionResult } from "./actions.mjs";
import type { DataObservationSubscription } from "../../runtime/observation/subscription.mjs";

export interface FileBrowserClient {
  observe(request?: FileBrowserObservationRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FileBrowserObservation>;
  read(request: FileBrowserReadRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FileBrowserPage>;
  action(request: FileBrowserAction, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FileBrowserActionResult>;
  /** One selected catalogue page; async deliveries are serial and intermediate UI changes may coalesce. */
  subscribe(receive: (catalogue: FileBrowserCatalogue) => void | Promise<void>, options: {
    signal: AbortSignal; intervalMs?: number; offset?: number; limit?: number;
  }): DataObservationSubscription;
}
