# SSHFS plugins and native API

SSHFS and SSHFS Lite require Tunnelde 0.27.0 or newer, including 0.27 Nightly builds. Choose either independently; both expose the same host-rendered mount panel. SSHFS uses Node.js 22+ only after the user's runtime consent. Lite uses `runtime: "declarative"` and never executes JavaScript or resolves Node.

A declarative package's `main` points to a bounded local JSON document:

```json
{
  "views": {
    "main": { "title": "SSHFS Lite", "blocks": [{ "type": "mounts" }] }
  }
}
```

Declare the view in the manifest and declare `mounts.read` and `mounts.write`. Declarative packages cannot contribute executable commands. Installed views remain available through the workbench command palette.

The native panel detects system FUSE and an SSHFS build advertising passive/stdin transport. A binary on PATH alone is insufficient. Missing or incompatible dependencies disable mounting and provide installation guidance. Installers and drivers are never run automatically. Platform compatibility still depends on the installed distribution and operating system's extension permissions.

## Node host calls

```js
const dependencies = await host.call("mounts.dependencies", {});
if (!dependencies.available) throw new Error(dependencies.instructions);
const mount = await host.call("mounts.mount", {
  sessionId: selectedConnectedSession.id,
  remotePath: "/home/me/data",
  mountPoint: "Z:\\", // empty absolute directory on macOS/Linux
  readOnly: true,
});
await host.call("mounts.unmount", { id: mount.id, force: false });
```

`mounts.list` returns only the calling plugin's records. `mounts.dependencies` and `mounts.list` require `mounts.read`; mounting and unmounting require `mounts.write`. The application supplies plugin identity; callers cannot choose an owner or impersonate another plugin. Permission, current package fingerprint and runtime generation are checked around asynchronous work. Restricted mode prevents new operations.

Remote authentication and host key trust come from the selected active SSH session. The native application opens an SFTP subsystem and pipes it directly to the owned SSHFS process's stdin/stdout. No SSH password or key is passed in arguments; no unauthenticated local TCP listener is created. Proxy and jump settings therefore match the SSH connection.

A mount is reported as ready only after it appears in the operating system mount table or drive list. Startup and unmount are bounded; failed startup closes owned transport resources.

Mount points are exclusive across both plugins. POSIX paths are canonicalized to avoid symlink aliases. Mounts default to read only and never automatically restart. Disconnecting, stopping or revoking a plugin closes its transport. Normal unmount is attempted before exit. Busy unmounts retain cleanup records, and revocation still severs authenticated access. Users may retry or explicitly request force unmount after saving and closing files. Never request force by default.
