# Shared mounts and the plugin Bus

Check `host.describe()` for individual methods and `host.extensions.describe()` for experimental capabilities. Discovery does not grant permission or establish any connection.

## Mounts

`mounts.read` reads host-owned groups, rules, dedicated connections and operation receipts. `mounts.write` changes them. SSHFS implementations share the same persisted data; do not replicate it in plugin storage or synchronize it over the Bus. The `mounts.groupLifecycle` discovery entry describes explicit connection commands and `autoReconnect`. A group owns a dedicated SSH session; it is independent of regular terminal and SFTP sessions. Automatic recovery restores previously desired mounts when enabled. Driver and authentication failures may require attention instead of automatic retry.

Use `mounts.rules.snapshot` for an initial host view. Pass both its revisions to `mounts.groups.observe` to wait for changes. Pass the current entry revision for configuration updates and the current `runtimeId` when targeting a specific mounted instance. Use the returned operation ID with `mounts.operations.observe` until the operation reaches a terminal phase. Cancel only prevents subsequent steps.

When `extensions.describe().hostDetails?.mounts?.nativeViewKind` is `sharedMounts`, Node and declarative plugins can declare a `sharedMounts` view and a `hostDetails` contribution referencing it with `kind: "mounts"`. The native panel needs `hosts.read` and `mounts.read`; a host details contribution additionally needs `mounts.hostDetails`. Mutating controls require `mounts.write`. The user selects the active contributor. The older `mounts` block and RPCs retain their one-off behavior.

## Messaging

Declare `bus.communicate`. Use a reverse-domain capability name with a positive integer version in `bus.advertise`; `bus.discover` returns online providers for that capability. Subscribe to `bus.discovery` for later changes and re-read discovery after any dropped messages.

Pass no `busId` to subscribe or publish on the public Bus. For frequent or private messages, create a channel with `bus.create`, then invite an online plugin with `bus.invite`. The recipient can read its pending invitations via `bus.invitations` or receive `bus.invitation`; only that runtime can accept the invitation using `bus.join`. Topic subscriptions are exact on both public and private buses. Use the authenticated `sender.pluginId` field, not an identity in the payload. No durable delivery, replay, or secrecy from the host is implied. The host closes a private Bus when its owner leaves or stops.

```js
import { watchBus } from "./sdk/bus/client.mjs";

// The runtime should abort this controller during shutdown.
const lifetime = new AbortController();
const topic = "com.example.sync.changed";
await host.call("bus.subscribe", { busId, topic });
const subscription = watchBus(host, async ({ messages, lost }) => {
  if (lost) await refreshFromSource();
  for (const message of messages) {
    if (message.busId === busId && message.topic === topic) {
      await onChange(message);
    }
  }
}, { signal: lifetime.signal });

// When this topic is no longer needed:
subscription.stop();
await host.call("bus.unsubscribe", { busId, topic });
```

`watchBus` multiplexes a single cancellable `bus.receive` call per SDK host. Do not also call `bus.receive` directly. Keep handlers short: the next batch is read after handlers settle. A failed handler closes only its own subscription, with the error in `subscription.done`. The queue is bounded; `lost` indicates that some messages could not be delivered. Use revisions and recover from the source of truth rather than assuming messages are durable.
