# Durable runner recovery

[简体中文](runner-recovery.zh-cn.md)

The experimental `runners.*` API binds new deployments to the saved host ID,
connected address and observed SSH server key. Reconnection must match all three.
Changing a saved host or accepting another key does not retarget existing tasks.

Older records remain readable but require native review of their original target
before remote inspection or cleanup. Updating a plugin does not automatically
hand its previous tasks to the new package fingerprint. Check `api.describe` for
`runners.review` before offering review:

```js
const { reviewed } = await host.call("runners.review", {
  sessionId, runnerId, directory, kind: "destination",
});
```

`destination` binds only a legacy record with no captured identity. `control`
requests explicit handoff of one task to the current, already authorized package.
Both require `ssh.exec` and native confirmation; caller-supplied confirmation is
not accepted. Cancellation returns `{ reviewed: false }`. Changed records,
revoked permissions, changed connections and expired confirmations fail without
applying the review. Already bound identities cannot be replaced.

Handoff keeps the original remote package and scope. It cannot hand over a
terminal task or clear a pending stop, and never starts a runner, sends a prompt
or replays approval. Continue observing the same task identity after a successful
handoff; do not automatically resend prior operations.

Settings → Plugins → Remote task recovery lets users inspect and request stopping
saved tasks without launching their plugin or selecting Node, including after
uninstallation or in restricted mode. Saved records and SSH availability are not
proof of a running process. Removing local records requires confirmed terminal
status and no pending stop; remote files remain. An uncertain launch reporting
`notFound` does not prove exit. Existing `runners.list` fields are unchanged;
destination and control metadata remain private to the host.
