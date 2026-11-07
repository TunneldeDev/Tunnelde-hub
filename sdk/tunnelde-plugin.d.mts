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

export interface SavedHost {
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
  /** Missing on hosts released before stability metadata was introduced. */
  stability?: "stable" | "experimental" | "deprecated";
  since?: string | null;
  deprecated?: string | null;
  /** Optional machine-readable contract, absent on older hosts and experimental methods. */
  contract?: MethodContract;
}

export interface MethodContract {
  version: 1;
  /** JSON Schema draft-07; encoded byte limits are documented separately. */
  inputSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  errorSchema: Record<string, unknown>;
  /** Stable application error messages; IO/internal error text remains platform-specific. */
  knownErrors: string[];
  /** Events emitted by this method; an empty list means snapshot/RPC behavior only. */
  events: string[];
}

/** Snapshot of a ready open editor. Excludes transport credentials and internal state. */
export interface EditorDocument {
  tabId: string;
  documentId: string;
  version: number;
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}
export interface PluginCommand {
  id: string;
  title: string;
  keybindings?: string[];
  macKeybindings?: string[];
  /** Receive the matching document as input.source; return {text:string}. */
  editor?: { extensions: string[]; format?: boolean };
  /** Offer this command for a user-selected file or directory. */
  fileMenu?: FileMenuContribution;
}
export interface FileMenuContribution {
  sources: ("local" | "remote")[];
  kinds: ("file" | "directory")[];
  /** Case-insensitive file suffixes without the leading dot; directories ignore this filter. */
  extensions?: string[];
}
/** Optional manifest field: register native reveal for this plugin's active mounts. */
export interface MountedFileRevealContribution {
  mountedFileReveal?: boolean;
}
export interface FileMenuCommandInput {
  file: {
    path: string;
    name: string;
    isDirectory: boolean;
    source: { kind: "local" } | { kind: "remote"; sessionId: string };
  };
}
export interface EditorCommandInput {
  source: string;
  document: Pick<EditorDocument, "tabId" | "documentId" | "version" | "path" | "name">;
  indent: string;
  _locale: string;
}
export interface EditorCommandResult {
  text: string;
  error?: boolean;
}
export type ToolMode = "ask" | "approve" | "full" | "readOnly";
export type RemotePlatform = "posix" | "windows";
export interface ToolScope {
  sessionIds?: string[];
  hostIds?: string[];
  localRoots?: string[];
  remoteRoots?: { sessionId: string; path: string }[];
}
export interface ToolInvocation {
  method: string;
  params: Record<string, unknown>;
  mode: ToolMode;
  scope: ToolScope;
  /** Only a trusted plugin's independent reviewer may supply this decision. */
  review?: { approved: boolean; reason: string };
  clientId?: string;
  requestId?: string;
}
export type TaskStatus =
  "running" | "completed" | "cancelled" | "timedOut" | "failed" | "interrupted";
export interface TaskSnapshot {
  taskId: string;
  status: TaskStatus;
  exitCode: number | null;
  error: string | null;
  seq: number;
}
export interface TaskOutputEvent {
  taskId: string;
  seq: number;
  stream: "stdout" | "stderr" | "status";
  data: string;
  status: TaskStatus;
  exitCode: number | null;
}
export interface TaskOutput {
  taskId: string;
  events: TaskOutputEvent[];
  nextSeq: number;
  status: TaskStatus;
  exitCode: number | null;
  truncated: boolean;
}
export interface RunnerDeployment {
  hostId: string;
  directory: string;
  platform: RemotePlatform;
  executable: string;
  runner: string;
  entry: string;
}
export interface RunnerRecord {
  runnerId: string;
  deployment: RunnerDeployment;
  stopPending: boolean;
}
export interface RunnerState {
  status: "starting" | "running" | "stopping" | "stopped" | "failed" | "unresponsive";
  error?: string | null;
}
export interface RunnerApproval {
  type: "approval";
  approvalId: string;
  method: string;
  params: Record<string, unknown>;
}
export interface RunnerPoll {
  runnerId: string;
  events: { seq: number; message: unknown }[];
  nextSeq: number;
  truncated: boolean;
  state: RunnerState;
  pendingApprovals: RunnerApproval[];
}
/** The host supplies plugin identity and generation; plugins cannot impersonate another runtime. */
export interface PluginEvent<T = unknown> {
  pluginId: string;
  generation: number;
  event: string;
  payload: T;
}
export interface PluginView {
  id: string;
  title: string;
  location?: "sidebar" | "workspace";
  kind?: "blocks" | "chat";
  icon?: string;
}
export type ChatProtocol =
  "openai-chat" | "openai-responses" | "anthropic" | "gemini" | "codex" | "claude-code" | "pi";
