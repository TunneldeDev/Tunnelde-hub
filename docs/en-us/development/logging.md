# Reading persisted logs

Experimental `logs.read` requires its own permission; `log` remains the separate stable
writer. The grant covers application and other plugins' records, including potentially
sensitive message/context metadata. Detect support through `host.describe()`.

```js
import { createLoggingClient } from "./sdk/logging/client.mjs";
const logs = createLoggingClient(host);
const owner = new AbortController();
const sub = logs.subscribe(
  async (page) => {
    if (page.gap) showIncompleteHistory();
    await appendEntries(page.entries);
  },
  { signal: owner.signal, intervalMs: 2000 },
  {
    source: "diagnostics",
    filter: { levels: ["warn", "error"] },
  },
);
// On view/runtime disposal:
owner.abort();
await sub.done;
```

Frontend adapters use `{call:(...args)=>context.api.call(...args)}` without Node.
`read({source?,cursor?,filter?,limit?},options?)` returns a version1 structured page of entries,
cursor, hasMore, reset and gap. Entry fields are timestamp|null, level, domain, pluginId|null,
message, fields and truncated. Source defaults to diagnostics; operations reads the existing
retained action history. Limit is1–200 (default100); filters accept exact domains/plugins/levels,
OR within a field and AND across fields, plus case-insensitive projected text. See mirrored
`sdk/logging/schema.json` and `sdk/rpc/logging/data/` for bounds. Nulls/extra request fields and
duplicate filter values are invalid.

Cursors bind to process/runtime/owner/source/normalized filters, never paths or authority.
Change query or restart with a fresh read. Current-file diagnostics begin within the latest256KiB,
scan at most256KiB/2048 records per call, wait for incomplete tails and skip malformed/overlong
records with gaps. Rotation/replacement/truncation invalidates a position with reset/gap;
retired files are not drained. Identity/64-byte anchor checks are best-effort append-log checks,
not an immutable snapshot or proof against arbitrary in-place rewriting. Operations retain
the most recent1000 records. This is not reliable delivery or a complete historical audit.

The host bounds original JSON pages to128KiB, individual entries to64KiB and messages to16KiB.
The SDK bounds decoded/re-encoded work separately to256KiB because JavaScript can expand small
decimal numbers; it deeply freezes projected entries. Structured credential keys/HTTP-SOCKS
URLs are sanitized. Free text and URL paths cannot be reliably scrubbed.

Subscriptions require an owner signal and integer1–60second polling interval, have10second
read deadlines and a maximum of8 per client. Pages and callbacks serialize; each page yields,
and32 consecutive pages trigger an interval wait. Stop/abort suppress late delivery but
pending work retains quota until it settles. `done` resolves with stopped/aborted or
`{reason:"failed",error}`; failures terminate rather than silently discarding a cursor.
Host workers have a separate four-worker quota retained across cancellation.

Errors include logs.read.invalidRequest, logs.read.invalidCursor, logs.read.unavailable,
plugin.api.busy and shared authorization/cancellation errors. Filesystem/DB details do not
cross this RPC. Use the application output for local diagnostics and handle unknown errors.
Host/SDK DTO/schema drift checks and a real Rust producer-consumer CI gate accompany this API.
