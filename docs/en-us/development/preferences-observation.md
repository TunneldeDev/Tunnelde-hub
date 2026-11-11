# Public preference observation

[简体中文](../../zh-cn/development/preferences-observation.md) · [Form providers](preferences-ui.md)

The experimental `preferences.observe` RPC requires `settings.read`, plugin
approval and a live runtime. Discover it with `api.describe` on older hosts.
It does not require a settings page, trusted UI or server subscription.

```js
import { createPreferencesClient } from "./sdk/preferences/client.mjs";

const owner = new AbortController(); // Abort when this feature/view/plugin ends.
const preferences = createPreferencesClient(host);
const subscription = preferences.subscribe(async snapshot => {
  // Snapshot is detached and deeply frozen. Do not log sensitive preference values.
  applyTheme(snapshot.values.appearance.theme);
}, { signal: owner.signal, intervalMs: 2000 });

// When ending this feature:
owner.abort();
const result = await subscription.done;
if (result.reason === "failed") reportError(result.error);
```

Distribute the `sdk/preferences/` + `sdk/runtime/observation/` runtime directory with its declarations and
referenced `rpc/` types. The client has no runtime dependencies or Node globals;
pass an authorized host transport implementing `call` cancellation and timeouts.
It does not select or install a runtime. The facade also exposes `schema()`,
`read()`, `update(request)` and `observe(request?, options?)`. Writes require
`settings.write` and the current persistent revision; they are never retried.

`observe({})` returns `{version: 1, revision, changed: true, snapshot}`. Reusing its
opaque revision returns `{version: 1, revision, changed: false}` while unchanged,
without values or defaults. A changed result includes a public snapshot at that
exact revision. Unknown input fields, null and revision tokens outside 1–128
UTF-8 bytes or containing control characters are rejected. No internal Settings,
credentials or provider selection enter this contract. Proxy identities/usernames
are public preference values, so avoid writing entire snapshots to logs.

`subscribe` requires an owner `AbortSignal`. It emits an initial snapshot and then
latest state changes, not every intermediate commit. Global revisions also
change on metadata saves. Intervals are integers from 1000 to 60000ms (default
2000), starting after each read and async callback settle. Reads use a 10000ms
timeout and never overlap. There are at most eight active subscriptions per client;
cancelled unsettled work still occupies its slot.

`stop()` is idempotent; owner abort and stop cancel pending reads/timers and fence
late responses. `closed` indicates delivery has stopped; `done` waits for the
transport/callback to settle and resolves with `stopped`, `aborted` or `failed`
(with `error`). It never rejects. Errors stop the subscription without automatic
retry; inspect `done`. The client cannot cancel work started inside your callback.
Always bind the owner signal to disposal. A custom transport ignoring cancellation
or timeout can delay settlement; it cannot cause a late callback.

This is bounded polling, not a durable event stream, audit history or cross-plugin
broadcast. Missing methods and revoked runtimes fail; there is no fallback to
`settings.get`. DTOs are generated from the host's public preference contracts,
independent of its internal store and UI form provider.
