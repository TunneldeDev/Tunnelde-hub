# Tunnelde AI

An independent API-only Tunnelde assistant maintained by TunneldeDev. Requires Tunnelde 0.22.2+ and an explicitly selected Node 22+ runtime. Install this folder or its versioned ZIP and open its own sidebar activity. This package does not aggregate coding CLIs: install the separate **Codex**, **Claude Code**, or **Pi** plugin for those integrations. Each package can be installed, enabled, disabled and uninstalled independently.

## Providers and configuration

Choose OpenAI-compatible Chat Completions, OpenAI Responses, Anthropic Messages, or Gemini streaming generation and enter the exact model identifier supported by your account. Compatible local HTTP servers are allowed only on loopback; other endpoints require HTTPS. Redirects are rejected. API keys use this plugin's host secret store; a blank key field keeps an existing credential, and changing endpoint origin clears it unless a replacement key is provided.

Tunnelde AI accepts only API protocols for both primary assistants and optional independent reviewers. Configuration, storage loading, send selection and remote entry all enforce the package policy. Opening or configuring the view never starts a coding CLI or discovers/installs Node. Credentials and conversations are scoped to `tunnelde-ai` and are never silently imported into another plugin.

## Authorization

`ask` allows API read tools and asks before changes or commands. `approve` asks a separately configured API reviewer; missing, malformed, failed or negative review falls back to a human decision. `full` permits supported tools inside the configured scope without individual approval. `readOnly` exposes only directory listing and file reading and rejects commands and writes at the host gate.

API tools pass through the host authorization and canonical-path scope gate. Read responses carry hashes; writes reuse them to reject concurrent modifications. Host permissions are not an operating-system sandbox; use a dedicated account or OS isolation when strict process isolation is required. The Node runtime itself runs with the user's permissions.

## Upgrade from 1.1

Version 1.1 offered CLI profiles inside Tunnelde AI. Version 1.2 preserves the original stored configuration and conversation history, displays an upgrade notice, and offers only API profiles in this plugin. It never starts an old CLI profile. Install the matching independent plugin and configure its executable and workspace explicitly.

The original `ai.config` remains untouched during discovery/render. Before the first explicit save of new API settings, it is backed up to `ai.legacy-config.v1` in this plugin's storage. Existing CLI credentials remain in the original plugin namespace and are not copied across plugins. A conflicting previous backup causes an explicit error rather than overwriting another backup. Existing interrupted conversations remain inspectable; use a new conversation when deploying a new remote runtime.

## Remote persistence

Optional `profile.remote` is `{sessionId,platform,directory,executable}`. Its executable is an explicitly chosen remote Node runtime. `helperBinary` selects the local native supervisor helper; legacy `runnerPath` remains accepted as a local helper path. The host asks before deploying into a new remote directory. Nothing installs Node or changes system services.

Deployment configuration is `{version:1,pluginId:"tunnelde-ai",profilePolicy,config:{profiles,activeProfileId,approverProfileId,mode,scope}}`. The fixed policy allows API protocols only. The supervisor invokes the bundled `remote-entry.mjs --config /absolute/config.json`; the entry refuses a different identity or widened policy. An ephemeral secret map is passed during initialization; keys are not written into conversation state or deployment configuration. Optional `secretEnv` maps profile IDs to explicit environment-variable names. A remote workspace becomes that agent's local scope and recursive deployment is refused.

An explicitly deployed agent can survive Tunnelde closing under its native supervisor. Inspect after reconnection before explicitly resuming. Closing/disabling a local plugin does not imply remote shutdown: use the run's Stop action. Pending approvals remain queued until reconnection. Recovery never automatically replays completed mutations. Legacy remote agents without package identity can be inspected but require a new conversation for a new deployment.

## Limits and maintenance

At most two runs execute concurrently, one per conversation; 12 conversations and 24 model tool turns per run are retained. Streams, arguments and outputs are bounded. Incomplete model streams never execute proposed tools. History is compacted by complete user turns for host storage limits. MCP server configuration is not implemented by this package.

Shared runtime source lives here. After changing `index.mjs`, `remote-entry.mjs` or `lib/`, run `npm run agents:sync` to update the separate packages' checked-in runtime copies. Every source folder and ZIP remains self-contained. Run `npm run verify`; mocked API, CLI, remote, policy and archive tests never contact paid services, authenticate real coding CLIs or deploy SSH agents.
