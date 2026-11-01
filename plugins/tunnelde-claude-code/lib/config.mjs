import { PLUGIN_ID, PROFILE_POLICY } from "./identity.mjs";

export const API_PROTOCOLS = Object.freeze([
  "openai-chat",
  "openai-responses",
  "anthropic",
  "gemini",
]);
export const PROTOCOLS = Object.freeze([
  ...new Set([...PROFILE_POLICY.primaryProtocols, ...PROFILE_POLICY.reviewerProtocols]),
]);
export const MODES = Object.freeze(["ask", "approve", "full", "readOnly"]);
export const CLI_PROTOCOLS = new Set(["codex", "claude-code", "pi"]);
export const DEFAULT_CONFIG = Object.freeze({
  profiles: [],
  activeProfileId: "",
  approverProfileId: "",
  mode: "ask",
  scope: { localRoots: [], sessionIds: [], remoteRoots: [] },
});

export function assertIdentity(document, { required = false } = {}) {
  if ((required || document.pluginId != null) && document.pluginId !== PLUGIN_ID)
    throw new Error(`Configuration belongs to a different plugin; expected ${PLUGIN_ID}`);
  if (required || document.profilePolicy != null) {
    const policy = document.profilePolicy;
    if (
      !policy ||
      policy.defaultProtocol !== PROFILE_POLICY.defaultProtocol ||
      !Array.isArray(policy.primaryProtocols) ||
      !Array.isArray(policy.reviewerProtocols) ||
      JSON.stringify(policy.primaryProtocols) !== JSON.stringify(PROFILE_POLICY.primaryProtocols) ||
      JSON.stringify(policy.reviewerProtocols) !== JSON.stringify(PROFILE_POLICY.reviewerProtocols)
    )
      throw new Error("Configuration profile policy does not match this plugin package");
  }
}

export function boundedString(value, label, max = 4096, required = true) {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error(`Invalid ${label}`);
  return required ? value.trim() : value;
}
export function identifier(value, label = "identifier") {
  const text = boundedString(value, label, 96);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(text)) throw new Error(`Invalid ${label}`);
  return text;
}
export function endpoint(value) {
  const url = new URL(boundedString(value, "provider URL", 2048));
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error("Provider URL must use HTTP(S) without credentials, query or fragment");
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Plain HTTP is allowed only for a local model server");
  return url.href.replace(/\/+$/, "");
}
function strings(value, label, max = 32) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${label}`);
  return [...new Set(value.map((item) => boundedString(item, label, 4096)))];
}
export function validateConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid configuration");
  if (!Array.isArray(input.profiles) || input.profiles.length > 16)
    throw new Error("At most 16 profiles are supported");
  const seen = new Set();
  const profiles = input.profiles.map((profile) => {
    const id = identifier(profile.id, "profile ID");
    if (seen.has(id)) throw new Error("Profile IDs must be unique");
    seen.add(id);
    if (!PROTOCOLS.includes(profile.protocol)) throw new Error("Unsupported provider protocol");
    const result = {
      id,
      name: boundedString(profile.name ?? id, "profile name", 80),
      protocol: profile.protocol,
      model: boundedString(profile.model ?? "", "model", 256, !CLI_PROTOCOLS.has(profile.protocol)),
    };
    if (CLI_PROTOCOLS.has(profile.protocol)) {
      result.executable = boundedString(profile.executable, "explicit CLI executable", 4096);
      if (profile.cwd) result.cwd = boundedString(profile.cwd, "working directory");
      if (profile.sessionId) result.sessionId = identifier(profile.sessionId, "SSH session ID");
      if (profile.platform != null) {
        if (!["windows", "posix"].includes(profile.platform))
          throw new Error("Invalid remote platform");
        result.platform = profile.platform;
      }
      if (profile.protocol === "pi") {
        if (profile.provider) result.provider = boundedString(profile.provider, "Pi provider", 96);
      }
    } else {
      const defaults = {
        "openai-chat": "https://api.openai.com/v1",
        "openai-responses": "https://api.openai.com/v1",
        anthropic: "https://api.anthropic.com/v1",
        gemini: "https://generativelanguage.googleapis.com/v1beta",
      };
      result.baseUrl = endpoint(profile.baseUrl || defaults[profile.protocol]);
    }
    if (profile.helperBinary)
      result.helperBinary = boundedString(profile.helperBinary, "native helper binary");
    if (profile.remote) {
      const remote = profile.remote;
      if (!["windows", "posix"].includes(remote.platform))
        throw new Error("Choose the remote platform explicitly");
      result.remote = {
        sessionId: identifier(remote.sessionId, "remote session"),
        platform: remote.platform,
        directory: boundedString(remote.directory, "remote agent directory"),
        ...(remote.runnerPath
          ? { runnerPath: boundedString(remote.runnerPath, "local native helper binary") }
          : {}),
        executable: boundedString(remote.executable, "explicit remote Node executable"),
      };
      if (!result.helperBinary && !result.remote.runnerPath)
        throw new Error("Select a local native helper binary for the remote platform");
    }
    return result;
  });
  const activeProfileId =
    input.activeProfileId ||
    profiles.find((profile) => PROFILE_POLICY.primaryProtocols.includes(profile.protocol))?.id ||
    "";
  if (activeProfileId && !seen.has(activeProfileId))
    throw new Error("Selected model profile does not exist");
  if (
    activeProfileId &&
    !PROFILE_POLICY.primaryProtocols.includes(
      profiles.find((profile) => profile.id === activeProfileId).protocol,
    )
  )
    throw new Error("The selected primary profile is not supported by this plugin");
  const approverProfileId = input.approverProfileId || "";
  if (
    approverProfileId &&
    (!seen.has(approverProfileId) ||
      !PROFILE_POLICY.reviewerProtocols.includes(
        profiles.find((p) => p.id === approverProfileId).protocol,
      ))
  )
    throw new Error("The independent reviewer must use an API profile");
  const mode = input.mode ?? "ask";
  if (!MODES.includes(mode)) throw new Error("Invalid permission mode");
  const scope = input.scope ?? {};
  if (!Array.isArray(scope.remoteRoots ?? []) || (scope.remoteRoots ?? []).length > 32)
    throw new Error("Invalid remote scope");
  return {
    profiles,
    activeProfileId,
    approverProfileId,
    mode,
    scope: {
      localRoots: strings(scope.localRoots, "local root"),
      sessionIds: strings(scope.sessionIds, "SSH session"),
      remoteRoots: (scope.remoteRoots ?? []).map((root) => ({
        sessionId: identifier(root.sessionId, "SSH session"),
        path: boundedString(root.path, "remote root"),
      })),
    },
  };
}

export function publicConfig(config, keyIds) {
  return {
    ...structuredClone(config),
    profiles: config.profiles.map((profile) => ({ ...profile, hasApiKey: keyIds.has(profile.id) })),
  };
}

export function redact(message, secrets = []) {
  let result = String(message ?? "Unknown error").slice(0, 8000);
  for (const secret of secrets)
    if (typeof secret === "string" && secret.length >= 4)
      result = result.split(secret).join("[redacted]");
  return result.replace(/(bearer\s+|api[_-]?key[=:]\s*)[^\s,;]+/gi, "$1[redacted]");
}
