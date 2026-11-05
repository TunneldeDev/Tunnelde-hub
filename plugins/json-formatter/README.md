# JSON Formatter

Format and minify JSON locally without losing numeric precision.

Requires Tunnelde 0.29.0-beta.2 or later and Node.js 22 or later. Install the folder or release ZIP and approve its editor permissions. The application requests consent before using your Node runtime. No npm installation, network, filesystem or clipboard permission is required.

Open a JSON document in the editor and press **Ctrl+Shift+F** (**Cmd+Shift+F** on macOS), or click **Format document**. Use **F1 → JSON Formatter: Minify JSON** or **Ctrl+Alt+M** (**Cmd+Option+M** on macOS) to compact the open document. Both commands are listed in Settings → Keyboard Shortcuts and can be rebound or disabled. Formatting follows the editor's indentation width, preserves numeric tokens and CRLF line endings, and replaces the unsaved buffer in one undoable step. Save when ready. A stale response never overwrites newer typing.

The standalone plugin view remains available for pasted snippets; it does not require an open editor. Its results can be copied using the host's Copy result button. Switching tabs preserves input and results; closing the tab discards that draft. Document input/output is limited by the host's editor command bounds (128 KiB UTF-8 and 256 KiB serialized input).

## Commands

- `pretty`: Format JSON
- `minify`: Minify JSON

## Permissions

- `editor.read`: access the open document selected for the command.
- `editor.write`: apply an undoable change to an open editor buffer. This never saves a file automatically.

Updating from 1.0.0 requires renewed approval because editor permissions are new.

## Runtime protocol

JSON-RPC 2.0 over newline-delimited stdin/stdout. Supports initialize, view.render (main, optional locale), command.run (command, optional input), and shutdown. UI is declarative JSON rendered by the host; this plugin never sends HTML.

## License

GPL-3.0-only. Copyright (C) 2026 TunneldeDev.
