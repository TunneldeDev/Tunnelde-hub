# Tunnelde AI

An independent Tunnelde assistant maintained by TunneldeDev.
Requires Tunnelde 0.26.0+ and an explicitly approved local Node 22+ plugin runtime.
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

Opening the view or selecting a target does not start an agent or discover user Node.
Before the first message on a machine, **Initialize** replaces Send. Initialization asks
for consent, checks the selected runtime and the agent's native structured protocol,
and sends no model prompt. Errors appear beside the composer and keep your draft.
You can cancel initialization. Changing the provider, executable, workspace, machine
or permission mode requires another check; readiness is not persisted across plugin
restarts. Initialization validates the selected permission mode without a model prompt.
A successful check for one mode never enables sending in another mode.

On supported SSH hosts, **Install and initialize** offers an explicit approved private
installation. Local agents must be installed with their official installer, authenticated,
and selected in Execution settings. Nothing installs or starts a CLI implicitly.
See [initialization and installation](https://github.com/TunneldeDev/tunnelde-hub/blob/main/docs/assistant-plugins-1.4.md).

## Remote execution

Remote execution requires selecting an existing Node 22+ runtime or approving a private runtime installation, followed by approval to upload plugin source into a new `.TunneldeAI/Chats/tunnelde-ai-*` directory. Configuration, history and keys travel in memory over encrypted SSH stdin; they are not embedded in uploaded source or command arguments. Provider requests originate on the selected machine, so loopback URLs refer to that machine.

Successful source/extension uploads are retained for reuse while their fingerprint and
host match. Only newly created plugin-owned directories are written. Failed deployments
only attempt cleanup of entries created by that attempt. Ownership checkpoints are saved
during upload and initialization. If a connection drops before cleanup finishes, reconnect
the host and retry initialization or delete the conversation; unknown or modified files
stop cleanup and remain intact.

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

Private remote runtimes live under `~/.TunneldeAI/Runtimes/`; deployments live under
`~/.TunneldeAI/Chats/`. Deleting a remote conversation first verifies and cleans its
recorded source files, so reconnect that host before deleting it. Modified or unknown
files are preserved and cleanup reports the reason. Known legacy deployment directories
move into `Chats` on the next approved initialization. Existing runtime paths remain
usable; untracked legacy directories are never deleted by a name-only sweep.

Remote deployment reuse and cleanup bind both host ID and captured address. Older records
require explicit identity review before cleanup. See the
[English guide](https://github.com/TunneldeDev/Tunnelde-hub/blob/main/docs/assistant-deployments.en-us.md) /
[中文说明](https://github.com/TunneldeDev/Tunnelde-hub/blob/main/docs/assistant-deployments.zh-cn.md)
for recovery and limitations.
