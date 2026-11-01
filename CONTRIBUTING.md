# Contributing

Create `plugins/<id>/tunnelde-plugin.json`, `README.md`, and the entry point if executable.
Use a stable lowercase ID and semantic version. Describe functionality, setup, minimum
runtime, requested host API permissions, external access and data handling. Do not include
credentials, machine paths, node_modules, binaries, generated output or private keys.

Executable packages must ship everything they need; installation never runs npm scripts.
Use only necessary permissions. Pure theme packages use `runtime: "theme"`, omit `main`, and
declare no commands, views or permissions. A theme pack may contain up to 32 named palettes.

The `plugins/studio-themes` folder demonstrates multiple themes without Node. The three tool
plugins demonstrate localized forms and newline-delimited JSON-RPC without third-party code.

Run `npm run registry`, review `registry.json`, then run `npm run verify`. CI checks the
generated catalogue byte for byte and builds deterministic ZIPs with root manifests and
licenses. Validator tests inject malformed IDs, versions, runtimes, permissions, paths,
palette values and duplicate theme IDs to confirm rejection. Plugin tests verify real
subprocess messaging, precision, date edge cases and archive checksums.

Open a pull request using the template. A maintainer reviews code and permissions and
publishes the versioned package before the catalogue is merged. Never replace an existing
release asset or reuse a version for changed bytes. A package version `1.2.0` downloads from
`releases/download/plugins-v1.2.0/<id>-1.2.0.zip`. Multiple packages may share a release.

Forks can expose the same registry format from a public HTTPS URL and be added as custom
sources in Tunnelde. The app binds updates to their original source; changing a source does
not grant it permission to replace a package installed from another publisher.