export interface ChatProfilePolicy {
  primaryProtocols: ChatProtocol[];
  reviewerProtocols: ChatProtocol[];
  defaultProtocol: ChatProtocol;
}
export interface ChatSession {
  id: string;
  title: string;
  untitled?: boolean;
  updatedAt?: number;
  running?: boolean;
  runId?: string;
}
export interface ChatExecution {
  kind: "local" | "remote";
  sessionId?: string;
  hostId?: string;
  title: string;
  address?: string;
  cwd: string;
  home: string;
  platform: "windows" | "posix";
  executable?: string;
  runtime?: string;
}
export interface PluginChatBlock {
  type: "chat";
  id: string;
  title?: string;
  profilePolicy?: ChatProfilePolicy;
  commands: {
    send: string;
    stop: string;
    configure?: string;
    session?: string;
    approve?: string;
    recover?: string;
    target?: string;
    prepare?: string;
    install?: string;
  };
  sessions?: ChatSession[];
  activeSessionId?: string;
  mode?: ToolMode;
  models?: { id: string; label: string }[];
  modelId?: string;
  messages?: {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    status?: string;
    name?: string;
    activity?: {
      id: string;
      kind: "reasoning" | "tool" | "commentary";
      title: string;
      content: string;
      status?: string;
    }[];
  }[];
  run?: {
    id: string;
    status: "idle" | "running" | "waiting" | "done" | "cancelled" | "failed" | "interrupted";
    seq: number;
  } | null;
  approvals?: {
    id: string;
    tool?: string;
    title?: string;
    detail?: string;
    command?: string;
    risk?: string;
  }[];
  tasks?: {
    id: string;
    title?: string;
    status: "queued" | "running" | "done" | "failed" | "cancelled" | "interrupted";
    output?: string;
    recoverable?: boolean;
  }[];
  configured?: boolean;
  notice?: string;
  config?: Record<string, unknown>;
  execution?: ChatExecution | null;
  readiness?: {
    status: "required" | "checking" | "ready" | "error";
    profileId: string;
    targetKey: string;
    detail?: string;
  };
}
export interface ForwardRule {
  id: string;
  hostId: string;
  name: string;
  mode: "local" | "remote";
  bindHost: string;
  bindPort: number;
  targetHost: string;
  targetPort: number;
}
export interface ForwardInfo extends ForwardRule {
  sessionId: string | null;
  active: boolean;
}
export interface MountInfo {
  id: string;
  owner: string;
  sessionId: string;
  remotePath: string;
  mountPoint: string;
  readOnly: boolean;
  cleanupError: string | null;
}
export interface MountDependencies {
  available: boolean;
  executable: string | null;
  platform: string;
  instructions: string;
  documentation: string;
  transport: string | null;
}
export interface HostMethodMap {
  "forwards.list": [Record<string, never>, ForwardInfo[]];
  "forwards.save": [{ rule: ForwardRule }, ForwardRule];
  "forwards.remove": [{ id: string }, null];
  "forwards.start": [{ id: string; sessionId: string }, null];
  "forwards.stop": [{ id: string }, null];
  "mounts.dependencies": [Record<string, never>, MountDependencies];
  "mounts.list": [Record<string, never>, MountInfo[]];
  "mounts.mount": [
    { sessionId: string; remotePath: string; mountPoint: string; readOnly?: boolean },
    MountInfo,
  ];
  "mounts.unmount": [{ id: string; force?: boolean }, null];
  "mounts.browse": [{ sessionId: string; path?: string }, Listing];
  "mounts.open": [{ id: string }, null];
  "mounts.documentation": [Record<string, never>, null];
  "editor.active": [Record<string, never>, EditorDocument | null];
  "editor.replace": [
    { tabId: string; documentId: string; version: number; text: string },
    Pick<EditorDocument, "tabId" | "documentId" | "version" | "dirty">,
  ];
  "workspace.showQuickAccess": [{ query?: string }, unknown];
  "workspace.setPaneLocked": [{ paneId: string; locked: boolean }, unknown];
  "workspace.resizeSplit": [{ splitId: string; ratio: number }, unknown];
  "events.publish": [{ event: string; payload: unknown }, null];
  "secrets.get": [{ key: string }, string | null];
  "secrets.set": [{ key: string; value: string }, null];
  "secrets.delete": [{ key: string }, null];
  "tasks.start": [
    {
      executable: string;
      args?: string[];
      cwd?: string;
      sessionId?: string;
      platform?: RemotePlatform;
      timeoutMs?: number;
    },
    { taskId: string; status: "running" },
  ];
  "tasks.list": [Record<string, never>, TaskSnapshot[]];
  "tasks.status": [{ taskId: string }, TaskSnapshot];
  "tasks.readOutput": [{ taskId: string; afterSeq?: number }, TaskOutput];
  "tasks.write": [{ taskId: string; data: string }, boolean];
  "tasks.closeInput": [{ taskId: string }, boolean];
  "tasks.cancel": [{ taskId: string }, boolean];
  "tools.invoke": [ToolInvocation, unknown];
  "tools.cancel": [{ requestId: string }, { cancelled: number }];
  "tools.revokeClient": [{ clientId: string }, { cancelled: number }];
  "runners.deploy": [
    {
      sessionId: string;
      platform: RemotePlatform;
      directory: string;
      runnerPath: string;
      executable: string;
    },
    { deployed: boolean; directory: string },
  ];
  "runners.start": [
    {
      sessionId: string;
      directory: string;
      config: Record<string, unknown>;
      secrets?: Record<string, unknown>;
    },
    { runnerId: string; status: "starting" },
  ];
  "runners.list": [Record<string, never>, RunnerRecord[]];
  "runners.send": [
    { sessionId: string; runnerId: string; message: Record<string, unknown> },
    { accepted: boolean },
  ];
  "runners.poll": [{ sessionId: string; runnerId: string; afterSeq?: number }, RunnerPoll];
  "runners.status": [{ sessionId: string; runnerId: string }, RunnerState];
  "runners.stop": [
    { sessionId: string; runnerId: string },
    { stopRequested: boolean; status: "stopping" },
  ];
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
  "files.local.writeText": [{ path: string; content: string; baseline?: string }, null];
  "files.local.createFile": [{ path: string }, null];
  "files.local.mkdir": [{ path: string }, null];
  "files.local.rename": [{ from: string; to: string; overwrite?: boolean }, null];
  "files.local.copy": [{ from: string; to: string; overwrite?: boolean }, null];
  "files.local.delete": [{ path: string; isDir: boolean }, null];
  "files.sftp.list": [{ sessionId: string; path?: string }, Listing];
  "files.sftp.resolveDirectory": [
    { sessionId: string; path?: string },
    { home: string; path: string },
  ];
  "files.sftp.readText": [{ sessionId: string; path: string }, { content: string; size: number }];
  "files.sftp.writeText": [{ sessionId: string; path: string; content: string; baseline?: string }, null];
  "files.sftp.createFile": [{ sessionId: string; path: string }, null];
  "files.sftp.mkdir": [{ sessionId: string; path: string }, null];
  "files.sftp.rename": [{ sessionId: string; from: string; to: string; overwrite?: boolean }, null];
  "files.sftp.copy": [{ sessionId: string; from: string; to: string; overwrite?: boolean }, null];
  "files.sftp.delete": [{ sessionId: string; path: string; isDir: boolean }, null];
  "monitor.system": [Record<string, never>, unknown];
  "monitor.stats": [{ sessionId: string }, unknown];
  "monitor.processes": [{ sessionId: string }, unknown];
  "monitor.kill": [{ sessionId: string; pid: number }, null];
  "history.list": [{ hostId: string; limit?: number }, unknown];
  "history.record": [{ hostId: string; command: string }, Record<string, unknown> | null];
  "history.delete": [{ id: number }, null];
  "history.clear": [{ hostId: string }, null];

