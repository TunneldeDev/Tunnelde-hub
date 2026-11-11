# Host storage recovery SDK

Discover the experimental `storage.recovery.observe` and
`storage.recovery.request` methods before use. They require independent
`storage.recovery.read` and (for requests) `storage.recovery.write` permissions.

```js
import { createHostStorageRecoveryClient } from "./sdk/storage/recovery/client.mjs";
const recovery = createHostStorageRecoveryClient(host);
const observation = await recovery.observe();
if (observation.changed && observation.snapshot.pending) {
  await recovery.request(
    { revision: observation.revision, action: "retry" },
    { signal: owner.signal },
  );
}
```

The host identifies the plugin and asks for confirmation. A `restartScheduled`
result saves intent only; the user chooses when to restart. Retry preserves the
pending direction, so a cancelling plan cannot become a migration. Cancel always
selects cancellation. Denial returns `dismissed` with the latest snapshot.
The default 70-second request timeout allows the 55-second consent window.
Do not automatically retry an uncertain write: observe current state first.

`pending.restartRequested` distinguishes a request waiting for restart from an
attempt whose startup has already begun. `hasError` reveals only error presence.
`recordedCopies` contains at most one previous/archive path per category, ordered
by category and kind. No contents, raw errors or private IDs are exposed. A path
does not prove existence, integrity, ownership, complete history or permission to
delete. This client cannot run migration I/O, delete copies or restart the app.

Use `subscribe(callback,{signal:owner.signal,intervalMs:2000})` for owner-bound,
serial latest-state polling; this is not a per-write event stream. DTOs and schema
are mirrored from the host and runtime results are validated and deeply frozen.
See the application's [recovery contract](https://github.com/TunneldeDev/Tunnelde/blob/dev/docs/en-us/development/plugins/storage-recovery.md)
for commit fences, limits and explicit recovery limitations.
