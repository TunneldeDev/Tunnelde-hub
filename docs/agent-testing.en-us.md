# Native agent adapter tests

[简体中文](agent-testing.zh-cn.md)

`npm test` runs deterministic protocol fixtures. Native tests require an explicitly
selected executable and skip when its environment variable is absent. Tests never
discover or reuse a user's agent login. Build/test Node does not grant a plugin
permission to run a system Node runtime.

For the Pi adapter:

```powershell
$env:TUNNELDE_TEST_PI = 'C:/path/to/pi.exe'
node --test tests/pi-native.test.mjs
```

```sh
TUNNELDE_TEST_PI=/path/to/pi node --test tests/pi-native.test.mjs
```

The native test creates an isolated configuration, session directory and working
directory below ignored `.tmp/qa/`. A loopback HTTP model returns controlled
streaming messages and tool calls. The test checks protocol readiness without a
prompt, Unicode streaming, native conversation continuation across processes,
tool approval/denial, unchanged files after denial, provider error propagation
and process cleanup. Reports remain in each fixture's `result.json`; credentials
and model output from real providers are never required.

Hub CI runs this test on Linux and Windows against native Pi 0.85.1 release
binaries. Downloads are checked against pinned SHA-256 digests before execution.
The model endpoint and configuration are local to the test; the test requires no
provider credentials or system Node subprocess for Pi.

This proves the adapter works with that native protocol version. It does not
prove real provider authentication, SSH transport, the application's process
supervisor, desktop chat interactions or every supported agent version. Those
require separate acceptance evidence. A green fixture or loopback test must not
be reported as a successful authenticated local/remote conversation.

## Desktop and SSH acceptance

Adapter tests and desktop acceptance cover different boundaries. For each published
assistant package, use an isolated application data directory and record the package
digest, application source/binary and agent/runtime version. Connect only to an
explicitly authorized test host with a verified host key, and keep all test files
inside a uniquely owned directory. Never reuse an existing agent login or change
the host's services, system runtime or configuration.

Verify the following through the application's actual chat controls:

- Select a saved or connected host from Execution location. Home, working directory
  and authorized scope must derive from that target; do not manually supply opaque
  session identifiers to make a broken default work.
- Initialize explicitly before sending. Check a missing executable/runtime,
  unsupported runtime and declined consent. A failed check must leave Send
  unavailable and must not submit a provider request. Using an existing runtime
  and uploading worker files each require the appropriate explicit approval.
- Stream a response and continue the conversation across agent processes. For an
  API worker, place the loopback provider on the remote host; a desktop process
  must not be able to satisfy the test by calling a different local endpoint.
- Exercise workspace discovery, relative paths and command working directories.
  Verify the selected remote files themselves after allowing and denying a tool.
- Test each supported permission mode. ReadOnly must reject a mutation even when
  a controlled provider requests one; Full Access requires explicit user consent;
  approval without an independent reviewer must fall back to a human decision.
  Unsupported native sandbox modes must be refused before launching a prompt.
- Disconnect SSH during a pending response. Show the transport failure, reconnect
  the same host with a new session identifier, initialize again and send one new
  message. Verify preserved history and absence of automatic prompt replay.
- Delete the test conversations, verify removal of their recorded unchanged worker
  files, stop owned processes and remove only the test fixture. Preserve evidence
  under ignored `.tmp/qa/`; do not put credentials in logs or reports.

A remote loopback provider proves execution placement and transport behavior;
it does not prove authentication to a public provider. Validate real provider
authentication separately with an explicitly authorized test account. Keep those
claims separate in PRs and release notes.
