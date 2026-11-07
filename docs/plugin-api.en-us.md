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
unknown failures. Settings, workspace, chat and remote runners remain experimental.

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
but remains experimental.

Host errors include integer `code`, string `message` and usually a `data.code` category.
Invalid parameter objects or oversized requests use `-32602`; authorization failures
use `-32001`; storage, quota and IO errors use `-32000`. Recognized storage messages
include `plugin.api.missing:<field>`, `plugin.api.invalid:<field>`,
`plugin.api.invalidStorageKey`, `plugin.api.invalidStorage` and
`plugin.api.storageTooLarge`. `knownErrors` is not an exhaustive list of OS errors.
The transport can reject an oversized response with `-32002` and no `data`.

The application validates host-produced responses against a frozen contract floor and
replays them through a frozen pre-contract SDK. Its compatibility probe also has isolated
Windows desktop acceptance for persistence, isolation, quotas and revocation. This covers
the defined core, not all methods, platforms or historical plugin behavior. The Hub CI
compares the generated catalogue and typed method names with application `dev`; regenerate
with `npm run sdk:sync -- ../Tunnelde` after host changes.
