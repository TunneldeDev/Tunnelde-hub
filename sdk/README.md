# Tunnelde plugin SDK

Public preference conditional reads and abortable observation:
[English](../docs/en-us/development/preferences-observation.md) · [简体中文](../docs/zh-cn/development/preferences-observation.md).

Required installed dependencies, manifest admission v2 and independent approval:
[English](../docs/en-us/development/plugin-activation.md) · [简体中文](../docs/zh-cn/development/plugin-activation.md).

The compatibility entry `tunnelde-plugin.d.mts` re-exports public declarations
from `rpc/<domain>/`. DTOs, method maps, transport and lifecycle own separate
files. Copy the declaration tree with the SDK for TypeScript development. Runtime
imports of `createPlugin` still use `tunnelde-plugin.mjs`; the `rpc/` tree contains
types only. See [English](../docs/en-us/development/plugin-api.md#sdk-source-organization) /
[简体中文](../docs/zh-cn/development/plugin-api.md#sdk-源码分类) for domain imports and checks.

File context-menu contributions are under development: [English](../docs/en-us/development/file-menu.md) · [简体中文](../docs/zh-cn/development/file-menu.md).

Editor commands, formatting and contributed keybindings:
[English](../docs/en-us/development/editor-plugins.md) · [简体中文](../docs/zh-cn/development/editor-plugins.md).

Copy `tunnelde-plugin.mjs` into an executable Node plugin and import `createPlugin`.
There are no npm dependencies or implicit runtime downloads. The SDK starts only when
Tunnelde launches a plugin after the user approves executable code and its declared host
permissions. It is not an operating-system sandbox.

```js
import { createPlugin } from "./tunnelde-plugin.mjs";

createPlugin({
  async run(command, input, host) {
    if (command !== "report") throw new Error("Unknown command");
    const snapshot = await host.call("hosts.snapshot");
    return { text: JSON.stringify(snapshot, null, 2) };
  },
  render() {
    return {
      title: "Host report",
      blocks: [{ type: "text", text: "Run Report to list saved hosts." }],
    };
  },
});
```

Declare `hosts.read` in `tunnelde-plugin.json` before calling `hosts.snapshot`. Every host
method is checked against the installed plugin's declarations, user grants, package
fingerprint and current restricted-mode generation. `host.describe()` returns the live,
versioned method catalogue, permissions, parameter names, descriptions and compatibility
metadata. Each method is marked `stable`, `experimental` or `deprecated`; only stable methods
are compatibility commitments, and stable/deprecated entries include `since` or migration
guidance respectively. Older hosts omit these fields, so treat missing stability as unknown.
Stable methods may also expose an optional `contract` containing versioned JSON Schemas
for parameters, results and errors, plus their known errors and event behavior. The SDK
copies these definitions from the selected application's embedded contract file; it does
not infer schemas from the descriptive parameter string. Older hosts can omit `contract`.

The first stable core covers discovery, authenticated session listing and plugin-scoped
JSON storage. See [Core API compatibility](../docs/en-us/development/plugin-api.md)
([简体中文](../docs/zh-cn/development/plugin-api.md)) for permissions, quotas and error handling.
Stable contracts also cover status bar contributions and the versioned editor buffer
API. `EditorDocument` and `EditorWriteResult` are independent DTOs; buffer replacement
requires a matching document identity/revision, supports undo and never saves to disk.
`workspace.snapshot` also has a stable read-only contract. Its independent
`PluginWorkspaceSnapshot` declarations are synchronized from the host projection and
checked for drift; layout metadata grants no file or session permissions. Workspace
mutations remain experimental.
Tab-bar registration and removal also have stable v1 contracts. Registrations replace
the entire item; removal returns whether an item was removed. The optional
`contract.commandContextSchema` describes the `_locale` / `_tabBar` input delivered
to a declared command. `TabBarCommandInput` exposes those advisory fields without
granting file, editor or SSH access. Rendering and internal snapshot events remain
host implementation details.
Unknown methods are rejected. There is no generic application-command invocation. The `secrets` permission
allows access only to the plugin's own keyring namespace; SSH credentials remain private.

`host.call(method, params, {signal, timeoutMs})` returns the host result, rejects on denial/error,
and supports local cancellation. Cancellation stops waiting; it cannot undo an already
completed write. Calls time out after 30 seconds by default; each call may request up to
120 seconds. For a 60-second SSH job or confirmation dialog, use `{timeoutMs: 70000}`.
At most 32 calls may be pending, parameters must be objects no larger than 256 KiB,
and protocol frames must fit in 1 MiB. Transport options are the second argument, for
example `createPlugin(handlers, { timeout: 30000 })`.

The [API catalogue](api.md) documents all methods and their required permissions;
[`api.json`](api.json) is a machine-readable snapshot of `host.describe()`. The host's
live description is authoritative. `terminal.write` takes ordinary UTF-8 text, not base64.

Maintainers can run `npm run sdk:check -- ../Tunnelde` to compare both generated
catalogue files with a chosen application checkout without modifying either repository.
Hub validation also checks against the application's `dev` branch. If it reports drift,
review the host change, run `npm run sdk:sync -- ../Tunnelde`, and update SDK types and
compatibility coverage as needed. This check detects catalogue text and permission drift;
it does not prove input/output schemas or behavior are backward compatible.

New package releases and unpublished drafts are checked against the current application
`dev` catalogue before publishing. If `dev` changes while a draft is waiting, the check
can fail on retry; reconcile the SDK and prepare a new version rather than replacing an
immutable tag. Retrying an already published release skips this moving comparison and
still verifies every existing asset against the tagged source. Historical tags run their
own original workflow when pushed; use the current workflow's manual dispatch for recovery.

On Tunnelde 0.25+, `files.sftp.resolveDirectory({sessionId, path?})` returns
`{home, path}` using SFTP canonicalization and directory metadata. It accepts omitted
paths, `~` and relative directories and requires `sftp.read`. Use it for explicit target
selection instead of shelling out or listing the whole home directory. Pass the resolved
absolute workspace into subsequent scoped tool calls.

Uploads and downloads return immediately with a transfer ID. Poll the owning runtime's
status before running dependent commands; a failed transfer must stop the task:

```js
const transferId = await host.call("files.upload", {
  sessionId,
  localPath,
  remotePath,
});
for (let attempt = 0; attempt < 120; attempt++) {
  const status = await host.call("files.transferStatus", { transferId });
  if (!status) throw new Error("Transfer status expired");
  if (status.status === "done") break;
  if (status.status !== "running")
    throw new Error(status.error ?? status.status);
  if (attempt === 119) {
    await host.call("files.cancelTransfer", { transferId });
    throw new Error("Transfer did not finish in time");
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
```

Declare `fs.read` and `sftp.write` for uploading. Cancellation and status lookup only
accept transfers created by the current plugin runtime; revocation, restricted mode
and process exit cancel its active transfers. The host retains 256 completed results
and permits 8 concurrent transfers per plugin. These calls transfer binary files and
directories without the text-file API's content-size limits.

Hosts with journaled plugin transfers stage data before publishing each destination.
The optional `pluginId` identifies the initiating plugin. `cleanupPending` is a terminal
execution result: disposal must wait for the destination to reconnect or for the user
to review a preserved backup. Never treat it as success or automatically retry the write.
Cancellation and revocation stop new work, drain active writers and clean only owned
staging. Incomplete plugin jobs are disposed after an application restart; the task list
cannot pause or resume work under a former runtime's permissions. Completed files and
source files are retained. Older hosts can omit attribution and phase fields.

The transport consumes stdin and writes protocol frames to stdout. Write diagnostics to
stderr or use `host.log` with the `log` permission. Requests from the host are handled while
plugin-to-host calls are waiting, so a command can safely await API results.

Use the main application's [API guide](https://github.com/TunneldeDev/Tunnelde/blob/dev/docs/en-us/development/plugins/README.md)
for the complete permission table, method parameters, limits, restricted-mode behavior and
CLI recovery options. Plugin authors should handle denied permissions and interrupted calls
without retrying writes automatically.

## Events, processes and scoped tools

`events.publish` has a stable v1 contract. It sends `{event, payload}` to the application.
Names use 1–128 ASCII letters, digits, dot, underscore, colon or hyphen. Omitting
`payload` sends `null`; the complete UTF-8 parameter object remains limited to 256 KiB.
The host wraps it in
`{pluginId, generation, event, payload}` on `plugin://event`; consumers must check runtime
generation and, for chat, view/session/run/sequence before applying updates. Never publish
secrets. A `null` result acknowledges transport acceptance, not subscriber processing
or durable delivery. There is no replay or cross-request completion-order guarantee;
use a query/snapshot for recoverable state. `eventSchema` in discovery describes the
host envelope, not every plugin-defined payload. See the bilingual event guides:
[English](../docs/en-us/development/plugin-events.md) · [简体中文](../docs/zh-cn/development/plugin-events.md).

The SDK reads LF-delimited frames with a bounded 1 MiB buffer, preserving Unicode
line/paragraph separators and split UTF-8. Outgoing separators are escaped for old
readers without changing JSON values. Existing installed plugins retain their bundled
SDK; the host also escapes these characters when communicating with historical SDKs.

Store API keys with `secrets.set`, read with `secrets.get`, and delete with
`secrets.delete`. A secret is at most 16 KiB. Blank password fields in a configuration
editor should preserve saved secrets, rather than echo them in render payloads.

`tasks.start` accepts an explicitly chosen executable, arguments and optional working
directory. Local processes require `process.exec`; SSH processes require `ssh.exec` and
an explicit `sessionId`, with `platform` controlling POSIX or PowerShell quoting. No runtime
is discovered, downloaded or started implicitly. `tasks.readOutput` returns separate,
sequenced stdout/stderr events; honor `nextSeq` and `truncated`. Use `tasks.write` and
`tasks.closeInput` for stdin. `tasks.cancel` requests cancellation; inspect status before
reporting completion. Default deadline is 30 minutes, maximum 24 hours. The host allows
8 active tasks per plugin and bounds retained output. Direct SSH tasks depend on their
SSH channel and are distinct from durable runners.

The output snapshot includes the task's `status`, `exitCode` and optional `error`,
including when no new events remain. Show this host failure detail when available;
a disconnected SSH channel is not evidence that the executable or login is wrong.
Older hosts may omit `error`; `tasks.status` also provides diagnostic details. Drain
terminal output before reporting failure so the last protocol response is retained.

AI and MCP clients should call `tools.invoke` with an allowlisted method, parameters,
explicit `scope`, `mode`, `clientId` and unique `requestId`. `readOnly` rejects commands
and mutations. `ask` asks the human before mutations; `approve` may accept a decision
from a separately configured independent reviewer, falling back to the human. `full`
skips action confirmation and must be explicitly selected by the user. Read operations
still require host permissions and target scope. `tools.cancel` cancels a pending request
and closes SSH connections whose results have not been accepted; delivered connections
from completed requests remain open. `tools.revokeClient` permanently revokes the client
identity for this runtime generation and releases its tasks, transfers and SSH connections.
Other clients, direct plugin calls and user connections are preserved; use a new client ID
to resume. Reusing a public request ID does not transfer ownership to old cleanup.
For work the user wants to keep independently, the plugin may call
`sessions.requestHandoff({sessionId})` after receiving its connection result. The host
requires native user consent; no request flag can preapprove it. `true` means the user
now owns that connection, `false` means declined. Stale/expired/revoked/foreign requests
fail. This does not open tabs or transfer tasks. The method is not an AI tool.
Completed writes cannot be rolled back. The reviewer decision is trusted plugin input: never copy it from model
tool arguments. Scope checks constrain host tool calls, not arbitrary executable code.

## Optional durable remote runners

`runners.deploy` uploads a user-selected native helper and the current plugin to a fresh
user directory after confirmation. Its `runnerPath` parameter is a **local helper binary**
for the target platform; `executable` is the explicitly supplied **remote Node executable**.
It does not install Node, a service or a system daemon. `runners.start` then starts a
runner from that deployment and sends secrets over SSH stdin, never argv or config files.

Remote runner work may continue after disconnecting or closing Tunnelde. Reconnect to
the same saved host, use `runners.poll` with the last `nextSeq`, show pending approvals,
and require explicit user action to resume interrupted model work. Approval replies are
sent through `runners.send` with `{type:"approval", approvalId, approved}`. Never replay
non-idempotent writes on reconnect. `runners.stop` reports a stop request; an unreachable
runner remains pending in `runners.list` until stopping can be confirmed. Revocation
requests stopping but cannot prove a disconnected remote process has ended.

New deployments also bind the observed server key. Legacy destination review and
per-task package handoff require native consent through experimental `runners.review`.
See [durable runner recovery](../docs/en-us/development/runner-recovery.md) for the contract and
the host-owned recovery interface available without starting a plugin.

## Controlled workspace and chat views

See [view contributions and chat events](../plugins/README.md#sidebar-and-chat-views).
Views render application controls and safe Markdown; plugin HTML and scripts are not
embedded. The SDK exports `PluginView`, `PluginChatBlock`, task, event, scope and runner
types. Saved SSH metadata is `SavedHost`; `Host` is the host API transport.

Tunnelde 0.25.1 provides searchable chat history with independent row actions.
The session command receives `action: "select" | "new" | "rename" | "delete"`,
`sessionId` for an existing conversation and `title` for renaming. Renaming or deleting
another item must preserve the current conversation; running items must reject deletion.
Use `ChatSession.untitled` to distinguish a localized placeholder from a custom title.
`updatedAt` is a Unix millisecond timestamp, and `running` plus `runId` lets the host
clear a background item's busy state when the matching run finishes. `ChatExecution`
and structured message activity describe the selected target and collapsible tool work.

Chat task entries can provide `runId` to bind recovery to their original operation.
Recovery commands receive that value as `taskRunId`, the clicked `taskId` and the
current conversation `runId`. Validate the supplied identities before any process
access; a reused runner must not turn an old action into recovery of a later run.
Older hosts omit `taskRunId`, so plugins must also validate their saved task cursor
and retire recovery actions when that cursor is replaced.

Tunnelde 0.26.0 adds optional chat preparation/install commands and per-target
`readiness`. See the [chat schema](../plugins/README.md#sidebar-and-chat-views) and
[assistant initialization guide](../docs/en-us/releases/assistant-plugins-1.4.md). A declared preparation
command replaces Send until the selected profile and target are ready. Initialization
must acknowledge promptly and support cancellation; the host refreshes checking views
as a fallback when a completion event is lost.

Run `npm run sdk:sync -- ../Tunnelde` to regenerate both catalogue files from the desktop
Rust `METHODS` source. This does not change the registry or publish packages.
Run `npm run sdk:check -- ../Tunnelde` to check the generated files and ensure that
`HostMethodMap` declares exactly the host's method names. The check does not verify
parameter or return types, runtime behavior, or compatibility with older plugins;
those require separate contract and integration tests.

Host calls whose success has no payload resolve to JSON `null`. The SDK types now
reflect that existing wire behavior; TypeScript code that explicitly annotated
such a result as `void` should use `null` or ignore the result instead. This
correction does not change the runtime protocol.

Stable status bar contributions: [English](../docs/en-us/development/status-bar.md) · [简体中文](../docs/zh-cn/development/status-bar.md).

Stable tab bar controls: [English](../docs/en-us/development/tab-bar.md) · [简体中文](../docs/zh-cn/development/tab-bar.md).

### Structured local logging

With the `log` permission, `host.log("Failed", "error")` remains supported. New hosts also accept
`host.log("Failed", { level: "error", domain: "connection", operation: "connect", requestId: "req-1", fields: { status: 403 } })`.
Detect the stable logging contract through `host.describe()` before relying on structured options.
The host assigns plugin identity and runtime generation, prefixes domains with `plugins.<id>.`,
and writes to the user's rotating local application log. Output supports plugin/domain/level filters.
Fields are bounded and credential-like keys are redacted; free text must never contain secrets.
Returned null means accepted, subject to log filtering and the bounded nonblocking writer.
See the host's bilingual `docs/logging.en-us.md` and `docs/logging.zh-cn.md` for limits and semantics.

### Notifications and confirmations

Discover the stable v1 `ui.showMessage` and `ui.confirm` contracts before depending on
their metadata. They identify the installed plugin and need no additional permission.
Use `host.call("ui.showMessage", { message: "Finished", kind: "success" })` for transient
plain text. For a confirmation that can wait for the host's 55-second UI deadline, use
`host.call("ui.confirm", { message: "Continue?" }, { timeoutMs: 65000 })`; true means
explicit confirmation, false means dismissal or UI expiry. Stop/revocation and transport
errors can reject. See the bilingual API guide for limits and busy-dialog behavior.

Experimental host discovery: `host.sources.set(source)`, `host.sources.remove(id)` and `host.sources.snapshot({ offset?, revision? })`. Discovery is runtime-owned, nonsecret and separate from saved hosts. See the [English](../docs/en-us/development/plugin-api.md#dynamic-host-sources-experimental) / [中文](../docs/zh-cn/development/plugin-api.md#动态主机来源实验性) contract for limits, revisioned pagination and connection lifetime.

Experimental profile metadata: [English](../docs/en-us/development/profiles-observation.md) · [简体中文](../docs/zh-cn/development/profiles-observation.md).

Experimental plugin-owned storage: [English](../docs/en-us/development/storage-observation.md) · [简体中文](../docs/zh-cn/development/storage-observation.md).
