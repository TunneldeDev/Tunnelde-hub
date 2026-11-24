# Independent plugin repository migration

All 19 original plugins move to separate repositories; Syntax Highlighting is new. Source provenance is recorded in each repository. Historical source remains in Hub Git history, and existing Hub release assets are retained. No plugin IDs or permission namespaces are renamed.

| Plugin ID | Repository | Previous version |
| --- | --- | --- |
| `byte-units` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-byte-units) | 1.0.1 |
| `csv-to-json` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-csv-to-json) | 1.0.1 |
| `file-icons` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-file-icons) | 1.21.0 |
| `file-previews` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-file-previews) | 1.21.0 |
| `json-formatter` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-json-formatter) | 1.21.0 |
| `jsonl-log-viewer` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-jsonl-log-viewer) | 1.21.0 |
| `sshfs` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-sshfs) | 2.0.1 |
| `sshfs-lite` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-sshfs-lite) | 2.0.1 |
| `studio-themes` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-studio-themes) | 1.21.0 |
| `text-checksum` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-text-checksum) | 1.0.1 |
| `timestamp` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-timestamp) | 1.21.0 |
| `tunnelde-ai` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-tunnelde-ai) | 1.21.0 |
| `tunnelde-claude-code` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-tunnelde-claude-code) | 1.21.0 |
| `tunnelde-codex` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-tunnelde-codex) | 1.21.0 |
| `tunnelde-mcp` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-tunnelde-mcp) | 1.21.0 |
| `tunnelde-pi` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-tunnelde-pi) | 1.21.0 |
| `unicode-inspector` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-unicode-inspector) | 1.0.1 |
| `unix-permissions` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-unix-permissions) | 1.0.1 |
| `uuid` | [Source](https://github.com/TunneldeDev/Tunnelde-plugin-uuid) | 1.21.0 |

SDK/API documentation, tools and examples move to [Tunnelde-plugin-sdk](https://github.com/TunneldeDev/Tunnelde-plugin-sdk). Shared AI code moves to [Tunnelde-assistant-runtime](https://github.com/TunneldeDev/Tunnelde-assistant-runtime). Each assistant pins that library as a development dependency, stages the runtime at build time, and ships its own fixed identity.

New plugin archives use incremented patch versions and independent release URLs. Old installed versions continue to update through the same Hub source. Existing version URL/hash pairs remain immutable. Old unified publishing workflows are removed from the current branch; tags and assets are not deleted.

开发者通过 [模板仓库](https://github.com/TunneldeDev/Tunnelde-plugin-template) 创建插件；代码、依赖和 CI/CD 留在自己的仓库。Hub 的索引 PR 审核通过后才向用户分发新链接。
