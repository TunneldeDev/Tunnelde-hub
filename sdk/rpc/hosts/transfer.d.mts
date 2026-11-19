import type { ForwardRule } from "../forwarding/contract.mjs";
import type { ForwardAutomation, ForwardGroup } from "../forwarding/methods.mjs";
import type { MountGroup, MountRule } from "../mounts/configuration.mjs";
import type { Group, SavedHost } from "./contract.mjs";
import type { HostRoute } from "./routes.mjs";

export interface HostTransferDocument {
  format: "tunnelde-hosts";
  version: 1;
  platform: "windows" | "macos" | "linux";
  roots: string[];
  hosts: (Pick<SavedHost, "id" | "name" | "host" | "port" | "username" | "authMethod" | "groupId" | "favorite" | "color" | "tags" | "note"> & { route: HostRoute })[];
  folders: Pick<Group, "id" | "name" | "parentId">[];
  proxies: { id: string; name: string; protocol: "http" | "socks5"; host: string; port: number; username: string }[];
  forwardGroups: Omit<ForwardGroup, "revision">[];
  forwards: { rule: ForwardRule; groupId: string | null; automation: ForwardAutomation }[];
  mountGroups: MountGroup[];
  mountRules: MountRule[];
}
export interface HostTransferPreview {
  document: HostTransferDocument;
  revision: string;
  entries: { id: string; name: string; address: string; conflict: boolean; dependency: boolean; requires: string[]; forwards: number; mounts: number }[];
}
export interface HostTransferImport {
  document: HostTransferDocument;
  revision: string;
  selected: string[];
  copies?: boolean;
  mountPoints?: Record<string, string>;
}
