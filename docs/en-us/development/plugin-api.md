# Core API compatibility

[简体中文](../../zh-cn/development/plugin-api.md) · [SDK](../../../sdk/README.md) · [Generated API catalogue](../../../sdk/api.md)

Use `host.describe()` to inspect the running host. The SDK catalogue follows application
`dev`; an installed stable release can have fewer capabilities. The manifest's
`apiVersion: 1` identifies the protocol and does not make every method stable.

## SDK source organization

RPC declarations live under `sdk/rpc/<domain>/`. Host metadata, fields, sources,
columns and menus belong to `hosts/`; editor, files, forwarding, mounts, execution,
history and other domains define independent DTOs and method maps. Transport and
plugin lifecycle have separate directories. `transport/methodMap.d.mts` composes
domain maps; `tunnelde-plugin.d.mts` only re-exports public declarations.

```ts
import { createPlugin } from "./sdk/tunnelde-plugin.mjs";
import type { ForwardRule } from "./sdk/rpc/forwarding/contract.mjs";
import type { EditorDocument } from "./sdk/rpc/editor/contract.mjs";
```

Keep runtime imports on the existing SDK entry; domain files provide types only.
The synchronization checker follows every declaration dependency and compares
all composed method names with host discovery. Generated host DTOs update their
own domain files. Private imports, cycles, unreachable files and uncomposed method
maps fail checks. Frozen historical declarations compile beside the new tree and
verify export, input/result and transport compatibility. This reorganization does
not rename wire methods or promote experimental APIs to stable.

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
[Tab bar contributions](tab-bar.md) for replacement, lifecycle and scope rules.

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
handoff is available through the experimental `sessions.requestHandoff({sessionId})`.
The host shows a native consent dialog identifying the plugin and connection. It returns
`true` after transfer, `false` on decline, and errors on timeout, revocation, disconnection,
foreign ownership or an unaccepted tool result. Only one confirmation can be outstanding;
close an old dialog before retrying. Stale confirmations cannot transfer connections.
After acceptance the user manages the connection: plugin/client cleanup and restricted
mode preserve it, while manual disconnect and app exit close it. This neither opens a tab
nor transfers dependent tasks, persists a transport or grants new access. It is excluded
from `tools.invoke`. `sessions.list` continues to list all active sessions.

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
events or subscribes the caller to buffer changes. See [Editor plugins](editor-plugins.md).

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

## Dynamic host sources (experimental)

Plugins with `hosts.read` and `hosts.write` can publish runtime-owned discovery data with `hosts.setSource({ id, label, entries })` and remove it with `hosts.removeSource({ id })`. Each entry has a source-local `id`, `name`, `host`, `username`, optional `port` (22), `tags` and `note`. Credentials and private-key paths are rejected. A source allows 256 entries; a plugin allows 8 sources and 512 entries; the host allows 128 sources, 4096 entries and 4 MiB of source JSON. Each replacement also fits the shared 256 KiB request budget. Replacement is atomic; a failed validation leaves the previous source intact.

The built-in list groups entries by source and identifies the supplying plugin. Search supports `@is:discovered`, `@is:saved`, `@source:source-id` and `@plugin:plugin-id`; unprefixed fields remain ordinary search text. Source entries use the standard connection dialog, connection quality test and host-key trust flow. Passwords are entered for the current connection. **Save as my host** creates an independent saved copy for private keys, persistent credentials, host fields and forwarding configuration; deleting or changing that copy does not change discovery data.

`hosts.sourcesSnapshot({ offset?, revision? })` returns `{ revision, total, nextOffset, items }`, with at most one source per page. Begin with `{}`. For subsequent pages pass `nextOffset` as `offset` and the original `revision`. On `plugin.hostSources.changed`, restart from zero; pages are not a pinned snapshot or a resource reservation. Each source includes `pluginId`, `pluginName`, `id`, `label` and `entries`, and each entry includes an authoritative `hostId`. This API is separate from `hosts.snapshot`, which continues to describe saved hosts.

Use the returned `hostId` in `sessions.connect` or `workspace.openHost`. IDs bind plugin identity, source ID and the complete entry, including the connection endpoint. Changing any entry metadata changes its ID; a stale dialog fails instead of connecting a replacement endpoint. Source disappearance during setup rejects the pending connection. This does not revoke a connection that has already been established by the user. Plugin-created connections still follow runtime/client ownership and explicit handoff rules. Stop, crash, restart, revocation and restricted mode remove the runtime's sources; no discovery records are persisted implicitly. Runtime source removal does not erase saved copies or trusted server keys.

## File browser providers (experimental)

A trusted component view may declare `provider: "fileBrowser"` without `location`.
It requires `ui.trusted`, `fs.read`, `sftp.read` and `workspace.write`; the user
explicitly selects it in interface settings. `FrontendViewProps.fileBrowser`
provides an immutable pane/source/path/selection/loading snapshot, revision-bound
`read({revision, offset?})` pages of at most 256 visible sorted entries, and
`navigate`, `refresh`, `select`, `open` actions using the native host flows.
The optional `Entries` component composes the existing live file list; mount it
at most once. Stop, revocation, failure and restricted mode restore native rows.
Stale callbacks cannot act on a changed pane or a replacement provider. Native
path/source/filter/restore controls remain available. See the host's bilingual
`docs/plugin-file-browser.en-us.md` and `docs/plugin-file-browser.zh-cn.md` for
complete semantics, and `examples/trusted-ui` for a composition example. This is
trusted host-context code, not a sandbox or a new permission grant.

[Runtime resource lifecycle](runtime-resources.md): strict facade, ownership, paging and disposal semantics.

[Plugin-owned storage observation](storage-observation.md).


## Read-only file content (experimental)

Import `createFileContentClient` from `sdk/files/content/client.mjs`. The client
prepares an expiring descriptor before opening a regular file, so it knows which
ID to close if opening is cancelled. Each source needs its own explicit read
permission (`fs.read` locally, `sftp.read` over the selected SSH session).

```js
const owner = new AbortController();
const client = createFileContentClient(host);
const file = await client.open(
  { source: { kind: "remote", sessionId }, path: "/var/log/application.log" },
  { signal: owner.signal },
);
try {
  const bytes = await file.read({ offset: 0, length: file.chunkBytes });
  // bytes is Uint8Array. Select decoding appropriate to your preview.
} finally {
  await file.close();
  owner.abort();
}
```

Read at most 49152 bytes per call and do not assume immutable file contents. A read
renews the 60-second idle lease; lifecycle observation and subscriptions do not.
Aborting the owner closes its handle. Eight handles per client/runtime and 64 host
resources are supported; actual IO shares bounded native worker capacity even
when cancelled. `resources.identify` accepts `kind:"fileContent"` and the returned
`contentId`; generic release still revalidates exact runtime ownership. These
methods are ordinary-plugin APIs, not new scoped AI gateway permissions.
