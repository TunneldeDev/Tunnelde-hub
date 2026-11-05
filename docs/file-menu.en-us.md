# File context menu contributions

This interface is in development and is not available in a published Tunnelde release yet.
Check the host release and set `engines.tunnelde` to its minimum supported version before publishing a plugin that uses it.

An executable plugin can contribute a command for a user-selected file or directory:

```json
{
  "permissions": ["fs.read", "sftp.read"],
  "commands": [{
    "id": "inspect",
    "title": "Inspect file",
    "fileMenu": {
      "sources": ["local", "remote"],
      "kinds": ["file"],
      "extensions": ["json", "tar.gz"]
    }
  }]
}
```

Both `sources` and `kinds` must be nonempty, without duplicates. Local contributions require `fs.read`; remote contributions require `sftp.read`. Omit a source and its permission when the command does not need it. `extensions` is optional, excludes the leading dot and matches file names case-insensitively; it does not filter directories. It accepts at most 64 suffixes of at most 64 ASCII letters, digits, dots, underscores or hyphens each. An omitted or empty list matches every file.

After runtime and permission approval, the command receives `file: {path, name, isDirectory, source}`. `source` is `{kind: "local"}` or `{kind: "remote", sessionId}`. The context identifies the item explicitly invoked in the menu, not a batch selection. It does not bypass the plugin's existing permissions or file-access scope. Commands can return `{text: string}` for the host's command output view. Declarative and theme plugins cannot contribute executable commands.

The output view accepts at most 1 MiB of UTF-8 text. Runtime transport and JSON serialization also impose size limits, so the usable text size can be smaller, especially for characters requiring JSON escaping. Oversized results fail rather than being silently truncated.

[中文](file-menu.zh-cn.md)

Mount providers, including declarative plugins, can additionally declare `"mountedFileReveal": true` at the manifest root with both `mounts.read` and `mounts.write`. The host offers native file-manager reveal only for the plugin's own active mount covering the selected SSH session and path. The host checks ownership and authorization again when invoked.
