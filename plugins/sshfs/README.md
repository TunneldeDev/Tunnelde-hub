# SSHFS

Requires Tunnelde 0.27.0 or newer, including 0.27 Nightly builds.

Install this folder or its release ZIP, approve the mount permissions, and open its view from the command palette. Requires Node.js 22 or later; Tunnelde asks before using a system Node runtime. Choose SSHFS Lite for the same native mount interface without Node.

Connect a saved SSH host first, select the session, enter the remote directory, and choose an empty local mount directory or unused Windows drive. Mounts default to read only. The native host reuses the session's authentication, trusted host keys, proxies and jump hosts. This plugin does not receive SSH passwords or keys.

Install WinFsp + SSHFS-Win on Windows, compatible FUSE + SSHFS on macOS, or FUSE + SSHFS on Linux. The host detects dependencies and opens documentation only when requested. Drivers are never installed automatically. Close open files and Unmount before disconnecting or exiting; retry busy mounts after closing applications that use them.

Permissions: `mounts.read` checks dependencies and lists owned mounts; `mounts.write` creates, opens and unmounts owned mounts. Both plugin variants share one mount registry. No automatic mounts at startup, no bundled Node runtime, no credential-bearing command line and no unauthenticated local SFTP listener.

GPL-3.0-only.
