import type { HostTransferDocument, HostTransferPreview, HostTransferImport } from "./transfer.mjs";
import type { HostColumn } from "./columns.mjs";
import type { Group, HostInput, SavedHost } from "./contract.mjs";
import type { HostDecorationCollection } from "./decorations.mjs";
import type { HostFieldsSnapshot, HostFieldsUpdate } from "./fields.mjs";
import type { HostSource, HostSourcesPage } from "./sources.mjs";
import type { SshConfigPreviewPage } from "./sshConfig.mjs";

export type * from "./routes.mjs";
import type { HostRoute } from "./routes.mjs";
export interface HostRouteSnapshot { hostId: string; revision: string; route: HostRoute }

export interface HostsMethodMap {
  "hosts.transfer.export": [{ ids: string[] }, HostTransferDocument];
  "hosts.transfer.preview": [{ document: HostTransferDocument }, HostTransferPreview];
  "hosts.transfer.apply": [{ request: HostTransferImport }, SavedHost[]];
  "hosts.routes.get": [{ hostId: string }, HostRouteSnapshot];
  "hosts.routes.observe": [{ hostId: string; revision?: string },
    { revision: string; changed: boolean; snapshot: HostRouteSnapshot | null }];
  "hosts.routes.save": [{ hostId: string; expectedRevision: string; route: HostRoute }, HostRouteSnapshot];
  "hosts.sshConfig.preview": [{ offset?: number; revision?: string }, SshConfigPreviewPage];
  "hosts.sshConfig.import": [{ aliases: string[]; revision: string }, { importedIds: string[]; skipped: number }];
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
