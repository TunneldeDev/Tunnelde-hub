# Core API compatibility

[简体中文](plugin-api.zh-cn.md) · [SDK](../sdk/README.md) · [Generated API catalogue](../sdk/api.md)

Use `host.describe()` to inspect the running host. The SDK catalogue follows application
`dev`; an installed stable release can have fewer capabilities. The manifest's
`apiVersion: 1` identifies the protocol and does not make every method stable.

The first stable core consists of `api.describe`, `sessions.list`, `storage.get`,
`storage.set` and `storage.delete`. These methods have been available since 0.21.0;
`since` records availability, not when their stability commitment was established.
Stable method descriptions include an optional version-1 `contract` containing draft-07
`inputSchema`, `resultSchema`, `errorSchema`, `knownErrors` and `events`. Older hosts can
omit this metadata. Ignore additional fields, discover methods before use and handle
unknown failures. Settings, workspace mutations, chat and remote runners remain experimental.
Stable contracts also cover status bar contributions and `editor.active`/`editor.replace`.
The editor methods have been available since 0.29.0-beta.2; `since` is their first
availability, not the date the v1 contract was frozen.
Tab-bar registration and removal have stable v1 contracts, including the optional
`commandContextSchema` for advisory `_locale` / `_tabBar` command input. See
[Tab bar contributions](tab-bar.en-us.md) for replacement, lifecycle and scope rules.

| Method           | Permission      | Behavior                                                                                                 |
| ---------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `api.describe`   | None            | Object parameters; returns protocol version and method descriptions.                                     |
| `sessions.list`  | `sessions.read` | Object parameters; returns current authenticated sessions, possibly empty. Saved hosts are not sessions. |
| `storage.get`    | None            | `{key}`; reads this plugin's JSON value. Missing keys and stored JSON `null` both return `null`.         |
| `storage.set`    | None            | `{key,value}`; persists any JSON value including `null`; returns `null`.                                 |
| `storage.delete` | None            | `{key}`; removes a value if present; returns `null` even if absent.                                      |

All calls require an approved running plugin; revocation and restricted mode stop access.
Storage is isolated by plugin identity and persists across runtime restarts without
filesystem permission. Keys contain 1–128 ASCII letters, digits, dots, underscores or
hyphens; `__proto__`, `constructor` and `prototype` are reserved. Unknown request fields
are ignored. Requests are limited to 256 KiB of UTF-8 encoded JSON; the entire stored JSON
object has a separate 256 KiB quota, including all keys and serialization overhead.
Schemas describe structure; byte limits, authorization and runtime state are checked
separately. File replacement does not promise power-loss durability. These five methods
emit no events.

Session DTOs contain `id`, `hostId`, `title`, `address`, `cols`, `rows` and `connectedAt`
(Unix epoch milliseconds). Internal terminal/purpose fields and credentials are excluded.
A listed session can disconnect before a later call. `sessions.connect` uses this DTO
but remains experimental. Connections it creates belong to the calling runtime generation
and close on stop, crash, revocation or replacement. Opening a terminal/file tab does not
transfer ownership. Pending and live connections share a limit of eight per plugin and
64 across plugins, with a 120-second setup deadline. Host-key checks remain mandatory.
Use an existing user-created session for an independent lifetime; explicit ownership
handoff is not yet available. `sessions.list` continues to list all active sessions.

Through `tools.invoke`, a connection also belongs to its `clientId` (default `agent`).
`tools.revokeClient` permanently revokes that identity in the current runtime generation,
cancels its pending calls and releases its tasks, transfers and SSH connections. Other
clients, direct plugin calls, user connections and replacement generations are preserved.
Use a new client identity to resume. `tools.cancel` closes connections whose pending
result has not been accepted; a completed request's delivered connection is unaffected.
Reused public request IDs are isolated from old cleanup. Completed remote effects cannot
be rolled back. These lifecycle rules do not add fields to the stable session DTO.

Host errors include integer `code`, string `message` and usually a `data.code` category.
Invalid parameter objects or oversized requests use `-32602`; authorization failures
use `-32001`; storage, quota and IO errors use `-32000`. Recognized storage messages
include `plugin.api.missing:<field>`, `plugin.api.invalid:<field>`,
`plugin.api.invalidStorageKey`, `plugin.api.invalidStorage` and
`plugin.api.storageTooLarge`. `knownErrors` is not an exhaustive list of OS errors.
The transport can reject an oversized response with `-32002` and no `data`.

## Workspace snapshot contract

`workspace.snapshot` requires `workspace.read` and has existed since 0.21.0. Its frozen
v1 result is the independent `PluginWorkspaceSnapshot`: `tabs`, `panes`, `activeId`,
`activePaneId` and recursive `layout`. The host explicitly copies documented fields;
new internal store fields, editor contents, drafts and credentials are excluded.
File-pane metadata preserves source/session IDs, path, view preferences, remote identity
and offline status. Optional fields remain optional, including explicit `false` or `null`.
Tab kinds and view option strings are open vocabularies; tolerate new values.

Hidden panel tabs may remain in their remembered pane. A split's `row` is horizontal,
`column` vertical, with a ratio from 0 to 1. Each request reads current state; the result
does not reserve tabs or sessions or grant file/SSH access. No events are emitted.
Authorization is checked before dispatch and after the reply. Bridge timeout/closure,
busy, expired request and response byte-limit failures remain possible.

