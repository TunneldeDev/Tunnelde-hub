# Tunnelde AI

An independent Tunnelde assistant maintained by TunneldeDev.
Requires Tunnelde 0.25.1+ and an explicitly approved local Node 22+ plugin runtime.
Install from Marketplace, this folder or its ZIP and open its own sidebar.
Each assistant has independent settings, secrets, conversations and lifecycle.

## Conversation history

Click the conversation title in the chat toolbar to search history. Rename or delete any
conversation directly from its row without opening it first. Running conversations cannot
be deleted. New conversation placeholders follow the application language; custom names
are preserved. Multiple terminal connections to the same saved host and address appear as
one execution target, and host renames update the displayed target immediately.

## Configure and run

This package uses API streaming in an independent process.

Configure Chat Completions, Responses, Anthropic Messages or Gemini with the exact model ID and API key. HTTPS is required except for loopback HTTP servers; redirects are rejected. A blank key field keeps the existing key, and changing endpoint origin clears it unless replaced.

Choose **Local** or a connected SSH host in the composer's **Execution location** menu.
The selected account's home is the default workspace. Optional workspace settings accept
`~`, relative paths and a coding agent executable override. No session ID or manual
host scope list is needed. Coding plugins default to the corresponding remote command
instead of reusing a local Windows executable path.

Opening the view or selecting a target does not start the agent or discover user Node.
Send starts work. Coding agents must already be installed and authenticated on the
execution machine. Nothing installs Node, coding CLIs or system services automatically.

## Remote execution

Remote execution requires explicit selection of an existing Node 22+ runtime, followed by approval to upload plugin source into a new `.tunnelde-tunnelde-ai-*` directory. Configuration, history and keys travel in memory over encrypted SSH stdin; they are not embedded in uploaded source or command arguments. Provider requests originate on the selected machine, so loopback URLs refer to that machine.

Successful source/extension uploads are retained for reuse while their fingerprint and
host match. Only newly created plugin-owned directories are written. Failed deployments
only attempt cleanup of entries created by that attempt.

Targets are saved per conversation. Switching a populated conversation's machine or
workspace creates another conversation and preserves the previous one. Disconnected
targets fail visibly and never fall back to local execution. Ordinary runs require the
SSH connection. Advanced persistent profiles remain in collapsed configuration with
separate recovery rules; disabling a local plugin alone does not stop a durable remote
supervisor. See [setup and migration](https://github.com/TunneldeDev/tunnelde-hub/blob/main/docs/assistant-plugins-1.3.md).

## Permissions

**Ask for approval** prompts before mutations or commands. **Approve for me** uses a
separate API reviewer, falling back to a human on missing, malformed, failed or negative
review. **Full Access** intentionally permits supported unrestricted actions.

ReadOnly exposes read/discovery API tools and rejects commands or writes. Read hashes protect later writes against concurrent changes.

Scope checks and permission prompts do not replace OS isolation. Executable plugins
run with the user's permissions. API reviewer profiles cannot act as the primary
coding assistant. Credentials and conversations are not imported from other plugins.

## Compatibility and maintenance

See the [1.2 migration guide](https://github.com/TunneldeDev/tunnelde-hub/blob/main/docs/assistant-plugins-1.2.md) for users moving from
old aggregated CLI profiles. Existing interrupted conversations remain inspectable.

Shared source lives in `plugins/tunnelde-ai`. After changing common entry points or
`lib/`, run `npm run agents:sync`, `npm run registry`, `npm run verify` and
`npm run package`. Checked-in copies keep folders and ZIPs independently installable.
Tests use isolated API servers and simulated CLI/SSH transports; they do not authenticate
the user's coding agents or contact paid providers.
