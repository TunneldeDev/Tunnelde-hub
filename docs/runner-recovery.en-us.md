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
proof of a running process. Removing task records requires confirmed terminal
status and no pending stop; remote files remain. An uncertain launch reporting
`notFound` does not prove exit. Existing `runners.list` fields are unchanged;
destination and control metadata remain private to the host.

## Interrupted deployment

Hosts with deployment journaling save intent before remote mutation, distinguish
unconfirmed directory creation from incomplete upload, and publish a deployment
only after acknowledged completion. The native recovery screen shows these phases
even when the plugin is stopped. Incomplete deployments are omitted from
`runners.list`, cannot satisfy `runners.start`, and cause `runners.deploy` to return
`plugin.runners.deploymentIncomplete` for that destination. Existing ready records
and listing fields remain compatible.

Use a fresh directory and preserve the incomplete recovery record; do not infer
ownership or completion from a remote path existing. Only an unsubmitted reservation
can be removed after native confirmation. Directory creation and upload uncertainty
cannot be forgotten automatically. The journal does not imply remote artifact
cleanup: no partial directory is recursively deleted or start/message replayed.

Deployment captures the approved package bytes before mutation (32 MiB snapshot
limit), validates the explicitly selected helper (64 MiB limit), refuses helper
path collisions, and creates uploaded files exclusively. A preparation error leaves
no remote mutation. No system Node runtime is selected implicitly.

## Configuration writes

Hosts with configuration journaling save unsubmitted, creation-unconfirmed,
write-incomplete and saved phases separately from launch state. Configuration files
are created exclusively with mode 0600 at OPEN and written in bounded chunks with
authorization and exact-record checks. A newer stop or revoked runtime prevents a
late write acknowledgement from dispatching a helper start. The selected helper
protocol and existing `runners.list` fields remain unchanged.

Native recovery displays the phase without exposing configuration values or secrets.
Stopped or `notFound` task status does not settle an unknown configuration OPEN,
WRITE or CLOSE. Those records cannot be forgotten. Saved does not mean artifacts
were cleaned up; explicit removal of eligible terminal records preserves remote
files. Historical records remain readable without guessing their config state.
