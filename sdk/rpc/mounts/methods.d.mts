import type { Listing } from "../files/contract.mjs";
import type { MountDependencies, MountInfo } from "./contract.mjs";
import type {
  MountConfigurationResult, MountEntry, MountExportPage, MountGroup,
  MountImportPreview, MountImportRequest, MountPage, MountPageRequest, MountRule,
} from "./configuration.mjs";
import type {
  MountConnectionStatus, MountOperation, MountOperationSummary, MountSnapshot,
} from "./runtime.mjs";

type MountNoParams = Record<string, never>;
type Id = { id: string };
type Revision = { expectedRevision?: string };
type Exact = { expectedRevision: string };
type Runtime = Id & { runtimeId: string };
type Stop = Id & Revision & { runtimeId?: string };
type Valid = { valid: true };
type HostId = { hostId: string };
type GroupId = { groupId: string };
type Offset = { offset?: number };
type Items<T> = { items: T[]; total: number };

export interface MountsMethodMap {
  "mounts.legacy.list": [Partial<HostId> & Offset, Items<{ hostId: string; mount: MountInfo }>];
  "mounts.legacy.convert": [Id & GroupId & { ruleId: string; expectedGroupRevision: string; name: string }, MountEntry<MountRule>];
  "mounts.legacy.dismiss": [Id, null];
  "mounts.rules.snapshot": [HostId, MountSnapshot];
  "mounts.rules.list": [MountPageRequest, MountPage<MountRule>];
  "mounts.rules.get": [Id, MountEntry<MountRule> | null];
  "mounts.rules.validate": [{ rule: MountRule } & Revision, Valid];
  "mounts.rules.save": [{ rule: MountRule } & Revision, MountEntry<MountRule>];
  "mounts.rules.remove": [Id & Exact, MountOperation];
  "mounts.rules.move": [Id & Exact & GroupId, MountEntry<MountRule>];
  "mounts.rules.copyHost": [{ sourceHostId: string; targetHostId: string } & Exact, MountConfigurationResult];
  "mounts.rules.export": [MountPageRequest & HostId, MountExportPage];
  "mounts.rules.importPreview": [MountImportRequest, MountImportPreview];
  "mounts.rules.importApply": [MountImportRequest & Exact & { digest: string }, MountConfigurationResult];
  "mounts.groups.list": [MountPageRequest, MountPage<MountGroup>];
  "mounts.groups.get": [Id, MountEntry<MountGroup> | null];
  "mounts.groups.validate": [{ group: MountGroup } & Revision, Valid];
  "mounts.groups.save": [{ group: MountGroup } & Revision, MountEntry<MountGroup>];
  "mounts.groups.remove": [Id & Exact & { removeRules?: boolean }, MountOperation];
  "mounts.groups.observe": [HostId & { revision?: string; runtimeRevision?: string }, MountSnapshot];
  "mounts.groups.connect": [Id & Revision, MountOperation];
  "mounts.groups.disconnect": [Id & Revision, MountOperation];
  "mounts.groups.reconnect": [Id & Revision, MountOperation];
  "mounts.connections.list": [Partial<HostId>, MountConnectionStatus[]];
  "mounts.connections.get": [GroupId, MountConnectionStatus | null];
  "mounts.connections.observe": [{ revision?: string }, { revision: string; items: MountConnectionStatus[] }];
  "mounts.runtime.start": [Id & Revision, MountOperation];
  "mounts.runtime.startMany": [{ ids: string[] }, MountOperation];
  "mounts.runtime.startAuto": [GroupId & Revision, MountOperation];
  "mounts.runtime.connectAndStartAuto": [GroupId & Revision, MountOperation];
  "mounts.runtime.startAll": [HostId & { mode?: "all" | "manual" }, MountOperation];
  "mounts.runtime.stop": [Stop, MountOperation];
  "mounts.runtime.stopMany": [{ ids: string[]; runtimeIds?: Record<string, string> }, MountOperation];
  "mounts.runtime.stopAll": [HostId, MountOperation];
  "mounts.runtime.restart": [Stop, MountOperation];
  "mounts.runtime.retry": [Id & Revision, MountOperation];
  "mounts.runtime.requestForceUnmount": [Runtime, { confirmed: boolean }];
  "mounts.runtime.open": [Runtime, null];
  "mounts.runtime.reveal": [Runtime & { path: string }, null];
  "mounts.operations.list": [Offset, Items<MountOperationSummary>];
  "mounts.operations.get": [Id, MountOperation];
  "mounts.operations.observe": [Id & { revision?: string }, MountOperation];
  "mounts.operations.cancel": [Id, MountOperation];
  "mounts.paths.remote.browse": [GroupId & Offset & { path?: string }, Listing & { nextOffset: number | null }];
  "mounts.paths.remote.resolve": [GroupId & { path?: string }, { home: string; path: string }];
  "mounts.paths.local.pick": [{ drive?: string }, (Valid & { path: string }) | null];
  "mounts.paths.local.validate": [{ path: string }, Valid & { path: string }];
  "mounts.paths.conflicts": [
    { path: string; excludeRuleId?: string },
    { path: string; total: number; truncated: boolean; conflicts: (
      | { kind: "rule"; id: string; hostId: string; path: string }
      | { kind: "runtime"; id: string; path: string }
    )[] },
  ];
  "mounts.dependencies.get": [MountNoParams, MountDependencies];
  "mounts.dependencies.refresh": [MountNoParams, MountDependencies];
  "mounts.dependencies.documentation": [MountNoParams, null];
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
