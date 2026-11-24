# Assistant plugins 1.4: initialize before sending

Requires Tunnelde 0.26.0 or later and the matching 1.4.0 assistant packages.
The four plugins keep separate identities, settings, secrets and conversation histories.

## Choose a machine and initialize

1. Open the plugin from the sidebar or F1 command search. Approve its local Node 22+
   plugin runtime if needed. Tunnelde does not bundle or silently discover user Node.
2. Tunnelde AI needs an API provider and exact model identifier. Coding plugins use
   their actual Codex, Claude Code or Pi executable and the account on that machine.
3. Connect a remote host through Hosts, then select it in **Execution location**.
   Its home directory becomes the workspace. No session ID or root list must be typed.
   Optional settings can override the workspace, agent executable or remote Node path.
4. Use **Initialize** for an existing agent/runtime, or **Install and initialize** on a
   supported remote host. Approve the check or installation before anything executes.
5. Send appears after the check succeeds. Draft messages survive errors and retries.
   Initialization can be cancelled; changing execution location or configuration during
   a check is blocked until it finishes or is cancelled.

Readiness is checked in memory per provider, machine, workspace and executable. Changing
them requires another check. Plugin restarts require initialization again. A failed check
does not append a user message or start inference. An actual run can still fail if a
connection, provider, model, subscription or authentication token later becomes invalid.

## What is checked

| Plugin               | Initialization check                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| Codex                | Actual `codex app-server` initialize handshake and `account/read` account status      |
| Claude Code          | Actual `claude auth status` JSON and stream-json control initialization               |
| Pi                   | Actual RPC `get_state`, then selected provider/model in `get_available_models`        |
| Tunnelde AI over SSH | Selected Node 22+, approved source upload, actual worker JSON-RPC initialize response |
| Tunnelde AI locally  | Provider configuration is valid; this does not prove successful provider inference    |

Checks send no chat prompt and do not perform paid inference. They establish protocol
and configuration readiness, not that every future model request will succeed. Log in
to the selected coding agent on its execution machine before retrying a failed account
check. Pi's available-model check uses the agent's credential/configuration snapshot;
it does not validate an API token by calling the model provider.

Native agent protocols run through encrypted SSH stdin/stdout. There is no generic ACP
adapter, agent listening port or advanced supervisor requirement for ordinary sessions.
Legacy persistent profiles require explicit normal execution selection before using this
initialization flow; their existing inspect/recovery controls remain separate.

## Approved private installation

Automatic installation currently supports Linux/macOS x64 and arm64 POSIX SSH hosts.
The host needs `curl`, `tar` and `sha256sum` or `shasum`. Windows SSH execution remains
unsupported. For local coding agents, use the agent's official installer and choose its
executable, then Initialize.

The installer selects an official Node.js LTS version of at least 22, downloads from
nodejs.org and checks the archive SHA-256 before extraction. It creates a fresh private
`.tunnelde-runtime-*` directory under the account's home. Coding packages are installed
from registry.npmjs.org into that directory with their own prefix, cache and npm config:

- Codex: `@openai/codex`
- Claude Code: `@anthropic-ai/claude-code`
- Pi: `@mariozechner/pi-coding-agent`

A wrapper adds that private Node directory to PATH for the selected agent. No sudo,
shell-profile edits, system Node replacement or service changes are involved. Runtime
download/extraction failures and cancellation remove only the newly created runtime
directory. If Node succeeds but agent installation or sign-in fails, the private runtime
can remain for inspection or selection; retrying installation creates another private
directory. Successful private installations and source deployments are retained.

Remote Tunnelde AI asks separately before uploading its source into a fresh plugin-owned
directory. Preflight workers receive no provider keys, conversation configuration or
user tools. During actual inference, configuration and keys travel only in memory over
SSH stdin; provider requests originate on the selected machine.

## Verification limits

Automated tests use isolated provider servers, actual separate worker processes, native
protocol fixtures and temporary filesystem installer fixtures. They cover missing Node,
denied consent, cancellation, uninitialized sends, target/configuration changes, checksum
failures and cleanup. They do not install on a real SSH host, validate paid-provider
accounts or establish end-to-end authentication with a user's coding CLI.
