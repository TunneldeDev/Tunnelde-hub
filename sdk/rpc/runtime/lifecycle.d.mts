import type { Host } from "../transport/host.mjs";

export interface PluginHandlers {
  initialize?(
    params: { apiVersion: number; pluginId: string },
    host: Host,
  ): unknown | Promise<unknown>;
  run?(
    command: string,
    input: Record<string, unknown>,
    host: Host,
  ): unknown | Promise<unknown>;
  render?(
    view: string,
    locale: string | undefined,
    host: Host,
  ): unknown | Promise<unknown>;
  shutdown?(host: Host): unknown | Promise<unknown>;
}
