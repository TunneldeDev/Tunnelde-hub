import { createLoggingClient } from "../../../sdk/logging/client.mjs";
import type { Host, PluginLogPage } from "../../../sdk/tunnelde-plugin.mjs";
declare const host: Host;
const client = createLoggingClient(host),
  owner = new AbortController();
const result: Promise<PluginLogPage> = host.call("logs.read", {
  limit: 20,
  filter: { levels: ["warn"] },
});
void result;
const subscription = client.subscribe(
  async (page) => {
    for (const entry of page.entries) {
      const id: string | null = entry.pluginId;
      void id;
      // @ts-expect-error projected entries are immutable
      entry.message = "modified";
    }
  },
  { signal: owner.signal },
  { source: "operations" },
);
subscription.stop();
void subscription.done;
// @ts-expect-error a log reader cannot choose a file
void client.read({ path: "/private" });
