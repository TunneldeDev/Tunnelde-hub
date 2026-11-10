import type { HostColumn } from "./columns.mjs";
import type { Group, HostInput, SavedHost } from "./contract.mjs";
import type { HostDecorationCollection } from "./decorations.mjs";
import type { HostFieldsSnapshot, HostFieldsUpdate } from "./fields.mjs";
import type { HostSource, HostSourcesPage } from "./sources.mjs";

export interface HostsMethodMap {
  "hosts.setSource": [HostSource, null];
  "hosts.removeSource": [{ id: string }, boolean];
  "hosts.sourcesSnapshot": [{ offset?: number; revision?: number }, HostSourcesPage];
  "hostList.setDecorations": [HostDecorationCollection, null];
  "hostList.setColumn": [HostColumn, null];
  "hostList.removeColumn": [{ id: string }, boolean];
  "hostList.removeDecorations": [{ id: string }, boolean];
  "hosts.snapshot": [
    Record<string, never>,
    { hosts: SavedHost[]; groups: Group[] },
  ];
  "hosts.create": [{ input: HostInput }, SavedHost];
  "hosts.getFields": [{ hostId: string }, HostFieldsSnapshot];
  "hosts.setFields": [HostFieldsUpdate, HostFieldsSnapshot];
  "hosts.update": [{ id: string; input: HostInput }, SavedHost];
  "hosts.delete": [{ id: string }, null];
  "hosts.markUsed": [{ id: string }, null];
  "hosts.reorder": [{ ids: string[] }, null];
  "groups.create": [
    { input: { name: string; parentId?: string | null } },
    Record<string, unknown>,
  ];
  "groups.update": [
    { id: string; input: { name: string; parentId?: string | null } },
    Record<string, unknown>,
  ];
  "groups.delete": [{ id: string }, null];
}
