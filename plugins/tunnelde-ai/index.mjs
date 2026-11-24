import { pathToFileURL } from "node:url";
import { createPlugin } from "./lib/sdk.mjs";
import { AiPlugin } from "./lib/engine.mjs";

export function start({
  input = process.stdin,
  output = process.stdout,
  configureHost = (host) => host,
  longWaitMethods = [],
} = {}) {
  let engine;
  const get = (host) => (engine ??= new AiPlugin(configureHost(host)));
  return createPlugin(
    {
      initialize: async (params, host) => {
        const ai = get(host);
        await ai.host.initialize?.(params);
        return ai.initialize();
      },
      run: (command, value, host) => get(host).command(command, value),
      render: (view, locale, host) => get(host).render(view, locale),
      shutdown: async () => {
        await engine?.shutdown();
        return { ok: true };
      },
    },
    { input, output, timeout: 120000, longWaitMethods },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
