# Assistant plugins 1.3: execution locations

Requires Tunnelde 0.25.0 or later. Update both the desktop and the installed assistant
packages. These community integrations are maintained by TunneldeDev independently of
the coding CLI vendors.

## Start locally or over SSH

1. Install the desired independent plugin from Marketplace, a ZIP or a folder.
2. Approve a local Node 22+ runtime for the plugin. Tunnelde does not bundle Node or
   discover/execute system Node without consent.
3. Install and authenticate Codex, Claude Code or Pi on the intended execution machine.
   Tunnelde AI instead needs an API provider, exact model identifier and API key.
4. For remote execution, connect the host through Tunnelde's usual SSH UI.
5. In the chat composer, choose **Execution location**, then **Local** or a connected
   host. Model selection is separate. Optional workspace settings accept `~` or a
   relative directory, and a custom agent executable. Local directories have a picker.
6. Send a message to start the agent. Opening a view or selecting a target does not
   start the agent or probe remote Node.

| Plugin      | Agent connection                                       | Extra remote setup                                         |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Codex       | Installed `codex app-server` over structured stdio     | CLI authentication on the host                             |
| Claude Code | Installed `claude` with stream-json/control messages   | CLI authentication on the host                             |
| Pi          | Installed `pi --mode rpc`                              | Approve upload of the bundled permission extension         |
| Tunnelde AI | API streaming in a separate process on the chosen host | Select existing Node 22+ and approve runtime source upload |

SSH carries the remote stdin/stdout connection; no public listening port or generic ACP
server is required. This release does not implement a generic ACP adapter. Ordinary
runs do not require the advanced native supervisor helper.

## Conversations and context

All four plugins expose native thinking summaries and tool activity to the desktop's
per-turn expandable activity view. Intermediate work is collapsed together while the
final reply stays visible. Activity output is bounded; this view is not an unbounded
execution log. Stop also cancels a pending host tool approval, using the same request ID.

F1 → `>` can open installed plugin views and commands without visiting Marketplace.
Contributed commands and views are available in the desktop shortcut editor.

Each conversation remembers its target and workspace. Changing machines or workspace
after messages have been sent creates a new conversation and preserves the old one.
Reconnecting can rebind a saved target only to a unique connection with the same host
identity. Disconnected targets fail visibly and never fall back to local execution.

The normal remote selector supports POSIX SSH hosts. Windows local execution is
supported; Windows SSH drive/SFTP mappings are explicitly rejected until their path
mapping is supported throughout the host scope gate and task transport.

The host resolves remote home and working directories through SFTP metadata without
listing the home directory or running a shell. API tools receive a default session,
absolute paths and command cwd. `workspace_context`, `list_sessions` and `list_hosts`
expose authorized context without passwords or keys. Discovery is scoped to the selected
target; it does not grant access to every configured host.

## Remote consent and storage

Pi uploads its permission extension into a newly created `.tunnelde-pi-permissions-*`
directory. Tunnelde AI uploads its runtime source into `.tunnelde-tunnelde-ai-*`.
Each new deployment asks for approval. Successful deployments are retained for reuse
while their source fingerprint and host match. No existing user files or system services
are replaced; failed deployment attempts only clean up entries created by that attempt.

Tunnelde AI configuration, conversation state and provider keys are sent over encrypted
SSH stdin, not embedded in uploaded source or command arguments. Its API requests
originate on the selected execution machine, so loopback provider URLs refer to that
machine. Keys and saved conversations remain in the desktop plugin's own stores.

Ordinary runs depend on the SSH connection. Stop cancels their tasks; a disconnect is
reported as a failure. Advanced persistent supervisors remain available in collapsed
configuration for older deployments. They have separate deployment and recovery rules;
disabling a desktop plugin alone does not shut down a durable remote supervisor.

## Permission modes

| Mode             | Policy                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Ask for approval | Ask a human before mutations or commands                                                             |
| Approve for me   | Ask an independent API reviewer; fall back to a human on missing, invalid, failed or negative review |
| Full Access      | Intentionally allow supported actions without individual approval                                    |
| ReadOnly         | API read/discovery tools, or Codex's restricted read sandbox                                         |

Claude Code and Pi refuse CLI ReadOnly execution because their tool configuration does
not establish the required verified OS read sandbox. Scope checks and permission
prompts are not an operating-system sandbox around arbitrary executable code.

## Upgrade and verification

The packages retain their separate identities, settings, secrets and conversation stores.
Old explicit durable profiles remain available. CLI profiles from Tunnelde AI 1.1 are
still handled by the [1.2 migration rules](assistant-plugins-1.2.md).

Run `npm run agents:sync`, `npm run registry`, `npm run verify` and `npm run package`
after changing canonical runtime source. Tests cover target selection/reconnection,
path defaults, permission policy, structured CLI transports, remote startup errors and
a real isolated Node subprocess for the API bridge. That subprocess test uses a local
fake API server and simulated host transport. It does not prove SSH vendor CLI login,
paid-provider compatibility or macOS interaction on a real installation.

A separate SSH smoke check against the authorized test server verified home-directory
resolution, UTF-8 SFTP write/read in a newly created test directory, and successful
Claude Code stream-json initialization. No user/model prompt was sent. That check
does not verify authenticated model execution or represent an end-to-end desktop test.
