# Tunnelde plugin SDK

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
versioned method catalogue, permissions, parameter names and descriptions. Unknown methods
are rejected. There is no generic application-command invocation. The `secrets` permission
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

The transport consumes stdin and writes protocol frames to stdout. Write diagnostics to
stderr or use `host.log` with the `log` permission. Requests from the host are handled while
plugin-to-host calls are waiting, so a command can safely await API results.

Use the main application's [API guide](https://github.com/TunneldeDev/Tunnelde/blob/main/docs/plugins.md)
for the complete permission table, method parameters, limits, restricted-mode behavior and
CLI recovery options. Plugin authors should handle denied permissions and interrupted calls
without retrying writes automatically.

## Events, processes and scoped tools

`events.publish` sends `{event, payload}` to the application. The host wraps it in
`{pluginId, generation, event, payload}` on `plugin://event`; consumers must check runtime
generation and, for chat, view/session/run/sequence before applying updates. Never publish
secrets. Store API keys with `secrets.set`, read with `secrets.get`, and delete with
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

AI and MCP clients should call `tools.invoke` with an allowlisted method, parameters,
explicit `scope`, `mode`, `clientId` and unique `requestId`. `readOnly` rejects commands
and mutations. `ask` asks the human before mutations; `approve` may accept a decision
from a separately configured independent reviewer, falling back to the human. `full`
skips action confirmation and must be explicitly selected by the user. Read operations
still require host permissions and target scope. `tools.cancel` cancels a pending request;
`tools.revokeClient` also cancels resources owned by that client. Completed writes cannot
be rolled back. The reviewer decision is trusted plugin input: never copy it from model
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

Tunnelde 0.26.0 adds optional chat preparation/install commands and per-target
`readiness`. See the [chat schema](../plugins/README.md#sidebar-and-chat-views) and
[assistant initialization guide](../docs/assistant-plugins-1.4.md). A declared preparation
command replaces Send until the selected profile and target are ready. Initialization
must acknowledge promptly and support cancellation; the host refreshes checking views
as a fallback when a completion event is lost.

Run `npm run sdk:sync -- ../Tunnelde` to regenerate both catalogue files from the desktop
Rust `METHODS` source. This does not change the registry or publish packages.
