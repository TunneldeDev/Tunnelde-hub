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
