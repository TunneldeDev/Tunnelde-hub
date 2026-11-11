import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { start } from "./index.mjs";
import { assertIdentity } from "./lib/config.mjs";
import { remoteConfiguration, remoteConfig, initializedConfiguration } from "./lib/remote-bootstrap.mjs";
import { PLUGIN_TITLE } from "./lib/identity.mjs";

export async function startRemote(argv = process.argv.slice(2), options = {}) {
  const initialized = argv.includes("--initialize-config");
  let config, document;
  if (initialized) {
    if (argv.length !== 1)
      throw new Error("Initialized remote entry does not accept file configuration arguments");
  } else {
    const position = argv.indexOf("--config");
    if (position < 0 || !argv[position + 1] || !path.isAbsolute(argv[position + 1]))
      throw new Error("remote-entry requires --config with an absolute path");
    const text = await readFile(argv[position + 1], "utf8");
    if (Buffer.byteLength(text) > 200 * 1024) throw new Error("Remote configuration exceeds 200 KiB");
    document = JSON.parse(text);
    config = remoteConfiguration(document);
  }
  const ephemeral = new Map();
  for (const [profile, variable] of Object.entries(document?.secretEnv ?? {})) {
    if (typeof variable !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable))
      throw new Error("Invalid secret environment mapping");
    if (process.env[variable]) ephemeral.set(`provider.${profile}`, process.env[variable]);
  }
  return start({
    ...options,
    longWaitMethods: ["ui.confirm", "tools.invoke"],
    configureHost: (host) => ({
      ...host,
      remote: true,
      initialize: async (params) => {
        if (initialized) {
          if (config) throw new Error("Remote configuration was already initialized");
          const accepted = initializedConfiguration(params);
          config = accepted.config;
          for (const [key, value] of Object.entries(accepted.secrets)) ephemeral.set(key, value);
          return;
        }
        for (const [key, value] of Object.entries(params.secrets ?? {}))
          if (typeof value === "string") ephemeral.set(key, value);
      },
      call: async (method, params, callOptions) => {
        if (!config) throw new Error("Remote configuration has not been initialized");
        if (method === "secrets.get" && ephemeral.has(params.key)) return ephemeral.get(params.key);
        if (method === "storage.get" && params.key === "ai.config") {
          const saved = await host.call(method, params, callOptions);
          if (saved) assertIdentity(saved);
          const current = remoteConfig(saved?.config ?? saved ?? config);
          return {
            config: current,
            keyIds: current.profiles
              .filter((profile) => ephemeral.has(`provider.${profile.id}`))
              .map((profile) => profile.id),
          };
        }
        return host.call(
          method,
          params,
          ["ui.confirm", "tools.invoke"].includes(method)
            ? { ...callOptions, timeoutMs: 24 * 60 * 60 * 1000 }
            : callOptions,
        );
      },
    }),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startRemote().catch((error) => {
    process.stderr.write(`${PLUGIN_TITLE} remote agent: ${error.message}\n`);
    process.exitCode = 1;
  });
}