  "api.describe": [Record<string, never>, { version: number; methods: MethodDescription[] }];
  "app.info": [Record<string, never>, Record<string, unknown>];
  "app.openExternal": [{ url: string }, null];
  "settings.get": [Record<string, never>, Record<string, unknown>];
  "settings.update": [{ patch: Record<string, unknown> }, Record<string, unknown>];
  "hosts.snapshot": [Record<string, never>, { hosts: SavedHost[]; groups: Group[] }];
  "hosts.create": [{ input: HostInput }, SavedHost];
  "hosts.update": [{ id: string; input: HostInput }, SavedHost];
  "hosts.delete": [{ id: string }, null];
  "hosts.markUsed": [{ id: string }, null];
  "hosts.reorder": [{ ids: string[] }, null];
  "groups.create": [{ input: { name: string; parentId?: string | null } }, Record<string, unknown>];
  "groups.update": [
    { id: string; input: { name: string; parentId?: string | null } },
    Record<string, unknown>,
  ];
  "groups.delete": [{ id: string }, null];
  "sessions.list": [Record<string, never>, SshSession[]];
  "sessions.connect": [{ request: SshConnectRequest }, SshSession];
  "sessions.disconnect": [{ sessionId: string }, null];
  "sessions.exec": [
    { sessionId: string; command: string; timeoutMs?: number },
    {
      stdout: string;
      stderr: string;
      exitCode: number | null;
      signal: string | null;
    },
  ];
  "terminal.write": [{ sessionId: string; data: string }, null];
  "terminal.resize": [{ sessionId: string; cols: number; rows: number }, null];
  "storage.get": [{ key: string }, unknown];
  "storage.set": [{ key: string; value: unknown }, null];
  "storage.delete": [{ key: string }, null];
  "workspace.snapshot": [Record<string, never>, Record<string, unknown>];
  "workspace.openPage": [
    { kind: "welcome" | "settings" | "about" | "updates" | "knownHosts" },
    unknown,
  ];
  "workspace.openHost": [{ hostId: string }, unknown];
  "workspace.openTerminal": [{ sessionId: string }, unknown];
  "workspace.openFiles": [{ sessionId: string }, unknown];
  "workspace.openSidebar": [{ view: "hosts" | "knownHosts" | "plugins" }, unknown];
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
  "workspace.move": [{ tabId: string; paneId: string; beforeTabId?: string | null }, unknown];
  "workspace.returnSidebar": [{ view: "hosts" | "knownHosts" | "plugins" }, unknown];
  "clipboard.readText": [Record<string, never>, string];
  "clipboard.writeText": [{ text: string }, null];
  "ui.showMessage": [{ message: string; kind?: "info" | "success" | "error" }, null];
  "ui.confirm": [{ message: string }, boolean];
  log: [{ message: string; level?: string }, null];
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
  log(message: string, level?: string): Promise<null>;
}
export interface PluginHandlers {
  initialize?(
    params: { apiVersion: number; pluginId: string },
    host: Host,
  ): unknown | Promise<unknown>;
  run?(command: string, input: Record<string, unknown>, host: Host): unknown | Promise<unknown>;
  render?(view: string, locale: string | undefined, host: Host): unknown | Promise<unknown>;
  shutdown?(host: Host): unknown | Promise<unknown>;
}
export function createPlugin(
  handlers?: PluginHandlers,
  options?: { input?: Readable; output?: Writable; timeout?: number },
): { readonly host: Host; close(): void };
