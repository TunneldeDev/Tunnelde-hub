# Remote assistant deployment identity

[简体中文](assistant-deployments.zh-cn.md)

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
