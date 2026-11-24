# Tunnelde MCP

Expose explicitly approved SSH sessions, local/remote folders and background tasks to a local MCP client. The plugin ships a dependency-free Streamable HTTP server and a Node stdio bridge. Install the package through Tunnelde's plugin manager; no package installation scripts or npm dependencies are run.

Requires Node.js 22 or newer and a Tunnelde build exposing `tools.invoke`, `tools.cancel`, `tools.revokeClient`, background tasks, plugin secrets and events. Older hosts fail initialization with an upgrade message. The plugin does **not** listen automatically after installation or restart.

## Setup

1. Approve the plugin's requested host permissions and open **MCP Access**.
2. Create a named client. The default mode is **Ask before changes**. Select an existing SSH session, a saved host allowed to connect, and any local/remote folder roots it needs. Empty selections deny access. Local and remote paths must be absolute. An approved saved host allows connecting with normal host-key verification and Tunnelde's existing authentication; no SSH password or private-key tool is exposed.
3. Copy the displayed client token immediately: its plaintext is shown only in that command result. Only a SHA-256 digest is persisted. Losing a token requires revoking the client and creating a new one.
4. Explicitly start the listener. The default endpoint is `http://127.0.0.1:47691/mcp`; change the port before starting if needed. Keep Tunnelde running.
5. Configure your MCP client using either direct HTTP or the stdio bridge below. After changing a client's scope, reconnect the MCP client. Reopening Tunnelde requires explicitly starting the listener again.

The configuration form selects one initial session, host, local root and remote root per client. A successful connection to its approved saved host adds that new session to the client's scope; remote file access still needs an explicitly configured root for that session. Refresh the plugin view to update session choices. Distinct clients can have different scopes and modes.

## HTTP client configuration

For MCP clients supporting Streamable HTTP and static authorization headers:

```json
{
  "mcpServers": {
    "tunnelde": {
      "url": "http://127.0.0.1:47691/mcp",
      "headers": { "Authorization": "Bearer <client-token>" }
    }
  }
}
```

Client configuration keys vary by application; use its documented Streamable HTTP transport settings. The service uses manually provisioned local bearer tokens, not OAuth discovery or remote account sign-in. Clients requiring an OAuth flow should use the stdio bridge. Never put the token in the URL, a shared file, or source control.

## Stdio bridge

Point the MCP client at the **installed plugin's** `bridge.mjs`, using a trusted Node.js 22+ executable. Substitute actual absolute paths:

```json
{
  "mcpServers": {
    "tunnelde": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/installed/tunnelde-mcp/bridge.mjs"],
      "env": {
        "TUNNELDE_MCP_URL": "http://127.0.0.1:47691/mcp",
        "TUNNELDE_MCP_TOKEN": "<client-token>"
      }
    }
  }
}
```

The bridge reads UTF-8 JSON-RPC lines from stdin and writes only MCP JSON-RPC lines to stdout; diagnostics go to stderr. It forwards initialization, notifications, cancellation and tool requests over the authenticated local HTTP connection. It never starts a second SSH client or server. It closes its HTTP session when stdin ends. A native Tunnelde CLI may replace the Node bridge with the same `TUNNELDE_MCP_URL` and `TUNNELDE_MCP_TOKEN` environment contract, but the Node plugin still requires its approved runtime.

When the native helper is installed, use its actual executable path instead of Node:

```json
{
  "command": "/absolute/path/to/tunnelde-agent",
  "args": ["--mcp-stdio"],
  "env": {
    "TUNNELDE_MCP_URL": "http://127.0.0.1:47691/mcp",
    "TUNNELDE_MCP_TOKEN": "<client-token>"
  }
}
```

On Windows, the executable is `tunnelde-agent.exe`. The native bridge avoids a Node dependency in the MCP client's subprocess; the server plugin inside Tunnelde still uses the approved Node runtime. Both bridges have been checked with the official MCP TypeScript SDK 1.32.2 using real initialization, tool listing and tool execution.

