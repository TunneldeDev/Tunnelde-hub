# Tunnelde Hub

The independent community marketplace for [Tunnelde](https://github.com/TunneldeDev/Tunnelde).
Plugin source, theme packs, review, registry validation and release archives live here. The
desktop application reads [`registry.json`](registry.json); packages release independently of
the desktop installer.

| Directory                     | Purpose                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `plugins/<id>/`               | One installable plugin or theme pack, with manifest and README                  |
| `registry.json`               | Generated catalogue consumed by the app                                         |
| `scripts/validate.mjs`        | Manifest, theme, path, catalogue and checksum validation                        |
| `scripts/plugins/package.mjs` | Deterministic ZIP archives, no npm dependencies                                 |
| `tests/`                      | Validator regressions, including intentionally malformed manifests              |
| `sdk/`                        | Dependency-free bidirectional RPC client, TypeScript declarations and API guide |

## Available packages

| Package             | Purpose                                                             | Runtime                  |
| ------------------- | ------------------------------------------------------------------- | ------------------------ |
| JSON Formatter      | Format/minify JSON while preserving numeric precision and key order | Node 22+                 |
| Timestamp Converter | Unix seconds/milliseconds and local/UTC date conversion             | Node 22+                 |
| UUID Generator      | Cryptographically random UUID v4, batches of 1–100                  | Node 22+                 |
| Studio Themes       | Cobalt Dusk and Porcelain, two coordinated workbench themes         | None                     |
| Common File Previews | Pictures, music, video, PDF, Markdown and text Quick Look | None, preview-capable Tunnelde Beta |
| Common File Icons   | Familiar file-type glyphs and language badges for local/remote files | None, icon-capable Tunnelde Beta |
| Tunnelde AI         | API assistant running locally or on a selected SSH host             | Node 22+, Tunnelde 0.25+ |
| Codex               | Independent Codex app-server assistant, local or SSH                | Node 22+, Tunnelde 0.25+ |
| Claude Code         | Independent Claude Code stream-json assistant, local or SSH         | Node 22+, Tunnelde 0.25+ |
| Pi                  | Independent Pi RPC assistant and permission extension, local or SSH | Node 22+, Tunnelde 0.25+ |
| SSHFS               | Mount remote directories through authenticated SSH sessions        | Node 22+, Tunnelde 0.27+ |
| SSHFS Lite          | The same native mount interface, without JavaScript or Node         | None, Tunnelde 0.27+     |
| Tunnelde MCP        | Local authenticated MCP endpoint and revocable scoped clients       | Node 22+, Tunnelde 0.22+ |

These are independent packages, each installable from its folder or versioned ZIP. Tunnelde
does not bundle Node and does not execute a system Node without explicit consent. A pure
theme pack contains color data and never starts code. Executable plugins run with your local
user permissions; API permissions are not an operating-system sandbox. Use restricted mode
when testing unknown extensions or recovering from extension problems.

SSHFS plugins require a compatible SSHFS/FUSE driver and support 0.27 Nightly builds.
Mounts default to read only. See [SSHFS setup and API](docs/sshfs.md) for dependencies,
permissions and cleanup behavior.

## Install

Open the Plugins activity in Tunnelde and select Marketplace. The official catalogue is:

```
https://raw.githubusercontent.com/TunneldeDev/tunnelde-hub/main/registry.json
```

Select a package, inspect its description and permissions, then install. Local installation
also accepts a ZIP file or folder through the native picker or drag and drop. Downloaded
packages are checked against the pinned SHA-256 before extraction. A checksum proves the
bytes match this reviewed catalogue, not that a publisher is trustworthy.

## Use an assistant

Install each assistant separately and approve a local plugin Node runtime. Open its
sidebar and choose **Execution location** in the composer: **Local** or an already
connected SSH host. Models and execution machines have separate selectors. A remote
workspace defaults to that account's home directory; no session ID needs to be copied.

Codex, Claude Code and Pi start their corresponding installed CLI on the chosen machine
using native structured protocols over stdin/stdout, carried over SSH for remote runs.
The CLI must already be installed and authenticated there. Pi asks before uploading its
permission extension. Tunnelde AI uses API providers; running it remotely also requires
explicit selection of remote Node and approval to upload its runtime source. Nothing
installs Node, coding agents or system services automatically.

See [assistant setup and migration](docs/assistant-plugins-1.3.md) for permissions,
runtime consent, remote files, compatibility and verification limits. Packages 1.3+
require desktop 0.25+; upgrading only the desktop does not update installed plugins.

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md). Each contribution is a pull request containing source,
manifest and documentation. Catalogue entries are generated; do not invent a download hash
or point to a moving branch archive. Themes can contribute one or many palettes in the same
manifest. The protocol and API are documented in the
[desktop developer guide](https://github.com/TunneldeDev/Tunnelde/blob/main/docs/plugins.md).

## Maintain

Node 22+ is required only for these development scripts. There is no `npm install` step:

```sh
npm run agents:sync       # synchronize checked-in self-contained assistant runtimes
npm run registry          # generate the reviewable catalogue and pinned checksums
npm run check             # reject malformed manifests or registry drift
npm ci --ignore-scripts   # pinned development tools for SDK declaration tests
npm test                  # utilities, AI/MCP host mocks, SDK transport, ZIPs and validation
npm run sdk:sync           # regenerate host catalogue from sibling ../Tunnelde source
npm run package           # artifacts/plugins/{archives,index.json,SHA256SUMS,marketplace.json}
npm run audit             # download published packages and verify pinned checksums
```

Packages normalize text-file line endings to LF and preserve binary bytes, so Windows
and Unix checkouts produce the same hashes.

Contributions target protected `main` and merge by squash; the PR title and concise body form
the commit message. Push/PR CI runs validation and tests on Node 22 and 24. Catalogue checks
prevent version reuse and downgrades and verify published downloads. Weekly audits verify
published assets; Dependabot opens monthly GitHub Actions updates.
The release workflow accepts a `plugins-v<version>` tag and publishes matching package versions;
unchanged versions retain their existing immutable release URLs. Maintainers publish packages
before merging registry changes that advertise them. Tag runs publish preview packages by
default. Manual **Release packages** runs from `main` resume old tags without replacing assets,
and drafts become public only after every downloaded byte matches. See
[the contribution and publishing workflow](CONTRIBUTING.md). The initial release is `plugins-v1.0.0`.

The repository layout and review workflow follow
[myna-hub](https://github.com/quyansiyuanwang/myna-hub), adapted to Tunnelde's executable plugin
and data-only theme manifest formats. Tunnelde AI, Codex, Claude Code, Pi and MCP are separate, explicitly installed Node plugins. The coding integrations are maintained by TunneldeDev, not published by the CLI vendors. Each has its own sidebar, configuration, conversations, secret namespace and lifecycle; no coding plugin depends on Tunnelde AI being installed. The [1.2 migration notes](docs/assistant-plugins-1.2.md) remain available for users moving from the earlier aggregated assistant.

## License

GPL-3.0-only. See [LICENSE](LICENSE). Every distributable ZIP includes its applicable LICENSE.

Experimental frontend UI SDK: [English](docs/frontend-ui.en-us.md) · [简体中文](docs/frontend-ui.zh-cn.md).

Plugin-owned configuration schemas, migration and recovery: [English](docs/configuration.en-us.md) · [简体中文](docs/configuration.zh-cn.md).
