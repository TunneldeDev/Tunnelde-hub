# Pi

An independent Tunnelde plugin maintained by TunneldeDev. This is a community integration, not a Pi vendor-published plugin. Requires Tunnelde 0.22.2+ and an explicitly chosen Node 22+ runtime.

Install this source folder or its versioned ZIP, enable **Pi**, and open the Pi sidebar activity. No Tunnelde AI, Codex, or Claude Code installation is needed. The package is self-contained. Its `tunnelde-pi` identity owns independent configuration, secret-store entries, conversations, approvals and remote runner records; it can be installed, disabled, stopped, or uninstalled separately.

## Configure and run

Choose an existing Pi executable, working directory, and authorized workspace roots. The plugin uses Pi RPC and includes its permission extension. Optional model and provider names are passed explicitly to Pi; Pi manages its own authentication. No automatic discovery, installation, or startup of Node or vendor CLIs happens when installing, opening, or configuring the view. Work starts on an explicit message.

Only Pi is offered as a primary protocol. An optional independent reviewer can use OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, or Gemini. API reviewer profiles never appear as executable Pi models. Keys remain in this package's host secret store; other plugins' settings, conversations and secrets are not imported.

## Approval modes

`ask` requests human approval through Pi's bundled permission extension. `approve` uses an independent API reviewer and falls back to a human for missing, failed, malformed, or rejected review. `full` intentionally permits supported CLI actions without per-action review. **`readOnly` execution is refused:** a restricted tool list is not an operating-system read sandbox. Use API-only Tunnelde AI for read-only API work. The permission extension canonicalizes paths and rejects symbolic-link escapes; it is not a replacement for operating-system isolation.

## Remote agents

Remote profiles require explicit SSH and scope selection, an existing remote Node executable, deployment directory, and a matching local supervisor helper. Deployment into a new directory requires the host's approval. `remote-entry.mjs`, the permission extension and the entire runtime are bundled. The remote entry enforces this package's fixed Pi primary/API-reviewer policy and refuses another plugin identity.

An explicitly deployed agent can remain under its native remote supervisor after the application closes. Inspect after reconnection and resume only explicitly. Use the run's Stop action for shutdown; disabling the local plugin alone does not stop a durable remote supervisor. Older deployments without package identity require a new conversation for redeployment.

## Maintenance

Run `npm run agents:sync` after changing shared runtime source in `plugins/tunnelde-ai/lib` or the common entry points. Checked-in copies support installation from an isolated folder or ZIP. `npm run verify` uses deterministic mocked transports; it does not discover or launch the user's Pi installation or contact paid APIs.
