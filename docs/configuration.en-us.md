# Plugin-owned configuration

[简体中文](configuration.zh-cn.md)

Declare optional `configuration` metadata to let users edit settings in the host's collapsible **Settings → Plugins** form without starting plugin code. Search fields use `@plugin:`, `@group:` and `@id:` plus funnel presets. These settings are application-wide per plugin identifier, stored in the movable Plugin data category, and retained on uninstall. Credentials belong in the secrets API.

The declaration contains a positive `version`, `groups`, `fields`, and optional data-only `migrations`. Each field has `id`, `group`, `title`, optional `description`, a bounded `schema` and a valid `default`. Supported JSON Schema types are boolean, bounded string/enum, bounded number/integer, bounded array, and closed object. Unknown keywords, prototype keys, executable validators, external references and invalid defaults are rejected by both marketplace validation and the host. See the host's bilingual [configuration contract](https://github.com/TunneldeDev/Tunnelde/blob/dev/docs/plugin-configuration.en-us.md) for all limits and migration operations.

```js
import { createConfigurationClient } from "./sdk/configuration/client.mjs";

const configuration = createConfigurationClient(host);
const methods = new Set((await host.describe()).methods.map(method => method.name));
if (methods.has("configuration.snapshot")) {
  const snapshot = await configuration.snapshot();
  if (snapshot.status === "ready") {
    const values = { ...snapshot.values, enabled: true };
    await configuration.update({
      expectedRevision: snapshot.revision,
      schemaDigest: snapshot.schemaDigest,
      values,
    });
  }
}
```

The separate facade has strict method signatures and no fallback overload. Copy the helper with its relative directory structure when distributing a Node plugin. It only wraps the existing authorized `host.call` transport; it does not start Node or grant global settings access. Trusted UI plugins can use their existing `context.api.call` with the same RPC envelopes. Feature-detect older hosts before use.

Reads never save defaults or migrate. Ordinary writes require the complete declared values, current UUID revision and schema digest. Missing migration chains, same-version data-schema changes and downgrades retain old data and block replacement. A plugin must explicitly call `migrate` or let the user confirm migration in the native form. Exact version/digest chains apply only pure `rename`, `setDefault` and `remove` operations. Get source and target data digests from their snapshots; metadata and migration declarations do not participate in the digest.

`backups`, `restore` and `deleteBackup` expose only the owning plugin's data. Migration and restoration retain the prior document in the same transaction. At most 8 backups are kept per plugin; no automatic eviction occurs. Restoration creates a fresh revision and may require migration again. Conflict errors must be reviewed, not retried with a freshly fetched revision over an old draft. Never log configuration values. The `plugin://configuration-changed` host event contains only owner identifier, revision and digest, not configuration values; this does not introduce a general plugin event-subscription API.

Public DTOs live in `sdk/rpc/configuration/data/`, method signatures in `methods.d.mts`, facade contracts in `client.d.mts` and the executable helper under `sdk/configuration/`. They mirror the selected host's public contracts and are checked by `sdk:check`. All configuration methods remain **experimental**; existing stable storage and preference APIs, historical SDK exports and protocol version 1 remain compatible.
