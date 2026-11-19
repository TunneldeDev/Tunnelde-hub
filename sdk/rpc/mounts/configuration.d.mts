export interface MountGroup {
  id: string;
  hostId: string;
  name: string;
  autoReconnect: boolean;
}

export interface MountRule {
  id: string;
  hostId: string;
  groupId: string;
  name: string;
  remotePath: string;
  mountPoint: string;
  readOnly: boolean;
  autoMount: boolean;
}

export interface MountEntry<T> {
  revision: string;
  value: T;
}

export interface MountPage<T> {
  revision: string;
  items: MountEntry<T>[];
  nextCursor: string | null;
}

export interface MountPageRequest {
  hostId?: string;
  cursor?: string;
  revision?: string;
  limit?: number;
}

export interface MountDocument {
  version: 1;
  hostId: string;
  groups: MountGroup[];
  rules: MountRule[];
}

export interface MountExportPage {
  revision: string;
  nextCursor: string | null;
  document: MountDocument;
}

export interface MountConfigurationResult {
  revision: string;
  groups: MountEntry<MountGroup>[];
  rules: MountEntry<MountRule>[];
}

export interface MountImportRequest {
  document: MountDocument;
  mode?: "reject" | "replace" | "skip";
}

export interface MountImportPreview {
  revision: string;
  digest: string;
  conflicts: { kind: "group" | "rule"; id: string; revision: string }[];
  groups: number;
  rules: number;
}
