# Tunnelde AI

A dependency-free Node 22+ marketplace plugin. The host renders its controlled chat view in the sidebar. Opening the view or configuring a provider never starts a coding CLI.

## Providers and configuration

Create a profile and choose the exact model identifier supported by your account. Supported API protocols are OpenAI-compatible Chat Completions, OpenAI Responses, Anthropic Messages and Gemini streaming generation. Compatible local HTTP servers are allowed only on loopback; other endpoints require HTTPS. Redirects are rejected to avoid forwarding credentials to another server. API keys use the host secret store; a blank key field keeps an existing credential, and changing endpoint origin clears it unless a replacement key is supplied.

Codex uses its app-server protocol; Claude Code uses bidirectional stream-json; Pi uses RPC plus the bundled permission extension. Select an executable and working directory explicitly. No CLI or Node installation is discovered, installed or started automatically. Authentication for coding CLIs is managed by the selected CLI itself. CLI executable arguments are passed as structured arrays, including on SSH.

## Authorization

`ask` allows API read tools and asks before changes or commands. `approve` asks a separately configured API reviewer; missing, malformed, failed or negative reviews fall back to a human decision. `full` permits supported tools inside the configured API tool scope without individual approval. `readOnly` exposes only directory listing and file reading and rejects commands and writes at the host gate.

API tools always pass through the host authorization and canonical-path scope gate. Read responses carry hashes; subsequent writes reuse them to reject concurrent modifications. CLI working directories are checked against selected roots, but coding CLIs execute as processes with their own sandbox and permission semantics: selecting `full` permits the CLI's unrestricted execution mode. A CLI's configuration, plugins, or vendor-side behavior are not a replacement for operating-system isolation. Codex read mode uses a restricted read sandbox with platform default roots disabled. Claude Code and Pi `readOnly` execution is refused because their tool lists cannot establish an OS read sandbox; use an API profile instead. Pi's permission extension canonicalizes file paths and rejects symlink escapes. Unsupported server requests are denied. Use a dedicated account or OS sandbox where strict process isolation is required.

## Remote persistence

An optional `profile.remote` contains `{sessionId,platform,directory,runnerPath,executable}`. Here `executable` is an explicitly chosen remote Node executable; the profile's own `executable` is the actual coding CLI. `helperBinary` selects the local native supervisor binary for deployment. The host asks before deploying into a new remote directory. Nothing modifies system services or installs Node.

Remote configuration uses `{version:1,config:{profiles,activeProfileId,approverProfileId,mode,scope}}`. The supervisor invokes `remote-entry.mjs --config /absolute/config.json`, owns durable storage and task journals, and passes an ephemeral secret map during initialization. Optional `secretEnv` maps profile IDs to environment variable names. Keys are never written into plugin configuration or conversation storage. A remote workspace becomes the deployed agent's local scope; nested remote deployments are rejected.

Closing Tunnelde leaves an explicitly deployed remote agent under its native supervisor. Reconnect and inspect before resuming. Pending native approvals remain queued until reconnection. Recovery attaches to existing CLI task/vendor sessions where available and never automatically replays a completed mutation. Stopping a remote run requests supervisor shutdown; connection loss is reported and its runner identifier remains saved. Remote deployments require a matching native helper and an already installed compatible Node runtime.

## Limits and validation

At most two runs execute concurrently, with one per conversation; 12 conversations and 24 model tool turns per run are retained. Large responses, tool arguments and output are bounded. Model, CLI and transport failures are shown as errors; partial or incomplete model streams never execute their proposed tools. Session history is compacted by complete user turns to fit host storage limits.

Run `node --test tests/*.test.mjs`. Tests use deterministic mocked SSE and CLI task transports; they do not contact paid APIs, authenticate real coding CLIs, or deploy to SSH servers. MCP server configuration is not implemented by this plugin.

Protocol references: OpenAI Codex app-server documentation; Anthropic Claude Code headless/stream-json documentation; badlogic/pi-mono RPC and extension documentation; official provider streaming and tool-calling API references.
