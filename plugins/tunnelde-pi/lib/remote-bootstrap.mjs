import { validateConfig, assertIdentity } from "./config.mjs";

export function remoteConfiguration(document) {
  if (!document || typeof document !== "object" || Array.isArray(document) || document.version !== 1)
    throw new Error("Unsupported remote configuration version");
  if (Buffer.byteLength(JSON.stringify(document)) > 200 * 1024)
    throw new Error("Remote configuration exceeds 200 KiB");
  assertIdentity(document, { required: true });
  return remoteConfig(document.config);
}

export function remoteConfig(value) {
  // Validate the raw profile too: normalization drops fields that are not used
  // by a protocol, which must not conceal an attempted recursive SSH target.
  if (Array.isArray(value?.profiles) && value.profiles.some(profile => profile?.remote || profile?.sessionId))
    throw new Error("Remote agents cannot recursively deploy or launch SSH CLI sessions");
  const config = validateConfig(value);
  if (config.profiles.some(profile => profile.remote || profile.sessionId))
    throw new Error("Remote agents cannot recursively deploy or launch SSH CLI sessions");
  return config;
}

export function initializedConfiguration(params) {
  if (params?.remote !== true || params.configurationTransport !== "initialize-v1")
    throw new Error("Explicit initialize-v1 configuration is required");
  if (params.configuration?.secretEnv !== undefined)
    throw new Error("Initialized configuration cannot use environment secret mappings");
  const config = remoteConfiguration(params.configuration);
  const secrets = params.secrets ?? {};
  if (!secrets || typeof secrets !== "object" || Array.isArray(secrets) ||
      Object.values(secrets).some(value => typeof value !== "string"))
    throw new Error("Invalid initialized secret map");
  if (Buffer.byteLength(JSON.stringify(secrets)) > 256 * 1024)
    throw new Error("Initialized secrets exceed 256 KiB");
  return { config, secrets };
}
