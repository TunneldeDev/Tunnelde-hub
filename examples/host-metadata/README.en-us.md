# Host metadata example

Install this folder as a local plugin on a host implementing the experimental `hosts.fields` extension. Open a saved host’s details and expand **Plugin host fields → Host metadata example**. Edit values and Save without starting the plugin or granting its runtime any permissions. No Node is required.

The host menu command **Toggle managed flag** is executable trusted frontend code. Running it requires explicit approval for `ui.trusted`, `hosts.read` and `hosts.write`. Trusted code runs in the application context, without a sandbox. The command reads this plugin’s current document and replaces it against the observed revision and schema digest. Concurrent changes or an incompatible schema fail visibly, without blind retries. Existing values are retained on stop or uninstall and deleted when the host is removed. Do not put secrets in metadata.

See [the field contract](../../docs/host-fields.en-us.md). This example is development material and is not a marketplace package.
