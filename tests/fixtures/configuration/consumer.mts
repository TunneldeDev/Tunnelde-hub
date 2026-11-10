import { createConfigurationClient } from "../../../sdk/configuration/client.mjs";
import type { Host } from "../../../sdk/tunnelde-plugin.mjs";
declare const host: Host;
const configuration=createConfigurationClient(host);
const snapshot=await configuration.snapshot();
await configuration.update({expectedRevision:snapshot.revision,schemaDigest:snapshot.schemaDigest,values:snapshot.values});
await configuration.migrate({expectedRevision:snapshot.revision,schemaDigest:snapshot.schemaDigest});
// @ts-expect-error a complete CAS envelope is required
await configuration.update({values:{}});
// @ts-expect-error revision is a token, not a number
await configuration.migrate({expectedRevision:1,schemaDigest:"digest"});
// @ts-expect-error owner identity is never supplied by the plugin
await configuration.snapshot({pluginId:"other"});
// @ts-expect-error unknown domain method cannot fall back to generic host.call
await configuration.reset({});
