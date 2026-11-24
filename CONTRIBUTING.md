# Contributing to Tunnelde Hub

[English](CONTRIBUTING.md) · [简体中文](CONTRIBUTING.zh-cn.md)

Hub accepts catalogue changes. Implement plugin behavior in its registered source repository; start new plugins with [Tunnelde-plugin-template](https://github.com/TunneldeDev/Tunnelde-plugin-template). Protocol documentation and examples live in [Tunnelde-plugin-sdk](https://github.com/TunneldeDev/Tunnelde-plugin-sdk).

## Standard development and release workflow

Use this workflow for all new plugins and subsequent releases. The template is the recommended starting point; existing repositories must provide equivalent build, test, packaging and immutable release checks. Each plugin owns its CI/CD; Hub CI validates the catalogue and published archives.

1. Initialize a standalone repository from the template and declare the plugin identity, host/runtime requirements, permissions and data handling.
2. Run `npm ci --ignore-scripts`, `npm run build`, `npm run verify` and `npm run package` in the plugin repository. Test the actual ZIP in Tunnelde before publishing.
3. Keep `package.json`, its lockfile and `tunnelde-plugin.json` versions consistent. Commit the change and push a matching `vX.Y.Z` tag. The template Release workflow builds, verifies, packages, publishes and downloads the assets again to verify their bytes. A successful validation build alone is not a release.
4. Register the first published version through a Hub PR as described below. Subsequent releases are proposed by the update workflow and require review before merging.

When maintaining the template itself, run `npm run verify:template`. Its CI initializes a separate plugin on Node 22/24, tests reproducible packaging, verifies the archive and starts the installed plugin without build dependencies.

## Register a plugin

1. Implement, document and test the plugin in its own repository. Document installation, minimum host/runtime versions, permissions and data handling.
2. Publish an immutable `vX.Y.Z` GitHub Release containing `<id>-<version>.zip`, `marketplace.json` and `SHA256SUMS`. Installation must not run scripts or download dependencies.
3. Download `marketplace.json` from the published Release; use its actual published checksum rather than substituting a local build. Add `catalogue/<id>.json` with `{ "repository": "owner/repository", "channel": "stable", "entry": <marketplace.json contents> }`. Use `prerelease` only when preview releases should be advertised. Each repository supplies one plugin identity.
4. Run `npm ci --ignore-scripts`, `npm run registry`, `npm run verify` and `npm run audit`. Open a PR describing behavior, permissions and validation.

Only immutable HTTPS GitHub Release ZIP links are accepted. The package's Manifest, README and metadata must agree; archives include LICENSE and required entries, without unsafe paths or symbolic links. Never invent checksums or register unpublished resources.

## Update a plugin

Publish from the plugin's own CI/CD. Hub's daily update workflow verifies the release and opens a review PR. To check immediately, run **Discover plugin updates** manually or `npm run updates`. Metadata generation and normal unit tests are offline; download auditing is separate.

Versions must increase. Changing bytes or a download URL requires a new version. Existing Hub releases retain their URLs and hashes after migration; do not copy them to another URL under the same version. Unsafe entries can be removed intentionally.

Use Conventional Commit PR titles and concise descriptions. Merge by squash after required validation and Catalogue policy checks pass. Hub does not publish plugin assets or desktop installers. The SDK and shared runtime have their own independently versioned library releases.

## Maintainer setup and workflow approvals

Enable GitHub Actions and allow it to create pull requests in the Hub repository settings. Keep the required `Validate (Node 22)`, `Validate (Node 24)`, `Catalogue policy` and `PR title` checks enabled on `main`.

GitHub may require **Approve and run workflows** for a first-time contributor, including the update bot in a new repository. A maintainer must review the PR and approve that pending run. Explicitly dispatched checks can succeed while the PR's merge-commit run still awaits approval; do not bypass branch protection. Once approved, the normal PR validation must pass before merging. This approval is separate from reviewing and merging the catalogue update.

See [the workflow acceptance record](docs/workflow-acceptance.md) for actual releases, registration, update PRs and the first-run approval case.
