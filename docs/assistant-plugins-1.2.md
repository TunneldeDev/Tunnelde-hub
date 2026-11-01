# Independent assistant plugins, version 1.2.0

Requires Tunnelde 0.22.2 or later. Integrations are maintained by TunneldeDev and are not vendor-published plugins.

| Manifest ID            | Sidebar title | Primary protocols                                                     | Independent reviewer |
| ---------------------- | ------------- | --------------------------------------------------------------------- | -------------------- |
| `tunnelde-ai`          | Tunnelde AI   | OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Gemini | API profiles         |
| `tunnelde-codex`       | Codex         | Codex app-server                                                      | API profiles         |
| `tunnelde-claude-code` | Claude Code   | Claude Code stream-json                                               | API profiles         |
| `tunnelde-pi`          | Pi            | Pi RPC                                                                | API profiles         |

These are four separate packages, not modes or aliases of one installed plugin. Each folder and release ZIP contains all required runtime files, including entry points, transport, policy, adapters and Pi's permission extension. Removing `tunnelde-ai` does not remove code required by another package. Each plugin owns its settings, secrets, history, approval queues and runner records through the host's manifest-ID namespace. Start, stop, enable, disable and uninstall are independent. Durable SSH supervisors are stopped through their explicit run Stop action; local shutdown alone does not terminate them.

## Existing Tunnelde AI 1.1 installations

The original API/CLI aggregate is now API-only. On loading old profiles, known CLI profiles are excluded from the active in-memory API configuration and an upgrade notice is displayed. The original storage remains unchanged until an explicit save. The save first archives the original document to `ai.legacy-config.v1` and refuses to overwrite a different existing backup. Existing conversations remain inspectable. Credentials stay in the original plugin's secret namespace and are never silently copied to a new package.

Install the desired coding plugin and explicitly select its executable, working directory and scope. Authentication belongs to the vendor CLI. No package scans for, downloads, installs or starts Node or a coding CLI while being discovered, configured or rendered. Unsupported old remote deployments can be inspected; use a new conversation for a new package-identified deployment.

## Contract

Chat blocks include `title` and `profilePolicy:{primaryProtocols,reviewerProtocols,defaultProtocol}`. Configuration profiles may contain supported primary and reviewer protocols, but `activeProfileId` must identify a primary profile and `approverProfileId` must identify an API reviewer. Only primary profiles appear in the chat model selector. Plugin validation repeats these checks on storage loading, configuration saving and sending, including a supplied model ID.

The identity module is generated per package and cannot be overridden with configuration. Deployment documents and saved runner metadata include `pluginId` and the exact profile policy. The bundled `remote-entry.mjs` validates both before opening its transport and validates saved remote configuration before using it. A remote configuration cannot turn one plugin into another or broaden its CLI support.

The four modes retain their previous meanings: `ask` uses human permission decisions, `approve` uses an independent API reviewer with human fallback, `full` intentionally permits supported unrestricted execution, and `readOnly` limits API tools or uses Codex's read sandbox. Claude Code and Pi refuse read-only execution because a filtered tool list does not establish an OS read sandbox.

## Maintainer validation and release preparation

1. Edit shared runtime in `plugins/tunnelde-ai` and run `npm run agents:sync`. Its generated identity and all three coding plugins' checked-in runtime copies must stay synchronized.
2. Run `npm test`. Policy, persistence, migration, remote-entry, mocked adapters and standalone extracted-archive tests must pass without contacting paid APIs or launching vendor CLIs.
3. Run `npm run registry`, then `npm run verify`. Review catalogue changes and immutable SHA-256 package identities.
4. Run `npm run package`, then `node scripts/release.mjs plugins-v1.2.0`. The release directory should contain the four `1.2.0` assistant ZIPs, `SHA256SUMS`, `index.json` and the generated registry. Older unchanged utilities retain their existing versioned URLs.
5. On Tunnelde 0.22.2+, install the four isolated ZIPs/folders, verify separate activities and fixed primary protocols, configure a reviewer separately, restart and check persisted private conversations. Disable or remove one coding plugin and confirm the other activities and saved state remain available. Opening views must not discover or start a user's Node/CLI.

Publishing the `plugins-v1.2.0` tag/release and updating a public registry are separate maintainer actions; local packaging and registry generation do not publish anything.
