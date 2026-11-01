# Claude Code

An independent Tunnelde plugin maintained by TunneldeDev. This is a community integration, not an Anthropic-published plugin. Requires Tunnelde 0.22.2+ and an explicitly selected Node 22+ runtime.

Install this folder or its versioned ZIP, enable **Claude Code**, and open its own sidebar activity. It does not depend on Tunnelde AI, Codex, or Pi. Each ZIP includes its complete runtime. The `tunnelde-claude-code` identity owns separate settings, secrets, conversations, approval queues and remote runners; installation, enable/disable, and uninstall are independent.

## Configure and run

Explicitly choose an already installed Claude Code executable, its working directory, and authorized workspace roots. The plugin uses bidirectional stream-json; model identifiers are optional CLI overrides. CLI authentication is managed by Claude Code. Viewing, configuring, or installing this plugin never scans for or starts user Node/CLI executables. Sending a message explicitly starts work.

Claude Code is the only primary protocol. Optional independent review uses an API profile: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, or Gemini. Reviewer profiles are not executable models. API keys live in this plugin's host secret store, and no settings or secrets are silently imported from other assistants.

## Approval modes

`ask` prompts for CLI permission requests. `approve` uses a separate API reviewer, falling back to a human decision for missing, failed, malformed, or negative review. `full` enables the CLI's supported unrestricted permission mode and must be chosen intentionally. **`readOnly` execution is refused:** a filtered Claude Code tool list cannot establish an operating-system read sandbox. Use the separate API-only Tunnelde AI plugin for read-only API tools. Workspace scopes and approval controls are not operating-system isolation.

## Remote agents

Optional remote deployment requires an explicit SSH session, remote workspace roots, remote Node executable, agent directory, and matching local native supervisor helper. The host asks before first deployment into a directory. The archive includes `remote-entry.mjs` and all runtime modules; the entry validates the fixed `tunnelde-claude-code` identity and its Claude Code/API-reviewer policy. A configuration cannot turn this package into Codex or Pi.

Durable remote agents may continue under their supervisor after Tunnelde closes. Inspect after reconnecting and resume explicitly; use the run's Stop action to stop a remote agent. Disabling a local plugin is not remote shutdown. Pre-1.2 remote deployments without identity remain inspectable but need a new conversation for redeployment.

## Maintenance

Runtime source is shared with `plugins/tunnelde-ai/lib` and common entry points; `npm run agents:sync` updates checked-in self-contained copies. `npm run verify` tests configuration, permissions, isolation, packaging and remote identity using mocks, without contacting paid APIs or launching an installed Claude Code executable.
