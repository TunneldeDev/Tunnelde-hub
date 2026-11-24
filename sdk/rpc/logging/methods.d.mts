import type { PluginLogOptions } from "./contract.mjs";
import type { PluginLogReadRequest } from "./data/query.mjs";
import type { PluginLogPage } from "./data/page.mjs";

export interface LoggingMethodMap {
  log: [PluginLogOptions & { message: string }, null];
  "logs.read": [PluginLogReadRequest, PluginLogPage];
}
