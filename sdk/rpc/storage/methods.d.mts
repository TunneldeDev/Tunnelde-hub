import type { PluginStorageObservationRequest, PluginStorageObservation } from "./pluginData/observation.mjs";
import type { HostStorageObserveRequest, HostStorageObservation } from "./locations/observation.mjs";
import type { HostStorageScheduleRequest, HostStorageCancelRequest, HostStorageChangeResult } from "./locations/mutation.mjs";
export interface StorageMethodMap {
  "storage.locations.observe": [HostStorageObserveRequest, HostStorageObservation];
  "storage.locations.schedule": [HostStorageScheduleRequest, HostStorageChangeResult];
  "storage.locations.cancel": [HostStorageCancelRequest, HostStorageChangeResult];
  "storage.observe": [PluginStorageObservationRequest, PluginStorageObservation];
  "secrets.get": [{ key: string }, string | null];
  "secrets.set": [{ key: string; value: string }, null];
  "secrets.delete": [{ key: string }, null];
  "storage.get": [{ key: string }, unknown];
  "storage.set": [{ key: string; value: unknown }, null];
  "storage.delete": [{ key: string }, null];
}
