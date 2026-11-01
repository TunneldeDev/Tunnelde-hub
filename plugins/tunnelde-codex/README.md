# Codex

An independent Tunnelde plugin maintained by TunneldeDev. This is a community integration, not an OpenAI-published plugin. Requires Tunnelde 0.22.2+ and an explicitly selected Node 22+ runtime.

Install this folder or its versioned ZIP, enable **Codex**, and open its own sidebar activity. It does not require Tunnelde AI, Claude Code, or Pi. Each archive contains its complete runtime. Settings, secrets, conversations, approvals, remote runner ownership, enable/disable, and uninstall are scoped to `tunnelde-codex`; installing or stopping another assistant does not share or stop this plugin's local sessions.

## Configure and run

Use the executable picker to select an already installed Codex executable and choose its working directory and authorized workspace roots. This plugin uses Codex's app-server protocol. Model identifiers are optional CLI overrides. Authentication remains with the selected CLI. Nothing scans for, downloads, installs, or starts Node or a coding CLI when the view opens. Sending a message explicitly starts work.

Only Codex profiles appear as executable models. An optional independent reviewer uses OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, or Gemini API profiles; those profiles cannot run as the primary assistant here. API credentials are kept in this plugin's host secret store. No credentials or configuration are automatically imported from Tunnelde AI or another plugin.

## Approval modes

`ask` requests human approval for CLI permission requests. `approve` uses a separately configured API reviewer and falls back to a human decision if the review is missing, malformed, unavailable, or negative. `full` permits the supported unrestricted CLI mode and must be selected intentionally. `readOnly` uses the Codex read sandbox with platform default roots disabled. Scope checks and permission controls do not replace operating-system isolation.

## Remote agents

Optional remote profiles require an explicitly chosen SSH session, workspace roots, remote Node executable, deployment directory, and matching local native supervisor helper. The host asks before deploying into a new directory. Packages include `remote-entry.mjs`, the SDK transport, and all runtime modules. Deployment passes this package's immutable ID and profile policy; the remote entry rejects another identity or widened protocols.

An explicitly deployed remote agent can survive closing Tunnelde under its native supervisor. Inspect it after reconnection before explicitly resuming. Closing or disabling a local plugin does not imply that its durable remote supervisor stopped; use the run's Stop action. Old remote deployments without package identity remain inspectable but require a new conversation for a new deployment.

## Maintenance

The shared source is `plugins/tunnelde-ai/lib` plus the common entry points. Run `npm run agents:sync` after changing it, then `npm run verify`. Checked-in copies make source folders and ZIPs independently installable. Tests use mocked transports and never authenticate a real CLI or paid API.
