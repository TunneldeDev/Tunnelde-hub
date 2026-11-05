# SSHFS Lite

Requires Tunnelde 0.29.0-beta.6 or newer.

Install this folder or its release ZIP in Tunnelde, approve `mounts.read` and `mounts.write`, and open its view from the command palette. This data-only plugin requires no Node.js runtime.

Connect to a saved SSH host first. Select the connected session, remote directory and an empty local directory (or unused Windows drive). Mounts default to read only. Authentication, trusted host keys, proxies and jump hosts come from the existing session; plugins never receive SSH credentials.

System dependencies are required: WinFsp + SSHFS-Win on Windows, compatible FUSE + SSHFS on macOS, or FUSE + SSHFS on Linux. The panel detects the executable and links installation instructions; it never installs drivers automatically. Use Unmount before disconnecting or exiting. Close open files and retry if the operating system reports that a mount is busy.

Both SSHFS plugins use one native mount registry. Each plugin manages its own mounts and cannot unmount another plugin's resources. No automatic mount occurs at startup. Permissions permit access to remote files through a filesystem mount; grant them only to a plugin you trust.

While a mount is active, right-click a file in the corresponding remote session and choose the file-manager action to reveal it through the mounted filesystem.

GPL-3.0-only.
