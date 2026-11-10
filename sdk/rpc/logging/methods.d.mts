import type { PluginLogOptions } from "./contract.mjs";

export interface LoggingMethodMap {
  log: [PluginLogOptions & { message: string }, null];
}
