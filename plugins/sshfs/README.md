# SSHFS

Open **Mount setup · 挂载指南** in the plugin details for a short platform checklist. Both variants use the same host-managed rules; the guide never connects or runs a command.

Requires Tunnelde 1.5.0-beta.5 or later.

Install this folder or its release ZIP, approve the mount permissions, and open its view from the command palette. Requires Node.js 22 or later; Tunnelde asks before using a system Node runtime. Choose SSHFS Lite for the same native mount interface without Node.

In the plugin view, select a saved host, add a mount group, and save rules with a remote directory and local mount point. Each group opens its own SSH connection using the host's saved credentials, trusted keys and route. Mounts default to read only. Enable reconnect to recover previously running mounts after a connection loss. Connect and mount automatic rules starts the rules you've marked for that group; it does not connect at application startup.

Install WinFsp + SSHFS-Win on Windows, compatible FUSE + SSHFS on macOS, or FUSE + SSHFS on Linux. The host detects dependencies and opens documentation only when requested. Drivers are never installed automatically. Close open files and Unmount before disconnecting or exiting; retry busy mounts after closing applications that use them.

Both SSHFS variants use the same rules and live state. Use Settings to choose which one supplies the Mounts section inside host details. Switching providers does not stop a mount or copy any rules. Use Adopt mount to turn a live one-off mount into a saved rule; its next start uses the chosen group's connection.

Permissions: `hosts.read` lists saved hosts, `mounts.read` reads shared configuration and state, `mounts.write` changes configuration and operates mounts, and `mounts.hostDetails` registers the Mounts section. Tunnelde keeps credentials and transports in the host process. Retained legacy mounts still support the remote file-manager action in their original sessions.

GPL-3.0-only.
