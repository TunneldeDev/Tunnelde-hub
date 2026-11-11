# Profile metadata subscriptions

The experimental `createProfilesClient(host)` facade in `sdk/profiles/client.mjs`
uses `profiles.observe` with `settings.read` and current runtime approval. Detect
the method with `host.describe()` on older hosts. It neither selects a runtime nor
uses Node globals. Distribute `sdk/profiles/`, `sdk/runtime/observation/` and their
declarations; provide a transport supporting AbortSignal and deadlines.

```js
const profiles = createProfilesClient(host);
const owner = new AbortController();
const subscription = profiles.subscribe(async ({ items }) => {
  showProfileNames(items);
}, { signal: owner.signal });

// When this feature retires:
owner.abort();
const outcome = await subscription.done;
```

`observe({}, options?)` initially returns `changed:true` with a snapshot. Pass its
opaque revision on later reads. `changed:false` carries no snapshot. Each snapshot
has `version:1`, `revision` and at most 32 `{id,name,updatedAt}` items in native
order. Settings contents, credentials and activation are absent. Results are
detached and deeply frozen. Schema/type mirrors are generated from host contracts;
the runtime consumer additionally validates UTF-8 byte limits, unique IDs/names,
trimmed names, safe timestamps, paired revisions and the 32 KiB response bound.
Malformed responses fail without echoing their values.

Native saves/deletes atomically persist a new generation with the list. Metadata
hashing also detects visible historical-writer changes without hashing private
settings. Legacy reads do not write the database. Revisions survive restart but
are latest-state tokens, not event cursors; commits may coalesce.

Subscriptions require an owner signal; eight per client, serial reads/callbacks,
1000–60000 ms intervals (default 2000) after settlement, and 10000 ms read deadlines.
Stop/abort suppresses late delivery; cancelled unsettled work retains quota.
`closed` means delivery stopped; `done` waits for settlement and resolves
stopped/aborted/failed. Errors stop without retries. Callbacks own any additional
work they start. Revision-bound [public content reads](profiles-content.md) have
a separate content token and SDK read method. Writes, activation and import/export
remain independent future contracts; existing native controls are unchanged.