## Approval modes

| Mode                           | Behavior                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask before changes (`ask`)     | Read tools run within scope. Each command or mutation requires Tunnelde's own confirmation.                                                                                                                                                    |
| Independent review (`approve`) | An independently configured model reviews the exact method, arguments and scope. An explicit valid approval permits execution. Denial, uncertainty, missing credentials, timeout or malformed output returns to Tunnelde's human confirmation. |
| Full within scope (`full`)     | Tools run automatically after host permission and scope checks. Selecting this mode requires an explicit warning confirmation.                                                                                                                 |
| Read only (`readOnly`)         | Only fixed read tools are listed or callable. Shell commands, process creation and mutations are rejected even when a client requests them directly.                                                                                           |

The HTTP client cannot select or override mode, scope or review results. Every execution goes through `tools.invoke`; the HTTP server never calls the underlying SSH/file execution APIs directly. Tunnelde rechecks permissions and resolves paths before execution. Existing host-key confirmation is preserved.

**Scope is not an operating-system sandbox.** File API paths are constrained to approved roots, and tasks require an approved working directory. Executable programs and shell commands can access anything permitted to that local or remote OS user; their arguments are not confined to the working directory. Giving command execution to a session is substantial access. Use read-only mode if commands must never run. Node extensions themselves run with the current OS user's privileges; host grants control exposed API access, not arbitrary Node filesystem/network access.

## Independent reviewer and privacy

Optional reviewer settings accept an OpenAI-compatible base URL, model and API key. The key is stored exclusively through Tunnelde's plugin-isolated OS keyring; it is never rendered again or persisted in ordinary plugin settings. An empty key field retains an existing key. Clearing both URL and model disables review and deletes that key.

Review sends the exact command or file content in the tool arguments, plus the approved scope, to the model service you choose. Configure an appropriate trusted endpoint if this data is sensitive. HTTPS is required except for explicit loopback HTTP model services. Redirects are rejected. Reviews have a 15-second deadline and a 64-KiB response limit. Only a strict JSON boolean and nonempty reason are accepted; failures ask the user. Tool output and model output remain untrusted data.

## Available tools

Tool names use `tunnelde_` followed by the host method with dots replaced by underscores. Each publishes its complete JSON Schema and MCP read-only/destructive annotations:

- Saved host metadata: `hosts.snapshot`.
- SSH: `sessions.list`, `sessions.connect`, `sessions.disconnect`, `sessions.exec`.
- Local files: `files.local.home`, `list`, `readText`, `writeText`, `createFile`, `mkdir`, `rename`, `copy`, `delete`.
- Remote files: `files.sftp.list`, `readText`, `writeText`, `createFile`, `mkdir`, `rename`, `copy`, `delete`.
- Transfers: `files.upload`, `files.download`, `files.transferStatus`, `files.cancelTransfer`.
- Background processes: `tasks.start`, `tasks.list`, `tasks.status`, `tasks.readOutput`, `tasks.cancel`.

Long-running processes return a task ID; poll status and sequenced output instead of holding a request open. A transfer ID means a transfer was started, not completed; poll transfer status. The plugin isolates task IDs and transfer IDs between its clients in addition to the host's plugin/runtime isolation. No settings, clipboard, private-key, password, keyring, generic host-call, raw terminal-input or arbitrary plugin-invocation MCP tool is exposed.

Requested permissions are `network`, `secrets`, `hosts.read`, `sessions.read`, `ssh.exec`, `process.exec`, `fs.read`, `fs.write`, `sftp.read` and `sftp.write`. Secrets are used only for this plugin's independently configured reviewer key. `process.exec` enables explicitly approved local background commands; remote tasks use `ssh.exec`. Permissions can be denied or revoked in Tunnelde, causing the affected tool calls to fail.

## Revocation and stopping

