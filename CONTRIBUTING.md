# Contributing

Contributions target `main` through pull requests. Use a Conventional Commit PR title, for
example `feat(previews): add EPUB support` or `fix(uuid): preserve generated output`.
Merges use **squash only**: the PR title becomes the commit subject and the concise PR body
becomes the commit body. Describe the final behavior and relevant validation in 1–3 sentences.
Individual work-in-progress commit messages need not be rewritten.

`main` requires the PR title status, Node 22/24 validation and Catalogue policy checks,
resolved review conversations, and a branch up to date with `main`. Force pushes and deletion
are disabled, including for administrators. Maintainers can merge without a second reviewer;
CODEOWNERS identifies the responsible maintainer. Branches are deleted after merging.

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

The Catalogue policy checks reject version downgrades and changed hashes/URLs for an existing
version, and download every advertised archive to verify its pinned SHA-256. Metadata such
as tags may be improved without repackaging. An intentional removal remains possible.

To publish before merging a catalogue change, push `plugins-v<version>` at the reviewed
package commit. Package tag updates and deletion are blocked. The tag workflow publishes a
preview release by default. To retry a failed or older tag, run **Release packages** from
`main` with that existing tag. The workflow rebuilds and verifies packages at the tag, then
uses the reviewed publisher from `main`. It uploads missing assets to a draft, compares all
downloaded bytes, and publishes only after verification. It never replaces an existing asset.
An existing public release is verified and retained with its original release channel.

For a first-time external contribution, the network audit cannot pass until the maintainer
publishes the reviewed package tag; this is an intentional publication gate. Never work
around it by changing a checksum or disabling a check. Plugin package releases and tags are
independent of application releases and do not publish desktop installers.

Forks can expose the same registry format from a public HTTPS URL and be added as custom
sources in Tunnelde. The app binds updates to their original source; changing a source does
not grant it permission to replace a package installed from another publisher.

## Documentation structure / 文档结构

Follow the [documentation directory guide](docs/README.md): language first, then purpose. Keep translated paths aligned and update links when moving pages.

遵循[文档目录说明](docs/README.md)：先按语言、再按用途归档；保持翻译路径对应，移动文档时同步更新链接。
