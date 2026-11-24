# Contributing to Tunnelde Hub

Hub accepts catalogue changes. Implement plugin behavior in its registered source repository; start new plugins with [Tunnelde-plugin-template](https://github.com/TunneldeDev/Tunnelde-plugin-template). Protocol documentation and examples live in [Tunnelde-plugin-sdk](https://github.com/TunneldeDev/Tunnelde-plugin-sdk).

## Register a plugin

1. Implement, document and test the plugin in its own repository. Document installation, minimum host/runtime versions, permissions and data handling.
2. Publish an immutable `vX.Y.Z` GitHub Release containing `<id>-<version>.zip`, `marketplace.json` and `SHA256SUMS`. Installation must not run scripts or download dependencies.
3. Add `catalogue/<id>.json` with `{ "repository": "owner/repository", "channel": "stable", "entry": <marketplace.json contents> }`. Use `prerelease` only when preview releases should be advertised. Each repository supplies one plugin identity.
4. Run `npm ci --ignore-scripts`, `npm run registry`, `npm run verify` and `npm run audit`. Open a PR describing behavior, permissions and validation.

Only immutable HTTPS GitHub Release ZIP links are accepted. The package's Manifest, README and metadata must agree; archives include LICENSE and required entries, without unsafe paths or symbolic links. Never invent checksums or register unpublished resources.

## Update a plugin

Publish from the plugin's own CI/CD. Hub's daily update workflow verifies the release and opens a review PR. To check immediately, run **Discover plugin updates** manually or `npm run updates`. Metadata generation and normal unit tests are offline; download auditing is separate.

Versions must increase. Changing bytes or a download URL requires a new version. Existing Hub releases retain their URLs and hashes after migration; do not copy them to another URL under the same version. Unsafe entries can be removed intentionally.

Use Conventional Commit PR titles and concise descriptions. Merge by squash after required validation and Catalogue policy checks pass. Hub does not publish plugin assets or desktop installers. The SDK and shared runtime have their own independently versioned library releases.