Revoking a client immediately blocks its token, closes its sessions, cancels its pending host requests and attempts to cancel its known active tasks and transfers. Scope changes close the existing sessions before applying the new scope. Stopping the listener cancels active work for all clients. Restricted mode, disabling/revoking the extension or closing Tunnelde terminates the plugin process and its listening socket; the host also cancels runtime-owned work. Completed changes cannot be undone, and remote process termination depends on SSH server signal support. Revoke a leaked client token instead of merely deleting it from an MCP client's settings.

## Transport and limits

- Implements MCP versions `2025-11-25`, `2025-06-18` and `2025-03-26` using JSON-response Streamable HTTP. The endpoint returns 405 to GET because it does not offer a standalone SSE stream. The deprecated pre-2025 HTTP+SSE transport is not implemented.
- Loopback IPv4 binding only, with exact Host and Origin checks, a distinct bearer token per client, secure session UUIDs, token-to-session binding and protocol-version validation. Non-browser local clients may omit Origin; supplied Origins must be the server's own loopback origin. Cross-origin browser clients and proxy forwarding are deliberately unsupported.
- Accepted notifications receive HTTP 202 without a response body. MCP initialization must complete before tools are used. DELETE closes the client's session. Session IDs expire after 30 minutes of inactivity and are never used as authentication credentials.
- At most 32 configured clients, 64 sessions overall, 8 sessions per client, 16 pending tool calls overall, 4 per client and 256 tracked tasks/transfers of each kind per listener. Requests are at most 256 KiB and results are limited to 900 KiB before encoding. Host services have their own stricter limits. Shrink or split large requests; do not retry a mutation merely because a response was lost.
- `notifications/cancelled` is routed only to the originating session's active request. Network disconnection alone is not interpreted as cancellation. Explicitly cancel or revoke if work must stop.
- No SSE notifications, server-initiated sampling, roots negotiation, resource subscriptions, prompts, OAuth or external network listening is advertised.

Protocol references: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), and [lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).

## Development verification

```sh
node --test plugins/tunnelde-mcp/tests/mcp.test.mjs
```

Tests start real loopback HTTP sockets and a real stdio bridge subprocess. They cover negotiation, authentication, Host/Origin rejection, session binding/expiry, malformed input, fixed tool schemas, caller-approval spoofing, read-only denial, review fallback, cancellation, revocation, per-client task/transfer isolation, socket shutdown and key handling. The bundled `lib/tunnelde-plugin.mjs` is a self-contained copy of the Hub's first-party SDK, included because plugin installation does not resolve dependencies.

## 中文说明

此插件为本地 MCP 客户端提供受限的 SSH、文件与后台任务访问。安装后不会自动监听：请在 **MCP 访问** 页面创建客户端，选择审批模式、允许的会话和文件根目录，保存仅显示一次的密钥，再手动开启监听。默认采用“更改前询问”；“只读”模式禁止任何命令和写入。“独立 AI 审核”只使用您单独配置的审核模型，不接受请求客户端自报的批准；未明确批准时转回应用内确认。

HTTP 客户端需要配置 Authorization Bearer 头；不支持静态头或需要 stdio 的客户端，可使用随插件提供的 `bridge.mjs`，通过 `TUNNELDE_MCP_URL` 和 `TUNNELDE_MCP_TOKEN` 环境变量连接。独立审核器密钥存储在系统密钥库；审核会将完整工具参数发送至您选择的服务。客户端密钥只保存哈希，不会在页面重新显示。

文件 API 的路径受所选根目录约束，但执行的程序和 SSH 命令仍拥有对应操作系统用户的权限，工作目录不是系统沙箱。禁止执行命令时请使用只读模式。撤销客户端会立即阻止其密钥、关闭会话并取消活动工作；已完成的更改不可回滚。受限模式、停用插件及关闭应用会停止插件监听。应用重启后需重新开启监听。
