# Tunnelde plugin SDK

Copy `tunnelde-plugin.mjs` into an executable Node plugin and import `createPlugin`.
There are no npm dependencies or implicit runtime downloads. The SDK starts only when
Tunnelde launches a plugin after the user approves executable code and its declared host
permissions. It is not an operating-system sandbox.

```js
import { createPlugin } from "./tunnelde-plugin.mjs";

createPlugin({
  async run(command, input, host) {
    if (command !== "report") throw new Error("Unknown command");
    const snapshot = await host.call("hosts.snapshot");
    return { text: JSON.stringify(snapshot, null, 2) };
  },
  render() {
    return {
      title: "Host report",
      blocks: [{ type: "text", text: "Run Report to list saved hosts." }],
    };
  },
});
```

Declare `hosts.read` in `tunnelde-plugin.json` before calling `hosts.snapshot`. Every host
method is checked against the installed plugin's declarations, user grants, package
fingerprint and current restricted-mode generation. `host.describe()` returns the live,
versioned method catalogue, permissions, parameter names and descriptions. Unknown methods
are rejected. There is no generic application-command invocation or credential-vault API.

`host.call(method, params, {signal, timeoutMs})` returns the host result, rejects on denial/error,
and supports local cancellation. Cancellation stops waiting; it cannot undo an already
completed write. Calls time out after 30 seconds by default; each call may request up to
120 seconds. For a 60-second SSH job or confirmation dialog, use `{timeoutMs: 70000}`.
At most 32 calls may be pending, parameters must be objects no larger than 256 KiB,
and protocol frames must fit in 1 MiB. Transport options are the second argument, for
example `createPlugin(handlers, { timeout: 30000 })`.

The [API catalogue](api.md) documents all methods and their required permissions;
[`api.json`](api.json) is a machine-readable snapshot of `host.describe()`. The host's
live description is authoritative. `terminal.write` takes ordinary UTF-8 text, not base64.

Uploads and downloads return immediately with a transfer ID. Poll the owning runtime's
status before running dependent commands; a failed transfer must stop the task:

```js
const transferId = await host.call("files.upload", {
  sessionId,
  localPath,
  remotePath,
});
for (let attempt = 0; attempt < 120; attempt++) {
  const status = await host.call("files.transferStatus", { transferId });
  if (!status) throw new Error("Transfer status expired");
  if (status.status === "done") break;
  if (status.status !== "running")
    throw new Error(status.error ?? status.status);
  if (attempt === 119) {
    await host.call("files.cancelTransfer", { transferId });
    throw new Error("Transfer did not finish in time");
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
```

Declare `fs.read` and `sftp.write` for uploading. Cancellation and status lookup only
accept transfers created by the current plugin runtime; revocation, restricted mode
and process exit cancel its active transfers. The host retains 256 completed results
and permits 8 concurrent transfers per plugin. These calls transfer binary files and
directories without the text-file API's content-size limits.

The transport consumes stdin and writes protocol frames to stdout. Write diagnostics to
stderr or use `host.log` with the `log` permission. Requests from the host are handled while
plugin-to-host calls are waiting, so a command can safely await API results.

Use the main application's [API guide](https://github.com/TunneldeDev/Tunnelde/blob/main/docs/plugins.md)
for the complete permission table, method parameters, limits, restricted-mode behavior and
CLI recovery options. Plugin authors should handle denied permissions and interrupted calls
without retrying writes automatically.
