import type { Readable, Writable } from "node:stream";

export type AuthMethod = "password" | "key" | "agent" | "keyboardInteractive";

export interface Group {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Host {
  id: string;
  groupId: string | null;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  keyPath: string | null;
  favorite: boolean;
  color: string | null;
  tags: string[];
  note: string | null;
  sortOrder: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface HostInput {
  name: string;
  groupId?: string | null;
  host: string;
  port?: number;
  username?: string;
  authMethod?: AuthMethod;
  keyPath?: string | null;
  favorite?: boolean;
  color?: string | null;
  tags?: string[];
  note?: string | null;
}

export interface SshSession {
  id: string;
  hostId: string;
  title: string;
  address: string;
  cols: number;
  rows: number;
  connectedAt: number;
}

export interface SshConnectRequest {
  hostId: string;
  password?: string | null;
  passphrase?: string | null;
  cols?: number;
  rows?: number;
}

export interface FileEntry {
  isHidden: boolean;
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number | null;
  permissions: number | null;
}

export interface Listing {
  path: string;
  entries: FileEntry[];
}

export interface TransferEvent {
  id: string;
  direction: "transfer";
  name: string;
  transferred: number;
  total: number;
  status: "running" | "done" | "failed" | "cancelled";
  error: string | null;
}

export interface MethodDescription {
  name: string;
  permissions: string[];
  params: string;
  description: string;
}
export interface HostMethodMap {
  "files.transferStatus": [{ transferId: string }, TransferEvent | null];
  "files.upload": [
    {
      sessionId: string;
      localPath: string;
      remotePath: string;
      overwrite?: boolean;
    },
    string,
  ];
  "files.download": [
    {
      sessionId: string;
      localPath: string;
      remotePath: string;
      overwrite?: boolean;
    },
    string,
  ];
  "files.cancelTransfer": [{ transferId: string }, boolean];
  "files.local.home": [Record<string, never>, string];
  "files.local.list": [{ path?: string }, Listing];
  "files.local.readText": [{ path: string }, { content: string; size: number }];
  "files.local.writeText": [{ path: string; content: string }, void];
  "files.local.createFile": [{ path: string }, void];
  "files.local.mkdir": [{ path: string }, void];
  "files.local.rename": [
    { from: string; to: string; overwrite?: boolean },
    void,
  ];
  "files.local.copy": [{ from: string; to: string; overwrite?: boolean }, void];
  "files.local.delete": [{ path: string; isDir: boolean }, void];
  "files.sftp.list": [{ sessionId: string; path?: string }, Listing];
  "files.sftp.readText": [
    { sessionId: string; path: string },
    { content: string; size: number },
  ];
  "files.sftp.writeText": [
    { sessionId: string; path: string; content: string },
    void,
  ];
  "files.sftp.createFile": [{ sessionId: string; path: string }, void];
  "files.sftp.mkdir": [{ sessionId: string; path: string }, void];
  "files.sftp.rename": [
    { sessionId: string; from: string; to: string; overwrite?: boolean },
    void,
  ];
  "files.sftp.copy": [
    { sessionId: string; from: string; to: string; overwrite?: boolean },
    void,
  ];
  "files.sftp.delete": [
    { sessionId: string; path: string; isDir: boolean },
    void,
  ];
  "monitor.system": [Record<string, never>, unknown];
  "monitor.stats": [{ sessionId: string }, unknown];
  "monitor.processes": [{ sessionId: string }, unknown];
  "monitor.kill": [{ sessionId: string; pid: number }, void];
  "history.list": [{ hostId: string; limit?: number }, unknown];
  "history.record": [
    { hostId: string; command: string },
    Record<string, unknown> | null,
  ];
  "history.delete": [{ id: number }, void];
  "history.clear": [{ hostId: string }, void];

