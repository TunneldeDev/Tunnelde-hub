# SSHFS Lite

Requires Tunnelde 1.5.0-beta.5 or later.

Install this folder or its release ZIP in Tunnelde, approve the mount and host permissions, and open its view from the command palette. This data-only plugin requires no Node.js runtime or trusted JavaScript.

Select a saved host and add one or more mount groups. Each group owns a dedicated SSH connection. Save rules with a remote directory and an empty local directory or unused Windows drive. Mounts default to read only. Connect and mount automatic rules starts the marked rules for that group; nothing connects at application startup. Enable reconnect to restore previously running rules after a connection loss.

System dependencies are required: WinFsp + SSHFS-Win on Windows, compatible FUSE + SSHFS on macOS, or FUSE + SSHFS on Linux. The panel detects the executable and links installation instructions; it never installs drivers automatically. Use Unmount before disconnecting or exiting. Close open files and retry if the operating system reports that a mount is busy.

SSHFS and SSHFS Lite share rules, groups, and runtime state. Use Settings to select which variant appears in host details. Switching variants does not interrupt running mounts. Adopt mount converts a live one-off mount into a shared rule without restarting it.

Permissions: `hosts.read` lists saved hosts; `mounts.read` reads state and dependencies; `mounts.write` edits, starts, and stops shared mounts; `mounts.hostDetails` registers the native host-details section. No plugin receives SSH credentials. Legacy mounts retain their original file-manager action until adopted.

GPL-3.0-only.
