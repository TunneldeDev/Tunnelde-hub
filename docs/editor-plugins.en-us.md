# Editor commands and formatters

For direct remote disk writes, inspect `api.describe` for
`files.sftp.writeText` and its optional `baseline` parameter. Pass the last text
read as `baseline` to detect external edits. Current hosts stage and verify the
new text before atomic publication; older callers without a baseline remain
supported but cannot detect changes made before their save call. A conflict or
transport error must leave the plugin's draft available for review or retry.
Do not blindly retry an unacknowledged write: it may already have committed.
SFTP conflict checks are optimistic, and replacing an inode cannot guarantee
preservation of hard-link relationships or extended ACL/xattr metadata.

An installed plugin can contribute commands that act directly on the open editor.
Use **Format document** in the editor toolbar or find an installed command with
**F1**. Plugins can contribute default shortcuts; **Settings → Keyboard Shortcuts**
lists their actual bindings and lets users change or disable each one. No formatting
shortcut is registered without a provider. Profiles preserve customized bindings.

When a new plugin binding conflicts with another command, keep one, keep both, or
open the filtered shortcut settings. Retained conflicts are highlighted in red;
matching commands run in sequence, with editor commands applying only to declared
file extensions. Check bindings before keeping a conflict: `Ctrl+Shift+F` already
opens workspace content search.

When multiple formatters match, choose a provider. Running a formatter follows
the existing plugin permission and runtime consent steps. A declined prompt never
sends document text to the plugin. Changes stay in the unsaved buffer and can be
undone in one step. Save explicitly when ready. Results from an older document
version, a closed/reopened editor, or a revoked runtime are discarded.

## Contributions (Tunnelde 0.29.0-beta.2 and later)

```json
{
  "permissions": ["editor.read", "editor.write"],
  "engines": { "tunnelde": ">=0.29.0-beta.2" },
  "commands": [
    {
      "id": "format",
      "title": "Format document",
      "editor": { "extensions": ["json"], "format": true }
    },
    {
      "id": "compact",
      "title": "Compact document",
      "editor": { "extensions": ["json"] },
      "keybindings": ["Mod+Alt+M"],
      "macKeybindings": ["Meta+Alt+M"]
    }
  ]
}
```

Extensions omit the leading dot, match case-insensitively, and may contain compound
suffixes. Only `format: true` commands participate in Format document. Other editor
commands are available through F1 and their bindings. A command receives
`{source, document: {tabId, documentId, version, path, name}, indent, _locale}` and
returns `{text: string}` or `{error: true, text: string}`. `indent` is the editor's
tab size as a string. Return text without modifying disk files. The host applies
one undoable edit only if the original identity and version still match.

Input/output document text is limited to 128 KiB UTF-8. The serialized command input
must also fit the existing 256 KiB RPC bound, including JSON escaping. Invalid or
oversized responses leave the buffer unchanged. No filesystem, SSH, clipboard or
network permission is needed for a pure text transformation.

`keybindings` and optional `macKeybindings` accept up to four combinations using
`Mod`, `Ctrl`, `Meta`, `Alt`, `Shift`, and a letter, number, function key or named key
such as `Comma`. `Mod` maps to Ctrl on Windows/Linux and Command on macOS. Actual
AltGraph input and IME composition never trigger commands. Editor commands take
precedence over matching workbench shortcuts while the editor has focus.

## Host API

- `editor.active` (`editor.read`): the ready active document snapshot, or `null`.
  The snapshot contains `tabId`, `documentId`, `version`, `path`, `name`, `content`
  and `dirty`. It excludes session details, saved credentials and baseline data.
- `editor.replace` (`editor.write`): `{tabId, documentId, version, text}`.
  Returns `{tabId, documentId, version, dirty}` after an undoable replacement.
  Stale, closed, loading and disconnected documents are rejected. An unchanged
  replacement preserves the version. Successful changes increment it.

Both methods use the existing authorized frontend bridge and runtime-generation
checks. The host exposes open buffers only, never arbitrary files. They retain
API version 1 and do not change older plugin calls. See the independent marketplace
SDK for the generated method catalogue and TypeScript interfaces.

[中文](editor-plugins.zh-cn.md) · [Plugin SDK](../sdk/README.md)

## Direct local text saves

`files.local.writeText` accepts `{path, content, baseline?}` and returns `null`.
Use `api.describe` to check optional parameter support. Pass the last text read
as `baseline` to detect changes before the call. Omitting it remains supported;
the host snapshots the file at the start and checks it before publication.
The host writes, flushes and verifies private sibling staging, preserves supported
metadata and atomically replaces the existing file. Failures preserve the original.
Both versions must be UTF-8 text without NUL bytes and at most 512 KiB; the existing
256 KiB serialized RPC request limit also applies. Only `fs.write` is required.
The parent must allow private staging; deleted files are not recreated.

Tool calls also recheck the approved path, resolved grant roots and original hash
inside the transaction. Authorization, client revocation and cancellation are
checked before staging and just before replacement. An operation already past the
last check cannot be rolled back. Cleanup failures appear in background tasks and
are retried on startup. Path comparisons are optimistic; hard links/open readers
retain the old file object, and power-loss directory durability is not guaranteed.
