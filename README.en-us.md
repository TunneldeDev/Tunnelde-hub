# Tunnelde Hub

[English](README.en-us.md) · [简体中文](README.zh-cn.md)

The independent plugin directory for [Tunnelde](https://github.com/TunneldeDev/Tunnelde). This repository distributes **verified release links**, versions and SHA-256 checksums. Plugin source, builds, tests and release assets live in independently maintained repositories.

Tunnelde continues to read the same [registry.json](registry.json) v1 catalogue at:

```
https://raw.githubusercontent.com/TunneldeDev/Tunnelde-hub/main/registry.json
```

## Develop a plugin

Start with [Tunnelde-plugin-template](https://github.com/TunneldeDev/Tunnelde-plugin-template) → **Use this template**. It includes initialization, a minimal working plugin, pinned SDK, real protocol tests, deterministic packaging and independent CI/CD.

The [versioned SDK and developer guide](https://github.com/TunneldeDev/Tunnelde-plugin-sdk) are maintained separately. AI integration authors can use the [shared assistant runtime](https://github.com/TunneldeDev/Tunnelde-assistant-runtime); each plugin pins its build dependency and ships a self-contained runtime.

[Syntax Highlighting](https://github.com/TunneldeDev/Tunnelde-plugin-syntax-highlighting) provides offline highlighting for common code and configuration files, including local and SSH editor buffers. It uses bundled TextMate grammars and WASM, with colors supplied by Tunnelde's theme. Start the installed plugin and approve `editor.read`. Language servers, completion and diagnostics are outside this plugin.

## Catalogue

Each [catalogue/](catalogue/) record declares its source repository, release channel and reviewed application catalogue entry. Follow that repository to report bugs or contribute code. There are no Git submodules, vendored plugin sources, plugin build jobs or new plugin releases in Hub.

| Record | Responsibility |
| --- | --- |
| `catalogue/<id>.json` | Registered repository, stable/prerelease policy and pinned metadata |
| `registry.json` | Generated application catalogue; unchanged v1 wire format |
| `scripts/validate.mjs` | Offline metadata validation and reproducible generation |
| `scripts/audit.mjs` | Download and verify published archives without extraction |
| `scripts/update.mjs` | Discover releases, verify every proposed update, then update metadata |

Install plugins through Tunnelde's Marketplace. Downloaded bytes must match the pinned SHA-256. Installation never runs npm or fetches runtime dependencies. Executable plugins require their declared runtime and permissions. A checksum establishes matching bytes, not publisher trust.

## Maintain

Node.js 22+:

```sh
npm ci --ignore-scripts
npm run registry       # regenerate registry.json from reviewed metadata
npm run verify         # offline validation and tests
npm run audit          # verify published ZIPs and embedded manifests/licenses
npm run updates        # discover and verify published versions
```

Every plugin repository publishes its own `vX.Y.Z` release with `<id>-<version>.zip`, `marketplace.json` and `SHA256SUMS`. Hub checks archive hashes, safe paths, package identity, manifest metadata and required entry files. It never executes downloaded plugins.

The daily **Discover plugin updates** workflow creates or updates one review PR and explicitly dispatches validation. It never merges automatically. Repository Actions settings must allow GitHub Actions to create pull requests. Stable records ignore prereleases; prerelease records accept both channels. New repositories require manual registration and review.

Existing versions retain their original URL and checksum. Historical `plugins-v*` Hub releases remain available; subsequent plugin versions publish from their own repositories. Plugin IDs, configuration and secret namespaces retain their identity. See [migration notes](docs/migration.md) and [contribution instructions](CONTRIBUTING.md).

## License

GPL-3.0-only. See [LICENSE](LICENSE). Plugin repositories include their applicable license and third-party notices in release packages.