  "api.describe": [
    Record<string, never>,
    { version: number; methods: MethodDescription[] },
  ];
  "app.info": [Record<string, never>, Record<string, unknown>];
  "app.openExternal": [{ url: string }, void];
  "settings.get": [Record<string, never>, Record<string, unknown>];
  "settings.update": [
    { patch: Record<string, unknown> },
    Record<string, unknown>,
  ];
  "hosts.snapshot": [Record<string, never>, { hosts: Host[]; groups: Group[] }];
  "hosts.create": [{ input: HostInput }, Host];
  "hosts.update": [{ id: string; input: HostInput }, Host];
  "hosts.delete": [{ id: string }, void];
  "hosts.markUsed": [{ id: string }, void];
  "hosts.reorder": [{ ids: string[] }, void];
  "groups.create": [
    { input: { name: string; parentId?: string | null } },
    Record<string, unknown>,
  ];
  "groups.update": [
    { id: string; input: { name: string; parentId?: string | null } },
    Record<string, unknown>,
  ];
  "groups.delete": [{ id: string }, void];
  "sessions.list": [Record<string, never>, SshSession[]];
  "sessions.connect": [{ request: SshConnectRequest }, SshSession];
  "sessions.disconnect": [{ sessionId: string }, void];
  "sessions.exec": [
    { sessionId: string; command: string; timeoutMs?: number },
    {
      stdout: string;
      stderr: string;
      exitCode: number | null;
      signal: string | null;
    },
  ];
  "terminal.write": [{ sessionId: string; data: string }, void];
  "terminal.resize": [{ sessionId: string; cols: number; rows: number }, void];
  "storage.get": [{ key: string }, unknown];
  "storage.set": [{ key: string; value: unknown }, void];
  "storage.delete": [{ key: string }, void];
  "workspace.snapshot": [Record<string, never>, Record<string, unknown>];
  "workspace.openPage": [
    { kind: "welcome" | "settings" | "about" | "updates" | "knownHosts" },
    unknown,
  ];
  "workspace.openHost": [{ hostId: string }, unknown];
  "workspace.openTerminal": [{ sessionId: string }, unknown];
  "workspace.openFiles": [{ sessionId: string }, unknown];
  "workspace.openSidebar": [
    { view: "hosts" | "knownHosts" | "plugins" },
    unknown,
  ];
  "workspace.activate": [{ tabId: string }, unknown];
  "workspace.close": [{ tabId: string }, unknown];
  "workspace.split": [
    {
      tabId: string;
      direction: "row" | "column";
      position?: "before" | "after";
      targetPaneId?: string;
    },
    unknown,
  ];
  "workspace.move": [
    { tabId: string; paneId: string; beforeTabId?: string | null },
    unknown,
  ];
  "workspace.returnSidebar": [
    { view: "hosts" | "knownHosts" | "plugins" },
    unknown,
  ];
  "clipboard.readText": [Record<string, never>, string];
  "clipboard.writeText": [{ text: string }, void];
  "ui.showMessage": [
    { message: string; kind?: "info" | "success" | "error" },
    void,
  ];
  "ui.confirm": [{ message: string }, boolean];
  log: [{ message: string; level?: string }, void];
}
export interface Host {
  call<M extends keyof HostMethodMap>(
    method: M,
    params?: HostMethodMap[M][0],
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<HostMethodMap[M][1]>;
  /** Additional methods and exact parameters are discoverable through describe(). */
  call<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T>;
  describe(): Promise<HostMethodMap["api.describe"][1]>;
  log(message: string, level?: string): Promise<void>;
}
export interface PluginHandlers {
  initialize?(
    params: { apiVersion: number; pluginId: string },
    host: Host,
  ): unknown | Promise<unknown>;
  run?(
    command: string,
    input: Record<string, unknown>,
    host: Host,
  ): unknown | Promise<unknown>;
  render?(
    view: string,
    locale: string | undefined,
    host: Host,
  ): unknown | Promise<unknown>;
  shutdown?(host: Host): unknown | Promise<unknown>;
}
export function createPlugin(
  handlers?: PluginHandlers,
  options?: { input?: Readable; output?: Writable; timeout?: number },
): { readonly host: Host; close(): void };
