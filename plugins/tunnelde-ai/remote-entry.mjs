import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { start } from "./index.mjs";
import { validateConfig } from "./lib/config.mjs";

export async function startRemote(argv = process.argv.slice(2), options = {}) {
  const position = argv.indexOf("--config");
  if (position < 0 || !argv[position + 1] || !path.isAbsolute(argv[position + 1]))
    throw new Error("remote-entry requires --config with an absolute path");
  const text = await readFile(argv[position + 1], "utf8");
  if (Buffer.byteLength(text) > 200 * 1024) throw new Error("Remote configuration exceeds 200 KiB");
  const document = JSON.parse(text);
  if (document.version !== 1) throw new Error("Unsupported remote configuration version");
  const config = validateConfig(document.config);
  if (config.profiles.some((profile) => profile.remote || profile.sessionId))
    throw new Error("Remote agents cannot recursively deploy or launch SSH CLI sessions");
  const ephemeral = new Map();
  for (const [profile, variable] of Object.entries(document.secretEnv ?? {})) {
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
        for (const [key, value] of Object.entries(params.secrets ?? {}))
          if (typeof value === "string") ephemeral.set(key, value);
      },
      call: async (method, params, callOptions) => {
        if (method === "secrets.get" && ephemeral.has(params.key)) return ephemeral.get(params.key);
        if (method === "storage.get" && params.key === "ai.config") {
          const saved = await host.call(method, params, callOptions);
          const current = saved?.config ?? saved ?? config;
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
    process.stderr.write(`Tunnelde AI remote agent: ${error.message}\n`);
    process.exitCode = 1;
  });
}
