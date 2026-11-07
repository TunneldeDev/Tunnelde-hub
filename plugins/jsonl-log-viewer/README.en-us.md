# JSONL Log Viewer

Open a `.jsonl` or `.ndjson` file in Tunnelde's editor. Press **Ctrl+Shift+F**
(**Cmd+Shift+F** on macOS), or F1 and choose **JSONL: Convert to readable log**.
The plugin updates the current buffer, supports Undo, and never saves automatically.
Save As a `.log` file if you want to retain the original structured source.

Understands Tunnelde/Rust tracing fields, common timestamp/level/message layouts,
and numeric log levels. Retains timestamps, metadata, and large JSON numeric literals.
Multiline messages are indented and terminal control characters are escaped.
Invalid JSON or non-object lines block editor conversion without modifying the buffer;
the optional plugin page preview preserves those lines with their line numbers.
The parser never evaluates input, executes commands, reads disk, or sends data online.

Input is limited to 128 KiB, output to 256 KiB. Choose an excerpt for larger logs.
Keybinding conflicts use Tunnelde's normal conflict dialog and shortcut settings.
Permissions `editor.read` and `editor.write` apply to the active document. This is an
executable Node plugin; approve code and explicitly authorize a Node 22+ runtime first.
Tunnelde does not ship Node or silently install a runtime. Uninstall revokes its commands.
