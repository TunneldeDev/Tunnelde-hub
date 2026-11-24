// BEGIN GENERATED HOST SOURCES V1 TYPES
/** Experimental discovery entries contain public metadata only. */
export interface HostSourceEntry {
  id: string;
  name: string;
  host: string;
  port?: number;
  username: string;
  tags?: string[];
  note?: string | null;
}
export interface HostSource {
  id: string;
  label: string;
  entries: HostSourceEntry[];
}
export interface HostSourcesSnapshot {
  revision: number;
  items: Array<{
    pluginId: string;
    pluginName: string;
    id: string;
    label: string;
    entries: Array<HostSourceEntry & { hostId: string }>;
  }>;
}
export interface HostSourcesPage extends HostSourcesSnapshot {
  total: number;
  nextOffset: number | null;
}
// END GENERATED HOST SOURCES V1 TYPES
