# Remote assistant deployment identity

[简体中文](../../zh-cn/development/assistant-deployments.md)

Remote assistant source deployments record the saved host ID and connected
`user@host:port` address. Reuse and cleanup require both identities to match.
Reconnecting to the same destination can use an equivalent SSH connection; changing
the saved host's address does not authorize cleanup on the new machine.

Conversation deletion checks each recorded deployment, including earlier retained
deployments, against its own destination. A disconnected or changed destination
stops cleanup and keeps the conversation and remaining ownership records. Reconnect
the original machine to retry. Deployment directories live under
`~/.TunneldeAI/Chats/`; other files are not swept by name.

Older records may lack an address. Cleanup first asks you to confirm that the
displayed address is the original machine that owns the displayed directory.
Declining preserves the files and conversation. If several different addresses
share a host ID, no address is selected automatically. New source deployments on
a changed destination use a new directory rather than reusing the old path.

File checksums and directory membership are checked before cleanup. These checks
are not an atomic protection against another client changing files during deletion.
Avoid editing deployment directories while cleanup is running. This identity
binding does not provide durable CLI processes across application restarts.

## Recovering a task

Recovery belongs to the saved process and operation, rather than whichever process
happens to be the conversation's latest one. Starting another message retires the
previous task's recovery actions while preserving its history. Stale actions are
rejected before accessing a process or sending a request, including when a remote
runner is reused. Inspecting the current task displays its availability, status,
exit code and error when available; inspection never starts another agent or sends
a model prompt. Hosts that support task run identities also send the captured
identity, so an old action cannot select a new operation on the same runner.

During an active durable-runner observation, an explicit host-busy response retries
only the status or journal read. Reads keep the same runner identity and event cursor,
use a shared 30-second deadline, and stop after at most eight attempts. Cancelling
also cancels pending reads and backoff. Permission failures, disconnections and timeouts
are returned immediately; start, send, approval and stop operations are never retried
by this observer. Manual inspection remains a single read.

If contention persists or the runner reports `notFound`, the conversation becomes
interrupted and retains its recovery identity. Reconnect the original host, inspect
the task, and choose resume to observe its existing journal. Neither a missing runner
nor a lost response proves that its previous operation did not run; recovery does
not repeat the prompt. These rules apply to advanced durable profiles, not ordinary
SSH-dependent agent processes.
