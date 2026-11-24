import type { Host } from "../transport/host.mjs";
import type { PluginHandlers } from "./lifecycle.mjs";
import type { Readable, Writable } from "node:stream";

export function createPlugin(
  handlers?: PluginHandlers,
  options?: { input?: Readable; output?: Writable; timeout?: number },
): { readonly host: Host; close(): void };