`npm run sdk:sync -- ../Tunnelde` copies the workspace DTO declarations from the host's
independent projection. Check mode detects missing/changed declarations without writing
SDK files. Workspace mutations remain experimental even when returning this snapshot.

## Editor buffer contract

`editor.active` requires `editor.read` and returns a ready focused editor snapshot
`{tabId, documentId, version, path, name, content, dirty}`, or `null` for a non-editor,
loading, failed, disconnected or missing buffer. It includes unsaved edits and never
rereads arbitrary files. Content exceeding 128 KiB of UTF-8 fails with
`plugin.api.frontend:editor.documentTooLarge`.

`editor.replace` requires `editor.write` and accepts `{tabId, documentId, version, text}`.
It returns the independent `EditorWriteResult` DTO `{tabId, documentId, version, dirty}`.
It is one undoable buffer replacement, never a disk save. Changed content increments
the version; identical content preserves version and history. Undo/redo also increment
the version. Closed/reopened, stale or unavailable documents fail with
`plugin.api.frontend:editor.documentChanged`. Re-read and ask the user to retry instead
of applying an old result over newer content. `dirty` compares against the saved baseline.

IDs are nonempty, NUL-free and at most 1,024 UTF-16 code units; revisions are nonnegative
safe integers. Text may be empty but must fit 128 KiB of UTF-8. Unknown request fields
are ignored and clients must ignore future result fields. Schemas describe character
lengths, separately from byte limits and state checks. Invalid fields report
`plugin.api.frontend:invalid:<field>` with code `-32000`; authorization uses `-32001`.
Bridge errors include `plugin.api.busy`, `plugin.api.frontendTimeout`,
`plugin.api.frontendClosed` and `plugin.api.requestExpired`. Neither method emits plugin
events or subscribes the caller to buffer changes. See [Editor plugins](editor-plugins.en-us.md).

The application validates host-produced responses against a frozen contract floor and
replays them through a frozen pre-contract SDK. Its compatibility probe also has isolated
Windows desktop acceptance for persistence, isolation, quotas and revocation. This covers
the defined core, not all methods, platforms or historical plugin behavior. The Hub CI
compares the generated catalogue and typed method names with application `dev`; regenerate
with `npm run sdk:sync -- ../Tunnelde` after host changes.

## Local logging contract

`log` requires the `log` permission and a running approved runtime. Its frozen v1 contract
is included in discovery; old `host.log(message, level)` calls remain supported. Structured
options and requested severity need host 0.33.0-beta.5 or later; `since: 0.21.0` records the
method's initial availability. Set `engines.tunnelde` or discover the contract before
depending on the newer semantics.

`host.log(message, {level, domain, operation, requestId, fields})` returns `null` on acceptance,
subject to filtering and a bounded lossy writer. It never promises durable delivery or
subscribes to events. Identity and generation come from the host; domains are prefixed with
`plugins.<id>.`. Messages are at most 16 KiB UTF-8; optional identifiers accept `null` or
1–128 ASCII letters, digits, `.`, `_`, `-`, `:`. `fields` is an object limited to 16 KiB
before redaction, 256 visited nodes including its root, depth four below root and 64-byte
identifier keys. Runtime quotas supplement structural schemas. Sensitive structured keys
are redacted; HTTP/SOCKS URL values lose credentials, query and fragment. Free-text secrets
and URL paths cannot be reliably scrubbed. Never include credentials or document content.

Malformed entries return `plugin.api.invalid:log`; limits return `logs.invalid:<field>`,
both with RPC `-32000`. Shared invalid-parameter and authorization errors use `-32602` and
`-32001`. Unknown errors remain possible. The on-disk record layout is not this API's
stable contract.

## Notifications and confirmations

`ui.showMessage` and `ui.confirm` have stable v1 contracts when discovery includes
their schemas. Both require an approved running plugin and no extra permission;
`since: 0.21.0` records their original availability, not the addition of metadata.
Messages are literal, nonempty and cannot contain NUL. Unknown fields are ignored;
the host identifies the installed plugin in notifications and dialog titles.

`ui.showMessage({message, kind})` accepts up to 4,000 UTF-16 code units. `kind`
is `info`, `success` or `error`; omitted or null defaults to `info`. The null result
acknowledges transient display, not durable delivery or that the user read it.

`ui.confirm({message})` accepts up to 220 × 1,024 UTF-16 units, within the shared
256 KiB UTF-8 serialized request budget. It returns true only on explicit
confirmation; dismissal, replacement or the 55-second UI deadline returns false.
Use a call timeout above 55 seconds to wait for that deadline; a shorter SDK
timeout can reject first. An existing dialog is preserved and rejects the request
as `plugin.api.frontend:dialog.busy`. Stop, revocation or cancellation can reject
instead of returning a boolean; cancelled authorization must not create late UI.
Invalid fields use `plugin.api.frontend:invalid:message` or
`plugin.api.frontend:invalid:kind`. These methods grant no permissions and expose
no actions, subscriptions or internal UI state. Schema character counts are
separate from runtime UTF-16 and wire byte quotas.
